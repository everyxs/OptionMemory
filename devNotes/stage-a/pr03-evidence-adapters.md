---
lang: en
canonical: devNotes/stage-a/pr03-evidence-adapters.md
translation_status: reviewed
owner: Line 2
spec_version: 0.3.0
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

## Unified observation validation and classification

All real observations may enter authority, privacy, namespace, and evidence-mode validation. Only validated, relevant observations produce candidates. Authorized non-personal operational evidence may be collected passively without an additional opt-in. Personal or behavioral evidence requires opt-in and a stable `principal_id` before persistent observation, candidate storage, or raw-payload retention; pre-consent processing is transient.

Line 1's PR03A native/STOMP linkage must preserve actor, source event, namespace, principal ID where applicable, consent state, evidence mode, and idempotency through existing host/subtask/Planner/Option chains. Native activity does not require a dataStore round trip, and personal evidence cannot be persisted before consent.

Line 2's PR03B mappers use the PR01 `ObservationPattern` payload and return:

```text
classification = declarative | procedural | mixed | unknown | insufficient
classifier_version = approved deterministic version
fact_candidates = declarative components, when validated
procedural_candidates = S1 components, when validated
unmapped = unsupported or unsafe fields
```

Declarative memories extend beyond preferences to assertions, corrections, recurring context, and other governed facts. Mixed observations produce separate declarative and S1 components with shared source references but independent authority. Unknown or insufficient patterns remain unmapped or return `need_more_evidence`; never invent a classification, confidence, scope, or task signature. The initial classifier is deterministic and records its version and evidence references.

### Required observation mappings

| Input | Required behavior |
|---|---|
| Authorized non-personal operational observation | Validate without an unnecessary consent prompt; map only relevant fields and preserve evidence mode. |
| Personal/behavioral observation | Require opt-in and `principal_id` before persistence; denied/missing consent produces no stored observation/candidate/raw payload. |
| Non-preference declarative assertion/context | Map to FactCandidate through the existing declarative lane, never a preference-only type. |
| Procedural pattern | Map to S1 candidate only when the full required bundle metadata is available; file/activity presence alone is insufficient. |
| Mixed pattern | Produce separate FactCandidate and S1 components with shared source refs and no shared authority. |
| Unknown/insufficient pattern | Return unmapped or `need_more_evidence`; only a later bounded clarification prompt may supply missing evidence. |

### Additional author self-tests

- **DS-09:** every supported real-observation fixture can enter validation without being forced into a candidate, and real/simulated/sidecar modes remain separate.
- **DS-10:** authorized non-personal evidence needs no extra opt-in, while denied/missing personal consent or `principal_id` creates no persistent observation, candidate, raw payload, or projection.
- **DS-11:** non-preference declarative, procedural, and mixed patterns map to the specified candidate components with source refs and no shared authority.
- **DS-12:** unknown/insufficient patterns remain unmapped or return `need_more_evidence`; no classification, rationale, confidence, scope, or task signature is invented.
- **DS-13:** identical input and classifier version produce deterministic envelope/candidate IDs after restart; replay creates no duplicates.
- **DS-14:** sensitive fields and prompt-injection text remain non-instructional and excluded, with no direct mnestic writes or combined declarative/procedural admission gate.

## Stop conditions

- Do not implement PR04 Learning Planner or PR05 acceptance.
- Do not turn parsed files or real observations directly into facts or Options.
- Do not persist personal evidence without opt-in or force every observation into declarative/procedural classification.
- Do not import raw HTML/images/large JSONL into MemoryCore or invent missing metadata.

## Change log

- **0.1.0 (2026-11-21):** Initial specification. Test iteration 0; no acceptance claim. Refine only through `iterative-testing.md` with classified results and linked evidence.
- **0.3.0 (2026-11-23):** Added unified observation validation, consent/identity requirements, deterministic declarative/procedural/mixed/unknown classification, and DS-09–14. No implementation or acceptance claim.
