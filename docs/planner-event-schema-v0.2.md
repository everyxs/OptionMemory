# Planner 事件 schema v0.2

- 版本：`planner-schema v0.1` / event v0.2
- 存储：`schema/09_planners.cozo`，仅新增关系
- 写入与查询：`src/api/telemetry.ts`、`src/memory/mnesticClient.ts`
- 既有 Phase 2 事件 schema v0.1 和 revision/gate_audit 语义不改写

## 层级与运行上下文

```text
subtask_event
  → plan_run
    → planner_event
      → planner_event_decision
        → option_event
          → option_event_observation / option_event_outcome
        → option / model
model_event 独立关联 model_id
```

一个 plan_run 可包含多个 planner_event 和 option_event，不是 Executor 领域资产。

## 事件字段

| 关系 | 键与主要字段 |
|---|---|
| `subtask_event` | `subtask_event_id / subtask_id / baseline_id / mandate_json / created_at` |
| `plan_runs` | `plan_run_id / subtask_event_id / attempt / host_type / host_session_ref / host_ticket_ref / host_assignment_ref / idempotency_key / mapping_version / status / created_at / updated_at` |
| `planner_event` | `planner_event_id / subtask_event_id / plan_run_id / planner_id / context_json / created_at` |
| `planner_event_decision` | `planner_event_id / decision_type / decision_json / created_at` |
| `option_event` | `option_event_id / planner_event_id / option_id / model_id / execution_json / created_at` |
| `option_event_observation` | `observation_event_id / option_event_id / observation_type / value_json / created_at` |
| `option_event_outcome` | `option_event_id / status / evaluation_json / cost_json / error_json / created_at` |
| `model_event` | `model_event_id / model_id / event_type / payload_json / created_at` |

P4-5 另以 `schema/13_sidecar_events.cozo` 的 `sidecar_event` 保存外部原始 payload、baseline、external_id、mapping_version、映射引用和 unmapped 原因；它是原始投影，不是另一套任务控制状态。详见 `docs/sidecar-mapping-v0.1.md`。

mandate_json 至少包含 `scope / policy_version / source_actor / strength / mode / budget`。

planner context_json 至少包含 `state_snapshot_ref / state_hash / instructions_version / inference_ref / policy_version / evidence_refs`。

execution_json 至少包含 `option_version / pi_type / pi_ref / pi_theta / attempt / mode`。`mode = real | simulated | sidecar`，不得混写。sidecar 投影的 mode 始终为 sidecar，源声明只保存在 observed_execution_mode；未观测 rationale/reward/model 引用保持 null/uncalibrated。

## 决策与结果词表

- `decision_type = execute / decompose / replan / retry / wait / ask / stop / ignore`
- `observation_type = input / context / pre_state / output / post_state / environment / error`
- `status = success / failure / blocked`
- `model_event.event_type = anticipation / critique / calibration / drift`

execute 必须有 option_id；非 execute 不得伪造 option_id。decompose 返回 subtask 提议，wait 返回唤醒条件，ask 返回一个明确问题，retry 返回目标 option_event_id。

outcome 的 `evaluation_json.scalar_reward` 未观测时必须为 `null`，不得以 0 代替。一个 option_event 只能有一个最终 outcome。

P4-6 起，OptionImplementationResult 可携带真实 `model_events=anticipation/critique/calibration/drift`，由 OptionExecutor 持久化；未提供时不创建。Sidecar 的 pre/post state 写入对应 observation，anticipation 写入 model_event，实际状态与预测不得混写。

Phase 4 v0.2.0 的 CSV transient 结算复用 `model_event(event_type=calibration)`：`option_event` 开户，observation/outcome 记录输入、输出与真实成本，最终以 `schema_version=transient-settlement-v0.1` 的 Model 校准事件结算。payload 关联 `option_event_id/batch_id/option_type/template_id`，记录成功率、fact 接受率、闭包/J、真实耗时和未知货币成本；不把派生统计回写为第二份主表权威。缺 settlement 的重放只补事件，不重复解析。

## 门控与查询

- 资产和事件引用必须存在且状态允许。
- Option 的 subtask/model 绑定必须一致。
- option_event 只能由 execute 决策创建。
- real/simulated/sidecar 不得混写，未知 model/reward/rationale 保持 null/uncalibrated。
- Planner 文本不得直接替代 settle/revoke 等 governance API。

固定查询：`getExecutionTrace`、`getSubtaskDecisionChain`、`getOptionEvidence`，集中经 MnesticClient。`getExecutionTrace` 返回本 option_event 关联的 `modelEvents`；`getOptionEvidence` 返回该 Model 的 `modelEvents`，用于 transient settlement 与后续证据查询。
