import { beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memory_set, setMemoryClient } from "../src/api/memory";
import { registerPlanner } from "../src/api/planner-registry";
import { registerModel, registerOption, registerRule, registerSubtask } from "../src/api/registry";
import { beginPlanRun, beginSubtaskExecution, getExecutionTrace, getSubtaskDecisionChain } from "../src/api/telemetry";
import { OPTIONMEMORY_TOOL_CONTRACTS } from "../src/api/tool-contracts";
import type { OptionInput } from "../src/memory/assets";
import { MnesticClient } from "../src/memory/mnesticClient";
import { createOpenCodePlannerTools } from "../src/plugins/opencode/planner";
import { mapOpenCodeEventToInbox, recordOpenCodePlannerEvent } from "../src/plugins/opencode/planner-events";
import { OptionExecutor, registerControlledOptionImplementation } from "../src/runtime/option-executor";
import { listPlannerOptions, submitPlannerDecision } from "../src/runtime/planner";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const planRunId = "plan_run_p4_opencode";
const mandate = {
  scope: { option_ids: ["infer_phase_structure_from_xrd_p4", "review_s01_evidence", "parse_csv_materials", "parse_markdown_note", "p4_failure", "p4_unknown"] },
  policy_version: "p4-policy-v1",
  source_actor: "vitest",
  strength: "explicit" as const,
  mode: "enforce" as const,
  budget: { max_steps: 20, max_retries: 1 },
};

function option(id: string, piType: string, piRef: string, inputSchema: unknown, outputSchema: unknown = {}): OptionInput {
  return {
    option_id: id,
    claim: id,
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: id === "infer_phase_structure_from_xrd_p4" ? { requires: ["xrd_peak(FCC(111))", "xrd_peak(BCC(110))"] } : {},
    pi_type: piType,
    pi_ref: piRef,
    pi_fallback: "none",
    beta_success: id === "infer_phase_structure_from_xrd_p4" ? { derived: "phase_structure", with_justification: true } : {},
    beta_output_schema: outputSchema,
    rule_ref: id === "infer_phase_structure_from_xrd_p4" ? "R2" : null,
    j_premise_ids: [],
    eps_type: "in-degree",
    eps_value: 0.5,
    eps_source: "inferred-prior",
    lin_source: "p4-test",
    lin_version: "1.0",
    lin_theta: null,
    verify: "controlled-executor-v1",
    status: "probation",
    subtask_binding: "p4_s01",
    model_binding: `model_${id}`,
    input_schema: inputSchema,
  };
}

async function addOption(id: string, piType: string, piRef: string, inputSchema: unknown, outputSchema: unknown = {}) {
  expect((await registerOption(option(id, piType, piRef, inputSchema, outputSchema))).gate).toBe("pass");
  expect((await registerModel({
    model_id: `model_${id}`,
    option_id: id,
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
    lin_source: "p4-test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    verify: "controlled-executor-v1",
    reasoning_spec: null,
    evidence_spec: { required: ["real"] },
    evaluation_spec: null,
  })).gate).toBe("pass");
}

async function decide(key: string, decision: Parameters<typeof submitPlannerDecision>[0]["decision"]) {
  return submitPlannerDecision({
    plan_run_id: planRunId,
    planner_id: "p4_planner",
    idempotency_key: key,
    state_snapshot_ref: `snapshot_${key}`,
    state_hash: `hash_${key}`,
    decision,
  });
}

beforeAll(async () => {
  setMemoryClient(client);
  await registerSubtask({
    subtask_id: "p4_s01", goal: "P4 OpenCode vertical slice", context: { entity: "P4S01" }, status: "active",
    utility_queries: 0, lin_source: "p4-test", lin_version: "1.0", lin_theta: null, lin_actor: "vitest",
  });
  await registerPlanner({
    planner_id: "p4_planner", claim: "P4 test planner", layer: "planner", j_premise_ids: [],
    instructions_ref: ".opencode/agents/optionmemory-planner.md", instructions_version: "1.0", inference_ref: "contract-test",
    context_policy: { policy_version: "p4-policy-v1" }, decision_schema: { type: "object" }, tool_policy: { allowed: ["planner_context", "planner_options", "planner_decision"] },
    budget_policy: { max_steps: 20 }, eps_type: "confidence", eps_value: 0.5, eps_source: "uncalibrated",
    lin_source: "p4-test", lin_version: "1.0", lin_theta: null, lin_actor: "vitest", verify: "planner-schema-v0.1", status: "active",
  });
  await registerRule({
    rule_id: "R2", horn_body: "xrd_peak FCC+BCC", horn_head: "phase_structure BCC+FCC", opt_i: {}, opt_pi: {}, opt_beta: {},
    layer: "rule", lin_source: "p4-test", lin_version: "1.0", lin_theta: null, lin_actor: "vitest", status: "in",
  });
  for (const peak of ["FCC(111)", "BCC(110)"]) {
    expect((await memory_set({
      predicate: "xrd_peak", args: ["P4S01", "2theta", peak], claim: `xrd ${peak}`, layer: "knowledge", jPremiseIds: [],
      epsType: "in-degree", epsValue: 0.5, epsSource: "inferred-prior", linSource: "p4-test", linVersion: "1.0",
      linActor: "vitest", verify: "fixture", status: "in",
    })).gate).toBe("pass");
  }
  await addOption("infer_phase_structure_from_xrd_p4", "api", "deriveClosure(R2)", {
    type: "object", required: ["entity"], properties: { entity: { type: "string", minLength: 1 } }, additionalProperties: false,
  }, { predicate: "phase_structure", args: ["X", "phases"] });
  await addOption("review_s01_evidence", "subagent", "materials-evidence-reviewer@v1", {
    type: "object", required: ["evidence"], properties: { evidence: { type: "object" } }, additionalProperties: false,
  }, {
    type: "object", required: ["verdict", "summary", "evidence_refs", "uncertainties"],
    properties: { verdict: { enum: ["accepted", "review_required", "rejected"] }, summary: { type: "string" }, evidence_refs: { type: "array", items: { type: "string" } }, uncertainties: { type: "array", items: { type: "string" } } },
  });
  await addOption("parse_csv_materials", "parse", "materials-csv@v1", {
    type: "object", required: ["csv", "batch_id"], properties: { csv: { type: "string", minLength: 1 }, batch_id: { type: "string", minLength: 1 }, source: { type: "string" } }, additionalProperties: false,
  });
  await addOption("parse_markdown_note", "parse", "markdown-note@v1", {
    type: "object", required: ["path", "root", "namespace"],
    properties: { path: { type: "string", minLength: 1 }, root: { type: "string", minLength: 1 }, namespace: { type: "string", minLength: 1 } }, additionalProperties: false,
  });
  await addOption("p4_failure", "api", "test-failure@v1", { type: "object" });
  await addOption("p4_unknown", "api", "not-registered@v1", { type: "object" });
  registerControlledOptionImplementation("subagent", "materials-evidence-reviewer@v1", async () => ({
    output: { verdict: "accepted", summary: "R2 premises and J are present", evidence_refs: ["P4S01"], uncertainties: [], findings: [] },
    evaluation: { verdict: "accepted", scalar_reward: null },
  }));
  registerControlledOptionImplementation("api", "test-failure@v1", async () => { throw new Error("intentional adapter failure"); });
  expect((await beginSubtaskExecution({
    subtask_event_id: "subtask_event_p4", subtask_id: "p4_s01", baseline_id: "p4_baseline", mandate_json: mandate,
  })).gate).toBe("pass");
  expect((await beginPlanRun({
    plan_run_id: planRunId, subtask_event_id: "subtask_event_p4", attempt: 1, host_type: "opencode",
    host_session_ref: "session-p4", idempotency_key: "p4-start", mapping_version: "opencode-runtime-inbox-v0.1",
  })).gate).toBe("pass");
});

describe("P4-1 OpenCode Planner contracts and vertical execution", () => {
  it("keeps the original seven tools separate from the three Planner tools", async () => {
    expect(Object.keys(OPTIONMEMORY_TOOL_CONTRACTS).sort()).toEqual(["memory_get", "memory_query", "memory_retract", "memory_set", "propose_option", "revoke", "settle"]);
    expect(Object.keys(createOpenCodePlannerTools()).sort()).toEqual(["planner_context", "planner_decision", "planner_options"]);
    expect(((await listPlannerOptions(planRunId)) as { options: unknown[] }).options).toHaveLength(6);
  });

  it("executes real R2 through deriveClosure and preserves the complete ID/J chain", async () => {
    const result = await decide("execute-r2", {
      decision: "execute", option_id: "infer_phase_structure_from_xrd_p4", arguments: { entity: "P4S01" },
      rationale: "Both R2 premises are active", evidence_refs: ["P4S01"], uncertainties: [],
    });
    expect(result.execution).toMatchObject({ ok: true, status: "success", gate: "pass" });
    const trace = await getExecutionTrace(result.execution!.optionEventId);
    expect(trace?.plannerDecision?.decision_type).toBe("execute");
    expect(trace?.planRun?.plan_run_id).toBe(planRunId);
    expect(trace?.outcome?.status).toBe("success");
    expect(trace?.observations.map((row) => row.observation_type).sort()).toEqual(["input", "output"]);
    const output = trace?.observations.find((row) => row.observation_type === "output")?.value_json as { derived_facts: Array<{ id: string }>; justified: boolean };
    expect(output.justified).toBe(true);
    const justifications = await client.listJustifications();
    expect(justifications.some((row) => row.derived_id === output.derived_facts[0].id && row.rule_id === "R2" && row.active)).toBe(true);
    const repeated = await decide("execute-r2", {
      decision: "execute", option_id: "infer_phase_structure_from_xrd_p4", arguments: { entity: "P4S01" },
      rationale: "Both R2 premises are active", evidence_refs: ["P4S01"], uncertainties: [],
    });
    expect(repeated.reused).toBe(true);
  });

  it("executes the reviewer through the controlled subagent boundary", async () => {
    const result = await decide("execute-review", {
      decision: "execute", option_id: "review_s01_evidence", arguments: { evidence: { entity: "P4S01", rules: ["R2"] } },
      rationale: "Review the derived evidence", evidence_refs: ["P4S01"], uncertainties: ["External reproducibility is unknown"],
    });
    expect(result.execution).toMatchObject({ ok: true, status: "success" });
    const trace = await getExecutionTrace(result.execution!.optionEventId);
    expect(trace?.optionEvent.execution_json).toMatchObject({ pi_type: "subagent", pi_ref: "materials-evidence-reviewer@v1", mode: "real" });
    expect(trace?.outcome?.evaluation_json.scalar_reward).toBeNull();
  });

  it("parses CSV through the service layer and does not repeat side effects", async () => {
    const args = {
      csv: "entity,composition,process,xrd_peak,hardness\nP4CSV,Fe50Ni50,annealed,FCC(111)|BCC(110),512\n",
      batch_id: "p4-csv-batch-1",
      source: "p4-csv-fixture",
    };
    const result = await decide("execute-csv", {
      decision: "execute", option_id: "parse_csv_materials", arguments: args,
      rationale: "Import the supplied batch", evidence_refs: ["p4-csv-batch-1"], uncertainties: [],
    });
    expect(result.execution).toMatchObject({ ok: true, status: "success" });
    const trace = await getExecutionTrace(result.execution!.optionEventId);
    expect(trace?.optionEvent.execution_json).toMatchObject({ parser_version: "materials-csv-v1", idempotency_key: "execute-csv" });
    const output = result.execution!.output as { inserted: number; ids: string[] };
    expect(output.inserted).toBe(5);
    expect(output.ids).toHaveLength(5);
    const replay = await new OptionExecutor().execute({
      option_id: "parse_csv_materials", planner_event_id: result.plannerEventId, arguments: args,
      mandate, idempotency_key: "execute-csv",
    });
    expect(replay.reused).toBe(true);
    expect((await getExecutionTrace(result.execution!.optionEventId))?.observations).toHaveLength(2);
  });

  it("executes parse_markdown_note as a controlled atomic Option", async () => {
    const root = await mkdtemp(join(tmpdir(), "p4-markdown-option-"));
    await writeFile(join(root, "daily.md"), "# 日常决策\n\n使用 pnpm 管理依赖。\n");
    const result = await decide("execute-markdown", {
      decision: "execute", option_id: "parse_markdown_note",
      arguments: { path: "daily.md", root, namespace: "project:option" },
      rationale: "Parse daily Markdown as a governed Option", evidence_refs: ["daily.md"], uncertainties: [],
    });
    expect(result.execution).toMatchObject({ ok: true, status: "success" });
    const trace = await getExecutionTrace(result.execution!.optionEventId);
    expect(trace?.optionEvent.execution_json).toMatchObject({ parser_version: "markdown-note-v2", pi_ref: "markdown-note@v1" });
    expect(trace?.outcome?.status).toBe("success");
    const output = result.execution!.output as { chunk_count: number; document_id: string };
    expect(output.chunk_count).toBe(1);
    expect(output.document_id).toContain("document_");
  });

  it("blocks unknown implementations, invalid input and inactive assets before dispatch", async () => {
    const unknown = await decide("execute-unknown", {
      decision: "execute", option_id: "p4_unknown", arguments: {}, rationale: "Probe registry", evidence_refs: [], uncertainties: ["Unknown implementation"],
    });
    expect(unknown.execution).toMatchObject({ ok: false, status: "blocked" });
    expect(unknown.reason).toContain("unregistered controlled implementation");
    const invalid = await decide("execute-invalid", {
      decision: "execute", option_id: "infer_phase_structure_from_xrd_p4", arguments: { entity: 42 },
      rationale: "Probe input schema", evidence_refs: [], uncertainties: [],
    });
    expect(invalid.execution?.status).toBe("blocked");
    expect(invalid.reason).toContain("$.entity");
    const revoked = await client.getOptionById("p4_unknown");
    const row = Object.fromEntries(revoked.headers.map((header, index) => [header, revoked.rows[0][index]])) as OptionInput;
    await client.putOption({ ...row, option_type: "atomic", template_id: null, status: "revoked" });
    const inactive = await decide("execute-revoked", {
      decision: "execute", option_id: "p4_unknown", arguments: {}, rationale: "Probe asset status", evidence_refs: [], uncertainties: [],
    });
    expect(inactive.execution?.status).toBe("blocked");
    expect(inactive.reason).toContain("asset status");
  });

  it("maps host events deterministically and records unmappable events without replay", async () => {
    const input = { planRunId, eventType: "tool.execute.after", externalId: "call-p4-1", payload: { tool: "planner_decision" } };
    expect(mapOpenCodeEventToInbox(input)).toEqual(mapOpenCodeEventToInbox(input));
    const first = await recordOpenCodePlannerEvent(input);
    const second = await recordOpenCodePlannerEvent(input);
    expect(first).toMatchObject({ gate: "pass", reused: false });
    expect(second).toMatchObject({ gate: "pass", reused: true });
    const invalid = await recordOpenCodePlannerEvent({ ...input, eventType: "unsupported.event" });
    expect(invalid.gate).toBe("blocked");
  });

  it("persists a failed outcome and allows real replan and stop decisions", async () => {
    const failed = await decide("execute-failure", {
      decision: "execute", option_id: "p4_failure", arguments: {}, rationale: "Exercise failure return", evidence_refs: [], uncertainties: ["Adapter fails intentionally"],
    });
    expect(failed.execution).toMatchObject({ ok: false, status: "failure", gate: "pass" });
    const trace = await getExecutionTrace(failed.execution!.optionEventId);
    expect(trace?.outcome?.error_json).toMatchObject({ kind: "implementation_error" });
    const replanned = await decide("replan-after-failure", {
      decision: "replan", option_event_id: failed.execution!.optionEventId, rationale: "The adapter failed; no success is claimed",
      evidence_refs: [failed.execution!.optionEventId], uncertainties: ["A corrected adapter is required"],
    });
    expect(replanned).toMatchObject({ gate: "pass", decision: { decision: "replan" } });
    const stopped = await decide("stop-after-replan", {
      decision: "stop", rationale: "Stop this bounded acceptance run", evidence_refs: [failed.execution!.optionEventId], uncertainties: [],
    });
    expect(stopped.gate).toBe("pass");
    const chain = await getSubtaskDecisionChain("subtask_event_p4");
    expect(chain.map((row) => row.decision?.decision_type)).toEqual(expect.arrayContaining(["execute", "replan", "stop"]));
    expect((await client.getPlanRunById(planRunId)).rows[0][(await client.getPlanRunById(planRunId)).headers.indexOf("status")]).toBe("stopped");
  });
});
