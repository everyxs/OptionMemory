import { beforeAll, describe, expect, it } from "vitest";
import { captureDailyMemory } from "../src/api/document-projections";
import { setMemoryClient } from "../src/api/memory";
import { MnesticClient } from "../src/memory/mnesticClient";
import { setupOpenCodeMemoryBridgeV2 } from "../src/plugins/opencode/bridge/v2";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });

beforeAll(async () => {
  setMemoryClient(client);
  await captureDailyMemory({
    text: "OpenCode V2 日常记忆使用关键词召回。",
    namespace: "project:v2",
    source_ref: "v2-fixture",
    idempotency_key: "v2-memory-1",
  });
});

describe("OpenCode V2 Memory Bridge", () => {
  it("registers three independent tools and one context hook without changing original tools", async () => {
    const definitions: Array<{ name: string }> = [];
    let contextHook: ((event: { sessionID: string; messages: unknown[]; system: Array<{ type: string; text: string }> }) => Promise<void>) | undefined;
    await setupOpenCodeMemoryBridgeV2({
      tool: { transform: async (callback) => callback({ add: (definition) => definitions.push(definition) }) },
      session: { hook: async (_name, callback) => { contextHook = callback; } },
    }, { endpoint: TEST_ENDPOINT, namespace: "project:v2" });
    expect(definitions.map((definition) => definition.name).sort()).toEqual(["bridge_capture", "bridge_recall", "bridge_revise"]);
    expect(contextHook).toBeDefined();
    const event = { sessionID: "v2-session", messages: [{ id: "v2-message", role: "user", content: [{ type: "text", text: "关键词召回" }] }], system: [] as Array<{ type: string; text: string }> };
    await contextHook!(event);
    expect(event.system).toHaveLength(1);
    expect(event.system[0].text).toContain("OpenCode V2 日常记忆");
  });
});
