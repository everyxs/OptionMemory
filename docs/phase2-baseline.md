# Phase 2 基线与 Repo 验收记录

- 日期：2026-11-06
- 范围：Phase 2 Step 1–5（修订传播、R3-RefRepair-01、Option 启动前提失效/恢复）
- 状态：**Step 1–5 技术验收通过，待 Phase 2 关闭签署**
- 生产边界：生产 RocksDB 仅用于只读提取；全部撤回、恢复和重推均在独立 Mem 实例完成。

## 1. 交付物

| 能力 | 交付物 |
|---|---|
| 撤回与 ν 门 | `src/api/revision.ts`、`src/runtime/nuGate.ts`、`src/memory/events.ts`、`tests/revision.test.ts` |
| 依赖锥与恢复 | `findAffectedFacts`、`hasAlternativeJustification`、`restoreFact`、`tests/dependency.test.ts` |
| S01 成分更正 | `scripts/revise_s01_composition.ts`、`tests/s01_revision.test.ts` |
| R3 场景 | `src/runtime/r3RefRepair.ts`、`scripts/check_r3_ref_repair.ts`、`tests/r3_ref_repair.test.ts`、`tests/fixtures/r3_ref_repair_01/fixture.json`、`optionbench-m/scenarios/R3-RefRepair-01.json` |
| Option 失效级联 | `src/api/optionRevision.ts`、`scripts/revise_option_prerequisite.ts`、`tests/option_revision.test.ts` |
| Procedural Knowledge | `src/memory/assets.ts` 与 `src/memory/mnesticClient.ts` 的类型、注册、查询和写入路径 |

## 2. Step 1–4 验收摘要

- Step 1：`memory_retract` 的 in→out、revision 同事务、重复撤回幂等、enforce/audit 与事件 schema v0.1 通过。
- Step 2：直接/间接依赖、循环防护、有效辩护、级联失效和恢复通过；恢复只在有效辩护存在时发生。
- Step 3：旧 composition/candidate=out，新 composition/candidate=in，J premise 分别指向正确版本，重复执行不重复记账。
- Step 4：R3 场景 A–E 全过；原值 `7.657460139198816`、v2 `9.083603018197538` 和 `corrected_pending_source_review` 可回查；禁止覆盖和武断声明探针有效；604/97 分组隔离，R4 未放行。
- Step 1–4 的测试数为 43 项；新增 Step 5 后为 **45 项，全部通过**。

## 3. Step 5：Option 启动前提失效与恢复

场景：`Phase2-OptionPrerequisite-01`。

| 检查项 | 结果 |
|---|---|
| XRD 前提撤回 | fact 与下游 phase_structure 均标 out |
| affected 集合 | 包含 XRD fact 与 phase_structure，共 2 项 |
| Option 状态 | `probation → out → probation` |
| Procedural Knowledge | `in → out → in`，历史记录未物理删除 |
| Model | 始终保留，状态 `probation` 未误改 |
| 重复撤回/恢复 | 不重复写 revision；Option 与 Procedural 各 2 条（一次 retract、一次 restore） |
| 非启动前提 | 返回 blocked，Option 保持原状态 |
| Phase 3 语义 | 未使用 contested、settle 或 revoke |
| 独立脚本 | `PHASE2_STEP5_PASS` |

独立场景耗时（单次本机记录）：撤回约 **53 ms**，恢复约 **47 ms**。该数值仅用于当前 Mem 场景记录，不作为生产性能承诺。

## 4. 数据与血缘验收

- HEAL0444 fixture 来自只读 RocksDB，包含真实 composition、R3 和 J 边；生产 fixture 来源未修改。
- 原始 `ref_smix` / `ref_delta` 保持原值；历史质量记录可查询，未被物理删除。
- 场景 A 的 v2 和质量记录 premise 正确；场景 C/D 的失效、替代辩护与恢复由 active J、规则状态和 premise 状态共同驱动。
- Option/Procedural 的 revision 含 `option_prerequisite` 规则与 XRD 根前提，重复操作不重复记账。
- `memory_retract` / `restoreFact` 的级联已限定在受影响依赖锥内，新增回归证明无关派生事实保持 in，避免跨场景误标 out。
- R4 未注册，`delta=0`，未生成伪造的 `delta>0.06` 验收计数。
- 604 条 `original_match` 与 97 条 `corrected_pending_source_review` 分开统计；v2 未作为独立外部正确性证据。

## 5. 构建与测试

```text
pnpm build：通过
pnpm test：12 个测试文件、51 项测试全部通过
独立 R3 脚本：R3_REF_REPAIR_PASS
独立 Option 脚本：PHASE2_STEP5_PASS
```

RocksDB 集成验收：

- 使用独立临时 RocksDB 目录，重启后 Option、Procedural Knowledge、phase_structure 与 revision 均保持。
- 模拟 Option 已标 out 但 Procedural/revision 未写入的部分状态，`reconcileOptionPrerequisite` 可按根前提补齐，重复对账不重复 revision。
- 同一 fixture 在 Mem 与 RocksDB 的 Option/Procedural/phase_structure/revision 结果一致。
- 测试使用独立 Option/Procedural ID，避免 revision 历史叠加；Vitest 已设 `fileParallelism: false`，避免全局 MemoryClient 跨文件竞争。
- Windows 下按 PID 清理测试启动的进程，避免旧实例占用端口并污染后续测试。

## 6. 质量红线核对

- [x] 无业务层拼接 CozoScript 的新路径；新增读写集中在 MnesticClient 和服务层。
- [x] 无物理删除或静默覆盖原始证据，revision/gate_audit 可回查。
- [x] 无有效辩护时不恢复，重复撤回/恢复不重复记账。
- [x] 未把 v2 自洽当外部验证，未把 97 条待复核记录用于抬高认证成功率。
- [x] `memory_retract` 契约继续复用；Option/Procedural 状态变化保留历史。
- [x] Step 1–4 未被冒充为整个 Phase 2 完成，Step 5 已单独实现和验证。
- [x] 生产 RocksDB 未执行测试性撤回/恢复，全部破坏性操作只发生于隔离实例。
- [x] R3-RefRepair-01 与 Phase 3 多来源冲突治理保持独立，R4 未隐式放行。

## 7. 保留事项与关闭状态

1. R4 原始生成公式、半径表和成分精度仍未解决，完整 R1–R4 验收不在本基线范围内。
2. 97 条待复核记录仍需来源审查，不能作为独立外部认证证据。
3. 当前 Step 1–5 技术验收通过；**Phase 2 正式关闭仍需按手册完成签署，之后方可进入 Phase 3。**
4. 后续 Phase 3 按新版手册推进：原冲突治理与双 host v0.1.0 基线不变，Planner-ready 与 continuous-host 增量独立验收，dataStore 不提前落地。
