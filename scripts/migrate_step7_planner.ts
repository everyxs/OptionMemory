const { cp, readFile, rm } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const dataDir = value("--data");
const backupDir = value("--backup");
const endpoint = value("--endpoint") ?? "http://127.0.0.1:9070/text-query";
const rollback = args.includes("--rollback");
const confirmed = args.includes("--yes");

if (!dataDir || !backupDir || !confirmed) {
  throw new Error("Usage: node scripts/migrate_step7_planner.ts --data <dir> --backup <dir> [--rollback] [--endpoint <url>] --yes");
}

async function post(script: string): Promise<any> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ script }),
  });
  const data = await res.json();
  if (data?.message?.includes("conflicts with an existing one") || data?.message?.includes("already exists")) return data;
  if (!res.ok || data?.ok === false) throw new Error(data?.message ?? `HTTP ${res.status}`);
  return data;
}

async function count(table: string, key: string): Promise<number> {
  const result = await post(`?[count(${key})] := *${table}{${key}}`);
  return Number(result.rows[0][0]);
}

async function snapshot() {
  return Promise.all([
    count("facts", "id"),
    count("options", "option_id"),
    count("models", "model_id"),
    count("subtasks", "subtask_id"),
    count("justifications", "id"),
    count("rules", "rule_id"),
  ]);
}

async function applyPlannerSchema(): Promise<void> {
  const text = await readFile(resolve("schema/09_planners.cozo"), "utf8");
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const hasStatement = block.split(/\r?\n/).some((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
    if (!hasStatement) continue;
    await post(block);
  }
}

async function main() {
  if (rollback) {
    await rm(dataDir, { recursive: true, force: true });
    await cp(backupDir, dataDir, { recursive: true });
    console.log("STEP7_ROLLBACK_PASS");
    return;
  }

  const before = await snapshot();
  if (!existsSync(backupDir)) {
    await cp(dataDir, backupDir, {
      recursive: true,
      filter: (source) => !source.replace(/\\/g, "/").endsWith("/LOCK"),
    });
  }
  await applyPlannerSchema();
  const after = await snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`legacy row counts changed: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
  const [planners, planRuns, subtaskEvents, optionSchemas, modelSpecs] = await Promise.all([
    count("planners", "planner_id"),
    count("plan_runs", "plan_run_id"),
    count("subtask_event", "subtask_event_id"),
    count("option_input_schemas", "option_id"),
    count("model_specs", "model_id"),
  ]);
  console.log(JSON.stringify({
    status: "STEP7_MIGRATION_PASS",
    legacyCounts: before,
    plannerRelations: { planners, planRuns, subtaskEvents, optionSchemas, modelSpecs },
    backupDir,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
