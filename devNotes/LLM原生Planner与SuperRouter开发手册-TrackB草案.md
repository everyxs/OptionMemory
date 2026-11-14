---
创建时间: 2026-11-03
类型: 开发手册草案
所属项目: "26-04 AI4Science"
对应路线图: "S01最小产品路线图-LLM原生Planner扩展草案（Track B）"
状态: 待评审，未批准实施
tags:
  - 开发手册
  - 修订草案
  - Track-B
  - LLM-Planner
  - SuperRouter
  - OptionBench
---

# LLM 原生 Planner 与 Super Router 开发手册（Track B 草案）

> 本手册是新增实施草案，不替换 Week 1–16 原开发手册。
>
> 已完成的 Phase 0、Phase 1 R1–R3 部分验收、Phase 2 Step 1–3 不改写；Phase 2 Step 4–5 和原 Phase 3–6 仍按原手册实施。Track B 使用独立的 `planner-runtime` 版本线，不改变原 DSH/OpenCode v0.1.0–v0.4.0 的工具清单和验收口径。
>
> 本手册未获评审批准前，不修改源码、schema 或生产 RocksDB。

---

## 一、实施边界

### 1.1 不变约束

- R4 阻塞不变，禁止借 Track B 批量派生 delta 或宣称完整 R1–R4 已通过。
- `revision/gate_audit` 谓词和既有修订语义不变。
- `plan_templates` 保留原空表预留，不删除、不改造为 Planner。
- 原 host-neutral `OPTIONMEMORY_TOOL_CONTRACTS` 不加入 Planner 工具，避免改变原版本工具数。
- 核心 `src/memory`、`src/api`、`src/runtime` 不引入 DSH/OpenCode 专有依赖。
- CozoScript 继续集中于 `MnesticClient`，业务层不得拼接查询或写入语句。
- 新 schema 只做可审查的增量迁移；禁止删表重建生产数据。

### 1.2 Track B 核心分工

```text
Planner Agent：
  基于 LLM 作出 execute/decompose/replan/retry/wait/ask/stop/ignore 决策

Scheduler Runtime：
  inbox/outbox、timer、lease、幂等、唤醒、恢复和并发控制

Option：
  统一执行 tool/skill/api/llm_workflow/subagent/device

Model：
  为 Planner 提供 Option 级 anticipation、evidence、critique 和局限

MemoryCore：
  保存资产、授权、事件、队列和全部可恢复状态
```

Executor 仅是 Option 的内部工程实现，不新增领域资产。

---

## 二、建议新增文件边界

以下均为后续实施建议，本草案不创建这些代码文件：

```text
schema/
  09_planners.cozo
  10_runtime_inbox.cozo
  11_runtime_outbox.cozo

src/
  memory/
    planner.ts                 # Planner 类型、列常量和决策类型
    scheduler.ts               # inbox/outbox 行类型与状态词表
    events.ts                  # 增量事件 v0.2 构造器；保留治理事件
  api/
    planner-registry.ts        # Planner 注册与校验
    planner-contracts.ts       # 独立决策契约，不改原 host 工具清单
    telemetry.ts               # 事件写入和引用检查
    scheduler.ts               # 持久化队列服务
  runtime/
    planner.ts                 # host-neutral Planner Agent 接口与恢复
    decision-gate.ts           # mandate、权限、参数和预算校验
    scheduler.ts               # inbox/outbox 调度循环
    option-executor.ts         # Option 内部运行实现，不是新资产
  plugins/
    opencode/
      planner.ts               # OpenCode Planner 适配
      planner-events.ts        # host 事件转 inbox
    dsh/
      planner.ts               # 后续 DSH 适配

.opencode/
  agents/
    optionmemory-planner.md
    materials-evidence-reviewer.md
  plugins/
    optionmemory-planner.ts    # 独立 Planner 入口，复用核心契约

tests/
  planner-assets.test.ts
  telemetry-v02.test.ts
  decision-gate.test.ts
  scheduler.test.ts
  planner-opencode.test.ts
  sidecar-mapping.test.ts
  trajectory-export.test.ts
```

`src/api/planner-contracts.ts` 与原 `tool-contracts.ts` 分离。只有经过单独版本评审后，才能决定是否向某一 host 暴露 Planner 管理工具。

---

## 三、B1：资产与事件扩展

### 3.1 Planner 表

建议 `schema/09_planners.cozo`：

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

`inference_ref` 指 Planner 使用的 LLM 后端，不得写成 Option 的 `model_id`。Planner 不持有唯一任务状态，真实状态必须可从事件事务重建。

### 3.2 Option/Model 增量字段

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

既有字段、类型和已完成资产记录不改写。未校准 model 使用 `status="probation"`、空校准历史和显式未知标记；Planner 不得把未校准数值字段当作可靠预测。

实施前先探针 mnestic 的增量迁移能力，形成可回滚迁移脚本和行数校验。若只能重建关系，必须停止并单独评审迁移方案，不得静默删表。

### 3.3 事件 v0.2

原 Phase 2 Step 1 文档不改写；新增 `docs/planner-event-schema-v0.2.md` 作为 Track B 定稿文件。

#### `subtask_event`

```text
[
  subtask_event_id,
  subtask_id,
  baseline_id,
  mandate_json
]
```

`mandate_json` 至少包含：

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

#### `planner_event`

```text
[
  planner_event_id,
  subtask_event_id,
  planner_id,
  context_json
]
```

`context_json` 至少包含：

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

#### `planner_event_decision`

```text
[
  planner_event_id,
  decision_type,
  decision_json
]
```

`decision_type`：

```text
execute / decompose / replan / retry / wait / ask / stop / ignore
```

统一 `decision_json`：

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

非 execute 决策使用各自可选字段，不得伪造 option_id。`decompose` 返回 subtask 提议，`wait` 返回唤醒条件，`ask` 返回一个明确问题，`retry` 返回目标 option_event_id。

#### `option_event`

```text
[
  option_event_id,
  planner_event_id,
  option_id,
  model_id,
  execution_json
]
```

`execution_json` 至少包含：

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

#### `option_event_observation`

```text
[
  observation_event_id,
  option_event_id,
  observation_type,
  value_json
]
```

首版类型：

```text
input / context / pre_state / output / post_state / environment / error
```

#### `option_event_outcome`

```text
[
  option_event_id,
  status,
  evaluation_json,
  cost_json,
  error_json
]
```

首版 `status=success|failure|blocked`。`evaluation_json` 支持：

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

#### `model_event`

```text
[
  model_event_id,
  model_id,
  event_type,
  payload_json
]
```

首版 `event_type=anticipation|critique|calibration|drift`。

### 3.4 内部 API

```typescript
registerPlanner(...)
beginSubtaskExecution(...)
beginPlannerEvent(...)
recordPlannerDecision(...)
beginOptionExecution(...)
recordOptionObservation(...)
finishOptionExecution(...)
recordModelEvent(...)
```

门控检查：

- 所有引用资产和事件存在；
- Planner、Option、Model 的状态允许当前操作；
- Option 的 subtask/model 绑定一致；
- option_event 只能由已通过 gate 的 planner decision 创建；
- 一个 option_event 只有一个最终 outcome；
- sidecar/simulated/real 不混写；
- 未授权主动执行只能 dry-run。

### 3.5 B1 验收

- 能用 Datalog 查询完整资产与事件图；
- Option 子事件谓词严格为 `option_event_observation/outcome`；
- 无 model 时可登记未校准壳，但无伪造预测；
- 既有 revision、J/≺ 和 Phase 0–2 测试不回归；
- RocksDB 行数与关键资产 id 在迁移后保持，新增列可回滚。

---

## 四、B2：可靠调度内核

### 4.1 `runtime_inbox`

建议字段：

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

### 4.2 `runtime_outbox`

建议字段：

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

Planner 决策事件与 outbox 记录必须在同一持久化边界内提交。若当前 mnestic 无法保证跨关系原子写入，停止并报告，不得用“先执行后补日志”冒充可靠语义。

### 4.3 调度循环

```text
1. 领取到期 inbox（lease）
2. 重建 subtask/planner 上下文
3. 调用 Planner Agent
4. decision gate 校验
5. 同事务保存 planner_event_decision + outbox
6. 将 inbox 标 done
7. 领取到期 outbox
8. 创建/更新 option_event 并分发
9. Option 结果先写 inbox，再唤醒后续 Planner
10. 崩溃后回收过期 lease
```

Timer 的持久化来源是 `available_at/waiting_condition`；进程内 timer 仅是唤醒提示，不是真实任务状态。

### 4.4 Decision gate

必须检查：

- mandate/policy 是否允许当前决策；
- 是否越出 scope、budget 或 allowed effects；
- execute 的 Option、参数和证据是否满足调用契约；
- contested/revoked/disabled 资产是否被非法使用；
- decompose 是否越权扩大范围；
- retry 是否超过次数；
- ask 是否只有一个明确问题；
- dry-run 是否只记录建议而未分发执行；
- stop/pause 是否仍然有效。

### 4.5 B2 验收

在独立 RocksDB 测试目录执行，不触碰生产数据：

1. 同一 external trigger 重发，subtask_event 和 option_event 不重复。
2. 决策提交后、分发前终止进程，恢复后只分发一次。
3. Option 已产生副作用但响应丢失时，按 idempotency key 对账，不盲目重放。
4. lease 过期可恢复，活跃 lease 不被其他实例抢占。
5. wait 期间 Planner 调用次数为 0，timer 到期后唤醒一次。
6. 未授权主动规划只产生 dry-run。
7. 人工 stop 后，timer/host event 不得恢复执行。
8. 同一 subtask_event 的决策严格按 decision_seq 串行。

---

## 五、B3：OpenCode Planner 垂直闭环

### 5.1 定位

B3 验证交互式 Planner，不宣称完整持续 Super Router。它可以与原 Phase 3 并行，但不替代原 DSH/OpenCode 七工具验收。

### 5.2 Planner Agent

建议 `.opencode/agents/optionmemory-planner.md`：

- `mode=primary`；
- 默认禁止 edit/shell/subagent 等直接执行权限；
- 只允许 Planner 专用只读查询和 `planner_decision`；
- 要求每次决策返回 `decision_json`，不得只输出自然语言计划；
- 要求引用证据和未知项；
- 不允许自行扩大 mandate。

`planner_decision` 属于独立 Planner 契约，不加入原 OptionMemory host 工具清单。

### 5.3 两类真实 Option

至少验证：

1. **tool Option**：`infer_phase_structure_from_xrd`，调用既有 R2/deriveClosure 路径。
2. **subagent Option**：例如 `review_s01_evidence`，调用只读 materials evidence reviewer，返回结构化评价。

子 Agent 的 Session、目录或后台运行只是 Option 的运行配置，不建立 Executor 资产。

### 5.4 事件回流

OpenCode 的 session/subagent/tool 事件先转换为 runtime_inbox，再唤醒 Planner。不得只在插件内存保存完成状态。

首版至少处理：

```text
session.idle
session.error
tool.execute.after
subagent 完成通知
人工新输入
```

host 事件与 MemoryCore option_event 的对应关系必须确定性去重；无法可靠映射时写异常并停止自动重放。

### 5.5 B3 验收

- Planner 实际由 OpenCode LLM 调用，而非测试直接返回预写决策。
- tool 和 subagent 两类 Option 都真实执行并产生 observations/outcome。
- Planner 能根据失败 outcome 作出 replan/ask/stop，而不是固定重试。
- 原始 host 事件、planner decision 和 option outcome 可用同一 id 链回查。
- 原 OpenCode 四工具测试和 Phase 0–2 测试不回归。
- 原 Phase 3 的七工具和未来工具开放边界不变。

---

## 六、B4：持续父 Planner 与 DSH 评估

### 6.1 持续运行

在独立 planner-runtime 进程中运行：

```text
Planner Agent + Scheduler + Option dispatcher
                │
                ▼
          MemoryCore HTTP
```

OpenCode/DSH 可作为 Planner 推理和交互入口，但 scheduler 的真实状态不依赖 host Session 是否存活。

### 6.2 DSH SuperAgent 评估原则

以“路线 B 为目标、SuperAgent 为实现参考”：

| SuperAgent | Track B |
|---|---|
| Source / Trigger | runtime_inbox 来源事件 |
| Ticket | subtask_event |
| Mandate | mandate_json + decision gate |
| Main Session | 父 Planner Agent |
| Assignment | option_event，需核查粒度差异 |
| Report | option_event_outcome |
| Outbox | runtime_outbox |
| Worker slot | Option 并发与 lease |

不得长期保留 SuperAgent Store 与 MemoryCore 两套控制事实。若只做 DSH 隔离探针，必须使用独立数据目录并明确非正式交付。

### 6.3 B4 验收

- 进程退出后 timer、inbox、outbox 和 subtask 状态保留。
- Planner 实例替换后可以从 MemoryCore 恢复，不依赖旧 Session。
- DSH/OpenCode 的决策与执行结果写入同一事件链。
- 多来源事件不会绕过统一 decision gate。
- DSH rc 兼容性、升级回归和 RocksDB 数据保留有独立记录。
- 不把 SuperAgent 研究原型未经测试地声明为生产依赖。

---

## 七、B5：OptionBench sidecar 与 RL-ready 导出

### 7.1 Sidecar Mapping Contract

新增契约至少定义：

1. 外部 scenario/run/tool/call 到资产和事件的映射；
2. 确定性 id、external_id 和重跑幂等；
3. mapping_version 与 lin_*；
4. baseline_id 隔离；
5. `native / mapped / observed / uncalibrated` 来源；
6. 未知 model、reward、rationale 的 null 语义；
7. 原始 payload 保存位置；
8. real/simulated/sidecar 证据隔离。

不得从调用序列反推 plan template，不得由 sidecar 补写源 Agent 未暴露的决策理由。

### 7.2 RL-ready 轨迹

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

RL 导出是只读投影，不在 B5 实现训练，也不要求所有 Option 都具有数值 T/R。

### 7.3 B5 验收

- 无原生资产链的通用 Agent 可映射监测。
- 同一 option 跨多次调用复用，不重复注册。
- 不同 baseline 的证据和统计可隔离。
- 未知 reward/rationale/model 不被伪造。
- simulated/sidecar 不进入真实认证成功率。
- 同一事件图可服务 Planner、OptionBench 和轨迹导出。

---

## 八、测试策略

### 8.1 单元与真实 mnestic 集成测试

新增测试覆盖：

- Planner 注册与六元组门控；
- 事件 v0.2 参数和引用完整性；
- Option 层级事件命名；
- decision gate 的越权、缺参数、dry-run 和 stop；
- inbox/outbox 幂等、lease、重试和恢复；
- Datalog 完整执行链查询；
- sidecar 映射与 baseline 隔离；
- RL-ready 只读导出。

### 8.2 故障测试

故障测试必须使用独立 RocksDB 目录：

- 决策提交前后崩溃；
- outbox 分发前后崩溃；
- Option 执行中崩溃；
- Planner 进程替换；
- host reload/unload；
- lease 超时；
- 重复事件和响应丢失。

### 8.3 Host 验收

OpenCode 必须有真实 LLM 和真实 subagent 调用记录，不能只用 mock 证明平台联调完成。DSH 必须先完成兼容性探针和原 Phase 3 基线，再进行 Track B 深度适配。

### 8.4 回归要求

- 原 Phase 0–2 测试全绿；
- 原 Phase 3–6 后续验收按各自手册执行；
- 数据迁移前后做行数、关键 id、J/≺ 和质量状态快照；
- 不创建测试输出或日志到生产 RocksDB。

---

## 九、版本与文档纪律

- Track B 首版可独立标记为 `planner-runtime v0.1.0`，不与插件 v0.1.0 混同。
- 原插件工具数量、manifest 和版本路线不因 Planner 内部能力自动改变。
- 本草案获批准后，保留草案并另建定稿文件或在文件头追加批准记录，不删除讨论历史。
- 原开发手册已完成步骤不改写；若新契约影响后续未实施步骤，只在对应手册中追加指向 Track B 的新增修订段，不覆盖原文。
- 任何 SuperAgent 机制复用均需记录来源、许可证、适配差异和兼容性证据。

---

## 十、Track B Repo 验收清单（草案）

### A. 资产与事件

- [ ] Planner 注册和版本信息完整。
- [ ] Option 是唯一的对外动作执行面，无 Executor 平行资产。
- [ ] Model 支持 anticipation/critique，未知能力明确为空。
- [ ] 事件采用 `option_event_*` 层级命名。
- [ ] Datalog 可遍历完整 subtask-planner-option-model 执行图。

### B. 调度与治理

- [ ] inbox/outbox 持久化且幂等。
- [ ] decision gate、mandate、budget、dry-run 和 stop 生效。
- [ ] wait/timer/唤醒不依赖 LLM 空转。
- [ ] Planner 与 Option 可独立恢复。
- [ ] 同一 subtask 决策串行，外部副作用可防重。

### C. Host 与 sidecar

- [ ] OpenCode 真实 Planner/Option 闭环通过。
- [ ] DSH 适配不形成第二套控制状态。
- [ ] sidecar 可映射不完整资产链且不伪造语义。
- [ ] baseline、real/simulated/sidecar 证据隔离。

### D. RL-ready 与回归

- [ ] 可导出 Planner 动作空间的轨迹。
- [ ] 数值 T/R 不是 LLM 调度的前置条件。
- [ ] 原已完成步骤、测试和验收不回归。
- [ ] R4 阻塞、原插件版本和原 Phase 3–6 规划不被替代。

---

## 十一、评审时需要确认的实施选择

1. 是否接受新增 `planners`，同时保留原 `plan_templates` 空表。
2. 是否接受 Planner 专用契约与原 host 工具契约分离。
3. 是否接受 runtime_inbox/outbox 作为两张工程关系，而非 facts 中的普通审计事件。
4. 是否接受 B3 先做 OpenCode 交互闭环，B4 再验证持续 Super Router。
5. 是否接受 B5 只承诺 RL-ready 导出，不承诺首版 RL 训练。
6. 是否接受以独立故障测试作为“可靠调度”关闭条件，而不是仅凭一次正常演示签署。
