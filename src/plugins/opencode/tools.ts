import type { ToolContext, ToolDefinition } from "@opencode-ai/plugin" with { "resolution-mode": "import" };
import { z } from "zod";
import { executeOptionMemoryTool, type OptionMemoryToolName } from "../../api/tool-executor";
import { OPTIONMEMORY_TOOL_CONTRACTS, type ToolContract } from "../../api/tool-contracts";

const json = (value: unknown): string => JSON.stringify(value, null, 2);

function defineTool<Args extends z.ZodRawShape>(definition: {
  description: string;
  args: Args;
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
}) {
  return definition;
}

export function createOpenCodeMemoryTools(): Record<string, ToolDefinition> {
  const tools: Record<string, ToolDefinition> = {};
  const contracts = Object.values(OPTIONMEMORY_TOOL_CONTRACTS) as Array<
    ToolContract<z.ZodRawShape> & { name: OptionMemoryToolName }
  >;
  for (const contract of contracts) {
    tools[contract.name] = defineTool({
      description: contract.description,
      args: contract.args,
      async execute(args) {
        return json(await executeOptionMemoryTool(contract.name, args));
      },
    });
  }
  return tools;
}
