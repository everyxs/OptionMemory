# Phase 4 原基线与 Planner 增量整体验收

- 日期：2026-11-19
- 状态：**Phase 4 Repo 验收通过并关闭；v0.2.0 双 host 交付完成（执行验收）**
- 版本：`package.json` / `dsh.plugin.json` 均为 `0.2.0`；原记忆治理工具仍为 7 个，Bridge 与 Planner 契约独立
- 数据边界：全量批次、故障和迁移验收使用独立 RocksDB；真实 v0.2.0 host 批次使用独立 9173；生产 9070 未参与本轮写入或故障测试
- 机器证据：`.data/phase4-csv-acceptance-result.json`、`.data/phase4-v02-host-acceptance-result.json`、`.data/phase4-v02-upgrade-retention-result.json`

## 一、最终关闭范围

| 验收区 | 结果 | 最终证据 |
|---|---|---|
| A. 原基线：CSV、HEA-Lens、闭包/J、transient 结算、v0.2.0 双 host | 通过 | 本文第二至五节 |
| B. P4-0 字段权威、迁移与回滚 | 通过 | `docs/phase4-field-authority.md`；本轮另完成旧 OpenCode 库血缘迁移 |
| C. OpenCode/DSH Planner 与原生 Attention | 通过 | `docs/phase4-opencode-acceptance.md`、`docs/phase4-dsh-acceptance.md` |
| D. 持久化 inbox/outbox、lease、timer、stop 与恢复 | 通过 | `docs/phase4-scheduler-acceptance.md`；2026-11-19 重跑 `gate=pass` |
| E. SuperAgent 隔离探针与 Sidecar Mapping | 通过 | `docs/phase4-superagent-acceptance.md`、`docs/phase4-sidecar-acceptance.md`；不冒充正式 SuperAgent 服务 |
| F. 日常记忆与共享回归 | 通过 | `docs/phase4-memory-bridge-acceptance.md`、`docs/phase4-memory-stomp-acceptance.md`、`docs/memory-regression-acceptance.md` |
| G. P4-6 原生 STOMP 与最小 NativeAdapter | 通过 | 2026-11-19 `node scripts/phase4_memory_stomp_acceptance.ts` 返回 `gate=pass` |

原 Week 9–12 清单 A–G 现已全部完成。正式 SuperAgent 持续适配、Phase 5/6、R4 和完整 MVP 不在本次关闭声明内。

## 二、CSV → facts → 闭包 → J 血缘

实现：

- `src/runtime/csv-materials.ts`：通用 S01 CSV 与 HEA-Lens 映射；保留成分源文本格式，写入 `composition / process / xrd_peak / hardness` 及 HEA-Lens 五类原始事实，包括原始 `ref_delta`。
- `src/runtime/deriveClosure.ts`：新增 `entities` 作用域，批次只对本次实体运行活动规则，不触发全库无关派生。
- 解析后经原 `memory_set_batch` 服务层写入，再执行活动 R1–R3；所有派生 ID 必须具有 active J，输出 `lineage_complete=true` 才算完整成功。
- R4 未注册，未派生 `delta`；`ref_delta` 只保留原始参考值，不冒充 R4 恢复。

可重复入口：

```bash
pnpm build
node scripts/phase4_csv_acceptance.ts
```

真实 HEA-Lens 文件共 1,540 行，经持久化 outbox 执行并重启 RocksDB 后核验：

| 项目 | 结果 |
|---|---:|
| 可导入实体 | 701 |
| HEA-Lens 原始 facts | 3,502 |
| HEA-Lens R1/R3 派生 facts | 1,402 |
| HEA-Lens 新增 active J | 1,402 |
| S01 原始 facts | 5 |
| S01 R1–R3 派生 facts / J | 3 / 3 |
| 重启后 facts 总数（S01 + HEA-Lens） | 4,912 |
| 重启后 active J 总数 | 1,405 |
| `composition` | 702 |
| `candidate_solid_solution` / `smix` | 702 / 702 |
| `alloy_name` / `ref_smix` / `ref_delta` | 701 / 701 / 701 |
| `source_ref` | 698 |
| `delta` | 0 |

幂等 replay 返回 `reused`，重启后各计数不变。S01 的 `phase_structure` 具有两个 XRD 前提和 active R2 J；原始 `composition` 的 `lin_actor=parse_csv_materials`、`lin_version=materials-csv-v1`。

关键 ID：

- S01 planner event：`planner_event_b2c401c8ceb89838be503c070f65ead42298f95bc460c3e0d39293f4cf02d308`。
- S01 option event：`option_event_c8aa56392f0d8a1dec96e8b0be9ecb7fcc06807eed3e1568a54959f9ed01d5bf`。
- HEA-Lens planner event：`planner_event_bbaa210a3eead4455408ff8af9e14d58eabeb38c85075ba9c9355fdb70451676`。
- HEA-Lens option event：`option_event_6727da3c99232f265936bab8c10199e9c84b6c1f78e01ae26a865acb41839345`。
- HEA-Lens source SHA256：`541a08e8d1f7c20998323cb19273465a67c865daffb359161f1c06561bae3dc1`。

## 三、transient 结算账本

实现：`src/runtime/transient-settlement.ts` 与 `src/runtime/option-executor.ts`。

账本阶段复用同一治理链，不新建第二套统计权威：

```text
开户：option_event
  → 记账：input/output/error observations + option_event_outcome（真实耗时与状态）
  → 结算：model_event(event_type=calibration, schema_version=transient-settlement-v0.1)
```

每条 CSV settlement 关联 `option_event_id / batch_id / option_id / model_id / option_type / template_id`，记录执行成功率、fact 接受率、原始/闭包/J 计数、parser/evidence mode、真实 `duration_ms` 和未知 `monetary_cost=null`。成功率只描述本次执行，不冒充外部正确率、认证或校准结论。主表不回写第二份派生统计，符合 `docs/phase4-field-authority.md` 的事件权威规则。

- HEA-Lens settlement：`settlement_2b0fa98352617bc339df36a0ef38a82c4fafec0e9b5648aafd63ff616e3ca102`。
- 全量批次实测耗时 875 ms，仅为本机本次记录，不构成性能承诺。
- `getExecutionTrace` 返回本执行的 `modelEvents`；`getOptionEvidence` 返回该 Model 的事件证据。
- 重复执行复用确定性 settlement；删除 settlement 后 replay 仅从持久化证据补回，不重跑解析、不重复 facts。
- 失败批次也写入 `success_rate=0` 的结算，未知计数保持 null。

测试 `tests/transient-settlement.test.ts` 覆盖成功、失败、幂等和缺 settlement 恢复。

## 四、v0.2.0 真实双 host 与数据保留

版本与兼容：

- `package.json` 和 `dsh.plugin.json` 均为 `0.2.0`。
- 原七工具不变；未提前注册 `memory_why / query_achievable / certify`。
- OpenCode 实测版本为 2.3.2，DSH 为 0.2.2-rc.1；三种 OpenCode 插件均成功加载。
- `materials-agent` 的 linked OptionMemory 插件刷新到当前仓库；DSH 使用独立 9173 patch，未连接生产 9070。

真实 OpenCode：

- session：`ses_e0d4b8ebdffeXDDEopbP39fBDI`。
- option event：`option_event_f5187ac105396696a64e68ab481c6334a18425f69bab1ce198250b738ab5f93d`。
- settlement：`settlement_e51a6b793f78efe4768dba8326fd39887b04ba2276cd073e34ee11304a5b2a1d`。
- 日志：`.data/phase4-v02-opencode-run.jsonl`；真实 Planner 调用返回 `gate=pass`、`status=success`、`lineage_complete=true`。

真实 DSH：

- option event：`option_event_cceeeb93b448edd8582293a662897434854d79761298d68c5a963f24d27467dd`。
- settlement：`settlement_f65e7ccade265433afd86dacc1703cfe1434f339c417dba61dd4d70d81bb8c01`。
- 日志：`.data/phase4-v02-dsh-run.log`。
- DSH 模型先以错误 `planner_id` 产生两次 blocked 调用，读取验收脚本后使用 `planner_s01` 成功。只有成功调用产生一个 Option execution；中间失败未被删除或计为成功。
- OpenCode 首次写入 5 条原始 facts 和 3 条派生/J；DSH 对同一 S01 返回 `skipped=5`、闭包 `skipped=3`，形成同一共享事实与血缘，不生成重复副本。

旧库升级与保留：

- 升级前证据：`.data/phase4-v02-pre-upgrade-acceptance-result.json`。
- 升级后证据：`.data/phase4-v02-post-upgrade-acceptance-result.json`。
- 深度比较结果：`.data/phase4-v02-upgrade-retention-result.json`，`gate=pass`。
- 原 plan_run、Planner decisions、Option traces、真实 reviewer session 和跨 host stop 状态逐项一致。
- 旧 OpenCode RocksDB 缺少 Option 创建血缘字段时，先备份至 `.data/phase4-v02-opencode-lineage-backup`，执行 `PHASE4_FIELD_MIGRATION_PASS`，Option/Model 各 2 行不变；最终 `plan_run_phase4_opencode_s01_v10` 验证通过。早期失败 plan 不被误作最终成功 plan。

## 五、全量回归与共享验收

最终实测：

```text
pnpm build：通过
pnpm test：35 个测试文件，128/128 通过
node scripts/phase4_csv_acceptance.ts：PHASE4_CSV_ACCEPTANCE_PASS
node scripts/phase4_v02_host_acceptance.ts --verify：gate=pass
node scripts/phase4_memory_acceptance.ts：gate=pass
node scripts/phase4_dsh_acceptance.ts --verify：gate=pass
node scripts/phase4_scheduler_acceptance.ts：gate=pass
node scripts/phase4_superagent_acceptance.ts：gate=pass
node scripts/phase4_sidecar_acceptance.ts：gate=pass
node scripts/phase4_memory_stomp_acceptance.ts：gate=pass
P4_PLAN_RUN_ID=plan_run_phase4_opencode_s01_v10 node scripts/phase4_opencode_acceptance.ts --verify：gate=pass
```

新增测试：

- `tests/csv-materials.test.ts`：S01 R1–R3/J、HEA-Lens 源文本、`ref_delta`、R4 边界与幂等。
- `tests/transient-settlement.test.ts`：真实结算、失败结算、重放与缺失结算恢复。

本轮全量 CSV 验收使用 `node scripts/apply_schema.ts` 在全新 RocksDB 建表成功。历史 `schema/apply_all.sh` 问题不据此宣称已修复；当前文档入口仍为 `apply_schema.ts`。

9073 回归曾因旧服务进程持有 RocksDB LOCK 启动失败；干净重启后原验收通过。未修改业务断言或跳过该项。

## 六、关闭边界与签署

Phase 4 不扩大为以下声明：

- R4 仍阻塞，97 条待来源复核记录未提升为独立认证证据。
- SuperAgent 仍只有隔离探针；正式持续适配属于后续阶段。
- 当前仍是最小 NativeAdapter，不承诺全类型工具、嵌套 Option、自动 Skill 生成或组合 DAG。
- `memory_why / query_achievable / certify`、生成认证和 RL-ready 属于 Phase 5–6。
- 当前 CSV 成功率是执行观测，不是外部实验正确率、能力认证或真实货币成本。

| 角色 | 结论 | 日期 | 签署 |
|---|---|---|---|
| 执行人 | Phase 4 原基线与 P4-0–P4-6 Repo 验收 A–G 全部通过，v0.2.0 双 host 交付关闭 | 2026-11-19 | Kimi Code CLI |
| 子课题1 负责人 | 双 host、解析、升级与数据保留复核 | | 待签 |
| 子课题2 负责人 | 字段迁移、治理、调度与恢复复核 | | 待签 |
| 子课题3 负责人 | 证据质量、R4、Sidecar 与日常记忆边界复核 | | 待签 |

本文件记录实际实现和执行验收，不代签子课题负责人。
