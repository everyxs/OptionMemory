import { createHash } from "node:crypto";
import { deliverContinuousHost } from "../../api/continuous-host";

export const OPENCODE_INBOX_MAPPING_VERSION = "opencode-runtime-inbox-v0.1";

export interface RuntimeInboxEnvelope {
  event_id: string;
  event_type: "host_event" | "human_input";
  source: "opencode";
  external_id: string;
  plan_run_id: string;
  payload: unknown;
  mapping_version: string;
  replay: "deferred_to_p4_3";
}

export function mapOpenCodeEventToInbox(input: {
  planRunId: string;
  eventType: string;
  externalId: string;
  payload: unknown;
}): RuntimeInboxEnvelope {
  if (!["session.idle", "session.error", "tool.execute.after", "subagent.completed", "human.input"].includes(input.eventType)) {
    throw new Error(`Unsupported OpenCode Planner event: ${input.eventType}`);
  }
  if (!input.externalId) throw new Error(`OpenCode ${input.eventType} has no stable external ID`);
  const eventId = `runtime_inbox_${createHash("sha256").update(`opencode|${input.planRunId}|${input.eventType}|${input.externalId}`).digest("hex")}`;
  return {
    event_id: eventId,
    event_type: input.eventType === "human.input" ? "human_input" : "host_event",
    source: "opencode",
    external_id: input.externalId,
    plan_run_id: input.planRunId,
    payload: { host_event_type: input.eventType, value: input.payload },
    mapping_version: OPENCODE_INBOX_MAPPING_VERSION,
    replay: "deferred_to_p4_3",
  };
}

export async function recordOpenCodePlannerEvent(input: {
  planRunId: string;
  eventType: string;
  externalId: string;
  payload: unknown;
}) {
  try {
    const inbox = mapOpenCodeEventToInbox(input);
    const stored = await deliverContinuousHost({
      plan_run_id: input.planRunId,
      external_id: inbox.event_id,
      payload_json: inbox,
    });
    return { gate: "pass" as const, inbox, hostEventId: stored.id, reused: stored.reused };
  } catch (error) {
    const externalId = `mapping_error_${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
    const stored = await deliverContinuousHost({
      plan_run_id: input.planRunId,
      external_id: externalId,
      payload_json: {
        event_type: "host_event",
        status: "dead",
        auto_replay: false,
        source: "opencode",
        error: error instanceof Error ? error.message : String(error),
        original: input,
      },
    });
    return { gate: "blocked" as const, reason: error instanceof Error ? error.message : String(error), hostEventId: stored.id };
  }
}
