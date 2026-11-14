/**
 * derive_descriptors.ts —— Phase 1 Step 4：对全部 HEAL 成分运行 R1/R3。
 *
 * R2 仅匹配 XRD，R4 保持阻塞。派生 facts 与 J 边经服务层幂等写入。
 * 用法：pnpm build && node scripts/derive_descriptors.ts
 */
const { deriveClosure } =
  require("../dist/runtime/deriveClosure.js") as typeof import("../src/runtime/deriveClosure");

(async () => {
  const started = performance.now();
  const result = await deriveClosure({ predicate: "composition" });
  const elapsedMs = performance.now() - started;
  console.log(JSON.stringify({ ...result, elapsedMs: Number(elapsedMs.toFixed(1)) }, null, 2));
  if (result.blocked.length > 0) {
    throw new Error(`ν 门拦截 ${result.blocked.length} 条派生事实`);
  }
  console.log("HEA_R1_R3_DERIVATION_PASS");
})().catch((error) => {
  console.error("ERR", error);
  process.exitCode = 1;
});
