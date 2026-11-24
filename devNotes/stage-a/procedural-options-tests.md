---
lang: en
canonical: devNotes/stage-a/procedural-options-tests.md
translation_status: reviewed
owner: Line 1 (Planner/fulfillment/audit/retrieval) and Line 2 (evidence/merges/provenance/propagation)
spec_version: 0.5.0
status: in_iteration
change_control: Follow iterative-testing.md
source_commit: ac913ef
reviewed_at: 2026-11-24
---

# Stage A Unified Procedural Options and Prequential Fan-Out Test Plan

## Objective

Verify that natural-language and implementation-backed Options share procedural identity, retrieval, lifecycle, Decision Gate, and why-provenance while using different controlled fulfillment paths. Test general stepwise extraction, prequential fan-out, delayed evidence, and scoped Horn/provenance propagation without creating abstract Skills or new execution authority.

This is a planned suite, not an implementation or acceptance claim. All requirements in `concrete-learning-tests.md`, the six Stage A specifications, and the existing regression suite remain mandatory.

## Required invariants

1. Both kinds contain complete Option + Model bundles and immutable packages. NL Options use `pi_type="natural_language"` and immutable trajectory-policy packages; reserved plan templates remain disabled.
2. `planner_options` lists both fulfillment kinds with additive, deterministic metadata. `planner_decision.execute(option_id)` passes either kind through Decision Gate.
3. An NL fulfillment handler authorizes only its approved policy version, inference budget, and declared effects. Every subsequent tool/code action requires another authorized decision.
4. Only trajectory-level, episode-proximate, evidence-linked NL hypotheses enter runtime guidance. Immediate hypotheses expire with the episode; generalized abstract policies are excluded in Stage A.
5. One actual execution may evaluate several compatible frozen predictions but cannot validate a distinct implementation or NL policy without that procedure's own approved native execution.
6. Source episodes are excluded, and each candidate has at most one conclusive verdict per episode. Missing evidence is unresolved, and actor-influenced outcomes cannot independently confirm their source candidate.
7. Horn/provenance propagation derives scoped `affected`, `guidance_eligible`, `option_retrievable`, and `contested` consequences. It never transfers support, canonical fact status, mandates, budgets, or execution authority implicitly.
8. Declarative claims follow FactCandidate → S6/ν-gate → facts + J/≺. No outcome-as-fact conversion, arbitrary generated-rule activation, or R4 change is allowed.

## Planned fixtures

Line 2 owns fixture definitions under `tests/fixtures/stage-a/`; this planning change creates no fixture files. Reuse all fixtures from `concrete-learning-tests.md` and add:

| Fixture | Contents and expected use |
|---|---|
| `nl-alpha.json` | Trajectory-level NL policy A for an incomplete-Markdown-lineage trajectory, with condition, bounded policy text, compatible action, expected `ask` outcome, direct-tool failure predicate, source episode, and accepted verification. |
| `nl-beta.json` | Compatible policy/trajectory from a distinct source episode supporting one immutable policy-package proposal, not an abstract Skill. |
| `nl-gamma-heldout.json` | Approved controlled host-inference evaluation of the NL Option on a non-source episode, with actual Planner/Option events and external verification. |
| `nl-delta-heldout.json` | Second disjoint native NL evaluation episode; no replay or second verdict for gamma. |
| `fanout.json` | One authorized parser execution plus candidates predicting complete lineage, source mutation, later user acceptance, and an incompatible parser version. Expected results: support, contradiction, unresolved, and ineligible respectively. |
| `merge-a.json` / `merge-b.json` | Paraphrased policies with compatible scope/action/effects, distinct sources, and one shared episode to test merge lineage and evidence deduplication. |
| `merge-material.json` | A policy version whose scope/action/effect changes materially; previous support cannot transfer automatically. |
| `terminal-pending.json` | An initially unresolved audit followed by eligible external terminal evidence; includes an inconclusive-failure variant. |
| `nl-tool-bypass.json` | NL output requesting an unauthorized direct tool/code action; must block and never create an Option event for that requested action. |
| `audit-overflow.json` | More eligible candidates than one step's audit budget; excess stays pending and visible without extra execution or dropped provenance. |
| `propagation.json` | Parent/merged policies, Option prerequisites, a required contradiction, and an alternative valid justification. |
| `retrieval-paraphrases.json` | Near/far policy texts with exact and mismatched trajectory/action/scope metadata for deterministic and optional lexical retrieval checks. |
| `invalid-rule.json` | Generated Horn rule with unsafe effect, recursion/negation, or missing scope. Must not activate. |

No fixture contains production data, credentials, hidden chain-of-thought, absolute local paths, or unsupported semantic-confidence values.

## Test-file ownership

- **Line 1:** `tests/procedural-options.test.ts` for POL, GATE-NL, and LIFE-16–20; `tests/prequential-audit.test.ts` for AUDIT and native registration/fulfillment; `tests/procedural-retrieval.test.ts` for RET and Planner projections.
- **Line 2:** `tests/procedural-option-evidence.test.ts` for MERGE, DELAY, HORN, WHY, and PROP; `tests/datastore-evidence.test.ts` additions for STEP and DS-15–20.
- **Existing shared files:** retain the ownership map and sequential merge order in `README.md`; do not edit the same shared method/section in parallel.

## STEP — stepwise extraction

File: `tests/datastore-evidence.test.ts`.

- **STEP-01:** actual code and NL outputs produce normalized step evidence with fulfillment, Option/policy version, scope, source episode, and idempotency intact.
- **STEP-02:** explicit errors create extraction opportunities and negative evidence without executing an unapproved candidate or inventing success.
- **STEP-03:** trusted repeated state can trigger no-progress analysis; incomplete state hashes cannot fabricate a no-progress claim.
- **STEP-04:** terminal/user/external feedback links to the correct pending trial; run completion/stopping alone is not a success/failure verdict.
- **STEP-05:** missing implementation, schema, policy package, or principal consent produces `unknown`/`insufficient` or no persistent personal evidence, never a fabricated candidate.
- **STEP-06:** replaying a source event returns the existing envelope/classification/projection set without a second STOMP projection, candidate, or validation vote.

Additional DS-15–20 requirements are in `pr03-evidence-adapters.md`.

## POL — unified procedural Options

File: `tests/procedural-options.test.ts`.

- **POL-01:** an NL candidate contains a complete Option + Model proposal, `pi_type="natural_language"`, immutable trajectory-policy package, declared effects, predicates, and provenance.
- **POL-02:** only trajectory-scoped policies are eligible for Stage A runtime/retrieval; generalized abstract text is rejected rather than relabeled as a concrete policy.
- **POL-03:** `planner_options` returns NL and implementation-backed kinds with additive `fulfillment`, version, schema, scope, and effect metadata while preserving existing implementation fields.
- **POL-04:** an eligible runtime hypothesis may inform the next step in its episode as non-authoritative guidance and expires at the episode boundary; it never becomes a persistent verified Option automatically.
- **POL-05:** verified NL and authorized implementation-backed Options share structured retrieval/lifecycle/provenance semantics without conflating their fulfillment evidence.
- **POL-06:** an NL Option executes through controlled host inference after Decision Gate with an approved policy hash/version, budget, scope, and input schema.
- **POL-07:** an implementation-backed Option follows the existing controlled implementation and native STOMP path without changing its authority or package checks.
- **POL-08:** policy registration computes/verifies the immutable package hash and creates no fictitious code implementation, activates no reserved plan template, and preserves immutable policy versions after merges.

## RET — deterministic procedural retrieval

File: `tests/procedural-retrieval.test.ts`.

- **RET-01:** Cozo eligibility filters exclude wrong namespaces/principals/episodes/scopes/actions, candidates not eligible for the requested lane, revoked/dormant/superseded records, sensitive content, and unauthorized effects.
- **RET-02:** exact episode/task/action/implementation matches outrank unrelated or textually similar entries; semantic similarity never overrides hard filters or current user/mandate authority.
- **RET-03:** count/byte bounds, current-version selection, deterministic ID tie-breaks, and Planner hashes cover exact returned Option/policy IDs and versions.
- **RET-04:** the same snapshot and retrieval-policy version produce the same structural filtering and deterministic ranking on Mem and RocksDB; Mem is not a second authority.
- **RET-05:** lexical fallback is evaluated on curated paraphrase/relevant/irrelevant fixtures and cannot merge candidates or grant verification by similarity alone.
- **RET-06:** empty results create no seed; unavailable or placeholder embeddings produce no semantic score, forced HNSW result, or general multilingual claim.

## MERGE — semantic merging and immutable versions

File: `tests/procedural-option-evidence.test.ts`.

- **MERGE-01:** compatible paraphrases retain stable identity/aliases, exact parent policy IDs/versions, normalized policy/effect hashes, and proposer/validator versions.
- **MERGE-02:** source-episode unions and conclusive-verdict deduplication prevent rediscovery, shared episodes, or paraphrases from adding independent support.
- **MERGE-03:** a material condition/scope/action/effect change creates a new immutable version and requires appropriate reevaluation.
- **MERGE-04:** verified originals are never overwritten; a merge candidate/version proceeds through the applicable approval/evaluation/lifecycle path before retrieval.
- **MERGE-05:** an LLM may propose a merge target but deterministic scope/action/effect/schema checks reject incompatible, unsafe, or nonexistent targets.

## DELAY — pending and terminal feedback

File: `tests/procedural-option-evidence.test.ts`, with scheduler integration in `tests/prequential-audit.test.ts`.

- **DELAY-01:** an eligible audit remains pending when no conclusive step evidence exists; no negative label or support is invented.
- **DELAY-02:** eligible terminal/user/external evidence resolves the pending trial through its existing audit/verdict identity and records actual references.
- **DELAY-03:** failure without explicit counterevidence, an unanswered question, or a stopped run remains unresolved rather than contradictory.
- **DELAY-04:** retries, duplicate terminal events, restart, and `reconcile_required` recovery produce no additional conclusive episode vote or duplicate execution.

## HORN — fixed governance rules

File: `tests/procedural-option-evidence.test.ts`.

- **HORN-01:** fixed eligibility and explicit dependency queries return the same results for identical Mem/RocksDB inputs and preserve rule versions and provenance.
- **HORN-02:** merge-compatibility and conflict rules reject incompatible scope/action/effect combinations without silently rewriting verified assets.
- **HORN-03:** recursive `affected` propagation reaches only explicit dependents; required contradictions trigger review/demotion while alternative valid justifications remain effective.
- **HORN-04:** arbitrary LLM-generated Horn text, unsafe recursion/negation, unauthorized effects, direct writes, and R4 activation are blocked.

## WHY — provenance and reversibility

File: `tests/procedural-option-evidence.test.ts`.

- **WHY-01:** every current Option/policy traces source → candidate/version → merge if any → frozen audit → verdict → approval/fulfillment → current eligibility.
- **WHY-02:** a demotion records the precise counterevidence and affected dependency path without deleting original policy, Option, or evaluation history.
- **WHY-03:** rollback creates a new revision and still respects later counterevidence; dormant/revoked assets never silently reload from history.
- **WHY-04:** explanations are sanitized, namespace/principal scoped, and free of raw personal payloads, secrets, and absolute paths. `memory_why` remains a Stage B interface, not a claimed Stage A tool.

## AUDIT — prequential fan-out

File: `tests/prequential-audit.test.ts`.

- **AUDIT-01:** one authorized execution produces correct per-candidate verdicts and exactly one Option event/execution; multiple audit records do not duplicate STOMP execution evidence.
- **AUDIT-02:** wrong trajectory scope, action type, implementation/policy version, evidence mode, or mandate makes a candidate ineligible.
- **AUDIT-03:** a distinct implementation or NL policy receives no capability validation from another Option's execution; its own approved native evaluation is required.
- **AUDIT-04:** source-episode exclusion is checked both when registering an audit and when recording its verdict, including steps after discovery.
- **AUDIT-05:** replay, retry, duplicate outbox/inbox delivery, and repeated terminal events cannot produce another conclusive verdict for the same candidate/episode.
- **AUDIT-06:** missing evidence is unresolved; explicit predicate mismatch or invariant violation is contradictory and can support scoped demotion.
- **AUDIT-07:** eligible terminal/user/external feedback resolves pending trials without treating `plan_run="completed"` as success or `"stopped"` as failure.
- **AUDIT-08:** fan-out overflow remains pending, deterministic, and observable without extra effects, dropped provenance, or unrelated authorized execution being blocked; a required candidate-evaluation run cannot proceed without its frozen audit.
- **AUDIT-09:** NL and code fulfillment share audit semantics, while actor-visible guidance and influenced actions cannot independently confirm their source candidate.
- **AUDIT-10:** restart and Mem/Rocks replay preserve exact audit IDs, verdict keys, policy/implementation/predicate hashes, pending/conclusive state, and lineage without duplicates or expanded mandates.

Audit registration follows the selected decision and Decision Gate but precedes actual implementation/inference. `audit_id` binds candidate/version, episode, selected Option event, and predicate hash; `verdict_key` binds candidate/version and episode. Both are rechecked on recovery.

## PROP — scoped Horn/provenance propagation

File: `tests/procedural-option-evidence.test.ts`.

- **PROP-01:** successful support for a dependency is not inherited by dependents, merge children, or semantically similar Options as independent corroboration.
- **PROP-02:** a required contradiction marks explicit dependents `affected` and uses existing revision/demotion APIs; unrelated assets are unchanged.
- **PROP-03:** an alternative valid justification can preserve a dependent fact/eligibility; `affected` is not synonymous with invalid or revoked.
- **PROP-04:** merged candidates preserve source and verdict identity without summing parent support or counting shared episodes twice.
- **PROP-05:** a relevant declarative claim becomes a FactCandidate and passes S6/ν-gate before facts + J/≺; raw execution/NL output never becomes canonical fact directly.
- **PROP-06:** no derived consequence expands `allowed_effects`, budgets, mandates, tool counts, Decision Gate authority, or active Horn-rule authority.

## GATE-NL — controlled NL fulfillment

File: `tests/procedural-options.test.ts`.

- **GATE-NL-01:** an approved trajectory-level NL Option with valid mandate, policy hash/version, scope, input, inference budget, and declared effects can execute through controlled host inference and produce actual STOMP evidence.
- **GATE-NL-02:** an unregistered/unavailable inference handler blocks; no uncontrolled fallback LLM call or direct host-tool invocation occurs.
- **GATE-NL-03:** invalid output schema, unsupported fields, prompt injection, or sensitive content blocks/sanitizes according to contract without self-certification.
- **GATE-NL-04:** excessive inference budget, external effects, wrong namespace/principal, stale policy hash, or revoked/superseded version is blocked before side effects.
- **GATE-NL-05:** NL output cannot directly invoke tools. A subsequent tool action requires a new valid execute decision for an authorized implementation-backed Option and its own audit/evidence path.
- **GATE-NL-06:** generator self-score, NL prose, and sidecar evidence cannot certify or release an NL Option; actual approved native inference and independent evidence are required.

## Lifecycle additions

`tests/procedural-options.test.ts` also implements LIFE-16–20 from `pr02-lifecycle.md`: full NL registration, missing-handler/effect denial, no direct tool invocation, immutable merges, scoped contradiction propagation, and no authority expansion.

## Acceptance result additions

Extend `scripts/stage_a_learning_acceptance.ts` and its existing `STAGE_A_LEARNING_PASS`; do not add another script or pass token. Require all existing checks plus:

```json
{
  "stepwise_option_extraction": true,
  "prequential_candidate_fanout": true,
  "provenance_scoped_propagation": true,
  "nl_option_decision_gate": true,
  "nl_option_fulfillment_evidence": true,
  "deterministic_procedural_retrieval": true,
  "policy_merge_and_why_lineage": true,
  "negative_delayed_evaluation": true,
  "nl_tool_authority_preserved": true
}
```

Record actual `nativeEvaluationOptionEventId`, `nlEvaluationOptionEventId`, `fanoutLearningRunId`, policy/package hashes, audit IDs, verdict keys, originating execution IDs, rule/evaluator versions, and affected-entity references. Real OpenCode/DSH inference is required for positive NL fulfillment acceptance; missing handlers test only the blocked path and cannot satisfy the positive check.

## Review gates

1. **M0/W13:** approve unified Option/Planner schemas, NL effect vocabulary, inference budget/privacy, package identity, fulfillment-adapter boundary, audit/verdict identities, fixed Horn rules, and provenance contracts before dependent work.
2. **PR04 integration:** both lines attach independent self-test packages; all existing and new suites pass on isolated Mem/RocksDB, including one execution with multiple audit verdicts and no hidden-candidate injection or unsupported propagation.
3. **W14:** independently reproduce real OpenCode/DSH code and NL fulfillment, delayed feedback, replay/restart, and scoped propagation while inspecting actual rows/events/logs.
4. **Post-merge/W16:** rerun build/tests and both existing acceptance scripts on `main`; revalidate retrieval, lineage, privacy, source authority, and remaining remote-evidence behavior.

## Stage B follow-ups

- **GEN-04:** a generated Horn rule begins as an untrusted structured candidate with source/merge/generator/validator provenance and no active authority.
- **GEN-05:** structural validation rejects unsafe recursion/negation, unauthorized effects, arbitrary CozoScript, and scope/schema violations before any evaluation.
- **GEN-06:** positive/negative/counterexample and replay fixtures evaluate organization/mining behavior without treating the rule's own output as independent confirmation.
- **GEN-07:** rule demotion/revocation propagates only through explicit provenance/dependencies, preserves alternative justifications, and restores no historical asset blindly.
- **GEN-08:** identical approved rule versions and inputs produce deterministic Mem/RocksDB results without changing R4, host tool counts, Decision Gate, or trajectory-only Stage A runtime boundaries.

Generalized abstract NL Skills, evaluated embeddings/HNSW, optional masking/utility experiments, and `memory_why` remain Stage B. No Stage B capability is Stage A acceptance evidence.

## Merge blockers

- Any missing/red test or unclassified failure.
- NL or code execution without required approval, package/mandate, Decision Gate, or controlled fulfillment.
- Direct tool invocation from NL output or validation of a distinct implementation/policy without actual approved execution.
- Duplicate execution/audit/verdict records, source-episode validation, self-confirmation, or merge-support inflation.
- Unsupported support/authority propagation, direct outcome-to-fact conversion, or arbitrary Horn-rule activation.
- Raw personal data, secrets, hidden chain-of-thought, or absolute local paths in Planner context/logs/evidence.
- Changed historical IDs, R4, host tool counts, 97-record boundary, or existing acceptance requirements.

## Change log

- **0.5.0 (2026-11-24):** Added unified NL/implementation Option, stepwise, retrieval, immutable merge, delayed evidence, fixed Horn/why-provenance, prequential fan-out, scoped propagation, and controlled NL fulfillment test requirements. Test iteration 0; no implementation or acceptance claim.
