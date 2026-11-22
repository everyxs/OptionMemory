---
lang: en
canonical: devNotes/stage-a/README.md
translation_status: reviewed
source_commit: ec6e40c
reviewed_at: 2026-11-21
---

# Stage A Sprint 1 Specification Index

This directory contains the canonical implementation specifications for the W13–W14 self-learning MVP. Use the short prompts in `devNotes/Week13-14-Self-Learning-MVP-and-Semantic-Evidence.md` to start a PR, then read only the linked specification and test files.

## Ownership and file boundaries

Ownership means implementation and self-test responsibility, not cross-review. Each author tests their own files and contracts. The experienced reviewer handles integration and merge conflicts.

### Line 1 — governed lifecycle, Learning Planner, and runtime

Owns:

- `docs/lifecycle-learning-adr.md`, including S1–S5 lifecycle/execution and declarative-preference authority/privacy decisions.
- `schema/14_procedural_candidates.cozo` and `scripts/migrate_stage_a_candidates.ts`. No preference relation or schema 15 is added.
- `src/api/procedural-candidates.ts`, `src/api/capability-read.ts`, and lifecycle/telemetry changes.
- `src/runtime/learning-planner.ts`, `src/runtime/learning-run.ts`, and Model transition/evaluation implementation.
- `src/runtime/learning-contracts.ts` if a separate home is needed for `StateTransition`, `LearningBundle`, and `LearningRun`; do not put these in Line 2's EvidenceEnvelope file.
- Preference-only Planner changes in `src/runtime/planner.ts`, `src/runtime/scheduler.ts`, and the additive hash field in `src/api/planner-contracts.ts`, consuming Line 2's live query rather than parsing evidence or issuing CozoScript.
- `scripts/stage_a_lifecycle_acceptance.ts` and `scripts/stage_a_learning_acceptance.ts`.
- Tests: `stage-a-migration.test.ts`, `procedural-lifecycle.test.ts`, `procedural-recall.test.ts`, `learning-planner.test.ts`, `learning-state-transition.test.ts`, `learning-recovery.test.ts`, and `stage-a-preference-planner.test.ts`.

### Line 2 — dataStore, evidence semantics, and recall/lineage

Owns:

- `docs/stage-a-contracts.md`, including S6/S7/S8 evidence, declarative-preference payload/read contracts, and change-control sections.
- `src/datastore/evidence-envelope.ts`, including S7, `TaskSignature`, and the source-specific `UserPreferenceFeedback` payload.
- `src/datastore/connectors/` and `src/datastore/mappers/`, including preference-feedback → FactCandidate mapping in PR04B.
- `src/api/evidence-ingestion.ts` and evidence-specific read-side integration, including the live preference-fact query.
- `src/api/memory-recall.ts` for procedural recall join and annotation changes only.
- `tests/datastore-evidence.test.ts`, `stage-a-preference-contracts.test.ts`, `stage-a-preference-evidence.test.ts`, and evidence fixture definitions under `tests/fixtures/stage-a/`.
- Evidence-related contract documentation and bilingual companion documents.

### Shared files and merge order

- `src/memory/mnesticClient.ts`: Line 1 owns Option/Model/event methods; Line 2 owns projection/evidence and preference-fact query methods. Merge changes sequentially by PR order, rebase before each merge, and never edit the same method in parallel.
- `src/api/telemetry.ts` and `src/api/planner-contracts.ts`: Line 1 only.
- `src/api/memory-recall.ts`: Line 2 only for recall/evidence-join behavior; execution semantics require the S2 contract rather than direct edits by the other line.
- `docs/stage-a-w13-14-acceptance.md`: Line 1 writes lifecycle/LearningRun/Planner-preference runtime sections; Line 2 writes preference evidence/source/regression sections. Do not edit the same section in parallel.
- `docs/lifecycle-learning-adr.md` and `docs/stage-a-contracts.md`: section ownership follows S1–S5 versus S6–S8, with preference ADR decisions owned by Line 1 and preference evidence contracts owned by Line 2.

If a needed change falls outside an owner's files, implement it through the owning line's existing S-contract rather than creating an unowned parallel abstraction. Declarative preferences reuse host events/S7, FactCandidates, S6/ν-gate, facts, and J/≺; no preference-specific storage, lifecycle, learner, tool family, or procedural learning bundle is allowed.

## PR ownership

| PR | Line 1 deliverables | Line 2 deliverables |
|---|---|---|
| **PR01A/B** | ADR, schema 14, migration/tests, preference authority/privacy/audit decisions | S6/S7/S8 contracts, EvidenceEnvelope, preference-feedback payload and PREF-C fixtures |
| **PR02A/B** | Candidate registration, lifecycle execution, release/revoke, procedural recall semantics | S2 fixtures and recall/lineage annotations consumed by the lifecycle |
| **PR03A/B** | S4 execution and STOMP linkage used by evidence mappers | dataStore connectors, semantic mappers, S6 ingestion, and evidence regression |
| **PR04A/B** | Learning Planner/full bundle/Model transition plus bounded Planner preference context and PREF-P tests | Learning/held-out packages plus preference mapping/live query/revision and PREF-D tests |
| **PR05A/B** | Lifecycle/learning/preference acceptance, real-host runtime evidence, and recovery | Evidence/source/preference lineage regression, PREF-E checks, and bilingual documentation |

PR02/PR03 and PR04/PR05 may proceed in parallel only when they do not touch the same file or contract section. Rebase before every merge. PR04 preference work additionally requires the M0 contract gate; PR05 preference acceptance requires the PR04 integration gate in `review.md`.

## Reading order

1. Read this file for ownership, environment, and shared rules.
2. Read the PR's specification and test plan.
3. Follow `iterative-testing.md`: draft fixtures and expected-failure tests before implementation where behavior is known.
4. Implement, run focused tests, classify failures, and refine implementation/specification with a Change Log.
5. Run focused tests again, then full regression and acceptance.
6. Attach author self-test evidence and follow `review.md` for review and merge.

## File inventory

| File | Canonical contents |
|---|---|
| `pr01-contracts.md` | ADR requirements, schema 14, TypeScript contracts, migration algorithm |
| `pr01-tests.md` | Migration fixtures, assertions, and execution commands |
| `pr02-lifecycle.md` | Lifecycle APIs, invariants, fixture, and self-tests |
| `pr03-evidence-adapters.md` | Connector contracts, semantic mappings, and self-tests |
| `pr04-learning-planner.md` | Passive-learning algorithm, Model transitions, fixture sequence, and self-tests |
| `pr05-acceptance.md` | Acceptance sequence, result schema, and evidence requirements |
| `iterative-testing.md` | Failure classification, spec refinement, versioning, and new-scenario template |
| `review.md` | Weekly/biweekly review, independent reproduction, merge protocol, evidence matrix, and sign-off template |

## Environment

Requirements: Node.js >= 24.9.0, pnpm 11.7.0, RocksDB for persistent acceptance, and OpenCode 2.3.x or DSH 0.2.2-rc.1 for real-host scenarios.

Start an isolated service from the repository root:

```bash
MNESTIC_DATA_DIR=.data/stage-a-w13-14 scripts/mnestic_start.sh --rocks --port 9175
node scripts/apply_schema.ts --endpoint http://127.0.0.1:9175/text-query
export OPTIONMEMORY_ENDPOINT='http://127.0.0.1:9175/text-query'
pnpm install
pnpm build
pnpm test
```

The starting regression baseline is **37 files / 135 tests**. Add tests to this baseline rather than replacing it.

## Shared implementation rules

1. CozoScript remains centralized in `src/memory/mnesticClient.ts`. Business services call service APIs.
2. Keep core modules independent of OpenCode/DSH imports. Host-specific code belongs under `src/plugins/`.
3. Use deterministic IDs derived from namespace + idempotency key. Replaying the same request returns `reused=true` without repeating a side effect.
4. Use the existing `GateResult` shape. New result reasons use stable codes or stable English messages, not generated explanations.
5. Keep all existing public tool names, families, and seven memory-governance tools unchanged. The only permitted contract shape addition is the reviewed preference-context hash on the existing `planner_decision` input when preferences are present; it adds no tool or decision type.
6. Use `real` only for native execution evidence. Imported or replayed trajectories remain `sidecar` unless independently re-executed.
7. Never write `0` for unknown confidence, success, state, or cost. Use `null` or `uncalibrated`.
8. Every new acceptance script creates and cleans its own isolated RocksDB/Markdown roots and stops its server in `finally`.
9. Never use production 9070 or production Markdown roots for migration, crash, cancellation, or failure tests.
10. Do not modify real `AGENTS.md`, host profiles, or user configuration as a test side effect.
11. Do not perform real login, proof-of-work bypass, or network collection in tests.
12. Keep credentials and excluded file contents out of projections, events, logs, fixtures, and review attachments.
13. Candidate Skill code is untrusted. Hash checks and approval do not replace sandboxing or least-privilege mandates.
14. Stop every spawned service after acceptance and retain only required evidence under `.data/`.
15. Read `docs/memory-regression-acceptance.md` before changing existing capture, Recall, revision, permission, or recovery behavior.

Shared result types:

```ts
export type EvidenceMode = "real" | "simulated" | "sidecar";
export type LearningStatus = "dormant" | "observing" | "candidate_ready" | "evaluating" | "probation" | "active_release" | "dormant_watch";

export interface GateFailure {
  gate: "blocked";
  reason: string;
  missing?: string[];
}

export type NeedMoreEvidence = GateFailure & {
  status: "need_more_evidence";
};
```
