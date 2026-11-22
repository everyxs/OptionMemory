---
lang: en
canonical: devNotes/stage-a/iterative-testing.md
translation_status: reviewed
source_commit: ec6e40c
reviewed_at: 2026-11-21
---

# Iterative Tests and Specification Refinement

Specifications are living drafts, not immutable contracts. Tests may reveal missing details, wrong assumptions, or new edge cases. Refine both implementation and specifications through recorded iterations rather than treating either as fixed.

## Iteration loop

```text
spec draft
→ fixtures and expected-failure tests
→ implementation
→ focused test result
→ classify the result
→ update implementation, fixture, and/or spec
→ rerun focused tests
→ run full regression and acceptance
→ record a new spec version and evidence
→ review and merge
```

A red test is information, not something to hide. Do not change an expectation simply to make the current implementation pass.

## Failure classification

| Result | Meaning | Required action |
|---|---|---|
| Expected failure | The behavior is intentionally not implemented or is invalid | Implement the behavior or prove the negative case, then rerun |
| Implementation bug | Code violates a valid spec/invariant | Fix implementation, keep spec and expected result |
| Fixture bug | Fixture does not represent the intended task or contains wrong test data | Correct fixture and document why; do not change governance semantics to accommodate it |
| Spec ambiguity | Expected behavior is unclear or incomplete | Add a scenario, clarify the spec section, and rerun before broadening implementation |
| Changed understanding | Evidence shows an assumption was wrong | Record old/new behavior and rationale, update spec version, and obtain required review |
| Environmental failure | Service, port, stale lock, dependency, or host-version problem | Fix environment without changing business assertions; rerun cleanly |

When uncertain, classify before changing anything. A failing test does not automatically mean the test is wrong.

## Spec change control

Allowed within invariants after recording rationale and evidence:

- Additional fixtures and negative cases.
- More precise error types, reason codes, and validation behavior.
- Implementation-specific naming, decomposition, and performance improvements.
- Clarified examples and expected output shapes that do not alter authority or authorization.

Require experienced reviewer approval before changing:

- Registration/Decision Gate semantics or approval requirements.
- Evidence authority, source ownership, or real/simulated/sidecar classification.
- Tool counts, host tool families, R4, or the 97-record quality boundary.
- Held-out independence and generator-self-score prohibitions.
- Namespace/privacy/retention rules or production-data boundaries.
- The no-forced-seed rule, direct mnestic-write prohibition, or `AGENTS.md` non-modification rule.
- New asset families, public APIs, or cross-line contracts.

If a change would weaken a red line, stop rather than editing the spec to permit it.

## Writing tests when details are still uncertain

Start with invariants before exact values:

- Candidate has no execution entitlement before approval.
- No duplicate record appears after replay.
- No direct mnestic write occurs.
- Original source and historical IDs remain unchanged.
- Expected and actual state remain distinct.
- Evidence mode does not change on import.

Replace broad expectations with concrete values only after real evidence supports them. Do not invent confidence, success rate, world state, or a precise metric to make a test look complete.

For newly discovered behavior, add a focused test and link it to the spec section rather than silently expanding implementation scope.

## New scenario template

Copy this template into the owning test plan and fill it during the iteration:

```text
ID: <LINE|DS|LRN|MIG>-<number>
Owner: Line 1 / Line 2
Hypothesis: <behavior or edge case being tested>
Given: <source, namespace, initial state, and evidence mode>
When: <one action or failure injection>
Expected: <observable invariant and negative conditions>
Actual: <result before the change>
Classification: expected failure / implementation bug / fixture bug / spec ambiguity / changed understanding / environmental failure
Spec change: <file, section, old behavior, new behavior, rationale>
Regression proof: <focused test, full suite, acceptance, restart/recovery evidence>
Review: <reviewer decision and unresolved follow-ups>
```

A new scenario is not complete until expected and actual evidence is recorded and any spec change has a reason.

## Iteration tiers

1. **Fixture/unit:** fast validation of shapes, invariants, and negative cases.
2. **Isolated Mem integration:** contract behavior and gate semantics without production data.
3. **RocksDB:** migration, rollback, restart, retention, and idempotency.
4. **Real host:** model-visible capture, recall, revision, and Planner behavior when affected.
5. **Independent reproduction:** experienced reviewer repeats acceptance and verifies spec change history.

Do not broaden to the next tier while the current tier is red or its failure is unclassified.

## Version and evidence requirements

Each specification must maintain:

- `spec_version`, initially `0.1.0`.
- A Change Log with date, author, test scenario, reason, and evidence links.
- Test iteration number and current status: `draft`, `in_iteration`, or `accepted`.

Use a patch increment for clarified behavior without contract change, a minor increment for backward-compatible additions, and reviewer-approved major changes for contract changes. No version number implies implementation acceptance by itself.

The final PR must include the spec version used, test iterations performed, and why each expectation changed—or an explicit statement that no expectation changed.
