# ADR-0001：facts.status 词表与信念状态机（in / out / retracted）

- 日期：2026-09-24
- 状态：**已被 ADR-0002 取代**（同日；0002 发现本方案与手册 §2.1 确定词表冲突：retracted 与 out 冗余、缺 contested/archived。内容保留备查，其「一列一框架」「原因为开集不进枚举」「结构承担镜像态」三条原则被 0002 继承）
- 触发：HEA-Lens-1540 导入映射（手册 §2.1）定稿 `status="in"`，与暂定值 `["active","retracted"]` 冲突（勘察报告 §8-a 的阻塞项）。
- 相关代码：`src/memory/schema.ts`（`FACT_STATUSES`）、`src/api/memory.ts`（默认值）、`schema/03_justifications.cozo`（J 活性边）。

## 决策

`FACT_STATUSES = ["in", "out", "retracted"]`，`memory_set` 缺省值 `"in"`。状态机：

| 值 | 语义 | 谁能翻动它 |
|---|---|---|
| `in` | 在信（当前持有；唯一初始态） | 导入/推导产生 |
| `out` | 失信（requential 传播计算的结果） | requential 可自动双向翻（out ⇄ in） |
| `retracted` | 撤下（事件驱动的固化态：人为裁定、血缘撤稿等） | requential **不得自动复活**；回 in 需显式平反 |

转换：`in → out | retracted`；`out → in`（传播）；`retracted → in`（仅显式平反）。

镜像对称性：「钉在 in」的态（需显式撤下才能离开 in）= **前提事实（premise）**，由结构表达而非枚举 —— 无 J 边（`jPremiseIds=[]` 且 `jRuleId=null`）的事实没有可塌的辩护，传播打不掉它；唯一出局方式是显式撤下。

分层：边活性在 `justifications.active`（requential 翻），节点立场在 `facts.status`，撤下/平反事件（原因、操作者、时间戳）另记事件（存放处 Phase 2 定：候选为第八张表或 `layer="meta"` 的 facts 行）。

## 理由

1. **一列一框架。** `facts.status` 属「信念成员资格」框架（描述命题是否被持有），故取 JTMS 词汇 `in/out`；「记录生命周期」框架（active/retracted 的原籍）在行级是退化的 —— 记录失效由「行更替」（旧行 retracted/out + 新行 in，各自带血缘）表达，不需专门词汇。
2. **对齐 JTMS。** J 系（`j_premise_ids`/`j_rule_id`）即 justification 结构；`requential`（Phase 2）即 TMS 传播层 —— 前提失信 → 关掉依赖它的 J 边 → 辩护全塌的节点出 out。`in/out` 是这套结构的原生词汇。
3. **`retracted` 的功能轴是防复活，不是区分人机。** 血缘撤稿场景：前提碰巧仍在信时，纯 `{in,out}` 会被传播**自动算回 in** —— 撤稿事实不得自动复活，故需要固化态 `retracted`。
4. **撤下原因是开集，不进枚举。** 人为、血缘撤稿、证据矛盾、supersede……新原因会持续出现；编码进取值会导致白名单反复变更。原因作为事件数据记录（开集），枚举保持闭集。
5. **一致性由状态机定义达成，不靠词源纯洁；只为真实存在/路线图上确定的机制设状态。**

## 备选方案与拒绝理由

| 方案 | 拒绝理由 |
|---|---|
| 维持 `{active, retracted}` | 违背手册 §2.1 定稿；active 本身只是骨架期的暂定占位 |
| `{in, out}` 纯 B 框架 | 缺防复活固化态，血缘撤稿会被传播误复活 |
| `{in, retracted}` 混血 | 缺传播计算态，Phase 2 requential 无法表达「失信但可自愈」 |
| 拆两列（status × lifecycle） | 叉积退化：4 组合中 `in ∧ retracted` 矛盾，有效态仅 2 —— 两列承载一个比特，反而制造不一致；血缘框架已有 lin 系四个一等列承载 |

## 后果

- 默认值 `"active"` → `"in"`（关键同步点：只改白名单不改默认值会导致缺省写入全部被门拦）。
- 存量 S01 数据（4 条，`status="active"`）：Mem 引擎无持久化，重启实例重跑 `schema/apply_all.sh` + `scripts/seed_s01.ts` 即刷新，无迁移负担。若将来换持久化引擎后再改词表，需 `:update` 迁移。
- Phase 2 设计 requential 时须定：事件存放处、`retracted` 对 J 边活性的压制语义（被 retracted 的节点即使边全活也不回 in）。
- 若将来给 facts 表加 TxTime 列以启用 `:reconcile`，需重新评估 `out` 与 TxTime 信念集的关系（当前 facts 无 TxTime，`:reconcile` 不可用）。

## 落地改动清单

- `src/memory/schema.ts`：`FACT_STATUSES` 三值 + 状态机注释；`FactInput.status` 注释。
- `src/api/memory.ts`：缺省 `?? "in"`。
- `README.md`：status 行。
- `docs/hea-lens-survey.md`：§8-a 待决项关闭。
