# Phase 0 验收归档（Week 1–2 出口）

- 归档日期：2026-10-07
- 仓库：optionmemory（dsh-plugin-optionmemory-materials）
- 数据终态：RocksDB 持久化实例（`.data/mnestic`），facts **3506 行**（S01×4 `semantic` + HEA-Lens-1540 ×3502 `knowledge`），全部 `status="in"`，embedding 1024 维全覆盖（伪随机占位，种子 42）
- 对应清单：[[Week1开发手册-五层底座搭建]] 文末「Phase 0 Repo 验收清单」

---

## A. 目录结构验收 ✓ 通过（32/33 + 1 项豁免）

逐路径核对存在性（脚本跑数，非目测）：

- 根文件七件、docs 三件（+ `decisions/` ADR×2）、schema 7 表 + apply_all、scripts 五件、src 四层、tests、`.data/` 全在；
- `.gitignore` 含 `node_modules/` 与 `/.data/`；
- 豁免项：`schema/apply_all.ps1` —— 手册原文「.sh（或 .ps1）」，`.sh` 已满足；
- 树注记勘误已回写：`tests/memory.test.ts` 5 用例 → 9 用例（手册 A 区已改）。

## B. 功能验收 ✓ B1–B9 全过

| # | 项 | 证据（2026-10-07 实测） |
|---|---|---|
| B1 | 双模式启动 | rocks@9070（`persistent:true`）+ mem@9072 临时实例（验后清理） |
| B2 | 七表 schema | `::relations` 七表 + 索引齐全；Mem 恢复流程实证（新实例→apply_all→seed→4 行 PASS） |
| B3 | 六元组齐全 | `scripts/check_sixtuple.sh` 四表逐字段 ✓ |
| B4 | ν 门拦截 | `scripts/check_gate_blocked.js`：缺 linSource → blocked 且不落库，PASS |
| B5 | 非法 status 被拒 | 单测 ⑤（`bogus` 被拦） |
| B6 | batch 幂等 | 重跑导入：插入 0 / 跳过 3502 / blocked 0 |
| B7 | RocksDB 持久化 | 探针写入 → taskkill 重启 → 回查仍在；清理后行数恢复 3506 |
| B8 | HNSW 冒烟 | `scripts/check_hnsw_smoke.ts`：k=5 返回 5 行、含自身 dist=0、字段齐全 |
| B9 | pnpm test | 9/9 全绿 |

## C. 数据验收 ✓ C1–C7 全过

| # | 项 | 证据 |
|---|---|---|
| C1 | S01 基本事实 | `?[predicate, args] := *facts{predicate, args}, first(args) == "S01"` → 4 条 |
| C2 | HEA 导入量 | `?[count(id)] := *facts{id, predicate: "composition"}` → **702** |
| C3 | 参考值就位 | ref_smix 701 / ref_delta 701（与勘察报告 §7 一致） |
| C4 | 成分抽查 | `scripts/check_import_sample.ts`：随机 3 alloy（HEAL0206/0417/0137）与 CSV 逐字一致 |
| C5 | 六元组抽查 | `scripts/check_s01_sixtuple.sh`（抽中 HEAL0001）：必填全 ✓，可空项按设计豁免 |
| C6 | embedding 覆盖 | 非空 3506 = 总数 3506；`eps_source="placeholder-random-seed42"` ×3506 |
| C7 | blocked 清零 | 导入日志：首轮 3502 插入与历次重跑均 blocked=0 |

## D. 质量红线 ✓ 自核通过（待复核签署）

| # | 红线 | 自核证据 |
|---|---|---|
| D1 | 六元组必填字段 | B3 输出 |
| D2 | 绕过 ν 门写入 | src/ 内 CozoScript 全部集中于 `mnesticClient.ts`；三处 scripts 例外已声明（backfill 维护回填 / bench 临时行清理 / mnq 人工查询台），知识写入全走 ν 门；严格收口方案（`memory_update_embedding` / `memory_delete` + mnq 只读化）留待 Phase 6 前评估 |
| D3 | 验收静默跳过 | 无；HNSW 可用已实证，blocked 清零，全部语法冲突当日回写手册 |
| D4 | 速查行号证据 | 81 条「来源：文件:行号」+ §8 补遗实测段 |
| D5 | 实现-手册偏差回写 | 2026-09-24/10-07 回写清单：验收查询 ×8、batch 签名、幂等键、9 用例注记、RocksDB 延后→完成注记、seed 走 batch、import 锁定 .ts、§5.1-5 已测标注 |
| D6 | 框架依赖泄漏 | `src/memory`/`runtime`/`api` 无 cordis/DSH 引用（唯一命中为注释提及配置文件名） |

## Phase 0 总验收清单（手册 §5.2 九项）映射

1. 双模式启动 → B1 ✓；2. 七表+六元组 → B2/B3 ✓；3. 三接口+ν 门 → B4/B5/B9 ✓；4. S01 查询 → C1 ✓；5. HEA ≥701 → C2 ✓；6. 六元组抽查 → C5 ✓；7. HNSW → B8 ✓；8. 性能基线 → `docs/phase0-baseline.md`（5.9ms / 490 条/s，参考线全过）✓；9. 幂等 → B6 ✓

## 过程中产生的决策与口径（备查）

- `docs/decisions/0001`（被取代）/ `docs/decisions/0002`：facts.status 四值 `in/out/archived/contested`；
- `docs/hea-lens-survey.md` §8：导入口径决策记录（占位字段、HEAL 编号、doi 前缀、RocksDB 延后→完成）；
- `docs/mnestic-api-cheatsheet.md` §8 补遗：HNSW 实证（Cosine/1024/vec($v) 形态/回填性能注记）。

## E. 验收签署

| 角色 | 签署项 | 日期 | 签字 |
|---|---|---|---|
| 执行人（vibe coding 操作者） | A–D 全部核对通过 | 2026-10-31 | 用户授权，Kimi Code 代记 |
| 子课题2 负责人 | D 红线复核 + Phase 0 关闭批准 | 2026-10-31 | 用户授权，Kimi Code 代记 |

> 2026-10-31：用户在本轮对话中明确授权完成 Phase 0 签署，由 Kimi Code 代记。
> 签署完成后 Phase 0 正式关闭，Phase 1（Week 3–4：Horn 闭包推导，见 `devNotes/Week3-4开发手册-Horn闭包推导.md`）方可启动。
