import type { GateResult } from "./nuGate";
import type { FactInput } from "../memory/schema";
import { getLocale, MESSAGE_CODES, message } from "./i18n";

const PROTECTED_REFERENCE_PREDICATES = new Set(["ref_smix", "ref_delta"]);

const OVERWRITE_CLAIM = /(原(?:始)?(?:参考)?值|原参考值).{0,12}(?:已|已经)?(?:被)?(?:证明|证实).{0,6}(?:错误|有误)|v2.{0,12}(?:自证|证明).{0,6}(?:正确|外部)|original(?: reference)? value.{0,24}(?:proven|confirmed).{0,12}(?:wrong|incorrect)|v2.{0,24}(?:self[- ]?proven|proves?).{0,12}(?:correct|external)/i;
const SELF_EXTERNAL_VALIDATION = /(?:v2|修正版|复算).{0,16}(?:外部验证|外部正确|独立验证)|R3.{0,12}(?:已获|已经获得|通过).{0,6}外部验证|(?:v2|corrected|recomputed).{0,24}(?:external validation|externally correct|independent validation)|R3.{0,24}(?:received|passed).{0,12}external validation/i;
const MIXED_CERTIFICATION = /(?:全部|整体|统一|混合).{0,12}(?:认证成功率|外部正确率)|(?:认证成功率|外部正确率).{0,8}(?:全部|整体|统一|混合)|(?:overall|combined|mixed|uniform).{0,24}(?:certification success rate|external correctness rate)|(?:certification success rate|external correctness rate).{0,24}(?:overall|combined|mixed|uniform)/i;

export function checkR3ReferenceMutation(fact: FactInput): GateResult {
  if (PROTECTED_REFERENCE_PREDICATES.has(fact.predicate)) {
    return {
      gate: "blocked",
      code: "state",
      reason: `${fact.predicate} is original reference evidence and cannot be overwritten`,
    };
  }
  return { gate: "pass" };
}

export function evaluateR3AgentStatement(statement: string): GateResult {
  const reasons = [
    ...OVERWRITE_CLAIM.test(statement) ? [message(MESSAGE_CODES.R3_OVERWRITE_CLAIM, "zh-CN")] : [],
    ...SELF_EXTERNAL_VALIDATION.test(statement) ? [message(MESSAGE_CODES.R3_SELF_EXTERNAL_VALIDATION, "zh-CN")] : [],
    ...MIXED_CERTIFICATION.test(statement) ? [message(MESSAGE_CODES.R3_MIXED_CERTIFICATION, "zh-CN")] : [],
  ];
  return reasons.length === 0
    ? { gate: "pass" }
    : { gate: "blocked", code: "state", reason: reasons.join(getLocale("zh-CN") === "zh-CN" ? "；" : "; ") };
}

export interface R3NewEvidenceAuthorization {
  approvalStatus: "approved" | "pending" | "rejected";
  actor: string;
  evidenceType: "high_precision_composition" | "maintainer_confirmation";
}

export function checkR3NewEvidenceAuthorization(input: R3NewEvidenceAuthorization): GateResult {
  if (input.approvalStatus !== "approved") {
    return { gate: "blocked", code: "state", reason: "new source evidence has not been approved" };
  }
  if (!input.actor.trim()) {
    return { gate: "blocked", code: "completeness", reason: "evidence approver is required" };
  }
  return { gate: "pass" };
}

export interface R3QualityGroup {
  count: number;
  internalConsistent: number;
  originalReferenceAgreement: number;
  independentExternalValidated: number;
}

export interface R3CertificationInput {
  originalMatch: R3QualityGroup;
  pendingSourceReview: R3QualityGroup;
  pendingReviewUsedAsIndependentEvidence?: boolean;
}

export function summarizeR3CertificationEvidence(input: R3CertificationInput) {
  const total = input.originalMatch.count + input.pendingSourceReview.count;
  if (total !== 701) throw new Error(`expected 701 evidence rows, got ${total}`);
  const internalTotal = input.originalMatch.internalConsistent + input.pendingSourceReview.internalConsistent;
  const originalAgreementTotal = input.originalMatch.originalReferenceAgreement + input.pendingSourceReview.originalReferenceAgreement;
  const externalValidated = input.originalMatch.independentExternalValidated;
  const pendingUsed = input.pendingReviewUsedAsIndependentEvidence === true;
  return {
    internalConsistencyRate: internalTotal / total,
    originalReferenceAgreementRate: originalAgreementTotal / total,
    externalCertification: {
      evidenceCount: externalValidated,
      successRate: externalValidated / input.originalMatch.count,
      evidenceSource: "original_match_only",
      accepted: !pendingUsed,
    },
    pendingReviewCount: input.pendingSourceReview.count,
    pendingReviewUsedAsIndependentEvidence: pendingUsed,
    r4Status: "blocked" as const,
  };
}
