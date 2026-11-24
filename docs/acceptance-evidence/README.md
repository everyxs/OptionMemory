# Auditable acceptance evidence

This directory makes acceptance outcomes auditable from the repository without committing gitignored `.data` databases, raw host logs, credentials, or absolute local source paths.

## What is included

The JSON files are sanitized copies of pre-existing machine-readable acceptance results. They preserve `gate`, `checks`, timestamps, and actual plan/event/document/fact identifiers needed for review.

| Artifact | Evidence covered |
|---|---|
| `phase4-v02-host-acceptance-result.json` | Real OpenCode and DSH CSV execution, closure/J lineage, transient settlement, seven-tool compatibility, and R4 remaining blocked. |
| `phase4-v02-upgrade-retention-result.json` | Upgrade retention comparison across decisions, traces, and cross-host stop states. |
| `phase4-memory-stomp-acceptance-result.json` | Native memory STOMP capture/revision/recall, refresh, stale mappings, adapter recovery, and sensitive filtering. |
| `phase4-csv-acceptance-result.json` | S01 and full HEA-Lens batch counts, transient settlement, restart retention, and idempotent replay. The absolute CSV path is redacted; its source hash is retained. |
| `bilingual-acceptance-result.json` | English-to-Chinese recall with the superseding `yarn` value and revision lineage. |
| `phase4-sidecar-acceptance-result.json` | Sidecar/raw crash recovery, evidence-mode isolation, observed zero reward, unknown/null handling, and no placeholder assets. |
| `phase4-superagent-acceptance-result.json` | Isolated SuperAgent probe only: deterministic start, delivery, attention/report callbacks, restart, and terminal stop. Not production SuperAgent integration. |
| `phase4-scheduler-acceptance-result.json` | Scheduler deduplication, lease recovery, outcome reconciliation, timers, dry-run, stop, and memory reuse. |
| `phase4-memory-acceptance-result.json` | Daily-memory capture, superseding revision, recall counts, and read-only Planner behavior. |

`manifest.json` records the original `.data` source path and SHA-256 for each result file, the CSV path redaction, and hashes of the raw host logs. The raw logs themselves are intentionally not committed.

## How to audit

1. Open the relevant result JSON and inspect `gate` and every entry in `checks`; all must be `true` for its recorded acceptance claim.
2. Compare actual IDs with the corresponding acceptance document in `docs/`.
3. Use `manifest.json` to verify the original result file or raw log locally, when available:
   ```bash
   sha256sum .data/<source-file>
   ```
   Compare the result with the source hash in the manifest. Do not send raw logs or databases into the repository.
4. Reproduce the scenario using the commands in the relevant acceptance specification instead of treating these copies as a new independent run.

## Current CI verification

`ingest-note-ci-result.json` records the successful GitHub Actions run for the Markdown ingestion CLI and scheduler lease-test synchronization: **38 test files / 137 tests passed**, commit `01c23db980cdabfd8c164312768b20cd461e883a`.

- [View the verified CI run](https://github.com/everyxs/OptionMemory/actions/runs/45319460987)
- [View the ingestion CLI and tests](../../scripts/ingest_note.cjs) and [`tests/ingest-note.test.ts`](../../tests/ingest-note.test.ts)

## Trust and privacy boundary

- These artifacts prove what was recorded by earlier acceptance runs; they are not a new independent acceptance claim.
- Raw host sessions, source databases, absolute local paths, credentials, and excluded content remain outside the repository.
- Phase 1 R4 remains blocked, and the 97 corrected records remain isolated pending source review.
- The SuperAgent result is an isolated compatibility probe, not production integration or a continuous service.
- Planned Stage A/B functionality is not accepted merely because planning documents or future test IDs exist.

For detailed host behavior, see the acceptance documents in `docs/`, especially `phase4-acceptance.md`, `phase4-opencode-acceptance.md`, `phase4-dsh-acceptance.md`, `phase4-memory-stomp-acceptance.md`, and `bilingual-acceptance.md`.
