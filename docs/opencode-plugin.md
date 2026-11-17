# OpenCode 记忆模块

> 完整安装与使用说明见 `docs/opencode-memory-guide.md`，本文保留核心契约与实现细节。

本项目同时提供 DSH 与 OpenCode 两种 host 适配层。OpenCode 适配层复用 `src/api`、`src/memory`、`src/runtime`，不复制记忆、注册、门控、推导或治理逻辑。

官方机制：[OpenCode Plugins](https://opencode.ai/docs/plugins/)。当前实现使用 `@opencode-ai/plugin@1.19.5` 类型与 zod 工具 schema。

## 当前能力

当前 v0.1.0 模块暴露首版 7 个工具：

| 工具 | 用途 | 核心实现 |
|---|---|---|
| `memory_set` | 写入带六元组和质量/血缘字段的 fact | `src/api/memory.ts` |
| `memory_get` | 按 id 读取完整 Fact 或 null | `src/api/memory.ts` |
| `memory_query` | 执行只读 CozoScript 查询 | `src/api/memory.ts` + 共享只读防护 |
| `memory_retract` | 撤回 fact、传播失效并保留 revision | `src/api/revision.ts` |
| `propose_option` | 注册 atomic option | `src/api/registry.ts` |
| `settle` | 按来源优先级结算胜方并记录治理链 | `src/api/governance.ts` |
| `revoke` | 撤销败方并保留休眠历史 | `src/api/governance.ts` |

`memory_why`、`query_achievable`、`certify` 不提前暴露。两个 host 的 V1/V2 适配均通过 `src/api/tool-executor.ts` 调用同一服务层。

## 文件结构

```text
.opencode/plugins/optionmemory.ts   # OpenCode 项目级插件入口
src/api/tool-contracts.ts           # 单一工具契约与 JSON Schema 导出
src/api/tool-executor.ts            # 双 host 共享的参数校验与核心服务分发
src/api/readOnlyQuery.ts            # 双 host 共享只读防护
src/plugins/opencode/
  index.ts                         # Plugin 初始化、endpoint/token/timeout 注入
  tools.ts                         # V1 工具适配
  v2.ts                            # V2 JSON Schema 工具适配
```

OpenCode/Cordis 等框架依赖只能出现在各自适配层，不能进入 `src/memory`、`src/api`、`src/runtime`。zod 是共享契约的输入校验实现，不属于 host 专有依赖；OpenCode 不单独维护工具字段清单。

## 启动

```bash
pnpm install
pnpm build
scripts/mnestic_start.sh --rocks
```

长期使用应使用 RocksDB。Mem 仅用于测试，进程退出即丢数据。

默认连接：`http://127.0.0.1:9070/text-query`。可用环境变量覆盖：

```bash
export OPTIONMEMORY_ENDPOINT='http://127.0.0.1:9070/text-query'
export OPTIONMEMORY_TOKEN=''
export OPTIONMEMORY_TIMEOUT_MS='5000'
```

当前本地实例无鉴权，应继续只绑定 `127.0.0.1`，不要直接暴露到网络。

## 加载与核查

仓库已包含 `.opencode/plugins/optionmemory.ts`。默认导出同时提供 V1 `server()` 与 V2 `id/setup()`：V1 返回工具 hooks，V2 通过 `ctx.tool.transform` 和共享 JSON Schema 注册工具。

V1 使用 1.18.29+ 的对象入口 `server()`。可用隔离的 1.19.5 V1 CLI 检查实际 agent 工具注册：

```bash
pnpm dlx opencode-ai@1.19.5 debug agent build --print-logs --log-level DEBUG
```

2026-11-15 实测通过：resolved config 包含 `.opencode/plugins/optionmemory.ts`，agent 的 `tools` 中 `memory_set/get/query/retract`、`propose_option`、`settle`、`revoke` 全部为 `true`。V1 CLI 的 `plugin <module>` 子命令用于安装插件，不要用 `plugin list` 代替该加载检查。

V2 使用初始化日志核查：

```bash
opencode --standalone --print-logs --log-level debug debug agents
```

预期出现 `[optionmemory] V2 setup completed`。2026-11-14 已在 OpenCode 2.3.0 实测通过；同次 `opencode plugin list` 返回 `No plugins found`，因此不能以列表为空判断 V2 setup 失败，应同时检查是否有 `failed to load plugin` 错误。

该入口转发到 `dist/plugins/opencode/index.js`，因此修改 TypeScript 后必须先执行 `pnpm build`。

## 工具行为

### memory_set

输入使用 `FactInput` 字段。ν 门拒绝缺字段或非法 status 的写入，返回 JSON 字符串，包含 `id`、`gate` 和可选 `reason`，blocked 不落库。

### memory_get

输入 `{"id":"fact_..."}`，返回完整 Fact 或 null。

### memory_query

输入 `{"datalog":"?[...] := ..."}`。适配层只接受以 `?` 开头的只读查询，并拒绝 `:put`、`:rm`、`:create`、`:delete`、`:reindex` 等写操作或管理操作。

原始 CozoScript 是开发者能力，不能绕过此适配层直接开放给 LLM。

### memory_retract

输入 `{"id":"fact_...","actor":"..."}`，`actor` 可空。仅允许 `in → out`，重复撤回幂等，revision 与依赖锥失效记录可回查。

### propose_option

复用 `registerOption`，默认 `option_type="atomic"`、`template_id=null`。MVP 不接受 agent 或 template_compiled option。

### settle / revoke

两者均输入 `option_id`、`factId`、`opposingFactId`、`proposer`、`arbiter`，并可提供 `executor`、`rationale`、`policyVersion`。固定策略为 `experiment > simulation > literature`；未知或相同优先级来源要求人工复核。settle 将胜方 fact 恢复为 `in`、Option 置 `settled`；revoke 将败方 fact 置 `archived`、Option 置 `revoked`。若绑定 Model 已注册，分别同步为 `settled` / `retracted` 并追加同一治理事件到 `j_records`。

## 验证

```bash
pnpm build
pnpm test
opencode --standalone --print-logs --log-level debug debug agents
```

`tests/opencode.test.ts` 使用真实 mnestic Mem 实例验证 7 工具清单、写入/读取/查询往返、写查询拦截和 atomic option 注册。`tests/dsh.test.ts` 验证 DSH/OpenCode 共享契约、交叉读写以及跨 host 的 propose/settle/revoke/retract 治理链。2026-11-15 已完成真实 DSH/OpenCode LLM 七工具 S01 治理流程及卸载/重装数据保留验收，详见 `docs/phase3-baseline.md`；剩余未实现项为 Step 7 Planner-ready 增量。

## 版本迭代

| 阶段 | OpenCode 模块 | 工具范围 |
|---|---|---|
| Phase 3 当前实现 | v0.1.0 | 首版 7 工具 |
| Phase 4 | v0.2.0 | 保持 7 工具，接入 parse option 与结算 |
| Phase 5 | v0.3.0 | 新增 memory_why，共 8 个 |
| Phase 6 | v0.4.0 | 新增 query_achievable / certify，共 10 个 |

每个版本都与同阶段 DSH 插件共享核心服务层和升级回归；host 版本差异不应引起 facts、rules、J/≺ 或 RocksDB 数据分叉。
