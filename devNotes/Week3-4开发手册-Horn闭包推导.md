---
创建时间: 2026-09-24
类型: 开发手册
所属项目: "26-04 AI4Science"
对应路线图: "S01最小产品路线图（OptionMemory 版）Phase 1 · Week 3–4"
tags:
  - 开发手册
  - vibe-coding
  - OptionMemory
  - mnestic
  - Horn闭包
  - AI4材料
---

# Week 3–4 开发手册：Horn 闭包推导（Phase 1 · Week 3–4）

> 对应[[04-创造层/项目/26-04 AI4Science/项目开发文档/S01最小产品路线图|S01 最小产品路线图]] Phase 1（Week 3–4）。
>
> **双周目标**：前向链闭包 `deriveClosure()` 跑通；R1/R2 双层资产入库；S01 派生事实（`candidate_solid_solution`、`phase_structure(S01, BCC+FCC)`）带血缘落库；首个 infer option 注册并完成 subtask:option:model 1:1:1 绑定；HEA-Lens-1540 全量推导 `smix` 并与 `ref_smix_v2` 做内部一致性检查。R4 暂缓，完整 R1–R4 闭包验收待其解除阻塞。
>
> **🆕 R3/R4 数据质量修订（2026-10-31）**：原 `ref_smix` 全量对拍仅 604/701 行通过，R4 的 30 个候选组合全部未达标。已批准并执行 `scripts/repair_ref_smix_v2.ts`：新增 701 条 `ref_smix_v2` 与 701 条 `reference_quality`，其中 604 条 `original_match`、97 条 `corrected_pending_source_review`；原始 `ref_smix` / `ref_delta` 不变，重跑幂等。v2 与 R3 同源，只能证明内部一致性，不能作为外部正确性的唯一证据。R4 未选定半径表，禁止批量派生 `delta` 或输出其筛选计数作为验收结果。详见 `docs/phase1-reference-correction-plan.md`。
>
> **🆕 v3 对齐（2026-10-06）**：本双周 option 注册遵循「禁止层级 option」原则——`infer_phase_structure_from_xrd` 为 **atomic option**（π 直接封装 R2 推导逻辑，不调用全局 option 图谱）。后续 Phase 3–6 的 measure / parse / generate option 同理；plan template 与和弦升格属完整产品 scope（见 [[04-创造层/项目/26-04 AI4Science/项目开发文档/S01最小产品路线图|S01 路线图 §9]]）。
>
> **交付节奏修订（2026-10-31）**：DSH + OpenCode 首版封装提前至 Phase 3（模块 v0.1.0）。本阶段注册与闭包接口必须保持稳定、可由两种 host 的 `propose_option` 及内部 option 执行链复用；框架依赖只允许进入 `src/plugins/dsh/`、`src/plugins/opencode/`，不得进入核心层。
>
> **🆕 工程治理原则（2026-10-06）**：OptionMemory 理论与长期规划的修订必须先于工程落地至少 2 周。本手册已进入实施阶段（Week 3–4），因此 v3 schema 变更（`option_type`、`template_id`、`plan_templates` 表）为**冻结变更**——后续理论层修订不得影响本双周已确定的 schema 与接口，只能以新增字段/表的形式向后兼容扩展。
>
> **前置门槛**：Phase 0 除 RocksDB 延后项外全部验收通过（facts 3506 行：S01×4 + HEAL×3502，计数/抽查/幂等已验）。
>
> **工作方式**：vibe coding——指令块中路径、schema、公式、命名均为确定值，不得由 AI 自由发挥；标注「探针」的项允许 AI 先探针对齐。**本手册所有写入仍只允许经服务层（ν 门 / MnesticClient 集中组装 CozoScript），D2 红线全程有效。**

---

## 〇、开工前检查（人工，约 30 分钟）

| # | 检查项 | 标准 |
|---|---|---|
| 1 | Phase 0 验收状态 | 计数 702、分谓词核对、成分抽查、幂等重跑均已通过；RocksDB 延后项已知（不影响本双周） |
| 2 | 定稿 A：R1–R4 Horn 文本与 option schema（(I, π, β)） | **已按常见取值落稿（2026-09-24）**，见 §2.1 / §4.1；后续修订须回写本手册 |
| 3 | 定稿 B：S01 第二 XRD 峰 | **已按常见值落稿**：`xrd_peak(S01, 44.7°, BCC(110))`（Cu Kα 下 Fe 基 BCC(110) 常见位，a≈2.866 Å 估算）；**占位值**——写入时 `eps_source` 标 `placeholder-pending-measurement`，待课题1 实测值到达后按 Phase 2 更正流程替换 |
| 4 | 定稿 C：派生谓词命名 | **已落稿**：`candidate_solid_solution` / `phase_structure` / `smix` / `delta`（与参考值 `ref_smix`/`ref_delta` 区分） |
| 5 | 定稿 D：对拍容差 | **已落稿**：smix 绝对误差 ≤ 1e-3；delta 相对误差 ≤ 5%（半径表标定后可收紧并回写） |
| 6 | 服务层扩展排期 | Step 2 需新增 client/api 写入方法（rules/justifications/options/subtasks/models 五表），确认排期 |
| 7 | pnpm build / test 基线 | 9 用例全绿后开工 |
| 8 | **v3 schema 同步（2026-10-06）** | **options 表新增 `option_type`、`template_id` 字段；新增 `plan_templates` 空表；`procedural_knowledge` 表支持 template 级 achievable 预留。schema 变更以 `schema/08_plan_templates.cozo` 与 `schema/05_options.cozo` v3 版为准，见 §0.1** |

### 0.1 v3 schema 变更摘要（2026-10-06 同步）

为对齐 DSH 插件分解方案 v3（禁止层级 option / plan template / atomic option），本双周 schema 做如下增量变更（不影响 Phase 0 已写入数据）：

| 变更 | 表 | 内容 | 兼容性 |
|---|---|---|---|
| 新增字段 | `options` | `option_type: 'atomic' \| 'agent' \| 'template_compiled'`，默认 `atomic` | 向后兼容，旧数据默认 `atomic` |
| 新增字段 | `options` | `template_id: string?`，plan template 实例化来源预留 | 向后兼容，空值 |
| 新增表 | `plan_templates` | `template_id, name, input_schema, output_schema, body_dag, applicable_conditions, model_ref, status, lin_*` | 新增空表，MVP 不启用 |
| 预留支持 | `procedural_knowledge` | `o_id` 可指向 `plan_templates`（template 级 achievable 预留） | 向后兼容 |

**schema 文件**：
- `schema/05_options.cozo` v3：新增 `option_type`、`template_id`；
- `schema/08_plan_templates.cozo` v3：新增（本双周建表但留空）；
- `schema/07_procedural_knowledge.cozo` v3：注释预留 template 支持。

**本双周任务**：Step 2 服务层扩展时同步实现 `putPlanTemplate` 方法（空实现即可，不注册工具）；Step 3 option 注册时写入 `option_type="atomic"`。

---

## 一、任务总览

| Step | 天 | 任务 | 交付物 | 验收方式 |
|---|---|---|---|---|
| 1 | Day 1–2 | 公式对拍 + 规则资产定稿 | 《phase1-rules-spec.md》+《phase1-reference-correction-plan.md》；R3 v2 已执行，R4 阻塞证据归档 | 对拍数值人工核对 |
| 2 | Day 3–5 | 服务层扩展 + `deriveClosure()` | client/api 扩展 + 闭包实现 + 单测 | `pnpm test` |
| 3 | Day 6–7 | S01 派生 + 1:1:1 绑定 | `scripts/seed_phase1_assets.ts` + 派生事实/J 边落库 | 三查询验收（§4.3） |
| 4 | Day 8–9 | HEA 批量推导 + 对拍 | 701 条 `smix` + v2 内部一致性/原值分组报告；`delta` 暂缓 | R1–R3 部分验收 |
| 5 | Day 10 | 基线 + Phase 1 验收 | 《phase1-baseline.md》+ 部分验收清单；完整验收待 R4 恢复 | 人工核对 |

---

## 二、Step 1：公式对拍与规则资产定稿（Day 1–2）

### 2.1 定稿（2026-09-24 按常见取值落稿；后续修订须回写本节）

**描述符公式（R3/R4 的计算语义）**：

- **R3 · smix（已实证，锁定）**：`smix = -R · Σ xi · ln(xi)`，R = 8.314 J/(mol·K)，xi = at.%/100。
  实证（2026-09-24）：HEAL0001 成分 `Al6.99Cr23.28Fe34.86Mn23.28Ni11.59` 手算 12.319371 vs `ref_smix` 12.319697，相对偏差 2.6e-5（R 有效位数所致；定稿 D 容差 ≤1e-3 已覆盖）。
- **R4 · delta（公式形态按常见取值落稿；半径表须对拍标定）**：Takeuchi–Inoue `δ = sqrt(Σ xi·(1 − ri/r̄)²)`，r̄ = Σ xi·ri（HEA 文献最常用形态，2026-09-24 落稿）。
  实证（2026-09-24）：三组常见半径表对 HEAL0001 计算得 0.0342 / 0.0503 / 0.0414，而 `ref_delta` = 0.019037 —— **均偏离 2–3 倍，半径表（或 δ 定义）必须对拍确定，禁止凭经验选定**。
  → 指令 1-A 以全部 701 行为样本反推口径；找不到吻合口径 → 停止上报（转 Phase 1 风险清单），禁止静默放行。

**规则资产（R1/R2，Horn 形态 + option schema 形态，双层同录 rules 表）**：

| rule_id | horn_body（前提） | horn_head（结论） | 备注 |
|---|---|---|---|
| R1 | `composition(X, C)`（X 有成分） | `candidate_solid_solution(X)` | S01 等原子比 → 成立 |
| R2 | `xrd_peak(X, Θ1, "FCC(111)")` ∧ `xrd_peak(X, Θ2, "BCC(110)")` | `phase_structure(X, "BCC+FCC")` | 依赖检查项 #3 的第二峰 |
| R3 | `composition(X, C)` | `smix(X, V)`，V = 公式计算 | 计算型规则 |
| R4 | `composition(X, C)` | `delta(X, V)`，V = 公式计算 | 计算型规则；口径见上 |

- rules 行字段按 `schema/02_rules.cozo`：`opt_i`/`opt_pi`/`opt_beta` 为 Json（由 horn 派生的 option schema 模板，(I, π, β) 内容按 §4.1 option 行落稿）；`layer="knowledge+option"`；`status="in"`；lin 系按事实表口径（`lin_source="phase1-rules"`、`lin_version="1.0"`、`lin_actor="seed_phase1_assets"`）。
- Horn body/head 在 MVP 为**应用层解释的文本片段**（非 mnestic 存储规则）；片段 DSL 的具体语法允许 AI 探针设计，但**前提/结论的谓词、参数位、语义不得偏离上表**。

### 2.2 Vibe 指令 1-A（公式对拍探针）

```text
任务：确定 R4（delta）计算口径，并复核 R3（smix）。

数据：facts 表中 composition/ref_smix/ref_delta（701 组，layer="knowledge"）。
方法（脚本 scripts/calibrate_delta.py 或 .ts，只读查询走 MnesticClient，禁止写库）：
1. 复核 R3：对全部 701 行计算 -8.314·Σxi·ln(xi) 与 ref_smix 比较，报告最大/平均绝对误差（预期 ≤1e-3 量级）。
2. 标定 R4：以 Takeuchi–Inoue δ 公式为基准，枚举至少 3 组公开半径表（含 Takeuchi & Senkov 2005），
   逐表计算 701 行 δ 并与 ref_delta 对拍（Pearson 相关 + 相对误差分布）。
3. 若有半径表达到「相关系数 ≥0.99 且中位相对误差 ≤5%」→ 定为 R4 口径，写入 spec；
   否则尝试 δ 变体（如 δ·100、加权半径），仍不吻合 → 停止并输出证据报告，禁止静默选用。

交付：docs/phase1-rules-spec.md（公式 + 半径表 + 误差表 + 容差建议）+ 对拍数值输出。
```

### 2.3 验收（人工，2026-10-31 执行结果）

- [x] R3 全量对拍完成，公式锁定；原始参考值通过率 86.16% 未达 99%，已按批准方案生成 v2，97 行保留来源复核标记；
- [x] R4 未获全量数据支持，已按规则停止并上报，未凭经验选定半径表；
- [x] 《phase1-rules-spec.md》与《phase1-reference-correction-plan.md》已归档，明确内部/外部一致性边界及 R4 暂缓范围。

---

## 三、Step 2：服务层扩展 + deriveClosure()（Day 3–5）

### 3.1 语义定稿（确定值）

**服务层扩展（保持架构约束：CozoScript 集中于 MnesticClient，业务层零拼接）**：

- `MnesticClient` 新增：`putRule(row)` / `putRules(rows)`、`putJustification(row)` / `putJustifications(rows)`、`putOption(row)`、`putSubtask(row)`、`putModel(row)`、`putPlanTemplate(row)`（各表列以 `schema/02..06_*.cozo` + `schema/08_plan_templates.cozo` 为准；批量方法同 facts 的 `$rows` 单事务形态；`putPlanTemplate` 本双周仅空实现，不注册对外工具）。
- `src/api/` 新增（均过各自必填校验；id 规范 `rule_id` 用 `R<n>`、justifications 用 `just_<uuid>`、option/subtask/model id 见 Step 3 定稿）：
  - `registerRule(rule)` / `registerOption(option)` / `registerSubtask(subtask)` / `registerModel(model)`；
  - `registerPlanTemplate` 本双周不注册对外工具，仅保留内部接口；
  - justifications 不对外暴露接口，由 `deriveClosure()` 内部写入。
- 幂等：rules/options/subtasks/models/plan_templates 按各自主键 upsert（`:put` 天然幂等）；justifications 按 `(derived_id, rule_id, premise_ids)` 查重后插。

**`deriveClosure(scope?)` 语义**：

1. 输入：rules 表 `status="in"` 的规则 + facts 表 `status="in"` 的事实；scope 缺省全量，可按谓词/实体过滤。
2. 匹配：join 型规则（R1/R2）按 horn_body 的前提模式在 facts 上求匹配；计算型规则（R3/R4）对每个匹配行调用登记公式。
3. 输出：每个新结论 → 派生 fact（经 `memory_set` 过 ν 门；`jPremiseIds`=匹配前提 id、`jRuleId`=规则 id、`layer` 同前提层、`status="in"`）+ justifications 行（`active=true`、`derivation_ts` 当前）。
4. **幂等**：重复运行不产生重复派生 fact（batch 全参查重自然命中）与重复 J 边（按 §3.1 键查重）。
5. MVP 不做：递归/多层传播（单层前向物化）、聚合规则、失效级联（Phase 2）。

### 3.2 Vibe 指令 2-A（实现）

```text
任务：实现服务层扩展与 deriveClosure()，语义按本手册 §3.1（确定值）。

实现：
1. src/memory/mnesticClient.ts：新增五表 put 方法（列清单逐字取自 schema/02..06_*.cozo；批量走 $rows 单事务形态）。
2. src/api/：registerRule / registerOption / registerSubtask / registerModel（必填校验失败返回 blocked+reason，不落库；风格与 memory_set 一致）。
3. src/runtime/deriveClosure.ts：闭包实现（规则载入 → 匹配 → 结论写出 → J 边写入；全程只经服务层接口）。
4. tests/：新增用例——① 寄存 R1 后对单条 composition 闭包推出 candidate_solid_solution 且 J 边落库；
   ② 重复闭包派生 fact/J 边均不重复；③ 计算型规则（smix 公式）对已知成分计算值与期望一致；
   ④ registerRule 缺必填字段被 blocked。
5. 探针先行（对运行实例）：`to_float` 是否可用（当前用于 smix/v2 比较；delta>0.06 查询待 R4 恢复）；多 *facts atom 自连接形态。
   结果写入 docs/mnestic-api-cheatsheet.md 补遗（每条附证据）。

约束：D2 红线（禁止任何绕过服务层的写库）；新查询如需解构 args 用 first()/get()（列表模式嵌变量已被 0.17.0 拒绝）。
交付：代码 + pnpm test 全绿 + cheatsheet 补遗段。
```

### 3.3 验收（人工）

- [ ] `pnpm test` 全绿（含新 4 用例）；
- [ ] 手工核查：client 内无业务层拼接 CozoScript 的新路径；justifications 行 `active=true`。

---

## 四、Step 3：S01 派生与 1:1:1 绑定（Day 6–7）

### 4.1 数据定稿

- **R1/R2 入库**：`scripts/seed_phase1_assets.ts` 经 `registerRule` 写入（字段按 §2.1 表 + 确认后的 (I, π, β)）。
- **S01 派生**：对 S01 运行 `deriveClosure()`：
  - R1 → `candidate_solid_solution(S01)`（J 边 ← `composition(S01,...)` fact id）；
  - R2 → `phase_structure(S01, "BCC+FCC")`（J 边 ← 两条 xrd_peak fact id + R2；第二峰按定稿 B 占位值先行入库，经 `memory_set`，谱系 `lin_source=xrd_parser_v1.2` 且 `eps_source="placeholder-pending-measurement"`）。
- **option / subtask / model 三行（1:1:1 绑定，2026-09-24 落稿；v3 补充 `option_type`）**：
  - subtask：`subtask_id="infer_phase_S01"`，`goal="推断 S01 相结构"`，`context={}`，`status="active"`，`utility_queries=0`，lin 系同 rules 口径；
  - option：`option_id="infer_phase_structure_from_xrd"`，`claim="从 XRD 峰位推断相结构"`，`layer="option"`，`option_type="atomic"`（v3 新增字段，默认 atomic；禁止层级 option），`template_id=null`（v3 新增字段，plan template 预留），`i_preconditions={"requires":["xrd_peak(FCC(111))","xrd_peak(BCC(110))"]}`，`pi_type="api"`、`pi_ref="deriveClosure(R2)"`、`pi_fallback="none"`，`beta_success={"derived":"phase_structure(X, BCC+FCC)","with_justification":true}`，`beta_output_schema={"predicate":"phase_structure","args":["X","phases"]}`，`rule_ref="R2"`，`j_premise_ids=[]`，ε 系同导入口径（`in-degree` / 0.5 / `inferred-prior`）、`verify="settlement+rollout_success"`、`status="probation"`（ω_certify 首演后转 settled）、`subtask_binding="infer_phase_S01"`、`model_binding="model_infer_phase_xrd_v1"`；
  - model：`model_id="model_infer_phase_xrd_v1"`、`option_id="infer_phase_structure_from_xrd"`、`claim="achievable(S01, infer_phase_structure_from_xrd, ε0)"`、`layer="model"`、`achievable_probability=0.0`、`calibration_history=[]`、`prediction_error=0.0`、`cost_model={}`、`theta_version=""`、`estimated_initiation_region=""`、ε 系同 options、`status="probation"`、`j_records=[]`、lin/verify 按 options 口径。

### 4.2 Vibe 指令 3-A

```text
任务：编写 scripts/seed_phase1_assets.ts，完成 §4.1 全部写入（经服务层接口，禁止直写）。

要求：
1. R1/R2 → registerRule；option/subtask/model 三行 → register*（字段逐字按 §4.1 定稿）。
2. 先经 memory_set 补写 xrd_peak(S01, 44.7°, BCC(110))（定稿 B 占位值；lin_source=xrd_parser_v1.2、
   eps_source="placeholder-pending-measurement"），再运行 deriveClosure({scope: "S01"})。
3. 打印：每步写入结果 + 派生 fact / J 边清单；重复执行幂等（寄存 upsert、派生不重复）。
交付：脚本 + 运行输出。
```

### 4.3 验收（人工，对应路线图 Phase 1 验收标准）

```cozoscript
?[args] := *facts{predicate: "phase_structure", args}
-- 期望：["S01","BCC+FCC"]

?[premise_ids, rule_id] := *facts{predicate, args}, predicate == "phase_structure",
  derived = first(args), *justifications{derived_id, premise_ids, rule_id, active},
  derived_id == derived, active == true
-- 期望：两条 xrd_peak fact id + R2（血缘查询的 MVP 形态；探针确认实际语法）

?[subtask_binding, model_binding, status] := *options{option_id: "infer_phase_structure_from_xrd", subtask_binding, model_binding, status}
-- 期望：infer_phase_S01 / model_infer_phase_xrd_v1 / probation（或 settle 后 settled）
```

- [ ] 三查询全部返回期望结果；
- [ ] `justifications` 中 S01 派生行的 `premise_ids` 与库中 fact id 逐一对上。

---

## 五、Step 4：HEA 批量推导与对拍（Day 8–9）

### 5.1 定稿（2026-10-31 修订）

- 范围：全部 701 个 `composition` fact（layer="knowledge"，status="in"）。
- 产出：`smix(HEAL####, <值>)` 派生 facts + J 边（前提 = composition fact id，rule = R3）。R4 暂缓，不产出 `delta`。
- 数值格式：smix 使用全精度字符串，与 `ref_smix_v2` 一致。
- **内部一致性检查**：逐 alloy 比较派生值与 `ref_smix_v2`，目标 701/701 一致；该结果只验证同一公式的实现一致性。
- **原始参考值交叉检查**：保留 604 条 `original_match` 与 97 条 `corrected_pending_source_review` 分组，97 行不得作为独立认证证据。

### 5.2 Vibe 指令 4-A（批量推导）

```text
任务：scripts/derive_descriptors.ts —— 对全部 HEAL 行运行 R3 并落库；R4 暂缓。

要求：
1. 只读查询取全部 composition facts（first()/get() 解构 args），逐行调用登记公式。
2. 派生 facts 经 memory_set_batch（分批 100，ν 门），J 边随 deriveClosure 语义写入；打印进度与 blocked 明细（应为 0）。
3. 幂等：重复执行 inserted=0。
4. 不注册可用 R4，不写入 delta；恢复时必须已有全量标定证据和明确批准。
交付：脚本 + 运行日志。
```

### 5.3 Vibe 指令 4-B（对拍报告）

```text
任务：scripts/check_descriptors.ts —— 生成 smix 内部一致性与原始参考值分组报告。

查询形态（自连接；列表模式嵌变量已被拒，用 get() 解构）：
  ?[alloy, sv, rv] := *facts{predicate, args}, predicate == "smix", alloy = first(args), sv = get(args, 1),
                      *facts{predicate: p2, args: a2}, p2 == "ref_smix_v2", first(a2) == alloy, rv = get(a2, 1)
  （探针确认 to_float 可用性；数值比较不可用则取回应用层比较并注明）
报告：smix vs ref_smix_v2 的最大/平均误差与一致率；另按 reference_quality 报 604/97 分组。
R4 暂缓期间不生成 delta 对拍或 delta > 0.06 验收计数，只在风险节记录阻塞。
交付：对拍输出 + docs/phase1-baseline.md 的对拍节。
```

### 5.4 R1–R3 部分验收（人工）

- [ ] 701 行 smix 全部落库且无 blocked，J 边完整；
- [ ] smix 与 ref_smix_v2 内部一致率 100%，且未将其表述为独立外部验证；
- [ ] 604 条原始吻合与 97 条待来源复核分组统计正确；
- [ ] R4 阻塞有记录，无 delta 派生或筛选计数被冒充为已验收结果。

---

## 六、Step 5：基线与 Phase 1 部分验收（Day 10）

### 6.1 Vibe 指令 5-A

```text
任务：docs/phase1-baseline.md。
测量（每项 3 次取中位数）：① 701 行 R1–R3 部分闭包耗时；② 单次 deriveClosure(S01 范围) 耗时；
③ 血缘查询（§4.3 第二条）延迟；④ smix/v2 对拍自连接查询延迟。
附：facts/justifications 行数、rules/options/subtasks/models 行数快照，以及 604/97 质量分组。
完整 R1–R4 闭包 < 5 分钟的指标保留，待 R4 恢复后补测，不用部分闭包结果冒充。
```

### 6.2 Phase 1 部分验收清单（R4 暂缓期间）

| # | 项 | 标准 |
|---|---|---|
| 1 | R1–R3 入库 | `::columns rules` 结构一致 + 3 行在库 status="in"；R4 保持未注册/阻塞 |
| 2 | S01 派生 | §4.3 三查询全过 |
| 3 | J 活性边 | 每条派生 fact 有 active=true 的 J 边且 premise_ids 对得上 |
| 4 | HEA 对拍 | §5.4 的 R1–R3 部分验收全过，604/97 分组正确 |
| 5 | 幂等 | 派生、seed 与 R3 v2 修复脚本重跑 inserted=0 |
| 6 | 性能 | 记录 R1–R3 部分闭包基线，不宣称完整 R1–R4 指标已通过 |

**完整 Phase 1 关闭条件不变**：R4 经全量对拍确定并获批准，701 行 `delta` 落库、对拍及 `delta > 0.06` 计数完成，随后补齐完整性能基线与签署。

---

## 七、常见坑与回退

| 坑 | 处理 |
|---|---|
| δ 口径对拍不吻合 | 按 §2.2 停止上报，禁止静默选用半径表；转风险清单 |
| 第二 XRD 峰为占位值（定稿 B） | 课题1 实测值到达后按 Phase 2 更正流程替换（旧标 out、新写入、派生重推）；替换前 R2 派生结论的血缘含 `placeholder-pending-measurement` 标记，可按该标记批量定位 |
| 派生 fact 与 ref 值命名混淆 | 谓词表（composition/ref_smix/ref_delta/smix/delta）写进 README 速查段 |
| 闭包重跑产生重复 J 边 | 检查 (derived_id, rule_id, premise_ids) 查重逻辑；不得用删表回退 |
| Horn 片段 DSL 过度设计 | MVP 只支持 §3.1 两类规则；递归/聚合留 Phase 2+ |
| 查询语法凭印象 | 先查 cheatsheet；新语法先探针并回写 cheatsheet 补遗（D4） |

---

## 相关文档

- [[Week1-2开发手册-五层底座搭建]]（含 Week 2；schema 与接口基线）
- [[S01最小产品路线图]]（Phase 1 任务与验收标准原文）
- `docs/decisions/0002-fact-status-vocabulary-manual-alignment.md`（status 词表）
- `docs/hea-lens-survey.md`（HEA 数据口径与导入记录）

---

## Phase 1 Repo 验收清单（Week 3–4 出口）

### A. 新增交付物存在性

`src/runtime/deriveClosure.ts`、`src/api/`（register* 扩展）、`scripts/seed_phase1_assets.ts`、`scripts/derive_descriptors.ts`、`scripts/check_descriptors.ts`、`scripts/calibrate_delta.ts`、`scripts/repair_ref_smix_v2.ts`、`docs/phase1-rules-spec.md`、`docs/phase1-reference-correction-plan.md`、`docs/phase1-baseline.md`、cheatsheet 补遗段、`schema/05_options.cozo` v3（含 `option_type`/`template_id`）、`schema/08_plan_templates.cozo`（空表）。逐路径核对。

### B. 功能验收（R4 暂缓期间为部分验收）

| # | 项 | 验证方法 |
|---|---|---|
| B1 | 闭包推导 | S01 三查询（§4.3） |
| B2 | 批量推导 | 701 行 smix 落库计数；无 delta 派生 |
| B3 | 对拍 | smix/v2 内部一致率 100%；604/97 分组正确，未宣称 v2 为独立外部验证 |
| B4 | 幂等 | 派生、seed 与 R3 v2 修复脚本重跑 inserted=0 |
| B5 | pnpm test | 全绿（≥13 用例） |
| B6 | 1:1:1 绑定 | option 行 subtask_binding/model_binding 正确 |

### C. 数据验收

| # | 项 | 标准 |
|---|---|---|
| C1 | rules 3 行 | R1–R3 字段与 §2.1 表一致，status="in"；R4 未注册 |
| C2 | S01 派生 facts | candidate_solid_solution(S01)、phase_structure(S01, BCC+FCC) |
| C3 | J 边 | 每条派生 fact ≥1 条 active J 边，premise_ids 逐一对得上 |
| C4 | R3 v2 与质量记录 | `ref_smix_v2` 701、reference_quality 701；604/97 分组正确，原值未改 |
| C5 | options v3 字段 | `infer_phase_structure_from_xrd` 行含 `option_type="atomic"`、`template_id=null` |
| C6 | plan_templates 表 | 表存在且为空（v3 预留，MVP 不启用） |
| C7 | R4 暂缓 | 无 delta 派生、无伪造的 delta>0.06 验收计数；原始标定证据与阻塞记录齐全 |

### D. 质量红线（一票否决，新增于 Phase 0 红线之后）

| # | 红线 |
|---|---|
| D7 | δ 口径未经全量对拍即选定（或静默放行不吻合口径） |
| D8 | 派生 fact / J 边绕过服务层直写（违 D2 的 Phase 1 形态） |
| D9 | 对拍/验收项被静默跳过（含第二峰缺失未上报）；R4 暂缓必须有明确记录，部分验收不得冒充完整验收 |
| D10 | 将自行生成的 ref_smix_v2 当作独立外部正确性证据，或覆盖/删除原始参考值 |

### E. 验收签署

| 角色 | 签署项 | 日期 | 签署 |
|---|---|---|---|
| 执行人（vibe coding 操作者） | A–D 部分验收核对通过 | 2026-11-01 | 用户授权，Kimi Code 代记 |
| 子课题2 负责人 | D 红线复核 + Phase 1 部分验收批准 | 2026-11-01 | 用户授权，Kimi Code 代记 |
| 子课题2 负责人（R4 恢复后） | 完整 R1–R4 验收 + Phase 1 正式关闭 | 未进行 | 未签署 |

> 2026-11-01：用户明确要求完成 R1–R3 部分人工验收，由 Kimi Code 代记。
