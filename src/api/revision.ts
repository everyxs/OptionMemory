import { randomUUID } from "node:crypto";
import { getMemoryClient } from "../memory/client";
import { makeEventFact, makeGateAuditEvent } from "../memory/events";
import type { JustificationRow } from "../memory/assets";
import type { FactRow } from "../memory/mnesticClient";
import { shouldAudit, type GateResult } from "../runtime/nuGate";
import { factToRow } from "./memory";

export interface RetractOptions {
  actor?: string;
}

export interface MemoryRetractResult {
  id: string;
  gate: "pass" | "blocked";
  status?: "out";
  reason?: string;
}

export interface MemoryRestoreResult {
  id: string;
  gate: "pass" | "blocked";
  status?: "in";
  reason?: string;
}

interface RevisionState {
  facts: Map<string, FactRow>;
  justifications: JustificationRow[];
  ruleIds: Set<string>;
}

async function loadState(): Promise<RevisionState> {
  const client = getMemoryClient();
  const [factRows, justifications, rules] = await Promise.all([
    client.listAllFactRows(),
    client.listJustifications(),
    client.listActiveRules(),
  ]);
  const facts = new Map<string, FactRow>(factRows.map((row) => [String(row.id), row]));
  return { facts, justifications, ruleIds: new Set(rules.map((rule) => rule.rule_id)) };
}

function validJustification(
  row: JustificationRow,
  state: RevisionState,
  includeInactive: boolean,
): boolean {
  if (!includeInactive && !row.active) return false;
  if (!state.ruleIds.has(row.rule_id)) return false;
  return row.premise_ids.every((id) => state.facts.get(id)?.status === "in");
}

function hasAlternative(state: RevisionState, derivedId: string, includeInactive: boolean): boolean {
  return state.justifications.some((row) =>
    row.derived_id === derivedId && validJustification(row, state, includeInactive),
  );
}

export async function findAffectedFacts(f_id: string, includeInactive = false): Promise<Set<string>> {
  const { justifications } = await loadState();
  const affected = new Set<string>([f_id]);
  const queue = [f_id];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const row of justifications) {
      if ((!includeInactive && !row.active) || !row.premise_ids.includes(current)) continue;
      if (!affected.has(row.derived_id)) {
        affected.add(row.derived_id);
        queue.push(row.derived_id);
      }
    }
  }
  return affected;
}

export async function hasAlternativeJustification(d: string): Promise<boolean> {
  return hasAlternative(await loadState(), d, false);
}

function revisionFact(id: string, action: "retract" | "restore", actor: string, rootId: string): FactRow {
  const now = Date.now() / 1000;
  return factToRow(`fact_${randomUUID()}`, makeEventFact({
    predicate: "revision",
    args: [id, action, actor, String(now)],
    claim: `revision(${id}, ${action}, ${actor}, ${now})`,
    actor,
    premiseIds: [rootId],
    ruleId: action === "retract" ? "memory_retract" : "restoreFact",
  }));
}

function updateJustificationStates(
  state: RevisionState,
  affected: Set<string>,
  includeInactive: boolean,
): JustificationRow[] {
  return state.justifications.flatMap((row) => {
    if (!affected.has(row.derived_id)) return [];
    const active = validJustification(row, state, includeInactive);
    return row.active === active ? [] : [{ ...row, active }];
  });
}

export async function memory_retract(
  id: string,
  options: RetractOptions = {},
): Promise<MemoryRetractResult> {
  const client = getMemoryClient();
  const found = await client.getFactById(id);
  if (found.rows.length === 0) {
    return { id, gate: "blocked", reason: `fact not found: ${id}` };
  }
  const current = Object.fromEntries(
    found.headers.map((header, index) => [header, found.rows[0][index]]),
  ) as FactRow;
  if (current.status === "out") return { id, gate: "pass", status: "out" };

  const gate: GateResult = current.status === "in"
    ? { gate: "pass" }
    : {
        gate: "blocked",
        code: "state",
        reason: `cannot retract fact in status ${JSON.stringify(current.status)} (expected "in")`,
      };
  if (gate.gate === "blocked" && !shouldAudit(gate)) return { id, ...gate } as MemoryRetractResult;

  const actor = options.actor?.trim() || "unknown";
  const state = await loadState();
  const affected = await findAffectedFacts(id);
  const target: FactRow = { ...current, status: "out", updated_at: Date.now() / 1000 };
  state.facts.set(id, target);
  const rows = [target, revisionFact(id, "retract", actor, id)];

  let retracting = true;
  while (retracting) {
    retracting = false;
    for (const [derivedId, fact] of state.facts) {
      if (derivedId === id || !affected.has(derivedId) || fact.status !== "in") continue;
      const hasJustification = state.justifications.some((row) => row.derived_id === derivedId);
      if (!hasJustification) continue;
      if (!hasAlternative(state, derivedId, false)) {
        const updated = { ...fact, status: "out", updated_at: Date.now() / 1000 };
        state.facts.set(derivedId, updated);
        rows.push(updated);
        rows.push(revisionFact(derivedId, "retract", actor, id));
        retracting = true;
      }
    }
  }
  const justificationUpdates = updateJustificationStates(state, affected, false);
  if (gate.gate === "blocked") {
    rows.push(factToRow(`fact_${randomUUID()}`, makeGateAuditEvent(id, gate.reason ?? "blocked", actor)));
  }
  await client.putJustifications(justificationUpdates);
  await client.putFacts(rows);
  return { id, gate: "pass", status: "out", reason: gate.reason };
}

export async function restoreFact(
  f_id: string,
  options: RetractOptions = {},
): Promise<MemoryRestoreResult> {
  const client = getMemoryClient();
  const found = await client.getFactById(f_id);
  if (found.rows.length === 0) return { id: f_id, gate: "blocked", reason: `fact not found: ${f_id}` };
  const current = Object.fromEntries(
    found.headers.map((header, index) => [header, found.rows[0][index]]),
  ) as FactRow;
  if (current.status === "in") return { id: f_id, gate: "pass", status: "in" };
  if (current.status !== "out") {
    return { id: f_id, gate: "blocked", reason: `cannot restore fact in status ${JSON.stringify(current.status)}` };
  }

  const state = await loadState();
  const hasBaseEvidence = current.j_rule_id === null || current.j_rule_id === undefined;
  if (!hasBaseEvidence && !hasAlternative(state, f_id, true)) {
    return { id: f_id, gate: "blocked", reason: "no active justification available for restore" };
  }

  const actor = options.actor?.trim() || "unknown";
  const affected = await findAffectedFacts(f_id, true);
  const target: FactRow = { ...current, status: "in", updated_at: Date.now() / 1000 };
  state.facts.set(f_id, target);
  const rows = [target, revisionFact(f_id, "restore", actor, f_id)];
  let restoring = true;
  while (restoring) {
    restoring = false;
    for (const [derivedId, fact] of state.facts) {
      if (derivedId === f_id || !affected.has(derivedId) || fact.status !== "out") continue;
      if (hasAlternative(state, derivedId, true)) {
        const updated = { ...fact, status: "in", updated_at: Date.now() / 1000 };
        state.facts.set(derivedId, updated);
        rows.push(updated);
        rows.push(revisionFact(derivedId, "restore", actor, f_id));
        restoring = true;
      }
    }
  }
  await client.putJustifications(updateJustificationStates(state, affected, true));
  await client.putFacts(rows);
  return { id: f_id, gate: "pass", status: "in" };
}
