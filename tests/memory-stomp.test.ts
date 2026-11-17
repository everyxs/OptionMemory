import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setMemoryClient } from "../src/api/memory";
import { memoryRecall } from "../src/api/memory-recall";
import {
  executeMemoryWrite,
  memoryWritePlanRunId,
  MEMORY_CAPTURE_OPTION_ID,
  MEMORY_WRITE_PLANNER_ID,
} from "../src/api/memory-write-options";
import { plannerEventIdFor } from "../src/runtime/planner";
import { optionEventIdFor } from "../src/runtime/option-executor";
import { getExecutionTrace } from "../src/api/telemetry";
import { listStaleMappings } from "../src/api/document-projections";
import { MnesticClient } from "../src/memory/mnesticClient";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const namespace = "project:memory-stomp";

function rows(result: { headers: string[]; rows: unknown[][] }) {
  return result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])) as any);
}

function captureInput(text: string, key: string) {
  return {
    text,
    namespace,
    source_ref: `message:${key}`,
    idempotency_key: key,
    session_id: "memory-stomp-session-a",
    message_id: key,
  };
}

beforeAll(() => {
  setMemoryClient(client);
});

describe("daily memory STOMP writes", () => {
  it("captures and revises through real Planner/Option events with idempotent recovery", async () => {
    const capture = await executeMemoryWrite({
      operation: "capture",
      host_type: "opencode",
      host_session_ref: "memory-stomp-session-a",
      namespace,
      source_ref: "message:capture-v1",
      idempotency_key: "capture-v1",
      arguments: captureInput("记住项目使用 pnpm。", "capture-v1"),
    });
    expect(capture).toMatchObject({ gate: "pass", reused: false });
    const duplicate = await executeMemoryWrite({
      operation: "capture",
      host_type: "opencode",
      host_session_ref: "memory-stomp-session-a",
      namespace,
      source_ref: "message:capture-v1",
      idempotency_key: "capture-v1",
      arguments: captureInput("记住项目使用 pnpm。", "capture-v1"),
    });
    expect(duplicate).toMatchObject({ gate: "pass", reused: true });
    const planRunId = memoryWritePlanRunId("opencode", namespace, "memory-stomp-session-a");
    const plannerEventId = plannerEventIdFor(planRunId, "capture-v1");
    const optionEventId = optionEventIdFor("capture-v1");
    const trace = await getExecutionTrace(optionEventId);
    expect(trace?.plannerEvent.planner_id).toBe(MEMORY_WRITE_PLANNER_ID);
    expect(trace?.option.option_id).toBe(MEMORY_CAPTURE_OPTION_ID);
    expect(trace?.optionEvent.execution_json.mode).toBe("real");
    expect(trace?.outcome?.status).toBe("success");
    expect(rows(await client.getPlannerDecisionByEventId(plannerEventId))[0].decision_json.rationale).toContain("explicitly approved");
    expect((await client.listMemoryDocuments()).rows.filter((row) => row[0] === capture.id)).toHaveLength(1);

    const revised = await executeMemoryWrite({
      operation: "revise",
      host_type: "opencode",
      host_session_ref: "memory-stomp-session-a",
      namespace,
      source_ref: "message:revise-v1",
      idempotency_key: "revise-v1",
      arguments: {
        ...captureInput("改用 yarn 管理依赖。", "revise-v1"),
        supersedes: capture.id,
      },
    });
    expect(revised).toMatchObject({ gate: "pass", reused: false });
    const oldDocument = rows(await client.getMemoryDocumentById(capture.id))[0];
    const newDocument = rows(await client.getMemoryDocumentById(revised.id))[0];
    expect(oldDocument.status).toBe("superseded");
    expect(newDocument).toMatchObject({ status: "active", supersedes: capture.id });
    const recalled = await memoryRecall({ query: "yarn", namespace, session_id: "memory-stomp-session-b", message_id: "recall-after-revise" });
    expect(recalled.reference_text).toContain("yarn");
    expect(recalled.reference_text).not.toContain("pnpm");
    const duplicateRevision = await executeMemoryWrite({
      operation: "revise",
      host_type: "opencode",
      host_session_ref: "memory-stomp-session-a",
      namespace,
      source_ref: "message:revise-v1",
      idempotency_key: "revise-v1",
      arguments: {
        ...captureInput("改用 yarn 管理依赖。", "revise-v1"),
        supersedes: capture.id,
      },
    });
    expect(duplicateRevision).toMatchObject({ gate: "pass", reused: true });
    expect(rows(await client.getMemoryDocumentById(capture.id))[0].status).toBe("superseded");
  });

  it("refreshes changed Markdown through the governed parser without duplicating unchanged executions", async () => {
    const root = await mkdtemp(join(tmpdir(), "memory-stomp-refresh-"));
    const fileNamespace = "project:memory-stomp-refresh";
    await writeFile(join(root, "project.md"), "# 项目决策\n\n记住使用 pnpm 管理依赖。\n");
    const parsed = await executeMemoryWrite({
      operation: "parse",
      host_type: "opencode",
      host_session_ref: "memory-refresh-session",
      namespace: fileNamespace,
      source_ref: "project.md",
      idempotency_key: "markdown-refresh-v1",
      arguments: { path: "project.md", root, namespace: fileNamespace },
    });
    expect(parsed.gate).toBe("pass");
    const firstRecall = await memoryRecall({ query: "pnpm", namespace: fileNamespace, session_id: "memory-refresh-session", message_id: "refresh-1", markdown_root: root });
    expect(firstRecall.reference_text).toContain("pnpm");
    expect((await client.getOptionEventById(optionEventIdFor("markdown-refresh-v1"))).rows).toHaveLength(1);
    expect((await client.getOptionEventById(optionEventIdFor(`recall-refresh:${parsed.document_id}:${parsed.content_hash}`))).rows).toHaveLength(1);

    await writeFile(join(root, "project.md"), "# 项目决策\n\n改用 yarn 管理依赖。\n");
    const secondRecall = await memoryRecall({ query: "yarn", namespace: fileNamespace, session_id: "memory-refresh-session", message_id: "refresh-2", markdown_root: root });
    expect(secondRecall.reference_text).toContain("yarn");
    const changed = rows(await client.getMemoryDocumentById(parsed.document_id))[0];
    expect(changed.content_hash).not.toBe(parsed.content_hash);
    expect((await client.getOptionEventById(optionEventIdFor(`recall-refresh:${parsed.document_id}:${parsed.content_hash}`))).rows).toHaveLength(1);
    expect((await client.getOptionEventById(optionEventIdFor(`recall-refresh:${parsed.document_id}:${changed.content_hash}`))).rows).toHaveLength(1);
    expect((await listStaleMappings()).some((mapping) => mapping.document_id === parsed.document_id && mapping.mapping_status === "stale")).toBe(true);
    expect(await readFile(join(root, "project.md"), "utf8")).toContain("yarn");
  });
});
