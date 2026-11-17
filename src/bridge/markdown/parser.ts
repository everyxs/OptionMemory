import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { ingestDocumentProjection, MARKDOWN_PARSER_VERSION } from "../../api/document-projections";
import type { ChunkProjectionInput, DocumentProjectionInput } from "../../memory/document-projections";

const EXCLUDED_SEGMENTS = new Set([".git", ".data", "node_modules", "dist", "target", "backups"]);

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function safeRelativePath(root: string, candidate: string): string {
  const path = relative(root, candidate);
  if (!path || path.startsWith("..") || path.includes("\0")) throw new Error("Markdown path is outside the allowed root");
  const segments = path.split(/[\\/]/);
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) throw new Error("Markdown path is in an excluded directory");
  return path;
}

export function parseMarkdownText(text: string, rawRef: string, namespace: string): DocumentProjectionInput & {
  fact_candidates: Array<{ text: string; heading_path: string }>;
} {
  const body = text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const lines = body.split(/\r?\n/);
  const headings: string[] = [];
  const chunks: Array<ChunkProjectionInput & { text: string }> = [];
  let buffer: string[] = [];
  let headingPath = "Document";
  let ordinal = 0;
  const flush = () => {
    const value = buffer.join("\n").trim();
    buffer = [];
    if (!value) return;
    for (let offset = 0; offset < value.length; offset += 4000) {
      const textPart = value.slice(offset, offset + 4000);
      chunks.push({
        heading_path: headingPath,
        ordinal: ordinal++,
        content_hash: hash(textPart),
        text: textPart,
      });
    }
  };
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      headings.length = level - 1;
      headings[level - 1] = heading[2].trim();
      headingPath = headings.filter(Boolean).join(" / ") || "Document";
    }
    buffer.push(line);
  }
  flush();
  const candidates = chunks.flatMap((chunk) => {
    const statements = chunk.text.split(/(?<=[。！？.!?])\s+/);
    return statements
      .filter((statement) => /(?:\d+(?:\.\d+)?\s*(?:HV|MPa|GPa|at\.%|wt\.%)|决定|约定|记住)/i.test(statement))
      .map((statement) => ({ text: statement.trim(), heading_path: chunk.heading_path }));
  });
  return {
    raw_ref: rawRef,
    path: rawRef,
    namespace,
    content_hash: hash(text),
    parser_version: MARKDOWN_PARSER_VERSION,
    chunks,
    fact_candidates: candidates,
  };
}

export async function readMarkdownNoteSnapshot(input: {
  path: string;
  root: string;
  namespace: string;
}) {
  const root = await realpath(resolve(input.root));
  const candidate = resolve(root, input.path);
  const relativePath = safeRelativePath(root, candidate);
  const actual = await realpath(candidate);
  safeRelativePath(root, actual);
  const before = await stat(actual);
  const text = await readFile(actual, "utf8");
  const after = await stat(actual);
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    throw new Error("file_version changed while Markdown was being read; retry the snapshot");
  }
  const projection = parseMarkdownText(text, relativePath.replaceAll(sep, "/"), input.namespace);
  projection.source_updated_at = after.mtimeMs / 1000;
  return projection;
}

export async function parseMarkdownNote(input: {
  path: string;
  root: string;
  namespace: string;
}) {
  const projection = await readMarkdownNoteSnapshot(input);
  const write = await ingestDocumentProjection(projection);
  return {
    document_id: write.id,
    reused: write.reused,
    parser_version: MARKDOWN_PARSER_VERSION,
    raw_ref: projection.raw_ref,
    content_hash: projection.content_hash,
    chunk_version_ids: write.chunkVersionIds,
    chunk_count: projection.chunks.length,
    fact_candidates: projection.fact_candidates,
  };
}
