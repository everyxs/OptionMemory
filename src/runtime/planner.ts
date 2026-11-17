import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { plannerDecisionSchema, type PlannerDecision } from "../api/planner-contracts";
import {
  beginPlannerEvent,
  getSubtaskDecisionChain,
  recordPlannerDecision,
  type TelemetryResult,
} from "../api/telemetry";
import { getContinuousHostStatus, stopContinuousHost } from "../api/continuous-host";
import { getMemoryClient } from "../memory/client";
import type { OptionRow, SubtaskRow } from "../memory/assets";
import type { PlanRunRow, PlannerRow, SubtaskEventRow } from "../memory/planner";
import { checkPlannerDecision } from "./decision-gate";
import { OptionExecutor, type OptionExecResult } from "./option-executor";

function rowsToObjects<T>(result: { headers: string[]; rows: unknown[][] }): T[] {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T);
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return rowsToObjects<T>(result)[0];
}

async function loadRun(planRunId: string) {
  const client = getMemoryClient();
  const planRun = oneRow<PlanRunRow>(await client.getPlanRunById(planRunId));
  if (!planRun) return { error: `plan_run not found: ${planRunId}` } as const;
  const subtaskEvent = oneRow<SubtaskEventRow>(await client.getSubtaskEventById(planRun.subtask_event_id));
  if (!subtaskEvent) return { error: `subtask_event not found: ${planRun.subtask_event_id}` } as const;
  return { planRun, subtaskEvent } as const;
}

export async function getPlannerContext(planRunId: string) {
  const loaded = await loadRun(planRunId);
  if ("error" in loaded) return { gate: "blocked", reason: loaded.error };
  const [subtask, decisions, host] = await Promise.all([
    getMemoryClient().getSubtaskById(loaded.subtaskEvent.subtask_id),
    getSubtaskDecisionChain(loaded.subtaskEvent.subtask_event_id),
    getContinuousHostStatus(planRunId),
  ]);
  return {
    gate: "pass",
    plan_run: loaded.planRun,
    subtask: oneRow<SubtaskRow>(subtask),
    mandate: loaded.subtaskEvent.mandate_json,
    baseline_id: loaded.subtaskEvent.baseline_id,
    decisions,
    host_events: host.events,
  };
}

export async function listPlannerOptions(planRunId: string) {
  const loaded = await loadRun(planRunId);
  if ("error" in loaded) return { gate: "blocked", reason: loaded.error };
  const options = (await getMemoryClient().listOptions()).filter((option) =>
    option.subtask_binding === loaded.subtaskEvent.subtask_id && ["probation", "settled"].includes(option.status));
  return {
    gate: "pass",
    options: options.map((option: OptionRow) => ({
      option_id: option.option_id,
      claim: option.claim,
      status: option.status,
      i_preconditions: option.i_preconditions,
      pi_type: option.pi_type,
      pi_ref: option.pi_ref,
      input_schema: option.input_schema ?? null,
      beta_success: option.beta_success,
      beta_output_schema: option.beta_output_schema,
      rule_ref: option.rule_ref,
    })),
  };
}

export interface SubmitPlannerDecisionInput {
  plan_run_id: string;
  planner_id: string;
  idempotency_key: string;
  state_snapshot_ref: string;
  state_hash: string;
  decision: PlannerDecision;
  signal?: AbortSignal;
  host_context?: unknown;
  defer_to_outbox?: boolean;
}

export interface SubmitPlannerDecisionResult extends TelemetryResult {
  plannerEventId: string;
  decision?: PlannerDecision;
  execution?: OptionExecResult;
  dryRun?: boolean;
  reused?: boolean;
  next_action?: string;
  outboxDecisionId?: string;
}

export function plannerEventIdFor(planRunId: string, idempotencyKey: string): string {
  return `planner_event_${createHash("sha256").update(`${planRunId}|${idempotencyKey}`).digest("hex")}`;
}

export async function submitPlannerDecision(input: SubmitPlannerDecisionInput): Promise<SubmitPlannerDecisionResult> {
  const plannerEventId = plannerEventIdFor(input.plan_run_id, input.idempotency_key);
  const parsed = plannerDecisionSchema.safeParse(input.decision);
  if (!parsed.success) return { id: plannerEventId, plannerEventId, gate: "blocked", reason: parsed.error.message };
  const decision = parsed.data;
  const loaded = await loadRun(input.plan_run_id);
  if ("error" in loaded) return { id: plannerEventId, plannerEventId, gate: "blocked", reason: loaded.error };
  const client = getMemoryClient();
  const existingDecision = oneRow<{ decision_json: unknown }>(await client.getPlannerDecisionByEventId(plannerEventId));
  if (existingDecision) {
    if (!isDeepStrictEqual(existingDecision.decision_json, decision)) {
      return { id: plannerEventId, plannerEventId, gate: "blocked", reason: "idempotency key is already bound to a different decision" };
    }
    return { id: plannerEventId, plannerEventId, gate: "pass", decision, reused: true };
  }
  const planner = oneRow<PlannerRow>(await client.getPlannerById(input.planner_id));
  if (!planner) return { id: plannerEventId, plannerEventId, gate: "blocked", reason: `planner not found: ${input.planner_id}` };
  const mandate = loaded.subtaskEvent.mandate_json as { policy_version?: string };
  const previous = rowsToObjects(await client.listPlannerEventsBySubtaskId(loaded.subtaskEvent.subtask_event_id));
  const gate = checkPlannerDecision({
    planRun: loaded.planRun,
    subtaskEvent: loaded.subtaskEvent,
    decision,
    previousDecisionCount: previous.length,
  });
  if (gate.gate === "blocked") return { id: plannerEventId, plannerEventId, gate: "blocked", reason: gate.reason };
  const event = await beginPlannerEvent({
    planner_event_id: plannerEventId,
    subtask_event_id: loaded.subtaskEvent.subtask_event_id,
    plan_run_id: input.plan_run_id,
    planner_id: input.planner_id,
    context_json: {
      state_snapshot_ref: input.state_snapshot_ref,
      state_hash: input.state_hash,
      instructions_version: planner.instructions_version,
      inference_ref: planner.inference_ref,
      policy_version: mandate.policy_version,
      evidence_refs: decision.evidence_refs,
    },
  });
  if (event.gate === "blocked") return { ...event, plannerEventId };
  const deferExecuteToOutbox = input.defer_to_outbox && decision.decision === "execute" && !gate.dryRun;
  const recorded = deferExecuteToOutbox
    ? { id: plannerEventId, gate: "pass" as const }
    : await recordPlannerDecision({
        planner_event_id: plannerEventId,
        decision_type: decision.decision,
        decision_json: decision,
      });
  if (recorded.gate === "blocked") return { ...recorded, plannerEventId };
  if (deferExecuteToOutbox) {
    const timestamp = Date.now() / 1000;
    await client.putRuntimeDecision({
      planner_event_id: plannerEventId,
      decision_type: decision.decision,
      decision_json: decision,
      created_at: timestamp,
    }, {
      decision_id: plannerEventId,
      subtask_event_id: loaded.subtaskEvent.subtask_event_id,
      decision_type: "execute",
      payload: {
        plan_run_id: input.plan_run_id,
        option_id: decision.option_id,
        arguments: decision.arguments,
        mandate: loaded.subtaskEvent.mandate_json,
        attempt: loaded.planRun.attempt,
        mode: "real",
      },
      idempotency_key: input.idempotency_key,
      status: "pending",
      available_at: timestamp,
      attempts: 0,
      lease_owner: null,
      lease_expires_at: null,
      last_error: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    return {
      id: plannerEventId,
      plannerEventId,
      gate: "pass",
      decision,
      outboxDecisionId: plannerEventId,
      next_action: "Decision and outbox committed atomically; dispatch through the shared scheduler.",
    };
  }
  if (decision.decision === "stop") {
    const stopped = await stopContinuousHost({
      plan_run_id: input.plan_run_id,
      external_id: `decision:${input.idempotency_key}`,
      reason: decision.rationale,
    });
    if (stopped.gate === "blocked") return { id: plannerEventId, plannerEventId, gate: "blocked", reason: stopped.reason };
  }
  if (decision.decision !== "execute" || gate.dryRun) {
    return {
      id: plannerEventId,
      plannerEventId,
      gate: "pass",
      decision,
      dryRun: gate.dryRun,
      next_action: gate.dryRun ? "dry-run recorded; no Option was dispatched" : "decision recorded",
    };
  }
  const execution = await new OptionExecutor().execute({
    option_id: decision.option_id,
    planner_event_id: plannerEventId,
    arguments: decision.arguments,
    mandate: loaded.subtaskEvent.mandate_json as import("../api").MandateInput,
    idempotency_key: input.idempotency_key,
    attempt: loaded.planRun.attempt,
    mode: "real",
    signal: input.signal,
    host_context: input.host_context,
  });
  return {
    id: plannerEventId,
    plannerEventId,
    gate: execution.gate,
    reason: execution.reason,
    decision,
    execution,
    next_action: "Inspect the outcome, then submit replan, ask or stop with a new idempotency key.",
  };
}
