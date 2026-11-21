---
lang: en
canonical: docs/phase4-acceptance.md
translation_of: docs/phase4-acceptance.zh-CN.md
translation_status: reviewed
source_commit: 7c71289
reviewed_at: 2026-11-19
---

# Phase 4 Original Baseline and Planner Increment Overall Acceptance

[中文版本](phase4-acceptance.zh-CN.md) · [Bilingual documentation policy](i18n.md)

- Date: 2026-11-19
- Status: **Phase 4 Repo acceptance passed and closed; v0.2.0 dual-host delivery completed (execution acceptance)**
- Versions: `package.json` / `dsh.plugin.json` are both `0.2.0`; the original seven memory-governance tools remain unchanged, and Bridge and Planner contracts are independent.
- Data boundary: full-batch, failure, and migration acceptance used isolated RocksDB instances. Real v0.2.0 host batches used isolated port 9173. Production 9070 was not used for writes or failure testing in this round.
- Machine evidence: `.data/phase4-csv-acceptance-result.json`, `.data/phase4-v02-host-acceptance-result.json`, `.data/phase4-v02-upgrade-retention-result.json`

## 1. Final closure scope

| Acceptance area | Result | Final evidence |
|---|---|---|
| A. Original baseline: CSV, HEA-Lens, closure/J, transient settlement, v0.2.0 dual host | Passed | Sections 2–5 of this document |
| B. P4-0 field authority, migration, and rollback | Passed | `docs/phase4-field-authority.md`; this round also migrated the old OpenCode database's lineage fields |
| C. OpenCode/DSH Planner and native Attention | Passed | `docs/phase4-opencode-acceptance.md`, `docs/phase4-dsh-acceptance.md` |
| D. Persistent inbox/outbox, lease, timer, stop, and recovery | Passed | `docs/phase4-scheduler-acceptance.md`; rerun on 2026-11-19 returned `gate=pass` |
| E. SuperAgent isolation probe and Sidecar Mapping | Passed | `docs/phase4-superagent-acceptance.md`, `docs/phase4-sidecar-acceptance.md`; this is not a production SuperAgent service claim |
| F. Daily memory and shared regression | Passed | `docs/phase4-memory-bridge-acceptance.md`, `docs/phase4-memory-stomp-acceptance.md`, `docs/memory-regression-acceptance.md` |
| G. P4-6 native STOMP and minimal NativeAdapter | Passed | `node scripts/phase4_memory_stomp_acceptance.ts` returned `gate=pass` on 2026-11-19 |

All items in the original Week 9–12 A–G checklist are now complete. Production SuperAgent adaptation, Phase 5/6, R4, and the complete MVP are outside this closure claim.

## 2. CSV → facts → closure → J lineage

Implementation:

- `src/runtime/csv-materials.ts`: maps generic S01 CSV and HEA-Lens input while preserving composition source text. It writes `composition / process / xrd_peak / hardness` and all five HEA-Lens source-fact families, including original `ref_delta`.
- `src/runtime/deriveClosure.ts`: adds the `entities` scope so each batch runs active rules only for its own entities rather than deriving unrelated facts across the database.
- Parsed facts are written through the original `memory_set_batch` service before active R1–R3 runs. Every derived ID must have an active justification; only then does output report `lineage_complete=true`.
- R4 is not registered and no `delta` is derived. `ref_delta` retains the original reference value and does not imply R4 recovery.

Repeatable entry point:

```bash
pnpm build
node scripts/phase4_csv_acceptance.ts
```

The real HEA-Lens file contains 1,540 rows. Execution went through the persistent outbox, followed by a RocksDB restart and verification:

| Item | Result |
|---|---:|
| Imported entities | 701 |
| HEA-Lens source facts | 3,502 |
| HEA-Lens R1/R3 derived facts | 1,402 |
| New active HEA-Lens J edges | 1,402 |
| S01 source facts | 5 |
| S01 R1–R3 derived facts / J edges | 3 / 3 |
| Total facts after restart, including S01 | 4,912 |
| Total active J edges after restart | 1,405 |
| `composition` | 702 |
| `candidate_solid_solution` / `smix` | 702 / 702 |
| `alloy_name` / `ref_smix` / `ref_delta` | 701 / 701 / 701 |
| `source_ref` | 698 |
| `delta` | 0 |

Idempotent replay returned `reused`, and every count remained unchanged after restart. S01 `phase_structure` has two XRD premises and an active R2 justification. Source `composition` rows have `lin_actor=parse_csv_materials` and `lin_version=materials-csv-v1`.

Key IDs:

- S01 planner event: `planner_event_b2c401c8ceb89838be503c070f65ead42298f95bc460c3e0d39293f4cf02d308`.
- S01 option event: `option_event_c8aa56392f0d8a1dec96e8b0be9ecb7fcc06807eed3e1568a54959f9ed01d5bf`.
- HEA-Lens planner event: `planner_event_bbaa210a3eead4455408ff8af9e14d58eabeb38c85075ba9c9355fdb70451676`.
- HEA-Lens option event: `option_event_6727da3c99232f265936bab8c10199e9c84b6c1f78e01ae26a865acb41839345`.
- HEA-Lens source SHA256: `541a08e8d1f7c20998323cb19273465a67c865daffb359161f1c06561bae3dc1`.

## 3. Transient settlement ledger

Implementation: `src/runtime/transient-settlement.ts` and `src/runtime/option-executor.ts`.

The ledger reuses the existing governance chain rather than creating a second statistics authority:

```text
Open: option_event
  → Record: input/output/error observations + option_event_outcome with actual duration and status
  → Settle: model_event(event_type=calibration, schema_version=transient-settlement-v0.1)
```

Each CSV settlement links `option_event_id / batch_id / option_id / model_id / option_type / template_id` and records execution success rate, fact acceptance rate, source/closure/J counts, parser/evidence mode, measured `duration_ms`, and `monetary_cost=null` when unknown. Success rate describes only this execution; it is not external correctness, certification, or a calibration conclusion. Derived statistics are not written back to main asset tables, preserving the event-authority rule in `docs/phase4-field-authority.md`.

- HEA-Lens settlement: `settlement_2b0fa98352617bc339df36a0ef38a82c4fafec0e9b5648aafd63ff616e3ca102`.
- The measured full-batch duration was 875 ms on this machine. This is a single observation, not a performance commitment.
- `getExecutionTrace` returns this execution's `modelEvents`; `getOptionEvidence` returns the Model's event evidence.
- Repeated execution reuses the deterministic settlement. If the settlement is deleted, replay restores it from persisted evidence without rerunning parsing or duplicating facts.
- Failed batches also receive a settlement with `success_rate=0`; unknown counts remain null.

`tests/transient-settlement.test.ts` covers success, failure, idempotency, and missing-settlement recovery.

## 4. Real v0.2.0 dual-host execution and data retention

Versions and compatibility:

- `package.json` and `dsh.plugin.json` are both `0.2.0`.
- The original seven tools remain unchanged. `memory_why / query_achievable / certify` were not registered early.
- The tested host versions were OpenCode 2.3.2 and DSH 0.2.2-rc.1. All three OpenCode plugins loaded successfully.
- The linked OptionMemory plugin in `materials-agent` was refreshed to this repository. DSH used an isolated 9173 patch and did not connect to production 9070.

Real OpenCode:

- Session: `ses_e0d4b8ebdffeXDDEopbP39fBDI`.
- Option event: `option_event_f5187ac105396696a64e68ab481c6334a18425f69bab1ce198250b738ab5f93d`.
- Settlement: `settlement_e51a6b793f78efe4768dba8326fd39887b04ba2276cd073e34ee11304a5b2a1d`.
- Log: `.data/phase4-v02-opencode-run.jsonl`. The real Planner call returned `gate=pass`, `status=success`, and `lineage_complete=true`.

Real DSH:

- Option event: `option_event_cceeeb93b448edd8582293a662897434854d79761298d68c5a963f24d27467dd`.
- Settlement: `settlement_f65e7ccade265433afd86dacc1703cfe1434f339c417dba61dd4d70d81bb8c01`.
- Log: `.data/phase4-v02-dsh-run.log`.
- The DSH model first made two blocked calls with an incorrect `planner_id`, then read the acceptance script and succeeded with `planner_s01`. Only the successful call created an Option execution. Intermediate failures were neither deleted nor counted as successes.
- OpenCode inserted five source facts and three derived/J records. DSH returned `skipped=5` and closure `skipped=3` for the same S01, proving shared facts and lineage without duplicate copies.

Old-database upgrade and retention:

- Pre-upgrade evidence: `.data/phase4-v02-pre-upgrade-acceptance-result.json`.
- Post-upgrade evidence: `.data/phase4-v02-post-upgrade-acceptance-result.json`.
- Deep comparison: `.data/phase4-v02-upgrade-retention-result.json`, with `gate=pass`.
- Original plan_runs, Planner decisions, Option traces, the real reviewer session, and cross-host stop states matched field by field.
- When the old OpenCode RocksDB lacked Option creation-lineage fields, it was backed up to `.data/phase4-v02-opencode-lineage-backup` before `PHASE4_FIELD_MIGRATION_PASS`. Both Option and Model retained two rows each. Final verification of `plan_run_phase4_opencode_s01_v10` passed; early failing plans were not mistaken for the final successful plan.

## 5. Full regression and shared acceptance

Final measured results:

```text
pnpm build: passed
pnpm test: 35 files, 128/128 tests passed
node scripts/phase4_csv_acceptance.ts: PHASE4_CSV_ACCEPTANCE_PASS
node scripts/phase4_v02_host_acceptance.ts --verify: gate=pass
node scripts/phase4_memory_acceptance.ts: gate=pass
node scripts/phase4_dsh_acceptance.ts --verify: gate=pass
node scripts/phase4_scheduler_acceptance.ts: gate=pass
node scripts/phase4_superagent_acceptance.ts: gate=pass
node scripts/phase4_sidecar_acceptance.ts: gate=pass
node scripts/phase4_memory_stomp_acceptance.ts: gate=pass
P4_PLAN_RUN_ID=plan_run_phase4_opencode_s01_v10 node scripts/phase4_opencode_acceptance.ts --verify: gate=pass
```

New tests:

- `tests/csv-materials.test.ts`: S01 R1–R3/J, HEA-Lens source text, `ref_delta`, R4 boundary, and idempotency.
- `tests/transient-settlement.test.ts`: real settlement, failed settlement, replay, and missing-settlement recovery.

The full CSV acceptance used `node scripts/apply_schema.ts` successfully on a fresh RocksDB instance. The historical `schema/apply_all.sh` issue is not declared fixed; `apply_schema.ts` remains the documented entry point.

The 9073 regression initially failed to start because an old process held the RocksDB LOCK. After a clean restart, the original acceptance passed without changing business assertions or skipping the check.

## 6. Closure boundaries and sign-off

Phase 4 does not imply:

- R4 is resolved, or that the 97 records awaiting source review have become independent certification evidence.
- A production SuperAgent service. Only the isolated compatibility probe exists.
- A general NativeAdapter, full-type tools, nested Options, automatic Skill generation, or compositional DAGs.
- `memory_why / query_achievable / certify`, generation certification, or RL-ready support; those belong to Phase 5–6.
- That CSV success rate represents external experimental correctness, capability certification, or actual monetary cost.

| Role | Conclusion | Date | Sign-off |
|---|---|---|---|
| Executor | Phase 4 original baseline and P4-0–P4-6 Repo acceptance A–G all passed; v0.2.0 dual-host delivery closed | 2026-11-19 | Kimi Code CLI |
| Sub-project 1 lead | Dual-host, parsing, upgrade, and data-retention review | | Pending |
| Sub-project 2 lead | Field migration, governance, scheduling, and recovery review | | Pending |
| Sub-project 3 lead | Evidence quality, R4, Sidecar, and daily-memory boundary review | | Pending |

This document records implementation and execution acceptance; it does not sign on behalf of sub-project owners.
