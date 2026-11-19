import { beforeAll, describe, expect, it } from "vitest";
import { setMemoryClient } from "../src/api/memory";
import { registerPlanner } from "../src/api/planner-registry";
import { registerModel, registerOption, registerRule, registerSubtask } from "../src/api/registry";
import { beginPlanRun, beginSubtaskExecution, getExecutionTrace, getOptionEvidence } from "../src/api/telemetry";
import { MnesticClient } from "../src/memory/mnesticClient";
import { OptionExecutor } from "../src/runtime/option-executor";
import { submitPlannerDecision } from "../src/runtime/planner";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const optionId = "parse_csv_materials_settlement";
const modelId = "model_parse_csv_materials_settlement";
const planRunId = "plan_run_phase4_settlement";
const plannerId = "phase4_settlement_planner";
const mandate = {
  scope: { option_ids: [optionId] },
  policy_version: "phase4-settlement-v1",
  source_actor: "vitest",
  strength: "explicit" as const,
  mode: "enforce" as const,
  budget: { max_steps: 10 },
};
const validCsv = "entity,composition,process,xrd_peak,hardness\nP4SETTLEMENT,Al0.2Co0.2Cr0.2Fe0.2Ni0.2,arc-melted,FCC(111)|BCC(110),512\n";

beforeAll(async () => {
  setMemoryClient(client);
  expect((await registerSubtask({
    subtask_id: "phase4_settlement_s01", goal: "Phase 4 CSV transient settlement", context: {}, status: "active",
    utility_queries: 0, lin_source: "phase4-settlement-test", lin_version: "1.0", lin_theta: null, lin_actor: "vitest",
  })).gate).toBe("pass");
  expect((await registerPlanner({
    planner_id: plannerId, claim: "Phase 4 settlement planner", layer: "planner", j_premise_ids: [],
    instructions_ref: "settlement/v1", instructions_version: "1.0", inference_ref: "contract-test",
    context_policy: {}, decision_schema: {}, tool_policy: {}, budget_policy: {}, eps_type: "confidence", eps_value: 0.5,
    eps_source: "uncalibrated", lin_source: "phase4-settlement-test", lin_version: "1.0", lin_theta: null,
    lin_actor: "vitest", verify: "planner-schema-v0.1", status: "active",
  })).gate).toBe("pass");
  for (const ruleId of ["R1", "R2", "R3"]) {
    expect((await registerRule({
      rule_id: ruleId, horn_body: ruleId === "R2" ? "FCC+BCC" : "composition", horn_head: ruleId,
      opt_i: {}, opt_pi: {}, opt_beta: {}, layer: "knowledge+option", lin_source: "phase4-settlement-test",
      lin_version: "1.0", lin_theta: null, lin_actor: "vitest", status: "in",
    })).gate).toBe("pass");
  }
  expect((await registerOption({
    option_id: optionId, claim: "Parse materials CSV with transient settlement", layer: "option", option_type: "atomic", template_id: null,
    i_preconditions: {}, pi_type: "parse", pi_ref: "materials-csv@v1", pi_fallback: "none", beta_success: {}, beta_output_schema: {},
    rule_ref: null, j_premise_ids: [], eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    lin_source: "phase4-settlement-test", lin_version: "1.0", lin_theta: null, verify: "controlled-executor-v1", status: "probation",
    subtask_binding: "phase4_settlement_s01", model_binding: modelId,
    input_schema: {
      type: "object", required: ["csv", "batch_id"],
      properties: { csv: { type: "string", minLength: 1 }, batch_id: { type: "string", minLength: 1 }, source: { type: "string" } },
      additionalProperties: false,
    },
  })).gate).toBe("pass");
  expect((await registerModel({
    model_id: modelId, option_id: optionId, claim: "uncalibrated", layer: "model", achievable_probability: 0,
    calibration_history: [], prediction_error: 0, cost_model: { observed: false }, theta_version: "1.0",
    estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    status: "probation", j_records: [], lin_source: "phase4-settlement-test", lin_version: "1.0", lin_theta: null,
    lin_actor: "vitest", verify: "controlled-executor-v1", reasoning_spec: null, evidence_spec: { required: ["real"] }, evaluation_spec: null,
  })).gate).toBe("pass");
  expect((await beginSubtaskExecution({
    subtask_event_id: "subtask_event_phase4_settlement", subtask_id: "phase4_settlement_s01", baseline_id: "phase4_settlement_baseline",
    mandate_json: mandate,
  })).gate).toBe("pass");
  expect((await beginPlanRun({
    plan_run_id: planRunId, subtask_event_id: "subtask_event_phase4_settlement", attempt: 1, host_type: "opencode",
    host_session_ref: "phase4-settlement-test", idempotency_key: "phase4-settlement-start", mapping_version: "settlement-test-v1",
  })).gate).toBe("pass");
});

async function execute(idempotencyKey: string, csv: string, batchId: string) {
  return submitPlannerDecision({
    plan_run_id: planRunId,
    planner_id: plannerId,
    idempotency_key: idempotencyKey,
    state_snapshot_ref: batchId,
    state_hash: batchId,
    decision: {
      decision: "execute",
      option_id: optionId,
      arguments: { csv, batch_id: batchId, source: "phase4-settlement-fixture" },
      rationale: "Execute the Phase 4 CSV batch",
      evidence_refs: [batchId],
      uncertainties: [],
    },
  });
}

describe("Phase 4 transient CSV settlement", () => {
  it("records measured execution, closure, and lineage evidence and repairs a missing settlement without replay", async () => {
    const key = "phase4-settlement-success";
    const result = await execute(key, validCsv, "phase4-settlement-batch-success");
    expect(result.execution).toMatchObject({ status: "success", gate: "pass" });
    const optionEventId = result.execution!.optionEventId;
    const output = result.execution!.output as { settlement_id: string };
    const trace = await getExecutionTrace(optionEventId);
    expect(trace?.modelEvents).toHaveLength(1);
    expect(trace?.modelEvents[0]).toMatchObject({ event_type: "calibration" });
    const payload = trace!.modelEvents[0].payload_json as Record<string, unknown>;
    expect(payload).toMatchObject({
      schema_version: "transient-settlement-v0.1",
      settlement_id: output.settlement_id,
      option_event_id: optionEventId,
      option_id: optionId,
      model_id: modelId,
      option_type: "atomic",
      template_id: null,
      batch_id: "phase4-settlement-batch-success",
      parser_version: "materials-csv-v1",
      evidence_mode: "real",
      outcome_status: "success",
      success_rate: 1,
      fact_acceptance_rate: 1,
      input_rows: 1,
      input_entities: 1,
      candidate_facts: 5,
      inserted: 5,
      skipped: 0,
      blocked_count: 0,
      closure_inserted: 3,
      justifications_inserted: 3,
      lineage_complete: true,
      observed: true,
      monetary_cost: null,
    });
    expect(payload.duration_ms).toEqual(expect.any(Number));
    expect(payload.source_hash).toHaveLength(64);

    const replay = await new OptionExecutor().execute({
      option_id: optionId,
      planner_event_id: result.plannerEventId,
      arguments: { csv: validCsv, batch_id: "phase4-settlement-batch-success", source: "phase4-settlement-fixture" },
      mandate,
      idempotency_key: key,
    });
    expect(replay).toMatchObject({ status: "success", reused: true });
    expect((await getExecutionTrace(optionEventId))?.modelEvents).toHaveLength(1);

    const modelEventId = trace!.modelEvents[0].model_event_id;
    await client.execute("?[model_event_id] := *model_event{model_event_id}, model_event_id == $id :rm model_event {model_event_id}", { id: modelEventId });
    expect((await getExecutionTrace(optionEventId))?.modelEvents).toHaveLength(0);
    const repaired = await new OptionExecutor().execute({
      option_id: optionId,
      planner_event_id: result.plannerEventId,
      arguments: { csv: validCsv, batch_id: "phase4-settlement-batch-success", source: "phase4-settlement-fixture" },
      mandate,
      idempotency_key: key,
    });
    expect(repaired).toMatchObject({ status: "success", reused: true });
    expect((await getExecutionTrace(optionEventId))?.modelEvents).toHaveLength(1);
    expect((await client.listActiveClosureFacts()).filter((fact) => fact.args[0] === "P4SETTLEMENT")).toHaveLength(8);
    expect((await getOptionEvidence(optionId))?.modelEvents.filter((event) => event.payload_json.option_event_id === optionEventId)).toHaveLength(1);
  });

  it("settles a failed batch with zero success and null unknown metrics", async () => {
    const result = await execute(
      "phase4-settlement-failure",
      "entity,composition,hardness\nP4SETTLEMENTFAIL,Fe50Ni50,not-a-number\n",
      "phase4-settlement-batch-failure",
    );
    expect(result.execution).toMatchObject({ status: "failure", gate: "pass" });
    const trace = await getExecutionTrace(result.execution!.optionEventId);
    expect(trace?.outcome?.status).toBe("failure");
    expect(trace?.modelEvents).toHaveLength(1);
    expect(trace!.modelEvents[0].payload_json).toMatchObject({
      batch_id: "phase4-settlement-batch-failure",
      outcome_status: "failure",
      success_rate: 0,
      fact_acceptance_rate: null,
      input_rows: null,
      candidate_facts: null,
      blocked_count: null,
      lineage_complete: null,
      observed: true,
      duration_ms: expect.any(Number),
      monetary_cost: null,
    });
  });
});
