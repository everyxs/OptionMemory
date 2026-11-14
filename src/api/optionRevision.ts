import { randomUUID } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type { NamedRows } from "../memory/mnesticClient";
import type { OptionRow, ProceduralKnowledgeRow } from "../memory/assets";
import type { Fact, FactInput } from "../memory/schema";
import type { GateResult } from "../runtime/nuGate";
import { makeEventFact } from "../memory/events";
import { factToRow, memory_get } from "./memory";
import { findAffectedFacts, memory_retract, restoreFact } from "./revision";

export interface OptionPrerequisiteResult extends GateResult {
  id: string;
  status?: string;
  affectedFacts?: string[];
  proceduralIds?: string[];
}

function rowsToObjects<T>(result: NamedRows): T[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T,
  );
}

export async function registerProceduralKnowledge(row: ProceduralKnowledgeRow): Promise<OptionPrerequisiteResult> {
  const requiredText = [row.id, row.claim, row.layer, row.s_id, row.o_id, row.m_id, row.lin_source, row.lin_version, row.lin_actor, row.verify, row.status];
  if (requiredText.some((value) => typeof value !== "string" || value.length === 0) ||
    !Number.isFinite(row.eps_value) || !Number.isFinite(row.eps_ceiling)) {
    return { id: row.id, gate: "blocked", reason: "missing or invalid procedural knowledge fields" };
  }
  await getMemoryClient().putProceduralKnowledge(row);
  return { id: row.id, gate: "pass", status: row.status };
}

function isRequiredXrdFact(option: OptionRow, fact: Fact): boolean {
  if (fact.predicate !== "xrd_peak" || fact.args[0] !== "S01") return false;
  const required = (option.i_preconditions as { requires?: unknown }).requires;
  return Array.isArray(required) && required.includes(`xrd_peak(${fact.args[2]})`);
}

async function loadOptionAndProcedural(optionId: string) {
  const client = getMemoryClient();
  const [optionResult, proceduralResult] = await Promise.all([
    client.getOptionById(optionId),
    client.getProceduralKnowledgeByOptionId(optionId),
  ]);
  return {
    option: rowsToObjects<OptionRow>(optionResult)[0] as OptionRow | undefined,
    procedural: rowsToObjects<ProceduralKnowledgeRow>(proceduralResult),
  };
}

function revisionRows(targetIds: string[], action: "retract" | "restore", actor: string, rootId: string) {
  const now = Date.now() / 1000;
  return targetIds.map((targetId) => factToRow(`fact_${randomUUID()}`, makeEventFact({
    predicate: "revision",
    args: [targetId, action, actor, String(now)],
    claim: `revision(${targetId}, ${action}, ${actor}, ${now})`,
    actor,
    premiseIds: [rootId],
    ruleId: "option_prerequisite",
  })));
}

export async function retractOptionPrerequisite(
  optionId: string,
  factId: string,
  options: { actor?: string } = {},
): Promise<OptionPrerequisiteResult> {
  const { option, procedural } = await loadOptionAndProcedural(optionId);
  if (!option) return { id: optionId, gate: "blocked", reason: "option not found" };
  const fact = await memory_get(factId);
  if (!fact) return { id: optionId, gate: "blocked", reason: "prerequisite fact not found" };
  if (!isRequiredXrdFact(option, fact)) {
    return { id: optionId, gate: "blocked", reason: `fact ${factId} is not an initiation prerequisite of ${optionId}` };
  }

  const actor = options.actor?.trim() || "unknown";
  const retracted = await memory_retract(factId, { actor });
  if (retracted.gate === "blocked") return { ...retracted, id: optionId };
  const affectedFacts = [...await findAffectedFacts(factId, true)];
  const proceduralIds = procedural.map((row) => row.id);
  const changedTargets = [
    ...option.status === "out" ? [] : [option.option_id],
    ...procedural.filter((row) => row.status !== "out").map((row) => row.id),
  ];

  if (option.status !== "out") await getMemoryClient().putOption({ ...option, status: "out" });
  for (const row of procedural) {
    if (row.status !== "out") await getMemoryClient().putProceduralKnowledge({ ...row, status: "out" });
  }
  await getMemoryClient().putFacts(revisionRows(changedTargets, "retract", actor, factId));
  return { id: optionId, gate: "pass", status: "out", affectedFacts, proceduralIds };
}

export async function restoreOptionPrerequisite(
  optionId: string,
  factId: string,
  options: { actor?: string; restoreStatus?: string } = {},
): Promise<OptionPrerequisiteResult> {
  const { option, procedural } = await loadOptionAndProcedural(optionId);
  if (!option) return { id: optionId, gate: "blocked", reason: "option not found" };
  const fact = await memory_get(factId);
  if (!fact) return { id: optionId, gate: "blocked", reason: "prerequisite fact not found" };
  if (!isRequiredXrdFact(option, fact)) {
    return { id: optionId, gate: "blocked", reason: `fact ${factId} is not an initiation prerequisite of ${optionId}` };
  }

  const actor = options.actor?.trim() || "unknown";
  const restored = await restoreFact(factId, { actor });
  if (restored.gate === "blocked") return { ...restored, id: optionId };
  const status = options.restoreStatus ?? "probation";
  const affectedFacts = [...await findAffectedFacts(factId, true)];
  const proceduralIds = procedural.map((row) => row.id);
  const changedTargets = [
    ...option.status === status ? [] : [option.option_id],
    ...procedural.filter((row) => row.status !== "in").map((row) => row.id),
  ];

  if (option.status !== status) await getMemoryClient().putOption({ ...option, status });
  for (const row of procedural) {
    if (row.status !== "in") await getMemoryClient().putProceduralKnowledge({ ...row, status: "in" });
  }
  await getMemoryClient().putFacts(revisionRows(changedTargets, "restore", actor, factId));
  return { id: optionId, gate: "pass", status, affectedFacts, proceduralIds };
}

export async function reconcileOptionPrerequisite(
  optionId: string,
  factId: string,
  options: { actor?: string } = {},
): Promise<OptionPrerequisiteResult> {
  const { option, procedural } = await loadOptionAndProcedural(optionId);
  if (!option) return { id: optionId, gate: "blocked", reason: "option not found" };
  const fact = await memory_get(factId);
  if (!fact) return { id: optionId, gate: "blocked", reason: "prerequisite fact not found" };
  if (!isRequiredXrdFact(option, fact)) {
    return { id: optionId, gate: "blocked", reason: `fact ${factId} is not an initiation prerequisite of ${optionId}` };
  }
  if (fact.status !== "out" && option.status !== "out") return restoreOptionPrerequisite(optionId, factId, options);

  const actor = options.actor?.trim() || "unknown";
  if (option.status !== "out") await getMemoryClient().putOption({ ...option, status: "out" });
  for (const row of procedural) {
    if (row.status !== "out") await getMemoryClient().putProceduralKnowledge({ ...row, status: "out" });
  }
  const missingRevision: string[] = [];
  for (const targetId of [optionId, ...procedural.map((row) => row.id)]) {
    if (await getMemoryClient().countRevision(targetId, "retract", factId) === 0) {
      missingRevision.push(targetId);
    }
  }
  await getMemoryClient().putFacts(revisionRows(missingRevision, "retract", actor, factId));
  const affectedFacts = [...await findAffectedFacts(factId, true)];
  return {
    id: optionId,
    gate: "pass",
    status: "out",
    affectedFacts,
    proceduralIds: procedural.map((row) => row.id),
  };
}
