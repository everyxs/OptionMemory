/**
 * memory_set / memory_get / memory_query / memory_set_batch —— 接口契约 §3.1（确定值）。
 *
 *   memory_set(fact: FactInput):  Promise<{ id, gate: "pass" | "blocked", reason? }>
 *   memory_get(id: string):       Promise<Fact | null>
 *   memory_query(datalog):        Promise<Fact[]>
 *   memory_set_batch(facts):      Promise<{ inserted, skipped, blocked, ids }>
 *
 * 写入必先过统一判定 gateCheck（ν 门 checkCompleteness → requentialCheck → status
 * 值域校验）；任一不通过即 blocked，不落库。batch 收集 blocked 明细并继续（不回滚
 * 整批），合格行单脚本一次 :put（单事务）；幂等键为 (predicate, args) 全参
 * （手册 2-B 于 2026-09-24 修订回写，理由见 ADR-0002 与手册修订注记）。
 * id 一律 `fact_<UUID>`（手册 §2.1 表 1）。CozoScript 全部由 MnesticClient 集中组装。
 *
 * 默认客户端指向 cordis.patch.yml 的本地实例（127.0.0.1:9070）；
 * 插件入口或测试用 setMemoryClient() 注入配置过的客户端。
 */
import { randomUUID } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import type { FactRow } from "../memory/mnesticClient";
import {
  FACT_STATUSES,
  type Fact,
  type FactInput,
} from "../memory/schema";
import {
  checkCompleteness,
  requentialCheck,
  shouldAudit,
  type GateResult,
} from "../runtime/nuGate";
import { makeGateAuditEvent } from "../memory/events";

export { setMemoryClient } from "../memory/client";

export interface MemorySetResult {
  id: string;
  gate: "pass" | "blocked";
  reason?: string;
}

export interface BatchBlockedItem {
  index: number;
  reason: string;
}

export interface MemorySetBatchOptions {
  /** 默认 true：所有状态均参与幂等；闭包重推传 false 以允许 out 的旧结论产生新版本。 */
  includeOutInIdempotence?: boolean;
}

export interface MemorySetBatchResult {
  inserted: number;
  skipped: number;
  blocked: BatchBlockedItem[];
  /** 按输入序对齐：插入/跳过为对应 id（跳过为库中既有 id），blocked 为 null。 */
  ids: (string | null)[];
}

/** ν 门 + status 值域的统一判定（memory_set 与 memory_set_batch 共用）。 */
function gateCheck(fact: FactInput): GateResult {
  const completeness = checkCompleteness(fact);
  if (completeness.gate === "blocked") return completeness;
  const requential = requentialCheck(fact);
  if (requential.gate === "blocked") return requential;
  const status = fact.status ?? "in";
  if (!(FACT_STATUSES as readonly string[]).includes(status)) {
    return {
      gate: "blocked",
      code: "status",
      reason: `invalid status: ${JSON.stringify(status)} (allowed: ${FACT_STATUSES.join(", ")})`,
    };
  }
  return { gate: "pass" };
}

function withAuditDefaults(fact: FactInput): FactInput {
  const text = (value: unknown, fallback: string) =>
    typeof value === "string" && value.length > 0 ? value : fallback;
  return {
    ...fact,
    predicate: text(fact.predicate, "audit_missing"),
    claim: text(fact.claim, "audit_missing"),
    layer: text(fact.layer, "meta"),
    jPremiseIds: Array.isArray(fact.jPremiseIds) ? fact.jPremiseIds : [],
    epsType: text(fact.epsType, "audit"),
    epsValue: Number.isFinite(fact.epsValue) ? fact.epsValue : 0,
    epsSource: text(fact.epsSource, "audit"),
    linSource: text(fact.linSource, "audit-missing"),
    linVersion: text(fact.linVersion, "audit"),
    linActor: text(fact.linActor, "unknown"),
    verify: text(fact.verify, "audit"),
  };
}

/** FactInput → facts 全列行（服务层生成 id 与时间戳）。 */
export function factToRow(id: string, fact: FactInput): FactRow {
  const now = Date.now() / 1000;
  return {
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
    status: fact.status ?? "in",
    embedding: fact.embedding ?? null,
    created_at: now,
    updated_at: now,
  };
}

export async function memory_set(fact: FactInput): Promise<MemorySetResult> {
  const id = `fact_${randomUUID()}`;
  const gate = gateCheck(fact);
  if (gate.gate === "blocked" && !shouldAudit(gate)) return { id, ...gate };
  const rows = [factToRow(id, gate.gate === "blocked" ? withAuditDefaults(fact) : fact)];
  if (gate.gate === "blocked") {
    rows.push(factToRow(`fact_${randomUUID()}`, makeGateAuditEvent(id, gate.reason ?? "blocked", fact.linActor || "unknown")));
  }
  await getMemoryClient().putFacts(rows);
  return { id, gate: "pass", reason: gate.reason };
}

export async function memory_set_batch(
  facts: FactInput[],
  options: MemorySetBatchOptions = {},
): Promise<MemorySetBatchResult> {
  const ids: (string | null)[] = new Array(facts.length).fill(null);
  const blocked: BatchBlockedItem[] = [];
  const candidates: Array<{ index: number; id: string; key: string; fact: FactInput; auditReason?: string }> =
    [];

  // ① 逐条过统一判定；blocked 收集原因并继续。audit 放行并另行记账。
  for (const [index, fact] of facts.entries()) {
    const gate = gateCheck(fact);
    if (gate.gate === "blocked") {
      blocked.push({ index, reason: gate.reason ?? "blocked" });
      if (!shouldAudit(gate)) continue;
    }
    candidates.push({
      index,
      id: `fact_${randomUUID()}`,
      key: JSON.stringify([fact.predicate, fact.args ?? []]),
      fact,
      auditReason: gate.gate === "blocked" ? gate.reason : undefined,
    });
  }

  // ② 幂等查重：(predicate, args) 全参；存量键集一次查出，批内自重复同判。
  const existing = candidates.length > 0
    ? await getMemoryClient().existingKeys(options.includeOutInIdempotence === false)
    : new Map<string, string>();
  const rows: FactRow[] = [];
  const seen = new Map<string, string>();
  let skipped = 0;
  for (const c of candidates) {
    const dupId = existing.get(c.key) ?? seen.get(c.key);
    if (dupId !== undefined) {
      skipped++;
      ids[c.index] = dupId;
      continue;
    }
    seen.set(c.key, c.id);
    ids[c.index] = c.id;
    rows.push(factToRow(c.id, c.auditReason === undefined ? c.fact : withAuditDefaults(c.fact)));
  }
  const inserted = rows.length;
  for (const c of candidates) {
    const auditId = ids[c.index];
    if (c.auditReason !== undefined && auditId !== null) {
      const event = makeGateAuditEvent(auditId, c.auditReason, c.fact.linActor || "unknown");
      rows.push(factToRow(`fact_${randomUUID()}`, event));
    }
  }

  // ③ 合格行与审计事件单事务 upsert。
  await getMemoryClient().putFacts(rows);

  return { inserted, skipped, blocked, ids };
}

export async function memory_get(id: string): Promise<Fact | null> {
  const res = await getMemoryClient().getFactById(id);
  return res.rows.length === 0 ? null : rowToFact(res.headers, res.rows[0]);
}

/**
 * 执行原始 CozoScript 并把返回行按 facts 列名映射为 Fact。
 * datalog 应 select facts 表列；未 select 的列为 undefined（调用方负责）。
 */
export async function memory_query(datalog: string): Promise<Fact[]> {
  const res = await getMemoryClient().execute(datalog);
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
