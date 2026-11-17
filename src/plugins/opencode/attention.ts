import { answerContinuousHost, type ContinuousHostResult } from "../../api/continuous-host";

export interface OpenCodePermissionInput {
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}

export type OpenCodePermissionAsk = (
  input: OpenCodePermissionInput,
  output: { status: "ask" | "deny" | "allow" },
) => Promise<void>;

export async function askOpenCodePermission(input: {
  questionId: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}, ask: OpenCodePermissionAsk): Promise<{ hostQuestionRef: string }> {
  await ask({
    title: input.title,
    description: input.description,
    metadata: input.metadata,
  }, { status: "ask" });
  return { hostQuestionRef: input.questionId };
}

export async function answerOpenCodeQuestion(input: {
  planRunId: string;
  hostQuestionRef: string;
  answerEventId: string;
  answer: unknown;
}): Promise<ContinuousHostResult> {
  return answerContinuousHost({
    plan_run_id: input.planRunId,
    host_question_ref: input.hostQuestionRef,
    answer_event_id: input.answerEventId,
    answer: input.answer,
  });
}
