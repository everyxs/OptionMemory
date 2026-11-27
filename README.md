---
lang: en
canonical: README.md
translation_of: README.zh-CN.md
translation_status: reviewed
source_commit: 7c71289
reviewed_at: 2026-11-19
---

# OptionMemory

[中文说明](README.zh-CN.md) · [Bilingual documentation policy](docs/i18n.md)

OptionMemory is a memory and execution-governance system built on mnestic + RocksDB, with native OpenCode and DSH adapters.

A good first workflow is daily memory:

```text
Remember a project decision → recall it automatically in a new session → revise it → recall the new version
```

## 1. Requirements

- Node.js >= 24.9.0
- pnpm 11.7.0
- OpenCode 2.3.0 or DSH 0.2.2-rc.1
- RocksDB for persistent use; Mem is for tests only

## 2. Start in three steps

### 2.1 Install and build

```bash
pnpm install
pnpm build
```

### 2.2 Start MemoryCore

```bash
scripts/mnestic_start.sh --rocks --port 9070
```

The default endpoint is `http://127.0.0.1:9070/text-query`, and the default data directory is `.data/mnestic`.

### 2.3 Initialize the database

```bash
node scripts/apply_schema.ts
```

This applies all 13 relation groups in order. Existing relations and indexes are skipped, so the command is safe to rerun.

> After changing TypeScript, rerun `pnpm build`. Hosts load files from `dist/`.

## 3. OpenCode: first use

Enter the repository root—the directory containing `.opencode/` and `package.json`:

```bash
cd /path/to/optionmemory
# This repository, for example: cd E:\DSHprojects
```

The repository already includes the Planner and daily-memory plugins. Start the full interactive OpenCode interface from the repository root:

```bash
opencode --standalone --auto
```

Type the following prompts into the OpenCode interface, not into your shell. In **session A**, save a memory:

```text
Use bridge_capture to remember: this project uses pnpm for dependency management.
namespace=global, source_ref=session-a, idempotency_key=project-pnpm-v1.
```

Exit session A, then start **session B** by running `opencode --standalone --auto` again in the same working directory. Ask:

```text
Which package manager does this project use? Return the corresponding memory_uri.
```

Keep the same endpoint and namespace. Do **not** add `--continue` or `-c`; continuing the old session does not prove cross-session recall.

OpenCode automatically recalls the saved content and injects it as non-instructional reference material. For non-interactive automation, `opencode run --standalone --auto "<prompt>"` runs one prompt and creates a new session each time.

To revise the memory:

```text
Use bridge_revise to change the previous memory to “this project now uses yarn”.
Use the returned document_id as supersedes and project-yarn-v1 as idempotency_key.
```

The next query should return **yarn** and a new memory_uri. The old version remains `superseded`; neither the original Markdown nor `AGENTS.md` is modified.

### Ways to use OptionMemory

1. **Interactive OpenCode:** run `opencode --standalone --auto` and use natural language to capture, recall, or revise memories through `bridge_capture`, `bridge_recall`, and `bridge_revise`.
2. **Automatic or explicit recall:** ask a question in a new session for automatic context injection, or explicitly request `bridge_recall` when you need controlled query, namespace, history, and result-limit options.
3. **One-shot terminal commands:** use `opencode run --standalone --auto "<prompt>"` for scripts and non-interactive prompts.
4. **Through DSH:** use the same Bridge tools and MemoryCore from DSH. Memories and revision history can be shared across OpenCode and DSH.
5. **Advanced integrations:** use the structured fact and governance tools (`memory_set`, `memory_get`, `memory_query`, `memory_retract`, `propose_option`, `settle`, `revoke`), the custom Planner, or the host-neutral APIs under `src/api`.

OptionMemory does not define its own hotkeys or commands such as `/remember`. The following shortcuts control the OpenCode interface:

- **Enter** sends a prompt; **Shift+Enter** inserts a new line.
- **Ctrl+P** opens the command palette; typing `/` lists OpenCode slash commands.
- **Ctrl+X, then N** or `/new` starts a new session for cross-session recall.
- **Ctrl+X, then L** or `/sessions` lists and switches sessions.
- **Esc** interrupts the current response.
- **Shift+Tab** cycles agents; **Ctrl+X, then A** opens the agent selector.
- **Ctrl+Alt+K** toggles the keyboard-shortcut panel; **Ctrl+X, then Q** exits OpenCode.

### Planner execution

OptionMemory installs a custom primary agent named **`optionmemory-planner`**. This is different from OpenCode's built-in **`Plan`** agent, which is read-only and does not dispatch OptionMemory Options.

Run `/agents` and select `optionmemory-planner`, or press **Ctrl+X, then A** to open the agent selector. **Shift+Tab** cycles through agents.

The Planner operates on an existing `plan_run_id`; switching agents does not turn an arbitrary chat request into an executable plan. The subtask, subtask event, plan run, registered Planner, bound Options, and explicit mandate/scope/budget must already exist. `scripts/phase4_opencode_acceptance.ts` contains a concrete isolated setup example.

With a prepared run, ask:

```text
Inspect plan_run_id=<existing-id> using planner_context and planner_options.
Execute the appropriate allowed Option, inspect its outcome, and then replan or stop.
```

The execution flow is:

```text
planner_context / planner_options
→ planner_decision(execute)
→ OptionExecutor observation/outcome
→ planner_decision(replan / retry / ask / stop)
```

`planner_decision` also supports `decompose`, `wait`, and `ignore`. An `execute` decision dispatches a real, registered Option through `OptionExecutor`; it is not just textual planning. The Planner can use read-only `bridge_recall`, but cannot directly edit files, run shell commands, invoke subagents, capture/revise memories, or settle/revoke assets. Only permitted Options bound to the subtask can execute. See `docs/opencode-memory-guide.md` for the decision fields and full contract.

### Configuration

The default endpoint is 9070 and needs no additional configuration. To override it:

```bash
export OPTIONMEMORY_ENDPOINT='http://127.0.0.1:9070/text-query'
```

Runtime messages default to their previous language. To select Simplified Chinese instead, set:

```bash
export OPTIONMEMORY_LOCALE='zh-CN'
```

Machine identifiers and statuses remain unchanged. See `docs/i18n.md` and `docs/bilingual-acceptance.md`.

To inspect plugin loading:

```bash
opencode --standalone --print-logs --log-level debug debug agents
```

The original seven tools, Planner, and Bridge are independent tool families. See `docs/opencode-memory-guide.md`.

## 4. DSH: first use

Link this repository to a profile, adjusting the path for your checkout:

```bash
dsh plugin --profile materials-agent add /absolute/path/to/optionmemory
```

Run:

```bash
dsh --profile materials-agent --patch ./cordis.patch.yml "Use bridge_capture to remember: this project uses pnpm. namespace=global, source_ref=session-a, idempotency_key=project-pnpm-v1."
```

Use `bridge_recall` and `bridge_revise` to query and revise the same memory. OpenCode and DSH can share one MemoryCore and the same document/revision history.

## 5. Upgrade an existing database

For an older RocksDB instance, choose a new backup directory and run the lineage migration:

```bash
node scripts/migrate_phase4_fields.ts \
  --data .data/mnestic \
  --backup .data/my-lineage-backup \
  --endpoint http://127.0.0.1:9070/text-query \
  --yes
```

New Option creation-lineage fields remain `null` for old assets; they are not inferred from invocation history. Before and after migration, verify Option/Model IDs, bindings, facts, J/≺, and statuses.

Use the same command with `--rollback` to roll back. See `docs/phase4-field-authority.md`.

## 6. Verify the installation

```bash
pnpm test
```

The current baseline is **38 test files, 137/137 passing**, using isolated instances without a production 9070 service.

Run the Phase 4 full CSV, closure/J, transient-settlement, and RocksDB restart acceptance:

```bash
node scripts/phase4_csv_acceptance.ts
```

Run the daily-memory failure and recovery acceptance:

```bash
node scripts/phase4_memory_stomp_acceptance.ts
```

See `docs/phase4-acceptance.md` for the original Phase 4 baseline, P4-0–P4-6, real v0.2.0 dual-host execution, and upgrade-retention evidence. See `docs/phase4-memory-stomp-acceptance.md` for the daily-memory slice. For sanitized result artifacts, actual IDs, source hashes, and a verified CI result, see `docs/acceptance-evidence/README.md`.

## 7. Everyday Markdown examples

> pnpm and yarn below are examples only. This repository continues to use pnpm and `pnpm-lock.yaml`; no package-manager migration is required.

### Example 1: remember a project decision across sessions

`notes/project.md`:

```markdown
# Project decision

2026-11-17: This project uses pnpm for dependency management; do not mix npm into the workflow.
```

In session A:

```text
Remember this project decision with namespace=global, source_ref=session-a, and idempotency_key=project-pnpm-v1.
```

In session B:

```text
Which package manager should this project use? Include the memory source.
```

The expected answer is **pnpm**, with the corresponding memory_uri. The agent does not need to reopen `notes/project.md`.

**Self-learning extension (planned):** If several real tasks reuse the same decision, dataStore can map their task signatures and evidence into an observation context. The Learning Planner may then propose a subtask + Option + Model bundle and evaluate it on a later task. The decision remains non-instructional evidence, not an automatically learned preference or an `AGENTS.md` instruction.

### Example 2: use the new value after an experiment note changes

The three Bridge tools—capture, revise, and recall—do not read files directly. External Markdown must first be ingested through the controlled `memory_parse_markdown_note` Option. Every later Recall rereads the file and verifies its content hash; a changed file automatically produces a new version.

#### 2.1 Configure markdownRoot

In the repository-root `opencode.json`, declare the memory-bridge plugin with options. The `plugin` field supports `["path", options]` tuples:

```json
{
  "plugin": [
    [
      "./.opencode/plugins/optionmemory-memory-bridge.ts",
      { "markdownRoot": "notes", "namespace": "project:s01" }
    ]
  ]
}
```

- `markdownRoot`: the allowed Markdown root. When configured, `bridge_recall` and automatic session injection include `markdown_root`, and Recall refreshes ingested external documents from it. Relative paths resolve from the OpenCode launch directory, normally the repository root; absolute paths are also supported. Without it, Recall returns saved projections without refreshing files.
- `namespace`: the default namespace for Bridge tools and automatic injection. Use project-specific isolation, such as `project:s01`.

#### 2.2 Prepare an experiment note

`notes/S01.md`:

```markdown
# S01 experiment note

S01 hardness is 512 HV.
```

#### 2.3 Initial ingestion through the controlled parse Option

Initial ingestion is not a Bridge tool. It uses a controlled atomic Option (`pi_type=parse`, `pi_ref=markdown-note@v1`), registers Option/Model automatically, and creates a real execute decision. A minimal repository-local script can call the built artifact. It defaults to 9070 and honors `OPTIONMEMORY_ENDPOINT`:

```js
// scripts/ingest_note.cjs — usage: node scripts/ingest_note.cjs <path> <idempotency_key>
const { executeMemoryWrite } = require("../dist/api/memory-write-options.js");
const [path, idempotencyKey] = process.argv.slice(2);

executeMemoryWrite({
  operation: "parse",
  host_type: "opencode",
  namespace: "project:s01",
  source_ref: path,
  idempotency_key: idempotencyKey,
  arguments: { path, root: "notes", namespace: "project:s01" },
}).then((result) => console.log(JSON.stringify(result, null, 2)));
```

```bash
node scripts/ingest_note.cjs S01.md s01-note-v1
```

The result contains `gate=pass`, `document_id`, `chunk_version_ids`, and `content_hash`. The parser is read-only: it validates the root and symlinks, rejects traversal and excluded directories including `.git/.data/node_modules/dist/target/backups`, and never modifies the source.

#### 2.4 Recall

Ask “What is S01’s hardness?” in a new session for automatic injection, or call explicitly:

```json
{ "query": "S01 hardness", "namespace": "project:s01" }
```

The result contains 512 HV and `md://<document_id>#<chunk_version_id>`.

#### 2.5 Update the note and recall again

Change the file to:

```markdown
# S01 experiment note

S01 hardness was reviewed as 450 HV.
```

The next Recall—automatic or explicit, with `markdownRoot` configured—rereads the file and computes its content hash. An unchanged file reuses the previous parse. A changed file creates another execution through the same parse Option with idempotency key `recall-refresh:<document_id>:<content_hash>`. New chunks become current, old chunks become `mapping_stale`, and `allow_history=false` hides the old value by default. Bridge never edits your Markdown.

#### 2.6 Boundary

If an independent declarative `hardness(S01, "512 HV")` fact also exists, a document update does not automatically change it to 450 HV. Fact revision still requires the original revision/retract and evidence-governance path; narrative text cannot overwrite it by itself.

**Self-learning extension (planned):** The 512→450 transition can become Model evidence with `pre_state`, anticipated post-state, actual post-state, and invariants such as “parser leaves source file unchanged” and “no silent fact rewrite.” A changed source can trigger re-evaluation or drift handling for a learned Option, but independent declarative facts still require their own revision/ν-gate path.

### Example 3: historical experiment notes conflict with the current rule

#### 3.1 Configuration

Use the same `markdownRoot` and `namespace` as example 2 so Recall can match multiple ingested notes.

#### 3.2 Prepare the current rule and historical note

Current review conclusion, `notes/S01-review.md`:

```markdown
# S01 review conclusion (2026-11-18)

Record S01 hardness uniformly as 450 HV. The 512 HV measurement from 2025 is obsolete and retained only as background.
```

Historical note, `notes/archive/2025-hardness.md`:

```markdown
# 2025 hardness record

2025-03: S01 hardness was 512 HV.
```

Maintain the current rule yourself in `AGENTS.md`; do not ask the model to edit it. For example:

```markdown
Record S01 hardness using the reviewed value in notes/S01-review.md.
```

#### 3.3 Ingest both files

Run the controlled parse separately with different idempotency keys, reusing the script from example 2:

```bash
node scripts/ingest_note.cjs S01-review.md s01-review-v1
node scripts/ingest_note.cjs archive/2025-hardness.md s01-hardness-2025-v1
```

#### 3.4 Query and expected behavior

Ask “Which hardness value should S01 use now?”:

- Recall may return both the current review chunk and the historical chunk, each with a memory_uri and status.
- Current `AGENTS.md` and the review conclusion take precedence; the historical note is non-instructional background.
- If the historical note is not explicitly marked obsolete, Recall preserves its source and conflict information rather than silently selecting one account.
- The system does not revert to 512 HV because an old note was recalled, and it does not rewrite the historical note or `AGENTS.md`.

#### 3.5 Mark the old value obsolete

- Narrative layer: state explicitly in the review record that the old measurement is obsolete, while preserving the original historical text.
- Structured layer: if a `hardness(S01, ...)` declarative fact exists, revise it through the original revision/retract and evidence-governance path, not by overwriting text.

**Self-learning extension (planned):** Contradictory evidence should trigger re-evaluation, revision, or revocation of a learned bundle rather than reinforcement. Historical notes remain authoritative source text, while Model evaluation uses new held-out evidence to decide whether a current release is still applicable.

### Example 4: revise collaboratively across OpenCode and DSH

Save in OpenCode:

```text
This project uses pnpm. namespace=global, source_ref=session-a, idempotency_key=project-pnpm-v1.
```

Call `bridge_recall` in DSH to read the same pnpm memory and memory_uri. After confirming it, revise in DSH:

```text
Use bridge_revise to change this project to yarn.
Use the returned document_id as supersedes, namespace=global, and project-yarn-v1 as idempotency_key.
```

Ask again in a new OpenCode session. The expected answer is **yarn** with the new memory_uri. Both hosts share one document and superseding chain rather than creating separate copies.

**Self-learning extension (planned):** Continue learning across hosts only through native real STOMP evidence and stable source/revision IDs. A DSH revision can become held-out evidence for an OpenCode evaluation without duplicating memory or changing evidence mode. Sidecar histories remain separate and cannot independently certify the learned bundle.

### Example 5 (planned): from an existing Skill to passive self-learning

> This is a future extension, not an accepted current capability. Examples 1–4 above are accepted workflows; this example shows how an existing `pdf-to-latex` Skill could become a self-learning MVP without seed tasks.

Start with ordinary use, not a special training task:

1. **Use the Skill normally.** Convert `alpha.pdf` through the existing `pdf-to-latex` Skill. Do not create a synthetic seed task. STOMP records the real subtask/plan_run/execute decision, implementation version, observations, outcome, and pre/post state.
2. **Map the evidence.** dataStore maps the PDF and Skill package hashes, task signature, namespace, pre-state, and evidence mode into an S7 EvidenceEnvelope. This creates an observation context only; an installed Skill or one successful conversion is not a learned capability.
3. **Accumulate compatible evidence.** Convert other documents such as `beta.pdf` through the same normal workflow. Compare structure and invariants—unique output, original PDF unchanged, expected encoding, and no unauthorized writes. Do not generalize from one observation or fabricate missing state.
4. **Propose a bundle only after evidence is sufficient.** After two compatible native real observations, the Learning Planner may propose a full subtask + Option + Model bundle. An implementation-backed Option reuses the observed implementation or preserves its version lineage. A trajectory-level natural-language Option instead uses an immutable policy package with scope and expected/failure predicates. Neither is a generalized abstract Skill, and `approval_ref` remains null.
5. **Evaluate independently and fan out.** Use subsequent natural documents such as `gamma.pdf` and `delta.pdf`, or approved isolated runs, as disjoint held-out evidence. Before each authorized code or controlled host-inference execution, register every eligible hidden candidate's frozen effect specification. One execution can produce independent supporting, contradictory, or unresolved verdicts for several candidates, but cannot validate a distinct implementation or NL policy without its own approved native execution. Record an S8 LearningRun with expected and actual post-state, independent evidence, and `generator_score=null`.
6. **Govern the result.** Only after approval and compliant real evaluation does the registration gate admit the bundle. `planner_options` may list both fulfillment kinds, and `planner_decision.execute(option_id)` passes either through Decision Gate. An NL Option cannot directly invoke tools; downstream tool/code actions require another authorized decision. Fixed Horn/provenance rules propagate only explicit dependency/eligibility consequences, never independent support, canonical facts, or execution authority. Changed source structure or contradictory results trigger re-evaluation, revision, demotion, or revocation rather than reinforcement.

Planned boundaries: no arbitrary implementation or generalized abstract-skill generation, no automatic `AGENTS.md` edit, no direct mnestic writes, no sidecar-as-real evidence, no arbitrary active Horn rules, and no claim that an existing Skill is learned or certified merely because it exists. See `devNotes/stage-a/concrete-learning-tests.md` and `devNotes/stage-a/procedural-options-tests.md` for the planned acceptance matrix at spec 0.5.0.

## 8. Current boundaries

- The Phase 4 original baseline, full HEA-Lens parsing, transient settlement, v0.2.0 dual-host upgrade, and overall acceptance are closed; see `docs/phase4-acceptance.md`. Phase 1 R4 remains blocked.
- The current NativeAdapter is minimal. Full-type tools, nested Options, and automatic Skill generation are not promised.
- External trajectories can be imported through Sidecar with `mode=sidecar`, kept separate from native real evidence; see `docs/sidecar-mapping-v0.1.md`.
- Production SuperAgent adaptation, `memory_why`, `query_achievable`, `certify`, and compositional DAGs are not yet available.

More documentation:

- `docs/i18n.md`: bilingual documentation and runtime-localization policy.
- `docs/opencode-memory-guide.md`: complete OpenCode guide.
- `docs/mnestic-api-cheatsheet.md`: mnestic queries and transactions.
- `devNotes/Week9-12开发手册-多源解析与可靠调度.md`: Phase 4 implementation and acceptance checklist.
