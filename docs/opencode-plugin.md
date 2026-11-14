# OpenCode 记忆模块

本项目同时提供 DSH 与 OpenCode 两种 host 适配层。OpenCode 适配层复用 `src/api`、`src/memory`、`src/runtime`，不复制记忆、注册、门控或推导逻辑。

官方机制：[OpenCode Plugins](https://opencode.ai/docs/plugins/)。当前实现使用 `@opencode-ai/plugin@1.19.5` 类型与 zod 工具 schema。

## 当前能力

当前开发版本暴露 4 个已实现工具：

| 工具 | 用途 | 核心实现 |
|---|---|---|
| `memory_set` | 写入带六元组和质量/血缘字段的 fact | `src/api/memory.ts` |
| `memory_get` | 按 id 读取完整 fact | `src/api/memory.ts` |
| `memory_query` | 执行只读 CozoScript 查询 | `src/api/memory.ts` + OpenCode 只读防护 |
| `propose_option` | 注册 atomic option | `src/api/registry.ts` |

`memory_retract`、`settle`、`revoke` 将分别在 Phase 2/3 能力完成后加入。`memory_why`、`query_achievable`、`certify` 不提前暴露。

## 文件结构

```text
.opencode/plugins/optionmemory.ts   # OpenCode 项目级插件入口
src/api/tool-contracts.ts           # 单一工具契约与 JSON Schema 导出
src/api/readOnlyQuery.ts            # 双 host 共享只读防护
src/plugins/opencode/
  index.ts                         # Plugin 初始化、endpoint/token/timeout 注入
  tools.ts                         # 消费共享契约并调用核心服务
```

OpenCode/Cordis 等框架依赖只能出现在各自适配层，不能进入 `src/memory`、`src/api`、`src/runtime`。zod 是共享契约的输入校验实现，不属于 host 专有依赖；OpenCode 不再单独维护工具字段清单。

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

V1 可用以下命令检查本地模块：

```bash
opencode plugin list
```

V2（包括当前 2.2.5）使用初始化日志核查：

```bash
opencode --standalone --print-logs --log-level debug debug agents
```

预期出现 `[optionmemory] V2 setup completed`。当前 2.2.5 的 `plugin list` 不一定列出本地 V2 模块，不能仅凭列表为空判断 setup 失败；应同时检查是否有 `failed to load plugin` 错误。

该入口转发到 `dist/plugins/opencode/index.js`，因此修改 TypeScript 后必须先执行 `pnpm build`。

## 工具行为

### memory_set

输入使用 `FactInput` 字段。ν 门拒绝缺字段或非法 status 的写入，返回 JSON 字符串，包含 `id`、`gate` 和可选 `reason`，blocked 不落库。

### memory_get

输入 `{"id":"fact_..."}`，返回完整 Fact 或 null。

### memory_query

输入 `{"datalog":"?[...] := ..."}`。适配层只接受以 `?` 开头的只读查询，并拒绝 `:put`、`:rm`、`:create`、`:delete`、`:reindex` 等写操作或管理操作。

原始 CozoScript 是开发者能力，不能绕过此适配层直接开放给 LLM。

### propose_option

复用 `registerOption`，默认 `option_type="atomic"`、`template_id=null`。MVP 不接受 agent 或 template_compiled option。

## 验证

```bash
pnpm build
pnpm test
```

`tests/opencode.test.ts` 使用真实 mnestic Mem 实例验证工具清单、写入/读取/查询往返、写查询拦截和 atomic option 注册。`opencode plugin list` 用于项目级加载发现检查；完整的 OpenCode LLM 调用联调在 Phase 3 与 DSH 首版一同验收。

## 版本迭代

| 阶段 | OpenCode 模块 | 工具范围 |
|---|---|---|
| 当前开发版 | adapter preview | 4 个已实现工具 |
| Phase 3 | v0.1.0 | 增加 retract/settle/revoke，共 7 个 |
| Phase 4 | v0.2.0 | 保持 7 个，接入 parse option 与结算 |
| Phase 5 | v0.3.0 | 增加 memory_why，共 8 个 |
| Phase 6 | v0.4.0 | 增加 query_achievable/certify，共 10 个 |

每个版本都与同阶段 DSH 插件共享核心服务层和升级回归；host 版本差异不得引起 facts、rules、J/≺ 或 RocksDB 数据分叉。
