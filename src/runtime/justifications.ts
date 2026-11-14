import { randomUUID } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type { JustificationRow } from "../memory/assets";

export interface JustificationCandidate {
  derivedId: string;
  premiseIds: string[];
  ruleId: string;
}

export interface JustificationWriteResult {
  inserted: number;
  skipped: number;
}

function keyOf(row: Pick<JustificationRow, "derived_id" | "rule_id" | "premise_ids">): string {
  return JSON.stringify([row.derived_id, row.rule_id, row.premise_ids]);
}

export async function writeJustifications(
  candidates: JustificationCandidate[],
): Promise<JustificationWriteResult> {
  const client = getMemoryClient();
  const existing = await client.listJustifications();
  const keys = new Set(existing.map(keyOf));
  const now = Date.now() / 1000;
  const rows: JustificationRow[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const row: JustificationRow = {
      id: `just_${randomUUID()}`,
      derived_id: candidate.derivedId,
      premise_ids: candidate.premiseIds,
      rule_id: candidate.ruleId,
      active: true,
      derivation_ts: now,
    };
    const key = keyOf(row);
    if (keys.has(key)) {
      skipped++;
      continue;
    }
    keys.add(key);
    rows.push(row);
  }

  await client.putJustifications(rows);
  return { inserted: rows.length, skipped };
}
