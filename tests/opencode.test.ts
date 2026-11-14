import { beforeAll, describe, expect, it } from "vitest";
import OptionMemoryDefinition, { OptionMemoryPlugin } from "../src/plugins/opencode/index";
import { setupOpenCodeV2 } from "../src/plugins/opencode/v2";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import { TEST_ENDPOINT } from "./testServer";

const context = {} as never;
let tools: Record<string, any>;
const client = new MnesticClient({ endpoint: TEST_ENDPOINT });

const baseFact: FactInput = {
  predicate: "opencode_test",
  args: ["OC01", "value"],
  claim: "opencode_test(OC01, value)",
  layer: "knowledge",
  jPremiseIds: [],
  epsType: "in-degree",
  epsValue: 0.5,
  epsSource: "unit-test",
  linSource: "test-suite",
  linVersion: "1.0",
  linActor: "vitest",
  verify: "unit",
};

beforeAll(async () => {
  const hooks = await OptionMemoryPlugin({} as never, { endpoint: TEST_ENDPOINT });
  tools = hooks.tool!;
});

describe("OpenCode OptionMemory adapter", () => {
  it("只暴露当前已实现的 4 个工具", () => {
    expect(Object.keys(tools).sort()).toEqual([
      "memory_get",
      "memory_query",
      "memory_set",
      "propose_option",
    ]);
  });

  it("memory_set / memory_get / memory_query 经真实 mnestic 往返", async () => {
    const written = JSON.parse(await tools.memory_set.execute(baseFact, context));
    expect(written.gate).toBe("pass");
    const got = JSON.parse(await tools.memory_get.execute({ id: written.id }, context));
    expect(got.id).toBe(written.id);
    expect(got.args).toEqual(["OC01", "value"]);
    const queried = JSON.parse(await tools.memory_query.execute({
      datalog: `?[id, predicate, args] := *facts{id, predicate, args}, predicate == "opencode_test"`,
    }, context));
    expect(queried).toHaveLength(1);
    expect(queried[0].id).toBe(written.id);
  });

  it("memory_query 拒绝写操作", async () => {
    await expect(tools.memory_query.execute({
      datalog: `?[id] <- [["forbidden"]] :put facts {id}`,
    }, context)).rejects.toThrow(/mutating/);
    await expect(tools.memory_query.execute({
      datalog: `::relations`,
    }, context)).rejects.toThrow(/read-only/);
  });

  it("propose_option 复用注册服务并默认 atomic", async () => {
    const result = JSON.parse(await tools.propose_option.execute({
      option_id: "opencode_option",
      claim: "OpenCode test option",
      layer: "option",
      i_preconditions: {},
      pi_type: "api",
      pi_ref: "deriveClosure(R2)",
      pi_fallback: "none",
      beta_success: {},
      beta_output_schema: {},
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
      subtask_binding: "test_subtask",
      model_binding: "test_model",
    }, context));
    expect(result.gate).toBe("pass");
    const option = await client.execute(
      `?[option_type, template_id] := *options{option_id, option_type, template_id}, option_id == "opencode_option"`,
    );
    expect(option.rows[0]).toEqual(["atomic", null]);
  });

  it("V2 默认定义注册 4 个 JSON Schema 工具并可执行", async () => {
    expect(OptionMemoryDefinition.id).toBe("optionmemory");
    expect(OptionMemoryDefinition.setup).toBe(setupOpenCodeV2);
    expect(OptionMemoryDefinition.server).toBe(OptionMemoryPlugin);
    const registered: any[] = [];
    await setupOpenCodeV2({
      tool: {
        transform: async (callback) => {
          callback({ add: (definition) => registered.push(definition) });
        },
      },
    }, { endpoint: TEST_ENDPOINT });
    expect(registered.map((definition) => definition.name).sort()).toEqual([
      "memory_get",
      "memory_query",
      "memory_set",
      "propose_option",
    ]);
    expect(registered.every((definition) => definition.input.type === "object")).toBe(true);
    const memorySet = registered.find((definition) => definition.name === "memory_set");
    const result = await memorySet.execute(
      { ...baseFact, args: ["OC02", "v2"] },
      { signal: AbortSignal.timeout(1000) },
    );
    expect(JSON.parse(result.content).gate).toBe("pass");
  });
});
