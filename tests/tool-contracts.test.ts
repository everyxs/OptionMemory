import { describe, expect, it } from "vitest";
import {
  memorySetContract,
  OPTIONMEMORY_TOOL_CONTRACTS,
  toolContractToJsonSchema,
} from "../src/api/tool-contracts";
import { assertReadOnlyQuery } from "../src/api/readOnlyQuery";
import { OptionMemoryPlugin } from "../src/plugins/opencode/index";
import { TEST_ENDPOINT } from "./testServer";

describe("host-neutral tool contracts", () => {
  it("只登记 Phase 3 首版 7 工具，不提前注册未来工具", () => {
    expect(Object.keys(OPTIONMEMORY_TOOL_CONTRACTS).sort()).toEqual([
      "memory_get",
      "memory_query",
      "memory_retract",
      "memory_set",
      "propose_option",
      "revoke",
      "settle",
    ]);
    for (const [name, contract] of Object.entries(OPTIONMEMORY_TOOL_CONTRACTS)) {
      expect(contract.name).toBe(name);
    }
    expect(OPTIONMEMORY_TOOL_CONTRACTS.memory_retract.phase).toBe(2);
    expect(OPTIONMEMORY_TOOL_CONTRACTS.settle.phase).toBe(3);
    expect(OPTIONMEMORY_TOOL_CONTRACTS.revoke.phase).toBe(3);
    expect(OPTIONMEMORY_TOOL_CONTRACTS).not.toHaveProperty("memory_why");
    expect(OPTIONMEMORY_TOOL_CONTRACTS).not.toHaveProperty("query_achievable");
    expect(OPTIONMEMORY_TOOL_CONTRACTS).not.toHaveProperty("certify");
    expect(OPTIONMEMORY_TOOL_CONTRACTS.memory_query.readOnly).toBe(true);
    expect(OPTIONMEMORY_TOOL_CONTRACTS.memory_set.readOnly).toBe(false);
  });

  it("全部契约均可导出为 DSH 可复用的 JSON Schema", () => {
    for (const contract of Object.values(OPTIONMEMORY_TOOL_CONTRACTS)) {
      const schema = toolContractToJsonSchema(contract);
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
    }
    const schema = toolContractToJsonSchema(memorySetContract);
    expect(schema.required).toEqual(expect.arrayContaining([
      "predicate",
      "claim",
      "layer",
      "jPremiseIds",
      "linSource",
      "verify",
    ]));
    expect(schema.required).not.toContain("status");
    expect(schema.required).not.toContain("embedding");
  });

  it("共享只读防护允许查询并拒绝全部受管写操作", () => {
    expect(() => assertReadOnlyQuery(
      `?[id, predicate] := *facts{id, predicate}, predicate == "composition"`,
    )).not.toThrow();
    for (const statement of [
      `?[id] <- [["x"]] :put facts {id}`,
      `?[id] <- [["x"]] :rm facts {id}`,
      `?[id] := *facts{id} :delete facts`,
      `?[id] := *facts{id} :reindex facts`,
    ]) {
      expect(() => assertReadOnlyQuery(statement)).toThrow(/mutating/);
    }
    expect(() => assertReadOnlyQuery("::relations")).toThrow(/read-only/);
  });

  it("OpenCode 直接引用同一契约对象", async () => {
    const hooks = await OptionMemoryPlugin({} as never, { endpoint: TEST_ENDPOINT });
    const tools = hooks.tool!;
    for (const [name, contract] of Object.entries(OPTIONMEMORY_TOOL_CONTRACTS)) {
      expect(tools[name].description).toBe(contract.description);
      expect(tools[name].args).toBe(contract.args);
    }
  });
});
