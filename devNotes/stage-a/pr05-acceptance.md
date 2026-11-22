---
lang: en
canonical: devNotes/stage-a/pr05-acceptance.md
translation_status: reviewed
owner: Line 1 (runtime acceptance) and Line 2 (evidence/regression/docs)
spec_version: 0.1.0
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
4. Existing memory capture/revise/recall and bilingual recall regression remain green.
5. No forced seed, auto-registration, auto-publish, automatic `AGENTS.md` edit, direct mnestic write, or outcome-as-fact path.
6. R4 remains blocked and no certification, production SuperAgent, general multilingual semantic claim, or continuous-service claim is made.

## Stop conditions

- Do not mark the W16 full Stage A exit complete.
- Do not accept generated prose as evidence or hide failing checks.
- Do not run against production 9070 or production Markdown roots.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
