/**
 * ν 门（stub）。
 *
 * TODO(后续周): 按设计文档实现 ν 判定（写入/检索前的门控逻辑）。
 */
export interface NuGateInput {
  layer?: string;
  content?: string;
  [key: string]: unknown;
}

/** stub：一律放行。 */
export function nuGate(_input: NuGateInput): boolean {
  return true;
}
