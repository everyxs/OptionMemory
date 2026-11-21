import { beforeAll, describe, expect, it } from "vitest";
import { captureDailyMemory, reviseDailyMemory } from "../src/api/document-projections";
import { memoryRecall } from "../src/api/memory-recall";
import { setMemoryClient } from "../src/api/memory";
import { MnesticClient } from "../src/memory/mnesticClient";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
let chineseDocumentId: string;

beforeAll(async () => {
  setMemoryClient(client);
  const captured = await captureDailyMemory({
    text: "本项目使用 pnpm 作为包管理器。",
    namespace: "project:bilingual",
    source_ref: "bilingual-opencode-a",
    idempotency_key: "bilingual-opencode-a-v1",
  });
  chineseDocumentId = captured.id;
  await captureDailyMemory({
    text: "S01 hardness is 512 HV.",
    namespace: "project:bilingual",
    source_ref: "bilingual-hardness-a",
    idempotency_key: "bilingual-hardness-a-v1",
  });
});

describe("bilingual recall v2", () => {
  it("expands scoped domain terms in both directions", async () => {
    const english = await memoryRecall({ query: "package manager", namespace: "project:bilingual", session_id: "bilingual-b", message_id: "bilingual-b-1" });
    expect(english.strategy_version).toBe("keyword-recall-v2");
    expect(english.items.some((item) => item.text.includes("pnpm"))).toBe(true);
    const repeated = await memoryRecall({ query: "package manager", namespace: "project:bilingual", session_id: "bilingual-b", message_id: "bilingual-b-1" });
    expect(repeated.reused).toBe(true);
    expect(repeated.recall_id).toBe(english.recall_id);

    const chinese = await memoryRecall({ query: "硬度", namespace: "project:bilingual" });
    expect(chinese.items.some((item) => item.text.includes("512 HV"))).toBe(true);
  });

  it("recalls an English revision through a Chinese query without reviving the old version", async () => {
    const revised = await reviseDailyMemory({
      text: "This project now uses yarn as its package manager.",
      namespace: "project:bilingual",
      source_ref: "bilingual-dsh-c",
      idempotency_key: "bilingual-dsh-c-v1",
      supersedes: chineseDocumentId,
    });
    expect(revised.id).not.toBe(chineseDocumentId);
    const result = await memoryRecall({ query: "包管理器", namespace: "project:bilingual" });
    expect(result.items[0].text).toContain("yarn");
    expect(result.items[0].status).toBe("active");
    expect(result.items.some((item) => item.text.includes("pnpm") && item.status === "active")).toBe(false);
  });

  it("keeps namespace isolation and budget enforcement", async () => {
    expect((await memoryRecall({ query: "hardness", namespace: "project:other" })).items).toHaveLength(0);
    expect((await memoryRecall({ query: "package manager", namespace: "project:bilingual", token_budget: 1 })).items).toHaveLength(0);
  });
});
