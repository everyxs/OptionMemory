---
lang: en
canonical: devNotes/stage-a/pr01-tests.md
translation_status: reviewed
owner: Line 1 (migration) and Line 2 (evidence fixtures)
spec_version: 0.5.0
status: in_iteration
change_control: Follow iterative-testing.md
source_commit: ec6e40c
reviewed_at: 2026-11-21
---

# PR01 Test Plan

Create `tests/stage-a-migration.test.ts` using the existing isolated Mem/RocksDB helpers. Write fixtures and tests before implementing the migration where practical; confirm the new tests fail for the intended reason before implementing.

## Legacy fixture

```ts
const legacyOption = {
  option_id: "legacy_parse_csv",
  model_binding: "legacy_model_parse_csv",
  subtask_binding: "legacy_subtask",
  status: "probation"
};
```

## Required scenarios

### MIG-01: migrate, rerun, and roll back

1. Start an empty isolated Mem instance and an existing isolated RocksDB copy.
2. Run the migration.
3. Assert the schema and indexes match `pr01-contracts.md`.
4. Rerun and assert `reused=true` with unchanged rows and indexes.
5. Roll back and assert the original schema and data are restored.

### MIG-02: preserve historical evidence

Assert `legacy_parse_csv`, `legacy_model_parse_csv`, and all fact/J IDs remain exactly unchanged. Verify Option/Model bindings, R4, and the 97-record quality boundary.

### MIG-03: failed precheck

Inject a precheck failure. Assert no main-relation replacement and no second backup overwrite. Preserve the untouched backup for diagnosis and rollback.

### MIG-04: unknown next relation

Create an unknown `procedural_candidates_next`. Assert `reconcile_required`; never delete it silently.

### S1-01: candidate idempotency

Insert the same candidate twice with one idempotency key. The second result is reused and the candidate count is one.

### S1-02: initial candidate fields

Assert new candidates have `package_hash=null` and `approval_ref=null` and no execution entitlement.

### S7-01: envelope round-trip and unknown fields

Round-trip a valid EvidenceEnvelope. Unknown fields remain raw/null and do not change `envelope_id`.

### S8-01: held-out leakage

Reject a LearningRun whose held-out refs duplicate learning refs.

## Unified observation contract tests

PR01A keeps MIG-01–04 and S1-01–02 unchanged and adds an assertion that migration creates only the approved schema 14 procedural-candidate relation, never an observation or preference relation.

PR01B owns `tests/stage-a-observation-contracts.test.ts` and observation fixtures under `tests/fixtures/stage-a/`. Write expected-failure tests before implementation where practical:

- **OBS-C01 — authorized operational observation:** round-trip a non-personal real observation with `consent="not_required"`, actor, namespace, source event, evidence mode, and idempotency intact.
- **OBS-C02 — personal consent boundary:** `personal=true` with missing/denied consent or missing `principal_id` prevents persistent observation, candidate storage, and raw-payload retention; only transient consent prompting is allowed.
- **OBS-C03 — identity separation:** two principals in one namespace retain distinct candidate identity and cannot share personal projections.
- **OBS-C04 — declarative beyond preferences:** a non-preference assertion or recurring-context claim maps to a FactCandidate, not a preference-specific type.
- **OBS-C05 — classification outcomes:** declarative, procedural, mixed, unknown, and insufficient fixtures produce their specified outputs; mixed components share source refs but not authority.
- **OBS-C06 — replay and correction identity:** replay is reused without another envelope/candidate, while correction has a new source event and stable target identity.
- **OBS-C07 — self-confirmation provenance:** agent output and influenced feedback cannot independently confirm their own candidate.
- **OBS-C08 — sensitive and unknown fields:** secrets and unsupported fields remain excluded or unmapped; no confidence, rationale, scope, or task signature is invented.
- **OBS-C09 — evidence isolation:** real, simulated, and sidecar fixtures retain their modes, and different namespaces/principals cannot share personal candidate identity.
- **OBS-C10 — prompt contract:** prompt IDs are deterministic and replay-safe, dismissal is not confirmation, and a prompt response cannot bypass ν-gate, registration, evaluation, or Decision Gate.

PR01B supplies fixtures and contract validation only. It does not implement PR03 classification, PR04 prompts/admission, or Planner integration.

## Commands

```bash
pnpm build
pnpm test
node scripts/migrate_stage_a_candidates.ts --data .data/stage-a-w13-14 --backup .data/stage-a-w13-14-backup --endpoint http://127.0.0.1:9175/text-query --yes
```

Record commands, exact results, isolated evidence, relevant row/event IDs, and limitations in the PR description. Do not mark later acceptance scripts as passing.

## Unified procedural Option and fan-out contracts (0.5.0)

Add contract and migration cases for both procedural fulfillment forms; no implementation or acceptance claim is made by this plan:

- **POL-01 — trajectory-policy bundle:** round-trip a complete NL Option + Model candidate with `candidate_kind="trajectory_policy"`, `pi_type="natural_language"`, an immutable policy package/reference, trajectory scope, expected/failure predicates, and no arbitrary code or generalized abstract-skill claim.
- **POL-07 — implementation bundle:** preserve the concrete Option + Model path, its implementation/version lineage, and existing package/mandate checks. Both kinds use approval, registration, evaluation, and Decision Gate.
- **POL-03 — public Option projection:** both kinds expose an additive `fulfillment` discriminator and exact policy/implementation versions. Existing implementation-backed fields remain compatible; raw observations and sensitive payloads are not returned.
- **AUDIT-00 — audit identity:** `audit_id` binds candidate/version, episode, selected Option event, and predicate hash; `verdict_key` binds candidate/version and episode. Replay is reused, source episodes are excluded, and one episode has at most one conclusive verdict per candidate.
- **HORN-00 — fixed-rule boundary:** fixed reviewed Horn/Datalog queries round-trip eligibility and explicit dependency relationships. Arbitrary generated rules cannot activate, and R4 remains blocked.
- **WHY-00 — provenance:** merge parents, source episodes, generator/validator versions, policy/effect hashes, approval, fulfillment, and evaluation references round-trip without copying raw sensitive payloads.

Migration tests must include `candidate_kind` while creating only the approved schema 14 relation, not a new observation, preference, audit, or policy table. Both candidate kinds carry full Option + Model proposals; `package_ref` identifies either an immutable implementation or policy package, and `package_hash` commits to its exact normalized contents.

`devNotes/stage-a/procedural-options-tests.md` is the canonical fixture and test matrix for POL, AUDIT, STEP, RET, MERGE, DELAY, HORN, WHY, PROP, and GATE-NL scenarios.

## M0 / end-of-W13 unified-observation checkpoint

Before PR03 classification and PR04 learning/prompt work begins, the experienced reviewer and domain owner must:

1. Approve OBS-ADR-01–08, the cross-line S7/classification/candidate/live-query contracts, proactive prompt semantics, and privacy/identity/retention behavior.
2. Verify OBS-C01–10 have explicit expected results and recorded test iterations.
3. Confirm no new relation, combined admission gate, tool family, or automatic inference-promotion path was introduced.
4. Approve the unified Option/Planner schema, NL effect vocabulary, inference budget/privacy, immutable policy package identity, controlled fulfillment-adapter boundary, fan-out audit/verdict identities, and fixed-Horn/provenance propagation rules.
5. Verify the new procedural-option contract cases have expected results and recorded iterations, including NL tool-bypass denial, distinct-procedure validation requirements, and no abstract runtime policy.
6. Independently run PR01 tests and the full baseline. Any red or unclassified test blocks dependent work.
7. Record the approved observation/classifier, retrieval, predicate, and fixed-rule versions and sample declarative, concrete Option, trajectory-policy, mixed, and insufficient mappings in `docs/stage-a-contracts.md`.

## Merge blockers

- Any missing or red test.
- Production data usage or an unreviewed schema replacement.
- Missing backup or rollback evidence.
- Changed historical IDs, bindings, R4, tool counts, or the 97-record boundary.
- Any contract requirement that remains an unrecorded open question.
- Unresolved observation authority, consent, classification, identity, or cross-line contract decisions.
- An NL Option that bypasses Decision Gate, invokes tools directly, executes through an unregistered handler, or claims validation from a different policy or implementation's execution.
- Support inherited without direct compatible evidence, duplicated merge votes, or arbitrary generated Horn-rule activation.

## Change log

- **0.1.0 (2026-11-21):** Initial test plan. Test iteration 0; no acceptance claim. Add discovered scenarios using the template in `iterative-testing.md`.
- **0.2.0 (2026-11-22):** Added PREF-C01–07, the no-preference-relation migration assertion, and the M0/W13 contract checkpoint. Test iteration 0; no implementation or acceptance claim.
- **0.3.0 (2026-11-23):** Replaced preference-only cases with OBS-C01–10 covering general declarative memories, all observation classifications, personal consent/identity, and prompt-to-gate boundaries. Test iteration 0; no implementation or acceptance claim.
- **0.4.0 (2026-11-24):** Aligned the version marker with the concrete evidence and implementation-reuse increment; detailed scenarios are in `concrete-learning-tests.md`.
- **0.5.0 (2026-11-24):** Added unified NL/implementation Option contracts, fan-out audit identities, fixed-Horn/provenance boundaries, and expanded M0 checkpoints. Test iteration 0; no implementation or acceptance claim.
