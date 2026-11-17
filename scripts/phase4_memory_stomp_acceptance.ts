const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdtemp, readdir, readFile, rm, writeFile } = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { tmpdir } = require("node:os");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { setMemoryClient } = require("../dist/api/memory.js");
const { registerModel, registerOption } = require("../dist/api/registry.js");
const { beginSubtaskExecution } = require("../dist/api/telemetry.js");
const { startContinuousHost } = require("../dist/api/continuous-host.js");
const { submitPlannerDecision } = require("../dist/runtime/planner.js");
const { optionEventIdFor } = require("../dist/runtime/option-executor.js");
const { registerNativeSkillOption } = require("../dist/runtime/native-skill.js");
const { memoryRecall } = require("../dist/api/memory-recall.js");
const { listStaleMappings } = require("../dist/api/document-projections.js");
const { executeMemoryWrite, memoryWritePlanRunId, MEMORY_WRITE_SUBTASK_ID, MEMORY_WRITE_PLANNER_ID, MEMORY_CAPTURE_OPTION_ID } = require("../dist/api/memory-write-options.js");
const { ingestSidecarEvent } = require("../dist/api/sidecar.js");
const { getExecutionTrace } = require("../dist/api/telemetry.js");
const { plannerEventIdFor } = require("../dist/runtime/planner.js");

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
let server;
let client;
let endpoint;
let directory;
let markdownRoot;
let serverOutput = "";

function rows(result) {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])));
}
function one(result) { return rows(result)[0]; }
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
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ script: block }),
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
    try { if ((await fetch(`http://127.0.0.1:${port}/`, { method: "HEAD" })).ok) break; } catch {}
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
    } else child.kill();
    await Promise.race([exited, sleep(2_000)]);
  }
}
async function restartServer() { await stopServer(); await startServer(); }
function captureInput(text, key, namespace) {
  return { text, namespace, source_ref: `message:${key}`, idempotency_key: key, session_id: "p46-session-a", message_id: key };
}
async function write(operation, key, args, namespace) {
  return executeMemoryWrite({
    operation, host_type: "opencode", host_session_ref: "p46-session-a", namespace,
    source_ref: args.source_ref, idempotency_key: key, arguments: args,
  });
}

(async () => {
  directory = await mkdtemp(resolve(".data/phase4-memory-stomp-rocks-"));
  markdownRoot = await mkdtemp(join(tmpdir(), "phase4-memory-stomp-md-"));
  await startServer();
  const evidence = { gate: "pass", verifiedAt: new Date().toISOString(), checks: {} };
  const namespace = "project:p46-acceptance";
  const capture = await write("capture", "p46-capture-v1", captureInput("记住项目使用 pnpm。", "p46-capture-v1", namespace), namespace);
  assert.equal(capture.gate, "pass", JSON.stringify(capture));
  assert.equal(capture.reused, false);
  const duplicate = await write("capture", "p46-capture-v1", captureInput("记住项目使用 pnpm。", "p46-capture-v1", namespace), namespace);
  assert.equal(duplicate.reused, true);
  const captureOptionEventId = optionEventIdFor("p46-capture-v1");
  const captureTrace = await getExecutionTrace(captureOptionEventId);
  assert.equal(captureTrace.optionEvent.execution_json.mode, "real");
  assert.equal(captureTrace.outcome.status, "success");
  const capturePlanRunId = memoryWritePlanRunId("opencode", namespace, "p46-session-a");
  assert.ok(one(await client.getPlannerDecisionByEventId(plannerEventIdFor(capturePlanRunId, "p46-capture-v1"))));
  evidence.checks.capture_native_stomp_and_idempotency = true;

  const revised = await write("revise", "p46-revise-v1", { ...captureInput("改用 yarn。", "p46-revise-v1", namespace), supersedes: capture.id }, namespace);
  assert.equal(revised.gate, "pass", JSON.stringify(revised));
  assert.equal(one(await client.getMemoryDocumentById(capture.id)).status, "superseded");
  assert.equal(one(await client.getMemoryDocumentById(revised.id)).supersedes, capture.id);
  const recalled = await memoryRecall({ query: "yarn", namespace, session_id: "p46-session-b", message_id: "p46-recall-after-revise" });
  assert.ok(recalled.reference_text.includes("yarn"));
  assert.ok(!recalled.reference_text.includes("pnpm"));
  const duplicateRevision = await write("revise", "p46-revise-v1", { ...captureInput("改用 yarn。", "p46-revise-v1", namespace), supersedes: capture.id }, namespace);
  assert.equal(duplicateRevision.reused, true);
  evidence.checks.revise_superseding_and_next_recall = true;

  await client.execute("?[option_event_id] := *option_event_outcome{option_event_id}, option_event_id == $id :rm option_event_outcome {option_event_id}", { id: captureOptionEventId });
  const reconciled = await write("capture", "p46-capture-v1", captureInput("记住项目使用 pnpm。", "p46-capture-v1", namespace), namespace);
  assert.equal(reconciled.gate, "blocked");
  assert.match(reconciled.reason, /reconcile_required/);
  assert.equal(one(await client.getMemoryDocumentById(capture.id)).status, "superseded");
  evidence.checks.missing_outcome_requires_reconcile_without_replay = true;

  await writeFile(resolve(markdownRoot, "project.md"), "# 项目\n\n记住使用 pnpm。\n");
  const fileNamespace = "project:p46-refresh";
  const parsed = await write("parse", "p46-markdown-v1", { path: "project.md", root: markdownRoot, namespace: fileNamespace, source_ref: "project.md", idempotency_key: "p46-markdown-v1" }, fileNamespace);
  assert.equal(parsed.gate, "pass", JSON.stringify(parsed));
  const recalledPnpm = await memoryRecall({ query: "pnpm", namespace: fileNamespace, session_id: "p46-refresh", message_id: "refresh-1", markdown_root: markdownRoot });
  assert.ok(recalledPnpm.reference_text.includes("pnpm"));
  await writeFile(resolve(markdownRoot, "project.md"), "# 项目\n\n改用 yarn。\n");
  const recalledYarn = await memoryRecall({ query: "yarn", namespace: fileNamespace, session_id: "p46-refresh", message_id: "refresh-2", markdown_root: markdownRoot });
  assert.ok(recalledYarn.reference_text.includes("yarn"));
  const currentDocument = one(await client.getMemoryDocumentById(parsed.document_id));
  assert.notEqual(currentDocument.content_hash, parsed.content_hash);
  assert.ok((await listStaleMappings()).some((mapping) => mapping.document_id === parsed.document_id && mapping.mapping_status === "stale"));
  assert.ok((await readFile(resolve(markdownRoot, "project.md"), "utf8")).includes("yarn"));
  evidence.checks.recall_refresh_option_and_stale_mapping = true;
  evidence.refreshOptionEventId = optionEventIdFor(`recall-refresh:${parsed.document_id}:${currentDocument.content_hash}`);

  const baseline = "baseline-p46-world";
  const mandate = {
    scope: { option_ids: [MEMORY_CAPTURE_OPTION_ID], allowed_effects: ["execute"] }, policy_version: "p46-v1",
    source_actor: "p46-source", strength: "explicit", mode: "enforce", budget: { max_steps: 4 },
  };
  const common = { baseline_id: baseline, scenario_id: "scenario-p46", run_id: "run-p46", subtask_id: MEMORY_WRITE_SUBTASK_ID, mandate, attempt: 1 };
  await ingestSidecarEvent({ ...common, event_type: "run.started", external_id: "p46-run" });
  await ingestSidecarEvent({
    ...common, event_type: "planner.decision", external_id: "p46-planner", planner_id: MEMORY_WRITE_PLANNER_ID,
    decision: { decision: "execute", option_id: MEMORY_CAPTURE_OPTION_ID, arguments: captureInput("记住状态转移。", "p46-sidecar", namespace), evidence_refs: ["p46-source"], uncertainties: [] },
  });
  const sidecarCall = await ingestSidecarEvent({
    ...common, event_type: "tool.call", external_id: "p46-tool-call", tool_id: "memory-capture", call_id: "p46-call",
    planner_call_id: "p46-planner", option_id: MEMORY_CAPTURE_OPTION_ID, model_id: "model_memory_capture", arguments: { text: "state" }, observed_execution_mode: "real",
  });
  const sidecarResult = await ingestSidecarEvent({
    ...common, event_type: "tool.result", external_id: "p46-tool-result", call_id: "p46-call",
    pre_state: { package_manager: "unknown" }, post_state: { package_manager: "pnpm" },
    anticipation: { predicted_package_manager: "pnpm", confidence: null }, output: { captured: true }, status: "success",
  });
  assert.equal(sidecarResult.gate, "pass", JSON.stringify(sidecarResult));
  const sidecarTrace = await getExecutionTrace(sidecarCall.refs.option_event_id);
  assert.ok(sidecarTrace.observations.some((observation) => observation.observation_type === "pre_state"));
  assert.ok(sidecarTrace.observations.some((observation) => observation.observation_type === "post_state"));
  const anticipation = one(await client.getModelEventById(sidecarResult.refs.anticipation_event_id));
  assert.equal(anticipation.event_type, "anticipation");
  assert.equal(anticipation.payload_json.anticipation.predicted_package_manager, "pnpm");
  assert.equal(sidecarResult.refs.drift_event_id, null);
  evidence.checks.world_state_and_anticipation_are_separate = true;

  const nativeOptionId = "native_read_only_p46";
  const nativeModelId = "model_native_read_only_p46";
  await registerOption({
    option_id: nativeOptionId, claim: "P4-6 native proof", layer: "option", option_type: "atomic", template_id: null,
    i_preconditions: {}, pi_type: "skill", pi_ref: "native-read-only-p46@v1", pi_fallback: "none",
    beta_success: {}, beta_output_schema: { type: "object" }, rule_ref: null, j_premise_ids: [],
    eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior", lin_source: "p46-acceptance",
    lin_version: "1.0", lin_theta: null, verify: "native-adapter-v1", status: "probation",
    subtask_binding: MEMORY_WRITE_SUBTASK_ID, model_binding: nativeModelId,
    input_schema: { type: "object", additionalProperties: true },
  });
  await registerModel({
    model_id: nativeModelId, option_id: nativeOptionId, claim: "uncalibrated", layer: "model",
    achievable_probability: 0, calibration_history: [], prediction_error: 0, cost_model: { observed: false },
    theta_version: "1.0", estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5,
    eps_source: "inferred-prior", status: "probation", j_records: [], lin_source: "p46-acceptance",
    lin_version: "1.0", lin_theta: null, lin_actor: "acceptance-script", verify: "native-adapter-v1",
    reasoning_spec: null, evidence_spec: { required: ["real"] }, evaluation_spec: null,
  });
  const nativeCalls = [];
  const controllers = new Map();
  registerNativeSkillOption("skill", "native-read-only-p46@v1", async (args) => {
    nativeCalls.push(args.key);
    if (args.mode === "failure") throw new Error("native failure");
    if (args.mode === "cancel") controllers.get(args.key)?.abort();
    return {
      output: { value: "native-result" }, evaluation: { scalar_reward: null },
      model_events: args.mode === "success" ? [{ event_type: "anticipation", payload_json: { predicted: "native-result" } }] : undefined,
    };
  });
  const nativeSubtask = await beginSubtaskExecution({
    subtask_event_id: "subtask_event_p46_native", subtask_id: MEMORY_WRITE_SUBTASK_ID, baseline_id: "p46-native",
    mandate_json: { scope: { option_ids: [nativeOptionId], allowed_effects: ["execute"] }, policy_version: "p46-v1", source_actor: "p46-user", strength: "explicit", mode: "enforce", budget: { max_steps: 8 } },
  });
  assert.equal(nativeSubtask.gate, "pass");
  const nativePlan = await startContinuousHost({
    subtask_event_id: nativeSubtask.id, attempt: 1, host_type: "opencode", host_session_ref: "p46-native",
    idempotency_key: "p46-native-plan", mapping_version: "p46-native-v1",
  });
  assert.equal(nativePlan.gate, "pass");
  const nativePlanRunId = nativePlan.planRunId;
  async function nativeExecute(mode, key) {
    const controller = new AbortController();
    controllers.set(key, controller);
    return submitPlannerDecision({
      plan_run_id: nativePlanRunId, planner_id: MEMORY_WRITE_PLANNER_ID, idempotency_key: key,
      state_snapshot_ref: key, state_hash: key, signal: controller.signal, host_context: { agent: "p46-native-parent" },
      decision: { decision: "execute", option_id: nativeOptionId, arguments: { mode, key }, rationale: "P4-6 native proof", evidence_refs: [key], uncertainties: [] },
    });
  }
  const nativeSuccess = await nativeExecute("success", "p46-native-success");
  assert.equal(nativeSuccess.execution.status, "success", JSON.stringify(nativeSuccess));
  const nativeFailure = await nativeExecute("failure", "p46-native-failure");
  assert.equal(nativeFailure.execution.status, "failure");
  const nativeCancel = await nativeExecute("cancel", "p46-native-cancel");
  assert.equal(nativeCancel.execution.status, "blocked");
  await restartServer();
  const nativeDuplicate = await nativeExecute("success", "p46-native-success");
  assert.equal(nativeDuplicate.reused, true);
  assert.equal(nativeCalls.filter((key) => key === "p46-native-success").length, 1);
  const nativeTrace = await getExecutionTrace(optionEventIdFor("p46-native-success"));
  assert.equal(nativeTrace.optionEvent.execution_json.mode, "real");
  const nativeAnticipation = await client.execute("?[model_event_id, event_type] := *model_event{model_event_id, model_id, event_type}, model_id == $id", { id: nativeModelId });
  assert.equal(nativeAnticipation.rows.length, 1);
  evidence.checks.native_adapter_success_failure_cancel_and_restart = true;

  await restartServer();
  assert.equal(one(await client.getMemoryDocumentById(revised.id)).status, "active");
  assert.equal(one(await client.getMemoryDocumentById(capture.id)).status, "superseded");
  assert.equal(one(await client.getOptionEventById(captureOptionEventId)).execution_json.mode, "real");
  const sensitive = await write("capture", "p46-sensitive", captureInput("password=do-not-store", "p46-sensitive", namespace), namespace);
  assert.equal(sensitive.gate, "blocked");
  evidence.checks.restart_preserves_native_history_and_sensitive_filter = true;

  Object.assign(evidence, {
    endpoint, capturePlanRunId, captureOptionEventId,
    revisionOptionEventId: optionEventIdFor("p46-revise-v1"),
    captureDocumentId: capture.id, revisionDocumentId: revised.id,
    sidecarOptionEventId: sidecarCall.refs.option_event_id,
    sidecarAnticipationEventId: sidecarResult.refs.anticipation_event_id,
    nativePlanRunId, nativeOptionEventId: optionEventIdFor("p46-native-success"),
    nativeFailureOptionEventId: optionEventIdFor("p46-native-failure"),
    nativeCancelOptionEventId: optionEventIdFor("p46-native-cancel"),
    nativeCallCount: nativeCalls.length,
    database: "isolated temporary RocksDB; two actual adapter restarts completed",
  });
  writeFileSync(resolve(".data/phase4-memory-stomp-acceptance-result.json"), JSON.stringify(evidence, null, 2));
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
