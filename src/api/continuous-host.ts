import { createHash } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type { HostEventRow, HostType, PlanRunRow } from "../memory/planner";
import { beginPlanRun, type PlanRunInput, type TelemetryResult } from "./telemetry";

export const CONTINUOUS_HOST_MAPPING_VERSION = "continuous-host-v0.1";

export interface ContinuousHostResult extends TelemetryResult {
  planRunId: string;
  reused: boolean;
}

export interface ContinuousHostStartInput extends Omit<PlanRunInput, "plan_run_id" | "mapping_version"> {
  mapping_version?: string;
}

function rowsToObjects<T>(result: { headers: string[]; rows: unknown[][] }): T[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T,
  );
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return rowsToObjects<T>(result)[0];
}

function deterministicId(kind: string, parts: string[]): string {
  return `${kind}_${createHash("sha256").update(parts.join("|")).digest("hex")}`;
}

export function continuousHostPlanRunId(hostType: HostType, idempotencyKey: string): string {
  return deterministicId("plan_run", [hostType, idempotencyKey]);
}

function continuousHostEventId(planRunId: string, eventType: string, externalId: string): string {
  return deterministicId("host_event", [planRunId, eventType, externalId]);
}

async function writeHostEvent(input: {
  plan_run_id: string;
  event_type: HostEventRow["event_type"];
  external_id: string;
  payload_json: unknown;
}): Promise<{ id: string; reused: boolean }> {
  const id = continuousHostEventId(input.plan_run_id, input.event_type, input.external_id);
  const client = getMemoryClient();
  if (oneRow(await client.getPlanRunById(input.plan_run_id)) === undefined) {
    throw new Error(`plan_run not found: ${input.plan_run_id}`);
  }
  if (oneRow(await client.getHostEventById(id)) !== undefined) return { id, reused: true };
  await client.putHostEvent({
    host_event_id: id,
    plan_run_id: input.plan_run_id,
    event_type: input.event_type,
    external_id: input.external_id,
    payload_json: input.payload_json,
    created_at: Date.now() / 1000,
  });
  return { id, reused: false };
}

async function updatePlanRunStatus(planRunId: string, status: PlanRunRow["status"]): Promise<void> {
  const client = getMemoryClient();
  const current = oneRow<PlanRunRow>(await client.getPlanRunById(planRunId));
  if (!current) throw new Error(`plan_run not found: ${planRunId}`);
  if (current.status === status) return;
  await client.putPlanRun({ ...current, status, updated_at: Date.now() / 1000 });
}

export async function startContinuousHost(input: ContinuousHostStartInput): Promise<ContinuousHostResult> {
  const planRunId = continuousHostPlanRunId(input.host_type, input.idempotency_key);
  if (oneRow(await getMemoryClient().getPlanRunById(planRunId)) !== undefined) {
    return { id: planRunId, planRunId, gate: "pass", reused: true };
  }
  const result = await beginPlanRun({
    ...input,
    plan_run_id: planRunId,
    mapping_version: input.mapping_version ?? CONTINUOUS_HOST_MAPPING_VERSION,
  });
  return { ...result, planRunId, reused: false };
}

export async function deliverContinuousHost(input: {
  plan_run_id: string;
  external_id: string;
  payload_json: unknown;
}): Promise<ContinuousHostResult> {
  const result = await writeHostEvent({
    plan_run_id: input.plan_run_id,
    event_type: "deliver",
    external_id: input.external_id,
    payload_json: input.payload_json,
  });
  return { id: result.id, planRunId: input.plan_run_id, gate: "pass", reused: result.reused };
}

export async function stopContinuousHost(input: {
  plan_run_id: string;
  external_id: string;
  reason?: unknown;
}): Promise<ContinuousHostResult> {
  const result = await writeHostEvent({
    plan_run_id: input.plan_run_id,
    event_type: "stop",
    external_id: input.external_id,
    payload_json: { reason: input.reason ?? null },
  });
  if (!result.reused) await updatePlanRunStatus(input.plan_run_id, "stopped");
  return { id: result.id, planRunId: input.plan_run_id, gate: "pass", reused: result.reused };
}

export async function reportContinuousHost(input: {
  plan_run_id: string;
  external_id: string;
  report: unknown;
}): Promise<ContinuousHostResult> {
  const result = await writeHostEvent({
    plan_run_id: input.plan_run_id,
    event_type: "report",
    external_id: input.external_id,
    payload_json: input.report,
  });
  if (!result.reused) await updatePlanRunStatus(input.plan_run_id, "completed");
  return { id: result.id, planRunId: input.plan_run_id, gate: "pass", reused: result.reused };
}

export async function answerContinuousHost(input: {
  plan_run_id: string;
  host_question_ref: string;
  answer_event_id: string;
  answer: unknown;
}): Promise<ContinuousHostResult> {
  if (!input.host_question_ref || !input.answer_event_id) {
    return { id: "", planRunId: input.plan_run_id, gate: "blocked", reason: "host_question_ref and answer_event_id are required", reused: false };
  }
  const result = await writeHostEvent({
    plan_run_id: input.plan_run_id,
    event_type: "answer",
    external_id: input.answer_event_id,
    payload_json: {
      host_question_ref: input.host_question_ref,
      answer_event_id: input.answer_event_id,
      answer: input.answer,
    },
  });
  return { id: result.id, planRunId: input.plan_run_id, gate: "pass", reused: result.reused };
}

export async function getContinuousHostStatus(planRunId: string) {
  const client = getMemoryClient();
  const [planRun, events] = await Promise.all([
    client.getPlanRunById(planRunId),
    client.listHostEventsByPlanRunId(planRunId),
  ]);
  return { planRun: oneRow<PlanRunRow>(planRun), events: rowsToObjects<HostEventRow>(events) };
}

export const submitContinuousHost = startContinuousHost;
export const stopContinuousHostRun = stopContinuousHost;
export const answerContinuousHostRun = answerContinuousHost;
