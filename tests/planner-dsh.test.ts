import { beforeAll, describe, expect, it } from "vitest";
import { memory_set, setMemoryClient } from "../src/api/memory";
import { memoryRecall } from "../src/api/memory-recall";
import { registerPlanner } from "../src/api/planner-registry";
import { registerModel, registerOption, registerRule, registerSubtask } from "../src/api/registry";
import { beginPlanRun, beginSubtaskExecution, getContinuousHostStatus, getExecutionTrace } from "../src/api";
import type { OptionInput } from "../src/memory/assets";
import { MnesticClient } from "../src/memory/mnesticClient";
import { applyDshPlanner, type DshPlannerRuntime } from "../src/plugins/dsh/planner";
import type { DshQuestionItem } from "../src/plugins/dsh/attention";
import type { DshToolDefinition } from "../src/plugins/dsh/tools";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const rootAgent = { id: "dsh-root-agent" };
const planRunId = "plan_run_dsh_s01";
const approvals: DshQuestionItem[] = [];
const subagentParents: unknown[] = [];
let nextApproval = "Allow";
let tools: Record<string, DshToolDefinition>;

function option(id: string, piType: string, piRef: string): OptionInput {
  return {
    option_id: id, claim: id, layer: "option", option_type: "atomic", template_id: null,
    i_preconditions: id === "infer_phase_structure_from_xrd" ? { requires: ["xrd_peak(FCC(111))", "xrd_peak(BCC(110))"] } : {},
    pi_type: piType, pi_ref: piRef, pi_fallback: "none",
    beta_success: id === "infer_phase_structure_from_xrd" ? { derived: "phase_structure", with_justification: true } : {},
    beta_output_schema: id === "infer_phase_structure_from_xrd" ? { predicate: "phase_structure" } : {},
    rule_ref: id === "infer_phase_structure_from_xrd" ? "R2" : null,
    j_premise_ids: [], eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    lin_source: "dsh-test", lin_version: "1.0", lin_theta: null, verify: "controlled-executor-v1",
    status: "probation", subtask_binding: "dsh_s01", model_binding: `model_${id}`,
    input_schema: id === "infer_phase_structure_from_xrd"
      ? { type: "object", required: ["entity"], properties: { entity: { type: "string" } }, additionalProperties: false }
      : { type: "object", required: ["evidence"], properties: { evidence: { type: "object" } }, additionalProperties: false },
  };
}

async function addOption(id: string, piType: string, piRef: string) {
  await registerOption(option(id, piType, piRef));
  await registerModel({
    model_id: `model_${id}`, option_id: id, claim: "uncalibrated", layer: "model",
    achievable_probability: 0, calibration_history: [], prediction_error: 0, cost_model: { observed: false },
    theta_version: "1.0", estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5,
    eps_source: "inferred-prior", status: "probation", j_records: [], lin_source: "dsh-test", lin_version: "1.0",
    lin_theta: null, lin_actor: "vitest", verify: "controlled-executor-v1", reasoning_spec: null,
    evidence_spec: { required: ["real"] }, evaluation_spec: null,
  });
}

async function execute(name: string, args: any) {
  return tools[name].execute(args, { agent: rootAgent, signal: new AbortController().signal } as never);
}

beforeAll(async () => {
  setMemoryClient(client);
  await registerSubtask({
    subtask_id: "dsh_s01", goal: "DSH S01 acceptance", context: { entity: "DSHS01" }, status: "active",
    utility_queries: 0, lin_source: "dsh-test", lin_version: "1.0", lin_theta: null, lin_actor: "vitest",
  });
  await registerPlanner({
    planner_id: "dsh_planner", claim: "DSH test planner", layer: "planner", j_premise_ids: [],
    instructions_ref: "dsh/planner/v1", instructions_version: "1.0", inference_ref: "contract-test",
    context_policy: { policy_version: "p4-dsh-v1" }, decision_schema: { type: "object" }, tool_policy: {}, budget_policy: {},
    eps_type: "confidence", eps_value: 0.5, eps_source: "uncalibrated", lin_source: "dsh-test", lin_version: "1.0",
    lin_theta: null, lin_actor: "vitest", verify: "planner-schema-v0.1", status: "active",
  });
  await registerRule({
    rule_id: "R2", horn_body: "FCC+BCC", horn_head: "phase_structure", opt_i: {}, opt_pi: {}, opt_beta: {},
    layer: "rule", lin_source: "dsh-test", lin_version: "1.0", lin_theta: null, lin_actor: "vitest", status: "in",
  });
  for (const peak of ["FCC(111)", "BCC(110)"]) await memory_set({
    predicate: "xrd_peak", args: ["DSHS01", "2theta", peak], claim: `xrd ${peak}`, layer: "knowledge",
    jPremiseIds: [], epsType: "in-degree", epsValue: 0.5, epsSource: "inferred-prior", linSource: "dsh-test",
    linVersion: "1.0", linActor: "vitest", verify: "fixture", status: "in",
  });
  await addOption("infer_phase_structure_from_xrd", "api", "deriveClosure(R2)");
  await addOption("review_s01_evidence", "subagent", "materials-evidence-reviewer@v1");
  const runtime: DshPlannerRuntime = {
    tools: { register: (tool) => { tools[tool.name] = tool; } },
    subagents: {
      startActivation: async (spec) => {
        subagentParents.push(spec.request.parent);
        return {
          childId: "dsh-review-session",
          messageId: "dsh-review-message",
          result: Promise.resolve({
            stopReason: "completed",
            output: [{ type: "text", text: JSON.stringify({ verdict: "review_required", summary: "fixture review", evidence_refs: ["DSHS01"], uncertainties: ["raw measurements absent"], findings: [] }) }],
          }),
          dispose: async () => {},
        };
      },
    },
    userQuestions: {
      ask: async (request) => {
        approvals.push(...request.questions);
        return { answers: request.questions.map((question) => ({ id: question.id, selected: [nextApproval] })) };
      },
      askTimed: async () => ({ pending: true as const, callId: "dsh-timed" }),
      answer: () => false,
    },
  };
  tools = {};
  await applyDshPlanner(runtime, { endpoint: TEST_ENDPOINT, requireExecutionApproval: true });
  expect((await beginSubtaskExecution({
    subtask_event_id: "subtask_event_dsh_s01", subtask_id: "dsh_s01", baseline_id: "dsh_baseline",
    mandate_json: {
      scope: { option_ids: ["infer_phase_structure_from_xrd", "review_s01_evidence"], allowed_effects: ["execute"] },
      policy_version: "p4-dsh-v1", source_actor: "vitest", strength: "explicit", mode: "enforce", budget: { max_steps: 8 },
    },
  })).gate).toBe("pass");
  expect((await beginPlanRun({
    plan_run_id: planRunId, subtask_event_id: "subtask_event_dsh_s01", attempt: 1, host_type: "dsh",
    host_session_ref: "dsh-root-agent", idempotency_key: "dsh-start", mapping_version: "dsh-planner-v1",
  })).gate).toBe("pass");
});

describe("DSH Planner, subagent and native approval", () => {
  it("registers independent Planner and Bridge contracts", () => {
    expect(Object.keys(tools).sort()).toEqual(["bridge_capture", "bridge_recall", "bridge_revise", "planner_context", "planner_decision", "planner_options"]);
  });

  it("executes R2 with approval intent and real outcome", async () => {
    const result = await execute("planner_decision", {
      plan_run_id: planRunId, planner_id: "dsh_planner", idempotency_key: "dsh-r2",
      state_snapshot_ref: "dsh-r2", state_hash: "dsh-r2",
      decision: { decision: "execute", option_id: "infer_phase_structure_from_xrd", arguments: { entity: "DSHS01" }, rationale: "R2 premises present", evidence_refs: ["DSHS01"], uncertainties: [] },
    });
    expect(result.reason).toBeUndefined();
    expect(result).toMatchObject({ gate: "pass" });
    expect(result.execution).toMatchObject({ ok: true, status: "success" });
    expect(approvals.at(-1)?.intent).toMatchObject({ kind: "approval", approve: "Allow", reject: "Reject" });
    expect((await getExecutionTrace(result.execution.optionEventId))?.outcome?.status).toBe("success");
  });

  it("executes the reviewer through ctx.subagents with the actual parent Agent", async () => {
    const result = await execute("planner_decision", {
      plan_run_id: planRunId, planner_id: "dsh_planner", idempotency_key: "dsh-review",
      state_snapshot_ref: "dsh-review", state_hash: "dsh-review",
      decision: { decision: "execute", option_id: "review_s01_evidence", arguments: { evidence: { entity: "DSHS01" } }, rationale: "Review evidence", evidence_refs: ["DSHS01"], uncertainties: [] },
    });
    expect(result.execution).toMatchObject({ ok: true, status: "success" });
    expect(subagentParents).toContain(rootAgent);
    const trace = await getExecutionTrace(result.execution.optionEventId);
    const output = trace?.observations.find((row) => row.observation_type === "output")?.value_json;
    expect(output).toMatchObject({ verdict: "review_required", reviewer_session_id: "dsh-review-session" });
  });

  it("rejects execution without creating an Option event", async () => {
    nextApproval = "Reject";
    const result = await execute("planner_decision", {
      plan_run_id: planRunId, planner_id: "dsh_planner", idempotency_key: "dsh-reject",
      state_snapshot_ref: "dsh-reject", state_hash: "dsh-reject",
      decision: { decision: "execute", option_id: "infer_phase_structure_from_xrd", arguments: { entity: "DSHS01" }, rationale: "Probe rejection", evidence_refs: [], uncertainties: [] },
    });
    expect(result).toMatchObject({ gate: "blocked", reason: "Execution rejected by DSH approval" });
    expect(result.execution).toBeUndefined();
    nextApproval = "Allow";
  });

  it("supports daily capture/recall and persists a cross-host stop event", async () => {
    const captured = await execute("bridge_capture", {
      text: "DSH 与 OpenCode 共用同一条日常记忆", namespace: "global", source_ref: "dsh-test", idempotency_key: "dsh-daily-1",
    });
    expect(captured.gate).toBe("pass");
    const recalled = await memoryRecall({ query: "共用同一条", namespace: "global" });
    expect(recalled.items[0].memory_uri).toContain(captured.id);
    const stopped = await execute("planner_decision", {
      plan_run_id: planRunId, planner_id: "dsh_planner", idempotency_key: "dsh-stop",
      state_snapshot_ref: "dsh-stop", state_hash: "dsh-stop",
      decision: { decision: "stop", rationale: "acceptance complete", evidence_refs: [], uncertainties: [] },
    });
    expect(stopped.gate).toBe("pass");
    const status = await getContinuousHostStatus(planRunId);
    expect(status.planRun?.status).toBe("stopped");
    expect(status.events.some((event) => event.event_type === "stop")).toBe(true);
  });
});
