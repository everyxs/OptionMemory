# Phase 1 性能基线与 R1–R3 部分验收记录

- 日期：2026-11-01
- 范围：**R1–R3 部分闭包**。R4 暂缓，本文不是完整 R1–R4 验收。
- 实例：mnestic 0.17.0，RocksDB，`127.0.0.1:9070`
- 适配层：`mnestic-mem-adapter` debug 构建（dev profile）
- 跑数脚本：`scripts/bench_phase1.ts`
- 数据基线：6,314 facts、1,405 条 active J 边

## 1. 测量方法

每项运行 3 次取中位数。当前 701 行派生已完成，因此闭包测量为**幂等重放路径**（查询存量键、跳过 facts/J 边），不是首次插入性能。首次 701 行 R1/R3 插入耗时另列作参考。

测量项：

1. 701 行 R1/R3 部分闭包；
2. `deriveClosure({entity:"S01"})`；
3. S01 `phase_structure` 血缘查询；
4. 701 行 `smix` ↔ `ref_smix_v2` 自连接查询。

## 2. 数值结果

| 指标 | 3 次样本（ms） | 中位数 | 判定 |
|---|---|---:|---|
| 首次 701 行 R1/R3 插入（Step 4 单次记录） | 1,107.3 | 单次值 | 参考；远低于 5 分钟 |
| 701 行幂等部分闭包 | 910.264 / 691.492 / 665.185 | **691.492 ms** | 通过；完整 R1–R4 指标待 R4 恢复后补测 |
| S01 范围幂等闭包 | 701.519 / 707.414 / 671.798 | **701.519 ms** | 记录 |
| S01 血缘查询 | 46.753 / 30.723 / 29.391 | **30.723 ms** | 记录 |
| 701 行 smix/v2 自连接 | 20,812.542 / 22,307.127 / 19,531.020 | **20,812.542 ms** | **性能风险，需优化后再高频使用** |

说明：

- S01 范围闭包与全量闭包都需要读取存量 `(predicate,args)` 幂等键，因此 S01 范围并未呈线性缩小。
- 701 行双 `*facts` atom 自连接约 20.8 秒，当前不适合交互式或高频调用。后续应在保持 CozoScript 集中于 MnesticClient 的前提下，评估查询改写、索引策略或应用层按键连接，不能用绕过服务层的写入规避。
- 完整 R1–R4 闭包 `<5 分钟` 的目标保留，R4 恢复后另行测量。

## 3. 数据快照

| 项 | 数量 |
|---|---:|
| facts | 6,314 |
| `candidate_solid_solution` | 702（S01 + 701 HEAL） |
| `smix` | 702（S01 + 701 HEAL） |
| `delta` | **0（R4 暂缓）** |
| active rules | **3（R1/R2/R3）** |
| options / subtasks / models | 1 / 1 / 1 |
| justifications | 1,405 |
| `active=true` J 边 | 1,405 |
| `active=false` J 边 | 0 |
| `original_match` | 604 |
| `corrected_pending_source_review` | 97 |

## 4. R1–R3 部分验收清单

### A. 交付物

- [x] v3 schema 已应用：`options.option_type/template_id`，空 `plan_templates` 已建。
- [x] `src/runtime/deriveClosure.ts` 与 R3 descriptor 实现完成。
- [x] 注册 API、共享客户端、资产类型及真实 mnestic 集成测试完成。
- [x] `scripts/seed_phase1_assets.ts` 完成 S01 派生与 1:1:1 绑定。
- [x] `scripts/derive_descriptors.ts` / `check_descriptors.ts` 完成 HEA 推导与核查。
- [x] `docs/phase1-rules-spec.md`、`docs/phase1-reference-correction-plan.md` 已归档。
- [x] 本基线已归档；OpenCode/DSH 共享工具契约不影响本阶段核心验收。

### B. 功能

- [x] B1：S01 三查询全部返回期望结果；R2 含两个 XRD 前提，`active=true`。
- [x] B2：701 行 smix 落库，701 行 candidate_solid_solution 落库；无 delta 派生。
- [x] B3：smix/v2 内部一致率 **701/701**；604/97 分组逐行核对无误；未将 v2 表述为独立外部验证。
- [x] B4：seed、R3 v2 修复与派生脚本重跑均 inserted=0。
- [x] B5：`pnpm test` **26/26** 通过。
- [x] B6：option 为 `atomic`、`template_id=null`，subtask/model 绑定正确，状态 `probation`。

### C. 数据与质量红线

- [x] R1–R3 在库且 status="in"；R4 未注册。
- [x] 所有 S01 派生行的 premise_ids 均与 facts 中实际 id 一致。
- [x] 原始 `ref_smix` / `ref_delta` 未修改；v2 与质量记录血缘可查。
- [x] R4 阻塞已明确记录，未凭经验选择半径表，未输出伪造的 delta>0.06 验收计数。
- [x] 写入均经服务层与 ν 门；未发现新的业务层 CozoScript 拼接路径。
- [x] R4 暂缓和部分验收未冒充完整 Phase 1 关闭。

## 5. 验收结论与保留事项

**R1–R3 部分人工验收已于 2026-11-01 由用户确认完成。**

以下事项必须保留到后续阶段：

1. R4 原始生成公式、半径表与成分精度仍需追溯；未解除阻塞前不得批量派生 delta。
2. 97 行 `corrected_pending_source_review` 仍需来源复核，不能作为独立认证证据。
3. 完整 R1–R4 闭包、对拍、delta>0.06 计数和性能基线尚未完成。
4. smix/v2 自连接约 20.8 秒的效率问题经用户决定**暂缓优化**，转入路线图 §9.8 的未来访问路径自演进评审。
5. 本记录不包含 Phase 1 正式关闭签署；完整关闭须待 R4 恢复后补齐验收。

| 角色 | 验收项 | 日期 | 签署 |
|---|---|---|---|
| 执行人 | R1–R3 部分验收 A–D 全部通过 | 2026-11-01 | 用户授权，Kimi Code 代记 |
| 子课题2 负责人 | 红线复核与 R1–R3 部分验收批准 | 2026-11-01 | 用户授权，Kimi Code 代记 |
| 子课题2 负责人（R4 恢复后） | 完整 R1–R4 验收与 Phase 1 正式关闭 | 未进行 | 未签署 |

> 2026-11-01：用户明确要求完成 R1–R3 部分人工验收，由 Kimi Code 代记。
