/**
 * ν 门 —— 写入/检索前的门控。
 *
 * checkCompleteness()：六元组必填校验，缺字段返回 blocked + 原因。
 * requentialCheck()：占位，固定 pass（TODO: Phase 2 实现 requential 账）。
 */
import type { FactInput } from "../memory/schema";

export interface GateResult {
  gate: "pass" | "blocked";
  reason?: string;
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
        reason: `missing required field(s): ${missing.join(", ")}`,
      };
}

/**
 * requential 账校验（占位，固定 pass）。
 * TODO: Phase 2 实现 requential 账。
 */
export function requentialCheck(_fact: FactInput): GateResult {
  return PASS;
}
