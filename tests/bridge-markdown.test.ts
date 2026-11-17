import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { getDocumentProjection, linkFactToChunk } from "../src/api/document-projections";
import { memory_set, setMemoryClient } from "../src/api/memory";
import { parseMarkdownNote, parseMarkdownText } from "../src/bridge/markdown/parser";
import { MnesticClient } from "../src/memory/mnesticClient";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
let root: string;

beforeAll(async () => {
  setMemoryClient(client);
  root = await mkdtemp(join(tmpdir(), "memory-bridge-"));
  await writeFile(join(root, "project.md"), "# 项目决策\n\n使用 pnpm 管理依赖。\n\n## 实验\n\nS01 硬度为 512 HV。\n");
});

describe("Markdown ingestion and source mappings", () => {
  it("parses chunks and candidates without changing source text", async () => {
    const projection = parseMarkdownText("# A\n\n决定使用 pnpm。\n", "a.md", "project:a");
    expect(projection.chunks).toHaveLength(1);
    expect(projection.fact_candidates[0].text).toContain("pnpm");
    const first = await parseMarkdownNote({ path: "project.md", root, namespace: "project:a" });
    expect(first).toMatchObject({ reused: false, parser_version: "markdown-note-v1", chunk_count: 2 });
    const second = await parseMarkdownNote({ path: "project.md", root, namespace: "project:a" });
    expect(second).toMatchObject({ document_id: first.document_id, reused: true });
    const stored = await getDocumentProjection(first.document_id);
    expect(stored?.chunks).toHaveLength(2);
  });

  it("marks old mappings stale after external edits and preserves fact source links", async () => {
    const first = await parseMarkdownNote({ path: "project.md", root, namespace: "project:a" });
    const stored = await getDocumentProjection(first.document_id);
    const experimental = stored!.chunks.find((chunk) => chunk.heading_path.includes("实验"))!;
    const fact = await memory_set({
      predicate: "hardness", args: ["S01", "512 HV"], claim: "hardness(S01,512 HV)", layer: "knowledge",
      jPremiseIds: [], epsType: "in-degree", epsValue: 0.5, epsSource: "inferred-prior",
      linSource: "bridge-fixture", linVersion: "1.0", linActor: "vitest", verify: "fixture", status: "in",
    });
    expect((await linkFactToChunk({ fact_id: fact.id, chunk_version_id: experimental.chunk_version_id })).gate).toBe("pass");
    await writeFile(join(root, "project.md"), "# 项目决策\n\n改用 yarn 管理依赖。\n\n## 实验\n\nS01 硬度为 450 HV，等待复核。\n");
    const changed = await parseMarkdownNote({ path: "project.md", root, namespace: "project:a" });
    expect(changed.reused).toBe(false);
    const updated = await getDocumentProjection(first.document_id);
    expect(updated?.chunks.some((chunk) => chunk.chunk_version_id === experimental.chunk_version_id && chunk.mapping_status === "stale")).toBe(true);
    expect(updated?.document.content_hash).not.toBe(first.content_hash);
    expect(updated?.chunks.filter((chunk) => chunk.mapping_status === "current")).toHaveLength(2);
  });

  it("rejects excluded paths and sensitive capture content", async () => {
    await expect(parseMarkdownNote({ path: "../outside.md", root, namespace: "project:a" })).rejects.toThrow("outside");
    await expect(parseMarkdownNote({ path: ".data/secret.md", root, namespace: "project:a" })).rejects.toThrow("excluded");
  });
});
