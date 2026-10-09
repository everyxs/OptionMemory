/**
 * bench_phase0.ts —— Day 5：Phase 0 性能基线测量（701+ 条 facts 规模）。
 *
 * 测量（每项 3 轮取中位数；延迟为含本机 loopback HTTP 的端到端值）：
 *   1. 单条 memory_set 写入延迟（每轮 10 条顺序写，取轮内中位数，再三轮取中位）；
 *   2. memory_set_batch 吞吐（100 条/批 × 3 轮，条/秒）；
 *   3. 谓词过滤查询延迟（composition 全量扫描，702 行物化）；
 *   4. hnsw k=5 查询延迟（S01 composition 向量）；
 *   5. RocksDB 数据目录磁盘占用（由调用方 du 补充，本脚本不跨文件系统）。
 *
 * 测量写入用 predicate="bench_write" 的临时行，结束时全部 :rm 清理（保持 C6 等计数口径）。
 *
 * 前提：9070 实例在跑（rocks 模式）、facts 已导入并回填 embedding、dist/ 已构建。
 * 用法：node scripts/bench_phase0.ts
 * 退出码：0 = 测量与清理完成；1 = 出错。
 */
import type { FactInput } from "../src/memory/schema";
const { memory_set, memory_set_batch, setMemoryClient } =
  require("../dist/api/memory.js") as typeof import("../src/api/memory");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const ROUNDS = 3;
const SINGLE_PER_ROUND = 10;
const BATCH_SIZE = 100;

const SCAN_QUERY = `?[id, args] := *facts{id, predicate, args}, predicate == "composition"`;
const GET_S01 = `?[id, embedding] := *facts{id, predicate, args, embedding}, predicate == "composition", first(args) == "S01"`;
const HNSW_K5 = `?[id, predicate, args, dist] := ~facts:embedding_hnsw{id, predicate, args | query: vec($v), k: 5, ef: 20, bind_distance: dist}`;
const COUNT_ALL = `?[count(id)] := *facts{id}`;
const RM_BY_IDS = `?[id] <- $ids :rm facts {id}`;

function benchFact(tag: string): FactInput {
  return {
    predicate: "bench_write",
    args: ["BENCH", tag],
    claim: `bench_write(BENCH, ${tag})`,
    layer: "meta",
    jPremiseIds: [],
    epsType: "measurement",
    epsValue: 1.0,
    epsSource: "bench",
    linSource: "bench",
    linVersion: "1.0",
    linActor: "bench_phase0",
    verify: "bench",
  };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

(async () => {
  const client = new MnesticClient({ endpoint: ENDPOINT, timeoutMs: 60_000 });
  setMemoryClient(client);
  console.log(`endpoint: ${ENDPOINT}`);
  const before = Number((await client.execute(COUNT_ALL)).rows[0][0]);
  console.log(`facts 基线行数: ${before}\n`);

  const writtenIds: string[] = [];
  try {
    // 1. 单条写入延迟
    const roundMedians: number[] = [];
    const allLat: number[] = [];
    for (let r = 0; r < ROUNDS; r++) {
      const lat: number[] = [];
      for (let i = 0; i < SINGLE_PER_ROUND; i++) {
        const t0 = performance.now();
        const res = await memory_set(benchFact(`r${r}w${i}`));
        lat.push(performance.now() - t0);
        writtenIds.push(res.id);
      }
      roundMedians.push(median(lat));
      allLat.push(...lat);
    }
    console.log(`1) 单条 memory_set 延迟: 中位 ${median(roundMedians).toFixed(1)} ms` +
      `（全样本 p50 ${median(allLat).toFixed(1)} / max ${Math.max(...allLat).toFixed(1)}）`);

    // 2. batch 吞吐（100 条/批 × 3 轮）
    const tpsList: number[] = [];
    for (let r = 0; r < ROUNDS; r++) {
      const facts = Array.from({ length: BATCH_SIZE }, (_, i) =>
        benchFact(`b${r}x${i}`),
      );
      const t0 = performance.now();
      const res = await memory_set_batch(facts);
      const ms = performance.now() - t0;
      writtenIds.push(...res.ids.filter((x): x is string => x !== null));
      const tps = (res.inserted / ms) * 1000;
      tpsList.push(tps);
      console.log(`   批 ${r + 1}: inserted=${res.inserted} 用时 ${ms.toFixed(0)} ms → ${tps.toFixed(0)} 条/s`);
    }
    console.log(`2) memory_set_batch 吞吐: 中位 ${median(tpsList).toFixed(0)} 条/s`);

    // 3. 谓词过滤查询（composition 全量扫描）
    const scanLat: number[] = [];
    let scanned = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const t0 = performance.now();
      const res = await client.execute(SCAN_QUERY);
      scanLat.push(performance.now() - t0);
      scanned = res.rows.length;
    }
    console.log(`3) composition 全量扫描（${scanned} 行物化）: 中位 ${median(scanLat).toFixed(1)} ms`);

    // 4. hnsw k=5
    const s01 = await client.execute(GET_S01);
    const vec = s01.rows[0][1] as number[];
    const hnswLat: number[] = [];
    for (let r = 0; r < ROUNDS; r++) {
      const t0 = performance.now();
      await client.execute(HNSW_K5, { v: vec });
      hnswLat.push(performance.now() - t0);
    }
    console.log(`4) hnsw k=5（S01 向量）: 中位 ${median(hnswLat).toFixed(1)} ms`);
  } finally {
    // 清理全部测量行
    if (writtenIds.length > 0) {
      await client.execute(RM_BY_IDS, { ids: writtenIds.map((id) => [id]) });
    }
    const after = Number((await client.execute(COUNT_ALL)).rows[0][0]);
    console.log(`\n清理: 删除 ${writtenIds.length} 行测量数据；facts 行数 ${before} → ${after}`);
    if (after !== before) {
      console.error("FAIL: 清理后行数与基线不一致");
      process.exitCode = 1;
    }
  }
})().catch((e) => {
  console.error("ERR", e);
  process.exitCode = 1;
});
