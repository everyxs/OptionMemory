import { createHash } from "node:crypto";
import { recordModelEvent } from "../api/telemetry";
import { getMemoryClient } from "../memory/client";
import type { ModelRow, OptionRow } from "../memory/assets";
import type { ExecutionMode, OptionOutcomeStatus } from "../memory/planner";

export const TRANSIENT_SETTLEMENT_VERSION = "transient-settlement-v0.1";

export function transientSettlementIdFor(optionEventId: string): string {
  return `settlement_${createHash("sha256").update(`${TRANSIENT_SETTLEMENT_VERSION}|${optionEventId}`).digest("hex")}`;
}

function modelEventIdFor(optionEventId: string): string {
  return `model_event_${createHash("sha256").update(`${TRANSIENT_SETTLEMENT_VERSION}|${optionEventId}`).digest("hex")}`;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function recordTransientCsvSettlement(input: {
  option: OptionRow;
  model: ModelRow;
  optionEventId: string;
  arguments: Record<string, unknown>;
  output?: unknown;
  status: OptionOutcomeStatus;
  cost: unknown;
  execution: {
    attempt: number;
    mode: ExecutionMode;
    parser_version: string | null;
  };
}) {
  const modelEventId = modelEventIdFor(input.optionEventId);
  const settlementId = transientSettlementIdFor(input.optionEventId);
  try {
    const existing = await getMemoryClient().getModelEventById(modelEventId);
    if (existing.rows.length > 0) return { id: modelEventId, settlement_id: settlementId, gate: "pass" as const, reused: true };
    const output = objectValue(input.output);
    const closure = objectValue(output.closure);
    const cost = objectValue(input.cost);
    const inserted = numberOrNull(output.inserted);
    const skipped = numberOrNull(output.skipped);
    const candidateFacts = numberOrNull(output.candidate_facts);
    const accepted = inserted !== null && skipped !== null ? inserted + skipped : null;
    const blockedCount = Array.isArray(output.blocked) ? output.blocked.length : null;
    const settlement = await recordModelEvent({
      model_event_id: modelEventId,
      model_id: input.model.model_id,
      event_type: "calibration",
      payload_json: {
        schema_version: TRANSIENT_SETTLEMENT_VERSION,
        settlement_id: settlementId,
        option_event_id: input.optionEventId,
        option_id: input.option.option_id,
        model_id: input.model.model_id,
        option_type: input.option.option_type,
        template_id: input.option.template_id,
        batch_id: stringOrNull(output.batch_id) ?? stringOrNull(input.arguments.batch_id),
        source_hash: stringOrNull(output.source_hash),
        parser_version: input.execution.parser_version,
        evidence_mode: input.execution.mode,
        attempt: input.execution.attempt,
        outcome_status: input.status,
        success_rate: input.status === "success" ? 1 : 0,
        fact_acceptance_rate: accepted !== null && candidateFacts !== null && candidateFacts > 0 ? accepted / candidateFacts : null,
        input_rows: numberOrNull(output.input_rows),
        input_entities: numberOrNull(output.input_entities),
        candidate_facts: candidateFacts,
        inserted,
        skipped,
        blocked_count: blockedCount,
        closure_inserted: numberOrNull(closure.inserted),
        closure_skipped: numberOrNull(closure.skipped),
        justifications_inserted: numberOrNull(closure.justificationsInserted),
        justifications_skipped: numberOrNull(closure.justificationsSkipped),
        lineage_complete: typeof output.lineage_complete === "boolean" ? output.lineage_complete : null,
        observed: true,
        duration_ms: numberOrNull(cost.duration_ms),
        monetary_cost: numberOrNull(cost.monetary),
      },
    });
    return { ...settlement, settlement_id: settlementId, reused: false };
  } catch (error) {
    return {
      id: modelEventId,
      settlement_id: settlementId,
      gate: "blocked" as const,
      reason: error instanceof Error ? error.message : String(error),
      reused: false,
    };
  }
}
