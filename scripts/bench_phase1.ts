/**
 * bench_phase1.ts —— R1–R3 部分闭包基线，每项 3 次取中位数。
 *
 * 当前数据已完成派生，因此闭包测量为幂等重放路径，不代表首次插入耗时。
 */
const { deriveClosure } =
  require("../dist/runtime/deriveClosure.js") as typeof import("../src/runtime/deriveClosure");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const ROUNDS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

(async () => {
  const client = new MnesticClient({ endpoint: ENDPOINT, timeoutMs: 60_000 });
  async function measure(fn: () => Promise<unknown>) {
    const samples: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const started = performance.now();
      await fn();
      samples.push(Number((performance.now() - started).toFixed(3)));
    }
    return { samples, medianMs: median(samples) };
  }

  const lineageQuery = `?[id, args, premise_ids, rule_id, active] := *facts{id, predicate, args}, predicate == "phase_structure", *justifications{derived_id, premise_ids, rule_id, active}, derived_id == id, active == true`;
  const descriptorJoin = `?[alloy, sv, rv] := *facts{predicate: p1, args: a1}, p1 == "smix", alloy = first(a1), sv = get(a1, 1), *facts{predicate: p2, args: a2}, p2 == "ref_smix_v2", first(a2) == alloy, rv = get(a2, 1)`;

  const closure = await measure(() => deriveClosure({ predicate: "composition" }));
  const s01 = await measure(() => deriveClosure({ entity: "S01" }));
  const lineage = await measure(() => client.execute(lineageQuery));
  const join = await measure(() => client.execute(descriptorJoin));

  async function count(predicate?: string, active?: boolean) {
    const script = predicate === undefined
      ? `?[count(id)] := *facts{id}`
      : `?[count(id)] := *facts{id, predicate}, predicate == $predicate`;
    const res = await client.execute(script, { predicate });
    return Number(res.rows[0][0]);
  }
  async function countRelation(relation: string, active?: boolean) {
    const key = relation === "rules" ? "rule_id"
      : relation === "justifications" ? "id"
        : relation === "options" ? "option_id"
          : relation === "subtasks" ? "subtask_id" : "model_id";
    const status = relation === "rules" ? ", status" : "";
    const filter = relation === "rules" ? ", status == \"in\"" : "";
    const res = await client.execute(`?[count(${key})] := *${relation}{${key}${status}}${filter}`);
    return Number(res.rows[0][0]);
  }

  const snapshots = {
    facts: await count(),
    candidate_solid_solution: await count("candidate_solid_solution"),
    smix: await count("smix"),
    delta: await count("delta"),
    rules_active: await countRelation("rules"),
    options: await countRelation("options"),
    subtasks: await countRelation("subtasks"),
    models: await countRelation("models"),
    justifications: await countRelation("justifications"),
    justifications_active: (await client.execute(
      `?[count(id)] := *justifications{id, active}, active == true`,
    )).rows[0][0],
    justifications_inactive: (await client.execute(
      `?[count(id)] := *justifications{id, active}, active == false`,
    )).rows[0][0],
    original_match: (await client.execute(
      `?[count(id)] := *facts{id, predicate, args}, predicate == "reference_quality", get(args, 2) == "original_match"`,
    )).rows[0][0],
    corrected_pending_source_review: (await client.execute(
      `?[count(id)] := *facts{id, predicate, args}, predicate == "reference_quality", get(args, 2) == "corrected_pending_source_review"`,
    )).rows[0][0],
  };

  console.log(JSON.stringify({
    endpoint: ENDPOINT,
    measurement: "R1–R3 部分闭包；每项 3 次取中位数；当前为幂等重放路径",
    closure,
    s01,
    lineage,
    descriptorJoin: { ...join, rows: 701 },
    snapshots,
  }, null, 2));
})().catch((error) => {
  console.error("ERR", error);
  process.exitCode = 1;
});
