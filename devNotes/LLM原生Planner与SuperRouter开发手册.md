---
创建时间: 2026-11-03
更新时间: 2026-11-06
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

## 九、Step P4-1：持久化队列

### 9.1 `runtime_inbox`

```text
event_id: String, pk
event_type: String
source: String
external_id: String?
payload: Json
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
status = pending / leased / done / dead / ignored
event_type = request / timer / option_outcome / model_event / human_input / host_event
```

`event_id` 由来源和外部幂等键确定生成；同一 trigger 重发不得产生第二条有效任务。

### 9.2 `runtime_outbox`

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

## 十、Step P4-2：调度循环与 Decision Gate

### 10.1 调度循环

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

Timer 的真实状态是 `available_at/waiting_condition`；进程内 timer 仅是唤醒提示。

### 10.2 Decision gate

检查：

- mandate/policy、scope、budget 和 allowed effects；
- execute 的 Option、参数和证据契约；
- contested/revoked/disabled 资产；
- decompose 是否扩权；
- retry 次数；
- ask 是否只有一个明确问题；
- dry-run 是否只记录建议；
- stop/pause 是否仍有效。

## 十一、Step P4-3：OpenCode Planner

### 11.1 Planner Agent

`.opencode/agents/optionmemory-planner.md`：

- `mode=primary`；
- 默认禁止 edit/shell/subagent 等直接执行权限；
- 只开放 Planner 专用只读查询和 `planner_decision`；
- 每次返回 decision_json，不只输出自然语言计划；
- 必须引用证据和未知项，不得扩大 mandate。

`planner_decision` 使用独立 Planner 契约，不加入原 OptionMemory host 工具清单。

### 11.2 两类真实 Option

1. tool Option：`infer_phase_structure_from_xrd`，调用既有 R2/deriveClosure。
2. subagent Option：例如 `review_s01_evidence`，调用只读 materials evidence reviewer。

子 Agent 的 Session、目录或后台运行只是 Option 的运行配置，不建立 Executor 资产。

### 11.3 事件回流

OpenCode 的 session/subagent/tool 事件先转换为 runtime_inbox，再唤醒 Planner。至少处理：

```text
session.idle
session.error
tool.execute.after
subagent 完成通知
人工新输入
```

host 事件与 option_event 必须确定性去重；无法可靠映射时写异常并停止自动重放。

### 11.4 解析工作负载接入

parse_csv_materials 的批次使用 outbox 和 idempotency key；parser 版本写入 execution_json。解析结果、闭包和 J 血缘仍走原服务层，不另建解析专用事件体系。

## 十二、Step P4-4：Sidecar Mapping Contract v0.1

契约至少定义：

- scenario/run/tool/call 的映射；
- 确定性 id、external_id、mapping_version；
- baseline_id 隔离；
- `native / mapped / observed / uncalibrated` 来源；
- 未知 model、reward、rationale 的 null 语义；
- 原始 payload 保存位置；
- real/simulated/sidecar 证据隔离。

不得从调用序列反推 plan template，不得补写源 Agent 未暴露的决策理由。

## 十三、Phase 4 增量验收

- 原 Phase 4 解析、结算和七工具兼容验收独立通过。
- 重复 trigger 不重复建单或执行。
- 决策后、分发前崩溃可恢复且不重复副作用。
- Option 已产生副作用但响应丢失时按 idempotency key 对账，不盲目重放。
- wait 期间 Planner 调用次数为 0，timer 到期唤醒一次。
- 未授权主动规划只产生 dry-run，stop 不被自动事件绕过。
- OpenCode LLM 真实作出决策，tool/subagent 两类 Option 真实执行并回流。
- sidecar 可映射不完整资产链且不伪造语义。

---

# Phase 5：持续父 Planner、DSH 与决策链可观测

## 十四、目标

在原 memory_why 和事件导出基础上，形成持续 planner-runtime，并验证 DSH/OpenCode 共享同一控制状态。

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
- 进程内 timer 不是唯一调度依据。

## 十六、Step P5-2：DSH SuperAgent 评估与适配

| SuperAgent | 本路线 |
|---|---|
| Source / Trigger | runtime_inbox 来源事件 |
| Ticket | subtask_event |
| Mandate | mandate_json + decision gate |
| Main Session | 父 Planner Agent |
| Assignment | option_event，需核查粒度差异 |
| Report | option_event_outcome |
| Outbox | runtime_outbox |
| Worker slot | Option 并发与 lease |

不得长期保留 SuperAgent Store 与 MemoryCore 两套控制事实。DSH 深度适配以原 Phase 3 首版和 pin rc 兼容性验证为前置。

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
- baseline_id；
- real/simulated/sidecar；
- planner/instructions/inference/policy 版本过滤。

J/≺ 与 Planner 决策链通过 ID 关联，不混成一种边。

## 十八、Phase 5 增量验收

- 原 memory_why、事件导出和八工具验收独立通过。
- planner-runtime 重启不丢 inbox/outbox/subtask 状态。
- DSH/OpenCode 写入同一事件链，不形成第二套控制事实。
- 可持续处理 timer、外部事件和 Option 结果。
- 能区分 Planner 选错、Option 失败、Model 不可用和证据失效。
- DSH rc 兼容性、升级回归和 RocksDB 数据保留有独立记录。

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

## 二十三、Phase 6 增量验收

- 原生成、认证和十工具验收独立通过。
- 父 Planner 能在授权范围内主动分解、调度和重规划。
- 生成和认证过程可回放完整决策与执行轨迹。
- 不同 baseline 和证据来源可隔离统计。
- RL-ready 导出不虚构状态、reward 或下一状态。
- simulated/sidecar 不进入真实认证成功率。

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

---

## 二十五、阶段关闭清单

### Phase 3：planner-schema v0.1 + continuous-host contract v0.1

- [ ] 原七工具与冲突治理通过。
- [ ] Planner/Option/Model 增量 schema 可回滚。
- [ ] 事件 v0.2、plan_run 和 option_event_* 命名落地。
- [ ] 基础 decision gate 和 Datalog 图查询通过。
- [ ] continuous-host contract 与原生 Attention 适配通过，未重复建设宿主交互或各自调度器。

### Phase 4：planner-runtime v0.1.0

- [ ] 原解析与结算通过。
- [ ] inbox/outbox、lease、幂等、timer 和恢复通过。
- [ ] OpenCode 真实 Planner 闭环通过。
- [ ] Sidecar Mapping Contract v0.1 通过。

### Phase 5：planner-runtime v0.2.0

- [ ] 原 memory_why 和八工具通过。
- [ ] 持续父 Planner 和实例恢复通过。
- [ ] DSH 适配不形成第二套控制状态。
- [ ] 决策链血缘与事件导出通过。

### Phase 6：planner-runtime v0.3.0

- [ ] 原生成、认证和十工具通过。
- [ ] 主动规划不越权，人工 stop 持续有效。
- [ ] 真实/模拟/sidecar 证据隔离。
- [ ] RL-ready 导出通过，未把 RL 训练冒充为首版交付。

---

## 二十六、文档纪律

- 原手册已完成步骤不改写。
- 原路线图、Track B 草案和本融合版手册同时保留，分别承担历史、设计讨论和实施依据。
- 各 Phase 归档原基线验收与 Planner 增量验收，不用单一版本号混称全部完成。
- SuperAgent 机制复用需记录来源、许可证、适配差异和兼容性证据。
- 若后续设计再次变化，新增修订记录，不覆盖本版已批准契约。
