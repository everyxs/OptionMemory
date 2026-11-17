import type { Context } from "@deepseek-ai/cordis" with { "resolution-mode": "import" };
import { configureDshMemory } from "./config";
import { createDshMemoryApi, createDshMemoryTools, type DshMemoryApi } from "./tools";
import { applyDshPlanner, type DshPlannerRuntime } from "./planner";

export const inject = ["tools", "subagents", "userQuestions"];

export type DshContext = Pick<Context, "tools" | "provide"> & {
  memory?: DshMemoryApi;
  subagents?: DshPlannerRuntime["subagents"];
  userQuestions?: DshPlannerRuntime["userQuestions"];
};

export async function apply(ctx: DshContext, config: Record<string, unknown> = {}): Promise<void> {
  configureDshMemory(config);
  const tools = await createDshMemoryTools();
  for (const tool of tools) ctx.tools.register(tool);
  ctx.provide("memory", createDshMemoryApi());
  if (config.enablePlanner === true) {
    if (!ctx.subagents || !ctx.userQuestions) throw new Error("DSH Planner requires native subagents and userQuestions");
    await applyDshPlanner(ctx as DshPlannerRuntime, config);
  }
}

export { createDshMemoryTools } from "./tools";
