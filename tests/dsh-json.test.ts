import { describe, expect, it } from "vitest";
import { toLosslessJsonValue } from "../src/plugins/dsh/tools";

describe("DSH canonical JSON projection", () => {
  it("递归移除 undefined 字段并保留 null、数组和嵌套业务值", () => {
    expect(toLosslessJsonValue({
      id: "fact_1",
      gate: "pass",
      reason: undefined,
      nested: { value: 450, optional: undefined },
      rows: [{ id: "a", missing: undefined }, null, "512 HV"],
    })).toEqual({
      id: "fact_1",
      gate: "pass",
      nested: { value: 450 },
      rows: [{ id: "a" }, null, "512 HV"],
    });
  });

  it("拒绝非有限数值", () => {
    expect(() => toLosslessJsonValue(Number.NaN)).toThrow(/non-finite/);
  });
});
