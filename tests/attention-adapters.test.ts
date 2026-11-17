import { beforeAll, describe, expect, it } from "vitest";
import { continuousHostPlanRunId, startContinuousHost, getContinuousHostStatus } from "../src/api/continuous-host";
import { setMemoryClient } from "../src/api/memory";
import { registerSubtask } from "../src/api/registry";
import { beginSubtaskExecution } from "../src/api/telemetry";
import { answerDshContinuedQuestion, askDshUserQuestion, askTimedDshUserQuestion, type DshQuestionItem } from "../src/plugins/dsh/attention";
import { answerOpenCodeQuestion, askOpenCodePermission, type OpenCodePermissionInput } from "../src/plugins/opencode/attention";
import { MnesticClient } from "../src/memory/mnesticClient";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const planRunId = continuousHostPlanRunId("dsh", "attention-start");

beforeAll(async () => {
  setMemoryClient(client);
  await registerSubtask({
    subtask_id: "attention_subtask",
    goal: "attention test",
    context: {},
    status: "active",
    utility_queries: 0,
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
  });
  await beginSubtaskExecution({
    subtask_event_id: "attention_subtask_event",
    subtask_id: "attention_subtask",
    baseline_id: "attention_baseline",
    mandate_json: {
      scope: {},
      policy_version: "p1",
      source_actor: "vitest",
      strength: "explicit",
      mode: "enforce",
      budget: {},
    },
  });
  await startContinuousHost({
    plan_run_id: undefined,
    subtask_event_id: "attention_subtask_event",
    attempt: 1,
    host_type: "dsh",
    host_session_ref: "root-session",
    idempotency_key: "attention-start",
  });
});

describe("native Attention adapters", () => {
  it("OpenCode 复用 permission ask，重复回答只记录一次", async () => {
    const calls: Array<{ input: OpenCodePermissionInput; status: string }> = [];
    const { hostQuestionRef } = await askOpenCodePermission({
      questionId: "oc-question-1",
      title: "Approve S01 measurement",
      description: "Allow the experiment measurement",
      metadata: { planRunId },
    }, async (input, output) => {
      calls.push({ input, status: output.status });
    });
    expect(calls[0].status).toBe("ask");
    const first = await answerOpenCodeQuestion({
      planRunId,
      hostQuestionRef,
      answerEventId: "oc-answer-1",
      answer: { status: "allow" },
    });
    const second = await answerOpenCodeQuestion({
      planRunId,
      hostQuestionRef,
      answerEventId: "oc-answer-1",
      answer: { status: "allow" },
    });
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
  });

  it("DSH userQuestions 携带 approval intent 和 root agent，回答幂等", async () => {
    const rootAgent = { id: "root-agent" };
    let captured: DshQuestionItem[] = [];
    const userQuestions = {
      async ask(request: { agent: unknown; questions: DshQuestionItem[] }) {
        expect(request.agent).toBe(rootAgent);
        captured = request.questions;
        return { answers: [{ id: "dsh-question-1", selected: ["Allow"] }] };
      },
    };
    const first = await askDshUserQuestion(userQuestions, {
      agent: rootAgent,
      planRunId,
      questionId: "dsh-question-1",
      question: "Approve S01 measurement",
      approval: { approve: "Allow", reject: "Reject" },
    });
    const second = await askDshUserQuestion(userQuestions, {
      agent: rootAgent,
      planRunId,
      questionId: "dsh-question-1",
      question: "Approve S01 measurement",
      approval: { approve: "Allow", reject: "Reject" },
    });
    expect(captured[0].intent).toEqual({ kind: "approval", approve: "Allow", reject: "Reject" });
    expect(captured[0].options).toEqual([{ label: "Allow" }, { label: "Reject" }]);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
  });

  it("askTimed pending 不伪造回答，continued answer 只唤醒一次", async () => {
    const pending = await askTimedDshUserQuestion({
      async askTimed() {
        return { pending: true as const, callId: "dsh-timed-1" };
      },
    }, {
      agent: { id: "root-agent" },
      planRunId,
      callId: "dsh-timed-1",
      question: "Continue?",
      timeoutMs: 10,
    });
    expect(pending).toEqual({ pending: true, callId: "dsh-timed-1" });

    const userQuestions = {
      answer() {
        return false;
      },
    };
    const first = await answerDshContinuedQuestion(userQuestions, {
      agent: { id: "root-agent" },
      planRunId,
      callId: "dsh-timed-1",
      answer: { answers: [{ id: "dsh-timed-1", selected: ["yes"] }] },
    });
    const second = await answerDshContinuedQuestion(userQuestions, {
      agent: { id: "root-agent" },
      planRunId,
      callId: "dsh-timed-1",
      answer: { answers: [{ id: "dsh-timed-1", selected: ["yes"] }] },
    });
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    const status = await getContinuousHostStatus(planRunId);
    expect(status.events.filter((event) => event.event_type === "answer")).toHaveLength(3);
  });
});
