import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memory_get, memory_set_batch, setMemoryClient } from "../src/api/memory";
import { registerOption, registerRule, registerSubtask } from "../src/api/registry";
import { reconcileOptionPrerequisite, registerProceduralKnowledge, retractOptionPrerequisite, restoreOptionPrerequisite } from "../src/api/optionRevision";
import { deriveClosure } from "../src/runtime/deriveClosure";
import { setNuGateMode } from "../src/runtime/nuGate";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import type { RuleRow } from "../src/memory/assets";
import { startRocksTestServer, type RocksTestServer } from "./rocksTestUtils";
import { TEST_ENDPOINT } from "./testServer";

const OPTION_ID = "infer_phase_structure_from_xrd_rocks";
const PROCEDURAL_ID = "pk_infer_phase_S01_rocks";
let server: RocksTestServer;
let client: MnesticClient;

function xrd(angle: string, phase: string): FactInput {
  return {
    predicate: "xrd_peak",
    args: ["S01", angle, phase],
    claim: `xrd_peak(S01, ${angle}, ${phase})`,
    layer: "semantic",
    jPremiseIds: [],
    epsType: "measurement",
    epsValue: 0.9,
    epsSource: "rocks-test",
    linSource: "xrd_parser_v1.2",
    linVersion: "v1.2",
    linActor: "rocks-test",
    verify: "seed",
    status: "in",
  };
}

const r2: RuleRow = {
  rule_id: "R2",
  horn_body: "xrd_peak(X, A, FCC) and xrd_peak(X, B, BCC)",
  horn_head: "phase_structure(X, BCC+FCC)",
  opt_i: {},
  opt_pi: {},
  opt_beta: {},
  layer: "knowledge+option",
  lin_source: "test",
  lin_version: "1.0",
  lin_theta: null,
  lin_actor: "rocks-test",
  status: "in",
};

async function seed(target: MnesticClient) {
  setMemoryClient(target);
  setNuGateMode("enforce");
  await registerRule(r2);
  await registerSubtask({
    subtask_id: "infer_phase_S01",
    goal: "推断 S01 相结构",
    context: {},
    status: "active",
    utility_queries: 0,
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "rocks-test",
  });
  await registerOption({
    option_id: OPTION_ID,
    claim: "从 XRD 峰位推断相结构",
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: { requires: ["xrd_peak(FCC(111))", "xrd_peak(BCC(110))"] },
    pi_type: "api",
    pi_ref: "deriveClosure(R2)",
    pi_fallback: "none",
    beta_success: { derived: "phase_structure(X, BCC+FCC)", with_justification: true },
    beta_output_schema: { predicate: "phase_structure", args: ["X", "phases"] },
    rule_ref: "R2",
    j_premise_ids: [],
    eps_type: "in-degree",
    eps_value: 0.5,
    eps_source: "inferred-prior",
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    verify: "settlement+rollout_success",
    status: "probation",
    subtask_binding: "infer_phase_S01",
    model_binding: "model_infer_phase_xrd_v1",
  });
  await registerProceduralKnowledge({
    id: PROCEDURAL_ID,
    claim: "achievable(S01, infer_phase_structure_from_xrd, 0.9)",
    layer: "procedural",
    s_id: "infer_phase_S01",
    o_id: OPTION_ID,
    m_id: "model_infer_phase_xrd_v1",
    fidelity: null,
    eps_value: 0.9,
    eps_ceiling: 0.95,
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "rocks-test",
    verify: "option-prerequisite",
    status: "in",
  });
  const peaks = await memory_set_batch([xrd("44.5°", "FCC(111)"), xrd("44.7°", "BCC(110)")]);
  await deriveClosure({ entity: "S01" });
  const phase = await target.execute(
    `?[id] := *facts{id, predicate, args}, predicate == "phase_structure", first(args) == "S01"`,
  );
  return { fccId: peaks.ids[0]!, phaseId: String(phase.rows[0][0]) };
}

async function statusOf(target: MnesticClient) {
  const [option, procedural] = await Promise.all([
    target.getOptionById(OPTION_ID),
    target.getProceduralKnowledgeByOptionId(OPTION_ID),
  ]);
  return {
    option: String(option.rows[0][option.headers.indexOf("status")]),
    procedural: String(procedural.rows[0][procedural.headers.indexOf("status")]),
  };
}

async function revisionCount(target: MnesticClient, id: string) {
  const result = await target.execute(
    `?[count(id)] := *facts{id, predicate, args}, predicate == "revision", first(args) == $id`,
    { id },
  );
  return Number(result.rows[0][0]);
}

beforeEach(async () => {
  server = await startRocksTestServer();
  client = new MnesticClient({ endpoint: server.endpoint, timeoutMs: 60_000 });
});

afterEach(async () => {
  await server.stop();
});

describe("RocksDB integration", () => {
  it("重启保留 Option/Procedural/J/revision 状态", async () => {
    const { fccId, phaseId } = await seed(client);
    await retractOptionPrerequisite(OPTION_ID, fccId, { actor: "rocks-test" });
    expect((await statusOf(client)).option).toBe("out");
    expect((await memory_get(phaseId))?.status).toBe("out");

    const directory = server.directory;
    await server.stop({ preserve: true });
    server = await startRocksTestServer(9075, directory);
    client = new MnesticClient({ endpoint: server.endpoint, timeoutMs: 60_000 });
    expect(await statusOf(client)).toEqual({ option: "out", procedural: "out" });
    expect((await memory_get(phaseId))?.status).toBe("out");
    expect(await revisionCount(client, OPTION_ID)).toBe(1);
    expect(await revisionCount(client, PROCEDURAL_ID)).toBe(1);

    await restoreOptionPrerequisite(OPTION_ID, fccId, { actor: "rocks-test" });
    expect(await statusOf(client)).toEqual({ option: "probation", procedural: "in" });
    expect((await memory_get(phaseId))?.status).toBe("in");
    expect(await revisionCount(client, OPTION_ID)).toBe(2);
  });

  it("部分 Option 写入后可按根前提对账且不重复 revision", async () => {
    const { fccId } = await seed(client);
    const optionResult = await client.getOptionById(OPTION_ID);
    const option = Object.fromEntries(optionResult.headers.map((header, index) => [header, optionResult.rows[0][index]]));
    await client.putOption({ ...option, status: "out" });
    expect((await statusOf(client)).procedural).toBe("in");

    const result = await reconcileOptionPrerequisite(OPTION_ID, fccId, { actor: "rocks-recovery" });
    expect(result).toMatchObject({ gate: "pass", status: "out" });
    expect(await statusOf(client)).toEqual({ option: "out", procedural: "out" });
    expect(await revisionCount(client, OPTION_ID)).toBe(1);
    expect(await revisionCount(client, PROCEDURAL_ID)).toBe(1);
    await reconcileOptionPrerequisite(OPTION_ID, fccId, { actor: "rocks-recovery" });
    expect(await revisionCount(client, OPTION_ID)).toBe(1);
    expect(await revisionCount(client, PROCEDURAL_ID)).toBe(1);
  });

  it("Mem 与 RocksDB 的级联结果一致", async () => {
    const mem = new MnesticClient({ endpoint: TEST_ENDPOINT, timeoutMs: 60_000 });
    const memSeed = await seed(mem);
    const rocksSeed = await seed(client);
    setMemoryClient(mem);
    await retractOptionPrerequisite(OPTION_ID, memSeed.fccId, { actor: "parity" });
    setMemoryClient(client);
    await retractOptionPrerequisite(OPTION_ID, rocksSeed.fccId, { actor: "parity" });
    expect(await statusOf(mem)).toEqual(await statusOf(client));
    setMemoryClient(mem);
    const memPhaseAfterRetract = await memory_get(memSeed.phaseId);
    setMemoryClient(client);
    const rocksPhaseAfterRetract = await memory_get(rocksSeed.phaseId);
    expect(memPhaseAfterRetract?.status).toBe(rocksPhaseAfterRetract?.status);
    expect(await revisionCount(mem, OPTION_ID)).toBe(await revisionCount(client, OPTION_ID));

    setMemoryClient(mem);
    await restoreOptionPrerequisite(OPTION_ID, memSeed.fccId, { actor: "parity" });
    setMemoryClient(client);
    await restoreOptionPrerequisite(OPTION_ID, rocksSeed.fccId, { actor: "parity" });
    expect(await statusOf(mem)).toEqual(await statusOf(client));
    setMemoryClient(mem);
    const memPhaseAfterRestore = await memory_get(memSeed.phaseId);
    setMemoryClient(client);
    const rocksPhaseAfterRestore = await memory_get(rocksSeed.phaseId);
    expect(memPhaseAfterRestore?.status).toBe(rocksPhaseAfterRestore?.status);
  });
});
