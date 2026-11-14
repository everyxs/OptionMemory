# Phase 2 事件 schema v0.1

事件以 facts 记录，复用六元组和 RocksDB 持久化。核心类型定义在 `src/memory/events.ts`，写入由 `makeEventFact()` 统一生成。

## 通用字段

| 字段 | 值 / 语义 |
|---|---|
| `predicate` | task / action / observation / outcome / drift；治理扩展为 revision / gate_audit |
| `args` | 事件类型对应的字符串参数 |
| `claim` | 可读事件主张 |
| `layer` | 固定 `meta` |
| `jPremiseIds` | 关联事实 ID；无关联时为 `[]` |
| `jRuleId` | 产生事件的规则或操作，如 `memory_retract`、`nu_gate` |
| `epsType` | `confidence` |
| `epsValue` | `1` |
| `epsSource` | `event-log` |
| `linSource` | `optionmemory-events` |
| `linVersion` | `0.1` |
| `linActor` | 实际执行者；缺省由调用方标为 `unknown` |
| `verify` | `event-schema-v0.1` |
| `status` | `in`；事件是审计记录，不物理删除 |

## 核心事件

| 类型 | 用途 | args 建议 |
|---|---|---|
| `task` | 任务开始、目标或上下文 | `[task_id, goal, context_json]` |
| `action` | option/tool 执行动作 | `[task_id, option_id, action_id]` |
| `observation` | 执行观察、返回值或原始证据 | `[action_id, observation_type, value]` |
| `outcome` | 成功、失败、成本或结算结果 | `[action_id, status, cost_json]` |
| `drift` | 分布、环境或可用域变化 | `[subject_id, drift_type, evidence_json]` |

这些是 schema v0.1 的类型约束。Phase 2 的 sidecar 输出必须复用这些谓词，不得另造同义事件名。

## 治理扩展事件

### revision

`memory_retract` 在同一事务中同时写入目标 `out` 和 revision 记录：

```text
args = [target_fact_id, "retract", actor, unix_seconds]
jPremiseIds = [target_fact_id]
jRuleId = "memory_retract"
```

目标已是 `out` 时返回成功但不重复写 revision。

`restoreFact` 使用相同 revision 类型，但 action 为 `restore`、`jRuleId="restoreFact"`。基础事实可显式恢复；派生事实必须存在 active、规则 in 且全部前提 in 的有效辩护。失效与恢复均沿依赖锥迭代到稳定状态，重复操作不重复写 revision。

### gate_audit

audit 模式放行违规时，业务记录使用显式 `audit-missing` 占位值满足非空 schema，原始违规原因保留在 gate_audit 中；除业务记录外写入：

```text
args = [target_fact_id, blocked_reason]
jPremiseIds = [target_fact_id]
jRuleId = "nu_gate"
```

enforce 模式不写入违规业务记录或 gate_audit。非法 status 值和目标不存在属于结构错误，即使 audit 也拒绝。
