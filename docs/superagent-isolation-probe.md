# SuperAgent 隔离兼容探针契约 v0.1

- 版本：`superagent-probe-v0.1`
- 实现：`src/api/superagent-probe.ts`
- 定位：只验证核心 continuous-host 与 SuperAgent Ticket/Assignment/Input 的映射兼容性，不连接生产 SuperAgent，不形成正式持续服务或 `superagent-adapter v0.1`。

## 一、确定性映射

所有 ID 使用 SHA-256 和 `superagent-probe-v0.1` 命名空间：

```text
Ticket.ticket_id
  → subtask_event_id = hash(mapping_version | ticket_id)

Ticket.ticket_id + Assignment.assignment_id
  → plan_run_id = continuousHostPlanRunId(
      superagent,
      mapping_version | ticket_id | assignment_id
    )

Ticket + Assignment + Input.input_id
  → deliver external_id / answer_event_id
  → host_event 与 runtime_inbox 的确定性防重键

Ticket + Assignment + question_id
  → host_question_ref = ticket_attention_<hash>
```

一个 Assignment 对应一个 plan_run/attempt；同一 Ticket 的多个 Assignment 共享 subtask_event，但拥有不同 plan_run。一个 plan_run 可包含多次 Planner 决策和多个 Option，不映射为单个 option_event。

重复 start 会核对 Ticket、Assignment、attempt、subtask_event 和 mapping_version，不能借相同 ID 改写 mandate 或宿主绑定。

## 二、操作与回调

| 探针操作 | MemoryCore 映射 | 外部回调 |
|---|---|---|
| `start(ticket, assignment)` | 创建/恢复 subtask_event 与 plan_run，保存 Ticket/Assignment refs | `assignmentStarted` |
| `deliver(..., input)` | 写 deliver host_event，并写 request/timer 之外的 `host_event` 或 `human_input` runtime inbox | 无自动 Planner 决策伪造 |
| `requestAttention(..., question)` | 保存 attention host_event、`host_question_ref` 和 `report_question` | Ticket Attention |
| `answerAttention(..., input)` | 保存 answer host_event 与一条 human_input inbox | 只唤醒一次 |
| `report(..., report)` | 保存 report host_event/ACK，plan_run → completed | `report` |
| `stop(..., reason)` | 保存 stop host_event，plan_run → stopped | 后续 deliver 被 blocked |

`assignmentStarted/report/attention` host_event 保存 `callback_status = pending / delivered / reconcile_required`、实际 ACK response 和错误。回调失败或状态未知时不盲目重试；重复操作返回 `reused=true` 和对账状态，不重复调用外部回调。

deliver 先写 host_event，再确保 runtime inbox 存在。若进程在两次写入之间退出，重发同一 Input 会补建缺失 inbox，但不会重复 deliver host_event；两者均存在时才返回 `reused=true`。

stop 不删除历史事件。completed/stopped plan_run 不会被重复 start 自动恢复为 active；新的 attempt 必须使用新的 Assignment。

## 三、Attention 与记忆边界

- Ticket Attention 只投影为 host_event、host_question_ref、answer_event_id 和恢复 inbox，不新建 Question Center、Ticket Store 或审批引擎。
- P4-4 不自动捕获或修订记忆。显式 `captureDailyMemory` 仍按原幂等键去重；start/deliver/report/stop 不产生隐式 document/chunk 写入。
- Recall 仍是同一 MemoryCore 只读 API，不因 Ticket 回调提升证据等级或扩大 mandate。
- Source/Ticket/Assignment 到长期记忆 namespace 的正式适配、Attention 批准后捕获和跨宿主修订属于 P5-4。

## 四、验证入口

```bash
pnpm vitest run tests/superagent-probe.test.ts
pnpm build && node scripts/phase4_superagent_acceptance.ts
```

独立 RocksDB 验收结果见 `docs/phase4-superagent-acceptance.md`。正式 SuperAgent 依赖、原型版本、许可证和持续 Ticket 生命周期将在 Phase 5 单独评审，当前未新增任何生产依赖。
