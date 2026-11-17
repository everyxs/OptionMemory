import { z } from "zod";

const decisionFields = {
  rationale: z.string().min(1),
  evidence_refs: z.array(z.string()),
  uncertainties: z.array(z.string()),
};

export const plannerDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("execute"),
    option_id: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
    ...decisionFields,
  }).strict(),
  z.object({
    decision: z.literal("decompose"),
    proposals: z.array(z.object({
      goal: z.string().min(1),
      context: z.record(z.string(), z.unknown()),
    }).strict()),
    ...decisionFields,
  }).strict(),
  z.object({
    decision: z.literal("replan"),
    option_event_id: z.string().min(1).optional(),
    ...decisionFields,
  }).strict(),
  z.object({
    decision: z.literal("retry"),
    option_event_id: z.string().min(1),
    ...decisionFields,
  }).strict(),
  z.object({
    decision: z.literal("wait"),
    wait_condition: z.string().min(1),
    ...decisionFields,
  }).strict(),
  z.object({
    decision: z.literal("ask"),
    question: z.string().min(1),
    ...decisionFields,
  }).strict(),
  z.object({
    decision: z.literal("stop"),
    ...decisionFields,
  }).strict(),
  z.object({
    decision: z.literal("ignore"),
    ...decisionFields,
  }).strict(),
]);

export type PlannerDecision = z.infer<typeof plannerDecisionSchema>;

export const PLANNER_TOOL_CONTRACTS = {
  planner_context: {
    description: "Read the active plan_run, its mandate, recent decisions and evidence. Does not change state.",
    args: { plan_run_id: z.string().min(1) },
  },
  planner_options: {
    description: "List only executable Options bound to the plan_run subtask, including input schemas and implementation references.",
    args: { plan_run_id: z.string().min(1) },
  },
  planner_decision: {
    description: "Submit one structured Planner decision through the Decision Gate. This never settles or revokes governance assets.",
    args: {
      plan_run_id: z.string().min(1),
      planner_id: z.string().min(1).default("planner_s01"),
      idempotency_key: z.string().min(1),
      state_snapshot_ref: z.string().min(1),
      state_hash: z.string().min(1),
      decision: plannerDecisionSchema,
    },
  },
} as const;

export type PlannerToolName = keyof typeof PLANNER_TOOL_CONTRACTS;
