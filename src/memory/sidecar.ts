export const SIDECAR_EVENT_COLUMNS = [
  "sidecar_event_id", "baseline_id", "scenario_id", "run_id", "tool_id", "call_id",
  "event_type", "external_id", "payload_json", "mapping_json", "created_at",
] as const;

export interface SidecarEventRow {
  sidecar_event_id: string;
  baseline_id: string;
  scenario_id: string;
  run_id: string;
  tool_id: string | null;
  call_id: string | null;
  event_type: string;
  external_id: string;
  payload_json: unknown;
  mapping_json: unknown;
  created_at: number;
}
