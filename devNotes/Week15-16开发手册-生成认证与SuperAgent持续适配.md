---
创建时间: 2026-11-15
更新时间: 2026-11-18
类型: 开发手册
所属项目: "26-04 AI4Science"
对应路线图: "S01最小产品路线图（完整版）Phase 6 · Week 15–16"
状态: 待实施（Phase 5 关闭后启动）
tags:
  - 开发手册
  - Phase6
  - OptionMemory
  - MemoryBridge
  - OpenCode
  - omega_certify
  - RL-ready
---

# Week 15–16 开发手册：生成认证、主动规划与 SuperAgent 持续适配（Phase 6）

> 本手册由《LLM 原生 Planner 与 Super Router 开发手册》和《S01 最小产品路线图-完整版》同步展开，包含原 Phase 6 基线、Planner 增量及 SuperAgent 持续记忆治理。
>
> **实施顺序固定为**：P6-1 主动规划与生成 → P6-2 认证证据统一 → P6-3 RL-ready 导出 → P6-4 SuperAgent 主动记忆治理与跨 harness 恢复 → P6-5 declarative→procedural 候选管线与沉降/退役分层（双线治理 B 项，2026-11-18 追加）。
>
> **2026-11-18 v5 最终分工（v5.1→v5.2→v5.3 修订）**：**Stage A（W13–14+W15a）= 可用记忆产品（mds + skills，procedural 管理完整，零 SuperAgent 依赖）**——P6-5 全链、P5-5 join、P5-3 md 血缘均在此阶段完成；**Stage B（W15b–20）= SuperAgent 能力 + runtime 链 ∥ dataStore**——P5-2/P5-4/P6-4（含 runtime 侧与数据侧）等全部 SuperAgent 工作归 Stage B。本手册 Stage B 归属：P5-2/P5-3 机制/P5-4/v0.3.0 归线1（W16–18，Phase 5 runtime 关闭于 W18）；P6-1/P6-2/P6-3、P6-4 runtime 侧、v0.4.0 归线1（W19–20，回归两线共担）；P6-4 数据侧与 Horn 校验归线2（W18–19）；线2 同时并行 dataStore DS1/DS2。S1–S6 为人际契约（Stage A 定稿）。总安排见 Dual-Track 手册 v5 Final §2.2/§2.3。
>
> OpenCode 日常记忆最小闭环已在 Phase 4 独立验收，Phase 5 已完成 SuperAgent 基础记忆适配。本阶段只增强持续任务中的主动治理、认证和恢复，不重复建设 MemoryCore 或 Ticket 状态机。

---

## 一、阶段目标

### 原基线交付

- 实现 `generate_vec_candidate` atomic Option 与生成质量标记。
- 完成组成守恒、VEC、Smix 等校验；R4 相关约束仍受阻塞限制。
- 实现 ω_certify、achievable、query_achievable。
- DSH/OpenCode 升级为 v0.4.0，**原工具由 8 增至 10**，旧契约保持兼容。
- plan_templates 保留原预留，不因 Planner 强制启用。

### Planner 增量交付

- 完善主动规划、优先级、父/子 Planner 和子 Agent 委派。
- 原生 planner-runtime 与 SuperAgent 持续宿主模式使用同一 Planner/Option/Model 和事件契约。
- 真实、模拟和 sidecar 轨迹分开，模拟 rollout 不进入真实认证。
- 导出 RL-ready 只读轨迹，不承诺 RL 训练。

### SuperAgent 持续治理增量交付

- 在 Source/Ticket 长期生命周期内执行授权的记忆重评估、候选整理、冲突复核和主动重规划。
- 跨 harness handoff 保留 Recall/捕获/修订/批准链，支持 SuperAgent 与 OpenCode 交叉读取和恢复。
- 持续记忆评价进入统一 option_event/model_event，可与生成认证和 RL-ready 导出关联。
- 人工 stop、Ticket 终止与 Option revoke 分别生效，主动发现不得自动扩权或自动发布核心 Skill。

### 双线治理增量交付（2026-11-18 追加；v5.1 修订归属）

- P6-5 declarative→procedural 候选管线（识别 → 候选 → 人工批准 → 注册门 → Option）、下行沉降三分离与退役分层（dormant 保留、运行时降权 ≠ 资产退役）。
- v5.1 分工（MD-Memory 轨道）：注册门/资产化/active_release/dormant/校准红线归**线1**；**候选识别与降维索引、三分离叙事侧测试归线2（MM-L2）**，S1/S3 为人际契约；P6-4 按 runtime 侧（线1）/治理数据侧（线2）拆分。线2 同时并行 dataStore。红线由 S1–S6 契约与测试强制（见 Dual-Track 手册 v5 §2A/§3）。

## 二、前置门槛与不变项

- Phase 5 全部关闭，包含 P4-1M OpenCode 日常记忆最小闭环、P5-4 SuperAgent 持续记忆适配、P5-5 procedural 元数据对话期召回（活读 + 裁注）、共享后台恢复和 SuperAgent 正式适配。
- P6-5 启动前，S1（候选 schema，线2→线1）与 S2（召回 join 契约，线1→线2）人际契约必须已定稿归档（v5.1；schema 变更两线会签）。
- R4 阻塞、97 条待复核记录隔离、J/≺ 和 ν 门不变。
- 原工具数量只从 8 增至 10；Bridge/Recall 是独立 API/插件契约，不混入该计数。
- Markdown 原文是 data 层外部原始数据，Bridge 不写回，不建设第二套索引或治理中心。
- 当前随机 embedding 不作为语义证据；P6-4 最小闭环只要求关键词/结构化召回，不强制向量。
- CozoScript 集中在 MnesticClient；新 schema 只做可回滚增量迁移。
- 故障测试使用独立 Markdown 根目录和独立 RocksDB，不修改生产数据。

## 三、目标文件边界

```text
docs/
  phase6-certification.md
  memory-bridge-acceptance.md
  memory-bridge-contracts.md
src/
  api/
    generate.ts
    certify.ts
    rollout-export.ts
  runtime/
    planner.ts
    generate.ts
    certification.ts
  plugins/
    superagent/
      memory-bridge.ts
      memory-governance.ts
      events.ts
templates/
  memory-bridge/opencode.md
tests/
  generate.test.ts
  certify.test.ts
  rollout-export.test.ts
  superagent-memory-governance.test.ts
  bridge-security.test.ts
  memory-recall.test.ts
```

`src/bridge/` 和 `src/memory/recall.ts` 已在 P4-1M/P5-4 交付，本阶段不得复制其实现。V2 context hook 的实际 API 必须先通过目标 pin 探针，不能按 mock 假定。

---

## 四、Step P6-1：主动规划与生成

### 任务

- 完善优先级、父/子 Planner 和子 Agent 委派。
- 主动发现与主动执行分离，主动执行必须命中 mandate/policy。
- `generate_vec_candidate` 使用 input_schema、实现快照、评价标准和 real/simulated 标记。
- 生成、校验、critique 和 replan 使用统一 option_event。
- SuperAgent 人工 stop、Policy revalidation 与 OptionMemory 能力撤销分别生效。
- plan_templates 保持原预留，不要求启用。

### 验收

- [ ] 父 Planner 能在授权范围内主动分解、调度和重规划。
- [ ] 生成过程具有输入、实现版本、评价、成本和真实/模拟来源。
- [ ] 未授权主动执行被阻止，人工 stop 不被自动事件绕过。

---

## 五、Step P6-2：认证证据统一

### 任务

ω_certify 可使用真实 option_event_outcome 和 model_event critique/calibration，但必须：

- 按 baseline/context 分区；
- 排除或单列 simulated、未验证 sidecar 和 97 条待复核记录；
- 不把未校准 Model 的自我评价当作独立证据；
- 区分 SuperAgent ready Report、Option 自我结果、CI/PR 证据和人工验收；
- 保持 achievable 与 J={s,o,m} 的原语义；
- 保持 R4 阻塞边界；
- 不把日常记忆召回、reviewer 文本或 Skill projection loaded 当作能力认证证据。

### 验收

- [ ] ω_certify、achievable、query_achievable 使用合规真实证据并可回放。
- [ ] 不同 baseline 和证据来源可隔离统计。
- [ ] simulated/sidecar 不进入真实认证成功率。
- [ ] 原 10 工具、生成、认证和 R4 边界不回归。

---

## 六、Step P6-3：RL-ready 导出

### 任务

从统一事件链导出：

```text
(
  state_ref,
  planner_decision,
  reward_components,
  scalar_reward?,
  next_state_ref,
  terminal,
  info
)
```

`info` 至少包含 planner/instructions/inference、option/model/pi、baseline、evidence_refs、real/simulated/sidecar、policy/mandate，以及 host/plan_run/ticket/assignment 等关联标识。

RL 导出是只读投影，不实现训练，不要求所有 Option 具有数值 T/R。未观测 state、reward、rationale 或 next_state 保持 null，不得从调用序列补写。

### 验收

- [ ] 生成和认证过程可回放完整决策与执行轨迹。
- [ ] RL-ready 导出不虚构状态、reward 或下一状态。
- [ ] real/simulated/sidecar 可过滤，来源与版本字段完整。

---

## 七、Step P6-4：SuperAgent 主动记忆治理与跨 harness 恢复

> 对应 `devNotes/MemoryBridge开发方案.md` B3–B4 的持续任务部分。OpenCode 日常闭环已在 Phase 4 验收，本步骤面向长期 Source/Ticket 的主动治理、认证与恢复。
> **v5.1 归属（MD-Memory 轨道拆分）**：7.1 主动发现→mandated 执行与审批流、7.3 handoff/lease/恢复 = **MM-L1（线1）**；7.1 的数据动作（重读来源/FactCandidate/superseding 候选/re-Recall 机制）、7.2 的 parser/extractor 版本与记忆维护数据链 = **MM-L2（线2）**。

### 7.1 主动重评估与候选整理

1. 父 Planner 可根据 timer、Option outcome、mapping_stale、冲突或来源修订提出记忆维护建议；主动发现与主动执行分离，执行必须命中 mandate/policy。
2. 支持的维护动作仅限：重读来源、生成 FactCandidate、建议合并、请求人工复核、重新 Recall、创建 superseding 候选和回滚到已批准版本。
3. 候选不得自评、自证或自动成为权威事实；自动 compaction、自动发布核心 Skill 和自动修改 AGENTS.md 默认关闭。
4. 长期 Ticket 可以等待人工 Attention，等待期间 Planner 调用次数为 0；人工 stop 后不得由 timer、host event 或 Recall 自动恢复。

### 7.2 持续证据与能力认证

- 记忆维护使用统一 option_event_observation/outcome，记录 parser/extractor 版本、真实成本、错误、real/simulated/sidecar 和 Ticket/Assignment。
- 评价记忆整理质量时使用独立 fixture 和真实人工/外部验证，不把抽取器自评分当作 achievable。
- ω_certify 可使用合规执行证据，但必须排除 simulated、未验证 sidecar 和 97 条待复核记录；Recall 命中或 projection loaded 不等于能力认证。
- Report/RL-ready 导出关联 memory_uri、recall_id、revision、candidate/approval、Ticket/Assignment 和真实执行事件，未知 rationale/reward 保持 null。

### 7.3 跨 harness 恢复与回滚

1. handoff 前保存 query_hash、memory/document/chunk、candidate/approval、lease、idempotency key 和当前 Revision。
2. 目标宿主重新校验 namespace、Ticket/Mandate、Option/Model 与 active_release，禁止同时存在两个有效 lease。
3. OpenCode 与 SuperAgent 交叉读取同一 document/fact/recall_event；后续 Input 按新 message 刷新，重复 deliver 只对账不重复执行。
4. 回滚发布指向旧包/旧结论的新 superseding 版本，不篡改历史；revoke 撤销能力，不替代 Ticket stop。
5. SuperAgent 原型不支持持续 Attention、Report 或恢复字段时显式 blocked，不用模拟回调冒充正式适配。

### 验收

- [ ] 长期 Ticket 能基于 stale/conflict/新证据提出维护候选，未经批准不改变权威记忆。
- [ ] 等待 Attention 期间 Planner 调用为 0，人工 stop 后无自动恢复或捕获。
- [ ] handoff/重启后 Recall 与修订链连续，跨宿主读取一致且无重复副作用。
- [ ] 维护质量证据进入 option/model 事件，认证不混用 simulated、sidecar 或抽取器自评。
- [ ] Report/RL-ready 包含真实 memory/recall/revision/approval 引用，未知字段不虚构，原 10 工具不变。

---

## 七A、Step P6-5：declarative→procedural 候选管线、下行沉降与退役分层（双线治理 B 项，2026-11-18 追加）

> v5.1 分工：**注册门、资产化、退役分层归线1**；**候选识别（MM-L2，线2 实现、线1 以 S1 消费方身份 review）与降维索引（MM-L2，线2 实现）**；S1/S2/S3/S5 为人际契约，schema 变更两线会签。

### 任务

1. **候选管线四步**：识别（线2 实现、线1 以 S1 消费方身份 review，从 data 层投影/候选中识别 procedural 候选，产出带待绑定 `package_hash` 的候选，不自动注册）→ 候选 → 人工批准 → 注册门（线1，实现包哈希校验 + mandate 绑定 + Option/Model 注册 probation）。哈希域在注册门切换：文本 `content_hash` 不再作为能力依据，实现包 `package_hash` 为准。
2. **四条分流红线**：candidate ≠ capability；指令性正文不进入非指令注入池；摄入层不得直接产出资产；ν门（问真伪）与注册门（问授权）不可合一。
3. **下行沉降三分离**（验收红线）：

   | 内容 | 唯一权威 | 禁止 |
   |---|---|---|
   | 校准（成功率/预测误差/成本） | Model 字段 | 成为独立 fact |
   | 执行流水 | option_event/outcome | 成为独立 fact |
   | 叙述残留 | declarative 摘要 fact | 复制执行数据 |

   合法 declarative 沉降仅两个窄场景：降维归档索引（evidence_ref 回链 dormant 资产，内容限存在性/教训/结论，线2 实现，三分离叙事侧测试两线会签）与跨域领域副产品（evidence_ref 指向 option_event，数据不同源）。
4. **退役分层**：planner 运行时降权（stop/ignore/replan）仅作用于本次 plan_run，不改变 Option/Model 资产状态；资产级退役走 revoke（治理工具，arbiter 参与）——资产链记录永久 dormant 保留、Model 校准随资产 dormant、可选 declarative 索引；物理删除不存在；revoked 不因历史记忆重新加载。
5. 与 `devNotes/MemoryBridge开发方案.md` §16 Skill 治理对接：skill 注册走同一候选管线，版本化 Option + active_release。

### 验收

- [ ] 候选管线四步贯通：未经人工批准的候选不能形成 Option；注册门校验 package_hash 与 mandate，文本哈希不被当作实现哈希。
- [ ] outcome/校准数据不出现在 facts；仅降维索引与跨域副产品两条窄出口允许 declarative 沉降且带 evidence_ref。
- [ ] planner stop/ignore 后资产状态不变；revoke 后资产 dormant 可查、不可删，且不因历史召回重新加载。
- [ ] 原 10 工具、生成/认证和 R4 边界不回归；跨线用例（候选 schema、召回 join）双侧绿。

---

## 八、后续可选边界

以下不属于本 16 周最小闭环：

- 真实向量/混合语义召回，须另行记录 model/version/dimension 和中文基线；
- compaction 自动捕获，默认仍须人工应用；
- 直接文件读取时的强制裁注；
- Skill 自动演进与发布；若启用，使用不可变实现包、版本化 Option、active_release 和 OpenCode 原生投影/执行；
- 持续 Planner 后台整理、全库语义去重和物理删除；
- MCP server 评估，复用同一 host-neutral 契约，不建设第三份业务适配。

---

## 九、测试与故障验收

必须使用独立 Markdown 根目录和独立 RocksDB：

- 重复捕获、重复 Recall、重复 message 和工具 continuation；
- 文件读取期间变化、mapping_stale、identity_uncertain 和索引损坏重建；
- 候选批准前后崩溃、副作用未知对账；
- MemoryCore 不可用、Recall 超时和 hook 失败；
- 跨项目召回、敏感路径、恶意记忆和未授权写入；
- OpenCode V1/V2 加载差异、standalone/后台服务、重启和卸载/重装；
- 生成、认证、RL 导出、R4 边界及 Phase 0–5 全量回归。

### 日常记忆主动治理回归

所有 P6 Step 必须执行 `docs/memory-regression-acceptance.md` 共享回归，并增加：

- P6-1：主动发现只产生维护候选，未经 mandate/Attention 不改变权威记忆，人工 stop 持续有效。
- P6-2：Recall 命中、projection loaded、抽取器自评均不等于 achievable；simulated/sidecar 不进入真实认证。
- P6-3：RL-ready 导出 memory_uri/recall_id/revision/approval 和真实执行事件，未知 state/reward/rationale 不补写。
- P6-4：长期 Ticket 的维护候选、Attention 批准、stop、跨 harness 恢复和回滚通过，历史不被篡改。
- P6-5：未批准候选不成 Option；outcome/校准不入 facts；dormant 可查不可删；运行时降权不改资产状态。
- Skill 扩展：projection_loaded 不等于执行成功，probation 不自动发现，revoked 不因历史记忆重新加载，version 与 active_release 一致。

## 十、Phase 6 Repo 验收清单

### A. 生成与认证

- [ ] generate_vec_candidate、质量标记和生成校验通过。
- [ ] ω_certify、achievable、query_achievable 和真实证据隔离通过。
- [ ] 双 host v0.4.0 恰好 10 工具，升级和数据保留通过。

### B. 主动规划与 RL-ready

- [ ] 主动发现与主动执行分离，授权、stop 和重规划通过。
- [ ] 真实/模拟/sidecar 轨迹分离，RL-ready 不虚构未知字段。

### C. SuperAgent 主动记忆治理

- [ ] 长期 Ticket 的维护候选、Attention 批准、人工 stop 和主动重规划通过。
- [ ] 跨 harness Recall/修订/批准链恢复一致，回滚不篡改历史。
- [ ] 维护质量、认证与 RL-ready 证据可回查，原工具数量、R4 和 RocksDB 数据保留不回归。

### D. 共享记忆回归与质量指标

- [ ] 重复注入、重复写入、跨项目泄漏和自动 AGENTS 修改次数为 0。
- [ ] 来源正确率、修订误用、Top-K、token、延迟、索引体量和真实成本有独立记录。
- [ ] 真实 Ticket/Attention/handoff/恢复证据与未实现项独立归档。

### E. 双线治理（P6-5，2026-11-18 追加）

- [ ] 候选管线、沉降三分离与退役分层全部通过；候选 schema/召回 join 契约有会签归档。
- [ ] 识别（线2）→注册门（线1）、活读 join（S2 联调）、降维索引（线2）集成用例验收通过；MD-Memory 轨道 MM-L1/MM-L2 验收与 review 记录在案（v5.1）。

### 验收签署

| 角色 | 签署项 | 日期 | 签字 |
|---|---|---|---|
| 执行人 | A–E 全部核对通过 | | 待签 |
| 子课题1 负责人 | 双 host、生成、认证与数据保留 | | 待签 |
| 子课题2 负责人 | 主动规划、Recall、事件链和 RL-ready | | 待签 |
| 子课题3 负责人 | 日常记忆、证据质量、安全与 R4 边界 | | 待签 |

A–D 全部通过后方可关闭 Phase 6。SuperAgent 主动记忆治理不替代生成/认证验收，生成/认证也不能替代长期 Ticket 的批准、stop、handoff 和恢复验收；OpenCode 日常闭环仅引用 Phase 4 既有证据。
