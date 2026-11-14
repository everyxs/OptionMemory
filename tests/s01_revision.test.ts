import { beforeEach, expect, it } from "vitest";
import { memory_get, memory_set_batch, setMemoryClient } from "../src/api/memory";
import { memory_retract } from "../src/api/revision";
import { registerRule } from "../src/api/registry";
import { deriveClosure } from "../src/runtime/deriveClosure";
import { setNuGateMode } from "../src/runtime/nuGate";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import type { RuleRow } from "../src/memory/assets";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });
const original: FactInput = {
  predicate: "composition",
  args: ["S01", "Al0.2Co0.2Cr0.2Fe0.2Ni0.2"],
  claim: "composition(S01, Al0.2Co0.2Cr0.2Fe0.2Ni0.2)",
  layer: "semantic",
  jPremiseIds: [],
  epsType: "in-degree",
  epsValue: 0.5,
  epsSource: "inferred-prior",
  linSource: "literature",
  linVersion: "1.0",
  linActor: "seed_s01",
  verify: "seed",
};
const r1: RuleRow = {
  rule_id: "R1",
  horn_body: "composition(X, C)",
  horn_head: "candidate_solid_solution(X)",
  opt_i: {},
  opt_pi: {},
  opt_beta: {},
  layer: "knowledge+option",
  lin_source: "phase1-rules",
  lin_version: "1.0",
  lin_theta: null,
  lin_actor: "seed_phase1_assets",
  status: "in",
};

beforeEach(() => {
  setMemoryClient(client);
  setNuGateMode("enforce");
});

it("S01 成分更正：旧事实失效、新事实重推、J 版本与 revision 正确", async () => {
  expect((await registerRule(r1)).gate).toBe("pass");
  const oldWrite = await memory_set_batch([original]);
  const oldId = oldWrite.ids[0]!;
  await deriveClosure({ entity: "S01" });
  expect((await memory_retract(oldId, { actor: "s01-test" })).gate).toBe("pass");
  expect((await memory_get(oldId))!.status).toBe("out");

  const correctedValue = "Al0.25Co0.2Cr0.2Fe0.2Ni0.15";
  const corrected = await memory_set_batch([{
    ...original,
    args: ["S01", correctedValue],
    claim: `composition(S01, ${correctedValue})`,
    linActor: "s01-test",
  }]);
  const correctedId = corrected.ids[0]!;
  expect((await memory_get(correctedId))!.status).toBe("in");
  await deriveClosure({ entity: "S01" });

  const candidates = await client.execute(
    `?[id, status, j_premise_ids] := *facts{id, predicate, args, status, j_premise_ids, j_rule_id}, predicate == "candidate_solid_solution", first(args) == "S01"`,
  );
  expect(candidates.rows.some((row) => row[1] === "out")).toBe(true);
  expect(candidates.rows.some((row) => row[1] === "in" && (row[2] as string[]).includes(correctedId))).toBe(true);

  const second = await memory_set_batch([{
    ...original,
    args: ["S01", correctedValue],
    claim: `composition(S01, ${correctedValue})`,
    linActor: "s01-test",
  }]);
  expect(second.inserted).toBe(0);
  expect(second.ids[0]).toBe(correctedId);
  const closure = await deriveClosure({ entity: "S01" });
  expect(closure.inserted).toBe(0);
  expect(closure.justificationsInserted).toBe(0);
  const revisions = await client.execute(
    `?[count(id)] := *facts{id, predicate, args}, predicate == "revision", first(args) == $id`,
    { id: oldId },
  );
  expect(revisions.rows[0][0]).toBe(1);
});
