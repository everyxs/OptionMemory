# Phase 4 P4-0 字段权威矩阵与合并计划

- 日期：2026-11-15
- 状态：P4-0 生产迁移已完成（2026-11-15）
- 原则：主表只放静态资产，事件保存证据，查询提供派生投影；禁止双写。

## 1. 终态分类

| 字段/关系 | 分类 | 权威与处置 |
|---|---|---|
| `options.input_schema` | 主表 declarative spec | 从 `option_input_schemas` 一对一合并，未提供时为 null |
| `options.created_at` | 主表创建血缘 | Option 首次产生时间；旧资产未登记时为 null，不从 sidecar 首次调用反推 |
| `options.parent_option_id` | 主表创建血缘 | 父 Option 标识；无父版本或未知时为 null，不表示组合 DAG |
| `options.parent_version` | 主表创建血缘 | 父版本；与 parent_option_id 配套，不回填当前版本 |
| `options.origin_event_id` | 主表创建血缘 | 产生该 Option 的来源事件；未知为 null，不从调用序列生成 |
| `models.reasoning_spec` | 主表 declarative spec | 从 `model_specs` 合并，未提供时为 null |
| `models.evidence_spec` | 主表 declarative spec | 从 `model_specs` 合并，未提供时为 null |
| `models.evaluation_spec` | 主表 declarative spec | 从 `model_specs` 合并，未提供时为 null |
| `Option.model_binding` | 主表绑定 | 当前代码的权威绑定字段；`Model.option_id` 保留为一致性检查与兼容读取 |
| `Model.option_id` | 兼容投影 | 不独立改变绑定；若与 `model_binding` 不一致则迁移停止 |
| Model `j_records` | 查询投影 | governance 事件是权威，Model 字段仅用于兼容查询；不得借投影伪造新证据 |
| `calibration_history` | 事件证据 | 真实校准记录来自执行/评价事件；未校准保持空或 `observed:false`，不得生成自证历史 |
| `achievable_probability` | 查询投影 | 应由真实 outcome 计算；未校准时不得把 0 当作实测失败率 |
| `prediction_error` | 查询投影 | 由合规评价事件计算；未观测为 null/uncalibrated |
| `cost_model` | 静态估计 + 查询投影 | 估计成本与实际成本分离；未观测使用 `observed:false` 和 null |
| `theta_version` | 主表实现版本 | 世界模型/评价实现版本，不与 `lin_theta` 合并 |
| `lin_theta` | 主表谱系版本 | 产生该资产的 LLM/基质版本；语义不同于 `theta_version` |
| `utility_queries` | 查询投影 | 后续由查询事件统计，不作为独立权威计数 |
| `i_preconditions` | 主表 declarative spec | 启动前置条件，不等于输入 schema 或经验适用域 |
| `beta_output_schema` | 主表 declarative spec | 输出结构，不等于调用参数 schema |
| `estimated_initiation_region` | 主表经验适用域 | 由真实执行估计，未建立时为空，不与启动条件混淆 |
| `verify` | 主表验证协议 | 是验证方式，不是验证结果 |
| `claim/layer/eps_*/lin_*` | 主表公民权字段 | 每个资产独立持有，不能跨表去重而丢失资产谱系 |
| option_event / outcome / model_event | 事件证据 | 执行、观察、评价、真实成本和校准证据，禁止并入主表 |
| 反向绑定和统计 | 查询投影 | 由主表或事件生成，不作为第二写入源 |

## 2. 合并映射

```text
option_input_schemas.option_id   → options.option_id
option_input_schemas.input_schema → options.input_schema

model_specs.model_id        → models.model_id
model_specs.reasoning_spec  → models.reasoning_spec
model_specs.evidence_spec   → models.evidence_spec
model_specs.evaluation_spec → models.evaluation_spec
```

映射必须一对一。重复 option_id/model_id、缺失目标、绑定不一致或 JSON 值不可序列化时停止。

## 3. 安全迁移路径

1. 备份源目录和旧关系行数、关键 ID、J/≺、604/97 质量分组及 R4 状态。
2. 创建 `options_next` 与 `models_next`，包含全部旧列和新规范字段及原索引。
3. 读取旧行和兼容表并回填目标关系，未提供字段写 null。
4. 校验目标行数、所有关键 ID、绑定、JSON 值和原索引。
5. 使用 `%swap options_next options` 与 `%swap models_next models` 切换，原关系保留为回滚证据，不直接 `:replace`。
6. 以旧表为唯一写入目标，兼容表只读；执行全量回归后签署。
7. 回滚时再次交换，恢复旧结构和旧数据；首次文件备份不被重复迁移覆盖。

未经迁移评审与签署，禁止生产删表重建、删除兼容表或修改原始证据。

## 4. 关闭条件

- 独立 RocksDB 的迁移、重复执行和回滚通过。
- 旧 Option/Model ID、J/≺、604/97 分组和 R4 不变。
- 新字段一对一，无双写，兼容读取可用。
- Phase 0–3 全量回归和原七工具通过。
- 后续 Executor/Planner 只使用已确认的权威字段。

## 5. P4-0 技术验收证据（2026-11-15）

- `options.input_schema` 与 Model 三类 spec 已纳入主表和注册路径，未提供时写 null，注册不再双写兼容表。
- `tests/field_migration.test.ts` 验证：兼容字段一对一合并、Option/Model ID 与绑定保留、重复迁移幂等、回滚后旧结构与旧 ID 恢复。
- `scripts/migrate_phase4_fields.ts` 首次备份不被重复执行覆盖，目标索引先移除再按新结构重建，回滚副本保留。
- 全量回归：`pnpm build` 通过，`pnpm test` 为 **23 个测试文件、77/77 通过**，`git diff --check` 通过。
- telemetry 与资产查询优先读取主表字段，兼容表仅作旧数据回退，不形成第二写入源。

生产迁移仍未执行，须按第 3 节完成评审与签署后方可进入 P4-1。

## 6. 生产迁移证据（2026-11-15）

- 备份目录：`.data/production-backup-2026-11-15`。
- 迁移前快照：`.data/production-before.json`；迁移后快照：`.data/production-after.json`。
- 生产执行 `scripts/migrate_phase4_fields.ts` 输出 `PHASE4_FIELD_MIGRATION_PASS`。
- facts 6314、justifications 2807、options 1、models 1、subtasks 1，迁移前后不变。
- R4 与 delta 均为 0；ref_smix_v2 为 701；original_match 604、corrected_pending_source_review 97，质量分组不变。
- `infer_phase_structure_from_xrd` 与 `model_infer_phase_xrd_v1` 的 ID、subtask/model 绑定和 probation 状态保持一致；新增规范字段为 null，未虚构。
- `options_next` 与 `models_next` 各保留 1 行作为回滚证据；回滚路径已在独立 RocksDB 验证。
- 生产迁移后 `pnpm build` 通过，`pnpm test` 为 **23 个测试文件、77/77 通过**，`git diff --check` 通过。

P4-0 生产迁移已关闭，后续可进入 P4-1 OpenCode 对话式垂直闭环。


## 7. 五项技能测量的创建血缘扩展（2026-11-17）

- 本次新增 `options.created_at / parent_option_id / parent_version / origin_event_id`，均为可空主表字段，旧资产迁移后保持 null。
- 这些字段只描述 Option 的创建与父版本，不承载环境、任务失败、调用评价或组合 DAG；后两者分别留在事件证据和未实施的后续范围。
- `scripts/migrate_phase4_fields.ts` 同步支持旧列读取、null 回填、重复迁移和回滚；`tests/field_migration.test.ts` 通过。
- 隔离 DSH 旧库先备份至 `.data/phase4-dsh-lineage-backup` 再迁移，Option/Model 各 2 行及全部原决策、执行、reviewer、stop 事件保持；`infer_phase_structure_from_xrd` 的 status 和 input_schema 不变，四个新字段均为 null。
- 生产 9070 已于 2026-11-17 执行本次扩展迁移。备份为 `.data/production-lineage-backup-20261117-224512`，迁移前后快照为 `.data/production-lineage-before.json` 与 `.data/production-lineage-after.json`。
- 首次执行因 `options_next` 索引依赖停止，未切换主表；修正临时索引清理后重试通过，独立迁移/回滚测试及生产重复执行均通过。
- 生产 facts 6314、justifications 2807、options 1、models 1、subtasks 1 不变；original_match 604、corrected_pending_source_review 97、R4 空结果及原绑定/probation 不变。`options_next/models_next` 各保留一行回滚证据。
- 新增 `created_at / parent_option_id / parent_version / origin_event_id` 均为 null，未从调用轨迹反推或补写历史。
