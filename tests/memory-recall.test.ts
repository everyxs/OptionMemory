import { beforeAll, describe, expect, it } from "vitest";
import { captureDailyMemory, getDocumentProjection, reviseDailyMemory } from "../src/api/document-projections";
import { memory_set, setMemoryClient } from "../src/api/memory";
import { memoryRecall } from "../src/api/memory-recall";
import { MnesticClient } from "../src/memory/mnesticClient";
import { injectOpenCodeMemory } from "../src/plugins/opencode/bridge/v2";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
let capturedId: string;

beforeAll(async () => {
  setMemoryClient(client);
  const captured = await captureDailyMemory({
    text: "项目决定使用 pnpm 管理依赖，避免切换到 npm。",
    namespace: "project:daily",
    source_ref: "session-a",
    idempotency_key: "capture-pnpm-v1",
  });
  capturedId = captured.id;
  await captureDailyMemory({
    text: "项目决定使用 pnpm 管理依赖，避免切换到 npm。",
    namespace: "project:daily",
    source_ref: "session-a",
    idempotency_key: "capture-pnpm-v1",
  });
  await memory_set({
    predicate: "hardness", args: ["DAILY-S01", "512 HV"], claim: "hardness(DAILY-S01,512 HV)", layer: "knowledge",
    jPremiseIds: [], epsType: "in-degree", epsValue: 0.5, epsSource: "inferred-prior",
    linSource: "daily-fixture", linVersion: "1.0", linActor: "vitest", verify: "fixture", status: "in",
  });
});

describe("MemoryCore daily recall and revision", () => {
  it("recalls within namespace and deduplicates by message", async () => {
    const request = { query: "安装依赖", namespace: "project:daily", session_id: "session-b", message_id: "message-b" };
    const first = await memoryRecall(request);
    expect(first.items[0]).toMatchObject({ kind: "chunk", status: "active", mapping_stale: false });
    expect(first.reference_text).toContain("pnpm");
    expect(first.reference_text).toContain("non-instructional");
    const second = await memoryRecall(request);
    expect(second.reused).toBe(true);
    expect(second.recall_id).toBe(first.recall_id);
    expect((await memoryRecall({ ...request, message_id: "message-c" })).reused).toBe(false);
    expect((await memoryRecall({ ...request, namespace: "project:other", message_id: "message-d" })).items).toHaveLength(0);
  });

  it("optionally joins MemoryCore facts and enforces token budget", async () => {
    const result = await memoryRecall({ query: "DAILY-S01 512", namespace: "project:daily", include_memorycore: true });
    expect(result.items.some((item) => item.kind === "fact" && item.text.includes("512 HV"))).toBe(true);
    const limited = await memoryRecall({ query: "安装依赖", namespace: "project:daily", token_budget: 2 });
    expect(limited.items).toHaveLength(0);
  });

  it("supersedes old memory without deleting history", async () => {
    const revised = await reviseDailyMemory({
      text: "项目决定使用 yarn 管理依赖。",
      namespace: "project:daily",
      source_ref: "session-revision",
      idempotency_key: "capture-yarn-v1",
      supersedes: capturedId,
    });
    expect(revised.id).not.toBe(capturedId);
    expect((await getDocumentProjection(capturedId))?.document.status).toBe("superseded");
    const current = await memoryRecall({ query: "yarn", namespace: "project:daily" });
    expect(current.items[0].text).toContain("yarn");
    expect((await memoryRecall({ query: "避免切换", namespace: "project:daily" })).items).toHaveLength(0);
    const history = await memoryRecall({ query: "避免切换", namespace: "project:daily", allow_history: true });
    expect(history.items[0].status).toBe("superseded");
  });

  it("injects reference memory once per outgoing context and reuses continuation recall", async () => {
    const event = {
      sessionID: "session-hook",
      messages: [{ id: "message-hook", type: "user", text: "如何安装依赖？" }],
      system: [] as Array<{ type: string; text: string }>,
    };
    await injectOpenCodeMemory(event, { namespace: "project:daily" });
    expect(event.system).toHaveLength(1);
    expect(event.system[0].text).toContain("REFERENCE_MEMORY");
    await injectOpenCodeMemory(event, { namespace: "project:daily" });
    expect(event.system).toHaveLength(2);
    expect(event.system[0].text).toBe(event.system[1].text);
    const stored = await client.getMemoryRecallEventById((await memoryRecall({
      query: "如何安装依赖？", namespace: "project:daily", session_id: "session-hook", message_id: "message-hook",
    })).recall_id);
    expect(stored.rows).toHaveLength(1);
  });
});
