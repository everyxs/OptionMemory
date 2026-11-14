import { memory_set_batch, type BatchBlockedItem } from "../api/memory";
import { getMemoryClient } from "../memory/client";
import type { ClosureFact, RuleRow } from "../memory/assets";
import type { FactInput } from "../memory/schema";
import { calculateSmix } from "./descriptors";
import { writeJustifications } from "./justifications";

export interface ClosureScope {
  entity?: string;
  predicate?: string;
}

export interface ClosureResult {
  inserted: number;
  skipped: number;
  blocked: BatchBlockedItem[];
  ids: (string | null)[];
  justificationsInserted: number;
  justificationsSkipped: number;
}

interface Candidate {
  fact: FactInput;
  premiseIds: string[];
  ruleId: string;
}

function derivedFact(
  premise: ClosureFact,
  ruleId: string,
  premiseIds: string[],
  predicate: string,
  args: string[],
): Candidate {
  return {
    fact: {
      predicate,
      args,
      claim: `${predicate}(${args.join(", ")})`,
      layer: premise.layer,
      jPremiseIds: premiseIds,
      jRuleId: ruleId,
      epsType: "in-degree",
      epsValue: 0.5,
      epsSource: "inferred-prior",
      linSource: "deriveClosure",
      linVersion: "1.0",
      linActor: "deriveClosure",
      verify: "horn+revisability",
      status: "in",
    },
    premiseIds,
    ruleId,
  };
}

function candidatesForRule(rule: RuleRow, facts: ClosureFact[]): Candidate[] {
  const compositions = facts.filter((fact) => fact.predicate === "composition");
  switch (rule.rule_id) {
    case "R1":
      return compositions.map((fact) =>
        derivedFact(fact, rule.rule_id, [fact.id], "candidate_solid_solution", [fact.args[0]]),
      );
    case "R2": {
      const peaks = facts.filter((fact) => fact.predicate === "xrd_peak");
      const out: Candidate[] = [];
      for (const fcc of peaks.filter((fact) => fact.args[2] === "FCC(111)")) {
        for (const bcc of peaks.filter((fact) =>
          fact.args[0] === fcc.args[0] && fact.args[2] === "BCC(110)" && fact.id !== fcc.id,
        )) {
          out.push(derivedFact(
            fcc,
            rule.rule_id,
            [fcc.id, bcc.id],
            "phase_structure",
            [fcc.args[0], "BCC+FCC"],
          ));
        }
      }
      return out;
    }
    case "R3":
      return compositions.map((fact) =>
        derivedFact(
          fact,
          rule.rule_id,
          [fact.id],
          "smix",
          [fact.args[0], String(calculateSmix(fact.args[1]))],
        ),
      );
    case "R4":
      throw new Error("R4 is blocked pending full-dataset calibration and explicit approval");
    default:
      return [];
  }
}

export async function deriveClosure(scope: ClosureScope | string = {}): Promise<ClosureResult> {
  const normalized: ClosureScope = typeof scope === "string" ? { entity: scope } : scope;
  const client = getMemoryClient();
  const [rules, allFacts] = await Promise.all([
    client.listActiveRules(),
    client.listActiveClosureFacts(),
  ]);
  const facts = allFacts.filter((fact) =>
    (normalized.entity === undefined || fact.args[0] === normalized.entity) &&
    (normalized.predicate === undefined || fact.predicate === normalized.predicate),
  );
  const candidates = rules.flatMap((rule) => candidatesForRule(rule, facts));

  const write = await memory_set_batch(
    candidates.map((candidate) => candidate.fact),
    { includeOutInIdempotence: false },
  );
  const justificationWrite = await writeJustifications(
    candidates.flatMap((candidate, index) => {
      const derivedId = write.ids[index];
      return derivedId === null
        ? []
        : [{ derivedId, premiseIds: candidate.premiseIds, ruleId: candidate.ruleId }];
    }),
  );

  return {
    ...write,
    justificationsInserted: justificationWrite.inserted,
    justificationsSkipped: justificationWrite.skipped,
  };
}
