import type { ToolContext, ToolDefinition } from "@opencode-ai/plugin" with { "resolution-mode": "import" };
import { z } from "zod";
import { memory_get, memory_query, memory_set } from "../../api/memory";
import { registerOption } from "../../api/registry";
import { assertReadOnlyQuery } from "../../api/readOnlyQuery";
import {
  memoryGetContract,
  memoryQueryContract,
  memorySetContract,
  proposeOptionContract,
} from "../../api/tool-contracts";

const json = (value: unknown): string => JSON.stringify(value, null, 2);

function defineTool<Args extends z.ZodRawShape>(definition: {
  description: string;
  args: Args;
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
}) {
  return definition;
}

export function createOpenCodeMemoryTools(): Record<string, ToolDefinition> {
  return {
    memory_set: defineTool({
      description: memorySetContract.description,
      args: memorySetContract.args,
      async execute(args) {
        return json(await memory_set(args));
      },
    }),
    memory_get: defineTool({
      description: memoryGetContract.description,
      args: memoryGetContract.args,
      async execute(args) {
        return json(await memory_get(args.id));
      },
    }),
    memory_query: defineTool({
      description: memoryQueryContract.description,
      args: memoryQueryContract.args,
      async execute(args) {
        assertReadOnlyQuery(args.datalog);
        return json(await memory_query(args.datalog));
      },
    }),
    propose_option: defineTool({
      description: proposeOptionContract.description,
      args: proposeOptionContract.args,
      async execute(args) {
        return json(await registerOption(args));
      },
    }),
  };
}
