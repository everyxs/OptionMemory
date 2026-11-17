import { beforeAll, describe, expect, it } from "vitest";
import { memory_get, memory_set_batch, setMemoryClient } from "../src/api/memory";
import { registerOption } from "../src/api/registry";
import { detectAndIsolateHardnessConflicts } from "../src/api/governance";
import { writeJustifications } from "../src/runtime/justifications";
import { setNuGateMode } from "../src/runtime/nuGate";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
let literatureId = "";
let experimentId = "";
let derivedId = "";
let eventCount = 0;

function hardness(value: string, source: string): FactInput {
  return {
    predicate: "hardness",
    args: ["S01", value],
    claim: `hardness(S01, ${value})`,
    layer: "semantic",
    jPremiseIds: [],
    epsType: "confidence",
    epsValue: 0.8,
    epsSource: source,
    linSource: source,
    linVersion: "1.0",
    linActor: "vitest",
    verify: "measurement",
    status: "in",
  };
}

async function seed() {
  setMemoryClient(client);
  setNuGateMode("enforce");
  const written = await memory_set_batch([
    hardness("450 HV", "literature"),
    hardness("512 HV", "experiment"),
  ]);
  literatureId = written.ids[0]!;
  experimentId = written.ids[1]!;
  for (const [optionId, factId, source] of [
    ["measure_hardness_literature", literatureId, "literature"],
    ["measure_hardness_experiment", experimentId, "experiment"],
  ] as const) {
    await registerOption({
      option_id: optionId,
      claim: `测量 S01 硬度（${source}）`,
      layer: "option",
      option_type: "atomic",
      template_id: null,
      i_preconditions: { requires: ["hardness(S01)"] },
      pi_type: "measure",
      pi_ref: "hardness-test",
      pi_fallback: "none",
      beta_success: { measured: true },
      beta_output_schema: { predicate: "hardness" },
      rule_ref: null,
      j_premise_ids: [factId],
      eps_type: "confidence",
      eps_value: 0.8,
      eps_source: source,
      lin_source: source,
      lin_version: "1.0",
      lin_theta: null,
      verify: "settlement+rollout_success",
      status: "probation",
      subtask_binding: "measure_S01",
      model_binding: `model_${optionId}`,
    });
  }
  const derived = await memory_set_batch([{
    predicate: "hardness_summary",
    args: ["S01", "derived"],
    claim: "hardness_summary(S01, derived)",
    layer: "semantic",
    jPremiseIds: [literatureId, experimentId],
    jRuleId: "R_HARDNESS_SUMMARY",
    epsType: "confidence",
    epsValue: 0.8,
    epsSource: "test",
    linSource: "test",
    linVersion: "1.0",
    linActor: "vitest",
    verify: "test",
    status: "in",
  }]);
  derivedId = derived.ids[0]!;
  await writeJustifications([{ derivedId, premiseIds: [literatureId, experimentId], ruleId: "R_HARDNESS_SUMMARY" }]);
  const results = await detectAndIsolateHardnessConflicts("S01");
  expect(results).toHaveLength(1);
  const repeated = await detectAndIsolateHardnessConflicts("S01");
  expect(repeated[0].reused).toBe(true);
  const events = await client.execute(
    `?[count(id)] := *facts{id, predicate, args}, predicate == "conflict", get(args, 1) == "S01"`,
  );
  eventCount = Number(events.rows[0][0]);
}

beforeAll(seed);

describe("Phase 3 M1 conflict detection and isolation", () => {
  it("450/512 HV 双方 contested、关联 options probation、派生锥暂停且事件幂等", async () => {
    expect((await memory_get(literatureId))?.status).toBe("contested");
    expect((await memory_get(experimentId))?.status).toBe("contested");
    expect((await memory_get(literatureId))?.args[1]).toBe("450 HV");
    expect((await memory_get(experimentId))?.args[1]).toBe("512 HV");
    expect((await memory_get(derivedId))?.status).toBe("contested");
    for (const optionId of ["measure_hardness_literature", "measure_hardness_experiment"]) {
      const option = await client.getOptionById(optionId);
      expect(option.rows[0][option.headers.indexOf("status")]).toBe("probation");
    }
    expect(eventCount).toBe(1);
  });

  it("M1 不误伤相同硬度值或多值 xrd_peak", async () => {
    await memory_set_batch([
      { ...hardness("512 HV", "literature"), args: ["S02", "512 HV"], claim: "hardness(S02, 512 HV)" },
      { ...hardness("512 HV", "experiment"), args: ["S02", "512 HV"], claim: "hardness(S02, 512 HV)" },
      {
        predicate: "xrd_peak",
        args: ["S02", "44.5°", "FCC(111)"],
        claim: "xrd_peak(S02, 44.5°, FCC(111))",
        layer: "semantic",
        jPremiseIds: [],
        epsType: "measurement",
        epsValue: 0.9,
        epsSource: "test",
        linSource: "test",
        linVersion: "1.0",
        linActor: "vitest",
        verify: "seed",
        status: "in",
      },
      {
        predicate: "xrd_peak",
        args: ["S02", "44.7°", "BCC(110)"],
        claim: "xrd_peak(S02, 44.7°, BCC(110))",
        layer: "semantic",
        jPremiseIds: [],
        epsType: "measurement",
        epsValue: 0.9,
        epsSource: "test",
        linSource: "test",
        linVersion: "1.0",
        linActor: "vitest",
        verify: "seed",
        status: "in",
      },
    ]);
    const results = await detectAndIsolateHardnessConflicts("S02");
    expect(results).toHaveLength(0);
    expect(eventCount).toBe(1);
  });
});
