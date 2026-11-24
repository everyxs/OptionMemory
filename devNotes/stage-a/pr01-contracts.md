---
lang: en
canonical: devNotes/stage-a/pr01-contracts.md
translation_status: reviewed
owner: Line 1 (ADR/schema/migration) and Line 2 (S6/S7/S8 evidence contracts)
spec_version: 0.4.0
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

## Unified observation and candidate contract

All real observations may enter authority, privacy, namespace, and evidence-mode validation. Only validated, relevant observations produce candidates. Authorized non-personal operational evidence may be observed passively without an additional opt-in. Personal or behavioral evidence requires opt-in before persistent observation, candidate storage, or raw-payload retention; any pre-consent processing is transient. A real observation is not automatically correct, relevant, generalizable, or safe to learn from.

Use one intake and distinct admission paths:

```text
Real observation → authority/privacy/namespace/evidence-mode validation
→ S7 EvidenceEnvelope → deterministic source-specific classification
→ declarative: FactCandidate → S6/ν-gate → facts + J/≺
→ procedural: S1 candidate → full bundle → approval + independent evaluation + registration → Option/Model
```

Classification is `declarative | procedural | mixed | unknown | insufficient`. Mixed observations may produce separate declarative and procedural components with shared source references. Unknown or insufficient patterns remain unmapped or return `need_more_evidence`; never force a classification. Record `classifier_version` and evidence references. The initial classifier is deterministic and requires no LLM.

### ADR requirements

The lifecycle/learning ADR must resolve these review cases before PR04:

- **OBS-ADR-01 — authority:** mandates, explicit project/safety rules, and Decision Gate remain non-overridable. Current user instructions operate only within them.
- **OBS-ADR-02 — storage and gates:** no new observation relation, preference-specific lifecycle, shadow profile, or combined truth/authorization gate. FactCandidates and S1 procedural candidates remain distinct.
- **OBS-ADR-03 — privacy and identity:** authorized non-personal evidence may be passive. Personal evidence requires opt-in before persistence and a stable `principal_id`; namespace alone does not identify a person. Inspection, correction, disablement, retention, and erasure are defined.
- **OBS-ADR-04 — classification:** declarative, procedural, mixed, unknown, and insufficient cases have explicit outcomes. Mixed evidence is split without shared authority, and unknowns are never guessed.
- **OBS-ADR-05 — inference and prompts:** unconfirmed inference never becomes authoritative automatically. Proactive prompts are bounded, idempotent, dismissable, and evidence-linked, but do not confer truth, approval, or execution authority.
- **OBS-ADR-06 — read scope:** declarative memories extend beyond preferences, but not every admitted memory enters Planner context. Relevance, status, namespace, principal scope, sensitivity, and size limits apply at read time.
- **OBS-ADR-07 — audit:** context hashes cover exact injected fact/version references and policy/namespace/principal inputs. They do not claim complete Planner-state reproducibility.
- **OBS-ADR-08 — compatibility:** existing tool counts, OptionExecutor, Decision Gate, procedural LearningRun, held-out evaluation, and real/simulated/sidecar separation remain unchanged.

The precedence is:

```text
Decision Gate, mandate, and explicit project/safety rules are hard constraints.
Within them: current user instruction > relevant authoritative declarative context
> historical non-instructional observations.
```

### S7 observation-pattern payload

Add a source-specific payload contract in `src/datastore/evidence-envelope.ts` without changing the generic EvidenceEnvelope or creating a top-level asset:

```ts
export interface ObservationPattern {
  observation_kind: "instruction" | "correction" | "confirmation" | "rejection" | "activity" | "outcome";
  actor: "user" | "agent" | "external";
  source_event_id: string;
  principal_id: string | null;
  personal: boolean;
  consent: "not_required" | "required" | "granted" | "denied";
  pattern: {
    kind: string;
    scope: string;
    value: unknown;
  };
  influenced_by_fact_ids: string[];
}
```

The S7 envelope supplies namespace, evidence mode, observed timestamp, and idempotency. `principal_id` is required when `personal=true`; it is null for non-personal operational evidence. `consent="not_required"` is invalid when `personal=true`. Pattern kinds are mapper-allowlisted, but values are not automatically safe for Planner injection. Unknown fields remain raw/null and are reported as unmapped. Agent-authored evidence cannot confirm itself.

### Candidate, prompt, and admission semantics

Declarative memories include preferences, assertions, corrections, recurring context, and other governed facts. Preferences are only one subtype. Personal preference confirmation may authorize that preference through the existing ν-gate; it does not establish an objective fact or executable capability. Procedural candidates still require a full `subtask + Option + Model` bundle, approval, independent evaluation, and registration.

Proactive prompts use existing Planner `ask`, `wait`, and `replan` decisions and host approval/event paths. A prompt ID is deterministic over candidate ID, prompt kind, and principal ID. Each prompt is issued at most once unless the underlying candidate materially changes. Dismissal or rejection suppresses repeated prompts and never becomes confirmation. A prompt response is new evidence or approval input, not authority by itself.

### Fact and read semantics

Use existing fact status, provenance, ε metadata, verification, and revision fields. Do not invent calibrated confidence or treat ε metadata as execution authority. Only ordinary `status="in"` facts are eligible for read projections. FactCandidates and `out`, `archived`, `contested`, superseded, unrelated, or out-of-scope entries are excluded. Corrections use existing revision APIs and fail closed with `reconcile_required` when partial.

Line 1 resolves a validated namespace from `subtasks.context` and, for personal memory, a validated principal ID through the approved host identity mapping. Missing or ambiguous identity produces no personal projection. Line 2 supplies a live declarative-memory query. The query and `getPlannerContext()` are read-only, not a materialized profile.

### Planner audit contract

`planner_context` may add a bounded `declarative_context` containing policy version, resolved identity/scope, deterministically ordered structured memories, and `context_hash`. Raw host/S7 payloads, source text, secrets, and arbitrary free-form claims are excluded.

The hash canonically covers policy version, namespace/principal scope, and sorted injected fact IDs, lineage versions, and update/revision tokens. Extend the existing Planner decision contract additively to carry this hash when declarative context is present. `submitPlannerDecision()` rejects stale or mismatched context before decision/execution side effects; the scheduler forwards the hash from its context read. Record the hash and exact injected references in `planner_event.context_json`.

## Concrete evidence and implementation-reuse contract

Use concrete verified trajectories whenever an implementation and outcome chain already exists. Do not force every observation into an abstract-skill template, and do not generate abstract skills in Stage A.

A concrete procedural candidate must preserve, when available:

- `option_id`, `model_id`, `pi_ref`, implementation version, and arguments.
- Pre-state, post-state, environment, error, outcome, and verification verdict.
- Source/episode IDs, evidence refs, and idempotency metadata.

Candidate task signatures map to `proposed_subtask`, never directly to an authoritative subtask before approval. Reuse an existing Option/Model when compatible, or create a lineage-preserving version through `parent_option_id`, `parent_version`, and `origin_event_id`. Never duplicate an existing implementation merely because a new task signature was inferred.

The hierarchy remains:

```text
Runtime observation metadata
→ declarative candidate OR concrete procedural candidate
→ independent evaluation and applicable approval
→ verified declarative fact or existing/new-version Option/Model
→ demotion on contradictory evidence
```

Runtime hypotheses are read-side projections, not a new memory relation. Expected effects are frozen before subsequent evaluation, not retroactively invented for historical outcomes. Source episodes are excluded from independent validation, with at most one conclusive verdict per candidate per episode. Sidecar evidence can propose a candidate but cannot release it; native independent evaluation is required.

Review `devNotes/stage-a/concrete-learning-tests.md` for fixtures, reuse cases, negative cases, evaluation invariants, and acceptance fields. If no usable implementation exists, return `unknown` or `insufficient` and retain metadata only—do not generate an abstract skill.

## Stop conditions

- Do not implement PR02 lifecycle execution or PR03 connectors/classification.
- Do not implement PR04 prompt handling, candidate admission, or Planner context in PR01.
- Do not permit persistent personal observation without opt-in, or treat all real observations as candidates.
- Do not generate abstract skills in Stage A.
- Do not use production data or delete an unknown `_next` relation.
- Do not mark later acceptance scripts as passing.
- Stop and request domain review if registration or evidence models must change.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
- **0.2.0 (2026-11-22):** Added governed declarative-preference contracts, S7 feedback payload, Planner read/audit semantics, and PREF-ADR review cases. This is a backward-compatible planning addition and no implementation or acceptance claim.
- **0.3.0 (2026-11-23):** Generalized preferences into unified observation-driven declarative learning with authorized passive intake, deterministic mixed-pattern classification, stable personal identity, bounded proactive prompts, and distinct ν-gate/registration authority. No implementation or acceptance claim.
- **0.4.0 (2026-11-24):** Added concrete verified-trajectory-first contracts, shared sidecar/semantic ingestion, runtime-candidate-verified hierarchy, expected-effect evaluation, implementation reuse, and Stage B-only abstract procedural generation. No implementation or acceptance claim.
