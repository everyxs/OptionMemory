/**
 * calibrate_delta.ts —— Phase 1 Step 1：R3/R4 全量对拍（只读，不写库）。
 *
 * 前提：RocksDB 实例在跑且已导入 HEA-Lens-1540，dist/ 已构建。
 * 用法：pnpm build && node scripts/calibrate_delta.ts
 * 退出码：0 = R3/R4 均达验收阈值；2 = 任一项未达阈值；1 = 数据或查询错误。
 *
 * 半径表来源：
 * - HEA 常用金属半径：Takeuchi–Inoue δ 口径；元素值示例见
 *   https://pmc.ncbi.nlm.nih.gov/articles/PMC11013611/ （Table 2）。
 * - Slater empirical / Clementi calculated / covalent single-bond：
 *   https://en.wikipedia.org/wiki/Atomic_radii_of_the_elements_(data_page)
 */
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

const ENDPOINT =
  process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
const GAS_CONSTANT = 8.314;
const R3_ABS_TOLERANCE = 1e-3;
const R3_MIN_PASS_RATE = 0.99;
const R4_MIN_PEARSON = 0.99;
const R4_MAX_MEDIAN_REL_ERROR = 0.05;

const ELEMENTS = [
  "Ag", "Al", "Au", "Be", "C", "Ce", "Co", "Cr", "Cu", "Fe", "Hf", "In",
  "Ir", "Li", "Mg", "Mn", "Mo", "N", "Nb", "Ni", "P", "Pb", "Pd", "Pt",
  "Re", "Rh", "Ru", "Si", "Sn", "Ta", "Ti", "V", "W", "Y", "Zn", "Zr",
] as const;

type Element = (typeof ELEMENTS)[number];
type Radii = Record<Element, number>;
type Composition = Partial<Record<Element, number>>;

function radii(values: number[]): Radii {
  if (values.length !== ELEMENTS.length) throw new Error("半径表列数不一致");
  return Object.fromEntries(ELEMENTS.map((e, i) => [e, values[i]])) as Radii;
}

const RADIUS_TABLES: Record<string, Radii> = {
  hea_metallic_mn127: radii([
    1.445, 1.432, 1.442, 1.128, 0.77, 1.825, 1.251, 1.249, 1.278,
    1.241, 1.578, 1.659, 1.357, 1.52, 1.598, 1.27, 1.363, 0.75,
    1.429, 1.246, 1.1, 1.75, 1.376, 1.39, 1.375, 1.345, 1.339,
    1.17, 1.58, 1.43, 1.462, 1.316, 1.367, 1.8, 1.334, 1.597,
  ]),
  hea_metallic_mn135: radii([
    1.445, 1.432, 1.442, 1.128, 0.77, 1.825, 1.251, 1.249, 1.278,
    1.241, 1.578, 1.659, 1.357, 1.52, 1.598, 1.35, 1.363, 0.75,
    1.429, 1.246, 1.1, 1.75, 1.376, 1.39, 1.375, 1.345, 1.339,
    1.17, 1.58, 1.43, 1.462, 1.316, 1.367, 1.8, 1.334, 1.597,
  ]),
  slater_empirical: radii([
    1.6, 1.25, 1.35, 1.05, 0.7, 1.85, 1.35, 1.4, 1.35,
    1.4, 1.55, 1.55, 1.35, 1.45, 1.5, 1.4, 1.45, 0.65,
    1.45, 1.35, 1.0, 1.8, 1.4, 1.35, 1.35, 1.35, 1.3,
    1.1, 1.45, 1.45, 1.4, 1.35, 1.35, 1.8, 1.35, 1.55,
  ]),
  clementi_calculated: radii([
    1.65, 1.18, 1.74, 1.12, 0.67, 2.1, 1.52, 1.66, 1.45,
    1.56, 2.08, 1.56, 1.8, 1.67, 1.45, 1.61, 1.9, 0.56,
    1.98, 1.49, 0.98, 1.54, 1.69, 1.77, 1.88, 1.73, 1.78,
    1.11, 1.45, 2.0, 1.76, 1.71, 1.93, 2.12, 1.42, 2.06,
  ]),
  covalent_single: radii([
    1.28, 1.26, 1.24, 1.02, 0.75, 1.63, 1.11, 1.22, 1.12,
    1.16, 1.52, 1.42, 1.22, 1.33, 1.39, 1.19, 1.38, 0.71,
    1.47, 1.1, 1.11, 1.44, 1.2, 1.23, 1.31, 1.25, 1.25,
    1.16, 1.4, 1.46, 1.36, 1.34, 1.37, 1.63, 1.18, 1.54,
  ]),
};

interface AlloyRow {
  id: string;
  composition: Composition;
  refSmix: number;
  refDelta: number;
}

interface Metrics {
  pearson: number;
  medianRel: number;
  meanRel: number;
  maxRel: number;
  passRate: number;
}

function parseComposition(text: string): Composition {
  const out: Composition = {};
  let cursor = 0;
  for (const match of text.matchAll(/([A-Z][a-z]?)([0-9]+(?:\.[0-9]+)?)/g)) {
    if (match.index !== cursor) throw new Error(`无法解析成分串: ${text}`);
    cursor = match.index + match[0].length;
    const element = match[1] as Element;
    if (!ELEMENTS.includes(element)) throw new Error(`未知元素 ${element}: ${text}`);
    const value = Number(match[2]);
    if (!(value > 0)) throw new Error(`非正成分 ${match[0]}: ${text}`);
    out[element] = value;
  }
  if (cursor !== text.length || Object.keys(out).length === 0) {
    throw new Error(`无法解析成分串: ${text}`);
  }
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1e-6) throw new Error(`成分合计 ${total}: ${text}`);
  return out;
}

function fractions(composition: Composition): Array<[Element, number]> {
  return ELEMENTS.filter((e) => composition[e] !== undefined).map(
    (e) => [e, composition[e]! / 100],
  );
}

function smix(composition: Composition): number {
  return -GAS_CONSTANT * fractions(composition).reduce(
    (sum, [, x]) => sum + x * Math.log(x),
    0,
  );
}

type DeltaVariant = (composition: Composition, table: Radii) => number;

function weightedDelta(composition: Composition, table: Radii, mean: "weighted" | "rms" | "unweighted"): number {
  const xs = fractions(composition);
  const rbar = mean === "weighted"
    ? xs.reduce((sum, [e, x]) => sum + x * table[e], 0)
    : mean === "rms"
      ? Math.sqrt(xs.reduce((sum, [e, x]) => sum + x * table[e] ** 2, 0))
      : xs.reduce((sum, [e]) => sum + table[e], 0) / xs.length;
  return Math.sqrt(xs.reduce(
    (sum, [e, x]) => sum + x * (1 - table[e] / rbar) ** 2,
    0,
  ));
}

const DELTA_VARIANTS: Record<string, DeltaVariant> = {
  delta: (c, r) => weightedDelta(c, r, "weighted"),
  delta_x100: (c, r) => 100 * weightedDelta(c, r, "weighted"),
  delta_div2: (c, r) => weightedDelta(c, r, "weighted") / 2,
  delta_div_sqrt2: (c, r) => weightedDelta(c, r, "weighted") / Math.sqrt(2),
  rms_radius: (c, r) => weightedDelta(c, r, "rms"),
  unweighted_radius: (c, r) => weightedDelta(c, r, "unweighted"),
};

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metrics(calculated: number[], reference: number[]): Metrics {
  const meanCalc = calculated.reduce((a, b) => a + b, 0) / calculated.length;
  const meanRef = reference.reduce((a, b) => a + b, 0) / reference.length;
  let covariance = 0;
  let varianceCalc = 0;
  let varianceRef = 0;
  for (let i = 0; i < calculated.length; i++) {
    const dc = calculated[i] - meanCalc;
    const dr = reference[i] - meanRef;
    covariance += dc * dr;
    varianceCalc += dc ** 2;
    varianceRef += dr ** 2;
  }
  const rel = calculated.map((v, i) => Math.abs(v - reference[i]) / reference[i]);
  return {
    pearson: covariance / Math.sqrt(varianceCalc * varianceRef),
    medianRel: median(rel),
    meanRel: rel.reduce((a, b) => a + b, 0) / rel.length,
    maxRel: Math.max(...rel),
    passRate: rel.filter((v) => v <= R4_MAX_MEDIAN_REL_ERROR).length / rel.length,
  };
}

async function queryArgs(client: InstanceType<typeof MnesticClient>, predicate: string) {
  const res = await client.execute(
    `?[args] := *facts{predicate, args, status}, predicate == $predicate, status == "in"`,
    { predicate },
  );
  return new Map(res.rows.map((row) => {
    const args = row[0] as string[];
    return [args[0], args[1]] as const;
  }));
}

(async () => {
  const client = new MnesticClient({ endpoint: ENDPOINT, timeoutMs: 60_000 });
  const [compositions, refSmixes, refDeltas] = await Promise.all([
    queryArgs(client, "composition"),
    queryArgs(client, "ref_smix"),
    queryArgs(client, "ref_delta"),
  ]);
  const rows: AlloyRow[] = [];
  for (const [id, compositionText] of compositions) {
    if (!/^HEAL\d{4}$/.test(id)) continue;
    const refSmix = refSmixes.get(id);
    const refDelta = refDeltas.get(id);
    if (refSmix === undefined || refDelta === undefined) {
      throw new Error(`${id} 缺 ref_smix 或 ref_delta`);
    }
    rows.push({
      id,
      composition: parseComposition(compositionText),
      refSmix: Number(refSmix),
      refDelta: Number(refDelta),
    });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  if (rows.length !== 701) throw new Error(`完整 HEAL 行数 ${rows.length}，预期 701`);

  console.log(`endpoint: ${ENDPOINT}`);
  console.log(`完整对拍行数: ${rows.length}`);
  const smixErrors = rows.map((row) => ({
    id: row.id,
    calculated: smix(row.composition),
    reference: row.refSmix,
    error: Math.abs(smix(row.composition) - row.refSmix),
  }));
  const smixPassed = smixErrors.filter((row) => row.error <= R3_ABS_TOLERANCE);
  const r3PassRate = smixPassed.length / rows.length;
  console.log("\nR3 smix = -8.314 * sum(xi * ln(xi))");
  console.log(`HEAL0001: calculated=${smixErrors[0].calculated.toFixed(9)} reference=${smixErrors[0].reference.toFixed(9)} abs_error=${smixErrors[0].error.toExponential(6)}`);
  console.log(`max_abs=${Math.max(...smixErrors.map((r) => r.error)).toFixed(9)} mean_abs=${(smixErrors.reduce((s, r) => s + r.error, 0) / rows.length).toFixed(9)}`);
  console.log(`abs_error<=${R3_ABS_TOLERANCE}: ${smixPassed.length}/${rows.length} (${(r3PassRate * 100).toFixed(2)}%)`);
  console.log("误差最大的 20 行:");
  for (const row of [...smixErrors].sort((a, b) => b.error - a.error).slice(0, 20)) {
    console.log(`  ${row.id} calculated=${row.calculated.toFixed(9)} reference=${row.reference.toFixed(9)} abs_error=${row.error.toFixed(9)}`);
  }

  const references = rows.map((row) => row.refDelta);
  let accepted: string[] = [];
  console.log("\nR4 候选半径表 × 公式变体:");
  for (const [tableName, table] of Object.entries(RADIUS_TABLES)) {
    for (const [variantName, variant] of Object.entries(DELTA_VARIANTS)) {
      const calculated = rows.map((row) => variant(row.composition, table));
      const m = metrics(calculated, references);
      const pass = m.pearson >= R4_MIN_PEARSON && m.medianRel <= R4_MAX_MEDIAN_REL_ERROR;
      if (pass) accepted.push(`${tableName}/${variantName}`);
      console.log(
        `${pass ? "PASS" : "FAIL"} ${tableName}/${variantName}` +
        ` pearson=${m.pearson.toFixed(6)} median_rel=${m.medianRel.toFixed(6)}` +
        ` mean_rel=${m.meanRel.toFixed(6)} max_rel=${m.maxRel.toFixed(6)}` +
        ` rows_within_5pct=${(m.passRate * 100).toFixed(2)}% HEAL0001=${calculated[0].toFixed(9)}`,
      );
    }
  }

  const r3Accepted = r3PassRate >= R3_MIN_PASS_RATE;
  console.log(`\nR3_DECISION=${r3Accepted ? "ACCEPT" : "BLOCKED"} (要求通过率 >=99%)`);
  console.log(`R4_DECISION=${accepted.length > 0 ? `ACCEPT ${accepted.join(",")}` : "BLOCKED"} (要求 Pearson>=0.99 且中位相对误差<=5%)`);
  if (!r3Accepted || accepted.length === 0) process.exitCode = 2;
})().catch((error) => {
  console.error("ERR", error);
  process.exitCode = 1;
});
