import { createHash } from "node:crypto";
import { memory_set_batch } from "../api/memory";
import type { FactInput } from "../memory/schema";

export const MATERIALS_CSV_PARSER_VERSION = "materials-csv-v1";

const ELEMENTS = new Set([
  "Ag", "Al", "Au", "Be", "C", "Ce", "Co", "Cr", "Cu", "Fe", "Hf", "In",
  "Ir", "Li", "Mg", "Mn", "Mo", "N", "Nb", "Ni", "P", "Pb", "Pd", "Pt",
  "Re", "Rh", "Ru", "Si", "Sn", "Ta", "Ti", "V", "W", "Y", "Zn", "Zr",
]);

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = text.charCodeAt(0) === 0xfeff ? 1 : 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function fact(predicate: string, args: string[], source: string): FactInput {
  return {
    predicate,
    args,
    claim: `${predicate}(${args.join(", ")})`,
    layer: "knowledge",
    jPremiseIds: [],
    epsType: "in-degree",
    epsValue: 0.5,
    epsSource: "inferred-prior",
    linSource: source,
    linVersion: MATERIALS_CSV_PARSER_VERSION,
    linActor: "parse_csv_materials",
    verify: "csv-source",
    status: "in",
  };
}

function generalRows(headers: string[], rows: string[][], source: string): FactInput[] {
  const index = new Map(headers.map((header, position) => [header.trim(), position]));
  for (const required of ["entity", "composition"]) {
    if (!index.has(required)) throw new Error(`CSV is missing required column: ${required}`);
  }
  return rows.flatMap((cells) => {
    const get = (name: string) => cells[index.get(name) ?? -1]?.trim() ?? "";
    const entity = get("entity");
    if (!entity) throw new Error("CSV entity must not be empty");
    const facts = [fact("composition", [entity, get("composition")], source)];
    if (get("process")) facts.push(fact("process", [entity, get("process")], source));
    for (const peak of get("xrd_peak").split("|").map((value) => value.trim()).filter(Boolean)) {
      if (!/^[A-Za-z]+\([0-9]+\)$/.test(peak)) throw new Error(`Invalid xrd_peak: ${peak}`);
      facts.push(fact("xrd_peak", [entity, "2theta", peak], source));
    }
    if (get("hardness")) {
      if (!Number.isFinite(Number(get("hardness")))) throw new Error(`Invalid hardness: ${get("hardness")}`);
      facts.push(fact("hardness", [entity, get("hardness"), get("hardness_unit") || "HV"], source));
    }
    return facts;
  });
}

function heaLensRows(headers: string[], rows: string[][]): FactInput[] {
  const index = new Map(headers.map((header, position) => [header.trim(), position]));
  const elements = headers.flatMap((header, position) => ELEMENTS.has(header) ? [{ symbol: header, position }] : []);
  if (!elements.length || !index.has("Alloy Name")) throw new Error("HEA-Lens CSV requires element columns and Alloy Name");
  const facts: FactInput[] = [];
  let plannedRows = 0;
  for (const cells of rows) {
    const get = (name: string) => cells[index.get(name) ?? -1]?.trim() ?? "";
    const entity = `HEAL${String(plannedRows + 1).padStart(4, "0")}`;
    const composition = elements.flatMap(({ symbol, position }) => {
      const value = cells[position]?.trim() ?? "";
      if (!value) return [];
      if (!Number.isFinite(Number(value))) throw new Error(`Invalid ${symbol} value for ${entity}`);
      return Number(value) > 0 ? [`${symbol}${value}`] : [];
    }).join("");
    if (!composition) continue;
    plannedRows++;
    facts.push(fact("composition", [entity, composition], "HEA-Lens-1540"));
    if (get("Alloy Name")) facts.push(fact("alloy_name", [entity, get("Alloy Name")], "HEA-Lens-1540"));
    if (get("Smix_ideal")) facts.push(fact("ref_smix", [entity, get("Smix_ideal")], "HEA-Lens-1540"));
    const reference = get("References");
    if (reference) facts.push(fact("source_ref", [entity, /^10\.\d{4,}\//.test(reference) ? `doi:${reference}` : reference], "HEA-Lens-1540"));
  }
  return facts;
}

export async function executeMaterialsCsv(input: {
  csv: string;
  source?: string;
  batch_id?: string;
  idempotencyKey: string;
}) {
  if (!input.batch_id) throw new Error("batch_id is required");
  const rows = parseCsv(input.csv);
  if (rows.length < 2) throw new Error("CSV requires a header and at least one data row");
  const source = input.source ?? "parse_csv_materials";
  const facts = rows[0].includes("Alloy Name")
    ? heaLensRows(rows[0], rows.slice(1))
    : generalRows(rows[0], rows.slice(1), source);
  const write = await memory_set_batch(facts);
  return {
    batch_id: input.batch_id,
    parser_version: MATERIALS_CSV_PARSER_VERSION,
    source_hash: createHash("sha256").update(input.csv).digest("hex"),
    input_rows: rows.length - 1,
    candidate_facts: facts.length,
    inserted: write.inserted,
    skipped: write.skipped,
    blocked: write.blocked,
    ids: write.ids,
  };
}
