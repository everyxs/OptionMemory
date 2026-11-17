import { beforeAll, describe, expect, it } from "vitest";
import { captureDailyMemory } from "../src/api/document-projections";
import { memoryRecall } from "../src/api/memory-recall";
import { setMemoryClient } from "../src/api/memory";
import { registerSubtask } from "../src/api/registry";
import { getRuntimeQueueStatus } from "../src/runtime/scheduler";
import {
  SuperAgentIsolationProbe,
  superAgentPlanRunId,
  superAgentSubtaskEventId,
  type SuperAgentCallback,
  type SuperAgentTicket,
} from "../src/api/superagent-probe";
import { MnesticClient } from "../src/memory/mnesticClient";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const subtaskId = "superagent_probe_subtask";

function ticket(id: string): SuperAgentTicket {
  return {
    ticket_id: id,
    subtask_id: subtaskId,
    baseline_id: `baseline_${id}`,
    host_session_ref: `session_${id}`,
    mandate: {
      scope: {},
      policy_version: "superagent-probe-policy-v1",
      source_actor: "superagent-test",
      strength: "explicit",
      mode: "enforce",
      budget: { max_steps: 4 },
    },
  };
}

beforeAll(async () => {
  setMemoryClient(client);
  await registerSubtask({
    subtask_id: subtaskId,
    goal: "SuperAgent isolation compatibility probe",
    context: {},
    status: "active",
    utility_queries: 0,
    lin_source: "superagent-probe-test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
  });
});

describe("SuperAgent isolation probe", () => {
  it("maps Ticket and Assignment deterministically and emits assignmentStarted once", async () => {
    const current = ticket("ticket-start");
    const assignment = { assignment_id: "assignment-start", attempt: 1 };
    const callbacks: SuperAgentCallback[] = [];
    const probe = new SuperAgentIsolationProbe({
      assignmentStarted: (event) => {
        callbacks.push(event);
        return { accepted: true };
      },
    });
    const first = await probe.start(current, assignment);
    const second = await probe.start(current, assignment);
    const planRunId = superAgentPlanRunId(current.ticket_id, assignment.assignment_id);
    expect(first).toMatchObject({ gate: "pass", planRunId, reused: false });
    expect(second).toMatchObject({ gate: "pass", planRunId, reused: true });
    expect(first.subtaskEventId).toBe(superAgentSubtaskEventId(current.ticket_id));
    expect(callbacks).toHaveLength(1);
    const status = await probe.status(current, assignment);
    expect(status.planRun).toMatchObject({
      host_type: "superagent",
      host_ticket_ref: current.ticket_id,
      host_assignment_ref: assignment.assignment_id,
      attempt: 1,
      mapping_version: "superagent-probe-v0.1",
      status: "active",
    });
    expect(status.events.filter((event) => event.event_type === "assignmentStarted")).toHaveLength(1);
    expect(status.events[0].payload_json).toMatchObject({ callback_status: "delivered", callback_response: { accepted: true } });
  });

  it("deduplicates deliver and does not implicitly duplicate explicit memory", async () => {
    const current = ticket("ticket-deliver");
    const assignment = { assignment_id: "assignment-deliver", attempt: 1 };
    const probe = new SuperAgentIsolationProbe({ assignmentStarted: () => ({ accepted: true }) });
    await probe.start(current, assignment);
    const capture = {
      text: "记住 SuperAgent 探针使用 pnpm。",
      namespace: "superagent-probe:deliver",
      source_ref: current.ticket_id,
      idempotency_key: "deliver-memory-v1",
    };
    expect((await captureDailyMemory(capture)).reused).toBe(false);
    expect((await captureDailyMemory(capture)).reused).toBe(true);
    const input = { input_id: "input-deliver", kind: "human_input" as const, payload: { text: "continue" } };
    const first = await probe.deliver(current, assignment, input);
    const second = await probe.deliver(current, assignment, input);
    expect(first).toMatchObject({ gate: "pass", reused: false });
    expect(second).toMatchObject({ gate: "pass", reused: true, externalId: first.externalId, inboxEventId: first.inboxEventId });
    const queue = await getRuntimeQueueStatus();
    expect(queue.inbox.filter((event) => event.event_id === first.inboxEventId)).toHaveLength(1);
    const documents = await client.listMemoryDocuments();
    expect(documents.rows.filter((row) => row[documents.headers.indexOf("namespace")] === capture.namespace)).toHaveLength(1);
    const recalled = await memoryRecall({ query: "pnpm", namespace: capture.namespace, session_id: "superagent-deliver", message_id: "memory-check" });
    expect(recalled.items.some((item) => item.text.includes("pnpm"))).toBe(true);
    const status = await probe.status(current, assignment);
    expect(status.events.filter((event) => event.event_type === "deliver")).toHaveLength(1);
  });

  it("re-creates a missing inbox after a partially persisted deliver without duplicating host events", async () => {
    const current = ticket("ticket-deliver-recovery");
    const assignment = { assignment_id: "assignment-deliver-recovery", attempt: 1 };
    const probe = new SuperAgentIsolationProbe({ assignmentStarted: () => ({ accepted: true }) });
    await probe.start(current, assignment);
    const first = await probe.deliver(current, assignment, { input_id: "input-partial", kind: "trigger", payload: { version: 1 } });
    await client.execute("?[event_id] := *runtime_inbox{event_id}, event_id == $id :rm runtime_inbox {event_id}", { id: first.inboxEventId });
    const recovered = await probe.deliver(current, assignment, { input_id: "input-partial", kind: "trigger", payload: { version: 1 } });
    expect(recovered).toMatchObject({ gate: "pass", reused: false, inboxEventId: first.inboxEventId });
    const status = await probe.status(current, assignment);
    expect(status.events.filter((event) => event.event_type === "deliver")).toHaveLength(1);
    expect((await client.getRuntimeInboxById(first.inboxEventId!)).rows).toHaveLength(1);
  });

  it("round-trips Ticket Attention and wakes exactly once for one answer", async () => {
    const current = ticket("ticket-attention");
    const assignment = { assignment_id: "assignment-attention", attempt: 1 };
    const callbacks: SuperAgentCallback[] = [];
    const probe = new SuperAgentIsolationProbe({
      assignmentStarted: () => ({ accepted: true }),
      attention: (event) => {
        callbacks.push(event);
        return { attention_id: "host-attention-1" };
      },
    });
    await probe.start(current, assignment);
    const question = { question_id: "question-1", question: { text: "Continue?", choices: ["yes", "no"] } };
    expect((await probe.requestAttention(current, assignment, question)).reused).toBe(false);
    expect((await probe.requestAttention(current, assignment, question)).reused).toBe(true);
    expect(callbacks).toHaveLength(1);
    const answer = { question_id: "question-1", input_id: "input-answer", answer: { selected: ["yes"] } };
    const first = await probe.answerAttention(current, assignment, answer);
    const duplicate = await probe.answerAttention(current, assignment, answer);
    expect(first).toMatchObject({ gate: "pass", reused: false });
    expect(duplicate).toMatchObject({ gate: "pass", reused: true, inboxEventId: first.inboxEventId });
    expect((await probe.answerAttention(current, assignment, { ...answer, input_id: "input-other-answer" })).gate).toBe("blocked");
    const status = await probe.status(current, assignment);
    expect(status.events.filter((event) => event.event_type === "attention")).toHaveLength(1);
    expect(status.events.filter((event) => event.event_type === "answer")).toHaveLength(1);
    const queue = await getRuntimeQueueStatus();
    expect(queue.inbox.filter((event) => event.event_id === first.inboxEventId)).toHaveLength(1);
  });

  it("maps report and stop without restarting completed or stopped assignments", async () => {
    const current = ticket("ticket-final");
    const firstAssignment = { assignment_id: "assignment-report", attempt: 1 };
    const reports: SuperAgentCallback[] = [];
    const probe = new SuperAgentIsolationProbe({
      assignmentStarted: () => ({ accepted: true }),
      report: (event) => {
        reports.push(event);
        return { received: true };
      },
    });
    await probe.start(current, firstAssignment);
    const report = { report_id: "report-1", report: { status: "ready", artifacts: ["fact:S01"] } };
    expect((await probe.report(current, firstAssignment, report)).reused).toBe(false);
    expect((await probe.report(current, firstAssignment, report)).reused).toBe(true);
    expect(reports).toHaveLength(1);
    expect((await probe.status(current, firstAssignment)).planRun?.status).toBe("completed");

    const secondAssignment = { assignment_id: "assignment-stop", attempt: 2 };
    await probe.start(current, secondAssignment);
    const stop = { stop_id: "stop-1", reason: "operator stop" };
    expect((await probe.stop(current, secondAssignment, stop)).reused).toBe(false);
    expect((await probe.stop(current, secondAssignment, stop)).reused).toBe(true);
    expect((await probe.status(current, secondAssignment)).planRun?.status).toBe("stopped");
    expect((await probe.deliver(current, secondAssignment, { input_id: "after-stop", kind: "human_input", payload: {} })).gate).toBe("blocked");
    expect((await probe.status(current, secondAssignment)).planRun?.subtask_event_id).toBe((await probe.status(current, firstAssignment)).planRun?.subtask_event_id);
  });

  it("records callback reconciliation and never blindly retries a failed callback", async () => {
    const current = ticket("ticket-callback-failure");
    const assignment = { assignment_id: "assignment-callback-failure", attempt: 1 };
    let calls = 0;
    const probe = new SuperAgentIsolationProbe({
      assignmentStarted: () => {
        calls += 1;
        throw new Error("isolated callback outage");
      },
    });
    const first = await probe.start(current, assignment);
    const second = await probe.start(current, assignment);
    expect(first).toMatchObject({ gate: "blocked", reused: false });
    expect(second).toMatchObject({ gate: "blocked", reused: true });
    expect(first.reason).toContain("reconciliation");
    expect(calls).toBe(1);
    const status = await probe.status(current, assignment);
    expect(status.planRun?.status).toBe("active");
    expect(status.events[0].payload_json).toMatchObject({ callback_status: "reconcile_required", callback_error: "isolated callback outage" });
  });
});
