# Phase 4 P4-5 Sidecar Mapping Contract v0.1 验收

- 日期：2026-11-17
- 状态：P4-5 通过；Phase 4 原基线与整体验收尚未全部关闭，不能提前进入 Phase 5 签署
- 数据边界：独立临时 RocksDB，完成后删除；未修改生产 9070
- 可重复入口：`pnpm build && node scripts/phase4_sidecar_acceptance.ts`
- 机器证据：`.data/phase4-sidecar-acceptance-result.json`

## 一、交付范围

- `src/api/sidecar.ts`：scenario/run/tool/call 到 subtask/planner/option/model 事件的确定性映射。
- `schema/13_sidecar_events.cozo`：保存完整源 payload、baseline、external_id、mapping_version、映射引用和 unmapped 原因，不复制第二套控制状态。
- `src/memory/mnesticClient.ts`：sidecar raw 与 observation 查询；`host_type=sidecar` 用于明确区分外部轨迹。
- 完整链可投影原生事件；不完整链 raw-only，未注册资产不创建占位记录。
- raw-first 恢复、重复事件防重、冲突 payload 拒绝覆盖、baseline 隔离、未知 rationale/reward/model 的 null 语义。
- `tests/sidecar-mapping.test.ts`：6 项测试覆盖完整/不完整链、零奖励、证据来源、冲突重放、raw-only 崩溃恢复和五项技能测量。

## 二、独立 RocksDB 验收

最终运行时间：`2026-11-17T10:17:31.752Z`，输出 `gate=pass`，完成两次真实适配器进程重启。

### 1. raw 崩溃恢复与 real 源轨迹

- baseline：`baseline-p45-real`。
- run raw：`sidecar_event_ea48b292ebefa8216439eaae2414153b2cc63b1b4a6e60947f5b98c59b6d6729`。
- plan_run：`plan_run_c0d1ea12d694b735cbdb56d4ce872cabe8b0c73e5d57c4e823fb17a9f1e9793c`。
- planner_event：`planner_event_35771a8342c356a6e4f43148c457898302916e031b8fb4fb4daffa940ab3f139`。
- sidecar option_event：`option_event_1b358b1e1bd277b47c51e2ba1f7a2aac9ebbcb67f5ed89881a614f058bb009f6`。
- 故障注入只保存 tool.call raw 后重启；重发同一事件成功补齐 option_event，raw `created_at=123` 未改写。
- 源未提供 rationale/reward：rationale=`null`，scalar_reward=`null`，reward_source=`uncalibrated`；input/output 共两条 observation。
- 源声明 `observed_execution_mode=real`，但映射 `mode=sidecar`；独立原生事件 `option_event_native_real_p45` 在两次重启后仍保持 `mode=real`。

### 2. simulated、baseline 与显式零奖励

- baseline：`baseline-p45-simulated`。
- plan_run：`plan_run_1d816ac13a2d1f9dbfa951d2113f4d12e5bf9be9db29583ed40b14e979c12f59`，与 real baseline 不同。
- option_event：`option_event_e19fef3a2acb8d30c586b6c67e853a182b58117aa0f869eab66cbd2e8012972c`。
- 执行记录为 `mode=sidecar`、`observed_execution_mode=simulated`。
- 源显式 rationale=`source stated rationale` 被保留；显式 reward=`0` 被保留为 `scalar_reward=0`、`reward_source=observed`，没有误判为未知。
- 两个 baseline 使用相同外部 scenario/run/call/external IDs，raw、plan_run 和 option_event 均不同；simulated baseline 保留四条完整链事件，real baseline 另含六项测量事件，共十条。

### 3. 不完整链与未知 model

- raw：`sidecar_event_6f424f1a2cc56ccca4b82eed429dc8ea734fc352ea21bf40440a1d156eb9ed86`。
- 缺 plan_run 时返回 `gate=pass` 和 `unmapped=[plan_run_missing]`，plan/option/model 引用均为 `null`。
- 源 `model_id=unknown-model` 仍在原始 payload 中，但未创建未知 Option/Model 占位资产。
- 单元测试另覆盖缺 mandate、缺 option_event、冲突 payload 和不同 baseline 的完整隔离。

### 4. 记忆、原文与 plan template 边界

- sidecar 重放和两次重启未隐式创建日常记忆；显式捕获仍只有 `document_3089a4d30ce8cec75f8807945e7e995a9d86c27dfb8cdcdd3778cdbf05a64b48` 一份。
- 重启后 Recall=`recall_4dfdfee5f81568bef8ecd83d45ebaf65d7c0c83985ad1c0c353f492b2f28bea1` 正常返回 pnpm 记忆。
- 相同 external_id 携带变化 payload 被拒绝，不覆盖原 raw。
- `plan_templates` 数量保持 0，没有从调用序列反推模板或补写决策理由。

## 三、共享回归

- `pnpm build && pnpm test`：**31 个测试文件、117/117 通过**。
- `node scripts/phase4_memory_acceptance.ts`：`gate=pass`；原 pnpm 修订链、yarn 当前版本、Recall 去重、Planner 只读和原文不写回保持不变。
- `node scripts/phase4_dsh_acceptance.ts --verify`：`gate=pass`；原 Option、真实 reviewer、跨宿主 stop 和事件 ID 保持不变。
- scheduler、SuperAgent 探针、RocksDB、字段迁移、原七工具、J/≺、修订与日常记忆均包含在最终 117 项回归中。

## 四、边界与后续

- P4-5 使用显式构造的源轨迹验证映射语义，不冒充生产 Agent 集成或真实认证证据；real/simulated 只是源声明，统一隔离为 sidecar。
- `sidecar_event` 是新增的原始投影表；本次只完成独立 RocksDB 验证，未执行生产 9070 schema 迁移。
- P4-0 至 P4-5 的 Planner 增量步骤均已完成，但 Phase 4 原基线仍有 HEA-Lens 批量导入、完整解析/结算和双 host v0.2.0 升级保留项，整体验收不能据此自动签署。
- Phase 5 持续 runtime、正式 SuperAgent 适配、memory_why 与决策链导出尚未实施；Phase 6 认证与 RL-ready 不在本次交付中。
- R4 仍阻塞，97 条待复核记录未进入独立认证，未虚构模型能力、奖励、成本或校准指标。


## 五、五项技能测量扩展验收（2026-11-17）

本轮舍弃第六项组合 DAG，只扩展前五项必要信息。Option 新增可空 `created_at / parent_option_id / parent_version / origin_event_id`；其余继续复用 subtask_event、option_event、model_event 和 revision。

最终扩展验收时间：`2026-11-17T10:17:31.752Z`，脚本输出 `gate=pass`，`five_skill_measurements=true`。

1. **新技能产生**：`skill-registered` 事件 `sidecar_event_bea3b46112eb7eaa1a60b596bf3fb67421bec070d9c380b7ef0ad00135d38ea8` 与 Option 的 created_at=100、parent_option_id、parent_version、origin_event_id 一致；更新事件为 `sidecar_event_a17a435388d15fba0f00dc0be247f626b4ba87a3845e2174f0bf8e8c06f412eb`。
2. **合适时机调用**：execute decision 关联预期 Option；`planner_event_828c8bc5efe28351a7ac50fb39ed26e55ba12c43f703b820e54602a752a2b8eb` 为显式 ignore，未产生 option_event，支持未调用分析。
3. **解决旧问题**：恢复执行 `option_event_6efa0e9a4d7f718fc556514b87e550d08f83fa87b74f731f5888b1f16f545858` 具有独立 verification；`model_event_3c655b975c61967fc4c46b600f3fbb779bb8c85e7e0c769f38d1a4d89dbffd56` 保存 verifier、verdict 和指向前次 option_event 的 evidence_refs。
4. **环境变化与遗忘**：恢复执行包含 environment observation，观测 Option/Model 版本分别为 1.0 和 theta-1；`model_event_7c89faa67be0442f7b2623119a82af54075b146e3e726a2e04cde9ad2e28f8fc` 为 drift，保存环境变化及恢复语义。
5. **回滚后重新启用**：回滚证据 `sidecar_event_de2512bb250e60229fafc9efb17a3f7d88d78482a06e88d479e8117151aff48a` 关联 revision；恢复 option_event 的 lifecycle_ref 指向该回滚事件，drift 自动继承同一引用，不要求结果事件重复传值。

real baseline 由原四条完整链事件扩展为十条（新增注册、更新、未调用、回滚、恢复调用和恢复结果），第二次真实重启后数量及全部关联保持不变。独立 DSH 旧库另完成备份后增量迁移，新增字段为 null，原 Option/Model 各两行、决策、reviewer 和 stop 事件均保留，DSH verify 再次输出 `gate=pass`。生产 9070 未执行迁移。
