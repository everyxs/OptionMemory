import type { Plugin } from "@opencode-ai/plugin" with { "resolution-mode": "import" };
import { configureOpenCodeMemory } from "../config";
import { createOpenCodeBridgeTools } from "./tools";
import { setupOpenCodeMemoryBridgeV2, type MemoryBridgeOptions } from "./v2";

export const OpenCodeMemoryBridgePlugin: Plugin = async (_input, options) => {
  configureOpenCodeMemory(options);
  const bridgeOptions = options as MemoryBridgeOptions | undefined;
  return {
    tool: createOpenCodeBridgeTools({
      markdownRoot: bridgeOptions?.markdownRoot,
      defaultNamespace: bridgeOptions?.namespace,
    }),
  };
};

export default {
  id: "optionmemory-memory-bridge",
  setup: setupOpenCodeMemoryBridgeV2,
  server: OpenCodeMemoryBridgePlugin,
};
