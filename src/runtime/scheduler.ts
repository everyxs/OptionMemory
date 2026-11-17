import { createHash } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type { RuntimeInboxRow, RuntimeOutboxRow, RuntimeSubtaskLeaseRow } from "../memory/runtime";
import type { PlannerDecision } from "../api/planner-contracts";
import { getPlannerContext, submitPlannerDecision, type SubmitPlannerDecisionInput } from "./planner";
import { OptionExecutor, optionEventIdFor, type OptionExecResult } from "./option-executor";

function rowsToObjects<T>(result: { headers: string[]; rows: unknown[][] }): T[] {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T);
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return rowsToObjects<T>(result)[0];
}

function now(): number {
  return Date.now() / 1000;
}

function runtimeId(kind: string, parts: string[]): string {
  return `${kind}_${createHash("sha256").update(parts.join("|")).digest("hex")}`;
}

export interface RuntimeEnqueueResult {
  id: string;
  reused: boolean;
}

export async function enqueueRuntimeInbox(input: {
  event_type: RuntimeInboxRow["event_type"];
  source: string;
  external_id: string;
  payload: unknown;
  available_at?: number;
  waiting_condition?: unknown;
}): Promise<RuntimeEnqueueResult> {
  const id = runtimeId("runtime_inbox", [input.event_type, input.source, input.external_id]);
  const client = getMemoryClient();
  if (oneRow(await client.getRuntimeInboxById(id))) return { id, reused: true };
  const timestamp = now();
  await client.putRuntimeInbox({
    event_id: id,
    event_type: input.event_type,
    source: input.source,
    external_id: input.external_id,
    payload: input.payload,
    status: "pending",
    available_at: input.available_at ?? timestamp,
    waiting_condition: input.waiting_condition ?? null,
    attempts: 0,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return { id, reused: false };
}

async function claimInbox(eventId: string, owner: string, leaseMs = 30_000): Promise<RuntimeInboxRow | null> {
  const timestamp = now();
  const leased = await getMemoryClient().leaseRuntimeInbox(eventId, owner, timestamp, timestamp + leaseMs / 1000);
  return oneRow<RuntimeInboxRow>(leased) ?? null;
}

async function claimOutbox(decisionId: string, owner: string, leaseMs = 30_000): Promise<RuntimeOutboxRow | null> {
  const timestamp = now();
  const leased = await getMemoryClient().leaseRuntimeOutbox(decisionId, owner, timestamp, timestamp + leaseMs / 1000);
  return oneRow<RuntimeOutboxRow>(leased) ?? null;
}

async function claimSubtask(subtaskEventId: string, owner: string, leaseMs = 30_000): Promise<boolean> {
  const client = getMemoryClient();
  const timestamp = now();
  const leased = await client.leaseRuntimeSubtask(subtaskEventId, owner, timestamp, timestamp + leaseMs / 1000);
  return Boolean(oneRow(leased));
}

async function releaseSubtask(subtaskEventId: string, owner: string): Promise<void> {
  const client = getMemoryClient();
  const current = oneRow<RuntimeSubtaskLeaseRow>(await client.getRuntimeSubtaskLease(subtaskEventId));
  if (current?.lease_owner !== owner) return;
  await client.putRuntimeSubtaskLease({ ...current, lease_expires_at: 0, updated_at: now() });
}

export type SchedulerDecisionHandler = (context: {
  inbox: RuntimeInboxRow;
  plannerContext: unknown;
}) => Promise<PlannerDecision>;

export interface SchedulerProcessResult {
  id: string;
  gate: "pass" | "blocked";
  status: string;
  reason?: string;
  execution?: OptionExecResult;
}

export async function processRuntimeInbox(input: {
  event_id: string;
  owner: string;
  planner_id: string;
  decide?: SchedulerDecisionHandler;
}): Promise<SchedulerProcessResult> {
  const event = await claimInbox(input.event_id, input.owner);
  if (!event) return { id: input.event_id, gate: "blocked", status: "lease_unavailable" };
  const client = getMemoryClient();
  const payload = event.payload as {
    plan_run_id?: string;
    decision?: PlannerDecision;
    state_snapshot_ref?: string;
    state_hash?: string;
    host_context?: unknown;
  };
  if (!payload.plan_run_id) {
    await client.putRuntimeInbox({ ...event, status: "dead", last_error: "Missing plan_run_id", updated_at: now() });
    return { id: event.event_id, gate: "blocked", status: "dead", reason: "Missing plan_run_id" };
  }
  const planRun = oneRow<{ status: string; subtask_event_id: string }>(await client.getPlanRunById(payload.plan_run_id));
  if (!planRun || planRun.status !== "active") {
    await client.putRuntimeInbox({ ...event, status: "ignored", last_error: `plan_run is ${planRun?.status ?? "missing"}`, updated_at: now() });
    return { id: event.event_id, gate: "pass", status: "ignored", reason: `plan_run is ${planRun?.status ?? "missing"}` };
  }
  const subtaskOwner = `${input.owner}:${event.event_id}`;
  if (!await claimSubtask(planRun.subtask_event_id, subtaskOwner)) {
    return { id: event.event_id, gate: "blocked", status: "subtask_lease_unavailable" };
  }
  try {
    const plannerContext = await getPlannerContext(payload.plan_run_id);
    const decision = input.decide
      ? await input.decide({ inbox: event, plannerContext })
      : payload.decision ?? { decision: "replan", rationale: "Resume persisted event", evidence_refs: [event.event_id], uncertainties: [] };
    const result = await submitPlannerDecision({
      plan_run_id: payload.plan_run_id,
      planner_id: input.planner_id,
      idempotency_key: event.external_id ?? event.event_id,
      state_snapshot_ref: payload.state_snapshot_ref ?? event.event_id,
      state_hash: payload.state_hash ?? createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      decision,
      defer_to_outbox: true,
      host_context: payload.host_context,
    });
    if (result.gate === "blocked") {
      await client.putRuntimeInbox({ ...event, status: "dead", last_error: result.reason ?? "Decision blocked", updated_at: now() });
      return { id: event.event_id, gate: "blocked", status: "dead", reason: result.reason };
    }
    if (decision.decision === "wait") {
      const availableAt = (decision as { available_at?: number }).available_at;
      if (availableAt) {
        await enqueueRuntimeInbox({
          event_type: "timer",
          source: "planner_wait",
          external_id: `${event.event_id}:timer`,
          payload: { ...payload, decision: { decision: "replan", rationale: "Timer elapsed", evidence_refs: [event.event_id], uncertainties: [] } },
          available_at: availableAt,
          waiting_condition: decision.wait_condition,
        });
      }
    }
    await client.putRuntimeInbox({ ...event, status: "done", updated_at: now() });
    return { id: result.outboxDecisionId ?? result.plannerEventId, gate: "pass", status: result.outboxDecisionId ? "outbox_pending" : "done" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await client.putRuntimeInbox({ ...event, status: "dead", last_error: reason, updated_at: now() });
    return { id: event.event_id, gate: "blocked", status: "dead", reason };
  } finally {
    await releaseSubtask(planRun.subtask_event_id, subtaskOwner);
  }
}

export async function dispatchRuntimeOutbox(input: {
  decision_id: string;
  owner: string;
  host_context?: unknown;
  signal?: AbortSignal;
}): Promise<SchedulerProcessResult> {
  const client = getMemoryClient();
  const persisted = oneRow<RuntimeOutboxRow>(await client.getRuntimeOutboxById(input.decision_id));
  if (persisted) {
    const optionEventId = optionEventIdFor(persisted.idempotency_key);
    if (oneRow(await client.getOptionOutcomeByOptionEventId(optionEventId))) {
      await client.putRuntimeOutbox({ ...persisted, status: "done", updated_at: now() });
      return { id: optionEventId, gate: "pass", status: "reused" };
    }
    const activeLease = (persisted.lease_expires_at ?? 0) >= now();
    if (!activeLease && (persisted.status === "dispatched" || oneRow(await client.getOptionEventById(optionEventId)))) {
      await client.putRuntimeOutbox({ ...persisted, status: "dispatched", last_error: "Execution exists without outcome; reconcile required", updated_at: now() });
      return { id: optionEventId, gate: "blocked", status: "reconcile_required", reason: "Execution exists without outcome; not replaying blindly" };
    }
  }
  const outbox = await claimOutbox(input.decision_id, input.owner);
  if (!outbox) return { id: input.decision_id, gate: "blocked", status: "lease_unavailable" };
  const payload = outbox.payload as {
    plan_run_id: string;
    option_id: string;
    arguments: Record<string, unknown>;
    mandate: import("../api").MandateInput;
    attempt: number;
    mode: "real" | "simulated" | "sidecar";
  };
  const optionEventId = optionEventIdFor(outbox.idempotency_key);
  const existingOutcome = oneRow(await client.getOptionOutcomeByOptionEventId(optionEventId));
  if (existingOutcome) {
    await client.putRuntimeOutbox({ ...outbox, status: "done", updated_at: now() });
    return { id: optionEventId, gate: "pass", status: "reused" };
  }
  if (outbox.status === "dispatched" || oneRow(await client.getOptionEventById(optionEventId))) {
    await client.putRuntimeOutbox({ ...outbox, status: "dispatched", last_error: "Execution exists without outcome; reconcile required", updated_at: now() });
    return { id: optionEventId, gate: "blocked", status: "reconcile_required", reason: "Execution exists without outcome; not replaying blindly" };
  }
  try {
    await client.putRuntimeOutbox({ ...outbox, status: "dispatched", updated_at: now() });
    const execution = await new OptionExecutor().execute({
      option_id: payload.option_id,
      planner_event_id: outbox.decision_id,
      arguments: payload.arguments,
      mandate: payload.mandate,
      idempotency_key: outbox.idempotency_key,
      option_event_id: optionEventId,
      attempt: payload.attempt,
      mode: payload.mode,
      signal: input.signal,
      host_context: input.host_context,
    });
    await enqueueRuntimeInbox({
      event_type: "option_outcome",
      source: "option_executor",
      external_id: optionEventId,
      payload: {
        plan_run_id: payload.plan_run_id,
        decision: {
          decision: execution.ok ? "replan" : "ask",
          question: execution.ok ? undefined : `Option ${payload.option_id} failed: ${execution.reason ?? "unknown error"}. How should recovery proceed?`,
          rationale: execution.ok ? "Option completed" : "Option failed and needs recovery",
          evidence_refs: [optionEventId],
          uncertainties: execution.ok ? [] : [execution.reason ?? "unknown error"],
        },
        option_event_id: optionEventId,
        outcome: execution,
      },
    });
    await client.putRuntimeOutbox({
      ...outbox,
      status: execution.status === "blocked" && !oneRow(await client.getOptionEventById(optionEventId)) ? "dead" : "done",
      last_error: execution.reason ?? null,
      updated_at: now(),
    });
    return { id: optionEventId, gate: execution.gate, status: execution.status, reason: execution.reason, execution };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await client.putRuntimeOutbox({ ...outbox, status: "dead", last_error: reason, updated_at: now() });
    return { id: optionEventId, gate: "blocked", status: "dead", reason };
  }
}

export async function runSchedulerOnce(input: {
  owner: string;
  planner_id: string;
  plan_run_id?: string;
  decide?: SchedulerDecisionHandler;
  host_context?: unknown;
}): Promise<SchedulerProcessResult[]> {
  const timestamp = now();
  const client = getMemoryClient();
  const [inboxRows, outboxRows] = await Promise.all([client.listRuntimeInbox(), client.listRuntimeOutbox()]);
  const results: SchedulerProcessResult[] = [];
  const inbox = rowsToObjects<RuntimeInboxRow>(inboxRows).find((row) =>
    (!input.plan_run_id || (row.payload as { plan_run_id?: string }).plan_run_id === input.plan_run_id)
    && row.available_at <= timestamp
    && (row.status === "pending" || (row.status === "leased" && (row.lease_expires_at ?? 0) < timestamp)));
  if (inbox) results.push(await processRuntimeInbox({ ...input, event_id: inbox.event_id }));
  const outbox = rowsToObjects<RuntimeOutboxRow>(outboxRows).find((row) =>
    (!input.plan_run_id || (row.payload as { plan_run_id?: string }).plan_run_id === input.plan_run_id)
    && row.available_at <= timestamp
    && (row.status === "pending" || (["leased", "dispatched"].includes(row.status) && (row.lease_expires_at ?? 0) < timestamp)));
  if (outbox) results.push(await dispatchRuntimeOutbox({ ...input, decision_id: outbox.decision_id }));
  return results;
}

export async function scheduleRuntimeTimer(input: {
  plan_run_id: string;
  planner_id: string;
  available_at: number;
  waiting_condition: unknown;
  idempotency_key: string;
  decision?: PlannerDecision;
}): Promise<RuntimeEnqueueResult> {
  return enqueueRuntimeInbox({
    event_type: "timer",
    source: "planner_wait",
    external_id: input.idempotency_key,
    payload: {
      plan_run_id: input.plan_run_id,
      planner_id: input.planner_id,
      decision: input.decision ?? {
        decision: "replan",
        rationale: "Timer elapsed",
        evidence_refs: [input.idempotency_key],
        uncertainties: [],
      },
    },
    available_at: input.available_at,
    waiting_condition: input.waiting_condition,
  });
}

export async function getRuntimeQueueStatus() {
  const client = getMemoryClient();
  const [inbox, outbox] = await Promise.all([client.listRuntimeInbox(), client.listRuntimeOutbox()]);
  return {
    inbox: rowsToObjects<RuntimeInboxRow>(inbox),
    outbox: rowsToObjects<RuntimeOutboxRow>(outbox),
  };
}
