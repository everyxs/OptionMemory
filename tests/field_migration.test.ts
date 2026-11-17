import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { setMemoryClient } from "../src/api/memory";
import { registerModel, registerOption } from "../src/api/registry";
import { MnesticClient } from "../src/memory/mnesticClient";
import { OPTION_COLUMNS, MODEL_COLUMNS } from "../src/memory/assets";
import { startRocksTestServer, type RocksTestServer } from "./rocksTestUtils";

const exec = promisify(execFile);

function option(id: string) {
  return {
    option_id: id,
    claim: "field migration option",
    layer: "option",
    option_type: "atomic" as const,
    template_id: null,
    i_preconditions: {},
    pi_type: "measure",
    pi_ref: "hardness-test",
    pi_fallback: "none",
    beta_success: {},
    beta_output_schema: {},
    rule_ref: null,
    j_premise_ids: [],
    eps_type: "confidence",
    eps_value: 0.5,
    eps_source: "uncalibrated",
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    verify: "settlement+rollout_success",
    status: "probation",
    subtask_binding: "field_migration_subtask",
    model_binding: "field_migration_model",
  };
}

function model(id: string) {
  return {
    model_id: id,
    option_id: "field_migration_option",
    claim: "uncalibrated",
    layer: "model",
    achievable_probability: 0,
    calibration_history: [],
    prediction_error: 0,
    cost_model: {},
    theta_version: "",
    estimated_initiation_region: "",
    eps_type: "confidence",
    eps_value: 0.5,
    eps_source: "uncalibrated",
    status: "probation",
    j_records: [],
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    verify: "settlement+rollout_success",
  };
}

describe("Phase 4 field merge migration", () => {
  it("合并规范字段、保持绑定与 ID，支持幂等和回滚", async () => {
    const directory = await mkdtemp(".data/field-migration-test-");
    const backup = `${directory}-backup`;
    let server: RocksTestServer | undefined;
    try {
      server = await startRocksTestServer(9078, directory, true, false);
      const client = new MnesticClient({ endpoint: server.endpoint });
      setMemoryClient(client);
      const putLegacy = async (table: string, key: string, columns: readonly string[], row: object) => {
        const valueColumns = columns.slice(1).join(", ");
        await client.execute(`?[${columns.join(", ")}] <- $rows :put ${table} {${key} => ${valueColumns}}`, {
          rows: [columns.map((column) => (row as Record<string, unknown>)[column])],
        });
      };
      await putLegacy("options", "option_id", OPTION_COLUMNS.filter((column) => !["input_schema", "created_at", "parent_option_id", "parent_version", "origin_event_id"].includes(column)), option("field_migration_option"));
      await putLegacy("models", "model_id", MODEL_COLUMNS.filter((column) => !["reasoning_spec", "evidence_spec", "evaluation_spec"].includes(column)), model("field_migration_model"));
      await client.putOptionInputSchema({ option_id: "field_migration_option", input_schema: { type: "object", required: ["sample"] } });
      await client.putModelSpecs({
        model_id: "field_migration_model",
        reasoning_spec: { anticipation: null },
        evidence_spec: { required: ["real"] },
        evaluation_spec: { verdict: null },
      });
      await server.stop({ preserve: true });

      server = await startRocksTestServer(9078, directory, true, false);
      const args = ["scripts/migrate_phase4_fields.ts", "--data", directory, "--backup", backup, "--endpoint", server.endpoint, "--yes"];
      const first = await exec(process.execPath, args);
      expect(first.stdout).toContain("PHASE4_FIELD_MIGRATION_PASS");
      const second = await exec(process.execPath, args);
      expect(second.stdout).toContain("PHASE4_FIELD_MIGRATION_PASS");

      const optionResult = await client.getOptionById("field_migration_option");
      expect(optionResult.rows[0][optionResult.headers.indexOf("input_schema")]).toEqual({ type: "object", required: ["sample"] });
      const modelResult = await client.getModelById("field_migration_model");
      expect(modelResult.rows[0][modelResult.headers.indexOf("reasoning_spec")]).toEqual({ anticipation: null });
      expect(modelResult.rows[0][modelResult.headers.indexOf("evidence_spec")]).toEqual({ required: ["real"] });
      expect(modelResult.rows[0][modelResult.headers.indexOf("evaluation_spec")]).toEqual({ verdict: null });
      expect((await client.execute("::columns options_next")).rows.length).toBeGreaterThan(0);
      expect((await client.execute("::columns models_next")).rows.length).toBeGreaterThan(0);

      await registerOption({ ...option("field_migration_new_option"), input_schema: { type: "object" } });
      expect((await client.getOptionInputSchemaById("field_migration_new_option")).rows).toHaveLength(0);
      expect((await client.getOptionById("field_migration_new_option")).rows).toHaveLength(1);
      await server.stop({ preserve: true });

      server = await startRocksTestServer(9078, directory, true, false);
      const rollback = await exec(process.execPath, ["scripts/migrate_phase4_fields.ts", "--data", directory, "--backup", backup, "--rollback", "--endpoint", server.endpoint, "--yes"]);
      expect(rollback.stdout).toContain("PHASE4_FIELD_ROLLBACK_PASS");
      const oldOptionColumns = await client.execute("::columns options");
      expect(oldOptionColumns.rows.map((row) => row[0])).not.toContain("input_schema");
      const oldModelColumns = await client.execute("::columns models");
      expect(oldModelColumns.rows.map((row) => row[0])).not.toContain("reasoning_spec");
      const oldOption = await client.execute(`?[${OPTION_COLUMNS.filter((column) => !["input_schema", "created_at", "parent_option_id", "parent_version", "origin_event_id"].includes(column)).join(", ")}] := *options{${OPTION_COLUMNS.filter((column) => !["input_schema", "created_at", "parent_option_id", "parent_version", "origin_event_id"].includes(column)).join(", ")}}`);
      expect(oldOption.rows).toHaveLength(1);
      const oldModel = await client.execute(`?[${MODEL_COLUMNS.filter((column) => !["reasoning_spec", "evidence_spec", "evaluation_spec"].includes(column)).join(", ")}] := *models{${MODEL_COLUMNS.filter((column) => !["reasoning_spec", "evidence_spec", "evaluation_spec"].includes(column)).join(", ")}}`);
      expect(oldModel.rows).toHaveLength(1);
    } finally {
      if (server) await server.stop();
      await rm(directory, { recursive: true, force: true });
      await rm(backup, { recursive: true, force: true });
    }
  }, 30_000);
});
