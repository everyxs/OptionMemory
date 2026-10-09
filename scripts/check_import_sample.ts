/**
 * check_import_sample.ts —— 手册 §3.3 验收 #2：随机抽 3 个 alloy_id，
 * 用 memory_get 核对成分字符串与 CSV 原行一致（每次运行随机抽取）。
 *
 * 前提：9070 实例在跑且已导入（scripts/import_hea_lens.ts），dist/ 已构建。
 * 用法：node scripts/check_import_sample.ts [csv路径]
 * 退出码：0 = 3 条全部一致；1 = 任一缺失/不一致；2 = 用法/文件错误。
 *
 * 转换规则复用 scripts/hea_lens_lib.ts（与导入脚本同一来源）。
 * 核查路径：按 (predicate, args[0]) 查出 composition fact id → memory_get 取全列比对。
 */
const { memory_get, setMemoryClient } =
  require("../dist/api/memory.js") as typeof import("../src/api/memory");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");
const { planAll, DEFAULT_CSV } =
  require("./hea_lens_lib.ts") as typeof import("./hea_lens_lib");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const SAMPLE_SIZE = 3;

const FIND_COMPOSITION = `?[id] := *facts{id, predicate, args}, predicate == "composition", first(args) == $heal`;

(async () => {
  const csvPath = process.argv[2] ?? DEFAULT_CSV;
  const plan = planAll(csvPath);
  const client = new MnesticClient({ endpoint: ENDPOINT });
  setMemoryClient(client);

  // 无放回随机抽 SAMPLE_SIZE 个
  const pool = [...plan.planned];
  const picks: typeof plan.planned = [];
  for (let i = 0; i < Math.min(SAMPLE_SIZE, pool.length); i++) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }

  console.log(`endpoint: ${ENDPOINT}`);
  console.log(`随机抽 ${picks.length} 个 alloy_id（本次样本）：`);
  let bad = 0;
  for (const [i, p] of picks.entries()) {
    const wantFact = p.facts.find((f) => f.predicate === "composition")!;
    const wantComp = wantFact.args![1];
    const wantClaim = wantFact.claim;
    console.log(`\n[样本 ${i + 1}] CSV 行 ${p.csvRowNo} → ${p.healId}`);

    const found = await client.execute(FIND_COMPOSITION, { heal: p.healId });
    if (found.rows.length === 0) {
      console.log(`  ✗ 库中无 composition(${p.healId}, …)`);
      bad++;
      continue;
    }
    const id = String(found.rows[0][0]);
    const fact = await memory_get(id);
    if (fact === null) {
      console.log(`  ✗ memory_get(${id}) 未命中`);
      bad++;
      continue;
    }
    const okComp = fact.args[1] === wantComp;
    const okClaim = fact.claim === wantClaim;
    if (!okComp || !okClaim) bad++;
    console.log(`  memory_get id: ${id}`);
    console.log(`  库中成分: ${JSON.stringify(fact.args[1])}`);
    console.log(`  CSV 期望: ${JSON.stringify(wantComp)}`);
    console.log(`  ${okComp && okClaim ? "✓ 一致（成分串 + claim）" : "✗ 不一致"}`);
  }
  console.log(`\n${bad === 0 ? "PASS" : "FAIL"}`);
  process.exitCode = bad === 0 ? 0 : 1;
})().catch((e) => {
  console.error("ERR", e);
  process.exitCode = 1;
});
