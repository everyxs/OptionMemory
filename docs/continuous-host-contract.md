# Continuous Host Contract v0.1

## 定位

DSH/OpenCode 保持对话宿主，后续共用同一个有限生命周期 planner-runtime。plan_run 是运行上下文，不是 Executor 领域资产，也不是宿主专有任务状态机。SuperAgent 已在 P4-4 完成隔离映射探针，正式适配仍留 Phase 5；dataStore 不在本阶段创建。

## 标识与映射

```text
plan_run_id / subtask_event_id / attempt
host_type / host_session_ref / host_ticket_ref / host_assignment_ref
idempotency_key / mapping_version
host_question_ref / answer_event_id
```

`plan_run_id` 由 `host_type + idempotency_key` 经 SHA-256 确定生成。host_event 由 `plan_run_id + event_type + external_id` 确定生成。相同 start、deliver、stop、report 或 answer 重发只返回 `reused=true`，不重复写事件或产生副作用。

## 操作

| 操作 | 行为 |
|---|---|
| `start` / `submit` | 创建或恢复 plan_run；重复 start 不重复建单 |
| `deliver` | 持久化输入或宿主事件，按 external_id 去重 |
| `stop` | 写入 stop 事件并把 plan_run 标为 stopped |
| `report` | 写入 report 事件并把 plan_run 标为 completed |
| `status` | 返回 plan_run 与 host_event 历史 |
| `answer` | 关联 host_question_ref 和 answer_event_id，回答只唤醒一次 |

实现：`src/api/continuous-host.ts`、`schema/09_planners.cozo` 的 plan_runs/host_event。SuperAgent 隔离映射由 `src/api/superagent-probe.ts` 实现，补充 assignmentStarted/attention 回调事件和 deliver/answer 到 runtime inbox 的确定性连接，契约见 `docs/superagent-isolation-probe.md`。

## 原生 Attention

- OpenCode：语义澄清使用原生 question，操作审批复用 permission ask。
- DSH：使用 `ctx.userQuestions.ask/askTimed/answer` 和 approval intent；外部 runtime 必须经 root Session/Adapter 提问，不冒充 Agent，不绕过 delegated caller。
- SuperAgent：P4-4 隔离探针已验证 Ticket Attention 映射和回答防重，正式适配留 Phase 5。

核心只保存 ask/wait_condition、host_question_ref、answer_event_id 和恢复关联，不新建 Question Center、Attention UI、通知系统或权限审批引擎。三个宿主不共用一套人机交互实现。

## 不变边界

- 一个 plan_run 可包含多个 planner_event 和 option_event。
- DSH/OpenCode 不分别建设权威调度器、长期 Source 或持续接单。
- 不自动迁移宿主授权、工作目录、后台进程或 Ticket。
- 真实回答只唤醒一次；pending 不伪造回答；重复回答不重复唤醒。
- 原七工具、R4 阻塞、revision/gate_audit 和既有修订语义不变。
