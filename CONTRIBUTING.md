# Contributing to OptionMemory

Start with the [development and acceptance guide](https://github.com/everyxs/OptionMemory/wiki/Development-and-Acceptance), the [Stage A ownership map](devNotes/stage-a/README.md), and the issue's specification. Repository code and actual acceptance evidence determine current behavior; roadmap documents describe planned behavior.

## Development setup

Install Node.js >=24.9.0, pnpm 11.7.0, Rust, and the C/C++ dependencies required by the RocksDB adapter. On Windows, set `LIBCLANG_PATH` to the directory containing `libclang.dll` when building the adapter. Then run:

```bash
pnpm install --frozen-lockfile
pnpm build
cargo build --manifest-path server/Cargo.toml --locked
pnpm test
```

Use isolated Mem/RocksDB storage and Markdown roots. Never run migration, crash, cancellation, or failure-injection tests against production `9070` or production data.

## Branch and pull request workflow

1. Confirm the issue status, dependencies, line ownership, and specification version.
2. Create a focused branch from an up-to-date `main`; do not commit implementation work directly to `main`.
3. Write fixtures and focused tests before implementation where behavior is known.
4. Run focused checks, the full build/test suite, and the issue's required integration, recovery, and real-host scenarios.
5. Record exact commands, results, test counts, actual row/event/evidence IDs, and limitations in the pull request.
6. Open a pull request using `Refs #N` and complete every section of the template.
7. Address review feedback through the same branch and rerun affected checks. Never weaken a test or governance gate to preserve a schedule.
8. Record post-merge `main` verification before closing the issue or moving its Project card to Done.

Line 1 and Line 2 do not cross-review. Once all three collaborators are active, the maintainer or third developer acts as the experienced reviewer, independently reproduces required checks, and approves eligible implementation PRs. Authors do not approve or merge their own implementation PRs.

## Small-team repository controls

The repository remains a personal repository with three collaborators; no organization migration, formal teams, or ownership matrix is needed. Give the two implementation developers Write access and the experienced reviewer only the additional Maintain access their duties require.

While `everyxs` is the only collaborator, branch protection requires pull requests and the `build-and-test` CI check but does not require an unavailable independent approval. When all three collaborators are active, require one independent approval for implementation PRs. Keep up-to-date branches, resolved conversations, and force-push/deletion blocks enabled. `CODEOWNERS` is optional and is not required for this three-person setup.

## Specification and evidence changes

Follow [iterative testing and change control](devNotes/stage-a/iterative-testing.md). Record spec versions, Change Logs, test iterations, and failure classifications. Changes to gates, evidence authority, tool counts, privacy/retention, public APIs, or cross-line contracts require experienced-review approval.

Do not use generated prose as acceptance evidence. Do not include production data, secrets, local databases, logs, backups, or unrelated generated files in commits. Keep `real`, `simulated`, and `sidecar` evidence distinct, and preserve historical IDs, J/≺, R4, and the 97-record quality boundary.

## Documentation

Follow [the bilingual documentation policy](docs/i18n.md). English is canonical for new development documents; update reviewed Chinese companions when behavior, scope, acceptance criteria, or non-goals change. Keep planned capabilities clearly distinct from implemented and accepted behavior.
