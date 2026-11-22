---
lang: en
canonical: devNotes/stage-a/pr04-learning-planner.md
translation_status: reviewed
owner: Line 1 (Learning Planner and Planner context) and Line 2 (evidence and preference mappings)
spec_version: 0.2.0
status: in_iteration
change_control: Follow iterative-testing.md
source_commit: ec6e40c
reviewed_at: 2026-11-21
---

# PR04: Passive Learning Planner and Model Transition

## Objective

Produce a complete learning candidate only after compatible real evidence exists. The Learning Planner is a built-in control-plane service, not a host tool or a new asset family. PR01–PR03 provide contracts, lifecycle, and evidence mapping.

## Deliverables

- `src/runtime/learning-planner.ts` and `src/runtime/learning-run.ts`.
- Observation states: `dormant → observing → candidate_ready → evaluating → probation/active_release or dormant_watch`.
- Task-signature derivation from goal, input/output schema, scope, mandate, and declarative premises.
- Bounded template-based bundle synthesis; no arbitrary implementation generation.
- Model transition support: pre-state, anticipated post-state, actual post-state, postconditions, invariants, critique, and drift.
- S8 LearningRun with learning/held-out separation, baseline, and real evaluation.
- `tests/learning-planner.test.ts`, `tests/learning-state-transition.test.ts`, and `tests/learning-recovery.test.ts`.

## Learning API

Implement these methods or equivalent names:

```ts
export async function observeLearningEvidence(input: {
  envelope: EvidenceEnvelope;
  subtask_event_id?: string;
  plan_run_id?: string;
  option_event_id?: string;
}): Promise<{ gate: "pass" | "blocked"; status: LearningStatus | "need_more_evidence"; observation_id: string; missing?: string[] }>;

export async function proposeLearningBundle(observationId: string): Promise<{
  gate: "pass" | "blocked";
  status: "candidate_ready" | "need_more_evidence";
  candidate?: LearningBundle;
  missing?: string[];
}>;

export async function evaluateLearningBundle(candidate: LearningBundle): Promise<LearningRun>;
```

## Algorithm

1. Validate source authority, namespace, evidence mode, and any available subtask/plan_run/option_event chain. Store only an observation context on first valid evidence.
2. Derive a task signature from goal, input/output schema, allowed effects, and declarative premise IDs. If not comparable, keep it null and return `need_more_evidence`.
3. Group only identical task signatures and the same namespace. Never mix simulated/sidecar with native real evidence.
4. The default MVP policy proposes a candidate after **two compatible native real observations**. This is a proposal threshold, not a success or certification threshold.
5. Build a complete bundle from a bounded template: subtask scope, Option implementation, Model evidence/evaluation specs, premise IDs, and `approval_ref=null`.
6. When state changes apply, populate expected transition and invariants. Otherwise set `expected_transition=null`.
7. Evaluate on the next natural task or an approved isolated run. Held-out refs must not overlap learning refs.
8. Record actual post-state, independent evidence, and `generator_score=null` in S8. Promotion still requires approval and the normal registration gate.

## Fixture sequence

Use a local read-only fixture:

```text
Observation A: local note alpha.md → expected value A
Observation B: local note beta.md → expected value B
Held-out: local note gamma.md → expected value C
```

## Acceptance sequence

1. Empty MemoryCore has zero candidates and zero learned Options.
2. Observation A enters `observing`; no candidate is proposed.
3. Observation B with the same task signature enters `candidate_ready` and creates exactly one bundle.
4. An unrelated task signature returns `need_more_evidence` and does not change the first bundle.
5. Held-out evaluation records expected and actual post-state and creates one S8 LearningRun.
6. Approval and registration create probationary assets; later Planner discovery selects the released Option.
7. Replaying A/B produces no duplicate observation, candidate, evaluation, or Option.
8. Changing a premise or introducing contradictory evidence triggers revision/revocation rather than continued active release.

## Author self-tests

- **LRN-01:** empty memory and insufficient evidence return `need_more_evidence` with no candidate or forced seed.
- **LRN-02:** installed Skill or raw file alone creates no learning claim.
- **LRN-03:** valid real activity creates an observation context; invalid/partial evidence does not invent a bundle.
- **LRN-04:** full bundle includes subtask, Option, Model, task scope, declarative premises, and transition semantics where applicable.
- **LRN-05:** expected versus actual post-state and invariants; read-only tasks produce no fabricated transition.
- **LRN-06:** generator self-score cannot settle; independent real evaluation is required.
- **LRN-07:** crash/retry produces no duplicate candidates, memories, or executions.
- **LRN-08:** changed premises or contradictory evidence trigger re-evaluation, revision, or revocation.

## Declarative preference context

PR04A/B also deliver lightweight personalized Planner context through the existing declarative-evidence lane. This is not part of the procedural Learning Planner and never creates a subtask + Option + Model bundle for a preference.

```text
Host feedback / S7 trajectory envelope → Line 2 mapper → FactCandidate
→ S6 + existing ν-gate → ordinary facts + J/≺
→ Line 2 live query → Line 1 planner_context
```

Use the PR01 preference contract and approved policy version. Only explicit preferences and explicitly confirmed inference may become eligible facts. Observation requires opt-in. Agent output/actions cannot confirm themselves, and feedback influenced by a preference cannot independently strengthen it. Existing revision APIs handle corrections. No new relation, lifecycle, confidence model, host tool, or learner is permitted.

### Line 1 deliverables — PR04A

- Resolve a validated namespace from `subtasks.context` and consume Line 2's live query; do not parse raw feedback or add CozoScript to the Planner service.
- Add a bounded, deterministic `declarative_context` to `getPlannerContext()` containing only eligible structured facts and existing provenance/quality metadata.
- Generate and verify the additive preference-context hash, forward it through the scheduler, and record exact fact/version references in `planner_event.context_json`.
- Keep `getPlannerContext()` read-only and `planner_options`, mandate, budgets, decision vocabulary, OptionExecutor, and Decision Gate unchanged.
- Add `tests/stage-a-preference-planner.test.ts`.

### Line 1 author self-tests

- **PREF-P01:** an admitted explicit preference appears in the next relevant context with namespace, kind/value, fact/version identity, and provenance.
- **PREF-P02:** another namespace or missing valid `subtasks.context.namespace` returns an empty projection; never infer namespace from text or session names.
- **PREF-P03:** FactCandidates and `out`, `archived`, `contested`, superseded, unrelated, and out-of-scope entries are excluded.
- **PREF-P04:** empty storage returns no preferences and creates no seed, observation, candidate, event, or asset; context reads change no counts or timestamps.
- **PREF-P05:** ordering, relevance, count/byte bounds, and truncation are deterministic; only allowlisted structured fields are returned.
- **PREF-P06:** identical fact/version inputs produce the same hash; correction changes it; Planner events record exact references without raw personal payloads.
- **PREF-P07:** stale/mismatched hashes block with a stable reason and no decision, Option event, execution, or outbox write; matching hashes and replay remain correct.
- **PREF-P08:** the scheduler forwards the hash and handles preference changes between read and decision without executing stale context.
- **PREF-P09:** before/after snapshots of Options, mandate, budgets, tools, and decision vocabulary are identical; unauthorized execution remains blocked.
- **PREF-P10:** isolated RocksDB restart preserves facts/lineage, retraction takes effect on the next live read, and replay creates no duplicates.

### Line 2 deliverables — PR04B

- Implement the preference-feedback mapper, S6 authority/namespace/evidence-mode/idempotency validation, and live preference-fact query through the existing evidence/read-side components.
- Add explicit, correction, confirmation, rejection, duplicate, agent-influenced, cross-namespace, contradictory, and sensitive fixtures.
- Use existing revision APIs for correction/retraction; preserve history and return `reconcile_required` for partial correction.
- Add `tests/stage-a-preference-evidence.test.ts`. Preference evidence is not a learning/held-out Skill dataset and requires no S8 capability evaluation.

### Line 2 author self-tests

- **PREF-D01:** valid explicit feedback maps to one ordinary `status="in"` fact with correct lineage and no Option/Model output.
- **PREF-D02:** source replay returns the existing result without duplicate host event, envelope, candidate, fact, revision, or metadata/confidence update.
- **PREF-D03:** missing opt-in, agent-authored feedback, invalid namespace, or unverified evidence creates no eligible fact.
- **PREF-D04:** repeated corrections may annotate a candidate, but unconfirmed inference is neither promoted nor queryable; explicit confirmation follows the same S6/ν-gate path.
- **PREF-D05:** agent actions and influenced feedback cannot independently strengthen a preference; a new explicit user correction remains valid.
- **PREF-D06:** namespaces and evidence modes never combine silently, and imported feedback is not relabeled native real.
- **PREF-D07:** correction retires the old value, admits one replacement, preserves history, and returns only the replacement from the live query.
- **PREF-D08:** failure between retirement and replacement is fail-closed with `reconcile_required`, never two active values after reconciliation; retry/restart creates no duplicates.
- **PREF-D09:** raw payloads, source text, secrets, arbitrary claims, and unsupported values are absent from the read projection and logs.
- **PREF-D10:** all writes use approved S6/service methods; no direct mnestic write, shadow profile, or additional tool/asset family appears.

### PR04 preference integration checkpoint

Before PR05:

1. Both lines attach independent author self-test commands, results, spec versions, test iterations, and actual row/event IDs; no cross-review is required.
2. Run PREF-P01–10 and PREF-D01–10 on isolated Mem and required RocksDB scenarios, then `pnpm build && pnpm test`.
3. Exercise explicit feedback → candidate → fact → Planner context → hash-bound decision → correction → revision.
4. Inspect actual rows to prove no new relations, Options, Models, decision types, direct writes, or replay duplicates.
5. Any red or unclassified test blocks PR05. Any contract change returns to the specification-change gate.

## Stop conditions

- Do not implement PR05 acceptance.
- Do not create separate preference storage, lifecycle, confidence model, learner, or tool family. Use only the governed declarative path defined above.
- Do not generate arbitrary implementation code or release/certify based on generator self-score.
- Do not inject unconfirmed inference, raw personal payloads, or cross-namespace preferences.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
- **0.2.0 (2026-11-22):** Added two-line declarative-preference deliverables, PREF-P01–10 and PREF-D01–10, and the PR04 integration checkpoint. No implementation or acceptance claim.
