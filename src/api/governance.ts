import { getMemoryClient } from "../memory/client";
import type { Fact } from "../memory/schema";
import { factToRow, memory_get } from "./memory";
import { findAffectedFacts } from "./revision";
import { conflictKey, isM1Conflict, makeConflictEvent, M1_PREDICATE } from "../runtime/conflict";

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
