# Phase 4 P4-2 DSH 同切片验收

- 日期：2026-11-15
- 状态：P4-2 通过；Phase 4 下一步为 P4-3 共享持久化后台执行与恢复
- 数据边界：独立 RocksDB `.data/phase4-dsh`（9073），未修改生产 9070

## 实现范围

- DSH 可选启用 Planner/Bridge，默认原七工具注册不变；`inject` 同时声明 `tools/subagents/userQuestions`。
- `planner_context/planner_options/planner_decision` 复用同一 host-neutral 核心和 Decision Gate。
- `bridge_capture/bridge_revise/bridge_recall` 复用同一 MemoryCore 日常记忆与 Recall。
- reviewer 通过 `ctx.subagents.startActivation`，使用真实调用 Agent、取消信号和 caller delivery，保存 child session/message ID。
- approval intent 复用 `ctx.userQuestions`，保留实际回答；拒绝执行时不创建 option_event。
- stop 同时写 planner_event_decision 与 host_event，DSH/OpenCode 可交叉停止 plan_run。

## 真实 DSH S01 证据

主 plan_run：`plan_run_phase4_dsh_s01`。

- DSH session：`session-a063e7bc-345b-4865-b2f5-cf0ec547a5d9`。
- R2 planner event：`planner_event_ac777bc9990f17eae0b34e5d9726e86687250041ccf8951601313cf683707da3`。
- R2 option event：`option_event_3a99365e5730a1f3c29f39a8cb820257e493224a90e97dd474322a140e7c05e3`，outcome=`success`，产生 R2 fact 和 J。
- reviewer planner event：`planner_event_f810ea6ae96acbf3252afcda08f05446fcf55cfbfe41f30b1d10e1c0a25a068b`。
- reviewer option event：`option_event_fd0bb68f6f53f92de7d651de94b24dfd962442cc5bb50711eff814eb5e242707`，outcome=`success`。
- 真实 reviewer session/message：`7670532e-a228-4897-a4d0-b1e41e9cdf10` / `ec97a903-e1de-4ac1-9958-a43338c93f4e`。
- 最终 stop：`planner_event_eef8bbced8e06fbab82997327b504fa772442cd7cf691f8af1bbbbce9639252a`。

reviewer verdict=`accepted`，但原始 XRD 数据仅为 fixture/inferred-prior，不能据此声称独立实验认证或 R4 已解除阻塞。

## 双向跨宿主 stop

- DSH 停止 OpenCode plan_run：`planner_event_92b3eaec6d7f69d832eaa2d28d29b6daa2dbfab25f4632586c20c3d07e91ca2f`。
- OpenCode 停止 DSH plan_run：`planner_event_11ca96b9a9743ce3750a63a32df5bf0c47baf488314f6ab88d9a730b565f2f52`。
- `plan_run_phase4_dsh_s01`、`plan_run_phase4_dsh_cross_opencode`、`plan_run_phase4_dsh_for_opencode_stop` 最终均为 `stopped`。

## 跨宿主日常记忆回归

- DSH `bridge_capture` 保存 pnpm：`document_7f113239d3c1243d5a251469dd2e8c92b11c4323d0c92fb1a9997a9362e6f14a`。
- OpenCode 读取同一 memory_uri，状态 `active`。
- DSH `bridge_revise` 创建 yarn：`document_f53cb1ae08c7269f09f19bc0f6afe35c2558bc2574c6d899c911dfc39a0a3e2b`。
- OpenCode 再次读取，得到 active yarn 新版本，旧 pnpm 保持 superseded 历史。

## 兼容、测试与数据保留

- `tests/planner-dsh.test.ts`：5 项，覆盖工具清单、approval intent、拒绝执行、真实 R2、子 Agent parent、日常记忆和 stop。
- Attention 既有测试覆盖 approval、timed pending 和 continued answer 幂等；实际 profile 已成功加载 Planner/Bridge 并完成真实 LLM 调用。
- 隔离 RocksDB 重启后，`node scripts/phase4_dsh_acceptance.ts --verify` 再次输出 `gate=pass`，option/reviewer/decision ID 和 stop 状态不变。
- 全量回归：**28 个测试文件、98/98 通过**。
- 机器证据：`.data/phase4-dsh-acceptance-result.json`。
- 原始日志：`.data/phase4-dsh-run.jsonl`、`phase4-dsh-stop-opencode.jsonl`、`phase4-opencode-stop-dsh.jsonl`、`phase4-dsh-daily-*.jsonl`、`phase4-opencode-read-dsh-*.jsonl`。

## 边界

- 原七工具不变，Planner/Bridge 为独立契约。
- 不包含 P4-3 的持久化 inbox/outbox、lease、timer 和崩溃恢复。
- 不包含自动 compaction、真实向量或 SuperAgent 正式持续适配。
- R4、97 条待复核记录及既有治理语义不变。
