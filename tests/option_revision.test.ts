import { beforeAll, describe, expect, it } from "vitest";
import { memory_get, memory_set_batch, setMemoryClient } from "../src/api/memory";
import { registerModel, registerOption, registerRule, registerSubtask } from "../src/api/registry";
import { registerProceduralKnowledge, retractOptionPrerequisite, restoreOptionPrerequisite } from "../src/api/optionRevision";
import { deriveClosure } from "../src/runtime/deriveClosure";
import { setNuGateMode } from "../src/runtime/nuGate";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import type { RuleRow } from "../src/memory/assets";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const OPTION_ID = "infer_phase_structure_from_xrd";
const PROCEDURAL_ID = "pk_infer_phase_S01";
let fccId = "";
let phaseId = "";
let compositionId = "";

function xrd(angle: string, phase: string): FactInput {
  return {
    predicate: "xrd_peak",
    args: ["S01", angle, phase],
    claim: `xrd_peak(S01, ${angle}, ${phase})`,
    layer: "semantic",
    jPremiseIds: [],
    epsType: "measurement",
    epsValue: 0.9,
    epsSource: "unit-test",
    linSource: "xrd_parser_v1.2",
    linVersion: "v1.2",
    linActor: "vitest",
    verify: "seed",
    status: "in",
  };
}

const r2: RuleRow = {
  rule_id: "R2",
  horn_body: "xrd_peak(X, A, FCC) and xrd_peak(X, B, BCC)",
  horn_head: "phase_structure(X, BCC+FCC)",
  opt_i: {},
  opt_pi: {},
  opt_beta: {},
  layer: "knowledge+option",
  lin_source: "test",
  lin_version: "1.0",
  lin_theta: null,
  lin_actor: "vitest",
  status: "in",
};

async function seed() {
  setMemoryClient(client);
  setNuGateMode("enforce");
  await registerRule(r2);
  await registerSubtask({
    subtask_id: "infer_phase_S01",
    goal: "推断 S01 相结构",
    context: {},
    status: "active",
    utility_queries: 0,
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
  });
  await registerOption({
    option_id: OPTION_ID,
    claim: "从 XRD 峰位推断相结构",
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: { requires: ["xrd_peak(FCC(111))", "xrd_peak(BCC(110))"] },
    pi_type: "api",
    pi_ref: "deriveClosure(R2)",
    pi_fallback: "none",
    beta_success: { derived: "phase_structure(X, BCC+FCC)", with_justification: true },
    beta_output_schema: { predicate: "phase_structure", args: ["X", "phases"] },
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
    subtask_binding: "infer_phase_S01",
    model_binding: "model_infer_phase_xrd_v1",
  });
  await registerModel({
    model_id: "model_infer_phase_xrd_v1",
    option_id: OPTION_ID,
    claim: "achievable(S01, infer_phase_structure_from_xrd, ε0)",
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
  });
  await registerProceduralKnowledge({
    id: PROCEDURAL_ID,
    claim: "achievable(S01, infer_phase_structure_from_xrd, 0.9)",
    layer: "procedural",
    s_id: "infer_phase_S01",
    o_id: OPTION_ID,
    m_id: "model_infer_phase_xrd_v1",
    fidelity: null,
    eps_value: 0.9,
    eps_ceiling: 0.95,
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    verify: "option-prerequisite",
    status: "in",
  });
  const peaks = await memory_set_batch([xrd("44.5°", "FCC(111)"), xrd("44.7°", "BCC(110)")]);
  fccId = peaks.ids[0]!;
  await deriveClosure({ entity: "S01" });
  const phase = await client.execute(
    `?[id] := *facts{id, predicate, args}, predicate == "phase_structure", first(args) == "S01"`,
  );
  phaseId = String(phase.rows[0][0]);
  const composition = await memory_set_batch([{
    predicate: "composition",
    args: ["S01", "Al0.2Co0.2Cr0.2Fe0.2Ni0.2"],
    claim: "composition(S01, Al0.2Co0.2Cr0.2Fe0.2Ni0.2)",
    layer: "semantic",
    jPremiseIds: [],
    epsType: "in-degree",
    epsValue: 0.5,
    epsSource: "unit-test",
    linSource: "test",
    linVersion: "1.0",
    linActor: "vitest",
    verify: "seed",
    status: "in",
  }]);
  compositionId = composition.ids[0]!;
}

beforeAll(seed);

async function optionStatus() {
  const result = await client.getOptionById(OPTION_ID);
  return String(result.rows[0][result.headers.indexOf("status")]);
}

async function proceduralStatuses() {
  const result = await client.getProceduralKnowledgeByOptionId(OPTION_ID);
  return result.rows.map((row) => String(row[result.headers.indexOf("status")]));
}

async function revisionCount(id: string) {
  const result = await client.execute(
    `?[count(id)] := *facts{id, predicate, args}, predicate == "revision", first(args) == $id`,
    { id },
  );
  return Number(result.rows[0][0]);
}

describe("Phase 2 Option prerequisite cascade", () => {
  it("XRD 前提失效与恢复驱动 Option/Procedural Knowledge，且 Model 保留、操作幂等", async () => {
    const retracted = await retractOptionPrerequisite(OPTION_ID, fccId, { actor: "phase2-step5" });
    expect(retracted).toMatchObject({ gate: "pass", status: "out", proceduralIds: [PROCEDURAL_ID] });
    expect(retracted.affectedFacts).toEqual(expect.arrayContaining([fccId, phaseId]));
    expect(await optionStatus()).toBe("out");
    expect(await proceduralStatuses()).toEqual(["out"]);
    expect((await memory_get(phaseId))?.status).toBe("out");
    const model = await client.execute(
      `?[status] := *models{model_id, status}, model_id == "model_infer_phase_xrd_v1"`,
    );
    expect(model.rows[0][0]).toBe("probation");
    expect(await revisionCount(OPTION_ID)).toBe(1);
    expect(await revisionCount(PROCEDURAL_ID)).toBe(1);

    await retractOptionPrerequisite(OPTION_ID, fccId, { actor: "phase2-step5" });
    expect(await revisionCount(OPTION_ID)).toBe(1);
    expect(await revisionCount(PROCEDURAL_ID)).toBe(1);

    const restored = await restoreOptionPrerequisite(OPTION_ID, fccId, { actor: "phase2-step5" });
    expect(restored).toMatchObject({ gate: "pass", status: "probation", proceduralIds: [PROCEDURAL_ID] });
    expect(restored.affectedFacts).toEqual(expect.arrayContaining([fccId, phaseId]));
    expect(await optionStatus()).toBe("probation");
    expect(await proceduralStatuses()).toEqual(["in"]);
    expect((await memory_get(phaseId))?.status).toBe("in");
    expect(await revisionCount(OPTION_ID)).toBe(2);
    expect(await revisionCount(PROCEDURAL_ID)).toBe(2);

    await restoreOptionPrerequisite(OPTION_ID, fccId, { actor: "phase2-step5" });
    expect(await revisionCount(OPTION_ID)).toBe(2);
    expect(await revisionCount(PROCEDURAL_ID)).toBe(2);
  });

  it("非启动前提被 blocked，Option 保持原状态", async () => {
    const result = await retractOptionPrerequisite(OPTION_ID, compositionId, { actor: "phase2-step5" });
    expect(result.gate).toBe("blocked");
    expect(result.reason).toMatch(/not an initiation prerequisite/);
    expect(await optionStatus()).toBe("probation");
    expect(await revisionCount(OPTION_ID)).toBe(2);
  });
});
