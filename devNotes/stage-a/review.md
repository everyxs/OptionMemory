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
| Build and regression | `pnpm build` and `pnpm test`; existing 37 files / 135 tests plus all new tests pass |
| Lifecycle | `node scripts/stage_a_lifecycle_acceptance.ts` returns `STAGE_A_LIFECYCLE_PASS` |
| Passive learning | `node scripts/stage_a_learning_acceptance.ts` returns `STAGE_A_LEARNING_PASS` with every procedural and declarative-preference check true |
| Migration | Isolated Mem and RocksDB migrate, rerun, and roll back without changing historical IDs/evidence or adding a preference relation |
| State transition | Expected and actual post-state compared; invariants and unauthorized side effects checked |
| Evidence mapping | Every initial source type has an S7 envelope and source-specific mapped output; preference feedback preserves actor, namespace, opt-in, and influence provenance |
| Declarative preferences | PREF-C01–07, PREF-P01–10, PREF-D01–10, PREF-A01–08, and PREF-E01–05 pass with actual fact/revision/Planner-event/hash evidence |
| Evaluation | S8 contains real held-out evidence and a no-generator-self-score check; preference evidence does not contaminate held-out Skill evaluation |
| Recovery | Crash/retry/restart produces no duplicate memory, candidate, preference, revision, or execution; partial state returns `reconcile_required` |
| Security | Unauthorized writes, cross-namespace leaks, sensitive-path/content indexing or injection, unconfirmed-preference promotion, and automatic `AGENTS.md` edits are all zero |
| Host behavior | Real OpenCode/DSH sessions for model-visible changes, including preference capture/correction/isolation; mocks alone are insufficient |
| Compatibility | Seven memory-governance tools, 13 total Stage A tools, R4 boundary, historical IDs, J/≺, and existing bilingual workflows remain unchanged |

## Preference review checkpoints

### M0 / end of W13 — contract gate

Before PR04 preference work:

1. The domain owner approves the required Stage A preference scope; the experienced reviewer approves authority, privacy/retention, public Planner-contract, and cross-line S7/FactCandidate/live-query semantics.
2. PREF-ADR-01–06 resolve authority, existing-only storage, confirmed inference, privacy, audit, and compatibility. PREF-C01–07 have explicit expected results and recorded iterations.
3. Verify no schema 15, preference relation, new tool family, or automatic inference-promotion path exists.
4. Independently run PR01 tests and the full baseline. Record the approved policy version and sample envelope → FactCandidate → fact/read-query shape.
5. Any red or unclassified test, or unresolved authority/privacy/namespace decision, blocks PR04.

### PR04 — integration gate

Before PR05:

1. Line 1 and Line 2 attach independent author self-test packages; neither reviews the other.
2. Run PREF-P01–10 and PREF-D01–10 on isolated Mem and required RocksDB scenarios, then the full build/test suite.
3. Reproduce explicit feedback → candidate → fact → Planner context → hash-bound decision → correction → revision.
4. Inspect actual rows for no new relations, Options, Models, decision types, direct writes, shadow profiles, or replay duplicates.
5. A red/unclassified test blocks PR05; a contract change returns to the specification-change gate.

### End of W14 — acceptance gate

In addition to the existing biweekly review:

1. Independently rerun all preference acceptance on clean isolated RocksDB and repeat real OpenCode/DSH capture, correction, namespace isolation, and hash binding.
2. Inspect fact/J/revision/Planner/Option rows and host logs. Generated prose is not evidence.
3. Verify zero cross-namespace leaks, unauthorized writes/executions, sensitive injections, automatic `AGENTS.md` edits, new tool families, and unconfirmed-preference injections.
4. Confirm preference evidence remains outside procedural learning/held-out datasets and all PREF-A/PREF-E checks and acceptance result fields are recorded.
5. Any failed gate blocks merge; rerun the full suite and both acceptance scripts after eligible merges.

### Post-merge and full Stage A exit

Post-merge, record `main` build/tests, both acceptance pass tokens, actual preference fact/revision/Planner-event/hash IDs, and remaining limitations. The W15 release candidate is not the W16 exit.

At the full W16 gate, re-run preference correction, restart, retention/erasure, and lineage acceptance after Markdown-lineage and remote-connector work. Imported remote evidence must preserve source authority and evidence mode and cannot silently become native user confirmation.

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
Preference M0/PR04 checkpoints: <approvals, commands, evidence links>

Build/tests: <result and test counts>
Lifecycle acceptance: <evidence link>
Passive-learning acceptance: <evidence link>
Declarative-preference acceptance: <PREF-A/PREF-E evidence, fact/revision/event/hash IDs>
Migration/rollback: <evidence link>
Real-host evidence: <OpenCode/DSH links>
Negative/security checks: <result>
Post-merge main verification: <merge SHA and result>

Experienced reviewer approval: <name, signature, date>
Domain-owner follow-ups: <open items, owners, due stage>
```

The reviewer must not mark the W16 full Stage A exit complete. That gate additionally requires Markdown lineage completion, the remote read-only connector, preference revalidation, and full Stage A revalidation.
