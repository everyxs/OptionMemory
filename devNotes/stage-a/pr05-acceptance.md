---
lang: en
canonical: devNotes/stage-a/pr05-acceptance.md
translation_status: reviewed
owner: Line 1 (runtime acceptance) and Line 2 (evidence/regression/docs)
spec_version: 0.2.0
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
4. The declarative-preference vertical slice from PR04 passes before restart/replay checks.
5. Existing memory capture/revise/recall and bilingual recall regression remain green.
6. No forced seed, auto-registration, auto-publish, automatic `AGENTS.md` edit, direct mnestic write, or outcome-as-fact path.
7. R4 remains blocked and no certification, production SuperAgent, general multilingual semantic claim, or continuous-service claim is made.

## Declarative preference acceptance

Extend `scripts/stage_a_learning_acceptance.ts`; do not add another acceptance script or pass token. Insert the preference vertical slice after the passive-learning fixture and include preference facts/revisions in restart and replay verification.

### Line 1 — PR05A

- **PREF-A01 — OpenCode:** in an isolated real session, opt in, state an explicit durable preference, observe structured Planner context, and record a hash-bound decision using an existing Option or permitted Planner action.
- **PREF-A02 — DSH parity:** repeat capture, context, and permitted decision behavior under the same contract and isolated storage.
- **PREF-A03 — namespace and correction:** project B and missing-namespace runs receive no preference; explicit correction replaces project A's context and preserves revision history across sessions/restart.
- **PREF-A04 — instruction and mandate:** current user instruction prevails over preference only within the mandate. Preference text requesting unauthorized execution, extra budget, or `AGENTS.md` modification has no such effect and Decision Gate still blocks.
- **PREF-A05 — inference negative:** repeated agent behavior and agent-influenced acceptance do not activate inference; explicit user confirmation is required.
- **PREF-A06 — recovery:** replay source events and decisions after restart and injected correction failures; no duplicate facts, revisions, Planner events, executions, or resurrected preferences.
- **PREF-A07 — privacy:** raw personal payloads and sensitive values are absent from Planner context/logs; disablement and erasure follow approved policy while permitted lineage remains auditable.
- **PREF-A08 — regression:** existing capture/recall/revision, bilingual, lifecycle, passive procedural learning, and tool-count acceptance remains green.

Merge these fields into `checks` and require all to be true:

```json
{
  "declarative_preference_context": true,
  "preference_namespace_and_privacy": true,
  "preference_revision_replay_recovery": true,
  "preference_audit_hash_binding": true,
  "preference_real_host_behavior": true
}
```

Record actual `preferenceFactId`, `preferenceRevisionId`, `preferencePlannerEventId`, and `preferenceContextHash` under `ids`. Print `STAGE_A_LEARNING_PASS` only after every existing and new check passes and the result file is written.

### Line 2 — PR05B

- **PREF-E01 — lineage:** every accepted preference traces source event/S7 → FactCandidate → S6/ν-gate → fact → revision; Planner influence links by fact/version reference rather than raw payload copying.
- **PREF-E02 — mapping regression:** duplicate, contradictory, unconfirmed, agent-influenced, cross-namespace, and sensitive fixtures retain expected blocked/unmapped/revised outcomes.
- **PREF-E03 — source regression:** original Markdown, SKILL.md, CSV/JSONL, trajectory, and S8 mappings remain unchanged; preference evidence does not enter held-out Skill evaluation.
- **PREF-E04 — limitations:** documentation states no automatic inferred-preference promotion, calibrated confidence, arbitrary personal profiles, new subsystem, or capability certification.
- **PREF-E05 — bilingual parity:** English/Chinese companions describe the same authority, privacy, correction, and acceptance behavior.

## Stop conditions

- Do not mark the W16 full Stage A exit complete.
- Do not accept generated prose as evidence or hide failing checks.
- Do not run against production 9070 or production Markdown roots.
- Do not pass preference acceptance with unconfirmed inference, cross-namespace leakage, raw sensitive injection, or missing real-host evidence.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
- **0.2.0 (2026-11-22):** Added PREF-A01–08 and PREF-E01–05, mandatory preference result fields and evidence IDs, and real-host/privacy/recovery acceptance. No acceptance claim.
