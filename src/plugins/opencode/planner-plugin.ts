import type { Plugin } from "@opencode-ai/plugin" with { "resolution-mode": "import" };
import { configureOpenCodeMemory } from "./config";
import { createOpenCodePlannerTools, registerOpenCodeReviewer } from "./planner";
import { recordOpenCodePlannerEvent } from "./planner-events";
import { setupOpenCodePlannerV2 } from "./v2";

export const OpenCodePlannerPlugin: Plugin = async (input, options) => {
  configureOpenCodeMemory(options);
  registerOpenCodeReviewer(input.client, input.directory);
  const planRunBySession = new Map<string, string>();
  return {
    tool: createOpenCodePlannerTools((sessionId, planRunId) => planRunBySession.set(sessionId, planRunId)),
    event: async ({ event }) => {
      if (!["session.idle", "session.error"].includes(event.type)) return;
      const properties = event.properties as { sessionID?: string };
      const sessionId = properties.sessionID;
      const planRunId = sessionId ? planRunBySession.get(sessionId) : undefined;
      if (!sessionId || !planRunId) return;
      await recordOpenCodePlannerEvent({ planRunId, eventType: event.type, externalId: sessionId, payload: properties });
    },
    "tool.execute.after": async (hook) => {
      const planRunId = planRunBySession.get(hook.sessionID);
      if (!planRunId) return;
      await recordOpenCodePlannerEvent({
        planRunId,
        eventType: "tool.execute.after",
        externalId: hook.callID,
        payload: { tool: hook.tool, args: hook.args },
      });
    },
  };
};

export default {
  id: "optionmemory-planner",
  setup: setupOpenCodePlannerV2,
  server: OpenCodePlannerPlugin,
};
