# Phase 4 P4-1 OpenCode 垂直闭环验收

- 日期：2026-11-15
- 状态：P4-1 通过；Phase 4 整体仍在实施，下一步为 P4-2 DSH 同切片验证
- 数据边界：独立 RocksDB `.data/phase4-opencode`（9074）；未修改生产 9070 数据

## 实现范围

- 独立 Planner 契约：`planner_context / planner_options / planner_decision`，不并入原七工具。
- `.opencode/agents/optionmemory-planner.md` 为 primary Planner；edit/shell/subagent 等直接能力禁用，Code Mode 仅作为三个 Planner 方法的传输层。
- `src/runtime/decision-gate.ts` 检查 mandate、scope、budget、allowed effects、dry-run 和停止状态。
- `src/runtime/option-executor.ts` 通过 `(pi_type, pi_ref)` 白名单分发，校验资产绑定/状态、I、输入与 β 输出，并保存 implementation/parser 版本、attempt、mode、idempotency key 和取消结果。
- `infer_phase_structure_from_xrd` 复用 `deriveClosure({ruleId:"R2"})`，不复制 R2 实现。
- `review_s01_evidence` 通过 OpenCode V2 `session.create → prompt → wait → context` 调用真实只读 reviewer；reviewer 模型固定为 `kimi-code-plan-cn/kimi-for-coding-highspeed`，可由 `OPTIONMEMORY_REVIEWER_PROVIDER_ID` 和 `OPTIONMEMORY_REVIEWER_MODEL_ID` 覆盖。
- tool/subagent 完成事件转换为 `opencode-runtime-inbox-v0.1` 映射并确定性写入 host_event；自动重放留待 P4-3，未提前创建调度队列。
- `parse_csv_materials` 经原 `memory_set_batch` 服务层写入；parser 版本、实际行数、插入/跳过/拒绝和耗时进入事件账本，不虚构货币成本或校准指标。

## 最终真实 LLM 证据

最终成功运行：`plan_run_phase4_opencode_s01_v10`。

- OpenCode Planner session：`ses_e214614d8ffeVwaGIYL2wTp2W6`。
- R2 planner event：`planner_event_ffac2cb7c5eae012b5c06dc1639469ce62e96472faaf6dcde7c8f3c2cf6533b7`。
- R2 option event：`option_event_86dfad33cb6a0d9ebd28422c33dc224e6593c36302faac7c4b5b2b1c07baf5f5`，outcome=`success`；重复推导保持同一 fact/J，`justified=true`。
- reviewer planner event：`planner_event_9e252cd58c1a5e2a83d93cba7b1d366e623c59cd060123e4f3e531aab7902ead`。
- reviewer option event：`option_event_cb0225229f39952de08e0d93b6473aa6ba966dab387138f4234b09fd70ac78fd`，outcome=`success`。
- 真实 reviewer session/message：`ses_e2145af06ffeWKSbHT0kXzoAI1` / `msg_1deba5c20001z0Ef4ghXcFd7Z6`。
- reviewer verdict=`review_required`。这是实际执行成功但证据仍需复核，不能解释为认证通过或 settle。
- 最终 stop planner event：`planner_event_5ef6cfffbd13547d1978ae8ed90a607c16b3e221f1b203e3410d79363e5109b1`。

数据库 verify 输出 `gate=pass`，两个 execute 均成功，最终 stop 存在，host_event 共 4 条（3 条 Planner tool 完成事件和 1 条 subagent.completed）。机器可读证据：`.data/phase4-opencode/acceptance-result.json`；真实调用日志：`.data/phase4-opencode/opencode-real-run-v10.jsonl`。

## 失败回流与修复记录

早期独立 plan_run 保留了真实失败，不覆盖为成功：

- reviewer 未注册、V2 返回值解包和消息等待适配失败时，真实 Planner 均写入 failure，并作出 stop 或 replan。
- 默认 reviewer 模型 `opencode/iceman-free` 曾触发 429 免费额度限制；固定已验证模型后完成真实 reviewer 调用。
- `tests/planner-opencode.test.ts` 另行覆盖失败 outcome→replan→stop、未知 pi_ref、schema 错误、revoked 资产、host 事件去重和 CSV 幂等。

## 边界与后续

- 原七工具保持独立且不变；未注册 memory_why/query_achievable/certify。
- R4 仍阻塞，97 条待复核记录未用于独立认证；生产数据未参与这些故障测试。
- P4-1 的 CSV 验收使用隔离 Mem fixture。HEA-Lens-1540 全量批次、双 host v0.2.0 整体验收仍属于 Phase 4 Repo A，不在此声明完成。
- P4-3 的持久化 inbox/outbox、lease、timer、崩溃恢复和跨关系原子提交尚未实施。
