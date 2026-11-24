---
lang: en
canonical: devNotes/stage-a/pr05-acceptance.md
translation_status: reviewed
owner: Line 1 (runtime acceptance) and Line 2 (evidence/regression/docs)
spec_version: 0.4.0
status: in_iteration
change_control: Follow iterative-testing.md
source_commit: ec6e40c
reviewed_at: 2026-11-21
---

# PR05: W15 Release-Candidate Integration and Acceptance

## Objective

Demonstrate the complete vertical slice and archive reproducible evidence for the next sprint. PR01–PR04 are complete. Do not implement the W16 remote connector or claim the full W16 Stage A exit.

## Deliverables

- `scripts/stage_a_learning_acceptance.ts` returning `STAGE_A_LEARNING_PASS` only after all assertions pass.
- `docs/stage-a-w13-14-acceptance.md` with evidence IDs, commands, reviewer log, and limitations.
- Real OpenCode and DSH evidence where model-visible behavior is involved.
- Updated `docs/stage-a-contracts.md` review log and bilingual companion docs.
- Final regression and recovery report.

## Acceptance script sequence

Implement `scripts/stage_a_learning_acceptance.ts` with this sequence:

1. Start isolated RocksDB and apply all current schemas plus schema 14.
2. Run migration/rollback checks without production data.
3. Run the governed lifecycle fixture and verify all expected rows.
4. Run the passive-learning fixture and verify observation, full bundle, S8 evaluation, and final governance state.
5. Restart the service and verify IDs, facts, J/≺, observations, Model events, and LearningRun remain intact.
6. Replay all idempotent operations and assert no duplicate facts, candidates, events, evaluations, or assets.
7. Run existing memory capture/revise/recall and bilingual recall regressions.
8. Write `.data/stage-a-learning-acceptance-result.json` only after every assertion passes.

## Result schema

Use actual IDs and timestamps:

```json
{
  "gate": "pass",
  "verifiedAt": "<ISO timestamp>",
  "endpoint": "http://127.0.0.1:9175/text-query",
  "checks": {
    "migration_rollback": true,
    "governed_lifecycle": true,
    "empty_memory_no_forced_seed": true,
    "full_learning_bundle": true,
    "model_transition_and_invariants": true,
    "independent_held_out_evaluation": true,
    "source_authority_and_no_direct_writes": true,
    "restart_idempotency_and_retention": true,
    "existing_memory_and_bilingual_regression": true,
    "r4_and_tool_count_unchanged": true
  },
  "ids": {
    "candidateId": "<actual ID>",
    "optionId": "<actual ID>",
    "modelId": "<actual ID>",
    "learningRunId": "<actual ID>"
  },
  "limitations": [
    "No certification claim",
    "No production SuperAgent claim",
    "No general multilingual semantic claim",
    "No continuous-service claim"
  ]
}
```

Print `STAGE_A_LEARNING_PASS` only after the result file has been written and every check is true. On failure, print the failing assertion and leave `gate` absent; never print the pass token.

## Required scenarios

1. Lifecycle demo from PR02 passes.
2. Empty-memory passive-learning demo from PR04 passes, ending in approved release, revision, or explicit rejection.
3. dataStore evidence is traceable to source, STOMP execution, and S8 evaluation.
4. The unified observation and proactive-prompt vertical slices from PR04 pass before restart/replay checks.
5. Existing memory capture/revise/recall and bilingual recall regression remain green.
6. No forced seed, auto-registration, auto-publish, automatic `AGENTS.md` edit, direct mnestic write, or outcome-as-fact path.
7. R4 remains blocked and no certification, production SuperAgent, general multilingual semantic claim, or continuous-service claim is made.

## Unified observation acceptance

Extend `scripts/stage_a_learning_acceptance.ts`; do not add another acceptance script or pass token. Run authorized non-personal, personal-consent, declarative non-preference, procedural, mixed, unknown, and prompt-replay scenarios through one shared intake before restart/replay verification.

### Line 1 — PR05A

- **OBS-A01 — OpenCode operational observation:** an authorized non-personal real observation passes validation without an unnecessary consent prompt and produces the appropriate declarative or procedural candidate.
- **OBS-A02 — DSH parity:** repeat the shared intake and admission behavior under the same contract and isolated storage.
- **OBS-A03 — personal consent and identity:** missing/denied consent prevents persistent personal evidence; a bounded opt-in prompt allows later storage and two principals in one namespace remain isolated.
- **OBS-A04 — declarative beyond preferences:** a non-preference assertion or recurring-context memory proceeds through ν-gate into relevant Planner context with fact/version provenance.
- **OBS-A05 — procedural and mixed paths:** a procedural candidate still needs a full bundle, approval, independent evaluation, and registration; mixed components share source refs but not authority.
- **OBS-A06 — unknown and insufficient patterns:** unclassifiable or incomplete evidence returns unmapped/`need_more_evidence` and can trigger only a bounded clarification prompt, never a fabricated candidate.
- **OBS-A07 — prompt idempotency and authority:** prompt replay, dismissal, and rejection do not repeat or confirm; a response cannot bypass ν-gate, registration, evaluation, or Decision Gate.
- **OBS-A08 — instruction and mandate:** current user instruction and mandates remain authoritative within hard constraints; observation text cannot expand effects, budgets, tools, or `AGENTS.md`.
- **OBS-A09 — recovery:** restart/replay and injected correction/prompt failures create no duplicate observations, candidates, facts, revisions, prompt responses, Planner events, executions, or resurrected memories.
- **OBS-A10 — privacy and regression:** raw personal payloads and sensitive values are absent from Planner context/logs; disablement and erasure follow policy, and existing capture/recall/revision, bilingual, lifecycle, passive procedural learning, and tool-count acceptance remains green.

Merge these fields into `checks` and require all to be true:

```json
{
  "observation_classification": true,
  "observation_consent_privacy": true,
  "observation_prompt_gates": true,
  "declarative_memory_revision_recovery": true,
  "observation_real_host_behavior": true
}
```

Record actual `observationEnvelopeId`, `declarativeFactId`, `proceduralCandidateId`, `promptEventId`, and `learningContextHash` under `ids`. Print `STAGE_A_LEARNING_PASS` only after every existing and new check passes and the result file is written.

### Line 2 — PR05B

- **OBS-E01 — lineage:** every accepted memory/candidate traces source observation/S7 → classification/version → candidate → applicable gate → fact or procedural release, including prompt-response references without raw payload copying.
- **OBS-E02 — classification regression:** declarative, procedural, mixed, unknown, insufficient, duplicate, agent-influenced, and cross-namespace/principal fixtures retain expected outcomes.
- **OBS-E03 — consent and identity regression:** authorized non-personal evidence needs no extra opt-in; personal denied/missing consent or principal identity produces no persistent evidence.
- **OBS-E04 — source and held-out regression:** original Markdown, SKILL.md, CSV/JSONL, trajectory, and S8 mappings remain unchanged; declarative evidence does not contaminate procedural held-out evaluation.
- **OBS-E05 — prompt and limitation evidence:** actual prompt IDs/responses are idempotent and linked to gate outcomes, and documentation never claims prompts grant truth, approval, execution, or certification.
- **OBS-E06 — bilingual parity:** English/Chinese companions describe the same observation, consent, classification, prompt, correction, and acceptance behavior.

## Concrete trajectory acceptance

The primary acceptance scenario uses concrete verified trajectories with a known implementation and outcome chain. It must demonstrate:

```text
Concrete verified trajectories
→ existing implementation and outcome chain confirmed
→ candidate with actual pi_ref/version/arguments
→ independent native evaluation on disjoint non-source episodes
→ approved Option reuse or lineage-preserving version
→ verified Planner guidance
→ demotion on contradictory evidence
```

Use `devNotes/stage-a/concrete-learning-tests.md` for the complete fixture and test matrix. Alpha and beta are source sidecar trajectories; gamma and delta are disjoint native evaluation episodes satisfying the proposed two-supporting-episode evidence heuristic. An abstract-skill case is not a Stage A scenario. Missing implementation evidence produces no procedural candidate; it must not trigger abstract generation.

The acceptance result must additionally require:

```json
{
  "concrete_trajectory_reuse": true,
  "native_independent_evaluation": true,
  "source_episode_exclusion": true,
  "no_duplicate_assets": true,
  "no_abstract_generation": true
}
```

Record actual `nativeEvaluationOptionEventId` for gamma, implementation/version lineage, and evaluation evidence references including delta's native Option event. Sidecar-only evidence cannot satisfy the independent native evaluation check; one episode cannot supply two verdicts.

## Stop conditions

- Do not mark the W16 full Stage A exit complete.
- Do not accept generated prose as evidence or hide failing checks.
- Do not run against production 9070 or production Markdown roots.
- Do not pass with personal evidence persisted without consent, forced classification, prompt-derived authority, cross-namespace/principal leakage, missing real-host evidence, duplicate assets, or abstract-skill generation.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
- **0.2.0 (2026-11-22):** Added PREF-A01–08 and PREF-E01–05, mandatory preference result fields and evidence IDs, and real-host/privacy/recovery acceptance. No acceptance claim.
- **0.3.0 (2026-11-23):** Added OBS-A01–10 and OBS-E01–06 for unified observation classification, general declarative memories, consent/identity, proactive prompts, mixed candidates, and gate-separated acceptance. No acceptance claim.
- **0.4.0 (2026-11-24):** Made concrete verified-trajectory reuse the primary acceptance scenario, added native independent evaluation/source-exclusion/no-duplicate/no-abstract checks, and moved abstract procedural generation to Stage B.
