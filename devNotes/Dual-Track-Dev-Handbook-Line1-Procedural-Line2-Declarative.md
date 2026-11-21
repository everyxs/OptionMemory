---
创建时间: 2026-11-18
更新时间: 2026-11-19
类型: Development handbook and developer onboarding (Dual-Track v5.4, English edition)
所属项目: "26-04 AI4Science"
对应路线图: "S01 Minimal Product Roadmap (full edition) §3.1A / §10.4B / §11.5B / §17; Week13-14 and Week15-16 handbooks, subject to §0.2 overrides"
状态: v5.4 onboarding and gate-reconciled edition; Phase 4 closed and Repo-accepted; Stage A next
tags:
  - dev-handbook
  - developer-onboarding
  - dual-track
  - v5.4
  - procedural-governance
  - declarative-ingestion
  - dataStore
  - OptionMemory
术语表:
  说明: >-
    Canonical vocabulary of this English edition. Keys are the English terms used
    in the body; values are the source Chinese terms from the roadmap and
    handbooks. Use common agent terminology only — do not invent new terms;
    extend this glossary instead of deviating from it. Section 1.1 explains the
    concepts in plain English; this YAML glossary is only a translation aid.
  架构与治理:
    governance layer: 治理层（subtask-option-model-planner 资产链；不递归包裹自己）
    knowledge layer: 知识层（facts+rules+J/≺，经 ν 门/TMS 自治）
    control plane / execution plane: 控制面（planner 决策）/ 执行面（OptionExecutor）
    governance closed loop: 治理闭环（写有账→可回放→可问责→可治理；进入闭环=option 化的正确推广）
    entry point: 闭环入口（option_event / J/≺ / ≺ 链 / planner_event 四种之一）
    memory governance family: 记忆治理家族（7/8/10 计数本体）
    data ingestion family (Bridge): 数据接入家族（Bridge 三工具，不计入 7/8/10）
    planning & execution family: 规划执行家族（planner 三件套 + plan_task）
    built-in option: 内置工具的执行通道（非能力资产；永驻占位、不入能力域、禁用走插件版本）
    citation / assertion / instruction: 引用（走投影）/ 断言（走 ν 门）/ 指令（走注册门）
    dual-track: 双线
    track: 轨道
    stage-based split: 阶段切分
    lane: 治理 lane（泳道）
    red line: 红线（硬约束，违者阻断合并）
    epistemic gate: 认识论门（ν-gate，问真伪）
    authorization gate / registration gate: 授权门（注册门，问授权）
    candidate: 候选
    capability: 能力
    asset: 资产
    mandate: mandate（授权范围，沿用原文）
    governance: 治理
    settlement: 结算
    calibration: 校准
    probation / settled / revoked / dormant: 试用 / 已结算 / 已撤销 / 休眠
    active_release: 当前生效版本（沿用原文）
    retirement tiers: 退役分层
    runtime demotion: 运行时降权（stop/ignore/replan，仅本次 plan_run）
    settlement trichotomy: 沉降三分离（three-way separation of authorities）
    sedimentation: 沉降（下行只索引不复制）
    demotion index: 降维归档索引
  记忆与数据:
    ingestion: 摄入
    projection: 投影
    recall: 召回
    injection / non-instructional: 注入 / 非指令
    live read: 活读（查询时实时读取，禁止物化影子）
    annotation: 裁注（状态/来源标注）
    lineage / provenance: 血缘 / 溯源
    mapping_stale: 投影过期标记（沿用原文）
    markdownRoot refresh: markdownRoot 刷新（recall-refresh）
    superseding: 替代修订（新版本取代旧版本，保留历史）
    quality_observation: 质量观测
    snapshot restore: 快照恢复
  流程与项目:
    delivery owner: 主责（交付负责人）
    reviewer / second eyes: 互审 / 第二双眼睛
    experienced reviewer: 有经验评审人（首次契约、迁移和治理语义必须参与）
    cross-line contract: 人际契约（跨线接口契约）
    sign-off: 签署
    exit criteria: 出口标准
    product demo: 产品演示
    workstream: 工作项
    workload / person-weeks: 负载 / 人周
    spare capacity: 富余产能
    design pre-start: 设计预研
    hardening week: 联合缓冲周（不安排新功能）
    slide rule: 滑出阀（预授权降级路径）
    negative suite: 负向测试套件
    dry-run: 演练
    regression: 回归
    rollback: 回滚
    recovery: 恢复
    checkpoint: 检查点
    reconciliation: 对账
    idempotency / idempotent: 幂等
    single point of failure: 单点故障
    proactive discovery / mandated execution: 主动发现 / 受权执行
    approval flow: 审批流
    sub-project lead: 子课题负责人
  运行时与宿主:
    host: 宿主
    dual-host: 双 host
    packaging: 封装（版本打包发布）
    handoff: handoff（跨 harness 接管，沿用原文）
    lease: lease（租约，沿用原文）
    inbox / outbox: 收发队列（沿用原文）
    Ticket / Assignment / Attention / deliver / stop: SuperAgent 原生概念（沿用原文）
    OptionExecutor / planner_options / planner_decision: 原生工具名（沿用原文）
    STOMP: P4-6 原生记忆写入链的项目标签；见 §0.1 和既有 P4-6 验收，不另建数据库或队列
---

# Dual-Track Development Handbook (v5.4): Stage A Memory Product × Stage B Runtime + dataStore

> **Current edition: 2026-11-19.** This is the onboarding and delivery reference for two developers joining OptionMemory. It preserves the v5.3 product-first arrangement while reconciling acceptance gates, ownership, contracts, and recovery time.
>
> - **Stage A (W13–W15a), joint:** a usable Markdown + Skills memory product with complete procedural lifecycle management and **zero SuperAgent dependency**.
> - **Stage B (W15b–W19), parallel:** Line 1 delivers the continuous runtime, SuperAgent integration, generation/certification, and host releases; Line 2 delivers read-side lineage/export, governance-data work, and dataStore interfaces.
> - **W20 is reserved for hardening only:** regression, upgrade rehearsal, recovery drills, documentation, and dual sign-off. No new feature is scheduled there.
> - **Phase 4 is closed and Repo-accepted** as of 2026-11-19. See §0.1 and `docs/phase4-acceptance.md`; the earlier planning assumption has been replaced by recorded implementation and execution evidence.
> - The 16-week MVP becomes a **20-week target**, not a guaranteed date. Required work that is unfinished at the W19 release candidate moves sign-off; it does not silently consume W20.

**Tag legend:** `MM-L1` / `MM-L2` = MD-Memory work owned by Line 1 / Line 2; `SuperAgent` = requires the SuperAgent runtime and therefore belongs to Stage B; `planned` = not currently implemented.

---

## 0. New-Developer Onboarding

### 0.1 Current baseline and confidence labels

The architecture in §1 is the **target**. Do not infer implementation status from its presence in this document.

| Area | Current planning status | Meaning / evidence |
|---|---|---|
| Phase 0 | Closed | Five-layer foundation, RocksDB/HNSW, initial import; `docs/phase0-acceptance.md` |
| Phase 1 | R1–R3 accepted; R4 blocked | No bulk `delta` derivation; 97 corrected records remain isolated pending source review; `docs/phase1-baseline.md` |
| Phase 2 | Closed | Revision propagation and Option prerequisite invalidation; `docs/phase2-baseline.md` |
| Phase 3 | Closed | Conflict governance and dual-host seven-tool baseline; `docs/phase3-baseline.md` |
| Phase 4 | **Closed and Repo-accepted** | Original baseline and P4-0–P4-6 passed on 2026-11-19, including full CSV, transient settlement, and v0.2.0 dual-host retention; `docs/phase4-acceptance.md` |
| Phase 5–6 | Not implemented | Stage A/B work in this handbook, except for explicitly listed Phase 4 foundations |
| Automated baseline | Last verified 2026-11-19 | `pnpm build` passed; 37 test files, 135/135 tests passed |

**Phase 4 acceptance boundary.** Phase 4 is closed by the recorded 2026-11-19 implementation and execution acceptance, not by the earlier planning assumption. The earlier Week 9–12 open items are now checked and linked to `docs/phase4-acceptance.md`. Subproject-owner administrative signatures remain separate, and R4 remains blocked.

| Component | Current implementation state |
|---|---|
| Markdown capture/revise/recall and automatic non-instructional injection | Implemented and real-host accepted in Phase 4 slices |
| Persistent finite-lifetime scheduler, OptionExecutor, recovery, and Decision Gate | Implemented and accepted in Phase 4 slices |
| NativeSkillAdapter | Minimal registration/execution boundary only; not a general Skill lifecycle or full-type adapter |
| SuperAgent | Isolated compatibility probe only; no production adapter or continuous service |
| Sidecar | Mapping contract with `mode=sidecar` evidence isolation; not native real execution evidence |
| Procedural candidate schema, registration gate, `active_release`, procedural recall join | **Planned Stage A** |
| `memory_why`, generation, ω_certify, `query_achievable`, `certify`, RL-ready export | **Planned Stage B** |
| dataStore | Design only; required raw snapshots are absent |

Current package version is `0.1.0`. The current host session exposes **13 tools**: seven memory-governance + three Bridge + three Planner tools. The package and capability versions are separate from DSH/OpenCode dependency versions.

Status words in this handbook are deliberate:

- **Implemented:** code exists, but does not by itself imply acceptance.
- **Accepted on isolated RocksDB:** the stated isolated integration/failure scenario passed.
- **Real-host accepted:** actual OpenCode/DSH behavior was exercised; internal mocks are insufficient.
- **Probe:** compatibility evidence only; not production integration.
- **Planned:** no delivery claim.

### 0.2 Documentation precedence and normative overrides

When documents disagree, use this order:

1. **This v5.4 handbook:** future staging, ownership, contracts, acceptance gates, and schedule.
2. `devNotes/S01最小产品路线图-完整版.md`: domain goals, phase baselines, and dataStore requirements.
3. `docs/*acceptance*.md` and phase baselines: historical evidence of what was actually accepted.
4. `README.md`: installation and everyday operation.
5. Week handbooks: implementation guidance, subject to the overrides below.

The Week 13–14 and Week 15–16 handbooks are **not followed verbatim**. Their technical detail is reused only after the corresponding step starts and its current gate is confirmed.

| Topic | Current v5.4 rule | Older text to disregard |
|---|---|---|
| Phase 4 baseline | Closed and Repo-accepted on 2026-11-19; see §0.1 | Statements that Stage A cannot start because Phase 4 is still open |
| P6-5 placement | Stage A, before generation/certification | Requirements that Phase 5 or P6-1–P6-4 close first |
| Stage A memory-governance tools | Exactly **7**, unchanged | P5-5/P6-5 checks requiring 8 or 10 during Stage A |
| Stage A contracts | S1–S4 executable and blocking; S5/S6 design drafts non-blocking | Blanket S1–S6 implementation acceptance before Stage A can exit |
| Stage A milestone | W14 release-candidate demo; W15a full exit after lineage | Calling W14 the complete exit with lineage still unfinished |
| Capability wording | Stage A returns **settled/released**, not certified, capabilities | Calling settled + `active_release` “certified” before P6-2 |
| Stage B ownership | Line 2 owns P5-3 read-side queries/export and P6-3 RL-ready export | Assigning every read-side mechanism to Line 1 |
| W20 | Hardening only | P6/Packaging/DS feature delivery scheduled into W20 |
| dataStore DS2/DS3 | First slide-rule items; DS2 is post-window by default unless capacity is explicitly approved | Treating either as an unconditional MVP dependency |

### 0.3 Setup, verification, and safety

Required baseline:

- Node.js >= 24.9.0 and pnpm 11.7.0.
- OpenCode 2.3.0 or DSH 0.2.2-rc.1 for real-host work.
- RocksDB for persistent development; Mem is for tests only.
- Read `README.md` before changing plugin or endpoint configuration.

Run from the repository root:

```bash
pnpm install
pnpm build
pnpm test
```

The last verified result was **37 files and 135/135 tests passing**. Tests use isolated instances and do not require the production 9070 service.

For an optional manually started development instance, use a separate data directory and port, for example:

```bash
MNESTIC_DATA_DIR=.data/dev-manual scripts/mnestic_start.sh --rocks --port 9170
```

Then, in another shell:

```bash
node scripts/apply_schema.ts --endpoint http://127.0.0.1:9170/text-query
```

Use `OPTIONMEMORY_ENDPOINT=http://127.0.0.1:9170/text-query` for host tools that should connect to that isolated instance. `node scripts/apply_schema.ts` is the documented schema entry point. The P4-6 acceptance notes retain a historical fresh-setup issue for `schema/apply_all.sh`; do not substitute that script without checking its current status.

Safety rules for every developer:

1. Never run migration, crash, cancellation, or failure-injection tests against production 9070 or production Markdown roots.
2. Use isolated RocksDB directories and isolated Markdown roots. Back up before migration and prove rollback.
3. Do not modify real `AGENTS.md`, host profiles, or user configuration as a test side effect.
4. Do not perform real dataStore login, proof-of-work bypass, or network collection in tests.
5. Keep secrets and excluded file contents out of projections, events, logs, fixtures, and review attachments.
6. Candidate Skill code is untrusted. Human approval and a hash check do not replace sandboxing, least-privilege mandates, or code review.
7. Read `docs/memory-regression-acceptance.md` before any memory, host, governance, or release increment. Unit tests do not replace required real-host acceptance.

### 0.4 Repository reading paths

Start with the contracts and current implementation, not only future design documents.

| Audience | Read first | Purpose |
|---|---|---|
| Both | `README.md`; `src/api/tool-contracts.ts`; `src/api/bridge-contracts.ts`; `src/api/planner-contracts.ts`; `src/memory/schema.ts` | Setup, public tool boundaries, and storage vocabulary |
| Both | `docs/phase4-memory-stomp-acceptance.md`; `docs/memory-regression-acceptance.md` | Existing governed-write behavior and required regression evidence |
| Line 1 | `src/api/registry.ts`; `src/api/governance.ts`; `src/runtime/option-executor.ts`; `src/runtime/native-skill.ts`; `src/runtime/planner.ts`; `src/runtime/scheduler.ts` | Current direct registration, conflict-specific settlement, execution, and recovery |
| Line 2 | `src/bridge/markdown/parser.ts`; `src/api/document-projections.ts`; `src/api/memory-recall.ts`; `src/memory/document-projections.ts`; `src/memory/mnesticClient.ts`; `src/api/sidecar.ts` | Projections, recall, fixed queries, provenance, and evidence isolation |
| Line 2 dataStore | Full roadmap §17 and the indexes/reports under `backups/ai-materials-raw-data` | DS0–DS2 requirements and the missing-snapshot boundary; do not bulk-import backups into MemoryCore |

Starter tests:

- **Line 1:** `tests/memory-native-adapter.test.ts`, `tests/scheduler.test.ts`, `tests/memory-stomp.test.ts`.
- **Line 2:** `tests/bridge-markdown.test.ts`, `tests/memory-recall.test.ts`, `tests/sidecar-mapping.test.ts`.
- **Both:** `tests/tool-contracts.test.ts`, `tests/rocks_integration.test.ts`, `tests/field_migration.test.ts`.

Important current-code facts for design work:

- `registerOption` currently writes an Option directly; it does not yet enforce candidate approval, `package_hash`, or a Skill registration mandate.
- Current `settle`/`revoke` APIs are tied to opposing hardness facts and source-priority conflict resolution. They are not yet a general Skill lifecycle API.
- The current NativeSkillAdapter is intentionally small. Stage A adds lifecycle and governance around it rather than pretending it already provides them.

### 0.5 First-week sequence and onboarding exit

Before implementation:

1. Run the baseline and walk through one capture → recall → revise flow.
2. Trace one execution through `plan_run → planner_event → option_event → outcome` and identify the authoritative rows.
3. Read the four red lines and explain why a candidate cannot execute and why settled does not mean certified.
4. Complete the lifecycle compatibility ADR in §3.4 and the Stage A contract fixtures.
5. Obtain experienced-review approval before schema migration or registration-gate implementation.

Onboarding is complete when each developer can independently:

- Run the baseline without production data.
- Explain projection vs fact vs candidate vs Option/Model.
- Explain ν-gate vs registration gate and recall vs authorization.
- Trace a memory write and an Option execution to their ledgers.
- Distinguish implemented, accepted, probe, and planned capabilities.
- Name their first contract, reviewer, deliverable, and slide-rule dependency.

**Required people assignments before M0 starts:**

| Role | Person | Required action |
|---|---|---|
| Line 1 owner | assign before start | Runtime/lifecycle delivery and first execution walkthrough |
| Line 2 owner | assign before start | Projection/recall/dataStore delivery and first recall walkthrough |
| Experienced maintainer/domain reviewer | assign before start | Initial S1–S6 semantics, first migration/rollback, first gate/execution PR, Stage A exit |
| Sub-project 1 lead | assign before start | Host integration, upgrades, and data-retention escalation |
| Sub-project 2 lead | assign before start | J/≺, governance semantics, and schema co-sign |

Two newcomers reviewing each other provides second eyes, not inherited-domain expertise. The experienced reviewer is mandatory for the initial contracts, first migration/rollback, first registration-gate/execution PR, and Stage A exit.

---

## 1. Architecture and Mental Model

```text
raw data layer      SKILL.md / notes/*.md / CSV — the file is the authority
      │  unified ingestion (parse_*, read-only projection)
      ▼
data-layer candidates    DocumentProjection + fact/procedural candidates — NO execution entitlement
      ├─ declarative track: → ν-gate (epistemic gate: is it true?) → facts
      │       → Recall (non-instructional injection)
      └─ procedural track: → registration gate (authorization gate:
              package_hash + human approval + mandate binding)
              → Option/Model assets (probation → settled/revoked) → OptionExecutor
```

### 1.1 Plain-English concepts and authority

| Concept | Working meaning |
|---|---|
| MemoryCore | Authoritative service/storage for facts, governed assets, events, evidence, and revisions |
| DocumentProjection / chunk | Rebuildable data-layer representation of source text; not automatically a true fact |
| Fact | A governed declarative assertion with status, evidence, and revision semantics |
| Candidate | A proposal before promotion. It has no execution or authoritative-fact entitlement |
| Option | A versioned executable capability contract and implementation binding; not synonymous with a host tool |
| Model | Option-level world/evidence/evaluation/calibration state; not necessarily an LLM |
| Planner | The control plane that proposes structured decisions; it does not directly change the external world |
| OptionExecutor | The governed execution surface for Options |
| plan_run | Internal execution context for Planner decisions and Option attempts; not a SuperAgent Ticket |
| J / ≺ | Justification/derivation edges and governance/revision lineage; not interchangeable with event links |
| ν-gate / TMS | Truth/evidence admission and truth-maintenance propagation for declarative knowledge |
| Registration gate | Authorization admission for procedural assets; separate from the ν-gate |
| Mandate | The permitted scope of action; recall, parsing, or certification cannot enlarge it |
| Probation / settled / `active_release` | Lifecycle states for a capability and its currently released version; none alone means ω_certify certification |
| NativeAdapter | Minimal bridge to a real host tool/Skill handler; projection loading is not execution success |
| STOMP | The repository's P4-6 label for native governed memory writes through Planner/Option/Model/projection chains; not a second database or task queue |
| dataStore | Separate bulk-data access/batch module; measures observations and returns candidates/references, never direct mnestic writes |

| Content / state | Authority |
|---|---|
| Raw Markdown, Skill implementation packages, file history | Filesystem and Git |
| Structured facts, Option/Model/Planner assets, evidence, J/≺, revisions | MemoryCore |
| Host session, native question/permission state | OpenCode or DSH |
| Source/Ticket/Mandate/Assignment/Attention/Outbox | SuperAgent, Stage B only |
| Bulk raw files, file inventory, physical schema, data cursors | dataStore |
| Derived search indexes | Rebuildable projections, never a second authority |

### 1.2 Worked Stage A example

A single Skill must demonstrate the whole product, not merely a schema write:

1. Parse `SKILL.md` and its declared package manifest. Narrative fields become a data-layer chunk; the package produces an S1 procedural candidate with `package_hash=null`.
2. Verify that neither the chunk nor candidate is executable. Skill bodies and command sequences do not enter `[REFERENCE_MEMORY: non-instructional]`.
3. Record explicit human approval. The registration gate verifies the approved immutable implementation `package_hash`, mandate, version, and input/output schema.
4. Atomically create the versioned Option/Model in probation with candidate/approval lineage. A partial write returns `reconcile_required`; it never exposes half an asset.
5. A Planner execute decision passes the Decision Gate and invokes the whitelisted NativeAdapter through OptionExecutor. Record observations, outcome, cost/error, cancellation, and real implementation version.
6. Settle the capability and publish one `active_release`. `bridge_recall(include_procedural=true)` joins narrative chunks with live S2 metadata; it returns metadata only, not implementation bodies.
7. Revoke the release. The next recall excludes it by default; the asset remains queryable as dormant history. An optional demotion index contains only a narrow archival reference with `evidence_ref`.

Required negative demonstrations:

- An unapproved candidate cannot become an Option through either the candidate path or a host-callable bypass.
- A text `content_hash` cannot satisfy implementation `package_hash` verification.
- An outcome or calibration value cannot be written as an independent declarative fact.
- A revoked capability cannot reappear through historical memory.

### 1.3 The four red lines and security boundary

1. **Candidate ≠ capability.** Nothing in the data layer can be executed or registered by virtue of being parsed.
2. **No instructional text in the injection pool.** `[REFERENCE_MEMORY: non-instructional]` never carries skill bodies or command sequences.
3. **Hash-domain switch at the registration gate.** Text `content_hash` is never capability evidence; only the implementation `package_hash` is.
4. **Two gates, never merged.** The ν-gate answers *truth*; the registration gate answers *authorization*. No single code path may answer both.

A hash proves implementation identity/integrity, not safety, correctness, or certification. Approval proves authorization, not factual truth. Recall is evidence presentation, not permission to act.

### 1.4 Circulation, sedimentation, retirement

**Upward** (data → knowledge): promotion only through the respective gate; heavyweight procedural assets are not built until actually needed. **Downward** (execution → knowledge): index, never copy (§6.1). **Retirement**: layered, never physically deleted (§6.2).

---

## 2. Final Assignment and Schedule (v5.4)

### 2.1 Delivery table

| Workstream | Delivery owner | Window | Reviewer |
|---|---|---|---|
| **Stage A: usable memory product — Markdown + Skills, no SuperAgent** | | | |
| M0: lifecycle compatibility ADR (§3.4); S1–S4 fixtures; S5/S6 design drafts; schema 14 reversible migration plan | both + experienced reviewer | W13 | domain owner |
| S2 asset-chain read contract + fixtures | Line 1 | W13 | Line 2 |
| P6-5 registration gate, probation → settle/`active_release`, revoke → dormant, trichotomy guard | Line 1 | W13–14 | Line 2 + experienced reviewer for first PR |
| S4 governed Skill execution through NativeAdapter/OptionExecutor | Line 1 | W13–14 | Line 2 |
| P5-5 `bridge_recall` live-read join and status annotation | Line 2 | W13–14 | Line 1 |
| P6-5 candidate identification over Markdown/Skill projections | Line 2 | W13–14 | Line 1 |
| P6-5 demotion index facts and narrative-side trichotomy tests | Line 2 | W14 | Line 1 |
| P5-3 **Markdown lineage only**: chunk↔fact source links and Recall/revision-chain queries | Line 2 | W14–W15a | Line 1 + domain reviewer |
| MD-Memory maintenance base and contract documentation | Line 2 | W13–14 | Line 1 |
| **W14 release-candidate demo** | both | W14 | experienced reviewer |
| **W15a full Stage A exit**, including lineage | both | W15a | domain owner |
| **Stage B: runtime + SuperAgent ∥ read-side/dataStore** | | | |
| P5-1 shared planner-runtime, recovery, lease, handoff | Line 1 | W15b–W16 | Line 2 |
| P5-2 `superagent-adapter v0.1` | Line 1 | W16–17 | experienced host reviewer |
| P5-3 event-writer semantics and decision-chain association IDs | Line 1 | W17 | Line 2 |
| P5-3 `memory_why`, six-tuple queries, decision-chain reads, event export | **Line 2** | W17–18 | Line 1 |
| P5-4 SuperAgent persistent memory adaptation `SuperAgent · MM-L1` | Line 1 | W18 | Line 2 |
| Dual-host v0.3.0 release candidate, 7→8 memory tools | Line 1 | W18 | both |
| P6-1 active planning + generation | Line 1 | W19 | Line 2 |
| P6-2 certification evidence unification | Line 1 | W19 | domain reviewer |
| P6-3 RL-ready read-only export | **Line 2** | W19 | Line 1 |
| P6-4 SuperAgent active memory governance — runtime side `SuperAgent · MM-L1` | Line 1 | W19 | Line 2 |
| P6-4 governance-data side `SuperAgent · MM-L2` | Line 2 | W18–19 | Line 1 |
| P6 Horn-rule validation baseline | Line 2 | W18–19 | Line 1 |
| Dual-host v0.4.0 release candidate, 8→10 memory tools | Line 1 | W19 | both |
| MD-Memory continuing maintenance `MM-L2` | Line 2 | W15–19 rolling | Line 1 |
| dataStore DS0 contracts + external snapshot restore | Line 2 | W13–15 background | Line 1 |
| dataStore DS1 read-only interfaces, synthetic fixtures first | Line 2 | W15–17 if capacity allows | Line 1 |
| dataStore DS2 real-data governance | Line 2 | **post-W20 by default** | Line 1 |
| DS3 contract preview | Line 2 | post-W20 | Line 1 |
| **W20 hardening only** | both | W20 | domain owners |

**Capacity rule.** The previous v5.3 person-week totals are withdrawn: they assumed a small Stage A registration task and scheduled new features into W20. M0 must produce bottom-up estimates from the ADR, fixtures, migration, and demo scope. No “spare capacity” is assumed before that estimate. Read-side P5-3/P6-3 work belongs to Line 2 to reduce Line 1's single-owner concentration.

### 2.2 Master schedule

```text
Stage A — product first, no SuperAgent
W13     M0 ADR + S1–S4 fixtures + schema 14 plan; S5/S6 drafts only
W14     candidate→gate→execute→settle/release→revoke vertical slice
        + procedural recall + negative suite + release-candidate demo
W15a    Markdown lineage complete → full Stage A gate

Stage B — preserve the technical dependency order
W15b–16 P5-1 runtime → P5-2 adapter starts; DS1 synthetic-first
W17     P5-2 finishes → P5-3 event IDs/read-side implementation
W18     P5-3 export + P5-4 + v0.3.0 RC; P6-4 data side + Horn validation
W19     P6-1/P6-2/P6-3 + P6-4 runtime + v0.4.0 RC
W20     hardening only: full regression, real-host evidence, failure recovery,
        migration/upgrade rehearsal, documentation, dual sign-off
```

If required MVP work misses W19, move the sign-off date. Do not relabel new feature completion as hardening.

### 2.3 Stage A exit criteria

All items are due at **W15a**, not the W14 release-candidate demo:

- [ ] Isolated RocksDB demo returns Markdown knowledge with revision/status annotation and Skill narratives joined with settled/released capability metadata.
- [ ] One Skill completes identify → human approval → package/mandate gate → probation → real OptionExecutor execution → settle → `active_release`.
- [ ] Revoke → dormant → optional demotion index with `evidence_ref`; the next default recall excludes the revoked capability.
- [ ] Markdown source links and Recall/revision chains are queryable.
- [ ] S1–S4 contract fixtures and negative suites pass; S5/S6 design drafts are recorded but are not Stage A implementation gates.
- [ ] Schema 14 migration and rollback pass on isolated Mem/RocksDB copies.
- [ ] The memory-governance family remains exactly **7 tools**; Bridge and Planner families remain independently contracted.
- [ ] No Stage A product code imports or calls SuperAgent adapter/Ticket/Attention/deliver/stop APIs. The existing isolated probe remains historical Phase 4 code, not a product dependency.
- [ ] No claim of ω_certify, generation, RL readiness, or full continuous service is made.

### 2A. MD-Memory Track

Markdown daily memory is neither pure runtime nor pure dataStore. Its work is split by lane even though delivery is organized by stage:

| Split criterion | Owner | Inventory |
|---|---|---|
| Runtime / adapter / approval execution `MM-L1` | Line 1 | P5-4 Source/Ticket/Assignment mapping, deliver→Recall observations, Attention approvals, handoff/idempotency reconciliation, human-stop enforcement, Report references; P6-4 proactive discovery→mandated execution, lease/recovery, approval execution and stop; Bridge V1/V2 compatibility and release regression |
| Data / ingestion / recall / governance-data `MM-L2` | Line 2 | P5-5 live recall join; Stage A Markdown lineage; P6-5 candidate identification and demotion index; P6-4 source re-read, FactCandidate/superseding candidates and re-Recall; P5-3/P6-3 read-side queries/export; markdownRoot refresh, contract docs, and rolling regression |

The Stage A in-track interfaces are S1, S2, S3, and S4. S5 joins the MD-Memory track when decision-chain/read export starts in Stage B. S6 remains the dataStore boundary.

### 2.4 Reviewer arrangement

Record cross-line review in `docs/dual-track-contracts.md` (planned M0 artifact):

- Line 2 reviews S1 candidate identification, S2 annotation/non-instructional semantics, S3 narrative exits, and S5/S6 read shapes.
- Line 1 reviews S1 gate-consumer behavior, S2 implementation feasibility, S4 execution outcomes, and dataStore candidate-flow integration.
- The experienced reviewer approves initial contracts, first migration/rollback, first registration/execution PR, and Stage A exit.
- Review does not transfer delivery ownership. Escalate a blocked review within two working days.

### 2.5 Risks and pre-authorized slide rules

1. **Phase 4 baseline regression:** run the shared regression before Stage A; any newly reopened storage/governance failure pauses affected work and triggers a fresh baseline review.
2. **Line 1 single point of failure:** Line 2 owns read-side P5-3/P6-3; experienced review covers runtime/SA; W20 remains protected.
3. **New-developer semantic risk:** initial domain review is mandatory, not optional peer convention.
4. **Lifecycle compatibility risk:** no registration coding before §3.4 ADR approval.
5. **Missing dataStore snapshot:** DS0 contract/index work may continue; real-data DS2 does not start without restore + SHA256 verification.
6. **Capacity slip:** slide DS2 first, DS3 next, then optional interoperability such as PROV-O. Required MVP scope moves the date rather than silently dropping acceptance or consuming W20.

The W16 snapshot checkpoint must record one of: `DS2 approved with named capacity`, or `DS2 post-W20`. The default is post-W20.

---

## 3. Specifications and Working Agreements

### 3.1 Contract inventory

| Spec | Content | Producer → consumer | Stage A gate |
|---|---|---|---|
| **S1** | Procedural candidate schema: `candidate_id`, source, proposed `pi_*`, `package_ref`, `package_hash=null`, approval/status, idempotency; schema 14 | Line 2 → Line 1 | **Blocking implementation + fixtures** |
| **S2** | Read-only asset-chain contract: `listActiveCapabilityMetadata` / `listCapabilityHistory`; recall annotation and live-join shape | Line 1 → Line 2 | **Blocking implementation + fixtures** |
| **S3** | Settlement trichotomy and the two narrow declarative exits | both | **Blocking guard fixtures** |
| **S4** | Governed native Skill execution: approved package/version + mandate + Planner execute → NativeAdapter; typed success/failure/denied/cancelled/reconcile outcomes; `projection_loaded ≠ outcome` | Line 1 → both | **Blocking execution fixture** |
| **S5** | Governance event-chain read contract linking planner/option/model events, J/≺, memory_uri, host/run/external IDs, and evidence modes | Line 1 event semantics → Line 2 reads/export | **Design draft only; Stage B implementation** |
| **S6** | dataStore IngestionBridge | Line 2 → MemoryCore; Line 1 boundary review | **Design draft only; independent dataStore gate** |

S4 closes the previous numbering gap and makes the execution boundary explicit. It does not create a new host tool family.

For every contract, record in `docs/dual-track-contracts.md`:

- Owner, producer, consumer, canonical type/schema location, and version.
- Compatibility and change policy, including required cross-line review and consumer notification.
- One happy-path fixture and one negative fixture for S1–S4 before implementation.
- Standard result semantics: `gate`, `reason`, `reused`, `blocked`, `failure`, and `reconcile_required`.
- Migration/rollback and evidence expectations.

### 3.2 S6 — dataStore IngestionBridge

```text
dataStore → MemoryCore (controlled; no direct mnestic writes):
  FactCandidate[] · quality_observation · raw_ref / snapshot_ref / sample_set_ref
  + idempotent ingestion events (source_cursor, file hash)
MemoryCore → dataStore:
  governance verdicts (usable / revise / certified) by reference only
```

dataStore measures what was observed; MemoryCore governs whether and how it may be used. Raw HTML/images/large JSONL/full inventory stay in dataStore. S6 declarative FactCandidates enter the ν-gate, not the S1 procedural registration gate.

### 3.3 Host tool families

Exactly three host tool families exist:

| Family | Tools now and in Stage A | Later trajectory | Counted in 7/8/10? |
|---|---|---|---|
| **Memory governance** | `memory_set`, `memory_get`, `memory_query`, `memory_retract`, `propose_option`, `settle`, `revoke` = **7** | 8 at v0.3.0 (+`memory_why`) → 10 at v0.4.0 (+`query_achievable`, +`certify`) | **Yes** |
| **Data ingestion (Bridge)** | `bridge_recall`, `bridge_capture`, `bridge_revise` = **3** | P5-5 adds `include_procedural`; hooks/refresh are plugin behavior, not tools | No |
| **Planning & execution** | `planner_context`, `planner_options`, `planner_decision` = **3** | `plan_task` only after an explicit command-vs-tool decision | No |

Registration sources are `OPTIONMEMORY_TOOL_CONTRACTS`, `BRIDGE_TOOL_CONTRACTS`, and `PLANNER_TOOL_CONTRACTS`, exposed through their respective host plugins.

Rules:

- “Exactly 7/8/10” applies only to memory governance.
- Stage A keeps the current **13 total** host tools.
- v0.4.0 has **16 total** without `plan_task`, or **17** if `plan_task` is separately approved.
- Adding a tool without a family, or introducing a fourth family, requires a roadmap amendment.

### 3.4 M0 lifecycle compatibility ADR — required before coding

The ADR must resolve the gap between current code and the target lifecycle:

1. **Registration path:** how candidate-gated Skills coexist with current direct `propose_option`; how a host caller cannot bypass approval for Skill-like packages.
2. **Lifecycle API:** whether general Skill settle/revoke are new internal/public APIs or carefully separated from current hardness-conflict governance. Do not merely rename conflict-specific functions.
3. **State model:** storage and transition rules for probation, settled, revoked/dormant, Model status, `active_release`, immutable versions, and rollback-by-new-version.
4. **Built-ins:** perpetual-probation execution channels remain outside the capability domain and are never settled/revoked/certified as Skills.
5. **Atomicity/recovery:** candidate → approval → Option/Model → release writes, crash points, deterministic IDs, idempotency, and `reconcile_required` behavior.
6. **Compatibility/migration:** existing assets, seven-tool behavior, RocksDB preservation, schema 14 rollback, and read projections.
7. **Execution security:** package provenance, untrusted code isolation, mandate scope, host permission mapping, and the distinction between hash identity and safety.
8. **Acceptance:** exact Stage A demo, negative fixtures, evidence rows, and the separation of settled/released from later certification.

The ADR produces the bottom-up Stage A estimate. It is a blocking M0 deliverable, not optional documentation.

---

## 4. Delivery Details

### 4.1 P5-5 — procedural metadata conversational recall (Stage A)

Three recall forms have different semantics:

- Execution-time discovery: `planner_options` (exists; excludes built-ins).
- Conversational discovery: `bridge_recall(include_procedural=true)` live join (Stage A).
- Achievability: `query_achievable` (Stage B P6-2).

Tasks: default `include_procedural=false`; live S2 join at query time; default filter settled + `active_release` + not built-in; explicit history separately annotated; metadata only (`skill_id`, `option_id`, version, status, `active_release`, `evidence_ref`); no implementation bodies or execution entitlement.

Acceptance: settled/released hits with evidence links; revoke is reflected on the next recall; no materialized shadow; **7 memory-governance tools unchanged**; Phase 0–4 regression green. Do not describe these results as certified.

### 4.2 P6-5 — candidate pipeline and retirement (Stage A)

```text
identify over data-layer projections (S1, package_hash=null)
  → explicit human approval
  → registration gate (package_hash + mandate + atomic Option/Model probation + lineage)
  → Planner execute decision → OptionExecutor whitelist
```

The gate is the only writer of approved `package_hash` and the only creator of assets **from candidates**. Skill onboarding uses immutable packages and versioned Options; rollback publishes a new version pointing to an old approved hash.

Stage A acceptance: unapproved/bypass registration blocked; text hash rejected; trichotomy and S4 negative suites green; dormant queryable/non-deletable/non-reloadable; runtime stop/ignore/replan leaves asset rows unchanged; **7 memory-governance tools and R4 boundaries unchanged**.

Stage B separately revalidates the same pipeline under real execution evidence, generation/certification, and the 8→10 tool releases.

### 4.3 Stage B remaining steps

Use the Week 13–14 and Week 15–16 handbooks as technical guidance subject to §0.2 and the ownership table—not verbatim. Preserve this technical dependency order:

```text
P5-1 runtime
  → P5-2 production SuperAgent adapter
  → P5-3 event semantics + memory_why/read export and P5-4 persistent memory
  → P6-1 active planning/generation
  → P6-2 certification evidence
  → P6-3 RL-ready export and P6-4 active memory governance
```

Overlapping implementation is allowed only after the preceding interface is frozen and its recovery fixtures exist.

---

## 5. dataStore Track (Line 2)

The full roadmap §17 is the domain specification, subject to this handbook's capacity and gate overrides. Proposed stack: fsspec / PyArrow / Parquet; DuckDB only after a measured need.

- **DS0 (W13–15 background):** StorageBackend / QueryEngine / SnapshotAccess / S6 contracts; snapshot restore + SHA256 verification; Data Package description; DG-01 inventory reconciliation. Before restore, only contracts and read-only index probes are allowed.
- **DS1 (W15–17 if capacity allows):** bounded-memory streaming, reproducible filter/aggregate/join, on-demand Parquet, idempotent reruns. Synthetic fixtures precede real data.
- **DS2 (post-W20 by default):** corrdata 11,181 reports with page/field/image lineage; matbd read-only scale tests; mged authorization refusals without login/PoW; broken-link/null/duplicate quality reports.
- **DS3 (post-W20 preview):** plan_run integration contract only. Implementation is outside this window.

The current backup contains scripts, reports, dictionaries, and indexes, but not the required raw `matbd` / `corrdata` / `mged` data or the 10.6 GB volumes. No raw bulk data enters mnestic; dataStore never writes mnestic directly; count discrepancies retain snapshot and caliber distinctions.

---

## 6. Standing Rules

### 6.1 Settlement trichotomy (S3)

| Content | Sole authority | Forbidden |
|---|---|---|
| Calibration (success rate / prediction error / cost) | Model fields | Becoming an independent fact |
| Execution flow | `option_event/outcome` | Becoming an independent fact |
| Narrative residue | Narrow declarative summary/index | Copying execution data |

The only declarative exits are an archival index with `evidence_ref` to a dormant asset, and a genuinely cross-domain by-product with `evidence_ref` to an `option_event`.

### 6.2 Retirement tiers

```text
tier 1  runtime demotion   Planner stop/ignore/replan → this plan_run only; assets unchanged
tier 2  asset retirement   governed revoke             → dormant, queryable, calibration frozen
tier 3  ticket termination SuperAgent human stop        → external task lifecycle, Stage B only
```

No physical deletion. These tiers never impersonate one another.

### 6.3 Recall semantics ladder

`planner_options` (decision inputs) → `bridge_recall` live join (metadata) → `query_achievable` (reachability, Stage B). None grants authorization; execution always requires mandate + Planner decision + governed execution.

### 6.4 Merge-blocking red-line suite

Cover candidate idempotency; `package_hash=null` before gate; unapproved/mismatched/mandate-missing registration; host-callable bypass; instructional injection; materialized asset-state shadows; outcome/calibration→facts; dormant non-deletion; revoked non-reload; runtime-demotion asset invariance; crash recovery; namespace/sensitive-path isolation. Use isolated RocksDB and Markdown roots.

### 6.5 Governance layer and closed loop

```text
Governance layer: subtask — option — model — planner
  gates: registration gate · Decision Gate · planner registration strengthening
  ledgers: option_event · planner_event · host_event · ≺ chain
  execution surface: OptionExecutor

Knowledge layer: facts + rules + J/≺, governed by ν-gate + TMS
Data layer: projections / chunks / candidates
Host tools: interfaces onto these layers, not substitutes for governance
```

Four dimensions must remain distinct:

| Dimension | Question | Mechanism |
|---|---|---|
| Content class | Citation, assertion, or instruction? | Projection / ν-gate / registration gate |
| Action class | Read, process-shaped write, or assertion-shaped write? | Read exemption / option_event / J/≺ |
| Asset class | Does it have a capability lifecycle? | Probation → settle/revoke + `active_release` |
| Ledger | Where is the audit record? | option_event / J/≺ / ≺ / planner_event |

A side effect that can fail, retry, and carries attempt/cost/idempotency semantics is process-shaped and uses an Option. A revisable true/false assertion uses the ν-gate and J/≺. `bridge_capture` vs `memory_set` is the canonical pair.

A closed loop requires: every write has a ledger → replay is possible → replay is accountable to its trigger → resulting state is governable. Option execution is one entry point, not the whole definition.

### 6.6 Injection and built-in governance

| Content class | Lane | Rule |
|---|---|---|
| Citation | Projection/chunks + live status | Non-instructional reference only |
| Assertion | fact candidate → ν-gate → facts | Never auto-promoted from narrative |
| Instruction | Registration + native Skill loading + governed execution | Never enters the injection pool |

Read-only recall fabricates no execution events. Markdown refresh is governed by `markdown-note@v1`; injection policy is versioned policy, not an execution event.

Built-in Options exist for execution accounting, not capability lifecycle:

| Path | Current governance |
|---|---|
| `bridge_capture` / `bridge_revise` | Real mandate + plan_run + execute decision + option_event/outcome + idempotency |
| `bridge_recall` read | Read exemption |
| `bridge_recall` refresh | Real `markdown-note@v1` parse execution with `recall-refresh:<doc>:<hash>` |

Built-ins remain perpetual-probation technical placeholders: never settle/revoke/certify them as capabilities; exclude them from discovery and the P5-5 join; disable them through plugin versions, not asset revoke.

Closed-loop entry points:

| Tool / interface | Entry point |
|---|---|
| `memory_set` / `memory_retract` | ν-gate + J/≺ |
| `memory_get` / `memory_query` | Read exemption |
| `propose_option` / `settle` / `revoke` | Asset + ≺ governance chain, subject to the §3.4 compatibility ADR |
| `bridge_capture` / `bridge_revise` / refresh | option_event |
| `planner_context` / `planner_options` | Read exemption |
| `planner_decision` | planner_event + causal backlinks |
| Planned `memory_why` / `query_achievable` | Read exemption |
| Planned `certify` | Certification ledger, J={s,o,m} |
| Planned `plan_task` | subtask_event / plan_run / host_event |

Planned strengthening items:

1. Version/approve planner registration changes in Stage B.
2. Materialized decompose proposals must carry `parent_planner_event_id`.
3. Document the decision-type × Decision-Gate-check matrix during P5-3.
4. Keep tool descriptions domain-general without pretending current conflict-specific APIs already implement the future lifecycle.

---

## 7. Test and Evidence Acceptance

Every increment uses `docs/memory-regression-acceptance.md` plus its own scenarios.

Required evidence classes:

1. Functional contract fixtures and negative tests.
2. Isolated Mem/RocksDB integration, migration/rollback, and restart evidence.
3. Crash/retry/idempotency/reconciliation tests for side effects.
4. Real OpenCode/DSH sessions for model-visible behavior; mocks cannot substitute.
5. Security/namespace/sensitive-path and prompt-injection cases.
6. Reviewer log, known limitations, and explicit non-goals.

Dual-track-specific cases:

- Direct ingestion→`registerOption` and host-callable Skill-registration bypass attempts.
- Text hash as package hash; candidate instructions in injection.
- Gate crash between Option and Model registration → `reconcile_required`, no half asset.
- Recall join during asset-chain restart: consistent, no event fabrication.
- `projection_loaded` vs actual execution outcome; denial/cancellation not reported as success.
- Runtime demotion leaves asset rows byte-identical; revoke affects the next recall.
- Stage A: Phase 0–4 regression and 7-tool compatibility.
- Stage B: Phase 0–5 regression, real/simulated/sidecar separation, and 7→8→10 transitions.
- dataStore: DG-01–DG-06 only when the relevant snapshot/stage is active.

Record evidence in the step's acceptance document; do not paste transient logs into this handbook.

---

## 8. Repo Acceptance Checklist

- [ ] **W14:** Stage A release-candidate demo; registration/execution/recall/retirement vertical slice and negative suite.
- [ ] **W15a:** full Stage A exit; Markdown lineage, S1–S4, schema 14 rollback, seven tools, zero SuperAgent dependency, experienced/domain sign-off.
- [ ] **W16:** snapshot checkpoint explicitly selects DS2 capacity or the default post-W20 slide.
- [ ] **W18:** Phase 5 runtime/read-side baseline closes; `memory_why`/decision chain/export + P5-4 + v0.3.0 eight tools green.
- [ ] **W19:** P6-1/2/3, P6-4, Horn validation, and v0.4.0 ten-tool release candidate green; Stage A pipeline revalidated.
- [ ] **W20:** only hardening evidence remains: full regression, real-host checks, upgrade/recovery rehearsal, reviewer log, limitations, and dual sign-off.
- [ ] **MD-Memory:** P5-4/P6-4 approvals, recall join, lineage, demotion index, and regression evidence archived.
- [ ] **dataStore:** DS0/DS1 accepted if scheduled; DS2 is accepted separately or explicitly post-W20 with zero MVP impact.

### Sign-off

| Role | Item | Date | Signature |
|---|---|---|---|
| Line 1 owner | P6-5 gate + S4; P5-1/2/4; P6-1/2; P6-4 runtime; v0.3/v0.4 packaging | | pending |
| Line 2 owner | Stage A identification/join/lineage/demotion; P5-3 read side; P6-3; P6-4 data side; DS0–DS1/S6 | | pending |
| Experienced maintainer/domain reviewer | Initial contracts, first migration/execution, governance semantics, Stage A exit | | pending |
| Sub-project 1 lead | Host integration, upgrades, data retention | | pending |
| Sub-project 2 lead | Governance semantics and schema co-sign | | pending |

---

## 9. Non-Goals

No auto-registration, auto-publish, automatic `AGENTS.md` edit, materialized declarative shadow, combined truth/authorization gate, physical deletion, or outcome-as-fact path. No Stage A certification claim, production SuperAgent claim, bulk raw-data import, automatic Skill generation, compositional DAG, RL training, or full-type NativeAdapter. DS2/DS3 implementation, DS4, and DuckDB adoption are outside the guaranteed MVP window unless separately approved.

---

## Appendix A. Amendment History and Rationale

- **v5.0:** attempted a clean stage-based ownership split with S6 as the main inter-line contract.
- **v5.1:** recognized MD-Memory as a cross-cutting datatype and restored necessary S1/S2/S3/S5 boundaries.
- **v5.2:** chose integration first, then parallel runtime/dataStore work; DS0 became a background external dependency.
- **v5.3:** defined Stage A as Markdown + Skills with full procedural management and no SuperAgent; moved Markdown lineage into Stage A.
- **v5.4 (2026-11-19):** added standalone onboarding; reconciled Stage A tool counts/gates; defined S4; separated contract drafts from implementation gates; moved read-side P5-3/P6-3 to Line 2; reserved W20 for hardening; made DS2 post-window by default; required the lifecycle compatibility ADR and experienced initial review. Phase 4 was subsequently completed and Repo-accepted on the same date, superseding the earlier planning assumption.

The old Phase 5–6 order was technically sensible for continuous execution but delayed a usable memory product behind SuperAgent. The current plan keeps the useful dependency order inside Stage B while delivering the independent memory product first.

## Appendix B. Primary References

- Setup and current user workflows: `README.md`.
- Domain and phase roadmap: `devNotes/S01最小产品路线图-完整版.md`.
- Existing memory behavior: `devNotes/MemoryBridge开发方案.md` and `docs/phase4-memory-stomp-acceptance.md`.
- Required shared regression: `docs/memory-regression-acceptance.md`.
- Existing event contract: `docs/planner-event-schema-v0.2.md`.
- Continuous host boundary: `docs/continuous-host-contract.md`.
- Sidecar evidence isolation: `docs/sidecar-mapping-v0.1.md`.
- dataStore domain requirements: full roadmap §17.
