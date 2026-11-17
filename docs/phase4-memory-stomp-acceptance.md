# Phase 4 P4-6 日常记忆 STOMP 最小闭环验收

- 日期：2026-11-17
- 状态：P4-6 通过；Phase 4 原基线与整体验收尚未全部关闭，不能直接签署进入 Phase 5
- 数据边界：独立临时 RocksDB 和独立宿主库 `.data/phase4-memory-stomp-host`；未修改生产 9070
- 故障验收：`node scripts/phase4_memory_stomp_acceptance.ts`
- 机器证据：`.data/phase4-memory-stomp-acceptance-result.json`

## 一、实现范围

- `src/api/memory-write-options.ts`：capture/revise/parse 的统一写入口，建立 subtask、plan_run 和真实 execute decision，复用既有 DocumentProjection 实现与幂等键。
- `src/runtime/option-executor.ts`：注册 `memory-capture@v1 / memory-revise@v1`，支持实现返回可选 `model_events` 并持久化。
- `src/api/memory-recall.ts`、`src/bridge/markdown/parser.ts`：Recall 先只读计算内容哈希，再通过 markdown Option 刷新；未变化复用，变化产生新执行与 mapping_stale。
- `src/api/sidecar.ts`：补充 `pre_state/post_state` observation 与 `model_event.anticipation`，实际状态与预测分离。
- `src/runtime/native-skill.ts`：最小 NativeAdapter 注册边界；现有 OpenCode/DSH reviewer 复用该边界，不重写 harness。
- `memory_parse_markdown_note` 使用独立 Option ID，避免与既有 subtask 的 parse_markdown_note 资产绑定冲突。
- data 层 chunk 继续作为日常 Recall 内容和可选事实来源，未新增 FactCandidate 持久层、日常记忆表字段或组合 DAG。

## 二、独立 RocksDB 故障验收

最终运行时间：`2026-11-17T14:07:43.220Z`，输出 `gate=pass`，两次真实适配器重启全部通过。

### 1. capture/revise 与幂等

- plan_run：`plan_run_aade21d115a82dd4a4e633cae49b01a737d0f946f0a0f252ddbe0509caeb09f2`。
- capture option_event：`option_event_6b1f1199b98a86bd381e32a218eff500fa053e9e22b05062bb25330905eb36b0`，`mode=real`，outcome=`success`。
- revise option_event：`option_event_ca64095c0cc800a494456e5163f38e662a91b8e10c6c9288076bf786e02bc45b`。
- 原 document：`document_57c2f95fa4cca07da0a99de05f4e24d07741ba173690c5c4185bf59c905e8969`，revise 后为 `superseded`。
- 新 document：`document_f08282161bbc1d34e78ddb76a92b836487c9a688300834c392bb19cff3ac9f2a`，`supersedes` 指向原 document。
- 重复 capture/revise 均从既有 outcome/output 返回 `reused=true`，没有重复执行。

### 2. outcome 丢失与敏感输入

- 故障注入仅删除 capture outcome；重发相同 capture 返回 `reconcile_required`，没有重复捕获或覆盖修订状态。
- `password=do-not-store` 被敏感内容过滤拒绝，未形成有效记忆。

### 3. Recall 刷新与 mapping_stale

- 首次 Recall 未变化内容复用既有解析结果；外部文件改为 yarn 后产生新执行 `option_event_c5ced03c15eaeb470948b69d3265e570c5442165199fb0830fe83d2dfdf9ffff`。
- 旧 chunk 保留 `mapping_stale`，新 Recall 使用 yarn；原 Markdown 内容不被 Bridge 修改。

### 4. Sidecar 世界状态

- sidecar option_event：`option_event_aeba2ebf53f6feb6e15d70062dd8965a5315e366072ed71e568cc6e0888f6c21`。
- `pre_state={package_manager:unknown}`、`post_state={package_manager:pnpm}` 分别进入 observation。
- `model_event_d1105cff8191c47a174c5b378c295b7d987abf5573c674e1f7022d6b026ed13a` 为 anticipation，保存预测值，不冒充实际状态或 drift。

### 5. 最小 NativeAdapter

- native plan_run：`plan_run_f417b55160e6f8ea04d99d53b92fc996a700acebe50a7f6a36ff00fdc6da750e`。
- 成功：`option_event_53fd97b51bd5b777351f521f9e3d422a809cbaa7ed1a781e2f7e9c49cae4547b`，`mode=real`，含一条真实 anticipation。
- 失败：`option_event_3b42948b8d5d6948b4f8b6c15f42bf0fc57c039754fe74c737f3ad15494034dc`，outcome=`failure`。
- 取消：`option_event_bbe5dcf96b9f79b9a38f1455f5e9379abce2aa4df206a6f13718c773e86a6ff8`，outcome=`blocked`，未转成 sidecar。
- 重启后成功事件复用，处理函数实际调用次数未增加。

## 三、真实 OpenCode 会话

### A：真实 capture

- session：`ses_e1626e215ffe1gmzkHL8YeSn4t`。
- plan_run：`plan_run_3f2d2ab47a90504f8e3002c34add64cbf1fc585c0046a47965ef3a93b5617b48`。
- option_event：`option_event_d6b11db044c5520ee84faa7246ad4d27a606bb340d996a99757ddebc9323577d`，`mode=real`。
- document：`document_43237cea38ed2f3525b0666d26b24c97f8470d837bdafd4b963e862eaafd0968`。
- 日志：`.data/phase4-memory-stomp-opencode-a.jsonl`，实际 bridge_capture 返回 `gate=pass`。

### B：新会话自动 Recall

- session：`ses_e162665d4ffevu5ROXbmubUU9Z`。
- 未显式调用 Recall 工具，模型回答 **pnpm** 并引用原 document 的 memory_uri。
- 日志：`.data/phase4-memory-stomp-opencode-b.jsonl`。

### C：真实 revise

- session：`ses_e1626191fffeuoU500NT1iEK47`。
- plan_run：`plan_run_25cff8fe6efde3229953d50c5d40f9af27feee05cd7f175df566f52fc4a1ec2b`。
- option_event：`option_event_b3f4f117fe9dc35f109a69c1604f3f5b3694591117da8b095a703864b82475b5`，`mode=real`。
- 新 document：`document_421363f2d1fb742ab395d07d9a1660dab98bbd86dad5f573d852d5e9acc58c4a`，`supersedes` 指向原 document。
- 日志：`.data/phase4-memory-stomp-opencode-c.jsonl`。

### D：修订后新会话 Recall

- session：`ses_e1625b78cffeArAQNLeuejaJMy`。
- 模型回答 **yarn** 并引用新 document；原 document 已为 `superseded`。
- 日志：`.data/phase4-memory-stomp-opencode-d.jsonl`。

## 四、真实 DSH 会话

使用既有 `materials-agent` profile 和同一隔离 RocksDB，未安装或修改工作区外 profile。

### A/C：真实 capture 与 revise

- capture option_event：`option_event_811d5d6002169bc9ee6ea7cba8e3b2665103194c102777557a996565d9f59a69`，`mode=real`。
- 原 document：`document_f10228ee60cd981f7f348a6e97471920e98350b4d2f728498ac9049231cfe3a2`。
- revise option_event：`option_event_3239490dc4e3d946efbdcb76132357117684d6853b7d911f5845d48af7319131`，`mode=real`。
- 新 document：`document_5d6d57cb49c8ba2efe1b2ce88d2b62b0fd67aa736cc316d12b4df6c690e78e3f`，`supersedes` 指向原 document。
- 共享 plan_run：`plan_run_fe15a7e32ea496d96668991408cbd34583cfb5f6cc95024f7c946b4fb9933856`。
- 日志：`.data/phase4-memory-stomp-dsh-a.log`、`.data/phase4-memory-stomp-dsh-c.log`。

### B/D：跨会话 Recall 与冲突边界

- B 会话在修订前同时返回 OpenCode yarn 与 DSH pnpm 的冲突记忆，模型明确指出存在冲突、不能给出唯一答案，没有静默选择一个版本。
- D 会话返回最新 **yarn** 及新 memory_uri，并确认旧 pnpm 已 superseded。
- 日志：`.data/phase4-memory-stomp-dsh-b.log`、`.data/phase4-memory-stomp-dsh-d.log`。

## 五、回归与边界

- `pnpm build && pnpm test`：**33 个测试文件、123/123 通过**。
- `node scripts/phase4_memory_acceptance.ts`：`gate=pass`，原 pnpm/yarn 修订链、历史 Recall、Planner 只读和原文不写回保持不变。
- `node scripts/phase4_dsh_acceptance.ts --verify`：`gate=pass`，原 Option、真实 reviewer、跨宿主 stop 和事件 ID 保持不变。
- RocksDB、字段迁移、scheduler、SuperAgent、Sidecar、原七工具、J/≺ 和日常记忆均包含在全量回归中。
- 新 `schema/apply_all.sh` 在全新隔离库上未能建全 memory_documents 关系，本次使用逐块 POST 的已验证建表方式完成宿主验收；该脚本兼容问题单独保留，不冒充已修复。
- 当前仅证明最小 NativeAdapter，不承诺全类型工具/嵌套 Option、自动 Skill 生成、组合 DAG、通用世界模型或完整持续服务。
- Phase 4 原基线的 HEA-Lens 批量解析、transient 结算和双 host v0.2.0 升级仍需独立验收。
- 生产 9070 已于 2026-11-17 完成 Option 创建血缘迁移，备份为 `.data/production-lineage-backup-20261117-224512`；迁移前后计数、ID、绑定、probation、604/97 分组及 R4 边界不变，新增字段均为 null，详见 `docs/phase4-field-authority.md` §7。


## 六、P4-6 执行验收签署

- 签署项：P4-6 日常记忆 STOMP 最小闭环
- 验收结论：通过
- 签署人：Kimi Code CLI（实现与验收执行）
- 签署日期：2026-11-17
- 签署依据：33 个测试文件、123/123 通过；独立 RocksDB 故障恢复及 OpenCode/DSH 真实会话通过；生产血缘迁移与数据核对通过。

本签署仅覆盖 P4-6。Phase 4 原基线及整体验收仍为待签，不据此进入 Phase 5。
