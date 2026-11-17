import type { ToolContext, ToolDefinition } from "@opencode-ai/plugin" with { "resolution-mode": "import" };
import { z } from "zod";
import { BRIDGE_TOOL_CONTRACTS } from "../../../api/bridge-contracts";
import type { CaptureMemoryInput } from "../../../api/document-projections";
import { executeMemoryWrite } from "../../../api/memory-write-options";
import { memoryRecall } from "../../../api/memory-recall";

const json = (value: unknown) => JSON.stringify(value, null, 2);

function defineTool<Args extends z.ZodRawShape>(definition: {
  description: string;
  args: Args;
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
}) {
  return definition;
}

async function capture(input: CaptureMemoryInput, operation: "capture" | "revise" = "capture") {
  try {
    return await executeMemoryWrite({
      operation,
      host_type: "opencode",
      host_session_ref: input.session_id ?? null,
      namespace: input.namespace,
      source_ref: input.source_ref,
      idempotency_key: input.idempotency_key,
      arguments: { ...input },
    });
  } catch (error) {
    return { id: "", gate: "blocked", reason: error instanceof Error ? error.message : String(error), reused: false };
  }
}

export function createOpenCodeBridgeTools(options?: { markdownRoot?: string; defaultNamespace?: string }): Record<string, ToolDefinition> {
  return {
    bridge_recall: defineTool({
      description: BRIDGE_TOOL_CONTRACTS.bridge_recall.description,
      args: BRIDGE_TOOL_CONTRACTS.bridge_recall.args,
      execute: async (args, context) => json(await memoryRecall({
        ...args,
        namespace: args.namespace || options?.defaultNamespace || "global",
        session_id: context.sessionID,
        message_id: context.messageID,
        markdown_root: options?.markdownRoot,
      })),
    }),
    bridge_capture: defineTool({
      description: BRIDGE_TOOL_CONTRACTS.bridge_capture.description,
      args: BRIDGE_TOOL_CONTRACTS.bridge_capture.args,
      execute: async (args, context) => json(await capture({
        ...args,
        namespace: args.namespace || options?.defaultNamespace || "global",
        session_id: context.sessionID,
        message_id: context.messageID,
      })),
    }),
    bridge_revise: defineTool({
      description: BRIDGE_TOOL_CONTRACTS.bridge_revise.description,
      args: BRIDGE_TOOL_CONTRACTS.bridge_revise.args,
      execute: async (args, context) => {
        try {
          return json(await capture({
            ...args,
            namespace: args.namespace || options?.defaultNamespace || "global",
            session_id: context.sessionID,
            message_id: context.messageID,
          }, "revise"));
        } catch (error) {
          return json({ id: "", gate: "blocked", reason: error instanceof Error ? error.message : String(error), reused: false });
        }
      },
    }),
  };
}
