# Contributing to OptionMemory

Start with the [development and acceptance guide](https://github.com/everyxs/OptionMemory/wiki/Development-and-Acceptance), the [Stage A ownership map](devNotes/stage-a/README.md), and the issue's specification. Repository code and actual acceptance evidence determine current behavior; roadmap documents describe planned behavior.

## Development setup

Install Node.js >=24.9.0, pnpm 11.7.0, Rust, and the C/C++ dependencies required by the RocksDB adapter. On Windows, set `LIBCLANG_PATH` to the directory containing `libclang.dll` when building the adapter. Then run:

```bash
pnpm install --frozen-lockfile
pnpm build
CARGO_TARGET_DIR="$PWD/target" cargo build --manifest-path server/Cargo.toml --locked
pnpm test
```

Use isolated Mem/RocksDB storage and Markdown roots. Never run migration, crash, cancellation, or failure-injection tests against production `9070` or production data.

The current regression baseline is **38 test files / 137 tests**. It grows with each merged increment; do not replace the baseline or treat its existence as proof of planned functionality.

## Project workflow

Use one lightweight cycle for every work package:

```text
Issue → focused branch → author verification → pull request
→ experienced review → merge → post-merge acceptance
```

Issues and specifications define the work. The [Delivery Project](https://github.com/users/everyxs/projects/2) mirrors its status. CI and acceptance evidence determine completion; a card or roadmap date alone proves nothing.

### Roles

For the three-collaborator setup:

- **Line 1 developer:** lifecycle, Learning Planner, runtime, and Planner preference context.
- **Line 2 developer:** evidence, dataStore, semantic mappings, recall/lineage, and preference evidence.
- **Experienced reviewer:** contract review, independent reproduction, approval, and merge. The maintainer or third developer can fill this role.

Line 1 and Line 2 self-test their own work but do not cross-review. Once all three collaborators are active, authors do not approve or merge their own implementation PRs.

### Project status model

| Status | Meaning |
|---|---|
| **Blocked** | Dependencies, scope, access, or an unresolved contract prevents a safe start. |
| **Ready** | Scope, owner, dependencies, specification, tests, and non-goals are clear enough to begin. |
| **In progress** | Implementation and specification refinements are happening on a focused branch. |
| **Author self-test** | The author is running required checks and assembling actual evidence. |
| **In review** | The experienced reviewer is independently checking the PR and evidence. |
| **Changes requested** | Review found work that must be addressed and retested on the same branch. |
| **Done** | The PR is merged, post-merge verification passed, and the issue is closed. |

Dependency checkboxes are coordination aids, not automatic proof. Confirm prerequisite issues were actually merged and accepted before moving a card out of Blocked.

### 1. Prepare the issue and branch

Before starting:

- Confirm the objective, owner, dependencies, deliverables, tests, and non-goals.
- Confirm the current specification version and required acceptance evidence.
- Resolve any contract ambiguity before changing code.
- Move the Project card from **Ready → In progress**.

Create a focused branch from current `main`:

```bash
git switch main
git pull --ff-only origin main
git switch -c <work-package-short-name>
```

Keep the branch within one issue and one ownership area. Do not mix unrelated features, generated files, local databases, logs, backups, or secrets into it.

### 2. Develop and verify locally

Write fixtures and focused tests before implementation where behavior is known. Expected-failure tests guide development but must not remain red at merge. Record specification versions, Change Logs, test iterations, and failure classifications instead of silently changing expectations.

Run focused checks first, then the full build/test sequence from [Development setup](#development-setup). Also run every isolated Mem/RocksDB, migration, recovery, and real-host scenario required by the issue.

Move the card to **Author self-test** while assembling:

- Exact commands and results.
- Current test-file and test counts.
- Actual row/event/evidence IDs and isolated-environment details.
- Real-host evidence where model-visible behavior changed.
- Specification version, test iterations, and explicit limitations.

### 3. Open the pull request

Use `Refs #N`, not `Closes #N`, until post-merge verification is complete. Fill in every section of the PR template.

Before moving the card to **In review**, confirm:

- The branch contains only intended files.
- The `build-and-test` CI check is green.
- The full old and new test suite passes locally.
- The PR explains scope, ownership, evidence, and limitations.
- Required specification and companion-document updates are included.

A green unit suite does not replace isolated integration, recovery, migration, or real-host acceptance.

### 4. Address experienced review

The experienced reviewer independently reproduces required checks, approves eligible work, and merges it. Generated prose alone is not acceptance evidence.

If changes are requested:

1. Move the card to **Changes requested**.
2. Resolve disputed contracts before changing implementation semantics.
3. Commit fixes to the same branch; do not hide history with a replacement PR.
4. Update the specification and Change Log if the approved understanding changed.
5. Rerun affected checks and record new evidence.
6. Return through **Author self-test → In review**.

Never weaken a test or governance gate to preserve a schedule.

### 5. Merge and close

After the reviewer merges:

1. Verify `main` build/tests and all required acceptance.
2. Record the merge SHA, commands, results, and evidence links.
3. Close the issue only after every completion criterion is satisfied.
4. Move the Project card to **Done**.
5. Confirm dependency completion before moving eligible cards from **Blocked → Ready**.
6. Update your local `main` with `git pull --ff-only origin main`.

## Definition of Done

A work package is complete only when all applicable statements are true:

- [ ] The issue is linked and scope/ownership was respected.
- [ ] New behavior has focused tests and relevant negative cases.
- [ ] The entire existing suite plus new tests is green.
- [ ] Required isolated integration, migration, recovery, and real-host evidence exists.
- [ ] Specifications, Change Logs, wiki pages, and related documentation are consistent.
- [ ] Actual IDs, commands, results, limitations, and non-goals are recorded.
- [ ] The experienced reviewer approved and merged once independent review is active.
- [ ] Post-merge `main` verification passed before the issue was closed.

A red or unclassified test blocks the next tier and merge. Never present planned tests, unexecuted scripts, or generated prose as passing acceptance.

## Roadmap and review cadence

Use milestones to organize acceptance, not to imply completion by date.

During development, update the Project at each status transition. Review blockers, dependencies, and unclassified failures weekly. At the end of each sprint, run integration and real-host acceptance, inspect actual evidence, and perform the experienced review.

Move unfinished work intentionally rather than relabeling it as complete. Use tags/releases only after their required acceptance has passed. Keep **planned**, **implemented**, and **accepted** clearly distinct.

## Small-team repository controls

The repository remains a personal repository with three collaborators; no organization migration, formal teams, or ownership matrix is needed. Give the two implementation developers Write access and the experienced reviewer only the additional Maintain access their duties require.

CI runs on pushes and pull requests. Branch protection is **not currently enabled**, so maintainers should use a green `build-and-test` result as the manual merge criterion. If protection is enabled while `everyxs` is the only collaborator, require pull requests and the `build-and-test` check without an unavailable independent approval. When all three collaborators are active, require one independent approval for implementation PRs. Up-to-date branches, resolved conversations, and force-push/deletion blocks are recommended when protection is enabled. `CODEOWNERS` is optional and is not required for this three-person setup.

## Specification and evidence changes

Follow [iterative testing and change control](devNotes/stage-a/iterative-testing.md). Record spec versions, Change Logs, test iterations, and failure classifications. Changes to gates, evidence authority, tool counts, privacy/retention, public APIs, or cross-line contracts require experienced-review approval.

Do not use generated prose as acceptance evidence. Do not include production data, secrets, local databases, logs, backups, or unrelated generated files in commits. Keep `real`, `simulated`, and `sidecar` evidence distinct, and preserve historical IDs, J/≺, R4, and the 97-record quality boundary.

## Documentation

Follow [the bilingual documentation policy](docs/i18n.md). English is canonical for new development documents; update reviewed Chinese companions when behavior, scope, acceptance criteria, or non-goals change. Keep planned capabilities clearly distinct from implemented and accepted behavior.
