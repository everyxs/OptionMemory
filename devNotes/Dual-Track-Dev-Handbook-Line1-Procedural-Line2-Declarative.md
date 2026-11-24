---
创建时间: 2026-11-18
更新时间: 2026-11-24
类型: Development handbook and developer onboarding (Dual-Track v5.9, English edition)
所属项目: "26-04 AI4Science"
对应路线图: "S01 Minimal Product Roadmap (full edition) §3.1A / §10.4B / §11.5B / §17; Week13-14 and Week15-16 handbooks, subject to §0.2 overrides; approved self-learning, unified-observation, concrete-trajectory, and Stage B personalization refinement"
状态: v5.9 unified-observation and concrete-trajectory refinement drafted; Phase 4 closed and Repo-accepted; Stage A next
tags:
  - dev-handbook
  - developer-onboarding
  - dual-track
  - v5.9
  - self-learning
  - semantic-evidence-adapters
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
    Learning Planner: 内置学习 Planner（被动观察、提出完整学习候选束，不递归生成 Planner 资产）
    observation context: 观察上下文（证据积累状态，不是已学习能力）
    task signature: 任务签名（目标、输入输出、适用范围与约束的可比较标识）
    evidence envelope: 证据封装（来源、范围、版本、状态与质量的映射契约）
    LearningRun: 学习运行（候选束、学习/留出划分、预期/实际状态迁移与评价证据）
    semantic evidence adapter: 语义证据适配层（本地/远程数据源到学习循环的 dataStore 映射层）
    world-state transition model: 世界状态迁移模型（前置假设、预期/实际后态、不变量与漂移）
---

# Dual-Track Development Handbook (v5.9): Self-Learning Memory × Continuous Runtime + Semantic dataStore

> **Current edition: 2026-11-24.** This refinement preserves the dual-track product split, the built-in procedural Learning Planner, and the semantic dataStore adapter layer. Stage A adds unified observation validation and deterministic declarative/procedural/mixed/unknown/insufficient classification with bounded proactive prompts and distinct admission gates, with concrete verified trajectories and implementation reuse as the primary learning path. Stage B adds stable individual identity, explicit profile scopes, broader structured memory, and abstract procedural generation through the same governance model. Authorized non-personal evidence may be passive; personal evidence requires opt-in before persistence. These are planning additions, not implementation or acceptance claims.
>
> - **Stage A (W13–W16), joint:** a usable Markdown + Skills memory product plus a **passive self-learning MVP**, with zero SuperAgent dependency.
> - **Stage B (W17–W21), parallel:** Line 1 delivers continuous self-learning and SuperAgent integration; Line 2 delivers semantic evidence adaptation, read-side lineage/export, and dataStore interfaces.
> - **W22 is reserved for hardening only:** longitudinal learning/revision/rollback, migration, recovery, privacy, and dual sign-off. No new feature is scheduled there.
> - **Phase 4 is closed and Repo-accepted** as of 2026-11-19. See §0.1 and `docs/phase4-acceptance.md`.
> - The roadmap is a **22-week target**, not a guaranteed date. The original 20-week target is possible only with one small connector and one learned bundle. Required work unfinished at the W21 release candidate moves sign-off; it does not silently consume W22.
> - Learning starts from **real usage, not forced seed tasks**. Installed Skills, raw files, or model claims alone do not constitute learning evidence.

**Tag legend:** `MM-L1` / `MM-L2` = MD-Memory work owned by Line 1 / Line 2; `LearningPlanner` = built-in control-plane learner; `S7/S8` = evidence-envelope and LearningRun contracts; `SuperAgent` = Stage B only; `planned` = not currently implemented.

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
| Bilingual extraction, localized messages, and scoped cross-language recall | Implemented and real-host accepted; `docs/bilingual-acceptance.md` |
| Procedural candidate schema, registration gate, `active_release`, procedural recall join | **Planned Stage A** |
| Learning Planner, observation contexts, full learning bundles, LearningRun evaluations | **Planned Stage A** |
| dataStore semantic evidence adapters and S7/S8 contracts | **Planned Stage A** |
| `memory_why`, generation, ω_certify, `query_achievable`, `certify`, RL-ready export | **Planned Stage B** |
| Large-scale raw snapshots | Required only for corresponding dataStore workloads; not required to begin local connectors |

Current package version is `0.2.1`. The current host session exposes **13 tools**: seven memory-governance + three Bridge + three Planner tools. The package and capability versions are separate from DSH/OpenCode dependency versions.

Status words in this handbook are deliberate:

- **Implemented:** code exists, but does not by itself imply acceptance.
- **Accepted on isolated RocksDB:** the stated isolated integration/failure scenario passed.
- **Real-host accepted:** actual OpenCode/DSH behavior was exercised; internal mocks are insufficient.
- **Probe:** compatibility evidence only; not production integration.
- **Planned:** no delivery claim.

### 0.2 Documentation precedence and normative overrides

When documents disagree, use this order:

1. **This v5.9 handbook:** future staging, ownership, learning/evidence contracts, acceptance gates, and schedule.
2. `devNotes/S01最小产品路线图-完整版.md`: domain goals, phase baselines, and dataStore requirements.
3. `docs/*acceptance*.md` and phase baselines: historical evidence of what was actually accepted.
4. `README.md`: installation and everyday operation.
5. Week handbooks: implementation guidance, subject to the overrides below.

The Week 13–14 and Week 15–16 handbooks are **not followed verbatim**. Their technical detail is reused only after the corresponding step starts and its current gate is confirmed.

| Topic | Current v5.9 rule | Older text to disregard |
|---|---|---|
| Phase 4 baseline | Closed and Repo-accepted on 2026-11-19; see §0.1 | Statements that Stage A cannot start because Phase 4 is still open |
| P6-5 placement | Stage A, before generation/certification | Requirements that Phase 5 or P6-1–P6-4 close first |
| Stage A memory-governance tools | Exactly **7**, unchanged | P5-5/P6-5 checks requiring 8 or 10 during Stage A |
| Stage A contracts | S1–S4 + minimal S6/S7/S8 executable for the learning slice; S5 implementation in Stage B | Blanket S1–S6 implementation acceptance before Stage A can exit |
| Stage A milestone | W15 release-candidate demo; W16 full exit including passive learning and lineage | Calling W14/W15a the complete exit before the self-learning MVP is proven |
| Learning activation | Passive observation from real usage; no forced seed task | Mandatory seed bundles or treating installed Skills as execution evidence |
| Learning unit | All real observations enter authority/privacy/namespace/evidence-mode validation and deterministic classification. Declarative memories use FactCandidates → S6/ν-gate → facts + J/≺; procedural learning uses full subtask + Option + Model bundles, approval, independent evaluation, and registration. Bounded proactive prompts only acquire evidence/consent/approval and never grant authority | Option-only procedural learning, forced classification, combined admission gates, persistent personal observation without opt-in, or separate observation storage/lifecycle/learner/tools |
| Capability wording | Stage A returns **settled/released**, not certified, capabilities | Calling settled + `active_release` “certified” before P6-2 |
| Stage B ownership | Line 2 owns P5-3 read-side queries/export, P6-3 RL-ready export, and semantic evidence adaptation | Assigning every read-side mechanism to Line 1 or treating Line 2 as a bulk-mining-only track |
| W22 | Hardening only | P6/Packaging/DS feature delivery scheduled into W22 |
| dataStore DS2/DS3 | First slide-rule items; DS2 is post-W22 by default unless capacity is explicitly approved | Treating either as an unconditional MVP dependency |

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
| Experienced maintainer/domain reviewer | assign before start | Initial S1–S8 semantics, first migration/rollback, first gate/execution PR, first learning bundle, Stage A exit |
| Sub-project 1 lead | assign before start | Host integration, upgrades, and data-retention escalation |
| Sub-project 2 lead | assign before start | J/≺, governance semantics, and schema co-sign |

Each newcomer self-tests their own work; the experienced reviewer provides independent second eyes. Cross-review between the two newcomers is not required. The experienced reviewer is mandatory for initial contracts, weekly checkpoints, first migration/rollback, first registration-gate/execution PR, first learning bundle, and Stage A exit. The same experienced reviewer independently approves and merges PRs during weekly/biweekly reviews after author self-tests and independent reproduction pass.

---

## 1. Architecture and Mental Model

```text
Native host activity
  → STOMP: subtask_event → plan_run → execute decision
  → option_event + observations + outcome + Model events

Local/remote sources
  → dataStore connectors → S7 evidence envelopes → semantic mappers
  → DocumentProjection / fact candidates / S1 candidates / evaluation packages
                                      │
                                      ▼
                         Learning Planner (built-in)
                    observation context → task signature
                    → subtask + Option + Model bundle
                    → approval / registration gate
                    → held-out STOMP evaluation
                    → settle / active_release / revise / revoke

Declarative evidence: fact candidates → ν-gate → facts + J/≺
Procedural evidence: S1 candidates → registration gate → Option/Model assets
State evidence: pre_state → anticipation → post_state → critique/drift
```

dataStore is the semantic adapter into and out of STOMP; it does not replace STOMP or write around it. Native activity goes directly through STOMP without a mandatory dataStore round trip. External sources retain their evidence mode and authority.

### 1.1 Plain-English concepts and authority

| Concept | Working meaning |
|---|---|
| MemoryCore | Authoritative service/storage for facts, governed assets, events, evidence, and revisions |
| DocumentProjection / chunk | Rebuildable data-layer representation of source text; not automatically a true fact |
| Fact | A governed declarative assertion with status, evidence, and revision semantics |
| Candidate | A proposal before promotion. It has no execution or authoritative-fact entitlement |
| Subtask | Task family, input/output requirements, applicable scope, and mandate; the unit that prevents inappropriate generalization |
| Option | A versioned executable implementation within the subtask bundle; not synonymous with a host tool |
| Model | Option-level anticipation, evidence, evaluation, applicability, calibration, and state-transition model; not necessarily an LLM or a second fact store |
| Planner | The control plane that proposes structured decisions; it does not directly change the external world |
| Learning Planner | Built-in learner that passively observes evidence and proposes complete bundles; it never self-certifies or recursively generates Planner assets |
| Observation context | Evidence-accumulation state after a valid trigger; not yet a learned capability |
| Task signature | Comparable goal, input/output shape, scope, and constraints used to decide whether observations belong together |
| Evidence envelope / S7 | Source, scope, task signature, versions, evidence quality, state references, and idempotency supplied by Line 2 |
| LearningRun / S8 | Candidate bundle, learning/held-out split, baseline, expected/actual transition, and evaluation outcome |
| OptionExecutor | The governed execution surface for Options |
| plan_run | Internal execution context for Planner decisions and Option attempts; not a SuperAgent Ticket |
| J / ≺ | Justification/derivation edges and governance/revision lineage; not interchangeable with event links |
| ν-gate / TMS | Truth/evidence admission and truth-maintenance propagation for declarative knowledge |
| Registration gate | Authorization admission for procedural assets; separate from the ν-gate |
| Mandate | The permitted scope of action; recall, parsing, or certification cannot enlarge it |
| Probation / settled / `active_release` | Lifecycle states for a capability and its currently released version; none alone means ω_certify certification |
| NativeAdapter | Minimal bridge to a real host tool/Skill handler; projection loading is not execution success |
| STOMP | The repository's P4-6 label for native governed memory writes through Planner/Option/Model/projection chains; not a second database or task queue |
| dataStore | Pluggable semantic adapter for local/remote sources, providing physical access and critical metadata mapping into the learning cycle; never direct mnestic writes |

| Content / state | Authority |
|---|---|
| Raw Markdown, Skill implementation packages, file history | Filesystem and Git |
| Structured facts, Option/Model/Planner assets, evidence, J/≺, revisions | MemoryCore |
| Host session, native question/permission state | OpenCode or DSH |
| Source/Ticket/Mandate/Assignment/Attention/Outbox | SuperAgent, Stage B only |
| Bulk raw files, file inventory, physical schema, data cursors | dataStore connectors and raw snapshots |
| Anticipated world state | Model anticipation; a hypothesis, not observed fact |
| Observed pre/post state | STOMP observations, with evidence mode preserved |
| Derived search indexes and evidence envelopes | Rebuildable projections, never a second authority |

### 1.2 Worked passive-learning example

The following is an example of activation through ordinary work, not a mandatory seed workflow:

1. Memory starts empty. A user invokes an existing Skill such as `pdf-to-latex` through their normal flow. Installation alone proves nothing; the first valid native execution creates an observation context.
2. dataStore maps the source PDF, Skill package hash, task signature, namespace, pre-state, and evidence mode. STOMP records the actual decision, execution, output, post-state, and Model anticipation/critique.
3. Later natural executions provide comparable evidence. The Learning Planner does not generalize from one observation or fabricate missing rationale, state, or outcomes.
4. Once compatible evidence is sufficient, the Learning Planner proposes a **subtask + Option + Model** bundle with task scope, implementation package, expected postconditions and invariants, and a held-out evaluation plan.
5. A subsequent natural task or an approved isolated run evaluates actual post-state against anticipation: unique output exists, the original PDF is unchanged, and no unauthorized side effect occurred. Unknown state remains null/uncalibrated.
6. Only after approval and compliant real evaluation does the existing registration gate admit the bundle. The Planner can then discover and execute the released Option.
7. Changed source structure, contradictory evidence, or drift causes revision, re-evaluation, or revocation—not reinforcement of the original conclusion.

Required negative demonstrations:

- Empty memory and insufficient evidence produce no candidate and no forced seed.
- An unapproved candidate cannot become an Option through either the candidate path or a host-callable bypass.
- A text `content_hash` cannot satisfy implementation `package_hash` verification.
- An outcome or anticipated state cannot be written directly as an independent declarative fact or observed post-state.
- A revoked capability cannot reappear through historical memory.

### 1.3 Red lines and security boundary

1. **Candidate ≠ capability.** Nothing in the data layer can be executed or registered by virtue of being parsed.
2. **Observation ≠ learning.** A file, installed Skill, single execution, or LLM claim does not prove a general capability.
3. **No instructional text in the injection pool.** `[REFERENCE_MEMORY: non-instructional]` never carries skill bodies or command sequences.
4. **Hash-domain switch at the registration gate.** Text `content_hash` is never capability evidence; only the implementation `package_hash` is.
5. **Two gates, never merged.** The ν-gate answers *truth*; the registration gate answers *authorization*. No single code path may answer both.
6. **Model ≠ second fact store.** Anticipated and actual state transitions remain distinct; outcomes never bypass the ν-gate or Decision Gate.

A hash proves implementation identity/integrity, not safety, correctness, or certification. Approval proves authorization, not factual truth. Recall is evidence presentation, not permission to act. Passive learning never forces a seed task, executes a side-effecting evaluation, or publishes a candidate without the required approval.

### 1.4 Circulation, sedimentation, retirement

**Upward** (data → knowledge): promotion only through the respective gate; heavyweight procedural assets are not built until actually needed. **Downward** (execution → knowledge): index, never copy (§6.1). **Retirement**: layered, never physically deleted (§6.2).

---

## 2. Final Assignment and Schedule (v5.9)

### 2.1 Delivery table

| Workstream | Delivery owner | Window | Review mode |
|---|---|---|---|
| **Stage A: memory product + passive self-learning MVP, no SuperAgent** | | | |
| M0: lifecycle and learning ADR; S1–S4 fixtures; minimal S6/S7/S8 evidence contracts; S5 draft; schema 14 migration plan; unified observation/classification/prompt contracts | both + experienced reviewer | W13 | Joint self-tests + weekly experienced review |
| S2 asset-chain read contract + fixtures | Line 1 | W13 | Author self-test + weekly experienced review |
| P6-5 registration gate, probation → settle/`active_release`, revoke → dormant, trichotomy guard | Line 1 | W13–14 | Author self-test + weekly experienced review + experienced PR review |
| S4 governed Skill execution through NativeAdapter/OptionExecutor | Line 1 | W13–14 | Author self-test + weekly experienced review |
| Learning Planner v0.1: passive triggers, observation contexts, task signatures, full bundle proposals | Line 1 | W14–15 | Author self-test + weekly experienced review + domain review |
| Model transition/evaluation: pre/post state, anticipation, invariants, critique, drift | Line 1 | W14–15 | Author self-test + weekly experienced review |
| Bounded proactive `ask`/`wait`/`replan` prompts, concrete trajectory learning, declarative `planner_context`, namespace/principal/audit hash, scheduler propagation, and OBS-P tests | Line 1 | W14–15 | Author self-test + M0/PR04 gates + real-host experienced review |
| S7 ObservationPattern payload, deterministic observation classification, shared sidecar/semantic ingestion, concrete implementation lineage, candidate/prompt lineage, live query/revision, and OBS-C/OBS-D/DS-09–14 tests | Line 2 | W13–15 | Author self-test + M0/PR04 gates + evidence review |
| P5-5 `bridge_recall` live-read join and status annotation | Line 2 | W13–14 | Author self-test + weekly experienced review |
| P6-5 candidate identification over Markdown/Skill projections | Line 2 | W13–14 | Author self-test + weekly experienced review |
| Initial dataStore connectors and S7 semantic mapping: Markdown, SKILL.md, CSV/JSONL, trajectory exports | Line 2 | W14–15 | Author self-test + weekly experienced review |
| S8 learning/held-out evaluation packages and STOMP feedback mapping | Line 2 | W14–15 | Author self-test + weekly experienced review |
| P6-5 demotion index facts and narrative-side trichotomy tests | Line 2 | W14 | Author self-test + weekly experienced review |
| P5-3 **Markdown lineage only**: chunk↔fact source links and Recall/revision-chain queries | Line 2 | W14–W16 | Author self-test + weekly experienced review + domain review |
| One read-only remote snapshot or HTTP evidence connector | Line 2 | W15–W16 | Author self-test + weekly experienced review |
| **W15 release-candidate demo** | both | W15 | Joint self-tests + experienced PR review |
| **W16 full Stage A exit**, including passive learning and lineage | both | W16 | Joint self-tests + domain owner |
| **Stage B: continuous self-learning + SuperAgent ∥ semantic dataStore/read side** | | | |
| P5-1 shared planner-runtime, recovery, lease, handoff | Line 1 | W17–18 | Author self-test + weekly experienced review |
| Stable individual identity and host/principal mapping, identity lifecycle, and principal-bound prompts | Line 1 | W17–18 | Author self-test + identity/privacy experienced review |
| Continuous Learning Planner: scheduled re-evaluation, new versions, release/rollback | Line 1 | W18–20 | Author self-test + weekly experienced review |
| P5-2 `superagent-adapter v0.1` | Line 1 | W18–19 | Author self-test + experienced PR reviewer |
| P5-3 event-writer semantics and decision-chain association IDs | Line 1 | W18 | Author self-test + weekly experienced review |
| P5-3 `memory_why`, six-tuple queries, decision-chain reads, event export | **Line 2** | W18–19 | Author self-test + weekly experienced review |
| Explicit personal/project/shared-team/approved cross-project profile scopes and scope-aware reads | **Line 2** | W18–19 | Author self-test + cross-line authority/privacy review |
| Broader structured declarative memories, versioned kinds/schemas, source/revision lineage, and safe read projections | **Line 2** | W19–21 | Author self-test + privacy/read-side experienced review |
| P5-4 SuperAgent persistent memory adaptation and learning approval/stop `SuperAgent · MM-L1` | Line 1 | W19–20 | Author self-test + weekly experienced review |
| Dual-host v0.3.0 release candidate, 7→8 memory tools | Line 1 | W19 | Joint self-tests + experienced PR review |
| P6-1 active planning + generation | Line 1 | W20–21 | Author self-test + weekly experienced review |
| P6-2 certification evidence unification from compliant real evaluations | Line 1 | W20–21 | Author self-test + domain review |
| P6-3 RL-ready read-only export | **Line 2** | W20–21 | Author self-test + weekly experienced review |
| P6-4 SuperAgent active memory governance — runtime and continuous learning side `SuperAgent · MM-L1` | Line 1 | W20–21 | Author self-test + weekly experienced review |
| P6-4 governance-data and STOMP-to-evaluation mapping `SuperAgent · MM-L2` | Line 2 | W19–21 | Author self-test + weekly experienced review |
| P6 Horn-rule validation baseline | Line 2 | W19–20 | Author self-test + weekly experienced review |
| Dual-host v0.4.0 release candidate, 8→10 memory tools | Line 1 | W21 | Joint self-tests + experienced PR review |
| MD-Memory continuing maintenance `MM-L2` | Line 2 | W17–21 rolling | Author self-test + weekly experienced review |
| dataStore DS0 contracts + external snapshot restore | Line 2 | W13–W16 background | Author self-test + weekly experienced review |
| dataStore DS1 read-only interfaces and one remote evidence source | Line 2 | W17–W19 if capacity allows | Author self-test + weekly experienced review |
| dataStore DS2 real-data governance and additional source adapters | Line 2 | **post-W22 by default** | Author self-test + weekly experienced review |
| DS3 contract preview | Line 2 | post-W22 | Author self-test + weekly experienced review |
| **W22 hardening only** | both | W22 | Joint self-tests + domain owners |

**Capacity rule.** The previous v5.3 person-week totals remain withdrawn. M0 must produce bottom-up estimates from the lifecycle ADR, learning fixtures, migrations, connectors, and demo scope. No “spare capacity” is assumed. Read-side P5-3/P6-3 and evidence adaptation belong to Line 2 to reduce Line 1's concentration. Production SuperAgent work cannot delay the Stage A passive-learning demonstration.

### 2.2 Master schedule

```text
Stage A — memory product + passive self-learning, no SuperAgent
W13     M0 lifecycle/learning ADR + S1–S4 fixtures + S6/S7/S8 contracts
W14     governed lifecycle + initial connectors + observation contexts
W15     full bundle proposal + Model transition + held-out evaluation + RC demo
W16     Markdown lineage + remote read-only connector + full Stage A gate

Stage B — continuous learning and semantic evidence adaptation
W17–18  P5-1 runtime + continuous Learning Planner + additional mapping
W18–19  P5-2 adapter + P5-3 memory_why/read export + v0.3.0 RC
W19–20  P5-4 learning approval/stop + P6-4 data side + Horn validation
W20–21  P6-1/P6-2/P6-3 + P6-4 runtime + v0.4.0 RC
W22     hardening only: longitudinal learning/revision/rollback, real-host evidence,
        migration/recovery, privacy, source-authority checks, dual sign-off
```

If required work misses W21, move sign-off. Do not relabel new feature completion as hardening.

### 2.3 Stage A exit criteria

All items are due at **W16**, not the W15 release-candidate demo:

- [ ] Memory starts empty with no forced seed. Installed Skills or raw files alone create no learning claim; insufficient evidence creates no candidate.
- [ ] Real activity creates an observation context only with a valid evidence chain, and compatible evidence produces a full subtask + Option + Model candidate bundle.
- [ ] Task scope and declarative premises are validated. No missing rationale, state, outcome, or confidence is fabricated.
- [ ] Where state changes apply, the Model distinguishes anticipated and actual post-state and checks postconditions/invariants. Read-only cases remain null rather than inventing transitions.
- [ ] Evaluation uses a subsequent natural task or an approved isolated real run; the candidate is not scored solely by its own generator.
- [ ] The existing registration gate admits the bundle and the Planner later uses it; contradictory evidence or drift causes revision or revocation.
- [ ] Existing lifecycle demo succeeds: identify → approve → package/mandate gate → probation → real OptionExecutor execution → settle → `active_release` → revoke/dormant.
- [ ] Markdown knowledge and Skill narratives return with settled/released metadata, and Markdown source links and Recall/revision chains are queryable.
- [ ] S1–S4 and minimal S6/S7/S8 fixtures and negative suites pass; S5 implementation remains a Stage B gate.
- [ ] Schema 14 migration and rollback pass on isolated Mem/RocksDB copies; no observation/preference relation or schema 15 is introduced.
- [ ] OBS-C/OBS-D/OBS-P/OBS-A/OBS-E and DS-09–14 scenarios prove unified observation validation, deterministic declarative/procedural/mixed/unknown/insufficient classification, general declarative memories, prompt idempotency, and gate-separated authority. The primary scenario reuses a concrete verified trajectory and its implementation/version lineage with no duplicate asset and no abstract-skill generation. Authorized non-personal evidence may be passive; personal evidence requires opt-in and stable principal identity before persistence. Correction/revision, retention/erasure, source-episode exclusion, independent native evaluation, audit-hash binding, restart/replay, and real OpenCode/DSH evidence pass.
- [ ] The memory-governance family remains exactly **7 tools**, Stage A remains at **13 total tools**, and no new host tool family, observation subsystem, or combined admission gate is added.
- [ ] No Stage A product code imports or calls SuperAgent adapter/Ticket/Attention/deliver/stop APIs.
- [ ] No claim of ω_certify, general multilingual semantic recall, RL readiness, arbitrary code generation, or full continuous service is made.

### 2.3A Stage B personalization follow-ups

These are future Stage B capabilities, not additional Stage A acceptance claims. They extend the unified observation lane rather than creating a separate personalization subsystem. Delivery order is **stable individual identity → explicit profile scopes → broader structured memory**. W22 remains validation and hardening only, not new feature delivery.

**Stable individual identity — Line 1.** Define authenticated `principal_id` lifecycle and host/principal mapping across OpenCode, DSH, restart, and handoff. Principal identity must not be inferred from session names, profile text, or arbitrary client input. Principal-bound prompts and approvals remain idempotent and evidence-linked. Account departure, disablement, retention, and erasure follow the approved identity/privacy policy.

- **ID-01:** two principals in one namespace keep distinct observations, candidates, facts, prompts, and read projections with no fallback to namespace as identity.
- **ID-02:** host/principal mapping remains stable across restart and handoff; unauthenticated or ambiguous identity produces no personal projection.
- **ID-03:** departure, disablement, and erasure remove personal projections while retaining only permitted governance lineage and never reviving personal observations.

**Explicit profile scopes — Line 2.** Define personal, project, shared-team, and explicitly approved cross-project scopes, with scope-aware candidate/read/revision semantics. Personal is the default boundary. Cross-namespace or cross-principal sharing requires explicit approval and preserves source, principal, scope, and approval lineage. Line 1 reviews mandate and Planner authority boundaries.

- **SCOPE-01:** personal/project/team/approved cross-project fixtures apply the intended scope and default to no sharing.
- **SCOPE-02:** cross-project or cross-principal sharing requires explicit approval and never overrides current user instruction, mandate, or Decision Gate.
- **SCOPE-03:** conflicting profile values retain their distinct scopes and revision chains rather than being merged silently.

**Broader structured memory — Line 2.** Define versioned declarative-memory kinds and schemas for profile/context records beyond response style and workflow choice. Structured records retain source, principal/scope, evidence mode, candidate classification, and revision lineage. Unknown fields remain unmapped, and arbitrary free-form profiles, raw observations, secrets, and unsupported values never enter Planner context. Line 1 owns bounded Planner consumption and injection limits.

- **MEM-01:** new versioned kinds round-trip through the unified observation/classification path without creating a new top-level asset family or combined admission gate.
- **MEM-02:** unknown or sensitive fields remain unmapped/excluded and never reach Planner context or logs.
- **MEM-03:** scope/correction/restart/replay preserves fact/version lineage and deterministic read behavior without duplicates or cross-scope leakage.

**Abstract procedural generation — Stage B.** Abstract skills remain procedural candidates, not declarative memories. Generate them only after concrete trajectory reuse is exhausted, using bounded curated implementations or plan templates with explicit `proposed_subtask`, immutable packages, approval, and independent native evaluation. Stage A must not generate abstract skills.

- **GEN-01:** missing implementation evidence produces `unknown`/`insufficient` in Stage A and never creates an abstract candidate; Stage B evaluates a bounded abstract candidate through the full procedural lifecycle.
- **GEN-02:** abstract generation never duplicates an existing implementation and always preserves `parent_option_id`, `parent_version`, and `origin_event_id` lineage when a version is created.
- **GEN-03:** generated packages remain untrusted until package hash, approval, mandate, registration, and independent native evaluation pass; sidecar-only evidence cannot release them.

These follow-ups require identity, privacy, public-contract, and cross-line experienced review before implementation. Existing Stage A OBS and DS tests plus `devNotes/stage-a/concrete-learning-tests.md` remain their prerequisite; future ID/SCOPE/MEM/GEN tests are added only when the corresponding Stage B issue is opened.

### 2A. MD-Memory and evidence tracks

Markdown daily memory is neither pure runtime nor pure dataStore. Work is split by lane even though delivery is organized by stage:

| Split criterion | Owner | Inventory |
|---|---|---|
| Runtime / adapter / approval execution `MM-L1` | Line 1 | Learning Planner; P5-4 Source/Ticket/Assignment mapping, deliver→Recall observations, Attention approvals, handoff/idempotency reconciliation, human-stop enforcement, Report references; P6-4 proactive discovery→mandated execution, lease/recovery, approval execution and stop; Bridge V1/V2 compatibility and release regression |
| Data / ingestion / recall / governance-data `MM-L2` | Line 2 | P5-5 live recall join; Stage A Markdown lineage; P6-5 candidate identification and demotion index; P6-4 source re-read, FactCandidate/superseding candidates and re-Recall; P5-3/P6-3 read-side queries/export; S7/S8 evidence and evaluation mapping; markdownRoot refresh, contract docs, and rolling regression |

Stage A in-track interfaces are S1, S2, S3, S4, and minimal S6/S7/S8. S5 joins the MD-Memory track when decision-chain/read export starts in Stage B. dataStore connectors supply evidence to Learning Planner; STOMP remains the native execution authority.

### 2.4 Self-test and independent review arrangement

Line 1 and Line 2 are not assigned cross-review. Each author self-tests their own workstream and attaches commands, results, isolated evidence, and limitations before requesting PR review:

- Line 1 self-tests S1 gate-consumer behavior, S2 implementation feasibility, S4 execution outcomes, Learning Planner governance, Model transitions, and dataStore execution integration.
- Line 2 self-tests S1 candidate identification, S2 annotation/non-instructional semantics, S3 narrative exits, and S5/S6/S7/S8 evidence and read shapes.
- Both independently run integration acceptance on their own environment; neither certifies the other developer's code.

The **experienced reviewer** holds a checkpoint at the end of each implementation week, covering contract semantics, evidence quality, delivery risks, and follow-ups. Initial contracts, first migration/rollback, first registration/execution PR, first learning bundle, and Stage A exit require this experienced review.

The same **experienced reviewer** performs independent PR review during the weekly and biweekly checkpoints, reproduces acceptance evidence, approves or requests changes, and merges after all gates pass. Author self-tests do not replace independent review, and there is no separate third-reviewer role or ad-hoc approval channel.

Record author self-tests, weekly checkpoints, and PR review results in `docs/dual-track-contracts.md` (planned M0 artifact). Review does not transfer delivery ownership. Send an initial review response within one business day, and escalate a blocked review within two working days.

### 2.5 Risks and pre-authorized slide rules

1. **Phase 4 baseline regression:** run the shared regression before Stage A; any newly reopened storage/governance failure pauses affected work and triggers a fresh baseline review.
2. **Line 1 single point of failure:** Line 2 owns read-side P5-3/P6-3 and evidence adaptation; experienced review covers runtime/SA and the first learning bundle; W22 remains protected.
3. **New-developer semantic risk:** initial domain review is mandatory, not optional peer convention.
4. **Lifecycle compatibility risk:** no registration coding before the lifecycle/learning ADR is approved.
5. **Cold-start/evidence risk:** no forced seed and no candidate from insufficient, sidecar-only, or unverifiable evidence. Ask for real evaluation only when required rather than inventing experience.
6. **Missing dataStore snapshot:** local connectors may continue; real-data DS2 does not start without restore + SHA256 verification.
7. **Capacity slip:** slide DS2 first, DS3 next, then optional interoperability and additional connectors. Required MVP scope moves the date rather than silently dropping acceptance or consuming W22.

The W16 snapshot checkpoint must record one of: `DS2 approved with named capacity`, or `DS2 post-W22`. The default is post-W22.

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
| **S6** | dataStore IngestionBridge and source-authority rules | Line 2 → MemoryCore; Line 1 boundary review | **Blocking minimal implementation for initial connectors** |
| **S7** | EvidenceEnvelope: source/snapshot refs, connector version, namespace, task signature, hashes, timestamps, evidence mode, mapping version, idempotency, raw payload/ref, validation state | Line 2 → Learning Planner | **Blocking learning fixtures** |
| **S8** | LearningRun: candidate bundle, learning/held-out split, baseline, expected/actual transition, evaluation outcome, real/simulated/sidecar separation | Learning Planner ↔ Model/STOMP | **Blocking evaluation fixtures** |

S4 closes the previous numbering gap and makes the execution boundary explicit. S7/S8 are payload contracts, not new top-level asset classes. The S7 `ObservationPattern` payload supports unified validation and deterministic declarative/procedural/mixed/unknown/insufficient classification. Declarative candidates proceed through S6/ν-gate; procedural candidates require full bundles and S8 independent evaluation. No observation-specific storage, lifecycle, learner, tools, or combined admission gate is introduced.

For every contract, record in `docs/dual-track-contracts.md`:

- Owner, producer, consumer, canonical type/schema location, and version.
- Compatibility and change policy, including producer self-test evidence, consumer-facing change notification, and independent PR review when the contract changes.
- One happy-path fixture and one negative fixture for S1–S4 and minimal S6/S7/S8 before implementation.
- Standard result semantics: `gate`, `reason`, `reused`, `blocked`, `failure`, `need_more_evidence`, and `reconcile_required`.
- Migration/rollback and evidence expectations.

### 3.2 S6 — dataStore IngestionBridge

```text
dataStore connectors → S7 evidence envelopes → source-specific semantic mappers
  → DocumentProjection / FactCandidate[] / S1 candidates / evaluation packages
  → S6 controlled ingestion
MemoryCore → dataStore:
  governance verdicts (usable / revise / certified) by reference only
```

dataStore measures what was observed; MemoryCore governs whether and how it may be used. Raw HTML/images/large JSONL/full inventory stay in dataStore. S6 declarative FactCandidates enter the ν-gate, not the S1 procedural registration gate. Credentials remain references, remote content remains non-instructional, and no source is read through login/PoW bypass or imported wholesale into MemoryCore.

### 3.2A S7/S8 — evidence and learning contracts

**S7 EvidenceEnvelope** is the common transport/projection for local and remote evidence. It carries source and snapshot references, connector and mapping versions, namespace/task signature, content and implementation hashes, observed timestamps, evidence mode, validation status, idempotency, and raw payload or payload reference. It does not create a fact, Option, or execution entitlement.

Source-specific mappers decide what the evidence becomes:

- Markdown → DocumentProjection/chunks.
- Assertions → fact candidates for the ν-gate.
- SKILL.md → S1 procedural candidates and immutable package references.
- Trajectories → subtask/Planner/Option/Model event mappings.
- State-changing runs → pre/post state, anticipation, critique, and drift mappings.
- Learning datasets → task signatures, baselines, and held-out evaluation packages.

**S8 LearningRun** links a complete candidate bundle to its evaluation. It records the learning/held-out split, baseline, task scope, expected and actual transitions, independent outcome, and evidence mode. Native activity goes directly through STOMP; external sources use dataStore. S8 maps STOMP evidence back into learning without replacing or duplicating STOMP events.

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

### 3.4 M0 lifecycle and learning compatibility ADR — required before coding

The ADR must resolve the gap between current code and the target lifecycle and passive-learning model:

1. **Registration path:** how candidate-gated Skills coexist with current direct `propose_option`; how a host caller cannot bypass approval for Skill-like packages.
2. **Lifecycle API:** whether general Skill settle/revoke are new internal/public APIs or carefully separated from current hardness-conflict governance. Do not merely rename conflict-specific functions.
3. **Learning unit:** how validated observations are classified as declarative, procedural, mixed, unknown, or insufficient. Declarative memories use FactCandidates → S6/ν-gate → facts + J/≺; procedural learning uses full subtask + Option + Model bundles, approval, independent evaluation, and registration. Prohibit Option-only procedural learning, forced classification, combined admission gates, and separate observation storage/lifecycle/learner/tools.
4. **Passive activation:** valid native/STOMP triggers, observation-context states, task-signature derivation, insufficient-evidence behavior, why no forced seed is required, and why all real observations enter validation but not all become candidates.
5. **State model:** storage and transition rules for probation, settled, revoked/dormant, Model status, `active_release`, immutable versions, and rollback-by-new-version.
6. **World-transition model:** pre-state, anticipated post-state, actual post-state, postconditions, invariants, critique, drift, and null semantics for read-only or unobserved state.
7. **Built-ins:** perpetual-probation execution channels remain outside the capability domain and are never settled/revoked/certified as Skills.
8. **Evidence mapping:** S6/S7 connector and source-authority rules, raw payload retention, real/simulated/sidecar separation, deduplication, learning/held-out splitting, actor/principal/consent/influence provenance, and classifier versioning.
9. **Evaluation:** S8 LearningRun, independent outcomes, Model critique, expected/actual transition checks, why generator self-scores cannot certify a candidate, and why declarative evidence does not contaminate procedural held-out evaluation.
10. **Atomicity/recovery:** candidate → approval → Option/Model → release writes and declarative/prompt/revision writes, crash points, deterministic IDs, idempotency, and `reconcile_required` behavior.
11. **Compatibility/migration:** existing assets, seven-tool/13-total-tool behavior, RocksDB preservation, schema 14 rollback, read projections, and no observation/preference relation or schema 15.
12. **Execution security and consent:** package provenance, untrusted code isolation, mandate scope, host permission mapping, authorized non-personal passive observation, personal opt-in before persistence, stable principal identity, retention/erasure, and the distinction between hash identity and safety.
13. **Acceptance:** exact passive-learning and unified-observation demos, empty-memory and insufficient-evidence fixtures, declarative/procedural/mixed/unknown cases, evidence rows, real-host prompt/consent behavior, and the separation of settled/released from later certification.
14. **Unified observation authority:** OBS-ADR-01–08, confirmed-only inference, deterministic prompt IDs and dismissal semantics, current-instruction/mandate precedence, namespace/principal mapping, fact/version hash binding, deterministic bounded injection, and the M0/PR04/W14/W16 checkpoints in `devNotes/stage-a/review.md`.

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

### 4.3 Learning Planner v0.1 — passive self-learning (Stage A)

The Learning Planner is a built-in control-plane service, not a host tool or a new asset family. It starts in `dormant`, enters `observing` only after a validated evidence chain exists, and returns `need_more_evidence` when the task signature, implementation, or evaluation basis is insufficient. Imported trajectories remain `sidecar` and cannot establish native real execution.

Required behavior:

1. Consume native STOMP evidence and shared S7/sidecar mappings without inventing missing subtask, Model, rationale, state, or outcomes.
2. Derive task signatures from goal, input/output schema, applicable scope, mandate, and declarative premises; map them to `proposed_subtask` until approval.
3. Propose complete subtask + Option + Model bundles from concrete verified trajectories, reusing the observed implementation or preserving version lineage, with immutable packages, J/≺, and idempotency. Do not generate abstract skills in Stage A.
4. Include a world-transition model when applicable: pre-state, anticipated post-state, postconditions, invariants, actual post-state, critique, and drift.
5. Produce an S8 LearningRun with source-episode exclusion, learning/held-out separation, baseline, and independent native evaluation through a natural subsequent task or an approved isolated run.
6. Promote only through the existing registration gate and lifecycle. No direct asset creation, duplicate implementation, self-certification, automatic `AGENTS.md` edit, or arbitrary implementation generation.

Observation states are `dormant → observing → candidate_ready → evaluating → probation/active_release or dormant_watch`. These are learning-run states, not new capability-asset states.

### 4.4 Stage B remaining steps

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

## 5. dataStore Semantic Evidence Adapter (Line 2)

dataStore is a pluggable semantic adapter between local/remote sources and the governed learning cycle. It supplies physical access and critical metadata mapping without becoming a second MemoryCore, Planner, STOMP runtime, or generic crawler. The full roadmap §17 remains the bulk-data domain specification, subject to this handbook's learning and capacity overrides. Proposed bulk-access stack: fsspec / PyArrow / Parquet; DuckDB only after a measured need.

### 5.1 Connector and mapping model

```text
local/remote connectors
  → S7 evidence envelopes
  → source-specific semantic mappers
  → DocumentProjection / fact candidates / S1 candidates / evaluation packages
  → S6 controlled ingestion → MemoryCore and Learning Planner
```

Initial connectors:

1. Markdown and SKILL.md.
2. CSV and JSONL datasets.
3. OpenCode/DSH trajectory exports.
4. One read-only remote snapshot or HTTP source.

Connectors handle paths, snapshots, cursors, offsets, hashes, authentication references, rate limits, and source-specific read constraints. Source-specific mappers preserve meaning; there is no universal lossy schema. Unknown or unmapped fields remain raw/null.

Native host activity goes directly through STOMP without a mandatory dataStore round trip. External evidence uses dataStore and retains its evidence mode and source authority. Raw HTML/images/large JSONL/full inventory stay in dataStore; dataStore never writes mnestic directly.

### 5.2 Delivery phases

- **DS0 (W13–W16 background):** StorageBackend / QueryEngine / SnapshotAccess / S6/S7 contracts; snapshot restore + SHA256 verification for sources that require it; Data Package description; DG-01 inventory reconciliation. Before a required restore, only contracts and read-only index probes are allowed for that source.
- **DS1 (W17–W19 if capacity allows):** bounded-memory streaming, reproducible filter/aggregate/join, on-demand Parquet, idempotent reruns, one read-only remote evidence source, and S8 evaluation packaging. Synthetic fixtures precede real data.
- **DS2 (post-W22 by default):** additional source adapters; corrdata 11,181 reports with page/field/image lineage; matbd read-only scale tests; mged authorization refusals without login/PoW; broken-link/null/duplicate quality reports.
- **DS3 (post-W22 preview):** plan_run integration contract only. Implementation is outside this window.

The current backup contains scripts, reports, dictionaries, and indexes, but not the raw `matbd` / `corrdata` / `mged` data or 10.6 GB volumes required for those later workloads. Their absence does not block initial local connectors. No raw bulk data enters mnestic; count discrepancies retain snapshot and caliber distinctions.

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

No physical deletion of governed assets at any tier. Personal-content retention and erasure follow a separate privacy policy and are not Option retirement operations. These tiers never impersonate one another.

### 6.3 Recall semantics ladder

`planner_options` (decision inputs) → `bridge_recall` live join (metadata) → `query_achievable` (reachability, Stage B). None grants authorization; execution always requires mandate + Planner decision + governed execution.

### 6.4 Merge-blocking red-line suite

Cover candidate idempotency; `package_hash=null` before gate; unapproved/mismatched/mandate-missing registration; host-callable bypass; instructional injection; materialized asset-state shadows; outcome/calibration→facts; dormant non-deletion; revoked non-reload; runtime-demotion asset invariance; crash recovery; namespace/sensitive-path isolation. Use isolated RocksDB and Markdown roots.

### 6.4A Learning and state-transition invariants

- Empty memory produces observation only after a valid real trigger; insufficient evidence returns `need_more_evidence` rather than a candidate.
- Observation context is not an Option, fact, preference, or active release.
- A learning candidate must include its subtask scope and Model evaluation/transition semantics; Option-only learning is incomplete.
- Model anticipation is a hypothesis, observed pre/post state is evidence, and declarative facts require the ν-gate. These never overwrite one another.
- Candidate generation is separate from candidate execution and publication. Side-effecting evaluation or release requires the applicable approval.
- Learning and held-out examples must not leak duplicate trajectories or tasks.
- Unknown confidence, state, rationale, and metrics remain null/uncalibrated. Generator self-scores never certify a candidate.
- Authorized non-personal operational evidence may be collected passively without an additional opt-in. Personal-memory observation requires opt-in before persistence, a stable `principal_id`, namespace/principal isolation, inspection, correction, disablement, and a defined retention/erasure policy. Pre-consent processing is transient, and governance evidence retention does not justify retaining personal content indefinitely.
- All real observations enter authority/privacy/namespace/evidence-mode validation, but only relevant validated observations produce candidates. A real observation is not automatically correct, generalizable, or safe to learn from.
- Deterministic classification returns declarative, procedural, mixed, unknown, or insufficient with a recorded classifier version. Mixed components share source references but not authority; unknown and insufficient patterns are never guessed.
- Declarative memories extend beyond preferences and use FactCandidates → S6/ν-gate → ordinary facts + J/≺. Procedural candidates require full subtask + Option + Model bundles, approval, independent evaluation, and registration. No observation relation, shadow profile, combined admission gate, or new tool family is introduced.
- Proactive prompts use existing Planner `ask`, `wait`, and `replan` decisions and host approval/event paths. They are bounded, idempotent, dismissable, and evidence-linked. A prompt response is new evidence or approval input only and never grants truth, approval, execution, or certification.
- Unconfirmed inference is never promoted automatically. Agent output/actions cannot confirm themselves, and influenced feedback cannot independently strengthen the same candidate. Unconfirmed candidates and `out`, `archived`, `contested`, superseded, unrelated, or out-of-scope facts are excluded from Planner context.
- Only relevant `status="in"` declarative memories enter bounded Planner context. Raw host/S7 payloads, secrets, arbitrary claims, and cross-namespace/principal content are never injected. Missing or ambiguous identity yields no personal projection.
- Mandate, explicit project/safety rules, and Decision Gate remain hard constraints. Observations and prompts cannot create Options, expand budgets/effects/mandates, authorize execution, modify `AGENTS.md`, or suppress a required decision.
- The declarative-context hash covers exact injected fact/version references and policy/namespace/principal inputs; stale context blocks before decision/execution side effects. It is not a claim of complete Planner-state reproducibility.
- Native real, simulated, and sidecar evidence never mix silently; imported success or feedback does not become native real success or native user confirmation.

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
- Empty memory and insufficient evidence return `need_more_evidence` without a candidate or forced seed.
- Passive native usage creates an observation context; installed Skills alone do not create learning.
- Full bundle proposal includes subtask, Option, Model, task scope, declarative premises, and transition semantics where applicable.
- Expected versus actual post-state and invariants; read-only tasks do not invent transitions.
- Learning/held-out leakage and duplicate-trajectory consolidation are rejected.
- Natural or approved isolated evaluation produces an S8 LearningRun; generator self-score cannot settle a bundle.
- Local/remote connectors preserve source authority, evidence mode, hashes, and access controls; no direct mnestic writes.
- Stage A: Phase 0–4 regression and 7-tool compatibility.
- Stage B: Phase 0–5 regression, real/simulated/sidecar separation, and 7→8→10 transitions.
- dataStore: DG-01–DG-06 only when the relevant snapshot/stage is active.

Record evidence in the step's acceptance document; do not paste transient logs into this handbook.

---

## 8. Repo Acceptance Checklist

- [ ] **W15:** Stage A release-candidate demo; governed lifecycle, observation context, full bundle proposal, Model transition, and negative suite.
- [ ] **W16:** full Stage A exit; passive learning, held-out evaluation, Markdown lineage, S1–S4/minimal S6/S7/S8, schema 14 rollback, seven tools, zero SuperAgent dependency, experienced/domain sign-off; snapshot checkpoint selects DS2 capacity or the default post-W22 slide.
- [ ] **W18–19:** continuous runtime and SuperAgent integration milestones; `memory_why`/decision chain/export + P5-4 + v0.3.0 eight tools green.
- [ ] **W20–21:** P6-1/2/3, P6-4 continuous learning, Horn validation, and v0.4.0 ten-tool release candidate green; Stage A learning bundle revalidated with new evidence and rollback.
- [ ] **W22:** only hardening evidence remains: longitudinal learning/revision/rollback, real-host checks, migration/recovery, source-authority and privacy checks, reviewer log, limitations, and dual sign-off.
- [ ] **Learning Planner:** passive activation, full bundle, Model transition/evaluation, S8 LearningRun, release/rollback, and no self-certification evidence archived.
- [ ] **MD-Memory:** P5-4/P6-4 approvals, recall join, lineage, demotion index, and regression evidence archived.
- [ ] **dataStore:** initial connectors and S6/S7/S8 accepted; DS0/DS1 accepted if scheduled; DS2 is accepted separately or explicitly post-W22 with zero MVP impact.

### Sign-off

| Role | Item | Date | Signature |
|---|---|---|---|
| Line 1 owner | P6-5 gate + S4; Learning Planner and Model transition/evaluation; P5-1/2/4; P6-1/2; P6-4 runtime; v0.3/v0.4 packaging | | pending |
| Line 2 owner | Stage A identification/join/lineage/demotion; dataStore connectors and S6/S7/S8; P5-3 read side; P6-3; P6-4 data side; DS0–DS1 | | pending |
| Experienced maintainer/domain reviewer | Initial contracts, first migration/execution, first learning bundle, governance semantics, Stage A exit | | pending |
| Sub-project 1 lead | Host integration, upgrades, data retention | | pending |
| Sub-project 2 lead | Governance semantics and schema co-sign | | pending |

---

## 9. Non-Goals

No forced seed workflow, auto-registration, auto-publish, automatic `AGENTS.md` edit, materialized declarative shadow, combined truth/authorization gate, indiscriminate deletion of governance evidence, or outcome-as-fact path. Personal-memory retention and erasure follow an explicit policy rather than an unlimited-retention claim. No Stage A certification claim, production SuperAgent claim, bulk raw-data import, abstract-skill or arbitrary implementation generation, compositional DAG, RL training, general multilingual semantic claim, or full-type NativeAdapter. **Stage A candidate synthesis reuses concrete observed implementations and preserves version lineage through the existing registration gate; bounded abstract procedural generation is deferred to Stage B. Unreviewed Skill publication is never allowed.** DS2/DS3 implementation, DS4, and DuckDB adoption are outside the guaranteed MVP window unless separately approved.

---

## Appendix A. Amendment History and Rationale

- **v5.0:** attempted a clean stage-based ownership split with S6 as the main inter-line contract.
- **v5.1:** recognized MD-Memory as a cross-cutting datatype and restored necessary S1/S2/S3/S5 boundaries.
- **v5.2:** chose integration first, then parallel runtime/dataStore work; DS0 became a background external dependency.
- **v5.3:** defined Stage A as Markdown + Skills with full procedural management and no SuperAgent; moved Markdown lineage into Stage A.
- **v5.4 (2026-11-19):** added standalone onboarding; reconciled Stage A tool counts/gates; defined S4; separated contract drafts from implementation gates; moved read-side P5-3/P6-3 to Line 2; reserved W20 for hardening; made DS2 post-window by default; required the lifecycle compatibility ADR and experienced initial review. Phase 4 was subsequently completed and Repo-accepted on the same date, superseding the earlier planning assumption.
- **v5.5 (2026-11-21):** approved self-learning refinement. Added the built-in Learning Planner, passive activation from real usage, full subtask + Option + Model learning bundles, Model world-state transitions, S7/S8 evidence and learning contracts, and dataStore as a pluggable semantic evidence adapter for local/remote sources. Stage A now includes a self-learning MVP; Stage B adds continuous self-learning while preserving SuperAgent ownership and Line 2's evidence/read-side role. Extended the target to W22 with W22 reserved for hardening. Review uses author self-tests, weekly/biweekly experienced-review checkpoints, and independent experienced-reviewer PR approval rather than cross-review or a separate third-reviewer role.
- **v5.6 (2026-11-22):** drafted required declarative-preference personalization within the existing S6/S7 → FactCandidate → ν-gate → facts lane and bounded Planner live read. Integrated contracts/tests/acceptance into PR01A/B, PR04A/B, and PR05A/B with PREF scenarios and M0/PR04/W14/W16 checkpoints. Explicit and explicitly confirmed preferences only; no preference-specific storage, lifecycle, learner, tools, automatic inference promotion, or held-out Skill evaluation. This is a planning addition, not an implementation or acceptance claim.
- **v5.7 (2026-11-23):** generalized preference-specific work into unified observation-driven learning across all PRs. All real observations enter authority/privacy/namespace/evidence-mode validation; deterministic declarative/procedural/mixed/unknown/insufficient classification feeds distinct FactCandidate and S1 paths. General declarative memories, authorized non-personal passive evidence, personal opt-in/principal identity, mixed candidates, and bounded proactive prompts are specified with OBS-C/OBS-P/OBS-D/OBS-A/OBS-E and DS-09–14 tests and M0/PR04/W14/W16 gates. Prompts never merge the ν-gate and registration gate or confer authority. No implementation or acceptance claim.
- **v5.8 (2026-11-24):** added Stage B personalization follow-ups with stable individual identity and host/principal mapping owned by Line 1, and explicit personal/project/shared-team/approved cross-project profile scopes plus broader versioned structured memories owned by Line 2. Added ID-01–03, SCOPE-01–03, and MEM-01–03 acceptance cases, dependency ordering, privacy/identity/cross-line review, and W22 hardening boundaries. These are future plans, not Stage A implementation or acceptance claims.
- **v5.9 (2026-11-24):** made concrete verified trajectories and implementation reuse the primary Stage A learning path. Required one shared sidecar/semantic ingestion pipeline, runtime-candidate-verified hierarchy, expected-effect evaluation, source-episode exclusion, native independent evaluation, and duplicate-asset prevention. Abstract procedural generation moved to Stage B with GEN-01–03 and a canonical concrete-learning test matrix. No implementation or acceptance claim.

The old Phase 5–6 order was technically sensible for continuous execution but delayed a usable memory product behind SuperAgent. The current plan keeps the useful dependency order inside Stage B while delivering the independent memory product first. Self-learning is built into the existing subtask–Option–Model–Planner and STOMP governance chains rather than creating a separate observation-learning subsystem.

## Appendix B. Primary References

- First biweekly implementation guide: `devNotes/Week13-14-Self-Learning-MVP-and-Semantic-Evidence.md`.
- Setup and current user workflows: `README.md`.
- Domain and phase roadmap: `devNotes/S01最小产品路线图-完整版.md`.
- Existing memory behavior: `devNotes/MemoryBridge开发方案.md` and `docs/phase4-memory-stomp-acceptance.md`.
- Bilingual extraction and real-host cross-language recall: `docs/bilingual-acceptance.md`.
- Required shared regression: `docs/memory-regression-acceptance.md`.
- Existing event contract: `docs/planner-event-schema-v0.2.md`.
- Continuous host boundary: `docs/continuous-host-contract.md`.
- Sidecar evidence isolation: `docs/sidecar-mapping-v0.1.md`.
- dataStore domain requirements: full roadmap §17.
