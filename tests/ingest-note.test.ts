import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MnesticClient } from "../src/memory/mnesticClient";
import { startRocksTestServer, type RocksTestServer } from "./rocksTestUtils";

const script = resolve("scripts/ingest_note.cjs");
const namespace = "project:ingest-note-test";
let server: RocksTestServer;
let client: MnesticClient;
let root: string;

function runIngest(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    env: {
      ...process.env,
      OPTIONMEMORY_ENDPOINT: server.endpoint,
      OPTIONMEMORY_MARKDOWN_ROOT: root,
      OPTIONMEMORY_NAMESPACE: namespace,
    },
    encoding: "utf8",
  });
}

beforeAll(async () => {
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellArgs = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm build"] : ["-c", "pnpm build"];
  execFileSync(shell, shellArgs, { stdio: "ignore" });
  server = await startRocksTestServer(9181);
  client = new MnesticClient({ endpoint: server.endpoint });
  root = await mkdtemp(join(tmpdir(), "ingest-note-test-"));
  await writeFile(join(root, "S01.md"), "# S01 experiment note\n\nS01 hardness is 512 HV.\n");
});

afterAll(async () => {
  if (server) await server.stop();
  if (root) await rm(root, { recursive: true, force: true });
});

describe("ingest_note.cjs", () => {
  it("ingests Markdown and replays idempotently through the real CLI", async () => {
    const first = runIngest(["S01.md", "s01-note-v1"]);
    expect(first.status).toBe(0);
    expect(first.stderr).toBe("");
    const firstResult = JSON.parse(first.stdout);
    expect(firstResult).toMatchObject({
      gate: "pass",
      reused: false,
      parser_version: "markdown-note-v2",
      raw_ref: "S01.md",
    });
    expect(firstResult.document_id).toMatch(/^document_/);
    expect(firstResult.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstResult.chunk_version_ids.length).toBeGreaterThan(0);

    const second = runIngest(["S01.md", "s01-note-v1"]);
    expect(second.status).toBe(0);
    const secondResult = JSON.parse(second.stdout);
    expect(secondResult).toMatchObject({
      gate: "pass",
      reused: true,
      document_id: firstResult.document_id,
      content_hash: firstResult.content_hash,
    });
    const documents = await client.listMemoryDocuments();
    expect(documents.rows).toHaveLength(1);
  });

  it("rejects missing arguments and paths outside the Markdown root", async () => {
    const missing = runIngest([]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("Usage: node scripts/ingest_note.cjs <path> <idempotency_key>");

    const outside = runIngest(["../outside.md", "outside-v1"]);
    expect(outside.status).toBe(1);
    const documents = await client.listMemoryDocuments();
    expect(documents.rows).toHaveLength(1);
    expect(await readFile(join(root, "S01.md"), "utf8")).toBe("# S01 experiment note\n\nS01 hardness is 512 HV.\n");
  });
});
