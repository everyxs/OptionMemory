import { beforeAll, describe, expect, it } from "vitest";
import { memory_set, setMemoryClient } from "../src/api/memory";
import { registerPlanner } from "../src/api/planner-registry";
import { registerModel, registerOption, registerRule, registerSubtask } from "../src/api/registry";
import { beginPlanRun, beginSubtaskExecution, getExecutionTrace } from "../src/api/telemetry";
import { plannerEventIdFor, submitPlannerDecision } from "../src/runtime/planner";
import { optionEventIdFor } from "../src/runtime/option-executor";
import {
  dispatchRuntimeOutbox,
  enqueueRuntimeInbox,
  getRuntimeQueueStatus,
  processRuntimeInbox,
  runSchedulerOnce,
  scheduleRuntimeTimer,
} from "../src/runtime/scheduler";
import type { PlannerDecision } from "../src/api/planner-contracts";
import type { OptionInput } from "../src/memory/assets";
import { MnesticClient } from "../src/memory/mnesticClient";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const planRunId = "plan_run_scheduler_s01";
const executeDecision: PlannerDecision = {
  decision: "execute",
  option_id: "infer_phase_structure_from_xrd",
  arguments: { entity: "SCHEDULERS01" },
  rationale: "Scheduled R2",
  evidence_refs: ["SCHEDULERS01"],
  uncertainties: [],
};

function option(): OptionInput {
  return {
    option_id: "infer_phase_structure_from_xrd", claim: "R2", layer: "option", option_type: "atomic", template_id: null,
    i_preconditions: { requires: ["xrd_peak(FCC(111))", "xrd_peak(BCC(110))"] },
    pi_type: "api", pi_ref: "deriveClosure(R2)", pi_fallback: "none",
    beta_success: { derived: "phase_structure", with_justification: true },
    beta_output_schema: { predicate: "phase_structure" }, rule_ref: "R2", j_premise_ids: [],
    eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior", lin_source: "scheduler-test",
    lin_version: "1.0", lin_theta: null, verify: "controlled-executor-v1", status: "probation",
    subtask_binding: "scheduler_s01", model_binding: "model_scheduler_r2",
    input_schema: { type: "object", required: ["entity"], properties: { entity: { type: "string" } }, additionalProperties: false },
  };
}

async function newPlanRun(id: string, mode: "enforce" | "dry-run" = "enforce") {
  const subtask = await beginSubtaskExecution({
    subtask_event_id: `subtask_event_${id}`, subtask_id: "scheduler_s01", baseline_id: "scheduler_baseline",
    mandate_json: {
      scope: { option_ids: ["infer_phase_structure_from_xrd"], allowed_effects: ["execute"] },
      policy_version: "scheduler-v1", source_actor: "vitest", strength: "explicit", mode,
      budget: { max_steps: 50 },
    },
  });
  return beginPlanRun({
    plan_run_id: id, subtask_event_id: subtask.id, attempt: 1, host_type: "opencode",
    host_session_ref: "scheduler-test", idempotency_key: `${id}-start`, mapping_version: "scheduler-v1",
  });
}

async function enqueueExecute(id: string, planRun = planRunId) {
  return enqueueRuntimeInbox({
    event_type: "request", source: "scheduler-test", external_id: id,
    payload: { plan_run_id: planRun, decision: executeDecision },
  });
}

beforeAll(async () => {
  setMemoryClient(client);
  await registerSubtask({
    subtask_id: "scheduler_s01", goal: "Scheduler acceptance", context: { entity: "SCHEDULERS01" }, status: "active",
    utility_queries: 0, lin_source: "scheduler-test", lin_version: "1.0", lin_theta: null, lin_actor: "vitest",
  });
  await registerPlanner({
    planner_id: "scheduler_planner", claim: "Scheduler test planner", layer: "planner", j_premise_ids: [],
    instructions_ref: "scheduler/v1", instructions_version: "1.0", inference_ref: "contract-test",
    context_policy: { policy_version: "scheduler-v1" }, decision_schema: { type: "object" }, tool_policy: {}, budget_policy: {},
    eps_type: "confidence", eps_value: 0.5, eps_source: "uncalibrated", lin_source: "scheduler-test", lin_version: "1.0",
    lin_theta: null, lin_actor: "vitest", verify: "planner-schema-v0.1", status: "active",
  });
  await registerRule({
    rule_id: "R2", horn_body: "FCC+BCC", horn_head: "phase_structure", opt_i: {}, opt_pi: {}, opt_beta: {},
    layer: "rule", lin_source: "scheduler-test", lin_version: "1.0", lin_theta: null, lin_actor: "vitest", status: "in",
  });
  for (const peak of ["FCC(111)", "BCC(110)"]) await memory_set({
    predicate: "xrd_peak", args: ["SCHEDULERS01", "2theta", peak], claim: `xrd ${peak}`, layer: "knowledge",
    jPremiseIds: [], epsType: "in-degree", epsValue: 0.5, epsSource: "inferred-prior", linSource: "scheduler-test",
    linVersion: "1.0", linActor: "vitest", verify: "fixture", status: "in",
  });
  await registerOption(option());
  await registerModel({
    model_id: "model_scheduler_r2", option_id: "infer_phase_structure_from_xrd", claim: "uncalibrated", layer: "model",
    achievable_probability: 0, calibration_history: [], prediction_error: 0, cost_model: { observed: false },
    theta_version: "1.0", estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5,
    eps_source: "inferred-prior", status: "probation", j_records: [], lin_source: "scheduler-test", lin_version: "1.0",
    lin_theta: null, lin_actor: "vitest", verify: "controlled-executor-v1", reasoning_spec: null,
    evidence_spec: { required: ["real"] }, evaluation_spec: null,
  });
  expect((await newPlanRun(planRunId)).gate).toBe("pass");
});

describe("shared persistent scheduler", () => {
  it("deduplicates trigger and commits decision/outbox before execution", async () => {
    const first = await enqueueExecute("scheduler-trigger-1");
    const duplicate = await enqueueExecute("scheduler-trigger-1");
    expect(first.reused).toBe(false);
    expect(duplicate.reused).toBe(true);
    const decided = await processRuntimeInbox({ event_id: first.id, owner: "scheduler-a", planner_id: "scheduler_planner" });
    expect(decided.status).toBe("outbox_pending");
    const queue = await getRuntimeQueueStatus();
    expect(queue.outbox).toHaveLength(1);
    expect(queue.outbox[0].status).toBe("pending");
    const executed = await dispatchRuntimeOutbox({ decision_id: decided.id, owner: "scheduler-a" });
    expect(executed).toMatchObject({ gate: "pass", status: "success" });
    expect((await getExecutionTrace(executed.id))?.outcome?.status).toBe("success");
    expect((await dispatchRuntimeOutbox({ decision_id: decided.id, owner: "scheduler-a" })).status).toBe("reused");
    expect((await getRuntimeQueueStatus()).inbox.filter((row) => row.event_type === "option_outcome")).toHaveLength(1);
  });

  it("does not steal active leases and recovers them after expiry", async () => {
    const event = await enqueueExecute("scheduler-lease-1");
    const now = Date.now() / 1000;
    expect((await client.leaseRuntimeInbox(event.id, "owner-a", now, now + 0.01)).rows).toHaveLength(1);
    expect((await client.leaseRuntimeInbox(event.id, "owner-b", now, now + 10)).rows).toHaveLength(0);
    expect((await client.leaseRuntimeInbox(event.id, "owner-b", now + 0.02, now + 10)).rows).toHaveLength(1);
  });

  it("serializes decisions for the same subtask", async () => {
    const first = await enqueueExecute("scheduler-serial-1");
    const second = await enqueueExecute("scheduler-serial-2");
    let release!: (value: PlannerDecision) => void;
    let decisionStartedResolve!: () => void;
    const decisionStarted = new Promise<void>((resolve) => { decisionStartedResolve = resolve; });
    const waiting = new Promise<PlannerDecision>((resolve) => { release = resolve; });
    const firstProcess = processRuntimeInbox({
      event_id: first.id,
      owner: "owner-a",
      planner_id: "scheduler_planner",
      decide: () => {
        decisionStartedResolve();
        return waiting;
      },
    });
    await decisionStarted;
    const secondProcess = await processRuntimeInbox({ event_id: second.id, owner: "owner-b", planner_id: "scheduler_planner" });
    expect(secondProcess.status).toBe("subtask_lease_unavailable");
    release(executeDecision);
    expect((await firstProcess).status).toBe("outbox_pending");
  });

  it("rolls back decision and outbox when the atomic write fails", async () => {
    class FailingClient extends MnesticClient {
      calls = 0;
      override async execute(script: string, params: Record<string, unknown> = {}) {
        if (script.includes(":put runtime_outbox")) throw new Error("injected outbox failure");
        return super.execute(script, params);
      }
    }
    const failing = new FailingClient({ endpoint: TEST_ENDPOINT });
    setMemoryClient(failing);
    await expect(submitPlannerDecision({
      plan_run_id: planRunId, planner_id: "scheduler_planner", idempotency_key: "atomic-failure",
      state_snapshot_ref: "atomic-failure", state_hash: "atomic-failure", decision: executeDecision, defer_to_outbox: true,
    })).rejects.toThrow("injected outbox failure");
    setMemoryClient(client);
    expect((await client.getPlannerDecisionByEventId(plannerEventIdFor(planRunId, "atomic-failure"))).rows).toHaveLength(0);
    expect((await client.getRuntimeOutboxById(plannerEventIdFor(planRunId, "atomic-failure"))).rows).toHaveLength(0);
  });

  it("reconciles an execution with missing outcome instead of replaying", async () => {
    const event = await enqueueExecute("scheduler-lost-outcome");
    const decided = await processRuntimeInbox({ event_id: event.id, owner: "scheduler-a", planner_id: "scheduler_planner" });
    const optionEventId = optionEventIdFor("scheduler-lost-outcome");
    const outbox = (await getRuntimeQueueStatus()).outbox.find((row) => row.decision_id === decided.id)!;
    const { beginOptionExecution } = await import("../src/api/telemetry");
    const started = await beginOptionExecution({
      option_event_id: optionEventId,
      planner_event_id: outbox.decision_id,
      option_id: "infer_phase_structure_from_xrd",
      model_id: "model_scheduler_r2",
      execution_json: { option_version: "1.0", pi_type: "api", pi_ref: "deriveClosure(R2)", pi_theta: null, attempt: 1, mode: "real" },
    });
    expect(started).toMatchObject({ gate: "pass" });
    const result = await dispatchRuntimeOutbox({ decision_id: decided.id, owner: "scheduler-a" });
    expect(result).toMatchObject({ gate: "blocked", status: "reconcile_required" });
  });

  it("does not call Planner while waiting and wakes once at timer expiry", async () => {
    let plannerCalls = 0;
    const timerPlanRunId = "plan_run_scheduler_timer";
    await newPlanRun(timerPlanRunId);
    const timer = await scheduleRuntimeTimer({
      plan_run_id: timerPlanRunId, planner_id: "scheduler_planner", idempotency_key: "scheduler-timer-1",
      available_at: Date.now() / 1000 + 60, waiting_condition: "after 60 seconds",
      decision: executeDecision,
    });
    expect((await runSchedulerOnce({ owner: "scheduler-a", planner_id: "scheduler_planner", plan_run_id: timerPlanRunId, decide: async () => { plannerCalls++; return executeDecision; } })).length).toBe(0);
    expect(plannerCalls).toBe(0);
    const expired = await client.getRuntimeInboxById(timer.id);
    const row = Object.fromEntries(expired.headers.map((header, index) => [header, expired.rows[0][index]])) as any;
    await client.putRuntimeInbox({ ...row, available_at: Date.now() / 1000 - 1 });
    const results = await runSchedulerOnce({ owner: "scheduler-a", planner_id: "scheduler_planner", plan_run_id: timerPlanRunId, decide: async () => { plannerCalls++; return executeDecision; } });
    expect(results.some((result) => result.status === "outbox_pending")).toBe(true);
    expect(plannerCalls).toBe(1);
    expect((await runSchedulerOnce({ owner: "scheduler-a", planner_id: "scheduler_planner", plan_run_id: timerPlanRunId })).length).toBe(1);
    expect((await runSchedulerOnce({ owner: "scheduler-a", planner_id: "scheduler_planner", plan_run_id: timerPlanRunId })).length).toBe(1);
    expect((await runSchedulerOnce({ owner: "scheduler-a", planner_id: "scheduler_planner", plan_run_id: timerPlanRunId })).length).toBe(0);
  });

  it("keeps dry-run free of outbox and ignores events after stop", async () => {
    const dryRunId = "plan_run_scheduler_dry_run";
    await newPlanRun(dryRunId, "dry-run");
    const event = await enqueueExecute("scheduler-dry-run-1", dryRunId);
    const result = await processRuntimeInbox({ event_id: event.id, owner: "scheduler-a", planner_id: "scheduler_planner" });
    expect(result.status).toBe("done");
    expect((await getRuntimeQueueStatus()).outbox.some((row) => row.decision_id === result.id)).toBe(false);
    expect((await submitPlannerDecision({
      plan_run_id: planRunId, planner_id: "scheduler_planner", idempotency_key: "scheduler-stop",
      state_snapshot_ref: "scheduler-stop", state_hash: "scheduler-stop",
      decision: { decision: "stop", rationale: "Stop scheduler acceptance", evidence_refs: [], uncertainties: [] },
    })).gate).toBe("pass");
    const stopped = await enqueueExecute("scheduler-after-stop");
    const ignored = await processRuntimeInbox({ event_id: stopped.id, owner: "scheduler-a", planner_id: "scheduler_planner" });
    expect(ignored.status).toBe("ignored");
  });
});
