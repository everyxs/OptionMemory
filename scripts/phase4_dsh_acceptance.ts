const { writeFileSync } = require("node:fs");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { setMemoryClient, memory_set } = require("../dist/api/memory.js");
const { registerSubtask, registerRule, registerOption, registerModel } = require("../dist/api/registry.js");
const { registerPlanner } = require("../dist/api/planner-registry.js");
const { beginSubtaskExecution, beginPlanRun, getSubtaskDecisionChain, getExecutionTrace, getContinuousHostStatus } = require("../dist/api");

const endpoint = process.env.OPTIONMEMORY_ENDPOINT ?? "http://127.0.0.1:9073/text-query";
if (!endpoint.includes("9073")) throw new Error("P4-2 acceptance must use isolated port 9073");
const client = new MnesticClient({ endpoint, timeoutMs: 30_000 });
setMemoryClient(client);
const planRunId = "plan_run_phase4_dsh_s01";
const openCodePlanRunId = "plan_run_phase4_dsh_cross_opencode";

function option(option_id: string, pi_type: string, pi_ref: string, input_schema: object, beta_output_schema: object = {}) {
  return {
    option_id, claim: option_id, layer: "option", option_type: "atomic", template_id: null,
    i_preconditions: option_id === "infer_phase_structure_from_xrd" ? { requires: ["xrd_peak(FCC(111))", "xrd_peak(BCC(110))"] } : {},
    pi_type, pi_ref, pi_fallback: "none",
    beta_success: option_id === "infer_phase_structure_from_xrd" ? { derived: "phase_structure", with_justification: true } : {},
    beta_output_schema, rule_ref: option_id === "infer_phase_structure_from_xrd" ? "R2" : null,
    j_premise_ids: [], eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    lin_source: "phase4-dsh-acceptance", lin_version: "1.0", lin_theta: null,
    verify: "controlled-executor-v1", status: "probation", subtask_binding: "phase4_dsh_s01",
    model_binding: `model_${option_id}_p42`, input_schema,
  };
}

async function setup() {
  await registerSubtask({
    subtask_id: "phase4_dsh_s01", goal: "DSH and OpenCode S01 vertical slice",
    context: { entity: "P4DSHS01" }, status: "active", utility_queries: 0,
    lin_source: "phase4-dsh-acceptance", lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script",
  });
  await registerPlanner({
    planner_id: "planner_s01", claim: "S01 cross-host Planner", layer: "planner", j_premise_ids: [],
    instructions_ref: "dsh/planner/v1", instructions_version: "1.0", inference_ref: "dsh-llm",
    context_policy: { policy_version: "p4-dsh-v1" }, decision_schema: { type: "object" }, tool_policy: {}, budget_policy: { max_steps: 6 },
    eps_type: "confidence", eps_value: 0.5, eps_source: "uncalibrated", lin_source: "phase4-dsh-acceptance",
    lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script", verify: "planner-schema-v0.1", status: "active",
  });
  await registerRule({
    rule_id: "R2", horn_body: "xrd_peak FCC+BCC", horn_head: "phase_structure BCC+FCC", opt_i: {}, opt_pi: {}, opt_beta: {},
    layer: "rule", lin_source: "phase4-dsh-acceptance", lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script", status: "in",
  });
  const premiseIds: string[] = [];
  for (const peak of ["FCC(111)", "BCC(110)"]) {
    const result = await memory_set({
      predicate: "xrd_peak", args: ["P4DSHS01", "2theta", peak], claim: `P4DSHS01 ${peak}`, layer: "knowledge",
      jPremiseIds: [], epsType: "in-degree", epsValue: 0.5, epsSource: "inferred-prior",
      linSource: "phase4-dsh-fixture", linVersion: "1.0", linActor: "acceptance-script", verify: "fixture", status: "in",
    });
    premiseIds.push(result.id);
  }
  await registerOption(option("infer_phase_structure_from_xrd", "api", "deriveClosure(R2)", {
    type: "object", required: ["entity"], properties: { entity: { type: "string", minLength: 1 } }, additionalProperties: false,
  }, { predicate: "phase_structure", args: ["X", "phases"] }));
  await registerOption(option("review_s01_evidence", "subagent", "materials-evidence-reviewer@v1", {
    type: "object", required: ["evidence"], properties: { evidence: { type: "object" } }, additionalProperties: false,
  }));
  for (const optionId of ["infer_phase_structure_from_xrd", "review_s01_evidence"]) await registerModel({
    model_id: `model_${optionId}_p42`, option_id: optionId, claim: "uncalibrated", layer: "model",
    achievable_probability: 0, calibration_history: [], prediction_error: 0, cost_model: { observed: false },
    theta_version: "1.0", estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    status: "probation", j_records: [], lin_source: "phase4-dsh-acceptance", lin_version: "1.0", lin_theta: null,
    lin_actor: "acceptance-script", verify: "controlled-executor-v1", reasoning_spec: null,
    evidence_spec: { required: ["real"] }, evaluation_spec: null,
  });
  for (const [id, host] of [[planRunId, "dsh"], [openCodePlanRunId, "opencode"]] as const) {
    const subtask = await beginSubtaskExecution({
      subtask_event_id: `subtask_event_${id}`, subtask_id: "phase4_dsh_s01", baseline_id: "phase4_dsh_baseline",
      mandate_json: {
        scope: { option_ids: ["infer_phase_structure_from_xrd", "review_s01_evidence"], allowed_effects: ["execute"] },
        policy_version: "p4-dsh-v1", source_actor: "acceptance-user", strength: "explicit", mode: "enforce", budget: { max_steps: 6 },
      },
    });
    const run = await beginPlanRun({
      plan_run_id: id, subtask_event_id: subtask.id, attempt: 1, host_type: host,
      host_session_ref: `${host}-acceptance`, idempotency_key: `${id}-start`, mapping_version: `${host}-planner-v1`,
    });
    if (run.gate !== "pass") throw new Error(JSON.stringify(run));
  }
  const result = { planRunId, openCodePlanRunId, premiseIds, endpoint };
  writeFileSync(".data/phase4-dsh-setup.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

async function crossSetup() {
  const id = "plan_run_phase4_dsh_for_opencode_stop";
  const subtask = await beginSubtaskExecution({
    subtask_event_id: `subtask_event_${id}`, subtask_id: "phase4_dsh_s01", baseline_id: "phase4_dsh_baseline",
    mandate_json: {
      scope: { option_ids: ["infer_phase_structure_from_xrd", "review_s01_evidence"], allowed_effects: ["execute"] },
      policy_version: "p4-dsh-v1", source_actor: "acceptance-user", strength: "explicit", mode: "enforce", budget: { max_steps: 2 },
    },
  });
  const run = await beginPlanRun({
    plan_run_id: id, subtask_event_id: subtask.id, attempt: 1, host_type: "dsh",
    host_session_ref: "dsh-cross-stop", idempotency_key: `${id}-start`, mapping_version: "dsh-planner-v1",
  });
  if (run.gate !== "pass") throw new Error(JSON.stringify(run));
  console.log(JSON.stringify({ dshPlanRunForOpenCodeStop: id, openCodePlanRunId }, null, 2));
}

async function verify() {
  const chain = await getSubtaskDecisionChain("subtask_event_plan_run_phase4_dsh_s01");
  const decisions = chain.map((row: any) => row.decision).filter(Boolean);
  const executions = chain.flatMap((row: any) => row.optionEvents);
  if (decisions.filter((row: any) => row.decision_type === "execute").length !== 2) throw new Error("Expected two DSH execute decisions");
  if (executions.length !== 2) throw new Error("Expected two DSH option events");
  const traces = [];
  for (const event of executions) {
    const trace = await getExecutionTrace(event.option_event_id);
    if (trace?.outcome?.status !== "success") throw new Error(`Unsuccessful DSH Option: ${JSON.stringify(trace?.outcome)}`);
    traces.push(trace);
  }
  const reviewer = traces.find((trace: any) => trace.option.option_id === "review_s01_evidence");
  const reviewOutput = reviewer?.observations.find((row: any) => row.observation_type === "output")?.value_json;
  if (!reviewOutput?.reviewer_session_id) throw new Error("Missing real DSH reviewer session ID");
  const dshStatus = await getContinuousHostStatus(planRunId);
  const openCodeStatus = await getContinuousHostStatus(openCodePlanRunId);
  const crossDshStatus = await getContinuousHostStatus("plan_run_phase4_dsh_for_opencode_stop");
  if (dshStatus.planRun?.status !== "stopped" || openCodeStatus.planRun?.status !== "stopped" || crossDshStatus.planRun?.status !== "stopped") {
    throw new Error("Cross-host stop states are not both stopped");
  }
  if (!decisions.some((row: any) => row.decision_type === "stop")) throw new Error("DSH final stop decision missing");
  const result = {
    gate: "pass", verifiedAt: new Date().toISOString(), planRunId, openCodePlanRunId,
    decisions, traces, dshStatus, openCodeStatus, crossDshStatus,
  };
  writeFileSync(".data/phase4-dsh-acceptance-result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    gate: "pass", planRunId, openCodePlanRunId,
    decisionIds: decisions.map((row: any) => row.planner_event_id),
    optionEventIds: executions.map((row: any) => row.option_event_id),
    reviewerSessionId: reviewOutput.reviewer_session_id,
    dshStatus: dshStatus.planRun.status,
    openCodeStatus: openCodeStatus.planRun.status,
    crossDshStatus: crossDshStatus.planRun.status,
  }, null, 2));
}

const mode = process.argv[2];
if (mode === "--setup") setup().catch((error: Error) => { console.error(error); process.exitCode = 1; });
else if (mode === "--cross-setup") crossSetup().catch((error: Error) => { console.error(error); process.exitCode = 1; });
else if (mode === "--verify") verify().catch((error: Error) => { console.error(error); process.exitCode = 1; });
else throw new Error("Use --setup, --cross-setup or --verify");
