import type { FactInput } from "./schema";

export const CORE_EVENT_TYPES = ["task", "action", "observation", "outcome", "drift"] as const;
export const AUDIT_EVENT_TYPES = ["revision", "gate_audit"] as const;
export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface EventInput {
  predicate: CoreEventType | AuditEventType;
  args: string[];
  claim: string;
  actor: string;
  premiseIds?: string[];
  ruleId?: string | null;
}

export function makeEventFact(input: EventInput): FactInput {
  return {
    predicate: input.predicate,
    args: input.args,
    claim: input.claim,
    layer: "meta",
    jPremiseIds: input.premiseIds ?? [],
    jRuleId: input.ruleId ?? null,
    epsType: "confidence",
    epsValue: 1,
    epsSource: "event-log",
    linSource: "optionmemory-events",
    linVersion: "0.1",
    linActor: input.actor,
    verify: "event-schema-v0.1",
    status: "in",
  };
}

export function makeGateAuditEvent(targetId: string, reason: string, actor: string): FactInput {
  return makeEventFact({
    predicate: "gate_audit",
    args: [targetId, reason],
    claim: `gate_audit(${targetId}, ${reason})`,
    actor,
    premiseIds: [targetId],
    ruleId: "nu_gate",
  });
}
