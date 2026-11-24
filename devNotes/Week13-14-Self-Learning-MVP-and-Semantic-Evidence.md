---
lang: en
canonical: devNotes/Week13-14-Self-Learning-MVP-and-Semantic-Evidence.md
translation_status: reviewed
source_commit: ec6e40c
reviewed_at: 2026-11-21
创建时间: 2026-11-21
更新时间: 2026-11-21
类型: Self-contained biweekly development handbook (Stage A, Sprint 1)
所属项目: "26-04 AI4Science"
状态: Ready for implementation; no completion claim
tags:
  - dev-handbook
  - biweekly
  - stage-a
  - self-learning
  - evidence-adapters
  - author-self-test
  - experienced-reviewer
---

# Week 13–14 Development Handbook: Self-Learning MVP and Semantic Evidence

> This handbook is self-contained through the canonical files in `devNotes/stage-a/`. Use the short prompts below, then read the exact spec and test files for each PR. Paths marked **planned** are implementation targets, not current capabilities. Acceptance commands and pass tokens must not be cited as passing until real evidence exists.

## 1. Objective and delivery boundary

By the end of W14, produce a **W15 release-candidate demo** proving:

1. A governed Skill completes identification → approval → package/mandate gate → probation → real execution → settle → `active_release` → revoke/dormant.
2. Starting from empty memory and without a forced seed task, ordinary real activity creates an observation context and can produce a complete learning candidate.
3. The candidate contains **subtask + Option + Model**, including task scope, declarative premises, an immutable implementation package, and a world-transition/evaluation model when applicable.
4. A subsequent natural task or an approved isolated real run produces an S8 LearningRun and a release/revise/reject decision through the existing governance path.
5. Initial dataStore connectors map local evidence into S7 EvidenceEnvelopes and STOMP-compatible evaluation data without direct mnestic writes.
6. All supported real observations enter authority/privacy/namespace/evidence-mode validation and deterministic declarative/procedural/mixed/unknown/insufficient classification. Declarative memories extend beyond preferences, proactive prompts are bounded and idempotent, and candidates become authoritative only through their existing ν-gate or approval/evaluation/registration paths. Consent, identity, audit-hash, restart/replay, and real-host evidence are demonstrated without a new observation subsystem or combined admission gate.

This is not the full W16 Stage A exit. Markdown lineage tail work and a read-only remote connector may continue into W15–W16. Observation correction, retention/erasure, lineage, and remote-evidence authority are revalidated at the full W16 gate.

## 2. Roles and review authority

| Role | Responsibility |
|---|---|
| **Line 1 developer** | Lifecycle/registration/execution, Learning Planner, Model transition/evaluation, STOMP recovery, proactive Planner prompts, declarative context/audit; designs and runs all self-tests for owned work |
| **Line 2 developer** | dataStore connectors, S6/S7/S8 evidence mapping, observation classification, candidate identification, procedural recall join, lineage/demotion, candidate/prompt/live query/revision; designs and runs all self-tests for owned work |
| **Experienced reviewer** | Weekly/biweekly architecture and evidence review, independent reproduction, approval or change requests, and merge after all gates pass |
| **Domain owner** | Resolve scope or acceptance disputes, approve required Stage A unified-observation scope, and approve any slide beyond the release-candidate boundary |

Line 1 and Line 2 do not cross-review. The experienced reviewer is the only person authorized to grant final PR approval and merge into `main`. No author may approve or merge their own PR. Initial review response is due within **one business day**.

### PR ownership

| PR | Line 1 deliverables | Line 2 deliverables |
|---|---|---|
| **PR01A/B** | `docs/lifecycle-learning-adr.md`, schema 14, migration implementation, and migration tests | `docs/stage-a-contracts.md`, `src/datastore/evidence-envelope.ts`, and evidence fixtures |
| **PR02A/B** | Candidate registration, lifecycle execution, release/revoke, and lifecycle acceptance | S2 fixtures and recall/lineage annotations consumed by the lifecycle |
| **PR03A/B** | S4 execution and STOMP linkage consumed by evidence mappers | dataStore connectors, semantic mappers, S6 ingestion, and evidence regression |
| **PR04A/B** | Learning Planner, task-signature consumption, full bundle, Model transition, and LearningRun evaluation | Learning/held-out evidence packages and source mappings used by evaluation |
| **PR05A/B** | Lifecycle and learning acceptance scripts, runtime evidence, and recovery verification | Evidence/contract documentation, source/regression verification, and bilingual companion updates |

`devNotes/stage-a/README.md` is the authoritative per-file ownership map and includes the unified observation and learning additions for every PR in §5A, including shared-file merge order. Parallel work is allowed only when it does not touch the same file or contract section; rebase before every merge.

## 3. Architecture and invariants

```text
Native activity
  → STOMP: subtask_event → plan_run → execute decision
  → option_event + observations + outcome + Model events

Local evidence
  → dataStore connectors → S7 EvidenceEnvelope
  → source-specific semantic mappers
  → DocumentProjection / fact candidates / S1 candidates / S8 evaluation packages
                                      │
                                      ▼
                         Learning Planner (built-in)
                    dormant → observing → candidate_ready
                    → subtask + Option + Model bundle
                    → approval / registration gate
                    → held-out STOMP evaluation
                    → settle / active_release / revise / revoke

Declarative assertions: fact candidates → ν-gate → facts + J/≺
Procedural capabilities: S1 candidates → registration gate → Option/Model
State evidence: pre_state → anticipation → post_state → critique/drift
```

Non-negotiables:

- **Candidate ≠ capability.** Parsing or proposing something does not make it executable or authoritative.
- **Observation ≠ learning.** An installed Skill, file, single run, or LLM claim is not a general capability.
- **Model ≠ fact store.** Anticipated state is a hypothesis; observed state is evidence; declarative facts require the ν-gate.
- **STOMP is the native execution authority.** dataStore maps evidence into and out of STOMP but does not replace it.
- **dataStore is not a second MemoryCore.** It supplies physical access and metadata mapping without direct mnestic writes.
- **Candidate creation, execution, and publication are separate.** Side-effecting evaluation or release requires applicable approval.
- **Unknown means unknown.** Missing confidence, state, rationale, and metrics remain `null` or `uncalibrated`.
- **Evidence modes never mix silently.** Imported success does not become native real success.
- **No forced seed.** Empty memory and insufficient evidence return `need_more_evidence`.
- **Seven memory-governance tools remain unchanged.** Current total is 13: seven memory-governance + three Bridge + three Planner tools.

Source authority:

| Content / state | Authority |
|---|---|
| Raw Markdown, Skill packages, source files, file history | Filesystem and Git |
| Facts, Option/Model/Planner assets, events, J/≺, revisions | MemoryCore |
| Host session and native question/permission state | OpenCode or DSH |
| Source/Ticket/Mandate/Assignment/Attention/Outbox | SuperAgent, Stage B only |
| Raw files, inventory, physical schema, data cursors | dataStore connectors and raw snapshots |
| Anticipated state | Model anticipation, not observed fact |
| Observed pre/post state | STOMP observations with evidence mode preserved |
| Derived indexes and evidence envelopes | Rebuildable projections, never a second authority |

## 4. Contracts and environment

The canonical contracts are:

- **S1 ProceduralCandidate:** schema 14 with `package_hash=null` before approval and reversible migration.
- **S2 CapabilityRead:** live status, version, `active_release`, and `evidence_ref`, with no materialized shadow.
- **S3 Settlement trichotomy:** calibration in Model fields, execution in option_event/outcome, and only narrow archival/cross-domain declarative exits.
- **S4 Governed execution:** approved package/version + mandate + Planner execute → NativeAdapter; `projection_loaded ≠ outcome`.
- **S5 Event-chain read:** Planner/Option/Model events ↔ J/≺ ↔ memory_uri and host/run/external IDs; Stage B implementation, design only here.
- **S6 Evidence ingestion:** dataStore connectors → S7 → source-specific mappers → S6 controlled ingestion, without direct mnestic writes.
- **S7 EvidenceEnvelope:** source/snapshot refs, connector/mapping versions, namespace, task signature, hashes, timestamps, evidence mode, validation state, idempotency, and raw payload/ref.
- **S8 LearningRun:** candidate bundle, learning/held-out split, baseline, expected/actual transition, independent outcome, and evidence-mode separation.

S7/S8 are payload contracts, not new top-level asset families.

Use `devNotes/stage-a/README.md` for the exact isolated setup, shared implementation rules, and shared result types. The current recorded regression is **38 files / 137 tests** (the original Stage A planning baseline was 37 files / 135 tests). Never use production 9070 or production Markdown roots for migration, crash, cancellation, or failure tests.

## 5. Copy-paste PR instructions

Each prompt is intentionally short. Give one prompt to a coding agent and require it to read the linked spec and test plan before implementing. Authors run their own tests; there is no cross-review. Every PR also includes its assigned unified-observation deliverables, tests, and checkpoints in §5A and the 0.5.0 specifications.

### PR01A — Line 1: lifecycle ADR, schema, and migration (Days 1–2)

**Copy-paste instruction for Line 1:**

```text
Implement PR01A only: lifecycle ADR, schema 14, and migration.

You are the Line 1 developer. You do not implement Line 2's evidence-envelope contracts, fixtures, or connectors, and you do not review Line 2's work.

Read and follow exactly:
- devNotes/stage-a/pr01-contracts.md
- devNotes/stage-a/pr01-tests.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- docs/lifecycle-learning-adr.md with S1–S5 decisions, passive activation, full bundle, Model transitions, evaluation authority, consent/retention, and acceptance.
- schema/14_procedural_candidates.cozo.
- src/runtime/learning-contracts.ts for StateTransition, LearningBundle, and LearningRun.
- scripts/migrate_stage_a_candidates.ts.
- tests/stage-a-migration.test.ts.

Work test-first: create migration fixtures and tests, confirm expected failures, then implement.

Non-negotiables:
- Use isolated port 9175, never production 9070.
- package_hash and approval_ref remain null before approval.
- CozoScript stays in src/memory/mnesticClient.ts.
- Preserve IDs, bindings, facts, J/≺, R4, and the 97-record boundary.
- Keep the seven memory-governance tools unchanged.
- Do not implement PR02 lifecycle execution or PR03 connectors.

Done when:
- ADR and S1–S5 sections are complete.
- Migration and rollback pass on isolated Mem and RocksDB.
- All baseline and new tests pass.
- Self-test commands, results, event/row IDs, spec version, Change Log, and limitations are attached.

Stop on unknown _next relations, contract conflicts, or any red test.
```

### PR01B — Line 2: evidence contracts and fixtures (Days 1–2, parallel with PR01A)

**Copy-paste instruction for Line 2:**

```text
Implement PR01B only: S6/S7/S8 evidence contracts, EvidenceEnvelope, and evidence fixtures.

You are the Line 2 developer. You do not implement Line 1's lifecycle ADR, schema migration, or Learning Planner, and you do not review Line 1's work.

Read and follow exactly:
- devNotes/stage-a/pr01-contracts.md
- devNotes/stage-a/pr01-tests.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- docs/stage-a-contracts.md with S6/S7/S8 owners, versions, fixtures, and change protocol.
- src/datastore/evidence-envelope.ts with SourceKind, TaskSignature, EvidenceEnvelope, and the additive source-specific ObservationPattern payload in §5A.
- Evidence fixtures for Markdown, SKILL.md, CSV/JSONL, trajectory exports, and OBS-C01–10 unified-observation contract scenarios.
- English/Chinese documentation companions where applicable.

Write fixture and validation tests first for envelope round-trip, unknown fields, and held-out leakage.

Non-negotiables:
- package_hash and approval_ref remain null before approval.
- Unknown fields remain raw/null; do not invent task signatures.
- Preserve source authority, namespaces, evidence modes, and R4.
- No direct mnestic writes, universal lossy schema, or fabricated evidence.
- Do not implement PR02 lifecycle execution or PR03 connectors.

Done when:
- S6/S7/S8 contracts and all initial evidence fixtures are complete.
- Envelope round-trip, unknown-field, and held-out-leakage tests pass.
- Self-test commands, results, event/row IDs, spec version, Change Log, and limitations are attached.

Stop on missing source authority, cross-namespace leakage, or any red test.
```

### PR02A — Line 1: governed lifecycle execution (Days 3–6)

**Copy-paste instruction for Line 1:**

```text
Implement PR02A only: governed lifecycle execution and acceptance.

You are the Line 1 developer. You do not implement Line 2's S2 fixtures or recall annotations, and you do not review Line 2's work.

PR01A is complete. Read and follow exactly:
- devNotes/stage-a/pr02-lifecycle.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- Candidate identification, approval, registration, and S4 governed execution.
- Option/Model probation → settle → active_release and revoke → dormant history.
- Demotion index and narrative-side trichotomy tests.
- tests/procedural-lifecycle.test.ts.
- scripts/stage_a_lifecycle_acceptance.ts returning STAGE_A_LIFECYCLE_PASS only after all assertions pass.

Use the immutable local read-only Skill fixture in the spec and verify expected failures before implementing.

Non-negotiables:
- No asset exists before approval and package/mandate verification.
- Partial writes return reconcile_required, never half an asset.
- Recall returns metadata only, not implementation text or execution authority.
- Outcomes and calibration never become independent declarative facts.
- Keep seven memory-governance tools unchanged.
- Do not implement PR03 connectors or PR04 Learning Planner.

Done when:
- identify → approve → gate → probation → real execution → settle → active_release → revoke/dormant passes.
- Actual RocksDB rows prove bindings, execution, release, and dormant history.
- Migration/rollback, negative suite, and STAGE_A_LIFECYCLE_PASS pass.
- Self-test commands, results, spec version, Change Log, and limitations are attached.

Stop on generated-only evidence, direct mnestic writes, or any red test.
```

### PR02B — Line 2: S2 fixtures and recall/lineage annotations (Days 3–6, parallel with PR02A)

**Copy-paste instruction for Line 2:**

```text
Implement PR02B only: S2 fixtures and recall/lineage annotations consumed by the lifecycle.

You are the Line 2 developer. You do not implement Line 1's candidate registration or lifecycle execution, and you do not review Line 1's work.

PR01B is complete. Read and follow exactly:
- devNotes/stage-a/pr02-lifecycle.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- S2 fixtures for listActiveCapabilityMetadata and listCapabilityHistory.
- Recall annotations for settled/released metadata, probation/revoked/dormant history, and evidence_ref backlinks.
- tests/procedural-recall.test.ts covering live join, no materialized shadow, and immediate revoke visibility.
- Source and revision-chain queries used by the recall join.

Non-negotiables:
- Return metadata only, never implementation text or execution authority.
- Built-ins and probation/revoked/dormant assets are excluded by default.
- No materialized declarative shadow or stale cached status.
- Keep R4 and the existing seven memory-governance tools unchanged.
- Do not implement PR03 connectors or PR04 Learning Planner.

Done when:
- S2 fixtures and recall annotations pass on isolated RocksDB.
- settle/revoke/active_release changes appear on the next recall with no shadow.
- Built-ins and probation/revoked/dormant assets stay excluded by default.
- Self-test commands, results, spec version, Change Log, and limitations are attached.

Stop on generated-only evidence, missing lineage, or any red test.
```

### PR03A — Line 1: S4 execution and STOMP linkage (Days 4–5, parallel with PR03B)

**Copy-paste instruction for Line 1:**

```text
Implement PR03A only: S4 execution and STOMP linkage consumed by evidence mappers.

You are the Line 1 developer. You do not implement Line 2's dataStore connectors or semantic mappers, and you do not review Line 2's work.

PR02A is complete. Read and follow exactly:
- devNotes/stage-a/pr03-evidence-adapters.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- S4 execution contract fixtures for approved package/version + mandate + Planner execute → NativeAdapter.
- STOMP linkage for pre/post state, anticipation, actual post-state, critique, and drift consumed by mappers.
- Typed success/failure/denied/cancelled/reconcile outcomes with projection_loaded ≠ outcome.
- Execution and recovery evidence needed by the Learning Planner.

Write expected-failure tests first for unauthorized execution, partial evidence, cancellation, and replay.

Non-negotiables:
- No execution from file presence or unapproved candidates.
- Expected and actual post-state remain distinct; no fabricated transition or outcome.
- Partial execution evidence returns reconcile_required, never a success claim.
- Keep real, simulated, and sidecar evidence separate and R4 unchanged.
- Do not implement PR04 Learning Planner or PR05 acceptance.

Done when:
- S4 execution and STOMP linkage pass with real observations and outcomes.
- Cancellation, denial, replay, and partial-evidence cases return the required blocked/reconcile result.
- Self-test commands, results, spec version, Change Log, and limitations are attached.

Stop on generated-only evidence, direct mnestic writes, or any red test.
```

### PR03B — Line 2: dataStore connectors and semantic mappers (Days 4–7, parallel with PR03A)

**Copy-paste instruction for Line 2:**

```text
Implement PR03B only: dataStore connectors and semantic mappers.

You are the Line 2 developer. You do not implement Line 1's S4 execution or Learning Planner, and you do not review Line 1's work.

PR01B and PR02B are complete. Read and follow exactly:
- devNotes/stage-a/pr03-evidence-adapters.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- Initial connectors for Markdown, SKILL.md, CSV/JSONL, and trajectory exports.
- Source-specific mappers into DocumentProjection, fact candidates, S1 candidates, and S8 evaluation packages.
- S6 controlled ingestion with source/snapshot refs, versions, hashes, evidence mode, and idempotency.
- tests/datastore-evidence.test.ts.

Write connector fixtures first for each initial source type and verify expected failures.

Non-negotiables:
- Preserve source authority, namespaces, and sensitive-path constraints.
- Keep real, simulated, and sidecar evidence separate; imported success is not native real.
- Unknown fields remain raw/null; do not invent task signatures.
- No direct mnestic writes, universal lossy schema, or mandatory dataStore round trip for native STOMP.
- Keep raw HTML/images/large JSONL outside MemoryCore.
- Do not implement PR04 Learning Planner or PR05 acceptance.

Done when:
- Every initial source type has an S7 envelope and source-specific mapped output.
- No direct writes, cross-namespace leakage, or credentials in projections/logs.
- All new tests plus the existing regression pass on isolated storage.
- Self-test commands, results, spec version, Change Log, and limitations are attached.

Stop on direct writes, cross-namespace leaks, fabricated metadata, or any red test.
```

### PR04A — Line 1: passive Learning Planner and Model transition (Days 7–9)

**Copy-paste instruction for Line 1:**

```text
Implement PR04A only: passive Learning Planner and Model transition.

You are the Line 1 developer. You do not implement Line 2's learning/held-out evidence packages or source mappings, and you do not review Line 2's work.

PR01A–PR03A are complete. Read and follow exactly:
- devNotes/stage-a/pr04-learning-planner.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- src/runtime/learning-planner.ts and src/runtime/learning-run.ts.
- Observation states: dormant → observing → candidate_ready → evaluating → probation/active_release or dormant_watch.
- Task-signature consumption and concrete-trajectory bundle synthesis using observed implementations and version lineage; no Stage A abstract generation.
- Model transition support with anticipated/actual post-state, invariants, critique, and drift.
- S8 LearningRun with learning/held-out separation, source-episode exclusion, baseline, and independent native evaluation.
- tests/learning-planner.test.ts, tests/learning-state-transition.test.ts, and tests/learning-recovery.test.ts.

Use the concrete fixture sequence in devNotes/stage-a/concrete-learning-tests.md and write expected-failure tests first.

Non-negotiables:
- Empty memory and insufficient evidence return need_more_evidence with no candidate or forced seed.
- Propose only full subtask + Option + Model bundles from compatible validated trajectories with concrete implementations; preserve evidence modes and reuse/version lineage.
- Expected and actual post-state remain distinct; read-only tasks fabricate no transition.
- Held-out evaluation is independent and native, excludes source episodes, and generator self-score cannot settle.
- Candidate generation, execution, and publication remain separate.
- Do not implement PR05 acceptance or generate arbitrary implementation code.

Done when:
- Observation, full bundle, S8 evaluation, and release/revise/revoke pass.
- LearningRun lineage is traceable from source evidence through Model critique to governance.
- Empty-memory, insufficient-evidence, recovery, and negative tests pass.
- Self-test commands, results, spec version, Change Log, and limitations are attached.

Stop on side-effecting evaluation/release without approval, missing real evidence, or any red test.
```

### PR04B — Line 2: learning and held-out evidence packages (Days 7–9, parallel with PR04A)

**Copy-paste instruction for Line 2:**

```text
Implement PR04B only: learning and held-out evidence packages and source mappings used by evaluation.

You are the Line 2 developer. You do not implement Line 1's Learning Planner or LearningRun evaluation, and you do not review Line 1's work.

PR01B–PR03B are complete. Read and follow exactly:
- devNotes/stage-a/pr04-learning-planner.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- Learning evidence packages with source refs, task signatures, evidence mode, and deduplicated trajectory mappings.
- Held-out evidence packages with independent source refs and no learning-trajectory overlap.
- Source mappings for pre/post state, anticipation, actual post-state, critique, and drift consumed by Model evaluation.
- Evidence fixtures for learning, held-out, duplicate, contradictory, and insufficient-evidence cases.

Write evidence-package and leakage tests first; do not invent learning outcomes or state transitions.

Non-negotiables:
- Learning and held-out examples must not share trajectories or near-duplicate tasks.
- Real, simulated, and sidecar evidence remain separate; imported success is not native real.
- Unknown fields and missing evidence remain raw/null; do not invent task signatures or outcomes.
- No direct mnestic writes or bulk raw-data import into MemoryCore.
- Do not implement PR05 acceptance.

Done when:
- Learning and held-out packages are deduplicated, source-traceable, and free of trajectory leakage.
- Contradictory and insufficient-evidence fixtures return need_more_evidence without a candidate.
- Self-test commands, results, spec version, Change Log, and limitations are attached.

Stop on held-out leakage, fabricated evidence, or any red test.
```

### PR05A — Line 1: lifecycle and learning acceptance plus recovery (Days 9–10)

**Copy-paste instruction for Line 1:**

```text
Implement PR05A only: lifecycle and learning acceptance scripts, runtime evidence, and recovery verification.

You are the Line 1 developer. You do not implement Line 2's evidence/contract documentation or source regression package, and you do not review Line 2's work.

PR01A–PR04A are complete. Read and follow exactly:
- devNotes/stage-a/pr05-acceptance.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- scripts/stage_a_learning_acceptance.ts returning STAGE_A_LEARNING_PASS only after all assertions pass.
- Lifecycle, passive-learning, restart, replay, and recovery evidence with actual IDs.
- Real OpenCode and DSH evidence where model-visible behavior is involved.
- Final runtime regression and recovery report.

Implement the acceptance sequence and result schema in the spec; do not invent a pass condition.

Non-negotiables:
- Run lifecycle, passive learning, restart, replay, and existing bilingual regressions.
- Actual RocksDB rows and real host logs support every result.
- Write .data/stage-a-learning-acceptance-result.json only after every assertion passes.
- R4 remains blocked and no certification, production SuperAgent, general multilingual semantic claim, or continuous-service claim is made.
- Do not mark the W16 full Stage A exit complete.

Done when:
- All acceptance checks and the full regression pass.
- The result file contains actual IDs and explicit limitations.
- Runtime evidence and recovery reports are complete.
- Self-test commands, results, spec version, Change Log, and limitations are attached.

Stop on generated-only evidence, production data, hidden failures, or any red test.
```

### PR05B — Line 2: evidence and source regression documentation (Days 9–10, parallel with PR05A)

**Copy-paste instruction for Line 2:**

```text
Implement PR05B only: evidence and source regression documentation.

You are the Line 2 developer. You do not implement Line 1's acceptance scripts or runtime recovery verification, and you do not review Line 1's work.

PR01B–PR04B are complete. Read and follow exactly:
- devNotes/stage-a/pr05-acceptance.md
- devNotes/stage-a/iterative-testing.md
- devNotes/stage-a/review.md

Deliver:
- docs/stage-a-w13-14-acceptance.md evidence/source sections with source refs, mappings, commands, reviewer log, and limitations.
- Updated docs/stage-a-contracts.md with spec versions, Change Logs, source/evidence verification, and remaining W16 work.
- Source and evidence regression reports for every initial connector and held-out package.
- English/Chinese documentation companions where applicable.

Use the spec's evidence matrix and actual source mappings; do not invent a pass condition.

Non-negotiables:
- Every initial source type has an S7 envelope and source-specific mapped output.
- No direct mnestic writes, cross-namespace leakage, or credentials in projections/logs.
- Learning and held-out packages remain source-traceable and free of trajectory leakage.
- R4 and existing bilingual workflows remain unchanged.
- Do not mark the W16 full Stage A exit complete.

Done when:
- All source/evidence regressions pass and documentation links are valid.
- Actual source refs, mappings, commands, and limitations are recorded.
- Self-test commands, results, spec version, Change Log, and limitations are attached.

Stop on generated-only evidence, production data, hidden failures, or any red test.
```

## 5A. Unified observation and learning increment (all PRs)

This increment is required Stage A scope and uses one validated observation intake for declarative and procedural learning. Preferences are only one declarative-memory subtype; assertions, corrections, recurring context, and other governed facts use the same declarative lane.

```text
Real observation → authority/privacy/namespace/evidence-mode validation
→ S7 EvidenceEnvelope → deterministic source-specific classification
→ declarative: FactCandidate → S6/ν-gate → facts + J/≺
→ procedural: S1 candidate → full bundle → approval + independent evaluation + registration → Option/Model
```

All real observations may enter validation, but only relevant validated observations produce candidates. Authorized non-personal operational evidence may be collected passively without an additional opt-in. Personal or behavioral evidence requires opt-in and a stable `principal_id` before persistent observation or candidate storage; pre-consent processing is transient. Real, simulated, and sidecar evidence never mix silently.

Classification is `declarative | procedural | mixed | unknown | insufficient`. Mixed observations produce separate components with shared source references but no shared authority. Unknown or insufficient patterns remain unmapped or return `need_more_evidence`; never invent a classification, confidence, scope, or task signature. Record `classifier_version` and evidence references. The initial classifier is deterministic and requires no LLM.

Proactive prompts use existing Planner `ask`, `wait`, and `replan` decisions and host approval/event paths. Prompt IDs are deterministic over candidate ID, prompt kind, and principal ID. Prompts are bounded, idempotent, dismissable, and evidence-linked. A prompt response is new evidence or approval input only—it never grants truth, approval, execution, or certification. Personal consent must precede persistent observation; prompts cannot bypass ν-gate, registration, independent evaluation, or Decision Gate.

Declarative memories are non-instructional context. Only relevant `status="in"` memories enter bounded `declarative_context`; candidates and `out`, `archived`, `contested`, superseded, unrelated, or out-of-scope memories are excluded. Raw observations, sensitive claims, and cross-namespace/principal content are excluded. No observation or prompt creates an Option/Model, changes budgets/effects/mandates, adds a decision type or tool, modifies `AGENTS.md`, or authorizes execution.

### PR01A/B additions

- **PR01A:** resolve OBS-ADR-01–08 for authority, storage/gates, privacy/identity, classification, inference/prompts, read scope, audit, and compatibility. Schema 14 remains the only new relation; no observation relation or schema 15.
- **PR01B:** add the S7 `ObservationPattern` payload, actor/principal/consent/influence provenance, classification outputs, and `tests/stage-a-observation-contracts.test.ts` with OBS-C01–10 for authorized operational observations, personal consent, principal separation, general declarative memories, classification outcomes, replay/correction, self-confirmation, sensitive/unknown fields, evidence isolation, and prompt contracts.
- **M0/W13 gate:** domain owner approves scope; experienced reviewer approves cross-line/public/privacy/identity/prompt contracts and independently runs PR01 plus baseline tests. Record approved observation/classifier versions and sample declarative, procedural, mixed, and insufficient mappings. Any red/unclassified test or unresolved authority question blocks dependent work.

### PR02A/B additions

- **PR02A:** preserve the existing procedural lifecycle as the only approval/registration/release path. LIFE-09–13 prove prompts cannot approve/register/execute, declarative and mixed candidates cannot bypass full S1 evaluation/registration, replay/dismissal is not approval, partial mixed admission reconciles, and candidates are not presented as active memories/capabilities.
- **PR02B:** S2 recall/lineage annotations distinguish candidates, active declarative memories, and released procedural assets without conflating source links and J/≺.

### PR03A/B additions

- **PR03A:** native/STOMP linkage preserves actor, source event, namespace, principal ID where applicable, consent state, evidence mode, and idempotency through existing host/subtask/Planner/Option chains. Personal evidence cannot persist before consent; native activity does not require a dataStore round trip.
- **PR03B:** implement deterministic observation classification and source-specific candidate mapping with classifier versions and unmapped handling. DS-09–14 cover validation of all supported observations, consent/identity, non-preference declarative and mixed mappings, unknown/insufficient outcomes, deterministic replay, sensitive content, and no direct writes or combined gates.

### PR04A/B additions

- **PR04A:** implement bounded proactive prompts through existing Planner decisions and host approval/event paths; consume Line 2's live declarative query using validated namespace and principal mapping; add bounded deterministic `declarative_context` and hash binding; record fact/version and prompt-response references. Add `tests/stage-a-observation-planner.test.ts` with OBS-P01–12 for consent, identity, prompt replay/dismissal, prompt-to-gate separation, general declarative context, namespace/principal filtering, deterministic bounds, stale hashes, scheduler state, authority invariance, and mixed paths.
- **PR04B:** consume PR03 classification outputs; implement S6 authority/namespace/principal/evidence-mode/idempotency validation, live declarative query, candidate/prompt/revision lineage, and reconciliation. Add `tests/stage-a-observation-evidence.test.ts` with OBS-D01–12 for authorized operational evidence, personal consent/identity, general declarative facts, mixed components, unknown/insufficient patterns, replay, self-confirmation, evidence separation, correction lineage, partial recovery, sensitive data, and storage authority.
- **PR04 integration gate:** both lines attach independent self-test packages and actual row/event IDs; OBS-P/OBS-D and the full suite pass on isolated Mem/RocksDB; authorized non-personal, personal-consent, declarative non-preference, procedural, mixed, unknown, and prompt-replay scenarios pass through one intake. Contract changes return to the M0/specification-change gate, and red/unclassified tests block PR05.

The existing procedural Learning Planner, full bundle, Model transition, S8 evaluation, and held-out independence requirements remain unchanged. Declarative memories require no S8 capability evaluation; procedural bundles retain independent held-out evaluation.

### PR05A/B additions

Extend `scripts/stage_a_learning_acceptance.ts` and its existing result schema/pass token; do not add another acceptance framework.

- **PR05A:** OBS-A01–10 cover OpenCode/DSH operational observations, personal consent and principal isolation, non-preference declarative memories, procedural and mixed paths, unknown/insufficient patterns, prompt idempotency/authority, instruction/mandate precedence, restart/replay/recovery, privacy/retention/erasure, and existing regressions. Require `observation_classification`, `observation_consent_privacy`, `observation_prompt_gates`, `declarative_memory_revision_recovery`, and `observation_real_host_behavior` to be true. Record actual observation envelope, declarative fact, procedural candidate, prompt event, and learning-context hash IDs.
- **PR05B:** OBS-E01–06 verify source/classification/candidate/gate lineage, classification and consent/identity regressions, original connector and S8 regressions, prompt idempotency and authority limitations, and bilingual contract parity.
- **W14 gate:** the experienced reviewer independently reruns RocksDB and real-host scenarios, inspects actual rows/logs, verifies zero cross-namespace/principal leaks, unauthorized effects, personal evidence persisted without consent, sensitive injections, unconfirmed injections, or prompt-derived authority. Any failed gate blocks merge.
- **Post-merge/W16:** rerun build/tests and both acceptance scripts on `main`. At the full W16 gate, revalidate observation correction, restart, retention/erasure, lineage, and remote-evidence authority after the remaining W16 work. Remote imported evidence cannot silently become native user confirmation.

The canonical details are in `devNotes/stage-a/pr01-contracts.md`, `pr01-tests.md`, `pr02-lifecycle.md`, `pr03-evidence-adapters.md`, `pr04-learning-planner.md`, `pr05-acceptance.md`, and `review.md` at specification version **0.5.0**. All observation scenarios follow `iterative-testing.md`: record fixtures, expected failures, iterations, classifications, actual evidence, and limitations; no planned test or pass token is an acceptance claim before execution.

## 5B. Concrete evidence and implementation-reuse refinement (all PRs)

Stage A's primary learning path is **concrete verified trajectories**, not abstract-skill generation. Use an existing implementation and outcome chain whenever available. Abstract procedural generation is deferred to Stage B.

```text
Concrete verified trajectory
→ existing implementation and outcome chain confirmed
→ candidate with actual pi_ref/version/arguments
→ independent evaluation on a non-source episode
→ approved Option reuse or lineage-preserving version
→ verified Planner guidance
→ demotion on contradictory evidence
```

A concrete procedural candidate retains `option_id`, `model_id`, `pi_ref`, implementation version, arguments, pre/post state, outcome, and verification provenance. Reuse the existing Option/Model or preserve lineage through `parent_option_id`, `parent_version`, and `origin_event_id`; never duplicate an implementation merely because a new task signature was inferred.

Runtime hypotheses remain non-instructional projections. Expected effects are frozen before subsequent evaluation, not retroactively invented for historical outcomes. Source episodes are excluded from independent validation, with at most one conclusive verdict per candidate per episode. Sidecar evidence can propose but cannot release; independent native evaluation is required. Missing implementation evidence returns `unknown` or `insufficient` and never generates an abstract skill.

`devNotes/stage-a/concrete-learning-tests.md` is the canonical fixture and test matrix. It covers concrete reuse, duplicate assets, rejected verification, source exclusion, precision evaluation, sidecar/native separation, shared sidecar/semantic ingestion, no duplicate projections, and the Stage A abstract-generation prohibition.

### PR01A/B — concrete contracts

- Keep unified observation ADR and OBS-C fixtures, adding implementation/version lineage, concrete candidate authority, source-episode exclusion, and the no-abstract-generation invariant.
- Schema 14 remains the only new relation; runtime hypotheses remain projections, not a new memory table.

### PR02A/B — concrete lifecycle and recall

- Reuse existing Option/Model implementations or create lineage-preserving versions through `parent_option_id`, `parent_version`, and `origin_event_id`.
- LIFE-14–15 prove no duplicate assets, implementation/package mismatch and rejected verification cannot release, and revoked/dormant assets never reload from history.
- Recall distinguishes runtime observations, candidates, active memories, and released assets without shadowing.

### PR03A/B — shared ingestion

- Use one sidecar/semantic ingestion pipeline: one envelope, one classification result, and one projection set per source event.
- Sidecar is the trajectory-specific compatibility implementation, not a second observation authority or a duplicate implementation of the semantic mapper.
- DS-09–14 include concrete implementation reuse, unknown/insufficient outcomes, deterministic replay, and no duplicate ingestion.

### PR04A/B — concrete learning and evaluation

- Prefer concrete implementation reuse before any abstract generation. Missing implementation returns `unknown` or `insufficient` and never creates an abstract skill.
- Expected effects are frozen before subsequent evaluation and compared with actual post-state. Source episodes are excluded and each candidate has at most one conclusive verdict per episode.
- Sidecar-only evidence cannot release; independent native evaluation is required. Preserve implementation lineage, prompt idempotency, and `reconcile_required` behavior.

### PR05A/B — concrete acceptance and evidence

- Make concrete verified-trajectory reuse the primary acceptance scenario, plus declarative, mixed, unknown, insufficient, consent, prompt, privacy, replay, and recovery cases.
- Require `concrete_trajectory_reuse`, `native_independent_evaluation`, `source_episode_exclusion`, `no_duplicate_assets`, and `no_abstract_generation` in the acceptance result.
- Record actual native evaluation Option event, implementation/version lineage, and evidence references; do not accept sidecar-only release or duplicate assets.
- Extend the sanitized evidence package with concrete trajectory and evaluation lineage without raw logs or absolute local paths.

## 5C. Unified Options and prequential fan-out (all PRs)

Stage A supports two fulfillment forms through the same full Option + Model, approval/package/mandate/registration, retrieval, evaluation, and why-provenance model:

```text
Concrete implementation Option → Decision Gate → controlled code/tool fulfillment
Trajectory-level NL Option → Decision Gate → controlled host inference
```

NL Options use `pi_type="natural_language"` and immutable policy packages with condition, policy text, trajectory scope, compatible actions, declared effects, expected/failure predicates, source episodes, parent versions, and normalized policy hashes. They are not generalized abstract Skills. An unavailable NL handler blocks. NL output cannot invoke tools directly; every downstream tool/code action requires another authorized execute decision.

Only trajectory-level, episode-proximate, evidence-linked NL hypotheses enter runtime guidance. They are non-authoritative and expire with the episode. Verified NL Options remain restricted to their concrete trajectory scope. Generalized abstract NL Skills and generated Horn rules remain Stage B.

### Stepwise extraction and unified retrieval

- **PR01A/B:** define `candidate_kind="concrete_option" | "trajectory_policy"`, immutable policy packages and versions, inference/effect vocabulary, fan-out audit/verdict identities, fixed Horn/provenance rules, and multi-candidate fixtures. M0 additionally approves the public `planner_options` schema, NL handler, inference budget/privacy, and propagation contracts.
- **PR02A/B:** both kinds follow approval/package/mandate/registration and release/revoke lifecycle. LIFE-16–20 prove full NL registration, missing-handler/effect denial, no direct tool invocation, immutable merges, scoped contradiction propagation, and no authority expansion.
- **PR03A/B:** general stepwise triggers capture actual output/post-state, errors, trusted no-progress, terminal/user feedback, and policy-package observations through native STOMP and one shared S7/sidecar/semantic pipeline. Optional LLM policy/merge proposals remain untrusted until deterministic validation; no duplicate projections or fabricated pre/post state, terminal verdicts, or chain-of-thought are allowed.
- **PR04A/B:** `planner_options` lists both kinds with additive fulfillment metadata. Fixed Cozo eligibility filters plus deterministic application ranking handle episode/task proximity, schema/action compatibility, evidence, current version, and tie-breaks. Mem is an episode cache; RocksDB is the persistent authority. Do not use placeholder embeddings as semantic scores.

### Prequential fan-out and propagation

After the actor selects an authorized Option and before implementation or inference, register every eligible hidden candidate with compatible trajectory scope/action and a frozen falsifiable effect specification. `audit_id` binds candidate/version, episode, selected Option event, and predicate hash; `verdict_key` binds candidate/version and episode. Recheck source exclusions and verdict uniqueness at registration and recording.

One actual execution can produce independent supporting, contradictory, or unresolved verdicts for several candidates without duplicate execution records. It cannot validate a distinct implementation or NL policy without that procedure's own approved native execution. Actor-visible guidance is separate from hidden audit candidates and cannot independently confirm itself.

Deterministic audit budgets leave overflow pending and visible without extra effects. Pending trials may be resolved by eligible terminal/user/external evidence; completion is not automatically success and stopping is not automatically failure. Retry/replay cannot create another conclusive episode verdict.

Fixed reviewed Horn/Datalog rules propagate only explicit `affected`, `guidance_eligible`, `option_retrievable`, and `contested` consequences. Required contradictions use existing revision/demotion paths; alternative valid justifications remain effective. Support never automatically flows to dependents, merge children, or similar Options. Declarative claims still require FactCandidate → S6/ν-gate → facts + J/≺. No arbitrary generated Horn rule activates in Stage A.

Every consequence retains source execution, candidate/policy/predicate versions, audit/verdict, merge parents, rule/evaluator versions, approval/mandate where applicable, fulfillment, and affected-entity provenance. Merges never overwrite verified originals or double-count support.

### PR05A/B — unified acceptance and evidence

Use `devNotes/stage-a/procedural-options-tests.md` for STEP, POL, RET, MERGE, DELAY, HORN, WHY, AUDIT, PROP, and GATE-NL scenarios. Extend the existing learning acceptance with real OpenCode/DSH code and controlled NL inference, `nlEvaluationOptionEventId`, `fanoutLearningRunId`, policy/package hashes, audit IDs, verdict keys, originating execution IDs, rule/evaluator versions, and affected-entity references.

Require `stepwise_option_extraction`, `prequential_candidate_fanout`, `provenance_scoped_propagation`, `nl_option_decision_gate`, `nl_option_fulfillment_evidence`, `deterministic_procedural_retrieval`, `policy_merge_and_why_lineage`, `negative_delayed_evaluation`, and `nl_tool_authority_preserved` in addition to every earlier result field. No new acceptance script, host tool, decision type, or pass token is introduced.

At M0, approve unified Option/Planner schemas, inference effects/budget/privacy, package identity, fulfillment adapter, audit identities, fixed Horn rules, and provenance. At PR04, both lines provide independent self-test packages and actual row/event IDs for all existing and new scenarios. At W14, independently reproduce code and NL fulfillment, fan-out evaluation, delayed feedback, restart/replay, and propagation on isolated RocksDB and real hosts. Positive NL acceptance cannot be satisfied by a missing-handler test or generated prose.

## 6. Review and acceptance

Use `devNotes/stage-a/iterative-testing.md` for failure classification, spec refinement, and new-scenario templates, and `devNotes/stage-a/review.md` for:

- End-of-W13 and end-of-W14 experienced-review and merge steps.
- One-business-day initial review response.
- Independent reproduction commands.
- Spec versions, Change Logs, and merge blockers.
- Post-merge `main` verification.
- Sprint acceptance sign-off template.

The experienced reviewer rejects generated-only evidence, missing independent real evaluation, production data use, changed R4/tool counts, or any unresolved red test. The W16 full Stage A exit must not be marked complete from this sprint alone.
