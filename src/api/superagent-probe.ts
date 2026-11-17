import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getMemoryClient } from "../memory/client";
import type { HostEventRow, PlanRunRow, SubtaskEventRow } from "../memory/planner";
import { enqueueRuntimeInbox } from "../runtime/scheduler";
import {
  answerContinuousHost,
  continuousHostPlanRunId,
  deliverContinuousHost,
  getContinuousHostStatus,
  startContinuousHost,
  stopContinuousHost,
  type ContinuousHostResult,
} from "./continuous-host";
import { beginSubtaskExecution, type MandateInput } from "./telemetry";

export const SUPERAGENT_PROBE_MAPPING_VERSION = "superagent-probe-v0.1";

export interface SuperAgentTicket {
  ticket_id: string;
  subtask_id: string;
  baseline_id: string;
  mandate: MandateInput;
  host_session_ref?: string | null;
}

export interface SuperAgentAssignment {
  assignment_id: string;
  attempt: number;
}

export interface SuperAgentCallback {
  plan_run_id: string;
  ticket_id: string;
  assignment_id: string;
  attempt: number;
  payload: unknown;
}

export interface SuperAgentProbeCallbacks {
  assignmentStarted?: (event: SuperAgentCallback) => unknown | Promise<unknown>;
  report?: (event: SuperAgentCallback) => unknown | Promise<unknown>;
  attention?: (event: SuperAgentCallback) => unknown | Promise<unknown>;
}

export interface SuperAgentProbeResult extends ContinuousHostResult {
  subtaskEventId?: string;
  externalId?: string;
  inboxEventId?: string;
}

function deterministicId(kind: string, parts: string[]): string {
  return `${kind}_${createHash("sha256").update(parts.join("|")).digest("hex")}`;
}

function rowsToObjects<T>(result: { headers: string[]; rows: unknown[][] }): T[] {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T);
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return rowsToObjects<T>(result)[0];
}

export function superAgentSubtaskEventId(ticketId: string): string {
  return deterministicId("subtask_event", [SUPERAGENT_PROBE_MAPPING_VERSION, ticketId]);
}

export function superAgentPlanRunId(ticketId: string, assignmentId: string): string {
  return continuousHostPlanRunId("superagent", [SUPERAGENT_PROBE_MAPPING_VERSION, ticketId, assignmentId].join("|"));
}

export function superAgentInputExternalId(ticketId: string, assignmentId: string, inputId: string): string {
  return deterministicId("superagent_input", [SUPERAGENT_PROBE_MAPPING_VERSION, ticketId, assignmentId, inputId]);
}

export function superAgentQuestionRef(ticketId: string, assignmentId: string, questionId: string): string {
  return deterministicId("ticket_attention", [SUPERAGENT_PROBE_MAPPING_VERSION, ticketId, assignmentId, questionId]);
}

function superAgentCallbackEventId(planRunId: string, eventType: string, externalId: string): string {
  return deterministicId("host_event", [planRunId, eventType, externalId]);
}

function blocked(planRunId: string, reason: string, reused = false): SuperAgentProbeResult {
  return { id: planRunId, planRunId, gate: "blocked", reason, reused };
}

export class SuperAgentIsolationProbe {
  constructor(private readonly callbacks: SuperAgentProbeCallbacks = {}) {}

  private async loadPlan(ticket: SuperAgentTicket, assignment: SuperAgentAssignment): Promise<PlanRunRow | undefined> {
    const planRunId = superAgentPlanRunId(ticket.ticket_id, assignment.assignment_id);
    const plan = oneRow<PlanRunRow>(await getMemoryClient().getPlanRunById(planRunId));
    if (!plan) return undefined;
    if (plan.host_type !== "superagent"
      || plan.host_ticket_ref !== ticket.ticket_id
      || plan.host_assignment_ref !== assignment.assignment_id
      || plan.subtask_event_id !== superAgentSubtaskEventId(ticket.ticket_id)
      || plan.attempt !== assignment.attempt
      || plan.mapping_version !== SUPERAGENT_PROBE_MAPPING_VERSION) {
      throw new Error(`SuperAgent mapping mismatch for plan_run: ${planRunId}`);
    }
    return plan;
  }

  private async emitCallback(input: {
    ticket: SuperAgentTicket;
    assignment: SuperAgentAssignment;
    eventType: "assignmentStarted" | "report" | "attention";
    externalId: string;
    payload: unknown;
    callback?: (event: SuperAgentCallback) => unknown | Promise<unknown>;
  }): Promise<SuperAgentProbeResult> {
    const planRunId = superAgentPlanRunId(input.ticket.ticket_id, input.assignment.assignment_id);
    const id = superAgentCallbackEventId(planRunId, input.eventType, input.externalId);
    const client = getMemoryClient();
    const existing = oneRow<HostEventRow>(await client.getHostEventById(id));
    if (existing) {
      const payload = existing.payload_json as { callback_status?: string; callback_error?: string | null };
      const failed = payload.callback_status !== "delivered";
      return {
        id, planRunId, gate: failed ? "blocked" : "pass",
        reason: failed ? `${input.eventType} callback requires reconciliation: ${payload.callback_error ?? payload.callback_status}` : undefined,
        reused: true,
      };
    }
    const event = {
      host_event_id: id,
      plan_run_id: planRunId,
      event_type: input.eventType,
      external_id: input.externalId,
      payload_json: {
        ticket_id: input.ticket.ticket_id,
        assignment_id: input.assignment.assignment_id,
        payload: input.payload,
        callback_status: "pending",
        callback_response: null,
        callback_error: null,
      },
      created_at: Date.now() / 1000,
    } satisfies HostEventRow;
    await client.putHostEvent(event);
    try {
      if (!input.callback) throw new Error(`${input.eventType} callback is not registered`);
      const response = await input.callback({
        plan_run_id: planRunId,
        ticket_id: input.ticket.ticket_id,
        assignment_id: input.assignment.assignment_id,
        attempt: input.assignment.attempt,
        payload: input.payload,
      });
      await client.putHostEvent({
        ...event,
        payload_json: { ...event.payload_json, callback_status: "delivered", callback_response: response ?? null },
      });
      return { id, planRunId, gate: "pass", reused: false };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await client.putHostEvent({
        ...event,
        payload_json: { ...event.payload_json, callback_status: "reconcile_required", callback_error: reason },
      });
      return { id, planRunId, gate: "blocked", reason: `${input.eventType} callback requires reconciliation: ${reason}`, reused: false };
    }
  }

  async start(ticket: SuperAgentTicket, assignment: SuperAgentAssignment): Promise<SuperAgentProbeResult> {
    if (!ticket.ticket_id || !ticket.subtask_id || !ticket.baseline_id || !assignment.assignment_id) {
      return blocked("", "ticket_id, subtask_id, baseline_id and assignment_id are required");
    }
    const planRunId = superAgentPlanRunId(ticket.ticket_id, assignment.assignment_id);
    const subtaskEventId = superAgentSubtaskEventId(ticket.ticket_id);
    const client = getMemoryClient();
    const existingSubtask = oneRow<SubtaskEventRow>(await client.getSubtaskEventById(subtaskEventId));
    if (existingSubtask && (existingSubtask.subtask_id !== ticket.subtask_id
      || existingSubtask.baseline_id !== ticket.baseline_id
      || !isDeepStrictEqual(existingSubtask.mandate_json, ticket.mandate))) {
      return blocked(planRunId, "Ticket is already bound to a different subtask or mandate", true);
    }
    if (!existingSubtask) {
      const subtask = await beginSubtaskExecution({
        subtask_event_id: subtaskEventId,
        subtask_id: ticket.subtask_id,
        baseline_id: ticket.baseline_id,
        mandate_json: ticket.mandate,
      });
      if (subtask.gate === "blocked") return { ...subtask, planRunId, reused: false };
    }
    const existingPlan = await this.loadPlan(ticket, assignment);
    const started = existingPlan
      ? { id: planRunId, planRunId, gate: "pass" as const, reused: true }
      : await startContinuousHost({
          subtask_event_id: subtaskEventId,
          attempt: assignment.attempt,
          host_type: "superagent",
          host_session_ref: ticket.host_session_ref,
          host_ticket_ref: ticket.ticket_id,
          host_assignment_ref: assignment.assignment_id,
          idempotency_key: [SUPERAGENT_PROBE_MAPPING_VERSION, ticket.ticket_id, assignment.assignment_id].join("|"),
          mapping_version: SUPERAGENT_PROBE_MAPPING_VERSION,
        });
    if (started.gate === "blocked") return { ...started, subtaskEventId };
    const callback = await this.emitCallback({
      ticket, assignment, eventType: "assignmentStarted", externalId: assignment.assignment_id,
      payload: { plan_run_id: planRunId, subtask_event_id: subtaskEventId },
      callback: this.callbacks.assignmentStarted,
    });
    return {
      ...callback,
      subtaskEventId,
      reused: started.reused && callback.reused,
      reason: callback.reason ?? started.reason,
    };
  }

  async deliver(ticket: SuperAgentTicket, assignment: SuperAgentAssignment, input: {
    input_id: string;
    kind: "trigger" | "policy_change" | "human_input";
    payload: unknown;
  }): Promise<SuperAgentProbeResult> {
    const plan = await this.loadPlan(ticket, assignment);
    if (!plan) return blocked(superAgentPlanRunId(ticket.ticket_id, assignment.assignment_id), "plan_run not found");
    if (plan.status !== "active") return blocked(plan.plan_run_id, `plan_run is ${plan.status}`);
    if (!input.input_id) return blocked(plan.plan_run_id, "input_id is required");
    const externalId = superAgentInputExternalId(ticket.ticket_id, assignment.assignment_id, input.input_id);
    const delivered = await deliverContinuousHost({
      plan_run_id: plan.plan_run_id,
      external_id: externalId,
      payload_json: {
        ticket_id: ticket.ticket_id,
        assignment_id: assignment.assignment_id,
        input_id: input.input_id,
        kind: input.kind,
        payload: input.payload,
        mapping_version: SUPERAGENT_PROBE_MAPPING_VERSION,
      },
    });
    const inbox = await enqueueRuntimeInbox({
      event_type: input.kind === "human_input" ? "human_input" : "host_event",
      source: "superagent-probe",
      external_id: externalId,
      payload: {
        plan_run_id: plan.plan_run_id,
        ticket_id: ticket.ticket_id,
        assignment_id: assignment.assignment_id,
        input_id: input.input_id,
        observation: { kind: input.kind, payload: input.payload },
      },
    });
    return {
      id: delivered.id,
      planRunId: plan.plan_run_id,
      gate: "pass",
      reused: delivered.reused && inbox.reused,
      externalId,
      inboxEventId: inbox.id,
    };
  }

  async requestAttention(ticket: SuperAgentTicket, assignment: SuperAgentAssignment, input: {
    question_id: string;
    question: unknown;
  }): Promise<SuperAgentProbeResult> {
    const plan = await this.loadPlan(ticket, assignment);
    if (!plan) return blocked(superAgentPlanRunId(ticket.ticket_id, assignment.assignment_id), "plan_run not found");
    if (plan.status !== "active") return blocked(plan.plan_run_id, `plan_run is ${plan.status}`);
    if (!input.question_id) return blocked(plan.plan_run_id, "question_id is required");
    const hostQuestionRef = superAgentQuestionRef(ticket.ticket_id, assignment.assignment_id, input.question_id);
    const result = await this.emitCallback({
      ticket, assignment, eventType: "attention", externalId: input.question_id,
      payload: {
        host_question_ref: hostQuestionRef,
        channel: "ticket_attention",
        report_question: input.question,
      },
      callback: this.callbacks.attention,
    });
    return { ...result, externalId: input.question_id };
  }

  async answerAttention(ticket: SuperAgentTicket, assignment: SuperAgentAssignment, input: {
    question_id: string;
    input_id: string;
    answer: unknown;
  }): Promise<SuperAgentProbeResult> {
    const plan = await this.loadPlan(ticket, assignment);
    if (!plan) return blocked(superAgentPlanRunId(ticket.ticket_id, assignment.assignment_id), "plan_run not found");
    if (!input.question_id || !input.input_id) return blocked(plan.plan_run_id, "question_id and input_id are required");
    const status = await getContinuousHostStatus(plan.plan_run_id);
    const hostQuestionRef = superAgentQuestionRef(ticket.ticket_id, assignment.assignment_id, input.question_id);
    const question = status.events.find((event) => event.event_type === "attention" && event.external_id === input.question_id);
    if (!question) return blocked(plan.plan_run_id, `Ticket Attention not found: ${input.question_id}`);
    const previousAnswers = status.events.filter((event) => event.event_type === "answer"
      && (event.payload_json as { host_question_ref?: string }).host_question_ref === hostQuestionRef);
    const answerEventId = superAgentInputExternalId(ticket.ticket_id, assignment.assignment_id, input.input_id);
    if (previousAnswers.some((event) => event.external_id !== answerEventId)) {
      return blocked(plan.plan_run_id, "Ticket Attention already has a different answer", true);
    }
    if (plan.status !== "active") {
      return previousAnswers.some((event) => event.external_id === answerEventId)
        ? { id: answerEventId, planRunId: plan.plan_run_id, gate: "pass", reused: true }
        : blocked(plan.plan_run_id, `plan_run is ${plan.status}`);
    }
    const answered = await answerContinuousHost({
      plan_run_id: plan.plan_run_id,
      host_question_ref: hostQuestionRef,
      answer_event_id: answerEventId,
      answer: input.answer,
    });
    const inbox = await enqueueRuntimeInbox({
      event_type: "human_input",
      source: "superagent-attention",
      external_id: answerEventId,
      payload: {
        plan_run_id: plan.plan_run_id,
        ticket_id: ticket.ticket_id,
        assignment_id: assignment.assignment_id,
        input_id: input.input_id,
        host_question_ref: hostQuestionRef,
        answer_event_id: answerEventId,
        observation: { kind: "attention_answer", answer: input.answer },
      },
    });
    return {
      id: answered.id,
      planRunId: plan.plan_run_id,
      gate: "pass",
      reused: answered.reused && inbox.reused,
      externalId: answerEventId,
      inboxEventId: inbox.id,
    };
  }

  async report(ticket: SuperAgentTicket, assignment: SuperAgentAssignment, input: {
    report_id: string;
    report: unknown;
  }): Promise<SuperAgentProbeResult> {
    const plan = await this.loadPlan(ticket, assignment);
    if (!plan) return blocked(superAgentPlanRunId(ticket.ticket_id, assignment.assignment_id), "plan_run not found");
    if (!input.report_id) return blocked(plan.plan_run_id, "report_id is required");
    const eventId = superAgentCallbackEventId(plan.plan_run_id, "report", input.report_id);
    const existing = oneRow(await getMemoryClient().getHostEventById(eventId));
    if (!existing && plan.status !== "active") return blocked(plan.plan_run_id, `plan_run is ${plan.status}`);
    const result = await this.emitCallback({
      ticket, assignment, eventType: "report", externalId: input.report_id,
      payload: input.report,
      callback: this.callbacks.report,
    });
    if (!existing) {
      await getMemoryClient().putPlanRun({ ...plan, status: "completed", updated_at: Date.now() / 1000 });
    }
    return result;
  }

  async stop(ticket: SuperAgentTicket, assignment: SuperAgentAssignment, input: {
    stop_id: string;
    reason?: unknown;
  }): Promise<SuperAgentProbeResult> {
    const plan = await this.loadPlan(ticket, assignment);
    if (!plan) return blocked(superAgentPlanRunId(ticket.ticket_id, assignment.assignment_id), "plan_run not found");
    if (!input.stop_id) return blocked(plan.plan_run_id, "stop_id is required");
    const status = await getContinuousHostStatus(plan.plan_run_id);
    const existing = status.events.find((event) => event.event_type === "stop" && event.external_id === input.stop_id);
    if (plan.status !== "active" && !existing) return blocked(plan.plan_run_id, `plan_run is ${plan.status}`);
    return stopContinuousHost({
      plan_run_id: plan.plan_run_id,
      external_id: input.stop_id,
      reason: input.reason,
    });
  }

  async status(ticket: SuperAgentTicket, assignment: SuperAgentAssignment) {
    const plan = await this.loadPlan(ticket, assignment);
    if (!plan) return { planRun: undefined, events: [] };
    return getContinuousHostStatus(plan.plan_run_id);
  }
}
