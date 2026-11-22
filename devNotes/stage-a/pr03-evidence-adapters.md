---
lang: en
canonical: devNotes/stage-a/pr03-evidence-adapters.md
translation_status: reviewed
owner: Line 2
spec_version: 0.1.0
status: in_iteration
change_control: Follow iterative-testing.md
source_commit: ec6e40c
reviewed_at: 2026-11-21
---

# PR03: dataStore Semantic Evidence Adapters

## Objective

Map critical metadata from local evidence into the learning cycle without introducing a second MemoryCore or a bulk-mining pipeline. Initial sources are Markdown, SKILL.md, CSV/JSONL, and OpenCode/DSH trajectory exports. PR01 contracts and PR02 lifecycle are complete.

## Deliverables

- `src/datastore/evidence-envelope.ts` implementing S7 EvidenceEnvelope.
- Initial connectors for Markdown, SKILL.md, CSV/JSONL, and trajectory exports.
- Source-specific mappers into DocumentProjection, fact candidates, S1 candidates, and S8 evaluation packages.
- S6 controlled ingestion with source/snapshot refs, connector/mapping versions, hashes, evidence mode, and idempotency.
- `tests/datastore-evidence.test.ts`.

## Connector contract

Use this interface or an equivalent project-idiomatic form:

```ts
export interface RawEvidence {
  source_kind: SourceKind;
  source_ref: string;
  payload: unknown;
  observed_at: number;
  evidence_mode: EvidenceMode;
}

export interface EvidenceConnector {
  readonly kind: SourceKind;
  readonly version: string;
  read(input: {
    source_ref: string;
    namespace: string;
    idempotency_key: string;
    signal?: AbortSignal;
  }): Promise<RawEvidence>;
}

export interface EvidenceMappingResult {
  envelope: EvidenceEnvelope;
  document_projection?: unknown;
  fact_candidates?: unknown[];
  procedural_candidates?: unknown[];
  evaluation_package?: unknown;
  unmapped: string[];
}
```

Every mapper returns `unmapped` for unsupported fields. Never guess a missing task signature or promote evidence mode.

## Required mapping

| Source | Required mapping | Required negative behavior |
|---|---|---|
| Markdown | path → chunks, source_ref, content_hash, namespace | Reject traversal, unauthorized symlink, and secrets |
| SKILL.md | narrative → chunk; package → S1 candidate with package_hash=null | No execution or settled capability from file presence |
| CSV/JSONL | rows → fact candidates or observations with row-level source refs | Invalid rows identify row number; no bulk import into MemoryCore |
| Trajectory export | external IDs → existing subtask/Planner/Option/Model mappings | Keep `mode=sidecar`; unknown rationale/state remains null |
| State-changing run | pre/post observations and anticipation/critique/drift | Anticipated state cannot replace observed state |

## Envelope idempotency

Derive a deterministic hash over:

```text
source_kind | source_ref | content_hash | namespace | mapping_version
```

A changed file creates a new envelope version rather than silently mutating historical evidence. `package_hash` remains null until registration. `envelope_id` must remain stable across restart for identical input.

## Author self-tests

- **DS-01:** Markdown maps to chunks; assertions to fact candidates; SKILL.md to S1 candidates; trajectories to existing event mappings.
- **DS-02:** source paths, symlinks, namespaces, credentials, and sensitive paths are constrained.
- **DS-03:** pre/post state, anticipation, critique, and drift remain distinct.
- **DS-04:** real, simulated, and sidecar evidence never mix silently or become native real by import.
- **DS-05:** duplicate trajectories and learning/held-out leakage are rejected.
- **DS-06:** unknown fields remain raw/null; raw HTML/images/large JSONL stay outside MemoryCore.
- **DS-07:** no direct mnestic writes, no universal lossy schema, and no mandatory dataStore round trip for native STOMP.
- **DS-08:** identical connector input produces the same deterministic envelope and idempotency result after restart.

## Stop conditions

- Do not implement PR04 Learning Planner or PR05 acceptance.
- Do not turn parsed files into facts or Options directly.
- Do not import raw HTML/images/large JSONL into MemoryCore or invent missing metadata.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
