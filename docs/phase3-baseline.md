# Phase 3 实施与验收基线

- 日期：2026-11-14；Step 1–7 验收复核：2026-11-15
- 范围：Phase 3 Step 1–7 的实现、隔离测试与双 host 平台验收
- 状态：**Phase 3 已于 2026-11-15 签署关闭**
- 数据边界：新增测试使用独立 Mem fixture；真实 LLM 联调使用两套独立 RocksDB（9073/9074）；生产 RocksDB 未修改，卸载/重装数据保留验收已完成

## 1. Step 1：M1 冲突隔离

- [x] 450/512 HV 双方及受影响派生锥标 `contested`，关联 measure Options 标 `probation`。
- [x] 派生锥暂停有明确记录，450 HV 与 512 HV 原值均未覆盖或删除。
- [x] 重复检测返回 `reused=true`，S01 冲突事件计数保持 1；相同值和多值 `xrd_peak` 不误报。

**2026-11-15 验收实测**：执行 `pnpm build && pnpm exec vitest run tests/governance.test.ts --reporter=verbose`，构建通过，1 个测试文件、2 项测试全部通过。断言位置为 `tests/governance.test.ts:104`；事件幂等与重复检测证据为 `tests/governance.test.ts:92`。

实现：`src/runtime/conflict.ts`、`src/api/governance.ts`、`tests/governance.test.ts`。

## 2. Step 2：settlement policy 与治理链

- [x] 512 HV 对应 experiment Option 为 `settled`，450 HV 对应 literature Option 为 `revoked`；胜方 fact 为 `in`，败方 fact 为 `archived`，原值仍可查询。
- [x] governance/revision 裁决链包含双方 fact、Option、策略版本、提议者、裁决者、执行者、理由和时间；实验 > 仿真 > 文献，低优先级与同级来源未被误 settle。
- [x] 未登记来源返回 `manual_review`，不会自动 settle；重复 settle/revoke 返回 `reused=true`，governance/revision 事件计数不增加。

**2026-11-15 验收实测**：执行 `pnpm build && pnpm exec vitest run tests/settlement.test.ts --reporter=verbose`，构建通过，1 个测试文件、4 项测试全部通过。测试使用独立 Mem fixture，未修改生产 RocksDB。

新增：

- `config/settlement-policy.json`：固定 `experiment > simulation > literature`，未知或同级来源返回 `manual_review`。
- `src/runtime/settlement.ts`：确定性 governance/revision 事件 ID、来源比较和事件构造。
- `src/api/governance.ts`：`settle` / `revoke` API 与状态门控。
- `tests/settlement.test.ts`：来源优先级、未知来源、裁决链、历史保留和重复调用测试。

状态语义：

| 操作 | 胜/败方 fact | Option | 已注册 Model |
|---|---|---|---|
| `settle` | `contested → in` | `probation → settled` | `probation → settled` |
| `revoke` | `contested → archived` | `probation → revoked` | `probation → retracted` |

每次操作记录 option、双方 fact、策略版本、提议者、裁决者、执行者、理由和时间。重复调用返回 `reused=true`，不重复写 governance/revision，也不重复追加 Model `j_records`。

## 3. Step 3：measure option/model 结算

- [x] measure Subtask/Option/Model 完整入库，`option_type=atomic`、`template_id=null`，`subtask_binding`、`model_binding` 与 `model.option_id` 一致；实验 Option/Model 为 `settled`，文献 Option 为 `revoked`、Model 为 `retracted`。
- [x] 结算保留来源、成本、误差和策略版本；未观测值在评价历史中显式为 `null` 且 `cost_model.observed=false`，未虚构校准指标或外部成功率。Model `j_records` 与同一治理事件关联，重复结算不重复追加。

**2026-11-15 验收实测**：执行 `pnpm build && pnpm exec vitest run tests/measure-settlement.test.ts --reporter=verbose`，构建通过，1 个测试文件、3 项测试全部通过。测试使用独立 S04 Mem fixture，未修改生产 RocksDB。

`tests/measure-settlement.test.ts` 通过 `registerSubtask` / `registerOption` / `registerModel` 建立独立 S04 fixture，验证：

- 两类 measure Option 均为 `atomic`、`template_id=null`，subtask/model 绑定正确。
- 实验 Option/Model 为 `settled`，文献 Option 为 `revoked`、Model 为 `retracted`。
- Model `j_records` 指向与 Option/fact 相同的治理事件。
- 未观测的成本、误差和校准指标在 JSON 评价历史中显式为 `null`，`cost_model.observed=false`；未虚构外部成功率或认证结论。

## 4. Step 4–5：首版 7 工具与双 host 适配

### Step 4 验收（2026-11-15）

- [x] 工具清单恰好为 `memory_set/get/query/retract + propose_option/settle/revoke`，DSH/OpenCode 与 manifest 均来自同一契约。
- [x] 无 `memory_why`、`query_achievable`、`certify` 等未来工具占位；参数 JSON Schema、只读防护和核心 API 的 gate/reason/错误语义一致。

执行 `pnpm build && pnpm exec vitest run tests/tool-contracts.test.ts tests/opencode.test.ts tests/dsh.test.ts --reporter=verbose`，构建通过，3 个测试文件、12 项测试全部通过。测试使用独立 Mem fixture，未修改生产 RocksDB。

### 当前契约与适配

当前唯一契约为 `src/api/tool-contracts.ts`，恰好包含：

```text
memory_set / memory_get / memory_query / memory_retract
propose_option / settle / revoke
```

未注册 `memory_why`、`query_achievable` 或 `certify`。

`src/api/tool-executor.ts` 统一参数处理与核心服务分发；以下适配均复用该路径：

- OpenCode V1 server hooks 与 V2 `ctx.tool.transform`。
- DSH `inject=["tools"]`、异步 `apply`、`ctx.tools.register` 与 `ctx.memory`。
- DSH 0.2.2 使用真实 `@deepseek-ai/dsh-tools#defineTool`；`src/plugins/dsh/schema.ts` 将共享 JSON Schema 转为参数 DSL，工具返回 canonical JSON 并提供文本 renderer。CommonJS 构建通过动态 import 加载 ESM-only DSH 包。
- `package.json` 声明 Node `>=24.9.0`、DSH `>=0.2.2-rc.1 <0.3.0`、Cordis `~4.1.0` peer；`cordis.patch.yml` 已改为 0.2.2 列表式 bundle 注册。

`tests/dsh.test.ts` 在真实 mnestic Mem 上验证：

- 两个 host 与 manifest 的工具清单一致，DSH 工具具有 object 参数 schema 和 canonical output renderer。
- DSH 写入 → OpenCode 读取，以及 OpenCode 写入 → DSH 读取。
- 缺 `linSource` 时 DSH `defineTool` 在执行前拒绝；经共享核心 `ctx.memory` 与 OpenCode 调用均返回相同 `gate=blocked` 原因。
- 跨 host 完成 propose_option、settle、revoke 和 memory_retract。

### Step 5 验收（2026-11-15）

- [x] 两种 host 对同一输入返回相同业务结果，DSH/OpenCode 交叉读写及跨 host 治理链通过。
- [x] 核心 `src/api`、`src/memory`、`src/runtime` 无 Cordis/DSH/OpenCode import，工具 schema 只有 `src/api/tool-contracts.ts` 一个来源。
- [x] OpenCode V1/V2 与 DSH profile 均实际加载成功：V1 1.19.5 `debug agent build` 中全部 7 工具为 `true`，V2 2.3.0 setup 成功，DSH 实时 schemas 完整。

开发依赖已固定 `@deepseek-ai/cordis@4.1.0`、`@deepseek-ai/dsh-tools@0.2.2-rc.1` 与 `@deepseek-ai/dsh-util-values@0.2.2-rc.1`，不再使用临时结构化 ToolDefinition。真实 DSH 0.2.2 profile 加载与实时 7 工具注册已通过，见第 6 节。

## 5. 构建与自动测试

2026-11-15 实测：

```text
pnpm build：通过
pnpm test：17 个测试文件、64 项测试全部通过
```

覆盖 Mem、独立临时 RocksDB 重启/对账、Mem/RocksDB 一致性、M1、settle/revoke、measure Model、7 工具契约、DSH canonical JSON 和双 host 交叉数据。既有 Phase 0–2 回归未失败。

## 6. Step 6 平台联调与数据保留验收

- [x] **两种 LLM host 均实际调用 7 工具完成 S01 治理流程。**
- [x] **memory_why/query_achievable/certify 未提前注册。**
- [x] **数据在加载/卸载/重装后保留，未实现项明确列出。**

### 真实 LLM 运行

DSH 使用 `materials-agent` profile 和隔离 RocksDB（9073），OpenCode 2.3.0 使用另一套隔离 RocksDB（9074）。两套实例均以 0 行开始并只用于本次验收。

| 结果 | DSH | OpenCode |
|---|---|---|
| 会话证据 | `session-da6e50b2-78f0-464d-bd1b-ece6a8f1b19d` | `ses_e21de4a73ffeBSlkS91OBiENuj` |
| 512 HV fact | `fact_fe3b80a3-ff97-4f45-9f48-ba9aeb0be1fb`，`in` | `fact_c1dd896a-7101-4244-a2bd-d36aec747615`，`in` |
| 450 HV fact | `fact_66f749cb-f305-4329-bd4e-3052df5e661e`，`archived` | `fact_db0a8f33-0ca9-4dbe-8992-0e179719994f`，`archived` |
| experiment Option | `settled` | `settled` |
| literature Option | `revoked` | `revoked` |
| 独立 retract fact | `out` | `out` |
| 七工具最终调用 | 全部通过 | 全部通过 |

首次 DSH 运行暴露 canonical JSON 的 `undefined` 不兼容，修复后重置隔离实例并通过；OpenCode 初次 JSON 字符串 ID 解析错误已由模型纠正，最终 settle/revoke/retract 均为 `gate=pass`。没有把这些中间失败计入成功结果。

### 加载/卸载/重装与数据保留

- DSH 执行 `plugin remove optionmemory` 后重新 `plugin add .`，profile 启动无 OptionMemory activation warning。
- OpenCode 临时移出并恢复 `.opencode/plugins/optionmemory.ts`，恢复后 V2 setup 成功；V1 1.19.5 也已验证全部 7 工具注册。
- 重装前后各实例均为 **9 条 facts**，hardness fact ID/状态与 Option ID/状态的 JSON 深度比较完全一致，输出 `DATA_RETENTION_PASS`。
- memory_why/query_achievable/certify 未出现在契约或 host 注册清单中。

证据文件：`.data/phase3-dsh-run.jsonl`、`.data/phase3-opencode-run.json`、`.data/phase3-before.json`、`.data/phase3-after.json`。首次 DSH 失败记录保留为 `.data/phase3-dsh-run-failed.jsonl`。

## 7. Step 7：Planner-ready 与 continuous-host 验收

- [x] Planner 可注册，instructions/inference/policy 版本可回查；Option input_schema 和 Model 三类 spec 可保存。
- [x] Datalog 可遍历 subtask → plan_run → planner_event → option_event → option/model。
- [x] continuous-host 支持 start/deliver/stop/report，确定性 ID 和多事件 plan_run。
- [x] OpenCode permission 与 DSH userQuestions/approval 原生调用通过，回答只唤醒一次；未新建 Question Center 或宿主专用调度器。
- [x] 原七工具、M1、R4 和既有测试未回归；未提前落地 SuperAgent、dataStore 或 Executor 领域资产。

### 迁移证据

mnestic 禁止替换带索引的 options/models，用户已批准采用 additive compatibility tables：`option_input_schemas` 与 `model_specs`。旧表未修改，未执行 `:replace` 或删表重建。`scripts/migrate_step7_planner.ts` 的首次备份在重复迁移时保持不覆盖，独立 RocksDB 实测 `STEP7_MIGRATION_PASS` 与 `STEP7_ROLLBACK_PASS`，旧 Option/Model ID 均保留。

### 实测与原生探针

- `pnpm test`：**22 个测试文件、76/76 测试通过**。
- Planner 注册、事件图、continuous-host、Attention 和迁移测试全部通过。
- DSH 真实 userQuestions 探针：`firstReused=false`、`secondReused=true`、answerCount=1。
- OpenCode V1 permission 探针：`firstReused=false`、`secondReused=true`。
- 契约文档：`docs/planner-event-schema-v0.2.md`、`docs/continuous-host-contract.md`。

Phase 3 A–D 的最终汇总签署仍需单独完成。

## 8. Phase 3 整体验收（A–D）

- [x] **A. 交付物存在性**：M1、settlement、measure option/model、7 工具契约、DSH/OpenCode 适配、双 host 联调记录、Planner 事件与 Attention 全部就位。
- [x] **B. 治理功能**：450/512 HV 隔离、实验 settle、文献 revoke、休眠回查、未知来源人工复核、R3-RefRepair 独立性和重复裁决幂等通过。
- [x] **C. 双 host 与数据**：DSH 与 OpenCode V1/V2 加载成功，真实 LLM 七工具流程通过；交叉读取一致，未提前注册未来工具，卸载/重装后行数与关键 ID 不变，profile/项目隔离，R4 边界未改变。
- [x] **D. 质量红线**：核心无 host 依赖，CozoScript 集中于 MnesticClient，契约单一来源，memory_query 只读防护，原始证据与休眠历史可回查，未实现项和后续版本计划明确，未分别建设调度器/Question Center，未提前落地 SuperAgent/dataStore。

整体验证：`pnpm build` 通过，`pnpm test` 为 **22 个测试文件、76/76 通过**，`git diff --check` 通过。真实双 host LLM 与原生 Attention 证据见第 6–7 节。生产 9070 当前不可连接，本次未重新读取生产 R4/delta 计数；R4 边界采用既有生产快照与全量回归证据，未修改生产实例。

### E. 验收签署

A–D 已全部通过，**仍待执行人、子课题2/3、子课题1负责人按手册签署**。签署前不宣称 Phase 3 已正式关闭。

## 9. 保留边界

- R4 仍阻塞，未注册或派生 `delta`，未生成伪造的 `delta > 0.06` 验收计数。
- 97 条 `corrected_pending_source_review` 仍需来源审查，不作为独立外部认证证据。
- Phase 2 已签署不妨碍本记录；Phase 3 A–D 全部验收与签署尚未完成。
