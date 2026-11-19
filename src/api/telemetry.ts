import { randomUUID } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type { ModelRow, OptionRow, SubtaskRow } from "../memory/assets";
import type {
  ExecutionMode,
  HostType,
  ModelEventType,
  OptionObservationType,
  OptionOutcomeStatus,
  PlannerDecisionType,
  OptionEventRow,
  OptionInputSchemaRow,
  ModelSpecRow,
} from "../memory/planner";
import { EXECUTION_MODES, MODEL_EVENT_TYPES, OPTION_OBSERVATION_TYPES, OPTION_OUTCOME_STATUSES, PLANNER_DECISION_TYPES } from "../memory/planner";
import type { GateResult } from "../runtime/nuGate";

export interface TelemetryResult extends GateResult {
  id: string;
}

export interface MandateInput extends Record<string, unknown> {
  scope: Record<string, unknown>;
  policy_version: string;
  source_actor: string;
  strength: "explicit" | "inferred";
  mode: "enforce" | "dry-run";
  budget: Record<string, unknown>;
}

export interface PlanRunInput {
  plan_run_id?: string;
  subtask_event_id: string;
  attempt: number;
  host_type: HostType;
  host_session_ref?: string | null;
  host_ticket_ref?: string | null;
  host_assignment_ref?: string | null;
  idempotency_key: string;
  mapping_version: string;
}

export interface PlannerEventInput {
  planner_event_id?: string;
  subtask_event_id: string;
  plan_run_id: string;
  planner_id: string;
  context_json: Record<string, unknown>;
}

export interface OptionExecutionInput {
  option_event_id?: string;
  planner_event_id: string;
  option_id: string;
  model_id: string;
  execution_json: Record<string, unknown> & { mode: ExecutionMode; attempt: number };
}

function rowsToObjects<T>(result: { headers: string[]; rows: unknown[][] }): T[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T,
  );
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return rowsToObjects<T>(result)[0];
}

function blocked(id: string, reason: string): TelemetryResult {
  return { id, gate: "blocked", reason };
}

function now(): number {
  return Date.now() / 1000;
}

function isDecisionType(value: string): value is PlannerDecisionType {
  return (PLANNER_DECISION_TYPES as readonly string[]).includes(value);
}

function isObservationType(value: string): value is OptionObservationType {
  return (OPTION_OBSERVATION_TYPES as readonly string[]).includes(value);
}

function isOutcomeStatus(value: string): value is OptionOutcomeStatus {
  return (OPTION_OUTCOME_STATUSES as readonly string[]).includes(value);
}

function isModelEventType(value: string): value is ModelEventType {
  return (MODEL_EVENT_TYPES as readonly string[]).includes(value);
}

export async function beginSubtaskExecution(input: {
  subtask_event_id?: string;
  subtask_id: string;
  baseline_id: string;
  mandate_json: MandateInput;
}): Promise<TelemetryResult> {
  const id = input.subtask_event_id ?? `subtask_event_${randomUUID()}`;
  if (!input.subtask_id || !input.baseline_id) return blocked(id, "subtask_id and baseline_id are required");
  if (!input.mandate_json?.policy_version || !input.mandate_json.source_actor) {
    return blocked(id, "mandate policy_version and source_actor are required");
  }
  if (!["explicit", "inferred"].includes(input.mandate_json.strength) || !["enforce", "dry-run"].includes(input.mandate_json.mode)) {
    return blocked(id, "invalid mandate strength or mode");
  }
  if (oneRow<SubtaskRow>(await getMemoryClient().getSubtaskById(input.subtask_id)) === undefined) {
    return blocked(id, `subtask not found: ${input.subtask_id}`);
  }
  await getMemoryClient().putSubtaskEvent({
    subtask_event_id: id,
    subtask_id: input.subtask_id,
    baseline_id: input.baseline_id,
    mandate_json: input.mandate_json,
    created_at: now(),
  });
  return { id, gate: "pass" };
}

export async function beginPlanRun(input: PlanRunInput): Promise<TelemetryResult> {
  const id = input.plan_run_id ?? `plan_run_${randomUUID()}`;
  if (!Number.isInteger(input.attempt) || input.attempt < 1) return blocked(id, "attempt must be a positive integer");
  if (!input.idempotency_key || !input.mapping_version) return blocked(id, "idempotency_key and mapping_version are required");
  if (!["dsh", "opencode", "superagent", "sidecar"].includes(input.host_type)) return blocked(id, `invalid host_type: ${input.host_type}`);
  if (oneRow(await getMemoryClient().getSubtaskEventById(input.subtask_event_id)) === undefined) {
    return blocked(id, `subtask_event not found: ${input.subtask_event_id}`);
  }
  await getMemoryClient().putPlanRun({
    plan_run_id: id,
    subtask_event_id: input.subtask_event_id,
    attempt: input.attempt,
    host_type: input.host_type,
    host_session_ref: input.host_session_ref ?? null,
    host_ticket_ref: input.host_ticket_ref ?? null,
    host_assignment_ref: input.host_assignment_ref ?? null,
    idempotency_key: input.idempotency_key,
    mapping_version: input.mapping_version,
    status: "active",
    created_at: now(),
    updated_at: now(),
  });
  return { id, gate: "pass" };
}

export async function beginPlannerEvent(input: PlannerEventInput): Promise<TelemetryResult> {
  const id = input.planner_event_id ?? `planner_event_${randomUUID()}`;
  const client = getMemoryClient();
  const [subtaskEvent, planRun, planner] = await Promise.all([
    client.getSubtaskEventById(input.subtask_event_id),
    client.getPlanRunById(input.plan_run_id),
    client.getPlannerById(input.planner_id),
  ]);
  if (oneRow(subtaskEvent) === undefined) return blocked(id, `subtask_event not found: ${input.subtask_event_id}`);
  if (oneRow(planRun) === undefined) return blocked(id, `plan_run not found: ${input.plan_run_id}`);
  const plannerRow = oneRow<{ status: string }>(planner);
  if (!plannerRow) return blocked(id, `planner not found: ${input.planner_id}`);
  if (plannerRow.status !== "active") return blocked(id, `planner is not active: ${plannerRow.status}`);
  const run = oneRow<{ subtask_event_id: string; status: string }>(planRun);
  if (run?.subtask_event_id !== input.subtask_event_id) return blocked(id, "plan_run and subtask_event do not match");
  if (run.status !== "active") return blocked(id, `plan_run is not active: ${run.status}`);
  await client.putPlannerEvent({
    planner_event_id: id,
    subtask_event_id: input.subtask_event_id,
    plan_run_id: input.plan_run_id,
    planner_id: input.planner_id,
    context_json: input.context_json,
    created_at: now(),
  });
  return { id, gate: "pass" };
}

export async function recordPlannerDecision(input: {
  planner_event_id: string;
  decision_type: PlannerDecisionType;
  decision_json: Record<string, unknown>;
}): Promise<TelemetryResult> {
  const id = input.planner_event_id;
  if (!isDecisionType(input.decision_type)) return blocked(id, `invalid decision_type: ${input.decision_type}`);
  if (input.decision_json.decision !== input.decision_type) return blocked(id, "decision_json.decision must match decision_type");
  if (input.decision_type === "execute" && typeof input.decision_json.option_id !== "string") {
    return blocked(id, "execute decision requires option_id");
  }
  if (input.decision_type !== "execute" && input.decision_json.option_id !== undefined) {
    return blocked(id, "non-execute decision must not contain option_id");
  }
  if (input.decision_type === "ask" && typeof input.decision_json.question !== "string") {
    return blocked(id, "ask decision requires exactly one question");
  }
  if (input.decision_type === "retry" && typeof input.decision_json.option_event_id !== "string") {
    return blocked(id, "retry decision requires option_event_id");
  }
  const client = getMemoryClient();
  if (oneRow(await client.getPlannerEventById(id)) === undefined) return blocked(id, `planner_event not found: ${id}`);
  if (oneRow(await client.getPlannerDecisionByEventId(id)) !== undefined) return blocked(id, "planner_event already has a decision");
  await client.putPlannerDecision({
    planner_event_id: id,
    decision_type: input.decision_type,
    decision_json: input.decision_json,
    created_at: now(),
  });
  return { id, gate: "pass" };
}

export async function beginOptionExecution(input: OptionExecutionInput): Promise<TelemetryResult> {
  const id = input.option_event_id ?? `option_event_${randomUUID()}`;
  const client = getMemoryClient();
  const [plannerEvent, decision, optionResult, modelResult] = await Promise.all([
    client.getPlannerEventById(input.planner_event_id),
    client.getPlannerDecisionByEventId(input.planner_event_id),
    client.getOptionById(input.option_id),
    client.getModelById(input.model_id),
  ]);
  const planner = oneRow<{ subtask_event_id: string }>(plannerEvent);
  if (!planner) return blocked(id, `planner_event not found: ${input.planner_event_id}`);
  const decisionRow = oneRow<{ decision_type: string; decision_json: Record<string, unknown> }>(decision);
  if (!decisionRow || decisionRow.decision_type !== "execute") return blocked(id, "option_event requires an execute decision");
  if (decisionRow.decision_json.option_id !== input.option_id) return blocked(id, "decision option_id does not match option_event");
  const option = oneRow<OptionRow>(optionResult);
  if (!option) return blocked(id, `option not found: ${input.option_id}`);
  const model = oneRow<ModelRow>(modelResult);
  if (!model) return blocked(id, `model not found: ${input.model_id}`);
  if (option.model_binding !== input.model_id || model.option_id !== input.option_id) {
    return blocked(id, "option/model binding mismatch");
  }
  if (!["probation", "settled"].includes(option.status)) return blocked(id, `option is not executable: ${option.status}`);
  if (!["probation", "settled"].includes(model.status)) return blocked(id, `model is not usable: ${model.status}`);
  const subtaskEvent = oneRow<{ subtask_id: string }>(await client.getSubtaskEventById(planner.subtask_event_id));
  if (subtaskEvent?.subtask_id !== option.subtask_binding) return blocked(id, "option subtask binding mismatch");
  const execution = input.execution_json;
  if (!(EXECUTION_MODES as readonly string[]).includes(execution.mode)) return blocked(id, `invalid execution mode: ${execution.mode}`);
  if (!Number.isInteger(execution.attempt) || execution.attempt < 1) return blocked(id, "attempt must be a positive integer");
  if (typeof execution.pi_ref !== "string" || execution.pi_ref.length === 0) return blocked(id, "execution pi_ref is required");
  await client.putOptionEvent({
    option_event_id: id,
    planner_event_id: input.planner_event_id,
    option_id: input.option_id,
    model_id: input.model_id,
    execution_json: execution,
    created_at: now(),
  });
  return { id, gate: "pass" };
}

export async function recordOptionObservation(input: {
  observation_event_id?: string;
  option_event_id: string;
  observation_type: OptionObservationType;
  value_json: unknown;
}): Promise<TelemetryResult> {
  const id = input.observation_event_id ?? `observation_event_${randomUUID()}`;
  if (!isObservationType(input.observation_type)) return blocked(id, `invalid observation_type: ${input.observation_type}`);
  if (oneRow(await getMemoryClient().getOptionEventById(input.option_event_id)) === undefined) {
    return blocked(id, `option_event not found: ${input.option_event_id}`);
  }
  await getMemoryClient().putOptionObservation({
    observation_event_id: id,
    option_event_id: input.option_event_id,
    observation_type: input.observation_type,
    value_json: input.value_json,
    created_at: now(),
  });
  return { id, gate: "pass" };
}

export async function finishOptionExecution(input: {
  option_event_id: string;
  status: OptionOutcomeStatus;
  evaluation_json: Record<string, unknown>;
  cost_json: Record<string, unknown>;
  error_json: Record<string, unknown>;
}): Promise<TelemetryResult> {
  const id = input.option_event_id;
  if (!isOutcomeStatus(input.status)) return blocked(id, `invalid outcome status: ${input.status}`);
  const client = getMemoryClient();
  if (oneRow(await client.getOptionEventById(id)) === undefined) return blocked(id, `option_event not found: ${id}`);
  if (oneRow(await client.getOptionOutcomeByOptionEventId(id)) !== undefined) return blocked(id, "option_event already has an outcome");
  const scalarReward = input.evaluation_json.scalar_reward;
  if (scalarReward !== undefined && scalarReward !== null && typeof scalarReward !== "number") {
    return blocked(id, "scalar_reward must be a number or null");
  }
  const evaluation = { ...input.evaluation_json, scalar_reward: scalarReward ?? null };
  await client.putOptionOutcome({
    option_event_id: id,
    status: input.status,
    evaluation_json: evaluation,
    cost_json: input.cost_json,
    error_json: input.error_json,
    created_at: now(),
  });
  return { id, gate: "pass" };
}

export async function recordModelEvent(input: {
  model_event_id?: string;
  model_id: string;
  event_type: ModelEventType;
  payload_json: unknown;
}): Promise<TelemetryResult> {
  const id = input.model_event_id ?? `model_event_${randomUUID()}`;
  if (!isModelEventType(input.event_type)) return blocked(id, `invalid model_event type: ${input.event_type}`);
  const model = oneRow<ModelRow>(await getMemoryClient().getModelById(input.model_id));
  if (!model) return blocked(id, `model not found: ${input.model_id}`);
  if (["retracted", "archived"].includes(model.status)) return blocked(id, `model is not usable: ${model.status}`);
  await getMemoryClient().putModelEvent({
    model_event_id: id,
    model_id: input.model_id,
    event_type: input.event_type,
    payload_json: input.payload_json,
    created_at: now(),
  });
  return { id, gate: "pass" };
}

export async function getExecutionTrace(optionEventId: string) {
  const client = getMemoryClient();
  const optionEvent = oneRow<OptionEventRow>(await client.getOptionEventById(optionEventId));
  if (!optionEvent) return null;
  const [observations, outcome, plannerEvent, option, model, inputSchema, modelSpecs, modelEvents] = await Promise.all([
    client.listOptionObservationsByOptionEventId(optionEventId),
    client.getOptionOutcomeByOptionEventId(optionEventId),
    client.getPlannerEventById(optionEvent.planner_event_id),
    client.getOptionById(optionEvent.option_id),
    client.getModelById(optionEvent.model_id),
    client.getOptionInputSchemaById(optionEvent.option_id),
    client.getModelSpecsById(optionEvent.model_id),
    client.listModelEventsByModelId(optionEvent.model_id),
  ]);
  const planner = oneRow<{ subtask_event_id: string; plan_run_id: string }>(plannerEvent);
  const [decision, subtaskEvent, planRun] = await Promise.all([
    client.getPlannerDecisionByEventId(optionEvent.planner_event_id),
    client.getSubtaskEventById(planner?.subtask_event_id ?? ""),
    client.getPlanRunById(planner?.plan_run_id ?? ""),
  ]);
  const optionRow = oneRow<OptionRow>(option);
  const modelRow = oneRow<ModelRow>(model);
  return {
    optionEvent,
    observations: rowsToObjects(observations),
    outcome: oneRow(outcome),
    plannerDecision: oneRow(decision),
    plannerEvent: planner,
    subtaskEvent: oneRow(subtaskEvent),
    planRun: oneRow(planRun),
    option: optionRow,
    model: modelRow,
    modelEvents: rowsToObjects<{ payload_json: { option_event_id?: string } }>(modelEvents)
      .filter((event) => event.payload_json?.option_event_id === optionEventId),
    inputSchema: {
      input_schema: optionRow?.input_schema ?? oneRow<OptionInputSchemaRow>(inputSchema)?.input_schema ?? null,
    },
    modelSpecs: modelRow ? {
      reasoning_spec: modelRow.reasoning_spec ?? oneRow<ModelSpecRow>(modelSpecs)?.reasoning_spec ?? null,
      evidence_spec: modelRow.evidence_spec ?? oneRow<ModelSpecRow>(modelSpecs)?.evidence_spec ?? null,
      evaluation_spec: modelRow.evaluation_spec ?? oneRow<ModelSpecRow>(modelSpecs)?.evaluation_spec ?? null,
    } : undefined,
  };
}

export async function getSubtaskDecisionChain(subtaskEventId: string) {
  const client = getMemoryClient();
  const plannerEvents = rowsToObjects<{ planner_event_id: string }>(await client.listPlannerEventsBySubtaskId(subtaskEventId));
  return Promise.all(plannerEvents.map(async (plannerEvent) => {
    const [decision, optionEvents] = await Promise.all([
      client.getPlannerDecisionByEventId(plannerEvent.planner_event_id),
      client.listOptionEventsByPlannerEventId(plannerEvent.planner_event_id),
    ]);
    return { plannerEvent, decision: oneRow(decision), optionEvents: rowsToObjects(optionEvents) };
  }));
}

export async function getOptionEvidence(optionId: string, _context?: Record<string, unknown>) {
  const client = getMemoryClient();
  const [optionResult, optionEvents, inputSchema] = await Promise.all([
    client.getOptionById(optionId),
    client.listOptionEventsByOptionId(optionId),
    client.getOptionInputSchemaById(optionId),
  ]);
  const option = oneRow<OptionRow>(optionResult);
  if (!option) return null;
  const [model, modelSpecs, modelEvents] = await Promise.all([
    client.getModelById(option.model_binding),
    client.getModelSpecsById(option.model_binding),
    client.listModelEventsByModelId(option.model_binding),
  ]);
  const events = await Promise.all(rowsToObjects<{ option_event_id: string }>(optionEvents).map(async (optionEvent) => ({
    optionEvent,
    observations: rowsToObjects(await client.listOptionObservationsByOptionEventId(optionEvent.option_event_id)),
    outcome: oneRow(await client.getOptionOutcomeByOptionEventId(optionEvent.option_event_id)),
  })));
  const modelRow = oneRow<ModelRow>(model);
  return {
    option,
    model: modelRow,
    inputSchema: {
      input_schema: option.input_schema ?? oneRow<OptionInputSchemaRow>(inputSchema)?.input_schema ?? null,
    },
    modelSpecs: modelRow ? {
      reasoning_spec: modelRow.reasoning_spec ?? oneRow<ModelSpecRow>(modelSpecs)?.reasoning_spec ?? null,
      evidence_spec: modelRow.evidence_spec ?? oneRow<ModelSpecRow>(modelSpecs)?.evidence_spec ?? null,
      evaluation_spec: modelRow.evaluation_spec ?? oneRow<ModelSpecRow>(modelSpecs)?.evaluation_spec ?? null,
    } : undefined,
    events,
    modelEvents: rowsToObjects(modelEvents),
  };
}
