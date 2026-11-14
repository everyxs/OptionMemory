/**
 * check_descriptors.ts —— 核查 smix/v2 内部一致性、原始质量分组及 active J 血缘。
 *
 * 不把 v2 对拍表述为独立外部验证。R4 暂缓，要求 delta 计数为 0。
 */
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const TOLERANCE = 1e-12;

interface FactView {
  id: string;
  args: string[];
  jPremiseIds: string[];
  jRuleId: string | null;
}

(async () => {
  const client = new MnesticClient({ endpoint: ENDPOINT, timeoutMs: 60_000 });
  async function facts(predicate: string): Promise<FactView[]> {
    const res = await client.execute(
      `?[id, args, j_premise_ids, j_rule_id] := *facts{id, predicate, args, j_premise_ids, j_rule_id}, predicate == $predicate`,
      { predicate },
    );
    return res.rows.map((row) => ({
      id: String(row[0]),
      args: row[1] as string[],
      jPremiseIds: (row[2] as string[] | null) ?? [],
      jRuleId: row[3] as string | null,
    }));
  }

  const [compositions, references, derived, qualityRows, deltaRows] = await Promise.all([
    facts("composition"),
    facts("ref_smix_v2"),
    facts("smix"),
    facts("reference_quality"),
    facts("delta"),
  ]);
  const compositionByAlloy = new Map(compositions.map((row) => [row.args[0], row]));
  const derivedByAlloy = new Map(derived.map((row) => [row.args[0], row]));
  const justifications = await client.execute(
    `?[derived_id, premise_ids, rule_id, active] := *justifications{derived_id, premise_ids, rule_id, active}`,
  );
  const jByDerived = new Map<string, unknown[][]>();
  for (const row of justifications.rows) {
    const id = String(row[0]);
    jByDerived.set(id, [...(jByDerived.get(id) ?? []), row]);
  }

  const errors: Array<{ alloy: string; error: number }> = [];
  const mismatches: string[] = [];
  let missingJ = 0;
  let mismatchedJ = 0;
  for (const reference of references) {
    const alloy = reference.args[0];
    const actual = derivedByAlloy.get(alloy);
    if (actual === undefined) {
      mismatches.push(`${alloy}: missing smix`);
      continue;
    }
    const error = Math.abs(Number(actual.args[1]) - Number(reference.args[1]));
    errors.push({ alloy, error });
    if (error > TOLERANCE) mismatches.push(`${alloy}: ${error}`);

    const composition = compositionByAlloy.get(alloy);
    const jRows = jByDerived.get(actual.id) ?? [];
    if (jRows.length !== 1) {
      missingJ++;
      continue;
    }
    const [, premiseIds, ruleId, active] = jRows[0];
    const expectedPremises = composition === undefined ? [] : [composition.id];
    if (
      ruleId !== "R3" || active !== true ||
      actual.jRuleId !== "R3" ||
      JSON.stringify(actual.jPremiseIds) !== JSON.stringify(expectedPremises) ||
      JSON.stringify(premiseIds) !== JSON.stringify(expectedPremises)
    ) {
      mismatchedJ++;
    }
  }

  const quality = new Map<string, number>();
  for (const row of qualityRows) {
    const status = row.args[2];
    quality.set(status, (quality.get(status) ?? 0) + 1);
  }
  const maxError = Math.max(...errors.map((row) => row.error));
  const meanError = errors.reduce((sum, row) => sum + row.error, 0) / errors.length;
  const matched = references.length - mismatches.length;
  console.log(`smix/ref_smix_v2: ${matched}/${references.length} within ${TOLERANCE}`);
  console.log(`max_abs=${maxError}; mean_abs=${meanError}; mismatches=${mismatches.length}`);
  if (mismatches.length > 0) console.log(mismatches.slice(0, 20).join("\n"));
  console.log(`smix active J: missing=${missingJ}; mismatched=${mismatchedJ}`);
  console.log(`reference_quality: ${JSON.stringify(Object.fromEntries(quality))}`);
  console.log(`delta rows (R4 暂缓，预期 0): ${deltaRows.length}`);

  const failed =
    references.length !== 701 || mismatches.length > 0 || missingJ > 0 || mismatchedJ > 0 ||
    quality.get("original_match") !== 604 ||
    quality.get("corrected_pending_source_review") !== 97 ||
    deltaRows.length !== 0;
  if (failed) throw new Error("HEA descriptor acceptance failed");
  console.log("HEA_DESCRIPTOR_CHECK_PASS (内部一致性，非独立外部验证)");
})().catch((error) => {
  console.error("ERR", error);
  process.exitCode = 1;
});
