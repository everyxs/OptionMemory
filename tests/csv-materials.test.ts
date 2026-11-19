import { beforeAll, describe, expect, it } from "vitest";
import { memory_get, setMemoryClient } from "../src/api/memory";
import { registerRule } from "../src/api/registry";
import { MnesticClient } from "../src/memory/mnesticClient";
import { executeMaterialsCsv } from "../src/runtime/csv-materials";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });

beforeAll(async () => {
  setMemoryClient(client);
  for (const ruleId of ["R1", "R2", "R3"]) {
    expect((await registerRule({
      rule_id: ruleId,
      horn_body: ruleId === "R2" ? "FCC+BCC" : "composition",
      horn_head: ruleId === "R1" ? "candidate_solid_solution" : ruleId === "R2" ? "phase_structure" : "smix",
      opt_i: {},
      opt_pi: {},
      opt_beta: {},
      layer: "knowledge+option",
      lin_source: "phase4-csv-test",
      lin_version: "1.0",
      lin_theta: null,
      lin_actor: "vitest",
      status: "in",
    })).gate).toBe("pass");
  }
});

describe("Phase 4 CSV ingestion and closure", () => {
  it("writes S01 facts, derives R1–R3, and preserves active J lineage across replay", async () => {
    const input = {
      csv: "entity,composition,process,xrd_peak,hardness,hardness_unit\nP4CSVCOMPLETE,Al0.2Co0.2Cr0.2Fe0.2Ni0.2,arc-melted,FCC(111)|BCC(110),512,HV\n",
      batch_id: "phase4-s01-csv-complete",
      source: "phase4-s01-csv-fixture",
      idempotencyKey: "phase4-s01-csv-complete",
    };
    const result = await executeMaterialsCsv(input);
    expect(result).toMatchObject({
      input_entities: 1,
      candidate_facts: 5,
      inserted: 5,
      skipped: 0,
      blocked: [],
      lineage_complete: true,
      closure: { inserted: 3, skipped: 0, justificationsInserted: 3 },
    });
    const facts = (await client.listActiveClosureFacts()).filter((fact) => fact.args[0] === "P4CSVCOMPLETE");
    expect(facts.map((fact) => fact.predicate).sort()).toEqual([
      "candidate_solid_solution",
      "composition",
      "hardness",
      "phase_structure",
      "process",
      "smix",
      "xrd_peak",
      "xrd_peak",
    ]);
    const composition = facts.find((fact) => fact.predicate === "composition");
    expect(composition?.args).toEqual(["P4CSVCOMPLETE", "Al0.2Co0.2Cr0.2Fe0.2Ni0.2"]);
    expect(await memory_get(composition!.id)).toMatchObject({
      linActor: "parse_csv_materials",
      linVersion: "materials-csv-v1",
    });
    const phase = facts.find((fact) => fact.predicate === "phase_structure");
    const smix = facts.find((fact) => fact.predicate === "smix");
    const justifications = await client.listJustifications();
    expect(justifications.find((row) => row.derived_id === phase?.id && row.active)?.rule_id).toBe("R2");
    expect(justifications.find((row) => row.derived_id === phase?.id && row.active)?.premise_ids).toHaveLength(2);
    expect(justifications.find((row) => row.derived_id === smix?.id && row.active)).toMatchObject({ rule_id: "R3", premise_ids: [composition?.id] });

    const replay = await executeMaterialsCsv(input);
    expect(replay).toMatchObject({ inserted: 0, skipped: 5, blocked: [], closure: { inserted: 0, skipped: 3 } });
    expect((await client.listActiveClosureFacts()).filter((fact) => fact.args[0] === "P4CSVCOMPLETE")).toHaveLength(8);
  });

  it("preserves HEA-Lens source text and ref_delta while keeping R4 derivation disabled", async () => {
    const result = await executeMaterialsCsv({
      csv: [
        "Alloy Name,Al,Co,Fe,Ni,Smix_ideal,lattice_distortion_parameter_delta,References",
        "Demo One,0.0,35.0,20.00,45.0,11.25,0.05,10.1234/example",
        "Empty Row,0,0,0,0,,,",
        "Demo Two,6.99,46.42,34.86,11.73,12.5,0.02,source-two",
      ].join("\n"),
      batch_id: "phase4-hea-mapping",
      idempotencyKey: "phase4-hea-mapping",
    });
    expect(result).toMatchObject({ input_rows: 3, input_entities: 2, candidate_facts: 10, inserted: 10, blocked: [] });
    expect(result.fact_counts).toEqual({ alloy_name: 2, composition: 2, ref_smix: 2, ref_delta: 2, source_ref: 2 });
    const facts = (await client.listActiveClosureFacts()).filter((fact) => ["HEAL0001", "HEAL0002"].includes(fact.args[0]));
    expect(facts.find((fact) => fact.predicate === "composition" && fact.args[0] === "HEAL0001")?.args[1]).toBe("Co35.0Fe20.00Ni45.0");
    expect(facts.find((fact) => fact.predicate === "ref_delta" && fact.args[0] === "HEAL0001")?.args[1]).toBe("0.05");
    expect(facts.find((fact) => fact.predicate === "source_ref" && fact.args[0] === "HEAL0001")?.args[1]).toBe("doi:10.1234/example");
    expect(facts.some((fact) => fact.predicate === "delta")).toBe(false);
    expect((await client.listActiveRules()).some((rule) => rule.rule_id === "R4")).toBe(false);
  });
});
