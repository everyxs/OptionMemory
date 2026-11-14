/**
 * seed_phase1_assets.ts —— Phase 1 Step 3：R1–R3、S01 派生与 1:1:1 绑定。
 *
 * R4 暂缓，不注册。S01 第二 XRD 峰为占位值，eps_source 明确标记。
 * 所有写入均经服务层；重复执行应保持注册资产、派生 facts 和 J 边幂等。
 */
import type { FactInput } from "../src/memory/schema";
import type { RuleRow } from "../src/memory/assets";
const { memory_set_batch, setMemoryClient } =
  require("../dist/api/memory.js") as typeof import("../src/api/memory");
const { registerRule, registerSubtask, registerOption, registerModel } =
  require("../dist/api/registry.js") as typeof import("../src/api/registry");
const { deriveClosure } =
  require("../dist/runtime/deriveClosure.js") as typeof import("../src/runtime/deriveClosure");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";

function rule(
  ruleId: "R1" | "R2" | "R3",
  hornBody: string,
  hornHead: string,
  optI: unknown,
  optPi: unknown,
  optBeta: unknown,
): RuleRow {
  return {
    rule_id: ruleId,
    horn_body: hornBody,
    horn_head: hornHead,
    opt_i: optI,
    opt_pi: optPi,
    opt_beta: optBeta,
    layer: "knowledge+option",
    lin_source: "phase1-rules",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "seed_phase1_assets",
    status: "in",
  };
}

const RULES = [
  rule(
    "R1",
    "composition(X, C)",
    "candidate_solid_solution(X)",
    { requires: ["composition(X,C)"] },
    { type: "api", ref: "deriveClosure(R1)", fallback: "none" },
    { derived: "candidate_solid_solution(X)", with_justification: true },
  ),
  rule(
    "R2",
    "xrd_peak(X, Θ1, \"FCC(111)\") and xrd_peak(X, Θ2, \"BCC(110)\")",
    "phase_structure(X, \"BCC+FCC\")",
    { requires: ["xrd_peak(FCC(111))", "xrd_peak(BCC(110))"] },
    { type: "api", ref: "deriveClosure(R2)", fallback: "none" },
    { derived: "phase_structure(X, BCC+FCC)", with_justification: true },
  ),
  rule(
    "R3",
    "composition(X, C)",
    "smix(X, V)",
    { requires: ["composition(X,C)"] },
    { type: "api", ref: "deriveClosure(R3)", fallback: "none" },
    { formula: "-8.314 * sum(xi * ln(xi))", with_justification: true },
  ),
];

const BCC_PLACEHOLDER: FactInput = {
  predicate: "xrd_peak",
  args: ["S01", "44.7°", "BCC(110)"],
  claim: "xrd_peak(S01, 44.7°, BCC(110))",
  layer: "semantic",
  jPremiseIds: [],
  epsType: "measurement",
  epsValue: 0.9,
  epsSource: "placeholder-pending-measurement",
  linSource: "xrd_parser_v1.2",
  linVersion: "v1.2",
  linActor: "seed_phase1_assets",
  verify: "seed",
  status: "in",
};

async function main() {
  const client = new MnesticClient({ endpoint: ENDPOINT, timeoutMs: 60_000 });
  setMemoryClient(client);
  console.log(`endpoint: ${ENDPOINT}`);

  for (const row of RULES) {
    console.log(`registerRule ${row.rule_id}`, await registerRule(row));
  }
  console.log("registerSubtask", await registerSubtask({
    subtask_id: "infer_phase_S01",
    goal: "推断 S01 相结构",
    context: {},
    status: "active",
    utility_queries: 0,
    lin_source: "phase1-rules",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "seed_phase1_assets",
  }));
  console.log("registerOption", await registerOption({
    option_id: "infer_phase_structure_from_xrd",
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
  }));
  console.log("registerModel", await registerModel({
    model_id: "model_infer_phase_xrd_v1",
    option_id: "infer_phase_structure_from_xrd",
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
    lin_actor: "seed_phase1_assets",
    verify: "settlement+rollout_success",
  }));

  console.log("BCC placeholder", await memory_set_batch([BCC_PLACEHOLDER]));
  console.log("deriveClosure", await deriveClosure({ entity: "S01" }));

  const phase = await client.execute(
    `?[id, args, j_premise_ids, j_rule_id] := *facts{id, predicate, args, j_premise_ids, j_rule_id}, predicate == "phase_structure", first(args) == "S01"`,
  );
  console.log("phase_structure", JSON.stringify(phase.rows));
  if (phase.rows.length !== 1) throw new Error("S01 phase_structure 未唯一命中");
  const justifications = await client.execute(
    `?[premise_ids, rule_id, active] := *justifications{derived_id, premise_ids, rule_id, active}, derived_id == $id`,
    { id: phase.rows[0][0] },
  );
  console.log("phase justifications", JSON.stringify(justifications.rows));
  if (justifications.rows.length !== 1 || justifications.rows[0][2] !== true) {
    throw new Error("phase_structure active J 边缺失");
  }
  if ((justifications.rows[0][0] as string[]).length !== 2) {
    throw new Error("phase_structure 必须包含两个 XRD 前提");
  }

  const binding = await client.execute(
    `?[option_type, template_id, subtask_binding, model_binding, status] := *options{option_id, option_type, template_id, subtask_binding, model_binding, status}, option_id == "infer_phase_structure_from_xrd"`,
  );
  console.log("option binding", JSON.stringify(binding.rows));
  const counts = await client.execute(
    `?[count(rule_id)] := *rules{rule_id, status}, status == "in"`,
  );
  const r4 = await client.execute(
    `?[count(rule_id)] := *rules{rule_id}, rule_id == "R4"`,
  );
  console.log(`active rules=${counts.rows[0][0]}; R4 rows=${r4.rows[0][0]}`);
  if (counts.rows[0][0] !== 3 || r4.rows[0][0] !== 0) {
    throw new Error("活动规则应为 R1–R3，且 R4 不得入库");
  }
  console.log("PHASE1_STEP3_PASS");
}

main().catch((error) => {
  console.error("ERR", error);
  process.exitCode = 1;
});
