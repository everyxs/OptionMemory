/**
 * hea_lens_lib.ts —— HEA-Lens-1540 CSV 解析与 §2.1 转换规则（共用库）。
 *
 * import_hea_lens.ts 与 check_import_sample.ts 共用，保证「转换规则」单一来源。
 * 纯逻辑零副作用：不写库、不打印。
 */
import type { FactInput } from "../src/memory/schema";
const { readFileSync } = require("node:fs") as typeof import("node:fs");

const DEFAULT_CSV =
  "D:\\codeRepos\\personalKB\\students\\04-创造层\\项目\\26-04 AI4Science" +
  "\\datasets\\commercial_alloys_high_entropy_lens_composition_dataset.csv";

/** 数据字典定义的 36 个元素列名（成分串按 CSV 实际列序拼接）。 */
const ELEMENTS = new Set([
  "Ag", "Al", "Au", "Be", "C", "Ce", "Co", "Cr", "Cu", "Fe", "Hf", "In",
  "Ir", "Li", "Mg", "Mn", "Mo", "N", "Nb", "Ni", "P", "Pb", "Pd", "Pt",
  "Re", "Rh", "Ru", "Si", "Sn", "Ta", "Ti", "V", "W", "Y", "Zn", "Zr",
]);

const DOI_RE = /^10\.\d{4,}\//;

/** 最小 RFC 4180 CSV 解析（引号 / 内嵌逗号 / "" 转义 / CRLF / BOM）。 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type Pred = "alloy_name" | "composition" | "ref_smix" | "ref_delta" | "source_ref";

/** §2.1 定稿 + §8-c 认可项；claim 沿用 S01 形态：predicate(arg0, arg1, ...)。 */
function toFactInput(predicate: Pred, args: string[]): FactInput {
  return {
    predicate,
    args,
    claim: `${predicate}(${args.join(", ")})`,
    layer: "knowledge", // §2.1 定稿
    jPremiseIds: [],
    epsType: "in-degree", // §2.1 定稿
    epsValue: 0.5, // §8-c 认可
    epsSource: "inferred-prior", // §2.1 定稿
    linSource: "HEA-Lens-1540", // §2.1 定稿
    linVersion: "1.0", // §8-c 认可
    linActor: "import_hea_lens", // §8-c 认可
    verify: "reference", // §2.1 定稿
    status: "in", // §2.1 定稿（ADR-0002）
  };
}

export interface PlannedRow {
  csvRowNo: number;
  healId: string;
  facts: FactInput[];
}

export interface Plan {
  planned: PlannedRow[];
  skippedRows: number;
  badCells: string[];
  /** 谓词 → 计划条数 */
  expected: Record<string, number>;
  allFacts: FactInput[];
}

/** 规划一行的 facts；返回 null 表示整行跳过。坏单元格记入 badCells。 */
function planRow(
  row: string[],
  csvRowNo: number,
  healId: string,
  idx: Record<string, number>,
  elemIdx: Array<{ sym: string; col: number }>,
  badCells: string[],
): FactInput[] | null {
  const cell = (name: string) => (row[idx[name]] ?? "").trim();

  const compParts: string[] = [];
  let anyElem = false;
  for (const { sym, col } of elemIdx) {
    const raw = (row[col] ?? "").trim();
    if (raw === "") continue;
    anyElem = true;
    const n = Number(raw);
    if (Number.isNaN(n)) {
      badCells.push(`CSV 行 ${csvRowNo} 列 ${sym} 非数字: ${JSON.stringify(raw)}`);
      continue;
    }
    if (n > 0) compParts.push(`${sym}${raw}`);
  }
  if (!anyElem) return null; // 成分缺失行，整行跳过
  const composition = compParts.join("");
  if (composition === "") {
    badCells.push(`CSV 行 ${csvRowNo}（${healId}）：元素列全为 0，成分串为空`);
    return null;
  }

  const out: FactInput[] = [];
  const name = cell("Alloy Name");
  if (name !== "") out.push(toFactInput("alloy_name", [healId, name]));
  out.push(toFactInput("composition", [healId, composition]));
  const smix = cell("Smix_ideal");
  if (smix !== "") out.push(toFactInput("ref_smix", [healId, smix]));
  const delta = cell("lattice_distortion_parameter_delta");
  if (delta !== "") out.push(toFactInput("ref_delta", [healId, delta]));
  const ref = cell("References");
  if (ref !== "") {
    out.push(
      toFactInput("source_ref", [healId, DOI_RE.test(ref) ? `doi:${ref}` : ref]),
    );
  }
  return out;
}

/** 读 CSV 并规划全部行（HEAL 序号按可导入行顺序编排，跳过行不占号）。 */
function planAll(csvPath: string): Plan {
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const header = rows[0];
  const idx: Record<string, number> = {};
  header.forEach((h, i) => (idx[h] = i));
  for (const need of [
    "Alloy Name",
    "Smix_ideal",
    "lattice_distortion_parameter_delta",
    "References",
  ]) {
    if (!(need in idx)) {
      throw new Error(`CSV 缺必需列: ${need}`);
    }
  }
  const elemIdx = header
    .map((h, i) => ({ sym: h, col: i }))
    .filter((e) => ELEMENTS.has(e.sym));

  const badCells: string[] = [];
  const planned: PlannedRow[] = [];
  let skippedRows = 0;
  for (let r = 1; r < rows.length; r++) {
    const csvRowNo = r - 1;
    const healId = `HEAL${String(planned.length + 1).padStart(4, "0")}`;
    const facts = planRow(rows[r], csvRowNo, healId, idx, elemIdx, badCells);
    if (facts === null) {
      skippedRows++;
      continue;
    }
    planned.push({ csvRowNo, healId, facts });
  }
  const allFacts = planned.flatMap((p) => p.facts);
  const expected: Record<string, number> = {};
  for (const f of allFacts) {
    expected[f.predicate] = (expected[f.predicate] ?? 0) + 1;
  }
  return { planned, skippedRows, badCells, expected, allFacts };
}

// CJS 导出（本仓 .ts 脚本运行于 Node 类型剥离的 CJS 模式，值不能用 ESM export）。
module.exports = { DEFAULT_CSV, ELEMENTS, DOI_RE, parseCsv, toFactInput, planAll };
