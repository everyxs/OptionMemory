const { cp } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { MnesticClient } = require("../dist/memory/mnesticClient.js");
const { OPTION_COLUMNS, MODEL_COLUMNS } = require("../dist/memory/assets.js");

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const dataDir = value("--data");
const backupDir = value("--backup");
const endpoint = value("--endpoint") ?? "http://127.0.0.1:9070/text-query";
const rollback = args.includes("--rollback");
const confirmed = args.includes("--yes");
if (!dataDir || !backupDir || !confirmed) {
  throw new Error("Usage: node scripts/migrate_phase4_fields.ts --data <dir> --backup <dir> [--rollback] [--endpoint <url>] --yes");
}
const client = new MnesticClient({ endpoint, timeoutMs: 30_000 });

const OPTION_TYPES = {
  option_id: "String", claim: "String", layer: "String", option_type: "String", template_id: "String?",
  i_preconditions: "Json", pi_type: "String", pi_ref: "String", pi_fallback: "String", beta_success: "Json",
  beta_output_schema: "Json", rule_ref: "String?", j_premise_ids: "[String]", eps_type: "String",
  eps_value: "Float", eps_source: "String", lin_source: "String", lin_version: "String", lin_theta: "String?",
  verify: "String", status: "String", subtask_binding: "String", model_binding: "String", input_schema: "Json?",
  created_at: "Float?", parent_option_id: "String?", parent_version: "String?", origin_event_id: "String?",
};
const OPTION_LINEAGE_COLUMNS = ["created_at", "parent_option_id", "parent_version", "origin_event_id"];
const MODEL_TYPES = {
  model_id: "String", option_id: "String", claim: "String", layer: "String", achievable_probability: "Float",
  calibration_history: "Json", prediction_error: "Float", cost_model: "Json", theta_version: "String",
  estimated_initiation_region: "String", eps_type: "String", eps_value: "Float", eps_source: "String",
  status: "String", j_records: "[String]", lin_source: "String", lin_version: "String", lin_theta: "String?",
  lin_actor: "String", verify: "String", reasoning_spec: "Json?", evidence_spec: "Json?", evaluation_spec: "Json?",
};

function rowsToObjects(result) {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])));
}

async function relationExists(table) {
  const relations = await client.execute("::relations");
  return relations.rows.flat().includes(table);
}

async function hasColumn(table, column) {
  const result = await client.execute(`::columns ${table}`);
  return result.rows.some((row) => row[0] === column);
}

async function createRelation(relation, key, columns, types, indexes) {
  const definitions = columns.slice(1).map((column) => `${column}: ${types[column]}`).join(", ");
  await client.execute(`:create ${relation} {${key}: ${types[key]} => ${definitions}}`);
  for (const [name, column] of indexes) {
    await client.execute(`::index create ${relation}:${name} {${column}}`);
  }
}

async function createNext(table, key, columns, types, indexes) {
  const relations = await client.execute("::relations");
  if (relations.rows.flat().includes(`${table}_next`)) {
    if (await hasColumn(`${table}_next`, columns.at(-1))) return;
    for (const [name] of indexes) await client.execute(`::index drop ${table}_next:${name}`);
    await client.execute(`::remove ${table}_next`);
  }
  await createRelation(`${table}_next`, key, columns, types, indexes);
}

async function readRows(table, columns) {
  return rowsToObjects(await client.execute(`?[${columns.join(", ")}] := *${table}{${columns.join(", ")}}`));
}

async function putRows(table, key, columns, rows) {
  if (rows.length === 0) return;
  const valueColumns = columns.slice(1).join(", ");
  await client.execute(`?[${columns.join(", ")}] <- $rows :put ${table} {${key} => ${valueColumns}}`, {
    rows: rows.map((row) => columns.map((column) => row[column])),
  });
}

async function backupFileSystem() {
  if (!existsSync(backupDir)) {
    await cp(dataDir, backupDir, {
      recursive: true,
      filter: (source) => !source.replace(/\\/g, "/").endsWith("/LOCK"),
    });
  }
}

async function replaceWithNext(table, key, columns, types, indexName, indexColumn) {
  const nextRows = await readRows(`${table}_next`, columns);
  await client.execute(`::index drop ${table}:${indexName}`);
  await client.execute(`::remove ${table}`);
  await createRelation(table, key, columns, types, [[indexName, indexColumn]]);
  await putRows(table, key, columns, nextRows);
}

async function migrateOptions() {
  const hasInputSchema = await hasColumn("options", "input_schema");
  const hasLineage = (await Promise.all(OPTION_LINEAGE_COLUMNS.map((column) => hasColumn("options", column)))).every(Boolean);
  if (hasInputSchema && hasLineage) return;
  const oldColumns = [];
  for (const column of OPTION_COLUMNS) if (await hasColumn("options", column)) oldColumns.push(column);
  const oldRows = await readRows("options", oldColumns);
  const nextRows = [];
  for (const row of oldRows) {
    const schema = !hasInputSchema && await relationExists("option_input_schemas")
      ? rowsToObjects(await client.getOptionInputSchemaById(row.option_id))[0]
      : undefined;
    nextRows.push({
      ...row,
      input_schema: hasInputSchema ? row.input_schema : schema?.input_schema ?? null,
      created_at: row.created_at ?? null,
      parent_option_id: row.parent_option_id ?? null,
      parent_version: row.parent_version ?? null,
      origin_event_id: row.origin_event_id ?? null,
    });
  }
  await createNext("options", "option_id", OPTION_COLUMNS, OPTION_TYPES, [["status_idx", "status"]]);
  await putRows("options_next", "option_id", OPTION_COLUMNS, nextRows);
  const count = await client.execute("?[count(option_id)] := *options_next{option_id}");
  if (Number(count.rows[0][0]) !== oldRows.length) throw new Error("options row count changed during merge");
  await replaceWithNext("options", "option_id", OPTION_COLUMNS, OPTION_TYPES, "status_idx", "status");
}

async function migrateModels() {
  if (await hasColumn("models", "reasoning_spec")) return;
  const oldRows = await readRows("models", MODEL_COLUMNS.filter((column) => !["reasoning_spec", "evidence_spec", "evaluation_spec"].includes(column)));
  const nextRows = [];
  for (const row of oldRows) {
    const specs = await relationExists("model_specs")
      ? rowsToObjects(await client.getModelSpecsById(row.model_id))[0]
      : undefined;
    nextRows.push({
      ...row,
      reasoning_spec: specs?.reasoning_spec ?? null,
      evidence_spec: specs?.evidence_spec ?? null,
      evaluation_spec: specs?.evaluation_spec ?? null,
    });
  }
  await createNext("models", "model_id", MODEL_COLUMNS, MODEL_TYPES, [["option_id_idx", "option_id"]]);
  await putRows("models_next", "model_id", MODEL_COLUMNS, nextRows);
  const count = await client.execute("?[count(model_id)] := *models_next{model_id}");
  if (Number(count.rows[0][0]) !== oldRows.length) throw new Error("models row count changed during merge");
  await replaceWithNext("models", "model_id", MODEL_COLUMNS, MODEL_TYPES, "option_id_idx", "option_id");
}

async function rollbackFields() {
  const optionFields = ["input_schema", ...OPTION_LINEAGE_COLUMNS];
  const hasMergedOptionFields = (await Promise.all(optionFields.map((column) => hasColumn("options", column)))).some(Boolean);
  if (hasMergedOptionFields) {
    await replaceWithNext("options", "option_id", OPTION_COLUMNS.filter((column) => !optionFields.includes(column)), OPTION_TYPES, "status_idx", "status");
  }
  if (await hasColumn("models", "reasoning_spec")) {
    await replaceWithNext("models", "model_id", MODEL_COLUMNS.filter((column) => !["reasoning_spec", "evidence_spec", "evaluation_spec"].includes(column)), MODEL_TYPES, "option_id_idx", "option_id");
  }
  console.log("PHASE4_FIELD_ROLLBACK_PASS");
}

async function main() {
  if (rollback) return rollbackFields();
  await backupFileSystem();
  await migrateOptions();
  await migrateModels();
  const [optionCount, modelCount] = await Promise.all([
    client.execute("?[count(option_id)] := *options{option_id}"),
    client.execute("?[count(model_id)] := *models{model_id}"),
  ]);
  console.log(JSON.stringify({ status: "PHASE4_FIELD_MIGRATION_PASS", optionCount: optionCount.rows[0][0], modelCount: modelCount.rows[0][0] }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
