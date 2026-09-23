/**
 * mnestic HTTP 客户端 —— 连接与 CozoScript 执行封装（含错误处理与超时）。
 *
 * 对接 server/ 适配层的 CozoScript HTTP 端点（POST /text-query，自然 JSON 线缆
 * 格式，详见 docs/mnestic-api-cheatsheet.md §1.2）。
 * 约束：所有 CozoScript 语句在本文件内集中组装；业务层（api/）不拼接字符串。
 * 零框架依赖：仅用全局 fetch（Node >= 20）。
 */
import { FACT_COLUMNS } from "./schema";

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

/** 按 id 取 facts 全列。 */
const GET_FACT_BY_ID = `?[${COLS}] := *facts{${COLS}}, id == $id`;

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

  /** 按 id 查询 facts 全列，返回原始 NamedRows（0 或 1 行）。 */
  async getFactById(id: string): Promise<NamedRows> {
    return this.execute(GET_FACT_BY_ID, { id });
  }
}
