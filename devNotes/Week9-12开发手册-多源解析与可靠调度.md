---
创建时间: 2026-11-15
更新时间: 2026-11-17
类型: 开发手册
所属项目: "26-04 AI4Science"
对应路线图: "S01最小产品路线图（完整版）Phase 4 · Week 9–12"
状态: 实施中（P4-0 至 P4-6 均已完成，待原基线与 Phase 4 整体验收）
tags:
  - 开发手册
  - Phase4
  - OptionMemory
  - Planner
  - OptionExecutor
  - 字段迁移
  - SuperAgent
---

# Week 9–12 开发手册：多源解析、字段迁移与可靠调度（Phase 4）

> 本手册由《LLM 原生 Planner 与 Super Router 开发手册》和《S01 最小产品路线图-完整版》同步展开，包含原 Phase 4 基线与 Planner 增量。
>
> **实施顺序固定为**：P4-0 字段迁移 → P4-1 OpenCode 对话式闭环 → P4-1M 日常记忆摄入、Recall 与自动注入闭环 → P4-2 DSH 同切片验证 → P4-3 共享后台执行与恢复 → P4-4 SuperAgent 隔离探针 → P4-5 Sidecar Mapping → P4-6 日常记忆 STOMP 最小闭环。
>
> 本阶段实现对话式 Planner 和有限生命周期后台 plan_run，**不宣称完整 24/7 Super Router**，不提前实现 SuperAgent 正式持续服务或 dataStore。

---

## 一、阶段目标

### 原基线交付

- 实现 `parse_csv_materials` atomic Option，解析 S01 的 composition/process/xrd_peak/hardness。
- 新增 `parse_markdown_note` atomic Option，将日常 Markdown 作为 data 层外部原文摄入，生成 DocumentProjection 和 Observation；chunk 同时作为可选事实来源，不设置独立 FactCandidate 治理层，原文不写回。
- 支持 HEA-Lens-1540 CSV 批量解析，解析结果经服务层写入 facts 并保留 J/≺。
- 建立 transient 结算账本，记录批次成功率、耗时和真实成本。
- DSH/OpenCode 升级为 v0.2.0，**保持首版 7 工具不变**。

### Planner 增量交付

- 完成字段权威审计与可回滚增量迁移。
- OpenCode LLM 作出真实 Planner 决策，tool/subagent 两类 Option 真实执行并回流。
- 完成 OpenCode 日常记忆最小闭环：显式捕获 → MemoryCore 文档投影/facts → 关键词联合 Recall → V2 自动裁注注入 → 修订后再次召回。
- Planner 通过独立只读 `bridge_recall` 使用历史证据，禁止以召回文本扩大 mandate，禁止直接 capture/revise/settle/revoke。
- DSH 使用同一 S01 切片验证同一契约和原生 Attention。
- 建立共享 runtime_inbox/outbox、lease、timer、幂等、恢复与 Decision Gate。
- 完成 SuperAgent 隔离兼容探针和 Sidecar Mapping Contract v0.1。
- P4-6 将 capture/revise 与 Recall 刷新纳入同一 STOMP 写入链，以 data 投影作为唯一候选来源，并补齐世界状态/预测映射和最小 NativeAdapter 证明。

## 二、前置门槛与不变项

- Phase 3 原基线与 Planner-ready 增量均关闭，continuous-host contract 可用。
- Phase 0 已关闭，Phase 1 R1–R3 部分验收通过，Phase 2 已签署关闭。
- R4 阻塞不变，不批量派生 delta；97 条待复核记录不得作为独立认证证据。
- `revision/gate_audit`、J/≺ 和原七工具契约不变；不得提前注册 memory_why/query_achievable/certify。Bridge/Recall 使用独立契约，不计入原七工具。
- Markdown 原文是 data 层外部原始数据；MemoryCore 只保存 raw_ref、必要投影、来源映射与治理状态，Bridge 不修改原文，不建设第二套索引或治理中心。
- CozoScript 集中在 MnesticClient；核心层不引入 DSH/OpenCode/SuperAgent 专有依赖。
- 新 schema 只做可回滚增量迁移，禁止删表重建生产 RocksDB。
- 当前 DSH 基线为 0.2.2-rc.1、Cordis ~4.1.0、dsh-tools 0.2.2-rc.1、Node >=24.9.0；后续升级前重新执行全量兼容测试。
- 故障测试只使用独立 Mem 或独立 RocksDB 目录，不修改生产数据。

## 三、目标文件边界

```text
docs/
  phase4-field-authority.md
  sidecar-mapping-v0.1.md
  superagent-isolation-probe.md
  memory-bridge-contracts.md
  phase4-memory-stomp-acceptance.md  # P4-6 实施后生成
schema/
  10_runtime_inbox.cozo
  11_runtime_outbox.cozo
  12_memory_documents.cozo
  13_sidecar_events.cozo
scripts/
  migrate_phase4_fields.ts
  phase4_superagent_acceptance.ts
  phase4_sidecar_acceptance.ts
  phase4_memory_stomp_acceptance.ts  # P4-6 实施后生成
src/
  api/
    scheduler.ts
    superagent-probe.ts
    sidecar.ts
    document-projections.ts
    memory-recall.ts
    memory-write-options.ts      # P4-6 capture/revise 统一写入口
    bridge-contracts.ts
  bridge/
    contracts.ts
    capture/router.ts
    markdown/reader.ts
    markdown/parser.ts
    markdown/projections.ts
    markdown/filters.ts
  memory/
    document-projections.ts
  runtime/
    scheduler.ts
    plan-run.ts
    decision-gate.ts
    option-executor.ts
    native-skill.ts              # P4-6 最小宿主适配，不建通用执行框架
    handoff.ts                 # 仅契约准备，正式 handoff 在 Phase 5
  plugins/
    opencode/
      planner.ts
      planner-events.ts
      attention.ts
      bridge/index.ts
      bridge/tools.ts
      bridge/v2.ts
    dsh/
      planner.ts
      attention.ts
    superagent/
      executor.ts              # Phase 5 正式适配；P4-4 不创建生产插件
.opencode/
  agents/
    optionmemory-planner.md
    materials-evidence-reviewer.md
  plugins/
    optionmemory-planner.ts
    optionmemory-memory-bridge.ts
templates/
  memory-bridge/opencode.md
tests/
  field_migration.test.ts
  scheduler.test.ts
  decision-gate.test.ts
  planner-opencode.test.ts
  planner-dsh.test.ts
  attention-adapters.test.ts
  superagent-probe.test.ts
  sidecar-mapping.test.ts
  bridge-markdown.test.ts
  bridge-consistency.test.ts
  bridge-security.test.ts
  memory-recall.test.ts
  memory-stomp.test.ts             # P4-6 capture/revise、刷新、投影与 Model 事件
  memory-native-adapter.test.ts    # P4-6 最小原生适配成功/失败/取消
  bridge-opencode-v2.test.ts
```

不得把 `src/api/tool-executor.ts` 当作通用 Option Executor；它只分发原七工具。

---

## 四、Step P4-0：字段权威审计与增量精简迁移

### 任务

1. 编写 `docs/phase4-field-authority.md`，逐字段记录语义、权威来源、兼容投影和保留/回填/废弃处置。
2. 处理以下关系：
   - `Option.model_binding` ↔ `Model.option_id`；
   - Model `j_records` ↔ governance 事件 J；
   - `calibration_history` ↔ 成功率/误差/成本摘要；
   - `theta_version` ↔ `lin_theta`；
   - `utility_queries` 等可派生统计；
   - 未观测成功率、误差、成本和适用域的未知语义。
3. 实现 `scripts/migrate_phase4_fields.ts`：备份、预检、增量回填、重复执行、行数/ID/J/≺校验和回滚。
4. 在 Mem 与独立 RocksDB 副本执行迁移和回滚，再对生产只读副本核对。

### 评审后合并路径（2026-11-15 已批准方向）

目标是在评审后把兼容字段合并回 `options.input_schema` 与 `models.reasoning_spec/evidence_spec/evaluation_spec`。先在 `docs/phase4-field-authority.md` 证明映射与兼容关系，再在独立 RocksDB 副本完成备份、目标结构与索引生成、兼容表回填、行数/关键 ID/J/≺/质量核对和回滚。

切换期间以旧表为唯一写入目标，兼容表只读，禁止双写；全量回归通过后方可签署退役，未签署前不得删除兼容表或历史记录。若原子替换、索引恢复或回滚无法保证，停止合并并保留 additive compatibility tables，不得以 `:replace` 绕过限制。

### P4-0 终态边界：主表、事件与投影

- Option/Model 主表只保存静态资产定义、绑定和 declarative spec，包括评审后合并的规范字段。
- 执行、观察、评价、真实成本和校准证据保存在事件关系，不得为了精简并入主表。
- 派生统计、反向绑定和兼容读取只作为查询投影，不作为第二写入源。

`docs/phase4-field-authority.md` 必须逐字段标记“主表字段 / 事件证据 / 查询投影”，未分类不得迁移。字段精简不等于所有字段一律合并。

### 硬性约束

- 未观测值使用 `null`、`observed:false` 或 `uncalibrated`，不得以 0 或空字符串冒充实测值。
- 保留原始证据、关键 ID、604/97 分组、历史治理事件和 R4 阻塞。
- 若 mnestic 只能重建关系，停止并单独评审，不得静默迁移。
- P4-0 未关闭前，Executor/Planner 不得依赖已废弃字段。

### 验收

- [x] 字段权威矩阵与逐字段处置已批准。
- [x] 迁移、重复执行和回滚均通过，关键 ID、J/≺、质量分组不变。
- [x] 旧读取契约或兼容投影可用，Phase 0–3 全量回归通过。

---

## 五、Step P4-1：OpenCode 对话式垂直闭环

### 5.1 Planner Agent

`.opencode/agents/optionmemory-planner.md` 必须：

- `mode=primary`；
- 默认禁止 edit/shell/subagent 等直接执行权限；
- 只开放 Planner 专用只读查询和独立 `planner_decision`；
- 返回 execute/decompose/replan/retry/wait/ask/stop/ignore 的结构化 decision_json；
- 引用证据和未知项，不得扩大 mandate。

`planner_decision` 不加入原七工具清单，Planner 文本不得直接替代 settle/revoke 或其他 governance API。

### 5.2 两类真实 Option

1. `infer_phase_structure_from_xrd`：通过 host-neutral 适配器复用现有 `deriveClosure()` 和 R2。
2. `review_s01_evidence`：调用只读 materials evidence reviewer，返回结构化评价。

子 Agent 的 Session、目录和后台运行只是 Option 运行配置，不创建 Executor 领域资产。

### 5.3 事件回流与解析负载

- session.idle/session.error/tool.execute.after/subagent 完成/人工新输入先转换为 runtime_inbox。
- host 事件与 option_event 确定性去重；无法映射时写异常并停止自动重放。
- parse_csv_materials 批次使用 outbox 和 idempotency key，parser 版本写入 execution_json。
- 解析结果、闭包和 J 血缘继续走原服务层，不另建解析专用事件体系。

### 验收

- [x] OpenCode 真实 LLM 作出决策，不是测试直接返回预写 decision。
- [x] tool/subagent 两类 Option 真实执行并产生 observations/outcome。
- [x] 失败 outcome 可触发 replan/ask/stop，原始 host 事件、decision 和 outcome 可按同一 ID 链回查。
- [x] CSV 解析、闭包、J 血缘和 transient 结算账本通过，原七工具兼容。

验收证据见 `docs/phase4-opencode-acceptance.md`。真实 reviewer verdict 为 `review_required`，仅表示执行成功，不代表证据认证或 settle；HEA-Lens-1540 全量批次和 Phase 4 整体验收不在 P4-1 勾选范围内。

---

## 五A、Step P4-1M：日常记忆摄入、Recall 与 OpenCode 最小闭环（多源解析增量）

> 对应 `devNotes/MemoryBridge开发方案.md` B0–B2。此步骤同时完成 Markdown 摄入治理、MemoryCore Recall、显式捕获/修订和 OpenCode 自动注入，不再拆到 Phase 5–6。

### 任务

1. 冻结 DocumentProjection/ChunkProjection、MemoryRef、CaptureCandidate、source link 和 ConflictRecord 契约，建立匿名化日常笔记、项目决策、实验报告、S01、同义改写和 450/512 HV fixture。
2. 实现只读 Markdown 扫描和三层过滤：
   - 硬过滤：密钥、敏感路径、二进制、依赖/构建目录和未授权链接；
   - 结构过滤：标题/语义分块、模板噪声、完全重复块；
   - 候选过滤：仅需要精确修订和推导的声明进入 FactCandidate，其余保留原文投影。
3. 注册 `parse_markdown_note` atomic Option 与绑定 Model，通过同一 Option Executor 白名单执行，保存 parser 版本、attempt、成本、错误和输出校验证据。
4. 建立 `12_memory_documents.cozo` 增量关系和固定查询：
   - document/chunk ID、raw_ref/path/heading_path/content_hash；
   - namespace、parser_version、source_updated_at/recorded_at；
   - `fact_id → chunk_ref` source link、mapping_status 和 excluded_reason/policy_version。
5. 原文外部变化后只标记 `mapping_stale` 并重新解析，不修改原文，不自动 retract 旧事实；identity 不确定时不得继承旧映射。
6. 提供固定只读查询 document/chunk、fact source refs 和 stale mappings；source link 与 J/≺ 推导血缘不得混用。
7. 实现独立只读 `memory_recall`：中文关键词/bigram、namespace、Top-K、token budget、简单去重和状态裁注；可选联合 MemoryCore facts，未观测 semantic score 为 null，不启用现有随机向量。
8. 实现 `bridge_capture/bridge_revise/bridge_recall`：用户明确“记住”仅授权当次内容；模型候选需另批；修订创建 superseding document，不删除历史，不修改既有 Markdown 或 AGENTS.md。
9. 通过 `ctx.session.hook("context")` 自动召回并注入 REFERENCE_MEMORY，使用 session_id+message_id+query_hash 持久化去重，continuation 复用；真实 `{role,content}` 与 V1 `{type,parts}` 消息形态分别适配。
10. Planner 仅开放只读 `bridge_recall`，decision 可引用 memory_uri，召回文本不得扩大 mandate；capture/revise/settle/revoke 仍由独立授权路径执行。
11. 不实现自动 compaction、直接文件读取强制裁注、持续后台整理或真实向量。

### 硬性约束

- 原文、原始记录和自由叙述不被 Bridge 修改；MemoryCore 只保存必要投影和治理元数据。
- 解析成功不等于候选事实正确；候选不自动 settle，achievable/ω_certify 留 Phase 6。
- 被过滤原文仍留在文件系统，排除原因和策略版本可审计、可重新处理。
- 同步操作只承诺幂等、安全重试和对账；副作用未知进入 reconcile_required，不盲目重放。

### 验收

- [x] 同一文件、同一版本重复解析不重复生成 projection 或 facts。
- [x] DocumentProjection/FactCandidate/Observation 完整入库，parser 版本与 outcome 可回查。
- [x] ν 门、来源关联和 J/≺ 语义正确，未验证候选不自动 settle。
- [x] 外部原文变化产生 mapping_stale，原文不变，旧事实不被自动覆盖或删除。
- [x] 敏感路径、跨项目内容和恶意笔记不进入未授权投影或日志。
- [x] 固定只读查询可回答当前事实、原文出处和复核状态；原七工具与既有回归不回归。
- [x] 会话 A 显式捕获，会话 B 自动召回并引用，修订后新会话使用新版本；真实 OpenCode 证据见 `docs/phase4-memory-bridge-acceptance.md`。
- [x] Planner 只读 bridge_recall 可区分 active/superseded，未直接 capture/revise/settle/revoke。

---

## 六、Step P4-2：DSH 同切片验证

使用同一 S01 工作负载和核心契约验证：

- 原生 Planner、工具权限和 subagent 适配；
- Planner `ask` 映射到 `ask_user_question` / `ctx.userQuestions`；
- 操作审批使用 approval intent；
- 按实际 pin 探针 `askTimed`、pending/continued 和 Remote `answer`；
- 外部 runtime 经 root Session/Adapter 提问，不绕过 delegated caller 限制；
- DSH/OpenCode 交叉读取同一 plan_run、事件 ID、gate/reason、outcome 和 J/≺。

OpenCode 使用 question/permission ask，DSH 使用 userQuestions/approval；回答只唤醒一次 plan_run。核心只保存 `host_question_ref`、`answer_event_id` 与恢复关联，不新建 Question Center。

### 验收

- [x] DSH 真实 LLM 作出决策，tool/subagent Option 真实执行并回流。
- [x] 两种 host 对同一核心契约返回一致业务结果，不形成第二套控制事实。
- [x] DSH 发起的 plan_run 可由 OpenCode 查询、回答或停止，反向亦同。
- [x] DSH/Cordis 兼容、host 重启和 RocksDB 数据保留有独立记录。

验收证据见 `docs/phase4-dsh-acceptance.md`。DSH 与 OpenCode 的日常捕获/修订亦交叉读取一致；原七工具和 R4 边界未改变。

---

## 七、Step P4-3：共享持久化后台执行与恢复

### 7.1 runtime_inbox

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

`status = pending / leased / done / dead / ignored`；`event_type = request / timer / option_outcome / model_event / human_input / host_event`。

event_id 由来源和外部幂等键确定生成，同一 trigger 重发不得产生第二条有效任务。

### 7.2 runtime_outbox

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

`status = pending / leased / dispatched / done / dead / cancelled`。

Planner decision 与 outbox 必须在同一持久化边界提交。若 mnestic 无法保证跨关系原子写入，停止并报告，不得先执行后补日志。

### 7.3 调度循环

```text
1. 领取到期 inbox（lease）
2. 重建 subtask/planner 上下文
3. 调用 Planner Agent
4. Decision Gate 校验
5. 同事务保存 planner_event_decision + outbox
6. inbox 标 done
7. 领取到期 outbox
8. 创建/更新 option_event 并分发
9. Option 结果先写 inbox，再唤醒后续 Planner
10. 崩溃后回收过期 lease
```

Timer 的真实状态是 `available_at/waiting_condition`；进程内 timer 仅是唤醒提示。DSH/OpenCode 共用一个有限生命周期后台 runtime，不分别持有权威队列。

### 7.4 Decision Gate

检查 mandate/policy、scope、budget、allowed effects、Option 参数和证据、contested/revoked/disabled 资产、decompose 扩权、retry 次数、ask 单问题、dry-run 和 stop/pause。

### 7.5 Option Executor

执行入口接收 `option_id`、参数、`option_event_id`/idempotency key、mandate 和 `AbortSignal`：

```text
加载 Option/Model 与状态
  → 校验 mandate、I/i_preconditions 和输入 schema
  → 以 (pi_type, pi_ref) 查找受控实现
  → 调用实现并传递取消信号
  → 按 beta_success/beta_output_schema 校验
  → 写 option_event_observation/outcome
  → 结果进入 inbox
```

实现约束：

- `(pi_type, pi_ref)` 只能解析到显式注册实现，禁止 `eval()` 或执行数据库代码字符串。
- 未知实现、版本不匹配和输入/输出不合规必须 blocked。
- deriveClosure、measure、parse、subagent 和未来 verifier 都通过同一适配边界复用实现库。
- `pi_ref` 保存版本化引用，执行事件保存实现版本、pi_theta、attempt 和 real/simulated/sidecar。
- contested/revoked/disabled Option、失效前提和越权输入不得执行。
- 同一 idempotency key 不重复产生副作用；执行中崩溃或响应丢失时先对账，不盲目重放。

### 验收

- [x] 重复 trigger 不重复建单或执行。
- [x] 决策后、分发前崩溃可恢复且不重复副作用。
- [x] Option 已产生副作用但响应丢失时按 idempotency key 对账。
- [x] wait 期间 Planner 调用次数为 0，timer 到期唤醒一次。
- [x] 未授权主动规划只产生 dry-run，stop 不被自动事件绕过。
- [x] lease 超时回收、活跃 lease 不被抢占，同一 subtask 决策串行。

验收证据见 `docs/phase4-scheduler-acceptance.md`。独立 RocksDB 完成四次真实进程重启；真实执行后的 outcome 删除故障注入返回 `reconcile_required` 且不增加 observation。日常记忆经调度只产生一份 document，stop 后 Recall 保持只读且不恢复 plan_run。最终全量回归为 29 个测试文件、105/105 通过。

---

## 八、Step P4-4：SuperAgent 隔离兼容探针

只在独立数据目录验证：

- start/deliver/stop 可映射到 plan_run；
- assignmentStarted/report/Ticket Attention 回调可往返；
- 重复 start/deliver 和 host restart 的幂等与恢复；
- Ticket、Assignment、Input ID 足以生成确定性映射。

探针不形成生产依赖，不纳入完整持续服务验收。若核心契约无法映射，必须在 Phase 4 内修订，不留待 Phase 5 返工。

2026-11-17 验收通过：`src/api/superagent-probe.ts` 复用 continuous-host 与 runtime inbox，未新增 Ticket Store。独立 RocksDB 两次真实重启后，重复 start/deliver/requestAttention/report 均不重复回调，回答只唤醒一次，stop 后 deliver 被 blocked。显式记忆不被隐式复制。契约与真实 Ticket/ACK 证据见 `docs/superagent-isolation-probe.md` 和 `docs/phase4-superagent-acceptance.md`；最终全量回归为 30 个测试文件、111/111 通过。

---

## 九、Step P4-5：Sidecar Mapping Contract v0.1

契约至少覆盖：

- scenario/run/tool/call 映射；
- 确定性 ID、external_id、mapping_version；
- baseline_id 隔离；
- native/mapped/observed/uncalibrated 来源；
- 未知 model、reward、rationale 的 null 语义；
- 原始 payload 保存位置；
- real/simulated/sidecar 证据隔离。

不得从调用序列反推 plan template，不得补写源 Agent 未暴露的决策理由。

### 9.1 五项技能测量字段与 Sidecar 映射（2026-11-17 追加）

本扩展只覆盖：新技能产生、合适时机调用、解决旧问题、环境变化后的更新或遗忘、回滚后旧技能重新启用。**舍弃第六项“新技能是否为旧技能组合”，不创建组合 DAG，也不从调用顺序推断组合关系。**

Option 仅新增四个可空创建血缘字段：

| 字段 | 语义 | 未登记时的值 |
|---|---|---|
| `created_at` | Option 首次产生时间，不从首次 sidecar 调用反推 | `null` |
| `parent_option_id` | 父 Option 标识，不表示组合 DAG | `null` |
| `parent_version` | 父版本，不回填当前 `lin_version` | `null` |
| `origin_event_id` | 产生该 Option 的来源事件，不从调用序列生成 | `null` |

Sidecar 新增 `skill.registered / skill.updated / skill.rollback` 三类原始生命周期事件。它们只关联已注册 Option，不创建或改写 Option 当前状态。注册事件携带创建血缘时必须与 Option 一致；`skill.updated` 必须提供 `observed_option_version`；`skill.rollback` 必须提供 `revision_ref`。

其余输入及落点如下，均复用现有事件模型：

| 输入 | 映射目标 | 测量用途 |
|---|---|---|
| `subtask_id / subtask_event` | 问题类型与问题实例，不新增 `problem_id` | 定位旧问题及适用任务 |
| execute/ignore 等 planner decision | `planner_event_decision`；ignore 不产生 option_event | 分析应调用与未调用，负样本由评测场景提供 |
| `observed_option_version / observed_model_version` | `option_event.execution_json` | 区分历史观测版本与当前注册版本，未知为 null |
| `environment` | `option_event_observation(environment)` | 保存实际执行环境，不直接推断 drift |
| `verification={verifier_id,verdict,evidence_refs}` | `model_event.critique` | 关联旧失败和独立验证；不自动等同于 achievable/settle |
| `drift` | `model_event.drift` | 记录显式环境或能力漂移，未提供则不创建 |
| `lifecycle_ref` | option_event 执行上下文，并继承到 drift | 关联回滚或生命周期证据，结果事件无需重复传值 |
| `revision_ref` | `skill.rollback` 原始生命周期投影 | 关联既有 revision，不另建回滚状态机 |

五项测量分别按以下方式读取：

1. 新技能产生：Option 创建血缘 + `skill.registered`。
2. 合适时机调用：subtask/subtask_event 适用上下文 + execute/ignore decision + option_event；不得只统计成功调用。
3. 解决旧问题：同一问题链的历史 option_event + 独立 verification；源 `status=success` 不能替代 verifier。
4. 环境变化与遗忘：environment observation + drift + 观测版本 + 固定回归集前后对比；未提供 drift 时不得自动下结论。
5. 回滚后重新启用：rollback/revision + 后续 option_event 的 `lifecycle_ref` + 独立 verification；不得仅因旧 Option 再出现就认定恢复有效。

迁移与验收要求：

- `schema/05_options.cozo`、`src/memory/assets.ts`、`src/api/registry.ts` 和 `scripts/migrate_phase4_fields.ts` 必须同步；旧列读取、null 回填、重复迁移和回滚均须通过。
- `tests/sidecar-mapping.test.ts` 的五项测量场景与 `tests/field_migration.test.ts` 必须通过。
- `node scripts/phase4_sidecar_acceptance.ts` 必须输出 `five_skill_measurements=true`，并在真实 RocksDB 重启后保留全部关联。
- 旧库先备份再迁移；隔离 DSH 备份为 `.data/phase4-dsh-lineage-backup`。生产 9070 未执行本轮扩展迁移，生产启用前仍须走备份与验收流程。

2026-11-17 验收通过：`src/api/sidecar.ts` 与 `schema/13_sidecar_events.cozo` 保存完整原始 payload 和映射缺口，完整链可投影原生事件，不完整链不创建占位资产。独立 RocksDB 两次真实重启验证 raw-first 恢复、baseline 隔离、显式零奖励和 real/simulated/sidecar 分离。追加的五项技能测量扩展仅给 Option 增加可空创建血缘字段，其余复用 subtask/option/model/revision；环境、独立验证、drift、观测版本和回滚引用均已映射并通过恢复验收，不实现第六项组合 DAG。契约与证据见 `docs/sidecar-mapping-v0.1.md` 和 `docs/phase4-sidecar-acceptance.md`；最终全量回归为 31 个测试文件、117/117 通过。

---

## 九A、Step P4-6：日常记忆 STOMP 最小闭环（2026-11-17 新增，已通过）

### 9A.1 目标与对象边界

将日常记忆写入统一接入 STOMP，但不把 data、declarative knowledge 与 procedural knowledge 混为一谈：

- `capture/revise` 是 procedural Option，默认操作对象是 data 层 DocumentProjection/chunk；
- chunk 同时作为日常 Recall 内容和可选事实来源，**不设置独立 FactCandidate 持久层、状态机或 `candidate_status`**；
- 只有需要参与推导的内容才经 ν 门和服务层形成 declarative facts，并通过 source link 回指 chunk；
- `fact_candidates` 仅可作为兼容的调试预览，不是 STOMP 的必要输出；
- Recall 是只读查询，但外部 Markdown 刷新会写投影，因此刷新必须复用 `markdown-note` Option，不能绕过执行证据直接写库。

### 9A.2 capture/revise 与 Recall 刷新

复用现有 `captureDailyMemory()`、`reviseDailyMemory()` 和 `parseMarkdownNote()`，不重写其实现：

1. 在 OptionExecutor 注册 `memory-capture@v1`、`memory-revise@v1`；
2. 以宿主共用的记忆写入口建立/恢复 subtask 和 plan_run，用户明确“记住/修正”形成 explicit mandate；
3. 记录真实 execute decision，经 OptionExecutor 调用原实现，保留工具参数、返回结构和幂等键，不要求额外 LLM 生成 Planner rationale；
4. OpenCode V1/V2 与 DSH 的 bridge_capture/revise 统一走该入口，不再由宿主直接写文档服务；
5. Recall 需要刷新外部 Markdown 时先执行同一 `markdown-note@v1` Option，再读取投影；Recall 本身不伪造 Planner/Option 事件；
6. revise 仍写 data 层 `supersedes`，declarative fact 修订仍走 memory_retract/revision 与 J/≺，不得混用。

### 9A.3 Model、世界状态与最小 NativeAdapter

- OptionImplementationResult 可增加可选 `model_events = anticipation/critique/calibration/drift`，由 OptionExecutor 统一持久化；没有真实证据时不创建，不以 parser 自评冒充校准或认证。
- Sidecar 仅补三个可选映射：`pre_state → observation(pre_state)`、`post_state → observation(post_state)`、`anticipation → model_event.anticipation`。实际状态与预测不得混写，未提供时不创建，不新增数据库字段。
- 先用 Sidecar 观察一个简单只读工具，再复用 `registerControlledOptionImplementation` 完成最小 NativeAdapter：OpenCode 一个只读原生工具或 Skill，DSH 一个明确的原生工具或 subagent。允许实现不同，但 gate、reason、mode=real、事件与取消语义一致。
- 原生 harness 继续负责 Skill 加载、工具执行、权限、会话和取消；MemoryCore 负责 mandate、Option/Model、事件、评价和 revision，不重写 harness。

### 9A.4 默认治理与非目标

默认策略必须保证：敏感路径和跨 namespace 写入被拒绝；同一 source_ref/idempotency_key 不重复捕获；document 为 active→superseded、外部变化为 mapping_stale；out/revoked/superseded 不进入当前建议，contested 带警告；同一 message 不重复注入；sidecar 不进入真实认证；缺 outcome 时先对账，不盲目重放。

本 Step **不新增表或日常记忆字段，不实现组合 DAG/嵌套 Option、自动 Skill 生成、完整世界模型、通用全类型 NativeAdapter、RL、memory_why/query_achievable/certify，也不重放原生 RocksDB 历史事件**。Option 创建血缘沿用既有可空迁移，生产 9070 迁移另行按备份流程执行。

### 9A.5 Step 验收

- [x] capture 形成 data 投影及完整原生 STOMP 链，重复捕获不重复写入，mode=real。
- [x] revise 保留 superseding 链和下一次 Recall 结果，原文不变， declarative fact 修订不走 document 状态替代。
- [x] Recall 刷新经 Option 产生解析证据和 mapping_stale，Recall 读取本身不伪造执行事件。
- [x] chunk 可直接作为事实来源，source link 与 J/≺ 正确，不依赖独立 FactCandidate 层。
- [x] pre/post/environment 与 anticipation 正确分离，未知状态/预测不补写。
- [x] 最小 NativeAdapter 成功、失败、权限拒绝和取消均有真实事件，未形成通用全类型适配承诺。
- [x] OpenCode/DSH 新真实会话完成 capture → 跨会话 Recall → revise → 再次 Recall，原七工具不变。
- [x] 旧 RocksDB 原生 facts/J/revision/option_event 保持 ID、状态和 real 语义，sidecar 不混入真实认证。
- [x] 全量回归及 `docs/memory-regression-acceptance.md` 共享回归通过，证据归档到 `docs/phase4-memory-stomp-acceptance.md`。

2026-11-17 验收通过：独立 RocksDB 完成两次真实重启，重复写入、缺 outcome 对账、敏感过滤、刷新、世界状态和 NativeAdapter 故障均通过。OpenCode 四个真实新会话与 DSH 四个真实新会话均完成 capture/Recall/revise；DSH 在修订前正确展示冲突而非静默选择。最终全量回归为 33 个测试文件、123/123 通过，真实 ID 与日志见 `docs/phase4-memory-stomp-acceptance.md`。生产 9070 已完成 Option 创建血缘迁移，备份为 `.data/production-lineage-backup-20261117-224512`，原计数、绑定、604/97 分组和 R4 边界不变。

**P4-6 执行验收签署：通过（Kimi Code CLI，2026-11-17）。本签署仅覆盖 P4-6，Phase 4 原基线和整体验收继续待签。**

---

## 十、测试与故障验收

必须使用独立 Mem 或 RocksDB 目录：

- 字段迁移前后、重复迁移和回滚；
- 决策提交前后崩溃；
- outbox 分发前后崩溃；
- Option 执行中崩溃和响应丢失；
- lease 超时、重复事件和重复 timer；
- 未知 pi_ref、I 不满足、输入/输出 schema 错误、实现抛错和取消；
- host reload/unload；
- SuperAgent 重复 start/deliver 和隔离恢复；
- Phase 0–3 全量回归、R4 边界和原七工具兼容。

### P4-6 专项故障验收

- capture 在 decision、document/chunk 写入和 outcome 前后崩溃；重复请求只能按幂等键复用或对账，不得重复写入。
- revise 在旧版本 superseded、新版本写入和 outcome 之间崩溃；恢复后必须确认新旧状态及 supersedes 指向，缺 outcome 不得盲目重放。
- 外部文件读取期间变化、解析失败、Recall 刷新失败：不得形成混合快照或伪造成功，Recall 返回明确 degraded/stale。
- 空文本、敏感内容、非法 namespace、跨项目写入、越权路径、缺失 mandate、revoked Option/Model、未知 pi_ref 和 schema 错误均 fail-closed。
- Sidecar 缺 pre/post/anticipation、状态与预测冲突、重复或变更 payload：未知不补写，冲突不覆盖原记录。
- NativeAdapter 权限拒绝、超时、取消、宿主事件丢失、reload/unload：真实记录失败或对账，不转成 sidecar 冒充原生执行。
- 未提供 anticipation/critique/calibration/drift 时不得生成 Model 事件；旧 RocksDB 迁移和回滚不得重放或篡改原生历史。
- OpenCode/DSH 新真实会话、跨会话 Recall、修订后 Recall、host 重启和插件卸载/重装均须单独留证，内部函数或 mock 不能替代。

### 日常记忆强制回归与增量交互

所有后续 Step 必须执行 `docs/memory-regression-acceptance.md` 的共享回归，不能以 P4-1M 的双会话结果替代增量验收：

- P4-2：DSH/OpenCode 对同一 document/fact 的内容、状态、来源和冲突标注一致，跨 host 修订生效。
- P4-3：崩溃、lease、重复 trigger 和 timer 不造成重复捕获/执行；wait 不调用 Planner，stop 后不再通过 Recall 自动恢复。
- P4-4：Ticket/Assignment/Input 映射正确，重复 start/deliver 不重复记忆副作用，探针不冒充正式服务。
- P4-5：不从记忆补写源 Agent 未暴露的 rationale/model/reward，real/simulated/sidecar 不混写。
- P4-6：capture/revise/Recall 刷新全部有原生 STOMP 证据；chunk 直接作候选来源；pre/post 与 anticipation 分离；故障和重启不产生重复记忆或伪造 Model 事件。
- 每一步分别归档增量功能、记忆交互、共享回归和未实现项，缺一项不得签署对应 Step。

## 十一、Phase 4 Repo 验收清单

### A. 原基线

- [ ] CSV 解析出 S01 目标事实，HEA-Lens 批量导入成功。
- [x] P4-1M Markdown 摄入、MemoryCore Recall、显式捕获/修订、自动注入和真实双会话验收通过。
- [ ] 解析 → 写入 → 闭包 → J 血缘通过。
- [ ] transient 结算记录真实成功率、耗时和成本。
- [ ] 双 host v0.2.0 保持七工具，升级与数据保留通过。

### B. 字段迁移

- [x] P4-0 权威矩阵、迁移、回滚和数据一致性通过。

### C. Planner 与宿主

- [x] OpenCode 真实闭环通过。
- [x] DSH 同切片与原生 Attention 通过。
- [x] 回答只唤醒一次，未建设 Question Center 或独立宿主调度器。

### D. 可靠执行

- [x] inbox/outbox、lease、幂等、timer、stop 和恢复通过。
- [x] Option Executor 受控实现、I/β、事件和故障测试通过。

### E. 后续接口

- [x] SuperAgent 隔离探针通过且未冒充正式服务。
- [x] Sidecar 可映射不完整资产链，不伪造语义。

### F. 日常记忆增量回归

- [x] P4-2 双 host 联合召回、状态/来源一致和跨 host 修订通过。
- [x] P4-3 故障恢复、重复 trigger、wait/stop 与记忆副作用边界通过。
- [x] P4-4 Ticket 映射、重复 start/deliver 和记忆副作用边界通过。
- [x] P4-5 sidecar 未知字段和证据来源隔离通过。
- [ ] 每步共享回归、质量/安全指标、真实宿主事件和未实现项均独立归档。

### G. P4-6 日常记忆 STOMP 最小闭环

- [x] capture/revise 形成完整原生 STOMP 链，data 投影、幂等、superseding 和真实宿主会话通过。
- [x] Recall 刷新通过 Option，mapping_stale/degraded 正确，无服务层直写绕过。
- [x] chunk 直接作为候选来源，facts/source link/J/≺ 与 declarative revision 正确，无独立 FactCandidate 层。
- [x] pre/post/environment、anticipation、critique/drift 按真实证据记录，未知不补写。
- [x] 最小 NativeAdapter 成功、失败、权限拒绝、取消和恢复通过，real/sidecar 不混写。
- [x] 专项故障、旧 RocksDB 保留、共享回归和增量证据均通过，未实现项明确列出。

### 验收签署

| 角色 | 签署项 | 日期 | 签字 |
|---|---|---|---|
| 执行人 | A–G 全部核对通过 | | 待签 |
| 子课题1 负责人 | 双 host、解析、升级与数据保留 | | 待签 |
| 子课题2 负责人 | 字段迁移、治理、调度与恢复 | | 待签 |
| 子课题3 负责人 | 证据质量、R4、Sidecar 与日常记忆 STOMP 边界 | | 待签 |

A–G 全部通过后方可进入 Phase 5；P4-6 不替代 Phase 4 原基线验收，SuperAgent 隔离探针不替代 Phase 5 正式适配。
