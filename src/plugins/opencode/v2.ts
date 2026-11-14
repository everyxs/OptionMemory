import { z } from "zod";
import { memory_get, memory_query, memory_set } from "../../api/memory";
import { registerOption } from "../../api/registry";
import { assertReadOnlyQuery } from "../../api/readOnlyQuery";
import {
  OPTIONMEMORY_TOOL_CONTRACTS,
  toolContractToJsonSchema,
  type ToolContract,
} from "../../api/tool-contracts";
import { configureOpenCodeMemory } from "./config";

interface ToolEditor {
  add(definition: {
    name: string;
    description: string;
    input: Record<string, unknown>;
    execute(
      input: unknown,
      context: { signal: AbortSignal },
    ): Promise<{ content: string }>;
  }): void;
}

export interface OpenCodeV2Context {
  tool: {
    transform(callback: (editor: ToolEditor) => void): Promise<unknown>;
  };
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);

async function executeTool(name: string, input: unknown): Promise<string> {
  switch (name) {
    case "memory_set":
      return json(await memory_set(
        z.object(OPTIONMEMORY_TOOL_CONTRACTS.memory_set.args).parse(input),
      ));
    case "memory_get": {
      const args = z.object(OPTIONMEMORY_TOOL_CONTRACTS.memory_get.args).parse(input);
      return json(await memory_get(args.id));
    }
    case "memory_query": {
      const args = z.object(OPTIONMEMORY_TOOL_CONTRACTS.memory_query.args).parse(input);
      assertReadOnlyQuery(args.datalog);
      return json(await memory_query(args.datalog));
    }
    case "propose_option":
      return json(await registerOption(
        z.object(OPTIONMEMORY_TOOL_CONTRACTS.propose_option.args).parse(input),
      ));
    default:
      throw new Error(`unsupported OptionMemory tool: ${name}`);
  }
}

export async function setupOpenCodeV2(
  ctx: OpenCodeV2Context,
  options?: Record<string, unknown>,
): Promise<void> {
  configureOpenCodeMemory(options);
  await ctx.tool.transform((editor) => {
    for (const contract of Object.values(OPTIONMEMORY_TOOL_CONTRACTS) as ToolContract<z.ZodRawShape>[]) {
      editor.add({
        name: contract.name,
        description: contract.description,
        input: toolContractToJsonSchema(contract),
        execute: async (input) => ({ content: await executeTool(contract.name, input) }),
      });
    }
  });
  console.error("[optionmemory] V2 setup completed");
}
