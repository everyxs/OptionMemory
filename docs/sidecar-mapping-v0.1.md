# Sidecar Mapping Contract v0.1

- 版本：`sidecar-mapping-v0.1`
- 实现：`src/api/sidecar.ts`
- 原始投影：`schema/13_sidecar_events.cozo` 的 `sidecar_event`
- 定位：把外部 Agent 已发生的 scenario/run/tool/call 轨迹映射到 MemoryCore 事件链；不执行源 Agent，不伪造缺失资产，不形成真实认证证据。

## 一、输入与确定性 ID

每个输入至少包含：

```text
baseline_id / scenario_id / run_id
event_type / external_id
tool_id? / call_id?
原始 payload（完整输入原样保存）
```

支持 `scenario / run.started / planner.decision / tool.call / tool.result / run.completed / run.stopped / skill.registered / skill.updated / skill.rollback`。

```text
scenario + baseline
  → subtask_event

scenario + run + baseline
  → plan_run（host_type=sidecar）

run 内显式 planner.decision.external_id
  → planner_event + planner_event_decision

run 内 tool.call.call_id + baseline
  → option_event（必须存在匹配的显式 execute decision）

tool.result.call_id
  → output/error/environment observation、outcome、可选 model critique/drift
```

`sidecar_event_id` 由 mapping_version、baseline、scenario、run、event_type 和 external_id 经 SHA-256 确定生成。相同事件重发返回 `reused=true`；相同 ID 携带不同 payload 返回 blocked，不能覆盖原记录。所有原生事件 ID 都包含 baseline，禁止跨 baseline 合并。

## 二、原始 payload 与映射缺口

`sidecar_event` 只保存外部原始记录和映射结果，不是第二套任务控制状态：

| 字段 | 含义 |
|---|---|
| `payload_json` | 完整源输入，不删除未知 model、rationale、reward 或其他源字段 |
| `mapping_json.refs` | 实际成功投影的 subtask/plan/planner/option/model 引用；未投影为 `null` |
| `mapping_json.unmapped` | 缺失 mandate、plan、Planner、Option、Model、decision 等原因 |
| `mapping_json.provenance` | `native / mapped / observed / uncalibrated` 来源语义 |
| `mapping_json.unknowns` | 源报告值与未知值；未观测 reward/rationale 为 `null` |

不完整链仍可以 `gate=pass` 保存 raw-only 记录，但不会创建占位 Planner、Option、Model 或伪造外键。映射冲突、ID 绑定不同 payload、资产绑定不一致时返回 blocked，原 payload 保留用于对账。

映射采用 raw-first、确定性补写：若崩溃只保留 raw，重发同一事件会补齐原生投影；raw 的 `created_at` 和源 payload 不被重写。

## 三、来源与未知字段

- `native`：源标识、已注册资产及从 MemoryCore 读取的版本/绑定。
- `mapped`：由 mapping_version 和源 ID 计算出的关系与引用。
- `observed`：源显式报告的 outcome、rationale、reward、critique 和 cost。
- `uncalibrated`：sidecar 整体质量评价及未观测指标，不代表校准结果。

具体规则：

- 未提供 rationale：`decision_json.rationale=null`，不从工具序列或输出补写。
- 未提供 reward：`evaluation_json.scalar_reward=null`、`reward_source=uncalibrated`；显式 `0` 是有效观测，不能改成 `null`。
- 未注册 model：raw 中保留源 model 标识，映射引用为 `null`，不创建 Model 资产。
- 未提供 cost/error：`observed=false`、`value=null`。
- 不从调用序列创建 plan template；`plan_templates` 继续保持为空。

## 四、real / simulated / sidecar 隔离

sidecar 投影的 `execution_json.mode` **始终为 `sidecar`**。源 Agent 声明的执行模式只保存为：

```text
observed_execution_mode = real | simulated | null
```

因此，即使源轨迹声称 real，也不会被写成 MemoryCore 原生 real 执行。原生 real/simulated 事件不被修改；sidecar/model critique 标记 `evidence_origin=sidecar` 和 `model_quality=uncalibrated`，不得直接进入真实认证成功率。

## 五、世界状态与预测映射

P4-6 起支持以下可选输入，未提供时不创建事件：

```text
pre_state    → option_event_observation(pre_state)
post_state   → option_event_observation(post_state)
anticipation → model_event.anticipation
```

pre/post/environment 是实际观测；anticipation 是 Model 对状态与转移的预测，不能写成实际 post_state，也不能自动形成 drift 或校准。模式继续统一为 sidecar。

## 五A、五项技能测量映射

仅扩展 Option 的创建血缘，其他测量复用现有 subtask/option/model/revision，不建立第二套 Skill 生命周期存储。

Option 新增可空字段：

```text
created_at / parent_option_id / parent_version / origin_event_id
```

`skill.registered / skill.updated / skill.rollback` 只关联已注册 Option 和原始生命周期证据，不创建或改写 Option。注册事件若携带创建血缘，必须与 Option 一致；rollback 必须提供 `revision_ref`。

| 测量 | 映射方式 |
|---|---|
| 新技能产生 | Option 创建血缘 + `skill.registered` raw/refs |
| 合适时机调用 | subtask/subtask_event 的适用上下文 + planner decision；`ignore` 等非 execute 决策不产生 option_event，可表示未调用 |
| 解决旧问题 | 同一 subtask_event 的历史 option_event + `verification={verifier_id,verdict,evidence_refs}` → model_event.critique |
| 环境变化、更新或遗忘 | `environment` → option_event.environment observation；`drift` → model_event.drift；`observed_option_version/observed_model_version` 保存历史版本 |
| 回滚后重新启用 | `skill.rollback + revision_ref` 保存回滚证据；后续 option_event 以 `lifecycle_ref` 关联，并由独立 verification 验证 |

`lifecycle_ref` 会从 tool.call 的 `execution_json` 继承到 drift，不要求 tool.result 重复携带。源未显式提供 environment、verification、drift、观测版本或回滚引用时保持 `null`/不产生对应事件，不能从成功输出或调用顺序推断。第六项“组合技能”不在本次扩展范围内。

## 六、验证入口

```bash
pnpm vitest run tests/sidecar-mapping.test.ts
pnpm build && node scripts/phase4_sidecar_acceptance.ts
```

真实 RocksDB 故障与恢复证据见 `docs/phase4-sidecar-acceptance.md`。本契约不是 RL 训练或 Phase 6 认证实现。
