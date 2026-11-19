/**
 * mnestic HTTP 客户端 —— 连接与 CozoScript 执行封装（含错误处理与超时）。
 *
 * 对接 server/ 适配层的 CozoScript HTTP 端点（POST /text-query，自然 JSON 线缆
 * 格式，详见 docs/mnestic-api-cheatsheet.md §1.2）。
 * 约束：所有 CozoScript 语句在本文件内集中组装；业务层（api/）不拼接字符串。
 * 零框架依赖：仅用全局 fetch（Node >= 20）。
 */
import { FACT_COLUMNS } from "./schema";
import {
  JUSTIFICATION_COLUMNS,
  MODEL_COLUMNS,
  OPTION_COLUMNS,
  PROCEDURAL_KNOWLEDGE_COLUMNS,
  RULE_COLUMNS,
  SUBTASK_COLUMNS,
  type ClosureFact,
  type JustificationRow,
  type ModelRow,
  type OptionRow,
  type PlanTemplateRow,
  type ProceduralKnowledgeRow,
  type RuleRow,
  type SubtaskRow,
} from "./assets";
import {
  MODEL_EVENT_COLUMNS,
  OPTION_EVENT_COLUMNS,
  OPTION_OBSERVATION_COLUMNS,
  OPTION_OUTCOME_COLUMNS,
  PLAN_RUN_COLUMNS,
  PLANNER_COLUMNS,
  PLANNER_DECISION_COLUMNS,
  PLANNER_EVENT_COLUMNS,
  SUBTASK_EVENT_COLUMNS,
  HOST_EVENT_COLUMNS,
  OPTION_INPUT_SCHEMA_COLUMNS,
  MODEL_SPEC_COLUMNS,
  type ModelEventRow,
  type HostEventRow,
  type OptionEventRow,
  type OptionInputSchemaRow,
  type ModelSpecRow,
  type OptionObservationRow,
  type OptionOutcomeRow,
  type PlanRunRow,
  type PlannerDecisionRow,
  type PlannerEventRow,
  type PlannerRow,
  type SubtaskEventRow,
} from "./planner";
import {
  MEMORY_CHUNK_COLUMNS,
  MEMORY_DOCUMENT_COLUMNS,
  MEMORY_RECALL_EVENT_COLUMNS,
  MEMORY_SOURCE_LINK_COLUMNS,
  type MemoryChunkRow,
  type MemoryDocumentRow,
  type MemoryRecallEventRow,
  type MemorySourceLinkRow,
} from "./document-projections";
import {
  RUNTIME_INBOX_COLUMNS,
  RUNTIME_OUTBOX_COLUMNS,
  RUNTIME_SUBTASK_LEASE_COLUMNS,
  type RuntimeInboxRow,
  type RuntimeOutboxRow,
  type RuntimeSubtaskLeaseRow,
} from "./runtime";
import { SIDECAR_EVENT_COLUMNS, type SidecarEventRow } from "./sidecar";

export interface MnesticClientOptions {
  /** 默认 http://127.0.0.1:9070/text-query */
  endpoint?: string;
  /** 未启用鉴权时留空 */
  token?: string;
  /** 默认 5000ms */
  timeoutMs?: number;
  /** 测试时注入假的 fetch */
  fetchImpl?: typeof fetch;
}

export interface NamedRows<T = unknown> {
  headers: string[];
  rows: T[][];
  next: unknown;
}

/** mnestic 侧错误：HTTP 非 2xx、响应 {ok:false}、超时、连接失败。 */
export class MnesticError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "MnesticError";
    this.status = status;
  }
}

const DEFAULT_ENDPOINT = "http://127.0.0.1:9070/text-query";
const DEFAULT_TIMEOUT_MS = 5000;

// ---------- CozoScript 集中组装区（facts 表；列清单见 schema.ts） ----------

const COLS = FACT_COLUMNS.join(", ");
const PARAMS = FACT_COLUMNS.map((c) => `$${c}`).join(", ");
const VALUE_COLS = FACT_COLUMNS.slice(1).join(", ");

/** facts 全列 upsert（:put，key 存在即覆盖）。 */
const PUT_FACT = `?[${COLS}] <- [[${PARAMS}]] :put facts {id => ${VALUE_COLS}}`;

/** facts 批量 upsert：单脚本 = 单事务；行值以 $rows 参数传入（免字符串拼接）。 */
const PUT_FACTS = `?[${COLS}] <- $rows :put facts {id => ${VALUE_COLS}}`;

/** 按 id 取 facts 全列。 */
const GET_FACT_BY_ID = `?[${COLS}] := *facts{${COLS}}, id == $id`;

/** 幂等键集：(predicate, args) 全列对。默认含全部状态，闭包重推可只取在信事实。 */
const EXISTING_KEYS = `?[predicate, args, id] := *facts{predicate, args, id}`;
const EXISTING_ACTIVE_KEYS = `?[predicate, args, id] := *facts{predicate, args, id, status}, status == "in"`;

const ACTIVE_RULES = `?[${RULE_COLUMNS.join(", ")}] := *rules{${RULE_COLUMNS.join(", ")}}, status == "in"`;
const ACTIVE_CLOSURE_FACTS = `?[id, predicate, args, layer] := *facts{id, predicate, args, layer, status}, status == "in"`;
const ALL_FACTS = `?[id, predicate, args, layer, status] := *facts{id, predicate, args, layer, status}`;
const ALL_FACT_ROWS = `?[${COLS}] := *facts{${COLS}}`;
const ALL_JUSTIFICATIONS = `?[${JUSTIFICATION_COLUMNS.join(", ")}] := *justifications{${JUSTIFICATION_COLUMNS.join(", ")}}`;
const ALL_OPTIONS = `?[${OPTION_COLUMNS.join(", ")}] := *options{${OPTION_COLUMNS.join(", ")}}`;
const COUNT_REVISION = `?[count(id)] := *facts{id, predicate, args}, predicate == "revision", first(args) == $id`;
const GET_OPTION_BY_ID = `?[${OPTION_COLUMNS.join(", ")}] := *options{${OPTION_COLUMNS.join(", ")}}, option_id == $id`;
const GET_MODEL_BY_ID = `?[${MODEL_COLUMNS.join(", ")}] := *models{${MODEL_COLUMNS.join(", ")}}, model_id == $id`;
const GET_PROCEDURAL_BY_OPTION = `?[${PROCEDURAL_KNOWLEDGE_COLUMNS.join(", ")}] := *procedural_knowledge{${PROCEDURAL_KNOWLEDGE_COLUMNS.join(", ")}}, o_id == $id`;

/** putFact 的行形：键为 facts 列名（snake_case），全列必填。 */
export type FactRow = Record<(typeof FACT_COLUMNS)[number], unknown>;

export class MnesticClient {
  private readonly opts: MnesticClientOptions;

  constructor(opts: MnesticClientOptions = {}) {
    this.opts = opts;
  }

  get endpoint(): string {
    return this.opts.endpoint ?? DEFAULT_ENDPOINT;
  }

  /** 执行一段 CozoScript，返回自然 JSON 形状的 NamedRows。 */
  async execute(
    script: string,
    params: Record<string, unknown> = {},
  ): Promise<NamedRows> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let res: Response;
    try {
      res = await doFetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.opts.token
            ? { authorization: `Bearer ${this.opts.token}` }
            : {}),
        },
        body: JSON.stringify({ script, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const err = e as Error;
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new MnesticError(`mnestic request timed out after ${timeoutMs}ms`);
      }
      throw new MnesticError(`mnestic request failed: ${err?.message ?? e}`);
    }
    const data: any = await res.json().catch(() => null);
    if (!res.ok) {
      throw new MnesticError(
        `mnestic HTTP ${res.status}: ${data?.message ?? "unknown error"}`,
        res.status,
      );
    }
    if (data?.ok === false) {
      throw new MnesticError(
        `mnestic query failed: ${data?.message ?? "unknown error"}`,
      );
    }
    return data as NamedRows;
  }

  /** upsert 一行 facts（脚本见本文件 PUT_FACT）。 */
  async putFact(row: FactRow): Promise<void> {
    await this.execute(PUT_FACT, row);
  }

  /** 单事务 upsert 多行 facts（脚本见本文件 PUT_FACTS；空数组直接返回）。 */
  async putFacts(rows: FactRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.execute(PUT_FACTS, {
      rows: rows.map((r) => FACT_COLUMNS.map((c) => r[c])),
    });
  }

  /** 存量 (predicate, args) → id 键集；activeOnly=true 时排除 out/archived。 */
  async existingKeys(activeOnly = false): Promise<Map<string, string>> {
    const res = await this.execute(activeOnly ? EXISTING_ACTIVE_KEYS : EXISTING_KEYS);
    return new Map(
      res.rows.map((r) => [JSON.stringify([r[0], r[1]]), String(r[2])]),
    );
  }

  /** 按 id 查询 facts 全列，返回原始 NamedRows（0 或 1 行）。 */
  async getFactById(id: string): Promise<NamedRows> {
    return this.execute(GET_FACT_BY_ID, { id });
  }

  async countRevision(targetId: string, action: "retract" | "restore", rootId: string): Promise<number> {
    const res = await this.execute(COUNT_REVISION, { id: targetId, action, rootId });
    return Number(res.rows[0][0]);
  }

  private async putAssetRows(
    table: string,
    key: string,
    columns: readonly string[],
    rows: object[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const cols = columns.join(", ");
    const valueCols = columns.slice(1).join(", ");
    const script = `?[${cols}] <- $rows :put ${table} {${key} => ${valueCols}}`;
    await this.execute(script, {
      rows: rows.map((row) =>
        columns.map((column) => (row as Record<string, unknown>)[column]),
      ),
    });
  }

  async putRule(row: RuleRow): Promise<void> {
    await this.putAssetRows("rules", "rule_id", RULE_COLUMNS, [row]);
  }

  async putRules(rows: RuleRow[]): Promise<void> {
    await this.putAssetRows("rules", "rule_id", RULE_COLUMNS, rows);
  }

  async putJustification(row: JustificationRow): Promise<void> {
    await this.putJustifications([row]);
  }

  async putJustifications(rows: JustificationRow[]): Promise<void> {
    await this.putAssetRows("justifications", "id", JUSTIFICATION_COLUMNS, rows);
  }

  async putOption(row: OptionRow): Promise<void> {
    await this.putAssetRows("options", "option_id", OPTION_COLUMNS, [{ ...row, input_schema: row.input_schema ?? null }]);
  }

  async listOptions(): Promise<OptionRow[]> {
    const res = await this.execute(ALL_OPTIONS);
    return res.rows.map((row) =>
      Object.fromEntries(res.headers.map((header, i) => [header, row[i]])),
    ) as unknown as OptionRow[];
  }

  async putSubtask(row: SubtaskRow): Promise<void> {
    await this.putAssetRows("subtasks", "subtask_id", SUBTASK_COLUMNS, [row]);
  }

  async getSubtaskById(id: string): Promise<NamedRows> {
    return this.getAssetById("subtasks", "subtask_id", SUBTASK_COLUMNS, id);
  }

  async putModel(row: ModelRow): Promise<void> {
    await this.putAssetRows("models", "model_id", MODEL_COLUMNS, [{
      ...row,
      reasoning_spec: row.reasoning_spec ?? null,
      evidence_spec: row.evidence_spec ?? null,
      evaluation_spec: row.evaluation_spec ?? null,
    }]);
  }

  async getModelById(modelId: string): Promise<NamedRows> {
    return this.execute(GET_MODEL_BY_ID, { id: modelId });
  }

  async getOptionById(optionId: string): Promise<NamedRows> {
    return this.execute(GET_OPTION_BY_ID, { id: optionId });
  }

  async getProceduralKnowledgeByOptionId(optionId: string): Promise<NamedRows> {
    return this.execute(GET_PROCEDURAL_BY_OPTION, { id: optionId });
  }

  async putProceduralKnowledge(row: ProceduralKnowledgeRow): Promise<void> {
    await this.putAssetRows("procedural_knowledge", "id", PROCEDURAL_KNOWLEDGE_COLUMNS, [row]);
  }

  async putPlanTemplate(_row: PlanTemplateRow): Promise<void> {
    throw new MnesticError("plan_templates registration is reserved and disabled in the MVP");
  }

  private async getAssetById(
    table: string,
    key: string,
    columns: readonly string[],
    id: string,
  ): Promise<NamedRows> {
    const cols = columns.join(", ");
    return this.execute(`?[${cols}] := *${table}{${cols}}, ${key} == $id`, { id });
  }

  private async listAssetByField(
    table: string,
    columns: readonly string[],
    field: string,
    value: string,
  ): Promise<NamedRows> {
    const cols = columns.join(", ");
    return this.execute(`?[${cols}] := *${table}{${cols}}, ${field} == $value`, { value });
  }

  async putPlanner(row: PlannerRow): Promise<void> {
    await this.putAssetRows("planners", "planner_id", PLANNER_COLUMNS, [row]);
  }

  async getPlannerById(id: string): Promise<NamedRows> {
    return this.getAssetById("planners", "planner_id", PLANNER_COLUMNS, id);
  }

  async putPlanRun(row: PlanRunRow): Promise<void> {
    await this.putAssetRows("plan_runs", "plan_run_id", PLAN_RUN_COLUMNS, [row]);
  }

  async getPlanRunById(id: string): Promise<NamedRows> {
    return this.getAssetById("plan_runs", "plan_run_id", PLAN_RUN_COLUMNS, id);
  }

  async putSubtaskEvent(row: SubtaskEventRow): Promise<void> {
    await this.putAssetRows("subtask_event", "subtask_event_id", SUBTASK_EVENT_COLUMNS, [row]);
  }

  async getSubtaskEventById(id: string): Promise<NamedRows> {
    return this.getAssetById("subtask_event", "subtask_event_id", SUBTASK_EVENT_COLUMNS, id);
  }

  async putPlannerEvent(row: PlannerEventRow): Promise<void> {
    await this.putAssetRows("planner_event", "planner_event_id", PLANNER_EVENT_COLUMNS, [row]);
  }

  async getPlannerEventById(id: string): Promise<NamedRows> {
    return this.getAssetById("planner_event", "planner_event_id", PLANNER_EVENT_COLUMNS, id);
  }

  async listPlannerEventsBySubtaskId(id: string): Promise<NamedRows> {
    return this.listAssetByField("planner_event", PLANNER_EVENT_COLUMNS, "subtask_event_id", id);
  }

  async putPlannerDecision(row: PlannerDecisionRow): Promise<void> {
    await this.putAssetRows("planner_event_decision", "planner_event_id", PLANNER_DECISION_COLUMNS, [row]);
  }

  async getPlannerDecisionByEventId(id: string): Promise<NamedRows> {
    return this.getAssetById("planner_event_decision", "planner_event_id", PLANNER_DECISION_COLUMNS, id);
  }

  async putOptionEvent(row: OptionEventRow): Promise<void> {
    await this.putAssetRows("option_event", "option_event_id", OPTION_EVENT_COLUMNS, [row]);
  }

  async getOptionEventById(id: string): Promise<NamedRows> {
    return this.getAssetById("option_event", "option_event_id", OPTION_EVENT_COLUMNS, id);
  }

  async listOptionEventsByOptionId(id: string): Promise<NamedRows> {
    return this.listAssetByField("option_event", OPTION_EVENT_COLUMNS, "option_id", id);
  }

  async listOptionEventsByPlannerEventId(id: string): Promise<NamedRows> {
    return this.listAssetByField("option_event", OPTION_EVENT_COLUMNS, "planner_event_id", id);
  }

  async putOptionObservation(row: OptionObservationRow): Promise<void> {
    await this.putAssetRows("option_event_observation", "observation_event_id", OPTION_OBSERVATION_COLUMNS, [row]);
  }

  async getOptionObservationById(id: string): Promise<NamedRows> {
    return this.getAssetById("option_event_observation", "observation_event_id", OPTION_OBSERVATION_COLUMNS, id);
  }

  async listOptionObservationsByOptionEventId(id: string): Promise<NamedRows> {
    return this.listAssetByField("option_event_observation", OPTION_OBSERVATION_COLUMNS, "option_event_id", id);
  }

  async putOptionOutcome(row: OptionOutcomeRow): Promise<void> {
    await this.putAssetRows("option_event_outcome", "option_event_id", OPTION_OUTCOME_COLUMNS, [row]);
  }

  async getOptionOutcomeByOptionEventId(id: string): Promise<NamedRows> {
    return this.getAssetById("option_event_outcome", "option_event_id", OPTION_OUTCOME_COLUMNS, id);
  }

  async putModelEvent(row: ModelEventRow): Promise<void> {
    await this.putAssetRows("model_event", "model_event_id", MODEL_EVENT_COLUMNS, [row]);
  }

  async getModelEventById(id: string): Promise<NamedRows> {
    return this.getAssetById("model_event", "model_event_id", MODEL_EVENT_COLUMNS, id);
  }

  async listModelEventsByModelId(id: string): Promise<NamedRows> {
    return this.listAssetByField("model_event", MODEL_EVENT_COLUMNS, "model_id", id);
  }

  async putOptionInputSchema(row: OptionInputSchemaRow): Promise<void> {
    await this.putAssetRows("option_input_schemas", "option_id", OPTION_INPUT_SCHEMA_COLUMNS, [row]);
  }

  async getOptionInputSchemaById(id: string): Promise<NamedRows> {
    return this.getAssetById("option_input_schemas", "option_id", OPTION_INPUT_SCHEMA_COLUMNS, id);
  }

  async putModelSpecs(row: ModelSpecRow): Promise<void> {
    await this.putAssetRows("model_specs", "model_id", MODEL_SPEC_COLUMNS, [row]);
  }

  async getModelSpecsById(id: string): Promise<NamedRows> {
    return this.getAssetById("model_specs", "model_id", MODEL_SPEC_COLUMNS, id);
  }

  async putHostEvent(row: HostEventRow): Promise<void> {
    await this.putAssetRows("host_event", "host_event_id", HOST_EVENT_COLUMNS, [row]);
  }

  async getHostEventById(id: string): Promise<NamedRows> {
    return this.getAssetById("host_event", "host_event_id", HOST_EVENT_COLUMNS, id);
  }

  async listHostEventsByPlanRunId(id: string): Promise<NamedRows> {
    return this.listAssetByField("host_event", HOST_EVENT_COLUMNS, "plan_run_id", id);
  }

  async putSidecarEvent(row: SidecarEventRow): Promise<void> {
    await this.putAssetRows("sidecar_event", "sidecar_event_id", SIDECAR_EVENT_COLUMNS, [row]);
  }

  async getSidecarEventById(id: string): Promise<NamedRows> {
    return this.getAssetById("sidecar_event", "sidecar_event_id", SIDECAR_EVENT_COLUMNS, id);
  }

  async listSidecarEventsByBaselineId(id: string): Promise<NamedRows> {
    return this.listAssetByField("sidecar_event", SIDECAR_EVENT_COLUMNS, "baseline_id", id);
  }

  async listSidecarEventsByRunId(id: string): Promise<NamedRows> {
    return this.listAssetByField("sidecar_event", SIDECAR_EVENT_COLUMNS, "run_id", id);
  }

  async putMemoryDocument(row: MemoryDocumentRow): Promise<void> {
    await this.putAssetRows("memory_documents", "document_id", MEMORY_DOCUMENT_COLUMNS, [row]);
  }

  async getMemoryDocumentById(id: string): Promise<NamedRows> {
    return this.getAssetById("memory_documents", "document_id", MEMORY_DOCUMENT_COLUMNS, id);
  }

  async listMemoryDocuments(): Promise<NamedRows> {
    return this.execute(`?[${MEMORY_DOCUMENT_COLUMNS.join(", ")}] := *memory_documents{${MEMORY_DOCUMENT_COLUMNS.join(", ")}}`);
  }

  async putMemoryChunk(row: MemoryChunkRow): Promise<void> {
    await this.putAssetRows("memory_chunks", "chunk_version_id", MEMORY_CHUNK_COLUMNS, [row]);
  }

  async getMemoryChunkVersionById(id: string): Promise<NamedRows> {
    return this.getAssetById("memory_chunks", "chunk_version_id", MEMORY_CHUNK_COLUMNS, id);
  }

  async listMemoryChunksByDocumentId(id: string): Promise<NamedRows> {
    return this.listAssetByField("memory_chunks", MEMORY_CHUNK_COLUMNS, "document_id", id);
  }

  async listMemoryChunks(): Promise<NamedRows> {
    return this.execute(`?[${MEMORY_CHUNK_COLUMNS.join(", ")}] := *memory_chunks{${MEMORY_CHUNK_COLUMNS.join(", ")}}`);
  }

  async putMemorySourceLink(row: MemorySourceLinkRow): Promise<void> {
    await this.putAssetRows("memory_source_links", "link_id", MEMORY_SOURCE_LINK_COLUMNS, [row]);
  }

  async listMemorySourceLinksByFactId(id: string): Promise<NamedRows> {
    return this.listAssetByField("memory_source_links", MEMORY_SOURCE_LINK_COLUMNS, "fact_id", id);
  }

  async putMemoryRecallEvent(row: MemoryRecallEventRow): Promise<void> {
    await this.putAssetRows("memory_recall_events", "recall_id", MEMORY_RECALL_EVENT_COLUMNS, [row]);
  }

  async getMemoryRecallEventById(id: string): Promise<NamedRows> {
    return this.getAssetById("memory_recall_events", "recall_id", MEMORY_RECALL_EVENT_COLUMNS, id);
  }

  async listMemoryRecallEvents(): Promise<NamedRows> {
    return this.execute(`?[${MEMORY_RECALL_EVENT_COLUMNS.join(", ")}] := *memory_recall_events{${MEMORY_RECALL_EVENT_COLUMNS.join(", ")}}`);
  }

  async putRuntimeDecision(decision: PlannerDecisionRow, outbox: RuntimeOutboxRow): Promise<void> {
    const decisionScript = `?[planner_event_id, decision_type, decision_json, created_at] <- $decision :put planner_event_decision {planner_event_id => decision_type, decision_json, created_at}`;
    const outboxScript = `?[${RUNTIME_OUTBOX_COLUMNS.join(", ")}] <- $outbox :put runtime_outbox {decision_id => ${RUNTIME_OUTBOX_COLUMNS.slice(1).join(", ")}}`;
    await this.execute(`{${decisionScript};}\n{${outboxScript};}`, {
      decision: [[decision.planner_event_id, decision.decision_type, decision.decision_json, decision.created_at]],
      outbox: [RUNTIME_OUTBOX_COLUMNS.map((column) => outbox[column])],
    });
  }

  async putRuntimeInbox(row: RuntimeInboxRow): Promise<void> {
    await this.putAssetRows("runtime_inbox", "event_id", RUNTIME_INBOX_COLUMNS, [row]);
  }

  async getRuntimeInboxById(id: string): Promise<NamedRows> {
    return this.getAssetById("runtime_inbox", "event_id", RUNTIME_INBOX_COLUMNS, id);
  }

  async listRuntimeInbox(): Promise<NamedRows> {
    return this.execute(`?[${RUNTIME_INBOX_COLUMNS.join(", ")}] := *runtime_inbox{${RUNTIME_INBOX_COLUMNS.join(", ")}}`);
  }

  async leaseRuntimeInbox(id: string, owner: string, now: number, expiresAt: number): Promise<NamedRows> {
    const columns = RUNTIME_INBOX_COLUMNS.join(", ");
    const nonKeyColumns = RUNTIME_INBOX_COLUMNS.slice(1).join(", ");
    const current = await this.getRuntimeInboxById(id);
    if (!current.rows.length) return { ...current, rows: [] };
    const row = Object.fromEntries(current.headers.map((header, index) => [header, current.rows[0][index]])) as unknown as RuntimeInboxRow;
    row.status = "leased";
    row.attempts += 1;
    row.lease_owner = owner;
    row.lease_expires_at = expiresAt;
    row.updated_at = now;
    try {
      await this.execute(
        `{?[${columns}] := *runtime_inbox{${columns}}, event_id == $id, status == "leased", (lease_expires_at ~ 0.0) >= $now :ensure_not runtime_inbox {event_id => ${nonKeyColumns}};}\n{?[${columns}] <- $row :put runtime_inbox {event_id => ${nonKeyColumns}};}`,
        { id, now, row: [RUNTIME_INBOX_COLUMNS.map((column) => row[column])] },
      );
    } catch {
      return { headers: [], rows: [], next: null };
    }
    const result = await this.getRuntimeInboxById(id);
    const ownerIndex = result.headers.indexOf("lease_owner");
    return { ...result, rows: result.rows.filter((row) => row[ownerIndex] === owner) };
  }

  async putRuntimeOutbox(row: RuntimeOutboxRow): Promise<void> {
    await this.putAssetRows("runtime_outbox", "decision_id", RUNTIME_OUTBOX_COLUMNS, [row]);
  }

  async getRuntimeOutboxById(id: string): Promise<NamedRows> {
    return this.getAssetById("runtime_outbox", "decision_id", RUNTIME_OUTBOX_COLUMNS, id);
  }

  async listRuntimeOutbox(): Promise<NamedRows> {
    return this.execute(`?[${RUNTIME_OUTBOX_COLUMNS.join(", ")}] := *runtime_outbox{${RUNTIME_OUTBOX_COLUMNS.join(", ")}}`);
  }

  async leaseRuntimeOutbox(id: string, owner: string, now: number, expiresAt: number): Promise<NamedRows> {
    const columns = RUNTIME_OUTBOX_COLUMNS.join(", ");
    const nonKeyColumns = RUNTIME_OUTBOX_COLUMNS.slice(1).join(", ");
    const current = await this.getRuntimeOutboxById(id);
    if (!current.rows.length) return { ...current, rows: [] };
    const row = Object.fromEntries(current.headers.map((header, index) => [header, current.rows[0][index]])) as unknown as RuntimeOutboxRow;
    row.status = "leased";
    row.attempts += 1;
    row.lease_owner = owner;
    row.lease_expires_at = expiresAt;
    row.updated_at = now;
    try {
      await this.execute(
        `{?[${columns}] := *runtime_outbox{${columns}}, decision_id == $id, status == "leased", (lease_expires_at ~ 0.0) >= $now :ensure_not runtime_outbox {decision_id => ${nonKeyColumns}};}\n{?[${columns}] <- $row :put runtime_outbox {decision_id => ${nonKeyColumns}};}`,
        { id, now, row: [RUNTIME_OUTBOX_COLUMNS.map((column) => row[column])] },
      );
    } catch {
      return { headers: [], rows: [], next: null };
    }
    const result = await this.getRuntimeOutboxById(id);
    const ownerIndex = result.headers.indexOf("lease_owner");
    return { ...result, rows: result.rows.filter((row) => row[ownerIndex] === owner) };
  }

  async getRuntimeSubtaskLease(id: string): Promise<NamedRows> {
    return this.getAssetById("runtime_subtask_lease", "subtask_event_id", RUNTIME_SUBTASK_LEASE_COLUMNS, id);
  }

  async leaseRuntimeSubtask(id: string, owner: string, now: number, expiresAt: number): Promise<NamedRows> {
    const columns = RUNTIME_SUBTASK_LEASE_COLUMNS.join(", ");
    const nonKeyColumns = RUNTIME_SUBTASK_LEASE_COLUMNS.slice(1).join(", ");
    try {
      await this.execute(
        `{?[${columns}] := *runtime_subtask_lease{${columns}}, subtask_event_id == $id, lease_expires_at >= $now :ensure_not runtime_subtask_lease {subtask_event_id => ${nonKeyColumns}};}\n{?[${columns}] <- $row :put runtime_subtask_lease {subtask_event_id => lease_owner, lease_expires_at, updated_at};}`,
        { id, now, row: [[id, owner, expiresAt, now]] },
      );
    } catch {
      return { headers: [], rows: [], next: null };
    }
    const result = await this.getRuntimeSubtaskLease(id);
    const ownerIndex = result.headers.indexOf("lease_owner");
    return { ...result, rows: result.rows.filter((row) => row[ownerIndex] === owner) };
  }

  async putRuntimeSubtaskLease(row: RuntimeSubtaskLeaseRow): Promise<void> {
    await this.putAssetRows("runtime_subtask_lease", "subtask_event_id", RUNTIME_SUBTASK_LEASE_COLUMNS, [row]);
  }

  async listActiveRules(): Promise<RuleRow[]> {
    const res = await this.execute(ACTIVE_RULES);
    return res.rows.map((row) =>
      Object.fromEntries(res.headers.map((header, i) => [header, row[i]])),
    ) as unknown as RuleRow[];
  }

  async listActiveClosureFacts(): Promise<ClosureFact[]> {
    const res = await this.execute(ACTIVE_CLOSURE_FACTS);
    return res.rows.map((row) => ({
      id: String(row[0]),
      predicate: String(row[1]),
      args: row[2] as string[],
      layer: String(row[3]),
    }));
  }

  async listAllFactRows(): Promise<FactRow[]> {
    const res = await this.execute(ALL_FACT_ROWS);
    return res.rows.map((row) =>
      Object.fromEntries(res.headers.map((header, i) => [header, row[i]])),
    ) as FactRow[];
  }

  async listAllFacts(): Promise<Array<ClosureFact & { status: string }>> {
    const res = await this.execute(ALL_FACTS);
    return res.rows.map((row) => ({
      id: String(row[0]),
      predicate: String(row[1]),
      args: row[2] as string[],
      layer: String(row[3]),
      status: String(row[4]),
    }));
  }

  async listJustifications(): Promise<JustificationRow[]> {
    const res = await this.execute(ALL_JUSTIFICATIONS);
    return res.rows.map((row) =>
      Object.fromEntries(res.headers.map((header, i) => [header, row[i]])),
    ) as unknown as JustificationRow[];
  }
}
