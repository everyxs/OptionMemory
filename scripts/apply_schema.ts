const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const args = process.argv.slice(2);
const endpointIndex = args.indexOf("--endpoint");
const endpoint = endpointIndex >= 0 ? args[endpointIndex + 1] : process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/apply_schema.ts [--endpoint http://127.0.0.1:9070/text-query]");
  process.exit(0);
}

(async () => {
  const files = readdirSync("schema").filter((file) => file.endsWith(".cozo")).sort();
  for (const file of files) {
    const text = readFileSync(join("schema", file), "utf8");
    for (const block of text.split(/\r?\n\s*\r?\n/)) {
      const hasStatement = block.split(/\r?\n/).some((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
      if (!hasStatement) continue;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ script: block }),
      });
      const data = await response.json().catch(() => null);
      if (data?.message?.includes("conflicts with an existing one") || data?.message?.includes("already exists")) continue;
      if (!response.ok || data?.ok === false) throw new Error(`${file}: ${data?.message ?? `HTTP ${response.status}`}`);
    }
  }
  console.log(`SCHEMA_PASS ${endpoint}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
