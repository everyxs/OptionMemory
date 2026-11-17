import { beforeAll, describe, expect, it } from "vitest";
import { revoke, settle } from "../src/api/governance";
import { memory_get, memory_set_batch, setMemoryClient } from "../src/api/memory";
import { registerOption } from "../src/api/registry";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import { setNuGateMode } from "../src/runtime/nuGate";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const ids: Record<"literature" | "experiment", string> = { literature: "", experiment: "" };

function hardness(value: string, source: string): FactInput {
  return {
    predicate: "hardness",
    args: ["S06", value],
    claim: `hardness(S06, ${value})`,
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

async function registerMeasureOption(source: "literature" | "experiment") {
  await registerOption({
    option_id: `measure_hardness_${source}_s06`,
    claim: `测量 S06 硬度（${source}）`,
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: { requires: ["hardness(S06)"] },
    pi_type: "measure",
    pi_ref: "hardness-test",
    pi_fallback: "none",
    beta_success: { measured: true },
    beta_output_schema: { predicate: "hardness" },
    rule_ref: null,
    j_premise_ids: [ids[source]],
    eps_type: "confidence",
    eps_value: 0.8,
    eps_source: source,
    lin_source: source,
    lin_version: "1.0",
    lin_theta: null,
    verify: "settlement+rollout_success",
    status: "probation",
    subtask_binding: "measure_S06",
    model_binding: `model_measure_hardness_${source}_s06`,
  });
}

beforeAll(async () => {
  setMemoryClient(client);
  setNuGateMode("enforce");
  const written = await memory_set_batch([
    hardness("450 HV", "literature"),
    hardness("512 HV", "experiment"),
  ]);
  [ids.literature, ids.experiment] = written.ids as [string, string];
  await registerMeasureOption("literature");
  await registerMeasureOption("experiment");
});

describe("Phase 3 settlement without a separate M1 detection call", () => {
  it("settle/revoke 先自动隔离活跃冲突，再完成裁决", async () => {
    const settled = await settle("measure_hardness_experiment_s06", {
      factId: ids.experiment,
      opposingFactId: ids.literature,
      proposer: "host-acceptance",
      arbiter: "reviewer-01",
      executor: "governance-service",
    });
    expect(settled.gate).toBe("pass");
    expect((await memory_get(ids.literature))?.status).toBe("contested");

    const revoked = await revoke("measure_hardness_literature_s06", {
      factId: ids.literature,
      opposingFactId: ids.experiment,
      proposer: "host-acceptance",
      arbiter: "reviewer-01",
      executor: "governance-service",
    });
    expect(revoked.gate).toBe("pass");
    expect((await memory_get(ids.experiment))?.status).toBe("in");
    expect((await memory_get(ids.literature))?.status).toBe("archived");
  });
});
