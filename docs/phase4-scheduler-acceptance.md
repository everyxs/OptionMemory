# Phase 4 P4-3 共享持久化后台执行与恢复验收

- 日期：2026-11-17
- 状态：P4-3 通过；Phase 4 整体执行验收已于 2026-11-19 关闭，见 `docs/phase4-acceptance.md`
- 数据边界：脚本创建独立临时 RocksDB 与 Markdown 根目录，完成后删除；未修改生产 9070 数据
- 可重复入口：`pnpm build && node scripts/phase4_scheduler_acceptance.ts`
- 机器证据：`.data/phase4-scheduler-acceptance-result.json`

## 一、实现范围

- `schema/10_runtime_inbox.cozo`、`schema/11_runtime_outbox.cozo`：持久化 inbox/outbox、timer、lease 与 subtask 串行租约。
- `src/runtime/scheduler.ts`：确定性 trigger ID、租约领取/回收、决策与分发分离、结果回流、停止边界和按 plan_run 隔离调度。
- `src/memory/mnesticClient.ts`：以 mnestic imperative block 在同一事务写入 planner decision + outbox；`:ensure_not` 与整行参数化 `:put` 实现原子租约冲突保护。
- `src/runtime/planner.ts`：仅真实 execute 延迟到 outbox；dry-run、stop、replan 等非执行决策正常落库，不生成 outbox。
- `src/runtime/option-executor.ts`：统一 `optionEventIdFor(idempotencyKey)`，执行器、调度器和恢复验收共用事件映射。
- `tests/scheduler.test.ts`：7 项行为测试，覆盖重复 trigger、原子回滚、活跃/过期 lease、subtask 串行、结果丢失对账、timer、dry-run 和 stop。

## 二、独立 RocksDB 故障验收

最终运行时间：`2026-11-17T03:04:08.222Z`，脚本输出 `gate=pass`。验收实际重启适配器进程四次，分别验证分发前崩溃、lease 恢复、outcome 对账和记忆执行后的数据保留。

### 1. 重复 trigger 与真实执行

- plan_run：`plan_run_p43_primary`。
- inbox：`runtime_inbox_13b002786f4e9ef3887ae1dccb618618b7566b0c2f8e78ccdd92394fa47f9017`；重复 trigger 返回 `reused=true`。
- planner decision：`planner_event_7b765ce39d6ae7f612801244efd199ab99c2778a8feeab1376e9f389968888f5`。
- option event：`option_event_93d10b2999da27b3a3228fe3aa5deb4531bef7d639309dfb8a3ca7f562389622`，outcome=`success`。
- 重复分发返回 `reused`，结果 inbox 仅一条，未重复执行。

### 2. 决策后、分发前真实进程崩溃

- plan_run：`plan_run_p43_crash_before_dispatch`。
- 崩溃前 decision：`planner_event_45b58bc195e5c757369a3856252ec2710ae82b3cc19a7865548cd834121dfca7`；outbox=`pending`，尚无 option_event。
- 重启后 outbox 与 decision 均保留，恢复执行只生成 `option_event_a021c99ba21715a7615f5446020371748c550e46819163dfdc4f9a881ab6f7df`。
- 再次分发返回 `reused`，未产生第二个执行事件。

### 3. lease 不抢占与超时恢复

- inbox：`runtime_inbox_0595745eb6c6f05f76221893354c8df2def7de2c6dac0674287806abc99002a6`。
- 活跃 lease 期间第二个 owner 领取失败；进程重启且 lease 过期后成功恢复。
- 恢复 decision：`planner_event_fa4780e70fecd2c6bd2939731a32a1c016024c68642804e2f16528e3a22b2828`。
- 同一 subtask 的并发决策串行由 `tests/scheduler.test.ts` 独立验证。

### 4. 真实副作用后的 outcome 丢失对账

- plan_run：`plan_run_p43_lost_outcome`。
- option event：`option_event_65e87c384e47392c15b59f41d59edd418988e5621ee6bf38ba90365c131e5286`。
- 故障注入：先通过 OptionExecutor 真实执行 R2，`justified=true` 并保存 input/output 两条 observation；仅删除 outcome，保留 option_event 和实际派生副作用，再重启进程。
- 两次恢复分发均返回 `reconcile_required`，没有盲目重放；option_event 仍一条、observation 仍为两条、outcome 仍缺失，outbox 记录明确对账原因。
- decision：`planner_event_168b46a5a56a03c6140a74a2c19b50e314307dfdace26328b7344657d09fb628`。

### 5. timer、dry-run 与 stop

- timer inbox：`runtime_inbox_0940e8c1f84c1bdf1e2d11572b007acb16121cb3883ea5e5e99f7d2589e33114`；重复 timer 返回 `reused=true`。
- wait 期间 Planner 调用 0 次；到期后调用 1 次并生成 decision `planner_event_9cbd00cdffd4cdc2016a9faabe127524fb7cbb3920d783f5cbb912257a8ed6b0`。
- `plan_run_p43_dry_run` 的 execute 仅记录决策，不生成 outbox。
- stopped plan 的到期 inbox `runtime_inbox_464cc6b00bb10804414c3f59372f3d1ad4295e6d5d99bdbc7e0c85fe70eb3416` 被标记 `ignored`，Planner 调用 0 次，未绕过 stop。

### 6. 日常记忆副作用与恢复

- `parse_scheduler_markdown` 通过真实 outbox 执行 Markdown 解析；重复 trigger 不重复捕获。
- document：`document_f0711bf494e7f01b96007731567a3111589fa5c6755a0ef3ad0f9bbeada7702f`，仅一份 document、两条 chunk；option event 为 `option_event_f57a9ce440a0513c46d5a219723d73beb99cdcd99232de5e6cb876f19e18aa38`。
- 重启后重复分发返回 `reused`，document/chunk 不变。
- 停止 memory plan 后执行只读 Recall：`recall_bbb1a75a1ddac3708c7791969e86d435b7063f994e44f4fc3f1473219da6556f`；能读取 pnpm 记忆，但 planner event 数不增加，plan_run 保持 stopped，Recall 不会自动恢复执行。

## 三、共享回归

- `pnpm build && pnpm test`：**29 个测试文件、105/105 通过**。
- `node scripts/phase4_memory_acceptance.ts`：`gate=pass`；原 pnpm document 保持 superseded，yarn 当前版本与 supersedes 链不变，历史 Recall、Planner 只读边界和原文不写回均保留。
- `node scripts/phase4_dsh_acceptance.ts --verify`：`gate=pass`；两个 Option、真实 reviewer session、DSH/OpenCode/cross-DSH stop 状态及原事件 ID 均可回查。
- RocksDB 集成、字段迁移、Phase 3 迁移、原七工具、J/≺、修订与日常记忆测试均包含在 105 项最终回归中。
- 初次全量运行曾因 9075 调试探针未退出而污染 RocksDB 测试；关闭探针后该文件独立 3/3 通过，最终全量 105/105 通过。该环境问题未通过修改业务断言或删减测试规避。

## 四、mnestic 事务语法实证

本次探针确认并修正了三个实现细节：

1. 多个写操作必须分别置于 imperative block `{ ... }` 中；裸写多个 `?[...]` 会被视为重复非 Horn 规则，而不是可靠的多写事务。
2. 常量规则的 `$decision/$outbox/$row` 参数必须是行集合，单行也需再包一层数组。
3. nullable `lease_expires_at` 使用 `(lease_expires_at ~ 0.0) >= $now`，避免空值比较导致求值错误。

活跃 lease 的 `:ensure_not` 失败会使同事务的后续 `:put` 不提交；decision/outbox 的注入失败测试确认两张表均回滚。

## 五、边界与未实现项

- P4-3 使用受控 decision 验证调度与故障语义；未把该脚本冒充新的真实 LLM 会话。既有 OpenCode/DSH 真实 LLM 证据由上述持久化共享回归再次核验。
- 当前交付是共享、持久化、有限生命周期 runtime 内核，不是完整 24/7 持续服务；宿主常驻 worker/Supervisor 仍按后续路线实施。
- P4-4 SuperAgent 隔离探针、P4-5 Sidecar Mapping、HEA-Lens 全量批次和 Phase 4 整体验收尚未完成。
- R4 仍阻塞；未注册 memory_why/query_achievable/certify，未虚构 semantic score、校准指标、奖励或货币成本。
