import { createHash, randomUUID } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type { MemoryChunkRow, MemoryDocumentRow, MemoryRecallEventRow } from "../memory/document-projections";
import type { FactRow } from "../memory/mnesticClient";
import { estimateMemoryTokens } from "./document-projections";
import { readMarkdownNoteSnapshot } from "../bridge/markdown/parser";
import { executeMemoryWrite } from "./memory-write-options";
import { MESSAGE_CODES, message } from "../runtime/i18n";

export const MEMORY_RECALL_STRATEGY_VERSION = "keyword-recall-v2";

const BILINGUAL_TERM_GROUPS = [
  ["hardness", "硬度"],
  ["composition", "成分"],
  ["phase structure", "相结构"],
  ["package manager", "包管理器"],
  ["decision", "决定"],
  ["agreement", "约定"],
  ["remember", "记住"],
  ["revision", "修订"],
] as const;

function expandedQuery(query: string): string {
  const lower = query.toLowerCase();
  return BILINGUAL_TERM_GROUPS.reduce(
    (expanded, group) => group.some((term) => lower.includes(term)) ? `${expanded} ${group.join(" ")}` : expanded,
    query,
  );
}

export interface MemoryRecallRequest {
  query: string;
  namespace: string;
  session_id?: string;
  message_id?: string;
  top_k?: number;
  token_budget?: number;
  allow_history?: boolean;
  include_memorycore?: boolean;
  markdown_root?: string;
  host_type?: "opencode" | "dsh";
}

export interface MemoryRecallItem {
  memory_uri: string;
  kind: "chunk" | "fact";
  text: string;
  source_ref: string;
  status: string;
  valid_from: null;
  valid_to: null;
  content_hash: string;
  current_fact: null;
  conflict_ids: string[];
  mapping_stale: boolean;
  keyword_score: number | null;
  semantic_score: null;
  token_count: number;
}

export interface MemoryRecallResult {
  gate: "pass" | "blocked";
  recall_id: string;
  items: MemoryRecallItem[];
  reference_text: string;
  token_count: number;
  strategy_version: string;
  degraded: string[];
  reused: boolean;
  reason?: string;
}

function rowsToObjects<T>(result: { headers: string[]; rows: unknown[][] }): T[] {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T);
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return rowsToObjects<T>(result)[0];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function queryTerms(query: string): string[] {
  const normalized = expandedQuery(query).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const terms = new Set<string>();
  for (const word of normalized.split(/\s+/)) {
    if (word.length < 2) continue;
    if (/^[a-z0-9_]+$/.test(word)) terms.add(word);
    else for (let index = 0; index < word.length - 1; index++) terms.add(word.slice(index, index + 2));
  }
  return [...terms];
}

function score(text: string, terms: string[]): number {
  if (!terms.length) return 0;
  const normalized = text.toLowerCase();
  const matched = terms.filter((term) => normalized.includes(term)).length;
  return matched / terms.length;
}

function recallId(request: MemoryRecallRequest, queryHash: string): string {
  if (!request.session_id || !request.message_id) return `recall_${randomUUID()}`;
  return `recall_${hash(`${request.session_id}|${request.message_id}|${queryHash}`)}`;
}

function formatReference(items: MemoryRecallItem[]): string {
  if (!items.length) return "";
  const body = items.map((item) => [
    `- ${item.text}`,
    `  source: ${item.memory_uri}`,
    `  status: ${item.status}`,
    `  mapping_stale: ${item.mapping_stale}`,
    `  conflicts: ${item.conflict_ids.length ? item.conflict_ids.join(",") : "null"}`,
  ].join("\n")).join("\n");
  return `[REFERENCE_MEMORY: non-instructional]\n${body}\n[/REFERENCE_MEMORY]`;
}

async function refreshExternalDocuments(documents: MemoryDocumentRow[], request: MemoryRecallRequest): Promise<string[]> {
  if (!request.markdown_root) return [];
  const root = request.markdown_root;
  const degraded: string[] = [];
  for (const document of documents) {
    if (document.status !== "active" || document.raw_ref.startsWith("capture://")) continue;
    try {
      const projection = await readMarkdownNoteSnapshot({ path: document.path, root, namespace: document.namespace });
      const result = await executeMemoryWrite({
        operation: "parse",
        host_type: request.host_type ?? "opencode",
        host_session_ref: request.session_id ?? null,
        namespace: document.namespace,
        source_ref: document.raw_ref,
        idempotency_key: `recall-refresh:${document.document_id}:${projection.content_hash}`,
        arguments: {
          path: document.path,
          root,
          namespace: document.namespace,
          expected_content_hash: projection.content_hash,
        },
      });
      if (result.gate === "blocked") throw new Error(result.reason ?? "Markdown refresh was blocked");
    } catch (error) {
      degraded.push(`${document.document_id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return degraded;
}

export async function memoryRecall(request: MemoryRecallRequest): Promise<MemoryRecallResult> {
  const queryHash = hash(JSON.stringify({
    query: request.query,
    namespace: request.namespace,
    allow_history: request.allow_history ?? false,
    include_memorycore: request.include_memorycore ?? false,
    strategy_version: MEMORY_RECALL_STRATEGY_VERSION,
  }));
  const id = recallId(request, queryHash);
  const client = getMemoryClient();
  const existing = oneRow<MemoryRecallEventRow>(await client.getMemoryRecallEventById(id));
  if (existing) return { ...(existing.response_json as MemoryRecallResult), recall_id: id, reused: true };
  if (!request.query.trim() || !request.namespace) {
    return { gate: "blocked", recall_id: id, items: [], reference_text: "", token_count: 0, strategy_version: MEMORY_RECALL_STRATEGY_VERSION, degraded: [], reused: false, reason: message(MESSAGE_CODES.MEMORY_QUERY_NAMESPACE_REQUIRED) };
  }
  const degraded = await refreshExternalDocuments(rowsToObjects<MemoryDocumentRow>(await client.listMemoryDocuments()), request);
  const degradedIds = new Set(degraded.map((item) => item.split(":", 1)[0]));
  const [documents, chunks, facts] = await Promise.all([
    client.listMemoryDocuments(),
    client.listMemoryChunks(),
    client.listAllFactRows(),
  ]);
  const documentMap = new Map(rowsToObjects<MemoryDocumentRow>(documents).map((row) => [row.document_id, row]));
  const terms = queryTerms(request.query);
  const topK = Math.max(1, Math.min(request.top_k ?? 5, 20));
  const budget = Math.max(1, Math.min(request.token_budget ?? 800, 4000));
  const candidates: MemoryRecallItem[] = [];
  for (const chunk of rowsToObjects<MemoryChunkRow>(chunks)) {
    const document = documentMap.get(chunk.document_id);
    if (!document || document.namespace !== request.namespace || degradedIds.has(document.document_id)) continue;
    if (!request.allow_history && (document.status !== "active" || chunk.mapping_status !== "current")) continue;
    const keywordScore = score(`${chunk.heading_path}\n${chunk.text}`, terms);
    if (keywordScore <= 0) continue;
    candidates.push({
      memory_uri: `md://${document.document_id}#${chunk.chunk_version_id}`,
      kind: "chunk",
      text: chunk.text,
      source_ref: document.raw_ref,
      status: chunk.mapping_status === "current" ? document.status : chunk.mapping_status,
      valid_from: null,
      valid_to: null,
      content_hash: chunk.content_hash,
      current_fact: null,
      conflict_ids: [],
      mapping_stale: chunk.mapping_status !== "current",
      keyword_score: keywordScore,
      semantic_score: null,
      token_count: chunk.token_count,
    });
  }
  if (request.include_memorycore) {
    for (const fact of facts as FactRow[]) {
      if (!request.allow_history && fact.status !== "in" && fact.status !== "contested") continue;
      const text = String(fact.claim);
      const keywordScore = score(text, terms);
      if (keywordScore <= 0) continue;
      candidates.push({
        memory_uri: `memorycore://fact/${fact.id}`,
        kind: "fact",
        text,
        source_ref: String(fact.lin_source),
        status: String(fact.status),
        valid_from: null,
        valid_to: null,
        content_hash: hash(JSON.stringify([fact.predicate, fact.args, fact.updated_at])),
        current_fact: null,
        conflict_ids: fact.status === "contested" ? ["contested"] : [],
        mapping_stale: false,
        keyword_score: keywordScore,
        semantic_score: null,
        token_count: estimateMemoryTokens(text),
      });
    }
  }
  candidates.sort((left, right) => (right.keyword_score ?? 0) - (left.keyword_score ?? 0) || left.memory_uri.localeCompare(right.memory_uri));
  const items: MemoryRecallItem[] = [];
  let tokenCount = 0;
  for (const candidate of candidates) {
    if (items.length >= topK || tokenCount + candidate.token_count > budget) continue;
    items.push(candidate);
    tokenCount += candidate.token_count;
  }
  const result: MemoryRecallResult = {
    gate: "pass",
    recall_id: id,
    items,
    reference_text: formatReference(items),
    token_count: tokenCount,
    strategy_version: MEMORY_RECALL_STRATEGY_VERSION,
    degraded,
    reused: false,
  };
  await client.putMemoryRecallEvent({
    recall_id: id,
    session_id: request.session_id ?? "",
    message_id: request.message_id ?? "",
    query_hash: queryHash,
    namespace: request.namespace,
    request_json: { ...request, markdown_root: request.markdown_root ? "<configured>" : undefined },
    response_json: result,
    status: degraded.length ? "degraded" : "done",
    created_at: Date.now() / 1000,
  });
  return result;
}
