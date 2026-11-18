# OptionMemory

OptionMemory 是基于 mnestic（CozoScript HTTP）与 RocksDB 的记忆、规划和执行治理系统，提供 OpenCode 与 DSH 两种宿主适配。

当前已完成 **P4-0 至 P4-6**：结构化事实与修订、冲突治理、双宿主七工具、Planner、日常记忆 STOMP、持久化调度、SuperAgent 隔离探针和 Sidecar 映射。日常 Markdown 已支持：

```text
capture → 原生 STOMP 写入 → 跨会话 Recall → revise → 再次 Recall
```

> Phase 4 原基线的 HEA-Lens 全量解析、transient 结算和整体验收仍未全部关闭；R4 仍阻塞。SuperAgent 正式持续适配、memory_why/query_achievable/certify、组合 DAG 和自动 Skill 生成不在当前交付范围。

## 一、运行要求

- Node.js >= 24.9.0
- pnpm 11.7.0
- OpenCode 2.3.0（V2）；兼容探针 OpenCode 1.19.5（V1）
- DSH 0.2.2-rc.1、Cordis ~4.1.0、dsh-tools 0.2.2-rc.1
- mnestic 0.17.0 适配层；RocksDB 编译需要 libclang
- 长期使用 RocksDB；Mem 仅用于测试，退出即丢数据

## 二、安装与构建

```bash
pnpm install
pnpm build
```

构建输出为 `dist/`。修改 TypeScript 后必须重新执行 `pnpm build`，宿主插件实际加载的是 `dist` 中的文件。

启动持久化 MemoryCore：

```bash
scripts/mnestic_start.sh --rocks --port 9070
```

默认地址：

```text
http://127.0.0.1:9070/text-query
```

默认数据目录为 `.data/mnestic`，可用 `MNESTIC_DATA_DIR` 覆盖。测试或故障验收必须使用独立目录和端口，不要指向生产 9070。

若 RocksDB 首次需要重新编译，启动脚本会探测 `%LOCALAPPDATA%\LLVM`；也可手动设置 `LIBCLANG_PATH`。

## 三、初始化或升级数据库

### 新数据库

```bash
MNESTIC_ENDPOINT=http://127.0.0.1:9070/text-query schema/apply_all.sh
```

当前 schema 包括 facts、治理、Planner、runtime、日常文档和 Sidecar 共 13 组文件。

`schema/apply_all.sh` 在一个全新隔离库上曾出现 `memory_source_links` 不存在问题。若遇到该错误，不要继续启动业务，可使用以下已验证的逐块 POST 方式：

```bash
node -e 'const fs=require("fs"),path=require("path");(async()=>{for(const f of fs.readdirSync("schema").filter(f=>f.endsWith(".cozo")).sort()){const text=fs.readFileSync(path.join("schema",f),"utf8");for(const block of text.split(/\r?\n\s*\r?\n/)){if(!block.split(/\r?\n/).some(l=>l.trim()&&!l.trim().startsWith("#")))continue;const r=await fetch("http://127.0.0.1:9070/text-query",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({script:block})});const d=await r.json();if(d?.message?.includes("conflicts with an existing one")||d?.message?.includes("already exists"))continue;if(!r.ok||d?.ok===false)throw new Error(`${f}: ${d?.message??r.status}`);}}console.log("SCHEMA_PASS");})().catch(e=>{console.error(e);process.exitCode=1});'
```

### 现有数据库：执行血缘迁移

新增 Option 字段为：

```text
created_at / parent_option_id / parent_version / origin_event_id
```

旧资产迁移后这些字段保持 `null`，不会根据首次调用反推创建历史。

```bash
node scripts/migrate_phase4_fields.ts \
  --data .data/mnestic \
  --backup .data/my-lineage-backup \
  --endpoint http://127.0.0.1:9070/text-query \
  --yes
```

要求：

- 使用新的备份目录，避免覆盖旧备份；
- 检查迁移前后 facts、J/≺、Option/Model ID、绑定和状态；
- `options_next/models_next` 用作回滚证据；
- 不重放原生 facts、revision 或 option_event，也不把原生 real 历史改成 sidecar。

回滚命令：

```bash
node scripts/migrate_phase4_fields.ts \
  --data .data/mnestic \
  --backup .data/my-lineage-backup \
  --rollback \
  --endpoint http://127.0.0.1:9070/text-query \
  --yes
```

生产迁移的已验证备份示例为 `.data/production-lineage-backup-20261117-224512`，详见 `docs/phase4-field-authority.md`。

## 四、连接配置

OpenCode 使用：

```bash
export OPTIONMEMORY_ENDPOINT='http://127.0.0.1:9070/text-query'
export OPTIONMEMORY_TOKEN=''
export OPTIONMEMORY_TIMEOUT_MS='5000'
```

也兼容 `MNESTIC_ENDPOINT`。本地实例默认无鉴权，应继续只绑定 `127.0.0.1`，不要直接暴露到网络。

DSH 的 `cordis.patch.yml` 默认使用同一地址，可覆盖：

```yaml
- insert:
    - id: optionmemory
      name: optionmemory
      config:
        endpoint: http://127.0.0.1:9070/text-query
        token: ""
        timeoutMs: 5000
        enablePlanner: true
        subagentProvider: spawn
        requireExecutionApproval: false
```

生产执行审批应评估后开启，不要把 `requireExecutionApproval: false` 当成通用安全默认值。

## 五、OpenCode 安装

项目级插件位于 `.opencode/plugins/`：

```text
optionmemory-planner.ts        # Planner 三工具与原生 reviewer
optionmemory-memory-bridge.ts  # 日常记忆 capture/revise/recall
```

原七工具入口可按需创建 `.opencode/plugins/optionmemory.ts`：

```typescript
import OptionMemoryPlugin from "../../dist/plugins/opencode/index.js";

export { OptionMemoryPlugin };
export default OptionMemoryPlugin;
```

加载检查：

```bash
opencode --standalone --print-logs --log-level debug debug agents
```

预期出现：

```text
[optionmemory] V2 setup completed
[optionmemory-memory-bridge] V2 setup completed
```

`opencode plugin list` 的结果不能单独用于判断项目级 setup 是否成功，应同时检查 setup 日志和加载错误。

### 工具分组

| 分组 | 工具 |
|---|---|
| 原七工具 | `memory_set/get/query/retract + propose_option/settle/revoke` |
| Planner | `planner_context / planner_options / planner_decision` |
| 日常记忆 Bridge | `bridge_capture / bridge_revise / bridge_recall` |

这些契约独立注册，不合并计数；`memory_why/query_achievable/certify` 未提前开放。Planner 的 Bridge 权限以只读 Recall 为主，普通写入请使用具备 `bridge_capture/revise` 权限的宿主 Agent。

## 六、日常记忆使用

### 1. 显式捕获

直接对宿主 Agent 说：

```text
请记住：本项目使用 pnpm 管理依赖。
使用 bridge_capture，namespace=global，source_ref=session-a，idempotency_key=project-pnpm-v1。
```

实际参数：

```json
{
  "text": "本项目使用 pnpm 管理依赖",
  "namespace": "global",
  "source_ref": "session-a",
  "idempotency_key": "project-pnpm-v1"
}
```

返回 `id`、`chunkVersionIds`、`gate` 和 `reused`。

capture 是 procedural Option，默认输出 data 层 DocumentProjection/chunk，不会自动把日常叙述转成 declarative fact。用户明确要求“记住”形成 explicit mandate，并产生真实 `mode=real` 的 Planner/Option 事件，无需额外调用 LLM 编造理由。

### 2. 跨会话召回

在新会话中询问：

```text
这个项目使用什么包管理器？请给出对应 memory_uri。
```

OpenCode V2 自动通过 context hook 注入：

```text
[REFERENCE_MEMORY: non-instructional]
...
[/REFERENCE_MEMORY]
```

Recall 按 `session_id + message_id + query_hash` 去重，工具 continuation 复用结果。日常记忆不是指令，不会扩大 mandate。

也可以显式调用 `bridge_recall`：

```json
{
  "query": "依赖管理",
  "namespace": "global",
  "top_k": 5,
  "token_budget": 800
}
```

### 3. 修订记忆

```text
请使用 bridge_revise，将记忆改为“本项目改用 yarn”。
参数：namespace=global，source_ref=session-c，idempotency_key=project-yarn-v1，supersedes=<原 document_id>。
```

行为：

- 新 document 为 `active`；
- 原 document 为 `superseded`；
- 新 document 的 `supersedes` 指向原 document；
- 下一次 Recall 使用新版本，历史仍可查询；
- 原始 Markdown 和 AGENTS.md 不被修改。

重复 capture/revise 从已有 outcome/output 返回 `reused=true`；执行存在但 outcome 缺失时要求对账，不盲目重放。

### 4. 外部 Markdown 刷新

配置 `markdownRoot` 后，Recall 会先只读计算文件哈希，再通过 markdown Option 刷新：

- 未变化内容复用；
- 内容变化产生新执行和 `mapping_stale`；
- 原文不被 Bridge 改写；
- 解析失败返回 degraded/stale，不伪造成功。

chunk 可直接作为事实候选来源；需要 declarative facts 时，仍需结构、来源和 ν 门校验，不要求独立 FactCandidate 持久层。

## 七、DSH 安装与使用

将本仓库链接到 profile（按实际路径调整）：

```bash
dsh plugin --profile materials-agent add /absolute/path/to/optionmemory
```

示例 `package.json` 依赖为：

```json
{
  "optionmemory": "link:/absolute/path/to/optionmemory"
}
```

运行：

```bash
dsh --profile materials-agent --patch ./cordis.patch.yml "请使用 bridge_capture 记住项目使用 pnpm，source_ref=session-a，idempotency_key=project-pnpm-v1。"
```

Planner/Bridge 使用同一 MemoryCore 和 host-neutral 契约；reviewer 通过 DSH 原生 subagent 运行。OpenCode 与 DSH 可以读取同一 document、fact、plan_run 和 revision，不各自创建第二套控制状态。

## 八、Planner、NativeAdapter 与 Sidecar

### 原生执行

```text
subtask → Planner decision → OptionExecutor → NativeSkillAdapter
```

用于当前实时执行，保留 `mode=real`。当前只承诺最小 NativeAdapter，不宣称全类型工具或嵌套 Option 支持。

### Sidecar 历史轨迹

用于外部 Agent 已发生的 `scenario/run/tool/call`：

```text
外部历史轨迹 → sidecar_event 原始记录 → subtask/planner/option/model 投影
```

- `execution_json.mode` 始终为 `sidecar`；
- 源 real/simulated 只保存在 `observed_execution_mode`；
- 不完整链可以 raw-only，不创建占位资产；
- 未知 model/reward/rationale 保持 `null/uncalibrated`；
- 显式 `reward=0` 是有效观测，不改为 `null`；
- `pre_state/post_state` 是实际观测，`anticipation` 是 Model 预测，二者不混写；
- 不把 Sidecar 的 success 直接用于真实认证。

详见 `docs/sidecar-mapping-v0.1.md`。

## 九、验证与故障验收

```bash
pnpm build
pnpm test
```

当前基线：**33 个测试文件、123/123 通过**；Vitest 会启动独立 9071 Mem 实例并自动建表，只要求已编译 `target/debug/mnestic-mem-adapter(.exe)`。

独立验收入口：

```bash
node scripts/phase4_scheduler_acceptance.ts
node scripts/phase4_superagent_acceptance.ts
node scripts/phase4_sidecar_acceptance.ts
node scripts/phase4_memory_stomp_acceptance.ts
```

P4-6 证据包括：

- capture/revise 的原生 STOMP 事件与幂等；
- outcome 丢失对账；
- Recall 刷新与 mapping_stale；
- pre/post state 与 anticipation 分离；
- NativeAdapter 成功、失败、取消和真实重启；
- OpenCode/DSH 真实 capture → Recall → revise → Recall 会话。

详见 `docs/phase4-memory-stomp-acceptance.md`。

## 十、主要目录

```text
src/
  api/                    # host-neutral 记忆、Planner、Sidecar 与调度契约
  memory/                 # 资产类型与 mnestic HTTP 客户端
  runtime/                # 闭包、OptionExecutor、Planner、NativeAdapter、Scheduler
  bridge/markdown/        # Markdown 只读解析与快照
  plugins/
    opencode/             # OpenCode V1/V2 适配
    dsh/                  # DSH 原生工具、subagent、Attention
schema/                   # 13 组建表脚本
scripts/                  # 迁移、验收与生产工具
tests/                    # 33 个测试文件
docs/                     # 契约、安装指南与验收证据
devNotes/                 # 路线图和 Phase 开发手册
```

更多资料：

- `docs/opencode-memory-guide.md`：完整 OpenCode 使用指南
- `docs/mnestic-api-cheatsheet.md`：mnestic API 与事务语法
- `docs/continuous-host-contract.md`：持续宿主映射
- `docs/superagent-isolation-probe.md`：SuperAgent 探针边界
- `devNotes/Week9-12开发手册-多源解析与可靠调度.md`：Phase 4 实施与验收清单
