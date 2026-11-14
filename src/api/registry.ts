import { getMemoryClient } from "../memory/client";
import {
  type ModelRow,
  type OptionInput,
  type OptionRow,
  type RuleRow,
  type SubtaskRow,
} from "../memory/assets";
import type { GateResult } from "../runtime/nuGate";

export interface RegisterResult extends GateResult {
  id: string;
}

function missingStrings(row: object, fields: string[]): string[] {
  const value = row as Record<string, unknown>;
  return fields.filter((field) => {
    const item = value[field];
    return typeof item !== "string" || item.length === 0;
  });
}

function missingValues(row: object, fields: string[]): string[] {
  const value = row as Record<string, unknown>;
  return fields.filter((field) => value[field] === undefined || value[field] === null);
}

function blocked(id: string, fields: string[]): RegisterResult {
  return { id, gate: "blocked", reason: `missing or invalid required field(s): ${fields.join(", ")}` };
}

export async function registerRule(rule: RuleRow): Promise<RegisterResult> {
  const missing = [
    ...missingStrings(rule, ["rule_id", "horn_body", "horn_head", "layer", "lin_source", "lin_version", "lin_actor", "status"]),
    ...missingValues(rule, ["opt_i", "opt_pi", "opt_beta"]),
  ];
  if (missing.length > 0) return blocked(rule.rule_id ?? "", missing);
  if (rule.rule_id === "R4" && rule.status === "in") {
    return { id: rule.rule_id, gate: "blocked", reason: "R4 is blocked pending full-dataset calibration and explicit approval" };
  }
  await getMemoryClient().putRule(rule);
  return { id: rule.rule_id, gate: "pass" };
}

export async function registerOption(input: OptionInput): Promise<RegisterResult> {
  const option: OptionRow = {
    ...input,
    option_type: input.option_type ?? "atomic",
    template_id: input.template_id ?? null,
  };
  const missing = [
    ...missingStrings(option, [
      "option_id", "claim", "layer", "pi_type", "pi_ref", "pi_fallback",
      "eps_type", "eps_source", "lin_source", "lin_version", "verify", "status",
      "subtask_binding", "model_binding",
    ]),
    ...missingValues(option, ["i_preconditions", "beta_success", "beta_output_schema", "j_premise_ids"]),
  ];
  if (!Number.isFinite(option.eps_value)) missing.push("eps_value");
  if (!Array.isArray(option.j_premise_ids)) missing.push("j_premise_ids");
  if (missing.length > 0) return blocked(option.option_id ?? "", [...new Set(missing)]);
  if (option.option_type !== "atomic") {
    return { id: option.option_id, gate: "blocked", reason: "MVP only permits atomic options" };
  }
  await getMemoryClient().putOption(option);
  return { id: option.option_id, gate: "pass" };
}

export async function registerSubtask(subtask: SubtaskRow): Promise<RegisterResult> {
  const missing = [
    ...missingStrings(subtask, ["subtask_id", "goal", "status", "lin_source", "lin_version", "lin_actor"]),
    ...missingValues(subtask, ["context"]),
  ];
  if (!Number.isInteger(subtask.utility_queries)) missing.push("utility_queries");
  if (missing.length > 0) return blocked(subtask.subtask_id ?? "", missing);
  await getMemoryClient().putSubtask(subtask);
  return { id: subtask.subtask_id, gate: "pass" };
}

export async function registerModel(model: ModelRow): Promise<RegisterResult> {
  const missing = [
    ...missingStrings(model, [
      "model_id", "option_id", "claim", "layer", "eps_type", "eps_source",
      "status", "lin_source", "lin_version", "lin_actor", "verify",
    ]),
    ...missingValues(model, ["calibration_history", "cost_model", "j_records"]),
  ];
  for (const field of ["achievable_probability", "prediction_error", "eps_value"] as const) {
    if (!Number.isFinite(model[field])) missing.push(field);
  }
  if (!Array.isArray(model.j_records)) missing.push("j_records");
  if (missing.length > 0) return blocked(model.model_id ?? "", [...new Set(missing)]);
  await getMemoryClient().putModel(model);
  return { id: model.model_id, gate: "pass" };
}
