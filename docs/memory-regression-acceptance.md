# 日常记忆共享回归与增量验收包

- 日期：2026-11-15
- 适用范围：Phase 4 P4-1M 之后的所有功能增量、宿主适配、版本发布和治理变更
- 基线：P4-1M 真实 OpenCode 双会话验收及 27 个测试文件、93 项测试

## 一、执行原则

每个增量必须同时提供三类证据：

1. 增量自身功能验收；
2. 与记忆捕获、Recall、修订、权限和恢复的交互验收；
3. 既有记忆场景回归，证明旧事实、原文、J/≺ 和治理结果未被改写。

内部函数和单元测试不能替代真实宿主验收。涉及模型可见行为的增量必须使用独立 RocksDB 和真实 LLM 会话；故障与冲突场景使用独立 Mem/RocksDB 和临时 Markdown 根目录，不修改生产数据。

## 二、每次必跑的共享回归

### 捕获与跨会话召回

- 会话 A 显式保存项目决策，会话 B 自动召回并给出正确 memory_uri。
- 同一输入重复捕获，不产生重复 document/chunk/fact。
- 未结构化的日常叙述可作为 DocumentProjection 召回，不强行生成治理事实。

### 修订与失效

- 修订后新会话使用 superseding 版本，旧版本不再作为当前建议，但历史查询仍可取得。
- `out/revoked/superseded` 默认不进入当前建议；`contested` 必须带警告。
- 外部原文变化产生 `mapping_stale`，原文不被 Bridge 修改，旧事实不被自动覆盖或删除。
- source link 与 J/≺ 不混用，R4 和 97 条待复核记录不因召回提升证据等级。

### 权限与安全

- 项目 A 的记忆不得注入项目 B，敏感路径不进入投影、向量、候选或日志。
- 恶意笔记中的命令仅作为参考文本，不执行，不修改 AGENTS.md、工具、模型或权限。
- Planner 只读召回不得扩大 mandate，不得直接 capture/revise/settle/revoke。

### 幂等与保留

- 同一 message 的自动注入不重复，工具 continuation 复用 Recall。
- 重复 deliver/start/apply 不产生重复权威写入或外部副作用。
- OpenCode 重启、插件卸载/重装和派生索引重建后，原文、持久映射和治理状态保留。

### 降级与审计

- Recall 超时或 MemoryCore 不可用时不阻断普通编程会话，不注入未校验旧缓存。
- 保存 Recall 请求/结果、实际注入、message ID、策略版本、降级原因和修订链。
- 未观测 semantic score、reward、rationale 和成本保持 null/uncalibrated，不补写。

## 三、增量专用场景

| 增量 | 必增日常记忆场景 |
|---|---|
| P4-2 DSH 同切片 | DSH 与 OpenCode 对同一 document/fact 返回一致内容、状态、来源和冲突标注；跨 host 修订在下次 Recall 生效 |
| P4-3 共享调度与恢复 | 崩溃、lease、重复 trigger、timer 不造成重复捕获或执行；wait 不调用 Planner；stop 后不再通过 Recall 自动恢复 |
| P4-4 SuperAgent 隔离探针 | Ticket/Assignment/Input 映射正确，重复 start/deliver 不重复记忆副作用，探针不冒充正式持续服务 |
| P4-5 Sidecar Mapping | 不从记忆补写源 Agent 未暴露的 rationale/model/reward；real/simulated/sidecar 证据隔离 |
| P4-6 日常记忆 STOMP 最小闭环 | capture/revise/Recall 刷新均经原生 Option；chunk 直接作候选来源；pre/post 与 anticipation 分离；崩溃不重复写入、不伪造 Model 事件；真实双宿主新会话通过 |
| P5-1 持续 runtime | runtime 重启、Planner 替换和 host 退出后 Recall/修订/幂等链可恢复；同一 subtask 不并行决策 |
| P5-2 SuperAgent 正式适配 | Ticket 内召回与 OpenCode 一致；Attention 前不落地；人工 stop 后不再自动捕获或恢复记忆驱动执行 |
| P5-3 决策链导出 | memory_why 同时回查逻辑推导、原文 source link、Recall/修订和 Ticket/Assignment，不把不同边混为一类 |
| P5-4 持续记忆适配 | OpenCode 修订在后续 Ticket deliver 生效，SuperAgent 修订可被 OpenCode 召回；重复 deliver 不重复执行 |
| handoff | Recall/document/chunk/candidate/approval/lease/revision 跨 harness 连续，目标权限不足时 blocked，无双 lease、无重复副作用 |
| P6-1 主动规划 | 主动发现只产生维护候选，未经 mandate/Attention 不改变权威记忆；人工 stop 持续有效 |
| P6-2 认证 | Recall 命中、projection loaded、抽取器自评均不等于 achievable；simulated/sidecar 不进入真实认证 |
| P6-3 RL-ready | 导出 memory_uri/recall_id/revision/approval 和真实执行事件，未知 state/reward/rationale 不补写 |
| P6-4 主动记忆治理 | 长期 Ticket 的维护候选、Attention 批准、stop、跨 harness 恢复和回滚通过，历史不被篡改 |
| Skill 扩展 | `projection_loaded` 不等于执行成功；probation 不自动发现，revoked 不因历史记忆重新加载；版本和 active_release 一致 |

## 四、每次发布必须记录的指标

- 重复 message 注入数和重复权威写入数：0；
- 跨项目泄漏、敏感路径索引、自动 AGENTS.md 修改次数：0；
- 来源正确率、修订后旧结论误用次数、失效记忆注入次数；
- Top-K 召回率、冲突展示正确率；
- 实际注入 token、p50/p95 检索延迟、索引重建时间、索引体量和真实模型成本；
- 真实宿主双会话/修订会话 ID、Recall 事件和数据库核验结果。

未建立新基线前不宣称准确率提升。每个版本分别归档“增量功能结果、共享回归结果、未实现项和遗留风险”，不得以一次正常演示替代故障与恢复验收。
