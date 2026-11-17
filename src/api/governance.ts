import { getMemoryClient } from "../memory/client";
import type { Fact } from "../memory/schema";
import type { ModelRow } from "../memory/assets";
import { factToRow, memory_get } from "./memory";
import { findAffectedFacts } from "./revision";
import { conflictKey, isM1Conflict, makeConflictEvent, M1_PREDICATE } from "../runtime/conflict";
import type { GateResult } from "../runtime/nuGate";
import {
  compareSettlementSources,
  makeSettlementEvents,
  SETTLEMENT_POLICY_VERSION,
  SETTLEMENT_PREDICATE,
  settlementEventIds,
  type SettlementAction,
  type SettlementEventInput,
} from "../runtime/settlement";

export interface HardnessConflictResult {
  conflictKey: string;
  eventId: string;
  contestedFactIds: string[];
  probationOptionIds: string[];
  pausedFactIds: string[];
  reused: boolean;
}

export async function isolateHardnessConflict(leftId: string, rightId: string): Promise<HardnessConflictResult> {
  const client = getMemoryClient();
  const [left, right] = await Promise.all([memory_get(leftId), memory_get(rightId)]);
  if (!left || !right) throw new Error("hardness conflict requires both facts");
  if (!isM1Conflict(left, right)) throw new Error("not an M1 hardness conflict");

  const key = conflictKey(leftId, rightId);
  const [options, allFacts, affectedLeft, affectedRight] = await Promise.all([
    client.listOptions(),
    client.listAllFactRows(),
    findAffectedFacts(leftId, true),
    findAffectedFacts(rightId, true),
  ]);
  const linkedOptions = options.filter((option) =>
    option.j_premise_ids.some((id) => id === leftId || id === rightId),
  );
  const probationOptionIds = linkedOptions.map((option) => option.option_id);
  const pausedFactIds = [...new Set([...affectedLeft, ...affectedRight])]
    .filter((id) => id !== leftId && id !== rightId);
  const updates = await Promise.all([leftId, rightId, ...pausedFactIds].map(async (id) => {
    const fact = await memory_get(id);
    if (!fact || fact.status !== "in") return null;
    return factToRow(id, { ...fact, status: "contested" });
  }));
  const changedRows = updates.filter((row) => row !== null);

  for (const option of linkedOptions) {
    if (option.status !== "revoked" && option.status !== "archived") {
      await client.putOption({ ...option, status: "probation" });
    }
  }

  const existing = allFacts.find((row) => {
    const args = row.args as string[];
    return row.predicate === "conflict" && conflictKey(args[3], args[4]) === key;
  });
  const rows = [...changedRows];
  if (!existing) rows.push(factToRow(`fact_${crypto.randomUUID()}`, makeConflictEvent(left, right)));
  await client.putFacts(rows);
  return {
    conflictKey: key,
    eventId: existing ? String(existing.id) : String(rows.at(-1)!.id),
    contestedFactIds: [leftId, rightId],
    probationOptionIds,
    pausedFactIds,
    reused: existing !== undefined,
  };
}

export async function detectAndIsolateHardnessConflicts(entityId: string): Promise<HardnessConflictResult[]> {
  const facts = await getMemoryClient().listAllFactRows();
  const candidates = facts.filter((row) =>
    row.predicate === M1_PREDICATE && (row.args as string[])[0] === entityId && ["in", "contested"].includes(String(row.status)),
  );
  const results: HardnessConflictResult[] = [];
  const seen = new Set<string>();
  for (let left = 0; left < candidates.length; left++) {
    for (let right = left + 1; right < candidates.length; right++) {
      const leftFact = await memory_get(String(candidates[left].id));
      const rightFact = await memory_get(String(candidates[right].id));
      if (!leftFact || !rightFact || !isM1Conflict(leftFact, rightFact)) continue;
      const key = conflictKey(leftFact.id, rightFact.id);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(await isolateHardnessConflict(leftFact.id, rightFact.id));
    }
  }
  return results;
}

export interface GovernanceActionInput {
  factId: string;
  opposingFactId: string;
  proposer: string;
  arbiter: string;
  executor?: string;
  rationale?: string;
  policyVersion?: string;
}

export interface GovernanceActionResult extends GateResult {
  id: string;
  status?: "settled" | "revoked";
  factId?: string;
  factStatus?: "in" | "archived";
  eventId?: string;
  revisionId?: string;
  modelId?: string;
  modelStatus?: "settled" | "retracted";
  reused?: boolean;
}

function governanceBlocked(id: string, reason: string): GovernanceActionResult {
  return { id, gate: "blocked", reason };
}

async function applySettlementAction(
  action: SettlementAction,
  optionId: string,
  input: GovernanceActionInput,
): Promise<GovernanceActionResult> {
  const client = getMemoryClient();
  const proposer = input.proposer?.trim();
  const arbiter = input.arbiter?.trim();
  if (!proposer || !arbiter) return governanceBlocked(optionId, "proposer and arbiter are required");
  const policyVersion = input.policyVersion ?? SETTLEMENT_POLICY_VERSION;
  if (policyVersion !== SETTLEMENT_POLICY_VERSION) {
    return governanceBlocked(optionId, `unsupported settlement policy version: ${policyVersion}`);
  }

  const [option, loadedFact, loadedOpposingFact] = await Promise.all([
    client.listOptions().then((options) => options.find((row) => row.option_id === optionId)),
    memory_get(input.factId),
    memory_get(input.opposingFactId),
  ]);
  let fact = loadedFact;
  let opposingFact = loadedOpposingFact;
  if (!option) return governanceBlocked(optionId, `option not found: ${optionId}`);
  if (!fact || !opposingFact) return governanceBlocked(optionId, "both settlement facts must exist");
  if (!option.j_premise_ids.includes(fact.id)) {
    return governanceBlocked(optionId, `option ${optionId} is not linked to fact ${fact.id}`);
  }
  if (fact.predicate !== SETTLEMENT_PREDICATE || opposingFact.predicate !== SETTLEMENT_PREDICATE ||
    fact.args[0] !== opposingFact.args[0] || fact.args[1] === opposingFact.args[1]) {
    return governanceBlocked(optionId, "settlement requires two different hardness values for one entity");
  }
  if (fact.status === "in" && isM1Conflict(fact, opposingFact)) {
    await detectAndIsolateHardnessConflicts(fact.args[0]);
    [fact, opposingFact] = await Promise.all([
      memory_get(input.factId),
      memory_get(input.opposingFactId),
    ]);
    if (!fact || !opposingFact) return governanceBlocked(optionId, "settlement facts disappeared during M1 isolation");
  }
  if (!["contested", "in", "archived"].includes(opposingFact.status)) {
    return governanceBlocked(optionId, `opposing fact is not available for settlement: ${opposingFact.status}`);
  }

  const comparison = compareSettlementSources(fact.linSource, opposingFact.linSource);
  const expected = action === "settle" ? "left" : "right";
  if (comparison !== expected) {
    return governanceBlocked(
      optionId,
      comparison === "manual_review"
        ? `manual_review required for sources ${fact.linSource} and ${opposingFact.linSource}`
        : `${action} rejected by source priority: ${fact.linSource} versus ${opposingFact.linSource}`,
    );
  }

  const status = action === "settle" ? "settled" : "revoked";
  const factStatus = action === "settle" ? "in" : "archived";
  const modelStatus = action === "settle" ? "settled" : "retracted";
  if (option.status !== status && option.status !== "probation") {
    return governanceBlocked(optionId, `cannot ${action} option in status ${option.status}`);
  }
  if (fact.status !== factStatus && fact.status !== "contested") {
    return governanceBlocked(optionId, `cannot ${action} fact in status ${fact.status}`);
  }

  const executor = input.executor?.trim() || arbiter;
  const rationale = input.rationale?.trim() ||
    `source priority: ${fact.linSource} versus ${opposingFact.linSource}`;
  const eventInput: SettlementEventInput = {
    action,
    optionId,
    factId: fact.id,
    opposingFactId: opposingFact.id,
    proposer,
    arbiter,
    executor,
    rationale,
    policyVersion,
  };
  const ids = settlementEventIds(eventInput);
  const [governanceExisting, revisionExisting, modelResult] = await Promise.all([
    client.getFactById(ids.governanceId),
    client.getFactById(ids.revisionId),
    client.getModelById(option.model_binding),
  ]);
  const model = modelResult.rows.length === 0 ? undefined : Object.fromEntries(
    modelResult.headers.map((header, index) => [header, modelResult.rows[0][index]]),
  ) as unknown as ModelRow;
  if (model && model.option_id !== optionId) {
    return governanceBlocked(optionId, `model ${model.model_id} is not bound to option ${optionId}`);
  }
  if (model && model.status !== modelStatus && model.status !== "probation") {
    return governanceBlocked(optionId, `cannot ${action} model in status ${model.status}`);
  }
  const modelReady = !model || (model.status === modelStatus && model.j_records.includes(ids.governanceId));
  const reused = option.status === status && fact.status === factStatus && modelReady &&
    governanceExisting.rows.length === 1 && revisionExisting.rows.length === 1;
  if (reused) {
    return {
      id: optionId,
      gate: "pass",
      status,
      factId: fact.id,
      factStatus,
      eventId: ids.governanceId,
      revisionId: ids.revisionId,
      ...(model ? { modelId: model.model_id, modelStatus } : {}),
      reused: true,
    };
  }

  if (option.status !== status) await client.putOption({ ...option, status });
  const events = makeSettlementEvents(eventInput);
  const rows = [];
  if (fact.status !== factStatus) rows.push(factToRow(fact.id, { ...fact, status: factStatus }));
  if (governanceExisting.rows.length === 0) rows.push(factToRow(ids.governanceId, events.governance));
  if (revisionExisting.rows.length === 0) rows.push(factToRow(ids.revisionId, events.revision));
  await client.putFacts(rows);
  if (model && !modelReady) {
    await client.putModel({
      ...model,
      status: modelStatus,
      j_records: [...new Set([...model.j_records, ids.governanceId])],
    });
  }
  return {
    id: optionId,
    gate: "pass",
    status,
    factId: fact.id,
    factStatus,
    eventId: ids.governanceId,
    revisionId: ids.revisionId,
    ...(model ? { modelId: model.model_id, modelStatus } : {}),
    reused: false,
  };
}

export async function settle(optionId: string, input: GovernanceActionInput): Promise<GovernanceActionResult> {
  return applySettlementAction("settle", optionId, input);
}

export async function revoke(optionId: string, input: GovernanceActionInput): Promise<GovernanceActionResult> {
  return applySettlementAction("revoke", optionId, input);
}
