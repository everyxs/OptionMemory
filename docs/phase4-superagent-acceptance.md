# Phase 4 P4-4 SuperAgent 隔离兼容探针验收

- 日期：2026-11-17
- 状态：P4-4 通过；下一步为 P4-5 Sidecar Mapping Contract v0.1，Phase 4 整体尚未签署
- 数据边界：独立临时 RocksDB，完成后删除；未修改生产 9070，未连接生产 SuperAgent
- 可重复入口：`pnpm build && node scripts/phase4_superagent_acceptance.ts`
- 机器证据：`.data/phase4-superagent-acceptance-result.json`

## 一、交付范围

- `src/api/superagent-probe.ts`：Ticket → subtask_event、Assignment → plan_run/attempt、Input → deliver/answer + runtime inbox 的确定性映射。
- assignmentStarted、report、Ticket Attention 回调及 ACK response 持久化；失败记录 `reconcile_required`，不盲目重放。
- deliver/answer 与 P4-3 runtime inbox 连通，重复 Input 不重复唤醒；host_event 已存在而 inbox 缺失时可幂等补写。
- `src/memory/planner.ts` 的 host_event 类型增加 assignmentStarted/attention，不新增表、Ticket Store 或第二套控制状态。
- `tests/superagent-probe.test.ts`：6 项测试覆盖 start/deliver/Attention/report/stop、部分写入恢复、回调失败和显式记忆边界。

## 二、独立 RocksDB 验收

最终运行时间：`2026-11-17T07:52:00.347Z`，输出 `gate=pass`，完成两次真实适配器进程重启。

### 1. Ticket、Assignment 与 start

- Ticket：`ticket-p44-s01`。
- subtask_event：`subtask_event_f6f90b77745a2deb15e559075270592548feea339d28b21564bec51725a10f0c`。
- 第一 Assignment/plan_run：`assignment-p44-1` / `plan_run_39167a687fcb942ccc1c9d9f7a6feb13604a3c39ea4f1cc35dd1efd905278ff5`。
- assignmentStarted host_event：`host_event_57fbfddab3fa6b10d1f5f84a7091d42640264fb26ecb0ca1f8c2bb1b0b6825b9`。
- 重复 start 返回 `reused=true`，没有第二次 assignmentStarted 回调；实际 ACK=`ack-assignment-assignment-p44-1`。

### 2. deliver 与重启恢复

- deliver host_event：`host_event_a25a5ac043f20314adbea82c14c630f4dd9535987bbf839684eae41bb0088330`。
- runtime inbox：`runtime_inbox_3e5ff993140a5c66d0e4f5af4c2f5bb17341cb3c37929567f650c46b46eba6ff`。
- 重启前重复 deliver 返回 `reused=true`，host_event 与 inbox 均只有一条。
- 第一次真实重启后 plan_run、Ticket refs、deliver 和 Attention 均保留；重复 start/deliver/requestAttention 不重复回调或建单。
- 单元故障测试另行删除 inbox 模拟部分写入，重发 Input 补建同一 inbox，deliver host_event 仍只有一条。

### 3. Ticket Attention 往返

- attention host_event：`host_event_bf47fb6b0a038b9774e6a3dbdcd14d2f941c7db1c0a4f4fc0231410a495039a4`；实际 ACK=`ack-attention-p44`。
- answer host_event：`host_event_3bd05de72c921cdf894280a29841788354113791a79a9ca790af4cf3d9184ea1`。
- answer inbox：`runtime_inbox_050690753e31599e54aff5d52c86cc7439191ea1ebb66104ccbfd7024f2753c8`。
- 重启后回答成功；重复回答返回 `reused=true`，只产生一条唤醒事件。不同 Input 对同一问题的第二次回答被 blocked。

### 4. Report、第二 Assignment 与 stop

- report host_event：`host_event_2242007094bfbdf34ce9baeba7a9d0d4796673d30dfa66a498b00b3572a7ead5`；实际 ACK=`ack-report-p44`。
- 第二次真实重启后 plan_run=`completed`，重复 report 不再次调用回调。
- 第二 Assignment/plan_run：`assignment-p44-2` / `plan_run_6eb138240b26a611b5c507ccc6ba7ddb99b73f722a7b439f194421482c167265`，与第一 Assignment 共享 Ticket 的 subtask_event。
- stop host_event：`host_event_a1487bd87c0a1e03e1418948163c8d5db47aea1372bdc67485b89a0bfffd227d`；重复 stop 去重，后续 deliver 被 blocked。

最终回调计数为 assignmentStarted=2（两个不同 Assignment）、report=1、attention=1；重启没有增加计数。

### 5. 日常记忆交互

- 显式捕获重复执行只产生 `document_9ce2853ed6acffde081e85e9b089d5350edf859d7e3d4db7b2ef7b8af3c5bec7` 一份文档。
- start/deliver/Attention/report/stop 未产生额外隐式 document/chunk 写入。
- 重启后 Recall=`recall_1bd9d0b23ffa47a96cf2b8ffff575f91a92c9652a150df12eca5b88c5f341ad0` 仍正确返回 pnpm 记忆。
- P4-4 未提前实现 P5-4 的 Ticket 自动捕获、批准后修订或跨宿主长期记忆适配。

## 三、共享回归

- `pnpm build && pnpm test`：**30 个测试文件、111/111 通过**。
- `node scripts/phase4_memory_acceptance.ts`：`gate=pass`；原 pnpm 修订链、yarn 当前版本、历史 Recall、Planner 只读和原文不写回保持不变。
- `node scripts/phase4_dsh_acceptance.ts --verify`：`gate=pass`；原两个 Option、真实 reviewer session、跨宿主 stop 和事件 ID 保持不变。
- RocksDB、scheduler、字段迁移、原七工具、J/≺、修订和日常记忆测试均包含在最终 111 项回归中。

## 四、边界与未实现项

- 本验收实际执行隔离回调并保存 Ticket/ACK 记录，但没有接入真实生产 SuperAgent；它证明核心契约可映射，不证明 SuperAgent 的持续 Ticket 生命周期已经交付。
- 未新增 SuperAgent 包、生产适配器、长期 Source、Subscription、Ticket Store 或第二套 Attention UI。
- P4-5 Sidecar Mapping、Phase 4 原基线批量验收和 Phase 4 整体签署尚未完成。
- Phase 5 的 `superagent-adapter v0.1` 仍需验证正式依赖、原型版本、许可证、inputsDelivered/inputsRead、持续恢复和真实 SuperAgent 集成。
- R4 仍阻塞，原七工具不变，未虚构模型能力、奖励、校准指标或回调结果。
