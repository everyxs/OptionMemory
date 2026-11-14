/**
 * ν 门 —— 写入/检索前的门控。
 *
 * checkCompleteness()：六元组必填校验，缺字段返回 blocked + 原因。
 * requentialCheck()：简化账，当前固定 pass。
 * enforce 阻止违规写入；audit 放行并生成 gate_audit 事件（status/目标不存在仍禁止）。
 */
import type { FactInput } from "../memory/schema";

export interface GateResult {
  gate: "pass" | "blocked";
  reason?: string;
  code?: "completeness" | "status" | "requential" | "state" | "not_found";
}

export type NuGateMode = "enforce" | "audit";

let mode: NuGateMode = process.env.OPTIONMEMORY_NU_GATE_MODE === "audit" ? "audit" : "enforce";

export function setNuGateMode(next: NuGateMode): void {
  mode = next;
}

export function getNuGateMode(): NuGateMode {
  return mode;
}

export function shouldAudit(result: GateResult): boolean {
  return mode === "audit" && result.gate === "blocked" && result.code !== "status" && result.code !== "not_found";
}

const PASS: GateResult = { gate: "pass" };

type FieldCheck = (v: unknown) => boolean;

const nonEmptyString: FieldCheck = (v) => typeof v === "string" && v.length > 0;
const finiteNumber: FieldCheck = (v) =>
  typeof v === "number" && Number.isFinite(v);
const stringArray: FieldCheck = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * 必填字段清单：六元组全件（claim / layer / J系 / ε系 / lin系 / verify）+ predicate。
 * 对应 facts 表非空列；j_rule_id / lin_theta 按设计可空，不在此列。
 */
const REQUIRED_FIELDS: ReadonlyArray<readonly [keyof FactInput, FieldCheck]> = [
  ["predicate", nonEmptyString],
  ["claim", nonEmptyString],
  ["layer", nonEmptyString],
  ["jPremiseIds", stringArray],
  ["epsType", nonEmptyString],
  ["epsValue", finiteNumber],
  ["epsSource", nonEmptyString],
  ["linSource", nonEmptyString],
  ["linVersion", nonEmptyString],
  ["linActor", nonEmptyString],
  ["verify", nonEmptyString],
];

/** 六元组必填校验：任一字段缺失/类型不符 → blocked，原因列出全部缺失字段。 */
export function checkCompleteness(fact: FactInput): GateResult {
  const missing = REQUIRED_FIELDS.filter(([name, ok]) => !ok(fact[name])).map(
    ([name]) => name,
  );
  return missing.length === 0
    ? PASS
    : {
        gate: "blocked",
        code: "completeness",
        reason: `missing required field(s): ${missing.join(", ")}`,
      };
}

/** requential 账简化版：当前无额外跨事实债务，固定 pass。 */
export function requentialCheck(_fact: FactInput): GateResult {
  return PASS;
}
