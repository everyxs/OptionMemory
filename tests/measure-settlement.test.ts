import { beforeAll, describe, expect, it } from "vitest";
import { detectAndIsolateHardnessConflicts, revoke, settle, type GovernanceActionResult } from "../src/api/governance";
import { memory_set_batch, setMemoryClient } from "../src/api/memory";
import { registerModel, registerOption, registerSubtask } from "../src/api/registry";
import type { ModelRow } from "../src/memory/assets";
import { MnesticClient, type NamedRows } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import { setNuGateMode } from "../src/runtime/nuGate";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const factIds: Record<"literature" | "experiment", string> = { literature: "", experiment: "" };
let settled: GovernanceActionResult;
let revoked: GovernanceActionResult;

function rowsToObjects<T>(result: NamedRows): T[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T,
  );
}

function hardness(value: string, source: string): FactInput {
  return {
    predicate: "hardness",
    args: ["S04", value],
    claim: `hardness(S04, ${value})`,
    layer: "semantic",
    jPremiseIds: [],
    epsType: "confidence",
    epsValue: 0.8,
    epsSource: source,
    linSource: source,
    linVersion: "1.0",
    linActor: "vitest",
    verify: "measurement",
    status: "in",
  };
}

function optionId(source: "literature" | "experiment"): string {
  return `measure_hardness_${source}_s04`;
}

function modelId(source: "literature" | "experiment"): string {
  return `model_measure_hardness_${source}_s04`;
}

function decision(factId: string, opposingFactId: string) {
  return {
    factId,
    opposingFactId,
    proposer: "materials-agent",
    arbiter: "reviewer-01",
    executor: "governance-service",
    rationale: "S04 measure settlement",
  };
}

async function registerMeasureAssets(source: "literature" | "experiment") {
  await registerOption({
    option_id: optionId(source),
    claim: `测量 S04 硬度（${source}）`,
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: { requires: ["hardness(S04)"] },
    pi_type: "measure",
    pi_ref: "hardness-test",
    pi_fallback: "none",
    beta_success: { measured: true },
    beta_output_schema: { predicate: "hardness" },
    rule_ref: null,
    j_premise_ids: [factIds[source]],
    eps_type: "confidence",
    eps_value: 0.8,
    eps_source: source,
    lin_source: source,
    lin_version: "1.0",
    lin_theta: null,
    verify: "settlement+rollout_success",
    status: "probation",
    subtask_binding: "measure_S04",
    model_binding: modelId(source),
  });
  await registerModel({
    model_id: modelId(source),
    option_id: optionId(source),
    claim: `achievable(S04, ${optionId(source)}, uncalibrated)`,
    layer: "model",
    achievable_probability: 0,
    calibration_history: [{ observed: false, achievable_probability: null, prediction_error: null }],
    prediction_error: 0,
    cost_model: { observed: false, monetary: null, latency_ms: null },
    theta_version: "",
    estimated_initiation_region: "",
    eps_type: "confidence",
    eps_value: 0.5,
    eps_source: "uncalibrated",
    status: "probation",
    j_records: [],
    lin_source: source,
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    verify: "settlement+rollout_success",
  });
}

beforeAll(async () => {
  setMemoryClient(client);
  setNuGateMode("enforce");
  const written = await memory_set_batch([
    hardness("450 HV", "literature"),
    hardness("512 HV", "experiment"),
  ]);
  [factIds.literature, factIds.experiment] = written.ids as [string, string];
  await registerSubtask({
    subtask_id: "measure_S04",
    goal: "测量并裁决 S04 硬度",
    context: { entity: "S04", predicate: "hardness" },
    status: "active",
    utility_queries: 0,
    lin_source: "phase3-measure",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
  });
  await registerMeasureAssets("literature");
  await registerMeasureAssets("experiment");
  await detectAndIsolateHardnessConflicts("S04");
  settled = await settle(optionId("experiment"), decision(factIds.experiment, factIds.literature));
  revoked = await revoke(optionId("literature"), decision(factIds.literature, factIds.experiment));
});

describe("Phase 3 measure option/model settlement", () => {
  it("measure subtask/option/model 绑定与 settled/retracted 状态一致", async () => {
    const options = await client.listOptions();
    for (const source of ["literature", "experiment"] as const) {
      const option = options.find((row) => row.option_id === optionId(source));
      expect(option).toMatchObject({
        option_type: "atomic",
        template_id: null,
        subtask_binding: "measure_S04",
        model_binding: modelId(source),
        status: source === "experiment" ? "settled" : "revoked",
      });
      const model = rowsToObjects<ModelRow>(await client.getModelById(modelId(source)))[0];
      expect(model.option_id).toBe(optionId(source));
      expect(model.status).toBe(source === "experiment" ? "settled" : "retracted");
    }
    expect(settled.modelId).toBe(modelId("experiment"));
    expect(settled.modelStatus).toBe("settled");
    expect(revoked.modelId).toBe(modelId("literature"));
    expect(revoked.modelStatus).toBe("retracted");
  });

  it("Model 通过 j_records 关联同一治理事件，且未虚构成本、误差或校准指标", async () => {
    const experiment = rowsToObjects<ModelRow>(await client.getModelById(modelId("experiment")))[0];
    const literature = rowsToObjects<ModelRow>(await client.getModelById(modelId("literature")))[0];
    expect(experiment.j_records).toEqual([settled.eventId]);
    expect(literature.j_records).toEqual([revoked.eventId]);
    for (const model of [experiment, literature]) {
      expect(model.calibration_history).toEqual([{
        observed: false,
        achievable_probability: null,
        prediction_error: null,
      }]);
      expect(model.cost_model).toEqual({ observed: false, monetary: null, latency_ms: null });
      expect(model.achievable_probability).toBe(0);
    }
  });

  it("重复结算不重复添加 Model 血缘", async () => {
    const repeatedSettle = await settle(optionId("experiment"), decision(factIds.experiment, factIds.literature));
    const repeatedRevoke = await revoke(optionId("literature"), decision(factIds.literature, factIds.experiment));
    expect(repeatedSettle.reused).toBe(true);
    expect(repeatedRevoke.reused).toBe(true);
    const experiment = rowsToObjects<ModelRow>(await client.getModelById(modelId("experiment")))[0];
    const literature = rowsToObjects<ModelRow>(await client.getModelById(modelId("literature")))[0];
    expect(experiment.j_records).toEqual([settled.eventId]);
    expect(literature.j_records).toEqual([revoked.eventId]);
  });
});
