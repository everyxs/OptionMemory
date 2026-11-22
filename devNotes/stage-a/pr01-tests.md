---
lang: en
canonical: devNotes/stage-a/pr01-tests.md
translation_status: reviewed
owner: Line 1 (migration) and Line 2 (evidence fixtures)
spec_version: 0.2.0
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

## Declarative preference contract tests

PR01A keeps MIG-01–04 and S1-01–02 unchanged and adds an assertion that migration creates only the approved schema 14 procedural-candidate relation, never a preference relation.

PR01B owns `tests/stage-a-preference-contracts.test.ts` and preference fixtures under `tests/fixtures/stage-a/`. Write expected-failure tests before implementation where practical:

- **PREF-C01 — explicit instruction round-trip:** preserve actor, namespace, source event, idempotency key, evidence mode, stable preference key, scope, and allowlisted value.
- **PREF-C02 — correction and confirmation identity:** a correction has a new source event ID and the same preference key; replay retains deterministic identity; confirmation remains distinguishable from inference.
- **PREF-C03 — invalid authority:** missing/invalid namespace, non-user actor, missing opt-in, or unverified source is rejected or unmapped without fabricating a valid FactCandidate.
- **PREF-C04 — self-confirmation provenance:** preserve `influenced_by_fact_ids` and source-action references so agent-influenced feedback cannot independently confirm a preference.
- **PREF-C05 — unsafe or unsupported values:** arbitrary profiles, secrets, unsupported kinds, and non-canonical values are blocked or unmapped.
- **PREF-C06 — evidence isolation:** real, simulated, and sidecar fixtures retain their modes, and different namespaces cannot share candidate identity.
- **PREF-C07 — unknown fields:** unknown data remains raw/null with `unmapped` entries; no confidence, rationale, scope, or task signature is invented.

PR01B supplies fixtures and contract validation only. It does not implement the PR04 mapper, S6 ingestion, or Planner integration.

## Commands

```bash
pnpm build
pnpm test
node scripts/migrate_stage_a_candidates.ts --data .data/stage-a-w13-14 --backup .data/stage-a-w13-14-backup --endpoint http://127.0.0.1:9175/text-query --yes
```

Record commands, exact results, isolated evidence, relevant row/event IDs, and limitations in the PR description. Do not mark later acceptance scripts as passing.

## M0 / end-of-W13 preference checkpoint

Before PR04 preference work begins, the experienced reviewer and domain owner must:

1. Approve PREF-ADR-01–06, the cross-line S7/FactCandidate/live-query contract, the additive Planner hash contract, and privacy/retention behavior.
2. Verify PREF-C01–07 have explicit expected results and recorded test iterations.
3. Confirm no new relation, tool family, or automatic inference-promotion path was introduced.
4. Independently run PR01 tests and the full baseline. Any red or unclassified test blocks PR04.
5. Record the approved preference policy version and a sample envelope → FactCandidate → fact/read-query shape in `docs/stage-a-contracts.md`.

## Merge blockers

- Any missing or red test.
- Production data usage or an unreviewed schema replacement.
- Missing backup or rollback evidence.
- Changed historical IDs, bindings, R4, tool counts, or the 97-record boundary.
- Any contract requirement that remains an unrecorded open question.
- An unresolved preference authority, privacy, namespace, or cross-line contract decision.

## Change log

- **0.1.0 (2026-11-21):** Initial test plan. Test iteration 0; no acceptance claim. Add discovered scenarios using the template in `iterative-testing.md`.
- **0.2.0 (2026-11-22):** Added PREF-C01–07, the no-preference-relation migration assertion, and the M0/W13 contract checkpoint. Test iteration 0; no implementation or acceptance claim.
