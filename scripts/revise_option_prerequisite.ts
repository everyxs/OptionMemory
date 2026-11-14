import type { FactInput } from "../src/memory/schema";
import type { RuleRow } from "../src/memory/assets";

const { memory_get, memory_set_batch, setMemoryClient } =
  require("../dist/api/memory.js") as typeof import("../src/api/memory");
const { registerRule, registerSubtask, registerOption, registerModel } =
  require("../dist/api/registry.js") as typeof import("../src/api/registry");
const { registerProceduralKnowledge, retractOptionPrerequisite, restoreOptionPrerequisite } =
  require("../dist/api/optionRevision.js") as typeof import("../src/api/optionRevision");
const { deriveClosure } =
  require("../dist/runtime/deriveClosure.js") as typeof import("../src/runtime/deriveClosure");
const { setNuGateMode } =
  require("../dist/runtime/nuGate.js") as typeof import("../src/runtime/nuGate");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const ENDPOINT = process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9074/text-query";
const SOURCE = process.env.SOURCE_MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const OPTION_ID = "infer_phase_structure_from_xrd";
const PROCEDURAL_ID = "pk_infer_phase_S01";
const client = new MnesticClient({ endpoint: ENDPOINT, timeoutMs: 60_000 });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function xrd(angle: string, phase: string): FactInput {
  return {
    predicate: "xrd_peak",
    args: ["S01", angle, phase],
    claim: `xrd_peak(S01, ${angle}, ${phase})`,
    layer: "semantic",
    jPremiseIds: [],
    epsType: "measurement",
    epsValue: 0.9,
    epsSource: "placeholder-pending-measurement",
    linSource: "xrd_parser_v1.2",
    linVersion: "v1.2",
    linActor: "phase2-step5",
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
  lin_source: "phase1-rules",
  lin_version: "1.0",
  lin_theta: null,
  lin_actor: "phase2-step5",
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
    lin_source: "phase1-rules",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "phase2-step5",
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
    lin_source: "phase1-rules",
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
    lin_source: "phase1-rules",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "phase2-step5",
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
    lin_source: "phase1-rules",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "phase2-step5",
    verify: "option-prerequisite",
    status: "in",
  });
  const peaks = await memory_set_batch([xrd("44.5°", "FCC(111)"), xrd("44.7°", "BCC(110)")]);
  await deriveClosure({ entity: "S01" });
  const phase = await client.execute(
    `?[id] := *facts{id, predicate, args}, predicate == "phase_structure", first(args) == "S01"`,
  );
  assert(phase.rows.length === 1, "phase_structure 未唯一命中");
  return { fccId: peaks.ids[0]!, phaseId: String(phase.rows[0][0]) };
}

async function optionStatus() {
  const result = await client.getOptionById(OPTION_ID);
  return String(result.rows[0][result.headers.indexOf("status")]);
}

async function proceduralStatus() {
  const result = await client.getProceduralKnowledgeByOptionId(OPTION_ID);
  return String(result.rows[0][result.headers.indexOf("status")]);
}

async function revisionCount(id: string) {
  const result = await client.execute(
    `?[count(id)] := *facts{id, predicate, args}, predicate == "revision", first(args) == $id`,
    { id },
  );
  return Number(result.rows[0][0]);
}

async function main() {
  if (SOURCE === ENDPOINT) throw new Error("source 与 target 必须不同，禁止在生产实例执行修订测试");
  const { fccId, phaseId } = await seed();
  const started = Date.now();
  const retracted = await retractOptionPrerequisite(OPTION_ID, fccId, { actor: "phase2-step5" });
  const retractMs = Date.now() - started;
  assert(retracted.gate === "pass" && (await optionStatus()) === "out", "Option 未按前提失效");
  assert((await proceduralStatus()) === "out", "procedural knowledge 未标 out");
  assert((await memory_get(phaseId))?.status === "out", "phase_structure 未失效");
  assert(retracted.affectedFacts?.includes(phaseId), "affected 集合缺少 phase_structure");
  const firstRetractRevisions = await revisionCount(OPTION_ID);
  await retractOptionPrerequisite(OPTION_ID, fccId, { actor: "phase2-step5" });
  assert(await revisionCount(OPTION_ID) === firstRetractRevisions, "重复撤回产生重复 revision");

  const restoreStarted = Date.now();
  const restored = await restoreOptionPrerequisite(OPTION_ID, fccId, { actor: "phase2-step5" });
  const restoreMs = Date.now() - restoreStarted;
  assert(restored.gate === "pass" && (await optionStatus()) === "probation", "Option 未恢复到 probation");
  assert((await proceduralStatus()) === "in", "procedural knowledge 未恢复 in");
  assert((await memory_get(phaseId))?.status === "in", "phase_structure 未恢复");
  assert(restored.affectedFacts?.includes(phaseId), "恢复 affected 集合缺少 phase_structure");
  const firstRestoreRevisions = await revisionCount(OPTION_ID);
  await restoreOptionPrerequisite(OPTION_ID, fccId, { actor: "phase2-step5" });
  assert(await revisionCount(OPTION_ID) === firstRestoreRevisions, "重复恢复产生重复 revision");

  const model = await client.execute(
    `?[status] := *models{model_id, status}, model_id == "model_infer_phase_xrd_v1"`,
  );
  assert(model.rows[0][0] === "probation", "model 被删除或状态被误改");
  console.log(JSON.stringify({
    scenario: "Phase2-OptionPrerequisite-01",
    affected: retracted.affectedFacts,
    restoredAffected: restored.affectedFacts,
    option: await optionStatus(),
    procedural: await proceduralStatus(),
    phaseStructure: (await memory_get(phaseId))?.status,
    model: model.rows[0][0],
    optionRevisions: await revisionCount(OPTION_ID),
    proceduralRevisions: await revisionCount(PROCEDURAL_ID),
    timings: { retractMs, restoreMs },
  }, null, 2));
  console.log("PHASE2_STEP5_PASS");
}

main().catch((error) => {
  console.error("ERR", error);
  process.exitCode = 1;
});
