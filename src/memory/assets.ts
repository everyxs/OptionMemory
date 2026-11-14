export const RULE_COLUMNS = [
  "rule_id", "horn_body", "horn_head", "opt_i", "opt_pi", "opt_beta",
  "layer", "lin_source", "lin_version", "lin_theta", "lin_actor", "status",
] as const;

export const JUSTIFICATION_COLUMNS = [
  "id", "derived_id", "premise_ids", "rule_id", "active", "derivation_ts",
] as const;

export const SUBTASK_COLUMNS = [
  "subtask_id", "goal", "context", "status", "utility_queries",
  "lin_source", "lin_version", "lin_theta", "lin_actor",
] as const;

export const OPTION_COLUMNS = [
  "option_id", "claim", "layer", "option_type", "template_id",
  "i_preconditions", "pi_type", "pi_ref", "pi_fallback", "beta_success",
  "beta_output_schema", "rule_ref", "j_premise_ids", "eps_type", "eps_value",
  "eps_source", "lin_source", "lin_version", "lin_theta", "verify", "status",
  "subtask_binding", "model_binding",
] as const;

export const MODEL_COLUMNS = [
  "model_id", "option_id", "claim", "layer", "achievable_probability",
  "calibration_history", "prediction_error", "cost_model", "theta_version",
  "estimated_initiation_region", "eps_type", "eps_value", "eps_source",
  "status", "j_records", "lin_source", "lin_version", "lin_theta", "lin_actor",
  "verify",
] as const;

export const PROCEDURAL_KNOWLEDGE_COLUMNS = [
  "id", "claim", "layer", "s_id", "o_id", "m_id", "fidelity", "eps_value",
  "eps_ceiling", "lin_source", "lin_version", "lin_theta", "lin_actor", "verify", "status",
] as const;

export const PLAN_TEMPLATE_COLUMNS = [
  "template_id", "name", "input_schema", "output_schema", "body_dag",
  "applicable_conditions", "model_ref", "status", "lin_source", "lin_version",
  "lin_theta", "lin_actor",
] as const;

export interface RuleRow {
  rule_id: string;
  horn_body: string;
  horn_head: string;
  opt_i: unknown;
  opt_pi: unknown;
  opt_beta: unknown;
  layer: string;
  lin_source: string;
  lin_version: string;
  lin_theta: string | null;
  lin_actor: string;
  status: string;
}

export interface JustificationRow {
  id: string;
  derived_id: string;
  premise_ids: string[];
  rule_id: string;
  active: boolean;
  derivation_ts: number;
}

export interface SubtaskRow {
  subtask_id: string;
  goal: string;
  context: unknown;
  status: string;
  utility_queries: number;
  lin_source: string;
  lin_version: string;
  lin_theta: string | null;
  lin_actor: string;
}

export interface OptionRow {
  option_id: string;
  claim: string;
  layer: string;
  option_type: "atomic" | "agent" | "template_compiled";
  template_id: string | null;
  i_preconditions: unknown;
  pi_type: string;
  pi_ref: string;
  pi_fallback: string;
  beta_success: unknown;
  beta_output_schema: unknown;
  rule_ref: string | null;
  j_premise_ids: string[];
  eps_type: string;
  eps_value: number;
  eps_source: string;
  lin_source: string;
  lin_version: string;
  lin_theta: string | null;
  verify: string;
  status: string;
  subtask_binding: string;
  model_binding: string;
}

export type OptionInput = Omit<OptionRow, "option_type" | "template_id"> &
  Partial<Pick<OptionRow, "option_type" | "template_id">>;

export interface ModelRow {
  model_id: string;
  option_id: string;
  claim: string;
  layer: string;
  achievable_probability: number;
  calibration_history: unknown;
  prediction_error: number;
  cost_model: unknown;
  theta_version: string;
  estimated_initiation_region: string;
  eps_type: string;
  eps_value: number;
  eps_source: string;
  status: string;
  j_records: string[];
  lin_source: string;
  lin_version: string;
  lin_theta: string | null;
  lin_actor: string;
  verify: string;
}

export interface ProceduralKnowledgeRow {
  id: string;
  claim: string;
  layer: string;
  s_id: string;
  o_id: string;
  m_id: string;
  fidelity: string | null;
  eps_value: number;
  eps_ceiling: number;
  lin_source: string;
  lin_version: string;
  lin_theta: string | null;
  lin_actor: string;
  verify: string;
  status: string;
}

export interface PlanTemplateRow {
  template_id: string;
  name: string;
  input_schema: unknown;
  output_schema: unknown;
  body_dag: unknown;
  applicable_conditions: unknown;
  model_ref: string;
  status: string;
  lin_source: string;
  lin_version: string;
  lin_theta: string | null;
  lin_actor: string;
}

export interface ClosureFact {
  id: string;
  predicate: string;
  args: string[];
  layer: string;
}
