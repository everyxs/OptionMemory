const assert = require("node:assert/strict");
const { writeFileSync } = require("node:fs");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { setMemoryClient } = require("../dist/api/memory.js");
const { getDocumentProjection, memoryDocumentId } = require("../dist/api/document-projections.js");
const { memoryRecall } = require("../dist/api/memory-recall.js");

const endpoint = process.env.OPTIONMEMORY_ENDPOINT ?? "http://127.0.0.1:9174/text-query";
if (!endpoint.includes("9174")) throw new Error("Bilingual acceptance must use isolated port 9174");
const client = new MnesticClient({ endpoint, timeoutMs: 30_000 });
setMemoryClient(client);
const namespace = "global";
const originalId = memoryDocumentId(namespace, "capture://bilingual-opencode-a/bilingual-opencode-a-v1");
const revisionId = memoryDocumentId(namespace, "capture://bilingual-dsh-c/bilingual-dsh-c-v1");

async function verifyInitial() {
  const result = await memoryRecall({
    query: "package manager",
    namespace,
    session_id: "bilingual-opencode-b",
    message_id: "bilingual-opencode-b-1",
  });
  assert.equal(result.gate, "pass");
  assert.equal(result.strategy_version, "keyword-recall-v2");
  assert.ok(result.items.some((item) => item.text.includes("pnpm") && item.status === "active"));
  const original = await getDocumentProjection(originalId);
  assert.equal(original.document.status, "active");
  assert.ok(original.chunks[0].text.includes("包管理器"));
  const evidence = {
    gate: "pass",
    verifiedAt: new Date().toISOString(),
    endpoint,
    originalDocumentId: originalId,
    recallId: result.recall_id,
    strategyVersion: result.strategy_version,
    returned: "pnpm",
    query: "package manager",
    sourceLanguage: "zh-CN",
    queryLanguage: "en",
  };
  writeFileSync(".data/bilingual-initial-result.json", `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}

async function verifyFinal() {
  const original = await getDocumentProjection(originalId);
  const revision = await getDocumentProjection(revisionId);
  assert.equal(original.document.status, "superseded");
  assert.equal(revision.document.status, "active");
  assert.equal(revision.document.supersedes, originalId);
  assert.ok(revision.chunks[0].text.includes("yarn"));
  const result = await memoryRecall({
    query: "包管理器",
    namespace,
    session_id: "bilingual-dsh-d",
    message_id: "bilingual-dsh-d-1",
  });
  assert.equal(result.gate, "pass");
  assert.equal(result.strategy_version, "keyword-recall-v2");
  assert.ok(result.items.some((item) => item.text.includes("yarn") && item.status === "active"));
  assert.equal(result.items.some((item) => item.text.includes("pnpm") && item.status === "active"), false);
  const evidence = {
    gate: "pass",
    verifiedAt: new Date().toISOString(),
    endpoint,
    originalDocumentId: originalId,
    revisionDocumentId: revisionId,
    recallId: result.recall_id,
    strategyVersion: result.strategy_version,
    returned: "yarn",
    query: "包管理器",
    sourceLanguage: "en",
    queryLanguage: "zh-CN",
    originalStatus: original.document.status,
    revisionStatus: revision.document.status,
    supersedes: revision.document.supersedes,
  };
  writeFileSync(".data/bilingual-acceptance-result.json", `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}

const mode = process.argv[2];
if (mode === "--verify-initial") verifyInitial().catch((error) => { console.error(error); process.exitCode = 1; });
else if (mode === "--verify") verifyFinal().catch((error) => { console.error(error); process.exitCode = 1; });
else throw new Error("Use --verify-initial or --verify");
