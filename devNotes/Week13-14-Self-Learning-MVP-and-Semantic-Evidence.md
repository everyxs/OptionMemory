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
6. Explicit and explicitly confirmed user preferences follow the existing declarative S7 → FactCandidate → S6/ν-gate → facts path into a bounded, namespace-local `planner_context`, with correction, privacy, audit-hash, restart/replay, and real-host evidence. No separate preference subsystem is created.

This is not the full W16 Stage A exit. Markdown lineage tail work and a read-only remote connector may continue into W15–W16. Preference correction, retention/erasure, lineage, and remote-evidence authority are revalidated at the full W16 gate.

## 2. Roles and review authority

| Role | Responsibility |
|---|---|
| **Line 1 developer** | Lifecycle/registration/execution, Learning Planner, Model transition/evaluation, STOMP recovery, Planner preference context/audit; designs and runs all self-tests for owned work |
| **Line 2 developer** | dataStore connectors, S6/S7/S8 evidence mapping, candidate identification, procedural recall join, lineage/demotion, preference mapping/live query/revision; designs and runs all self-tests for owned work |
| **Experienced reviewer** | Weekly/biweekly architecture and evidence review, independent reproduction, approval or change requests, and merge after all gates pass |
| **Domain owner** | Resolve scope or acceptance disputes, approve required Stage A preference scope, and approve any slide beyond the release-candidate boundary |

Line 1 and Line 2 do not cross-review. The experienced reviewer is the only person authorized to grant final PR approval and merge into `main`. No author may approve or merge their own PR. Initial review response is due within **one business day**.

### PR ownership

| PR | Line 1 deliverables | Line 2 deliverables |
|---|---|---|
| **PR01A/B** | `docs/lifecycle-learning-adr.md`, schema 14, migration implementation, and migration tests | `docs/stage-a-contracts.md`, `src/datastore/evidence-envelope.ts`, and evidence fixtures |
| **PR02A/B** | Candidate registration, lifecycle execution, release/revoke, and lifecycle acceptance | S2 fixtures and recall/lineage annotations consumed by the lifecycle |
| **PR03A/B** | S4 execution and STOMP linkage consumed by evidence mappers | dataStore connectors, semantic mappers, S6 ingestion, and evidence regression |
| **PR04A/B** | Learning Planner, task-signature consumption, full bundle, Model transition, and LearningRun evaluation | Learning/held-out evidence packages and source mappings used by evaluation |
| **PR05A/B** | Lifecycle and learning acceptance scripts, runtime evidence, and recovery verification | Evidence/contract documentation, source/regression verification, and bilingual companion updates |

`devNotes/stage-a/README.md` is the authoritative per-file ownership map and includes the PR01/PR04/PR05 declarative-preference additions in §5A, including shared-file merge order. Parallel work is allowed only when it does not touch the same file or contract section; rebase before every merge.

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

Use `devNotes/stage-a/README.md` for the exact isolated setup, shared implementation rules, and shared result types. The starting regression is **37 files / 135 tests**. Never use production 9070 or production Markdown roots for migration, crash, cancellation, or failure tests.

## 5. Copy-paste PR instructions

Each prompt is intentionally short. Give one prompt to a coding agent and require it to read the linked spec and test plan before implementing. Authors run their own tests; there is no cross-review. For PR01A/B, PR04A/B, and PR05A/B, the prompt also includes the assigned declarative-preference deliverables, tests, and checkpoints in §5A and the 0.2.0 specifications.

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
- src/datastore/evidence-envelope.ts with SourceKind, TaskSignature, EvidenceEnvelope, and the additive source-specific UserPreferenceFeedback payload in §5A.
- Evidence fixtures for Markdown, SKILL.md, CSV/JSONL, trajectory exports, and PREF-C01–07 preference contract scenarios.
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
- Task-signature consumption and bounded template-based bundle synthesis.
- Model transition support with anticipated/actual post-state, invariants, critique, and drift.
- S8 LearningRun with learning/held-out separation, baseline, and real evaluation.
- tests/learning-planner.test.ts, tests/learning-state-transition.test.ts, and tests/learning-recovery.test.ts.

Use the local read-only fixture sequence in the spec and write expected-failure tests first.

Non-negotiables:
- Empty memory and insufficient evidence return need_more_evidence with no candidate or forced seed.
- Propose only full subtask + Option + Model bundles from compatible real evidence.
- Expected and actual post-state remain distinct; read-only tasks fabricate no transition.
- Held-out evaluation is independent and generator self-score cannot settle.
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

## 5A. Declarative preference context increment (PR01A/B, PR04A/B, PR05A/B)

This increment is required Stage A scope and uses the existing declarative lane rather than creating a preference-learning subsystem:

```text
Host feedback / S7 trajectory envelope → source-specific mapper → FactCandidate
→ S6 controlled ingestion + existing ν-gate → ordinary facts + J/≺
→ Line 2 live query → Line 1 bounded planner_context
```

Only explicit durable preferences and explicitly confirmed inference may become eligible `status="in"` facts. Repeated corrections may annotate FactCandidates but never auto-promote them. Observation requires opt-in and defined inspection, correction, disablement, retention, and erasure behavior. Agent output/actions cannot confirm themselves, and influenced feedback cannot independently strengthen the same preference.

Preferences are non-instructional context. Decision Gate, mandate, and explicit project/safety rules remain hard constraints. Within them, current user instruction outranks explicit durable preferences, user-confirmed inference, and historical observations. No preference creates an Option/Model, changes budgets/effects/mandates, adds a decision type or tool, modifies `AGENTS.md`, or authorizes execution.

### PR01A/B additions

- **PR01A:** resolve PREF-ADR-01–06 for authority, existing-only storage, confirmed inference, privacy, audit, and compatibility. Schema 14 remains the only new relation; there is no preference relation or schema 15.
- **PR01B:** add the S7 `UserPreferenceFeedback` payload, stable preference keys, actor/source/opt-in/influence provenance, allowlisted structured values, and `tests/stage-a-preference-contracts.test.ts` with PREF-C01–07 for round-trip, correction identity, invalid authority, self-confirmation provenance, unsafe values, evidence isolation, and unknown fields.
- **M0/W13 gate:** domain owner approves scope; experienced reviewer approves cross-line/public/privacy contracts and independently runs PR01 plus baseline tests. Record the approved policy version and sample envelope → FactCandidate → fact/read-query shape. Any red/unclassified test or unresolved authority question blocks PR04.

### PR04A/B additions

- **PR04A:** consume Line 2's live query using validated `subtasks.context.namespace`; add bounded deterministic `declarative_context`; verify the additive preference-context hash and forward it through the scheduler; record exact fact/version references in `planner_event.context_json`. Add `tests/stage-a-preference-planner.test.ts` with PREF-P01–10 for relevant context, namespace/status filtering, read-only empty behavior, deterministic bounds, hash/stale handling, scheduler propagation, authority invariance, restart/retraction, and replay.
- **PR04B:** implement preference-feedback → FactCandidate mapping, S6 validation, live preference-fact query, and revision/reconciliation through existing components. Add `tests/stage-a-preference-evidence.test.ts` with PREF-D01–10 for explicit mapping, replay, opt-in/actor authority, confirmed inference, self-confirmation, evidence separation, correction lineage, partial recovery, sensitive data, and storage authority.
- **PR04 integration gate:** both lines attach independent self-test packages and actual row/event IDs; PREF-P/PREF-D and the full suite pass on isolated Mem/RocksDB; one explicit-feedback → decision → correction vertical slice is reproduced. Contract changes return to the M0/specification-change gate, and red/unclassified tests block PR05.

The existing procedural Learning Planner, full bundle, Model transition, S8 evaluation, and held-out independence requirements remain unchanged. Preference evidence is not a held-out Skill dataset and requires no capability certification.

### PR05A/B additions

Extend `scripts/stage_a_learning_acceptance.ts` and its existing result schema/pass token; do not add another acceptance framework.

- **PR05A:** PREF-A01–08 cover real OpenCode and DSH capture/context/decision, cross-session namespace/correction, instruction/mandate precedence, inference/self-confirmation negatives, restart/replay/recovery, privacy/retention/erasure, and existing regressions. Require `declarative_preference_context`, `preference_namespace_and_privacy`, `preference_revision_replay_recovery`, `preference_audit_hash_binding`, and `preference_real_host_behavior` to be true. Record actual preference fact, revision, Planner event, and context-hash IDs.
- **PR05B:** PREF-E01–05 verify source-to-fact/revision lineage, duplicate/contradictory/unconfirmed/influenced/cross-namespace/sensitive fixtures, original connector and S8 regressions, explicit limitations, and bilingual contract parity.
- **W14 gate:** the experienced reviewer independently reruns RocksDB and real-host scenarios, inspects actual rows/logs, verifies zero cross-namespace leaks/unauthorized effects/sensitive injections/unconfirmed injections, and confirms preference evidence did not contaminate held-out evaluation. Any failed gate blocks merge.
- **Post-merge/W16:** rerun build/tests and both acceptance scripts on `main`. At the full W16 gate, revalidate correction, restart, retention/erasure, lineage, and remote-evidence authority after the remaining W16 work. Remote imported evidence cannot silently become native user confirmation.

The canonical details are in `devNotes/stage-a/pr01-contracts.md`, `pr01-tests.md`, `pr04-learning-planner.md`, `pr05-acceptance.md`, and `review.md` at specification version **0.2.0**. All preference scenarios follow `iterative-testing.md`: record fixtures, expected failures, iterations, classifications, actual evidence, and limitations; no planned test or pass token is an acceptance claim before execution.

## 6. Review and acceptance

Use `devNotes/stage-a/iterative-testing.md` for failure classification, spec refinement, and new-scenario templates, and `devNotes/stage-a/review.md` for:

- End-of-W13 and end-of-W14 experienced-review and merge steps.
- One-business-day initial review response.
- Independent reproduction commands.
- Spec versions, Change Logs, and merge blockers.
- Post-merge `main` verification.
- Sprint acceptance sign-off template.

The experienced reviewer rejects generated-only evidence, missing independent real evaluation, production data use, changed R4/tool counts, or any unresolved red test. The W16 full Stage A exit must not be marked complete from this sprint alone.
