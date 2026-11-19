const assert = require("node:assert/strict");
const { spawn, execFile } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { promisify } = require("node:util");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { setMemoryClient } = require("../dist/api/memory.js");
const { registerModel, registerOption, registerRule, registerSubtask } = require("../dist/api/registry.js");
const { registerPlanner } = require("../dist/api/planner-registry.js");
const { beginPlanRun, beginSubtaskExecution, getExecutionTrace, getOptionEvidence } = require("../dist/api/telemetry.js");
const { submitPlannerDecision } = require("../dist/runtime/planner.js");
const { dispatchRuntimeOutbox } = require("../dist/runtime/scheduler.js");
const { DEFAULT_CSV } = require("./hea_lens_lib.ts");

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const optionId = "parse_csv_materials";
const modelId = "model_parse_csv_materials_phase4";
const planRunId = "plan_run_phase4_csv_acceptance";
const plannerId = "phase4_csv_acceptance_planner";
const subtaskId = "phase4_csv_acceptance_s01";
const csvPath = process.argv[2] ?? DEFAULT_CSV;
const mandate = {
  scope: { option_ids: [optionId], allowed_effects: ["execute"] },
  policy_version: "phase4-csv-acceptance-v1",
  source_actor: "phase4-csv-acceptance",
  strength: "explicit",
  mode: "enforce",
  budget: { max_steps: 20 },
};
let server;
let client;
let endpoint;
let directory;
let serverOutput = "";

function one(result) {
  return result.rows.length ? Object.fromEntries(result.headers.map((header, index) => [header, result.rows[0][index]])) : undefined;
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
  await execFileAsync(process.execPath, ["scripts/apply_schema.ts", "--endpoint", endpoint], { cwd: process.cwd() });
  client = new MnesticClient({ endpoint, timeoutMs: 120_000 });
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
  must(await registerSubtask({
    subtask_id: subtaskId, goal: "Phase 4 CSV parsing and transient settlement", context: {}, status: "active",
    utility_queries: 0, lin_source: "phase4-csv-acceptance", lin_version: "0.2.0", lin_theta: null, lin_actor: "acceptance-script",
  }));
  must(await registerPlanner({
    planner_id: plannerId, claim: "Phase 4 CSV acceptance planner", layer: "planner", j_premise_ids: [],
    instructions_ref: "phase4-csv/v1", instructions_version: "0.2.0", inference_ref: "acceptance-contract",
    context_policy: {}, decision_schema: {}, tool_policy: {}, budget_policy: {}, eps_type: "confidence", eps_value: 0.5,
    eps_source: "uncalibrated", lin_source: "phase4-csv-acceptance", lin_version: "0.2.0", lin_theta: null,
    lin_actor: "acceptance-script", verify: "planner-schema-v0.1", status: "active",
  }));
  for (const ruleId of ["R1", "R2", "R3"]) {
    must(await registerRule({
      rule_id: ruleId,
      horn_body: ruleId === "R2" ? "xrd_peak FCC+BCC" : "composition",
      horn_head: ruleId === "R1" ? "candidate_solid_solution" : ruleId === "R2" ? "phase_structure" : "smix",
      opt_i: {}, opt_pi: {}, opt_beta: {}, layer: "knowledge+option", lin_source: "phase4-csv-acceptance",
      lin_version: "0.2.0", lin_theta: null, lin_actor: "acceptance-script", status: "in",
    }));
  }
  must(await registerOption({
    option_id: optionId, claim: "Parse materials CSV and derive active R1–R3 closure", layer: "option", option_type: "atomic", template_id: null,
    i_preconditions: {}, pi_type: "parse", pi_ref: "materials-csv@v1", pi_fallback: "none",
    beta_success: { lineage_complete: true }, beta_output_schema: {}, rule_ref: null, j_premise_ids: [],
    eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior", lin_source: "phase4-csv-acceptance",
    lin_version: "0.2.0", lin_theta: null, verify: "controlled-executor-v1", status: "probation",
    subtask_binding: subtaskId, model_binding: modelId,
    input_schema: {
      type: "object", required: ["csv", "batch_id"],
      properties: { csv: { type: "string", minLength: 1 }, batch_id: { type: "string", minLength: 1 }, source: { type: "string" } },
      additionalProperties: false,
    },
  }));
  must(await registerModel({
    model_id: modelId, option_id: optionId, claim: "uncalibrated", layer: "model", achievable_probability: 0,
    calibration_history: [], prediction_error: 0, cost_model: { observed: false }, theta_version: "0.2.0",
    estimated_initiation_region: "", eps_type: "in-degree", eps_value: 0.5, eps_source: "inferred-prior",
    status: "probation", j_records: [], lin_source: "phase4-csv-acceptance", lin_version: "0.2.0", lin_theta: null,
    lin_actor: "acceptance-script", verify: "controlled-executor-v1", reasoning_spec: null,
    evidence_spec: { required: ["real"] }, evaluation_spec: null,
  }));
  must(await beginSubtaskExecution({
    subtask_event_id: "subtask_event_phase4_csv_acceptance", subtask_id: subtaskId, baseline_id: "phase4_csv_acceptance_baseline",
    mandate_json: mandate,
  }));
  must(await beginPlanRun({
    plan_run_id: planRunId, subtask_event_id: "subtask_event_phase4_csv_acceptance", attempt: 1, host_type: "opencode",
    host_session_ref: "phase4-csv-acceptance", idempotency_key: "phase4-csv-acceptance-start", mapping_version: "phase4-csv-v0.2",
  }));
}

async function executeBatch(idempotencyKey, batchId, csv, source) {
  const decision = must(await submitPlannerDecision({
    plan_run_id: planRunId,
    planner_id: plannerId,
    idempotency_key: idempotencyKey,
    state_snapshot_ref: batchId,
    state_hash: batchId,
    defer_to_outbox: true,
    decision: {
      decision: "execute", option_id: optionId, arguments: { csv, batch_id: batchId, source },
      rationale: "Phase 4 persistent CSV batch acceptance", evidence_refs: [batchId], uncertainties: [],
    },
  }));
  assert.ok(decision.outboxDecisionId);
  const executed = await dispatchRuntimeOutbox({ decision_id: decision.outboxDecisionId, owner: "phase4-csv-worker" });
  assert.equal(executed.status, "success", JSON.stringify(executed));
  const trace = await getExecutionTrace(executed.id);
  assert.equal(trace.outcome.status, "success");
  const output = trace.observations.find((row) => row.observation_type === "output").value_json;
  return { decision, executed, trace, output };
}

async function predicateCounts() {
  const facts = await client.listAllFactRows();
  const counts = { total: facts.length };
  for (const fact of facts) counts[fact.predicate] = (counts[fact.predicate] ?? 0) + 1;
  return counts;
}

(async () => {
  directory = await mkdtemp(resolve(".data/phase4-csv-rocks-"));
  const evidence = { gate: "pass", verifiedAt: new Date().toISOString(), csvPath, checks: {} };
  try {
    await startServer();
    await seed();
    const s01 = await executeBatch(
      "phase4-csv-s01-v1",
      "phase4-csv-s01-batch",
      "entity,composition,process,xrd_peak,hardness,hardness_unit\nS01,Al0.2Co0.2Cr0.2Fe0.2Ni0.2,arc-melted-1600C,FCC(111)|BCC(110),512,HV\n",
      "phase4-s01-csv",
    );
    assert.equal(s01.output.inserted, 5);
    assert.equal(s01.output.closure.inserted, 3);
    assert.equal(s01.output.lineage_complete, true);
    assert.equal(s01.trace.modelEvents.length, 1);
    assert.equal(s01.trace.modelEvents[0].payload_json.option_type, "atomic");
    assert.equal(s01.trace.modelEvents[0].payload_json.template_id, null);
    assert.equal(s01.trace.modelEvents[0].payload_json.success_rate, 1);
    assert.equal(s01.trace.modelEvents[0].payload_json.monetary_cost, null);
    evidence.s01 = {
      plannerEventId: s01.decision.plannerEventId,
      optionEventId: s01.executed.id,
      settlementId: s01.output.settlement_id,
      rawFacts: s01.output.candidate_facts,
      derivedFacts: s01.output.closure.inserted,
    };
    evidence.checks.s01_parse_closure_lineage_settlement = true;

    const hea = await executeBatch("phase4-csv-hea-v1", "phase4-csv-hea-lens-1540", await readFile(csvPath, "utf8"), "HEA-Lens-1540");
    assert.equal(hea.output.input_rows, 1540);
    assert.equal(hea.output.input_entities, 701);
    assert.equal(hea.output.candidate_facts, 3502);
    assert.equal(hea.output.inserted, 3502);
    assert.deepEqual(hea.output.blocked, []);
    assert.equal(hea.output.closure.inserted, 1402);
    assert.equal(hea.output.closure.justificationsInserted, 1402);
    assert.equal(hea.output.lineage_complete, true);
    assert.deepEqual(hea.output.fact_counts, { alloy_name: 701, composition: 701, ref_smix: 701, ref_delta: 701, source_ref: 698 });
    const settlement = hea.trace.modelEvents[0].payload_json;
    assert.equal(settlement.success_rate, 1);
    assert.equal(settlement.fact_acceptance_rate, 1);
    assert.equal(settlement.closure_inserted, 1402);
    assert.equal(settlement.justifications_inserted, 1402);
    assert.equal(settlement.lineage_complete, true);
    assert.equal(settlement.evidence_mode, "real");
    assert.equal(settlement.monetary_cost, null);
    assert.ok(settlement.duration_ms >= 0);
    evidence.hea = {
      plannerEventId: hea.decision.plannerEventId,
      optionEventId: hea.executed.id,
      settlementId: hea.output.settlement_id,
      inputRows: hea.output.input_rows,
      entities: hea.output.input_entities,
      rawFacts: hea.output.candidate_facts,
      derivedFacts: hea.output.closure.inserted,
      durationMs: settlement.duration_ms,
      sourceHash: hea.output.source_hash,
    };
    evidence.checks.hea_full_batch_and_transient_settlement = true;

    await restartServer();
    const counts = await predicateCounts();
    assert.deepEqual(counts, {
      total: 4912,
      alloy_name: 701,
      candidate_solid_solution: 702,
      composition: 702,
      hardness: 1,
      phase_structure: 1,
      process: 1,
      ref_delta: 701,
      ref_smix: 701,
      smix: 702,
      source_ref: 698,
      xrd_peak: 2,
    });
    const justifications = await client.listJustifications();
    assert.equal(justifications.filter((row) => row.active).length, 1405);
    assert.equal((await client.listActiveRules()).length, 3);
    assert.equal((await client.listActiveRules()).some((rule) => rule.rule_id === "R4"), false);
    assert.equal(counts.delta, undefined);
    assert.equal((await getExecutionTrace(hea.executed.id)).modelEvents.length, 1);
    assert.equal((await getOptionEvidence(optionId)).modelEvents.length, 2);
    const replay = await dispatchRuntimeOutbox({ decision_id: hea.decision.outboxDecisionId, owner: "phase4-csv-worker-after-restart" });
    assert.equal(replay.status, "reused");
    assert.deepEqual(await predicateCounts(), counts);
    evidence.countsAfterRestart = counts;
    evidence.activeJustificationsAfterRestart = 1405;
    evidence.replayStatusAfterRestart = replay.status;
    evidence.checks.rocks_restart_retention_and_idempotent_replay = true;
    evidence.checks.r4_remains_blocked_and_ref_delta_preserved = true;

    await writeFile(resolve(".data/phase4-csv-acceptance-result.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(evidence, null, 2));
    console.log("PHASE4_CSV_ACCEPTANCE_PASS");
  } finally {
    await stopServer();
    await rm(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
