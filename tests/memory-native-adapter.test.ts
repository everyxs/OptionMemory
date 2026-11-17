import { beforeAll, describe, expect, it } from "vitest";
import { setMemoryClient } from "../src/api/memory";
import { registerModel, registerOption, registerSubtask } from "../src/api/registry";
import { registerPlanner } from "../src/api/planner-registry";
import { beginPlanRun, beginSubtaskExecution, getExecutionTrace } from "../src/api/telemetry";
import { submitPlannerDecision } from "../src/runtime/planner";
import { optionEventIdFor } from "../src/runtime/option-executor";
import { registerNativeSkillOption } from "../src/runtime/native-skill";
import { MnesticClient } from "../src/memory/mnesticClient";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const subtaskId = "native_adapter_subtask";
const optionId = "native_read_only";
const modelId = "model_native_read_only";
const plannerId = "native_adapter_planner";
const planRunId = "plan_run_native_adapter";
const calls: string[] = [];
const controllers = new Map<string, AbortController>();

beforeAll(async () => {
  setMemoryClient(client);
  await registerSubtask({
    subtask_id: subtaskId,
    goal: "Minimal NativeAdapter proof",
    context: {},
    status: "active",
    utility_queries: 0,
    lin_source: "native-adapter-test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
  });
  await registerPlanner({
    planner_id: plannerId,
    claim: "NativeAdapter test Planner",
    layer: "planner",
    j_premise_ids: [],
    instructions_ref: "native/v1",
    instructions_version: "1.0",
    inference_ref: "contract-test",
    context_policy: {},
    decision_schema: {},
    tool_policy: {},
    budget_policy: {},
    eps_type: "confidence",
    eps_value: 0.5,
    eps_source: "uncalibrated",
    lin_source: "native-adapter-test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    verify: "planner-schema-v0.1",
    status: "active",
  });
  await registerOption({
    option_id: optionId,
    claim: "Minimal native read-only Skill",
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: {},
    pi_type: "skill",
    pi_ref: "native-read-only@v1",
    pi_fallback: "none",
    beta_success: {},
    beta_output_schema: { type: "object" },
    rule_ref: null,
    j_premise_ids: [],
    eps_type: "in-degree",
    eps_value: 0.5,
    eps_source: "inferred-prior",
    lin_source: "native-adapter-test",
    lin_version: "1.0",
    lin_theta: null,
    verify: "native-adapter-v1",
    status: "probation",
    subtask_binding: subtaskId,
    model_binding: modelId,
    input_schema: {
      type: "object",
      required: ["mode", "key"],
      properties: { mode: { type: "string" }, key: { type: "string" } },
      additionalProperties: false,
    },
  });
  await registerModel({
    model_id: modelId,
    option_id: optionId,
    claim: "uncalibrated",
    layer: "model",
    achievable_probability: 0,
    calibration_history: [],
    prediction_error: 0,
    cost_model: { observed: false },
    theta_version: "1.0",
    estimated_initiation_region: "",
    eps_type: "in-degree",
    eps_value: 0.5,
    eps_source: "inferred-prior",
    status: "probation",
    j_records: [],
    lin_source: "native-adapter-test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    verify: "native-adapter-v1",
    reasoning_spec: null,
    evidence_spec: { required: ["real"] },
    evaluation_spec: null,
  });
  registerNativeSkillOption("skill", "native-read-only@v1", async (args, context) => {
    const key = String(args.key);
    calls.push(key);
    expect(context.host_context).toEqual({ agent: "native-parent" });
    if (args.mode === "failure") throw new Error("native failure");
    if (args.mode === "cancel") controllers.get(key)?.abort();
    return {
      output: args.mode === "permission" ? { blocked: ["permission_denied"] } : { value: "native-result" },
      evaluation: { scalar_reward: null },
      model_events: args.mode === "success" ? [{
        event_type: "anticipation",
        payload_json: { predicted: "native-result", option_event_key: key },
      }] : undefined,
    };
  });
  const subtask = await beginSubtaskExecution({
    subtask_event_id: "subtask_event_native_adapter",
    subtask_id: subtaskId,
    baseline_id: "native-adapter-baseline",
    mandate_json: {
      scope: { option_ids: [optionId], allowed_effects: ["execute"] },
      policy_version: "native-adapter-v1",
      source_actor: "native-test",
      strength: "explicit",
      mode: "enforce",
      budget: { max_steps: 10 },
    },
  });
  expect(subtask.gate).toBe("pass");
  expect((await beginPlanRun({
    plan_run_id: planRunId,
    subtask_event_id: subtask.id,
    attempt: 1,
    host_type: "opencode",
    host_session_ref: "native-session",
    idempotency_key: "native-plan-start",
    mapping_version: "native-adapter-v1",
  })).gate).toBe("pass");
});

async function execute(mode: string, key: string) {
  const controller = new AbortController();
  controllers.set(key, controller);
  return submitPlannerDecision({
    plan_run_id: planRunId,
    planner_id: plannerId,
    idempotency_key: key,
    state_snapshot_ref: key,
    state_hash: key,
    signal: controller.signal,
    host_context: { agent: "native-parent" },
    decision: {
      decision: "execute",
      option_id: optionId,
      arguments: { mode, key },
      rationale: "NativeAdapter contract test",
      evidence_refs: [key],
      uncertainties: [],
    },
  });
}

describe("minimal NativeAdapter", () => {
  it("executes a real native Option and persists anticipation without replay", async () => {
    const result = await execute("success", "native-success");
    expect(result.execution?.reason).toBeUndefined();
    expect(result).toMatchObject({ execution: { status: "success" } });
    const trace = await getExecutionTrace(optionEventIdFor("native-success"));
    expect(trace?.optionEvent.execution_json.mode).toBe("real");
    expect(trace?.outcome?.status).toBe("success");
    const modelEvents = await client.execute("?[model_event_id, event_type, payload_json] := *model_event{model_event_id, model_id, event_type, payload_json}, model_id == $id", { id: modelId });
    expect(modelEvents.rows).toHaveLength(1);
    expect(modelEvents.rows[0][1]).toBe("anticipation");
    expect(modelEvents.rows[0][2]).toMatchObject({ predicted: "native-result", option_event_key: "native-success" });
    const duplicate = await execute("success", "native-success");
    expect(duplicate.reused).toBe(true);
    expect(calls.filter((key) => key === "native-success")).toHaveLength(1);
  });

  it("records failure and permission denial as real outcomes", async () => {
    expect((await execute("failure", "native-failure")).execution?.status).toBe("failure");
    expect((await getExecutionTrace(optionEventIdFor("native-failure")))?.outcome?.error_json).toMatchObject({ kind: "implementation_error", message: "native failure" });
    expect((await execute("permission", "native-permission")).execution?.status).toBe("failure");
    expect((await getExecutionTrace(optionEventIdFor("native-permission")))?.outcome?.error_json).toMatchObject({ kind: "beta_success" });
  });

  it("records cancellation without converting it to sidecar evidence", async () => {
    const result = await execute("cancel", "native-cancel");
    expect(result.execution?.status).toBe("blocked");
    const trace = await getExecutionTrace(optionEventIdFor("native-cancel"));
    expect(trace?.optionEvent.execution_json.mode).toBe("real");
    expect(trace?.outcome?.status).toBe("blocked");
    expect(trace?.outcome?.error_json).toMatchObject({ kind: "cancelled" });
  });
});
