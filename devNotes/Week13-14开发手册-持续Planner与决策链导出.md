---
创建时间: 2026-11-15
更新时间: 2026-11-15
类型: 开发手册
所属项目: "26-04 AI4Science"
对应路线图: "S01最小产品路线图（完整版）Phase 5 · Week 13–14"
状态: 待实施（Phase 4 关闭后启动）
tags:
  - 开发手册
  - Phase5
  - OptionMemory
  - Planner
  - SuperAgent
  - memory_why
  - handoff
---

# Week 13–14 开发手册：持续 Planner、SuperAgent 正式适配与决策链导出（Phase 5）

> 本手册由《LLM 原生 Planner 与 Super Router 开发手册》和《S01 最小产品路线图-完整版》同步展开，包含原 Phase 5 基线与 Planner 增量。
>
> **实施顺序固定为**：P5-1 持续共享 planner-runtime → P5-2 SuperAgent Executor 正式适配 → P5-3 决策链血缘与导出 → P5-4 SuperAgent 持续记忆与跨宿主适配。
>
> SuperAgent 承接完整长期 Source/Ticket/Mandate/Assignment/Attention/Outbox；OptionMemory 持有 plan_run、Planner/Option 事件、证据和认证，**不复制 Ticket 状态机**。

---

## 一、阶段目标

### 原基线交付

- 实现 `memory_why`：返回任意结论的推导链及文本化 derivation tree。
- 支持按 J/≺/layer/status 组合查询六元组。
- 实现只读事件流导出：`GET /events?type=write|derivation|revision|cascade&since=<ts>`。
- 可选 PROV-O/Turtle 导出。
- DSH/OpenCode 升级为 v0.3.0，新增 `memory_why`，**工具由 7 增至 8**，旧契约保持兼容。
- 将 Phase 4 已完成的 MemoryCore Recall 适配到 SuperAgent Source/Ticket/Assignment，支持跨宿主记忆、人工批准和恢复；不重复建设 Recall 或日常捕获实现。

### Planner 增量交付

- 形成可持续的共享父 planner-runtime，管理多个 subtask_event 和持久 plan_run。
- 支持实例恢复、跨 harness Option 边界 handoff 和人工 stop。
- 完成 `superagent-adapter v0.1` 正式适配。
- memory_why 可关联 Planner 决策、Option 执行、Model 评价、plan_run/Assignment 及当时证据和版本。

## 二、前置门槛与不变项

- Phase 4 原基线和 Planner 增量均关闭，含 P4-0 字段迁移、P4-1M OpenCode 日常记忆最小闭环、OpenCode/DSH 真实闭环、共享后台恢复和 SuperAgent 隔离探针。
- SuperAgent 隔离探针不能替代本阶段正式适配。
- R4 阻塞、97 条待复核记录隔离和原 J/≺ 语义不变。
- 原工具数量只从 7 增至 8；不得提前注册 query_achievable/certify。
- GET /events 是可观测性接口，不计入 DSH/OpenCode 工具数。
- DSH/OpenCode 共用一个 planner-runtime，不分别建设权威队列、长期 Source 或 Question Center。
- CozoScript 集中在 MnesticClient；新 schema 只做可回滚增量迁移。
- 故障测试使用独立 RocksDB 目录，不修改生产数据。

## 三、目标文件边界

```text
docs/
  superagent-adapter-v0.1.md
  phase5-compatibility.md
  memory-bridge-contracts.md
src/
  api/
    memory-why.ts
    event-export.ts
    scheduler.ts
  memory/
    recall.ts                 # 复用 Phase 4，不重复实现
  runtime/
    planner.ts
    plan-run.ts
    scheduler.ts
    handoff.ts
    option-executor.ts
  plugins/
    superagent/
      executor.ts
      events.ts
      memory-bridge.ts
    opencode/
      planner-events.ts
      attention.ts
      bridge/index.ts
      bridge/v1.ts
      bridge/v2.ts
      bridge/tools.ts
    dsh/
      planner.ts
      attention.ts
tests/
  plan-run-recovery.test.ts
  plan-handoff.test.ts
  superagent-executor.test.ts
  memory-why.test.ts
  event-export.test.ts
  attention-adapters.test.ts
  superagent-memory-bridge.test.ts
  bridge-opencode-v1.test.ts
  bridge-opencode-v2.test.ts
templates/
  memory-bridge/opencode.md
```

SuperAgent 原型版本、许可证、适配差异和 DSH/Cordis 依赖必须在 `docs/superagent-adapter-v0.1.md` 独立记录，不默认与现有 pin 兼容。

---

## 四、Step P5-1：持续共享 planner-runtime

### 4.1 部署形态

```text
Planner Agent + Scheduler + Option dispatcher
                │
                ▼
          MemoryCore HTTP
```

要求：

- 父 Planner 管理多个 subtask_event 和 plan_run；
- 同一 subtask_event 决策严格串行；
- Planner 实例替换后从 MemoryCore 恢复，不依赖旧 Session；
- host Session 退出不影响持久任务状态；
- 进程内 timer 不是唯一调度依据；
- DSH/OpenCode 共用同一个 planner-runtime，不分别持有权威队列；
- 长期外部 Source 接单留给 SuperAgent，不在本阶段重复建设。

### 4.2 plan_run 恢复

恢复上下文至少关联：

- plan_run_id / subtask_event_id / attempt；
- decision_seq、Planner/instructions/inference/policy 版本；
- inbox/outbox、lease、waiting_condition 和幂等键；
- host_question_ref / answer_event_id；
- Option 执行、证据和外部产物引用。

重复 start/deliver、决策后崩溃、Option 执行中崩溃和 Report 前崩溃均须恢复，且不重复外部副作用。

### 4.3 Option 边界 handoff

只允许以下流程：

```text
暂停源 plan_run 新决策与 Option 分发
  → 当前 Option 到达完成/失败/取消边界
  → 完成副作用对账
  → 保存决策序号、版本、幂等键、证据和产物引用
  → 目标宿主重新校验 Mandate、权限、Option/Model
  → 原子转移 lease
  → 从下一个决策或 Option 边界恢复并记录 handoff 事件
```

首版不支持运行中 Option 热迁移，不自动迁移宿主权限、Session、工作目录、后台进程或 Ticket。目标能力缺失时使用登记的 fallback、重规划或 blocked，不得伪造等价能力。

### 验收

- [ ] runtime 重启不丢 inbox/outbox/subtask/plan_run 状态。
- [ ] Planner 实例替换和 host 退出后可恢复，同一 subtask 决策不并行。
- [ ] handoff 只在 Option 边界发生，源与目标 lease 不同时生效。
- [ ] 权限不足、能力缺失或副作用未对账时 blocked，不重复副作用。

---

## 五、Step P5-2：SuperAgent Executor 正式适配（superagent-adapter v0.1）

### 5.1 回调映射

实现 `src/plugins/superagent/executor.ts` 与 `events.ts`：

- `start(ticket, assignment)` → 创建或恢复 plan_run；
- `deliver(ticket, assignment)` → 将 Trigger、Policy 变化和人工输入转为 Planner observation；
- `stop(ticket, assignment, reason)` → 持久化取消并阻止后续 Option 分发；
- Planner 开始、输入接收、Attention 和最终状态 → assignmentStarted/inputsDelivered/inputsRead/report 回调；
- **一个 Assignment 对应一个 plan_run/attempt**，plan_run 内可包含多个 Planner 决策和多个 option_event，不得映射为单个 option_event。

### 5.2 状态归属

| 事实 | 权威持有方 |
|---|---|
| Source、Thread、Ticket、Mandate、Assignment 外部生命周期 | SuperAgent |
| Subscription、follow-up ownership、Attention、Channel Outbox、人工 stop | SuperAgent |
| plan_run、Planner 决策、Option 执行事件、Model 校准、证据、J/≺、认证和撤销 | OptionMemory / MemoryCore |
| Ticket 内部规划控制面 | OptionMemory Planner；SuperAgent Eval 只做接单、授权和路由 |
| 并发约束 | SuperAgent Worker slot 约束 plan_run 数量；Option/subagent lease 与预算由 OptionMemory 控制 |

不得长期保留 SuperAgent Store 与 MemoryCore 两套同义控制事实。OptionMemory 不决定是否接受新工作，SuperAgent Eval 不做 Ticket 内部详细实现规划。

### 5.3 原生 Attention 与人工 stop

- SuperAgent 使用 Ticket Attention、Report.question、原会话 Outbox 和后续 Input。
- planner-runtime 只保存 ask/wait_condition、host_question_ref、answer_event_id 和恢复关联。
- 人工回答只唤醒一次 plan_run。
- SuperAgent 人工 stop 是持续任务权威终止信号；Option revoke 只改变能力可用性，二者不得混用。
- 人工 stop 后，Planner、timer 或 host event 不得自动恢复执行。

### 验收

- [ ] SuperAgent accept → OptionMemory plan → 真实 Option 执行 → SuperAgent Report 垂直流程通过。
- [ ] start/deliver/stop/report/Attention 正式适配通过，重复 start/deliver 不重复执行。
- [ ] 一个 Assignment 对应一个 plan_run，多个 Option 可回放。
- [ ] SuperAgent 与 OptionMemory 状态归属正确，不出现两个 Planner 同时规划同一 Ticket。
- [ ] 人工 stop 后不得被自动事件绕过。

---

## 六、Step P5-3：决策链血缘与导出

### 6.1 原 memory_why 基线

至少支持：

```text
phase_structure(S01, BCC+FCC)
  ← R2
    ← xrd_peak(S01, 44.5°, FCC(111))  [source=xrd_parser_v1.2]
    ← xrd_peak(S01, ..., BCC(110))    [source=xrd_parser_v1.2]
```

可按 `lin_source=xrd_parser_v1.2` 查询该解析器版本产出的完整事实清单，并支持 J/≺/layer/status 组合过滤。

### 6.2 Planner 决策链

memory_why 在原推导链之外可关联：

```text
结论
  ← Option 执行
  ← Model 评价
  ← Planner 决策
  ← plan_run / Assignment
  ← 当时状态、证据、Mandate 和版本
```

J/≺ 与 Planner 决策链通过 ID 关联，不混成一种边；plan_run 与 Assignment 也只通过 ID 关联，不形成第二种任务状态机。

### 6.3 只读事件导出

在原 write/derivation/revision/cascade 类型之外，增加：

- planner_event*、option_event*、model_event；
- baseline_id、plan_run_id 和 host 类型；
- ticket/assignment/trigger 等外部 ID；
- real/simulated/sidecar；
- planner/instructions/inference/policy 版本过滤。

导出是只读投影，不改变原始事件，不虚构 state、reward、rationale 或下一状态。PROV-O 为可选互操作导出，不替代 J/≺。

### 验收

- [ ] 原 memory_why、六元组查询和事件导出独立通过。
- [ ] 同一结论可回查逻辑推导、Planner 决策、Option/Model、plan_run 和外部 Assignment。
- [ ] 可按 baseline、host、外部 ID、版本和 real/simulated/sidecar 过滤。
- [ ] DSH/OpenCode 新增 memory_why 后恰好 8 工具，旧调用无需改写。

---

## 六A、Step P5-4：SuperAgent 持续记忆与跨宿主适配

> Phase 4 已完成 OpenCode 日常记忆最小闭环。本步骤只将该 MemoryCore/Recall 契约接入 SuperAgent 的 Source/Ticket/Assignment 生命周期，不重复实现摄入、召回或 OpenCode 注入。

### 任务

1. 建立确定性宿主映射：
   - `source_id + ticket_id + assignment_id + input_id → namespace/session_id/message_id/query_hash`；
   - Ticket 长期项目与临时 Assignment 隔离，禁止跨 Ticket 默认召回；
   - plan_run、recall_event、option_event 和 report 通过 ID 关联，不复制 Ticket 状态。
2. `deliver` 在 Planner 重建上下文时调用同一 `memory_recall`，将相关记忆、当前事实、mapping_stale 和 conflicts 转为 Planner observation；不通过 OpenCode context hook 代理 SuperAgent。
3. SuperAgent 需要捕获或修订时，先形成 candidate，经 Ticket Attention/Report.question 批准后才应用；用户停止 Ticket 后不得继续自动捕获、召回驱动执行或修改记忆。
4. OpenCode 与 SuperAgent 可交叉读取同一 captured document/fact/recall_event；OpenCode 的修订在 SuperAgent 下次 deliver 生效，反向亦同，不形成第二份记忆。
5. handoff、runtime 重启和 Ticket 后续 Input 必须复用原 query_hash/幂等键对账：新 Input 可刷新 Recall，重复 deliver 不重复写入或注入副作用。
6. Report 导出实际使用的 memory_uri、recall_id、策略版本、状态、gate/reason 和人工批准引用；未使用记忆时明确为空，不补写 rationale。
7. 原型版本、许可证和宿主 API 差异记录在 superagent-adapter v0.1；不支持的能力显式 blocked，不用模拟 Ticket 冒充正式适配。

### 验收

- [ ] Ticket 内能召回 Phase 4 保存的日常事实，来源、状态和冲突标注与 OpenCode 一致。
- [ ] OpenCode 的修订在后续 Assignment deliver 生效，SuperAgent 的修订也能被 OpenCode 读取。
- [ ] Ticket/assignment 隔离有效，重复 deliver 不重复捕获或产生重复执行。
- [ ] Attention 未批准不落地，人工 stop 后不再自动捕获或恢复记忆驱动执行。
- [ ] handoff/重启后 Recall 幂等，Report 含真实 memory_uri/recall_id/批准引用且原 8 工具不变。

---

## 七、测试与故障验收

必须使用独立 RocksDB 目录：

- Planner 进程替换和 runtime 重启；
- 重复 start/deliver、决策提交前后崩溃；
- Option 执行中崩溃和 Report 前崩溃；
- lease 超时、重复事件和响应丢失；
- handoff 前后崩溃、目标权限不足、源与目标 lease 竞争；
- host reload/unload、原生回答重复投递和人工 stop；
- SuperAgent 重复 start/deliver、Ticket 后续消息和 Attention 恢复；
- memory_why 血缘完整性与导出只读性；
- Phase 0–4 全量回归、R4 边界和七工具兼容。

### 日常记忆持续适配回归

所有 P5 Step 必须执行 `docs/memory-regression-acceptance.md` 共享回归，并增加：

- P5-1：runtime 重启、Planner 替换和 host 退出后 Recall/修订/幂等链可恢复，同一 subtask 不并行决策。
- P5-2：Ticket 内召回与 OpenCode 一致，Attention 前不落地，人工 stop 后不再自动捕获或恢复记忆驱动执行。
- P5-3：memory_why 同时回查逻辑推导、原文 source link、Recall/修订和 Ticket/Assignment，不把不同边混为一类。
- P5-4：OpenCode 修订在后续 Ticket deliver 生效，SuperAgent 修订可被 OpenCode 召回，重复 deliver 不重复执行。
- handoff：Recall/document/chunk/candidate/approval/lease/revision 跨 harness 连续，目标权限不足 blocked，无双 lease、无重复副作用。

## 八、Phase 5 Repo 验收清单

### A. 原基线

- [ ] memory_why、推导链文本化和六元组组合查询通过。
- [ ] 只读事件流与可选 PROV-O 导出通过。
- [ ] 双 host v0.3.0 恰好 8 工具，升级和数据保留通过。

### B. 持续 runtime

- [ ] 多 subtask/plan_run 管理、串行决策、实例恢复和持久 timer 通过。
- [ ] 跨 harness handoff 只在 Option 边界，事件链连续且无重复副作用。

### C. SuperAgent 正式适配

- [ ] start/deliver/stop/report/Attention 通过。
- [ ] Assignment → plan_run/attempt 映射与多 Option 回放通过。
- [ ] 状态归属、人工 stop、Worker slot 和 OptionMemory 预算边界通过。
- [ ] 原型版本、许可证、适配差异和兼容性记录完整。

### D. 可观测与回归

- [ ] Planner 决策链、事件过滤和只读导出通过。
- [ ] 能区分 Planner 选错、Option 失败、Model 不可用和证据失效。
- [ ] DSH/Cordis 兼容、升级回归和 RocksDB 数据保留有独立记录。

### E. SuperAgent 持续记忆适配

- [ ] Source/Ticket/Assignment namespace 与跨宿主 Recall 一致性通过。
- [ ] Attention 批准、重复 deliver、人工 stop、handoff/重启和修订后召回生效通过。
- [ ] Report 包含真实 memory_uri/recall_id/策略版本，未重复建设 MemoryCore 或 Ticket 状态机。

### F. 共享记忆回归与质量指标

- [ ] 每次增量的重复注入、重复写入、跨项目泄漏和自动 AGENTS 修改次数为 0。
- [ ] 来源正确率、修订后旧结论误用、Top-K、token、延迟和真实成本有独立记录。
- [ ] 真实宿主双会话、Ticket/Attention、恢复和未实现项均独立归档。

### 验收签署

| 角色 | 签署项 | 日期 | 签字 |
|---|---|---|---|
| 执行人 | A–F 全部核对通过 | | 待签 |
| 子课题1 负责人 | 双 host、升级、恢复和数据保留 | | 待签 |
| 子课题2 负责人 | 持续 runtime、handoff、血缘与导出 | | 待签 |
| 子课题3 负责人 | SuperAgent 边界、证据和兼容性 | | 待签 |

A–F 全部通过后方可进入 Phase 6；本阶段不包含 RL 训练，不把 SuperAgent 原型声明为未经测试的生产依赖，也不把适配器完成等同于 OpenCode 日常闭环（后者已在 Phase 4 独立验收）。
