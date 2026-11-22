---
lang: en
canonical: devNotes/stage-a/pr04-learning-planner.md
translation_status: reviewed
owner: Line 1
spec_version: 0.1.0
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

## Stop conditions

- Do not implement PR05 acceptance.
- Do not create a preference subsystem or generate arbitrary implementation code.
- Do not release or certify based on generator self-score.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
