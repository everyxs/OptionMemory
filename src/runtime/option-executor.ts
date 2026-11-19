import { createHash } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type { ModelRow, OptionRow } from "../memory/assets";
import type { ExecutionMode, ModelEventType, OptionOutcomeRow, OptionOutcomeStatus } from "../memory/planner";
import {
  beginOptionExecution,
  finishOptionExecution,
  recordModelEvent,
  recordOptionObservation,
  type MandateInput,
} from "../api/telemetry";
import { deriveClosure } from "./deriveClosure";
import { executeMaterialsCsv, MATERIALS_CSV_PARSER_VERSION } from "./csv-materials";
import { recordTransientCsvSettlement, transientSettlementIdFor } from "./transient-settlement";
import { parseMarkdownNote } from "../bridge/markdown/parser";
import { captureDailyMemory, MARKDOWN_PARSER_VERSION, reviseDailyMemory } from "../api/document-projections";

export interface OptionImplementationContext {
  option: OptionRow;
  model: ModelRow;
  signal: AbortSignal;
  idempotencyKey: string;
  host_context?: unknown;
}

export interface OptionModelEventInput {
  model_event_id?: string;
  event_type: ModelEventType;
  payload_json: unknown;
}

export interface OptionImplementationResult {
  output: unknown;
  evaluation?: Record<string, unknown>;
  model_events?: OptionModelEventInput[];
}

export type OptionImplementation = (
  args: Record<string, unknown>,
  context: OptionImplementationContext,
) => Promise<OptionImplementationResult>;

export interface OptionExecutionRequest {
  option_id: string;
  planner_event_id: string;
  arguments?: Record<string, unknown>;
  mandate: MandateInput;
  idempotency_key: string;
  option_event_id?: string;
  attempt?: number;
  mode?: ExecutionMode;
  implementation_version?: string;
  signal?: AbortSignal;
  host_context?: unknown;
}

export interface OptionExecResult {
  ok: boolean;
  gate: "pass" | "blocked";
  status: "success" | "failure" | "blocked";
  optionEventId: string;
  idempotencyKey: string;
  output?: unknown;
  outcome?: OptionOutcomeRow;
  reason?: string;
  reused?: boolean;
}

const implementations = new Map<string, OptionImplementation>();

export function implementationKey(piType: string, piRef: string): string {
  return `${piType}:${piRef}`;
}

export function registerControlledOptionImplementation(
  piType: string,
  piRef: string,
  implementation: OptionImplementation,
): void {
  implementations.set(implementationKey(piType, piRef), implementation);
}

export function schemaError(value: unknown, schema: unknown, path = "$"): string | null {
  if (schema === null || schema === undefined) return null;
  if (typeof schema === "boolean") return schema ? null : `${path} is forbidden by schema`;
  if (typeof schema !== "object" || Array.isArray(schema)) return `${path} has an invalid schema`;
  const rule = schema as Record<string, unknown>;
  if (typeof rule.predicate === "string") {
    if (typeof value !== "object" || value === null || (value as Record<string, unknown>).predicate !== rule.predicate) {
      return `${path}.predicate must be ${rule.predicate}`;
    }
  }
  if (rule.const !== undefined && value !== rule.const) return `${path} does not match const`;
  if (Array.isArray(rule.enum) && !rule.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) {
    return `${path} is not in enum`;
  }
  const types = Array.isArray(rule.type) ? rule.type : rule.type === undefined ? [] : [rule.type];
  const matches = (type: unknown) => {
    if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
    if (type === "array") return Array.isArray(value);
    if (type === "string") return typeof value === "string";
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    if (type === "integer") return typeof value === "number" && Number.isInteger(value);
    if (type === "boolean") return typeof value === "boolean";
    if (type === "null") return value === null;
    return false;
  };
  if (types.length && !types.some(matches)) return `${path} must have type ${types.join(" or ")}`;
  if (typeof value === "string" && typeof rule.minLength === "number" && value.length < rule.minLength) {
    return `${path} is shorter than minLength`;
  }
  if (Array.isArray(value)) {
    if (typeof rule.minItems === "number" && value.length < rule.minItems) return `${path} has too few items`;
    if (rule.items !== undefined) {
      for (let index = 0; index < value.length; index++) {
        const error = schemaError(value[index], rule.items, `${path}[${index}]`);
        if (error) return error;
      }
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const required = Array.isArray(rule.required) ? rule.required : [];
    for (const key of required) {
      if (typeof key === "string" && object[key] === undefined) return `${path}.${key} is required`;
    }
    const properties = typeof rule.properties === "object" && rule.properties !== null
      ? rule.properties as Record<string, unknown> : {};
    if (rule.additionalProperties === false) {
      const extra = Object.keys(object).find((key) => !(key in properties));
      if (extra) return `${path}.${extra} is not allowed`;
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (object[key] !== undefined) {
        const error = schemaError(object[key], childSchema, `${path}.${key}`);
        if (error) return error;
      }
    }
  }
  return null;
}

function oneRow<T>(result: { headers: string[]; rows: unknown[][] }): T | undefined {
  return result.rows.length ? Object.fromEntries(result.headers.map((header, index) => [header, result.rows[0][index]])) as T : undefined;
}

export function optionEventIdFor(idempotencyKey: string): string {
  return `option_event_${createHash("sha256").update(idempotencyKey).digest("hex")}`;
}

async function preconditionsMet(option: OptionRow): Promise<{ ok: boolean; reason?: string }> {
  const conditions = option.i_preconditions;
  if (conditions === null || conditions === undefined) return { ok: true };
  if (typeof conditions !== "object" || Array.isArray(conditions)) return { ok: false, reason: "i_preconditions must be an object" };
  const requires = (conditions as Record<string, unknown>).requires;
  if (requires === undefined) return { ok: true };
  if (!Array.isArray(requires) || !requires.every((item) => typeof item === "string")) {
    return { ok: false, reason: "i_preconditions.requires must be a string array" };
  }
  const facts = await getMemoryClient().listActiveClosureFacts();
  for (const requirement of requires as string[]) {
    const match = /^([a-zA-Z_][\w]*)\((.*)\)$/.exec(requirement);
    const satisfied = match
      ? facts.some((fact) => fact.predicate === match[1] && fact.args.some((arg) => arg === match[2]))
      : facts.some((fact) => fact.id === requirement);
    if (!satisfied) return { ok: false, reason: `Unmet initiation precondition: ${requirement}` };
  }
  return { ok: true };
}

registerControlledOptionImplementation("api", "deriveClosure(R2)", async (args) => {
  if (typeof args.entity !== "string" || !args.entity) throw new Error("entity is required");
  const closure = await deriveClosure({ entity: args.entity, ruleId: "R2" });
  const [facts, justifications] = await Promise.all([
    getMemoryClient().listActiveClosureFacts(),
    getMemoryClient().listJustifications(),
  ]);
  const ids = closure.ids.filter((id): id is string => typeof id === "string");
  const derivedFacts = facts.filter((fact) => ids.includes(fact.id));
  const justified = ids.every((id) => justifications.some((row) => row.derived_id === id && row.active));
  const primary = derivedFacts[0];
  return {
    output: {
      ...closure,
      rule_id: "R2",
      derived_facts: derivedFacts,
      justified,
      predicate: primary?.predicate ?? "phase_structure",
      args: primary?.args ?? [],
    },
    evaluation: { verdict: ids.length && justified && !closure.blocked.length ? "accepted" : "no_derivation", scalar_reward: null },
  };
});

registerControlledOptionImplementation("subagent", "materials-evidence-reviewer@v1", async () => {
  throw new Error("No host reviewer adapter is registered");
});

registerControlledOptionImplementation("parse", "materials-csv@v1", async (args, context) => ({
  output: await executeMaterialsCsv({
    csv: typeof args.csv === "string" ? args.csv : "",
    source: typeof args.source === "string" ? args.source : undefined,
    batch_id: typeof args.batch_id === "string" ? args.batch_id : undefined,
    idempotencyKey: context.idempotencyKey,
  }),
  evaluation: { scalar_reward: null },
}));

registerControlledOptionImplementation("parse", "markdown-note@v1", async (args) => ({
  output: await parseMarkdownNote({
    path: typeof args.path === "string" ? args.path : "",
    root: typeof args.root === "string" ? args.root : "",
    namespace: typeof args.namespace === "string" ? args.namespace : "",
  }),
  evaluation: { parser_version: MARKDOWN_PARSER_VERSION, scalar_reward: null },
}));

function memoryCaptureInput(args: Record<string, unknown>): Parameters<typeof captureDailyMemory>[0] {
  return {
    text: typeof args.text === "string" ? args.text : "",
    namespace: typeof args.namespace === "string" ? args.namespace : "",
    source_ref: typeof args.source_ref === "string" ? args.source_ref : "",
    idempotency_key: typeof args.idempotency_key === "string" ? args.idempotency_key : "",
    session_id: typeof args.session_id === "string" ? args.session_id : undefined,
    message_id: typeof args.message_id === "string" ? args.message_id : undefined,
  };
}

registerControlledOptionImplementation("memory", "memory-capture@v1", async (args) => ({
  output: await captureDailyMemory(memoryCaptureInput(args)),
  evaluation: { operation_version: "memory-capture-v1", scalar_reward: null },
}));

registerControlledOptionImplementation("memory", "memory-revise@v1", async (args) => ({
  output: await reviseDailyMemory({
    ...memoryCaptureInput(args),
    supersedes: typeof args.supersedes === "string" ? args.supersedes : "",
  }),
  evaluation: { operation_version: "memory-revise-v1", scalar_reward: null },
}));

export class OptionExecutor {
  async execute(request: OptionExecutionRequest): Promise<OptionExecResult> {
    const optionEventId = request.option_event_id ?? optionEventIdFor(request.idempotency_key);
    const base = { optionEventId, idempotencyKey: request.idempotency_key };
    const blocked = (reason: string): OptionExecResult => ({ ok: false, gate: "blocked", status: "blocked", reason, ...base });
    if (!request.idempotency_key) return blocked("idempotency_key is required");
    if (request.signal?.aborted) return blocked("execution cancelled before dispatch");
    const client = getMemoryClient();
    const existing = oneRow<import("../memory/planner").OptionEventRow>(await client.getOptionEventById(optionEventId));
    if (existing) {
      const outcome = oneRow<OptionOutcomeRow>(await client.getOptionOutcomeByOptionEventId(optionEventId));
      if (existing.option_id !== request.option_id || existing.planner_event_id !== request.planner_event_id) {
        return blocked("idempotency key is already bound to another execution");
      }
      if (!outcome) return blocked("execution already exists without an outcome; reconcile before retrying");
      const observations = await client.listOptionObservationsByOptionEventId(optionEventId);
      const outputRow = observations.rows.find((row) => row[observations.headers.indexOf("observation_type")] === "output");
      const inputRow = observations.rows.find((row) => row[observations.headers.indexOf("observation_type")] === "input");
      const output = outputRow?.[observations.headers.indexOf("value_json")];
      const existingOption = oneRow<OptionRow>(await client.getOptionById(existing.option_id));
      if (existingOption?.pi_type === "parse" && existingOption.pi_ref === "materials-csv@v1") {
        const existingModel = oneRow<ModelRow>(await client.getModelById(existing.model_id));
        if (!existingModel) return blocked(`model not found: ${existing.model_id}`);
        const settlement = await recordTransientCsvSettlement({
          option: existingOption,
          model: existingModel,
          optionEventId,
          arguments: (inputRow?.[observations.headers.indexOf("value_json")] ?? {}) as Record<string, unknown>,
          output,
          status: outcome.status,
          cost: outcome.cost_json,
          execution: existing.execution_json as { attempt: number; mode: ExecutionMode; parser_version: string | null },
        });
        if (settlement.gate === "blocked") return blocked(`settlement reconciliation required: ${settlement.reason ?? "unknown error"}`);
      }
      return {
        ok: outcome.status === "success",
        gate: outcome.status === "blocked" ? "blocked" : "pass",
        status: outcome.status,
        outcome,
        output,
        reused: true,
        ...base,
      };
    }
    const optionResult = await client.getOptionById(request.option_id);
    const option = oneRow<OptionRow>(optionResult);
    if (!option) return blocked(`option not found: ${request.option_id}`);
    const model = oneRow<ModelRow>(await client.getModelById(option.model_binding));
    if (!model) return blocked(`model not found: ${option.model_binding}`);
    if (!["probation", "settled"].includes(option.status) || !["probation", "settled"].includes(model.status)) {
      return blocked(`asset status does not permit execution: option=${option.status}, model=${model.status}`);
    }
    if (model.option_id !== option.option_id) return blocked("option/model binding mismatch");
    if (request.mandate.mode === "dry-run") return blocked("dry-run decisions must not reach the Option Executor");
    const inputError = schemaError(request.arguments ?? {}, option.input_schema);
    if (inputError) return blocked(inputError);
    const preconditions = await preconditionsMet(option);
    if (!preconditions.ok) return blocked(preconditions.reason ?? "initiation preconditions are not met");
    const implementation = implementations.get(implementationKey(option.pi_type, option.pi_ref));
    if (!implementation) return blocked(`unregistered controlled implementation: ${implementationKey(option.pi_type, option.pi_ref)}`);
    if (request.implementation_version && request.implementation_version !== "1.0") {
      return blocked(`implementation version mismatch: ${request.implementation_version}`);
    }
    const execution = {
      option_version: option.lin_version,
      pi_type: option.pi_type,
      pi_ref: option.pi_ref,
      pi_theta: option.lin_theta,
      implementation_version: request.implementation_version ?? "1.0",
      parser_version: option.pi_ref === "markdown-note@v1" ? MARKDOWN_PARSER_VERSION : option.pi_type === "parse" ? MATERIALS_CSV_PARSER_VERSION : null,
      attempt: request.attempt ?? 1,
      mode: request.mode ?? "real",
      idempotency_key: request.idempotency_key,
    } as const;
    const started = await beginOptionExecution({
      option_event_id: optionEventId,
      planner_event_id: request.planner_event_id,
      option_id: option.option_id,
      model_id: model.model_id,
      execution_json: execution,
    });
    if (started.gate === "blocked") return blocked(started.reason ?? "option execution was rejected");
    await recordOptionObservation({ option_event_id: optionEventId, observation_type: "input", value_json: request.arguments ?? {} });
    const startTime = Date.now();
    const isCsvParse = option.pi_type === "parse" && option.pi_ref === "materials-csv@v1";
    const settleCsv = async (status: OptionOutcomeStatus, output: unknown, cost: unknown) => {
      if (!isCsvParse) return { gate: "pass" as const };
      return recordTransientCsvSettlement({
        option,
        model,
        optionEventId,
        arguments: request.arguments ?? {},
        output,
        status,
        cost,
        execution,
      });
    };
    try {
      const result = await implementation(request.arguments ?? {}, {
        option,
        model,
        signal: request.signal ?? new AbortController().signal,
        idempotencyKey: request.idempotency_key,
        host_context: request.host_context,
      });
      if (isCsvParse && typeof result.output === "object" && result.output !== null && !Array.isArray(result.output)) {
        result.output = { ...result.output, settlement_id: transientSettlementIdFor(optionEventId) };
      }
      if (request.signal?.aborted) throw new DOMException("Execution cancelled", "AbortError");
      const outputError = schemaError(result.output, option.beta_output_schema);
      if (outputError) {
        await recordOptionObservation({ option_event_id: optionEventId, observation_type: "error", value_json: { message: outputError } });
        const cost = { observed: true, duration_ms: Date.now() - startTime, monetary: null };
        const outcome = await finishOptionExecution({
          option_event_id: optionEventId,
          status: "blocked",
          evaluation_json: { scalar_reward: null },
          cost_json: cost,
          error_json: { kind: "output_schema", message: outputError },
        });
        if (outcome.gate === "blocked") return blocked(outcome.reason ?? "could not persist outcome");
        const settlement = await settleCsv("blocked", result.output, cost);
        if (settlement.gate === "blocked") return blocked(`settlement reconciliation required: ${settlement.reason ?? "unknown error"}`);
        return blocked(outputError);
      }
      await recordOptionObservation({ option_event_id: optionEventId, observation_type: "output", value_json: result.output });
      for (const [index, event] of (result.model_events ?? []).entries()) {
        const modelEvent = await recordModelEvent({
          model_event_id: event.model_event_id ?? `model_event_${createHash("sha256").update(`${optionEventId}|${event.event_type}|${index}`).digest("hex")}`,
          model_id: model.model_id,
          event_type: event.event_type,
          payload_json: event.payload_json,
        });
        if (modelEvent.gate === "blocked") throw new Error(modelEvent.reason ?? "could not persist model event");
      }
      const beta = option.beta_success as Record<string, unknown>;
      const output = result.output as Record<string, unknown>;
      const success = beta?.derived && output.justified !== true
        ? false
        : (!output.blocked || (Array.isArray(output.blocked) && output.blocked.length === 0)) && output.lineage_complete !== false;
      const cost = { observed: true, duration_ms: Date.now() - startTime, monetary: null };
      const outcome = await finishOptionExecution({
        option_event_id: optionEventId,
        status: success ? "success" : "failure",
        evaluation_json: { ...result.evaluation, scalar_reward: result.evaluation?.scalar_reward ?? null },
        cost_json: cost,
        error_json: success ? {} : { kind: "beta_success", message: "beta_success was not satisfied" },
      });
      if (outcome.gate === "blocked") return blocked(outcome.reason ?? "could not persist outcome");
      const settlement = await settleCsv(success ? "success" : "failure", result.output, cost);
      if (settlement.gate === "blocked") return blocked(`settlement reconciliation required: ${settlement.reason ?? "unknown error"}`);
      return { ok: success, gate: "pass", status: success ? "success" : "failure", output: result.output, ...base };
    } catch (error) {
      const cancelled = request.signal?.aborted || (error instanceof Error && error.name === "AbortError");
      const message = error instanceof Error ? error.message : String(error);
      await recordOptionObservation({ option_event_id: optionEventId, observation_type: "error", value_json: { message } });
      const cost = { observed: true, duration_ms: Date.now() - startTime, monetary: null };
      const outcome = await finishOptionExecution({
        option_event_id: optionEventId,
        status: cancelled ? "blocked" : "failure",
        evaluation_json: { scalar_reward: null },
        cost_json: cost,
        error_json: { kind: cancelled ? "cancelled" : "implementation_error", message },
      });
      if (outcome.gate === "blocked") return blocked(outcome.reason ?? "could not persist outcome");
      const settlement = await settleCsv(cancelled ? "blocked" : "failure", undefined, cost);
      if (settlement.gate === "blocked") return blocked(`settlement reconciliation required: ${settlement.reason ?? "unknown error"}`);
      return { ok: false, gate: cancelled ? "blocked" : "pass", status: cancelled ? "blocked" : "failure", reason: message, ...base };
    }
  }
}
