const { mkdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const endpoint = process.env.OPTIONMEMORY_ENDPOINT ?? "http://127.0.0.1:9074/text-query";
if (!endpoint.includes("9074")) throw new Error("P4 acceptance must use the isolated RocksDB endpoint on port 9074");

const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { setMemoryClient, memory_set } = require("../dist/api/memory.js");
const { registerSubtask, registerRule, registerOption, registerModel } = require("../dist/api/registry.js");
const { registerPlanner } = require("../dist/api/planner-registry.js");
const { beginSubtaskExecution, beginPlanRun, getSubtaskDecisionChain, getExecutionTrace } = require("../dist/api/telemetry.js");
const { getContinuousHostStatus } = require("../dist/api/continuous-host.js");

const client = new MnesticClient({ endpoint, timeoutMs: 30_000 });
setMemoryClient(client);
const planRunId = "plan_run_phase4_opencode_s01";
const outputDir = resolve(".data/phase4-opencode");
mkdirSync(outputDir, { recursive: true });

function option(option_id: string, pi_type: string, pi_ref: string, input_schema: object, beta_output_schema: object = {}) {
  return {
    option_id, claim: option_id, layer: "option", option_type: "atomic", template_id: null,
    i_preconditions: option_id === "infer_phase_structure_from_xrd" ? { requires: ["xrd_peak(FCC(111))", "xrd_peak(BCC(110))"] } : {},
    pi_type, pi_ref, pi_fallback: "none",
    beta_success: option_id === "infer_phase_structure_from_xrd" ? { derived: "phase_structure", with_justification: true } : {},
    beta_output_schema, rule_ref: option_id === "infer_phase_structure_from_xrd" ? "R2" : null,
    j_premise_ids: [], eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    lin_source: "phase4-opencode-acceptance", lin_version: "1.0", lin_theta: null,
    verify: "controlled-executor-v1", status: "probation", subtask_binding: "phase4_opencode_s01",
    model_binding: `model_${option_id}_p4`, input_schema,
  };
}

async function setup() {
  const registered = await registerSubtask({
    subtask_id: "phase4_opencode_s01", goal: "Derive and independently review S01 R2 evidence",
    context: { entity: "P4REALS01", plan_run_id: planRunId }, status: "active", utility_queries: 0,
    lin_source: "phase4-opencode-acceptance", lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script",
  });
  if (registered.gate !== "pass") throw new Error(JSON.stringify(registered));
  await registerPlanner({
    planner_id: "planner_s01", claim: "S01 OpenCode Planner", layer: "planner", j_premise_ids: [],
    instructions_ref: ".opencode/agents/optionmemory-planner.md", instructions_version: "1.0",
    inference_ref: "kimi-code-plan-cn/kimi-for-coding-highspeed", context_policy: { policy_version: "p4-opencode-v1" },
    decision_schema: { type: "object" }, tool_policy: { allowed: ["planner_context", "planner_options", "planner_decision"] },
    budget_policy: { max_steps: 6 }, eps_type: "confidence", eps_value: 0.5, eps_source: "uncalibrated",
    lin_source: "phase4-opencode-acceptance", lin_version: "1.0", lin_theta: null,
    lin_actor: "acceptance-script", verify: "planner-schema-v0.1", status: "active",
  });
  await registerRule({
    rule_id: "R2", horn_body: "xrd_peak FCC+BCC", horn_head: "phase_structure BCC+FCC", opt_i: {}, opt_pi: {}, opt_beta: {},
    layer: "rule", lin_source: "phase4-opencode-acceptance", lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script", status: "in",
  });
  const premiseIds: string[] = [];
  for (const peak of ["FCC(111)", "BCC(110)"]) {
    const result = await memory_set({
      predicate: "xrd_peak", args: ["P4REALS01", "2theta", peak], claim: `P4REALS01 ${peak}`, layer: "knowledge",
      jPremiseIds: [], epsType: "in-degree", epsValue: 0.5, epsSource: "inferred-prior",
      linSource: "phase4-opencode-fixture", linVersion: "1.0", linActor: "acceptance-script", verify: "fixture", status: "in",
    });
    if (result.gate !== "pass") throw new Error(JSON.stringify(result));
    premiseIds.push(result.id);
  }
  await registerOption(option("infer_phase_structure_from_xrd", "api", "deriveClosure(R2)", {
    type: "object", required: ["entity"], properties: { entity: { type: "string", minLength: 1 } }, additionalProperties: false,
  }, { predicate: "phase_structure", args: ["X", "phases"] }));
  await registerOption(option("review_s01_evidence", "subagent", "materials-evidence-reviewer@v1", {
    type: "object", required: ["evidence"], properties: { evidence: { type: "object" } }, additionalProperties: false,
  }, {
    type: "object", required: ["verdict", "summary", "evidence_refs", "uncertainties"],
    properties: { verdict: { enum: ["accepted", "review_required", "rejected"] }, summary: { type: "string" },
      evidence_refs: { type: "array", items: { type: "string" } }, uncertainties: { type: "array", items: { type: "string" } } },
  }));
  for (const optionId of ["infer_phase_structure_from_xrd", "review_s01_evidence"]) {
    await registerModel({
      model_id: `model_${optionId}_p4`, option_id: optionId, claim: "uncalibrated", layer: "model",
      achievable_probability: 0, calibration_history: [], prediction_error: 0, cost_model: { observed: false },
      theta_version: "1.0", estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
      status: "probation", j_records: [], lin_source: "phase4-opencode-acceptance", lin_version: "1.0", lin_theta: null,
      lin_actor: "acceptance-script", verify: "controlled-executor-v1", reasoning_spec: null,
      evidence_spec: { required: ["real"] }, evaluation_spec: null,
    });
  }
  const subtask = await beginSubtaskExecution({
    subtask_event_id: "subtask_event_phase4_opencode_s01", subtask_id: "phase4_opencode_s01", baseline_id: "phase4_opencode_baseline",
    mandate_json: {
      scope: { option_ids: ["infer_phase_structure_from_xrd", "review_s01_evidence"], allowed_effects: ["execute"] },
      policy_version: "p4-opencode-v1", source_actor: "acceptance-user", strength: "explicit", mode: "enforce",
      budget: { max_steps: 6, max_retries: 0 },
    },
  });
  const run = await beginPlanRun({
    plan_run_id: planRunId, subtask_event_id: subtask.id, attempt: 1, host_type: "opencode",
    host_session_ref: "assigned-by-opencode", idempotency_key: "phase4-opencode-real-v1", mapping_version: "opencode-runtime-inbox-v0.1",
  });
  if (run.gate !== "pass") throw new Error(JSON.stringify(run));
  const setupEvidence = { planRunId, premiseIds, endpoint, options: ["infer_phase_structure_from_xrd", "review_s01_evidence"] };
  writeFileSync(resolve(outputDir, "setup.json"), JSON.stringify(setupEvidence, null, 2));
  console.log(JSON.stringify(setupEvidence, null, 2));
}

async function retry() {
  const retryPlanRunId = process.env.P4_PLAN_RUN_ID ?? "plan_run_phase4_opencode_s01_v2";
  const retrySubtaskEventId = `subtask_event_${retryPlanRunId.replace(/^plan_run_/, "")}`;
  const subtask = await beginSubtaskExecution({
    subtask_event_id: retrySubtaskEventId, subtask_id: "phase4_opencode_s01", baseline_id: "phase4_opencode_baseline",
    mandate_json: {
      scope: { option_ids: ["infer_phase_structure_from_xrd", "review_s01_evidence"], allowed_effects: ["execute"] },
      policy_version: "p4-opencode-v1", source_actor: "acceptance-user", strength: "explicit", mode: "enforce",
      budget: { max_steps: 6, max_retries: 0 },
    },
  });
  const run = await beginPlanRun({
    plan_run_id: retryPlanRunId, subtask_event_id: subtask.id, attempt: 1, host_type: "opencode",
    host_session_ref: "assigned-by-opencode", idempotency_key: `${retryPlanRunId}-start`, mapping_version: "opencode-runtime-inbox-v0.1",
  });
  if (run.gate !== "pass") throw new Error(JSON.stringify(run));
  console.log(JSON.stringify({ planRunId: retryPlanRunId, subtaskEventId: subtask.id }, null, 2));
}

async function verify() {
  const verifiedPlanRunId = process.env.P4_PLAN_RUN_ID ?? planRunId;
  const verifiedSubtaskEventId = verifiedPlanRunId === planRunId ? "subtask_event_phase4_opencode_s01" : `subtask_event_${verifiedPlanRunId.replace(/^plan_run_/, "")}`;
  const chain = await getSubtaskDecisionChain(verifiedSubtaskEventId);
  const decisions = chain.map((row: any) => row.decision).filter(Boolean);
  const executions = chain.flatMap((row: any) => row.optionEvents);
  if (decisions.length < 3) throw new Error(`Expected two execute decisions and a final decision; got ${decisions.length}`);
  if (decisions.filter((row: any) => row.decision_type === "execute").length !== 2) throw new Error("Expected exactly two execute decisions");
  if (!decisions.some((row: any) => ["replan", "ask", "stop"].includes(row.decision_type))) throw new Error("Missing replan/ask/stop outcome回流 decision");
  if (executions.length !== 2) throw new Error(`Expected two option events; got ${executions.length}`);
  const traces = [];
  for (const event of executions) {
    const trace = await getExecutionTrace(event.option_event_id);
    if (trace?.outcome?.status !== "success") throw new Error(`Unsuccessful Option ${event.option_id}: ${JSON.stringify(trace?.outcome)}`);
    traces.push(trace);
  }
  const reviewer = traces.find((trace: any) => trace.option.option_id === "review_s01_evidence");
  const reviewerOutput = reviewer?.observations.find((row: any) => row.observation_type === "output")?.value_json;
  if (!reviewerOutput?.reviewer_session_id || !reviewerOutput?.reviewer_message_id) throw new Error("Missing real reviewer subagent session/message IDs");
  const host = await getContinuousHostStatus(verifiedPlanRunId);
  if (!host.events.some((row: any) => row.payload_json?.payload?.host_event_type === "subagent.completed")) throw new Error("Missing persisted subagent.completed host event");
  const evidence = { verifiedAt: new Date().toISOString(), planRunId: verifiedPlanRunId, decisions, traces, hostEvents: host.events };
  writeFileSync(resolve(outputDir, "acceptance-result.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ gate: "pass", planRunId: verifiedPlanRunId, decisionIds: decisions.map((row: any) => row.planner_event_id), optionEventIds: executions.map((row: any) => row.option_event_id), reviewerSessionId: reviewerOutput.reviewer_session_id, hostEventCount: host.events.length }, null, 2));
}

const mode = process.argv[2];
if (mode === "--setup") setup().catch((error: Error) => { console.error(error); process.exitCode = 1; });
else if (mode === "--retry") retry().catch((error: Error) => { console.error(error); process.exitCode = 1; });
else if (mode === "--verify") verify().catch((error: Error) => { console.error(error); process.exitCode = 1; });
else throw new Error("Use --setup, --retry or --verify");
