import { beforeEach, describe, expect, it } from "vitest";
import { memory_get, memory_set, memory_set_batch, setMemoryClient } from "../src/api/memory";
import { memory_retract } from "../src/api/revision";
import { setNuGateMode } from "../src/runtime/nuGate";
import { MnesticClient } from "../src/memory/mnesticClient";
import { CORE_EVENT_TYPES } from "../src/memory/events";
import type { FactInput } from "../src/memory/schema";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });

function fact(tag: string, status?: FactInput["status"]): FactInput {
  return {
    predicate: "revision_test",
    args: ["R01", tag],
    claim: `revision_test(R01, ${tag})`,
    layer: "knowledge",
    jPremiseIds: [],
    epsType: "in-degree",
    epsValue: 0.5,
    epsSource: "unit-test",
    linSource: "test-suite",
    linVersion: "1.0",
    linActor: "vitest",
    verify: "unit",
    status,
  };
}

beforeEach(() => {
  setMemoryClient(client);
  setNuGateMode("enforce");
});

describe("Phase 2 memory_retract and ν-gate modes", () => {
  it("in → out，并写入 revision 血缘事件", async () => {
    const written = await memory_set(fact("retract"));
    const result = await memory_retract(written.id, { actor: "tester" });
    expect(result).toMatchObject({ gate: "pass", status: "out" });
    expect((await memory_get(written.id))!.status).toBe("out");
    const events = await client.execute(
      `?[args, j_premise_ids, j_rule_id] := *facts{predicate, args, j_premise_ids, j_rule_id}, predicate == "revision", first(args) == $id`,
      { id: written.id },
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0][0][1]).toBe("retract");
    expect(events.rows[0][0][2]).toBe("tester");
    expect(events.rows[0][1]).toEqual([written.id]);
    expect(events.rows[0][2]).toBe("memory_retract");
  });

  it("不存在 fact 被 blocked 且不产生 revision", async () => {
    const result = await memory_retract("fact_not_found");
    expect(result.gate).toBe("blocked");
    const events = await client.execute(
      `?[count(id)] := *facts{id, predicate, args}, predicate == "revision", first(args) == "fact_not_found"`,
    );
    expect(events.rows[0][0]).toBe(0);
  });

  it("重复撤回幂等，不重复 revision", async () => {
    const written = await memory_set(fact("twice"));
    await memory_retract(written.id);
    expect(await memory_retract(written.id)).toMatchObject({ gate: "pass", status: "out" });
    const events = await client.execute(
      `?[count(id)] := *facts{id, predicate, args}, predicate == "revision", first(args) == $id`,
      { id: written.id },
    );
    expect(events.rows[0][0]).toBe(1);
  });

  it("enforce 禁止撤回 contested fact", async () => {
    const written = await memory_set(fact("contested", "contested"));
    const result = await memory_retract(written.id);
    expect(result.gate).toBe("blocked");
    expect((await memory_get(written.id))!.status).toBe("contested");
  });

  it("audit 放行状态违规并同时记录 gate_audit 与 revision", async () => {
    const written = await memory_set(fact("audit-contested", "contested"));
    setNuGateMode("audit");
    const result = await memory_retract(written.id);
    expect(result).toMatchObject({ gate: "pass", status: "out" });
    expect((await memory_get(written.id))!.status).toBe("out");
    for (const predicate of ["revision", "gate_audit"]) {
      const events = await client.execute(
        `?[count(id)] := *facts{id, predicate, args}, predicate == $predicate, first(args) == $id`,
        { predicate, id: written.id },
      );
      expect(events.rows[0][0]).toBe(1);
    }
  });

  it("memory_set 在 audit 下允许缺字段并写 gate_audit", async () => {
    const bad: any = fact("audit-missing");
    delete bad.linSource;
    setNuGateMode("audit");
    const result = await memory_set(bad);
    expect(result.gate).toBe("pass");
    expect(result.reason).toMatch(/linSource/);
    expect(await memory_get(result.id)).not.toBeNull();
    const audits = await client.execute(
      `?[args] := *facts{predicate, args}, predicate == "gate_audit", first(args) == $id`,
      { id: result.id },
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0][0][1]).toMatch(/linSource/);
  });

  it("batch audit 同时返回违规明细并放行写入", async () => {
    const bad: any = fact("batch-missing");
    delete bad.linSource;
    setNuGateMode("audit");
    const result = await memory_set_batch([bad, fact("batch-good")]);
    expect(result.inserted).toBe(2);
    expect(result.blocked).toHaveLength(1);
    expect(await memory_get(result.ids[0]!)).not.toBeNull();
    expect(await memory_get(result.ids[1]!)).not.toBeNull();
    const audits = await client.execute(
      `?[count(id)] := *facts{id, predicate, args}, predicate == "gate_audit", first(args) == $id`,
      { id: result.ids[0] },
    );
    expect(audits.rows[0][0]).toBe(1);
  });

  it("核心事件 schema 包含五类事件", () => {
    expect(CORE_EVENT_TYPES).toEqual(["task", "action", "observation", "outcome", "drift"]);
  });
});
