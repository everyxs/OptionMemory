import { beforeAll, describe, expect, it } from "vitest";
import { detectAndIsolateHardnessConflicts, revoke, settle, type GovernanceActionResult } from "../src/api/governance";
import { memory_get, memory_set_batch, setMemoryClient } from "../src/api/memory";
import { registerOption } from "../src/api/registry";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import { setNuGateMode } from "../src/runtime/nuGate";
import { compareSettlementSources, SETTLEMENT_POLICY_VERSION } from "../src/runtime/settlement";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const ids: Record<"literature" | "experiment" | "unknown", string> = {
  literature: "",
  experiment: "",
  unknown: "",
};
let settled: GovernanceActionResult;
let revoked: GovernanceActionResult;
let wrongWinner: GovernanceActionResult;
let unknownWinner: GovernanceActionResult;

function hardness(value: string, source: string): FactInput {
  return {
    predicate: "hardness",
    args: ["S03", value],
    claim: `hardness(S03, ${value})`,
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

function decision(factId: string, opposingFactId: string) {
  return {
    factId,
    opposingFactId,
    proposer: "materials-agent",
    arbiter: "reviewer-01",
    executor: "governance-service",
    rationale: "S03 hardness conflict resolution",
    policyVersion: SETTLEMENT_POLICY_VERSION,
  };
}

async function registerMeasureOption(source: "literature" | "experiment" | "unknown") {
  await registerOption({
    option_id: `measure_hardness_${source}_s03`,
    claim: `测量 S03 硬度（${source}）`,
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: { requires: ["hardness(S03)"] },
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
    subtask_binding: "measure_S03",
    model_binding: `model_measure_hardness_${source}_s03`,
  });
}

beforeAll(async () => {
  setMemoryClient(client);
  setNuGateMode("enforce");
  const written = await memory_set_batch([
    hardness("450 HV", "literature"),
    hardness("512 HV", "experiment"),
    hardness("500 HV", "unregistered-source"),
  ]);
  [ids.literature, ids.experiment, ids.unknown] = written.ids as [string, string, string];
  for (const source of ["literature", "experiment", "unknown"] as const) {
    await registerMeasureOption(source);
  }
  await detectAndIsolateHardnessConflicts("S03");

  wrongWinner = await settle("measure_hardness_literature_s03", decision(ids.literature, ids.experiment));
  unknownWinner = await settle("measure_hardness_unknown_s03", decision(ids.unknown, ids.experiment));
  settled = await settle("measure_hardness_experiment_s03", decision(ids.experiment, ids.literature));
  revoked = await revoke("measure_hardness_literature_s03", decision(ids.literature, ids.experiment));
});

describe("Phase 3 settlement policy and governance chain", () => {
  it("实验来源优先于模拟和文献，低优先级或未知来源不能自动获胜", () => {
    expect(compareSettlementSources("experiment", "simulation")).toBe("left");
    expect(compareSettlementSources("simulation", "literature")).toBe("left");
    expect(compareSettlementSources("literature", "experiment")).toBe("right");
    expect(compareSettlementSources("literature", "literature")).toBe("manual_review");
    expect(wrongWinner.gate).toBe("blocked");
    expect(unknownWinner.gate).toBe("blocked");
    expect(unknownWinner.reason).toContain("manual_review");
  });

  it("实验 option settled、文献 option revoked，胜方 in、败方 archived 且历史可查询", async () => {
    expect(settled).toMatchObject({ gate: "pass", status: "settled", factStatus: "in" });
    expect(revoked).toMatchObject({ gate: "pass", status: "revoked", factStatus: "archived" });
    const options = await client.listOptions();
    expect(options.find((row) => row.option_id === "measure_hardness_experiment_s03")?.status).toBe("settled");
    expect(options.find((row) => row.option_id === "measure_hardness_literature_s03")?.status).toBe("revoked");
    expect((await memory_get(ids.experiment))?.status).toBe("in");
    expect((await memory_get(ids.literature))?.status).toBe("archived");
    expect((await memory_get(ids.experiment))?.args[1]).toBe("512 HV");
    expect((await memory_get(ids.literature))?.args[1]).toBe("450 HV");
  });

  it("governance/revision 保留提议者、裁决者、执行者、策略版本、双方事实和理由", async () => {
    const governance = await memory_get(settled.eventId!);
    expect(governance?.predicate).toBe("governance");
    expect(governance?.args).toEqual([
      "settle",
      "measure_hardness_experiment_s03",
      ids.experiment,
      ids.literature,
      SETTLEMENT_POLICY_VERSION,
      "materials-agent",
      "reviewer-01",
      "governance-service",
      "S03 hardness conflict resolution",
      governance?.args[9],
    ]);
    expect(governance?.jPremiseIds).toEqual([ids.experiment, ids.literature]);
    const revision = await memory_get(settled.revisionId!);
    expect(revision?.predicate).toBe("revision");
    expect(revision?.args.slice(0, 4)).toEqual([
      "measure_hardness_experiment_s03",
      "settle",
      "governance-service",
      revision?.args[3],
    ]);
    expect(revision?.args[4]).toBe(settled.eventId);
    expect(revision?.jPremiseIds).toEqual([ids.experiment, ids.literature, settled.eventId]);
  });

  it("重复 settle/revoke 返回 reused 且不重复记账", async () => {
    const before = (await client.listAllFactRows()).filter((row) =>
      ["governance", "revision"].includes(String(row.predicate)) &&
      (row.j_premise_ids as string[]).some((id) => [ids.experiment, ids.literature].includes(id))
    ).length;
    const repeatedSettle = await settle("measure_hardness_experiment_s03", decision(ids.experiment, ids.literature));
    const repeatedRevoke = await revoke("measure_hardness_literature_s03", decision(ids.literature, ids.experiment));
    const after = (await client.listAllFactRows()).filter((row) =>
      ["governance", "revision"].includes(String(row.predicate)) &&
      (row.j_premise_ids as string[]).some((id) => [ids.experiment, ids.literature].includes(id))
    ).length;
    expect(repeatedSettle.reused).toBe(true);
    expect(repeatedRevoke.reused).toBe(true);
    expect(after).toBe(before);
  });
});
