/**
 * check_hnsw_smoke.ts —— Week 2 验收 #7：hnsw k=5 召回冒烟。
 *
 * 取 composition(S01,…) 的向量做 k=5 近邻查询，校验：
 *   ① 返回 5 行；② 含自身且 dist=0；③ 每行 id/predicate/args/dist 齐全。
 * （伪随机向量无语义，仅验证索引机制；Week 2 指令 3-A。）
 *
 * 前提：9070 实例在跑、facts 已回填 embedding（scripts/backfill_embedding.ts）。
 * 用法：node scripts/check_hnsw_smoke.ts
 * 退出码：0 = 三项校验全过；1 = 否则。
 */
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";

const GET_S01 = `?[id, embedding] := *facts{id, predicate, args, embedding}, predicate == "composition", first(args) == "S01"`;
const HNSW_K5 = `?[id, predicate, args, dist] := ~facts:embedding_hnsw{id, predicate, args | query: vec($v), k: 5, ef: 20, bind_distance: dist}`;

(async () => {
  const client = new MnesticClient({ endpoint: ENDPOINT, timeoutMs: 30_000 });
  const s01 = await client.execute(GET_S01);
  if (s01.rows.length === 0) {
    console.log("FAIL: 未找到 composition(S01,…)");
    process.exitCode = 1;
    return;
  }
  const [selfId, vec] = s01.rows[0] as [string, number[]];
  console.log(`endpoint: ${ENDPOINT}`);
  console.log(`S01 composition fact: ${selfId}（向量维度 ${vec.length}）`);

  const h = await client.execute(HNSW_K5, { v: vec });
  console.log(`\nhnsw k=5 返回 ${h.rows.length} 行：`);
  for (const r of h.rows) {
    console.log(`  ${JSON.stringify(r)}`);
  }

  const selfRow = h.rows.find((r) => r[0] === selfId);
  const checks: Array<[string, boolean]> = [
    ["返回 5 行", h.rows.length === 5],
    ["含自身且 dist=0", selfRow !== undefined && Number(selfRow[3]) === 0],
    [
      "每行 id/predicate/args/dist 齐全",
      h.rows.every(
        (r) =>
          typeof r[0] === "string" &&
          typeof r[1] === "string" &&
          Array.isArray(r[2]) &&
          typeof r[3] === "number",
      ),
    ],
  ];
  let bad = 0;
  console.log();
  for (const [name, pass] of checks) {
    console.log(`${pass ? "✓" : "✗"} ${name}`);
    if (!pass) bad++;
  }
  console.log(`\n${bad === 0 ? "PASS" : "FAIL"}`);
  process.exitCode = bad === 0 ? 0 : 1;
})().catch((e) => {
  console.error("ERR", e);
  process.exitCode = 1;
});
