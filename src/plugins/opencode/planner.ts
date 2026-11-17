import type { PluginInput, ToolDefinition } from "@opencode-ai/plugin" with { "resolution-mode": "import" };
import { PLANNER_TOOL_CONTRACTS } from "../../api/planner-contracts";
import { getPlannerContext, listPlannerOptions, submitPlannerDecision } from "../../runtime/planner";
import { registerNativeSkillOption } from "../../runtime/native-skill";
import { recordOpenCodePlannerEvent } from "./planner-events";

const json = (value: unknown) => JSON.stringify(value, null, 2);

function reviewerOutput(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value: unknown = JSON.parse(normalized);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Reviewer response must be a JSON object");
  return value as Record<string, unknown>;
}

export function registerOpenCodeReviewer(client: PluginInput["client"], directory: string): void {
  registerNativeSkillOption("subagent", "materials-evidence-reviewer@v1", async (args, context) => {
    const created = await client.session.create({
      body: { title: `S01 evidence review ${context.idempotencyKey}` },
      query: { directory },
    });
    if (created.error || !created.data) throw new Error(`Could not create reviewer session: ${JSON.stringify(created.error)}`);
    const response = await client.session.prompt({
      path: { id: created.data.id },
      query: { directory },
      body: {
        agent: "materials-evidence-reviewer",
        tools: { write: false, edit: false, bash: false, task: false },
        parts: [{
          type: "text",
          text: `Review only the supplied S01 evidence. Return one JSON object with verdict (accepted/review_required/rejected), summary, evidence_refs (string array), uncertainties (string array), and findings (array). Do not invent measurements or settle/revoke anything.\n\n${JSON.stringify(args.evidence ?? args)}`,
        }],
      },
    });
    if (response.error || !response.data) throw new Error(`Reviewer session failed: ${JSON.stringify(response.error)}`);
    const text = response.data.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    const review = reviewerOutput(text);
    return {
      output: {
        ...review,
        reviewer_session_id: created.data.id,
        reviewer_message_id: response.data.info.id,
      },
      evaluation: { verdict: review.verdict ?? "review_required", scalar_reward: null },
    };
  });
}

type OpenCodeV2Result<T> = T | { data?: T; error?: unknown };

interface OpenCodeV2Session {
  create(input: {
    title: string;
    directory: string;
    agent: string;
    model: { id: string; providerID: string };
  }): Promise<OpenCodeV2Result<{ id: string }>>;
  prompt(input: {
    sessionID: string;
    directory: string;
    agent: string;
    tools: Record<string, boolean>;
    text: string;
    parts: Array<{ type: "text"; text: string }>;
  }): Promise<unknown>;
  wait(input: { sessionID: string; messageID: string }): Promise<unknown>;
  context(input: { sessionID: string; messageID: string }): Promise<unknown>;
}

function unwrapOpenCodeV2<T>(result: OpenCodeV2Result<T>, operation: string): T {
  if (typeof result === "object" && result !== null && ("data" in result || "error" in result)) {
    const wrapped = result as { data?: T; error?: unknown };
    if (wrapped.error || !wrapped.data) throw new Error(`${operation}: ${JSON.stringify(wrapped.error ?? result)}`);
    return wrapped.data;
  }
  return result as T;
}

function reviewerResponse(value: unknown): { text: string; messageId: string } {
  if (Array.isArray(value)) {
    for (const item of [...value].reverse()) {
      if (typeof item === "object" && item !== null && ((item as Record<string, unknown>).type === "assistant" || (item as Record<string, unknown>).info)) {
        return reviewerResponse(item);
      }
    }
    throw new Error(`V2 reviewer response has no assistant message: ${JSON.stringify(value)}`);
  }
  if (typeof value !== "object" || value === null) throw new Error(`Invalid V2 reviewer response: ${JSON.stringify(value)}`);
  const response = value as Record<string, unknown>;
  if (Array.isArray(response.messages)) return reviewerResponse(response.messages);
  if (response.message && typeof response.message === "object") return reviewerResponse(response.message);
  if (response.finish === "error" && typeof response.error === "object" && response.error !== null) {
    const message = (response.error as Record<string, unknown>).message;
    throw new Error(`V2 reviewer model failed: ${typeof message === "string" ? message : JSON.stringify(response.error)}`);
  }
  if (response.payload && typeof response.payload === "object" && response.type === "assistant") {
    const text = (response.payload as Record<string, unknown>).text;
    if (typeof text === "string" && typeof response.id === "string") return { text, messageId: response.id };
  }
  if (Array.isArray(response.content) && response.type === "assistant" && typeof response.id === "string") {
    const text = response.content.flatMap((part) => {
      if (typeof part !== "object" || part === null) return [];
      const item = part as Record<string, unknown>;
      return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
    }).join("\n");
    return { text, messageId: response.id };
  }
  if (Array.isArray(response.parts)) {
    const text = response.parts.flatMap((part) => {
      if (typeof part !== "object" || part === null) return [];
      const item = part as Record<string, unknown>;
      return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
    }).join("\n");
    const info = response.info as { id?: unknown } | undefined;
    const messageId = info?.id ?? response.messageID ?? response.id;
    if (typeof messageId === "string") return { text, messageId };
  }
  if (typeof response.text === "string") {
    const messageId = response.messageID ?? response.id;
    if (typeof messageId === "string") return { text: response.text, messageId };
  }
  throw new Error(`V2 reviewer response shape: ${JSON.stringify(value)}`);
}

export function registerOpenCodeV2Reviewer(session: OpenCodeV2Session, directory: string): void {
  registerNativeSkillOption("subagent", "materials-evidence-reviewer@v1", async (args, context) => {
    const created = unwrapOpenCodeV2(
      await session.create({
        title: `S01 evidence review ${context.idempotencyKey}`,
        directory,
        agent: "materials-evidence-reviewer",
        model: {
          id: process.env.OPTIONMEMORY_REVIEWER_MODEL_ID ?? "kimi-for-coding-highspeed",
          providerID: process.env.OPTIONMEMORY_REVIEWER_PROVIDER_ID ?? "kimi-code-plan-cn",
        },
      }),
      "Could not create V2 reviewer session",
    );
    const prompt = `Review only the supplied S01 evidence. Return one JSON object with verdict (accepted/review_required/rejected), summary, evidence_refs (string array), uncertainties (string array), and findings (array). Do not invent measurements or settle/revoke anything.\n\n${JSON.stringify(args.evidence ?? args)}`;
    const sent = unwrapOpenCodeV2(await session.prompt({
      sessionID: created.id,
      directory,
      agent: "materials-evidence-reviewer",
      tools: { write: false, edit: false, bash: false, task: false },
      text: prompt,
      parts: [{ type: "text", text: prompt }],
    }), "V2 reviewer session failed") as { type?: string; id?: string };
    if (sent.type !== "user" || !sent.id) throw new Error(`V2 reviewer prompt was not accepted: ${JSON.stringify(sent)}`);
    unwrapOpenCodeV2(
      await session.wait({ sessionID: created.id, messageID: sent.id }),
      "V2 reviewer wait failed",
    );
    const completed = unwrapOpenCodeV2(
      await session.context({ sessionID: created.id, messageID: sent.id }),
      "V2 reviewer context failed",
    );
    const { text, messageId } = reviewerResponse(completed);
    if (!text.trim()) throw new Error(`V2 reviewer returned empty content: ${JSON.stringify(completed)}`);
    const review = reviewerOutput(text);
    const evidence = args.evidence as { plan_run_id?: unknown } | undefined;
    if (typeof evidence?.plan_run_id === "string") {
      await recordOpenCodePlannerEvent({
        planRunId: evidence.plan_run_id,
        eventType: "subagent.completed",
        externalId: messageId,
        payload: { reviewer_session_id: created.id, reviewer_message_id: messageId, verdict: review.verdict ?? null },
      });
    }
    return {
      output: { ...review, reviewer_session_id: created.id, reviewer_message_id: messageId },
      evaluation: { verdict: review.verdict ?? "review_required", scalar_reward: null },
    };
  });
}

export function createOpenCodePlannerTools(
  associateSession?: (sessionId: string, planRunId: string) => void,
): Record<string, ToolDefinition> {
  const associate = (sessionId: string, planRunId: string) => associateSession?.(sessionId, planRunId);
  return {
    planner_context: {
      description: PLANNER_TOOL_CONTRACTS.planner_context.description,
      args: PLANNER_TOOL_CONTRACTS.planner_context.args,
      execute: async (args, context) => {
        const input = args as { plan_run_id: string };
        associate(context.sessionID, input.plan_run_id);
        return json(await getPlannerContext(input.plan_run_id));
      },
    },
    planner_options: {
      description: PLANNER_TOOL_CONTRACTS.planner_options.description,
      args: PLANNER_TOOL_CONTRACTS.planner_options.args,
      execute: async (args, context) => {
        const input = args as { plan_run_id: string };
        associate(context.sessionID, input.plan_run_id);
        return json(await listPlannerOptions(input.plan_run_id));
      },
    },
    planner_decision: {
      description: PLANNER_TOOL_CONTRACTS.planner_decision.description,
      args: PLANNER_TOOL_CONTRACTS.planner_decision.args,
      execute: async (args, context) => {
        const input = args as unknown as import("../../runtime/planner").SubmitPlannerDecisionInput;
        associate(context.sessionID, input.plan_run_id);
        return json(await submitPlannerDecision({ ...input, signal: context.abort }));
      },
    },
  };
}

export function plannerToolNames(): string[] {
  return Object.keys(PLANNER_TOOL_CONTRACTS);
}
