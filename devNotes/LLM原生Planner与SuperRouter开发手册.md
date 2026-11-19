---
创建时间: 2026-11-03
更新时间: 2026-11-17
类型: 开发手册
所属项目: "26-04 AI4Science"
对应路线图: "S01最小产品路线图（完整版：OptionMemory + LLM 原生 Planner）"
状态: 已批准；按 Phase 3–6 实施
tags:
  - 开发手册
  - LLM-Planner
  - SuperRouter
  - OptionBench
  - OptionMemory
---

# LLM 原生 Planner 与 Super Router 开发手册（Phase 3–6 融合版）

> 本手册落实已批准的 Planner 增量，不替换原 Week 1–16 开发手册。
>
> Phase 0、Phase 1 R1–R3 部分验收、Phase 2 Step 1–3 的已完成内容不改写；Phase 2 Step 4–5 先按原手册关闭。原 Phase 3–6 的基线交付和插件工具数量保持不变，本手册为各阶段追加 Planner 增量及独立验收。
>
> 版本线：Phase 3 `planner-schema v0.1`，Phase 4 `planner-runtime v0.1.0`，Phase 5 `planner-runtime v0.2.0`，Phase 6 `planner-runtime v0.3.0`。
>
> **2026-11-06 修订导航**：实施顺序调整为“核心契约 → OpenCode 对话式垂直闭环 → DSH 同切片验证 → 共享后台执行与恢复 → SuperAgent Executor 正式适配”。Phase 3 增加 continuous-host contract v0.1；Phase 4 增加 DSH 同切片验证、共享持久化后台 plan_run 和 SuperAgent 隔离探针；Phase 5 的 SuperAgent 工作由“机制评估与参考”改为“Executor 正式适配”，适配器独立标记 `superagent-adapter v0.1`。
>
> 修订后的状态边界为：DSH/OpenCode 共用一个 planner-runtime 和 MemoryCore 中的 subtask_event、inbox/outbox、内部 timer、plan_run 与恢复状态，保持对话宿主定位，不分别建设完整持续服务平台；SuperAgent 承接完整长期 Source/Ticket/Mandate/Assignment/Attention/Outbox，OptionMemory 持有 plan_run、Planner/Option 事件、证据和认证，不复制 Ticket 状态机。SuperAgent Eval 只负责接单、授权和路由，OptionMemory Planner 是 plan_run 内唯一规划控制面。
>
> 人机交互复用宿主原生能力：OpenCode 使用 question/permission ask，DSH 使用 ask_user_question/ctx.userQuestions/approval intent，SuperAgent 使用 Ticket Attention。核心只保存 ask/wait_condition、host_question_ref、answer_event_id 和恢复关联，不新建 Question Center、Attention UI 或权限审批。DSH 的 askTimed、continued 和 Remote answer 按实际 pin 探针，外部 runtime 必须经 root Session/Adapter 提问。
>
> 跨 harness handoff 只在 Option 边界进行：暂停新分发、完成副作用对账、校验目标 Mandate/权限/能力、原子转移 lease，再恢复并记录事件；不支持运行中 Option 热迁移，不自动迁移宿主授权、工作目录或后台进程。
>
> **后续 dataStore 模块**：按路线图 §十七 的 DS0–DS4 独立研发，定位仅为大体量数据访问与批处理。默认采用 fsspec + PyArrow，DuckDB 仅作可选加速后端；dataStore 负责物理数据、技术游标和测量，MemoryCore 负责治理元数据、plan_run 与治理事务。该模块不直接写 mnestic，不扩大当前 16 周 MVP 承诺。
>
> 本导航与下文 Phase 4–5 的旧 host 顺序、MemoryCore 状态归属或 SuperAgent 定位不一致时，以《S01最小产品路线图-完整版》2026-11-06 版和本导航为准。实施对应 Step 前必须先将该 Step 展开为新的文件、接口和故障测试清单，不得直接按旧顺序施工；Phase 0–2、原插件工具数量和其余治理契约不变。
>
> **分阶段实施手册**：Phase 4 见 `devNotes/Week9-12开发手册-多源解析与可靠调度.md`；Phase 5 见 `devNotes/Week13-14开发手册-持续Planner与决策链导出.md`；Phase 6 见 `devNotes/Week15-16开发手册-生成认证与SuperAgent持续适配.md`。三份手册已按本导航展开文件、接口、故障测试和独立验收清单。
>
> **2026-11-15 MemoryBridge 增量**：日常 Markdown 作为多源解析的一部分纳入 Phase 4。P4-1M 已完成摄入、MemoryCore Recall、显式捕获/修订和 OpenCode 自动注入最小闭环；P5-4 扩展为 SuperAgent 持续记忆与跨宿主适配，P6-4 扩展为 SuperAgent 主动记忆治理与跨 harness 恢复。Bridge 使用独立契约，不改变原 Phase 3–6 的 7/8/10 工具数量，不修改 Markdown 原文，不建立第二套治理中心。
>
> **2026-11-19 Phase 4 最终进度**：Phase 4 原基线与 P4-0–P4-6 均已通过 Repo 验收。S01/HEA-Lens CSV 已形成解析→写入→R1–R3 闭包→J 血缘→transient 结算链，真实全量批次为 701 个实体、3502 条原始 facts、1402 条派生 facts；v0.2.0 真实 OpenCode/DSH 执行与升级保留通过。共享持久化调度、崩溃恢复、SuperAgent 隔离探针、Sidecar Mapping 和日常记忆 STOMP 均已验收，最终全量回归为 **35 个测试文件、128/128 通过**。整体证据见 `docs/phase4-acceptance.md`。正式 SuperAgent 适配和完整持续服务尚未完成。

---

## 一、实施纪律

### 1.1 不变项

- R4 阻塞及其开放条件不变。
- `revision/gate_audit`、J/≺ 和既有修订语义不变。
- `plan_templates` 保留原预留，不删除、不改成 Planner。
- 原 `OPTIONMEMORY_TOOL_CONTRACTS` 不加入 Planner 工具；原插件仍为 7→7→8→10 工具。
- 核心层不引入 DSH/OpenCode 专有依赖，CozoScript 仍集中于 MnesticClient。
- 新 schema 采用可回滚增量迁移，不删表重建生产 RocksDB。
- 原基线验收与 Planner 增量验收分别归档，互不替代。

### 1.2 统一分工

```text
Planner Agent：
  execute/decompose/replan/retry/wait/ask/stop/ignore 决策

Shared Scheduler Runtime：
  DSH/OpenCode 共用的有限生命周期后台 plan_run；
  inbox/outbox、内部 timer、lease、幂等、唤醒、恢复和并发控制

Host Attention Adapters：
  OpenCode question/permission ask、DSH userQuestions、SuperAgent Ticket Attention；
  只映射 ask/wait、host_question_ref 和回答事件，不重复建设交互与审批

Option：
  tool/skill/api/llm_workflow/subagent/device 的唯一对外动作执行面

Model：
  Option 级 anticipation/evidence/critique/limitations

MemoryCore：
  资产、plan_run、规划执行事件、证据和认证的统一来源；
  原生模式的队列与恢复状态，以及 SuperAgent 模式的规划治理事实
```

代码中的 option executor 只是内部运行模块，不建立 Executor 领域资产。

---

## 二、目标文件边界

以下文件在对应 Phase 实施时新增或修改，不在 Phase 2 提前落地：

```text
docs/
  continuous-host-contract.md       # Phase 3：start/deliver/stop/report 与状态归属

schema/
  09_planners.cozo                 # Phase 3
  10_runtime_inbox.cozo            # Phase 4
  11_runtime_outbox.cozo           # Phase 4

src/
  memory/
    planner.ts                     # Planner 类型和列常量
    scheduler.ts                   # inbox/outbox 类型与状态词表
    events.ts                      # 增量事件 v0.2；治理事件不变
  api/
    planner-registry.ts
    planner-contracts.ts           # 独立契约，不改原 host 工具清单
    continuous-host.ts             # Phase 3：持续宿主契约与 plan_run 外部 ID
    telemetry.ts
    scheduler.ts
  runtime/
    planner.ts                     # host-neutral Planner Agent 接口
    plan-run.ts                    # Phase 4：规划执行实例与恢复上下文
    decision-gate.ts
    scheduler.ts                   # 双 host 共用的后台调度器
    handoff.ts                     # Phase 5：Option 边界的受控跨 harness 接管
    option-executor.ts             # Option 内部执行实现
  plugins/
    opencode/
      planner.ts
      planner-events.ts
      attention.ts                 # Phase 4：原生 question/permission ask 映射
    dsh/
      planner.ts                   # Phase 4：与 OpenCode 同切片验证
      attention.ts                 # Phase 4：userQuestions/approval 映射与版本探针
    superagent/
      executor.ts                  # Phase 5：正式 Executor Adapter
      events.ts                    # Phase 5：Ticket/Input/Attention/Report 映射

.opencode/
  agents/
    optionmemory-planner.md
    materials-evidence-reviewer.md
  plugins/
    optionmemory-planner.ts

tests/
  planner-assets.test.ts
  telemetry-v02.test.ts
  continuous-host.test.ts          # Phase 3
  decision-gate.test.ts
  scheduler.test.ts
  attention-adapters.test.ts       # Phase 4：复用宿主原生提问与审批
  planner-opencode.test.ts
  planner-dsh.test.ts              # Phase 4
  plan-handoff.test.ts             # Phase 5：lease、恢复、权限与副作用防重
  superagent-executor.test.ts      # Phase 5；另有 Phase 4 隔离探针记录
  sidecar-mapping.test.ts
  trajectory-export.test.ts
```

后续 dataStore 模块（DS0–DS4，独立于当前 Phase 3–6 交付承诺）：

```text
schema/
  12_dataset_governance.cozo        # DS0：快照/资产/样本引用与质量判断，不存原始大文件

datastore/
  api/                             # host-neutral 数据访问与 FactCandidate 接口
  storage/
    fsspec_backend.py              # 默认文件访问实现
  query/
    engine.py                      # 可插拔查询接口
    arrow_engine.py                # 默认 PyArrow 实现
    duckdb_engine.py               # 可选加速实现，启用前需基准证据
  formats/
    data_package.py                # 快照描述
    croissant.py                   # DS4 样本集描述
    openlineage.py                 # 可选血缘导出，不替代 J/≺
  workers/                         # 复用现有 Python 采集与批处理脚本
  tests/
    catalog-consistency.test.ts    # DG-01：快照与统计口径
    streaming-query.test.ts        # DG-02：分批与内存边界
    report-lineage.test.ts         # DG-03：报告解析与图文共现
    source-access.test.ts          # DG-04：授权和失败分类
    ingestion-recovery.test.ts     # DG-05：续抓、handoff 与 partial
    sample-certification.test.ts   # DG-06：样本血缘、split 与认证隔离

src/
  api/
    datastore-client.ts            # Node/TS 宿主受控调用，不直写 mnestic
```

---

# Phase 3：Planner-ready 资产与事件契约

## 三、目标

在完成原冲突治理和 DSH/OpenCode v0.1.0 基线的同时，建立后续 Planner 所需的资产、事件、授权结构、continuous-host contract v0.1 与原生 Attention 映射。本阶段不要求持续 Planner、inbox/outbox、SuperAgent 或 dataStore，原七工具数量不变。

## 四、Step P3-1：Planner 与资产扩展

### 4.1 `schema/09_planners.cozo`

```cozoscript
:create planners {planner_id: String =>
    claim: String,
    layer: String,
    j_premise_ids: [String],
    instructions_ref: String,
    instructions_version: String,
    inference_ref: String,
    context_policy: Json,
    decision_schema: Json,
    tool_policy: Json,
    budget_policy: Json,
    eps_type: String,
    eps_value: Float,
    eps_source: String,
    lin_source: String,
    lin_version: String,
    lin_theta: String?,
    lin_actor: String,
    verify: String,
    status: String}

::index create planners:status_idx {status}
```

词表：

```text
layer = "planner"
status = active / disabled / archived
```

`inference_ref` 指 Planner 使用的 LLM 后端，不是 Option 的 model_id。Planner 可服务多个 subtask，不做 1:1 绑定。

### 4.2 Option/Model 增量字段

Option 增加：

```text
input_schema: Json?
```

Model 增加：

```text
reasoning_spec:  Json?
evidence_spec:   Json?
evaluation_spec: Json?
```

既有字段和已完成资产不改写。未校准 model 使用 `status="probation"`、空校准历史和显式未知标记；Planner 不得把未校准数值字段当作可靠预测。

实施前先探针 mnestic 增量迁移能力，形成备份、迁移、行数校验和回滚记录。若只能重建关系，必须停止并单独评审，不得静默删表。

### 4.3 注册 API

```typescript
registerPlanner(...)
registerOption(...)   // 增量支持 input_schema
registerModel(...)    // 增量支持三类 spec
```

注册校验：Planner 的 instructions/inference/decision_schema 必填；Option/Model 新字段允许 null，但不得自动编造。

## 五、Step P3-2：事件 v0.2

新增 `docs/planner-event-schema-v0.2.md`，不回改原 Phase 2 事件 schema v0.1 的完成记录。

### 5.1 层级命名

```text
subtask_event
planner_event
planner_event_decision
option_event
option_event_observation
option_event_outcome
model_event
```

### 5.2 `subtask_event`

```text
[
  subtask_event_id,
  subtask_id,
  baseline_id,
  mandate_json
]
```

```json
{
  "scope": {},
  "policy_version": "...",
  "source_actor": "...",
  "strength": "explicit|inferred",
  "mode": "enforce|dry-run",
  "budget": {}
}
```

### 5.3 `planner_event`

```text
[
  planner_event_id,
  subtask_event_id,
  planner_id,
  context_json
]
```

```json
{
  "state_snapshot_ref": "...",
  "state_hash": "...",
  "instructions_version": "...",
  "inference_ref": "...",
  "policy_version": "...",
  "evidence_refs": []
}
```

### 5.4 `planner_event_decision`

```text
[
  planner_event_id,
  decision_type,
  decision_json
]
```

```text
decision_type = execute / decompose / replan / retry / wait / ask / stop / ignore
```

execute 示例：

```json
{
  "decision": "execute",
  "option_id": "infer_phase_structure_from_xrd",
  "arguments": {},
  "rationale": "",
  "evidence_refs": [],
  "uncertainties": []
}
```

非 execute 决策不得伪造 option_id。decompose 返回 subtask 提议，wait 返回唤醒条件，ask 返回一个明确问题，retry 返回目标 option_event_id。

### 5.5 `option_event`

```text
[
  option_event_id,
  planner_event_id,
  option_id,
  model_id,
  execution_json
]
```

```json
{
  "option_version": "...",
  "pi_type": "tool|skill|api|llm_workflow|subagent|device",
  "pi_ref": "...",
  "pi_theta": null,
  "attempt": 1,
  "mode": "real|simulated|sidecar"
}
```

### 5.6 `option_event_observation`

```text
[
  observation_event_id,
  option_event_id,
  observation_type,
  value_json
]
```

```text
observation_type = input / context / pre_state / output / post_state / environment / error
```

### 5.7 `option_event_outcome`

```text
[
  option_event_id,
  status,
  evaluation_json,
  cost_json,
  error_json
]
```

```text
status = success / failure / blocked
```

```json
{
  "verdict": "accepted|revise|reject|uncertain|null",
  "goal_progress": {},
  "reward_components": {},
  "scalar_reward": null,
  "terminal": false,
  "evaluator_ref": null,
  "evaluator_version": null,
  "rationale": null
}
```

未观测 reward 必须为 null，不得以 0 代替。

### 5.8 `model_event`

```text
[
  model_event_id,
  model_id,
  event_type,
  payload_json
]
```

```text
event_type = anticipation / critique / calibration / drift
```

### 5.9 通用事件规则

- ID、类型和状态作为独立字符串参数，详情放 JSON。
- `created_at` 表示事件时间，`claim` 不参与机器关系解析。
- `jPremiseIds` 只表示证据依赖，不替代事件外键。
- 一个 option_event 只有一个最终 outcome。
- real/simulated/sidecar 不得混写。
- 所有写入经服务层和门控，查询集中于 MnesticClient。

## 六、Step P3-3：基础门控与图查询

内部 API：

```typescript
beginSubtaskExecution(...)
beginPlannerEvent(...)
recordPlannerDecision(...)
beginOptionExecution(...)
recordOptionObservation(...)
finishOptionExecution(...)
recordModelEvent(...)
```

门控检查：

- 引用资产和事件存在；
- Planner、Option、Model 状态允许当前操作；
- Option 的 subtask/model 绑定一致；
- option_event 只能由已通过 gate 的 planner decision 创建；
- outcome 不重复；
- 未授权主动执行只能 dry-run；
- Planner 文本不得直接替代 settle/revoke 等 governance API。

固定 Datalog 查询至少覆盖：

```text
getExecutionTrace(option_event_id)
getSubtaskDecisionChain(subtask_event_id)
getOptionEvidence(option_id, context?)
```

## 六A、Step P3-4：continuous-host contract 与原生 Attention（2026-11-06 修订）

本 Step 只冻结宿主契约，不实现持续 Planner 或 inbox/outbox。

### 6A.1 持续宿主契约

新增 `docs/continuous-host-contract.md` 与 `src/api/continuous-host.ts`，统一：

```text
plan_run_id / subtask_event_id / attempt
host_type / host_session_ref / host_ticket_ref / host_assignment_ref
start / deliver / stop / report
submit / status / stop / answer
host_question_ref / answer_event_id
idempotency_key / mapping_version
```

约束：

- 一个 plan_run 可包含多个 planner_event 和 option_event；plan_run 是运行上下文，不是 Executor 领域资产。
- DSH/OpenCode 保持对话宿主，后续共用同一个 planner-runtime，不分别建设权威调度器、长期 Source 或持续接单。
- SuperAgent 仅预留 Ticket → subtask_event、Assignment → plan_run、Input → observation、Attention ↔ ask/answer 映射，正式适配留 Phase 5，隔离探针留 Phase 4。
- dataStore 是 DS0–DS4 的独立后续模块，不在本阶段提前创建。

### 6A.2 原生 Attention 映射

- OpenCode：语义澄清使用原生 `question`，操作审批复用 permission ask 与对应 hook。
- DSH：使用 `ask_user_question` / `ctx.userQuestions` / approval intent；按实际 pin 探针 `askTimed`、pending/continued 和 Remote `answer`，不得把 master 新能力默认套用到旧 rc。
- 外部 planner-runtime 必须经 DSH root Session/Adapter 提问，不得冒充 Agent 或绕过 delegated caller 限制。
- 核心只保存 `ask/wait_condition`、`host_question_ref`、`answer_event_id` 和恢复关联，不新建 Question Center、Attention UI、通知系统或权限审批引擎。
- SuperAgent 后续使用 Ticket Attention，三个宿主不共用一套人机交互实现。

### 6A.3 测试

- continuous-host 契约的 start/deliver/stop/report 映射与确定性 ID；
- 原生 question/permission/userQuestions 的真实调用与回答只唤醒一次；
- DSH 版本与 root Session 调用边界；
- 原 7 工具、M1 冲突治理、R4 阻塞、数据保留与 Phase 0–2 测试不回归。

## 七、Phase 3 增量验收

- 原 Phase 3 七工具和冲突治理验收独立通过。
- Planner 可注册且 inference、instructions、policy 版本可回查。
- Datalog 可遍历 subtask → plan_run → planner_event → option_event → option/model。
- continuous-host contract 可映射 start/deliver/stop/report，一个 plan_run 可包含多个 Planner/Option 事件。
- OpenCode/DSH 使用各自原生提问与审批，回答只唤醒一次，未重复建设 Question Center 或宿主专用调度器。
- measure_hardness 可登记证据和评价语义，未知世界模型不伪造。
- Option 子事件命名严格为 `option_event_*`。
- SuperAgent 和 dataStore 未提前落地，既有 Phase 0–2 测试、数据和关键 id 不回归。

---

# Phase 4：可靠调度与 OpenCode Planner 闭环

## 八、目标

以原 Phase 4 的批量解析和结算为真实工作负载，实现可靠调度内核，并由 OpenCode LLM 完成首个交互式 Planner 闭环。本阶段不宣称完整 24/7 Super Router。

## 八A、Step P4-0：字段权威审计与增量精简迁移（2026-11-15 追加）

在 P4-1 持久化队列和 P4-2/P4-3 Option Executor 实施前，先完成字段权威审计和可回滚迁移。该任务已批准纳入 Phase 4，不表示可以绕过逐字段评审直接删列。

目标交付物：

```text
docs/phase4-field-authority.md       # 字段语义、权威来源、兼容投影与逐字段处置
scripts/migrate_phase4_fields.ts     # 备份、预检、增量迁移、行数/ID/J/≺校验与回滚
tests/field_migration.test.ts        # Mem 与独立 RocksDB 副本迁移、回滚和兼容测试
```

审计与处置范围：

| 字段/关系 | 必须明确的权威与处置 |
|---|---|
| `Option.model_binding` ↔ `Model.option_id` | 权威外键、反向查询投影及不一致修复 |
| Model `j_records` ↔ governance 事件 J | 事件权威、Model 投影及同步边界 |
| `calibration_history` ↔ 成功率/误差/成本摘要 | 证据明细与派生快照的生成关系 |
| `theta_version` ↔ `lin_theta` | 世界模型版本与谱系生成模型版本是否可分；不可分时统一语义 |
| `utility_queries` 等统计字段 | 事件明细与派生计数的关系 |
| 未观测数值和适用域 | `null / observed:false / uncalibrated`，不得以 0 或空字符串冒充实测值 |

### 评审后合并路径（2026-11-15 已批准方向）

用户已选择在评审后把兼容字段合并回 `options.input_schema` 与 `models.reasoning_spec/evidence_spec/evaluation_spec`。该决定确定目标方向，但不授权立即替换生产关系，仍须完成以下独立评审和签署：

1. `docs/phase4-field-authority.md` 明确旧表列、兼容表行与 API 的一一映射，证明无双写、无重复事实和无语义回退。
2. 在独立 RocksDB 副本中先备份，再执行目标结构生成、兼容表数据回填、索引重建、行数/关键 ID/J/≺/质量状态核对和回滚。
3. 切换期间以旧表为唯一写入目标，兼容表只读；所有读取和七工具回归通过后，方可签署退役兼容表。退役前不得删除兼容表或其历史记录。
4. 若原子替换、索引恢复或回滚无法保证，停止合并并保留 additive compatibility tables，不得以 `:replace` 绕过限制。

### P4-0 终态边界：主表、事件与投影

字段精简不得理解为“所有字段一律并入旧表”。目标结构固定为：

- **Option/Model 主表**：只保存静态资产定义、绑定和 declarative spec，包括评审后合并的 input_schema/reasoning_spec/evidence_spec/evaluation_spec。
- **事件关系**：保存执行、观察、评价、真实成本和校准证据，包括 option_event、outcome、model_event 及需要拆出的校准明细，禁止为了精简而塞进主表。
- **查询投影**：保存派生统计、反向绑定和兼容读取，不作为第二写入源。

只有属于主表的规范字段才合并；证据明细必须留在事件关系。每个字段都须在 `docs/phase4-field-authority.md` 标记为主表字段、事件证据或查询投影，未分类不得迁移。

实施纪律：

1. 先备份并记录 facts/options/models/subtasks/justifications 行数、关键 ID、J/≺、604/97 质量分组和 R4 阻塞状态。
2. 优先采用兼容字段、增量回填和只读投影；必须保留原始证据和历史治理事件。
3. 未经上述合并评审与签署，禁止删表重建生产 RocksDB；若 mnestic 只能重建关系，停止并单独评审，不得静默执行。
4. 在 Mem 和独立 RocksDB 副本验证迁移、重复执行和回滚，生产只读核对通过后才允许正式迁移。
5. Phase 0–3 测试、原七工具和 R4 边界不得回归；未完成字段不得被伪装成已精简。

P4-0 未关闭前，不得让后续 Executor 或 Planner 依赖已废弃字段；新接口应以 P4-0 确认的权威关系为准。

## 九、Step P4-1：OpenCode 对话式垂直闭环

### 9.1 Planner Agent

`.opencode/agents/optionmemory-planner.md`：

- `mode=primary`；
- 默认禁止 edit/shell/subagent 等直接执行权限；
- 只开放 Planner 专用只读查询和 `planner_decision`；
- 每次返回 decision_json，不只输出自然语言计划；
- 必须引用证据和未知项，不得扩大 mandate。

`planner_decision` 使用独立 Planner 契约，不加入原 OptionMemory host 工具清单。

### 9.2 两类真实 Option

1. tool Option：`infer_phase_structure_from_xrd`，调用既有 R2/deriveClosure。
2. subagent Option：例如 `review_s01_evidence`，调用只读 materials evidence reviewer。

子 Agent 的 Session、目录或后台运行只是 Option 的运行配置，不建立 Executor 资产。Option 的受控实现注册、I/β 校验和执行语义统一遵循 §11.5。

### 9.3 事件回流

OpenCode 的 session/subagent/tool 事件先转换为 runtime_inbox，再唤醒 Planner。至少处理：

```text
session.idle
session.error
tool.execute.after
subagent 完成通知
人工新输入
```

host 事件与 option_event 必须确定性去重；无法可靠映射时写异常并停止自动重放。

### 9.4 解析工作负载接入

parse_csv_materials 的批次使用 outbox 和 idempotency key；parser 版本写入 execution_json。解析结果、闭包和 J 血缘仍走原服务层，不另建解析专用事件体系。

## 九A、Step P4-1M：OpenCode 日常记忆最小闭环

日常 Markdown 是 data 层外部原始数据，Bridge 是带来源和幂等语义的只读摄入适配器。详细任务与验收见 `devNotes/Week9-12开发手册-多源解析与可靠调度.md` P4-1M。

- 注册 `parse_markdown_note` atomic Option，输出 DocumentProjection、FactCandidate 和 Observation，复用同一 Option Executor 和事件契约。
- MemoryCore 保存 raw_ref、document/chunk ID、必要投影、content_hash、namespace、parser_version、source link 和 mapping_stale；原文不复制、不改写。
- 使用硬过滤、结构过滤和候选过滤控制摄入体量，过滤原文仍留在文件系统。
- source link 与 J/≺ 分别表达原文出处和逻辑推导；候选经 ν 门与服务层，不自动 settle。
- 外部原文变化只重新摄入和标记 mapping_stale，不自动 retract；identity 不确定时不得继承旧映射。
- 实现独立只读 `memory_recall`：关键词/bigram、namespace、Top-K、token budget、状态裁注和可选 facts 联合召回；当前随机 embedding 不作为语义证据。
- 实现 `bridge_capture/bridge_revise/bridge_recall` 和 superseding 修订，原文与 AGENTS.md 不被修改，历史不删除。
- 通过 V2 `ctx.session.hook("context")` 自动注入非指令 REFERENCE_MEMORY，session_id+message_id+query_hash 持久化去重，continuation 复用。
- Planner 仅使用只读 bridge_recall 获取历史证据，召回文本不得扩大 mandate，capture/revise/settle/revoke 仍走独立授权路径。
- 真实 OpenCode 会话 A 捕获、会话 B 自动召回、修订后新会话使用新版本；证据见 `docs/phase4-memory-bridge-acceptance.md`。
- 自动 compaction、直接读取强制裁注、持续后台整理和真实向量不在本切片承诺内。

## 十、Step P4-2：DSH 同切片验证

DSH 使用与 OpenCode 相同的 S01 工作负载和核心契约验证，不另建一套 Planner、调度器或 Question Center：

- 原生 Planner、工具权限和 subagent 适配；
- Planner `ask` 映射到 `ask_user_question` / `ctx.userQuestions`，操作审批使用 approval intent；
- 按目标 DSH/Cordis pin 探针 `askTimed`、pending/continued 和 Remote `answer`，外部 runtime 经 root Session/Adapter 提问，不绕过调用身份限制；
- 同一 plan_run、事件 ID、错误和 outcome 语义；
- DSH/OpenCode 交叉读取同一决策与执行链，保持 gate、reason、J/≺ 和证据来源一致；
- DSH/Cordis 版本兼容、host 重启和 RocksDB 数据保留有独立记录。

OpenCode 使用原生 question/permission ask，DSH 使用原生 userQuestions/approval；回答只唤醒一次 plan_run，核心只保存 `host_question_ref`、`answer_event_id` 与恢复关联。

## 十一、Step P4-3：共享持久化后台执行与恢复

### 11.1 `runtime_inbox`

```text
event_id: String, pk
event_type: String
source: String
external_id: String?
payload: Json
status: String
available_at: Float
waiting_condition: Json?
attempts: Int
lease_owner: String?
lease_expires_at: Float?
last_error: String?
created_at: Float
updated_at: Float
```

```text
status = pending / leased / done / dead / ignored
event_type = request / timer / option_outcome / model_event / human_input / host_event
```

`event_id` 由来源和外部幂等键确定生成；同一 trigger 重发不得产生第二条有效任务。

### 11.2 `runtime_outbox`

```text
decision_id: String, pk
subtask_event_id: String
decision_type: String
payload: Json
idempotency_key: String
status: String
available_at: Float
attempts: Int
lease_owner: String?
lease_expires_at: Float?
last_error: String?
created_at: Float
updated_at: Float
```

```text
status = pending / leased / dispatched / done / dead / cancelled
```

Planner 决策事件与 outbox 必须在同一持久化边界内提交。若 mnestic 无法保证跨关系原子写入，停止并报告，不得先执行后补日志。

### 11.3 调度循环

```text
1. 领取到期 inbox（lease）
2. 重建 subtask/planner 上下文
3. 调用 Planner Agent
4. decision gate 校验
5. 同事务保存 planner_event_decision + outbox
6. inbox 标 done
7. 领取到期 outbox
8. 创建/更新 option_event 并分发
9. Option 结果先写 inbox，再唤醒后续 Planner
10. 崩溃后回收过期 lease
```

Timer 的真实状态是 `available_at/waiting_condition`；进程内 timer 仅是唤醒提示。DSH/OpenCode 共用同一个有限生命周期后台 runtime，不分别持有权威队列。

### 11.4 Decision gate

检查：

- mandate/policy、scope、budget 和 allowed effects；
- execute 的 Option、参数和证据契约；
- contested/revoked/disabled 资产；
- decompose 是否扩权；
- retry 次数；
- ask 是否只有一个明确问题；
- dry-run 是否只记录建议；
- stop/pause 是否仍有效。

### 11.5 Option Executor 实施契约（2026-11-15 补充）

`src/runtime/option-executor.ts` 是 Option 的内部运行模块，不是 Executor 领域资产，也不是 `src/api/tool-executor.ts`。后者只分发首版 7 个记忆工具，不能代替通用 Option 执行器。

执行入口接收 `option_id`、调用参数、`option_event_id`/idempotency key、mandate 上下文和 `AbortSignal`，并完成：

```text
加载 Option/Model 与当前状态
  → 校验 mandate、I/i_preconditions 和输入 schema
  → 以 (pi_type, pi_ref) 查找受控实现
  → 调用实现并传递取消信号
  → 按 beta_success/beta_output_schema 校验结果
  → 写 option_event_observation/outcome
  → 结果进入 runtime_inbox，唤醒后续 Planner
```

实现注册与适配要求：

- `(pi_type, pi_ref)` 只能解析到显式注册的实现，禁止 `eval(pi_ref)`、动态执行数据库代码字符串或未经审查的远程代码。
- 未登记 `pi_type/pi_ref`、实现版本不匹配、输入或输出不符合 schema 时必须 `blocked`，不得伪造 outcome。
- `infer_phase_structure_from_xrd` 通过 host-neutral 适配器复用现有 `deriveClosure()`，固定 R2 语义并读取派生事实与 J 边，不复制闭包实现。
- `measure_*`、`parse_*`、subagent 和未来 external verifier 均采用同一适配边界；湿实验只能连接真实实验流程或证据登记，不得用代码冒充物理执行。
- Option 的代码保留在经过版本控制的实现库中；`pi_ref` 保存版本化引用，执行事件保存实现快照/版本、`pi_theta`、attempt 和 real/simulated/sidecar 来源。
- `contested/revoked/disabled` Option、失效前提和越权输入不得执行；Planner 只能提交 decision，不能绕过 Executor 直接产生副作用。
- 同一 idempotency key 不重复产生外部副作用。执行中崩溃或响应丢失时先对账，不能仅凭失败重试盲目重放。

P4-1/P4-3 故障测试至少覆盖：未知 `pi_ref`、I 不满足、输入/输出 schema 错误、实现抛错、取消信号、重复执行、执行中崩溃、响应丢失和过期 lease。每个测试必须区分真实副作用与模拟执行，且不得修改生产 RocksDB。

P4-3 已于 2026-11-17 验收通过。独立 RocksDB 真实重启覆盖决策后分发前崩溃、过期 lease、真实副作用后的 outcome 丢失和记忆执行保留；重复 trigger、timer、dry-run、stop、subtask 串行与日常记忆边界均通过。恢复遇到执行记录但无 outcome 时返回 `reconcile_required`，不盲目重放。完整 ID、故障注入与共享回归见 `docs/phase4-scheduler-acceptance.md`。

## 十二、Step P4-4：SuperAgent 隔离兼容探针

只在独立数据目录验证接口，不形成生产依赖或完整持续服务：

- 自定义 Executor 的 start/deliver/stop 可映射到 plan_run；
- assignmentStarted、report 和 Ticket Attention 回调可以往返；
- 重复 start/deliver 和 host restart 的幂等与恢复行为；
- Ticket、Assignment、Input ID 足以支撑确定性映射。

若核心契约无法映射，应在 Phase 4 内修订，不留待 Phase 5 返工。探针不替代 Phase 5 的 `superagent-adapter v0.1` 正式验收。

P4-4 已于 2026-11-17 验收通过。隔离探针完成确定性 Ticket/Assignment/Input 映射、assignmentStarted/report/Ticket Attention ACK、deliver 到 runtime inbox、重复输入防重和两次真实 RocksDB 重启恢复。回调失败保存 `reconcile_required`，不盲目重试；显式记忆不被宿主事件隐式复制。详见 `docs/superagent-isolation-probe.md` 与 `docs/phase4-superagent-acceptance.md`。

## 十二A、Step P4-5：Sidecar Mapping Contract v0.1

契约至少定义：

- scenario/run/tool/call 的映射；
- 确定性 id、external_id、mapping_version；
- baseline_id 隔离；
- `native / mapped / observed / uncalibrated` 来源；
- 未知 model、reward、rationale 的 null 语义；
- 原始 payload 保存位置；
- real/simulated/sidecar 证据隔离。

不得从调用序列反推 plan template，不得补写源 Agent 未暴露的决策理由。

### 12A.1 五项技能测量扩展

2026-11-17 追加前五项测量，舍弃第六项组合 DAG。Option 只增加可空 `created_at / parent_option_id / parent_version / origin_event_id` 创建血缘；不得用 sidecar 首次调用反推。

Sidecar 的 `skill.registered / skill.updated / skill.rollback` 只关联已注册 Option，不直接改写生命周期。其他映射统一复用现有事件：

- `subtask_event` 是问题实例，不新增 `problem_id`；
- execute/ignore decision 分析调用与未调用，ignore 不生成 option_event；
- `observed_option_version / observed_model_version` 保存历史观测版本；
- `environment` 写入 option_event 的 environment observation；
- `verification={verifier_id,verdict,evidence_refs}` 写入 model_event.critique，不能自动替代独立认证；
- `drift` 写入 model_event.drift，未提供时不创建；
- `revision_ref` 关联回滚，`lifecycle_ref` 从 option_event 继承到 drift。

完整字段、五项读取方式、迁移与验收纪律见 `devNotes/Week9-12开发手册-多源解析与可靠调度.md` §9.1。生产 9070 已于 2026-11-17 完成本轮新增字段迁移，备份为 `.data/production-lineage-backup-20261117-224512`，原计数、绑定、604/97 分组和 R4 边界不变。

P4-5 已于 2026-11-17 验收通过。`sidecar_event` 保存原始 payload、映射引用和 unmapped 原因；完整链可投影原生事件，不完整链保持 raw/null。raw-first 重启恢复、baseline 隔离、显式零奖励、冲突重放拒绝和原生 real 与 sidecar 观察分离均通过。追加扩展仅给 Option 增加可空创建血缘字段，使用现有 subtask/option/model/revision 支持新技能、调用时机、旧问题解决、环境漂移和回滚重启用五项测量；不实现组合 DAG。详见 `docs/sidecar-mapping-v0.1.md` 与 `docs/phase4-sidecar-acceptance.md`。

## 十二B、Step P4-6：日常记忆 STOMP 最小闭环（2026-11-17 新增，已通过）

仅做最小增量，不新增表或日常记忆字段：

- 将 `memory-capture@v1 / memory-revise@v1` 注册为 atomic Option，复用现有文档实现；OpenCode/DSH 统一经 subtask、explicit mandate、真实 execute decision 和 OptionExecutor 写入，不额外生成 Planner rationale。
- capture/revise 的默认目标是 data 层 DocumentProjection/chunk；chunk 同时作为 Recall 内容和可选事实来源，不建立独立 FactCandidate 持久层。需要推导时才经 ν 门形成 facts + source link。
- Recall 刷新外部 Markdown 必须通过 `markdown-note@v1`，Recall 读取本身不伪造执行事件；document superseding 与 declarative fact revision 不混用。
- OptionImplementationResult 可返回真实 `model_events=anticipation/critique/calibration/drift`，未提供时不创建；Sidecar 补 `pre_state/post_state/anticipation` 映射，实际状态与预测不混写。
- 先观察后适配，以一个 OpenCode 原生只读工具/Skill 和一个 DSH 原生工具/subagent 证明 NativeAdapter 的成功、失败、权限拒绝、取消与 `mode=real`，不重写 harness。

不实现组合 DAG、嵌套 Option、自动 Skill 生成、通用全类型适配、RL 或未来工具，不重放 RocksDB 原生历史。

专项故障覆盖 capture/revise 各写入阶段崩溃、缺 outcome 对账、文件读取中变化、解析/Recall 降级、非法 namespace/敏感路径、缺 mandate、撤销资产、未知实现、schema 错误、Sidecar 状态缺失/冲突、NativeAdapter 权限/超时/取消、host reload/unload 和旧库迁移回滚。任何失败不得伪造 Model 事件或重复记忆写入。

验收必须包含真实 OpenCode/DSH 新会话的 capture → 跨会话 Recall → revise → 再次 Recall，chunk 直接作事实来源、pre/post 与 anticipation 分离、real/sidecar 隔离、原七工具与共享记忆回归。详细实施和 A–G 清单见 `devNotes/Week9-12开发手册-多源解析与可靠调度.md` §9A 与 §十一。

**P4-6 执行验收签署：通过（Kimi Code CLI，2026-11-17），仅覆盖日常记忆 STOMP 最小闭环，不替代 Phase 4 原基线与整体验收。**

## 十三、Phase 4 增量验收

- P4-0 字段权威矩阵、增量迁移和回滚通过；关键 ID、J/≺、质量分组与 R4 边界不变。
- 原 Phase 4 解析、结算和七工具兼容验收独立通过。
- 重复 trigger 不重复建单或执行。
- 决策后、分发前崩溃可恢复且不重复副作用。
- Option 已产生副作用但响应丢失时按 idempotency key 对账，不盲目重放。
- wait 期间 Planner 调用次数为 0，timer 到期唤醒一次。
- 未授权主动规划只产生 dry-run，stop 不被自动事件绕过。
- OpenCode 与 DSH 的真实 LLM 均作出决策，tool/subagent 两类 Option 真实执行并回流；DSH 同切片验证通过。
- 两种 host 使用各自原生提问与审批，回答只唤醒一次；同一 plan_run 可跨 host 查询、回答或停止。
- SuperAgent 隔离探针证明 start/deliver/stop/report/Attention 可映射，但不计入完整持续服务验收。
- sidecar 可映射不完整资产链且不伪造语义。
- P4-6 capture/revise/Recall 刷新形成原生 STOMP 链，data 投影直接作为候选来源，世界状态与预测分离，最小 NativeAdapter 和真实双宿主记忆闭环通过；证据见 `docs/phase4-memory-stomp-acceptance.md`。

---

# Phase 5：持续父 Planner、SuperAgent Executor 正式适配与决策链可观测

## 十四、目标

在原 memory_why 和事件导出基础上，形成持续 planner-runtime，验证 DSH/OpenCode 共享同一控制状态，并完成 `superagent-adapter v0.1` 正式适配。SuperAgent 承接完整长期持续宿主，OptionMemory 不复制其 Ticket 状态机。

## 十五、Step P5-1：持续 planner-runtime

部署：

```text
Planner Agent + Scheduler + Option dispatcher
                │
                ▼
          MemoryCore HTTP
```

要求：

- 父 Planner 管理多个 subtask_event；
- 同一 subtask_event 决策串行；
- Planner 实例替换后从 MemoryCore 恢复；
- host Session 退出不影响持久任务状态；
- 进程内 timer 不是唯一调度依据；
- DSH/OpenCode 共用同一个 planner-runtime，不在宿主内分别持有权威队列；
- 跨 harness handoff 只在 Option 边界进行：暂停新分发、完成副作用对账、校验目标 Mandate/权限/能力、原子转移 lease并记录事件；不支持运行中 Option 热迁移，不自动迁移宿主授权、工作目录或后台进程。

## 十六、Step P5-2：SuperAgent Executor 正式适配（superagent-adapter v0.1）

实现 `src/plugins/superagent/executor.ts` 与 `events.ts`，映射：

- `start(ticket, assignment)` → 创建或恢复 plan_run；
- `deliver(ticket, assignment)` → 将 Trigger、Policy 变化和人工输入转为 Planner observation；
- `stop(ticket, assignment, reason)` → 持久化取消并阻止后续 Option 分发；
- Planner 开始、输入接收、Attention 和最终状态 → assignmentStarted/inputsDelivered/inputsRead/report 回调；
- **一个 Assignment 对应一个 plan_run/attempt**，plan_run 内可包含多个 Planner 决策和多个 option_event，不得映射为单个 option_event。

状态归属固定为：

| 事实 | 权威持有方 |
|---|---|
| Source、Thread、Ticket、Mandate、Assignment 外部生命周期 | SuperAgent |
| Subscription、follow-up ownership、Attention、Channel Outbox、人工 stop | SuperAgent |
| plan_run、Planner 决策、Option 执行事件、Model 校准、证据、J/≺、认证和撤销 | OptionMemory / MemoryCore |
| Ticket 内部规划控制面 | OptionMemory Planner，SuperAgent Eval 只做接单、授权和路由 |
| 并发约束 | SuperAgent Worker slot 约束 plan_run 数量；Option/subagent lease 与预算由 OptionMemory 另行控制 |

不得长期保留 SuperAgent Store 与 MemoryCore 两套同义控制事实。SuperAgent 原型版本、许可证、适配差异、DSH/Cordis 依赖和兼容性单独记录，不默认与现有 pin 兼容；Phase 4 隔离探针不能替代本 Step 的正式适配验收。

## 十七、Step P5-3：决策链血缘与导出

memory_why 在原推导链之外，可关联：

```text
结论 ← Option 执行
     ← Model 评价
     ← Planner 决策
     ← 当时状态、证据和版本
```

事件导出增加：

- planner_event*、option_event*、model_event；
- baseline_id、plan_run_id 和 host 类型；
- ticket/assignment/trigger 等外部 ID；
- real/simulated/sidecar；
- planner/instructions/inference/policy 版本过滤。

J/≺ 与 Planner 决策链通过 ID 关联，不混成一种边；plan_run 与 Assignment 也只通过 ID 关联，不形成第二种任务状态机。

## 十七A、Step P5-4：SuperAgent 持续记忆与跨宿主适配

详细任务与验收见 `devNotes/Week13-14开发手册-持续Planner与决策链导出.md` P5-4。OpenCode 日常记忆最小闭环已在 Phase 4 完成，本步骤不重复实现 Recall。

- `source_id + ticket_id + assignment_id + input_id → namespace/session_id/message_id/query_hash`，长期项目与临时 Assignment 隔离。
- deliver 使用同一 MemoryCore Recall 重建 Planner observation，不经过 OpenCode context hook，不复制召回实现。
- 捕获或修订先形成 candidate，经 Ticket Attention/Report.question 批准后应用；人工 stop 后不得继续自动捕获或恢复记忆驱动执行。
- OpenCode 与 SuperAgent 交叉读取同一 document/fact/recall_event，双方修订在下次 Recall/deliver 生效，不形成第二份记忆。
- handoff、重启和重复 deliver 按 query_hash/幂等键对账；新 Input 才刷新 Recall。
- Report 导出实际使用的 memory_uri、recall_id、策略版本、状态和批准引用，未知 rationale 不补写。

## 十八、Phase 5 增量验收

- 原 memory_why、事件导出和八工具验收独立通过。
- planner-runtime 重启不丢 inbox/outbox/subtask/plan_run 状态。
- DSH/OpenCode 写入同一事件链，不形成第二套控制事实。
- 可持续处理 timer、外部事件和 Option 结果。
- 跨 harness handoff 只发生在 Option 边界，权限不足或副作用未对账时 blocked，不重复副作用。
- SuperAgent start/deliver/stop/report/Attention 正式适配通过；一个 Assignment 对应一个 plan_run，多个 Option 可回放。
- SuperAgent 与 OptionMemory 的状态归属符合 P5-2，SuperAgent Eval 不越权规划 Ticket 内部实现。
- 能区分 Planner 选错、Option 失败、Model 不可用和证据失效。
- DSH rc 兼容性、升级回归和 RocksDB 数据保留有独立记录。
- Source/Ticket/Assignment 隔离、跨宿主 Recall/修订、Attention 批准、人工 stop 和 handoff 恢复通过；未重复建设 MemoryCore。

---

# Phase 6：主动规划、认证与 RL-ready 导出

## 十九、目标

在原生成和 ω_certify 基础上完善主动规划，并让同一事件链支持真实认证、OptionBench 和离线轨迹导出。

## 二十、Step P6-1：主动规划与生成

- 完善优先级、父/子 Planner 和子 Agent 委派。
- 主动发现与主动执行分离，主动执行必须命中 mandate/policy。
- generate_vec_candidate 使用 input_schema、实现快照、评价标准和 real/simulated 标记。
- 生成、校验、critique 和 replan 使用统一 option_event。
- plan_templates 保持原预留，不要求启用。

## 二十一、Step P6-2：认证证据统一

ω_certify 可使用真实 option_event_outcome 和 model_event critique/calibration，但必须：

- 按 baseline/context 分区；
- 排除或单列 simulated、未验证 sidecar 和 97 条待复核记录；
- 不把未校准 model 的自我评价当作独立证据；
- 保持 achievable 与 J={s,o,m} 的原语义；
- 保持 R4 阻塞边界。

## 二十二、Step P6-3：RL-ready 导出

导出：

```text
(
  state_ref,
  planner_decision,
  reward_components,
  scalar_reward?,
  next_state_ref,
  terminal,
  info
)
```

`info` 至少包含：

```text
planner_id / instructions_version / inference_ref
option_id / model_id / option_version / pi_ref
baseline_id
evidence_refs
real / simulated / sidecar
policy_version / mandate_ref
```

RL 导出是只读投影，不实现训练，不要求所有 Option 具有数值 T/R。模拟 rollout 必须显式标记，不进入真实认证。

## 二十二A、Step P6-4：SuperAgent 主动记忆治理与跨 harness 恢复

详细文件、故障测试和签署清单见 `devNotes/Week15-16开发手册-生成认证与SuperAgent持续适配.md` P6-4。OpenCode 日常闭环已在 Phase 4 验收，本步骤面向长期 Source/Ticket。

- 父 Planner 可基于 timer、mapping_stale、冲突、Option outcome 或来源修订提出记忆维护候选；主动发现与执行分离，执行必须命中 mandate/policy。
- 支持重读来源、生成候选、请求人工复核、重新 Recall、创建 superseding 候选和回滚；候选不得自评、自证或自动成为权威事实。
- 记忆维护使用统一 option_event/model_event，记录 parser/extractor 版本、成本、错误和 Ticket/Assignment；Recall 命中不等于能力认证。
- handoff 保存 query_hash、document/chunk、candidate/approval、lease、revision 和幂等键，目标重新校验 namespace/Mandate/active_release。
- 回滚发布指向旧结论的新 superseding 版本，不篡改历史；revoke 不替代 Ticket stop。
- Report/RL-ready 关联 memory_uri、recall_id、revision、approval 和真实执行事件，未知 rationale/reward 保持 null。
- 长期 Ticket 的 Attention、人工 stop、跨宿主恢复和真实适配验收不得以 mock 代替。

## 二十三、Phase 6 增量验收

- 原生成、认证和十工具验收独立通过。
- 父 Planner 能在授权范围内主动分解、调度和重规划。
- 生成和认证过程可回放完整决策与执行轨迹。
- 不同 baseline 和证据来源可隔离统计。
- RL-ready 导出不虚构状态、reward 或下一状态。
- simulated/sidecar 不进入真实认证成功率。
- 长期 Ticket 的维护候选、Attention 批准、人工 stop、跨 harness Recall/修订/恢复通过；认证不混用抽取器自评。

## 二十三A、后续治理扩展：评价 Option 与外部 verifier（不纳入当前 MVP）

> 2026-11-15 讨论补充。本节与《S01最小产品路线图-完整版》§13.7 对齐，是 Phase 6 之后的独立研发方向，不改变当前 source_priority、七工具、R4 阻塞和阶段验收承诺。

后续可新增 `option_score` 与 `external_verifier` 两类 settlement 模式。训练评价 Option 和外部 verifier 只生产评价证据，OptionMemory governance API 仍是唯一状态变更入口；候选 Option 不得自评赋权，Planner/verifier 不得直接写 facts/options/models。

评价契约至少包含候选 fact/option ID、逐项分数或 verdict、不确定度、证据引用、评价者及版本、baseline/context、执行事件和有效期；外部 verifier 增加签名或认证引用。配置按谓词声明 cardinality、单位和值归一化、策略模式、阈值、胜败状态映射、异常处理和策略版本，凭据只保存 `credentialRef`。

自动门控必须满足：

- 评价者与候选 Option 独立，评价 Option/Model 当前 `settled`，校准覆盖当前上下文且未出域；
- 阈值来自独立真实验证，simulated、未验证 sidecar 和 97 条待复核记录不得进入真实裁决成功率；
- 同级、分差不足、不确定度过高、缺证据、版本不匹配或出域时 `manual_review`；
- verifier 超时或不可用转 `manual_review`，签名无效、越权或证据篡改时 `blocked`；
- 请求与响应按幂等键对账，治理链可回放到 option_event、model_event 或 verifier 证据，重复请求不重复改变状态。

启用顺序固定为：EV0 影子建议 → EV1 人工确认辅助裁决 → EV2 限定 baseline/context 自动裁决 → EV3 逐域评审扩展。每阶段分别验证评价者独立性、阈值、签名、证据隔离、人工 stop、撤销、幂等和完整回放，未签署不得进入下一阶段。具体实施前仍须展开独立文件、接口和故障测试清单。

---

## 二十四、测试与故障验收

### 24.1 单元与真实 mnestic 集成测试

覆盖：

- Planner 注册和门控；
- 事件 v0.2 参数和引用完整性；
- Option 层级事件命名；
- decision gate 越权、缺参数、dry-run 和 stop；
- inbox/outbox 幂等、lease、重试和恢复；
- Datalog 完整执行链；
- sidecar 映射和 baseline 隔离；
- RL-ready 只读导出。

### 24.2 故障测试

必须使用独立 RocksDB 目录：

- 决策提交前后崩溃；
- outbox 分发前后崩溃；
- Option 执行中崩溃；
- Planner 进程替换；
- host reload/unload；
- lease 超时；
- 重复事件和响应丢失。

### 24.3 Host 验收

OpenCode 必须有真实 LLM 和真实 subagent 调用记录，不能只用 mock 证明平台联调完成。DSH 必须先完成兼容性探针和原 Phase 3 基线，再进行深度适配。

### 24.4 回归

- 原 Phase 0–2 测试全绿；
- 原 Phase 3–6 基线验收按各手册独立执行；
- 数据迁移前后比较行数、关键 id、J/≺ 和质量状态；
- 不在生产 RocksDB 中做故障或撤回测试。

### 24.5 日常记忆强制回归与增量交互

P4-1M 之后所有 Step 必须执行 `docs/memory-regression-acceptance.md` 的共享回归，并分别归档增量功能、记忆交互、质量/安全指标和未实现项：

- P4-2：DSH/OpenCode 联合召回、状态/来源一致和跨 host 修订。
- P4-3：崩溃、lease、重复 trigger、wait/stop 与记忆副作用边界。
- P4-4：Ticket/Assignment/Input 映射和重复 start/deliver 防重。
- P4-5：sidecar 不补写 rationale/model/reward，证据来源隔离。
- P5：持续 runtime、Ticket Attention、跨宿主修订、handoff 和 Report 证据。
- P6：主动维护候选、认证、RL-ready、长期 Ticket stop/恢复/回滚；Skill 版本和 active_release 一致。
- 每一步的真实宿主双会话或 Ticket 记录不可由 mock 替代，P4-1M 既有双会话不能作为后续免测证明。

---

## 二十五、阶段关闭清单

### Phase 3：planner-schema v0.1 + continuous-host contract v0.1

- [x] 原七工具与冲突治理通过。
- [x] Planner/Option/Model 增量 schema 可回滚。
- [x] 事件 v0.2、plan_run 和 option_event_* 命名落地。
- [x] 基础 decision gate 和 Datalog 图查询通过。
- [x] continuous-host contract 与原生 Attention 适配通过，未重复建设宿主交互或各自调度器。

### Phase 4：planner-runtime v0.1.0

- [x] P4-0 字段权威审计、增量迁移与回滚通过。
- [ ] 原解析与结算通过。
- [x] P4-1M Markdown 摄入、MemoryCore Recall、显式捕获/修订和 OpenCode 自动注入最小闭环通过。
- [x] inbox/outbox、lease、幂等、timer 和恢复通过。
- [x] OpenCode 真实 Planner 闭环通过。
- [x] DSH 同切片验证通过。
- [x] SuperAgent 隔离兼容探针通过。
- [x] Sidecar Mapping Contract v0.1 通过。

### Phase 5：planner-runtime v0.2.0 / superagent-adapter v0.1

- [ ] 原 memory_why 和八工具通过。
- [ ] 持续父 Planner 和实例恢复通过。
- [ ] DSH 适配不形成第二套控制状态。
- [ ] SuperAgent Executor 正式适配与 Assignment → plan_run 映射通过。
- [ ] Option 边界 handoff 和决策链血缘与事件导出通过。
- [ ] P5-4 SuperAgent 持续记忆、跨宿主 Recall/修订、Attention 和恢复通过。

### Phase 6：planner-runtime v0.3.0

- [ ] 原生成、认证和十工具通过。
- [ ] 主动规划不越权，人工 stop 持续有效。
- [ ] 真实/模拟/sidecar 证据隔离。
- [ ] RL-ready 导出通过，未把 RL 训练冒充为首版交付。
- [ ] P6-4 SuperAgent 主动记忆治理、Attention、stop、跨 harness 恢复和证据链通过。

---

## 二十六、文档纪律

- 原手册已完成步骤不改写。
- 原路线图、Track B 草案和本融合版手册同时保留，分别承担历史、设计讨论和实施依据。
- 各 Phase 归档原基线验收与 Planner 增量验收，不用单一版本号混称全部完成。
- SuperAgent 机制复用需记录来源、许可证、适配差异和兼容性证据。
- 若后续设计再次变化，新增修订记录，不覆盖本版已批准契约。
