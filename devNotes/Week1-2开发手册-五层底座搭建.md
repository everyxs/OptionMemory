---
创建时间: 2026-09-11
类型: 开发手册
所属项目: "26-04 AI4Science"
对应路线图: "S01最小产品路线图（OptionMemory 版）Phase 0 · Week 1–2"
tags:
  - 开发手册
  - vibe-coding
  - OptionMemory
  - mnestic
  - AI4材料
---

# Week 1 开发手册：五层底座搭建（Phase 0 · Week 1）

> 对应[[04-创造层/项目/26-04 AI4Science/项目开发文档/S01最小产品路线图|S01 最小产品路线图]] Phase 0（Week 1–2）的前半周。
>
> **本周目标**：mnestic 跑通 + 五层 schema 落地 + `memory_set/get/query` 三接口可用 + S01 基本事实可查询。
>
> **工作方式**：vibe coding——每个 Step 给出可直接粘贴给 AI 编码助手（OpenCode / Cursor / Copilot Chat）的指令块，人工负责环境准备、指令投放与验收核对。**指令块中的路径、schema 均为确定值，不得由 AI 自由发挥；mnestic 具体 API 允许 AI 探针后对齐。**

---

## 〇、开工前检查（人工，约 30 分钟）

| #   | 检查项                                    | 标准                                                                                                      |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Node.js ≥ **22.19**（DSH 平台要求）与 pnpm 可用 | `node -v`（低于 22.19 先升级，勿侥幸）                                                                             |
| 2   | Python ≥ 3.10（Week 2 数据处理用，本周仅需确认）     | `python --version`                                                                                      |
| 3   | mnestic fork 已克隆到工作区                   | 仓库：`shuruheel/mnestic`（0.17.0+，fork 含 provenance semirings / `:reconcile` / 双时态，见 26-03 工程计划 v1.4 附录 F） |
| 4   | mnestic 可独立启动（Mem 模式先行，RocksDB 后置）     | 按仓库 README 跑通 hello world                                                                               |
| 5   | 项目骨架目录创建                               | `26-04 AI4Science/optionmemory-materials/`（结构按 dsh-plugin-memory-core 先例）                               |
| 6   | HEA-Lens-1540 数据集就位                    | `04-创造层/项目/26-04 AI4Science/datasets/`（Week 2 使用，本周确认即可）                                                |
| 7   | DSH 开发环境（可选本周，Phase 6 前必须）             | DSH v0.1.0-rc.8 pin 安装、`@deepseek-ai/cordis` vendored 版可用；R4 纪律：pin rc、升 rc 前全量集成测试                     |

**建议目录骨架**（与通用版 §10.1 对齐；**最终交付为 DSH（DeepSeek Harness）host 插件**，结构按 `dsh-plugin-memory-core` 先例，DSH 专用文件自 Phase 0 起预留）：

```text
dsh-plugin-optionmemory-materials/    # 仓库名即插件名（对照 dsh-plugin-memory-core）
├── package.json                      # 含 dsh.bundle manifest（patch → cordis.patch.yml）
├── tsconfig.json
├── dsh.plugin.json                   # v0.15 manifest 占位（Phase 6 填实）
├── cordis.patch.yml                  # profile 级配置占位（服务地址 + token）
├── src/
│   ├── memory/        # 五层 schema + mnestic HTTP 客户端（通用版 memory/ 映射；核心逻辑零框架依赖）
│   ├── runtime/       # ν 门 stub、option 执行器（后续周扩展）
│   ├── api/           # memory_set/get/query 服务层（与 DSH 工具签名兼容）
│   └── plugins/
│       └── dsh/
│           ├── index.ts        # 插件入口 apply()（Phase 6 实现；本周仅占位注释）
│           └── tools/          # DSH 工具实现（Phase 6；本周仅占位目录）
├── schema/            # CozoScript 建表脚本
├── scripts/           # S01 录入、批量导入（Week 2）
└── tests/
```

> **架构纪律（R4）**：所有 DSH/Cordis 框架交互只允许出现在 `src/plugins/dsh/` 适配层；`src/memory`、`src/runtime`、`src/api` 零框架依赖——DSH rc 升级时核心逻辑可整体不动。

---

## 一、Week 1 任务总览

| Step | 天 | 任务 | 交付物 | 验收方式 |
|---|---|---|---|---|
| 1 | Day 1 | mnestic 部署 + API 探针 | 《mnestic API 速查.md》+ hello world 通过 | 人工核对速查 + 运行通过 |
| 2 | Day 2–3 | 五层 schema 建表 | `schema/*.cozo` + 建表脚本运行成功 | 逐表 `\?\?:relations` 核查 |
| 3 | Day 4–5 | 三接口实现 + ν 门 stub | `src/api/` + 单测通过 | `pnpm test` |
| 4 | Day 5 | S01 手工录入 | `scripts/seed_s01.ts` + 验收查询返回 | 路线图 Phase 0 验收查询 |

---

## 二、Step 1：mnestic 部署与 API 探针（Day 1）

### 1.1 目标

mnestic 独立进程跑通 Mem 存储模式；产出一份**事实核查级**的 API 速查，后续所有 vibe 指令以此为准，禁止凭印象编码。

### 1.2 Vibe 指令 1-A（部署）

```text
任务：在本工作区部署并启动 mnestic 记忆引擎（仓库 shuruheel/mnestic，fork 版）。

要求：
1. 阅读仓库 README 与 package.json/Cargo.toml（先判断它是 Node 库、Rust 服务还是两者混合），给出最小启动路径。
2. 以 Mem（内存）存储模式启动一个可交互实例；如支持 CozoScript HTTP/WebSocket 端点，一并启动并记录端口。
3. 写 scripts/mnestic_start.sh（或 .ps1）一键启动脚本。
4. 不要修改 mnestic 源码；所有适配层放我们的工作目录 optionmemory-materials/。

交付：启动成功截图式日志 + 启动脚本 + 一段 100 字内的启动方式说明。
```

### 1.3 Vibe 指令 1-B（API 探针）

```text
任务：产出《mnestic API 速查.md》，作为后续开发的唯一 API 依据。

必须逐项核实（读源码/示例，禁止猜测）：
1. CozoScript 执行入口：HTTP 端点格式 / 库函数签名（给出真实示例）。
2. 建表语法：:create 的完整参数（列类型、索引、vector index 声明方式）。
3. 写入语法：:put / :insert / :rm 的差异与事务支持。
4. 查询语法：?[...] := 的规则体、聚合、filter。
5. HNSW 向量索引：声明方式、维度参数、相似度查询语法（hnsw(...) 或等价物）。
6. fork 特有能力核实：register_custom_aggr、min_cost_k、:reconcile、双时态列是否在当前版本可用（给出证据行号）。
7. 已知限制或坑（README/issues 中声明的）。

交付：docs/mnestic-api-cheatsheet.md，每条附「来源：文件路径:行号」。
```

### 1.4 验收（人工）

- [ ] 一键脚本能启动 mnestic；
- [ ] 速查中每条都有源码行号证据，无「应该是」「大概是」措辞；
- [ ] 用速查中的示例语法手工执行一次建表 + 写入 + 查询，跑通。

---

## 三、Step 2：五层 schema 建表（Day 2–3）

### 2.1 设计定稿（不得更改——建设方案 §4 的工程落地）

> 以下 schema 为确定设计。AI 只负责翻译为 mnestic 实际语法，**字段一个不许少，语义一个不许改**。公民权六元组 `⟨claim, layer, J, ε, ≺, verify⟩` 为四张资产表（facts / options / models / procedural_knowledge）强制；rules / subtasks / justifications 为双层形态与机制表，按各自字段定义。
>
> **2026-09-15 修订**：按 §2.3 验收条款与 D1 红线口径，补齐 options / models / procedural_knowledge 三表的六元组缺项（options 补 layer + j_premise_ids；models 补 claim + layer + ε 系；procedural_knowledge 补 layer）。只增不删，既有字段名与语义不变。

**表 1：`facts`（declarative knowledge）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string, pk | `fact_<uuid>` |
| predicate | string, index | 谓词名（如 `composition`） |
| args | [string] | 参数列表（如 `["S01", "Al0.2..."]`） |
| claim | string | 主张文本 |
| layer | string | 固定 `"knowledge"` |
| j_premise_ids | [string] | J：前提 fact id（基本事实为空） |
| j_rule_id | string? | J：推导所用 rule_id（基本事实为空） |
| eps_type | string | ε 类型：`in-degree` / `confidence` |
| eps_value | float | ε 值 |
| eps_source | string | `telemetry-learned` / `inferred-prior` |
| lin_source | string | ≺ 来源（literature / experiment_record / parser 版本号…） |
| lin_version | string | ≺ 版本 |
| lin_theta | string? | ≺ LLM 基质版本（无则空） |
| lin_actor | string | ≺ 写入者/权限 |
| verify | string | 验证协议指针（`horn+revisability`） |
| status | string, index | `in` / `out` / `archived` / `contested` |
| embedding | vector(1024)? | HNSW（本周可空） |
| created_at / updated_at | datetime | |

**表 2：`rules`（双层资产）**

| 字段 | 类型 | 说明 |
|---|---|---|
| rule_id | string, pk | `R1`… |
| horn_body | string | Horn 形态：前提合取（CozoScript 规则体片段） |
| horn_head | string | Horn 形态：结论 |
| opt_i / opt_pi / opt_beta | json | option schema 形态：`(I, π, β)` 模板（从 horn 派生，非同一对象） |
| layer | string | `"knowledge+option"` |
| lin_* | 同 facts | ≺ |
| status | string | `in` / `out` / `archived` |

**表 3：`justifications`（J 活性边）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string, pk | |
| derived_id | string, index | 派生 fact id |
| premise_ids | [string] | 前提 fact ids |
| rule_id | string | |
| active | bool | counting 语义：该辩护是否有效 |
| derivation_ts | datetime | |

**表 4：`subtasks`**

| 字段 | 类型 | 说明 |
|---|---|---|
| subtask_id | string, pk | |
| goal | string | 目标定义（非单调，不入闭包） |
| context | json | 上下文参数 |
| status | string | `active` / `dormant` / `pruned` |
| utility_queries | int | 效用统计（被查询次数） |
| lin_* | 同 facts | |

**表 5：`options`**

| 字段 | 类型 | 说明 |
|---|---|---|
| option_id | string, pk | |
| claim | string | 能力承诺 |
| layer | string | 固定 `"option"` |
| i_preconditions | json | initiation_set_schema |
| pi_type / pi_ref / pi_fallback | string | π：`api` / `device` / `llm` + 引用 + 回退 |
| beta_success / beta_output_schema | json | β |
| rule_ref | string? | 派生来源 rule（即 J 的 j_rule_id） |
| j_premise_ids | [string] | J：经 rule 推导时的前提 fact id（非派生 option 为空） |
| eps_type / eps_value / eps_source | 同 facts | ε |
| lin_source / lin_version / lin_theta | 同 facts | ≺（含 θ 版本） |
| verify | string | `settlement+rollout_success` |
| status | string, index | `settled` / `probation` / `revoked` / `archived` |
| subtask_binding / model_binding | string | 1:1:1 绑定 |

**表 6：`models`**

| 字段 | 类型 | 说明 |
|---|---|---|
| model_id | string, pk | |
| option_id | string, index | |
| claim | string | 可达性主张文本（如 `achievable(s, o, p)`） |
| layer | string | 固定 `"model"` |
| achievable_probability | float | |
| calibration_history | json | 校准历史数组 |
| prediction_error | float | |
| cost_model | json | token/步数/成本 |
| theta_version | string | |
| estimated_initiation_region | string | 经验可用域（漂移/出域判别用） |
| eps_type / eps_value / eps_source | 同 facts | ε（该校准结论的置信依据） |
| status | string | `settled` / `probation` / `retracted` / `archived` |
| j_records / lin_* / verify | 同前 | |

**表 7：`procedural_knowledge`**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string, pk | |
| claim | string | `achievable(s, o, ε₀)` 文本 |
| layer | string | 固定 `"procedural"` |
| s_id / o_id / m_id | string | J = {s, o, m} 三元组 |
| fidelity | string | `dft_verified` / `exp_verified`（MVP 预留，可空） |
| eps_value / eps_ceiling | float | ε 与上限 |
| lin_* / verify / status | 同前 | |

### 2.2 Vibe 指令 2-A（schema 实现）

```text
任务：将 docs/mnestic-api-cheatsheet.md 核实过的语法，把以下七张表翻译为 mnestic 建表脚本。

输入：本对话下方粘贴的七表字段定义（facts / rules / justifications / subtasks / options / models / procedural_knowledge）。

要求：
1. 输出 schema/01_facts.cozo … 07_procedural_knowledge.cozo，每表一个文件。
2. 所有字段必须实现；mnestic 不支持的类型（如 vector(1024)）按速查中的真实替代方案处理并在文件头注释说明。
3. 索引字段按定义创建索引。
4. 输出 schema/apply_all.sh（或 .ps1）：一键按序建表并打印每表结构供核对。
5. 禁止删改字段名与语义；翻译不了的字段停下来报告，禁止静默跳过。

交付：7 个建表文件 + 一键脚本 + 每表 \?\?:relations 输出。
```

### 2.3 验收（人工）

- [ ] 七表全部建成，逐表结构输出与 §2.1 字段定义一致；
- [ ] 六元组字段（claim/layer/J 系/ε 系/lin 系/verify）在 facts、options、models、procedural_knowledge 四表中齐全。

---

## 四、Step 3：三接口 + ν 门 stub（Day 4–5）

### 3.1 接口契约（确定值）

```typescript
// src/api/memory.ts
memory_set(fact: FactInput): Promise<{ id: string; gate: "pass" | "blocked"; reason?: string }>
memory_get(id: string): Promise<Fact | null>
memory_query(datalog: string): Promise<Fact[]>
```

- `memory_set` 写入前必须经过 **ν 门 stub**（本周只实现两重检验的简化版：① 字段完整性/AGM 合规检查；② requential 账占位——先固定返回 pass，留 `requentialCheck()` 空壳函数与 TODO 注释）。
- 所有写入自动补全：id（`fact_<uuid>`，§2.1 表 1）、created_at/updated_at；layer 属六元组必填、不自动补全（2026-09-24 修正：原文"自动补全 layer"与六元组必填自相矛盾）；缺六元组必填字段 → gate 拒绝。
- 状态机约束：只允许 `in/out/archived/contested` 四值（facts）。

### 3.2 Vibe 指令 3-A

```text
任务：在 optionmemory-materials/ 中实现 TypeScript 记忆服务层。

技术栈：Node 20+、TypeScript、pnpm；mnestic 接入方式以 docs/mnestic-api-cheatsheet.md 为准。

实现：
1. src/memory/mnesticClient.ts：连接与 CozoScript 执行封装（含错误处理与超时）。
2. src/runtime/nuGate.ts：ν 门 stub——checkCompleteness()（六元组必填校验，缺字段返回 blocked+原因）与 requentialCheck()（占位，固定 pass，标注 TODO: Phase 2 实现 requential 账）。
3. src/api/memory.ts：memory_set / memory_get / memory_query 三接口，契约按本对话给定签名；memory_set 必须过 ν 门，blocked 时不落库。
4. tests/memory.test.ts：覆盖 ① 完整 fact 写入成功 ② 缺 lin_source 写入被拒 ③ get 命中 ④ datalog 查询谓词过滤 ⑤ 非法 status 值被拒。

约束：不引入 mnestic 之外的数据库；所有 CozoScript 语句集中在 mnesticClient 内组装，业务层不拼接字符串。

交付：可运行代码 + pnpm test 全绿 + README 接口说明。
```

### 3.3 验收（人工）

- [ ] `pnpm test` 全绿；
- [ ] 手工用 curl/脚本调 `memory_set` 写入一条缺 `lin_source` 的 fact，确认被 ν 门拦截且不落库。

---

## 五、Step 4：S01 手工录入（Day 5）

### 4.1 Vibe 指令 4-A

```text
任务：编写 scripts/seed_s01.ts，通过 src/api/memory.ts 的 memory_set 录入 S01 基本事实（不经 mnestic 直写，必须过 ν 门）。

数据（逐字使用，不得修改）：
- composition(S01, Al0.2Co0.2Cr0.2Fe0.2Ni0.2)，lin_source=literature，eps_type=in-degree，eps_source=inferred-prior
- process(S01, arc_melting_1600C)，lin_source=experiment_record
- xrd_peak(S01, 44.5°, FCC(111))，lin_source=xrd_parser_v1.2，lin_version=v1.2
- hardness(S01, 512 HV)，lin_source=tensile_test

要求：每条写入后打印 gate 结果与 id；全部完成后执行验收查询并打印：
  ?[predicate, args] := *facts{predicate, args}, first(args) == "S01"
（实际语法以 cheatsheet 为准）

交付：脚本 + 运行输出。
```

> **2026-09-24 注记**：`scripts/seed_s01.ts` 已改为经 `memory_set_batch` 单批写入（幂等查重内置于 batch 接口，按 `(predicate, args)` 全参），与 Week 2 §3.2 写入路径单一化；逐条 gate 结果与 id 仍逐条打印，验收口径不变。

### 4.2 验收（人工，对应路线图 Phase 0 验收标准前半）

- [ ] 验收查询返回 S01 全部 4 条基本事实；
- [ ] 任选一条，六元组六要素均非空；
- [ ] 重复执行脚本不产生重复行（幂等：按 predicate+args 查重或 upsert）。

---

## 六、Week 1 验收清单（周五核对）

| # | 项 | 对应路线图 |
|---|---|---|
| 1 | mnestic 一键启动（Mem 模式） | Phase 0 任务 1 |
| 2 | 七表 schema 建成，六元组齐全 | Phase 0 任务 2、3 |
| 3 | `memory_set/get/query` 可用，ν 门 stub 拦截生效 | Phase 0 任务 4 |
| 4 | S01 四条基本事实可查询 | Phase 0 任务 5 |
| 5 | 《mnestic API 速查.md》归档（带行号证据） | 本周特有 |
| 6 | HNSW 索引声明就绪（空向量可写） | Phase 0 任务 6 前置 |

**Week 2 预告**：HEA-Lens-1540 批量导入（701+ 条 composition）、RocksDB 持久化切换、1540 行规模写入/查询性能验证——需本周 schema 与接口全部验收通过后启动。

---

## 七、常见坑与回退

| 坑 | 处理 |
|---|---|
| mnestic 实际语法与设想不符 | 以速查为准修改 schema 脚本；**不允许为迁就语法删字段**——字段缺口写入《速查》限制节并报告 |
| fork 特性（:reconcile 等）版本不符 | 本周不依赖 fork 特性，全部用基础语法实现；特性核实结果留待 Phase 2 启用 |
| 向量索引暂不可用 | embedding 字段保留但本周允许为空，记入 Week 2 任务 |
| AI 输出与指令契约偏离 | 回退到对应 Step 的指令块重投；禁止接受「差不多」的实现 |
| Mem 模式数据丢失 | 本周可接受；RocksDB 切换在 Week 2，切换前用 `scripts/seed_s01.ts` 重建 |

---

## 相关文档

- [[04-创造层/项目/26-04 AI4Science/项目开发文档/S01最小产品路线图|S01 最小产品路线图（OptionMemory 版）]]
- [[AI4材料记忆系统建设方案|AI4材料记忆系统建设方案]]（§2.6 应用层/引擎层分工、§4 数据模型）
- [[04-创造层/项目/26-03 神经-符号具身智能智能体/项目开发文档/OptionMemory-长期工程规划|OptionMemory-长期工程规划]]（§4 存储路线）

---
---

# Week 2 开发手册：批量导入与规模验证（Phase 0 · Week 2）

> **本周目标**：HEA-Lens-1540 批量导入（≥701 条 composition）+ RocksDB 持久化切换 + HNSW 索引冒烟 + 1540 行规模验证，**完成路线图 Phase 0 全部验收标准**。
>
> **前置门槛**：Week 1 验收清单 6 项全部通过，未通过项先回补。

---

## 〇、开工前检查（人工，约 20 分钟）

| #   | 检查项                       | 标准                                              |
| --- | ------------------------- | ----------------------------------------------- |
| 1   | Week 1 验收 6 项全过           | 对照 Week 1 §六                                    |
| 2   | HEA-Lens-1540 CSV 就位      | `04-创造层/项目/26-04 AI4Science/datasets/` 下确认实际文件名 |
| 3   | Python ≥ 3.10 + pandas    | `python -c "import pandas"`                     |
| 4   | mnestic RocksDB 模式启动方式已查明 | 从《mnestic API 速查.md》确认（Week 1 未含则补探针）           |

---

## 一、Week 2 任务总览

| Step | 天 | 任务 | 交付物 | 验收方式 |
|---|---|---|---|---|
| 1 | Day 1 | 数据勘察与导入映射定稿 | 《HEA-Lens-1540 数据勘察与映射.md》 | 人工核对 |
| 2 | Day 2–3 | RocksDB 切换（延后，见 §3.1 修订注记）+ 批量导入脚本 | `memory_set_batch` 接口 + ≥701 条写入 | 计数验收查询 |
| 3 | Day 4 | HNSW 索引配置与召回冒烟 | 向量写入 + hnsw 查询返回 | 冒烟通过 |
| 4 | Day 5 | 规模验证与 Phase 0 总验收 | 性能基线报告 + 验收清单全过 | 人工核对 |

---

## 二、Step 1：数据勘察与导入映射（Day 1）

### 2.1 导入映射定稿（确定值，不得更改）

**实体 id 规则**：`Alloy Name` 规范化为 `HEAL####`（四位序号，按 CSV 行序），名称原文存入 `alloy_name(alloy_id, "<原始名>")`。

**谓词映射**（每行产出 3 类 facts）：

| CSV 列 | 谓词 | args 示例 | lin_source | 备注 |
|---|---|---|---|---|
| 36 元素 at.% 合并 | `composition` | `(HEAL0001, "Fe49.7Cr18.8Ni10.2...")` | `HEA-Lens-1540` | 成分字符串格式与 S01 一致（元素符号+数值拼接，仅保留 at.% > 0 的元素）；**Phase 1 闭包推导的输入** |
| `Smix_ideal` | `ref_smix` | `(HEAL0001, "1.61")` | `HEA-Lens-1540` | **参考值**，供 Phase 1 规则推导值对拍 |
| `lattice_distortion_parameter_delta` | `ref_delta` | `(HEAL0001, "0.066")` | `HEA-Lens-1540` | 同上 |
| `References` | `source_ref` | `(HEAL0001, "doi:...")` | `HEA-Lens-1540` | 谱系延伸 |

- 成分缺失行（约 839 行）**跳过不导入**，计入勘察报告；
- 所有导入 facts：`layer="knowledge"`、`eps_type="in-degree"`、`eps_source="inferred-prior"`、`verify="reference"`、`status="in"`。

### 2.2 Vibe 指令 1-A（数据勘察）

```text
任务：勘察 HEA-Lens-1540 CSV 并产出《数据勘察与映射.md》。

数据位置：04-创造层/项目/26-04 AI4Science/datasets/（先列出目录确认实际文件名）。

必须回答（用 pandas 实际跑数，禁止目测）：
1. 总行数、列数、列名清单。
2. 36 个元素列的缺失模式：多少行成分完整可导入（预期约 701），多少行跳过。
3. 成分列的数值格式：at.% 是百分数还是小数？有无非数字单元格？
4. Smix_ideal / lattice_distortion_parameter_delta 的缺失率与取值范围。
5. Alloy Name 有无重复、有无需要转义的字符。
6. 按本手册 §2.1 映射规则，模拟转换前 5 行，输出对照样例。

交付：docs/hea-lens-survey.md（含跑数代码 scripts/survey_hea_lens.py 与前 5 行转换样例）。
```

### 2.3 验收（人工）

- [ ] 可导入行数 ≥ 701 得到跑数确认；
- [ ] 前 5 行转换样例与 §2.1 映射规则逐字段一致。

---

## 三、Step 2：RocksDB 切换 + 批量导入（Day 2–3）

### 3.1 Vibe 指令 2-A（RocksDB 切换）

```text
任务：本机安装 LLVM/libclang 后，将 mnestic 存储后端从 Mem 切换为 RocksDB 持久化。

要求：
1. 以 docs/mnestic-api-cheatsheet.md 为准查明 RocksDB 启动参数（数据目录建议 optionmemory-materials/.data/mnestic）。
2. 更新 scripts/mnestic_start 脚本：支持 --mem / --rocks 两种模式。
3. 切换后执行 scripts/seed_s01.ts 重建 S01 数据（Mem 数据不迁移）。
4. 验证：写入一条测试 fact → 重启进程 → 查询仍在。

约束：.data/ 加入 .gitignore；schema 不需要重建则复用，需要重建则重跑 schema/apply_all。

交付：更新后的启动脚本 + 重启持久性验证输出。
```

> **2026-09-24 延后（B5）**：本机缺 libclang —— `storage-rocksdb` feature 经 `mnestic-rocks → zstd-sys(bindgen)` 硬依赖本机 libclang（实证见《mnestic API 速查》§7.2），适配层当前仅编译默认特性（Mem）。RocksDB 切换整体延后，Day 2–3 仅完成批量导入（Mem 模式）。连带延后项：Week 2 §5.1 测量项 5、§5.2 总验收 #1、Repo 验收 B1/B7 与 `.data/` 目录项；Phase 0 关闭前须回补。恢复条件：本机安装 LLVM/libclang 后，适配层重开 `storage-rocksdb` feature 重新编译。

### 3.2 Vibe 指令 2-B（批量导入）

```text
任务：实现批量导入并写入 HEA-Lens-1540。

一、接口扩展（src/api/memory.ts 新增）：
  memory_set_batch(facts: FactInput[]): Promise<{ inserted: number; skipped: number; blocked: { index: number; reason: string }[]; ids: (string | null)[] }>
  - 单事务提交；每条仍逐个过 ν 门；blocked 条目收集原因并继续（不回滚整批），返回明细。
  - 幂等：按 (predicate, args) 全参查重，已存在则跳过并计入 skipped；ids 按输入序对齐（跳过为既有 id，blocked 为 null）。

> **2026-09-24 修订（探针实证后回写）**：① 计数查询笔误修正（`identity`→`id`；head 聚合列须在 atom 绑定，mnestic 0.17.0 实测）；② S01 验收查询改为实测可用形态（原 `args: ["S01", val]` 列表模式嵌变量被 0.17.0 拒绝）；③ 幂等键由 `(predicate, args[0])` 改为 `(predicate, args)` 全参——实体级键会误跳多值谓词（如 `xrd_peak(S01, FCC)` 与 `xrd_peak(S01, BCC)` 两峰），实体唯一性归 Phase 3 元规则 M1 治理，不在查重层静默执行；④ 返回签名补 `skipped` / `ids` 字段。

二、导入脚本（scripts/import_hea_lens.ts；2026-09-24 定为 .ts——Python 无法复用 TS 服务层，直写 HTTP 即绕过 ν 门，违 D2 红线）：
  - 读取 datasets/ 下 CSV，按《数据勘察与映射.md》定稿规则转换。
  - 分批调用 memory_set_batch（建议每批 100 条），打印进度与 blocked 明细。
  - 成分字符串构造规则：仅保留 at.% > 0 的元素，按元素符号字母序拼接「符号+数值」（数值保持原始精度），示例格式：Fe49.7Cr18.8Ni10.2。

三、验收输出：
  - 插入总数、跳过数、blocked 明细（应为 0 blocked，非 0 则报告原因）。
  - 执行计数查询 ?[count(id)] := *facts{id, predicate: "composition"}，应 ≥ 701（含 S01 则 ≥ 702）。

交付：接口代码 + 导入脚本 + 运行日志 + 计数查询输出。
```

### 3.3 验收（人工）

- [ ] 计数查询 ≥ 701；
- [ ] 随机抽 3 个 alloy_id，用 `memory_get` 核对成分字符串与 CSV 原行一致；
- [ ] 重复执行导入脚本，inserted=0、skipped=全量（幂等通过）。

---

## 四、Step 3：HNSW 索引配置与召回冒烟（Day 4）

### 4.1 Vibe 指令 3-A

```text
任务：为 facts.embedding 配置 HNSW 向量索引（1024 维）并完成召回冒烟。

要求：
1. 以 cheatsheet 为准确认 mnestic 的 HNSW 声明与查询语法；若已在 schema 中声明则验证其可用。
2. 本周无真实嵌入模型——用固定种子伪随机向量填充已导入 facts 的 embedding（脚本 scripts/backfill_embedding.ts，种子固定 42，保证可复现）。
3. 冒烟：取 S01 的向量做 hnsw 近邻查询（k=5），确认返回结果格式正确（本周不要求语义合理，只验证索引机制）。
4. 记录向量维度、距离度量（cosine/l2，以 mnestic 实际支持为准）写入 cheatsheet 补遗。

约束：若 mnestic 当前版本 HNSW 不可用，停止并报告证据，禁止静默跳过——该项转入 Phase 0 风险清单。

交付：backfill 脚本 + hnsw 查询输出 + cheatsheet 补遗段。
```

### 4.2 验收（人工）

- [ ] 全部 facts 均有 1024 维向量（伪随机可接受）；
- [ ] hnsw k=5 查询正常返回。

---

## 五、Step 4：规模验证与 Phase 0 总验收（Day 5）

### 5.1 Vibe 指令 4-A（性能基线）

```text
任务：产出 Phase 0 性能基线报告。

测量（在当前 701+ 条 facts 规模下，每项测 3 次取中位数）：
1. 单条 memory_set 写入延迟。
2. memory_set_batch 吞吐（100 条/批）。
3. 谓词过滤查询延迟（composition 全量扫描）。
4. hnsw k=5 查询延迟。
5. RocksDB 数据目录磁盘占用。（RocksDB 延后，见 Week 2 §3.1 修订注记）

输出：docs/phase0-baseline.md（含测量方法、环境、数值表）。
```

### 5.2 Phase 0 总验收清单（周五核对，对应路线图验收标准）

| # | 项 | 标准 |
|---|---|---|
| 1 | mnestic 一键启动（Mem + RocksDB 双模式；RocksDB 延后，见 Week 2 §3.1 修订注记） | 脚本可用 |
| 2 | 七表 schema + 六元组齐全 | Week 1 已验 |
| 3 | 三接口 + ν 门 stub | Week 1 已验 |
| 4 | S01 全事实查询 | `?[predicate, args] := *facts{predicate, args}, first(args) == "S01"` 返回 4 条 |
| 5 | HEA-Lens-1540 批量导入 | `?[count(id)] := *facts{id, predicate: "composition"}` ≥ 701 |
| 6 | 六元组抽查 | 任选一条 fact，六要素非空 |
| 7 | HNSW 冒烟 | k=5 查询返回正常 |
| 8 | 1540 行规模无性能明显衰减 | 基线报告数值合理（单条写入 < 100ms、批量吞吐 > 50 条/s 为参考线） |
| 9 | 幂等 | 重复导入 inserted=0 |

**Phase 1 预告（Week 3–4）**：前向链闭包 `deriveClosure()`、R1/R2 双层资产录入、**首个 infer option 注册与 subtask:option:model 1:1:1 绑定**、用规则批量推导 `smix`/`delta` 并与本周 `ref_smix`/`ref_delta` 参考值**对拍验证闭包正确性**。

---

## 六、Week 2 常见坑与回退

| 坑 | 处理 |
|---|---|
| 成分列格式与预期不符（小数/百分数/异常字符） | 以勘察跑数为准修订转换规则，**修订必须回写《数据勘察与映射.md》**，禁止脚本内暗改 |
| RocksDB 切换后 schema 丢失 | 重跑 `schema/apply_all` + `seed_s01`；将「切换后必重建」写入启动脚本注释 |
| 批量导入部分 blocked | 看 ν 门原因：字段缺失修映射，格式非法修脚本；blocked 明细必须清零才能验收 |
| 伪随机向量污染后续语义检索 | embedding 写入时 `eps_source` 标记 `placeholder-random-seed42`，Phase 4 真实嵌入接入时按该标记批量重算 |
| HNSW 不可用 | 停止该 Step 并记录证据，Phase 0 其余项继续；此项转入风险清单向子课题2 上报 |

---

## 相关文档（Week 2）

- [[04-创造层/项目/26-04 AI4Science/项目开发文档/S01最小产品路线图|S01 最小产品路线图]]（§二 测试数据集、§四 Phase 0 验收标准）
- [[Week1-2开发手册-五层底座搭建|Week 1 开发手册]]（本文件上半部分）
- HEA-Lens-1540 数据仓库：https://github.com/sgorsse/commercial-alloys-high-entropy-lens

---
---

# Phase 0 Repo 验收清单（Week 1–2 出口）

> Phase 0 收官时，对 `optionmemory-materials/` 仓库的**整体验收**。分四部分：目录结构、功能、数据、质量红线。任何一项不过 → Phase 0 不予关闭，Phase 1 不得启动。

---

## A. 目录结构验收

```text
dsh-plugin-optionmemory-materials/
├── package.json / tsconfig.json / pnpm-lock.yaml
├── .gitignore                        # 含 node_modules/、.data/
├── README.md                         # 启动指南 + 接口说明
├── dsh.plugin.json                   # v0.15 manifest 占位（Phase 6 填实）
├── cordis.patch.yml                  # profile 配置占位
├── docs/
│   ├── mnestic-api-cheatsheet.md     # W1：mnestic API 速查（每条附源码行号）
│   ├── hea-lens-survey.md            # W2：数据勘察与映射定稿
│   └── phase0-baseline.md            # W2：性能基线报告
├── schema/
│   ├── 01_facts.cozo
│   ├── 02_rules.cozo
│   ├── 03_justifications.cozo
│   ├── 04_subtasks.cozo
│   ├── 05_options.cozo
│   ├── 06_models.cozo
│   ├── 07_procedural_knowledge.cozo
│   └── apply_all.sh / .ps1
├── scripts/
│   ├── mnestic_start.sh / .ps1       # --mem / --rocks 双模式
│   ├── seed_s01.ts
│   ├── survey_hea_lens.py
│   ├── import_hea_lens.ts            # 2026-09-24 定为 .ts（Python 绕过 ν 门违 D2，见 §3.2 注记）
│   └── backfill_embedding.ts
├── src/
│   ├── memory/mnesticClient.ts       # mnestic HTTP 客户端（零框架依赖）
│   ├── runtime/nuGate.ts
│   ├── api/memory.ts                 # memory_set/get/query + memory_set_batch（DSH 工具签名兼容）
│   └── plugins/dsh/
│       ├── index.ts                  # 占位：apply() 入口（Phase 6 实现）
│       └── tools/                    # 占位目录（Phase 6 工具实现）
├── tests/
│   └── memory.test.ts                # 5 用例
└── .data/                            # RocksDB（gitignored；延后，见 Week 2 §3.1 修订注记）
```

**验收方法**：逐路径核对存在性；缺失即不过。

---

## B. 功能验收（W1 + W2 汇总）

| # | 项 | 验证方法 |
|---|---|---|
| B1 | mnestic 一键启动双模式 | `scripts/mnestic_start --mem` 成功；`--rocks` 延后（见 Week 2 §3.1 修订注记） |
| B2 | 七表 schema 建成 | `apply_all` 重跑幂等成功；逐表结构输出与手册 §2.1 一致 |
| B3 | 六元组字段齐全 | facts/options/models/procedural_knowledge 四表抽查字段定义 |
| B4 | memory_set 过 ν 门 | 缺 `lin_source` 写入被拒且不落库（手工复测） |
| B5 | 非法 status 值被拒 | 单测用例 ⑤ |
| B6 | memory_set_batch 幂等 | 重复导入 inserted=0、skipped=全量 |
| B7 | RocksDB 持久化 | 写入 → 重启进程 → 数据仍在（延后，见 Week 2 §3.1 修订注记） |
| B8 | HNSW 冒烟 | k=5 查询正常返回（或已按规则停步上报并记录证据） |
| B9 | pnpm test 全绿 | 5 用例全过 |

---

## C. 数据验收

| # | 项 | 验证查询/方法 | 标准 |
|---|---|---|---|
| C1 | S01 基本事实 | `?[predicate, args] := *facts{predicate, args}, first(args) == "S01"` | 返回 4 条 |
| C2 | HEA-Lens-1540 导入量 | `?[count(id)] := *facts{id, predicate: "composition"}` | ≥ 701（含 S01 ≥ 702） |
| C3 | 参考值就位 | `ref_smix` / `ref_delta` 计数 | 与勘察报告预期一致（供 Phase 1 对拍） |
| C4 | 成分抽查 | 随机 3 个 alloy_id，`memory_get` 对照 CSV 原行 | 成分字符串逐字一致 |
| C5 | 六元组抽查 | 任选 1 条 fact | 六要素均非空 |
| C6 | embedding 覆盖 | facts 中 embedding 非空计数 | = 总 facts 数；且 `eps_source` 含 `placeholder-random-seed42` 标记 |
| C7 | blocked 清零 | 导入日志 | 无未处理的 blocked 条目 |

---

## D. 质量红线（一票否决）

| # | 红线 | 后果 |
|---|---|---|
| D1 | 任一表缺失六元组必填字段 | Phase 0 不关闭，回补 schema |
| D2 | 存在绕过 ν 门的写入路径（业务层直拼 CozoScript / 直写 mnestic） | 不关闭，重构写入路径 |
| D3 | 验收项被静默跳过（HNSW 不可用未上报、blocked 未清零） | 不关闭，补记录 + 上报 |
| D4 | 《mnestic API 速查.md》出现无行号证据的 API 断言 | 不关闭，重核速查 |
| D5 | AI 实现与手册确定值（schema 字段/接口签名/映射规则/成分字符串格式）不一致且未回写文档 | 不关闭，回退重投指令 |
| D6 | 框架依赖泄漏：`src/memory`、`src/runtime`、`src/api` 中出现 `@deepseek-ai/cordis` 或 DSH 专有 API 引用（框架交互未收敛于 `src/plugins/dsh/`） | 不关闭，重构剥离框架依赖 |

---

## E. 验收签署

| 角色 | 签署项 | 日期 |
|---|---|---|
| 执行人（vibe coding 操作者） | A–D 全部核对通过 | |
| 子课题2 负责人 | D 红线复核 + Phase 0 关闭批准 | |

**Phase 0 关闭后**：归档本清单（勾选态）至 `docs/phase0-acceptance.md`，Phase 1（Week 3–4：Horn 闭包推导 + 首个 infer option 绑定）方可启动。
