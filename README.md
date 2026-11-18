# OptionMemory

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

仓库已包含 Planner 和日常记忆插件。进入项目后运行：

```bash
opencode run --standalone --auto "请使用 bridge_capture 记住：本项目使用 pnpm 管理依赖。namespace=global，source_ref=session-a，idempotency_key=project-pnpm-v1。"
```

然后在一个**新会话**中询问：

```text
这个项目使用什么包管理器？请给出对应 memory_uri。
```

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

当前基线为 **33 个测试文件、123/123 通过**，测试使用独立实例，不需要启动生产 9070。

日常记忆完整故障与恢复验收：

```bash
node scripts/phase4_memory_stomp_acceptance.ts
```

验收说明和真实 OpenCode/DSH 会话证据见 `docs/phase4-memory-stomp-acceptance.md`。

## 七、当前边界

- Phase 4 原基线的 HEA-Lens 全量解析、transient 结算和整体验收尚未全部关闭，R4 仍阻塞。
- 当前提供最小 NativeAdapter；不承诺全类型工具、嵌套 Option 或自动 Skill 生成。
- 外部历史轨迹可通过 Sidecar 导入，统一标记为 `mode=sidecar`，不与原生 real 证据混用，详见 `docs/sidecar-mapping-v0.1.md`。
- SuperAgent 正式持续适配、memory_why/query_achievable/certify 和组合 DAG 尚未开放。

更多文档：

- `docs/opencode-memory-guide.md`：OpenCode 完整使用指南
- `docs/mnestic-api-cheatsheet.md`：mnestic 查询与事务语法
- `devNotes/Week9-12开发手册-多源解析与可靠调度.md`：Phase 4 实施与验收清单
