---
lang: en
canonical: devNotes/stage-a/concrete-learning-tests.md
translation_status: reviewed
owner: Line 1 (Planner/runtime/acceptance) and Line 2 (evidence/classification/lineage)
spec_version: 0.5.0
status: in_iteration
change_control: Follow iterative-testing.md
source_commit: ec6e40c
reviewed_at: 2026-11-24
---

# Stage A Concrete Evidence and Self-Learning Test Plan

## Objective

Verify that the Stage A runtime-candidate-verified hierarchy learns from concrete verified trajectories without creating abstract skills, duplicating existing implementations, weakening admission gates, or confusing sidecar evidence with native execution.

The primary acceptance path is:

```text
Two compatible concrete sidecar trajectories
→ runtime hypothesis and proposed_subtask
→ concrete procedural candidate using the observed implementation
→ approval and independent native evaluation on non-source episodes
→ registered reuse or lineage-preserving version
→ demotion on contradictory evidence
```

Abstract procedural generation is a Stage B extension and must not appear in Stage A implementation or acceptance claims.

## Test tiers

1. **Fixture/unit:** schema, classification, invariants, negative cases, and deterministic IDs.
2. **Isolated Mem integration:** candidate admission, prompts, Planner projections, and gate behavior.
3. **Isolated RocksDB:** persistence, restart, replay, revision, reconciliation, and retention.
4. **Real host:** OpenCode and DSH observation, correction, prompt, and Planner behavior.
5. **Independent reproduction:** experienced reviewer repeats acceptance and verifies actual rows/events/logs.

Do not advance while the current tier is red or a failure is unclassified.

## Fixtures

Use `tests/fixtures/stage-a/` with no secrets, production data, or absolute host paths.

| Fixture | Contents and expected use |
|---|---|
| `alpha.json` | Concrete sidecar trajectory A: `pi_ref=markdown-note@v1`, declared value A, output/chunk refs, accepted verification, unchanged source. |
| `beta.json` | Concrete trajectory B: different episode ID, same task signature/implementation, declared value B, accepted verification. |
| `gamma-heldout.json` | Non-source episode C for independent native evaluation, declared value C, approved isolated run and no learning-episode overlap. |
| `delta-heldout.json` | Second disjoint non-source episode D with declared value D and an approved isolated native run; together with gamma, supplies the proposed initial evidence gate. |
| `mixed.json` | Declarative premise plus concrete parse implementation and outcome. Must split into separate FactCandidate and S1 components. |
| `unknown.json` | Ambiguous activity with no safe task signature. Must return `unknown` and no procedural candidate. |
| `insufficient.json` | Plausible procedure with missing `pi_ref`, outcome, or required schema. Must return `insufficient`/`need_more_evidence`. |
| `personal-denied.json` | Personal evidence with denied/missing consent or `principal_id`. Must produce no persistent observation/candidate/raw payload. |
| `sensitive.json` | Secret-like value, absolute local path, and prompt-injection text. Must be excluded from Planner context and logs. |
| `rejected.json` | Failed/rejected verification or outcome. Must not become a candidate or released capability. |
| `duplicate.json` | Exact replay of alpha. Must return `reused=true` with no duplicate event, candidate, fact, revision, or asset. |

For the proposed evidence gate, review an initial heuristic of **two supporting non-source episodes and precision ≥0.67**. Gamma and delta must be disjoint native evaluation episodes, not replays or alternate verdicts for one episode. This is a proposal/review policy, not calibrated confidence or a certification guarantee. Unresolved trials do not count, and approval plus independent native evaluation remains mandatory.

## PR01B observation contract tests

File: `tests/stage-a-observation-contracts.test.ts`

- **OBS-C01:** authorized non-personal real observations round-trip with actor, namespace, source event, idempotency, and evidence mode intact; no extra opt-in is required.
- **OBS-C02:** denied/missing personal consent or `principal_id` prevents persistent observation, candidate storage, and raw-payload retention; only transient consent prompting is allowed.
- **OBS-C03:** two principals in one namespace retain distinct candidate identity and cannot share personal projections.
- **OBS-C04:** a non-preference assertion or recurring-context claim maps to a FactCandidate, not a preference-only type.
- **OBS-C05:** declarative, procedural, mixed, unknown, and insufficient fixtures produce their specified outputs; mixed components share source refs but not authority.
- **OBS-C06:** replay is reused without another envelope/candidate; correction has a new source event and stable target identity.
- **OBS-C07:** agent output and influenced feedback cannot independently confirm their own candidate.
- **OBS-C08:** secrets and unsupported fields remain excluded or unmapped; no confidence, rationale, scope, or task signature is invented.
- **OBS-C09:** real, simulated, and sidecar fixtures retain their modes, and namespaces/principals cannot share personal candidate identity.
- **OBS-C10:** prompt IDs are deterministic and replay-safe, dismissal is not confirmation, and a response cannot bypass ν-gate, registration, evaluation, or Decision Gate.

## PR02 lifecycle and reuse tests

Files: `tests/procedural-lifecycle.test.ts` and `tests/procedural-recall.test.ts`

- **LIFE-09:** prompt-only approval cannot approve, register, release, or execute a candidate; only existing approval/registration APIs work.
- **LIFE-10:** a declarative or mixed candidate cannot create an Option without its complete S1 bundle and independent evaluation.
- **LIFE-11:** prompt replay creates no duplicate approval, registration, release, Option event, or revision; dismissal/rejection is not approval.
- **LIFE-12:** partial mixed-candidate admission returns `reconcile_required`; components cannot share authority or half-register each other.
- **LIFE-13:** candidates never appear as active declarative memories or released capabilities, and source links remain distinct from J/≺.
- **LIFE-14:** a concrete trajectory reuses the observed `pi_ref`/implementation version or creates a lineage-preserving version through `parent_option_id`, `parent_version`, and `origin_event_id`; it never duplicates an existing Option blindly.
- **LIFE-15:** implementation/package mismatch, rejected verification, or sidecar-only evidence cannot produce release; revoked/dormant assets never reload from history.

## PR03 semantic-mapping tests

File: `tests/datastore-evidence.test.ts`

- **DS-09:** every supported real-observation fixture can enter validation without being forced into a candidate, and real/simulated/sidecar modes remain separate.
- **DS-10:** authorized non-personal evidence needs no extra opt-in; denied/missing personal consent or `principal_id` creates no persistent observation, candidate, raw payload, or projection.
- **DS-11:** non-preference declarative, concrete procedural, and mixed patterns map to specified components with shared source refs and no shared authority.
- **DS-12:** unknown/insufficient patterns remain unmapped or return `need_more_evidence`; no classification, rationale, confidence, scope, or task signature is invented.
- **DS-13:** identical input and classifier version produce deterministic envelope/candidate IDs after restart; replay creates no duplicates or second semantic-mapper/STOMP projections.
- **DS-14:** sensitive fields and prompt-injection text remain non-instructional and excluded, with no direct mnestic writes or combined admission gate.

## PR04 runtime/candidate/verified tests

Files: `tests/stage-a-observation-planner.test.ts` and `tests/stage-a-observation-evidence.test.ts`

### Planner/runtime — OBS-P

- **OBS-P01:** authorized non-personal evidence needs no additional opt-in and reaches the appropriate admission path without a consent prompt.
- **OBS-P02:** denied/missing personal consent or principal identity prevents persistent observation and personal projection; only transient consent prompting is allowed.
- **OBS-P03:** prompt issue/replay is idempotent, dismissal/rejection does not confirm, and a material candidate change is required before a new prompt.
- **OBS-P04:** a prompt response cannot settle a fact, approve/register an Option, authorize execution, or suppress another required gate.
- **OBS-P05:** a non-preference declarative memory admitted through ν-gate appears in relevant context with fact/version and provenance.
- **OBS-P06:** another namespace or principal receives no personal projection; missing/ambiguous identity returns an empty projection.
- **OBS-P07:** runtime hypotheses remain non-instructional; FactCandidates and `out`, `archived`, `contested`, superseded, unrelated, or out-of-scope entries are excluded, and empty reads create no records.
- **OBS-P08:** ordering, relevance, count/byte bounds, and truncation are deterministic; raw observations and sensitive claims are excluded.
- **OBS-P09:** identical inputs produce identical hashes; correction changes the hash; stale/mismatched hashes block before decision, execution, or outbox writes.
- **OBS-P10:** the scheduler forwards hash and prompt state without executing stale context or duplicating prompts after restart.
- **OBS-P11:** Options, mandate, budgets, tools, and decision vocabulary remain unchanged; unauthorized execution remains blocked.
- **OBS-P12:** mixed observations use separate declarative and procedural admission paths with shared source references but no shared authority; no abstract skill is generated.

### Candidate/evaluation — OBS-D

- **OBS-D01:** authorized non-personal evidence maps to the appropriate candidate without an unnecessary consent step.
- **OBS-D02:** denied/missing personal consent or `principal_id` creates no persistent observation, candidate, fact, raw payload, or personal projection.
- **OBS-D03:** two principals in one namespace retain separate personal candidates and read projections.
- **OBS-D04:** a non-preference declarative memory can become one ordinary `status="in"` fact through ν-gate with correct lineage and no Option/Model output.
- **OBS-D05:** mixed observations produce separate FactCandidate and S1 components with shared source references and no shared authority.
- **OBS-D06:** unknown/insufficient patterns remain unmapped or return `need_more_evidence`; no classification, confidence, task signature, or abstract skill is invented.
- **OBS-D07:** source and prompt replay returns existing results without duplicate observations, candidates, facts, prompt responses, revisions, or metadata updates.
- **OBS-D08:** agent output and influenced feedback cannot independently confirm their own candidate; genuine new user feedback remains distinguishable.
- **OBS-D09:** namespaces, principals, and real/simulated/sidecar evidence never combine silently; imported feedback is not relabeled native real.
- **OBS-D10:** correction retires the old value, admits one replacement through the applicable gate, preserves history, and returns only the replacement.
- **OBS-D11:** partial correction/prompt admission is fail-closed with `reconcile_required`, never two active values after reconciliation; retry/restart creates no duplicates.
- **OBS-D12:** all writes use approved S6/service methods; no direct mnestic write, shadow profile, sensitive read projection, or additional tool/asset family appears.

### Evaluation invariants also required

- Expected effects are frozen before evaluation and compared with actual post-state evidence.
- Source episodes are excluded from independent validation and each candidate has at most one conclusive verdict per episode.
- Supporting and total conclusive trials produce a deterministic precision value; unresolved trials do not count.
- Sidecar-only evidence cannot release an Option; independent native evaluation is required.

## PR05 acceptance and evidence tests

### Runtime/real host — OBS-A

- **OBS-A01 — OpenCode concrete reuse:** alpha and beta create a runtime hypothesis and one concrete procedural candidate using `markdown-note@v1`; approval and two conclusive supporting native evaluations on disjoint gamma and delta episodes satisfy the proposed evidence gate and lead to reuse or a lineage-preserving version with no duplicate Option. Source episodes cannot substitute for either held-out evaluation.
- **OBS-A02 — DSH parity:** the same concrete trajectory mapping and evaluation works under the same contract and isolated storage.
- **OBS-A03 — personal consent and identity:** missing/denied consent prevents persistent personal evidence; bounded opt-in prompting allows later storage and two principals in one namespace remain isolated.
- **OBS-A04 — declarative beyond preferences:** a non-preference assertion or recurring-context memory proceeds through ν-gate into relevant Planner context with fact/version provenance.
- **OBS-A05 — procedural and mixed paths:** a concrete procedural candidate still needs a full bundle, approval, independent evaluation, and registration; mixed components share source refs but not authority.
- **OBS-A06 — unknown and insufficient patterns:** unclassifiable or incomplete evidence returns unmapped/`need_more_evidence` and can trigger only a bounded clarification prompt, never a fabricated candidate or abstract skill.
- **OBS-A07 — prompt idempotency and authority:** replay, dismissal, and rejection do not repeat or confirm; a response cannot bypass ν-gate, registration, evaluation, or Decision Gate.
- **OBS-A08 — instruction and mandate:** current user instruction and mandates remain authoritative within hard constraints; observation text cannot expand effects, budgets, tools, or `AGENTS.md`.
- **OBS-A09 — recovery:** restart/replay and injected correction/prompt failures create no duplicate observations, candidates, facts, revisions, prompt responses, Planner events, executions, or resurrected memories.
- **OBS-A10 — privacy and regression:** raw personal payloads and sensitive values are absent from Planner context/logs; disablement and erasure follow policy, and existing capture/recall/revision, bilingual, lifecycle, passive procedural learning, and tool-count acceptance remains green.

### Evidence/docs — OBS-E

- **OBS-E01:** every accepted memory/candidate traces source observation/S7 → classification/version → candidate → applicable gate → fact or procedural release, including prompt-response references without raw payload copying.
- **OBS-E02:** declarative, concrete procedural, mixed, unknown, insufficient, duplicate, agent-influenced, and cross-namespace/principal fixtures retain expected outcomes.
- **OBS-E03:** consent and identity regression: authorized non-personal evidence needs no extra opt-in; personal denied/missing consent or `principal_id` produces no persistent evidence.
- **OBS-E04:** original Markdown, SKILL.md, CSV/JSONL, trajectory, sidecar, and S8 mappings remain unchanged; declarative evidence does not contaminate procedural held-out evaluation.
- **OBS-E05:** actual prompt IDs/responses are idempotent and linked to gate outcomes, and documentation never claims prompts grant truth, approval, execution, certification, or abstract skills.
- **OBS-E06:** English/Chinese companions describe the same observation, consent, classification, prompt, correction, and acceptance behavior.

## Acceptance result requirements

Extend `scripts/stage_a_learning_acceptance.ts`; do not add another acceptance script or pass token. Require all existing checks plus:

```json
{
  "observation_classification": true,
  "observation_consent_privacy": true,
  "observation_prompt_gates": true,
  "declarative_memory_revision_recovery": true,
  "observation_real_host_behavior": true,
  "concrete_trajectory_reuse": true,
  "native_independent_evaluation": true,
  "source_episode_exclusion": true,
  "no_duplicate_assets": true,
  "no_abstract_generation": true
}
```

Record actual `observationEnvelopeId`, `declarativeFactId`, `proceduralCandidateId`, `promptEventId`, `nativeEvaluationOptionEventId` for gamma, and `learningContextHash`. Evaluation evidence references must include delta's distinct native Option event and both disjoint episode IDs. Print `STAGE_A_LEARNING_PASS` only when every existing and new assertion passes and the result file is written.

## Commands

```bash
pnpm build
pnpm test
node scripts/stage_a_lifecycle_acceptance.ts
node scripts/stage_a_learning_acceptance.ts
```

Use isolated Mem/RocksDB, temporary Markdown roots, and real OpenCode/DSH sessions where required. Do not use production 9070, production Markdown roots, real credentials, or real network collection.

## Unified procedural-option companion suite (0.5.0)

`devNotes/stage-a/procedural-options-tests.md` extends this plan to both concrete implementation-backed Options and trajectory-level natural-language Options. NL Options have complete Option + Model bundles and immutable policy packages, pass Decision Gate, and execute through a controlled host-inference fulfillment handler. They are not generalized abstract Skills.

The companion suite adds general stepwise extraction, unified `planner_options`, prequential fan-out over all eligible hidden candidates, deterministic retrieval, semantic merge/version lineage, delayed evidence, and fixed Horn/provenance propagation. One real execution may test multiple compatible predictions but never validates a distinct implementation or NL policy without that procedure's own approved native execution.

All existing concrete-reuse, native-evaluation, privacy, and authority cases remain mandatory. In particular, propagation cannot create independent corroboration, canonical facts, tool authority, or duplicate merge support.

## Merge blockers

- Any missing/red test or unclassified failure.
- Abstract-skill generation in Stage A.
- Sidecar-to-native evidence promotion or release without independent native evaluation.
- Source-episode validation, duplicate verdicts, self-confirmation, or learning/held-out leakage.
- Duplicate sidecar/semantic-mapper ingestion, STOMP projections, Options, Models, or revision records.
- Personal evidence persisted without consent or stable principal identity.
- Prompt-derived truth, approval, execution, or certification.
- Raw personal payloads, secrets, absolute local paths, or unsupported fields in Planner context/logs.
- NL Decision Gate or fulfillment-handler bypass, direct tool invocation from NL output, unsupported fan-out/propagation, or arbitrary Horn-rule activation.
- Changed historical IDs, R4, tool counts, or the 97-record boundary.

## Change log

- **0.4.0 (2026-11-24):** Added concrete verified-trajectory-first testing, shared sidecar/semantic ingestion, runtime-candidate-verified checks, source-episode exclusion, expected-effect evaluation, implementation reuse, and a prohibition on Stage A abstract-skill generation. Test iteration 0; no implementation or acceptance claim.
- **0.5.0 (2026-11-24):** Linked the unified NL/implementation Option, prequential fan-out, retrieval, merge/provenance, and propagation companion suite while retaining every concrete-reuse requirement. Test iteration 0; no implementation or acceptance claim.
