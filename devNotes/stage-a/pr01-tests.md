---
lang: en
canonical: devNotes/stage-a/pr01-tests.md
translation_status: reviewed
owner: Line 1 (migration) and Line 2 (evidence fixtures)
spec_version: 0.1.0
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

## Commands

```bash
pnpm build
pnpm test
node scripts/migrate_stage_a_candidates.ts --data .data/stage-a-w13-14 --backup .data/stage-a-w13-14-backup --endpoint http://127.0.0.1:9175/text-query --yes
```

Record commands, exact results, isolated evidence, relevant row/event IDs, and limitations in the PR description. Do not mark later acceptance scripts as passing.

## Merge blockers

- Any missing or red test.
- Production data usage or an unreviewed schema replacement.
- Missing backup or rollback evidence.
- Changed historical IDs, bindings, R4, tool counts, or the 97-record boundary.
- Any contract requirement that remains an unrecorded open question.

## Change log

- **0.1.0 (2026-11-21):** Initial test plan. Test iteration 0; no acceptance claim. Add discovered scenarios using the template in `iterative-testing.md`.
