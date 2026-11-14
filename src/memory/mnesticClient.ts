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
    await this.putAssetRows("options", "option_id", OPTION_COLUMNS, [row]);
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

  async putModel(row: ModelRow): Promise<void> {
    await this.putAssetRows("models", "model_id", MODEL_COLUMNS, [row]);
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
