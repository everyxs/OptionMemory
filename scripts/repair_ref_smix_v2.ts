/**
 * repair_ref_smix_v2.ts —— 按已批准的 R3 方案生成 ref_smix_v2 与质量记录。
 *
 * 原始 ref_smix / ref_delta 只读且保持不变。所有写入经 memory_set_batch + ν 门。
 * 前提：RocksDB 实例在跑、701 组 HEAL 数据已导入、dist/ 已构建。
 * 用法：pnpm build && node scripts/repair_ref_smix_v2.ts
 */
import type { FactInput } from "../src/memory/schema";
const { createHash } = require("node:crypto") as typeof import("node:crypto");
const { memory_set_batch, setMemoryClient } =
  require("../dist/api/memory.js") as typeof import("../src/api/memory");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");
const { writeJustifications } =
  require("../dist/runtime/justifications.js") as typeof import("../src/runtime/justifications");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const GAS_CONSTANT = 8.314;
const TOLERANCE = 1e-3;
const BATCH_SIZE = 100;
const LIN_SOURCE = "HEA-Lens-1540+scripts/repair_ref_smix_v2.ts";

interface SourceFact {
  id: string;
  value: string;
}

interface RepairRow {
  alloyId: string;
  compositionId: string;
  originalId: string;
  originalValue: string;
  correctedValue: string;
  error: number;
  quality: "original_match" | "corrected_pending_source_review";
}

function parseSmix(composition: string): number {
  let cursor = 0;
  let sum = 0;
  let total = 0;
  let count = 0;
  for (const match of composition.matchAll(/([A-Z][a-z]?)([0-9]+(?:\.[0-9]+)?)/g)) {
    if (match.index !== cursor) throw new Error(`无法解析成分串: ${composition}`);
    cursor = match.index + match[0].length;
    const atPercent = Number(match[2]);
    if (!(atPercent > 0)) throw new Error(`非正成分: ${composition}`);
    const x = atPercent / 100;
    sum += x * Math.log(x);
    total += atPercent;
    count++;
  }
  if (cursor !== composition.length || count === 0 || Math.abs(total - 100) > 1e-6) {
    throw new Error(`成分串或合计非法: ${composition}`);
  }
  return -GAS_CONSTANT * sum;
}

function baseFact(alloyId: string, predicate: string, args: string[]): FactInput {
  return {
    predicate,
    args,
    claim: `${predicate}(${args.join(", ")})`,
    layer: "knowledge",
    jPremiseIds: [],
    epsType: "in-degree",
    epsValue: 0.5,
    epsSource: "recomputed-from-public-composition",
    linSource: LIN_SOURCE,
    linVersion: "2.0",
    linActor: "reference_repair",
    verify: "formula-pinned+source-lineage",
    status: "in",
  };
}

async function queryFacts(
  client: InstanceType<typeof MnesticClient>,
  predicate: string,
): Promise<Map<string, SourceFact>> {
  const res = await client.execute(
    `?[id, args] := *facts{id, predicate, args, status}, predicate == $predicate, status == "in"`,
    { predicate },
  );
  return new Map(res.rows.map((row) => {
    const args = row[1] as string[];
    return [args[0], { id: String(row[0]), value: args[1] }] as const;
  }));
}

function signature(facts: Map<string, SourceFact>): string {
  const text = [...facts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([alloy, fact]) => `${alloy}|${fact.id}|${fact.value}`)
    .join("\n");
  return createHash("sha256").update(text).digest("hex");
}

async function writeBatches(facts: FactInput[], label: string): Promise<string[]> {
  const ids: string[] = [];
  let inserted = 0;
  let skipped = 0;
  for (let start = 0; start < facts.length; start += BATCH_SIZE) {
    const batch = facts.slice(start, start + BATCH_SIZE);
    const result = await memory_set_batch(batch);
    if (result.blocked.length > 0) {
      throw new Error(`${label} 存在 ν 门拦截: ${JSON.stringify(result.blocked)}`);
    }
    inserted += result.inserted;
    skipped += result.skipped;
    ids.push(...result.ids.map((id, index) => {
      if (id === null) throw new Error(`${label} 第 ${start + index} 行无返回 id`);
      return id;
    }));
    console.log(`${label}: ${Math.min(start + BATCH_SIZE, facts.length)}/${facts.length}`);
  }
  console.log(`${label}: inserted=${inserted} skipped=${skipped} blocked=0`);
  return ids;
}

(async () => {
  const client = new MnesticClient({ endpoint: ENDPOINT, timeoutMs: 60_000 });
  setMemoryClient(client);
  const [compositions, originals, originalDeltas] = await Promise.all([
    queryFacts(client, "composition"),
    queryFacts(client, "ref_smix"),
    queryFacts(client, "ref_delta"),
  ]);
  const originalSmixSignature = signature(originals);
  const originalDeltaSignature = signature(originalDeltas);

  const rows: RepairRow[] = [];
  for (const [alloyId, composition] of compositions) {
    if (!/^HEAL\d{4}$/.test(alloyId)) continue;
    const original = originals.get(alloyId);
    if (original === undefined) throw new Error(`${alloyId} 缺原始 ref_smix`);
    const correctedValue = String(parseSmix(composition.value));
    const error = Math.abs(Number(correctedValue) - Number(original.value));
    rows.push({
      alloyId,
      compositionId: composition.id,
      originalId: original.id,
      originalValue: original.value,
      correctedValue,
      error,
      quality: error <= TOLERANCE ? "original_match" : "corrected_pending_source_review",
    });
  }
  rows.sort((a, b) => a.alloyId.localeCompare(b.alloyId));
  if (rows.length !== 701) throw new Error(`R3 修复行数 ${rows.length}，预期 701`);

  const existingV2 = await queryFacts(client, "ref_smix_v2");
  for (const row of rows) {
    const existing = existingV2.get(row.alloyId);
    if (existing !== undefined && existing.value !== row.correctedValue) {
      throw new Error(`${row.alloyId} 已存在不同 ref_smix_v2，拒绝制造冲突版本`);
    }
  }

  const correctedFacts = rows.map((row) => ({
    ...baseFact(row.alloyId, "ref_smix_v2", [row.alloyId, row.correctedValue]),
    jPremiseIds: [row.compositionId],
    jRuleId: "R3",
  }));
  const correctedIds = await writeBatches(correctedFacts, "ref_smix_v2");

  const qualityFacts = rows.map((row, index) => ({
    ...baseFact(row.alloyId, "reference_quality", [
      row.alloyId,
      "ref_smix",
      row.quality,
      row.originalValue,
      row.correctedValue,
      String(row.error),
    ]),
    jPremiseIds: [row.compositionId, row.originalId, correctedIds[index]],
    jRuleId: "R3",
    epsSource: "reference-comparison",
  }));
  const qualityIds = await writeBatches(qualityFacts, "reference_quality");

  const justificationWrite = await writeJustifications([
    ...rows.map((row, index) => ({
      derivedId: correctedIds[index],
      premiseIds: [row.compositionId],
      ruleId: "R3",
    })),
    ...rows.map((row, index) => ({
      derivedId: qualityIds[index],
      premiseIds: [row.compositionId, row.originalId, correctedIds[index]],
      ruleId: "R3",
    })),
  ]);
  console.log(`justifications: inserted=${justificationWrite.inserted} skipped=${justificationWrite.skipped}`);

  const [afterV2, afterQuality, afterOriginals, afterDeltas] = await Promise.all([
    queryFacts(client, "ref_smix_v2"),
    queryFacts(client, "reference_quality"),
    queryFacts(client, "ref_smix"),
    queryFacts(client, "ref_delta"),
  ]);
  if (afterV2.size !== 701 || afterQuality.size !== 701) {
    throw new Error(`写入后计数异常: ref_smix_v2=${afterV2.size} reference_quality=${afterQuality.size}`);
  }
  if (signature(afterOriginals) !== originalSmixSignature) {
    throw new Error("原始 ref_smix 发生变化");
  }
  if (signature(afterDeltas) !== originalDeltaSignature) {
    throw new Error("原始 ref_delta 发生变化");
  }

  const corrected = rows.filter((row) => row.quality === "corrected_pending_source_review").length;
  console.log(`\nR3_REPAIR_PASS`);
  console.log(`ref_smix_v2=${afterV2.size}; original_match=${rows.length - corrected}; corrected_pending_source_review=${corrected}`);
  console.log(`reference_quality=${afterQuality.size}; original ref_smix/ref_delta 签名未变化`);
})().catch((error) => {
  console.error("ERR", error);
  process.exitCode = 1;
});
