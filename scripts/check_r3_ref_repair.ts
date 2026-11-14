const fixtureJson = require("../tests/fixtures/r3_ref_repair_01/fixture.json") as R3Fixture;
import type { FactInput } from "../src/memory/schema";
import type { JustificationRow, RuleRow } from "../src/memory/assets";

const { memory_get, memory_set_batch, setMemoryClient } =
  require("../dist/api/memory.js") as typeof import("../src/api/memory");
const { memory_retract, restoreFact, hasAlternativeJustification } =
  require("../dist/api/revision.js") as typeof import("../src/api/revision");
const { registerRule } =
  require("../dist/api/registry.js") as typeof import("../src/api/registry");
const { deriveClosure } =
  require("../dist/runtime/deriveClosure.js") as typeof import("../src/runtime/deriveClosure");
const { writeJustifications } =
  require("../dist/runtime/justifications.js") as typeof import("../src/runtime/justifications");
const { setNuGateMode } =
  require("../dist/runtime/nuGate.js") as typeof import("../src/runtime/nuGate");
const { checkR3ReferenceMutation, evaluateR3AgentStatement, checkR3NewEvidenceAuthorization, summarizeR3CertificationEvidence } =
  require("../dist/runtime/r3RefRepair.js") as typeof import("../src/runtime/r3RefRepair");
const { MnesticClient } =
  require("../dist/memory/mnesticClient.js") as typeof import("../src/memory/mnesticClient");

type FixtureFact = FactInput & { id: string };
type Client = InstanceType<typeof MnesticClient>;

interface R3Fixture {
  facts: FixtureFact[];
  rule: RuleRow;
  justifications: JustificationRow[];
  qualityGroups: {
    original_match: number;
    corrected_pending_source_review: number;
  };
}

const fixture = fixtureJson as R3Fixture;
const COMPOSITION = "fact_1b56178e-bd3a-4efb-a897-63d1a1ec2d1c";
const ORIGINAL = "fact_04bcf373-3aac-4c9b-9757-3e186a1181d5";
const V2 = "fact_17bc8980-d855-42dd-8500-d069129bbdbf";
const QUALITY = "fact_daa14d74-6d14-405f-a407-5bbea15b783a";
const DELTA = "fact_bbdcea9b-95b0-4b36-ac39-0aa5629a7077";
const SMIX = "fact_0d7337aa-cac5-4ceb-a630-6f042b4a0c82";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sourceEvidence(id: string): FactInput {
  return {
    predicate: "source_evidence",
    args: ["HEAL0444", "maintainer_confirmation", "v3"],
    claim: "source_evidence(HEAL0444, maintainer_confirmation, v3)",
    layer: "knowledge",
    jPremiseIds: [],
    epsType: "confidence",
    epsValue: 0.9,
    epsSource: "approved-maintainer-evidence",
    linSource: "maintainer-confirmation",
    linVersion: "3.0",
    linActor: "phase2-step4",
    verify: "approved-source-evidence",
    status: "in",
  };
}

async function seed(client: Client, scenario: string) {
  setMemoryClient(client);
  setNuGateMode("enforce");
  const baseFacts = fixture.facts.filter((fact) => fact.jPremiseIds.length === 0);
  const derivedFacts = fixture.facts.filter((fact) => fact.jPremiseIds.length > 0 && fact.predicate !== "reference_quality");
  const qualityFacts = fixture.facts.filter((fact) => fact.predicate === "reference_quality");
  const baseWrite = await memory_set_batch(baseFacts.map((fact) => ({ ...fact, args: [...fact.args, scenario] })));
  assert(baseWrite.blocked.length === 0, `${scenario}: 基础 fixture 写入被拦截 ${JSON.stringify(baseWrite.blocked)}`);
  const ids = new Map(baseFacts.map((fact, index) => [fact.id, baseWrite.ids[index]!]));
  const derivedWrite = await memory_set_batch(derivedFacts.map((fact) => ({
    ...fact,
    args: [...fact.args, scenario],
    jPremiseIds: fact.jPremiseIds.map((id) => ids.get(id)!),
  })));
  assert(derivedWrite.blocked.length === 0, `${scenario}: 派生 fixture 写入被拦截 ${JSON.stringify(derivedWrite.blocked)}`);
  for (const [index, fact] of derivedFacts.entries()) ids.set(fact.id, derivedWrite.ids[index]!);
  const qualityWrite = await memory_set_batch(qualityFacts.map((fact) => ({
    ...fact,
    args: [...fact.args, scenario],
    jPremiseIds: fact.jPremiseIds.map((id) => ids.get(id)!),
  })));
  assert(qualityWrite.blocked.length === 0, `${scenario}: 质量 fixture 写入被拦截 ${JSON.stringify(qualityWrite.blocked)}`);
  for (const [index, fact] of qualityFacts.entries()) ids.set(fact.id, qualityWrite.ids[index]!);
  assert((await registerRule(fixture.rule)).gate === "pass", `${scenario}: R3 注册失败`);
  const justificationWrite = await writeJustifications(fixture.justifications.map((row) => ({
    derivedId: ids.get(row.derived_id)!,
    premiseIds: row.premise_ids.map((id) => ids.get(id)!),
    ruleId: row.rule_id,
  })));
  assert(justificationWrite.inserted === fixture.justifications.length, `${scenario}: J 边数量不符`);
  return ids;
}

function originalSignature(rows: Array<{ id: string; args: string[] }>): string {
  return rows.map((row) => `${row.id}|${row.args.join("|")}`).sort().join("\n");
}

async function scenarioA(client: Client) {
  const ids = await seed(client, "A");
  const original = await memory_get(ids.get(ORIGINAL)!);
  const v2 = await memory_get(ids.get(V2)!);
  const quality = await memory_get(ids.get(QUALITY)!);
  assert(original?.args[1] === "7.657460139198816", "场景 A：原值不符");
  assert(v2?.args[1] === "9.083603018197538", "场景 A：v2 值不符");
  assert(quality?.args[2] === "corrected_pending_source_review", "场景 A：质量状态不符");
  assert(quality.args[5] === "1.4261428789987214", "场景 A：差异值不符");
  assert(v2.jRuleId === "R3" && v2.jPremiseIds.includes(ids.get(COMPOSITION)!), "场景 A：v2 血缘不符");
  assert(quality.jPremiseIds.includes(ids.get(ORIGINAL)!) && quality.jPremiseIds.includes(ids.get(V2)!), "场景 A：质量血缘不符");
  assert(fixture.qualityGroups.original_match === 604 && fixture.qualityGroups.corrected_pending_source_review === 97, "场景 A：604/97 分组不符");
  return { original: original.args[1], v2: v2.args[1], quality: quality.args[2] };
}

async function scenarioB(client: Client) {
  const ids = await seed(client, "B");
  const originalInput = fixture.facts.find((fact) => fact.id === ORIGINAL)!;
  const mutation = checkR3ReferenceMutation({
    ...originalInput,
    args: ["HEAL0444", "0"],
    claim: "ref_smix(HEAL0444, 0)",
  });
  assert(mutation.gate === "blocked", "场景 B：覆盖原参考值未被阻止");
  const prohibited = [
    "原参考值已经被证明错误",
    "v2 对拍一致，因此 R3 已获外部验证",
    "将全部记录混合计算统一认证成功率",
  ].map((statement) => evaluateR3AgentStatement(statement));
  assert(prohibited.every((result) => result.gate === "blocked"), "场景 B：禁止声明探针未全部命中");
  const allowed = evaluateR3AgentStatement("原值与公开成分复算不一致，来源尚未复核");
  assert(allowed.gate === "pass", `场景 B：审慎表述被误判 ${allowed.reason}`);
  const original = await memory_get(ids.get(ORIGINAL)!);
  assert(original?.args[1] === "7.657460139198816" && original.status === "in", "场景 B：原值被修改");
  return { overwrite: mutation.gate, probes: prohibited.map((result) => result.gate), allowed: allowed.gate };
}

async function scenarioC(client: Client) {
  const ids = await seed(client, "C");
  const pending = checkR3NewEvidenceAuthorization({ approvalStatus: "pending", actor: "phase2-step4", evidenceType: "maintainer_confirmation" });
  assert(pending.gate === "blocked", "场景 C：未批准证据被放行");
  const approved = checkR3NewEvidenceAuthorization({ approvalStatus: "approved", actor: "phase2-step4", evidenceType: "maintainer_confirmation" });
  assert(approved.gate === "pass", "场景 C：批准证据被误拦");
  const evidenceWrite = await memory_set_batch([sourceEvidence(`${ids.get(COMPOSITION)}__evidence`)]);
  const evidenceId = evidenceWrite.ids[0]!;
  assert((await memory_retract(ids.get(COMPOSITION)!, { actor: "phase2-step4" })).gate === "pass", "场景 C：旧成分撤回失败");
  assert((await memory_retract(ids.get(V2)!, { actor: "phase2-step4" })).gate === "pass", "场景 C：v2 撤回失败");

  const correctedValue = "Al17.7700001C5.99Fe58.7899999Mn17.45";
  const correctedWrite = await memory_set_batch([{
    ...fixture.facts.find((fact) => fact.id === COMPOSITION)!,
    args: ["HEAL0444", correctedValue],
    claim: `composition(HEAL0444, ${correctedValue})`,
    jPremiseIds: [evidenceId],
    linSource: "maintainer-confirmation",
    linVersion: "3.0",
    linActor: "phase2-step4",
  }]);
  const correctedId = correctedWrite.ids[0]!;
  await deriveClosure({ entity: "HEAL0444" });

  const oldSmix = await memory_get(ids.get(SMIX)!);
  assert(oldSmix?.status === "out", "场景 C：旧 smix 未失效");
  assert((await memory_get(ids.get(V2)!))?.status === "out", "场景 C：v2 未失效");
  const derived = await client.execute(
    `?[id, status, j_premise_ids] := *facts{id, predicate, args, status, j_premise_ids}, predicate == "smix", first(args) == "HEAL0444", status == "in"`,
  );
  assert(derived.rows.some((row) => (row[2] as string[]).includes(correctedId)), "场景 C：新 smix 未按新证据重推");
  assert((await memory_get(ids.get(ORIGINAL)!))?.args[1] === "7.657460139198816", "场景 C：原参考值被覆盖");
  assert((await memory_get(ids.get(DELTA)!))?.args[1] === "0.0258280127795563", "场景 C：ref_delta 被覆盖");
  const historicalQuality = await memory_get(ids.get(QUALITY)!);
  assert(historicalQuality?.args[2] === "corrected_pending_source_review" && historicalQuality.args[3] === "7.657460139198816", "场景 C：历史质量记录缺失或被改写");
  return { oldSmix: oldSmix.status, v2: (await memory_get(ids.get(V2)!))?.status, derived: derived.rows.length, evidence: evidenceId };
}

async function scenarioD(client: Client) {
  const ids = await seed(client, "D");
  const evidenceWrite = await memory_set_batch([sourceEvidence(`${ids.get(COMPOSITION)}__alternative`)]);
  const alternativeId = evidenceWrite.ids[0]!;
  await writeJustifications([{ derivedId: ids.get(V2)!, premiseIds: [alternativeId], ruleId: "R3" }]);
  await memory_retract(ids.get(COMPOSITION)!, { actor: "phase2-step4" });
  assert((await memory_get(ids.get(V2)!))?.status === "in", "场景 D：替代辩护未保留 v2");
  assert(await hasAlternativeJustification(ids.get(V2)!), "场景 D：替代辩护未被识别");

  await memory_retract(alternativeId, { actor: "phase2-step4" });
  assert((await memory_get(ids.get(V2)!))?.status === "out", "场景 D：全部辩护失效后 v2 未标 out");
  assert(!(await hasAlternativeJustification(ids.get(V2)!)), "场景 D：失效辩护被误判为有效");
  assert((await restoreFact(ids.get(V2)!, { actor: "phase2-step4" })).gate === "blocked", "场景 D：无有效辩护时错误恢复");
  assert((await restoreFact(alternativeId, { actor: "phase2-step4" })).gate === "pass", "场景 D：替代证据恢复失败");
  assert((await memory_get(ids.get(V2)!))?.status === "in", "场景 D：有效辩护恢复后 v2 未恢复");
  assert((await restoreFact(ids.get(COMPOSITION)!, { actor: "phase2-step4" })).gate === "pass", "场景 D：原成分恢复失败");
  assert((await memory_get(ids.get(SMIX)!))?.status === "in", "场景 D：下游 smix 未恢复");
  assert((await memory_get(ids.get(ORIGINAL)!))?.args[1] === "7.657460139198816", "场景 D：原始证据发生变化");
  return { v2: (await memory_get(ids.get(V2)!))?.status, alternative: (await memory_get(alternativeId))?.status };
}

function scenarioE() {
  const summary = summarizeR3CertificationEvidence({
    originalMatch: {
      count: fixture.qualityGroups.original_match,
      internalConsistent: 604,
      originalReferenceAgreement: 604,
      independentExternalValidated: 604,
    },
    pendingSourceReview: {
      count: fixture.qualityGroups.corrected_pending_source_review,
      internalConsistent: 97,
      originalReferenceAgreement: 0,
      independentExternalValidated: 0,
    },
  });
  assert(summary.internalConsistencyRate === 1, "场景 E：内部一致率不是 100%");
  assert(summary.originalReferenceAgreementRate === 604 / 701, "场景 E：原始参考交叉验证率口径错误");
  assert(summary.externalCertification.evidenceCount === 604, "场景 E：97 条待复核混入外部认证证据");
  assert(summary.externalCertification.successRate === 1, "场景 E：待复核记录抬高了外部认证成功率");
  assert(summary.externalCertification.accepted, "场景 E：排除待复核后认证仍被误判");
  assert(summary.pendingReviewCount === 97 && summary.r4Status === "blocked", "场景 E：R4 被隐式放行");

  const invalid = summarizeR3CertificationEvidence({
    originalMatch: { count: 604, internalConsistent: 604, originalReferenceAgreement: 604, independentExternalValidated: 604 },
    pendingSourceReview: { count: 97, internalConsistent: 97, originalReferenceAgreement: 0, independentExternalValidated: 0 },
    pendingReviewUsedAsIndependentEvidence: true,
  });
  assert(!invalid.externalCertification.accepted, "场景 E：把待复核记录当独立证据时未被阻止");
  return summary;
}

async function runR3RefRepairScenario(endpoint: string) {
  const client = new MnesticClient({ endpoint, timeoutMs: 60_000 });
  const [a, b, c, d, e] = [
    await scenarioA(client),
    await scenarioB(client),
    await scenarioC(client),
    await scenarioD(client),
    scenarioE(),
  ];
  return { scenario: "R3-RefRepair-01", A: a, B: b, C: c, D: d, E: e };
}

module.exports = { runR3RefRepairScenario };

if (require.main === module) {
  const endpoint = process.env.MNESTIC_ENDPOINT ?? "http://127.0.0.1:9073/text-query";
  const source = process.env.SOURCE_MNESTIC_ENDPOINT ?? "http://127.0.0.1:9070/text-query";
  if (source === endpoint) throw new Error("source 与 target 必须不同，禁止在生产实例执行修订测试");
  runR3RefRepairScenario(endpoint)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      console.log("R3_REF_REPAIR_PASS");
    })
    .catch((error) => {
      console.error("ERR", error);
      process.exitCode = 1;
    });
}
