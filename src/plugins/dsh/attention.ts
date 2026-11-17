import { answerContinuousHost, type ContinuousHostResult } from "../../api/continuous-host";

export interface DshAnswerItem {
  id: string;
  selected: string[];
  custom?: string;
}

export interface DshAnswerBatch {
  answers: DshAnswerItem[];
}

export interface DshQuestionItem {
  id: string;
  question: string;
  detail?: string;
  options?: Array<{ label: string; description?: string }>;
  intent?: {
    kind: "approval";
    approve: string;
    reject: string;
    always?: string;
  };
}

export interface DshUserQuestionsAdapter {
  ask(request: {
    agent: unknown;
    questions: DshQuestionItem[];
    signal?: AbortSignal;
  }): Promise<DshAnswerBatch>;
  askTimed(request: {
    agent: unknown;
    questions: DshQuestionItem[];
    signal?: AbortSignal;
  }, callId: string, timeoutMs: number): Promise<DshAnswerBatch | { pending: true; callId: string }>;
  answer(agent: unknown, callId: string, answer: DshAnswerBatch): boolean;
}

export type DshRootAgent = unknown;

export async function askDshUserQuestion(
  userQuestions: Pick<DshUserQuestionsAdapter, "ask">,
  input: {
    agent: DshRootAgent;
    planRunId: string;
    questionId: string;
    question: string;
    detail?: string;
    approval?: { approve: string; reject: string; always?: string };
    signal?: AbortSignal;
  },
): Promise<ContinuousHostResult & { answers: DshAnswerItem[] }> {
  const answer = await userQuestions.ask({
    agent: input.agent,
    questions: [{
      id: input.questionId,
      question: input.question,
      ...((input.detail || input.approval) ? { detail: input.detail ?? input.question } : {}),
      ...(input.approval ? {
        options: [
          { label: input.approval.approve },
          { label: input.approval.reject },
          ...(input.approval.always ? [{ label: input.approval.always }] : []),
        ],
        intent: { kind: "approval", ...input.approval },
      } : {}),
    }],
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const recorded = await answerContinuousHost({
    plan_run_id: input.planRunId,
    host_question_ref: input.questionId,
    answer_event_id: input.questionId,
    answer,
  });
  return { ...recorded, answers: answer.answers };
}

export async function askTimedDshUserQuestion(
  userQuestions: Pick<DshUserQuestionsAdapter, "askTimed">,
  input: {
    agent: DshRootAgent;
    planRunId: string;
    callId: string;
    question: string;
    timeoutMs: number;
    signal?: AbortSignal;
  },
): Promise<ContinuousHostResult | { pending: true; callId: string }> {
  const result = await userQuestions.askTimed({
    agent: input.agent,
    questions: [{ id: input.callId, question: input.question }],
    ...(input.signal ? { signal: input.signal } : {}),
  }, input.callId, input.timeoutMs);
  if ("pending" in result && result.pending) return result;
  return answerContinuousHost({
    plan_run_id: input.planRunId,
    host_question_ref: input.callId,
    answer_event_id: input.callId,
    answer: result,
  });
}

export async function answerDshContinuedQuestion(
  userQuestions: Pick<DshUserQuestionsAdapter, "answer">,
  input: {
    agent: DshRootAgent;
    planRunId: string;
    callId: string;
    answer: DshAnswerBatch;
  },
): Promise<ContinuousHostResult> {
  const continued = userQuestions.answer(input.agent, input.callId, input.answer);
  if (continued) {
    return { id: input.callId, planRunId: input.planRunId, gate: "pass", reused: true };
  }
  return answerContinuousHost({
    plan_run_id: input.planRunId,
    host_question_ref: input.callId,
    answer_event_id: input.callId,
    answer: input.answer,
  });
}
