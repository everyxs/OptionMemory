export const RUNTIME_INBOX_COLUMNS = [
  "event_id", "event_type", "source", "external_id", "payload", "status",
  "available_at", "waiting_condition", "attempts", "lease_owner", "lease_expires_at",
  "last_error", "created_at", "updated_at",
] as const;

export const RUNTIME_OUTBOX_COLUMNS = [
  "decision_id", "subtask_event_id", "decision_type", "payload", "idempotency_key",
  "status", "available_at", "attempts", "lease_owner", "lease_expires_at",
  "last_error", "created_at", "updated_at",
] as const;

export const RUNTIME_SUBTASK_LEASE_COLUMNS = [
  "subtask_event_id", "lease_owner", "lease_expires_at", "updated_at",
] as const;

export type RuntimeInboxStatus = "pending" | "leased" | "done" | "dead" | "ignored";
export type RuntimeOutboxStatus = "pending" | "leased" | "dispatched" | "done" | "dead" | "cancelled";
export type RuntimeInboxEventType = "request" | "timer" | "option_outcome" | "model_event" | "human_input" | "host_event";

export interface RuntimeInboxRow {
  event_id: string;
  event_type: RuntimeInboxEventType;
  source: string;
  external_id: string | null;
  payload: unknown;
  status: RuntimeInboxStatus;
  available_at: number;
  waiting_condition: unknown;
  attempts: number;
  lease_owner: string | null;
  lease_expires_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface RuntimeOutboxRow {
  decision_id: string;
  subtask_event_id: string;
  decision_type: "execute";
  payload: unknown;
  idempotency_key: string;
  status: RuntimeOutboxStatus;
  available_at: number;
  attempts: number;
  lease_owner: string | null;
  lease_expires_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface RuntimeSubtaskLeaseRow {
  subtask_event_id: string;
  lease_owner: string;
  lease_expires_at: number;
  updated_at: number;
}
