---
lang: en
canonical: devNotes/stage-a/review.md
translation_status: reviewed
source_commit: ec6e40c
reviewed_at: 2026-11-21
---

# Weekly and Biweekly Experienced-Review Protocol

The experienced reviewer combines technical review with PR approval and merge duties. Author self-tests are required but do not replace independent reproduction. Line 1 and Line 2 do not cross-review.

## Initial response and escalation

- Send an initial review response within **one business day**. The full review may take longer when evidence requires it.
- Missing or failed author self-tests block review.
- Any failed gate blocks merge. Do not lower evidence standards to preserve the sprint date.
- Escalate scope or governance disputes to the domain owner rather than merging with an assumption.

## Specification-change gate

Follow `iterative-testing.md` for every implementation/specification change:

- Require the spec version, Change Log, test iteration, failure classification, and evidence for each changed expectation.
- Allow fixture and negative-case additions, validation clarification, and implementation-specific refinements after evidence is attached.
- Reject expectation changes made only to match current implementation or hide a red test.
- Require experienced-review approval for changes to gates, evidence authority, tool counts, R4, held-out independence, privacy/retention, source ownership, public APIs, or cross-line contracts.
- A failing or unclassified test blocks progression to the next test tier and merge.

## End of W13 — weekly review

Review and merge eligible PR01–PR03 work:

1. Compare changes with `pr01-contracts.md`, `pr02-lifecycle.md`, and `pr03-evidence-adapters.md`.
2. Verify ADR and S1–S8 shapes, migration/rollback, and lifecycle evidence.
3. Inspect connector/evidence semantics and source authority.
4. Confirm author self-test packages are complete, then independently rerun build/tests and acceptance on a clean isolated environment.
5. Record PR links, commit SHAs, commands, findings, and follow-ups in `docs/stage-a-contracts.md`.
6. Approve or request changes. Any failed gate blocks merge.
7. Merge eligible PRs through the normal non-destructive PR flow; no force-push, history rewrite, or direct bypass.
8. Run `pnpm build && pnpm test` on `main` and record the result.

## End of W14 — biweekly review

Review and merge eligible PR04–PR05 work:

1. Verify passive activation, bundle completeness, Model transitions, held-out evaluation, and recovery.
2. Inspect actual RocksDB rows and real OpenCode/DSH logs; do not accept generated prose as evidence.
3. Confirm candidate generation, execution, and publication were not conflated and required approvals were present.
4. Independently run `stage_a_lifecycle_acceptance.ts`, `stage_a_learning_acceptance.ts`, and the full regression.
5. Record evidence IDs, findings, and remaining W16 work in `docs/stage-a-w13-14-acceptance.md`.
6. Approve or request changes, merge eligible PRs, and rerun the full suite on `main`.
7. Do not mark the full W16 Stage A exit complete: it additionally requires Markdown lineage completion, the remote read-only connector, and full Stage A revalidation.

## Reproduction package

The experienced reviewer's reproduction must include:

```bash
pnpm build
pnpm test
node scripts/migrate_stage_a_candidates.ts --data <isolated-copy> --backup <new-backup> --endpoint <isolated-endpoint> --yes
node scripts/stage_a_lifecycle_acceptance.ts
node scripts/stage_a_learning_acceptance.ts
```

For each PR, `docs/stage-a-contracts.md` must record:

- PR link and merge SHA.
- Spec version and Change Log, including test iterations and failure classifications.
- Author self-test commands/results and evidence links.
- Independent reproduction commands/results and evidence links.
- Actual candidate/Option/Model/LearningRun IDs.
- Findings, follow-ups, and explicit non-goals.
- Merge decision and post-merge `main` build/test result.

The reviewer rejects any PR whose evidence is only generated prose, lacks independent real evaluation, uses production data, changes R4/tool counts, or leaves a failed/red test unaddressed.

## Required evidence matrix

| Area | Required proof |
|---|---|
| Build and regression | `pnpm build` and `pnpm test`; the current recorded 38 files / 137 tests plus all new tests pass |
| Lifecycle | `node scripts/stage_a_lifecycle_acceptance.ts` returns `STAGE_A_LIFECYCLE_PASS` |
| Passive learning | `node scripts/stage_a_learning_acceptance.ts` returns `STAGE_A_LEARNING_PASS` with every procedural and unified-observation check true |
| Concrete trajectory reuse | `devNotes/stage-a/concrete-learning-tests.md` passes with actual implementation/version lineage and no duplicate assets or abstract-skill generation |
| Unified procedural Options | POL-01–08 and LIFE-16–20 prove complete NL/implementation bundles, immutable policy packages, unified `planner_options`, shared lifecycle, and no fictitious implementation or reserved-template activation |
| Controlled NL fulfillment | GATE-NL-01–06 and real OpenCode/DSH inference prove Decision Gate, policy hash/version, budget/effect limits, missing-handler blocking, and no direct NL-to-tool execution or self-certification |
| Stepwise and fan-out evidence | STEP-01–06, DS-15–20, and AUDIT-01–10 prove general extraction, pre-execution registration, independent per-candidate verdicts, source/verdict deduplication, bounded overflow, and no distinct-procedure validation without actual execution |
| Deterministic retrieval | RET-01–06 prove Cozo eligibility filtering, structured ranking/bounds, exact Option/policy/version hashes, Mem/Rocks parity, and no placeholder-embedding semantic claim |
| Merge and why-provenance | MERGE-01–05 and WHY-01–04 prove immutable parent versions, source/verdict deduplication, material-change reevaluation, and sanitized reversible lineage |
| Scoped propagation | PROP-01–06 and HORN-01–04 prove explicit dependency/eligibility consequences, alternative-justification handling, separate FactCandidate/ν-gate admission, and no support/authority transfer or arbitrary rule activation |
| Independent native evaluation | Non-source episodes produce actual native outcomes and expected-effect comparisons; sidecar-only evidence cannot release an Option |
| Migration | Isolated Mem and RocksDB migrate, rerun, and roll back without changing historical IDs/evidence or adding an observation/preference relation |
| State transition | Expected and actual post-state compared; invariants and unauthorized side effects checked |
| Observation mapping | Every supported real observation can enter validation; actor, namespace, principal/consent, evidence mode, classifier version, and influence provenance are preserved |
| Classification | OBS-C01–10 and DS-09–14 cover declarative, procedural, mixed, unknown, and insufficient outcomes without shared authority |
| Proactive prompts | Prompt IDs are deterministic and replay-safe; dismissal is not confirmation, and no prompt bypasses ν-gate, registration, evaluation, or Decision Gate |
| Declarative memories | OBS-P01–12, OBS-D01–12, OBS-A01–10, and OBS-E01–06 pass with actual fact/revision/Planner-event/hash evidence, including non-preference memories |
| Evaluation | S8 contains real held-out evidence and a no-generator-self-score check; declarative evidence does not contaminate held-out Skill evaluation |
| Recovery | Crash/retry/restart produces no duplicate observation, memory, candidate, prompt response, revision, audit verdict, or execution; partial state returns `reconcile_required` |
| Security | Unauthorized writes, cross-namespace/principal leaks, personal evidence persisted without consent, sensitive injection, unconfirmed promotion, prompt-derived authority, and automatic `AGENTS.md` edits are all zero |
| Host behavior | Real OpenCode/DSH sessions for model-visible changes, including observation classification, consent, prompt handling, correction, controlled NL fulfillment, and fan-out evidence; mocks alone are insufficient |
| Compatibility | Seven memory-governance tools, 13 total Stage A tools, R4 boundary, historical IDs, J/≺, and existing bilingual workflows remain unchanged |

## Unified-observation review checkpoints

### M0 / end of W13 — contract gate

Before PR03 classification and PR04 learning/prompt work:

1. The domain owner approves the required Stage A unified-observation scope; the experienced reviewer approves authority, consent/identity/retention, public Planner-contract, prompt semantics, and cross-line S7/classification/candidate/live-query contracts.
2. OBS-ADR-01–08 resolve authority, storage/gates, privacy/identity, classification, inference/prompts, read scope, audit, and compatibility. OBS-C01–10 have explicit expected results and recorded iterations.
3. Verify no schema 15, observation relation, standalone audit/policy relation, combined admission gate, new tool family, or automatic inference-promotion path exists.
4. Approve unified NL/implementation Option and policy-package schemas, inference budget/privacy and effect vocabulary, controlled fulfillment-adapter changes, deterministic retrieval, audit/verdict identities, fan-out bounds, fixed Horn rules, and merge/propagation provenance.
5. Independently run PR01 tests and the full baseline. Record approved observation/classifier/retrieval/predicate/fixed-rule versions and sample declarative, concrete Option, trajectory-policy, mixed, and insufficient mappings.
6. Any red or unclassified test, or unresolved authority/privacy/namespace/principal/classification/fulfillment/propagation decision, blocks dependent work.

### PR04 — integration gate

Before PR05:

1. Line 1 and Line 2 attach independent author self-test packages; neither reviews the other.
2. Run OBS-P01–18, OBS-D01–12, STEP, POL, RET, MERGE, DELAY, HORN, WHY, AUDIT, PROP, and GATE-NL on isolated Mem and required RocksDB scenarios, then the full build/test suite.
3. Reproduce the primary concrete verified-trajectory reuse and trajectory-level NL Option scenarios plus authorized non-personal, personal-consent, declarative non-preference, mixed, unknown, insufficient, and prompt-replay scenarios through one shared intake.
4. Inspect actual rows for one execution with multiple audit verdicts, no duplicate execution/STOMP records, no hidden-candidate injection, no unsupported propagation, no arbitrary rule activation, no new relations or combined gates, and no replay duplicates or abstract-skill generation.
5. A red/unclassified test blocks PR05; a contract change returns to the specification-change gate.

### End of W14 — acceptance gate

In addition to the existing biweekly review:

1. Independently rerun all unified-observation, concrete-trajectory, and unified-option acceptance on clean isolated RocksDB and repeat real OpenCode/DSH observation, consent, prompt, correction, namespace/principal isolation, implementation reuse, controlled NL inference, fan-out evaluation, and hash binding.
2. Inspect fact/J/revision/Planner/Option/policy/audit rows and host logs. Generated prose is not evidence; positive NL acceptance requires actual controlled host inference and independent verification.
3. Verify zero cross-namespace/principal leaks, unauthorized writes/executions, personal evidence persisted without consent, sensitive injections, automatic `AGENTS.md` edits, new tool families, unconfirmed promotions, direct NL-to-tool execution, and prompt-derived authority.
4. Confirm declarative evidence remains outside procedural learning/held-out datasets, all OBS-A/OBS-E and new acceptance fields are recorded, and no distinct procedure was validated without its actual approved execution.
5. Any failed gate blocks merge; rerun the full suite and both acceptance scripts after eligible merges.

### Post-merge and full Stage A exit

Post-merge, record `main` build/tests, both acceptance pass tokens, actual observation envelope, declarative fact, procedural candidate, prompt event, native evaluation Option event, and learning context hash IDs, and remaining limitations. For concrete reuse, record gamma's `nativeEvaluationOptionEventId`, delta's native Option event in evaluation evidence references, both disjoint episode IDs, and implementation/version lineage. For unified Options, also record `nlEvaluationOptionEventId`, `fanoutLearningRunId`, policy/package hashes, audit IDs, verdict keys, originating execution IDs, rule/evaluator versions, and affected-entity references. The W15 release candidate is not the W16 exit.

At the full W16 gate, re-run observation correction, restart, retention/erasure, and lineage acceptance after Markdown-lineage and remote-connector work. Imported remote evidence must preserve source authority and evidence mode and cannot silently become native user confirmation.

## Sprint acceptance sign-off template

```text
Sprint: W13–W14 self-learning MVP and semantic evidence
Result: release candidate accepted / rejected / accepted with follow-ups

PR01A: <link, merge SHA, reviewer, date>
PR01B: <link, merge SHA, reviewer, date>
PR02A: <link, merge SHA, reviewer, date>
PR02B: <link, merge SHA, reviewer, date>
PR03A: <link, merge SHA, reviewer, date>
PR03B: <link, merge SHA, reviewer, date>
PR04A: <link, merge SHA, reviewer, date>
PR04B: <link, merge SHA, reviewer, date>
PR05A: <link, merge SHA, reviewer, date>
PR05B: <link, merge SHA, reviewer, date>

Line 1 self-test package: <commands, results, evidence links>
Line 2 self-test package: <commands, results, evidence links>
W13 experienced review: <findings, merges, follow-ups>
W14 experienced review: <findings, merges, follow-ups>
Unified-observation and unified-option M0/PR04 checkpoints: <approvals, commands, evidence links>

Build/tests: <result and test counts>
Lifecycle acceptance: <evidence link>
Passive-learning acceptance: <evidence link>
Unified-observation acceptance: <OBS-A/OBS-E evidence, observation/fact/candidate/prompt/hash IDs>
Unified-option acceptance: <POL/RET/MERGE/DELAY/HORN/WHY/AUDIT/PROP/GATE-NL evidence, native code/NL execution, fan-out and propagation IDs>
Migration/rollback: <evidence link>
Real-host evidence: <OpenCode/DSH links>
Negative/security checks: <result>
Post-merge main verification: <merge SHA and result>

Experienced reviewer approval: <name, signature, date>
Domain-owner follow-ups: <open items, owners, due stage>
```

The reviewer must not mark the W16 full Stage A exit complete. That gate additionally requires Markdown lineage completion, the remote read-only connector, unified-observation and unified-option/fan-out/propagation revalidation, and full Stage A revalidation.
