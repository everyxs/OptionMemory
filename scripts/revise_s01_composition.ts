/**
 * revise_s01_composition.ts —— Phase 2 Step 3：S01 成分更正（隔离 Mem）。
 *
 * source=9070 仅用于只读复制；target=9073 用于撤回/重推，禁止同源。
 */
import type { FactInput } from "../src/memory/schema";
const { memory_set_batch, setMemoryClient, memory_get } =
  require("../dist/api/memory.js") as typeof import("../src/api/memory");
const { memory_retract } =
  require("../dist/api/revision.js") as typeof import("../src/api/revision");
const { registerRule } =
  require("../dist/api/registry.js") as typeof import("../src/api/registry");
const { deriveClosure } =
  require("../dist/runtime/deriveClosure.js") as typeof import("../src/runtime/deriveClosure");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const SOURCE = process.env.SOURCE_MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const TARGET = process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9073/text-query";
const CORRECTED = "Al0.25Co0.2Cr0.2Fe0.2Ni0.15";

function toFactInput(row: Record<string, unknown>): FactInput {
  return {
    predicate: String(row.predicate),
    args: row.args as string[],
    claim: String(row.claim),
    layer: String(row.layer),
    jPremiseIds: (row.j_premise_ids as string[] | null) ?? [],
    jRuleId: row.j_rule_id as string | null,
    epsType: String(row.eps_type),
    epsValue: Number(row.eps_value),
    epsSource: String(row.eps_source),
    linSource: String(row.lin_source),
    linVersion: String(row.lin_version),
    linTheta: row.lin_theta as string | null,
    linActor: String(row.lin_actor),
    verify: String(row.verify),
    status: row.status as FactInput["status"],
  };
}

async function status(client: InstanceType<typeof MnesticClient>, id: string) {
  const row = await client.getFactById(id);
  return row.rows.length === 0 ? "missing" : String(row.rows[0][row.headers.indexOf("status")]);
}

async function main() {
  if (SOURCE === TARGET) throw new Error("source 与 target 必须不同，禁止在生产实例执行撤回测试");
  const source = new MnesticClient({ endpoint: SOURCE, timeoutMs: 60_000 });
  const target = new MnesticClient({ endpoint: TARGET, timeoutMs: 60_000 });
  const sourceFact = await source.execute(
    `?[${["id","predicate","args","claim","layer","j_premise_ids","j_rule_id","eps_type","eps_value","eps_source","lin_source","lin_version","lin_theta","lin_actor","verify","status"].join(", ")}] := *facts{id, predicate, args, claim, layer, j_premise_ids, j_rule_id, eps_type, eps_value, eps_source, lin_source, lin_version, lin_theta, lin_actor, verify, status}, predicate == "composition", first(args) == "S01"`,
  );
  if (sourceFact.rows.length !== 1) throw new Error("source S01 composition 未唯一命中");
  const original = toFactInput(Object.fromEntries(sourceFact.headers.map((h, i) => [h, sourceFact.rows[0][i]])));
  const r1 = (await source.listActiveRules()).find((row) => row.rule_id === "R1");
  if (r1 === undefined) throw new Error("source R1 不存在");

  setMemoryClient(target);
  console.log("registerRule R1", await registerRule(r1));
  const oldWrite = await memory_set_batch([original]);
  const oldId = oldWrite.ids[0]!;
  console.log("old composition", oldWrite);
  console.log("initial derive", await deriveClosure({ entity: "S01" }));
  console.log("retract old composition", await memory_retract(oldId, { actor: "phase2-step3" }));
  console.log("old composition status", await status(target, oldId));

  const correctedInput: FactInput = {
    ...original,
    args: ["S01", CORRECTED],
    claim: `composition(S01, ${CORRECTED})`,
    linActor: "phase2-step3",
  };
  const correctedWrite = await memory_set_batch([correctedInput]);
  const correctedId = correctedWrite.ids[0]!;
  console.log("corrected composition", correctedWrite);
  console.log("corrected derive", await deriveClosure({ entity: "S01" }));

  const candidates = await target.execute(
    `?[id, status, j_premise_ids, j_rule_id] := *facts{id, predicate, args, status, j_premise_ids, j_rule_id}, predicate == "candidate_solid_solution", first(args) == "S01"`,
  );
  console.log("candidates", JSON.stringify(candidates.rows));
  const oldStatus = await status(target, oldId);
  const newStatus = await status(target, correctedId);
  const oldCandidateOut = candidates.rows.some((row) => row[1] === "out");
  const newCandidateIn = candidates.rows.some((row) => row[1] === "in" && (row[2] as string[]).includes(correctedId));
  const revisions = await target.execute(
    `?[count(id)] := *facts{id, predicate, args}, predicate == "revision", first(args) == $id`,
    { id: oldId },
  );
  const revisionCount = Number(revisions.rows[0][0]);
  if (oldStatus !== "out" || newStatus !== "in" || !oldCandidateOut || !newCandidateIn || revisionCount !== 1) {
    throw new Error(`S01 更正验收失败: old=${oldStatus}, new=${newStatus}, oldCandidateOut=${oldCandidateOut}, newCandidateIn=${newCandidateIn}, revisions=${revisionCount}`);
  }
  console.log("S01_REVISION_PASS");
}

main().catch((error) => {
  console.error("ERR", error);
  process.exitCode = 1;
});
