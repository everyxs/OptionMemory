/**
 * seed_s01.ts —— 通过 memory_set_batch（必经 ν 门）录入 S01 基本事实，并执行验收查询。
 *
 * 前提：mnestic 实例在跑且已建表，dist/ 已构建：
 *   scripts/mnestic_start.sh   （启动 9070 实例）
 *   schema/apply_all.sh        （建表；mem 引擎重启后需重跑）
 *   pnpm build                 （产出 dist/）
 *
 * 用法：node scripts/seed_s01.ts   （任意目录下均可）
 *   （Env: MNESTIC_ENDPOINT，默认 http://127.0.0.1:9070/text-query）
 * 退出码：0 = 四条全部在库（新写或幂等跳过）+ 验收查询命中；1 = 任一 blocked / 出错。
 *
 * 幂等：memory_set_batch 内置 (predicate, args) 全参查重，重复执行不产生重复行。
 * 说明：
 * - 写入只经 memory_set_batch（ν 门），不直连 mnestic；验收查询为只读，走 MnesticClient。
 * - 任务给定字段逐字使用（predicate / args / lin_source，及指定的 eps_type /
 *   eps_source / lin_version）；ν 门必填但任务未给定的字段用占位值，见 FACTS 注释。
 */
import type { FactInput } from "../src/memory/schema";
const { memory_set_batch, setMemoryClient } =
  require("../dist/api/memory.js") as typeof import("../src/api/memory");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";

/**
 * 占位字段约定（任务未给定，据设计文档确认前以此为准）：
 *   layer 统一 "semantic"；jPremiseIds []；linActor "seed_s01"；verify "seed"；
 *   epsType 未给定者 "measurement"；epsSource 未给定者 "direct"；
 *   epsValue：literature 取 0.5，实测/记录取 0.9；linVersion 未给定者 "1.0"；
 *   status 缺省走服务层默认 "in"（ADR-0002）。
 */
const FACTS: ReadonlyArray<{ label: string; fact: FactInput }> = [
  {
    label: "composition",
    fact: {
      predicate: "composition",
      args: ["S01", "Al0.2Co0.2Cr0.2Fe0.2Ni0.2"],
      claim: "composition(S01, Al0.2Co0.2Cr0.2Fe0.2Ni0.2)",
      layer: "semantic",
      jPremiseIds: [],
      epsType: "in-degree", // 逐字
      epsValue: 0.5,
      epsSource: "inferred-prior", // 逐字
      linSource: "literature", // 逐字
      linVersion: "1.0",
      linActor: "seed_s01",
      verify: "seed",
    },
  },
  {
    label: "process",
    fact: {
      predicate: "process",
      args: ["S01", "arc_melting_1600C"],
      claim: "process(S01, arc_melting_1600C)",
      layer: "semantic",
      jPremiseIds: [],
      epsType: "measurement",
      epsValue: 0.9,
      epsSource: "direct",
      linSource: "experiment_record", // 逐字
      linVersion: "1.0",
      linActor: "seed_s01",
      verify: "seed",
    },
  },
  {
    label: "xrd_peak",
    fact: {
      predicate: "xrd_peak",
      args: ["S01", "44.5°", "FCC(111)"], // 3 参数，逐字
      claim: "xrd_peak(S01, 44.5°, FCC(111))",
      layer: "semantic",
      jPremiseIds: [],
      epsType: "measurement",
      epsValue: 0.9,
      epsSource: "direct",
      linSource: "xrd_parser_v1.2", // 逐字
      linVersion: "v1.2", // 逐字
      linActor: "seed_s01",
      verify: "seed",
    },
  },
  {
    label: "hardness",
    fact: {
      predicate: "hardness",
      args: ["S01", "512 HV"],
      claim: "hardness(S01, 512 HV)",
      layer: "semantic",
      jPremiseIds: [],
      epsType: "measurement",
      epsValue: 0.9,
      epsSource: "direct",
      linSource: "tensile_test", // 逐字
      linVersion: "1.0",
      linActor: "seed_s01",
      verify: "seed",
    },
  },
];

/** 验收查询（任务给定；2 参数事实）。 */
const ACCEPTANCE_QUERY = `?[pred, val] := *facts{predicate: pred, args: ["S01", val]}`;
/** 若具名绑定不接受列表模式则退化：等价的 get() 取值写法。 */
const ACCEPTANCE_FALLBACK = `?[pred, val] := *facts{predicate: pred, args}, first(args) == "S01", length(args) == 2, val = get(args, 1)`;
/** S01 全量核验：含 3 参数的 xrd_peak（不匹配二元模式），应返回全部 4 条。 */
const ALL_S01_QUERY = `?[predicate, args] := *facts{predicate, args}, first(args) == "S01"`;
/** 行数核验（幂等证据：重复执行后应恒为 4）。 */
const COUNT_QUERY = `?[count(id)] := *facts{id}`;

function printRows(headers: string[], rows: unknown[][]): void {
  console.log(headers.join(" | "));
  for (const r of rows) {
    console.log(r.map((c) => JSON.stringify(c)).join(" | "));
  }
  console.log(`（${rows.length} 行）`);
}

(async () => {
  const client = new MnesticClient({ endpoint: ENDPOINT });
  setMemoryClient(client);

  console.log(`endpoint: ${ENDPOINT}`);
  console.log("== 录入（memory_set_batch，经 ν 门；幂等查重内置）==");
  const res = await memory_set_batch(FACTS.map((f) => f.fact));
  const blockedIdx = new Map(res.blocked.map((b) => [b.index, b.reason]));
  for (const [i, { label }] of FACTS.entries()) {
    const reason = blockedIdx.get(i);
    if (reason !== undefined) {
      console.log(`[${i + 1}/${FACTS.length}] ${label}\n    gate=blocked  reason=${reason}`);
    } else {
      const state =
        res.inserted === 0 && res.skipped > 0 ? "skip（已存在）" : "gate=pass";
      console.log(`[${i + 1}/${FACTS.length}] ${label}\n    ${state}  id=${res.ids[i]}`);
    }
  }
  console.log(
    `（新写 ${res.inserted}，幂等跳过 ${res.skipped}，blocked ${res.blocked.length}）`,
  );

  console.log(`\n== 验收查询（任务给定，2 参数事实）==\n${ACCEPTANCE_QUERY}`);
  let acc: { headers: string[]; rows: unknown[][] };
  try {
    acc = await client.execute(ACCEPTANCE_QUERY);
  } catch (e) {
    console.log(`（列表模式不被接受：${(e as Error).message}）`);
    console.log(`改用等价写法：${ACCEPTANCE_FALLBACK}`);
    acc = await client.execute(ACCEPTANCE_FALLBACK);
  }
  printRows(acc.headers, acc.rows);

  console.log(`\n== S01 全量核验（含 3 参数 xrd_peak，应返回全部 4 条）==\n${ALL_S01_QUERY}`);
  const all = await client.execute(ALL_S01_QUERY);
  printRows(all.headers, all.rows);

  const cnt = await client.execute(COUNT_QUERY);
  console.log(`\nfacts 总行数: ${cnt.rows[0][0]}`);

  const ok =
    res.blocked.length === 0 && acc.rows.length >= 3 && all.rows.length >= 4;
  console.log(`\n${ok ? "PASS" : "FAIL"}`);
  // 不用 process.exit()：全局 fetch 的 keep-alive 句柄未关时，
  // Windows 上会触发 libuv UV_HANDLE_CLOSING 断言；置 exitCode 让事件循环自然排空。
  process.exitCode = ok ? 0 : 1;
})().catch((e) => {
  console.error("ERR", e);
  process.exitCode = 1;
});
