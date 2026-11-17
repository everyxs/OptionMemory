import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FactInput } from "../memory/schema";

interface SettlementPolicy {
  id: string;
  version: string;
  predicate: string;
  sourcePriority: Record<string, number>;
  unknownSource: "manual_review";
}

const policy = JSON.parse(
  readFileSync(resolve(__dirname, "../../config/settlement-policy.json"), "utf8"),
) as SettlementPolicy;

export type SettlementAction = "settle" | "revoke";
export type SourceDecision = "left" | "right" | "manual_review";

export interface SettlementEventInput {
  action: SettlementAction;
  optionId: string;
  factId: string;
  opposingFactId: string;
  proposer: string;
  arbiter: string;
  executor: string;
  rationale: string;
  policyVersion?: string;
}

export const SETTLEMENT_POLICY_ID = policy.id;
export const SETTLEMENT_POLICY_VERSION = policy.version;
export const SETTLEMENT_PREDICATE = policy.predicate;

export function settlementSourceRank(source: string): number | null {
  const rank = policy.sourcePriority[source.trim().toLowerCase()];
  return typeof rank === "number" ? rank : null;
}

export function compareSettlementSources(left: string, right: string): SourceDecision {
  const leftRank = settlementSourceRank(left);
  const rightRank = settlementSourceRank(right);
  if (leftRank === null || rightRank === null || leftRank === rightRank) return "manual_review";
  return leftRank > rightRank ? "left" : "right";
}

function deterministicFactId(kind: string, input: SettlementEventInput): string {
  const policyVersion = input.policyVersion ?? SETTLEMENT_POLICY_VERSION;
  const key = [
    kind,
    input.action,
    input.optionId,
    input.factId,
    input.opposingFactId,
    policyVersion,
  ].join("|");
  return `fact_${createHash("sha256").update(key).digest("hex")}`;
}

export function settlementEventIds(input: SettlementEventInput): { governanceId: string; revisionId: string } {
  return {
    governanceId: deterministicFactId("governance", input),
    revisionId: deterministicFactId("revision", input),
  };
}

export function makeSettlementEvents(input: SettlementEventInput): { governance: FactInput; revision: FactInput } {
  const now = Date.now() / 1000;
  const policyVersion = input.policyVersion ?? SETTLEMENT_POLICY_VERSION;
  const ids = settlementEventIds(input);
  const shared = {
    layer: "meta",
    jPremiseIds: [input.factId, input.opposingFactId],
    epsType: "confidence",
    epsValue: 1,
    epsSource: "settlement-policy",
    linSource: SETTLEMENT_POLICY_ID,
    linVersion: policyVersion,
    linTheta: null,
    linActor: input.executor,
    verify: "phase3-settlement-v0.1",
    status: "in" as const,
  };
  return {
    governance: {
      ...shared,
      predicate: "governance",
      args: [
        input.action,
        input.optionId,
        input.factId,
        input.opposingFactId,
        policyVersion,
        input.proposer,
        input.arbiter,
        input.executor,
        input.rationale,
        String(now),
      ],
      claim: `${input.action} ${input.optionId} by ${input.arbiter} under ${SETTLEMENT_POLICY_ID}@${policyVersion}`,
      jRuleId: "settlement_policy",
    },
    revision: {
      ...shared,
      predicate: "revision",
      args: [input.optionId, input.action, input.executor, String(now), ids.governanceId],
      claim: `revision(${input.optionId}, ${input.action}, ${input.executor}, ${now})`,
      jPremiseIds: [input.factId, input.opposingFactId, ids.governanceId],
      jRuleId: input.action,
    },
  };
}
