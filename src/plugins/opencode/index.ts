import type { Plugin } from "@opencode-ai/plugin" with { "resolution-mode": "import" };
import { configureOpenCodeMemory } from "./config";
import { createOpenCodeMemoryTools } from "./tools";
import { setupOpenCodeV2 } from "./v2";

export const OptionMemoryPlugin: Plugin = async (_input, options) => {
  configureOpenCodeMemory(options);
  return {
    tool: createOpenCodeMemoryTools(),
  };
};

export default {
  id: "optionmemory",
  setup: setupOpenCodeV2,
  server: OptionMemoryPlugin,
};
