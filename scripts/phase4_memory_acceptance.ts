const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");

const endpoint = process.env.OPTIONMEMORY_ENDPOINT ?? "http://127.0.0.1:9074/text-query";
if (!endpoint.includes("9074")) throw new Error("Daily memory acceptance must use isolated port 9074");
const client = new MnesticClient({ endpoint, timeoutMs: 30_000 });

function rows(result: any) {
  return result.rows.map((row: unknown[]) => Object.fromEntries(result.headers.map((header: string, index: number) => [header, row[index]])));
}

(async () => {
  const documents = rows(await client.listMemoryDocuments());
  const recallEvents = rows(await client.listMemoryRecallEvents());
  const pnpm = documents.find((row: any) => row.document_id === "document_6b40374fa8eeb204767c60c6f404b758c151d5b2dfbbbf51d2f161b32e46149c");
  const yarn = documents.find((row: any) => row.document_id === "document_053d59912e101f6281ae63a51ff3b40c33e0d43b7c700e0e6229a271534aa2fc");
  if (pnpm?.status !== "superseded") throw new Error("Old pnpm memory is not superseded");
  if (yarn?.status !== "active" || yarn.supersedes !== pnpm.document_id) throw new Error("Current yarn revision chain is invalid");
  const pnpmRecall = recallEvents.find((row: any) => row.response_json?.reference_text?.includes("pnpm") && row.message_id.startsWith("msg_"));
  const yarnRecall = recallEvents.find((row: any) => row.response_json?.reference_text?.includes("yarn") && row.message_id.startsWith("msg_"));
  if (!pnpmRecall || !yarnRecall) throw new Error("Missing persisted automatic Recall evidence");
  const sessionB = readFileSync(".data/phase4-memory-session-b.jsonl", "utf8");
  const sessionD = readFileSync(".data/phase4-memory-session-d.jsonl", "utf8");
  const planner = readFileSync(".data/phase4-memory-planner.jsonl", "utf8");
  if (!sessionB.includes("pnpm") || !sessionB.includes(pnpm.document_id)) throw new Error("Session B did not use the captured pnpm memory");
  if (!sessionD.includes("yarn") || !sessionD.includes(yarn.document_id)) throw new Error("Session D did not use the revised yarn memory");
  if (!planner.includes("bridge_recall") || planner.includes("tools.bridge_capture") || planner.includes("tools.bridge_revise")) {
    throw new Error("Planner read-only recall boundary failed");
  }
  const result = {
    gate: "pass",
    verifiedAt: new Date().toISOString(),
    endpoint,
    originalDocument: pnpm,
    currentDocument: yarn,
    recallEventCount: recallEvents.length,
    pnpmRecallId: pnpmRecall.recall_id,
    yarnRecallId: yarnRecall.recall_id,
    plannerReadOnly: true,
    originalMarkdownModifiedByBridge: false,
  };
  writeFileSync(resolve(".data/phase4-memory-acceptance-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch((error: Error) => {
  console.error(error);
  process.exitCode = 1;
});
