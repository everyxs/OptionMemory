---
lang: en
canonical: docs/bilingual-acceptance.md
translation_status: reviewed
source_commit: 7c71289
reviewed_at: 2026-11-19
---

# Bilingual Extension Acceptance

- Date: 2026-11-19
- Release: `0.2.1`
- Status: **Passed for documentation companions, localized messages, bilingual extraction and R3 validation, versioned bilingual recall, and real OpenCode/DSH cross-language revision**
- Data boundary: isolated RocksDB on 9174 for real-host checks; production 9070 was not used

## Delivered behavior

- English is canonical for new development documentation; Chinese companion files and incremental migration conventions are defined in `docs/i18n.md`.
- `OPTIONMEMORY_LOCALE=en` and `zh-CN` select localized human-readable messages while machine identifiers and statuses remain unchanged.
- Existing default behavior is preserved: English errors remain English by default, and existing Chinese R3 findings remain Chinese by default.
- Markdown extraction recognizes both languages with `parser_version=markdown-note-v2`; the controlled implementation reference remains `markdown-note@v1`.
- R3 claim validation detects unsupported English and Chinese claims without weakening the 604/97 evidence separation.
- Recall uses `keyword-recall-v2`, a language-aware token estimator, and the strategy version in its cache key.
- Scoped term mappings support tested cross-language queries including `hardness ↔ 硬度`, `composition ↔ 成分`, `phase structure ↔ 相结构`, and `package manager ↔ 包管理器`.
- Stored user content is not translated, and unchanged sources retain their content hashes and document/revision identities.

## Automated and shared regression

```text
pnpm build: passed
pnpm test: 37 files, 135/135 tests passed
node scripts/phase4_csv_acceptance.ts: PHASE4_CSV_ACCEPTANCE_PASS
node scripts/phase4_memory_stomp_acceptance.ts: gate=pass
node scripts/phase4_memory_acceptance.ts: gate=pass
node scripts/bilingual_acceptance.ts --verify-initial: gate=pass
node scripts/bilingual_acceptance.ts --verify: gate=pass
```

New coverage:

- `tests/bilingual-runtime.test.ts`: bilingual extraction, locale selection, token estimation, and English/Chinese R3 claims.
- `tests/bilingual-recall.test.ts`: scoped cross-language recall, cache reuse, English revision recalled through Chinese, namespace isolation, and token budgets.

## Real OpenCode evidence

### Session A: Chinese capture

- Session: `ses_e0bec734effejkw2KJFvEXZh8v`.
- Captured text: `本项目使用 pnpm 作为包管理器。`
- Document: `document_13a9712a21327c935fcf3be4bd14dca51003fe8f736ac31d670ab887e58d3adf`.
- Log: `.data/bilingual-opencode-a.jsonl`.

### Session B: English query

- Session: `ses_e0beba87dffe2uPFkhTvf9Ai4x`.
- Query: `Which package manager does this project use?`
- Returned **pnpm** and `md://document_13a9712a21327c935fcf3be4bd14dca51003fe8f736ac31d670ab887e58d3adf#chunk_version_b4a83ae828499088ac747a0eb4fb02c6267596e1351b5dea2a8bc2f1a4f80503`.
- Recall: `recall_5da28fda0e8898f6af490e37bd04924de5220825eba9f61d2a97307416d4359c`, strategy `keyword-recall-v2`.
- Log: `.data/bilingual-opencode-b.jsonl`; machine check: `.data/bilingual-initial-result.json`.

The model also inspected `package.json`; the acceptance assertion uses the returned memory and URI rather than treating that file read as recall evidence.

## Real DSH evidence

### Session C: English revision

- Revised text: `This project now uses yarn as its package manager.`
- New document: `document_6aec89c137fd1ee58c4a94e7a7af70bd23c44eaa7b09544ac3e295a7550a2fc0`.
- `supersedes`: `document_13a9712a21327c935fcf3be4bd14dca51003fe8f736ac31d670ab887e58d3adf`.
- Log: `.data/bilingual-dsh-c.log`.

### Session D: Chinese query

- Query: `包管理器`.
- Returned **Yarn** with status `active` and `md://document_6aec89c137fd1ee58c4a94e7a7af70bd23c44eaa7b09544ac3e295a7550a2fc0#chunk_version_fb0209ce7cac98fb6e1a839d49e3eeac13144e8df2f39c5ef4bc25ee80a4a1f5`.
- Recall: `recall_5e1fb62b564ecbc3c7484173b725015a41adc0736dbd0542bd0606a117b8eac4`, strategy `keyword-recall-v2`.
- Original document is `superseded`; the revised document is `active` and points to the original. No duplicate active pnpm memory is returned.
- Log: `.data/bilingual-dsh-d.log`; machine check: `.data/bilingual-acceptance-result.json`.

## Boundaries

- Cross-language recall is guaranteed only for the explicitly mapped and tested vocabulary, not general multilingual semantic search.
- Current embeddings remain non-semantic placeholders; no multilingual embedding or certification claim is made.
- Existing stored facts, captured memories, source files, historical acceptance logs, and IDs were not translated.
- Remaining Chinese documents migrate incrementally as they are reviewed; the repository is not claimed to be fully translated.
