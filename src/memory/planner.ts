export const PLANNER_COLUMNS = [
  "planner_id", "claim", "layer", "j_premise_ids", "instructions_ref",
  "instructions_version", "inference_ref", "context_policy", "decision_schema",
  "tool_policy", "budget_policy", "eps_type", "eps_value", "eps_source",
  "lin_source", "lin_version", "lin_theta", "lin_actor", "verify", "status",
] as const;

export const PLAN_RUN_COLUMNS = [
  "plan_run_id", "subtask_event_id", "attempt", "host_type", "host_session_ref",
  "host_ticket_ref", "host_assignment_ref", "idempotency_key", "mapping_version",
  "status", "created_at", "updated_at",
] as const;

export const SUBTASK_EVENT_COLUMNS = [
  "subtask_event_id", "subtask_id", "baseline_id", "mandate_json", "created_at",
] as const;

export const PLANNER_EVENT_COLUMNS = [
  "planner_event_id", "subtask_event_id", "plan_run_id", "planner_id", "context_json", "created_at",
] as const;

export const PLANNER_DECISION_COLUMNS = [
  "planner_event_id", "decision_type", "decision_json", "created_at",
] as const;

export const OPTION_EVENT_COLUMNS = [
  "option_event_id", "planner_event_id", "option_id", "model_id", "execution_json", "created_at",
] as const;

export const OPTION_OBSERVATION_COLUMNS = [
  "observation_event_id", "option_event_id", "observation_type", "value_json", "created_at",
] as const;

export const OPTION_OUTCOME_COLUMNS = [
  "option_event_id", "status", "evaluation_json", "cost_json", "error_json", "created_at",
] as const;

export const MODEL_EVENT_COLUMNS = [
  "model_event_id", "model_id", "event_type", "payload_json", "created_at",
] as const;

export const PLANNER_DECISION_TYPES = [
  "execute", "decompose", "replan", "retry", "wait", "ask", "stop", "ignore",
] as const;
export const OPTION_OBSERVATION_TYPES = [
  "input", "context", "pre_state", "output", "post_state", "environment", "error",
] as const;
export const OPTION_OUTCOME_STATUSES = ["success", "failure", "blocked"] as const;
export const EXECUTION_MODES = ["real", "simulated", "sidecar"] as const;
export const MODEL_EVENT_TYPES = ["anticipation", "critique", "calibration", "drift"] as const;
export const PLAN_RUN_STATUSES = ["active", "stopped", "completed"] as const;

export type PlannerDecisionType = (typeof PLANNER_DECISION_TYPES)[number];
export type OptionObservationType = (typeof OPTION_OBSERVATION_TYPES)[number];
export type OptionOutcomeStatus = (typeof OPTION_OUTCOME_STATUSES)[number];
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export type ModelEventType = (typeof MODEL_EVENT_TYPES)[number];
export type PlanRunStatus = (typeof PLAN_RUN_STATUSES)[number];
export type HostType = "dsh" | "opencode" | "superagent" | "sidecar";

export interface PlannerRow {
  planner_id: string;
  claim: string;
  layer: "planner";
  j_premise_ids: string[];
  instructions_ref: string;
  instructions_version: string;
  inference_ref: string;
  context_policy: unknown;
  decision_schema: unknown;
  tool_policy: unknown;
  budget_policy: unknown;
  eps_type: string;
  eps_value: number;
  eps_source: string;
  lin_source: string;
  lin_version: string;
  lin_theta: string | null;
  lin_actor: string;
  verify: string;
  status: "active" | "disabled" | "archived";
}

export interface PlanRunRow {
  plan_run_id: string;
  subtask_event_id: string;
  attempt: number;
  host_type: HostType;
  host_session_ref: string | null;
  host_ticket_ref: string | null;
  host_assignment_ref: string | null;
  idempotency_key: string;
  mapping_version: string;
  status: PlanRunStatus;
  created_at: number;
  updated_at: number;
}

export interface SubtaskEventRow {
  subtask_event_id: string;
  subtask_id: string;
  baseline_id: string;
  mandate_json: unknown;
  created_at: number;
}

export interface PlannerEventRow {
  planner_event_id: string;
  subtask_event_id: string;
  plan_run_id: string;
  planner_id: string;
  context_json: unknown;
  created_at: number;
}

export interface PlannerDecisionRow {
  planner_event_id: string;
  decision_type: PlannerDecisionType;
  decision_json: unknown;
  created_at: number;
}

export interface OptionEventRow {
  option_event_id: string;
  planner_event_id: string;
  option_id: string;
  model_id: string;
  execution_json: unknown;
  created_at: number;
}

export interface OptionObservationRow {
  observation_event_id: string;
  option_event_id: string;
  observation_type: OptionObservationType;
  value_json: unknown;
  created_at: number;
}

export interface OptionOutcomeRow {
  option_event_id: string;
  status: OptionOutcomeStatus;
  evaluation_json: unknown;
  cost_json: unknown;
  error_json: unknown;
  created_at: number;
}

export interface ModelEventRow {
  model_event_id: string;
  model_id: string;
  event_type: ModelEventType;
  payload_json: unknown;
  created_at: number;
}

export const OPTION_INPUT_SCHEMA_COLUMNS = ["option_id", "input_schema"] as const;
export const MODEL_SPEC_COLUMNS = ["model_id", "reasoning_spec", "evidence_spec", "evaluation_spec"] as const;

export interface OptionInputSchemaRow {
  option_id: string;
  input_schema: unknown;
}

export interface ModelSpecRow {
  model_id: string;
  reasoning_spec: unknown;
  evidence_spec: unknown;
  evaluation_spec: unknown;
}

export const HOST_EVENT_COLUMNS = [
  "host_event_id", "plan_run_id", "event_type", "external_id", "payload_json", "created_at",
] as const;

export interface HostEventRow {
  host_event_id: string;
  plan_run_id: string;
  event_type: "deliver" | "stop" | "report" | "answer" | "assignmentStarted" | "attention";
  external_id: string;
  payload_json: unknown;
  created_at: number;
}
