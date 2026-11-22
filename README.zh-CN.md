---
lang: zh-CN
canonical: README.md
translation_status: original-source
source_commit: 7c71289
reviewed_at: 2026-11-19
---

# OptionMemory

[English](README.md) · [双语协作规范](docs/i18n.md)

OptionMemory 是基于 mnestic + RocksDB 的记忆与执行治理系统，支持 OpenCode 和 DSH。

推荐先体验日常记忆：

```text
记住一个项目决策 → 新会话自动想起 → 修正记忆 → 再次召回新版本
```

## 一、准备环境

需要：

- Node.js >= 24.9.0
- pnpm 11.7.0
- OpenCode 2.3.0，或 DSH 0.2.2-rc.1
- 长期使用 RocksDB；Mem 仅用于测试

## 二、三步启动

### 1. 安装并构建

```bash
pnpm install
pnpm build
```

### 2. 启动 MemoryCore

```bash
scripts/mnestic_start.sh --rocks --port 9070
```

默认地址为 `http://127.0.0.1:9070/text-query`，默认数据目录为 `.data/mnestic`。

### 3. 初始化数据库

```bash
node scripts/apply_schema.ts
```

该命令按顺序建全 13 组关系，已存在的关系和索引会跳过，可重复执行。

> 修改 TypeScript 后必须重新执行 `pnpm build`，宿主实际加载的是 `dist/` 中的文件。

## 三、OpenCode：第一次使用

先进入仓库根目录（包含 `.opencode/` 和 `package.json` 的目录）：

```bash
cd /path/to/optionmemory
# 本仓库示例：cd E:\DSHprojects
```

仓库已包含 Planner 和日常记忆插件。在**会话 A** 中保存记忆：

```bash
opencode run --standalone --auto "请使用 bridge_capture 记住：本项目使用 pnpm 管理依赖。namespace=global，source_ref=session-a，idempotency_key=project-pnpm-v1。"
```

保持同一目录、endpoint 和 namespace，在**会话 B** 中重新执行一次 `opencode run`，然后询问：

```text
这个项目使用什么包管理器？请给出对应 memory_uri。
```

每次 `opencode run` 都会创建新会话，可以使用不同终端或进程，但**不要添加 `--continue`**，否则是在继续旧会话，不能证明跨会话召回。

OpenCode 会自动召回之前保存的内容，并将它作为非指令参考注入。

修订记忆：

```text
请使用 bridge_revise，将刚才的记忆改为“本项目改用 yarn”。
supersedes 使用刚才返回的 document_id，idempotency_key 使用 project-yarn-v1。
```

再次询问后，应得到 **yarn** 和新 memory_uri；旧版本仍保留为 `superseded`，不会修改原始 Markdown 或 AGENTS.md。

### 配置

默认连接 9070，无需额外配置。需要修改地址时：

```bash
export OPTIONMEMORY_ENDPOINT='http://127.0.0.1:9070/text-query'
```

运行时消息默认保持原有语言。需要简体中文时设置：

```bash
export OPTIONMEMORY_LOCALE='zh-CN'
```

机器标识与状态不变。双语规范及真实双宿主验收见 `docs/i18n.md` 与 `docs/bilingual-acceptance.md`。

需要检查插件加载时：

```bash
opencode --standalone --print-logs --log-level debug debug agents
```

原七工具、Planner 和 Bridge 是独立工具组，详见 `docs/opencode-memory-guide.md`。

## 四、DSH：第一次使用

先将本仓库链接到 profile（按实际路径调整）：

```bash
dsh plugin --profile materials-agent add /absolute/path/to/optionmemory
```

运行：

```bash
dsh --profile materials-agent --patch ./cordis.patch.yml "请使用 bridge_capture 记住：本项目使用 pnpm。namespace=global，source_ref=session-a，idempotency_key=project-pnpm-v1。"
```

后续可分别使用 `bridge_recall` 和 `bridge_revise` 查询、修订同一记忆。OpenCode 与 DSH 可以共享同一 MemoryCore 和 document/revision。

## 五、已有数据库升级

已有旧版 RocksDB 时，先使用新的备份目录，再执行血缘迁移：

```bash
node scripts/migrate_phase4_fields.ts \
  --data .data/mnestic \
  --backup .data/my-lineage-backup \
  --endpoint http://127.0.0.1:9070/text-query \
  --yes
```

新增的 Option 创建血缘字段在旧资产中保持 `null`，不会根据调用记录反推。迁移前后请核对 Option/Model ID、绑定、facts、J/≺ 和状态。

回滚时使用同一命令并增加 `--rollback`。详见 `docs/phase4-field-authority.md`。

## 六、验证安装

```bash
pnpm test
```

当前基线为 **37 个测试文件、135/135 通过**，测试使用独立实例，不需要启动生产 9070。

Phase 4 CSV 全量、闭包/J、transient 结算与 RocksDB 重启验收：

```bash
node scripts/phase4_csv_acceptance.ts
```

日常记忆完整故障与恢复验收：

```bash
node scripts/phase4_memory_stomp_acceptance.ts
```

Phase 4 原基线、P4-0–P4-6、v0.2.0 真实双 host 与升级保留证据见 `docs/phase4-acceptance.md`；日常记忆专项证据见 `docs/phase4-memory-stomp-acceptance.md`。

## 七、日常 Markdown 使用案例

> 以下 pnpm/yarn 仅用于演示记忆捕获、召回和修订。本仓库继续使用 pnpm 与 `pnpm-lock.yaml`，不需要执行包管理器迁移。

### 案例 1：跨会话记住项目决策

`notes/project.md`：

```markdown
# 项目决策

2026-11-17：本项目使用 pnpm 管理依赖，避免混用 npm。
```

在会话 A 中说：

```text
请记住这条项目决策，namespace=global，source_ref=session-a，idempotency_key=project-pnpm-v1。
```

在会话 B 中问：

```text
这个项目应该使用哪个包管理器？请给出记忆来源。
```

预期回答为 **pnpm**，并附带对应 memory_uri。Agent 不需要重新打开 `notes/project.md`。

**自学习扩展（规划中）：** 当多个真实任务复用同一项目决策时，dataStore 可以把任务签名与证据映射为观察上下文，Learning Planner 随后提出 subtask + Option + Model 候选束，并在后续任务中评估。该决策仍只是非指令性证据，不会自动成为用户偏好或 `AGENTS.md` 指令。

### 案例 2：实验记录更新后使用新值

Bridge 三工具（capture/revise/recall）不直接读文件。外部 Markdown 必须先经受控解析 Option `memory_parse_markdown_note` 摄入；之后每次 Recall 都会先重读文件并校验内容哈希，文件变化时自动产生新版本。完整流程如下。

#### 1. 配置 markdownRoot

在仓库根目录的 `opencode.json` 中，把 memory-bridge 插件连同选项一起声明（`plugin` 字段支持 `["路径", 选项]` 元组）：

```json
{
  "plugin": [
    [
      "./.opencode/plugins/optionmemory-memory-bridge.ts",
      { "markdownRoot": "notes", "namespace": "project:s01" }
    ]
  ]
}
```

- `markdownRoot`：允许读取的 Markdown 根目录。配置后 `bridge_recall` 和会话自动注入都会携带 `markdown_root`，Recall 时据此刷新已摄入的外部文档；相对路径按 opencode 启动目录（通常是仓库根）解析，也可填绝对路径。不配置则只召回已保存的投影，不刷新文件。
- `namespace`：bridge 工具与自动注入的默认 namespace，建议按项目隔离（如 `project:s01`）。

#### 2. 准备实验记录

`notes/S01.md`：

```markdown
# S01 实验记录

S01 的硬度为 512 HV。
```

#### 3. 首次摄入（受控 parse Option）

首次摄入不是 Bridge 工具，而是受控 atomic Option（`pi_type=parse`，`pi_ref=markdown-note@v1`），会自动注册 Option/Model 并形成真实 execute decision。仓库最小方式是保存一个临时脚本调用构建产物（默认连 9070，可用 `OPTIONMEMORY_ENDPOINT` 覆盖）：

```js
// scripts/ingest_note.cjs —— 用法：node scripts/ingest_note.cjs <path> <idempotency_key>
const { executeMemoryWrite } = require("../dist/api/memory-write-options.js");
const [path, idempotencyKey] = process.argv.slice(2);

executeMemoryWrite({
  operation: "parse",
  host_type: "opencode",
  namespace: "project:s01",
  source_ref: path,
  idempotency_key: idempotencyKey,
  arguments: { path, root: "notes", namespace: "project:s01" },
}).then((result) => console.log(JSON.stringify(result, null, 2)));
```

```bash
node scripts/ingest_note.cjs S01.md s01-note-v1
```

返回 `gate=pass` 及 `document_id`、`chunk_version_ids`、`content_hash`。解析器只读：校验根目录与符号链接，拒绝路径穿越及 `.git/.data/node_modules/dist/target/backups` 等排除目录，不写回原文。

#### 4. 召回

新会话中询问“S01 的硬度是多少”（自动注入），或显式调用：

```json
{ "query": "S01 硬度", "namespace": "project:s01" }
```

返回 512 HV 及对应 `md://<document_id>#<chunk_version_id>`。

#### 5. 更新记录并再次召回

手动把文件改为：

```markdown
# S01 实验记录

S01 的硬度复核为 450 HV。
```

下一次 Recall（自动注入或显式调用，需已配置 `markdownRoot`）会先重读文件并计算内容哈希：未变化则幂等复用既有解析；变化则经同一 parse Option 产生新执行（幂等键 `recall-refresh:<document_id>:<content_hash>`），新 chunk 生效，旧 chunk 标为 `mapping_stale`，默认 `allow_history=false` 不再返回旧值。Bridge 全程不修改你的 Markdown。

#### 6. 边界

如果还存在独立的 `hardness(S01, "512 HV")` declarative fact，文档更新不会自动把它改成 450 HV；事实修订仍需原 revision/retract 与证据治理，不能仅凭一段文字覆盖。

**自学习扩展（规划中）：** 512→450 的变化可形成 Model 的状态迁移证据，包括 pre_state、预期/实际 post_state 和不变量（解析器不写回源文件、不得静默改写事实）。来源变化可触发已学习 Option 的重新评估或 drift 处理，但独立 declarative facts 仍必须走原 revision/ν 门路径。

### 案例 3：历史实验笔记与当前规则不一致

#### 1. 配置

`opencode.json` 的 `markdownRoot` 与 `namespace` 配置同案例 2，保证 Recall 能同时命中多份已摄入笔记。

#### 2. 准备当前规则与历史笔记

当前复核结论 `notes/S01-review.md`：

```markdown
# S01 复核结论（2026-11-18）

S01 硬度统一按 450 HV 记录；2025 年的 512 HV 旧测值作废，仅作背景。
```

历史实验笔记 `notes/archive/2025-hardness.md`：

```markdown
# 2025 年硬度记录

2025-03：S01 的硬度为 512 HV。
```

并自行在 `AGENTS.md` 中维护当前规则（不要让模型代改），例如：

```markdown
S01 硬度按 notes/S01-review.md 的复核值记录。
```

#### 3. 分别摄入

两份文件各执行一次受控 parse（不同 `idempotency_key`，复用案例 2 的脚本）：

```bash
node scripts/ingest_note.cjs S01-review.md s01-review-v1
node scripts/ingest_note.cjs archive/2025-hardness.md s01-hardness-2025-v1
```

#### 4. 查询与预期行为

询问“S01 现在应使用什么硬度值”：

- Recall 同时命中当前复核 chunk 与历史 chunk，各自带 `memory_uri` 与状态；
- 当前 `AGENTS.md` 与复核结论优先，历史笔记只作为非指令背景；
- 如果历史笔记没有明确标注失效，Recall 会保留来源和冲突提示，而不是静默选择一条说法；
- 系统不会因为召回旧笔记就改回 512 HV，也不会自动改写历史记录或 `AGENTS.md`。

#### 5. 让旧值明确失效

- 叙述层面：像本例一样在复核记录中写明“旧测值作废”，历史原文保留不动；
- 结构化层面：若存在 `hardness(S01, ...)` declarative fact，用原治理路径（revision/retract 与证据）修订，不靠覆盖文字。

**自学习扩展（规划中）：** 矛盾证据应触发候选束的重新评估、修订或撤销，而不是强化原结论。历史笔记继续作为权威原文，Model 使用新的留出证据判断当前 active_release 是否仍适用。

### 案例 4：OpenCode 与 DSH 协同修订

在 OpenCode 中保存：

```text
本项目使用 pnpm，namespace=global，source_ref=session-a，idempotency_key=project-pnpm-v1。
```

在 DSH 中使用 `bridge_recall` 查询，会读到同一份 pnpm 记忆和 memory_uri。确认后，在 DSH 中修订：

```text
请使用 bridge_revise，将本项目改为 yarn。
supersedes 使用刚才的 document_id，namespace=global，idempotency_key=project-yarn-v1。
```

回到 OpenCode 新会话再次询问，应得到 **yarn** 和新 memory_uri。两个宿主共享同一 document 和 superseding 链，不会各自复制一份记忆。

**自学习扩展（规划中）：** 跨宿主学习只能通过原生 real STOMP 证据和稳定的来源/修订 ID 继续。DSH 的修订可作为 OpenCode 后续评估的留出证据，不复制记忆，也不改变证据模式。Sidecar 历史始终独立，不能单独用于认证候选束。

### 案例 5（规划中）：从现有 Skill 走向被动自学习

> 这是未来扩展，不是已验收的当前能力。上述案例 1–4 是已验收工作流；本案例展示如何在无种子任务的情况下，让现有 `pdf-to-latex` Skill 成为自学习 MVP。

从普通使用开始，而不是安排特殊训练任务：

1. **正常使用 Skill。** 通过现有 `pdf-to-latex` Skill 转换 `alpha.pdf`，不创建人造种子任务。STOMP 记录真实的 subtask/plan_run/execute decision、实现版本、观察结果、结果与前后状态。
2. **映射证据。** dataStore 将 PDF 与 Skill 包的哈希、任务签名、namespace、pre_state 和证据模式映射为 S7 EvidenceEnvelope。这里只建立观察上下文；安装 Skill 或一次成功转换不等于已经学会该能力。
3. **积累兼容证据。** 按同一正常流程转换 `beta.pdf` 等其他文档，比较结构与不变量：唯一输出、原始 PDF 不变、预期编码、没有越权写入。不从单次观察泛化，也不补造缺失状态。
4. **证据充分后才提出候选束。** 两个兼容的原生 real 观察之后，Learning Planner 才可提出完整 subtask + Option + Model 候选束。Option 使用有边界的实现模板；Model 包含预期后置条件、不变量与评估要求，`approval_ref` 保持 `null`。
5. **独立评估。** 将后续自然出现的 `gamma.pdf` 或经批准的隔离运行作为留出证据，记录 S8 LearningRun，包含预期/实际 post_state、独立证据和 `generator_score=null`。
6. **治理结果。** 只有经过审批与合规的 real 评估，注册门才可接纳候选束，后续 Planner 决策才能选择已发布 Option。来源结构变化或矛盾结果触发重新评估、修订或撤销，而不是强化原结论。

规划边界：不任意生成实现、不自动修改 `AGENTS.md`、不直接写入 mnestic、不把 sidecar 当作 real 证据，也不因 Skill 已存在就声称它已学习或已认证。

## 八、当前边界

- Phase 4 原基线、HEA-Lens 全量解析、transient 结算、v0.2.0 双 host 升级与整体验收已关闭，见 `docs/phase4-acceptance.md`；Phase 1 的 R4 仍阻塞。
- 当前提供最小 NativeAdapter；不承诺全类型工具、嵌套 Option 或自动 Skill 生成。
- 外部历史轨迹可通过 Sidecar 导入，统一标记为 `mode=sidecar`，不与原生 real 证据混用，详见 `docs/sidecar-mapping-v0.1.md`。
- SuperAgent 正式持续适配、memory_why/query_achievable/certify 和组合 DAG 尚未开放。

更多文档：

- `docs/opencode-memory-guide.md`：OpenCode 完整使用指南
- `docs/mnestic-api-cheatsheet.md`：mnestic 查询与事务语法
- `devNotes/Week9-12开发手册-多源解析与可靠调度.md`：Phase 4 实施与验收清单
