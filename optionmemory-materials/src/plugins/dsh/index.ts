/**
 * DSH 插件入口 apply() —— Phase 6 实现，本周仅占位注释。
 *
 * Phase 6 预期形态：
 *
 *   import type { Context } from "cordis";
 *
 *   export function apply(ctx: Context) {
 *     // 1) 从 cordis.patch.yml 读取服务地址 + token，构造 MnesticClient
 *     //    （见 src/memory/client.ts；默认值已指向本工作区 9070 实例）。
 *     // 2) 以 ctx 注册 memory_set / memory_get / memory_query 三个工具，
 *     //    服务层实现见 src/api/memory.ts（与 DSH 工具签名兼容）。
 *     // 3) 工具本体实现放 ./tools/（本周仅占位目录）。
 *   }
 */
export {};
