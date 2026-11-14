---
创建时间: 2026-11-03
类型: 路线图修订草案
所属项目: "26-04 AI4Science"
对应路线图: "S01最小产品路线图（OptionMemory 版）"
状态: 待评审，未批准实施
tags:
  - 路线图
  - 修订草案
  - Track-B
  - LLM-Planner
  - SuperRouter
  - OptionMemory
---

# S01 最小产品路线图：LLM 原生 Planner 与 Super Router 扩展草案（Track B）

> 本文是《S01 最小产品路线图》的**新增扩展草案**，不是对原路线图的替换。
>
> 原 Phase 0–6、已完成步骤、既有验收记录、DSH/OpenCode v0.1.0–v0.4.0 工具版本规划均保持原样。本文新增的 Planner、调度运行时和事件契约使用独立的 **Track B / planner-runtime 版本线**，不得用于提前宣布原 Phase 3–6 已完成。
>
> 配套实施草案见《LLM原生Planner与SuperRouter开发手册-TrackB草案》。本文件未获评审批准前，不进入代码实施。

---

## 一、修订背景

原路线以五层记忆、Horn 闭包、J/≺、修订传播、治理、Option 注册与认证为主线，能够保存知识、能力和执行证据，但尚未定义一个持续运行的 LLM 调度主体。

本次讨论形成以下新需求：

1. MemoryCore 第一期需要支持 OptionBench sidecar；被监测的通用 Agent 不一定原生具备完整 subtask–option–model 资产链。
2. Planner 需要成为基于 LLM 的控制面 Agent，而不是 ModelPlannerView 或静态 plan template。
3. 顶层父 Planner 应承担全局接单、分解、选择、重规划和主动规划，但持续调度需要可靠的持久化运行时。
4. Option 统一承载 skill、工具、API、LLM workflow、subagent 和设备执行，不另设 Executor 领域资产。
5. LLM 原生调度是主路径，同时在 Agent 动作空间保留状态、动作、reward、状态转移和 rollout 的导出契约，为未来 RL 保留可能。
6. OpenCode 与 DSH 可复用同一 MemoryCore 和调度契约，不能分别形成两套事实、事件和调度核心。

---

## 二、不变项与新增项

### 2.1 原路线不变项

- Phase 0 已关闭的验收结论不变。
- Phase 1 R1–R3 部分验收不变；R4 阻塞及其开放条件不变。
- Phase 2 已完成的 Step 1–3 不改写，未完成的 Step 4–5 仍按原手册实施和验收。
- Phase 3 的 450/512 HV 多来源冲突治理、DSH/OpenCode v0.1.0 七工具交付不替代。
- Phase 4–6 的解析、血缘、生成、认证与插件版本迭代不覆盖。
- `revision`、`gate_audit` 及既有 facts、justifications 的语义不变。
- `plan_templates` 保留原预留定位；Track B 不依赖 plan template，也不通过删除该表获得 Planner 能力。

### 2.2 Track B 新增项

- 新增 Planner 资产和基于 LLM 的 Planner Agent。
- 新增 subtask/planner/option/model 运行事件契约 v0.2。
- 新增可靠调度运行时：inbox、outbox、timer、等待、唤醒、lease、幂等与恢复。
- 新增 mandate 与 decision gate，约束主动规划和 Planner 决策。
- 新增 OptionBench sidecar 映射契约与 baseline 隔离。
- 新增面向 LLM 的 Option 级语义世界模型，并保留可选 RL 轨迹导出。

---

## 三、目标与非目标

### 3.1 目标

形成一个 host-neutral 的 LLM 原生控制面：

```text
外部请求 / Timer / Option 结果 / Model drift
                  │
                  ▼
        持久化 inbox + 确定性 gate
                  │
                  ▼
             父 Planner Agent
                  │
                  ▼
      planner_event_decision + decision gate
                  │
                  ▼
        持久化 outbox → Option 执行
                  │
                  ▼
      observations / outcomes / model critique
                  │
                  └──── 再次唤醒 Planner
```

父 Planner 是单一逻辑控制面，但不要求单进程。其长期状态由 MemoryCore 持久化，LLM Session 只是可替换的推理上下文。

### 3.2 非目标

- 不把 Planner 降格为静态视图或一次 prompt 调用。
- 不把 Executor 建立为与 Option 平行的新领域资产。
- 不要求 LLM 不间断生成 token；“不间断”指事件驱动的持久调度。
- 不从调用序列反推 plan template，不虚构源 Agent 的决策理由。
- 不在第一阶段实现 RL 训练、完整多 Agent 平台或生产级高可用集群。
- 不用 Track B 的版本号替代原插件能力版本或原阶段验收。

---

## 四、核心资产模型

### 4.1 链条与职责

```text
                   Planner
              决策、分解、重规划
                     │
                     ▼
subtask ─────────→ option ─────────→ model
目标与交付要求      能力契约 + 执行实现    Option 级世界模型
                     │                   anticipation/critique
                     ▼
                option_event
```

| 资产 | 职责 |
|---|---|
| `subtask` | 目标、上下文、交付要求与约束 |
| `option` | 能力说明、调用参数、执行实现、结果契约 |
| `model` | Option 级语义世界模型、证据、经验、评价和已知局限 |
| `planner` | 版本化 LLM 调度主体，产生结构化决策 |

Planner 可服务多个 subtask，不与 subtask 做 1:1 绑定。Option 与 model 保持 Option 粒度绑定。

### 4.2 Option 即执行能力，不新增 Executor 资产

Option 现有 `pi_*` 字段继续描述执行实现：

```text
claim               能力说明
input_schema        调用参数
i_preconditions     调用前提与约束
pi_type             tool / skill / api / llm_workflow / subagent / device
pi_ref              实现引用
pi_fallback         回退实现
beta_success        结果与交付要求
beta_output_schema  输出结构
```

代码中的 option executor 仅是内部工程模块，不建立 `ExecutorRow`、`executor_event` 或独立 Executor 资产关系。

子 Agent 从父 Planner 看仍是一次 Option 执行；若其内部存在另一 Planner，可通过 `parent_option_event_id` 关联嵌套事件链。

### 4.3 Planner 是资产，不是 PlannerView

建议新增 `planners` 关系，字段契约在配套手册中定义，至少包含：

- `instructions_ref` / `instructions_version`；
- `inference_ref`，避免与 Option model 重名；
- `context_policy`；
- `decision_schema`；
- `tool_policy`；
- `budget_policy`；
- `verify/status/lin_*`。

Planner 决策类型首版为：

```text
execute / decompose / replan / retry / wait / ask / stop / ignore
```

所有对外动作由 Option 执行；`decompose/wait/ask/stop` 等属于 Planner 控制决策，不强行包装成 Option。

---

## 五、Option 级 Model 的 LLM 原生定义

Model 是 Option 粒度的世界模型，但不再以数值状态转移和标量 reward 作为必要条件。

### 5.1 两类核心能力

```text
anticipation：
  预判执行后可能新增或改变的事实、产物、风险和未知项

critique：
  根据 subtask 目标、Option 结果契约和证据评价实际结果
```

建议新增可空 JSON 字段：

```text
reasoning_spec
evidence_spec
evaluation_spec
```

- `reasoning_spec`：语义预判指令、上下文和输出 schema、已知限制。
- `evidence_spec`：必要观察、查询引用、成功/失败样例和证据要求。
- `evaluation_spec`：评价标准、rubric 和结构化 verdict schema。

未知模型能力保持 null 或 `uncalibrated`，不得用 0、空通过率或自动生成的文字冒充已知世界模型。

### 5.2 保留 RL 兼容能力

Track B 抛弃的是 LLM 调度对传统数值 T/R/rollout 的依赖，不删除这些语义。

统一事件链可导出：

```text
planner_event.context          → s_t
planner_event_decision         → a_t
option_event_observation       → 环境观察和状态转移
option_event_outcome           → r_t / done / cost / info
下一次 planner_event.context   → s_{t+1}
```

RL 动作空间是 Planner 决策空间，包括控制动作和 `execute(option, arguments)`。真实、模拟和 sidecar 轨迹必须明确区分；模拟 rollout 不得作为真实认证证据。

---

## 六、运行事件契约 v0.2

### 6.1 兼容原则

原 Phase 2 Step 1 的事件 schema v0.1 和已完成记录不改写。Track B 以新增 v0.2 契约定义以下谓词；既有 `revision/gate_audit` 保持不变。

### 6.2 层级命名

```text
subtask_event
planner_event
planner_event_decision
option_event
option_event_observation
option_event_outcome
model_event
```

Option 子事件统一使用 `option_event_*`，不采用 `option_*_event`。

### 6.3 参数契约

```text
subtask_event(
  subtask_event_id,
  subtask_id,
  baseline_id,
  mandate_json
)

planner_event(
  planner_event_id,
  subtask_event_id,
  planner_id,
  context_json
)

planner_event_decision(
  planner_event_id,
  decision_type,
  decision_json
)

option_event(
  option_event_id,
  planner_event_id,
  option_id,
  model_id,
  execution_json
)

option_event_observation(
  observation_event_id,
  option_event_id,
  observation_type,
  value_json
)

option_event_outcome(
  option_event_id,
  status,
  evaluation_json,
  cost_json,
  error_json
)

model_event(
  model_event_id,
  model_id,
  event_type,
  payload_json
)
```

规则：

- 可 join、过滤的 ID、类型和状态使用独立字符串参数；详情使用 JSON。
- `created_at` 表示事件时间，`claim` 不参与机器关系解析。
- `jPremiseIds` 只表示证据依赖，不替代事件外键。
- 一个 option_event 只有一个最终 outcome。
- Planner 上下文保存状态快照、planner/instructions/inference/policy 版本和证据引用。
- Option 执行记录 Option 自身的 `pi_type/pi_ref/pi_theta` 快照、attempt 和 `real|simulated|sidecar` 模式。
- outcome 同时支持 LLM critique 与可选 reward 成分，未观测值不得伪造。

---

## 七、可靠调度运行时

### 7.1 Planner Agent 与 Scheduler 的分工

Planner 负责决策，Scheduler 是工程组件，负责让决策持续、可靠地发生：

- 持久化 `runtime_inbox` / `runtime_outbox`；
- trigger 去重和幂等分发；
- timer 与等待条件唤醒；
- Planner/Option lease 和并发预算；
- 决策先落库，再创建和分发 Option 执行；
- 崩溃恢复、重试、取消与人工 stop；
- 同一 subtask_event 的决策串行化。

这些队列表是工程关系，不进入 subtask–option–model 资产链。

### 7.2 主动规划授权

主动发现和主动执行必须分开：

- Model drift、新证据或 timer 可以唤醒 Planner；
- Planner 可以提出 subtask 或行动建议；
- 只有 mandate/policy 明确允许时才可执行；
- 未授权主动工作默认 `dry-run`，只记录建议；
- 人工 stop 不能被自动事件绕过。

### 7.3 不间断的含义

没有事件时 Planner 休眠，不消耗推理资源；事件到来后，Planner 从 MemoryCore 重建上下文并作出决策。`wait` 不得通过 LLM sleep/轮询空转实现。

---

## 八、OptionBench sidecar 映射

| 通用 Agent / OptionBench 概念 | Track B 投影 |
|---|---|
| 评测场景、目标 | subtask |
| 一次运行 | subtask_event |
| Agent 的规划/路由过程 | planner_event |
| 观察到的选择 | planner_event_decision |
| 工具、技能、能力 | option |
| 一次能力调用 | option_event |
| 输入、输出、环境反馈 | option_event_observation |
| 结果和评价 | option_event_outcome |
| Option 的语义经验 | model；没有则保持未校准 |

规则：

- 同一稳定能力跨调用复用 option，一次调用只新增 option_event。
- `baseline_id` 属于 subtask_event 执行上下文，用于隔离统计。
- 源 Agent 不暴露决策理由时记录 `rationale=null`、`decision_source=observed`，不得补写理由。
- OptionBench 负责场景、baseline 和评分；MemoryCore 保存 evaluator 引用、实际评价和证据，不重复实现评分器。
- sidecar 映射资产标记 `native / mapped / observed / uncalibrated`，不把映射壳冒充原生完整资产。

---

## 九、Track B 分阶段路线

### B0：设计评审与契约冻结

**状态**：当前草案，未实施。

交付：本路线图、配套开发手册、事件/决策/队列契约评审结论。

出口：命名、资产边界、Planner 权限、sidecar 映射和兼容原则获批准。

### B1：MemoryCore LLM 原生资产与事件扩展

**前置**：原 Phase 2 按原手册关闭；不改写其 Step 1–3。

交付：Planner 注册、Option/Model 增量字段、事件 v0.2、引用门控和 Datalog 图查询。

验收：资产与执行链可查询；未知模型能力不伪造；既有数据和测试不回归。

### B2：可靠调度内核

交付：runtime_inbox/outbox、subtask_event 状态机、mandate/decision gate、timer、lease、幂等和恢复。

验收：重复 trigger 不重复建单；决策后崩溃可恢复；wait 不空转；stop 不被自动唤醒绕过。

### B3：OpenCode Planner 垂直闭环

**定位**：交互式 Planner 验证，不宣称 24/7 Super Router；可与原 Phase 3 工作并行，但不替代其验收。

交付：primary Planner Agent、decision tool、一个 tool Option、一个后台 subagent Option、事件回流和 replan。

验收：跑通 subtask → decision → option → outcome → replan，两种 Option 执行路径均真实调用。

### B4：持续父 Planner 与 DSH SuperAgent 适配评估

**前置**：B2/B3 通过；DSH 深度适配以原 Phase 3 首版交付为基线，之前仅允许隔离探针。

交付：持续 planner-runtime、DSH 适配评估、SuperAgent 机制映射报告和恢复测试。

验收：timer/外部事件/Option 结果均可唤醒；崩溃不丢任务；DSH/OpenCode 不形成第二套事实和调度状态。

### B5：OptionBench sidecar 与 RL-ready 轨迹导出

**对齐**：与原 Phase 4–6 各自独立验收，不提前改变原插件工具清单。

交付：Sidecar Mapping Contract、baseline 隔离、通用 Agent 投影、RL 轨迹导出和真实/模拟证据隔离。

验收：不完整资产链可监测；无虚构 model/plan/reward；同一事件链可供 Planner、OptionBench 和离线轨迹导出使用。

---

## 十、Host 策略

### 10.1 共同原则

MemoryCore 保存资产、事件、授权和可靠调度状态；OpenCode/DSH 提供 Planner 推理、host 事件和 Option 执行能力。不得分别维护两套 Planner 决策和 Option outcome。

### 10.2 OpenCode

适合优先验证 Planner 闭环：primary Agent、工具、权限、后台 subagent、事件 hooks 和 V2 后台能力。插件 storage 或 scoped fiber 不等同于可靠 inbox/outbox。

### 10.3 DSH / SuperAgent

SuperAgent 的 Source/Trigger、Ticket/Mandate、Assignment、Outbox、Worker slot 和恢复机制作为重要参考。其公开代码是研究原型，不能直接视为生产依赖或与当前 pin rc 兼容。

Track B 采用“独立调度层为目标、SuperAgent 为实现参考”的策略，不长期维持 SuperAgent Store 与 MemoryCore 两套控制状态。

---

## 十一、质量红线

1. 不改写已完成步骤及其验收结论，不用新草案覆盖原路线。
2. Planner 不得直接执行有副作用的 Option，所有决策必须经 decision gate。
3. 不得仅凭 prompt、Session 或插件内存维持任务真实状态。
4. 不得用 host 特有队列形成第二套控制事实。
5. 不得虚构源 Agent 的 subtask、model、planner rationale、reward 或 plan。
6. 不得将 simulated/sidecar 轨迹混入真实认证证据。
7. 不得让主动事件越过 mandate、预算或人工 stop。
8. 不得因 Track B 改变 R4 阻塞、原插件版本和原 Phase 验收口径。
9. 新 CozoScript 仍集中于 MnesticClient，业务写入仍经服务层和门控。
10. 升级不得删除或重建既有 RocksDB 数据。

---

## 十二、总体验收场景

Track B 完全体至少证明：

1. 新请求经 gate 创建 subtask_event，父 Planner 作出结构化决策。
2. 同一 trigger 重发不会重复创建任务或 Option 执行。
3. Planner 决策落库后、Option 执行前崩溃，恢复后不重复产生外部副作用。
4. tool 和 subagent 两种 Option 均产生完整 observations/outcome。
5. Option 失败或新证据到达后，Planner 能 replan，而不是盲目重试。
6. wait 期间无 LLM 空转，timer/指定事件可唤醒。
7. 未授权主动规划只产生 dry-run 记录，人工 stop 持续有效。
8. 父/子 Planner 或子 Agent 的授权范围和事件血缘可追溯。
9. 通用 Agent 无完整资产链时，sidecar 仍能形成统一执行图。
10. 可导出带状态、动作、评价、下一状态和来源标记的 RL-ready 轨迹。
11. 原 Phase 0–2 测试不回归，原 Phase 3–6 的交付和验收不被替代。

---

## 十三、待评审决策

1. 是否批准 Track B 作为原路线的新增扩展，而非原 Phase 3–6 的替代版本。
2. 是否批准 Planner 成为独立资产，Option 作为唯一对外动作执行面。
3. 是否批准 `option_event_observation/outcome` 等层级命名和事件 v0.2 契约。
4. 是否批准 inbox/outbox 作为 MemoryCore 的工程关系，而非领域资产。
5. 是否批准 OpenCode 先行验证、DSH SuperAgent 作为持续调度参考的实施顺序。
6. 是否批准将 RL 限定为可选轨迹导出与后续能力，不进入首版调度依赖。
