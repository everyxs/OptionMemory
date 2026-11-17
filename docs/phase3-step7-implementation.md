# Phase 3 Step 7 实施与故障测试清单

- 日期：2026-11-15
- 状态：已完成（Phase 3 已于 2026-11-15 签署关闭）
- 范围：planner-schema v0.1、事件 v0.2、continuous-host contract v0.1、原生 Attention
- 非目标：持续 Planner、inbox/outbox、SuperAgent 正式适配、dataStore、原七工具变更

## 1. 文件与接口

### Planner 资产与迁移

- `schema/09_planners.cozo`：planners、plan_runs 和事件 v0.2 关系。
- `src/memory/planner.ts`：PlannerRow、事件行类型、决策/状态词表。
- `src/api/planner-registry.ts`：`registerPlanner()`。
- `src/memory/assets.ts`：Option `input_schema`，Model `reasoning_spec/evidence_spec/evaluation_spec`。
- `scripts/migrate_step7_planner.ts`：备份、预检、迁移、行数/关键 ID/J/≺ 校验和回滚。

约束：先探针增量迁移。若只能 `:replace`/重建关系，必须单独评审；不得删表重建生产 RocksDB。

### 事件 v0.2 与图查询

- `src/api/telemetry.ts`：
  - `beginSubtaskExecution`
  - `beginPlanRun`
  - `beginPlannerEvent`
  - `recordPlannerDecision`
  - `beginOptionExecution`
  - `recordOptionObservation`
  - `finishOptionExecution`
  - `recordModelEvent`
- `src/api/telemetry.ts` 固定查询：
  - `getExecutionTrace(option_event_id)`
  - `getSubtaskDecisionChain(subtask_event_id)`
  - `getOptionEvidence(option_id, context?)`

门控：资产和事件引用存在；状态允许；Option 的 subtask/model 绑定一致；decision 通过后才创建 option_event；一个 option_event 只有一个最终 outcome；real/simulated/sidecar 不混写；未知 reward/model 为 null/uncalibrated；Planner 文本不替代 settle/revoke。

### continuous-host contract

- `src/api/continuous-host.ts`：
  - `start / deliver / stop / report`
  - `submit / status / stop / answer`
  - 确定性 plan_run_id、idempotency_key、mapping_version
  - host_type、host_session_ref、host_ticket_ref、host_assignment_ref
  - host_question_ref / answer_event_id

一个 plan_run 可包含多个 planner_event 和 option_event。DSH/OpenCode 共用后续 planner-runtime，不创建宿主专用调度器或 Question Center。

### 原生 Attention

- `src/plugins/opencode/attention.ts`：question 与 permission ask 映射。
- `src/plugins/dsh/attention.ts`：`ctx.userQuestions.ask/askTimed/answer`、approval intent 和 root Session/Adapter 边界。
- `src/api/continuous-host.ts`：保存 ask/wait_condition、host_question_ref、answer_event_id 和恢复关联，重复回答只唤醒一次。

当前 API 探针：

- DSH 0.2.2-rc.1：`ctx.userQuestions.ask`、`askTimed`、`answer`、approval intent 存在。
- OpenCode 2.3.0：V1 permission.ask hook 与 V2 原生插件能力按实际入口适配。
- 不把 master 新能力默认套用到旧 rc，不冒充 Agent 或绕过 delegated caller 限制。

## 2. 测试清单

### 单元与真实 mnestic 集成

- `tests/planner-assets.test.ts`：Planner 注册、版本回查、Option/Model 新字段、未校准语义。
- `tests/telemetry-v02.test.ts`：事件命名、引用完整性、完整图遍历、单 outcome、未知 reward=null。
- `tests/continuous-host.test.ts`：start/deliver/stop/report、确定性 ID、多事件 plan_run、跨 host 读取一致。
- `tests/attention-adapters.test.ts`：原生调用映射、回答只唤醒一次、DSH root/版本边界。

### 故障与迁移

- 迁移前后行数、关键 ID、J/≺、604/97 质量状态和 R4 不变。
- 重复迁移不重复写入，回滚后结构和数据恢复。
- 缺 Planner/Option/Model、disabled/revoked 资产、错误 subtask/model 绑定被阻止。
- 非 execute 决策不得伪造 option_id；未 gate 的 decision 不得创建 option_event。
- 重复 outcome、重复 answer、重复 submit/deliver 不重复唤醒或执行。
- real/simulated/sidecar 不得混写，未知数值不得填 0 冒充。
- 独立 RocksDB 重启后资产、事件和恢复引用保留。

### 回归

- 原七工具、M1、settle/revoke、R3-RefRepair、R4 和 Phase 0–2 测试不回归。
- 不新增 SuperAgent、dataStore、Executor 领域资产或宿主专用调度器。

## 3. 当前迁移评审点

mnestic `:replace` 在已核实文档中是“删表重建/整体替换关系”。该路径只有在独立实例证明行数、关键 ID、J/≺ 和回滚均无损后，才可提交单独评审；未获明确批准前，不对生产执行 Option/Model 结构替换。

## 4. 完成证据（2026-11-15）

- `pnpm test`：22 个测试文件、76/76 通过。
- Planner 注册与版本回查、Option/Model 兼容字段、事件图、continuous-host 和 Attention 测试均通过。
- 用户批准 additive compatibility tables：`option_input_schemas` 与 `model_specs`，旧 options/models 未替换。
- 迁移脚本首次备份不被重复迁移覆盖，独立 RocksDB 的迁移、重复执行和回滚均通过。
- DSH 真实 userQuestions 与 OpenCode V1 permission 探针均实现回答只记录一次。
- 未实现持续 Planner、inbox/outbox、SuperAgent 正式适配或 dataStore；原七工具未改变。

详细验收见 `docs/phase3-baseline.md` 第 7 节。

## 5. 后续合并方向（2026-11-15）

用户已选择在 Phase 4 评审后，将 `option_input_schemas` 合并回 `options.input_schema`，将 `model_specs` 合并回 `models.reasoning_spec/evidence_spec/evaluation_spec`。兼容表不是必须永久保留的平行事实，而是当前无损接入方式。

合并仍以 P4-0 的独立备份、字段映射、目标结构与索引生成、兼容表回填、关键 ID/J/≺/质量核对和回滚验证为前置。切换期间以旧表为唯一写入目标，兼容表只读，禁止双写；全量回归通过后方可签署退役。未签署前不得删除兼容表或其历史记录。若原子替换、索引恢复或回滚无法保证，停止合并并保留 additive compatibility tables。

## 6. P4-0 终态边界

合并规范字段不等于所有字段一律并入旧表。Option/Model 主表只保存静态资产定义、绑定和 declarative spec；执行、观察、评价、真实成本和校准证据保存在事件关系；派生统计、反向绑定和兼容读取只作为查询投影，不作为第二写入源。`docs/phase4-field-authority.md` 必须逐字段标记“主表字段 / 事件证据 / 查询投影”，未分类不得迁移。
