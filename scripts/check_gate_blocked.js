#!/usr/bin/env node
/**
 * 手工验证：缺 lin_source 的 fact 应被 ν 门拦截（blocked）且不落库。
 *
 * 前提：mnestic 实例在跑且已建表，dist/ 已构建：
 *   scripts/mnestic_start.sh   （启动 9070 实例）
 *   schema/apply_all.sh        （建表；mem 引擎重启后需重跑）
 *   pnpm build                 （产出 dist/）
 *
 * 用法：node scripts/check_gate_blocked.js   （任意目录下均可）
 *   （Env: MNESTIC_ENDPOINT，默认 http://127.0.0.1:9070/text-query）
 * 退出码：0 = 四项断言全过；1 = 任一失败或出错。
 */
const {
  memory_set,
  memory_get,
  setMemoryClient,
} = require("../dist/api/memory.js");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";

const fact = {
  predicate: "likes",
  claim: "alice likes bob",
  layer: "semantic",
  jPremiseIds: [],
  epsType: "prior",
  epsValue: 0.5,
  epsSource: "manual",
  // linSource 缺失 —— 应被 ν 门 checkCompleteness 拦截
  linVersion: "0.1.0",
  linActor: "manual",
  verify: "manual",
};

(async () => {
  setMemoryClient(new MnesticClient({ endpoint: ENDPOINT }));

  const res = await memory_set(fact);
  console.log("memory_set =>", JSON.stringify(res));

  const got = await memory_get(res.id);
  console.log("memory_get =>", JSON.stringify(got));

  // 与 curl 等价的库级直查（同一 POST /text-query 端点）：
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      script: `?[id] := *facts{id}, id == "${res.id}"`,
    }),
  });
  const db = await r.json();
  console.log("db 直查   =>", JSON.stringify(db));

  const checks = [
    ["gate 为 blocked", res.gate === "blocked"],
    ["reason 指出 linSource", /linSource/.test(res.reason ?? "")],
    ["memory_get 为 null", got === null],
    ["库中无此行", Array.isArray(db.rows) && db.rows.length === 0],
  ];
  let ok = true;
  for (const [name, pass] of checks) {
    console.log(`${pass ? "✓" : "✗"} ${name}`);
    ok = ok && pass;
  }
  console.log(ok ? "PASS：ν 门拦截且未落库" : "FAIL：断言未全过");
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
