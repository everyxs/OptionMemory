import { getMemoryClient } from "../memory/client";
import type { PlannerRow } from "../memory/planner";
import type { RegisterResult } from "./registry";

const PLANNER_STATUSES = new Set(["active", "disabled", "archived"]);

export async function registerPlanner(planner: PlannerRow): Promise<RegisterResult> {
  const requiredText = [
    planner.planner_id,
    planner.claim,
    planner.layer,
    planner.instructions_ref,
    planner.instructions_version,
    planner.inference_ref,
    planner.eps_type,
    planner.eps_source,
    planner.lin_source,
    planner.lin_version,
    planner.lin_actor,
    planner.verify,
    planner.status,
  ];
  if (requiredText.some((value) => typeof value !== "string" || value.length === 0)) {
    return { id: planner.planner_id ?? "", gate: "blocked", reason: "missing or invalid required Planner fields" };
  }
  if (planner.layer !== "planner") return { id: planner.planner_id, gate: "blocked", reason: "Planner layer must be planner" };
  if (!PLANNER_STATUSES.has(planner.status)) {
    return { id: planner.planner_id, gate: "blocked", reason: `invalid Planner status: ${planner.status}` };
  }
  if (!Array.isArray(planner.j_premise_ids)) {
    return { id: planner.planner_id, gate: "blocked", reason: "j_premise_ids must be an array" };
  }
  if (!Number.isFinite(planner.eps_value)) {
    return { id: planner.planner_id, gate: "blocked", reason: "eps_value must be finite" };
  }
  for (const [field, value] of [
    ["context_policy", planner.context_policy],
    ["decision_schema", planner.decision_schema],
    ["tool_policy", planner.tool_policy],
    ["budget_policy", planner.budget_policy],
  ] as const) {
    if (value === undefined || value === null) {
      return { id: planner.planner_id, gate: "blocked", reason: `${field} is required and must not be fabricated` };
    }
  }
  await getMemoryClient().putPlanner(planner);
  return { id: planner.planner_id, gate: "pass" };
}
