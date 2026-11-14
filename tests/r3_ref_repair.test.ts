import { beforeAll, describe, expect, it } from "vitest";
import { runR3RefRepairScenario } from "../scripts/check_r3_ref_repair";
import { setNuGateMode } from "../src/runtime/nuGate";
import { TEST_ENDPOINT } from "./testServer";

let result: Awaited<ReturnType<typeof runR3RefRepairScenario>>;

beforeAll(async () => {
  setNuGateMode("enforce");
  result = await runR3RefRepairScenario(TEST_ENDPOINT);
});

describe("R3-RefRepair-01", () => {
  it("场景 A：双值、质量状态、J/≺ 与 604/97 分组可查询", async () => {
    expect(result.A).toEqual({
      original: "7.657460139198816",
      v2: "9.083603018197538",
      quality: "corrected_pending_source_review",
    });
  });

  it("场景 B：禁止覆盖原值和武断声明，审慎表述通过", async () => {
    expect(result.B.overwrite).toBe("blocked");
    expect(result.B.probes).toEqual(["blocked", "blocked", "blocked"]);
    expect(result.B.allowed).toBe("pass");
  });

  it("场景 C：经批准的新证据触发版本修订与下游重推", async () => {
    expect(result.C.oldSmix).toBe("out");
    expect(result.C.v2).toBe("out");
    expect(result.C.derived).toBeGreaterThanOrEqual(1);
  });

  it("场景 D：替代辩护识别、失效阻止恢复、有效辩护恢复", async () => {
    expect(result.D).toEqual({ v2: "in", alternative: "in" });
  });

  it("场景 E：内部一致性与外部认证分组，97 条待复核不抬高成功率", async () => {
    expect(result.E.internalConsistencyRate).toBe(1);
    expect(result.E.originalReferenceAgreementRate).toBeCloseTo(604 / 701, 8);
    expect(result.E.externalCertification).toMatchObject({
      evidenceCount: 604,
      successRate: 1,
      evidenceSource: "original_match_only",
      accepted: true,
    });
    expect(result.E.pendingReviewCount).toBe(97);
    expect(result.E.r4Status).toBe("blocked");
  });
});
