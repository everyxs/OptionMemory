import type { Fact, FactInput } from "../memory/schema";

export const M1_RULE_ID = "M1";
export const M1_PREDICATE = "hardness";

export function conflictKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join("|");
}

export function isM1Conflict(left: Fact, right: Fact): boolean {
  if (left.id === right.id || left.predicate !== M1_PREDICATE || right.predicate !== M1_PREDICATE) return false;
  if (left.args[0] !== right.args[0]) return false;
  if (left.args[1] === right.args[1]) return false;
  return ["in", "contested"].includes(left.status) && ["in", "contested"].includes(right.status);
}

export function makeConflictEvent(left: Fact, right: Fact): FactInput {
  return {
    predicate: "conflict",
    args: [M1_RULE_ID, left.args[0], M1_PREDICATE, left.id, right.id],
    claim: `${M1_RULE_ID}: ${left.args[0]} ${M1_PREDICATE} has conflicting values ${left.args[1]} vs ${right.args[1]}`,
    layer: "meta",
    jPremiseIds: [left.id, right.id],
    jRuleId: M1_RULE_ID,
    epsType: "confidence",
    epsValue: 1,
    epsSource: "m1-conflict-detector",
    linSource: "m1-conflict-detector",
    linVersion: "1.0",
    linActor: "m1-conflict-detector",
    verify: "m1-conflict-v0.1",
    status: "in",
  };
}
