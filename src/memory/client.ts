/**
 * mnestic HTTP 客户端（通用版）。
 *
 * 对接本工作区部署的 CozoScript HTTP 端点（POST /text-query，
 * 自然 JSON 线缆格式，见 server/）。
 * 零框架依赖：仅用全局 fetch（Node >= 18）。
 */
export interface MnesticClientOptions {
  /** 默认 http://127.0.0.1:9070/text-query */
  endpoint?: string;
  /** 未启用鉴权时留空 */
  token?: string;
  timeoutMs?: number;
  /** 测试时注入假的 fetch */
  fetchImpl?: typeof fetch;
}

export interface NamedRows<T = unknown> {
  headers: string[];
  rows: T[][];
  next: unknown;
}

const DEFAULT_ENDPOINT = "http://127.0.0.1:9070/text-query";

export class MnesticClient {
  private readonly opts: MnesticClientOptions;

  constructor(opts: MnesticClientOptions = {}) {
    this.opts = opts;
  }

  get endpoint(): string {
    return this.opts.endpoint ?? DEFAULT_ENDPOINT;
  }

  /** 执行一段 CozoScript，返回自然 JSON 形状的 NamedRows。 */
  async query(
    script: string,
    params: Record<string, unknown> = {},
  ): Promise<NamedRows> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const res = await doFetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.opts.token
          ? { authorization: `Bearer ${this.opts.token}` }
          : {}),
      },
      body: JSON.stringify({ script, params }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 5000),
    });
    const data: any = await res.json();
    if (!res.ok || data?.ok === false) {
      throw new Error(
        `mnestic query failed (${res.status}): ${data?.message ?? "unknown error"}`,
      );
    }
    return data as NamedRows;
  }
}
