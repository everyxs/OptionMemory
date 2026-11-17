import { beforeAll, describe, expect, it } from "vitest";
import { registerPlanner } from "../src/api/planner-registry";
import { setMemoryClient } from "../src/api/memory";
import { registerModel, registerOption } from "../src/api/registry";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { PlannerRow } from "../src/memory/planner";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });

const planner: PlannerRow = {
  planner_id: "planner_s01",
  claim: "S01 evidence planner",
  layer: "planner",
  j_premise_ids: [],
  instructions_ref: "planner/instructions/v1",
  instructions_version: "1.0",
  inference_ref: "test-llm",
  context_policy: { policy_version: "p1" },
  decision_schema: { type: "object" },
  tool_policy: { allowed: ["deriveClosure"] },
  budget_policy: { max_steps: 4 },
  eps_type: "confidence",
  eps_value: 0.5,
  eps_source: "uncalibrated",
  lin_source: "phase3-test",
  lin_version: "1.0",
  lin_theta: null,
  lin_actor: "vitest",
  verify: "planner-schema-v0.1",
  status: "active",
};

beforeAll(() => {
  setMemoryClient(client);
});

describe("Phase 3 Planner-ready assets", () => {
  it("注册 Planner 并回查 instructions/inference/policy 版本", async () => {
    expect(await registerPlanner(planner)).toMatchObject({ id: "planner_s01", gate: "pass" });
    const result = await client.getPlannerById("planner_s01");
    expect(result.rows).toHaveLength(1);
    const row = Object.fromEntries(result.headers.map((header, index) => [header, result.rows[0][index]]));
    expect(row).toMatchObject({
      layer: "planner",
      instructions_ref: "planner/instructions/v1",
      instructions_version: "1.0",
      inference_ref: "test-llm",
      context_policy: { policy_version: "p1" },
      status: "active",
    });
  });

  it("缺少 inference_ref 时 blocked 且不写入", async () => {
    const result = await registerPlanner({ ...planner, planner_id: "planner_invalid", inference_ref: "" });
    expect(result.gate).toBe("blocked");
    expect((await client.getPlannerById("planner_invalid")).rows).toHaveLength(0);
  });

  it("Option input_schema 与 Model 三类 spec 通过兼容关联表保存", async () => {
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
      subtask_binding: "planner_measure_subtask",
      model_binding: "planner_measure_model",
      input_schema: { type: "object", required: ["sample"] },
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
      reasoning_spec: { anticipation: null },
      evidence_spec: { required: ["real"] },
      evaluation_spec: { verdict: null },
    });
    const optionResult = await client.getOptionById("planner_measure_option");
    expect(optionResult.rows[0][optionResult.headers.indexOf("input_schema")]).toEqual({ type: "object", required: ["sample"] });
    const modelResult = await client.getModelById("planner_measure_model");
    expect(modelResult.rows[0][modelResult.headers.indexOf("reasoning_spec")]).toEqual({ anticipation: null });
    expect(modelResult.rows[0][modelResult.headers.indexOf("evidence_spec")]).toEqual({ required: ["real"] });
    expect(modelResult.rows[0][modelResult.headers.indexOf("evaluation_spec")]).toEqual({ verdict: null });
  });
});
