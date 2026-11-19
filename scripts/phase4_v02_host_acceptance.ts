const assert = require("node:assert/strict");
const { readFileSync, writeFileSync } = require("node:fs");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { setMemoryClient } = require("../dist/api/memory.js");
const { registerModel, registerOption, registerRule, registerSubtask } = require("../dist/api/registry.js");
const { registerPlanner } = require("../dist/api/planner-registry.js");
const { beginPlanRun, beginSubtaskExecution, getExecutionTrace, getOptionEvidence, getSubtaskDecisionChain } = require("../dist/api/telemetry.js");
const { OPTIONMEMORY_TOOL_CONTRACTS } = require("../dist/api/tool-contracts.js");

const endpoint = process.env.OPTIONMEMORY_ENDPOINT ?? "http://127.0.0.1:9173/text-query";
if (!endpoint.includes("9173")) throw new Error("v0.2.0 host acceptance must use isolated port 9173");
const client = new MnesticClient({ endpoint, timeoutMs: 30_000 });
setMemoryClient(client);
const optionId = "parse_csv_materials";
const modelId = "model_parse_csv_materials_v02";
const subtaskId = "phase4_v02_host_s01";
const plannerId = "planner_s01";
const hosts = [
  { host: "opencode", planRunId: "plan_run_phase4_v02_opencode", batchId: "phase4-v02-opencode-csv", key: "phase4-v02-opencode-csv-v1" },
  { host: "dsh", planRunId: "plan_run_phase4_v02_dsh", batchId: "phase4-v02-dsh-csv", key: "phase4-v02-dsh-csv-v1" },
];

function must(result) {
  assert.equal(result.gate, "pass", JSON.stringify(result));
  return result;
}

async function setup() {
  must(await registerSubtask({
    subtask_id: subtaskId, goal: "Phase 4 v0.2.0 dual-host CSV and settlement", context: { entity: "S01" }, status: "active",
    utility_queries: 0, lin_source: "phase4-v02-host", lin_version: "0.2.0", lin_theta: null, lin_actor: "acceptance-script",
  }));
  must(await registerPlanner({
    planner_id: plannerId, claim: "Phase 4 v0.2.0 dual-host Planner", layer: "planner", j_premise_ids: [],
    instructions_ref: ".opencode/agents/optionmemory-planner.md", instructions_version: "0.2.0", inference_ref: "host-llm",
    context_policy: { policy_version: "phase4-v02-host" }, decision_schema: { type: "object" }, tool_policy: {}, budget_policy: { max_steps: 10 },
    eps_type: "confidence", eps_value: 0.5, eps_source: "uncalibrated", lin_source: "phase4-v02-host",
    lin_version: "0.2.0", lin_theta: null, lin_actor: "acceptance-script", verify: "planner-schema-v0.1", status: "active",
  }));
  for (const ruleId of ["R1", "R2", "R3"]) {
    must(await registerRule({
      rule_id: ruleId, horn_body: ruleId === "R2" ? "FCC+BCC" : "composition", horn_head: ruleId,
      opt_i: {}, opt_pi: {}, opt_beta: {}, layer: "knowledge+option", lin_source: "phase4-v02-host",
      lin_version: "0.2.0", lin_theta: null, lin_actor: "acceptance-script", status: "in",
    }));
  }
  must(await registerOption({
    option_id: optionId, claim: "Parse S01 CSV and derive R1–R3 with transient settlement", layer: "option", option_type: "atomic", template_id: null,
    i_preconditions: {}, pi_type: "parse", pi_ref: "materials-csv@v1", pi_fallback: "none", beta_success: { lineage_complete: true },
    beta_output_schema: {}, rule_ref: null, j_premise_ids: [], eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    lin_source: "phase4-v02-host", lin_version: "0.2.0", lin_theta: null, verify: "controlled-executor-v1", status: "probation",
    subtask_binding: subtaskId, model_binding: modelId,
    input_schema: {
      type: "object", required: ["csv", "batch_id", "source"],
      properties: { csv: { type: "string", minLength: 1 }, batch_id: { type: "string", minLength: 1 }, source: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
  }));
  must(await registerModel({
    model_id: modelId, option_id: optionId, claim: "uncalibrated", layer: "model", achievable_probability: 0,
    calibration_history: [], prediction_error: 0, cost_model: { observed: false }, theta_version: "0.2.0",
    estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    status: "probation", j_records: [], lin_source: "phase4-v02-host", lin_version: "0.2.0", lin_theta: null,
    lin_actor: "acceptance-script", verify: "controlled-executor-v1", reasoning_spec: null,
    evidence_spec: { required: ["real"] }, evaluation_spec: null,
  }));
  for (const item of hosts) {
    must(await beginSubtaskExecution({
      subtask_event_id: `subtask_event_${item.planRunId}`, subtask_id: subtaskId, baseline_id: "phase4_v02_host_baseline",
      mandate_json: {
        scope: { option_ids: [optionId], allowed_effects: ["execute"] },
        policy_version: "phase4-v02-host", source_actor: "acceptance-user", strength: "explicit", mode: "enforce",
        budget: { max_steps: 10 },
      },
    }));
    must(await beginPlanRun({
      plan_run_id: item.planRunId, subtask_event_id: `subtask_event_${item.planRunId}`, attempt: 1, host_type: item.host,
      host_session_ref: `${item.host}-v02-real-acceptance`, idempotency_key: `${item.planRunId}-start`, mapping_version: "phase4-v02-host-v1",
    }));
  }
  const result = {
    endpoint,
    optionId,
    modelId,
    csv: "entity,composition,process,xrd_peak,hardness,hardness_unit\nS01,Al0.2Co0.2Cr0.2Fe0.2Ni0.2,arc-melted-1600C,FCC(111)|BCC(110),512,HV\n",
    hosts,
  };
  writeFileSync(".data/phase4-v02-host-setup.json", `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

async function verify() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const manifest = JSON.parse(readFileSync("dsh.plugin.json", "utf8"));
  assert.equal(pkg.version, "0.2.0");
  assert.equal(manifest.version, "0.2.0");
  assert.equal(Object.keys(OPTIONMEMORY_TOOL_CONTRACTS).length, 7);
  const hostEvidence = [];
  for (const item of hosts) {
    const chain = await getSubtaskDecisionChain(`subtask_event_${item.planRunId}`);
    const executions = chain.flatMap((row) => row.optionEvents);
    assert.equal(executions.length, 1, `${item.host} should have exactly one Option execution`);
    const trace = await getExecutionTrace(executions[0].option_event_id);
    assert.equal(trace.outcome.status, "success");
    assert.equal(trace.optionEvent.execution_json.mode, "real");
    assert.equal(trace.optionEvent.execution_json.parser_version, "materials-csv-v1");
    assert.equal(trace.planRun.host_type, item.host);
    const output = trace.observations.find((row) => row.observation_type === "output").value_json;
    assert.equal(output.batch_id, item.batchId);
    assert.equal(output.lineage_complete, true);
    assert.equal(output.blocked.length, 0);
    assert.equal(trace.modelEvents.length, 1);
    assert.equal(trace.modelEvents[0].payload_json.success_rate, 1);
    assert.equal(trace.modelEvents[0].payload_json.fact_acceptance_rate, 1);
    assert.equal(trace.modelEvents[0].payload_json.lineage_complete, true);
    assert.equal(trace.modelEvents[0].payload_json.monetary_cost, null);
    hostEvidence.push({ host: item.host, planRunId: item.planRunId, optionEventId: executions[0].option_event_id, settlementId: output.settlement_id, output });
  }
  const facts = (await client.listActiveClosureFacts()).filter((fact) => fact.args[0] === "S01");
  assert.equal(facts.length, 8);
  const justifications = await client.listJustifications();
  const phase = facts.find((fact) => fact.predicate === "phase_structure");
  assert.ok(justifications.some((row) => row.derived_id === phase.id && row.rule_id === "R2" && row.active));
  assert.equal((await client.listActiveRules()).some((rule) => rule.rule_id === "R4"), false);
  assert.equal((await getOptionEvidence(optionId)).modelEvents.length, 2);
  const result = {
    gate: "pass",
    verifiedAt: new Date().toISOString(),
    packageVersion: pkg.version,
    manifestVersion: manifest.version,
    memoryGovernanceToolCount: 7,
    hostEvidence,
    sharedS01FactCount: facts.length,
    checks: {
      real_opencode_csv_execution: true,
      real_dsh_csv_execution: true,
      shared_closure_and_lineage: true,
      transient_settlement_per_host: true,
      seven_tool_compatibility: true,
      r4_remains_blocked: true,
    },
  };
  writeFileSync(".data/phase4-v02-host-acceptance-result.json", `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

const mode = process.argv[2];
if (mode === "--setup") setup().catch((error) => { console.error(error); process.exitCode = 1; });
else if (mode === "--verify") verify().catch((error) => { console.error(error); process.exitCode = 1; });
else throw new Error("Use --setup or --verify");
