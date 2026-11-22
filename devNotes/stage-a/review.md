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
| Passive learning | `node scripts/stage_a_learning_acceptance.ts` returns `STAGE_A_LEARNING_PASS` |
| Migration | Isolated Mem and RocksDB migrate, rerun, and roll back without changing historical IDs/evidence |
| State transition | Expected and actual post-state compared; invariants and unauthorized side effects checked |
| Evidence mapping | Every initial source type has an S7 envelope and source-specific mapped output |
| Evaluation | S8 contains real held-out evidence and a no-generator-self-score check |
| Recovery | Crash/retry/restart produces no duplicate memory, candidate, or execution; partial state returns `reconcile_required` |
| Security | Unauthorized writes, cross-namespace leaks, sensitive-path indexing, and automatic `AGENTS.md` edits are all zero |
| Host behavior | Real OpenCode/DSH sessions for model-visible changes; mocks alone are insufficient |
| Compatibility | Seven memory-governance tools, R4 boundary, historical IDs, J/≺, and existing bilingual workflows remain unchanged |

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

Build/tests: <result and test counts>
Lifecycle acceptance: <evidence link>
Passive-learning acceptance: <evidence link>
Migration/rollback: <evidence link>
Real-host evidence: <OpenCode/DSH links>
Negative/security checks: <result>
Post-merge main verification: <merge SHA and result>

Experienced reviewer approval: <name, signature, date>
Domain-owner follow-ups: <open items, owners, due stage>
```

The reviewer must not mark the W16 full Stage A exit complete. That gate additionally requires Markdown lineage completion, the remote read-only connector, and full Stage A revalidation.
