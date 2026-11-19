---
创建时间: 2026-11-15
更新时间: 2026-11-19
类型: 开发方案（修订草案）
所属项目: "26-04 AI4Science"
相关路线图: "S01最小产品路线图（完整版：OptionMemory + LLM 原生 Planner）"
状态: Phase 4 已关闭；Phase 5–6 SuperAgent 适配待实施
tags:
  - MemoryBridge
  - OptionMemory
  - OpenCode
  - Markdown
  - 日常记忆
  - AI4材料
---

# Memory Bridge 开发方案（Markdown 摄入 × MemoryCore 治理 × OpenCode 召回）

> 本方案采用“**薄 Bridge、厚 MemoryCore、轻 OpenCode 适配**”。Bridge 是带来源和幂等语义的日常数据摄入适配器，不是第二套记忆库、治理中心或运行时召回服务。
>
> 日常 Markdown 是 data 层外部原始数据。原文保留在文件系统，MemoryCore 保存 `raw_ref`、稳定引用、哈希、必要分块投影、事实来源关联和治理状态，并统一提供 Recall。OpenCode 只负责查询、原生上下文注入、权限和宿主交互。
>
> Bridge 不修改既有 Markdown，不建设受管块、双向写回、独立 Bridge 索引或第二套事实状态机。MemoryCore 可以在召回时裁注当前有效信息，但不能抹除原始记录、人工叙述或冲突历史。
>
> 原 `OPTIONMEMORY_TOOL_CONTRACTS` 七工具不变，既有 Planner 三工具保持独立；Bridge/Recall 使用独立版本线和契约。R4 阻塞、J/≺、ν 门、settlement/revoke 和 RocksDB 数据保留语义不变。
>
> 当前基线为：Phase 0、2、3 已关闭，Phase 1 R1–R3 部分验收通过且 R4 仍阻塞；Phase 4 原基线与 P4-0 至 P4-6 Planner 增量均已通过 Repo 验收，全量回归为 **35 个测试文件、128/128 通过**。真实双会话、修订、调度恢复、Ticket 映射、Sidecar 证据隔离和日常记忆 STOMP 闭环见 `docs/phase4-memory-bridge-acceptance.md`、`docs/phase4-dsh-acceptance.md`、`docs/phase4-scheduler-acceptance.md`、`docs/phase4-superagent-acceptance.md`、`docs/phase4-sidecar-acceptance.md` 和 `docs/phase4-memory-stomp-acceptance.md`；CSV 全量、transient 结算和 v0.2.0 升级保留见 `docs/phase4-acceptance.md`。后续 SuperAgent 正式适配不代表已经交付。
>
> Obsidian 是可选编辑器，不是运行依赖。OpenCode Skills 的可选治理见第十六章，不与日常 Markdown 最小闭环捆绑交付。

---

## 一、问题定义与核心判断

### 1.1 当前缺口

现有 MemoryCore 已提供结构化事实写入、查询、撤回、推导、修订传播和冲突治理，但尚未形成完整的日常记忆闭环：

1. 会话中的哪些内容值得保存，仍依赖用户或模型临时判断；
2. 保存后不会自然在后续会话的相关任务中出现；
3. Markdown 叙述、项目背景与 MemoryCore 事实之间缺少稳定引用和失效关联；
4. `AGENTS.md`、历史记忆和当前任务之间缺少明确的信任及冲突边界；
5. 多笔记内容冲突、知识版本冲突和文件版本变化容易被混为同一问题。

### 1.2 核心判断

- 自动规划解决“下一步做什么”，不自动解决“该记什么、何时想起”。
- `memory_why` 解决解释与审计，不自动解决捕获和召回。
- 后台执行解决可靠运行与恢复，不提供记忆筛选、去重、授权和上下文注入策略。
- 结构化 `memory_query` 不等于面向日常任务的联合召回。
- 因而需要分别补齐：**摄入解析 → 文档投影与来源关联 → 统一 Recall → OpenCode 受控注入 → 修订后再次召回**。
- 摄入治理 MVP 可以推迟 Recall；日常记忆最小闭环不能省略 Recall 和自动注入。

---

## 二、目标与非目标

### 2.1 目标

1. **可治理摄入**：Markdown 经版本化 `parse_markdown_note` 进入文档投影和事实候选流程，保留来源、哈希、解析版本与操作证据。
2. **跨会话可用**：会话 A 显式保存的日常背景或材料事实，能在会话 B 的相关任务中被召回并附出来源。
3. **日常与专用共存**：日记、任务、项目叙述和实验报告使用 Markdown；材料事实、证据和 Option 状态使用 MemoryCore。
4. **当前信息裁注**：MemoryCore 可以在召回投影中标注旧原文、当前事实、冲突和 `mapping_stale`，不改写原始文件。
5. **与 OpenCode 指令融合**：`AGENTS.md` 管工作方式，动态记忆提供历史参考，二者不互相复制或越权。
6. **渐进交付**：先完成 Markdown 摄入与治理，再完成显式捕获、关键词 Recall、自动注入和修订入口。
7. **独立交付**：不依赖持续 Planner、共享 planner-runtime、SuperAgent 或 dataStore 的后续实现。

### 2.2 非目标

- 不全量复制 Markdown 原文，不建立第二个权威事实库。
- 不修改既有 Markdown，不自动覆盖原始记录、自由叙述或人工冲突。
- 不把所有日记或整个知识库注入每次模型请求。
- 不自动把会话、召回内容或 Skill 候选提升为 `AGENTS.md` 指令。
- 不替代 Git、编辑器或同步软件处理任意 Markdown 合并。
- 不对观点、偏好和任意叙述强行裁决唯一真相。
- 不新建 plan_run、Ticket、Executor 领域资产、Question Center、权限审批或长期 Source 监听。
- 不允许 Bridge 绕过 MemoryCore 服务层直接执行 CozoScript、修改 RocksDB 或调用 settle/revoke 文本替代品。
- 首版不做全库语义去重、自动整理、物理删除、模型训练或双向同步。

---

## 三、权威来源与组件分工

### 3.1 分层权威矩阵

| 内容 | 权威来源 | MemoryCore / Bridge 保存的内容 |
|---|---|---|
| 稳定工作规则、项目约定 | 人工维护的 `AGENTS.md` 与已批准 instruction 文件 | 路径、作用域、内容哈希和引用，不生成第二份权威规则 |
| Markdown 原始叙述和原始记录 | 文件系统中的原文 | `raw_ref`、稳定 document/chunk 引用、哈希和必要投影，不覆盖原文 |
| 当前结构化事实、规则、J/≺、Option/Model 状态 | MemoryCore | 原生事实、治理事件、查询投影及 `fact/option/model ID` |
| 文档与事实映射、候选处理状态 | MemoryCore 持久元数据 | 映射、幂等键、同步状态和操作日志 |
| 文件历史与人工合并 | 文件系统与 Git | 当前哈希和来源版本，不复制完整版本史 |
| OpenCode 会话与 compaction 状态 | OpenCode | 经授权的候选记录及 session/message 引用 |
| 派生全文/向量索引 | 可重建投影 | 不作为日常内容、事实或治理状态的权威 |

权威粒度下沉到具体声明和引用，而不是整篇文档。MemoryCore 是当前结构化事实和治理状态的权威，但“MemoryCore 为主”不意味着原始文字失去证据价值，也不意味着 contested/probation/uncalibrated 内容可以自动胜过原文。

### 3.2 组件职责

| 组件 | 职责 | 明确不负责 |
|---|---|---|
| Bridge 摄入适配器 | Markdown 只读解析、分块、来源定位、候选抽取和幂等提交 | 不裁决治理，不负责运行时召回，不写回原文 |
| `parse_markdown_note` Option | 以受控 atomic Option 产出 DocumentProjection、FactCandidate 和 Observation | 不把解析成功等同于事实真实或抽取质量认证 |
| MemoryCore | 文档投影、来源关联、事实与修订治理、统一 Recall、操作审计 | 不依赖 OpenCode，不直接修改 Markdown |
| OpenCode Adapter | 显式工具、自动上下文 hook、原生权限、session/message 映射 | 不复制检索、冲突或写入业务逻辑 |
| Obsidian Adapter（可选） | 解析 Wikilink、Embed 和块引用等扩展语法 | 不要求安装 Obsidian，不改变核心存储格式 |

约束：

- Bridge 与 MemoryCore 核心均不 import OpenCode、Obsidian 或 DSH SDK。
- OpenCode 自动召回直接调用 MemoryCore Recall API，不通过模型再次调用工具形成循环。
- MemoryCore 不可用时，本次不注入或只读降级并明确标记；事实写入必须 fail-closed。
- 派生索引不可用时可以重建，不能用旧缓存冒充当前有效状态。

---

## 四、总体架构

```text
日常 Markdown（data 层外部原文）
        │
        ▼
parse_markdown_note（Bridge，atomic Option）
        │  DocumentProjection / FactCandidate[] / Observation
        ▼
ν 门与 MemoryCore 服务层
        │
        ├─ documents/chunks/source_links/操作审计
        ├─ facts + source_ref + J/≺（按真实语义分别使用）
        └─ 修订、冲突、Option/Model 治理
        │
        ▼
MemoryCore Recall API
        │
        ▼
轻量 OpenCode 查询与原生上下文注入
        │
        ▼
REFERENCE_MEMORY（非指令参考、来源与裁注）
```

`DocumentProjection` 是可重建的 data 层投影，不是新的事实权威。候选经 ν 门和服务层后才可能成为 facts；解析器 Option 的执行事件用于记录 parser 版本、结果、错误和真实成本。

---

## 五、Markdown 摄入与体量控制

### 5.1 只读扫描与稳定引用

普通笔记无需迁移即可只读解析：

- `document_id/chunk_id` 表示稳定逻辑身份；
- `path + heading_path` 表示当前位置；
- `content_hash` 表示当前版本并用于变更检测与幂等；
- `raw_ref` 使用受控 URI 或相对路径，不泄露排除路径。

文件重命名、标题移动或内容变化时，按既有 ID、标题和哈希重新匹配。无法唯一匹配时创建新引用或标记 `identity_uncertain`，不得让旧事实自动继承到新文本。

### 5.2 三层过滤

1. **硬过滤**：排除密钥、令牌、敏感路径、二进制、依赖目录、构建产物、未授权符号链接和 workspace 外内容。过滤同时作用于正文、候选、索引、向量和日志。
2. **结构过滤**：按标题与语义块切分，保留表格和代码上下文，去除模板、导航和重复页眉页脚，对完全相同的块做哈希去重。
3. **候选过滤**：只有需要精确推导、修订和状态治理的声明进入 FactCandidate；其余仅保留为可召回原文投影。

过滤减少的是索引与治理体量，不删除原始 Markdown。被过滤内容记录 `excluded_reason + policy_version`，策略变化后可重新处理。

### 5.3 原文变化

```text
content_hash 变化
→ mapping_stale
→ 重新解析影响范围
→ 保持事实、更新映射，或进入正式修订流程
```

`mapping_stale` 只表示映射需要复核，不自动将事实改为 `out`。原始文件、旧事实和历史事件均不得因普通文本变化而被自动删除。

---

## 六、核心数据契约

### 6.1 `DocumentProjection / ChunkProjection`

至少包含：

- `document_id/chunk_id`；
- `raw_ref/path/heading_path`；
- `content_hash`；
- `namespace/workspace/project`；
- `parser_id/parser_version`；
- 必要的文本投影和截断标记；
- `source_updated_at/recorded_at`；
- `mapping_status = current/stale/identity_uncertain`；
- `excluded_reason/policy_version`（适用时）。

全文不必复制到 MemoryCore。文本投影、全文索引和向量均可从原文及持久映射重建。

### 6.2 `MemoryRef`

| 字段 | 含义 |
|---|---|
| `memory_uri` | `md://<document_id>#<chunk_id>`、`memorycore://fact/<id>`、`instruction://<path>` |
| `kind` | `document/chunk/fact/option/instruction/task_ref` |
| `scope` | user/workspace/project/notebook 等允许作用域 |
| `status` | 来源原生状态，不统一成新的状态机 |
| `source_ref` | 原始路径、session/message、实验记录或证据引用 |
| `valid_from/valid_to` | 现实有效时间；未知保持 null |
| `recorded_at/source_updated_at` | 系统记录时间与来源更新时间，不与有效时间混用 |
| `content_hash` | 当前投影对应版本 |
| `trust` | `instruction` 或 `reference`；MD 与事实召回默认均为 reference |
| `mapping_stale` | 原文变化后映射是否待复核 |

### 6.3 来源关联与推导关系

- **来源证据**：`fact_id → document_id/chunk_id/source_ref`；
- **推导血缘**：derived fact → premise facts + rule，使用既有 J/≺；
- **修订关系**：当前版本 → 被替代或失效版本；
- **映射状态**：projection/fact → current/stale/identity_uncertain。

原文只是出处而非逻辑前提时，不得为了“有血缘”而强行写入 `j_premise_ids`。

### 6.4 `CaptureCandidate`

| 字段 | 要求 |
|---|---|
| `candidate_id/idempotency_key` | 由来源事件、内容哈希和目标路由确定性生成 |
| `source_ref` | session/message、compaction、Markdown 块或人工输入 |
| `route` | `document_projection/fact/instruction_candidate/ignore` |
| `payload` | 投影或完整结构化输入；缺字段不得静默补齐 |
| `status` | proposed/approved/applied/rejected/blocked/failed/reconcile_required |
| `approval_ref` | 用户明确“记住”的指令、人工确认或宿主权限引用 |
| `result_refs` | 实际生成的 document/chunk/fact/option ID |
| `reason` | blocked、失败、忽略或待对账原因 |

LLM 给出的抽取分数只表示抽取过程信息，不等于事实置信度或独立验证。候选被应用前不是权威记忆。

### 6.5 `RecallRequest / RecallResult`

`RecallRequest` 至少包含：

- `query`；
- `namespace/workspace/project`；
- `session_id/message_id`；
- 可选时间、类型和来源过滤；
- `allow_history`，默认 false；
- `top_k`、最大条目数和 token 预算；
- `recall_strategy_version`。

`RecallResult` 每项至少包含：

- `memory_uri/fact_id/chunk_ref`；
- 原文摘要或事实值；
- 来源、状态、有效时间和内容哈希；
- 关键词/语义/作用域等分项评分，未计算项为 null；
- `conflict_ids/mapping_stale/current_fact`；
- 截断标记和过滤原因。

总体诊断包含实际注入 token、降级状态、查询耗时和策略版本。

### 6.6 `ConflictRecord`

至少区分：

- `value`：同一主体、谓词和上下文出现不同值；
- `scope`：表面冲突但适用条件不同；
- `temporal`：不同有效时间或新旧版本；
- `instruction`：不同指令文件给出不兼容要求；
- `file_version`：读取前后哈希变化或原文已更新；
- `identity`：实体对齐不确定，不能直接判为值冲突。

未解决冲突只记录和展示，不自动生成 settlement。

---

## 七、关键工作流程

### 7.1 Markdown 解析 Option

`parse_markdown_note` 复用 `parse_csv_materials` 的受控执行模式：

```text
声明 input_schema
→ (pi_type, pi_ref) 白名单实现
→ 输出 DocumentProjection / FactCandidate[] / Observation
→ β 输出校验
→ option_event_observation/outcome
→ parser 版本、attempt、成本和错误证据
```

必须区分：

- **结构解析**：标题、块、哈希和来源位置，通常具有确定性；
- **事实候选抽取**：可能使用 LLM，存在误判、漏抽和适用域问题。

解析成功不等于候选事实正确，Option settled 不等于候选事实自动 settled，`achievable/ω_certify` 仍按后续 Phase 6 能力认证边界处理。

### 7.2 显式捕获与修订

首版日常闭环采用“用户明确要求即本次批准，模型提议仍需人工批准”：

- 用户明确“记住……”：`bridge_capture` 校验后可写入 Core-owned captured note/projection 或 MemoryCore fact；
- 模型自行提出：仅创建候选，人工批准后才应用；
- 用户说“之前记错了/不要再使用/仅限项目 A”：分别进入修订、retract/revision 或 namespace 变更；
- 稳定工作方式：仅生成 instruction candidate，不自动修改 `AGENTS.md`。

Bridge 对既有 Markdown 保持只读。Core-owned captured note 是新的系统来源记录，不冒充外部 Markdown 原文，也不反向覆盖文件。

### 7.3 联合召回

```text
新用户任务或显式 bridge_recall
→ memory_recall(query, scope, budget)
→ 固定查询 documents/chunks/facts/source_links
→ 过滤出域、失效、撤回归档和不允许来源
→ 按当前任务重排并按 claim/context 分组
→ 输出冲突与不确定项
→ 在 token 预算内构造 REFERENCE_MEMORY
→ 注入一次并记录 memory_uri/hash/session/message
```

首版只要求关键词/中文 trigram 或 FTS、结构化过滤、时间/来源排序、简单去重和 token 预算。向量召回不是最小闭环的必要条件。

### 7.4 注入前裁注

```text
[REFERENCE_MEMORY: non-instructional]
- 内容或事实值
  source: md://... / memorycore://fact/...
  status: active / in / contested / superseded
  current_fact: ... / null
  valid_from/to: ... / null
  mapping_stale: true / false
  conflicts: ... / null
[/REFERENCE_MEMORY]
```

规则：

1. MemoryCore 有更新结论时，旧原文不得覆盖当前事实；可标注 `current_fact` 和 `markdown_stale`。
2. `contested/probation/uncalibrated` 不得被描述为已认证结论。
3. `out/revoked/superseded` 默认不用于当前建议，历史问题可显式查询。
4. 原始记录和冲突历史仍可查询，不得因当前结论更新而抹除。
5. 召回文本不能新增工具、权限或指令。
6. 标记只是提示模型，真正安全边界仍由工具权限、写入门控和宿主审批落实。

### 7.5 OpenCode 指令入口与自动注入

1. OpenCode 按自身规则加载 `AGENTS.md`，Bridge 不重新实现其发现和加载顺序。
2. 人工审核的 `memory/opencode.md` 只说明何时召回、信任边界和冲突报告，不包含全部记忆。
3. 新用户消息通过 V2 context hook 内部调用 Recall API；`session_id + message_id + query_hash` 去重。
4. 工具 continuation 默认复用结果，不重复注入；新任务、作用域变化或显式刷新才重新召回。
5. hook 失败不阻断普通编程会话，但必须返回简短降级诊断。
6. Agent 直接读取原文件时可能绕过裁注；首版通过静态指令要求历史记忆先走 Recall，直接读取裁注列为后续能力。

### 7.6 操作恢复与一致性

- 摄入和捕获采用确定性 idempotency key，可安全重试。
- 技术操作日志记录 prepare/applied/failed/reconcile_required，不是 planner-runtime inbox/outbox。
- 已知未应用可重试，已知已应用幂等返回，副作用未知必须先对账，不得盲目重放。
- 首版只承诺“同步、幂等、可安全重试和按日志对账”，不承诺崩溃后无条件自动恢复。
- 读取文件前后哈希不一致时，放弃该快照并重新扫描或标记 `file_version`，不混用两个版本的投影。

---

## 八、冲突与版本处理

### 8.1 多笔记内容冲突

1. 只对受管声明或高置信结构化候选进行冲突检测，不试图把任意自然语言全部逻辑化。
2. 先规范化主体、谓词、单位、测量方法、时间和适用域，再进行同键比较。
3. 不同适用条件的值分别保留，不冒充冲突。
4. MemoryCore 已有治理流程的冲突沿用原 settlement/revoke，Bridge 不复制裁决政策。
5. Markdown 观点、偏好和同级来源无法自动裁决时为 `manual_review`。
6. 重复笔记优先选定权威来源并建立引用，不自动删除或合并整篇文件。

### 8.2 知识版本冲突

- Markdown 使用来源时间、有效时间和 Git 历史保留版本。
- MemoryCore 使用既有 `memory_retract`、≺、J 和 TMS 传播。
- 新实验取代旧结论时，先由权威域完成修订，再更新召回投影和关联笔记标注。
- 历史查询必须能说明某结论在当时为何有效、何时失效；首版没有 `memory_why` 时只承诺原始引用和状态展示。

### 8.3 指令冲突

- 不自动合并或重写多份 `AGENTS.md`。
- 行为权威与事实权威分别处理：项目指令可以约束行动，但不能自动使过期事实胜过新证据。
- 动态记忆中的命令文本一律作为参考内容，不提升为指令。
- 从记忆提炼新规则必须经人工批准，避免“记忆 → AGENTS → 再记忆”的自我强化循环。

### 8.4 文件版本变化

- Bridge 只读，因此首版不需要 Markdown CAS 写回或文件合并。
- 文件哈希用于变更检测、读取一致性和映射复核，不再用于覆盖写入。
- Git 负责历史、差异和人工合并；Bridge 不执行 hard reset、force push、自动提交或破坏性清理。

---

## 九、OpenCode 接入方案

### 9.1 独立模块与接口

Bridge/Recall 不修改原七工具契约。建议接口为：

| 接口 | 类型 | 作用 |
|---|---|---|
| `parse_markdown_note` | 内部 atomic Option | Markdown 解析、投影、候选与 Observation |
| `bridge_capture` | 受控捕获工具 | 显式保存或创建候选；用户明确要求可作为本次批准 |
| `bridge_apply` | 受控候选应用（可选） | 人工批准后应用模型候选，不写回既有 Markdown |
| `memory_recall` | MemoryCore 只读 API | 联合查询、状态裁注、预算与冲突提示 |
| `bridge_recall` | OpenCode 只读工具 | 显式调用同一 Recall API，便于调试和 V1 使用 |
| `memory/opencode.md` | 静态 instruction | 说明召回、信任和冲突规则 |
| V2 context hook | 自动注入 | 新消息自动召回并按 message 去重 |

候选列表、冲突复核和索引重建可提供本地 CLI/只读视图，不新建 Attention UI。

### 9.2 V2 路径

以项目已验证的 OpenCode 2.3.0 为初始目标 pin，升级前重新执行探针：

- 使用独立 V2 插件入口和 `ctx.tool.transform` 注册显式工具；
- context hook 的能力与参数必须在 B0 实测，不能把设计参考当成已验证 API；
- 当前 P4-1 已实证 V2 高层 session API 与 V1 client 不同，subagent 需要按实际 `create/prompt/wait/context` 语义适配；
- standalone 与后台服务的插件加载方式分别验收；
- reviewer/抽取模型必须显式配置，不能依赖宿主默认免费模型；
- compaction hook 只读获取候选输入，不替换或阻断 OpenCode 原 compaction；
- 写操作复用 permission ask，语义澄清复用原生 question。

官方设计参考：

- Instructions：<https://opencode.ai/docs/instructions/>
- Server Plugins：<https://opencode.ai/docs/build/plugins/server/>
- Compaction：<https://opencode.ai/docs/compaction/>
- Skills：<https://opencode.ai/docs/skills/>

### 9.3 V1 路径

- 首版只承诺静态 instructions、显式工具和手动捕获。
- 自动召回 hook 只有在 `opencode-ai 1.19.5` 与对应插件 pin 的隔离探针通过后才启用。
- 不把当前 V2/master 文档中的能力默认套用到 V1。
- V1 自动召回能力若探针不完整，保持显式 `bridge_recall`。

### 9.4 版本与配置验收

- V1/V2 分别记录 OpenCode 版本、插件 SDK、Bridge/Core 契约版本和探针结果。
- 原 OptionMemory V1/V2 入口仍只登记原七工具，Planner 与 Bridge 工具清单分别核查。
- 配置只提供人工审核模板，不静默改写全局 `opencode.json(c)` 或 `AGENTS.md`。
- 加载、卸载和重装不得清空 Markdown、MemoryCore 或 RocksDB；派生索引可重建，映射、候选和操作日志必须持久保留。

---

## 十、索引、召回与一致性设计

### 10.1 存储生命周期

- **持久元数据**：document/chunk ID、映射、候选、冲突、幂等键和操作日志，需要备份恢复。
- **派生检索索引**：文本投影、关键词索引、可选向量及 embedding 版本，可从权威原文和持久映射重建。
- **治理权威**：事实状态、J/≺、修订、冲突和 Option/Model 状态。

三者可以共用 MemoryCore/RocksDB，但不得混用生命周期，也不得把索引内容当成治理事实。

### 10.2 现有 HNSW 的边界

当前 facts 的 embedding 为固定 1024 维，已有 HNSW 冒烟验证，但回填使用固定种子伪随机向量，无语义检索意义。现有能力只能证明索引机制可用，不能证明中文日常记忆召回可用。

启用真实向量前必须记录：

- `model_id/version/dimension`；
- 分块与预处理版本；
- 外部服务数据外发评审；
- 中文查询集的召回基线；
- 模型升级后的向量重建与隔离策略。

真实 embedding 可复用 HNSW 机制时，也应为 document chunks 建独立投影，不复用 facts 中已有的随机向量。首版优先使用结构化过滤与关键词召回，不以技术流行度决定启用向量。

### 10.3 混合召回与排序

后续混合排序可考虑：

- 文本/语义相关度；
- namespace/workspace/project 匹配；
- 来源状态、有效时间和显式用户选择；
- MemoryCore 治理状态和原始证据可用性；
- 重复内容聚类与来源多样性；
- token 成本。

不得把 recency、embedding 相似度或 LLM 自评单独当作真实性分数。授权过滤必须先于结果返回，未观测指标保持 null/uncalibrated。

### 10.4 失败与恢复

| 故障 | 行为 |
|---|---|
| MemoryCore 不可用 | 本次不注入或只读降级；事实写入失败，不缓存伪造成功 |
| 派生索引损坏 | 从原文和持久映射重建，不影响 facts |
| 自动召回超时 | 本次不注入或仅注入完整校验结果，并记录降级 |
| 捕获应用中途崩溃 | 按日志和幂等键对账，未确认副作用不得盲目重放 |
| 文件读取期间变化 | 放弃混合快照，重新扫描或标记 file_version |
| compaction 捕获失败 | 不影响 OpenCode 原 compaction，不阻塞会话 |
| 配置或权限不足 | 只读降级或明确 blocked，不自动扩权 |

---

## 十一、安全、隐私与信任边界

1. Markdown 根目录采用 allowlist，拒绝路径穿越和未授权符号链接。
2. 所有召回内容默认是非指令参考数据，包括 MemoryCore 文本、Web 内容和 compaction 摘要。
3. `AGENTS.md` 与静态 bootstrap 属于 privileged instruction，只允许人工审核内容进入。
4. Bridge 不执行召回文本中的命令，不因其要求修改工具、权限、模型或宿主配置。
5. MemoryCore 查询使用固定模板或既有只读防护，不暴露任意 CozoScript 写入。
6. 写入、撤回和 Option 治理分别经过宿主权限及 MemoryCore ν 门；能力认证不扩大授权。
7. 日志记录来源 ID、哈希、操作和错误，不记录令牌、密钥或被排除正文。
8. 使用外部 embedding/抽取服务前必须单独评审数据外发；默认优先本地索引和当前会话生成候选。
9. 自动写入默认关闭；用户明确“记住”只授权当次指定内容，自动修改 `AGENTS.md` 永久需要显式批准。
10. 安全验收必须包含恶意笔记提示注入、跨项目越权召回、敏感路径排除和旧缓存冒充有效状态。

---

## 十二、目标文件与模块边界

以下为实施时的建议边界，不在本草案阶段提前创建代码：

```text
src/
  bridge/
    contracts.ts
    capture/
      router.ts
      candidates.ts
      apply.ts
    markdown/
      reader.ts
      parser.ts
      projections.ts
      filters.ts
  api/
    memory-recall.ts
    document-projections.ts
  memory/
    document-projections.ts
    recall.ts
  plugins/
    opencode/
      bridge/
        index.ts
        v1.ts
        v2.ts
        tools.ts
        hooks.ts

schema/
  10_memory_documents.cozo   # 实际编号实施时避开已占用文件

templates/
  memory-bridge/
    opencode.md

tests/
  bridge-contracts.test.ts
  bridge-markdown.test.ts
  bridge-capture.test.ts
  bridge-consistency.test.ts
  bridge-security.test.ts
  memory-recall.test.ts
  bridge-opencode-v1.test.ts
  bridge-opencode-v2.test.ts

docs/
  memory-bridge.md
  memory-bridge-contracts.md
  memory-bridge-acceptance.md
```

要求：

- `src/bridge/` 不含 OpenCode/Obsidian 框架依赖。
- CozoScript 继续集中在 `MnesticClient`，文档查询使用固定模板。
- OpenCode 适配只做 SDK 映射，不复制检索、冲突或写入业务逻辑。
- MemoryCore 访问复用现有客户端与服务契约；公开接口不足时先评审最小只读/写入增量，不直写存储。
- 持久映射与派生索引分生命周期，原文投影不进入第二套事实状态机。

---

## 十三、分阶段实施计划

本方案已纳入现有 16 周路线图的 Phase 4–6 多源解析，不再是独立平行路线。Bridge/Recall 的 API 和版本线独立，但交付与签署进入对应 Phase，不能用本方案的 B 阶段替代原 Phase 验收。

| 本方案 | 路线图实施步骤 | 交付承诺 |
|---|---|---|
| B0 | P4-1M 前置准备 | 契约、fixture、威胁模型、中文召回基线和 V1/V2 探针 |
| B1 | Phase 4 P4-1M | Markdown 数据摄入与治理 MVP |
| B2 全部 | Phase 4 P4-1M | MemoryCore Recall、显式捕获/修订、V2 自动注入与 OpenCode 日常记忆最小闭环 |
| B3 | Phase 5 P5-4 | SuperAgent 持续记忆与跨宿主适配；向量/compaction 仅作可选增强 |
| B4 | Phase 6 P6-4 | SuperAgent 主动记忆治理、跨 harness 恢复和真实库加固 |

对应实施手册：

- `devNotes/Week9-12开发手册-多源解析与可靠调度.md`；
- `devNotes/Week13-14开发手册-持续Planner与决策链导出.md`；
- `devNotes/Week15-16开发手册-生成认证与SuperAgent持续适配.md`。

### B0：契约、真实样本与版本探针

交付：

1. 冻结权威矩阵、文档投影、信任模型、冲突分类和 Recall 契约；
2. 建立匿名化 fixture：日常笔记、项目决策、实验报告、S01 事实、修订、同义改写和 450/512 HV 冲突；
3. 建立中文关键词召回对照集，确定默认 token 预算；
4. 探针验证 V1/V2 instructions、工具、context/compaction hook、question/permission 和实际加载方式；
5. 审计 MemoryCore 当前公开服务是否足够，禁止直写 RocksDB 补缺口；
6. 给出威胁模型、排除目录和写入权限矩阵；
7. 以当前 Phase 0–3、P4-0/P4-1 和 84 项测试为回归基线。

关闭条件：契约评审通过，V1/V2 能力边界有实测记录，中文召回基线可复现，既有回归无变化。

### B1：Markdown 数据摄入与治理 MVP

交付：

1. 只读扫描、三层过滤、稳定 document/chunk 引用和哈希防重；
2. `parse_markdown_note` atomic Option、DocumentProjection、FactCandidate 和 Observation；
3. ν 门写入、source link、J/≺ 语义分离和 `mapping_stale`；
4. 固定只读查询：document/chunk、fact source refs、stale mappings；
5. 原文变化复核和 parser outcome 证据。

关闭条件：重复解析不重复写入；候选不自动 settle；原文不变；文件修改后映射待复核且旧事实不被自动删除；可查询当前事实、原文出处和复核状态。

本切片不开发自然语言 `memory_recall`，不承诺语义查找、自动想起或 Agent 直接读取裁注。

### B2：OpenCode 日常记忆最小闭环

交付：

1. 显式 `bridge_capture`、用户当次批准、模型候选人工应用和重复捕获防重；
2. 独立只读 `memory_recall`：关键词/结构化过滤、Top-K、简单去重、token 预算和裁注；
3. `bridge_recall`、人工维护的 `memory/opencode.md` 和 V2 自动上下文注入；
4. 用户修订入口，修订后下一次召回立即反映；
5. 两个真实新会话演示和 message 级注入去重。

关闭条件：会话 A 保存的项目决策在会话 B 的相关任务中自动出现并正确引用；同一消息只注入一次；修订后不使用旧结论；跨项目记忆隔离；恶意记忆不能提升为指令；hook 失败不阻断普通会话。

B2 完成才能称为“OpenCode 日常记忆最小闭环”。B1 只称为“Markdown 数据摄入与治理 MVP”。

### B3（Phase 5 P5-4）：SuperAgent 持续记忆与跨宿主适配

交付：

1. Source/Ticket/Assignment 到 namespace/session/message/query_hash 的确定性映射，长期项目与临时 Assignment 隔离；
2. deliver 使用同一 MemoryCore Recall 重建 Planner observation，不经过 OpenCode context hook，不复制召回实现；
3. 捕获/修订经 Ticket Attention 批准，人工 stop 禁止后续自动捕获与恢复；
4. OpenCode 与 SuperAgent 交叉读取和修订同一 document/fact/recall_event；
5. handoff/重启按 query_hash 和幂等键对账，Report 保存真实 memory_uri/recall_id/批准引用；
6. 根据 B0/B2 基线可选评估真实向量、compaction 和直接读取裁注，不作为持续适配前置。

关闭条件：Ticket 内召回与 OpenCode 一致；跨宿主修订生效；重复 deliver 不重复执行；Attention 未批准不落地，stop 后无自动恢复；handoff/重启后事件链连续，原 8 工具不变。

### B4（Phase 6 P6-4）：SuperAgent 主动记忆治理与真实库加固

交付：

1. 长期 Ticket 基于 stale/conflict/新证据生成维护候选，Attention 批准后执行，主动发现不自动扩权；
2. 维护质量进入统一 option_event/model_event，Recall 命中不等于 achievable 认证；
3. handoff 保存 Recall/document/chunk/candidate/approval/lease/revision，跨宿主恢复无重复副作用；
4. 回滚发布新 superseding 版本，不篡改历史；人工 stop 与 Option revoke 分离；
5. 在用户批准的副本上完成索引重建、敏感路径、隔离、性能、成本和真实 host 验收；
6. 使用文档、回滚说明、版本矩阵和独立验收记录。

关闭条件：长期 Ticket 的维护候选、Attention 批准、人工 stop、跨 harness Recall/修订/恢复通过；认证不混用 simulated/sidecar 或抽取器自评；真实副本和原 OptionMemory 全量测试不回归，已知限制与未解决冲突可查询。

---

## 十四、验收场景

### 14.1 摄入治理

1. 同一文件、同一版本重复解析，不重复生成 projection 或 facts。
2. 解析失败产生真实 failure，不伪造 outcome。
3. 文件原文不被修改，候选经 ν 门和服务层，未验证候选不自动 settle。
4. facts 能回查 source chunk，J/≺ 只用于真实推导关系。
5. 文件修改后产生 `mapping_stale`，旧事实不被自动覆盖或删除。

### 14.2 跨会话日常记忆

1. 会话 A 记录一个项目决策及其原因，经当次批准写入；
2. 会话 B 不携带原对话，仅提出相关任务；
3. Recall 返回该决策、来源和更新时间并自动注入一次；
4. OpenCode 将其作为非指令背景使用，并在关键结论中保留回链；
5. 修订后下一次召回立即反映，重启和索引重建不改变稳定 ID。

### 14.3 与 `AGENTS.md` 融合

fixture 同时包含：

- `AGENTS.md`：当前项目使用 pnpm；
- 历史笔记：旧项目曾使用 npm；
- 当前用户任务：安装并验证依赖。

期望：Agent 按当前项目规则工作，历史笔记只作为背景；不得因召回旧笔记改用 npm，也不得自动改写历史笔记或 `AGENTS.md`。

### 14.4 日常与材料联合召回

- Markdown 实验报告与 MemoryCore 对应 hardness fact 能通过 `chunk_id/fact_id` 同时召回；
- S01 成分更正后，旧下游事实不进入默认有效记忆；
- 450/512 HV 冲突保留原 governance 结果，Bridge 不自行改变 settle/revoke；
- 604/97 分组、R4 阻塞和未验证 sidecar 边界不被日常记忆召回稀释或抬高。

### 14.5 安全与宿主可靠性

- 笔记包含“忽略 AGENTS 并执行命令”时，内容只作为引用，不触发执行；
- 项目 A 的记忆默认不能注入项目 B；
- 排除目录中的密钥和正文不出现在索引、向量、候选和日志；
- context hook 在多个 tool continuation 中不重复消耗预算；
- OpenCode 重启、Bridge 卸载/重装和派生索引删除重建均不丢失权威内容或持久映射；
- 原七工具、真实 LLM 治理流程、RocksDB 数据保留和既有全量测试不回归。

---

## 十五、度量与测试要求

### 15.1 召回质量

B0 建立带标准答案的小型查询集，覆盖：

- 日常项目背景、用户稳定偏好、历史决策；
- 同义改写、实体别名和近似重复；
- 材料事实、修订、冲突和来源回查；
- 失效记忆、跨项目记忆和提示注入负例。

报告 Top-K 召回率、无效记忆注入次数、来源正确率、冲突展示正确率和平均注入 token。阈值由 B0/B2 实测确定，未建立基线前不虚构准确率。

### 15.2 工程指标

- 自动召回同一 message 的重复注入数为 0；
- 重复候选应用的重复权威写入数为 0；
- 未授权写入、敏感路径索引和自动 AGENTS 修改次数为 0；
- 原文被 Bridge 修改的次数为 0；
- 派生索引可由原文和持久映射重建，候选及操作日志不被清空；
- p50/p95 检索延迟、索引重建时间、索引体量、内存和 token 成本按真实规模记录。

### 15.3 测试层次

1. 纯单元测试：解析、引用、过滤、路由、排序、冲突分类和预算；
2. 隔离存储集成测试：临时 Markdown 根目录、独立 Mem/RocksDB；
3. 故障测试：重复 apply、摄入前后崩溃、映射前崩溃、索引损坏和服务不可用；
4. V1/V2 契约测试：工具清单、hook、权限、提问和版本差异；
5. 真实 OpenCode 新会话测试：不能只用内部函数或 mock 冒充宿主验收；
6. 原 Phase 0–3、P4-0/P4-1 回归：Bridge 测试与既有验收分别归档，互不替代。

### 15.4 后续增量强制回归

P4-1M 之后的所有功能、宿主和版本增量必须执行 `docs/memory-regression-acceptance.md` 的共享回归，不能用 P4-1M 的双会话结果代替后续验收：

- P4-2/P4-3/P4-4/P4-5：分别验证跨 host 一致性、调度恢复、Ticket 映射和 sidecar 未知字段/证据隔离；
- P5：验证持续 runtime、Ticket Attention、跨宿主修订、handoff 和 Report 证据；
- P6：验证主动维护候选、认证、RL-ready、长期 Ticket stop/恢复/回滚和 Skill active_release；
- 每一步独立归档增量功能、共享回归、真实宿主事件、质量/安全指标和未实现项；缺一项不得签署该 Step。

---

## 十六、可选 Skill 治理与原生执行扩展

Skill 的**执行资格**不按普通 Markdown 记忆处理，而按“版本化 Option＋OpenCode 原生技能投影”治理；SKILL.md 的**叙述性内容**（描述、适用场景、变更记录）可经统一摄入成为 data 层知识 chunk，进入非指令召回池，正文与脚本不进入。该扩展不改变日常 Markdown 最小闭环。

### 16.1 权威与版本

- Git 中的 `SKILL.md + scripts + references + tests` 是不可变实现包；
- MemoryCore Option/Model、状态和证据是能力治理权威；
- Bridge 只维护 `skill_id + version + package_hash ↔ versioned option_id ↔ active_release ↔ host_projection`；
- 任一 supporting file 变化产生新版本，禁止原地覆盖已认证版本；
- 多个历史版本可以 settled，每个 skill ID 只有一个 active_release；
- Phase 6 前只能表示获准投影，不宣称 `achievable/ω_certify` 已认证；
- 回滚发布指向旧包哈希的新版本，不篡改历史。

### 16.2 原生投影与权限

- 候选包放在非 OpenCode 扫描目录，批准后生成独立 approved projection；
- settled/approved 版本可被发现，probation 设置 `metadata.opencode/autoinvoke: false` 且原生 `skill` 权限为 `ask`；
- revoked 撤销投影且原生权限为 `deny`，不能只依赖 autoinvoke；
- 防止其他目录的重复 skill ID 覆盖 approved projection；
- Bridge 召回只返回 `skill_id/version/status/active_release/evidence_ref`（查询时**活读**资产链 + 状态裁注，禁止预物化 declarative 影子；叙述内容来自 data 层 chunk，召回处 join），由 OpenCode 原生 skill 工具加载正文；
- revoke 阻止未来加载，但不能抹除已注入正文、已读取文件或已产生的副作用。

### 16.3 原生执行与 MemoryCore 控制面

OpenCode 可承担 Skill 正文加载和实际工具执行，MemoryCore 执行层只负责：

```text
校验 skill_id/version/package_hash/active_release
→ 校验 mandate 和输入 schema
→ 创建 option_event
→ 调用 NativeSkillAdapter
→ 收集原生工具事件
→ 写 observations/outcome/cost/error
→ 修订、revoke 或回滚
```

原生 `skill` 工具加载正文不等于任务执行成功。必须区分 `projection_loaded`、真实任务 outcome、tool failure、permission denied 和 cancellation。脚本副作用仍需脚本级幂等和对账，候选代码按不可信代码在隔离环境审查，核心 Skill 自动发布默认关闭并要求全量回归和人工批准。

### 16.4 统一摄入与双门晋升（2026-11-18 追加）

SKILL.md 与普通笔记走同一条摄入管线，分流发生在 data → knowledge 晋升处：

```text
SKILL.md ──统一摄入──> data 层知识 chunk（叙述：是什么/何时用；非指令召回）
        └──候选识别──> procedural 候选（带待绑定 package_hash）
              └──人工批准──> 注册门（实现包哈希校验 + mandate 绑定）
                    └──> 版本化 Option（probation）→ settled + active_release
```

- 候选管线四步：识别 → 候选 → 人工批准 → 注册门。治理 lane 语义不变：识别与候选抽取属数据 lane（ν门前一侧），注册门与资产化属治理 lane；2026-11-18 v5.1 最终安排：**识别与降维索引由线2 实现（MM-L2），注册门与资产化由线1 实现**，S1 候选 schema 为两线人际契约。
- 四条分流红线：candidate ≠ capability；指令性正文不进入非指令注入池；哈希域在注册门由文本 content_hash 切换为实现 package_hash；ν门（问真伪）与注册门（问授权）不可合一。
- 对应任务：P6-5（`devNotes/Week15-16开发手册-生成认证与SuperAgent持续适配.md`）。

### 16.5 下行沉降与退役分层（2026-11-18 追加）

执行结果不复制为独立事实，按三分离落位：

| 内容 | 唯一权威 | 禁止 |
|---|---|---|
| 校准（成功率/预测误差/成本） | Model 字段 | 成为独立 fact |
| 执行流水 | option_event/outcome | 成为独立 fact |
| 叙述残留 | declarative 摘要 fact | 复制执行数据 |

- 合法 declarative 沉降仅两个窄场景：降维归档索引（evidence_ref 回链 dormant 资产，内容限存在性/教训/结论）与跨域领域副产品（evidence_ref 指向 option_event，数据不同源）。
- 退役分层：planner 运行时降权（stop/ignore/replan）仅作用于本次 plan_run，不改资产状态；资产级退役走 revoke（治理工具，arbiter 参与）——资产链记录永久 dormant 保留、Model 校准随资产 dormant、可选 declarative 索引，物理删除不存在；revoked 不因历史记忆重新加载。

---

## 十七、与后续 Phase 4–6 的关系

| 后续能力 | 对本方案的可选增强 | 不可替代的本方案能力 |
|---|---|---|
| Phase 4 多源解析 | 将解析结果作为受控候选和证据来源 | Markdown 摄入、文档投影、日常捕获和联合召回 |
| Planner | 决定何时请求记忆或提出维护任务 | 记忆授权、来源信任、上下文预算和冲突边界 |
| 共享 planner-runtime | 承载未来重型索引或整理任务 | 首版同步幂等、对账和文件版本一致性 |
| `memory_why` | 提供更完整的推导与决策解释 | Markdown 原文回链、版本状态和权限控制 |
| SuperAgent | 长期 Source 和 Ticket 后续输入 | OpenCode 对话中的即时记忆闭环 |
| dataStore | 大体量原始数据访问和批处理 | 精选投影与 facts 引用，不全量复制原始数据 |

P4-6 已将 capture/revise 和 Recall 外部 Markdown 刷新注册为受控 Option，复用同一核心契约和治理边界，没有另建记忆逻辑。capture/revise 的默认目标仍是 data 投影，chunk 直接作为可选事实来源，不增加 FactCandidate 持久层；Recall 读取本身不伪造执行事件。Bridge 技术操作日志不得演变为第二个 plan_run 或持续任务队列。验收见 `docs/phase4-memory-stomp-acceptance.md`。

---

## 十八、发布策略与待批准决策

### 18.1 推荐默认策略

- 默认只读索引，用户显式捕获，模型候选人工批准后应用；
- B1 只交付摄入治理，B2 才承诺日常记忆最小闭环；
- V1 首版使用显式召回，V2 自动召回在 B2 验收后启用；
- compaction 自动捕获默认关闭；
- 自动修改 `AGENTS.md` 每次需要显式批准；
- 不自动提交 Git、不删除笔记、不批量迁移旧库；
- 先证明关键词 Recall 的价值，再决定真实向量和自动化的投入。

### 18.2 实施前需确认

1. 已批准按 P4-1M → P5-4 → P6-4 纳入现有 16 周 MVP；仅需确认各 Phase 验收人，不再按 Phase 后独立模块处理；
2. 首批允许读取的 Markdown 根目录及排除清单；
3. Core-owned captured note 的保存位置和 namespace；
4. B0 使用的匿名化 fixture 和召回质量阈值；
5. V1 是否只需显式工具，V2 是否作为自动召回的主要目标版本；
6. 中文索引与可选向量方案的基准结果及数据外发约束；
7. `memory-bridge v0.1` 的独立验收人和发布边界。

---

## 十九、首期最小交付切片

### 19.1 若只批准摄入切片

1. 一个只读 Markdown 根目录、一个隔离 MemoryCore 实例；
2. `parse_markdown_note`、DocumentProjection、FactCandidate、source link 和哈希防重；
3. ν 门写入、固定只读查询和 `mapping_stale`；
4. 敏感路径排除、原文不变和索引重建；
5. 原七工具与当前全量回归。

该切片只证明“日常数据可以进入原五层架构并被治理”，不解决后续对话自动想起。

### 19.2 若批准 OpenCode 日常记忆最小闭环

在摄入切片上继续增加：

1. 显式 `bridge_capture` 和重复捕获防重；
2. 关键词 `memory_recall`、Top-K、token 预算和状态裁注；
3. `bridge_recall`、人工静态入口和 V2 自动注入；
4. 用户修订入口及下一次召回生效；
5. 两个真实新会话：项目决策跨会话召回、Markdown 实验报告与 S01 有效事实联合召回；
6. message 级防重、跨项目隔离、恶意记忆和重启保留验收。

该切片不包含向量服务、自动 compaction、双向写回、全库语义去重、持续 Planner、后台任务、直接读取裁注、Skill 自动演进或 SuperAgent，但能够验证最小核心价值：**让后续对话在正确时机使用正确版本的记忆，同时保持指令、原文和结构化事实各自的权威边界。**
