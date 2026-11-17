import { z } from "zod";
import { settle, revoke } from "./governance";
import { memory_get, memory_query, memory_set } from "./memory";
import { assertReadOnlyQuery } from "./readOnlyQuery";
import { registerOption } from "./registry";
import { memory_retract } from "./revision";
import { OPTIONMEMORY_TOOL_CONTRACTS } from "./tool-contracts";

export type OptionMemoryToolName = keyof typeof OPTIONMEMORY_TOOL_CONTRACTS;

export async function executeOptionMemoryTool(name: OptionMemoryToolName, input: unknown): Promise<unknown> {
  switch (name) {
    case "memory_set":
      return memory_set(input as import("../memory/schema").FactInput);
    case "memory_get": {
      const args = z.object(OPTIONMEMORY_TOOL_CONTRACTS.memory_get.args).parse(input);
      return memory_get(args.id);
    }
    case "memory_query": {
      const args = z.object(OPTIONMEMORY_TOOL_CONTRACTS.memory_query.args).parse(input);
      assertReadOnlyQuery(args.datalog);
      return memory_query(args.datalog);
    }
    case "memory_retract": {
      const args = z.object(OPTIONMEMORY_TOOL_CONTRACTS.memory_retract.args).parse(input);
      return memory_retract(args.id, { actor: args.actor });
    }
    case "propose_option":
      return registerOption(z.object(OPTIONMEMORY_TOOL_CONTRACTS.propose_option.args).parse(input));
    case "settle": {
      const { option_id, ...args } = z.object(OPTIONMEMORY_TOOL_CONTRACTS.settle.args).parse(input);
      return settle(option_id, args);
    }
    case "revoke": {
      const { option_id, ...args } = z.object(OPTIONMEMORY_TOOL_CONTRACTS.revoke.args).parse(input);
      return revoke(option_id, args);
    }
  }
}
