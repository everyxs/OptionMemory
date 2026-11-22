---
lang: en
canonical: devNotes/stage-a/pr01-contracts.md
translation_status: reviewed
owner: Line 1 (ADR/schema/migration) and Line 2 (S6/S7/S8 evidence contracts)
spec_version: 0.2.0
status: in_iteration
change_control: Follow iterative-testing.md
source_commit: ec6e40c
reviewed_at: 2026-11-21
---

# PR01: Lifecycle and Learning Compatibility Specification

## Objective

Create the design, schema, and reversible migration foundation for all later PRs. This is not a user-facing feature and does not implement governed lifecycle execution, connectors, the Learning Planner, or the final demo.

## Required deliverables

- `docs/lifecycle-learning-adr.md`
- `docs/stage-a-contracts.md` with S1–S8 owners, versions, fixtures, and change protocol
- `schema/14_procedural_candidates.cozo`
- `scripts/migrate_stage_a_candidates.ts`
- `tests/stage-a-migration.test.ts`
- English/Chinese documentation companions where applicable

## ADR requirements

`docs/lifecycle-learning-adr.md` must define chosen behavior for:

- Direct `propose_option` bypass and how Skill-like candidates are prevented from using it.
- General Skill lifecycle operations versus hardness-specific settlement.
- Complete subtask + Option + Model bundles rather than Option-only learning.
- Passive activation and observation states; no forced seed tasks.
- Model anticipation, actual post-state, invariants, critique, and drift.
- Independent evaluation authority and why generator self-scores cannot certify.
- Consent, retention, erasure, and namespace isolation.
- Acceptance fixtures, evidence rows, stop conditions, and non-goals.

Do not leave these as open questions unless the domain owner explicitly records them as follow-ups.

## Schema 14

Create exactly this initial relation. Additional fields require a later reversible migration.

```cozoscript
:create procedural_candidates {
  candidate_id: String =>
  source_kind: String,
  source_ref: String,
  task_signature: Json,
  proposed_subtask: Json,
  proposed_option: Json,
  proposed_model: Json,
  package_ref: String,
  package_hash: String?,
  approval_ref: String?,
  status: String,
  evidence_mode: String,
  idempotency_key: String,
  created_at: Float,
  updated_at: Float
}

::index create procedural_candidates:status_idx {status}
::index create procedural_candidates:idempotency_idx {idempotency_key}
```

Allowed values:

- `source_kind`: `markdown | skill | csv | jsonl | trajectory`.
- `status`: `proposed | approved | registered | rejected | evaluating | dormant`.
- `evidence_mode`: `real | simulated | sidecar`.
- `package_hash`: always `null` until registration computes and verifies the immutable implementation hash.
- `approval_ref`: `null` until explicit approval.

## TypeScript contracts

Create these types in `src/datastore/evidence-envelope.ts`:

```ts
import type { EvidenceMode } from "../memory/planner";

export type SourceKind = "markdown" | "skill" | "csv" | "jsonl" | "trajectory";

export interface TaskSignature {
  goal: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  applicable_scope: {
    project?: string;
    domain?: string;
    allowed_effects: string[];
  };
  premise_ids: string[];
}

export interface EvidenceEnvelope<T = unknown> {
  envelope_id: string;
  source_kind: SourceKind;
  source_ref: string;
  snapshot_ref: string | null;
  connector_version: string;
  mapping_version: "evidence-envelope-v0.1";
  namespace: string;
  task_signature: TaskSignature | null;
  content_hash: string;
  package_hash: string | null;
  evidence_mode: EvidenceMode;
  observed_at: number;
  idempotency_key: string;
  payload: T;
  payload_ref: string | null;
  validation: {
    status: "pending" | "accepted" | "blocked" | "needs_review";
    reasons: string[];
  };
}

```

### Learning runtime contracts

Create `src/runtime/learning-contracts.ts` for Line 1's transition, bundle, and evaluation types:

```ts
import type { EvidenceMode } from "../memory/planner";

export interface StateTransition {
  pre_state_ref: string;
  anticipated_post_state: unknown;
  actual_post_state: unknown;
  postconditions: string[];
  invariants: string[];
  critique_ref: string | null;
  drift_ref: string | null;
}

export interface LearningBundle {
  subtask: import("../memory/assets").SubtaskRow;
  option: import("../memory/assets").OptionInput;
  model: import("../memory/assets").ModelRow;
  premise_ids: string[];
  approval_ref: string | null;
}

export interface LearningRun {
  learning_run_id: string;
  candidate: LearningBundle;
  baseline_id: string;
  learning_evidence_refs: string[];
  held_out_evidence_refs: string[];
  expected_transition: StateTransition | null;
  observed_transition: StateTransition | null;
  outcome: {
    status: "success" | "failure" | "blocked" | "need_more_evidence";
    independent_evidence_ref: string | null;
    generator_score: null;
  };
}
```

`task_signature=null` means evidence cannot yet be grouped safely. Do not fill it from an LLM guess.

## Migration CLI

```bash
node scripts/migrate_stage_a_candidates.ts \
  --data .data/stage-a-w13-14 \
  --backup .data/stage-a-w13-14-backup \
  --endpoint http://127.0.0.1:9175/text-query \
  --yes
```

Do not default to production 9070.

## Migration algorithm

1. Require `--data`, `--backup`, `--endpoint`, and `--yes`. Support `--rollback` with the same required directories.
2. Verify the isolated endpoint and data directory.
3. If backup does not exist, copy data recursively excluding `LOCK`. Never overwrite an existing backup.
4. Read `::relations` and `::columns procedural_candidates`. If already current, return `reused=true` without changing rows or indexes.
5. If `procedural_candidates_next` exists, stop with `reconcile_required` unless it exactly matches schema 14. Never silently delete an unknown `_next` relation.
6. Read old rows if a legacy relation exists. Preserve all IDs and evidence fields; do not infer lineage from invocation history.
7. Create the new relation and indexes, insert rows in one transaction where supported, and assert row counts and IDs.
8. Replace the main relation using the existing project migration idiom: drop dependent indexes first, recreate the target relation and indexes, and keep `_next` only as explicit rollback evidence when requested.
9. On rollback, restore from the untouched backup and verify IDs, bindings, facts, J/≺, R4, and the 97-record quality boundary.
10. Return JSON with `status`, `reused`, `optionCount`, `modelCount`, `candidateCount`, `backupDir`, and `rollbackStatus` where applicable. Never print raw payloads or secrets.

## Declarative preference context contract

Lightweight personalized Planner context is part of the existing declarative-evidence lane, not a new learning subsystem. Use host events or S7 trajectory envelopes, source-specific FactCandidate mapping, S6 controlled ingestion, the existing ν-gate, ordinary facts, and J/≺. Do not add a preference relation, status vocabulary, learner, host tool, Option, Model, decision type, or schema 15.

### ADR requirements

The lifecycle/learning ADR must resolve these review cases before PR04:

- **PREF-ADR-01 — authority:** mandates, explicit project/safety rules, and Decision Gate are non-overridable. Current user instructions and preferences operate only within them.
- **PREF-ADR-02 — storage:** no preference-specific relation, materialized shadow profile, or new asset family. Preference facts use existing fact provenance, status, and revision semantics.
- **PREF-ADR-03 — inference:** repeated user corrections may produce or annotate FactCandidates. Unconfirmed inference is never promoted or injected; explicit user confirmation uses the same S6/ν-gate path.
- **PREF-ADR-04 — privacy:** observation requires opt-in and supports inspection, correction, disablement, retention, and personal-data erasure. Governance retention does not justify retaining personal payloads indefinitely.
- **PREF-ADR-05 — audit:** a preference-context hash covers the exact injected fact/version references and policy/namespace inputs. It does not claim to snapshot all Planner state.
- **PREF-ADR-06 — compatibility:** existing tool counts, OptionExecutor, Decision Gate, procedural Learning Planner, LearningRun, and held-out evaluation semantics remain unchanged.

The precedence is:

```text
Decision Gate, mandate, and explicit project/safety rules are hard constraints.
Within them: current user instruction > explicit durable preference
> user-confirmed inferred preference > historical non-instructional observations.
```

### S7 preference-feedback payload

Add a source-specific payload contract in `src/datastore/evidence-envelope.ts` without changing the generic EvidenceEnvelope or creating a top-level asset:

```ts
export interface UserPreferenceFeedback {
  feedback_kind: "explicit" | "correction" | "confirmation" | "rejection";
  actor: "user" | "agent" | "external";
  source_event_id: string;
  preference_key: string;
  kind: "response_style" | "workflow_choice";
  scope: string;
  value: string;
  influenced_by_fact_ids: string[];
  opt_in: boolean;
}
```

The S7 envelope supplies namespace, evidence mode, observed timestamp, and idempotency. `preference_key` remains stable across corrections; `source_event_id` is unique per genuine event. Values are allowlisted and canonical, not arbitrary personal-profile text. Unknown fields remain raw/null and are reported as unmapped. Agent-authored evidence cannot confirm itself.

### Fact and read semantics

Represent admitted preferences with the existing `facts` shape and an allowlisted predicate such as `user_preference`. Canonical arguments identify namespace, preference key/kind, scope, and value. Use existing `layer`, `lin_*`, `eps_*`, verification, and revision fields; do not invent calibrated confidence or treat ε metadata as execution authority.

Only ordinary `status="in"` facts are eligible. FactCandidates and `out`, `archived`, `contested`, superseded, unrelated, or out-of-scope entries are excluded. Corrections use existing revision APIs and fail closed: a partial correction returns `reconcile_required` and never leaves two active values after reconciliation.

Line 1 resolves a validated namespace from `subtasks.context` and consumes Line 2's live preference-fact query. Missing or ambiguous namespace produces an empty projection. The query and `getPlannerContext()` are read-only live reads, not a materialized profile.

### Planner audit contract

`planner_context` may add a bounded `declarative_context` containing policy version, resolved namespace, deterministically ordered structured preferences, and `context_hash`. Raw host/S7 payloads, source text, secrets, and arbitrary free-form claims are excluded.

The hash canonically covers policy version, namespace, and sorted injected fact IDs, lineage versions, and update/revision tokens. Extend the existing Planner decision contract additively to carry this hash when preferences are present. `submitPlannerDecision()` rejects stale or mismatched preference context before creating decision/execution side effects; the scheduler forwards the hash from its context read. Record the hash and exact injected references in `planner_event.context_json`.

## Stop conditions

- Do not implement PR02 lifecycle execution or PR03 connectors.
- Do not implement PR04 preference mappers, ingestion, or Planner context in PR01.
- Do not use production data or delete an unknown `_next` relation.
- Do not mark later acceptance scripts as passing.
- Stop and request domain review if registration or evidence models must change.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
- **0.2.0 (2026-11-22):** Added governed declarative-preference contracts, S7 feedback payload, Planner read/audit semantics, and PREF-ADR review cases. This is a backward-compatible planning addition and no implementation or acceptance claim.
