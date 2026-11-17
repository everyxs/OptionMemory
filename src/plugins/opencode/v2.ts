import { z } from "zod";
import { executeOptionMemoryTool, type OptionMemoryToolName } from "../../api/tool-executor";
import {
  OPTIONMEMORY_TOOL_CONTRACTS,
  toolContractToJsonSchema,
  type ToolContract,
} from "../../api/tool-contracts";
import { configureOpenCodeMemory } from "./config";
import { PLANNER_TOOL_CONTRACTS } from "../../api/planner-contracts";
import { getPlannerContext, listPlannerOptions, submitPlannerDecision } from "../../runtime/planner";
import { registerOpenCodeReviewer, registerOpenCodeV2Reviewer } from "./planner";
import { recordOpenCodePlannerEvent } from "./planner-events";
import type { PluginInput } from "@opencode-ai/plugin" with { "resolution-mode": "import" };

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
        execute: async (input) => ({
          content: json(await executeOptionMemoryTool(contract.name as OptionMemoryToolName, input)),
        }),
      });
    }
  });
  console.error("[optionmemory] V2 setup completed");
}

export async function setupOpenCodePlannerV2(
  ctx: OpenCodeV2Context & Partial<PluginInput>,
  options?: Record<string, unknown>,
): Promise<void> {
  configureOpenCodeMemory(options);
  if (ctx.client && ctx.directory) registerOpenCodeReviewer(ctx.client, ctx.directory);
  const v2 = ctx as unknown as {
    session?: Parameters<typeof registerOpenCodeV2Reviewer>[0];
    location?: { directory?: string };
  };
  if (!ctx.client && v2.session && v2.location?.directory) registerOpenCodeV2Reviewer(v2.session, v2.location.directory);
  await ctx.tool.transform((editor) => {
    editor.add({
      name: "planner_context",
      description: PLANNER_TOOL_CONTRACTS.planner_context.description,
      input: z.toJSONSchema(z.object(PLANNER_TOOL_CONTRACTS.planner_context.args)) as Record<string, unknown>,
      execute: async (input) => ({ content: json(await getPlannerContext((input as { plan_run_id: string }).plan_run_id)) }),
    });
    editor.add({
      name: "planner_options",
      description: PLANNER_TOOL_CONTRACTS.planner_options.description,
      input: z.toJSONSchema(z.object(PLANNER_TOOL_CONTRACTS.planner_options.args)) as Record<string, unknown>,
      execute: async (input) => ({ content: json(await listPlannerOptions((input as { plan_run_id: string }).plan_run_id)) }),
    });
    editor.add({
      name: "planner_decision",
      description: PLANNER_TOOL_CONTRACTS.planner_decision.description,
      input: z.toJSONSchema(z.object(PLANNER_TOOL_CONTRACTS.planner_decision.args)) as Record<string, unknown>,
      execute: async (input, context) => {
        const decisionInput = input as Parameters<typeof submitPlannerDecision>[0];
        const result = await submitPlannerDecision({ ...decisionInput, signal: context.signal });
        await recordOpenCodePlannerEvent({
          planRunId: decisionInput.plan_run_id,
          eventType: "tool.execute.after",
          externalId: `planner_decision:${decisionInput.idempotency_key}`,
          payload: { tool: "planner_decision", plannerEventId: result.plannerEventId, optionEventId: result.execution?.optionEventId ?? null, gate: result.gate },
        });
        return { content: json(result) };
      },
    });
  });
  console.error("[optionmemory-planner] V2 setup completed");
}
