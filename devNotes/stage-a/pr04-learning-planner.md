---
lang: en
canonical: devNotes/stage-a/pr04-learning-planner.md
translation_status: reviewed
owner: Line 1 (Learning Planner, proactive prompts, and Planner context) and Line 2 (observation evidence and candidate mappings)
spec_version: 0.4.0
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
- Bounded concrete-trajectory bundle synthesis using observed implementations and version lineage; no Stage A abstract-skill or arbitrary implementation generation.
- Model transition support: pre-state, anticipated post-state, actual post-state, postconditions, invariants, critique, and drift.
- S8 LearningRun with learning/held-out separation, baseline, and independent native evaluation.
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
3. Group only identical task signatures, namespace, evidence mode, and compatible implementation identity. Never mix simulated/sidecar with native real evidence.
4. The default native-observation policy proposes a candidate after **two compatible native real observations**. The concrete sidecar scenario uses two compatible verified trajectories to create one proposal. Neither threshold establishes success or certification.
5. Build a complete bundle from a concrete verified trajectory: `proposed_subtask`, observed `pi_ref`/implementation version and arguments, Model evidence/evaluation specs, premise IDs, and `approval_ref=null`. Reuse a compatible Option/Model or preserve version lineage through PR02; do not generate an abstract skill.
6. When state changes apply, freeze expected transition and invariants in `model_event(anticipation)` before subsequent evaluation. Otherwise set `expected_transition=null`; never reconstruct expected effects retroactively from historical outcomes.
7. Evaluate on the next natural task or an approved isolated native run on a non-source episode. Exclude all learning episodes and allow at most one conclusive verdict per candidate per episode.
8. Record actual post-state, independent evidence, and `generator_score=null` in S8. Promotion still requires approval and the normal registration gate; sidecar-only evidence cannot release.

## Fixture sequence

Use the planned concrete fixtures and expected results in `concrete-learning-tests.md`: alpha and beta are compatible concrete sidecar trajectories; gamma and delta are disjoint episodes for independent native evaluation. Imported trajectories retain `mode=sidecar`; only actual approved native evaluation supplies native real execution evidence.

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

## Unified observation-driven learning and proactive prompts

PR04A/B consume PR03's validated observation classifications. Declarative memories include preferences and other assertions, corrections, recurring context, and governed facts; preferences are only one subtype. Procedural learning still requires full bundles and independent evaluation. Prompts help obtain missing consent, clarification, confirmation, or approval but never grant authority.

```text
Validated observation → PR03 classification → candidate(s)
→ optional bounded prompt → declarative: S6/ν-gate → facts + J/≺
                       → procedural: approval + independent evaluation + registration → Option/Model
→ bounded Planner context or governed Option discovery
```

Authorized non-personal evidence may be collected passively. Personal evidence requires opt-in before persistent observation or candidate storage. Pre-consent processing is transient. Prompt IDs are deterministic over candidate ID, prompt kind, and principal ID; replay, dismissal, and rejection never repeat or confirm a prompt. Prompt responses are new evidence/approval inputs only.

### Line 1 deliverables — PR04A

- Implement bounded proactive prompts through existing Planner `ask`, `wait`, and `replan` decisions and host approval/event paths, without adding tools or decision types.
- Consume Line 2's live declarative-memory query using validated `subtasks.context.namespace` and the approved principal mapping for personal memories.
- Add a bounded, deterministic `declarative_context` containing only relevant `status="in"` memories, not every admitted fact or raw observation.
- Generate and verify the additive declarative-context hash, forward it through the scheduler, and record exact fact/version and prompt-response references in `planner_event.context_json`.
- Keep `getPlannerContext()` read-only and preserve `planner_options`, mandates, budgets, decision vocabulary, OptionExecutor, and Decision Gate.
- Add `tests/stage-a-observation-planner.test.ts`.

### Line 1 author self-tests

- **OBS-P01:** authorized non-personal evidence needs no additional opt-in and reaches the appropriate admission path without a consent prompt.
- **OBS-P02:** denied/missing personal consent or principal identity prevents persistent observation and personal projection; transient consent prompting is the only permitted pre-consent action.
- **OBS-P03:** prompt issue/replay is idempotent, dismissal/rejection does not confirm, and a material candidate change is required before a new prompt.
- **OBS-P04:** a prompt response cannot settle a fact, approve/register an Option, authorize execution, or suppress another required gate.
- **OBS-P05:** a non-preference declarative memory admitted through ν-gate appears in relevant context with fact/version and provenance.
- **OBS-P06:** another namespace or principal receives no personal projection; missing/ambiguous identity returns an empty projection.
- **OBS-P07:** FactCandidates and `out`, `archived`, `contested`, superseded, unrelated, or out-of-scope entries are excluded; empty reads create no records.
- **OBS-P08:** ordering, relevance, count/byte bounds, and truncation are deterministic; raw observations and sensitive claims are excluded.
- **OBS-P09:** identical inputs produce identical hashes; correction changes the hash; stale/mismatched hashes block before decision, execution, or outbox writes.
- **OBS-P10:** scheduler forwards the hash and prompt state without executing stale context or duplicating a prompt after restart.
- **OBS-P11:** Options, mandate, budgets, tools, and decision vocabulary remain unchanged; unauthorized execution remains blocked.
- **OBS-P12:** mixed observations use separate declarative and procedural admission paths with shared source references but no shared authority.

### Line 2 deliverables — PR04B

- Consume PR03 classification outputs and implement S6 authority/namespace/principal/evidence-mode/idempotency validation and the live declarative-memory query through existing components.
- Persist prompt responses and candidate/fact/revision lineage with `classifier_version` and source references; prompt responses never bypass admission.
- Add general declarative, preference, mixed, unknown, insufficient, duplicate, agent-influenced, cross-namespace/principal, contradictory, and sensitive fixtures.
- Use existing revision APIs for corrections and fail closed with `reconcile_required` on partial changes.
- Add `tests/stage-a-observation-evidence.test.ts`. Declarative memories do not require S8 capability evaluation; procedural bundles retain independent held-out evaluation.

### Line 2 author self-tests

- **OBS-D01:** authorized non-personal evidence maps to the appropriate candidate without an unnecessary consent step.
- **OBS-D02:** denied/missing personal consent or `principal_id` creates no persistent observation, candidate, fact, raw payload, or personal projection.
- **OBS-D03:** two principals in one namespace retain separate personal candidates and read projections.
- **OBS-D04:** a non-preference declarative memory can become one ordinary `status="in"` fact through ν-gate with correct lineage and no Option/Model output.
- **OBS-D05:** mixed observations produce separate FactCandidate and S1 components with shared source references and no shared authority.
- **OBS-D06:** unknown/insufficient patterns remain unmapped or return `need_more_evidence`; no classification, confidence, or task signature is invented.
- **OBS-D07:** source and prompt replay returns existing results without duplicate observations, candidates, facts, prompt responses, revisions, or metadata updates.
- **OBS-D08:** agent output and influenced feedback cannot independently confirm their own candidate; genuine new user feedback remains distinguishable.
- **OBS-D09:** namespaces, principals, and real/simulated/sidecar evidence never combine silently; imported feedback is not relabeled native real.
- **OBS-D10:** correction retires the old value, admits one replacement through the applicable gate, preserves history, and returns only the replacement.
- **OBS-D11:** partial correction/prompt admission is fail-closed with `reconcile_required`, never two active values after reconciliation; retry/restart creates no duplicates.
- **OBS-D12:** all writes use approved S6/service methods; no direct mnestic write, shadow profile, sensitive read projection, or additional tool/asset family appears.

### PR04 unified-observation integration checkpoint

Before PR05:

1. Both lines attach independent author self-test commands, results, spec versions, test iterations, and actual row/event IDs; no cross-review is required.
2. Run OBS-P01–12 and OBS-D01–12 on isolated Mem and required RocksDB scenarios, then `pnpm build && pnpm test`.
3. Exercise authorized non-personal, personal-consent, declarative non-preference, procedural, mixed, unknown, and prompt-replay scenarios through one shared intake.
4. Inspect actual rows to prove no new relations, combined admission gate, new tools/decision types, direct writes, or replay duplicates.
5. Any red or unclassified test blocks PR05. Any contract change returns to the specification-change gate.

## Concrete trajectory learning and evaluation

Prefer concrete verified trajectories over abstract generation. A runtime hypothesis may inform the next decision in the same episode as non-instructional context, but it is not a fact, Option, or confirming observation.

A procedural candidate is created only when the trajectory supplies a concrete implementation and outcome chain: `option_id`, `model_id`, `pi_ref`, version, arguments, pre/post state, outcome, and verification provenance. Reuse the existing implementation or preserve its version lineage. Missing implementation evidence returns `unknown` or `insufficient`, never an abstract skill.

Evaluation must:

- Freeze expected effects before subsequent execution and compare them with actual post-state evidence.
- Exclude source episodes from independent validation and allow at most one conclusive verdict per candidate per episode.
- Keep learning and held-out trajectories disjoint and preserve evidence modes.
- Use deterministic support/precision calculations without calling them calibrated confidence.
- Require independent native evaluation for release; sidecar evidence alone cannot release.
- Use `model_event(anticipation)` for expected effects and `model_event(critique/drift)` for counterevidence and demotion.

`devNotes/stage-a/concrete-learning-tests.md` defines the concrete reuse case, evaluation invariants, support/precision policy, and prohibition on Stage A abstract-skill generation.

## Stop conditions

- Do not implement PR05 acceptance.
- Do not create separate preference storage, lifecycle, confidence model, learner, or tool family, and do not combine the ν-gate and registration gate.
- Do not persist personal observations without opt-in or treat every real observation as a candidate.
- Do not let prompts confer truth, approval, execution authority, or certification.
- Do not generate abstract skills or arbitrary implementation code in Stage A, or release/certify based on generator self-score.
- Do not inject unconfirmed inference, raw personal payloads, or cross-namespace/principal memories.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
- **0.2.0 (2026-11-22):** Added two-line declarative-preference deliverables, PREF-P01–10 and PREF-D01–10, and the PR04 integration checkpoint. No implementation or acceptance claim.
- **0.3.0 (2026-11-23):** Generalized preferences into unified observation-driven declarative learning with proactive bounded prompts, consent/identity rules, mixed candidate handling, and distinct admission gates. No implementation or acceptance claim.
- **0.4.0 (2026-11-24):** Made concrete verified trajectories and implementation reuse the primary learning path, with runtime-candidate-verified guidance, source exclusion, native evaluation, and abstract procedural generation deferred to Stage B.
