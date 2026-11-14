/**
 * DSH 插件入口 apply() —— Phase 3 首版实现，当前仅占位注释。
 *
 * Phase 3 v0.1.0 预期形态：
 *
 *   import type { Context } from "cordis";
 *
 *   export function apply(ctx: Context) {
 *     // 1) 从 cordis.patch.yml 读取服务地址 + token，构造 MnesticClient
 *     //    （见 src/memory/mnesticClient.ts；默认值已指向本工作区 9070 实例）。
 *     // 2) 以 ctx 注册首版 7 工具：memory_set/get/query/retract +
 *     //    propose_option/settle/revoke；不提前注册后续 Phase 工具。
 *     // 3) 工具本体实现放 ./tools/，仅调用核心服务层，不复制业务逻辑。
 *   }
 */
export {};
