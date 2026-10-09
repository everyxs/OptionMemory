/**
 * backfill_embedding.ts —— Day 4：为全部 facts 回填固定种子伪随机 embedding（1024 维）。
 *
 * 目的：本周无真实嵌入模型，仅以占位向量验证 HNSW 索引机制（Week 2 指令 3-A）。
 *   - 种子固定 42（mulberry32），同一数据库状态下重跑向量逐字一致（可复现）；
 *   - eps_source 置 "placeholder-random-seed42"（Week 2 坑表 / 验收 C6 口径），
 *     Phase 4 真实嵌入接入时按该标记批量重算。
 *
 * 写入性质（声明）：维护性回填 —— 全列原样保留（id / created_at / updated_at /
 *   谱系各列均不动），仅写 embedding 与 eps_source 两列；非知识写入路径。
 *   CozoScript 仍由 MnesticClient 集中组装（putFacts 单事务分批），无任何字符串拼接。
 *
 * 前提：9070 实例在跑、已建表（含 embedding_hnsw 索引）且 facts 非空，dist/ 已构建。
 * 用法：node scripts/backfill_embedding.ts
 *   （Env: MNESTIC_ENDPOINT，默认 http://127.0.0.1:9070/text-query）
 * 退出码：0 = 全部回填且计数验收过；1 = 否则。
 */
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const SEED = 42;
const DIM = 1024;
const BATCH_SIZE = 25; // HNSW 索引逐向量维护，批大易超时
const TIMEOUT_MS = 120_000;
const MARKER = "placeholder-random-seed42";

const ALL_FACT_ROWS = `?[id, predicate, args, claim, layer, j_premise_ids, j_rule_id, eps_type, eps_value, eps_source, lin_source, lin_version, lin_theta, lin_actor, verify, status, embedding, created_at, updated_at] := *facts{id, predicate, args, claim, layer, j_premise_ids, j_rule_id, eps_type, eps_value, eps_source, lin_source, lin_version, lin_theta, lin_actor, verify, status, embedding, created_at, updated_at} :sort id`;
const COUNT_TOTAL = `?[count(id)] := *facts{id}`;
const COUNT_EMBEDDED = `?[count(id)] := *facts{id, embedding}, embedding != null`;
const COUNT_MARKER = `?[count(id)] := *facts{id, eps_source}, eps_source == "${MARKER}"`;

/** mulberry32：确定性 PRNG（同一 seed 序列逐字一致）。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 列顺序与 schema/01_facts.cozo 一致（putFacts 按 FACT_COLUMNS 取值）。 */
const COLUMNS = [
  "id", "predicate", "args", "claim", "layer", "j_premise_ids", "j_rule_id",
  "eps_type", "eps_value", "eps_source", "lin_source", "lin_version",
  "lin_theta", "lin_actor", "verify", "status", "embedding",
  "created_at", "updated_at",
] as const;

(async () => {
  const client = new MnesticClient({ endpoint: ENDPOINT, timeoutMs: TIMEOUT_MS });
  console.log(`endpoint: ${ENDPOINT}`);

  const res = await client.execute(ALL_FACT_ROWS);
  const total = res.rows.length;
  console.log(`facts 行数: ${total}；种子: ${SEED}；维度: ${DIM}`);

  const rng = mulberry32(SEED);
  let written = 0;
  let already = 0;
  for (let b = 0; b < total; b += BATCH_SIZE) {
    // 向量对全量行依序生成（保证种子序列与断点无关，重跑逐字一致）；
    // 仅对尚无 embedding 的行执行写入（断点续跑加速）。
    const chunk = res.rows.slice(b, b + BATCH_SIZE).map((row) => {
      const rec: Record<string, unknown> = {};
      COLUMNS.forEach((c, i) => (rec[c] = row[i]));
      rec._had = row[COLUMNS.indexOf("embedding")] != null;
      rec.embedding = Array.from({ length: DIM }, () => rng() * 2 - 1); // [-1, 1)
      rec.eps_source = MARKER;
      return rec;
    });
    const todo = chunk.filter((r) => !r._had);
    already += chunk.length - todo.length;
    if (todo.length > 0) {
      for (const r of todo) delete r._had;
      await client.putFacts(todo);
      written += todo.length;
    }
    const done = written + already;
    if (done % 500 === 0 || done === total) {
      console.log(`  … ${done}/${total}（写 ${written} / 已有 ${already}）`);
    }
  }

  console.log(`\n== 验收 ==`);
  const nTotal = Number((await client.execute(COUNT_TOTAL)).rows[0][0]);
  const nEmbedded = Number((await client.execute(COUNT_EMBEDDED)).rows[0][0]);
  const nMarker = Number((await client.execute(COUNT_MARKER)).rows[0][0]);
  console.log(`facts 总数: ${nTotal}`);
  console.log(`embedding 非空: ${nEmbedded}（应 = 总数）`);
  console.log(`eps_source="${MARKER}": ${nMarker}（应 = 总数）`);
  const ok = nEmbedded === nTotal && nMarker === nTotal;
  console.log(`\n${ok ? "PASS" : "FAIL"}`);
  process.exitCode = ok ? 0 : 1;
})().catch((e) => {
  console.error("ERR", e);
  process.exitCode = 1;
});
