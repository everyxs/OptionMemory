import { beforeAll, describe, expect, it } from "vitest";
import manifest from "../dsh.plugin.json";
import { detectAndIsolateHardnessConflicts } from "../src/api/governance";
import { OPTIONMEMORY_TOOL_CONTRACTS } from "../src/api/tool-contracts";
import type { OptionMemoryToolName } from "../src/api/tool-executor";
import { apply, type DshContext } from "../src/plugins/dsh/index";
import type { DshToolDefinition } from "../src/plugins/dsh/tools";
import { OptionMemoryPlugin } from "../src/plugins/opencode/index";
import { TEST_ENDPOINT } from "./testServer";

const context = {} as never;
const registered: DshToolDefinition[] = [];
const dshContext: DshContext = {
  tools: {
    register(tool) {
      registered.push(tool);
      return () => {};
    },
  },
  provide(name, value) {
    if (name === "memory") dshContext.memory = value;
    return () => {};
  },
};
let dshTools: Record<string, DshToolDefinition>;
let openCodeTools: Record<string, any>;

async function dsh(name: OptionMemoryToolName, input: unknown): Promise<any> {
  return dshTools[name].execute(input, {} as never);
}

async function openCode(name: OptionMemoryToolName, input: unknown): Promise<any> {
  return JSON.parse(await openCodeTools[name].execute(input, context));
}

function fact(id: string, value = "value") {
  return {
    predicate: "host_cross_test",
    args: [id, value],
    claim: `host_cross_test(${id}, ${value})`,
    layer: "knowledge",
    jPremiseIds: [],
    epsType: "in-degree",
    epsValue: 0.5,
    epsSource: "host-test",
    linSource: "test-suite",
    linVersion: "1.0",
    linActor: "vitest",
    verify: "unit",
    status: "in",
  };
}

function hardness(value: string, source: string) {
  return {
    predicate: "hardness",
    args: ["S05", value],
    claim: `hardness(S05, ${value})`,
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

function measureOption(optionId: string, factId: string, source: string) {
  return {
    option_id: optionId,
    claim: `S05 hardness ${source}`,
    layer: "option",
    option_type: "atomic",
    template_id: null,
    i_preconditions: { requires: ["hardness(S05)"] },
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
    subtask_binding: "measure_S05",
    model_binding: `model_${optionId}`,
  };
}

beforeAll(async () => {
  await apply(dshContext, { endpoint: TEST_ENDPOINT });
  dshTools = Object.fromEntries(registered.map((tool) => [tool.name, tool]));
  openCodeTools = (await OptionMemoryPlugin({} as never, { endpoint: TEST_ENDPOINT })).tool!;
});

describe("DSH/OpenCode shared seven-tool adapter", () => {
  it("两个 host 与 manifest 使用同一 7 工具契约", () => {
    const expected = Object.keys(OPTIONMEMORY_TOOL_CONTRACTS).sort();
    expect(Object.keys(dshTools).sort()).toEqual(expected);
    expect(Object.keys(openCodeTools).sort()).toEqual(expected);
    expect([...manifest.tools].sort()).toEqual(expected);
    expect(Object.keys(dshContext.memory ?? {}).sort()).toEqual(expected);
    for (const name of expected as OptionMemoryToolName[]) {
      expect(dshTools[name].description).toBe(OPTIONMEMORY_TOOL_CONTRACTS[name].description);
      expect(dshTools[name].parameters.type).toBe("object");
      expect(openCodeTools[name].args).toBe(OPTIONMEMORY_TOOL_CONTRACTS[name].args);
    }
    expect(dshTools.memory_get.output.render({}, null)).toEqual([{ type: "text", text: "null" }]);
  });

  it("DSH 写入 OpenCode 读取、OpenCode 写入 DSH 读取，核心 blocked 语义一致", async () => {
    const fromDsh = await dsh("memory_set", fact("DSH01"));
    const readByOpenCode = await openCode("memory_get", { id: fromDsh.id });
    expect(readByOpenCode.args).toEqual(["DSH01", "value"]);

    const fromOpenCode = await openCode("memory_set", fact("OC01"));
    const readByDsh = await dsh("memory_get", { id: fromOpenCode.id });
    expect(readByDsh.args).toEqual(["OC01", "value"]);

    const { linSource: _linSource, ...invalid } = fact("BLOCKED01");
    await expect(dsh("memory_set", invalid)).rejects.toThrow();
    const dshBlocked = await dshContext.memory!.memory_set(invalid);
    const openCodeBlocked = await openCode("memory_set", invalid);
    expect(dshBlocked).toMatchObject({ gate: "blocked" });
    expect(openCodeBlocked.gate).toBe("blocked");
    expect(dshBlocked.reason).toBe(openCodeBlocked.reason);

    const query = `?[id, args] := *facts{id, predicate, args}, predicate == "host_cross_test"`;
    expect(await dsh("memory_query", { datalog: query })).toEqual(await openCode("memory_query", { datalog: query }));
  });

  it("propose_option/settle/revoke/memory_retract 可跨 host 完成同一治理链", async () => {
    const literature = await dsh("memory_set", hardness("450 HV", "literature"));
    const experiment = await openCode("memory_set", hardness("512 HV", "experiment"));
    expect(await dsh("propose_option", measureOption("measure_hardness_literature_s05", literature.id, "literature"))).toMatchObject({ gate: "pass" });
    expect(await openCode("propose_option", measureOption("measure_hardness_experiment_s05", experiment.id, "experiment"))).toMatchObject({ gate: "pass" });
    await detectAndIsolateHardnessConflicts("S05");

    const common = {
      proposer: "host-contract-test",
      arbiter: "reviewer-01",
      executor: "vitest",
      rationale: "cross-host settlement",
    };
    const settled = await openCode("settle", {
      option_id: "measure_hardness_experiment_s05",
      factId: experiment.id,
      opposingFactId: literature.id,
      ...common,
    });
    const revoked = await dsh("revoke", {
      option_id: "measure_hardness_literature_s05",
      factId: literature.id,
      opposingFactId: experiment.id,
      ...common,
    });
    expect(settled).toMatchObject({ gate: "pass", status: "settled", factStatus: "in" });
    expect(revoked).toMatchObject({ gate: "pass", status: "revoked", factStatus: "archived" });

    const retracted = await dsh("memory_retract", { id: experiment.id, actor: "dsh-test" });
    const repeated = await openCode("memory_retract", { id: experiment.id, actor: "opencode-test" });
    expect(retracted).toMatchObject({ gate: "pass", status: "out" });
    expect(repeated).toMatchObject({ gate: "pass", status: "out" });
  });
});
