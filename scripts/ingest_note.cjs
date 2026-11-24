const { executeMemoryWrite } = require("../dist/api/memory-write-options.js");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { setMemoryClient } = require("../dist/memory/client.js");

async function main() {
  const [path, idempotencyKey] = process.argv.slice(2);
  if (!path?.trim() || !idempotencyKey?.trim()) {
    console.error("Usage: node scripts/ingest_note.cjs <path> <idempotency_key>");
    process.exitCode = 1;
    return;
  }

  if (process.env.OPTIONMEMORY_ENDPOINT) {
    setMemoryClient(new MnesticClient({ endpoint: process.env.OPTIONMEMORY_ENDPOINT }));
  }

  const root = process.env.OPTIONMEMORY_MARKDOWN_ROOT || "notes";
  const namespace = process.env.OPTIONMEMORY_NAMESPACE || "project:s01";
  const result = await executeMemoryWrite({
    operation: "parse",
    host_type: "opencode",
    namespace,
    source_ref: path,
    idempotency_key: idempotencyKey,
    arguments: { path, root, namespace },
  });

  const succeeded = result.gate === "pass" || (result.gate === undefined && result.reused === true);
  console.log(JSON.stringify(succeeded ? { ...result, gate: "pass" } : result, null, 2));
  if (!succeeded) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
