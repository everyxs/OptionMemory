import { beforeAll, describe, expect, it } from "vitest";
import { setMemoryClient } from "../src/api/memory";
import { registerPlanner } from "../src/api/planner-registry";
import { registerModel, registerOption, registerSubtask } from "../src/api/registry";
import {
  beginOptionExecution,
  beginPlannerEvent,
  beginPlanRun,
  beginSubtaskExecution,
  finishOptionExecution,
  getExecutionTrace,
  getOptionEvidence,
  getSubtaskDecisionChain,
  recordModelEvent,
  recordOptionObservation,
  recordPlannerDecision,
} from "../src/api/telemetry";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { PlannerRow } from "../src/memory/planner";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const ids = {
  subtaskEvent: "subtask_event_telemetry",
  planRun: "plan_run_telemetry",
  plannerEvent: "planner_event_telemetry",
  optionEvent: "option_event_telemetry",
};

const planner: PlannerRow = {
  planner_id: "planner_telemetry",
  claim: "telemetry planner",
  layer: "planner",
  j_premise_ids: [],
  instructions_ref: "planner/instructions/v1",
  instructions_version: "1.0",
  inference_ref: "test-llm",
  context_policy: { policy_version: "p1" },
  decision_schema: { type: "object" },
  tool_policy: {},
  budget_policy: {},
  eps_type: "confidence",
  eps_value: 0.5,
  eps_source: "uncalibrated",
  lin_source: "test",
  lin_version: "1.0",
  lin_theta: null,
  lin_actor: "vitest",
  verify: "planner-schema-v0.1",
  status: "active",
};

beforeAll(async () => {
  setMemoryClient(client);
  await registerSubtask({
    subtask_id: "measure_planner_s01",
    goal: "planner telemetry",
    context: {},
    status: "active",
    utility_queries: 0,
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
  });
  await registerPlanner(planner);
  await registerOption({
    option_id: "planner_measure_option",
    claim: "planner measure option",
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: {},
    pi_type: "measure",
    pi_ref: "hardness-test",
    pi_fallback: "none",
    beta_success: {},
    beta_output_schema: {},
    rule_ref: null,
    j_premise_ids: [],
    eps_type: "confidence",
    eps_value: 0.5,
    eps_source: "uncalibrated",
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    verify: "settlement+rollout_success",
    status: "probation",
    subtask_binding: "measure_planner_s01",
    model_binding: "planner_measure_model",
    input_schema: { type: "object" },
  });
  await registerModel({
    model_id: "planner_measure_model",
    option_id: "planner_measure_option",
    claim: "uncalibrated",
    layer: "model",
    achievable_probability: 0,
    calibration_history: [],
    prediction_error: 0,
    cost_model: { observed: false },
    theta_version: "",
    estimated_initiation_region: "",
    eps_type: "confidence",
    eps_value: 0.5,
    eps_source: "uncalibrated",
    status: "probation",
    j_records: [],
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    verify: "settlement+rollout_success",
    reasoning_spec: null,
    evidence_spec: { required: ["real"] },
    evaluation_spec: null,
  });
  expect((await beginSubtaskExecution({
    subtask_event_id: ids.subtaskEvent,
    subtask_id: "measure_planner_s01",
    baseline_id: "baseline_telemetry",
    mandate_json: {
      scope: {},
      policy_version: "p1",
      source_actor: "vitest",
      strength: "explicit",
      mode: "enforce",
      budget: {},
    },
  })).gate).toBe("pass");
  expect((await beginPlanRun({
    plan_run_id: ids.planRun,
    subtask_event_id: ids.subtaskEvent,
    attempt: 1,
    host_type: "opencode",
    host_session_ref: "session-telemetry",
    idempotency_key: "telemetry-start",
    mapping_version: "continuous-host-v0.1",
  })).gate).toBe("pass");
  expect((await beginPlannerEvent({
    planner_event_id: ids.plannerEvent,
    subtask_event_id: ids.subtaskEvent,
    plan_run_id: ids.planRun,
    planner_id: "planner_telemetry",
    context_json: {
      state_snapshot_ref: "state-1",
      state_hash: "hash-1",
      instructions_version: "1.0",
      inference_ref: "test-llm",
      policy_version: "p1",
      evidence_refs: [],
    },
  })).gate).toBe("pass");
  expect((await recordPlannerDecision({
    planner_event_id: ids.plannerEvent,
    decision_type: "execute",
    decision_json: {
      decision: "execute",
      option_id: "planner_measure_option",
      arguments: {},
      rationale: "telemetry",
      evidence_refs: [],
      uncertainties: [],
    },
  })).gate).toBe("pass");
  expect((await beginOptionExecution({
    option_event_id: ids.optionEvent,
    planner_event_id: ids.plannerEvent,
    option_id: "planner_measure_option",
    model_id: "planner_measure_model",
    execution_json: {
      option_version: "1.0",
      pi_type: "measure",
      pi_ref: "hardness-test",
      pi_theta: null,
      attempt: 1,
      mode: "real",
    },
  })).gate).toBe("pass");
  await recordOptionObservation({
    option_event_id: ids.optionEvent,
    observation_type: "input",
    value_json: { entity: "S01" },
  });
  await recordOptionObservation({
    option_event_id: ids.optionEvent,
    observation_type: "output",
    value_json: { status: "measured" },
  });
  await finishOptionExecution({
    option_event_id: ids.optionEvent,
    status: "success",
    evaluation_json: { verdict: "accepted", goal_progress: {}, reward_components: {}, terminal: true },
    cost_json: { observed: false },
    error_json: {},
  });
  await recordModelEvent({
    model_id: "planner_measure_model",
    event_type: "critique",
    payload_json: { rationale: null, calibration: "uncalibrated" },
  });
});

describe("Phase 3 event schema v0.2 and execution graph", () => {
  it("完整遍历 subtask → plan_run → planner_event → option_event → option/model", async () => {
    const trace = await getExecutionTrace(ids.optionEvent);
    expect(trace?.subtaskEvent?.subtask_event_id).toBe(ids.subtaskEvent);
    expect(trace?.planRun?.plan_run_id).toBe(ids.planRun);
    expect(trace?.plannerEvent?.planner_id).toBe("planner_telemetry");
    expect(trace?.plannerDecision?.decision_type).toBe("execute");
    expect(trace?.option?.option_id).toBe("planner_measure_option");
    expect(trace?.model?.model_id).toBe("planner_measure_model");
    expect(trace?.inputSchema?.input_schema).toEqual({ type: "object" });
    expect(trace?.modelSpecs?.evidence_spec).toEqual({ required: ["real"] });
    expect(trace?.observations).toHaveLength(2);
    expect(trace?.outcome?.status).toBe("success");
    expect(trace?.outcome?.evaluation_json.scalar_reward).toBeNull();
  });

  it("decision chain 和 option evidence 可回查", async () => {
    const chain = await getSubtaskDecisionChain(ids.subtaskEvent);
    expect(chain).toHaveLength(1);
    expect(chain[0].decision?.decision_type).toBe("execute");
    expect(chain[0].optionEvents[0].option_event_id).toBe(ids.optionEvent);
    const evidence = await getOptionEvidence("planner_measure_option");
    expect(evidence?.events).toHaveLength(1);
    expect(evidence?.events[0].outcome?.evaluation_json.scalar_reward).toBeNull();
  });

  it("非 execute 不得伪造 option_id，未决策不得创建 option_event，重复 outcome 被拒绝", async () => {
    expect((await recordPlannerDecision({
      planner_event_id: ids.plannerEvent,
      decision_type: "wait",
      decision_json: { decision: "wait", option_id: "forbidden" },
    })).gate).toBe("blocked");
    expect((await beginOptionExecution({
      planner_event_id: "planner_event_without_decision",
      option_id: "planner_measure_option",
      model_id: "planner_measure_model",
      execution_json: { attempt: 1, mode: "real", pi_ref: "hardness-test" },
    })).gate).toBe("blocked");
    expect((await finishOptionExecution({
      option_event_id: ids.optionEvent,
      status: "failure",
      evaluation_json: { verdict: "reject" },
      cost_json: {},
      error_json: { duplicate: true },
    })).gate).toBe("blocked");
  });
});
