import { createHash } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type {
  ChunkProjectionInput,
  DocumentProjectionInput,
  MemoryChunkRow,
  MemoryDocumentRow,
} from "../memory/document-projections";
import type { GateResult } from "../runtime/nuGate";

export const MARKDOWN_PARSER_VERSION = "markdown-note-v1";

function rowsToObjects<T>(result: { headers: string[]; rows: unknown[][] }): T[] {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T);
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return rowsToObjects<T>(result)[0];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function now(): number {
  return Date.now() / 1000;
}

export function estimateMemoryTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 2));
}

export function memoryDocumentId(namespace: string, rawRef: string): string {
  return `document_${hash(`${namespace}|${rawRef}`)}`;
}

function validateNamespace(namespace: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,127}$/.test(namespace)) throw new Error("A valid namespace is required");
}

function validateText(text: string): void {
  if (!text.trim()) throw new Error("Captured text must not be empty");
  if (text.length > 100_000) throw new Error("Captured text exceeds the single-candidate limit");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|secret|password)\s*[:=]\s*\S+/i.test(text)) {
    throw new Error("Sensitive content is not eligible for memory capture");
  }
}

export interface ProjectionWriteResult extends GateResult {
  id: string;
  chunkVersionIds: string[];
  reused: boolean;
}

export async function ingestDocumentProjection(input: DocumentProjectionInput): Promise<ProjectionWriteResult> {
  validateNamespace(input.namespace);
  const documentId = memoryDocumentId(input.namespace, input.raw_ref);
  const client = getMemoryClient();
  const previous = oneRow<MemoryDocumentRow>(await client.getMemoryDocumentById(documentId));
  if (previous?.content_hash === input.content_hash) return { id: documentId, gate: "pass", chunkVersionIds: [], reused: true };
  const chunkVersionIds: string[] = [];
  for (const chunk of input.chunks) {
    validateText(chunk.text);
    const chunkId = chunk.chunk_id ?? `chunk_${hash(`${documentId}|${chunk.heading_path}|${chunk.ordinal}`)}`;
    const chunkVersionId = `chunk_version_${hash(`${chunkId}|${chunk.content_hash}`)}`;
    chunkVersionIds.push(chunkVersionId);
    if (oneRow(await client.getMemoryChunkVersionById(chunkVersionId))) continue;
    const oldVersions = rowsToObjects<MemoryChunkRow>(await client.listMemoryChunksByDocumentId(documentId))
      .filter((row) => row.chunk_id === chunkId && row.mapping_status === "current");
    for (const old of oldVersions) await client.putMemoryChunk({ ...old, mapping_status: "stale" });
    await client.putMemoryChunk({
      chunk_version_id: chunkVersionId,
      chunk_id: chunkId,
      document_id: documentId,
      heading_path: chunk.heading_path,
      ordinal: chunk.ordinal,
      content_hash: chunk.content_hash,
      text: chunk.text,
      token_count: estimateMemoryTokens(chunk.text),
      mapping_status: "current",
      created_at: now(),
    });
  }
  await client.putMemoryDocument({
    document_id: documentId,
    raw_ref: input.raw_ref,
    path: input.path,
    namespace: input.namespace,
    content_hash: input.content_hash,
    parser_version: input.parser_version,
    status: "active",
    supersedes: previous?.supersedes ?? null,
    source_updated_at: input.source_updated_at ?? null,
    recorded_at: now(),
  });
  return { id: documentId, gate: "pass", chunkVersionIds, reused: false };
}

export interface CaptureMemoryInput {
  text: string;
  namespace: string;
  source_ref: string;
  idempotency_key: string;
  session_id?: string;
  message_id?: string;
  supersedes?: string;
}

export async function captureDailyMemory(input: CaptureMemoryInput): Promise<ProjectionWriteResult> {
  validateText(input.text);
  if (!input.source_ref || !input.idempotency_key) throw new Error("source_ref and idempotency_key are required");
  const client = getMemoryClient();
  const target = input.supersedes ? oneRow<MemoryDocumentRow>(await client.getMemoryDocumentById(input.supersedes)) : undefined;
  if (input.supersedes && (!target || target.namespace !== input.namespace)) {
    throw new Error("supersedes target is missing or outside namespace");
  }
  const rawRef = `capture://${input.source_ref}/${input.idempotency_key}`;
  const contentHash = hash(input.text);
  const result = await ingestDocumentProjection({
    raw_ref: rawRef,
    path: rawRef,
    namespace: input.namespace,
    content_hash: contentHash,
    parser_version: "explicit-capture-v1",
    source_updated_at: now(),
    chunks: [{ heading_path: "Captured memory", ordinal: 0, content_hash: contentHash, text: input.text }],
  });
  if (target && !result.reused) {
    const current = oneRow<MemoryDocumentRow>(await client.getMemoryDocumentById(result.id));
    await client.putMemoryDocument({ ...target, status: "superseded" });
    if (current) await client.putMemoryDocument({ ...current, supersedes: target.document_id });
  }
  return result;
}

export async function reviseDailyMemory(input: CaptureMemoryInput & { supersedes: string }): Promise<ProjectionWriteResult> {
  if (!input.supersedes) throw new Error("supersedes is required for revision");
  return captureDailyMemory(input);
}

export async function linkFactToChunk(input: {
  fact_id: string;
  chunk_version_id: string;
  relation?: "source" | "support" | "contradict";
}): Promise<GateResult & { id: string }> {
  const client = getMemoryClient();
  if (!oneRow(await client.getFactById(input.fact_id))) return { id: "", gate: "blocked", reason: `fact not found: ${input.fact_id}` };
  if (!oneRow(await client.getMemoryChunkVersionById(input.chunk_version_id))) {
    return { id: "", gate: "blocked", reason: `chunk version not found: ${input.chunk_version_id}` };
  }
  const id = `source_link_${hash(`${input.fact_id}|${input.chunk_version_id}|${input.relation ?? "source"}`)}`;
  await client.putMemorySourceLink({
    link_id: id,
    fact_id: input.fact_id,
    chunk_version_id: input.chunk_version_id,
    relation: input.relation ?? "source",
    created_at: now(),
  });
  return { id, gate: "pass" };
}

export async function getDocumentProjection(documentId: string) {
  const client = getMemoryClient();
  const document = oneRow<MemoryDocumentRow>(await client.getMemoryDocumentById(documentId));
  if (!document) return null;
  const chunks = rowsToObjects<MemoryChunkRow>(await client.listMemoryChunksByDocumentId(documentId));
  return { document, chunks };
}

export async function listStaleMappings(): Promise<MemoryChunkRow[]> {
  return rowsToObjects<MemoryChunkRow>(await getMemoryClient().listMemoryChunks())
    .filter((row) => row.mapping_status !== "current");
}

export function chunkVersionId(chunk: ChunkProjectionInput, documentId: string): string {
  const chunkId = chunk.chunk_id ?? `chunk_${hash(`${documentId}|${chunk.heading_path}|${chunk.ordinal}`)}`;
  return `chunk_version_${hash(`${chunkId}|${chunk.content_hash}`)}`;
}
