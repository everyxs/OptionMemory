import { beforeAll, describe, expect, it } from "vitest";
import { ingestSidecarEvent, sidecarEventId, sidecarPlanRunId, type SidecarEventInput } from "../src/api/sidecar";
import { setMemoryClient } from "../src/api/memory";
import { registerModel, registerOption, registerSubtask } from "../src/api/registry";
import { registerPlanner } from "../src/api/planner-registry";
import { getExecutionTrace } from "../src/api/telemetry";
import { MnesticClient } from "../src/memory/mnesticClient";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const subtaskId = "sidecar_subtask";
const optionId = "sidecar_option";
const modelId = "sidecar_model";
const plannerId = "sidecar_planner";

function rows(result: { headers: string[]; rows: unknown[][] }) {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as any);
}

function runStarted(baseline: string): SidecarEventInput {
  return {
    baseline_id: baseline,
    scenario_id: "scenario-shared",
    run_id: "run-shared",
    event_type: "run.started",
    external_id: "run-started",
    subtask_id: subtaskId,
    attempt: 1,
    host_session_ref: "sidecar-session",
    mandate: {
      scope: { option_ids: [optionId] },
      policy_version: "sidecar-policy-v1",
      source_actor: "sidecar-source",
      strength: "explicit",
      mode: "enforce",
      budget: { max_steps: 4 },
    },
  };
}

function plannerDecision(baseline: string, rationale?: string): SidecarEventInput {
  return {
    ...runStarted(baseline),
    event_type: "planner.decision",
    external_id: "planner-call",
    planner_id: plannerId,
    decision: {
      decision: "execute",
      option_id: optionId,
      arguments: { entity: "S01" },
      ...(rationale === undefined ? {} : { rationale }),
      evidence_refs: ["source-evidence"],
      uncertainties: [],
    },
  };
}

function toolCall(baseline: string, callId = "call-shared", observedMode: "real" | "simulated" = "real"): SidecarEventInput {
  return {
    ...runStarted(baseline),
    event_type: "tool.call",
    external_id: `tool-call-${callId}`,
    tool_id: "external-tool",
    call_id: callId,
    planner_call_id: "planner-call",
    option_id: optionId,
    model_id: modelId,
    arguments: { entity: "S01" },
    observed_execution_mode: observedMode,
  };
}

function toolResult(baseline: string, reward?: number, callId = "call-shared"): SidecarEventInput {
  return {
    ...runStarted(baseline),
    event_type: "tool.result",
    external_id: `tool-result-${callId}`,
    tool_id: "external-tool",
    call_id: callId,
    output: { phase: "BCC+FCC" },
    status: "success",
    ...(reward === undefined ? {} : { scalar_reward: reward }),
    critique: { verdict: "source-reported-only" },
  };
}

async function ingestChain(baseline: string, rationale?: string, reward?: number) {
  const events = [runStarted(baseline), plannerDecision(baseline, rationale), toolCall(baseline), toolResult(baseline, reward)];
  const results = [];
  for (const event of events) results.push(await ingestSidecarEvent(event));
  return { events, results };
}

beforeAll(async () => {
  setMemoryClient(client);
  await registerSubtask({
    subtask_id: subtaskId,
    goal: "Sidecar mapping test",
    context: { expected_option_ids: [optionId] },
    status: "active",
    utility_queries: 0,
    lin_source: "sidecar-test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
  });
  await registerPlanner({
    planner_id: plannerId,
    claim: "External planner reference",
    layer: "planner",
    j_premise_ids: [],
    instructions_ref: "external/planner/v1",
    instructions_version: "1.0",
    inference_ref: "external-source",
    context_policy: {},
    decision_schema: {},
    tool_policy: {},
    budget_policy: {},
    eps_type: "confidence",
    eps_value: 0.5,
    eps_source: "uncalibrated",
    lin_source: "sidecar-test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    verify: "planner-schema-v0.1",
    status: "active",
  });
  await registerOption({
    option_id: optionId,
    claim: "External tool Option",
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: {},
    pi_type: "tool",
    pi_ref: "external-tool@v1",
    pi_fallback: "none",
    beta_success: {},
    beta_output_schema: {},
    rule_ref: null,
    j_premise_ids: [],
    eps_type: "in-degree",
    eps_value: 0.5,
    eps_source: "inferred-prior",
    lin_source: "sidecar-test",
    lin_version: "1.0",
    lin_theta: null,
    verify: "sidecar-observation-only",
    status: "probation",
    subtask_binding: subtaskId,
    model_binding: modelId,
    input_schema: {},
    created_at: 100,
    parent_option_id: "parent-sidecar-option",
    parent_version: "0.9",
    origin_event_id: "option_event_skill_generation",
  });
  await registerModel({
    model_id: modelId,
    option_id: optionId,
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
    lin_source: "sidecar-test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    verify: "sidecar-observation-only",
    reasoning_spec: null,
    evidence_spec: { required: ["real"] },
    evaluation_spec: null,
  });
});

describe("Sidecar Mapping Contract v0.1", () => {
  it("maps a complete chain while preserving unknown rationale and reward as null", async () => {
    const { events, results } = await ingestChain("baseline-complete");
    expect(results.every((result) => result.gate === "pass")).toBe(true);
    const optionEventId = results[2].refs.option_event_id!;
    const trace = await getExecutionTrace(optionEventId);
    expect(trace?.optionEvent.execution_json).toMatchObject({
      mode: "sidecar",
      observed_execution_mode: "real",
      baseline_id: "baseline-complete",
      tool_id: "external-tool",
      call_id: "call-shared",
      model_quality: "uncalibrated",
    });
    expect(trace?.observations).toHaveLength(2);
    expect(trace?.outcome?.evaluation_json).toMatchObject({ scalar_reward: null, reward_source: "uncalibrated" });
    const decision = rows(await client.getPlannerDecisionByEventId(results[1].refs.planner_event_id!))[0];
    expect(decision.decision_json.rationale).toBeNull();
    const modelEvent = rows(await client.getModelEventById(results[3].refs.model_event_id!))[0];
    expect(modelEvent.payload_json).toMatchObject({ evidence_origin: "sidecar", model_quality: "uncalibrated" });
    const raw = rows(await client.getSidecarEventById(results[0].id))[0];
    expect(raw.payload_json).toEqual(events[0]);
    expect(raw.mapping_json.provenance).toEqual({
      source_identifiers: "native",
      entity_references: "mapped",
      payload_values: "observed",
      model_quality: "uncalibrated",
    });
    const templates = await client.execute("?[count(template_id)] := *plan_templates{template_id}");
    expect(templates.rows[0][0]).toBe(0);

    const createdAt = raw.created_at;
    for (const event of events) expect((await ingestSidecarEvent(event)).reused).toBe(true);
    expect(rows(await client.listSidecarEventsByBaselineId("baseline-complete"))).toHaveLength(4);
    expect(rows(await client.getSidecarEventById(results[0].id))[0].created_at).toBe(createdAt);
    expect((await getExecutionTrace(optionEventId))?.observations).toHaveLength(2);
  });

  it("keeps incomplete chains raw-only with null references and no placeholder assets", async () => {
    const incomplete = {
      ...runStarted("baseline-incomplete"),
      event_type: "tool.call" as const,
      external_id: "incomplete-call",
      tool_id: "unknown-tool",
      call_id: "unknown-call",
      planner_call_id: "missing-planner",
      option_id: "missing-option",
      model_id: "missing-model",
    };
    const result = await ingestSidecarEvent(incomplete);
    expect(result).toMatchObject({ gate: "pass", mode: "sidecar" });
    expect(result.refs).toEqual({
      subtask_event_id: null,
      plan_run_id: null,
      planner_event_id: null,
      option_id: null,
      option_event_id: null,
      model_event_id: null,
      anticipation_event_id: null,
      drift_event_id: null,
      model_id: null,
    });
    expect(result.unmapped).toContain("plan_run_missing");
    const raw = rows(await client.getSidecarEventById(result.id))[0];
    expect(raw.payload_json.model_id).toBe("missing-model");
    expect(raw.mapping_json.unknowns.model).toBe("missing-model");
    expect(raw.mapping_json.refs.model_id).toBeNull();
    expect((await client.getOptionById("missing-option")).rows).toHaveLength(0);
    expect((await client.getModelById("missing-model")).rows).toHaveLength(0);

    const missingMandate = { ...runStarted("baseline-no-mandate") };
    delete missingMandate.mandate;
    const run = await ingestSidecarEvent(missingMandate);
    expect(run.gate).toBe("pass");
    expect(run.unmapped).toContain("mandate_required");
    expect(run.refs.plan_run_id).toBeNull();
    await ingestSidecarEvent(runStarted("baseline-result-without-call"));
    const resultWithoutCall = await ingestSidecarEvent({
      ...runStarted("baseline-result-without-call"),
      event_type: "tool.result",
      external_id: "result-without-call",
      call_id: "not-imported",
      status: "success",
    });
    expect(resultWithoutCall.unmapped).toContain("option_event_missing");
    expect(resultWithoutCall.refs.option_event_id).toBeNull();
  });

  it("isolates identical external IDs by baseline and preserves explicit zero reward", async () => {
    const first = await ingestChain("baseline-A");
    const second = await ingestChain("baseline-B", "source stated rationale", 0);
    expect(first.results[0].id).not.toBe(second.results[0].id);
    expect(first.results[0].refs.plan_run_id).not.toBe(second.results[0].refs.plan_run_id);
    expect(first.results[2].refs.option_event_id).not.toBe(second.results[2].refs.option_event_id);
    expect(rows(await client.listSidecarEventsByBaselineId("baseline-A"))).toHaveLength(4);
    expect(rows(await client.listSidecarEventsByBaselineId("baseline-B"))).toHaveLength(4);
    expect(sidecarPlanRunId(runStarted("baseline-A"))).not.toBe(sidecarPlanRunId(runStarted("baseline-B")));
    const trace = await getExecutionTrace(second.results[2].refs.option_event_id!);
    expect(trace?.optionEvent.execution_json.baseline_id).toBe("baseline-B");
    expect(trace?.outcome?.evaluation_json).toMatchObject({ scalar_reward: 0, reward_source: "observed" });
    const decision = rows(await client.getPlannerDecisionByEventId(second.results[1].refs.planner_event_id!))[0];
    expect(decision.decision_json.rationale).toBe("source stated rationale");
  });

  it("keeps native real execution separate from sidecar observations of real and simulated runs", async () => {
    await ingestSidecarEvent(runStarted("baseline-modes"));
    await ingestSidecarEvent(plannerDecision("baseline-modes"));
    const realCall = toolCall("baseline-modes", "call-real", "real");
    const simulatedCall = toolCall("baseline-modes", "call-simulated", "simulated");
    const real = await ingestSidecarEvent(realCall);
    const simulated = await ingestSidecarEvent(simulatedCall);
    const plannerEventId = real.refs.planner_event_id!;
    await client.putOptionEvent({
      option_event_id: "option_event_native_real_sidecar_test",
      planner_event_id: plannerEventId,
      option_id: optionId,
      model_id: modelId,
      execution_json: { option_version: "1.0", pi_type: "tool", pi_ref: "external-tool@v1", pi_theta: null, attempt: 1, mode: "real" },
      created_at: Date.now() / 1000,
    });
    const nativeBefore = rows(await client.getOptionEventById("option_event_native_real_sidecar_test"))[0];
    await ingestSidecarEvent(realCall);
    await ingestSidecarEvent(simulatedCall);
    const nativeAfter = rows(await client.getOptionEventById("option_event_native_real_sidecar_test"))[0];
    expect(nativeAfter).toEqual(nativeBefore);
    expect(nativeAfter.execution_json.mode).toBe("real");
    expect(rows(await client.getOptionEventById(real.refs.option_event_id!))[0].execution_json).toMatchObject({ mode: "sidecar", observed_execution_mode: "real" });
    expect(rows(await client.getOptionEventById(simulated.refs.option_event_id!))[0].execution_json).toMatchObject({ mode: "sidecar", observed_execution_mode: "simulated" });
  });

  it("rejects conflicting replays and completes projection after a raw-only crash", async () => {
    const started = runStarted("baseline-conflict");
    const first = await ingestSidecarEvent(started);
    const changed = {
      ...started,
      mandate: { ...started.mandate!, policy_version: "changed-policy" },
    };
    const conflict = await ingestSidecarEvent(changed);
    expect(conflict).toMatchObject({ gate: "blocked", reused: true });
    expect(conflict.reason).toContain("different payload");
    expect(rows(await client.getSidecarEventById(first.id))[0].payload_json).toEqual(started);

    await ingestSidecarEvent(plannerDecision("baseline-conflict"));
    const call = toolCall("baseline-conflict");
    const rawId = sidecarEventId(call);
    await client.putSidecarEvent({
      sidecar_event_id: rawId,
      baseline_id: call.baseline_id,
      scenario_id: call.scenario_id,
      run_id: call.run_id,
      tool_id: call.tool_id!,
      call_id: call.call_id!,
      event_type: call.event_type,
      external_id: call.external_id,
      payload_json: call,
      mapping_json: { refs: null, unmapped: ["crash_after_raw_write"] },
      created_at: 123,
    });
    const recovered = await ingestSidecarEvent(call);
    expect(recovered).toMatchObject({ gate: "pass", reused: true });
    expect(recovered.refs.option_event_id).not.toBeNull();
    expect(rows(await client.getSidecarEventById(rawId))[0].created_at).toBe(123);
  });

  it("supports five skill measurements without a parallel lifecycle store", async () => {
    const option = rows(await client.getOptionById(optionId))[0];
    expect(option).toMatchObject({
      created_at: 100,
      parent_option_id: "parent-sidecar-option",
      parent_version: "0.9",
      origin_event_id: "option_event_skill_generation",
    });
    const registered = await ingestSidecarEvent({
      ...runStarted("baseline-measurement"),
      event_type: "skill.registered",
      external_id: "skill-registered",
      option_id: optionId,
      created_at: 100,
      parent_option_id: "parent-sidecar-option",
      parent_version: "0.9",
      origin_event_id: "option_event_skill_generation",
    });
    expect(registered).toMatchObject({ gate: "pass", refs: { option_id: optionId, model_id: modelId } });
    const updated = await ingestSidecarEvent({
      ...runStarted("baseline-measurement"),
      event_type: "skill.updated",
      external_id: "skill-updated",
      option_id: optionId,
      observed_option_version: "1.1",
    });
    expect(updated.refs.option_id).toBe(optionId);

    const baseline = "baseline-measurement";
    await ingestSidecarEvent(runStarted(baseline));
    const decision = await ingestSidecarEvent(plannerDecision(baseline));
    const subtask = rows(await client.getSubtaskById(subtaskId))[0];
    expect(subtask.context.expected_option_ids).toContain(optionId);
    expect(rows(await client.getPlannerDecisionByEventId(decision.refs.planner_event_id!))[0].decision_json.option_id).toBe(optionId);
    const noCall = await ingestSidecarEvent({
      ...runStarted(baseline),
      event_type: "planner.decision",
      external_id: "planner-no-call",
      planner_id: plannerId,
      decision: { decision: "ignore", rationale: "not applicable", evidence_refs: [], uncertainties: [] },
    });
    expect((await client.listOptionEventsByPlannerEventId(noCall.refs.planner_event_id!)).rows).toHaveLength(0);

    const failedCall = await ingestSidecarEvent(toolCall(baseline));
    const failedResult = await ingestSidecarEvent({
      ...toolResult(baseline),
      status: "failure",
      error: { message: "previous failure" },
    });
    expect(failedResult.gate).toBe("pass");
    const rollback = await ingestSidecarEvent({
      ...runStarted(baseline),
      event_type: "skill.rollback",
      external_id: "skill-rollback",
      option_id: optionId,
      observed_option_version: "1.0",
      revision_ref: "revision-environment-rollback",
    });
    expect(rollback).toMatchObject({ gate: "pass", refs: { option_id: optionId } });

    const recoveryInput = {
      ...toolCall(baseline, "call-recovery"),
      observed_option_version: "1.0",
      observed_model_version: "theta-1",
      lifecycle_ref: rollback.id,
    };
    const recoveredCall = await ingestSidecarEvent(recoveryInput);
    const recoveredResult = await ingestSidecarEvent({
      ...toolResult(baseline, undefined, "call-recovery"),
      environment: { baseline: "environment-v1", restored: true },
      drift: { from: "environment-v2", to: "environment-v1", verdict: "recovered" },
      verification: {
        verifier_id: "independent-regression-verifier",
        verdict: "solved_previous_failure",
        evidence_refs: [failedCall.refs.option_event_id!],
      },
    });
    expect(recoveredResult.gate).toBe("pass");
    const trace = await getExecutionTrace(recoveredCall.refs.option_event_id!);
    expect(trace?.optionEvent.execution_json).toMatchObject({
      observed_option_version: "1.0",
      observed_model_version: "theta-1",
      lifecycle_ref: rollback.id,
    });
    expect(trace?.observations.some((observation) => observation.observation_type === "environment")).toBe(true);
    expect(trace?.outcome?.status).toBe("success");
    const verification = rows(await client.getModelEventById(recoveredResult.refs.model_event_id!))[0];
    expect(verification.event_type).toBe("critique");
    expect(verification.payload_json.verification).toEqual({
      verifier_id: "independent-regression-verifier",
      verdict: "solved_previous_failure",
      evidence_refs: [failedCall.refs.option_event_id!],
    });
    const drift = rows(await client.getModelEventById(recoveredResult.refs.drift_event_id!))[0];
    expect(drift.event_type).toBe("drift");
    expect(drift.payload_json.lifecycle_ref).toBe(rollback.id);
    expect(drift.payload_json.environment).toEqual({ baseline: "environment-v1", restored: true });
  });

  it("separates observed states from Model anticipation", async () => {
    const baseline = "baseline-world-model";
    await ingestSidecarEvent(runStarted(baseline));
    await ingestSidecarEvent(plannerDecision(baseline));
    const call = await ingestSidecarEvent(toolCall(baseline));
    const result = await ingestSidecarEvent({
      ...toolResult(baseline),
      pre_state: { phase: "unknown" },
      post_state: { phase: "BCC+FCC" },
      anticipation: { predicted_phase: "BCC", confidence: null },
    });
    expect(result.gate).toBe("pass");
    const trace = await getExecutionTrace(call.refs.option_event_id!);
    expect(trace?.observations).toHaveLength(4);
    expect(trace?.observations.map((observation) => observation.observation_type)).toEqual(expect.arrayContaining(["input", "pre_state", "post_state", "output"]));
    const anticipation = rows(await client.getModelEventById(result.refs.anticipation_event_id!))[0];
    expect(anticipation.event_type).toBe("anticipation");
    expect(anticipation.payload_json).toMatchObject({
      option_event_id: call.refs.option_event_id,
      anticipation: { predicted_phase: "BCC", confidence: null },
      evidence_origin: "sidecar",
      model_quality: "uncalibrated",
    });
    expect(result.refs.drift_event_id).toBeNull();
    expect(trace?.optionEvent.execution_json.mode).toBe("sidecar");
  });
});
