/**
 * import_hea_lens.ts —— Day 2：HEA-Lens-1540 CSV → facts 批量导入
 * （经 memory_set_batch / ν 门，单事务分批，幂等）。
 *
 * 前提：mnestic 实例在跑且已建表，dist/ 已构建：
 *   scripts/mnestic_start.sh   （启动 9070 实例）
 *   schema/apply_all.sh        （建表；mem 引擎重启后需重跑；rocks 模式免）
 *   pnpm build                 （产出 dist/）
 *
 * 用法：
 *   node scripts/import_hea_lens.ts [--dry-run] [csv路径]
 *   （Env: MNESTIC_ENDPOINT，默认 http://127.0.0.1:9070/text-query）
 * 退出码：0 = 无 blocked / 坏单元格且计数验收过；1 = 否则；2 = 用法/文件错误。
 *
 * 转换规则集中在 scripts/hea_lens_lib.ts（口径注释见其文件头与 §2.1/§8）；
 * 幂等：memory_set_batch 内置 (predicate, args) 全参查重，重跑 inserted=0。
 */
const { memory_set_batch, setMemoryClient } =
  require("../dist/api/memory.js") as typeof import("../src/api/memory");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");
const { planAll, DEFAULT_CSV } =
  require("./hea_lens_lib.ts") as typeof import("./hea_lens_lib");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const BATCH_SIZE = 100;

const COUNT_COMPOSITION = `?[count(id)] := *facts{id, predicate: "composition"}`;
const COUNT_BY_PRED = `?[predicate, count(id)] := *facts{predicate, id, layer}, layer == "knowledge"`;

(async () => {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const csvPath = argv.find((a) => a !== "--dry-run") ?? DEFAULT_CSV;

  const plan = planAll(csvPath);
  console.log(`文件: ${csvPath}`);
  console.log(
    `可导入行: ${plan.planned.length}；跳过行: ${plan.skippedRows}；计划 facts: ` +
      Object.entries(plan.expected)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") +
      `（合计 ${plan.allFacts.length}）`,
  );

  console.log("\n== 前 5 行转换样例 ==");
  for (const p of plan.planned.slice(0, 5)) {
    console.log(`CSV 行 ${p.csvRowNo} → ${p.healId}`);
    for (const f of p.facts) {
      console.log(`  ${f.predicate}(${f.args!.map((a) => JSON.stringify(a)).join(", ")})`);
    }
  }
  if (plan.badCells.length > 0) {
    console.log("\n== 坏单元格 ==");
    for (const b of plan.badCells.slice(0, 20)) console.log(`  ${b}`);
    if (plan.badCells.length > 20) console.log(`  … 共 ${plan.badCells.length} 条`);
  }
  if (dryRun) {
    console.log("\n--dry-run：未触库。");
    process.exitCode = plan.badCells.length > 0 ? 1 : 0;
    return;
  }

  // ---- 分批导入（memory_set_batch：逐条 ν 门 + 幂等 + 批内单事务）----
  const client = new MnesticClient({ endpoint: ENDPOINT });
  setMemoryClient(client);
  console.log(`\n== 导入（${BATCH_SIZE} 条/批）==`);
  let inserted = 0;
  let skippedDup = 0;
  const blockedAll: Array<{ index: number; reason: string }> = [];
  for (let b = 0; b < plan.allFacts.length; b += BATCH_SIZE) {
    const chunk = plan.allFacts.slice(b, b + BATCH_SIZE);
    const res = await memory_set_batch(chunk);
    inserted += res.inserted;
    skippedDup += res.skipped;
    for (const bl of res.blocked) {
      blockedAll.push({ index: b + bl.index, reason: bl.reason });
      console.log(`BLOCKED [${b + bl.index}] ${chunk[bl.index].predicate}(${chunk[bl.index].args![0]}): ${bl.reason}`);
    }
    console.log(
      `  … 批 ${Math.floor(b / BATCH_SIZE) + 1}/${Math.ceil(plan.allFacts.length / BATCH_SIZE)}` +
        `（累计 写 ${inserted} / 跳 ${skippedDup} / 拦 ${blockedAll.length}）`,
    );
  }

  // ---- 验收 ----
  console.log(`\n== 验收 ==`);
  console.log(`插入 ${inserted}，幂等跳过 ${skippedDup}，blocked ${blockedAll.length}`);
  const comp = Number((await client.execute(COUNT_COMPOSITION)).rows[0][0]);
  console.log(`composition 总数: ${comp}（应 ≥ 701，含 S01 则 ≥ 702）`);
  const byPred = await client.execute(COUNT_BY_PRED);
  const got: Record<string, number> = {};
  for (const r of byPred.rows) got[String(r[0])] = Number(r[1]);
  let countOk = true;
  console.log("layer=knowledge 分谓词计数:");
  for (const [k, v] of Object.entries(plan.expected)) {
    const ok = (got[k] ?? 0) >= v;
    countOk = countOk && ok;
    console.log(`  ${ok ? "✓" : "✗"} ${k}: ${got[k] ?? 0}（预期 ≥${v}）`);
  }
  // 抽查 3 个 alloy_id：成分串与计划值逐字一致（手册 §3.3 验收 #2 的确定性版；
  // 随机抽查版见 scripts/check_import_sample.ts）
  console.log("成分抽查（首/中/尾 3 个 alloy_id）:");
  let spotOk = true;
  for (const p of [
    plan.planned[0],
    plan.planned[Math.floor(plan.planned.length / 2)],
    plan.planned[plan.planned.length - 1],
  ]) {
    const want = p.facts.find((f) => f.predicate === "composition")!.args![1];
    const q = await client.execute(
      `?[args] := *facts{predicate: "composition", args}, first(args) == $heal`,
      { heal: p.healId },
    );
    const gotArgs = (q.rows[0]?.[0] as string[]) ?? [];
    const ok = gotArgs[1] === want;
    spotOk = spotOk && ok;
    console.log(`  ${ok ? "✓" : "✗"} ${p.healId}: ${ok ? "与 CSV 原行一致" : `不符（库 ${gotArgs[1]} vs 计划 ${want}）`}`);
  }

  const ok =
    blockedAll.length === 0 &&
    plan.badCells.length === 0 &&
    countOk &&
    spotOk &&
    comp >= 701;
  console.log(`\n${ok ? "PASS" : "FAIL"}`);
  process.exitCode = ok ? 0 : 1;
})().catch((e) => {
  console.error("ERR", e);
  process.exitCode = 1;
});
