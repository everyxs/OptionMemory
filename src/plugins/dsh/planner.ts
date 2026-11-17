import type { ToolDefinition } from "@deepseek-ai/dsh-tools" with { "resolution-mode": "import" };
import { getPlannerContext, listPlannerOptions, plannerEventIdFor, submitPlannerDecision } from "../../runtime/planner";
import { registerNativeSkillOption } from "../../runtime/native-skill";
import { memoryRecall } from "../../api/memory-recall";
import { executeMemoryWrite } from "../../api/memory-write-options";
import { getMemoryClient } from "../../memory/client";
import { PLANNER_TOOL_CONTRACTS } from "../../api/planner-contracts";
import { BRIDGE_TOOL_CONTRACTS } from "../../api/bridge-contracts";
import { dshParametersFromZodShape } from "./schema";
import { toLosslessJsonValue, type DshToolDefinition } from "./tools";
import { askDshUserQuestion, type DshRootAgent, type DshUserQuestionsAdapter } from "./attention";

export interface DshToolRunContext {
  agent?: DshRootAgent;
  signal: AbortSignal;
}

export interface DshSubagentActivation {
  childId: unknown;
  messageId?: unknown;
  result: Promise<{
    stopReason: string;
    output: unknown[];
    structured?: unknown;
    diagnostic?: string;
  }>;
  dispose(): Promise<void>;
}

export interface DshSubagentRuntime {
  startActivation(spec: {
    provider: string;
    label: string;
    request: {
      prompt: Array<{ type: "text"; text: string }>;
      parent: DshRootAgent;
      signal: AbortSignal;
    };
    delivery: "caller";
    signal: AbortSignal;
  }): Promise<DshSubagentActivation>;
}

export interface DshPlannerRuntime {
  tools: { register(tool: ToolDefinition): unknown };
  subagents: DshSubagentRuntime;
  userQuestions: DshUserQuestionsAdapter;
}

export interface DshPlannerOptions extends Record<string, unknown> {
  subagentProvider?: string;
  requireExecutionApproval?: boolean;
  markdownRoot?: string;
  namespace?: string;
}

function reviewerOutput(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value: unknown = JSON.parse(normalized);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Reviewer response must be a JSON object");
  return value as Record<string, unknown>;
}

function textFromBlocks(blocks: unknown[]): string {
  return blocks.flatMap((block) => {
    if (typeof block !== "object" || block === null) return [];
    const row = block as Record<string, unknown>;
    return row.type === "text" && typeof row.text === "string" ? [row.text] : [];
  }).join("\n");
}

export function registerDshReviewer(runtime: DshSubagentRuntime, provider = "spawn"): void {
  registerNativeSkillOption("subagent", "materials-evidence-reviewer@v1", async (args, context) => {
    if (!context.option || !context.signal) throw new Error("DSH reviewer requires a live parent Agent and cancellation signal");
    const parent = context.host_context as DshRootAgent | undefined;
    if (!parent) throw new Error("DSH reviewer requires the actual calling Agent");
    const activation = await runtime.startActivation({
      provider,
      label: `S01 evidence review ${context.idempotencyKey}`,
      request: {
        prompt: [{
          type: "text",
          text: `Review only the supplied S01 evidence. Return one JSON object with verdict (accepted/review_required/rejected), summary, evidence_refs (string array), uncertainties (string array), and findings (array). Do not invent measurements or settle/revoke anything.\n\n${JSON.stringify(args.evidence ?? args)}`,
        }],
        parent,
        signal: context.signal,
      },
      delivery: "caller",
      signal: context.signal,
    });
    try {
      const result = await activation.result;
      if (result.stopReason !== "completed") throw new Error(`DSH reviewer failed: ${result.diagnostic ?? result.stopReason}`);
      const review = result.structured ?? reviewerOutput(textFromBlocks(result.output));
      if (typeof review !== "object" || review === null || Array.isArray(review)) throw new Error("DSH reviewer returned no structured review");
      return {
        output: {
          ...review,
          reviewer_session_id: String(activation.childId),
          reviewer_message_id: String(activation.messageId ?? activation.childId),
        },
        evaluation: { verdict: (review as Record<string, unknown>).verdict ?? "review_required", scalar_reward: null },
      };
    } finally {
      await activation.dispose();
    }
  });
}

async function executeDshPlannerTool(
  runtime: DshPlannerRuntime,
  name: string,
  args: any,
  exec: DshToolRunContext,
  options?: DshPlannerOptions,
): Promise<unknown> {
  if (name === "planner_context") return getPlannerContext(args.plan_run_id);
  if (name === "planner_options") return listPlannerOptions(args.plan_run_id);
  if (name === "bridge_recall") {
    return memoryRecall({ ...args, namespace: args.namespace ?? options?.namespace ?? "global", markdown_root: options?.markdownRoot, host_type: "dsh" });
  }
  if (name === "bridge_capture" || name === "bridge_revise") {
    try {
      const input = { ...args, namespace: args.namespace ?? options?.namespace ?? "global" };
      return executeMemoryWrite({
        operation: name === "bridge_revise" ? "revise" : "capture",
        host_type: "dsh",
        host_session_ref: input.session_id ?? null,
        namespace: input.namespace,
        source_ref: input.source_ref,
        idempotency_key: input.idempotency_key,
        arguments: input,
      });
    } catch (error) {
      return { id: "", gate: "blocked", reason: error instanceof Error ? error.message : String(error), reused: false };
    }
  }
  if (name !== "planner_decision") throw new Error(`Unknown DSH Planner tool: ${name}`);
  const eventId = plannerEventIdFor(args.plan_run_id, args.idempotency_key);
  const existing = await getMemoryClient().getPlannerDecisionByEventId(eventId);
  let approval: unknown = null;
  if (options?.requireExecutionApproval && args.decision.decision === "execute" && existing.rows.length === 0) {
    approval = await askDshUserQuestion(runtime.userQuestions, {
      agent: exec.agent,
      planRunId: args.plan_run_id,
      questionId: `${eventId}:approval`,
      question: `Allow execution of ${args.decision.option_id}?`,
      approval: { approve: "Allow", reject: "Reject" },
      signal: exec.signal,
    });
    const answers = (approval as { answers?: Array<{ selected: string[] }> }).answers ?? [];
    if (!answers.some((answer) => answer.selected.includes("Allow"))) {
      return { id: eventId, plannerEventId: eventId, gate: "blocked", reason: "Execution rejected by DSH approval", approval };
    }
  }
  const result = await submitPlannerDecision({ ...args, signal: exec.signal, host_context: exec.agent });
  if (result.gate === "pass" && result.decision?.decision === "ask" && !result.reused) {
    const answer = await askDshUserQuestion(runtime.userQuestions, {
      agent: exec.agent,
      planRunId: args.plan_run_id,
      questionId: `${eventId}:question`,
      question: result.decision.question,
      signal: exec.signal,
    });
    return { ...result, hostAnswer: answer };
  }
  return { ...result, approval };
}

export async function createDshPlannerTools(
  runtime: DshPlannerRuntime,
  options?: DshPlannerOptions,
): Promise<DshToolDefinition[]> {
  const { defineTool } = await import("@deepseek-ai/dsh-tools");
  const contracts = {
    planner_context: PLANNER_TOOL_CONTRACTS.planner_context,
    planner_options: PLANNER_TOOL_CONTRACTS.planner_options,
    planner_decision: PLANNER_TOOL_CONTRACTS.planner_decision,
    bridge_recall: BRIDGE_TOOL_CONTRACTS.bridge_recall,
    bridge_capture: BRIDGE_TOOL_CONTRACTS.bridge_capture,
    bridge_revise: BRIDGE_TOOL_CONTRACTS.bridge_revise,
  };
  return Object.entries(contracts).map(([name, contract]) => defineTool({
    name,
    description: contract.description,
    parameters: dshParametersFromZodShape(contract.args),
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) ?? "null" }],
    },
    isConcurrencySafe: () => name !== "planner_decision" && name !== "bridge_capture" && name !== "bridge_revise",
    execute: async (args, exec) => toLosslessJsonValue(await executeDshPlannerTool(runtime, name, args, exec as DshToolRunContext, options)),
  }));
}

export async function applyDshPlanner(runtime: DshPlannerRuntime, options?: DshPlannerOptions): Promise<void> {
  registerDshReviewer(runtime.subagents, options?.subagentProvider ?? "spawn");
  for (const tool of await createDshPlannerTools(runtime, options)) runtime.tools.register(tool);
}
