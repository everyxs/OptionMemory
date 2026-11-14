import { beforeEach, describe, expect, it } from "vitest";
import { memory_get, memory_set, setMemoryClient } from "../src/api/memory";
import { memory_retract, restoreFact, findAffectedFacts, hasAlternativeJustification } from "../src/api/revision";
import { registerRule } from "../src/api/registry";
import { writeJustifications } from "../src/runtime/justifications";
import { setNuGateMode } from "../src/runtime/nuGate";
import { MnesticClient } from "../src/memory/mnesticClient";
import type { FactInput } from "../src/memory/schema";
import type { RuleRow } from "../src/memory/assets";
import { TEST_ENDPOINT } from "./testServer";

const client = new MnesticClient({ endpoint: TEST_ENDPOINT });

function fact(id: string): FactInput {
  return {
    predicate: "dependency_test",
    args: [id],
    claim: `dependency_test(${id})`,
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
}

function rule(id: string): RuleRow {
  return {
    rule_id: id,
    horn_body: "dependency_test(X)",
    horn_head: "derived(X)",
    opt_i: {},
    opt_pi: {},
    opt_beta: {},
    layer: "knowledge+option",
    lin_source: "test",
    lin_version: "1.0",
    lin_theta: null,
    lin_actor: "vitest",
    status: "in",
  };
}

async function seedChain(ruleId: string) {
  await registerRule(rule(ruleId));
  const a = (await memory_set(fact("A"))).id;
  const b = (await memory_set({ ...fact("B"), jRuleId: ruleId, jPremiseIds: [a] })).id;
  const c = (await memory_set({ ...fact("C"), jRuleId: ruleId, jPremiseIds: [b] })).id;
  await writeJustifications([
    { derivedId: b, premiseIds: [a], ruleId },
    { derivedId: c, premiseIds: [b], ruleId },
  ]);
  return { a, b, c };
}

beforeEach(() => {
  setMemoryClient(client);
  setNuGateMode("enforce");
});

describe("Phase 2 dependency cone and restore", () => {
  it("链式依赖、循环防护、级联撤回与恢复", async () => {
    const { a, b, c } = await seedChain("R_CHAIN");
    await writeJustifications([{ derivedId: a, premiseIds: [c], ruleId: "R_CHAIN" }]);
    expect(await findAffectedFacts(a)).toEqual(new Set([a, b, c]));

    await memory_retract(a, { actor: "tester" });
    for (const id of [a, b, c]) expect((await memory_get(id))!.status).toBe("out");
    let justifications = await client.execute(
      `?[count(id)] := *justifications{id, derived_id, active}, active == false, (derived_id == $a or derived_id == $b or derived_id == $c)`,
      { a, b, c },
    );
    expect(justifications.rows[0][0]).toBe(3);

    expect((await restoreFact(b)).gate).toBe("blocked");
    expect((await restoreFact(a)).gate).toBe("pass");
    for (const id of [a, b, c]) expect((await memory_get(id))!.status).toBe("in");
    justifications = await client.execute(
      `?[count(id)] := *justifications{id, derived_id, active}, active == true, (derived_id == $a or derived_id == $b or derived_id == $c)`,
      { a, b, c },
    );
    expect(justifications.rows[0][0]).toBe(3);

    expect((await restoreFact(a)).gate).toBe("pass");
    const restores = await client.execute(
      `?[count(id)] := *facts{id, predicate, args}, predicate == "revision", first(args) == $id, get(args, 1) == "restore"`,
      { id: a },
    );
    expect(restores.rows[0][0]).toBe(1);
  });

  it("替代辩护保留派生事实，全部前提失效后才标 out", async () => {
    const a = (await memory_set(fact("ALT_A"))).id;
    const b = (await memory_set(fact("ALT_B"))).id;
    const d = (await memory_set({ ...fact("ALT_D"), jRuleId: "R_ALT", jPremiseIds: [b] })).id;
    await registerRule(rule("R_ALT"));
    await writeJustifications([
      { derivedId: d, premiseIds: [a], ruleId: "R_ALT" },
      { derivedId: d, premiseIds: [b], ruleId: "R_ALT" },
    ]);

    await memory_retract(a);
    expect((await memory_get(d))!.status).toBe("in");
    expect(await hasAlternativeJustification(d)).toBe(true);
    let j = await client.execute(
      `?[active] := *justifications{derived_id, premise_ids, active}, derived_id == $id, premise_ids == [$a]`,
      { id: d, a },
    );
    expect(j.rows[0][0]).toBe(false);

    await memory_retract(b);
    expect((await memory_get(d))!.status).toBe("out");
    expect(await hasAlternativeJustification(d)).toBe(false);
    expect((await restoreFact(d)).gate).toBe("blocked");

    expect((await restoreFact(b)).gate).toBe("pass");
    expect((await memory_get(d))!.status).toBe("in");
    j = await client.execute(
      `?[active] := *justifications{derived_id, premise_ids, active}, derived_id == $id, premise_ids == [$b]`,
      { id: d, b },
    );
    expect(j.rows[0][0]).toBe(true);
  });

  it("撤回仅传播到受影响依赖锥，无关派生事实保持 in", async () => {
    const { a, b, c } = await seedChain("R_SCOPE");
    const unrelatedPremise = (await memory_set(fact("SCOPE_PREMISE"))).id;
    const unrelatedDerived = (await memory_set({ ...fact("SCOPE_DERIVED"), jRuleId: "R_SCOPE_ALT", jPremiseIds: [unrelatedPremise] })).id;
    await registerRule(rule("R_SCOPE_ALT"));
    await writeJustifications([{ derivedId: unrelatedDerived, premiseIds: [unrelatedPremise], ruleId: "R_SCOPE_ALT" }]);

    await memory_retract(a, { actor: "scope-test" });
    for (const id of [a, b, c]) expect((await memory_get(id))!.status).toBe("out");
    expect((await memory_get(unrelatedDerived))!.status).toBe("in");

    expect((await restoreFact(a, { actor: "scope-test" })).gate).toBe("pass");
    for (const id of [a, b, c]) expect((await memory_get(id))!.status).toBe("in");
    expect((await memory_get(unrelatedDerived))!.status).toBe("in");
  });
});
