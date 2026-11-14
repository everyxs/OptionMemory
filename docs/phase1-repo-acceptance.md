# Phase 1 Repo 验收记录

- 日期：2026-11-01
- 范围：Phase 1 Repo A–D（R4 暂缓期间的部分验收）
- 总结论：**通过（C3 已回填修复并复核）**

## A. 新增交付物存在性：通过

以下文件均存在：

- `src/runtime/deriveClosure.ts`、`src/api/` 注册扩展；
- `scripts/seed_phase1_assets.ts`、`derive_descriptors.ts`、`check_descriptors.ts`；
- `scripts/calibrate_delta.ts`、`repair_ref_smix_v2.ts`、`bench_phase1.ts`；
- `docs/phase1-rules-spec.md`、`phase1-reference-correction-plan.md`、`phase1-baseline.md`；
- `docs/mnestic-api-cheatsheet.md` 补遗；
- `schema/05_options.cozo` v3（`option_type` / `template_id`）；
- `schema/08_plan_templates.cozo`（空表）。

## B. 功能验收：通过

| 项 | 结果 | 证据 |
|---|---|---|
| B1 闭包推导 | 通过 | S01 phase_structure=BCC+FCC，R2 两个 XRD 前提且 active=true |
| B2 批量推导 | 通过 | 701 行 smix、701 行 candidate_solid_solution；delta=0 |
| B3 对拍 | 通过 | smix/v2 内部一致率 701/701；604/97 分组正确，未作为独立外部验证 |
| B4 幂等 | 通过 | seed：BCC skipped=1、派生 skipped=3；v2/quality skipped=701/701；HEA skipped=1404 |
| B5 测试 | 通过 | `pnpm test` 27/27 |
| B6 1:1:1 绑定 | 通过 | atomic、template_id=null、infer_phase_S01、model_infer_phase_xrd_v1、probation |

## C. 数据验收：全部通过

| 项 | 结果 | 证据 |
|---|---|---|
| C1 rules | 通过 | R1/R2/R3 均 status="in"；R4=0 |
| C2 S01 派生 facts | 通过 | candidate_solid_solution、phase_structure、smix 均存在 |
| C3 J 边 | **通过（已修复）** | **2,807 条带 j_rule_id 的派生记录均有独立 active J 边，missing_j=0、bad_j=0** |
| C4 R3 v2 与质量记录 | 通过 | ref_smix_v2=701、reference_quality=701；604/97 分组逐行一致，原值未改 |
| C5 options v3 | 通过 | option_type=atomic、template_id=null |
| C6 plan_templates | 通过 | 表存在且为空 |
| C7 R4 暂缓 | 通过 | delta=0，未输出伪造的 delta>0.06 验收计数 |

### C3 修复明细

- 新增共享 `src/runtime/justifications.ts`，统一 active J 边生成及 `(derived_id, rule_id, premise_ids)` 去重；
- `deriveClosure` 与 `scripts/repair_ref_smix_v2.ts` 已接入同一写入器，避免后续再次漏写；
- 已为 701 条 `ref_smix_v2` 和 701 条 `reference_quality` 回填独立 J 边；
- 回填首次 inserted=1402，重跑 inserted=0 / skipped=1402；
- 当前派生记录 2,807 条，active J 边 2,807 条，inactive J 边 0 条；所有 premise_id 均可回查。

## D. 质量红线：通过

| 红线 | 结果 | 证据 |
|---|---|---|
| D7 R4 口径 | 通过 | 未选定半径表，R4 未注册 |
| D8 写入路径 | 通过 | src 中 CozoScript 仅集中在 `src/memory/mnesticClient.ts`；业务写入均经服务层/ν 门 |
| D9 验收可见性 | 通过 | R4 暂缓与回填前 J 缺口均有明确记录，未将部分验收冒充完整验收 |
| D10 参考值治理 | 通过 | 原始 ref_smix/ref_delta 签名未变化；v2 未作为独立外部正确性证据 |

## 结论

A、B、C、D 全部通过，**Phase 1 Repo 验收通过**。

C3 缺口已按用户要求修复并复核，当前可进入 Phase 2 的依赖锥与修订传播实现。R4 仍按既定决策暂缓；本结论不代表完整 R1–R4 验收或 Phase 1 正式关闭。

## 部分验收签署

| 角色 | 验收项 | 日期 | 签署 |
|---|---|---|---|
| 执行人 | Phase 1 Repo A–D 部分验收通过 | 2026-11-01 | 用户授权，Kimi Code 代记 |
| 子课题2 负责人 | 红线复核与 Phase 1 部分验收批准 | 2026-11-01 | 用户授权，Kimi Code 代记 |

> 用户已明确要求签署 Phase 1 部分验收并开始 Phase 2，由 Kimi Code 代记。
