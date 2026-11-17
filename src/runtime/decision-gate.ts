import type { PlannerDecision } from "../api/planner-contracts";
import type { PlanRunRow, SubtaskEventRow } from "../memory/planner";
import type { MandateInput } from "../api/telemetry";
import type { GateResult } from "./nuGate";

export interface DecisionGateResult extends GateResult {
  dryRun: boolean;
}

function blocked(reason: string): DecisionGateResult {
  return { gate: "blocked", reason, dryRun: false };
}

function scopeList(scope: Record<string, unknown>, key: string): string[] | undefined {
  const value = scope[key];
  if (value === undefined) return undefined;
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

export function checkPlannerDecision(input: {
  planRun: PlanRunRow;
  subtaskEvent: SubtaskEventRow;
  decision: PlannerDecision;
  previousDecisionCount: number;
  retryCount?: number;
}): DecisionGateResult {
  if (input.planRun.status !== "active") return blocked(`plan_run is not active: ${input.planRun.status}`);
  if (input.planRun.subtask_event_id !== input.subtaskEvent.subtask_event_id) {
    return blocked("plan_run and subtask_event do not match");
  }
  const mandate = input.subtaskEvent.mandate_json as MandateInput;
  if (!mandate || typeof mandate !== "object" || !mandate.scope || !mandate.budget) {
    return blocked("mandate scope and budget are required");
  }
  if (mandate.strength !== "explicit") return blocked("Planner decisions require an explicit mandate");
  const maxSteps = mandate.budget.max_steps;
  if (typeof maxSteps === "number" && input.previousDecisionCount >= maxSteps) {
    return blocked(`Planner step budget exhausted: ${maxSteps}`);
  }

  if (input.decision.decision === "execute" || input.decision.decision === "retry") {
    const allowedEffects = scopeList(mandate.scope, "allowed_effects");
    if (allowedEffects && !allowedEffects.includes("execute")) return blocked("execute is outside mandate allowed_effects");
    if (mandate.mode === "dry-run") return { gate: "pass", dryRun: true };
  }
  if (input.decision.decision === "execute") {
    const allowedOptions = scopeList(mandate.scope, "option_ids") ?? scopeList(mandate.scope, "allowed_options");
    if (allowedOptions && !allowedOptions.includes(input.decision.option_id)) {
      return blocked(`Option is outside mandate scope: ${input.decision.option_id}`);
    }
  }
  if (input.decision.decision === "retry") {
    const maxRetries = mandate.budget.max_retries;
    if (typeof maxRetries === "number" && (input.retryCount ?? 0) >= maxRetries) {
      return blocked(`retry budget exhausted: ${maxRetries}`);
    }
  }
  if (input.decision.decision === "decompose") {
    for (const proposal of input.decision.proposals) {
      if ("mandate" in proposal.context || "allowed_options" in proposal.context || "allowed_effects" in proposal.context) {
        return blocked("decompose proposals must not replace or expand the parent mandate");
      }
    }
  }
  return { gate: "pass", dryRun: false };
}
