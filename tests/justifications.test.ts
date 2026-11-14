import { beforeAll, expect, it } from "vitest";
import { memory_set, setMemoryClient } from "../src/api/memory";
import { writeJustifications } from "../src/runtime/justifications";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const baseFact: FactInput = {
  predicate: "j_test",
  args: ["J01"],
  claim: "j_test(J01)",
  layer: "knowledge",
  jPremiseIds: [],
  epsType: "in-degree",
  epsValue: 0.5,
  epsSource: "unit-test",
  linSource: "test-suite",
  linVersion: "1.0",
  linActor: "vitest",
  verify: "unit",
};

beforeAll(() => setMemoryClient(client));

it("共享 J 写入器保存 active 多前提边且重复写入幂等", async () => {
  const premise1 = await memory_set({ ...baseFact, args: ["J01", "p1"] });
  const premise2 = await memory_set({ ...baseFact, args: ["J01", "p2"] });
  const derived = await memory_set({ ...baseFact, args: ["J01", "derived"] });
  const candidate = {
    derivedId: derived.id,
    premiseIds: [premise1.id, premise2.id],
    ruleId: "R_TEST",
  };
  expect(await writeJustifications([candidate])).toEqual({ inserted: 1, skipped: 0 });
  expect(await writeJustifications([candidate])).toEqual({ inserted: 0, skipped: 1 });
  const rows = await client.execute(
    `?[premise_ids, rule_id, active] := *justifications{derived_id, premise_ids, rule_id, active}, derived_id == $id`,
    { id: derived.id },
  );
  expect(rows.rows).toHaveLength(1);
  expect(rows.rows[0]).toEqual([[premise1.id, premise2.id], "R_TEST", true]);
});
