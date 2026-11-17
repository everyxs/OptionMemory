const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdtemp, readdir, readFile, rm, writeFile } = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { memory_set, setMemoryClient } = require("../dist/api/memory.js");
const { registerModel, registerOption, registerRule, registerSubtask } = require("../dist/api/registry.js");
const { registerPlanner } = require("../dist/api/planner-registry.js");
const { beginPlanRun, beginSubtaskExecution, getExecutionTrace } = require("../dist/api/telemetry.js");
const { memoryRecall } = require("../dist/api/memory-recall.js");
const { OptionExecutor, optionEventIdFor } = require("../dist/runtime/option-executor.js");
const { submitPlannerDecision } = require("../dist/runtime/planner.js");
const {
  dispatchRuntimeOutbox,
  enqueueRuntimeInbox,
  getRuntimeQueueStatus,
  processRuntimeInbox,
  runSchedulerOnce,
  scheduleRuntimeTimer,
} = require("../dist/runtime/scheduler.js");

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const entity = "P4SCHEDULERS01";
const plannerId = "phase4_scheduler_planner";
const subtaskId = "phase4_scheduler_s01";
const r2OptionId = "infer_phase_structure_from_xrd";
const memoryOptionId = "parse_scheduler_markdown";
const executeDecision = {
  decision: "execute",
  option_id: r2OptionId,
  arguments: { entity },
  rationale: "P4-3 isolated scheduler acceptance",
  evidence_refs: [entity],
  uncertainties: [],
};
let server;
let client;
let endpoint;
let directory;
let markdownRoot;
let serverOutput = "";

function rows(result) {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])));
}

function one(result) {
  return rows(result)[0];
}

function must(result) {
  assert.equal(result.gate, "pass", JSON.stringify(result));
  return result;
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolveListen) => listener.listen(0, "127.0.0.1", resolveListen));
  const port = listener.address().port;
  await new Promise((resolveClose) => listener.close(resolveClose));
  return port;
}

async function applySchema(port) {
  const files = (await readdir(resolve("schema"))).filter((file) => file.endsWith(".cozo")).sort();
  for (const file of files) {
    const text = await readFile(resolve("schema", file), "utf8");
    for (const block of text.split(/\r?\n\s*\r?\n/)) {
      if (!block.split(/\r?\n/).some((line) => line.trim() && !line.trim().startsWith("#"))) continue;
      const response = await fetch(`http://127.0.0.1:${port}/text-query`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ script: block }),
      });
      const data = await response.json();
      if (data?.message?.includes("conflicts with an existing one") || data?.message?.includes("already exists")) continue;
      assert.ok(response.ok && data?.ok !== false, `${file}: ${data?.message ?? response.status}`);
    }
  }
}

async function startServer() {
  const port = await freePort();
  endpoint = `http://127.0.0.1:${port}/text-query`;
  serverOutput = "";
  const exe = resolve(process.platform === "win32" ? "target/debug/mnestic-mem-adapter.exe" : "target/debug/mnestic-mem-adapter");
  const child = spawn(exe, ["--engine", "rocksdb", "--data", directory, "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  child.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server = child;
  const started = Date.now();
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`, { method: "HEAD" })).ok) break;
    } catch {}
    assert.ok(Date.now() - started < 15_000, `RocksDB server not ready: ${serverOutput}`);
    await sleep(100);
  }
  await applySchema(port);
  client = new MnesticClient({ endpoint, timeoutMs: 30_000 });
  setMemoryClient(client);
}

async function stopServer() {
  if (!server) return;
  const child = server;
  server = undefined;
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
    if (process.platform === "win32" && child.pid) {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      await new Promise((resolveKill) => killer.once("exit", resolveKill));
    } else {
      child.kill();
    }
    await Promise.race([exited, sleep(2_000)]);
  }
}

async function restartServer() {
  await stopServer();
  await startServer();
}

function option(optionId, piType, piRef, inputSchema, betaOutputSchema = {}) {
  return {
    option_id: optionId, claim: optionId, layer: "option", option_type: "atomic", template_id: null,
    i_preconditions: optionId === r2OptionId ? { requires: ["xrd_peak(FCC(111))", "xrd_peak(BCC(110))"] } : {},
    pi_type: piType, pi_ref: piRef, pi_fallback: "none",
    beta_success: optionId === r2OptionId ? { derived: "phase_structure", with_justification: true } : {},
    beta_output_schema: betaOutputSchema, rule_ref: optionId === r2OptionId ? "R2" : null,
    j_premise_ids: [], eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    lin_source: "phase4-scheduler-acceptance", lin_version: "1.0", lin_theta: null,
    verify: "controlled-executor-v1", status: "probation", subtask_binding: subtaskId,
    model_binding: `model_${optionId}_p43`, input_schema: inputSchema,
  };
}

async function seed() {
  must(await registerSubtask({
    subtask_id: subtaskId, goal: "P4-3 isolated persistent scheduler", context: { entity }, status: "active",
    utility_queries: 0, lin_source: "phase4-scheduler-acceptance", lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script",
  }));
  must(await registerPlanner({
    planner_id: plannerId, claim: "P4-3 scheduler", layer: "planner", j_premise_ids: [],
    instructions_ref: "scheduler/v1", instructions_version: "1.0", inference_ref: "acceptance-contract",
    context_policy: { policy_version: "p4-scheduler-v1" }, decision_schema: { type: "object" }, tool_policy: {}, budget_policy: {},
    eps_type: "confidence", eps_value: 0.5, eps_source: "uncalibrated", lin_source: "phase4-scheduler-acceptance",
    lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script", verify: "planner-schema-v0.1", status: "active",
  }));
  must(await registerRule({
    rule_id: "R2", horn_body: "FCC+BCC", horn_head: "phase_structure", opt_i: {}, opt_pi: {}, opt_beta: {},
    layer: "rule", lin_source: "phase4-scheduler-acceptance", lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script", status: "in",
  }));
  for (const peak of ["FCC(111)", "BCC(110)"]) must(await memory_set({
    predicate: "xrd_peak", args: [entity, "2theta", peak], claim: `xrd ${peak}`, layer: "knowledge",
    jPremiseIds: [], epsType: "in-degree", epsValue: 0.5, epsSource: "inferred-prior",
    linSource: "phase4-scheduler-fixture", linVersion: "1.0", linActor: "acceptance-script", verify: "fixture", status: "in",
  }));
  must(await registerOption(option(r2OptionId, "api", "deriveClosure(R2)", {
    type: "object", required: ["entity"], properties: { entity: { type: "string" } }, additionalProperties: false,
  }, { predicate: "phase_structure" })));
  must(await registerOption(option(memoryOptionId, "parse", "markdown-note@v1", {
    type: "object", required: ["path", "root", "namespace"],
    properties: { path: { type: "string" }, root: { type: "string" }, namespace: { type: "string" } }, additionalProperties: false,
  })));
  for (const optionId of [r2OptionId, memoryOptionId]) must(await registerModel({
    model_id: `model_${optionId}_p43`, option_id: optionId, claim: "uncalibrated", layer: "model",
    achievable_probability: 0, calibration_history: [], prediction_error: 0, cost_model: { observed: false },
    theta_version: "1.0", estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5,
    eps_source: "inferred-prior", status: "probation", j_records: [], lin_source: "phase4-scheduler-acceptance",
    lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script", verify: "controlled-executor-v1",
    reasoning_spec: null, evidence_spec: { required: ["real"] }, evaluation_spec: null,
  }));
}

async function newPlanRun(id, mode = "enforce") {
  const subtask = must(await beginSubtaskExecution({
    subtask_event_id: `subtask_event_${id}`, subtask_id: subtaskId, baseline_id: "phase4_scheduler_baseline",
    mandate_json: {
      scope: { option_ids: [r2OptionId, memoryOptionId], allowed_effects: ["execute"] },
      policy_version: "p4-scheduler-v1", source_actor: "acceptance-user", strength: "explicit", mode,
      budget: { max_steps: 50 },
    },
  }));
  return must(await beginPlanRun({
    plan_run_id: id, subtask_event_id: subtask.id, attempt: 1, host_type: "opencode",
    host_session_ref: "phase4-scheduler-acceptance", idempotency_key: `${id}-start`, mapping_version: "scheduler-v1",
  }));
}

async function enqueueExecute(externalId, planRunId, decision = executeDecision) {
  return enqueueRuntimeInbox({
    event_type: "request", source: "phase4-scheduler-acceptance", external_id: externalId,
    payload: { plan_run_id: planRunId, decision },
  });
}

async function stopPlan(planRunId, key) {
  return must(await submitPlannerDecision({
    plan_run_id: planRunId, planner_id: plannerId, idempotency_key: key,
    state_snapshot_ref: key, state_hash: key,
    decision: { decision: "stop", rationale: "P4-3 stop boundary", evidence_refs: [], uncertainties: [] },
  }));
}

async function plannerEventCount(planRunId) {
  const events = rows(await client.listPlannerEventsBySubtaskId(subtaskId));
  return events.filter((event) => event.plan_run_id === planRunId).length;
}

(async () => {
  directory = await mkdtemp(resolve(".data/phase4-scheduler-rocks-"));
  markdownRoot = await mkdtemp(resolve(".data/phase4-scheduler-markdown-"));
  await writeFile(resolve(markdownRoot, "note.md"), "# 项目决策\n\n记住使用 pnpm 管理依赖。\n\n## 实验\n\nS01 硬度为 512 HV。\n");
  await startServer();
  await seed();
  const evidence = { gate: "pass", verifiedAt: new Date().toISOString(), checks: {} };

  const primaryPlan = "plan_run_p43_primary";
  await newPlanRun(primaryPlan);
  const first = await enqueueExecute("p43-trigger-primary", primaryPlan);
  const duplicate = await enqueueExecute("p43-trigger-primary", primaryPlan);
  assert.equal(first.reused, false);
  assert.equal(duplicate.reused, true);
  const decided = await processRuntimeInbox({ event_id: first.id, owner: "worker-a", planner_id: plannerId });
  assert.equal(decided.status, "outbox_pending");
  assert.ok(one(await client.getPlannerDecisionByEventId(decided.id)));
  assert.equal(one(await client.getRuntimeOutboxById(decided.id)).status, "pending");
  assert.equal((await client.getOptionEventById(optionEventIdFor("p43-trigger-primary"))).rows.length, 0);
  const executed = await dispatchRuntimeOutbox({ decision_id: decided.id, owner: "worker-a" });
  assert.equal(executed.status, "success");
  assert.equal((await getExecutionTrace(executed.id)).outcome.status, "success");
  assert.equal((await dispatchRuntimeOutbox({ decision_id: decided.id, owner: "worker-b" })).status, "reused");
  const primaryOutcomeEvents = (await getRuntimeQueueStatus()).inbox.filter((event) => event.event_type === "option_outcome" && event.external_id === executed.id);
  assert.equal(primaryOutcomeEvents.length, 1);
  Object.assign(evidence, { primaryPlan, primaryInboxId: first.id, primaryDecisionId: decided.id, primaryOptionEventId: executed.id });
  evidence.checks.duplicate_trigger = true;

  const crashPlan = "plan_run_p43_crash_before_dispatch";
  await newPlanRun(crashPlan);
  const crashTrigger = await enqueueExecute("p43-crash-before-dispatch", crashPlan);
  const crashDecision = await processRuntimeInbox({ event_id: crashTrigger.id, owner: "worker-crash", planner_id: plannerId });
  assert.equal(crashDecision.status, "outbox_pending");
  const crashOptionEventId = optionEventIdFor("p43-crash-before-dispatch");
  await restartServer();
  assert.equal(one(await client.getRuntimeOutboxById(crashDecision.id)).status, "pending");
  assert.equal((await client.getOptionEventById(crashOptionEventId)).rows.length, 0);
  const recovered = await dispatchRuntimeOutbox({ decision_id: crashDecision.id, owner: "worker-recovered" });
  assert.equal(recovered.id, crashOptionEventId);
  assert.equal(recovered.status, "success");
  assert.equal((await dispatchRuntimeOutbox({ decision_id: crashDecision.id, owner: "worker-recovered" })).status, "reused");
  Object.assign(evidence, { crashPlan, crashDecisionId: crashDecision.id, crashOptionEventId });
  evidence.checks.crash_before_dispatch_recovery = true;

  const leasePlan = "plan_run_p43_lease_recovery";
  await newPlanRun(leasePlan);
  const leaseTrigger = await enqueueExecute("p43-expired-lease", leasePlan);
  const leaseNow = Date.now() / 1000;
  assert.equal((await client.leaseRuntimeInbox(leaseTrigger.id, "worker-crash", leaseNow, leaseNow + 0.01)).rows.length, 1);
  assert.equal((await client.leaseRuntimeInbox(leaseTrigger.id, "worker-other", leaseNow, leaseNow + 30)).rows.length, 0);
  await restartServer();
  const recoveredLease = await processRuntimeInbox({ event_id: leaseTrigger.id, owner: "worker-other", planner_id: plannerId });
  assert.equal(recoveredLease.status, "outbox_pending");
  Object.assign(evidence, { leasePlan, leaseInboxId: leaseTrigger.id, recoveredLeaseDecisionId: recoveredLease.id });
  evidence.checks.lease_not_stolen_and_expired_recovery = true;

  const lostPlan = "plan_run_p43_lost_outcome";
  await newPlanRun(lostPlan);
  const lostTrigger = await enqueueExecute("p43-lost-outcome", lostPlan);
  const lostDecision = await processRuntimeInbox({ event_id: lostTrigger.id, owner: "worker-a", planner_id: plannerId });
  const lostOptionEventId = optionEventIdFor("p43-lost-outcome");
  const lostOutbox = one(await client.getRuntimeOutboxById(lostDecision.id));
  const lostExecution = await new OptionExecutor().execute({
    option_id: r2OptionId, planner_event_id: lostDecision.id, arguments: { entity },
    mandate: lostOutbox.payload.mandate, idempotency_key: "p43-lost-outcome",
    option_event_id: lostOptionEventId, attempt: 1, mode: "real",
  });
  assert.equal(lostExecution.status, "success");
  assert.equal(lostExecution.output.justified, true);
  const observationsBeforeReconcile = (await getExecutionTrace(lostOptionEventId)).observations.length;
  await client.execute(
    "?[option_event_id] := *option_event_outcome{option_event_id}, option_event_id == $id :rm option_event_outcome {option_event_id}",
    { id: lostOptionEventId },
  );
  assert.equal((await client.getOptionOutcomeByOptionEventId(lostOptionEventId)).rows.length, 0);
  await restartServer();
  const reconcile = await dispatchRuntimeOutbox({ decision_id: lostDecision.id, owner: "worker-recovered" });
  assert.equal(reconcile.status, "reconcile_required");
  assert.equal((await dispatchRuntimeOutbox({ decision_id: lostDecision.id, owner: "worker-recovered" })).status, "reconcile_required");
  assert.equal((await client.getOptionEventById(lostOptionEventId)).rows.length, 1);
  assert.equal((await client.getOptionOutcomeByOptionEventId(lostOptionEventId)).rows.length, 0);
  const lostTraceAfterReconcile = await getExecutionTrace(lostOptionEventId);
  assert.equal(lostTraceAfterReconcile.observations.length, observationsBeforeReconcile);
  assert.ok(lostTraceAfterReconcile.observations.some((observation) => observation.observation_type === "output"));
  assert.match(one(await client.getRuntimeOutboxById(lostDecision.id)).last_error, /reconcile required/);
  Object.assign(evidence, {
    lostPlan, lostDecisionId: lostDecision.id, lostOptionEventId,
    lostOutcomeFaultInjection: "real successful execution; deleted only outcome before restart",
    lostSideEffectObservationCount: observationsBeforeReconcile,
  });
  evidence.checks.missing_outcome_reconcile_without_replay = true;

  const timerPlan = "plan_run_p43_timer";
  await newPlanRun(timerPlan);
  let timerPlannerCalls = 0;
  const timerDecision = async () => { timerPlannerCalls += 1; return executeDecision; };
  const timer = await scheduleRuntimeTimer({
    plan_run_id: timerPlan, planner_id: plannerId, idempotency_key: "p43-timer",
    available_at: Date.now() / 1000 + 60, waiting_condition: "after 60 seconds", decision: executeDecision,
  });
  assert.equal((await scheduleRuntimeTimer({
    plan_run_id: timerPlan, planner_id: plannerId, idempotency_key: "p43-timer",
    available_at: Date.now() / 1000 + 60, waiting_condition: "after 60 seconds", decision: executeDecision,
  })).reused, true);
  assert.deepEqual(await runSchedulerOnce({ owner: "worker-timer", planner_id: plannerId, plan_run_id: timerPlan, decide: timerDecision }), []);
  assert.equal(timerPlannerCalls, 0);
  const timerRow = one(await client.getRuntimeInboxById(timer.id));
  await client.putRuntimeInbox({ ...timerRow, available_at: Date.now() / 1000 - 1 });
  const awakened = await runSchedulerOnce({ owner: "worker-timer", planner_id: plannerId, plan_run_id: timerPlan, decide: timerDecision });
  assert.equal(awakened.filter((result) => result.status === "outbox_pending").length, 1);
  assert.equal(timerPlannerCalls, 1);
  Object.assign(evidence, { timerPlan, timerInboxId: timer.id, timerDecisionId: awakened[0].id, timerPlannerCalls });
  evidence.checks.wait_and_single_timer_wakeup = true;

  const dryRunPlan = "plan_run_p43_dry_run";
  await newPlanRun(dryRunPlan, "dry-run");
  const dryTrigger = await enqueueExecute("p43-dry-run", dryRunPlan);
  const dryResult = await processRuntimeInbox({ event_id: dryTrigger.id, owner: "worker-dry", planner_id: plannerId });
  assert.equal(dryResult.status, "done");
  assert.equal((await client.getRuntimeOutboxById(dryResult.id)).rows.length, 0);
  evidence.dryRunPlan = dryRunPlan;
  evidence.checks.dry_run_has_no_outbox = true;

  const stoppedPlan = "plan_run_p43_stopped";
  await newPlanRun(stoppedPlan);
  const stoppedTimer = await scheduleRuntimeTimer({
    plan_run_id: stoppedPlan, planner_id: plannerId, idempotency_key: "p43-stopped-timer",
    available_at: Date.now() / 1000 - 1, waiting_condition: "expired", decision: executeDecision,
  });
  await stopPlan(stoppedPlan, "p43-stop");
  let stoppedPlannerCalls = 0;
  const stoppedResults = await runSchedulerOnce({
    owner: "worker-stop", planner_id: plannerId, plan_run_id: stoppedPlan,
    decide: async () => { stoppedPlannerCalls += 1; return executeDecision; },
  });
  assert.equal(stoppedResults.length, 1);
  assert.equal(stoppedResults[0].status, "ignored");
  assert.equal(stoppedPlannerCalls, 0);
  assert.equal(one(await client.getRuntimeInboxById(stoppedTimer.id)).status, "ignored");
  Object.assign(evidence, { stoppedPlan, stoppedTimerInboxId: stoppedTimer.id, stoppedPlannerCalls });
  evidence.checks.stop_ignores_pending_events = true;

  const memoryPlan = "plan_run_p43_memory";
  const memoryNamespace = "phase4:scheduler-memory";
  await newPlanRun(memoryPlan);
  const memoryDecision = {
    decision: "execute", option_id: memoryOptionId,
    arguments: { path: "note.md", root: markdownRoot, namespace: memoryNamespace },
    rationale: "Scheduled daily-memory capture", evidence_refs: ["note.md"], uncertainties: [],
  };
  const memoryTrigger = await enqueueExecute("p43-memory-capture", memoryPlan, memoryDecision);
  assert.equal((await enqueueExecute("p43-memory-capture", memoryPlan, memoryDecision)).reused, true);
  const memoryOutbox = await processRuntimeInbox({ event_id: memoryTrigger.id, owner: "worker-memory", planner_id: plannerId });
  const memoryExecution = await dispatchRuntimeOutbox({ decision_id: memoryOutbox.id, owner: "worker-memory" });
  assert.equal(memoryExecution.status, "success");
  assert.equal(memoryExecution.execution.output.reused, false);
  const memoryDocumentId = memoryExecution.execution.output.document_id;
  await restartServer();
  assert.equal((await dispatchRuntimeOutbox({ decision_id: memoryOutbox.id, owner: "worker-memory" })).status, "reused");
  const memoryDocuments = rows(await client.listMemoryDocuments()).filter((document) => document.namespace === memoryNamespace);
  assert.equal(memoryDocuments.length, 1);
  assert.equal((await client.listMemoryChunksByDocumentId(memoryDocumentId)).rows.length, 2);
  await stopPlan(memoryPlan, "p43-memory-stop");
  const beforeRecallEvents = await plannerEventCount(memoryPlan);
  const recalled = await memoryRecall({ query: "pnpm", namespace: memoryNamespace, session_id: "p43-stopped-recall", message_id: "p43-stopped-recall-message" });
  assert.equal(recalled.gate, "pass");
  assert.ok(recalled.items.some((item) => item.text.includes("pnpm")));
  assert.equal(await plannerEventCount(memoryPlan), beforeRecallEvents);
  assert.equal(one(await client.getPlanRunById(memoryPlan)).status, "stopped");
  Object.assign(evidence, {
    memoryPlan, memoryInboxId: memoryTrigger.id, memoryDecisionId: memoryOutbox.id,
    memoryOptionEventId: memoryExecution.id, memoryDocumentId, memoryRecallId: recalled.recall_id,
    memoryDocumentCount: memoryDocuments.length,
  });
  evidence.checks.memory_capture_idempotent_and_recall_does_not_resume_stop = true;

  evidence.endpoint = endpoint;
  evidence.database = "isolated temporary RocksDB; actual adapter restarts completed before dispatch, lease recovery, outcome reconciliation, and memory reuse";
  writeFileSync(resolve(".data/phase4-scheduler-acceptance-result.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
})().catch((error) => {
  console.error(error);
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  if (directory) await rm(directory, { recursive: true, force: true });
  if (markdownRoot) await rm(markdownRoot, { recursive: true, force: true });
});
