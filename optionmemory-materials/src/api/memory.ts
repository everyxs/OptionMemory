/**
 * memory_set / memory_get / memory_query 服务层。
 *
 * 函数签名与 DSH 工具签名兼容；本体待 Phase 计划填充。
 * 实现只依赖 src/memory/（MnesticClient + 五层 schema），不依赖 cordis。
 */
import type { MnesticClient } from "../memory/client";
import type { MemoryLayer } from "../memory/schema";

export interface MemorySetArgs {
  layer?: MemoryLayer;
  key: string;
  value: unknown;
}

export interface MemoryGetArgs {
  layer?: MemoryLayer;
  key: string;
}

export interface MemoryQueryArgs {
  layer?: MemoryLayer;
  script?: string;
  params?: Record<string, unknown>;
}

export async function memorySet(
  _client: MnesticClient,
  _args: MemorySetArgs,
): Promise<unknown> {
  throw new Error("TODO: memorySet 尚未实现");
}

export async function memoryGet(
  _client: MnesticClient,
  _args: MemoryGetArgs,
): Promise<unknown> {
  throw new Error("TODO: memoryGet 尚未实现");
}

export async function memoryQuery(
  _client: MnesticClient,
  _args: MemoryQueryArgs,
): Promise<unknown> {
  throw new Error("TODO: memoryQuery 尚未实现");
}
