import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { setMemoryClient } from "../src/api/memory";
import { registerModel, registerOption } from "../src/api/registry";
import { MnesticClient } from "../src/memory/mnesticClient";
import { startRocksTestServer, type RocksTestServer } from "./rocksTestUtils";

const exec = promisify(execFile);

describe("Phase 3 additive Planner migration", () => {
  it("备份、迁移、重复执行和回滚均保留旧数据", async () => {
    const directory = await mkdtemp(".data/step7-migration-test-");
    const backup = `${directory}-backup`;
    let server: RocksTestServer | undefined;
    try {
      server = await startRocksTestServer(9077, directory, false);
      const client = new MnesticClient({ endpoint: server.endpoint });
      setMemoryClient(client);
      await registerOption({
        option_id: "step7_migration_option",
        claim: "migration option",
        layer: "option",
        option_type: "atomic",
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
        subtask_binding: "step7_migration_subtask",
        model_binding: "step7_migration_model",
      });
      await registerModel({
        model_id: "step7_migration_model",
        option_id: "step7_migration_option",
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
      });
      await server.stop({ preserve: true });

      server = await startRocksTestServer(9077, directory, false);
      const args = ["scripts/migrate_step7_planner.ts", "--data", directory, "--backup", backup, "--endpoint", server.endpoint, "--yes"];
      const first = await exec(process.execPath, args);
      expect(first.stdout).toContain("STEP7_MIGRATION_PASS");
      const second = await exec(process.execPath, args);
      expect(second.stdout).toContain("STEP7_MIGRATION_PASS");
      expect((await client.getOptionById("step7_migration_option")).rows).toHaveLength(1);
      expect((await client.getModelById("step7_migration_model")).rows).toHaveLength(1);
      const columns = await client.execute("::columns planners");
      expect(columns.rows.length).toBeGreaterThan(0);
      await server.stop({ preserve: true });
      server = undefined;

      const rollback = await exec(process.execPath, ["scripts/migrate_step7_planner.ts", "--data", directory, "--backup", backup, "--rollback", "--yes"]);
      expect(rollback.stdout).toContain("STEP7_ROLLBACK_PASS");

      server = await startRocksTestServer(9077, directory, false);
      expect((await client.getOptionById("step7_migration_option")).rows).toHaveLength(1);
      expect((await client.getModelById("step7_migration_model")).rows).toHaveLength(1);
      const relations = await client.execute("::relations");
      expect(relations.rows.flat()).not.toContain("planners");
    } finally {
      if (server) await server.stop();
      await rm(directory, { recursive: true, force: true });
      await rm(backup, { recursive: true, force: true });
    }
  }, 30_000);
});
