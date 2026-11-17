import { createHash } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type { HostType } from "../memory/planner";
import { continuousHostPlanRunId, startContinuousHost } from "./continuous-host";
import { registerPlanner } from "./planner-registry";
import { registerModel, registerOption, registerSubtask } from "./registry";
import { beginSubtaskExecution } from "./telemetry";
import { submitPlannerDecision } from "../runtime/planner";
import { optionEventIdFor } from "../runtime/option-executor";

export const MEMORY_CAPTURE_OPTION_ID = "memory_capture";
export const MEMORY_REVISE_OPTION_ID = "memory_revise";
export const MARKDOWN_PARSE_OPTION_ID = "memory_parse_markdown_note";
export const MEMORY_WRITE_SUBTASK_ID = "memory_write";
export const MEMORY_WRITE_PLANNER_ID = "memory_write_planner";
export const MEMORY_WRITE_MAPPING_VERSION = "memory-write-v1";

export interface MemoryWriteResult {
  id: string;
  gate: "pass" | "blocked";
  reason?: string;
  reused: boolean;
  [key: string]: unknown;
}

function deterministicId(kind: string, value: string): string {
  return `${kind}_${createHash("sha256").update(value).digest("hex")}`;
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return result.rows.length ? Object.fromEntries(result.headers.map((header, index) => [header, result.rows[0][index]])) as T : undefined;
}

async function ensureMemoryWriteAssets(): Promise<void> {
  const client = getMemoryClient();
  if (!oneRow(await client.getSubtaskById(MEMORY_WRITE_SUBTASK_ID))) {
    await registerSubtask({
      subtask_id: MEMORY_WRITE_SUBTASK_ID,
      goal: "Govern daily memory capture, revision, and Markdown parsing",
      context: { expected_option_ids: [MEMORY_CAPTURE_OPTION_ID, MEMORY_REVISE_OPTION_ID, MARKDOWN_PARSE_OPTION_ID] },
      status: "active",
      utility_queries: 0,
      lin_source: "memory-write-options",
      lin_version: "1.0",
      lin_theta: null,
      lin_actor: "memory-write-options",
    });
  }
  if (!oneRow(await client.getPlannerById(MEMORY_WRITE_PLANNER_ID))) {
    await registerPlanner({
      planner_id: MEMORY_WRITE_PLANNER_ID,
      claim: "Explicit-mandate daily memory writer",
      layer: "planner",
      j_premise_ids: [],
      instructions_ref: "memory/write/v1",
      instructions_version: "1.0",
      inference_ref: "explicit-user-mandate",
      context_policy: { policy_version: MEMORY_WRITE_MAPPING_VERSION },
      decision_schema: { type: "object" },
      tool_policy: {},
      budget_policy: { max_steps: 100 },
      eps_type: "confidence",
      eps_value: 0.5,
      eps_source: "uncalibrated",
      lin_source: "memory-write-options",
      lin_version: "1.0",
      lin_theta: null,
      lin_actor: "memory-write-options",
      verify: "planner-schema-v0.1",
      status: "active",
    });
  }
  for (const definition of [
    { optionId: MEMORY_CAPTURE_OPTION_ID, piType: "memory", piRef: "memory-capture@v1", inputSchema: {
      type: "object", required: ["text", "namespace", "source_ref", "idempotency_key"], additionalProperties: true,
    } },
    { optionId: MEMORY_REVISE_OPTION_ID, piType: "memory", piRef: "memory-revise@v1", inputSchema: {
      type: "object", required: ["text", "namespace", "source_ref", "idempotency_key", "supersedes"], additionalProperties: true,
    } },
    { optionId: MARKDOWN_PARSE_OPTION_ID, piType: "parse", piRef: "markdown-note@v1", inputSchema: {
      type: "object", required: ["path", "root", "namespace"], additionalProperties: true,
    } },
  ]) {
    const modelId = `model_${definition.optionId}`;
    if (!oneRow(await client.getOptionById(definition.optionId))) {
      await registerOption({
        option_id: definition.optionId,
        claim: definition.optionId,
        layer: "option",
        option_type: "atomic",
        template_id: null,
        i_preconditions: {},
        pi_type: definition.piType,
        pi_ref: definition.piRef,
        pi_fallback: "none",
        beta_success: {},
        beta_output_schema: { type: "object" },
        rule_ref: null,
        j_premise_ids: [],
        eps_type: "in-degree",
        eps_value: 0.5,
        eps_source: "inferred-prior",
        lin_source: "memory-write-options",
        lin_version: "1.0",
        lin_theta: null,
        verify: "memory-write-v1",
        status: "probation",
        subtask_binding: MEMORY_WRITE_SUBTASK_ID,
        model_binding: modelId,
        input_schema: definition.inputSchema,
      });
    }
    if (!oneRow(await client.getModelById(modelId))) {
      await registerModel({
        model_id: modelId,
        option_id: definition.optionId,
        claim: "uncalibrated",
        layer: "model",
        achievable_probability: 0,
        calibration_history: [],
        prediction_error: 0,
        cost_model: { observed: false },
        theta_version: "1.0",
        estimated_initiation_region: "",
        eps_type: "in-degree",
        eps_value: 0.5,
        eps_source: "inferred-prior",
        status: "probation",
        j_records: [],
        lin_source: "memory-write-options",
        lin_version: "1.0",
        lin_theta: null,
        lin_actor: "memory-write-options",
        verify: "memory-write-v1",
        reasoning_spec: null,
        evidence_spec: { required: ["real"] },
        evaluation_spec: null,
      });
    }
  }
}

export function memoryWritePlanRunId(hostType: HostType, namespace: string, sessionRef?: string | null): string {
  return continuousHostPlanRunId(hostType, `${MEMORY_WRITE_MAPPING_VERSION}|${namespace}|${sessionRef ?? "direct"}`);
}

export async function executeMemoryWrite(input: {
  operation: "capture" | "revise" | "parse";
  host_type: "opencode" | "dsh";
  host_session_ref?: string | null;
  namespace: string;
  source_ref: string;
  idempotency_key: string;
  arguments: Record<string, unknown>;
}): Promise<MemoryWriteResult> {
  if (!input.namespace || !input.source_ref || !input.idempotency_key) {
    return { id: "", gate: "blocked", reason: "namespace, source_ref and idempotency_key are required", reused: false };
  }
  await ensureMemoryWriteAssets();
  const client = getMemoryClient();
  const subtaskEventId = deterministicId("subtask_event", `${MEMORY_WRITE_MAPPING_VERSION}|${input.namespace}`);
  if (!oneRow(await client.getSubtaskEventById(subtaskEventId))) {
    const subtask = await beginSubtaskExecution({
      subtask_event_id: subtaskEventId,
      subtask_id: MEMORY_WRITE_SUBTASK_ID,
      baseline_id: `${MEMORY_WRITE_MAPPING_VERSION}:${input.namespace}`,
      mandate_json: {
        scope: {
          option_ids: [MEMORY_CAPTURE_OPTION_ID, MEMORY_REVISE_OPTION_ID, MARKDOWN_PARSE_OPTION_ID],
          allowed_effects: ["execute"],
        },
        policy_version: MEMORY_WRITE_MAPPING_VERSION,
        source_actor: input.host_session_ref ?? "memory-user",
        strength: "explicit",
        mode: "enforce",
        budget: { max_steps: 100 },
      },
    });
    if (subtask.gate === "blocked") return { id: subtask.id, gate: "blocked", reason: subtask.reason, reused: false };
  }
  const planRunId = memoryWritePlanRunId(input.host_type, input.namespace, input.host_session_ref);
  const plan = await startContinuousHost({
    subtask_event_id: subtaskEventId,
    attempt: 1,
    host_type: input.host_type,
    host_session_ref: input.host_session_ref,
    idempotency_key: `${MEMORY_WRITE_MAPPING_VERSION}|${input.namespace}|${input.host_session_ref ?? "direct"}`,
    mapping_version: MEMORY_WRITE_MAPPING_VERSION,
  });
  if (plan.gate === "blocked") return { id: planRunId, gate: "blocked", reason: plan.reason, reused: false };
  if (oneRow<{ status: string }>(await client.getPlanRunById(planRunId))?.status !== "active") {
    return { id: planRunId, gate: "blocked", reason: "plan_run is not active", reused: true };
  }
  const optionId = input.operation === "capture"
    ? MEMORY_CAPTURE_OPTION_ID
    : input.operation === "revise"
      ? MEMORY_REVISE_OPTION_ID
      : MARKDOWN_PARSE_OPTION_ID;
  const result = await submitPlannerDecision({
    plan_run_id: planRunId,
    planner_id: MEMORY_WRITE_PLANNER_ID,
    idempotency_key: input.idempotency_key,
    state_snapshot_ref: input.source_ref,
    state_hash: createHash("sha256").update(JSON.stringify(input.arguments)).digest("hex"),
    decision: {
      decision: "execute",
      option_id: optionId,
      arguments: input.arguments,
      rationale: input.operation === "capture"
        ? "User explicitly approved daily-memory capture"
        : input.operation === "revise"
          ? "User explicitly approved daily-memory revision"
          : "Refresh Markdown projection through the governed parser",
      evidence_refs: [input.source_ref],
      uncertainties: [],
    },
  });
  if (result.reused) {
    const optionEventId = optionEventIdFor(input.idempotency_key);
    const outcome = oneRow<{ status: string }>(await client.getOptionOutcomeByOptionEventId(optionEventId));
    if (!outcome) return { id: optionEventId, gate: "blocked", reason: "reconcile_required: previous execution has no outcome", reused: true };
    if (outcome.status !== "success") return { id: optionEventId, gate: "blocked", reason: "Previous memory write was not successful", reused: true };
    const observations = await client.listOptionObservationsByOptionEventId(optionEventId);
    const outputIndex = observations.headers.indexOf("observation_type");
    const valueIndex = observations.headers.indexOf("value_json");
    const output = observations.rows.find((row) => row[outputIndex] === "output")?.[valueIndex] as MemoryWriteResult | undefined;
    if (!output) return { id: optionEventId, gate: "blocked", reason: "reconcile_required: previous execution has no output", reused: true };
    return { ...output, reused: true };
  }
  if (result.gate === "blocked" || !result.execution) {
    return { id: result.plannerEventId, gate: "blocked", reason: result.reason, reused: result.reused ?? false };
  }
  if (result.execution.status !== "success") {
    return {
      id: result.execution.optionEventId,
      gate: "blocked",
      reason: result.execution.reason ?? "Memory write failed",
      reused: result.execution.reused ?? false,
    };
  }
  const output = result.execution.output as MemoryWriteResult;
  return { ...output, id: output.id ?? output.document_id ?? result.execution.optionEventId, gate: "pass" };
}
