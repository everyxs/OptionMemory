# optionmemory

OptionMemory —— mnestic（CozoScript HTTP）上的五层记忆，提供 DSH 与 OpenCode 两种 host 适配层。当前已交付 Phase 0–2、Phase 3 冲突治理与首版 7 工具适配；R4 暂缓，Phase 3 平台联调与 Planner-ready 增量仍在实施。

## 运行前提

- Node >= 24.9.0，pnpm（本仓库锁定 `pnpm@11.7.0`）。
- DSH 适配目标：`@deepseek-ai/dsh@0.2.2-rc.1`（npm latest 标签，仍为 RC）、`@deepseek-ai/cordis@~4.1.0`、`@deepseek-ai/dsh-tools@0.2.2-rc.1`。
- mnestic 实例：`scripts/mnestic_start.sh` 启动（默认 `127.0.0.1:9070`，首次自动 `cargo build`）。
  双模式：`--mem`（默认，内存）/ `--rocks`（RocksDB 持久化，数据目录 `.data/mnestic`）；
  重编译 rocks feature 需 libclang（bindgen 依赖），未设 `LIBCLANG_PATH` 时启动脚本自动探测用户级 LLVM（`%LOCALAPPDATA%\LLVM`）。
- 建表：`schema/apply_all.sh`（mem 引擎重启即丢数据，需重新执行）。
- 测试无需手工做以上两步：`pnpm test` 的 globalSetup 会拉起独立实例（端口 9071）并自动建表，
  仅要求 `target/debug/mnestic-mem-adapter(.exe)` 已编译（跑过一次 `mnestic_start.sh` 即可）。

## 记忆接口（src/api/memory.ts）

```typescript
memory_set(fact: FactInput): Promise<{ id: string; gate: "pass" | "blocked"; reason?: string }>
memory_get(id: string): Promise<Fact | null>
memory_query(datalog: string): Promise<Fact[]>
memory_set_batch(facts: FactInput[]): Promise<{ inserted: number; skipped: number; blocked: { index: number; reason: string }[]; ids: (string | null)[] }>
```

- 写入先过 ν 门与 status 校验，blocked 不落库；单条与批量共用判定。
- `memory_set` 生成 `fact_<UUID>` 和时间戳后 upsert；`memory_get` 未命中返回 `null`。
- `memory_set_batch` 按 `(predicate, args)` 全参幂等，合格行单事务写入，blocked 条目收集原因且不回滚整批。
- `memory_query` 透传 CozoScript，返回行按 facts 列名映射为 `Fact`；未 select 的列为 `undefined`。
- HTTP 非 2xx / `{ok:false}` / 超时（默认 5s）/ 连接失败统一抛 `MnesticError`。

### FactInput / Fact（src/memory/schema.ts）

| FactInput 字段 | facts 列 | 必填 | 说明 |
|---|---|---|---|
| `predicate` | `predicate` | ✓ | 谓词 |
| `claim` | `claim` | ✓ | 主张文本（六元组） |
| `layer` | `layer` | ✓ | 层标签（六元组；占位词汇见 `MEMORY_LAYERS`） |
| `jPremiseIds` | `j_premise_ids` | ✓ | J 系：前提 id 列表，可为 `[]` |
| `epsType` / `epsValue` / `epsSource` | `eps_*` | ✓ | ε 系：类型 / 值(Float) / 来源 |
| `linSource` / `linVersion` / `linActor` | `lin_*` | ✓ | lin 系：来源 / 版本 / 行为者 |
| `verify` | `verify` | ✓ | 核验标记 |
| `args` | `args` | — | 谓词参数，缺省 `[]` |
| `jRuleId` / `linTheta` | `j_rule_id` / `lin_theta` | — | 可空 |
| `status` | `status` | — | 缺省 `"in"`；合法值见 `FACT_STATUSES`（`in` / `out` / `archived` / `contested`） |
| `embedding` | `embedding` | — | 1024 维 F32 向量，可空 |

`Fact` = `FactInput` 全字段 + `id` / `createdAt` / `updatedAt`（camelCase ↔ snake_case 由服务层映射）。

## Phase 1 接口

- `src/api/registry.ts`：`registerRule` / `registerOption` / `registerSubtask` / `registerModel`；option 默认 `option_type="atomic"`、`template_id=null`，R4 在全量标定和明确批准前禁止注册为 active。
- `src/api/tool-contracts.ts`：单一 host-neutral 7 工具契约；`src/api/tool-executor.ts` 统一执行分发，DSH 适配将其转换为 `defineTool` 参数与 canonical output。
- `src/api/readOnlyQuery.ts`：两种 host 共用的只读查询防护。
- `src/runtime/deriveClosure.ts`：`deriveClosure(scope?)` 支持 R1 composition 派生、R2 FCC/BCC join、R3 smix 计算；派生 facts 经批量 ν 门写入，J 边按 `(derived_id, rule_id, premise_ids)` 幂等。
- `putPlanTemplate` 仅保留客户端入口，MVP 中显式禁用，plan_templates 保持空表。

## Phase 2 接口（Step 1–3 已落地）

- `src/api/revision.ts`：`memory_retract` 将 in 标为 out 并写 revision；`findAffectedFacts` 提供依赖锥，`hasAlternativeJustification` 检查有效辩护，`restoreFact` 在有效辩护存在时恢复。
- `src/runtime/nuGate.ts`：支持 enforce/audit；audit 放行违规并写 gate_audit，使用 audit-missing 占位，非法 status/目标不存在仍拒绝。
- `src/memory/events.ts` + `docs/phase2-event-schema.md`：核心五类事件与 revision/gate_audit 扩展。
- `scripts/revise_s01_composition.ts` + `tests/s01_revision.test.ts`：S01 成分更正、下游失效/重推、J 版本和 revision 验证；普通写入全状态幂等，闭包重推忽略 out。

## OpenCode 适配层

- `.opencode/plugins/optionmemory.ts` 是项目级入口，`src/plugins/opencode/` 是独立适配层；与 DSH 共用核心服务和 `src/api/tool-contracts.ts` 中的同一工具定义。
- 当前提供 memory_set/get/query/propose_option 四个已实现工具；memory_query 使用共享只读防护，后续 Phase 逐版扩展。
- 配置使用 `OPTIONMEMORY_ENDPOINT` / `OPTIONMEMORY_TOKEN` / `OPTIONMEMORY_TIMEOUT_MS`，详见 `docs/opencode-plugin.md`。
- 入口同时兼容 V1 server hooks 与 V2 id/setup；V2 用 `opencode --standalone --print-logs --log-level debug debug agents` 核查 setup 日志，LLM 全流程联调在 Phase 3 验收。

## 结构

```
src/
  memory/schema.ts        # facts 类型、列/层/status 常量
  memory/assets.ts        # rules/J/options/models 等资产行类型与列常量
  memory/client.ts        # 共享客户端注入
  memory/mnesticClient.ts # HTTP 客户端；所有 CozoScript 集中组装
  memory/events.ts        # 核心事件与 gate_audit 事件构造
  runtime/nuGate.ts       # ν 门完整性检查与 enforce/audit 模式
  runtime/descriptors.ts  # R3 smix 计算
  runtime/justifications.ts# 共享 active J 边写入与幂等
  runtime/deriveClosure.ts# R1–R3 闭包推导与 J 边写入
  api/memory.ts           # 四个记忆接口
  api/registry.ts         # Phase 1 资产注册接口
  api/revision.ts         # memory_retract 与 revision 血缘
  api/governance.ts       # M1 冲突隔离与 settle/revoke 治理链
  api/tool-contracts.ts   # 单一 7 工具契约与 JSON Schema 导出
  api/tool-executor.ts    # DSH/OpenCode 共享工具分发
  api/readOnlyQuery.ts    # 共享只读查询防护
  plugins/dsh/            # DSH 适配层（首版 7 工具）
  plugins/opencode/       # OpenCode 适配层（首版 7 工具）
tests/
  globalSetup.ts          # 拉起 9071 测试实例 + 建表
  memory.test.ts          # 9 个记忆服务用例
  closure.test.ts         # 8 个闭包/注册用例
  opencode.test.ts        # 5 个 OpenCode V1/V2 适配用例
  dsh.test.ts             # 3 个双 host 契约与交叉数据用例
  settlement.test.ts      # 4 个 settlement policy 与治理链用例
  settlement-auto-isolation.test.ts # 1 个无预检测调用的自动 M1 隔离用例
  measure-settlement.test.ts # 3 个 measure option/model 结算用例
  dsh-json.test.ts        # 2 个 DSH canonical JSON 投影用例
  planner-assets.test.ts  # 3 个 Planner 注册与兼容字段用例
  telemetry-v02.test.ts   # 3 个事件 v0.2 与执行图用例
  continuous-host.test.ts # 2 个 continuous-host 契约用例
  attention-adapters.test.ts # 3 个原生 Attention 用例
  step7-migration.test.ts # 1 个迁移与回滚用例
  field_migration.test.ts # 1 个 P4-0 字段合并与回滚用例
  tool-contracts.test.ts  # 4 个共享契约用例
  justifications.test.ts  # 1 个共享 J 写入用例
  revision.test.ts        # 8 个撤回与 ν 门模式用例
  dependency.test.ts      # 3 个依赖锥与恢复用例
  s01_revision.test.ts    # 1 个 S01 成分更正用例
schema/                   # 9 个建表脚本 + apply_all.sh
server/                   # mnestic 适配层（Rust；--engine mem|rocksdb --data <dir>）
docs/mnestic-api-cheatsheet.md  # mnestic 0.17.0 API 取证速查
```

## 开发

```bash
pnpm install   # 依赖（pnpm-workspace.yaml 已批准 esbuild / msgpackr-extract 构建脚本）
pnpm build     # tsc 编译到 dist/
pnpm test      # vitest：自动起 9071 实例，23 个测试文件、77 用例
```
