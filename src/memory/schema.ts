/**
 * 记忆 schema —— 与实际部署的 mnestic 关系对齐。
 *
 * 物理表（共 7 张）以 schema/01_facts.cozo … 07_procedural_knowledge.cozo 为准，
 * 由 schema/apply_all.sh 应用到实例。
 * 「层」不是独立关系，而是行级标签：facts / rules 的 layer 列按行取值；
 * options / models / procedural_knowledge 的 layer 列固定为 "option" / "model" / "procedural"。
 * 核心逻辑零框架依赖 —— 本文件只允许出现类型与常量。
 */
export const MEMORY_LAYERS = [
  "working",
  "episodic",
  "semantic",
  "procedural",
  "meta",
] as const;

/** 占位定义：层名取自经典认知划分，最终以设计文档为准（TODO）。 */
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

/** 实际部署的 7 张 mnestic 关系（建表脚本见 schema/01..07_*.cozo）。 */
export const MEMORY_RELATIONS = [
  "facts",
  "rules",
  "justifications",
  "subtasks",
  "options",
  "models",
  "procedural_knowledge",
] as const;

export type MemoryRelation = (typeof MEMORY_RELATIONS)[number];

/** facts 表全列，顺序与 schema/01_facts.cozo 一致（首列 id 为 key）。 */
export const FACT_COLUMNS = [
  "id",
  "predicate",
  "args",
  "claim",
  "layer",
  "j_premise_ids",
  "j_rule_id",
  "eps_type",
  "eps_value",
  "eps_source",
  "lin_source",
  "lin_version",
  "lin_theta",
  "lin_actor",
  "verify",
  "status",
  "embedding",
  "created_at",
  "updated_at",
] as const;

export type FactColumn = (typeof FACT_COLUMNS)[number];

/**
 * status 列合法取值（暂定集，设计文档确认前以此为准）。
 * active = 在信；retracted = 已撤下。
 */
export const FACT_STATUSES = ["active", "retracted"] as const;

export type FactStatus = (typeof FACT_STATUSES)[number];

/** facts 表一行的 TS 形状（snake_case 列 → camelCase 字段）。 */
export interface Fact {
  id: string;
  predicate: string;
  args: string[];
  claim: string;
  layer: string;
  jPremiseIds: string[];
  jRuleId: string | null;
  epsType: string;
  epsValue: number;
  epsSource: string;
  linSource: string;
  linVersion: string;
  linTheta: string | null;
  linActor: string;
  verify: string;
  status: string;
  /** 1024 维向量，可空。 */
  embedding: number[] | null;
  /** Unix 秒。 */
  createdAt: number;
  /** Unix 秒。 */
  updatedAt: number;
}

/**
 * memory_set 的写入输入。
 * 六元组（claim / layer / J系 / ε系 / lin系 / verify）与 predicate 必填，
 * 由 ν 门 checkCompleteness() 运行时校验；id / createdAt / updatedAt 由服务层生成。
 */
export interface FactInput {
  predicate: string;
  claim: string;
  layer: string;
  jPremiseIds: string[];
  epsType: string;
  epsValue: number;
  epsSource: string;
  linSource: string;
  linVersion: string;
  linActor: string;
  verify: string;
  args?: string[];
  jRuleId?: string | null;
  linTheta?: string | null;
  /** 缺省 "active"；合法取值见 FACT_STATUSES，非法值被拒。 */
  status?: FactStatus;
  /** 1024 维向量，可空。 */
  embedding?: number[] | null;
}
