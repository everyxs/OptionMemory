export const MEMORY_DOCUMENT_COLUMNS = [
  "document_id", "raw_ref", "path", "namespace", "content_hash", "parser_version",
  "status", "supersedes", "source_updated_at", "recorded_at",
] as const;

export const MEMORY_CHUNK_COLUMNS = [
  "chunk_version_id", "chunk_id", "document_id", "heading_path", "ordinal",
  "content_hash", "text", "token_count", "mapping_status", "created_at",
] as const;

export const MEMORY_SOURCE_LINK_COLUMNS = [
  "link_id", "fact_id", "chunk_version_id", "relation", "created_at",
] as const;

export const MEMORY_RECALL_EVENT_COLUMNS = [
  "recall_id", "session_id", "message_id", "query_hash", "namespace",
  "request_json", "response_json", "status", "created_at",
] as const;

export interface MemoryDocumentRow {
  document_id: string;
  raw_ref: string;
  path: string;
  namespace: string;
  content_hash: string;
  parser_version: string;
  status: "active" | "superseded" | "archived";
  supersedes: string | null;
  source_updated_at: number | null;
  recorded_at: number;
}

export interface MemoryChunkRow {
  chunk_version_id: string;
  chunk_id: string;
  document_id: string;
  heading_path: string;
  ordinal: number;
  content_hash: string;
  text: string;
  token_count: number;
  mapping_status: "current" | "stale" | "identity_uncertain";
  created_at: number;
}

export interface MemorySourceLinkRow {
  link_id: string;
  fact_id: string;
  chunk_version_id: string;
  relation: "source" | "support" | "contradict";
  created_at: number;
}

export interface MemoryRecallEventRow {
  recall_id: string;
  session_id: string;
  message_id: string;
  query_hash: string;
  namespace: string;
  request_json: unknown;
  response_json: unknown;
  status: "done" | "degraded";
  created_at: number;
}

export interface ChunkProjectionInput {
  chunk_id?: string;
  heading_path: string;
  ordinal: number;
  content_hash: string;
  text: string;
}

export interface DocumentProjectionInput {
  raw_ref: string;
  path: string;
  namespace: string;
  content_hash: string;
  parser_version: string;
  source_updated_at?: number | null;
  chunks: ChunkProjectionInput[];
}
