# ADR-0002：facts.status 词表对齐手册四值（in / out / archived / contested）

- 日期：2026-09-24
- 状态：已接受；**取代 ADR-0001**（in/out/retracted 三值）
- 触发：Day 2 调整计划评审中发现 ADR-0001 与手册 §2.1 表 1、§3.1 的确定词表 `in / out / archived / contested` 冲突（D5 红线级），且路线图 Phase 2/3 给出了四值各自的机制背书。
- 相关代码：`src/memory/schema.ts`（`FACT_STATUSES`）。

## 决策

`FACT_STATUSES = ["in", "out", "archived", "contested"]`（与手册 §2.1 表 1 一致），缺省值 `"in"` 不变。

| 值 | 机制背书 | 语义 |
|---|---|---|
| `in` | Phase 0/1 导入、推导 | 在信（唯一初始态） |
| `out` | Phase 2：`memory_retract`「单事实标 out，操作入 ≺」；验收场景实证人工撤下与传播失信同标 `out`；`restoreFact` 显式恢复 | 失信（原因与操作者入 ≺ 血缘记录，不进枚举） |
| `contested` | Phase 3：ν-gate 冲突检测「冲突双方置 contested，派生锥暂停」 | 悬置（隔离待 settlement 裁决；非信非拒） |
| `archived` | 手册声明「archive ≠ erase」（Phase 3 验收场景，options 侧实证可查） | 退役留档：不参与推导、可查询；facts 侧产生机制（数据集版本更替）尚在未来，先备词表 |

## 为什么取代 ADR-0001（`retracted` 之废与 `archived/contested` 之立）

1. **`retracted` 与 `out` 冗余**：ADR-0001 为 retracted 辩护的「防复活」功能，在本架构中已由结构承担 —— 前提事实无可塌辩护（传播打不掉）、`restoreFact` 仅显式调用、推导复活由 `rules.status` + `justifications.active` 边层控制。路线图 Phase 2 的 `memory_retract` 直接以 `out` 为交付，原因入 ≺。
2. **`archived` ≠ `retracted`，本质区别**：retracted = 因故撤下（信念判断："错了/来源垮了"）；archived = 到期退役（生命周期判断："未必错，不再活跃，留档可查"）。手册 models 表同列 `retracted` 与 `archived` 二值（`settled/probation/retracted/archived`），证明作者刻意区分；facts 表的因故撤下由 `out` 承担，故只需 `archived`。
3. **`contested` 不可省略**：冲突悬置有 Phase 3 机制背书，ADR-0001 三值无法表达「非信非拒、派生锥暂停」的隔离态。
4. **对齐方向**：实现向手册对齐（D5 红线消解），而非手册迁就实现。

## 后果

- 已落地的 S01/HEAL 数据仅用 `"in"`，不受词表变更影响；Mem 引擎重 seed 即一致。
- Phase 2 设计注意：`memory_retract` → `out` + ≺ 操作记录；`contested` 的进入/退出由 Phase 3 ν-gate 与 settlement 决定；`archived` 的 facts 侧产生机制（如数据集版本更替流程）待立项。
- models 表词表（含 `retracted`）与本决策无关，不动。

## 落地改动清单

- `src/memory/schema.ts`：`FACT_STATUSES` 四值 + 注释按手册语义重写。
- `docs/decisions/0001-fact-status-vocabulary.md`：标记「已被 0002 取代」（内容保留备查）。
- `README.md`：status 行同步。
