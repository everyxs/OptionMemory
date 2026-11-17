const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdtemp, readdir, readFile, rm } = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { setMemoryClient } = require("../dist/api/memory.js");
const { registerSubtask } = require("../dist/api/registry.js");
const { captureDailyMemory } = require("../dist/api/document-projections.js");
const { memoryRecall } = require("../dist/api/memory-recall.js");
const { getRuntimeQueueStatus } = require("../dist/runtime/scheduler.js");
const {
  SuperAgentIsolationProbe,
  superAgentPlanRunId,
  superAgentSubtaskEventId,
} = require("../dist/api/superagent-probe.js");

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const ticket = {
  ticket_id: "ticket-p44-s01",
  subtask_id: "superagent_acceptance_subtask",
  baseline_id: "baseline-p44-s01",
  host_session_ref: "session-p44-s01",
  mandate: {
    scope: {},
    policy_version: "p44-policy-v1",
    source_actor: "p44-acceptance-user",
    strength: "explicit",
    mode: "enforce",
    budget: { max_steps: 8 },
  },
};
const firstAssignment = { assignment_id: "assignment-p44-1", attempt: 1 };
const secondAssignment = { assignment_id: "assignment-p44-2", attempt: 2 };
let server;
let client;
let endpoint;
let directory;
let serverOutput = "";
let probe;
const callbacks = { assignmentStarted: [], report: [], attention: [] };

function rows(result) {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])));
}

function newProbe() {
  probe = new SuperAgentIsolationProbe({
    assignmentStarted: (event) => {
      const record = { ...event, ack: `ack-assignment-${event.assignment_id}` };
      callbacks.assignmentStarted.push(record);
      return { accepted: true, ack: record.ack };
    },
    report: (event) => {
      const record = { ...event, ack: "ack-report-p44" };
      callbacks.report.push(record);
      return { received: true, ack: record.ack };
    },
    attention: (event) => {
      const record = { ...event, ack: "ack-attention-p44" };
      callbacks.attention.push(record);
      return { attention_id: "ticket-attention-p44", ack: record.ack };
    },
  });
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
  newProbe();
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

(async () => {
  directory = await mkdtemp(resolve(".data/phase4-superagent-rocks-"));
  await startServer();
  const registered = await registerSubtask({
    subtask_id: ticket.subtask_id,
    goal: "P4-4 isolated SuperAgent compatibility acceptance",
    context: {},
    status: "active",
    utility_queries: 0,
    lin_source: "phase4-superagent-acceptance",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "acceptance-script",
  });
  assert.equal(registered.gate, "pass", JSON.stringify(registered));
  const evidence = { gate: "pass", verifiedAt: new Date().toISOString(), checks: {} };
  const planRunId = superAgentPlanRunId(ticket.ticket_id, firstAssignment.assignment_id);

  const started = await probe.start(ticket, firstAssignment);
  const repeatedStart = await probe.start(ticket, firstAssignment);
  assert.equal(started.gate, "pass", JSON.stringify(started));
  assert.equal(started.reused, false);
  assert.equal(repeatedStart.reused, true);
  assert.equal(started.planRunId, planRunId);
  assert.equal(started.subtaskEventId, superAgentSubtaskEventId(ticket.ticket_id));
  assert.equal(callbacks.assignmentStarted.length, 1);
  evidence.checks.deterministic_start_and_assignment_started = true;

  const capture = {
    text: "记住 P4-4 Ticket 使用 pnpm 管理依赖。",
    namespace: "superagent-probe:p44-acceptance",
    source_ref: ticket.ticket_id,
    idempotency_key: "p44-explicit-memory-v1",
  };
  assert.equal((await captureDailyMemory(capture)).reused, false);
  assert.equal((await captureDailyMemory(capture)).reused, true);
  const deliverInput = { input_id: "input-p44-trigger", kind: "trigger", payload: { goal: "S01", version: 1 } };
  const delivered = await probe.deliver(ticket, firstAssignment, deliverInput);
  const repeatedDeliver = await probe.deliver(ticket, firstAssignment, deliverInput);
  assert.equal(delivered.reused, false);
  assert.equal(repeatedDeliver.reused, true);
  assert.equal(repeatedDeliver.inboxEventId, delivered.inboxEventId);
  assert.equal((await getRuntimeQueueStatus()).inbox.filter((event) => event.event_id === delivered.inboxEventId).length, 1);
  evidence.checks.deliver_idempotent_and_inbox_wakeup = true;

  const question = { question_id: "question-p44", question: { text: "Continue S01?", choices: ["yes", "no"] } };
  const attention = await probe.requestAttention(ticket, firstAssignment, question);
  assert.equal(attention.gate, "pass", JSON.stringify(attention));
  assert.equal(callbacks.attention.length, 1);

  await restartServer();
  const statusAfterRestart = await probe.status(ticket, firstAssignment);
  assert.equal(statusAfterRestart.planRun.status, "active");
  assert.equal(statusAfterRestart.planRun.host_ticket_ref, ticket.ticket_id);
  assert.equal(statusAfterRestart.events.filter((event) => event.event_type === "deliver").length, 1);
  assert.equal(statusAfterRestart.events.filter((event) => event.event_type === "attention").length, 1);
  assert.equal((await probe.start(ticket, firstAssignment)).reused, true);
  assert.equal((await probe.deliver(ticket, firstAssignment, deliverInput)).reused, true);
  assert.equal((await probe.requestAttention(ticket, firstAssignment, question)).reused, true);
  assert.equal(callbacks.assignmentStarted.length, 1);
  assert.equal(callbacks.attention.length, 1);
  evidence.checks.host_restart_recovers_without_callback_replay = true;

  const answerInput = { question_id: question.question_id, input_id: "input-p44-answer", answer: { selected: ["yes"] } };
  const answered = await probe.answerAttention(ticket, firstAssignment, answerInput);
  const repeatedAnswer = await probe.answerAttention(ticket, firstAssignment, answerInput);
  assert.equal(answered.reused, false);
  assert.equal(repeatedAnswer.reused, true);
  assert.equal(repeatedAnswer.inboxEventId, answered.inboxEventId);
  assert.equal((await getRuntimeQueueStatus()).inbox.filter((event) => event.event_id === answered.inboxEventId).length, 1);
  assert.equal((await probe.answerAttention(ticket, firstAssignment, { ...answerInput, input_id: "input-p44-other-answer" })).gate, "blocked");
  evidence.checks.ticket_attention_roundtrip_and_single_answer = true;

  const reportInput = { report_id: "report-p44-ready", report: { status: "ready", gate: "pass", artifacts: ["fact:S01"] } };
  const reported = await probe.report(ticket, firstAssignment, reportInput);
  assert.equal(reported.gate, "pass", JSON.stringify(reported));
  assert.equal(callbacks.report.length, 1);
  await restartServer();
  assert.equal((await probe.status(ticket, firstAssignment)).planRun.status, "completed");
  assert.equal((await probe.report(ticket, firstAssignment, reportInput)).reused, true);
  assert.equal(callbacks.report.length, 1);
  evidence.checks.report_callback_and_restart_recovery = true;

  const stoppedPlanRunId = superAgentPlanRunId(ticket.ticket_id, secondAssignment.assignment_id);
  const secondStarted = await probe.start(ticket, secondAssignment);
  assert.equal(secondStarted.gate, "pass", JSON.stringify(secondStarted));
  assert.equal(secondStarted.planRunId, stoppedPlanRunId);
  assert.equal(secondStarted.subtaskEventId, started.subtaskEventId);
  const stopped = await probe.stop(ticket, secondAssignment, { stop_id: "stop-p44-operator", reason: "operator stop" });
  assert.equal(stopped.reused, false);
  assert.equal((await probe.stop(ticket, secondAssignment, { stop_id: "stop-p44-operator", reason: "operator stop" })).reused, true);
  assert.equal((await probe.status(ticket, secondAssignment)).planRun.status, "stopped");
  assert.equal((await probe.deliver(ticket, secondAssignment, { input_id: "input-after-stop", kind: "human_input", payload: {} })).gate, "blocked");
  evidence.checks.stop_is_terminal_for_later_deliver = true;

  const documents = rows(await client.listMemoryDocuments()).filter((document) => document.namespace === capture.namespace);
  assert.equal(documents.length, 1);
  const recalled = await memoryRecall({ query: "pnpm", namespace: capture.namespace, session_id: "p44-restarted", message_id: "p44-memory-check" });
  assert.ok(recalled.items.some((item) => item.text.includes("pnpm")));
  assert.equal((await probe.status(ticket, firstAssignment)).events.filter((event) => event.event_type === "deliver").length, 1);
  evidence.checks.explicit_memory_has_no_implicit_duplicate = true;

  Object.assign(evidence, {
    endpoint,
    mappingVersion: "superagent-probe-v0.1",
    ticketId: ticket.ticket_id,
    planRunId,
    stoppedPlanRunId,
    subtaskEventId: started.subtaskEventId,
    assignmentStartedEventId: started.id,
    deliverEventId: delivered.id,
    deliverInboxId: delivered.inboxEventId,
    attentionEventId: attention.id,
    answerEventId: answered.id,
    answerInboxId: answered.inboxEventId,
    reportEventId: reported.id,
    stopEventId: stopped.id,
    memoryDocumentId: documents[0].document_id,
    memoryRecallId: recalled.recall_id,
    callbackCounts: Object.fromEntries(Object.entries(callbacks).map(([name, events]) => [name, events.length])),
    ticketCallbacks: callbacks,
    productionSuperAgentDependency: false,
    database: "isolated temporary RocksDB; two actual adapter restarts completed",
  });
  writeFileSync(resolve(".data/phase4-superagent-acceptance-result.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
})().catch((error) => {
  console.error(error);
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  if (directory) await rm(directory, { recursive: true, force: true });
});
