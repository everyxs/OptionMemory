/**
 * 五层记忆 schema（通用版 memory/ 映射）。
 *
 * 占位定义：层名取自经典认知划分，最终以设计文档为准（TODO）。
 * 与 schema/memory.cozo 中的 CozoScript 关系一一对应（relationName）。
 * 核心逻辑零框架依赖 —— 本文件只允许出现类型与常量。
 */
export const MEMORY_LAYERS = [
  "working",
  "episodic",
  "semantic",
  "procedural",
  "meta",
] as const;

export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

/** 层 → mnestic 关系名（建表脚本见 schema/memory.cozo）。 */
export const LAYER_RELATIONS: Record<MemoryLayer, string> = {
  working: "mem_working",
  episodic: "mem_episodic",
  semantic: "mem_semantic",
  procedural: "mem_procedural",
  meta: "mem_meta",
};

/** 一条记忆记录的最小形状（bitemporal 列随 Week 2 设计补全）。 */
export interface MemoryRecord {
  id: string;
  layer: MemoryLayer;
  text: string;
  attrs?: Record<string, unknown>;
}
