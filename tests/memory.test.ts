/**
 * 记忆服务层测试 —— 真实 mnestic Mem 实例（globalSetup 拉起，端口 9071）。
 *
 * 覆盖：① 完整 fact 写入成功 ② 缺 lin_source 写入被拒 ③ get 命中
 *      ④ datalog 查询谓词过滤 ⑤ 非法 status 值被拒
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  memory_get,
  memory_query,
  memory_set,
  setMemoryClient,
} from "../src/api/memory";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import { TEST_ENDPOINT } from "./testServer";

const baseFact: FactInput = {
  predicate: "likes",
  claim: "alice likes bob",
  layer: "semantic",
  jPremiseIds: [],
  epsType: "prior",
  epsValue: 0.5,
  epsSource: "unit-test",
  linSource: "test-suite",
  linVersion: "0.1.0",
  linActor: "vitest",
  verify: "unit",
};

beforeAll(() => {
  setMemoryClient(new MnesticClient({ endpoint: TEST_ENDPOINT }));
});

describe("memory service layer", () => {
  it("① 完整 fact 写入成功", async () => {
    const res = await memory_set({ ...baseFact, args: ["alice", "bob"] });
    expect(res.gate).toBe("pass");
    expect(res.id).toBeTruthy();
  });

  it("② 缺 lin_source 写入被拒（ν 门 blocked，不落库）", async () => {
    const bad: any = { ...baseFact };
    delete bad.linSource;
    const res = await memory_set(bad);
    expect(res.gate).toBe("blocked");
    expect(res.reason).toMatch(/linSource/);
    expect(await memory_get(res.id)).toBeNull();
  });

  it("③ get 命中", async () => {
    const res = await memory_set(baseFact);
    expect(res.gate).toBe("pass");
    const got = await memory_get(res.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(res.id);
    expect(got!.claim).toBe(baseFact.claim);
    expect(got!.linSource).toBe("test-suite");
    expect(got!.epsValue).toBeCloseTo(0.5);
  });

  it("④ datalog 查询谓词过滤", async () => {
    await memory_set({ ...baseFact, predicate: "hates", claim: "alice hates carrots" });
    const rows = await memory_query(
      `?[id, predicate, claim] := *facts{id, predicate, claim}, predicate == "likes"`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((f) => f.predicate === "likes")).toBe(true);
  });

  it("⑤ 非法 status 值被拒（不落库）", async () => {
    const res = await memory_set({ ...baseFact, status: "bogus" as any });
    expect(res.gate).toBe("blocked");
    expect(res.reason).toMatch(/status/);
    expect(await memory_get(res.id)).toBeNull();
  });
});
