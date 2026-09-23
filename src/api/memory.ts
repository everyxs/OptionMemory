/**
 * memory_set / memory_get / memory_query —— 接口契约 §3.1（确定值）。
 *
 *   memory_set(fact: FactInput): Promise<{ id, gate: "pass" | "blocked", reason? }>
 *   memory_get(id: string):      Promise<Fact | null>
 *   memory_query(datalog):       Promise<Fact[]>
 *
 * memory_set 必须先过 ν 门（checkCompleteness → requentialCheck），
 * 再校验 status 取值；任一不通过即 blocked，不落库。
 * CozoScript 全部由 MnesticClient 集中组装，本层不拼接字符串。
 *
 * 默认客户端指向 cordis.patch.yml 的本地实例（127.0.0.1:9070）；
 * 插件入口或测试用 setMemoryClient() 注入配置过的客户端。
 */
import { randomUUID } from "node:crypto";
import { MnesticClient } from "../memory/mnesticClient";
import {
  FACT_STATUSES,
  type Fact,
  type FactInput,
} from "../memory/schema";
import { checkCompleteness, requentialCheck } from "../runtime/nuGate";

let client: MnesticClient = new MnesticClient();

/** 注入配置过的客户端（Phase 6 插件入口 / 测试用）。 */
export function setMemoryClient(c: MnesticClient): void {
  client = c;
}

export interface MemorySetResult {
  id: string;
  gate: "pass" | "blocked";
  reason?: string;
}

export async function memory_set(fact: FactInput): Promise<MemorySetResult> {
  const id = randomUUID();

  // ν 门：六元组完整性 → requential 账（占位）；blocked 不落库。
  const completeness = checkCompleteness(fact);
  if (completeness.gate === "blocked") return { id, ...completeness };
  const requential = requentialCheck(fact);
  if (requential.gate === "blocked") return { id, ...requential };

  // status 取值校验（非法值同样 blocked、不落库）。
  const status = fact.status ?? "active";
  if (!(FACT_STATUSES as readonly string[]).includes(status)) {
    return {
      id,
      gate: "blocked",
      reason: `invalid status: ${JSON.stringify(status)} (allowed: ${FACT_STATUSES.join(", ")})`,
    };
  }

  const now = Date.now() / 1000;
  await client.putFact({
    id,
    predicate: fact.predicate,
    args: fact.args ?? [],
    claim: fact.claim,
    layer: fact.layer,
    j_premise_ids: fact.jPremiseIds,
    j_rule_id: fact.jRuleId ?? null,
    eps_type: fact.epsType,
    eps_value: fact.epsValue,
    eps_source: fact.epsSource,
    lin_source: fact.linSource,
    lin_version: fact.linVersion,
    lin_theta: fact.linTheta ?? null,
    lin_actor: fact.linActor,
    verify: fact.verify,
    status,
    embedding: fact.embedding ?? null,
    created_at: now,
    updated_at: now,
  });
  return { id, gate: "pass" };
}

export async function memory_get(id: string): Promise<Fact | null> {
  const res = await client.getFactById(id);
  return res.rows.length === 0 ? null : rowToFact(res.headers, res.rows[0]);
}

/**
 * 执行原始 CozoScript 并把返回行按 facts 列名映射为 Fact。
 * datalog 应 select facts 表列；未 select 的列为 undefined（调用方负责）。
 */
export async function memory_query(datalog: string): Promise<Fact[]> {
  const res = await client.execute(datalog);
  return res.rows.map((row) => rowToFact(res.headers, row));
}

function rowToFact(headers: string[], row: unknown[]): Fact {
  const rec: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    rec[h] = row[i];
  });
  return {
    id: rec.id as string,
    predicate: rec.predicate as string,
    args: (rec.args as string[]) ?? [],
    claim: rec.claim as string,
    layer: rec.layer as string,
    jPremiseIds: (rec.j_premise_ids as string[]) ?? [],
    jRuleId: (rec.j_rule_id as string | null) ?? null,
    epsType: rec.eps_type as string,
    epsValue: rec.eps_value as number,
    epsSource: rec.eps_source as string,
    linSource: rec.lin_source as string,
    linVersion: rec.lin_version as string,
    linTheta: (rec.lin_theta as string | null) ?? null,
    linActor: rec.lin_actor as string,
    verify: rec.verify as string,
    status: rec.status as string,
    embedding: (rec.embedding as number[] | null) ?? null,
    createdAt: rec.created_at as number,
    updatedAt: rec.updated_at as number,
  };
}
