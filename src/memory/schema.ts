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
 * status 列合法取值 —— 与手册 §2.1 表 1 对齐的四值（决策与证据链见 docs/decisions/0002，
 * 取代 0001 的 in/out/retracted 三值）：
 *   in        = 在信（当前持有；唯一初始态；导入/推导产生）
 *   out       = 失信（人工撤下与传播失信同值：memory_retract 标 out、原因入 ≺ 血缘记录
 *               —— 路线图 Phase 2 验收场景；restoreFact 显式恢复回 in）
 *   contested = 悬置（ν-gate 冲突隔离：冲突双方同置，派生锥暂停，待 settlement 裁决
 *               —— 路线图 Phase 3）
 *   archived  = 退役留档（archive ≠ erase，可查询不参与推导；生命周期退役，如数据集版本更替）
 * 「因故撤下」不设独立值：由 out + ≺ 操作记录承担（谁提议/谁执行/时间戳）；
 * 防复活由结构承担（前提无可塌辩护、restoreFact 仅显式、推导复活由 rules.status 与
 * justifications.active 边层控制）。models 表的 retracted 属该表词表，与本表无关。
 */
export const FACT_STATUSES = ["in", "out", "archived", "contested"] as const;

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
  /** 缺省 "in"；合法取值见 FACT_STATUSES（状态机见该常量注释），非法值被拒。 */
  status?: FactStatus;
  /** 1024 维向量，可空。 */
  embedding?: number[] | null;
}
