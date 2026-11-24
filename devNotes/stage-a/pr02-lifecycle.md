---
lang: en
canonical: devNotes/stage-a/pr02-lifecycle.md
translation_status: reviewed
owner: Line 1
spec_version: 0.3.0
status: in_iteration
change_control: Follow iterative-testing.md
source_commit: ec6e40c
reviewed_at: 2026-11-21
---

# PR02: Governed Lifecycle and Procedural Recall

## Objective

Prove the governed Skill lifecycle end to end: identify → approve → package/mandate gate → probation → real execution → settle → `active_release` → revoke/dormant. Learning may not propose bundles until this lifecycle works. PR01's schema, contracts, and migration are complete.

## Deliverables

- Candidate identification over Markdown/Skill projections and registration through approval + package hash + mandate.
- Atomic Option/Model probation → settle → `active_release`; revoke → dormant history.
- S4 governed Skill execution through NativeAdapter/OptionExecutor.
- `bridge_recall(include_procedural=true)` live S2 join with settled/released metadata only.
- Demotion index and narrative-side trichotomy tests.
- `tests/procedural-lifecycle.test.ts` and `tests/procedural-recall.test.ts`.
- `scripts/stage_a_lifecycle_acceptance.ts` returning `STAGE_A_LIFECYCLE_PASS` only after all assertions pass.

## Internal API

Place candidate/lifecycle operations in `src/api/procedural-candidates.ts` and read-side capability queries in `src/api/capability-read.ts`:

```ts
export async function identifyProceduralCandidate(input: {
  source_kind: SourceKind;
  source_ref: string;
  task_signature: TaskSignature | null;
  proposed_subtask: unknown;
  proposed_option: unknown;
  proposed_model: unknown;
  package_ref: string;
  evidence_mode: EvidenceMode;
  idempotency_key: string;
}): Promise<{ gate: "pass" | "blocked"; candidate_id: string; reused: boolean; reason?: string }>;

export async function approveProceduralCandidate(input: {
  candidate_id: string;
  actor: string;
  approval_ref: string;
}): Promise<{ gate: "pass" | "blocked"; candidate_id: string; reason?: string }>;

export async function registerApprovedCandidate(input: {
  candidate_id: string;
  package_hash: string;
  mandate: unknown;
}): Promise<{ gate: "pass" | "blocked" | "reconcile_required"; option_id?: string; model_id?: string; reason?: string }>;

export async function listActiveCapabilityMetadata(): Promise<unknown[]>;
export async function listCapabilityHistory(optionId?: string): Promise<unknown[]>;
export async function revokeCapability(optionId: string, arbiter: string, reason: string): Promise<unknown>;
```

## Invariants

- Only `approveProceduralCandidate` changes `proposed → approved`.
- Only `registerApprovedCandidate` computes/verifies `package_hash`, creates Option/Model, and marks the candidate registered.
- Unapproved/mismatched/mandate-missing candidates never create an Option or Model.
- Partial writes produce `reconcile_required`; retry reconciles by ID instead of creating another asset.
- Existing direct `propose_option` remains compatible for old assets, but Skill-like candidate registration cannot bypass the new gate.
- Seven memory-governance tools remain unchanged.

## Lifecycle fixture

Use a local immutable test Skill:

```text
source_ref = fixtures/skills/read-only-note/SKILL.md
task_signature.goal = "Read one local note and return its declared value"
allowed_effects = ["read"]
implementation package = SKILL.md + local read-only script
```

## Acceptance assertions

- Candidate has no executable Option before approval.
- Registration creates one atomic Option and one Model with matching bindings.
- Planner execute records real input/output/error observations and outcome.
- `active_release` selects exactly one version.
- Revoke hides the capability from the next default recall while preserving dormant history.
- `bridge_recall(include_procedural=true)` returns metadata only, never implementation text or execution authority.
- Built-ins and probation/revoked/dormant assets are excluded by default.
- Lifecycle crash/retry/restart creates no duplicate Option, Model, event, or release.
- `node scripts/stage_a_lifecycle_acceptance.ts` returns `STAGE_A_LIFECYCLE_PASS` only after all rows are queried and verified.

## Author self-tests

- **LIFE-01:** unapproved candidate and host-callable registration bypass are blocked.
- **LIFE-02:** text `content_hash` cannot serve as implementation `package_hash`.
- **LIFE-03:** partial Option/Model registration returns `reconcile_required`, not half an asset.
- **LIFE-04:** denial/cancellation is not success; real execution records observations and outcomes.
- **LIFE-05:** settle/revoke/active_release changes appear on the next recall with no materialized shadow.
- **LIFE-06:** built-ins never enter capability discovery; revoked capabilities never reload from history.
- **LIFE-07:** outcomes and calibration never become independent declarative facts.
- **LIFE-08:** crash/retry/restart creates no duplicate Option, Model, event, or release.

## Unified observation authority boundaries

PR02's procedural lifecycle remains unchanged and is the only path that can approve, register, release, or revoke a procedural candidate. Proactive prompts may supply approval input to these existing APIs, but a prompt response itself changes no candidate, fact, Option, Model, release, or execution state.

Additional invariants:

- `approveProceduralCandidate` remains the sole `proposed → approved` transition; `registerApprovedCandidate` remains the sole registration path.
- Declarative candidates never use procedural approval/registration APIs; they proceed through S6/ν-gate to facts + J/≺.
- Mixed observations produce separate declarative and S1 components with shared source references but independent admission and recovery.
- Prompt approval never replaces package verification, mandate checks, independent held-out evaluation, or Decision Gate.
- A prompt response is not independent execution evidence and cannot settle, certify, or authorize an Option.
- Recall/read annotations distinguish candidates, active declarative memories, and released procedural assets; no candidate becomes an active suggestion merely because it was observed.

### Additional author self-tests

- **LIFE-09:** prompt-only approval cannot approve, register, release, or execute a candidate; only the existing approval/registration APIs work.
- **LIFE-10:** a declarative or mixed candidate cannot create an Option through the procedural path without its complete S1 bundle and independent evaluation.
- **LIFE-11:** prompt replay creates no duplicate approval, registration, release, Option event, or revision, and dismissal/rejection is not approval.
- **LIFE-12:** partial mixed-candidate admission returns `reconcile_required`; declarative and procedural components cannot share authority or half-register each other.
- **LIFE-13:** recall/read annotations do not present candidates as active declarative memories or released capabilities, and source links remain distinct from J/≺.

## Stop conditions

- Do not implement PR03 connectors or PR04 Learning Planner.
- Do not let proactive prompts bypass lifecycle, evaluation, or Decision Gate checks.
- Do not accept generated prose as lifecycle evidence.
- Do not merge before migration/rollback, negative suite, and lifecycle acceptance pass.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
- **0.3.0 (2026-11-23):** Added LIFE-09–13 for unified observation prompts, mixed candidates, prompt-safe approval/registration, and read-side status boundaries. Existing lifecycle requirements are unchanged.
