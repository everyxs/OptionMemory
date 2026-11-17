import { z } from "zod";
import { BRIDGE_TOOL_CONTRACTS } from "../../../api/bridge-contracts";
import { executeMemoryWrite } from "../../../api/memory-write-options";
import { memoryRecall } from "../../../api/memory-recall";
import { configureOpenCodeMemory } from "../config";
import type { OpenCodeV2Context as ToolContext } from "../v2";

interface ContextHookEvent {
  sessionID: string;
  messages: unknown[];
  system: Array<{ type: string; text: string }>;
}

interface MemoryBridgeV2Context extends ToolContext {
  session: {
    hook(name: "context", callback: (event: ContextHookEvent) => Promise<void> | void): Promise<unknown>;
  };
}

export interface MemoryBridgeOptions extends Record<string, unknown> {
  namespace?: string;
  markdownRoot?: string;
  tokenBudget?: number;
  topK?: number;
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

function messageText(message: unknown): { id: string; text: string } | null {
  if (typeof message !== "object" || message === null) return null;
  const row = message as Record<string, unknown>;
  const id = row.id ?? row.messageID ?? (row.info as { id?: string } | undefined)?.id;
  if (typeof id !== "string") return null;
  if (typeof row.text === "string") return { id, text: row.text };
  const content = Array.isArray(row.parts) ? row.parts : Array.isArray(row.content) ? row.content : null;
  if (content) {
    const text = content.flatMap((part) => {
      if (typeof part !== "object" || part === null) return [];
      const value = part as Record<string, unknown>;
      return value.type === "text" && typeof value.text === "string" ? [value.text] : [];
    }).join("\n");
    return { id, text };
  }
  return null;
}

function latestUserText(messages: unknown[]): { id: string; text: string } | null {
  for (const message of [...messages].reverse()) {
    if (typeof message !== "object" || message === null) continue;
    const row = message as Record<string, unknown>;
    const type = row.type ?? row.role ?? (row.info as { role?: string } | undefined)?.role;
    if (type !== "user") continue;
    const parsed = messageText(message);
    if (parsed?.text.trim()) return parsed;
  }
  return null;
}

export async function injectOpenCodeMemory(event: ContextHookEvent, options?: MemoryBridgeOptions): Promise<void> {
  const latest = latestUserText(event.messages);
  if (!latest) return;
  try {
    const result = await memoryRecall({
      query: latest.text,
      namespace: options?.namespace ?? "global",
      session_id: event.sessionID,
      message_id: latest.id,
      token_budget: options?.tokenBudget,
      top_k: options?.topK,
      markdown_root: options?.markdownRoot,
    });
    if (result.reference_text) event.system.push({ type: "text", text: result.reference_text });
  } catch (error) {
    console.error(`[optionmemory-memory-bridge] recall degraded: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function setupOpenCodeMemoryBridgeV2(
  ctx: MemoryBridgeV2Context,
  options?: MemoryBridgeOptions,
): Promise<void> {
  configureOpenCodeMemory(options);
  await ctx.tool.transform((editor) => {
    editor.add({
      name: "bridge_recall",
      description: BRIDGE_TOOL_CONTRACTS.bridge_recall.description,
      input: z.toJSONSchema(z.object(BRIDGE_TOOL_CONTRACTS.bridge_recall.args)) as Record<string, unknown>,
      execute: async (input) => {
        const args = input as Parameters<typeof memoryRecall>[0];
        return { content: json(await memoryRecall({ ...args, markdown_root: options?.markdownRoot })) };
      },
    });
    for (const [name, contract] of Object.entries({
      bridge_capture: BRIDGE_TOOL_CONTRACTS.bridge_capture,
      bridge_revise: BRIDGE_TOOL_CONTRACTS.bridge_revise,
    })) {
      editor.add({
        name,
        description: contract.description,
        input: z.toJSONSchema(z.object(contract.args)) as Record<string, unknown>,
        execute: async (input) => {
          try {
            const args = input as Parameters<typeof executeMemoryWrite>[0]["arguments"] & { session_id?: string; supersedes?: string };
            const result = await executeMemoryWrite({
              operation: name === "bridge_revise" ? "revise" : "capture",
              host_type: "opencode",
              host_session_ref: args.session_id ?? null,
              namespace: args.namespace as string,
              source_ref: args.source_ref as string,
              idempotency_key: args.idempotency_key as string,
              arguments: args,
            });
            return { content: json(result) };
          } catch (error) {
            return { content: json({ id: "", gate: "blocked", reason: error instanceof Error ? error.message : String(error), reused: false }) };
          }
        },
      });
    }
  });
  await ctx.session.hook("context", (event) => injectOpenCodeMemory(event, options));
  console.error("[optionmemory-memory-bridge] V2 setup completed");
}

export function bridgeV2ToolSchemas() {
  return Object.fromEntries(Object.entries(BRIDGE_TOOL_CONTRACTS).map(([name, contract]) => [
    name,
    z.toJSONSchema(z.object(contract.args)),
  ]));
}
