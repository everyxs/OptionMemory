# optionmemory

DSH 记忆插件 —— mnestic（CozoScript HTTP）上的五层记忆。本目录当前交付 **记忆服务层**：
`memory_set` / `memory_get` / `memory_query` 三接口 + ν 门 + mnestic 客户端。

## 运行前提

- Node >= 20，pnpm（本仓库锁定 `pnpm@11.7.0`）。
- mnestic Mem 实例：`scripts/mnestic_start.sh` 启动（默认 `127.0.0.1:9070`，首次自动 `cargo build`）。
- 建表：`schema/apply_all.sh`（mem 引擎重启即丢数据，需重新执行）。
- 测试无需手工做以上两步：`pnpm test` 的 globalSetup 会拉起独立实例（端口 9071）并自动建表，
  仅要求 `target/debug/mnestic-mem-adapter(.exe)` 已编译（跑过一次 `mnestic_start.sh` 即可）。

## 接口（src/api/memory.ts）

```typescript
memory_set(fact: FactInput): Promise<{ id: string; gate: "pass" | "blocked"; reason?: string }>
memory_get(id: string): Promise<Fact | null>
memory_query(datalog: string): Promise<Fact[]>
```

- **memory_set**：先过 ν 门（`checkCompleteness` 六元组必填校验 → `requentialCheck` 占位），
  再校验 `status` 取值；任一不通过返回 `gate: "blocked"` + `reason`，**不落库**。
  通过后 `:put` upsert 进 `facts` 表，`id`（UUID）与 `created_at` / `updated_at`（Unix 秒）由本层生成。
- **memory_get**：按 id 取 `facts` 全列；未命中返回 `null`。
- **memory_query**：透传原始 CozoScript（如 `?[...] := *facts{...}, predicate == "x"`），
  返回行按 `facts` 列名映射为 `Fact`；未 select 的列为 `undefined`。
- 错误：HTTP 非 2xx / `{ok:false}` / 超时（默认 5s）/ 连接失败，统一抛 `MnesticError`。

### FactInput / Fact（src/memory/schema.ts）

| FactInput 字段 | facts 列 | 必填 | 说明 |
|---|---|---|---|
| `predicate` | `predicate` | ✓ | 谓词 |
| `claim` | `claim` | ✓ | 主张文本（六元组） |
| `layer` | `layer` | ✓ | 层标签（六元组；占位词汇见 `MEMORY_LAYERS`） |
| `jPremiseIds` | `j_premise_ids` | ✓ | J 系：前提 id 列表，可为 `[]` |
| `epsType` / `epsValue` / `epsSource` | `eps_*` | ✓ | ε 系：类型 / 值(Float) / 来源 |
| `linSource` / `linVersion` / `linActor` | `lin_*` | ✓ | lin 系：来源 / 版本 / 行为者 |
| `verify` | `verify` | ✓ | 核验标记 |
| `args` | `args` | — | 谓词参数，缺省 `[]` |
| `jRuleId` / `linTheta` | `j_rule_id` / `lin_theta` | — | 可空 |
| `status` | `status` | — | 缺省 `"active"`；合法值见 `FACT_STATUSES`（暂定 `active` / `retracted`），非法值被拒 |
| `embedding` | `embedding` | — | 1024 维 F32 向量，可空 |

`Fact` = `FactInput` 全字段 + `id` / `createdAt` / `updatedAt`（camelCase ↔ snake_case 由服务层映射）。

## 结构

```
src/
  memory/schema.ts        # 表/列/层常量 + Fact / FactInput（纯类型与常量）
  memory/mnesticClient.ts # HTTP 客户端；所有 CozoScript 在此集中组装（execute/putFact/getFactById）
  runtime/nuGate.ts       # ν 门：checkCompleteness()；requentialCheck() 占位（TODO: Phase 2 requential 账）
  api/memory.ts           # 三接口；不拼接 CozoScript 字符串
tests/
  globalSetup.ts          # 拉起 9071 测试实例 + 建表
  memory.test.ts          # 5 用例：写成功 / 缺 lin_source 拒 / get 命中 / 谓词过滤 / 非法 status 拒
schema/                   # 7 表建表脚本（facts 等）+ apply_all.sh
server/                   # mnestic Mem 适配层（Rust）
docs/mnestic-api-cheatsheet.md  # mnestic 0.17.0 API 取证速查
```

## 开发

```bash
pnpm install   # 依赖（pnpm-workspace.yaml 已批准 esbuild 构建脚本）
pnpm build     # tsc 编译到 dist/
pnpm test      # vitest：自动起 9071 实例，5 用例
```
