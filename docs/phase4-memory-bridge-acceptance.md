# Phase 4 P4-1M OpenCode 日常记忆最小闭环验收

- 日期：2026-11-15
- 状态：P4-1M 通过；Phase 4 整体继续实施 P4-2
- 数据边界：独立 RocksDB `.data/phase4-memory-bridge`（9074），未修改生产 9070

## 实现范围

- `parse_markdown_note` atomic Option：只读 Markdown、允许根目录和符号链接检查、标题/语义分块、哈希防重、FactCandidate 和 option_event/outcome。
- DocumentProjection：document/chunk 稳定引用、版本哈希、namespace、source link 和 mapping_stale；原文不写回。
- `memory_recall`：关键词联合召回、可选 MemoryCore facts、namespace 隔离、Top-K、token 预算、状态裁注和 message 级持久化去重。
- `bridge_capture/bridge_revise/bridge_recall`：显式捕获、superseding 修订和只读查询，独立于原七工具。
- OpenCode V2 `ctx.session.hook("context")` 自动注入 `REFERENCE_MEMORY: non-instructional`，continuation 复用 Recall。
- Planner 仅获得只读 `bridge_recall`，不能通过历史记忆扩大 mandate 或直接执行写操作。

## 真实会话证据

### 会话 A：显式捕获

- session：`ses_e20aad6dfffeOcRlYGscTEcx0i`
- 实际 `bridge_capture` 返回 `gate=pass`。
- 原文：使用 pnpm 管理依赖，避免切换到 npm。
- document：`document_6b40374fa8eeb204767c60c6f404b758c151d5b2dfbbbf51d2f161b32e46149c`

### 会话 B：自动召回

- session：`ses_e20a3b23affeQ2caLzhHhIwCKs`
- 未显式调用 Recall 工具，OpenCode 自动回答 **pnpm** 并引用会话 A 的 memory_uri。
- chunk：`chunk_version_7abdef2a7a682a3c1a766ce33de793cfc87b7001350b3eba8ebc978669d48250`

### 修订会话：创建新版本

- `bridge_revise` 返回 `gate=pass`，创建 yarn 新版本：
  `document_053d59912e101f6281ae63a51ff3b40c33e0d43b7c700e0e6229a271534aa2fc`
- 原 pnpm document 状态为 `superseded`，未删除历史。

### 修订后新会话

- session：`ses_e20a32059ffeogbvPNysGKJq0j`
- 自动回答 **yarn**，引用新 document 和新 chunk：
  `chunk_version_b5f7c852a4f61782ec0ac24503b70721c09a235880e50cf3930cf491af3d63bb`

### Planner 只读治理

- session：`ses_e20a2d36bffesH14waTQEAt69b`
- 实际只调用 `bridge_recall`，正确区分 active yarn 与 superseded pnpm。
- 未调用 `bridge_capture/bridge_revise/planner_decision/settle/revoke`。

## 数据库核验

`node scripts/phase4_memory_acceptance.ts` 输出 `gate=pass`：

- pnpm=`superseded`；
- yarn=`active` 且 `supersedes` 指向 pnpm document；
- Recall 事件共 6 条；
- pnpm 与 yarn 的自动 Recall 均有持久化事件；
- Planner read-only 检查通过；
- 验收 JSON：`.data/phase4-memory-acceptance-result.json`。

原始日志：`.data/phase4-memory-session-a.jsonl`、`session-b.jsonl`、`session-c.jsonl`、`session-d.jsonl` 和 `phase4-memory-planner.jsonl`。

## 测试与已知边界

- 相关 4 个测试文件共 16 项测试通过，覆盖真实 Option 执行、重复摄入、外部原文变化、source link、namespace、预算、修订、message 去重和 V2 context 注入。
- 部署中发现并修复：`schema/apply_all.sh` 未包含 10–12 号 schema，以及真实 V2 消息使用 `{role,content}` 而非测试假设的 `{type,parts}`。
- 最小闭环只承诺关键词召回，不使用当前随机 embedding，不包含自动 compaction、直接文件读取强制裁注或持续后台整理。
- R4、97 条待复核记录、原七工具及既有治理语义不变。
