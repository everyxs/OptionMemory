import type { ToolDefinition } from "@deepseek-ai/dsh-tools" with { "resolution-mode": "import" };
import type { JsonValue } from "@deepseek-ai/dsh-util-values" with { "resolution-mode": "import" };
import { executeOptionMemoryTool, type OptionMemoryToolName } from "../../api/tool-executor";
import { OPTIONMEMORY_TOOL_CONTRACTS } from "../../api/tool-contracts";
import { dshParametersFromContract } from "./schema";

export type DshToolDefinition = ToolDefinition;
export type DshMemoryApi = Record<OptionMemoryToolName, (input: unknown) => Promise<unknown>>;

export function toLosslessJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number is not lossless JSON");
    return value;
  }
  if (Array.isArray(value)) return value.map(toLosslessJsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toLosslessJsonValue(item)]),
    );
  }
  throw new TypeError(`unsupported canonical JSON value: ${typeof value}`);
}

export async function createDshMemoryTools(): Promise<DshToolDefinition[]> {
  const { defineTool } = await import("@deepseek-ai/dsh-tools");
  return (Object.keys(OPTIONMEMORY_TOOL_CONTRACTS) as OptionMemoryToolName[]).map((name) => {
    const contract = OPTIONMEMORY_TOOL_CONTRACTS[name];
    return defineTool({
      name,
      description: contract.description,
      parameters: dshParametersFromContract(contract),
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) ?? "null" }],
      },
      isConcurrencySafe: () => contract.readOnly,
      execute: async (args) => toLosslessJsonValue(await executeOptionMemoryTool(name, args)),
    });
  });
}

export function createDshMemoryApi(): DshMemoryApi {
  return Object.fromEntries(
    (Object.keys(OPTIONMEMORY_TOOL_CONTRACTS) as OptionMemoryToolName[]).map((name) => [
      name,
      (input: unknown) => executeOptionMemoryTool(name, input),
    ]),
  ) as DshMemoryApi;
}
