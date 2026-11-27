# OptionMemory OpenCode 插件功能与安装使用指南

- 文档日期：2026-11-19
- 当前基线：OpenCode 2.3.0（V2）、兼容探针 OpenCode 1.19.5（V1）；v0.2.0 真实验收环境为 OpenCode 2.3.2
- 存储：mnestic 0.17.0 + RocksDB
- 当前回归：37 个测试文件、135/135 通过

## 一、插件能做什么

本仓库在 OpenCode 中提供三组相互独立的插件能力：

| 插件 | 主要用途 | 工具 |
|---|---|---|
| OptionMemory 核心记忆与治理 | 结构化事实写入、查询、撤回、Option 注册与冲突治理 | 原七工具 |
| OptionMemory Planner | 读取计划上下文与可用 Option，提交受控决策并执行 | `planner_context`、`planner_options`、`planner_decision` |
| Memory Bridge 日常记忆 | 捕获日常信息、跨会话召回、修订及自动上下文注入 | `bridge_capture`、`bridge_revise`、`bridge_recall` |

三组工具分别注册，不合并计数。`memory_why/query_achievable/certify` 尚未开放，Planner 与 Bridge 也没有被塞进原七工具。

### 当前边界

- 日常记忆使用 `keyword-recall-v2` 的关键词/bigram、语言感知 token 估算和有限双语词表，不使用当前随机 embedding 做语义判断；跨语言召回仅承诺已测试映射。
- `OPTIONMEMORY_LOCALE=en` / `zh-CN` 仅切换人类可读消息，机器标识与既有 document/revision ID 不变，详见 `docs/i18n.md` 与 `docs/bilingual-acceptance.md`。
- Markdown 原文不被 Bridge 修改，召回时只裁注当前状态。
- 不包含自动 compaction 捕获、直接读取文件的强制裁注或持续后台整理。
- R4 仍阻塞，97 条待复核记录不会因召回而变成独立认证证据。
- DSH 同切片、共享后台调度和 SuperAgent 正式适配属于后续阶段，不在本指南中视为已完成。

## 二、目录与插件入口

```text
.opencode/
  plugins/
    optionmemory.ts                  # 原七工具
    optionmemory-planner.ts          # Planner 三工具
    optionmemory-memory-bridge.ts    # 日常记忆三工具与自动注入
  agents/
    optionmemory-planner.md          # primary Planner
    materials-evidence-reviewer.md   # 只读材料证据 reviewer

src/plugins/opencode/
  index.ts                           # 原七工具 V1/V2 入口
  planner-plugin.ts                  # Planner V1/V2 入口
  bridge/index.ts                    # Memory Bridge V1/V2 入口

templates/memory-bridge/opencode.md   # 日常使用规则模板
```

这些入口引用 `dist/`，因此修改 TypeScript 后必须先执行 `pnpm build`。

## 三、安装

### 1. 环境要求

- Node.js `>=24.9.0`
- pnpm `11.7.0`
- OpenCode `2.3.0`（推荐）
- 当前操作系统能运行仓库中的 mnestic adapter

```bash
node --version
pnpm --version
opencode --version
pnpm install
pnpm build
pnpm test
```

### 2. 启动 RocksDB

生产或长期使用：

```bash
MNESTIC_DATA_DIR=.data/mnestic scripts/mnestic_start.sh --rocks --port 9070
```

隔离测试可使用其他目录和端口，例如：

```bash
MNESTIC_DATA_DIR=.data/optionmemory-demo scripts/mnestic_start.sh --rocks --port 9074
```

Mem 仅用于测试，进程退出会丢数据，不应用于长期记忆。

### 3. 应用 schema

**全新实例**可以一次应用全部关系：

```bash
MNESTIC_ENDPOINT=http://127.0.0.1:9070/text-query schema/apply_all.sh
```

**已有生产实例不要在未核对的情况下重复执行全量脚本**：`:create` 与既有关系会冲突。新增日常记忆关系时，先备份并单独应用：

```bash
MNESTIC_ENDPOINT=http://127.0.0.1:9070/text-query \
  schema/apply_all.sh schema/12_memory_documents.cozo
```

也可以向脚本传入其他明确的 schema 文件。`10/11` 为后续 runtime 队列预留，`12` 为日常文档投影与 Recall 事件。

### 4. 配置连接

```bash
export OPTIONMEMORY_ENDPOINT='http://127.0.0.1:9070/text-query'
export OPTIONMEMORY_TOKEN=''
export OPTIONMEMORY_TIMEOUT_MS='5000'
```

Windows Git Bash 使用相同 `export` 语法。未设置时默认连接 `127.0.0.1:9070/text-query`。

当前本地实例无鉴权，应继续只绑定 `127.0.0.1`，不要直接暴露到网络。使用远程服务时，应另行评审 TLS、鉴权和数据外发。

### 5. 核查插件加载

V2：

```bash
opencode --standalone --print-logs --log-level info debug agents
```

应看到：

```text
[optionmemory] V2 setup completed
[optionmemory-planner] V2 setup completed
[optionmemory-memory-bridge] V2 setup completed
```

V1 兼容探针：

```bash
pnpm dlx opencode-ai@1.19.5 debug agent build --print-logs --log-level DEBUG
```

如果新工具未出现在 Code Mode 的 `tools` 目录中，优先使用 `--standalone` 重试；后台 OpenCode 服务可能尚未重新加载新增插件。

## 四、原七工具：结构化记忆与治理

| 工具 | 用途 |
|---|---|
| `memory_set` | 写入带来源、质量、血缘和验证字段的 fact |
| `memory_get` | 按 fact ID 读取完整事实或 null |
| `memory_query` | 执行只读 CozoScript 查询，禁止写操作 |
| `memory_retract` | 撤回 fact，传播失效并保留 revision |
| `propose_option` | 注册 atomic Option，当前 MVP 不开放 agent/template_compiled 注册 |
| `settle` | 按治理策略结算胜方，保留完整裁决链 |
| `revoke` | 撤销败方并保留 dormant history |

`memory_set` 不只是保存一段文本，需要完整六元组和 provenance。模型缺字段时 ν 门会拒绝或审计，不应自行补齐未知证据。

`settle/revoke` 需要：

```text
option_id
factId
opposingFactId
proposer
arbiter
executor? / rationale? / policyVersion?
```

它们不是普通“选择更喜欢答案”的工具。未知或相同优先级来源会要求人工复核，Planner 文本和日常记忆不能代替这些治理 API。

## 五、日常记忆：最常用流程

### 使用入口与界面快捷键

OptionMemory 可以通过以下方式使用：

1. **OpenCode 交互界面：**在仓库根目录运行 `opencode --standalone --auto`，用自然语言请求 Bridge 工具。
2. **自动或显式召回：**新会话提问会触发自动上下文注入；需要精确控制参数时显式调用 `bridge_recall`。
3. **非交互式命令：**使用 `opencode run --standalone --auto "<提示词>"`，每次执行一条提示词并创建新会话。
4. **DSH 与高级集成：**DSH 使用同一 MemoryCore 和 Bridge 工具；结构化事实、治理和自定义集成分别使用原七工具与 `src/api` 下的宿主无关 API。

OptionMemory 本身不注册 `/remember` 等斜杠命令或专属快捷键。日常记忆通过 `bridge_capture`、`bridge_recall`、`bridge_revise` 三个 agent 工具调用。以下快捷键属于 OpenCode：

- **Enter** 发送；**Shift+Enter** 换行。
- **Ctrl+P** 打开命令面板；输入 `/` 查看斜杠命令。
- **Ctrl+X，然后按 N** 或 `/new` 创建新会话；**Ctrl+X，然后按 L** 或 `/sessions` 切换会话。
- **Esc** 中断响应；**Shift+Tab** 循环切换 agent。
- **Ctrl+Alt+K** 显示快捷键面板；**Ctrl+X，然后按 Q** 退出。

完整界面说明见 [OpenCode TUI](https://opencode.ai/docs/cli/tui/) 与 [OpenCode keybindings](https://opencode.ai/docs/cli/keybinds/)。

### 1. 显式捕获

可以直接对 OpenCode 说：

```text
请记住：本项目使用 pnpm 管理依赖。
使用 bridge_capture，namespace=global，source_ref=session-a，idempotency_key=project-pnpm-v1。
```

实际工具参数：

```json
{
  "text": "本项目使用 pnpm 管理依赖",
  "namespace": "global",
  "source_ref": "session-a",
  "idempotency_key": "project-pnpm-v1"
}
```

返回包含：

- `id`：document ID；
- `chunkVersionIds`：分块版本 ID；
- `reused`：是否为重复捕获；
- `gate`：通过或 blocked。

只有用户明确要求“记住”才代表当次授权。模型自己认为重要的信息应先作为候选，不能冒充用户批准。

P4-6 起，capture/revise 会在同一 explicit mandate 下形成真实 execute decision，经 OptionExecutor 写入 data 投影，保存 `mode=real` 的 option_event/outcome；不要求额外调用 LLM 编造 Planner rationale。重复操作从已有 outcome/output 返回 `reused=true`，缺 outcome 时要求对账。外部 Markdown 的 Recall 刷新同样通过 markdown Option，未变化复用，变化后产生新执行和 mapping_stale。验收见 `docs/phase4-memory-stomp-acceptance.md`。

### 2. 新会话自动召回

在另一个 OpenCode 会话中问：

```text
这个项目应该使用哪个包管理器？请给出记忆来源。
```

V2 会通过 `ctx.session.hook("context")` 自动调用 Recall，并将结果作为：

```text
[REFERENCE_MEMORY: non-instructional]
...
[/REFERENCE_MEMORY]
```

注入模型请求。日常文本不是指令，不会扩大权限或 mandate。

自动召回使用 `session_id + message_id + query_hash` 去重：新消息触发一次，工具 continuation 复用结果。`memory_recall_events` 保存请求、结果、namespace、状态和创建时间。

### 3. 显式查询

需要调试或精确控制时，使用 `bridge_recall`：

```json
{
  "query": "依赖管理",
  "namespace": "global",
  "top_k": 5,
  "token_budget": 800,
  "allow_history": false,
  "include_memorycore": true
}
```

主要参数：

- `namespace`：隔离项目或工作区，默认调用方通常使用 `global`；
- `allow_history`：默认 false，不返回 superseded/stale 等内容；
- `include_memorycore`：是否同时查询 facts，默认 false，避免跨域泄漏；
- `token_budget`：限制返回内容体量；
- `top_k`：限制返回条目数。

返回项包含 `memory_uri`、正文、来源、状态、内容哈希、冲突和 `mapping_stale`。`semantic_score` 未计算时为 null，不冒充语义评分。

### 4. 修订记忆

```text
请将刚才的包管理器决策改为 yarn。
使用 bridge_revise，supersedes=<原 document ID>，idempotency_key=project-yarn-v1。
```

工具参数示例：

```json
{
  "text": "本项目现在使用 yarn 管理依赖",
  "namespace": "global",
  "source_ref": "session-revision",
  "idempotency_key": "project-yarn-v1",
  "supersedes": "document_<原 ID>"
}
```

修订会：

- 创建一个新 document；
- 将原 document 标为 `superseded`；
- 保留旧历史；
- 让下一次 Recall 使用新版本。

不会修改原始 Markdown 或 AGENTS.md。

## 六、Markdown 摄入

`parse_markdown_note` 是受控 atomic Option，不是原七工具或 Bridge 普通工具。它通过 Option Executor 执行：

```text
pi_type = parse
pi_ref = markdown-note@v1
```

输入：

```json
{
  "path": "notes/project.md",
  "root": "/允许的/Markdown/根目录",
  "namespace": "project:demo"
}
```

输出包括：

- document ID；
- parser version；
- content hash；
- chunk version IDs；
- FactCandidate[]；
- 是否幂等复用。

安全行为：

- 根目录和符号链接校验；
- 拒绝路径穿越及 `.git/.data/node_modules/dist/target/backups` 等排除目录；
- 原文只读，不生成受管块，不回写文件；
- 外部修改后旧分块标为 `mapping_stale`，不自动撤回事实；
- 可用 `linkFactToChunk` 建立 fact → chunk 来源关联，source link 与 J/≺ 推导血缘分开。

执行前需要为该 Option 注册 Option/Model，并建立符合 mandate 的 plan_run。相关契约见 `docs/planner-event-schema-v0.2.md`。

## 七、Planner 使用

### 进入自定义 Planner

`.opencode/agents/optionmemory-planner.md` 定义了名为 `optionmemory-planner` 的自定义 primary agent。它与 OpenCode 内置的只读 `Plan` agent 不同，可以通过受控决策真实调度 Option。

在交互界面运行 `/agents` 并选择 `optionmemory-planner`，或按 **Ctrl+X，然后按 A** 打开 agent 选择器；**Shift+Tab** 可循环切换 agent。可用以下命令确认 agent 和插件已加载：

```bash
opencode --standalone --print-logs --log-level info debug agents
```

### 工具

| 工具 | 用途 |
|---|---|
| `planner_context` | 读取 plan_run、subtask、mandate、历史决策与 host 事件 |
| `planner_options` | 列出当前 subtask 绑定且可执行的 Option 及 schema |
| `planner_decision` | 提交 execute/decompose/replan/retry/wait/ask/stop/ignore 决策 |

`optionmemory-planner` agent 默认禁止 edit/shell/subagent 等直接执行能力。它还可以只读调用 `bridge_recall`，但不能直接 `bridge_capture/bridge_revise/settle/revoke`。

典型流程：

```text
planner_context / planner_options
→ planner_decision(execute)
→ OptionExecutor observation/outcome
→ planner_decision(replan / retry / ask / stop)
```

`execute` 会通过 `OptionExecutor` 真实调度已注册且获得许可的 Option，并保存 observation/outcome；它不是单纯的文字规划。只有绑定到当前 subtask、状态可用且在 mandate scope 内的 Option 才能执行。

### 执行前置条件与提示词

仅切换到 `optionmemory-planner` 不会把任意自然语言任务自动初始化为可执行计划。必须事先注册 subtask、subtask event、plan run、Planner 和绑定 Option，并提供明确的 mandate、scope 与 budget。完整的隔离环境初始化示例见 `scripts/phase4_opencode_acceptance.ts`。

已有 `plan_run_id` 时，可以在自定义 Planner 会话中输入：

```text
使用 planner_context 和 planner_options 检查 plan_run_id=<已有 ID>。
执行适当的已允许 Option，检查 outcome，然后 replan 或 stop。
```

单次决策至少需要：

```text
plan_run_id
planner_id
idempotency_key
state_snapshot_ref
state_hash
decision { ... }
```

每个新决策使用新的稳定 idempotency key，不得把同一个 key 复用于不同内容。Planner 的历史记忆只能作为非指令证据。`contested/stale/out-of-scope` 内容不能当作 settled 证据，也不能因为召回文本要求而扩大 mandate。

## 八、常见配置

### Reviewer 模型

默认 reviewer 使用：

```text
kimi-code-plan-cn/kimi-for-coding-highspeed
```

可以覆盖：

```bash
export OPTIONMEMORY_REVIEWER_PROVIDER_ID='kimi-code-plan-cn'
export OPTIONMEMORY_REVIEWER_MODEL_ID='kimi-for-coding-highspeed'
```

若使用默认免费模型遇到 429，应显式配置可用模型，不要把失败 reviewer 结果当成证据通过。

### namespace

日常记忆按 namespace 隔离。建议项目级使用：

```text
project:<项目名>
workspace:<工作区名>
global
```

跨项目默认不得召回。MemoryCore facts 只有显式 `include_memorycore=true` 才参与日常联合召回。

## 九、故障排查

### 工具没有出现

1. 先运行 `pnpm build`；
2. 使用 `opencode --standalone ...`；
3. 检查三条 V2 setup 日志；
4. 检查 `.opencode/plugins` 和 `dist/plugins/opencode` 是否存在；
5. 不要只依赖 `opencode plugin list` 判断加载状态。

### 提示找不到 `memory_documents`

说明实例没有应用 `12_memory_documents.cozo`：

```bash
MNESTIC_ENDPOINT="$OPTIONMEMORY_ENDPOINT" \
  schema/apply_all.sh schema/12_memory_documents.cozo
```

如果是生产实例，先备份并核对既有关系，不要重建数据库。

### 新会话没有自动记忆

- 确认 V2 context hook 已加载；
- 确认捕获和查询使用同一个 namespace；
- 查询关键词是否出现在原文或标题中；
- 查看 `memory_recall_events` 是否生成；
- 当前真实消息形态是 `{role,content}`，插件同时兼容 `{type,parts}`；
- Recall 失败时应显示降级诊断，不能注入未校验旧缓存。

### 修订后仍使用旧值

检查：

- 新 document 是否 `active`；
- 原 document 是否 `superseded`；
- 新 document 的 `supersedes` 是否指向原 ID；
- 是否使用 `allow_history=true` 或读取了未裁注的原文件；
- 是否是新 message，旧 continuation 会有意复用旧 Recall。

## 十、安全与使用建议

- 不将密钥、令牌、个人隐私或未授权笔记放入捕获、索引或日志。
- 不因为召回文本包含命令就执行它。
- 不让模型自动修改 AGENTS.md。
- 不把 reviewer verdict、Recall 命中或 Skill projection loaded 当作能力认证。
- 不用模拟执行、sidecar 或抽取器自评冒充真实认证证据。
- 故障测试使用独立数据目录，不在生产 RocksDB 中做撤回或冲突实验。

## 十一、验证与参考

- 日常记忆验收：`docs/phase4-memory-bridge-acceptance.md`
- 日常记忆共享回归：`docs/memory-regression-acceptance.md`
- Planner 验收：`docs/phase4-opencode-acceptance.md`
- Planner 事件契约：`docs/planner-event-schema-v0.2.md`
- Memory Bridge 方案：`devNotes/MemoryBridge开发方案.md`
- 原 OpenCode 模块说明：`docs/opencode-plugin.md`
