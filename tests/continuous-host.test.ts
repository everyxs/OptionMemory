import { beforeAll, describe, expect, it } from "vitest";
import {
  answerContinuousHost,
  continuousHostPlanRunId,
  deliverContinuousHost,
  getContinuousHostStatus,
  reportContinuousHost,
  startContinuousHost,
  stopContinuousHost,
} from "../src/api/continuous-host";
import { setMemoryClient } from "../src/api/memory";
import { registerSubtask } from "../src/api/registry";
import { beginSubtaskExecution } from "../src/api/telemetry";
import { MnesticClient } from "../src/memory/mnesticClient";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const planRunId = continuousHostPlanRunId("opencode", "continuous-start");

beforeAll(async () => {
  setMemoryClient(client);
  await registerSubtask({
    subtask_id: "continuous_subtask",
    goal: "continuous host test",
    context: {},
    status: "active",
    utility_queries: 0,
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
  });
  await beginSubtaskExecution({
    subtask_event_id: "continuous_subtask_event",
    subtask_id: "continuous_subtask",
    baseline_id: "continuous_baseline",
    mandate_json: {
      scope: {},
      policy_version: "p1",
      source_actor: "vitest",
      strength: "explicit",
      mode: "enforce",
      budget: {},
    },
  });
});

describe("continuous-host contract v0.1", () => {
  it("start 使用确定性 ID 且重复 start 不重复建单", async () => {
    const input = {
      subtask_event_id: "continuous_subtask_event",
      attempt: 1,
      host_type: "opencode" as const,
      host_session_ref: "session-continuous",
      idempotency_key: "continuous-start",
    };
    const first = await startContinuousHost(input);
    const second = await startContinuousHost(input);
    expect(first).toMatchObject({ gate: "pass", planRunId, reused: false });
    expect(second).toMatchObject({ gate: "pass", planRunId, reused: true });
  });

  it("deliver/stop/report 与 answer 均确定性去重，回答只唤醒一次", async () => {
    expect((await deliverContinuousHost({
      plan_run_id: planRunId,
      external_id: "deliver-1",
      payload_json: { input: "S01" },
    })).reused).toBe(false);
    expect((await deliverContinuousHost({
      plan_run_id: planRunId,
      external_id: "deliver-1",
      payload_json: { input: "S01" },
    })).reused).toBe(true);
    expect((await stopContinuousHost({
      plan_run_id: planRunId,
      external_id: "stop-1",
      reason: "acceptance",
    })).reused).toBe(false);
    expect((await reportContinuousHost({
      plan_run_id: planRunId,
      external_id: "report-1",
      report: { status: "done" },
    })).reused).toBe(false);
    expect((await answerContinuousHost({
      plan_run_id: planRunId,
      host_question_ref: "question-1",
      answer_event_id: "answer-1",
      answer: { selected: ["yes"] },
    })).reused).toBe(false);
    expect((await answerContinuousHost({
      plan_run_id: planRunId,
      host_question_ref: "question-1",
      answer_event_id: "answer-1",
      answer: { selected: ["yes"] },
    })).reused).toBe(true);

    const status = await getContinuousHostStatus(planRunId);
    expect(status.planRun?.status).toBe("completed");
    expect(status.events.map((event) => event.event_type).sort()).toEqual(["answer", "deliver", "report", "stop"]);
    expect(status.events).toHaveLength(4);
  });
});
