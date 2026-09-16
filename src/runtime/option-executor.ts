/**
 * option 执行器（stub）。
 *
 * TODO(后续周): 按设计文档扩展 option 解析与执行。
 */
export interface OptionExecResult {
  ok: boolean;
  detail?: unknown;
}

export class OptionExecutor {
  async execute(
    _option: string,
    _args: Record<string, unknown> = {},
  ): Promise<OptionExecResult> {
    throw new Error("TODO: option 执行器尚未实现（后续周扩展）");
  }
}
