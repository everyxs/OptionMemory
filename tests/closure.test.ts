import { beforeAll, describe, expect, it } from "vitest";
import { deriveClosure } from "../src/runtime/deriveClosure";
import { memory_set, setMemoryClient } from "../src/api/memory";
import { registerModel, registerOption, registerRule, registerSubtask } from "../src/api/registry";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { RuleRow } from "../src/memory/assets";
import type { FactInput } from "../src/memory/schema";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });

function rule(ruleId: string): RuleRow {
  return {
    rule_id: ruleId,
    horn_body: ruleId === "R2" ? "xrd_peak(FCC) and xrd_peak(BCC)" : "composition(X, C)",
    horn_head: `${ruleId}_head`,
    opt_i: {},
    opt_pi: {},
    opt_beta: {},
    layer: "knowledge+option",
    lin_source: "phase1-rules",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    status: "in",
  };
}

function composition(entity: string, value = "Fe50Ni50"): FactInput {
  return {
    predicate: "composition",
    args: [entity, value],
    claim: `composition(${entity}, ${value})`,
    layer: "knowledge",
    jPremiseIds: [],
    epsType: "in-degree",
    epsValue: 0.5,
    epsSource: "unit-test",
    linSource: "test-suite",
    linVersion: "1.0",
    linActor: "vitest",
    verify: "unit",
  };
}

function xrd(entity: string, phase: string): FactInput {
  return {
    ...composition(entity),
    predicate: "xrd_peak",
    args: [entity, phase === "FCC(111)" ? "44.5°" : "44.7°", phase],
    claim: `xrd_peak(${entity}, ${phase})`,
  };
}

beforeAll(async () => {
  setMemoryClient(client);
  for (const id of ["R1", "R2", "R3"]) {
    expect((await registerRule(rule(id))).gate).toBe("pass");
  }
});

describe("Phase 1 deriveClosure", () => {
  it("① R1 推出 candidate_solid_solution 且 active J 边落库", async () => {
    await memory_set(composition("CLOSURE_R1"));
    const result = await deriveClosure({ entity: "CLOSURE_R1" });
    expect(result.inserted).toBe(2);
    const derived = await client.execute(
      `?[id, j_premise_ids, j_rule_id] := *facts{id, predicate, args, j_premise_ids, j_rule_id}, predicate == "candidate_solid_solution", first(args) == "CLOSURE_R1"`,
    );
    expect(derived.rows).toHaveLength(1);
    expect(derived.rows[0][2]).toBe("R1");
    const justifications = await client.execute(
      `?[premise_ids, rule_id, active] := *justifications{derived_id, premise_ids, rule_id, active}, derived_id == $id`,
      { id: derived.rows[0][0] },
    );
    expect(justifications.rows).toHaveLength(1);
    expect(justifications.rows[0][0]).toEqual(derived.rows[0][1]);
    expect(justifications.rows[0][1]).toBe("R1");
    expect(justifications.rows[0][2]).toBe(true);
  });

  it("② 重复闭包派生 fact/J 边均不重复", async () => {
    const result = await deriveClosure({ entity: "CLOSURE_R1" });
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.justificationsInserted).toBe(0);
    expect(result.justificationsSkipped).toBe(2);
  });

  it("③ R3 对已知成分计算 smix 与期望一致", async () => {
    const rows = await client.execute(
      `?[args] := *facts{predicate, args}, predicate == "smix", first(args) == "CLOSURE_R1"`,
    );
    expect(rows.rows).toHaveLength(1);
    const args = rows.rows[0][0] as string[];
    expect(Number(args[1])).toBeCloseTo(-8.314 * Math.log(0.5), 12);
  });

  it("③b R3 兼容 S01 合计为 1 的原子分数成分", async () => {
    await memory_set(composition("CLOSURE_FRACTION", "Al0.2Co0.2Cr0.2Fe0.2Ni0.2"));
    await deriveClosure({ entity: "CLOSURE_FRACTION" });
    const rows = await client.execute(
      `?[args] := *facts{predicate, args}, predicate == "smix", first(args) == "CLOSURE_FRACTION"`,
    );
    expect(rows.rows).toHaveLength(1);
    const args = rows.rows[0][0] as string[];
    expect(Number(args[1])).toBeCloseTo(-8.314 * Math.log(0.2), 12);
  });

  it("④ registerRule 缺必填字段被 blocked 且不落库", async () => {
    const bad = rule("R_BAD");
    bad.horn_body = "";
    const result = await registerRule(bad);
    expect(result.gate).toBe("blocked");
    const stored = await client.execute(
      `?[count(rule_id)] := *rules{rule_id}, rule_id == "R_BAD"`,
    );
    expect(stored.rows[0][0]).toBe(0);
  });

  it("⑤ R2 join 两个 XRD 峰并保存两条前提", async () => {
    await memory_set(xrd("CLOSURE_XRD", "FCC(111)"));
    await memory_set(xrd("CLOSURE_XRD", "BCC(110)"));
    await deriveClosure({ entity: "CLOSURE_XRD" });
    const derived = await client.execute(
      `?[id, j_premise_ids] := *facts{id, predicate, args, j_premise_ids}, predicate == "phase_structure", first(args) == "CLOSURE_XRD"`,
    );
    expect(derived.rows).toHaveLength(1);
    expect(derived.rows[0][1]).toHaveLength(2);
    const justifications = await client.execute(
      `?[premise_ids, rule_id, active] := *justifications{derived_id, premise_ids, rule_id, active}, derived_id == $id`,
      { id: derived.rows[0][0] },
    );
    expect(justifications.rows).toHaveLength(1);
    expect(justifications.rows[0][0]).toEqual(derived.rows[0][1]);
    expect(justifications.rows[0][1]).toBe("R2");
    expect(justifications.rows[0][2]).toBe(true);
  });

  it("⑥ R4 未标定前禁止注册为 active 规则", async () => {
    const result = await registerRule(rule("R4"));
    expect(result.gate).toBe("blocked");
    expect(result.reason).toMatch(/calibration/);
    const stored = await client.execute(
      `?[count(rule_id)] := *rules{rule_id}, rule_id == "R4"`,
    );
    expect(stored.rows[0][0]).toBe(0);
  });
});

describe("Phase 1 asset registration", () => {
  it("⑦ v3 option 默认 atomic，并完成 subtask/model 入库", async () => {
    expect((await registerSubtask({
      subtask_id: "test_subtask",
      goal: "test",
      context: {},
      status: "active",
      utility_queries: 0,
      lin_source: "test",
      lin_version: "1.0",
      lin_theta: null,
      lin_actor: "vitest",
    }))).toMatchObject({ gate: "pass" });
    expect((await registerOption({
      option_id: "test_option",
      claim: "test option",
      layer: "option",
      i_preconditions: {},
      pi_type: "api",
      pi_ref: "deriveClosure(R2)",
      pi_fallback: "none",
      beta_success: {},
      beta_output_schema: {},
      rule_ref: "R2",
      j_premise_ids: [],
      eps_type: "in-degree",
      eps_value: 0.5,
      eps_source: "inferred-prior",
      lin_source: "test",
      lin_version: "1.0",
      lin_theta: null,
      verify: "settlement+rollout_success",
      status: "probation",
      subtask_binding: "test_subtask",
      model_binding: "test_model",
    }))).toMatchObject({ gate: "pass" });
    expect((await registerModel({
      model_id: "test_model",
      option_id: "test_option",
      claim: "achievable(test)",
      layer: "model",
      achievable_probability: 0,
      calibration_history: [],
      prediction_error: 0,
      cost_model: {},
      theta_version: "",
      estimated_initiation_region: "",
      eps_type: "in-degree",
      eps_value: 0.5,
      eps_source: "inferred-prior",
      status: "probation",
      j_records: [],
      lin_source: "test",
      lin_version: "1.0",
      lin_theta: null,
      lin_actor: "vitest",
      verify: "settlement+rollout_success",
    }))).toMatchObject({ gate: "pass" });
    const option = await client.execute(
      `?[option_type, template_id, subtask_binding, model_binding] := *options{option_id, option_type, template_id, subtask_binding, model_binding}, option_id == "test_option"`,
    );
    expect(option.rows[0]).toEqual(["atomic", null, "test_subtask", "test_model"]);
    const model = await client.execute(
      `?[count(model_id)] := *models{model_id}, model_id == "test_model"`,
    );
    expect(model.rows[0][0]).toBe(1);
  });
});
