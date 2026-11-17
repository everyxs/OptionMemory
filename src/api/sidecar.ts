import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getMemoryClient } from "../memory/client";
import type { ModelRow, OptionRow, SubtaskRow } from "../memory/assets";
import {
  PLANNER_DECISION_TYPES,
  type ModelEventRow,
  type OptionOutcomeStatus,
  type PlanRunRow,
  type PlannerDecisionType,
  type PlannerRow,
  type SubtaskEventRow,
} from "../memory/planner";
import type { SidecarEventRow } from "../memory/sidecar";
import type { MandateInput } from "./telemetry";

export const SIDECAR_MAPPING_VERSION = "sidecar-mapping-v0.1";

export interface SidecarEventInput extends Record<string, unknown> {
  baseline_id: string;
  scenario_id: string;
  run_id: string;
  event_type: "scenario" | "run.started" | "planner.decision" | "tool.call" | "tool.result" | "run.completed" | "run.stopped" | "skill.registered" | "skill.updated" | "skill.rollback";
  external_id: string;
  tool_id?: string;
  call_id?: string;
  subtask_id?: string;
  mandate?: MandateInput;
  attempt?: number;
  host_session_ref?: string | null;
  planner_id?: string;
  planner_call_id?: string;
  decision?: Record<string, unknown> & { decision: PlannerDecisionType; rationale?: unknown };
  option_id?: string;
  model_id?: string;
  arguments?: unknown;
  output?: unknown;
  error?: unknown;
  pre_state?: unknown;
  post_state?: unknown;
  anticipation?: unknown;
  status?: OptionOutcomeStatus;
  scalar_reward?: number | null;
  cost?: unknown;
  critique?: unknown;
  observed_execution_mode?: "real" | "simulated";
  observed_option_version?: string | null;
  observed_model_version?: string | null;
  environment?: unknown;
  verification?: {
    verifier_id: string;
    verdict: unknown;
    evidence_refs?: string[];
  };
  drift?: unknown;
  lifecycle_ref?: string | null;
  created_at?: number | null;
  parent_option_id?: string | null;
  parent_version?: string | null;
  origin_event_id?: string | null;
  revision_ref?: string | null;
  state_hash?: string | null;
}

export interface SidecarMappingRefs {
  subtask_event_id: string | null;
  plan_run_id: string | null;
  planner_event_id: string | null;
  option_id: string | null;
  option_event_id: string | null;
  model_event_id: string | null;
  anticipation_event_id: string | null;
  drift_event_id: string | null;
  model_id: string | null;
}

export interface SidecarMappingResult {
  id: string;
  gate: "pass" | "blocked";
  reason?: string;
  reused: boolean;
  baseline_id: string;
  external_id: string;
  mapping_version: typeof SIDECAR_MAPPING_VERSION;
  mode: "sidecar";
  refs: SidecarMappingRefs;
  unmapped: string[];
}

const EMPTY_REFS: SidecarMappingRefs = {
  subtask_event_id: null,
  plan_run_id: null,
  planner_event_id: null,
  option_id: null,
  option_event_id: null,
  model_event_id: null,
  anticipation_event_id: null,
  drift_event_id: null,
  model_id: null,
};

function deterministicId(kind: string, parts: Array<string | null | undefined>): string {
  return `${kind}_${createHash("sha256").update(parts.map((part) => part ?? "").join("|")).digest("hex")}`;
}

function rowsToObjects<T>(result: { headers: string[]; rows: unknown[][] }): T[] {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as T);
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return rowsToObjects<T>(result)[0];
}

function now(): number {
  return Date.now() / 1000;
}

function sidecarSubtaskEventId(input: SidecarEventInput): string {
  return deterministicId("subtask_event", [SIDECAR_MAPPING_VERSION, input.baseline_id, input.scenario_id]);
}

export function sidecarPlanRunId(input: Pick<SidecarEventInput, "baseline_id" | "scenario_id" | "run_id">): string {
  return deterministicId("plan_run", [SIDECAR_MAPPING_VERSION, input.baseline_id, input.scenario_id, input.run_id]);
}

function sidecarPlannerEventId(input: SidecarEventInput, sourceEventId: string): string {
  return deterministicId("planner_event", [SIDECAR_MAPPING_VERSION, input.baseline_id, input.scenario_id, input.run_id, sourceEventId]);
}

function sidecarOptionEventId(input: SidecarEventInput): string {
  return deterministicId("option_event", [SIDECAR_MAPPING_VERSION, input.baseline_id, input.scenario_id, input.run_id, input.call_id]);
}

export function sidecarEventId(input: Pick<SidecarEventInput, "baseline_id" | "scenario_id" | "run_id" | "event_type" | "external_id">): string {
  return deterministicId("sidecar_event", [SIDECAR_MAPPING_VERSION, input.baseline_id, input.scenario_id, input.run_id, input.event_type, input.external_id]);
}

function assertCompatible(existing: object, expected: object): void {
  for (const [key, value] of Object.entries(expected)) {
    if (!isDeepStrictEqual((existing as Record<string, unknown>)[key], value)) {
      throw new Error(`sidecar mapping conflict on ${key}`);
    }
  }
}

function mappingPayload(refs: SidecarMappingRefs, unmapped: string[], input: SidecarEventInput, reason?: string) {
  return {
    mapping_version: SIDECAR_MAPPING_VERSION,
    baseline_id: input.baseline_id,
    mode: "sidecar",
    observed_execution_mode: input.observed_execution_mode ?? null,
    observed_option_version: input.observed_option_version ?? null,
    observed_model_version: input.observed_model_version ?? null,
    lifecycle_ref: input.lifecycle_ref ?? null,
    revision_ref: input.revision_ref ?? null,
    refs,
    unmapped,
    reason: reason ?? null,
    provenance: {
      source_identifiers: "native",
      entity_references: "mapped",
      payload_values: "observed",
      model_quality: "uncalibrated",
    },
    unknowns: {
      model: input.model_id ?? null,
      reward: typeof input.scalar_reward === "number" ? input.scalar_reward : null,
      rationale: typeof input.decision?.rationale === "string" ? input.decision.rationale : null,
    },
  };
}

export async function ingestSidecarEvent(input: SidecarEventInput): Promise<SidecarMappingResult> {
  const id = sidecarEventId(input);
  const refs: SidecarMappingRefs = { ...EMPTY_REFS };
  const unmapped: string[] = [];
  const base = { baseline_id: input.baseline_id, external_id: input.external_id };
  if (!input.baseline_id || !input.scenario_id || !input.run_id || !input.external_id) {
    return {
      id, gate: "blocked", reason: "baseline_id, scenario_id, run_id and external_id are required",
      reused: false, ...base, mapping_version: SIDECAR_MAPPING_VERSION, mode: "sidecar", refs, unmapped,
    };
  }
  const client = getMemoryClient();
  const raw: SidecarEventRow = {
    sidecar_event_id: id,
    baseline_id: input.baseline_id,
    scenario_id: input.scenario_id,
    run_id: input.run_id,
    tool_id: input.tool_id ?? null,
    call_id: input.call_id ?? null,
    event_type: input.event_type,
    external_id: input.external_id,
    payload_json: input,
    mapping_json: mappingPayload(refs, unmapped, input),
    created_at: now(),
  };
  const existing = oneRow<SidecarEventRow>(await client.getSidecarEventById(id));
  if (existing && !isDeepStrictEqual(existing.payload_json, input)) {
    return {
      id, gate: "blocked", reason: "sidecar external event is already bound to a different payload",
      reused: true, ...base, mapping_version: SIDECAR_MAPPING_VERSION, mode: "sidecar", refs, unmapped,
    };
  }
  if (!existing) await client.putSidecarEvent(raw);

  const persist = async (gate: "pass" | "blocked", reason?: string): Promise<SidecarMappingResult> => {
    await client.putSidecarEvent({ ...raw, created_at: existing?.created_at ?? raw.created_at, mapping_json: mappingPayload(refs, unmapped, input, reason) });
    return {
      id, gate, reason, reused: Boolean(existing), ...base,
      mapping_version: SIDECAR_MAPPING_VERSION, mode: "sidecar", refs, unmapped,
    };
  };
  const loadPlan = async (): Promise<PlanRunRow | undefined> => {
    const plan = oneRow<PlanRunRow>(await client.getPlanRunById(sidecarPlanRunId(input)));
    if (plan) {
      refs.subtask_event_id = plan.subtask_event_id;
      refs.plan_run_id = plan.plan_run_id;
    }
    return plan;
  };

  try {
    if (input.event_type === "run.started") {
      if (!input.subtask_id) unmapped.push("subtask_id_required");
      if (!input.mandate) unmapped.push("mandate_required");
      if (!Number.isInteger(input.attempt) || (input.attempt ?? 0) < 1) unmapped.push("valid_attempt_required");
      if (unmapped.length) return persist("pass");
      const subtask = oneRow<SubtaskRow>(await client.getSubtaskById(input.subtask_id!));
      if (!subtask) {
        unmapped.push("subtask_not_registered");
        return persist("pass");
      }
      const subtaskEventId = sidecarSubtaskEventId(input);
      const expectedSubtask: SubtaskEventRow = {
        subtask_event_id: subtaskEventId,
        subtask_id: input.subtask_id!,
        baseline_id: input.baseline_id,
        mandate_json: input.mandate!,
        created_at: 0,
      };
      const existingSubtask = oneRow<SubtaskEventRow>(await client.getSubtaskEventById(subtaskEventId));
      if (existingSubtask) assertCompatible(existingSubtask, { ...expectedSubtask, created_at: existingSubtask.created_at });
      else await client.putSubtaskEvent({ ...expectedSubtask, created_at: now() });
      const planRunId = sidecarPlanRunId(input);
      const expectedPlan: PlanRunRow = {
        plan_run_id: planRunId,
        subtask_event_id: subtaskEventId,
        attempt: input.attempt!,
        host_type: "sidecar",
        host_session_ref: input.host_session_ref ?? null,
        host_ticket_ref: input.scenario_id,
        host_assignment_ref: input.run_id,
        idempotency_key: [SIDECAR_MAPPING_VERSION, input.baseline_id, input.scenario_id, input.run_id].join("|"),
        mapping_version: SIDECAR_MAPPING_VERSION,
        status: "active",
        created_at: 0,
        updated_at: 0,
      };
      const existingPlan = oneRow<PlanRunRow>(await client.getPlanRunById(planRunId));
      if (existingPlan) {
        assertCompatible(existingPlan, {
          ...expectedPlan,
          status: existingPlan.status,
          created_at: existingPlan.created_at,
          updated_at: existingPlan.updated_at,
        });
      } else {
        await client.putPlanRun({ ...expectedPlan, created_at: now(), updated_at: now() });
      }
      refs.subtask_event_id = subtaskEventId;
      refs.plan_run_id = planRunId;
      return persist("pass");
    }

    if (input.event_type === "planner.decision") {
      const plan = await loadPlan();
      if (!plan) {
        unmapped.push("plan_run_missing");
        return persist("pass");
      }
      if (!input.planner_id) unmapped.push("planner_id_required");
      if (!input.decision || !PLANNER_DECISION_TYPES.includes(input.decision.decision)) unmapped.push("explicit_decision_required");
      if (unmapped.length) return persist("pass");
      const planner = oneRow<PlannerRow>(await client.getPlannerById(input.planner_id!));
      if (!planner) {
        unmapped.push("planner_not_registered");
        return persist("pass");
      }
      const plannerEventId = sidecarPlannerEventId(input, input.external_id);
      const subtaskEvent = oneRow<SubtaskEventRow>(await client.getSubtaskEventById(plan.subtask_event_id));
      const mandate = subtaskEvent?.mandate_json as MandateInput;
      const expectedEvent = {
        planner_event_id: plannerEventId,
        subtask_event_id: plan.subtask_event_id,
        plan_run_id: plan.plan_run_id,
        planner_id: input.planner_id!,
        context_json: {
          state_snapshot_ref: id,
          state_hash: input.state_hash ?? null,
          instructions_version: planner.instructions_version,
          inference_ref: planner.inference_ref,
          policy_version: mandate.policy_version,
          evidence_refs: Array.isArray(input.decision!.evidence_refs) ? input.decision!.evidence_refs : null,
          mapping_version: SIDECAR_MAPPING_VERSION,
        },
      };
      const existingPlannerEvent = oneRow(await client.getPlannerEventById(plannerEventId));
      if (existingPlannerEvent) assertCompatible(existingPlannerEvent, expectedEvent);
      else await client.putPlannerEvent({ ...expectedEvent, created_at: now() });
      const expectedDecision = {
        planner_event_id: plannerEventId,
        decision_type: input.decision!.decision,
        decision_json: {
          ...input.decision!,
          rationale: typeof input.decision!.rationale === "string" ? input.decision!.rationale : null,
        },
      };
      const existingDecision = oneRow(await client.getPlannerDecisionByEventId(plannerEventId));
      if (existingDecision) assertCompatible(existingDecision, expectedDecision);
      else await client.putPlannerDecision({ ...expectedDecision, created_at: now() });
      refs.planner_event_id = plannerEventId;
      return persist("pass");
    }

    if (input.event_type === "tool.call") {
      const plan = await loadPlan();
      if (!plan) {
        unmapped.push("plan_run_missing");
        return persist("pass");
      }
      if (!input.tool_id) unmapped.push("tool_id_required");
      if (!input.call_id) unmapped.push("call_id_required");
      if (!input.planner_call_id) unmapped.push("planner_call_id_required");
      if (!input.option_id) unmapped.push("option_id_required");
      if (!input.model_id) unmapped.push("model_id_required");
      if (unmapped.length) return persist("pass");
      const [option, model] = await Promise.all([
        client.getOptionById(input.option_id!),
        client.getModelById(input.model_id!),
      ]);
      const optionRow = oneRow<OptionRow>(option);
      const modelRow = oneRow<ModelRow>(model);
      if (!optionRow) unmapped.push("option_not_registered");
      if (!modelRow) unmapped.push("model_not_registered");
      if (unmapped.length) return persist("pass");
      const subtaskEvent = oneRow<SubtaskEventRow>(await client.getSubtaskEventById(plan.subtask_event_id));
      if (optionRow!.subtask_binding !== subtaskEvent?.subtask_id || optionRow!.model_binding !== input.model_id || modelRow!.option_id !== input.option_id) {
        throw new Error("sidecar option/model/subtask binding mismatch");
      }
      const plannerEventId = sidecarPlannerEventId(input, input.planner_call_id!);
      const decision = oneRow<{ decision_type: string; decision_json: { option_id?: string } }>(await client.getPlannerDecisionByEventId(plannerEventId));
      if (!decision) {
        unmapped.push("explicit_planner_decision_missing");
        return persist("pass");
      }
      if (decision.decision_type !== "execute" || decision.decision_json.option_id !== input.option_id) {
        throw new Error("sidecar tool call does not match its explicit execute decision");
      }
      const optionEventId = sidecarOptionEventId(input);
      const expectedEvent = {
        option_event_id: optionEventId,
        planner_event_id: plannerEventId,
        option_id: input.option_id!,
        model_id: input.model_id!,
        execution_json: {
          option_version: optionRow!.lin_version,
          observed_option_version: input.observed_option_version ?? null,
          observed_model_version: input.observed_model_version ?? null,
          lifecycle_ref: input.lifecycle_ref ?? null,
          pi_type: optionRow!.pi_type,
          pi_ref: optionRow!.pi_ref,
          pi_theta: optionRow!.lin_theta,
          attempt: plan.attempt,
          mode: "sidecar",
          observed_execution_mode: input.observed_execution_mode ?? null,
          mapping_version: SIDECAR_MAPPING_VERSION,
          baseline_id: input.baseline_id,
          scenario_id: input.scenario_id,
          run_id: input.run_id,
          tool_id: input.tool_id!,
          call_id: input.call_id!,
          evidence_origin: "sidecar",
          model_quality: "uncalibrated",
        },
      };
      const existingOptionEvent = oneRow(await client.getOptionEventById(optionEventId));
      if (existingOptionEvent) assertCompatible(existingOptionEvent, expectedEvent);
      else await client.putOptionEvent({ ...expectedEvent, created_at: now() });
      if (Object.prototype.hasOwnProperty.call(input, "arguments")) {
        const observationId = deterministicId("observation_event", [id, "input"]);
        const expectedObservation = {
          observation_event_id: observationId,
          option_event_id: optionEventId,
          observation_type: "input" as const,
          value_json: input.arguments,
        };
        const existingObservation = oneRow(await client.getOptionObservationById(observationId));
        if (existingObservation) assertCompatible(existingObservation, expectedObservation);
        else await client.putOptionObservation({ ...expectedObservation, created_at: now() });
      }
      refs.planner_event_id = plannerEventId;
      refs.option_id = input.option_id!;
      refs.option_event_id = optionEventId;
      refs.model_id = input.model_id!;
      return persist("pass");
    }

    if (input.event_type === "tool.result") {
      const plan = await loadPlan();
      if (!plan) {
        unmapped.push("plan_run_missing");
        return persist("pass");
      }
      if (!input.call_id) unmapped.push("call_id_required");
      if (unmapped.length) return persist("pass");
      const optionEventId = sidecarOptionEventId(input);
      const optionEvent = oneRow<{ option_id: string; model_id: string; execution_json: { lifecycle_ref?: string | null } }>(await client.getOptionEventById(optionEventId));
      if (!optionEvent) {
        unmapped.push("option_event_missing");
        return persist("pass");
      }
      refs.option_id = optionEvent.option_id;
      refs.option_event_id = optionEventId;
      refs.model_id = optionEvent.model_id;
      for (const [field, observationType] of [["output", "output"], ["error", "error"], ["pre_state", "pre_state"], ["post_state", "post_state"], ["environment", "environment"]] as const) {
        if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
        const observationId = deterministicId("observation_event", [id, observationType]);
        const expectedObservation = {
          observation_event_id: observationId,
          option_event_id: optionEventId,
          observation_type: observationType,
          value_json: input[field],
        };
        const existingObservation = oneRow(await client.getOptionObservationById(observationId));
        if (existingObservation) assertCompatible(existingObservation, expectedObservation);
        else await client.putOptionObservation({ ...expectedObservation, created_at: now() });
      }
      if (input.status) {
        if (!["success", "failure", "blocked"].includes(input.status)) throw new Error("invalid sidecar outcome status");
        const expectedOutcome = {
          option_event_id: optionEventId,
          status: input.status,
          evaluation_json: {
            scalar_reward: typeof input.scalar_reward === "number" && Number.isFinite(input.scalar_reward) ? input.scalar_reward : null,
            reward_source: typeof input.scalar_reward === "number" && Number.isFinite(input.scalar_reward) ? "observed" : "uncalibrated",
          },
          cost_json: { observed: Object.prototype.hasOwnProperty.call(input, "cost"), value: input.cost ?? null },
          error_json: { observed: Object.prototype.hasOwnProperty.call(input, "error"), value: input.error ?? null },
        };
        const existingOutcome = oneRow(await client.getOptionOutcomeByOptionEventId(optionEventId));
        if (existingOutcome) assertCompatible(existingOutcome, expectedOutcome);
        else await client.putOptionOutcome({ ...expectedOutcome, created_at: now() });
      }
      if (Object.prototype.hasOwnProperty.call(input, "anticipation")) {
        const anticipationEventId = deterministicId("model_event", [id, "anticipation"]);
        const expectedAnticipationEvent: ModelEventRow = {
          model_event_id: anticipationEventId,
          model_id: optionEvent.model_id,
          event_type: "anticipation",
          payload_json: {
            sidecar_event_id: id,
            option_event_id: optionEventId,
            anticipation: input.anticipation,
            baseline_id: input.baseline_id,
            evidence_origin: "sidecar",
            model_quality: "uncalibrated",
          },
          created_at: 0,
        };
        const existingAnticipationEvent = oneRow<ModelEventRow>(await client.getModelEventById(anticipationEventId));
        if (existingAnticipationEvent) assertCompatible(existingAnticipationEvent, { ...expectedAnticipationEvent, created_at: existingAnticipationEvent.created_at });
        else await client.putModelEvent({ ...expectedAnticipationEvent, created_at: now() });
        refs.anticipation_event_id = anticipationEventId;
      }
      if (Object.prototype.hasOwnProperty.call(input, "critique") || input.verification) {
        const modelEventId = deterministicId("model_event", [id, "critique"]);
        const expectedModelEvent: ModelEventRow = {
          model_event_id: modelEventId,
          model_id: optionEvent.model_id,
          event_type: "critique",
          payload_json: {
            sidecar_event_id: id,
            option_event_id: optionEventId,
            critique: input.critique ?? null,
            verification: input.verification ?? null,
            baseline_id: input.baseline_id,
            evidence_origin: "sidecar",
            model_quality: "uncalibrated",
          },
          created_at: 0,
        };
        const existingModelEvent = oneRow<ModelEventRow>(await client.getModelEventById(modelEventId));
        if (existingModelEvent) assertCompatible(existingModelEvent, { ...expectedModelEvent, created_at: existingModelEvent.created_at });
        else await client.putModelEvent({ ...expectedModelEvent, created_at: now() });
        refs.model_event_id = modelEventId;
      }
      if (Object.prototype.hasOwnProperty.call(input, "drift")) {
        const driftEventId = deterministicId("model_event", [id, "drift"]);
        const expectedDriftEvent: ModelEventRow = {
          model_event_id: driftEventId,
          model_id: optionEvent.model_id,
          event_type: "drift",
          payload_json: {
            sidecar_event_id: id,
            option_event_id: optionEventId,
            drift: input.drift,
            environment: input.environment ?? null,
            lifecycle_ref: input.lifecycle_ref ?? optionEvent.execution_json.lifecycle_ref ?? null,
            baseline_id: input.baseline_id,
            evidence_origin: "sidecar",
            model_quality: "uncalibrated",
          },
          created_at: 0,
        };
        const existingDriftEvent = oneRow<ModelEventRow>(await client.getModelEventById(driftEventId));
        if (existingDriftEvent) assertCompatible(existingDriftEvent, { ...expectedDriftEvent, created_at: existingDriftEvent.created_at });
        else await client.putModelEvent({ ...expectedDriftEvent, created_at: now() });
        refs.drift_event_id = driftEventId;
      }
      return persist("pass");
    }

    if (["skill.registered", "skill.updated", "skill.rollback"].includes(input.event_type)) {
      if (!input.option_id) {
        unmapped.push("option_id_required");
        return persist("pass");
      }
      const option = oneRow<OptionRow>(await client.getOptionById(input.option_id));
      if (!option) {
        unmapped.push("option_not_registered");
        return persist("pass");
      }
      for (const field of ["created_at", "parent_option_id", "parent_version", "origin_event_id"] as const) {
        if (input[field] !== undefined && !isDeepStrictEqual(input[field], option[field] ?? null)) {
          throw new Error(`sidecar Option lineage mismatch on ${field}`);
        }
      }
      if (input.event_type === "skill.updated" && !input.observed_option_version) {
        unmapped.push("observed_option_version_required");
      }
      if (input.event_type === "skill.rollback" && !input.revision_ref) {
        unmapped.push("revision_ref_required");
      }
      if (unmapped.length) return persist("pass");
      const model = oneRow<ModelRow>(await client.getModelById(option.model_binding));
      if (model) refs.model_id = model.model_id;
      refs.option_id = option.option_id;
      return persist("pass");
    }

    if (input.event_type === "run.completed" || input.event_type === "run.stopped") {
      const plan = await loadPlan();
      if (!plan) {
        unmapped.push("plan_run_missing");
        return persist("pass");
      }
      const status = input.event_type === "run.completed" ? "completed" : "stopped";
      if (plan.status !== status) await client.putPlanRun({ ...plan, status, updated_at: now() });
      return persist("pass");
    }

    return persist("pass");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return persist("blocked", reason);
  }
}
