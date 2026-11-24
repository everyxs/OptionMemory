---
lang: en
canonical: devNotes/stage-a/README.md
translation_status: reviewed
source_commit: ec6e40c
reviewed_at: 2026-11-23
---

# Stage A Sprint 1 Specification Index

This directory contains the canonical implementation specifications for the W13–W14 self-learning MVP. Use the short prompts in `devNotes/Week13-14-Self-Learning-MVP-and-Semantic-Evidence.md` to start a PR, then read only the linked specification and test files.

## Ownership and file boundaries

Ownership means implementation and self-test responsibility, not cross-review. Each author tests their own files and contracts. The experienced reviewer handles integration and merge conflicts.

### Line 1 — governed lifecycle, Learning Planner, and runtime

Owns:

- `docs/lifecycle-learning-adr.md`, including S1–S5 lifecycle/execution, unified observation authority/privacy/identity, and unified NL/implementation Option, inference/effect, and fulfillment-adapter decisions.
- `schema/14_procedural_candidates.cozo` and `scripts/migrate_stage_a_candidates.ts`. No observation/preference/standalone-audit relation or schema 15 is added; `candidate_kind` distinguishes concrete Options from trajectory policies.
- `src/api/procedural-candidates.ts`, `src/api/capability-read.ts`, and lifecycle/telemetry changes.
- `src/runtime/learning-planner.ts`, `src/runtime/learning-run.ts`, and Model transition/evaluation implementation, including prequential fan-out audit and delayed-verdict state.
- `src/runtime/learning-contracts.ts` if a separate home is needed for `StateTransition`, `LearningBundle`, `LearningRun`, `TrajectoryPolicyPackage`, `EffectPredicate`, and `PrequentialAudit`; do not put these in Line 2's EvidenceEnvelope file.
- Unified observation Planner changes in `src/runtime/planner.ts`, `src/runtime/scheduler.ts`, and `src/api/planner-contracts.ts`: bounded proactive `ask`/`wait`/`replan` prompts, live declarative context, unified `planner_options`, deterministic retrieval, additive hash binding, and hidden-versus-used audit references. Consume Line 2's queries rather than parsing evidence or issuing CozoScript.
- Controlled NL fulfillment through the existing NativeAdapter/OptionExecutor architecture; no new host tool or Planner decision type.
- `scripts/stage_a_lifecycle_acceptance.ts` and `scripts/stage_a_learning_acceptance.ts`.
- Tests: `stage-a-migration.test.ts`, `procedural-lifecycle.test.ts`, `procedural-recall.test.ts`, `learning-planner.test.ts`, `learning-state-transition.test.ts`, `learning-recovery.test.ts`, `stage-a-observation-planner.test.ts`, `procedural-options.test.ts`, `prequential-audit.test.ts`, and `procedural-retrieval.test.ts`.

### Line 2 — dataStore, evidence semantics, and recall/lineage

Owns:

- `docs/stage-a-contracts.md`, including S6/S7/S8 evidence, observation/classification/candidate/read contracts, and change-control sections.
- `src/datastore/evidence-envelope.ts`, including S7, `TaskSignature`, `ObservationPattern`, and `StepTrigger` payloads and normalized evidence-field contracts.
- `src/datastore/connectors/` and `src/datastore/mappers/`, including deterministic declarative/procedural/mixed/unknown/insufficient classification, general code/NL stepwise extraction, and optional untrusted policy/merge proposals in PR03B and candidate/prompt/merge/provenance lineage in PR04B.
- `src/api/evidence-ingestion.ts` and evidence-specific read-side integration, including the live declarative-memory query and fixed Horn/Datalog evidence/dependency queries.
- `src/api/memory-recall.ts` for procedural recall join and annotation changes only.
- `tests/datastore-evidence.test.ts`, `stage-a-observation-contracts.test.ts`, `stage-a-observation-evidence.test.ts`, `procedural-option-evidence.test.ts`, and evidence fixture definitions under `tests/fixtures/stage-a/`.
- Evidence-related contract documentation and bilingual companion documents.

### Shared files and merge order

- `src/memory/mnesticClient.ts`: Line 1 owns Option/Model/event methods; Line 2 owns projection/evidence and declarative-memory query methods. Merge changes sequentially by PR order, rebase before each merge, and never edit the same method in parallel.
- `src/api/telemetry.ts` and `src/api/planner-contracts.ts`: Line 1 only.
- `src/api/memory-recall.ts`: Line 2 only for recall/evidence-join behavior; execution semantics require the S2 contract rather than direct edits by the other line.
- `docs/stage-a-w13-14-acceptance.md`: Line 1 writes lifecycle/LearningRun/Planner observation-prompt/runtime/fulfillment/audit sections; Line 2 writes observation/classification/evidence/source/merge/propagation/provenance sections. Do not edit the same section in parallel.
- `docs/lifecycle-learning-adr.md` and `docs/stage-a-contracts.md`: section ownership follows S1–S5 versus S6–S8, with unified observation and Option/fulfillment ADR decisions owned by Line 1 and observation evidence contracts owned by Line 2.

If a needed change falls outside an owner's files, implement it through the owning line's existing S-contract rather than creating an unowned parallel abstraction. All real observations enter authority/privacy/namespace/evidence-mode validation. Declarative candidates proceed through S6/ν-gate to facts + J/≺; both concrete Option and trajectory-policy candidates require full bundles, approval, independent native evaluation, registration, and Decision Gate for their declared fulfillment. Prompts and NL output never merge these gates, invoke tools directly, or confer authority.

## PR ownership

| PR | Line 1 deliverables | Line 2 deliverables |
|---|---|---|
| **PR01A/B** | ADR, schema 14, migration/tests, observation authority/privacy/identity/audit, unified Option/fulfillment, fan-out, and propagation decisions | S6/S7/S8 contracts, EvidenceEnvelope, ObservationPattern/StepTrigger/classification contracts, policy/predicate/merge fixtures, and OBS-C tests |
| **PR02A/B** | Candidate registration, lifecycle execution, release/revoke, prompt-safe approval, immutable policy versions, scoped dependency/demotion, and recall semantics | S2 fixtures and recall/lineage annotations for fulfillment, verification, merges, audits, and current eligibility |
| **PR03A/B** | S4 execution and STOMP linkage preserving actor/principal/consent/namespace/evidence mode, controlled NL fulfillment, and native fan-out evidence | Shared dataStore connectors, general code/NL stepwise extraction, deterministic classification, optional untrusted semantic proposals, S6 ingestion, and DS-09–20 tests |
| **PR04A/B** | Learning Planner/full bundles/Model transitions, bounded prompts/declarative context, unified `planner_options`, deterministic retrieval, prequential fan-out, scheduler/hash propagation, and OBS-P tests | Learning/held-out packages, candidate/prompt/merge/provenance lineage, delayed verdicts, fixed Horn dependency queries, lexical fallback, and OBS-D tests |
| **PR05A/B** | Lifecycle/learning/unified-option acceptance, real code/NL host evidence, fan-out, and recovery | Observation/source/classification/merge/audit/propagation lineage regression, OBS-E checks, and bilingual documentation |

PR02/PR03 and PR04/PR05 may proceed in parallel only when they do not touch the same file or contract section. Rebase before every merge. PR03/PR04 unified-observation work requires the M0 contract gate; PR05 unified-observation acceptance requires the PR04 integration gate in `review.md`.

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
| `pr01-contracts.md` | ADR requirements, schema 14, TypeScript contracts, migration algorithm, unified observation/candidate, immutable policy-package, fan-out audit, and provenance contracts |
| `pr01-tests.md` | Migration fixtures, unified Option/audit/Horn/provenance contract cases, execution commands, and OBS-C observation contract tests |
| `pr02-lifecycle.md` | Lifecycle APIs, invariants, fixtures, prompt-safe approval, immutable policy versions, scoped propagation, and self-tests |
| `pr03-evidence-adapters.md` | Connector contracts, shared sidecar/semantic mappings, general code/NL stepwise extraction, observation classification, and self-tests |
| `pr04-learning-planner.md` | Passive-learning algorithm, Model transitions, proactive prompts, unified procedural retrieval/fulfillment, prequential fan-out, delayed evidence, and self-tests |
| `pr05-acceptance.md` | Acceptance sequence, result schema, unified observation, concrete trajectory, unified Option, fan-out, and propagation evidence requirements |
| `concrete-learning-tests.md` | Concrete trajectory fixtures, runtime-candidate-verified tests, evaluation invariants, acceptance fields, and merge blockers |
| `procedural-options-tests.md` | Unified NL/implementation Option fixtures, STEP/POL/RET/MERGE/DELAY/HORN/WHY/AUDIT/PROP/GATE-NL scenarios, acceptance fields, and Stage B rule-generation follow-ups |
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

The current recorded regression baseline is **38 files / 137 tests**; the original Stage A planning baseline was 37 files / 135 tests. Add tests to the current baseline rather than replacing it, and rerun it on every change.

## Shared implementation rules

1. CozoScript remains centralized in `src/memory/mnesticClient.ts`. Business services call service APIs.
2. Keep core modules independent of OpenCode/DSH imports. Host-specific code belongs under `src/plugins/`.
3. Use deterministic IDs derived from namespace + idempotency key. Replaying the same request returns `reused=true` without repeating a side effect.
4. Use the existing `GateResult` shape. New result reasons use stable codes or stable English messages, not generated explanations.
5. Keep all existing public tool names, families, and seven memory-governance tools unchanged. Reviewed additive contracts may carry declarative/procedural retrieval hashes, fulfillment metadata, and fan-out audit references on existing Planner APIs; they add no host tool or decision type.
6. Use `real` only for native execution evidence. Imported or replayed trajectories remain `sidecar` unless independently re-executed.
7. Never write `0` for unknown confidence, success, state, or cost. Use `null` or `uncalibrated`.
8. Every new acceptance script creates and cleans its own isolated RocksDB/Markdown roots and stops its server in `finally`.
9. Never use production 9070 or production Markdown roots for migration, crash, cancellation, or failure tests.
10. Do not modify real `AGENTS.md`, host profiles, or user configuration as a test side effect.
11. Do not perform real login, proof-of-work bypass, or network collection in tests.
12. Keep credentials and excluded file contents out of projections, events, logs, fixtures, and review attachments.
13. Candidate Skill code and NL policy packages are untrusted. Hash checks and approval do not replace sandboxing or least-privilege mandates.
14. Stop every spawned service after acceptance and retain only required evidence under `.data/`.
15. Read `docs/memory-regression-acceptance.md` before changing existing capture, Recall, revision, permission, or recovery behavior.
16. All real observations enter authority/privacy/namespace/evidence-mode validation. Authorized non-personal evidence may be passive; personal evidence requires opt-in and stable principal identity before persistence. Prompts are bounded and idempotent and never replace the applicable admission gate. Prefer concrete verified trajectories and existing implementations; do not generate abstract skills in Stage A.
17. Both concrete Options and trajectory-level NL Options require complete Option + Model bundles, immutable packages, approval, registration, independent native evaluation, and Decision Gate for their declared fulfillment. NL output never invokes tools directly.
18. Stepwise extraction and prequential fan-out evaluate all eligible hidden candidates with compatible scope/action and frozen predicates. One real execution can yield several per-candidate verdicts but cannot validate a distinct implementation or policy without its own approved execution.
19. Use fixed Cozo eligibility filters plus deterministic application ranking for `planner_options`; cover exact returned Option/policy IDs and versions in Planner hashes. Do not use placeholder embeddings as semantic scores or activate generated Horn rules in Stage A.
20. Propagate only explicit `affected`, eligibility, conflict, and demotion consequences with why-provenance. Do not transfer independent support, canonical fact status, mandates, budgets, or tool authority through dependencies or merges.

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
