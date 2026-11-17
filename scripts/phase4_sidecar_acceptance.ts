const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdtemp, readdir, readFile, rm } = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { setMemoryClient } = require("../dist/api/memory.js");
const { registerModel, registerOption, registerSubtask } = require("../dist/api/registry.js");
const { registerPlanner } = require("../dist/api/planner-registry.js");
const { getExecutionTrace } = require("../dist/api/telemetry.js");
const { captureDailyMemory } = require("../dist/api/document-projections.js");
const { memoryRecall } = require("../dist/api/memory-recall.js");
const { ingestSidecarEvent, sidecarEventId } = require("../dist/api/sidecar.js");

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const subtaskId = "sidecar_acceptance_subtask";
const optionId = "sidecar_acceptance_option";
const modelId = "sidecar_acceptance_model";
const plannerId = "sidecar_acceptance_planner";
let server;
let client;
let endpoint;
let directory;
let serverOutput = "";

function rows(result) {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])));
}

function one(result) {
  return rows(result)[0];
}

function runStarted(baseline) {
  return {
    baseline_id: baseline,
    scenario_id: "scenario-p45",
    run_id: "run-p45",
    event_type: "run.started",
    external_id: "run-started-p45",
    subtask_id: subtaskId,
    attempt: 1,
    host_session_ref: "sidecar-acceptance-session",
    mandate: {
      scope: { option_ids: [optionId] },
      policy_version: "p45-policy-v1",
      source_actor: "p45-source-agent",
      strength: "explicit",
      mode: "enforce",
      budget: { max_steps: 4 },
    },
  };
}

function plannerDecision(baseline, rationale) {
  return {
    ...runStarted(baseline),
    event_type: "planner.decision",
    external_id: "planner-call-p45",
    planner_id: plannerId,
    decision: {
      decision: "execute",
      option_id: optionId,
      arguments: { entity: "S01" },
      ...(rationale === undefined ? {} : { rationale }),
      evidence_refs: ["p45-source-evidence"],
      uncertainties: [],
    },
  };
}

function toolCall(baseline, observedMode) {
  return {
    ...runStarted(baseline),
    event_type: "tool.call",
    external_id: "tool-call-p45",
    tool_id: "external-tool-p45",
    call_id: "call-p45",
    planner_call_id: "planner-call-p45",
    option_id: optionId,
    model_id: modelId,
    arguments: { entity: "S01" },
    observed_execution_mode: observedMode,
  };
}

function toolResult(baseline, reward) {
  return {
    ...runStarted(baseline),
    event_type: "tool.result",
    external_id: "tool-result-p45",
    tool_id: "external-tool-p45",
    call_id: "call-p45",
    output: { phase: "BCC+FCC" },
    status: "success",
    ...(reward === undefined ? {} : { scalar_reward: reward }),
    critique: { verdict: "source-reported-only" },
  };
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

async function seed() {
  for (const result of [
    await registerSubtask({
      subtask_id: subtaskId, goal: "P4-5 sidecar acceptance", context: {}, status: "active", utility_queries: 0,
      lin_source: "p45-acceptance", lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script",
    }),
    await registerPlanner({
      planner_id: plannerId, claim: "P4-5 source Planner", layer: "planner", j_premise_ids: [],
      instructions_ref: "sidecar/planner/v1", instructions_version: "1.0", inference_ref: "sidecar-source",
      context_policy: {}, decision_schema: {}, tool_policy: {}, budget_policy: {},
      eps_type: "confidence", eps_value: 0.5, eps_source: "uncalibrated", lin_source: "p45-acceptance",
      lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script", verify: "planner-schema-v0.1", status: "active",
    }),
    await registerOption({
      option_id: optionId, claim: "P4-5 external Option", layer: "option", option_type: "atomic", template_id: null,
      i_preconditions: {}, pi_type: "tool", pi_ref: "external-tool-p45@v1", pi_fallback: "none",
      beta_success: {}, beta_output_schema: {}, rule_ref: null, j_premise_ids: [],
      eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior", lin_source: "p45-acceptance",
      lin_version: "1.0", lin_theta: null, verify: "sidecar-observation-only", status: "probation",
      subtask_binding: subtaskId, model_binding: modelId, input_schema: {},
      created_at: 100, parent_option_id: "parent-p45-option", parent_version: "0.9", origin_event_id: "option_event_p45_generation",
    }),
    await registerModel({
      model_id: modelId, option_id: optionId, claim: "uncalibrated", layer: "model",
      achievable_probability: 0, calibration_history: [], prediction_error: 0, cost_model: { observed: false },
      theta_version: "1.0", estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5,
      eps_source: "inferred-prior", status: "probation", j_records: [], lin_source: "p45-acceptance",
      lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script", verify: "sidecar-observation-only",
      reasoning_spec: null, evidence_spec: { required: ["real"] }, evaluation_spec: null,
    }),
  ]) assert.equal(result.gate, "pass", JSON.stringify(result));
}

(async () => {
  directory = await mkdtemp(resolve(".data/phase4-sidecar-rocks-"));
  await startServer();
  await seed();
  const evidence = { gate: "pass", verifiedAt: new Date().toISOString(), checks: {} };
  const realBaseline = "baseline-p45-real";
  const simulatedBaseline = "baseline-p45-simulated";

  const realRun = await ingestSidecarEvent(runStarted(realBaseline));
  const realPlanner = await ingestSidecarEvent(plannerDecision(realBaseline));
  assert.equal(realRun.gate, "pass");
  assert.equal(realPlanner.gate, "pass");
  const realCallInput = toolCall(realBaseline, "real");
  const rawCallId = sidecarEventId(realCallInput);
  await client.putSidecarEvent({
    sidecar_event_id: rawCallId,
    baseline_id: realCallInput.baseline_id,
    scenario_id: realCallInput.scenario_id,
    run_id: realCallInput.run_id,
    tool_id: realCallInput.tool_id,
    call_id: realCallInput.call_id,
    event_type: realCallInput.event_type,
    external_id: realCallInput.external_id,
    payload_json: realCallInput,
    mapping_json: { refs: null, unmapped: ["crash_after_raw_write"] },
    created_at: 123,
  });
  await client.putOptionEvent({
    option_event_id: "option_event_native_real_p45",
    planner_event_id: realPlanner.refs.planner_event_id,
    option_id: optionId,
    model_id: modelId,
    execution_json: { option_version: "1.0", pi_type: "tool", pi_ref: "external-tool-p45@v1", pi_theta: null, attempt: 1, mode: "real" },
    created_at: 100,
  });
  await restartServer();
  const realCall = await ingestSidecarEvent(realCallInput);
  assert.equal(realCall.gate, "pass", JSON.stringify(realCall));
  assert.equal(realCall.reused, true);
  assert.ok(realCall.refs.option_event_id);
  assert.equal(one(await client.getSidecarEventById(rawCallId)).created_at, 123);
  const realResult = await ingestSidecarEvent(toolResult(realBaseline));
  assert.equal(realResult.gate, "pass", JSON.stringify(realResult));
  const realTrace = await getExecutionTrace(realCall.refs.option_event_id);
  assert.equal(realTrace.optionEvent.execution_json.mode, "sidecar");
  assert.equal(realTrace.optionEvent.execution_json.observed_execution_mode, "real");
  assert.equal(realTrace.outcome.evaluation_json.scalar_reward, null);
  assert.equal(realTrace.outcome.evaluation_json.reward_source, "uncalibrated");
  assert.equal(realTrace.observations.length, 2);
  const realDecision = one(await client.getPlannerDecisionByEventId(realPlanner.refs.planner_event_id));
  assert.equal(realDecision.decision_json.rationale, null);
  assert.equal(one(await client.getOptionEventById("option_event_native_real_p45")).execution_json.mode, "real");
  evidence.checks.raw_crash_recovery_and_unknown_null = true;
  evidence.checks.native_real_and_observed_real_are_separate = true;

  const registeredSkill = await ingestSidecarEvent({
    ...runStarted(realBaseline), event_type: "skill.registered", external_id: "skill-registered-p45",
    option_id: optionId, created_at: 100, parent_option_id: "parent-p45-option",
    parent_version: "0.9", origin_event_id: "option_event_p45_generation",
  });
  const updatedSkill = await ingestSidecarEvent({
    ...runStarted(realBaseline), event_type: "skill.updated", external_id: "skill-updated-p45",
    option_id: optionId, observed_option_version: "1.1",
  });
  assert.equal(registeredSkill.refs.option_id, optionId);
  assert.equal(updatedSkill.refs.option_id, optionId);
  assert.equal(one(await client.getOptionById(optionId)).created_at, 100);
  const noCall = await ingestSidecarEvent({
    ...runStarted(realBaseline), event_type: "planner.decision", external_id: "planner-no-call-p45",
    planner_id: plannerId,
    decision: { decision: "ignore", rationale: "not applicable", evidence_refs: [], uncertainties: [] },
  });
  assert.equal((await client.listOptionEventsByPlannerEventId(noCall.refs.planner_event_id)).rows.length, 0);
  const rollback = await ingestSidecarEvent({
    ...runStarted(realBaseline), event_type: "skill.rollback", external_id: "skill-rollback-p45",
    option_id: optionId, observed_option_version: "1.0", revision_ref: "revision-p45-environment-rollback",
  });
  assert.equal(rollback.refs.option_id, optionId);
  const recoveryCall = await ingestSidecarEvent({
    ...toolCall(realBaseline, "real"), call_id: "call-p45-recovery", external_id: "tool-call-p45-recovery",
    observed_option_version: "1.0", observed_model_version: "theta-1", lifecycle_ref: rollback.id,
  });
  const recoveryResult = await ingestSidecarEvent({
    ...toolResult(realBaseline), call_id: "call-p45-recovery", external_id: "tool-result-p45-recovery",
    environment: { baseline: "environment-v1", restored: true },
    drift: { from: "environment-v2", to: "environment-v1", verdict: "recovered" },
    verification: {
      verifier_id: "independent-p45-regression-verifier",
      verdict: "solved_previous_failure",
      evidence_refs: [realCall.refs.option_event_id],
    },
  });
  assert.equal(recoveryResult.gate, "pass", JSON.stringify(recoveryResult));
  const recoveryTrace = await getExecutionTrace(recoveryCall.refs.option_event_id);
  assert.equal(recoveryTrace.optionEvent.execution_json.observed_option_version, "1.0");
  assert.equal(recoveryTrace.optionEvent.execution_json.observed_model_version, "theta-1");
  assert.equal(recoveryTrace.optionEvent.execution_json.lifecycle_ref, rollback.id);
  assert.ok(recoveryTrace.observations.some((observation) => observation.observation_type === "environment"));
  const verification = one(await client.getModelEventById(recoveryResult.refs.model_event_id));
  assert.equal(verification.event_type, "critique");
  assert.equal(verification.payload_json.verification.verifier_id, "independent-p45-regression-verifier");
  assert.deepEqual(verification.payload_json.verification.evidence_refs, [realCall.refs.option_event_id]);
  const drift = one(await client.getModelEventById(recoveryResult.refs.drift_event_id));
  assert.equal(drift.event_type, "drift");
  assert.equal(drift.payload_json.lifecycle_ref, rollback.id);
  const measurement = {
    registeredSkillEventId: registeredSkill.id,
    updatedSkillEventId: updatedSkill.id,
    noCallPlannerEventId: noCall.refs.planner_event_id,
    rollbackEventId: rollback.id,
    recoveryOptionEventId: recoveryCall.refs.option_event_id,
    verificationModelEventId: recoveryResult.refs.model_event_id,
    driftModelEventId: recoveryResult.refs.drift_event_id,
  };
  evidence.checks.five_skill_measurements = true;

  const simulatedRun = await ingestSidecarEvent(runStarted(simulatedBaseline));
  const simulatedPlanner = await ingestSidecarEvent(plannerDecision(simulatedBaseline, "source stated rationale"));
  const simulatedCall = await ingestSidecarEvent(toolCall(simulatedBaseline, "simulated"));
  const simulatedResult = await ingestSidecarEvent(toolResult(simulatedBaseline, 0));
  assert.notEqual(simulatedRun.refs.plan_run_id, realRun.refs.plan_run_id);
  assert.notEqual(simulatedCall.refs.option_event_id, realCall.refs.option_event_id);
  const simulatedTrace = await getExecutionTrace(simulatedCall.refs.option_event_id);
  assert.equal(simulatedTrace.optionEvent.execution_json.mode, "sidecar");
  assert.equal(simulatedTrace.optionEvent.execution_json.observed_execution_mode, "simulated");
  assert.equal(simulatedTrace.outcome.evaluation_json.scalar_reward, 0);
  assert.equal(simulatedTrace.outcome.evaluation_json.reward_source, "observed");
  assert.equal(one(await client.getPlannerDecisionByEventId(simulatedPlanner.refs.planner_event_id)).decision_json.rationale, "source stated rationale");
  assert.equal((await client.listSidecarEventsByBaselineId(realBaseline)).rows.length, 10);
  assert.equal((await client.listSidecarEventsByBaselineId(simulatedBaseline)).rows.length, 4);
  evidence.checks.baseline_isolation_and_observed_zero_reward = true;

  const incompleteInput = {
    ...runStarted("baseline-p45-incomplete"),
    event_type: "tool.call",
    external_id: "incomplete-call-p45",
    tool_id: "unknown-tool",
    call_id: "unknown-call",
    planner_call_id: "unknown-planner",
    option_id: "unknown-option",
    model_id: "unknown-model",
  };
  const incomplete = await ingestSidecarEvent(incompleteInput);
  assert.equal(incomplete.gate, "pass");
  assert.equal(incomplete.refs.plan_run_id, null);
  assert.equal(incomplete.refs.option_event_id, null);
  assert.equal(incomplete.refs.model_id, null);
  assert.ok(incomplete.unmapped.includes("plan_run_missing"));
  const incompleteRaw = one(await client.getSidecarEventById(incomplete.id));
  assert.equal(incompleteRaw.payload_json.model_id, "unknown-model");
  assert.equal(incompleteRaw.mapping_json.refs.model_id, null);
  assert.equal((await client.getOptionById("unknown-option")).rows.length, 0);
  assert.equal((await client.getModelById("unknown-model")).rows.length, 0);
  evidence.checks.incomplete_chain_raw_only_without_placeholder_assets = true;

  const memoryInput = {
    text: "记住 P4-5 使用 pnpm。",
    namespace: "sidecar:p45-acceptance",
    source_ref: "scenario-p45",
    idempotency_key: "p45-explicit-memory-v1",
  };
  assert.equal((await captureDailyMemory(memoryInput)).reused, false);
  assert.equal((await captureDailyMemory(memoryInput)).reused, true);
  const replayed = await ingestSidecarEvent({ ...realCallInput, memory_hint: memoryInput.text });
  assert.equal(replayed.gate, "blocked");
  assert.equal(replayed.reused, true);
  await restartServer();
  const documents = rows(await client.listMemoryDocuments()).filter((document) => document.namespace === memoryInput.namespace);
  assert.equal(documents.length, 1);
  const recalled = await memoryRecall({ query: "pnpm", namespace: memoryInput.namespace, session_id: "p45-restarted", message_id: "p45-memory-check" });
  assert.ok(recalled.items.some((item) => item.text.includes("pnpm")));
  assert.equal(one(await client.getOptionEventById("option_event_native_real_p45")).execution_json.mode, "real");
  assert.equal((await client.listSidecarEventsByBaselineId(realBaseline)).rows.length, 10);
  const templates = await client.execute("?[count(template_id)] := *plan_templates{template_id}");
  assert.equal(templates.rows[0][0], 0);
  evidence.checks.restart_preserves_raw_mapping_memory_and_no_plan_template = true;

  Object.assign(evidence, {
    endpoint,
    mappingVersion: "sidecar-mapping-v0.1",
    realBaseline,
    simulatedBaseline,
    realRunEventId: realRun.id,
    realPlanRunId: realRun.refs.plan_run_id,
    simulatedPlanRunId: simulatedRun.refs.plan_run_id,
    realPlannerEventId: realPlanner.refs.planner_event_id,
    realOptionEventId: realCall.refs.option_event_id,
    simulatedOptionEventId: simulatedCall.refs.option_event_id,
    nativeRealOptionEventId: "option_event_native_real_p45",
    realOutcome: realTrace.outcome,
    simulatedOutcome: simulatedTrace.outcome,
    realModelEventId: realResult.refs.model_event_id,
    simulatedModelEventId: simulatedResult.refs.model_event_id,
    incompleteSidecarEventId: incomplete.id,
    incompleteUnmapped: incomplete.unmapped,
    memoryDocumentId: documents[0].document_id,
    memoryRecallId: recalled.recall_id,
    measurement,
    realBaselineEventCount: 10,
    planTemplateCount: 0,
    database: "isolated temporary RocksDB; two actual adapter restarts completed",
  });
  writeFileSync(resolve(".data/phase4-sidecar-acceptance-result.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
})().catch((error) => {
  console.error(error);
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  if (directory) await rm(directory, { recursive: true, force: true });
});
