import { afterEach, describe, expect, it } from "vitest";
import { estimateMemoryTokens } from "../src/api/document-projections";
import { parseMarkdownNote, parseMarkdownText } from "../src/bridge/markdown/parser";
import { getLocale, MESSAGE_CODES, message } from "../src/runtime/i18n";
import { evaluateR3AgentStatement } from "../src/runtime/r3RefRepair";

const originalLocale = process.env.OPTIONMEMORY_LOCALE;
afterEach(() => {
  if (originalLocale === undefined) delete process.env.OPTIONMEMORY_LOCALE;
  else process.env.OPTIONMEMORY_LOCALE = originalLocale;
});

describe("bilingual runtime localization and extraction", () => {
  it("extracts English, Chinese, and mixed decision statements", () => {
    const english = parseMarkdownText("# Decision\n\nRemember to use pnpm.\n", "en.md", "project:en");
    expect(english.parser_version).toBe("markdown-note-v2");
    expect(english.fact_candidates[0].text).toContain("Remember");
    const chinese = parseMarkdownText("# 决策\n\n记住使用 pnpm。\n", "zh.md", "project:zh");
    expect(chinese.fact_candidates[0].text).toContain("记住");
    const mixed = parseMarkdownText("# Mixed\n\nRemember: S01 的硬度为 512 HV。\n", "mixed.md", "project:mixed");
    expect(mixed.fact_candidates[0].text).toContain("512 HV");
  });

  it("estimates English and non-ASCII token budgets without the Chinese-only heuristic", () => {
    expect(estimateMemoryTokens("hardness")).toBe(2);
    expect(estimateMemoryTokens("硬度")).toBe(1);
    expect(estimateMemoryTokens("S01 hardness 硬度")).toBeGreaterThan(1);
  });

  it("localizes public reasons while preserving stable codes and defaults", async () => {
    expect(message(MESSAGE_CODES.MEMORY_QUERY_NAMESPACE_REQUIRED)).toBe("query and namespace are required");
    expect(message(MESSAGE_CODES.MEMORY_QUERY_NAMESPACE_REQUIRED, "zh-CN")).toContain("查询");
    expect(getLocale("en")).toBe("en");
    await expect(parseMarkdownNote({ path: "../outside.md", root: process.cwd(), namespace: "project:a" })).rejects.toThrow("outside the allowed root");
    process.env.OPTIONMEMORY_LOCALE = "zh-CN";
    await expect(parseMarkdownNote({ path: "../outside.md", root: process.cwd(), namespace: "project:a" })).rejects.toThrow("允许的根目录");
  });

  it("detects unsupported English and Chinese R3 claims and localizes findings", () => {
    process.env.OPTIONMEMORY_LOCALE = "en";
    expect(evaluateR3AgentStatement("The original value was proven wrong.")).toMatchObject({ gate: "blocked", code: "state" });
    expect(evaluateR3AgentStatement("v2 has external validation.")).toMatchObject({ gate: "blocked", code: "state" });
    expect(evaluateR3AgentStatement("Overall certification success rate is 100%.")).toMatchObject({ gate: "blocked", code: "state" });
    expect(evaluateR3AgentStatement("The original and recomputed values differ and require source review.")).toMatchObject({ gate: "pass" });
    expect(evaluateR3AgentStatement("The original value was proven wrong.").reason).toContain("does not prove");
    delete process.env.OPTIONMEMORY_LOCALE;
    expect(evaluateR3AgentStatement("原参考值已被证明错误").reason).toContain("原值与复算不一致");
  });
});
