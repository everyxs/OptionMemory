import { z } from "zod";

export interface ToolContract<Args extends z.ZodRawShape> {
  name: string;
  description: string;
  phase: 1 | 2 | 3 | 4 | 5 | 6;
  readOnly: boolean;
  args: Args;
}

function defineToolContract<Args extends z.ZodRawShape>(
  contract: ToolContract<Args>,
): ToolContract<Args> {
  return contract;
}

const nullableString = z.string().nullable().optional();
const jsonObject = z.record(z.string(), z.unknown());
const status = z.enum(["in", "out", "archived", "contested"]);

export const memorySetContract = defineToolContract({
  name: "memory_set",
  description: "Write a fact with provenance and quality metadata into OptionMemory",
  phase: 1,
  readOnly: false,
  args: {
    predicate: z.string(),
    args: z.array(z.string()).optional(),
    claim: z.string(),
    layer: z.string(),
    jPremiseIds: z.array(z.string()),
    jRuleId: nullableString,
    epsType: z.string(),
    epsValue: z.number(),
    epsSource: z.string(),
    linSource: z.string(),
    linVersion: z.string(),
    linTheta: nullableString,
    linActor: z.string(),
    verify: z.string(),
    status: status.optional(),
    embedding: z.array(z.number()).nullable().optional(),
  },
});

export const memoryGetContract = defineToolContract({
  name: "memory_get",
  description: "Get a complete OptionMemory fact by id",
  phase: 1,
  readOnly: true,
  args: { id: z.string() },
});

export const memoryQueryContract = defineToolContract({
  name: "memory_query",
  description: "Run a read-only CozoScript query against OptionMemory facts",
  phase: 1,
  readOnly: true,
  args: { datalog: z.string() },
});

export const proposeOptionContract = defineToolContract({
  name: "propose_option",
  description: "Register an atomic OptionMemory option with initiation, policy and outcome schemas",
  phase: 1,
  readOnly: false,
  args: {
    option_id: z.string(),
    claim: z.string(),
    layer: z.string(),
    option_type: z.enum(["atomic", "agent", "template_compiled"]).optional(),
    template_id: nullableString,
    i_preconditions: jsonObject,
    pi_type: z.string(),
    pi_ref: z.string(),
    pi_fallback: z.string(),
    beta_success: jsonObject,
    beta_output_schema: jsonObject,
    rule_ref: z.string().nullable(),
    j_premise_ids: z.array(z.string()),
    eps_type: z.string(),
    eps_value: z.number(),
    eps_source: z.string(),
    lin_source: z.string(),
    lin_version: z.string(),
    lin_theta: z.string().nullable(),
    verify: z.string(),
    status: z.string(),
    subtask_binding: z.string(),
    model_binding: z.string(),
  },
});

export const memoryRetractContract = defineToolContract({
  name: "memory_retract",
  description: "Retract a fact, propagate invalidation, and preserve its revision history",
  phase: 2,
  readOnly: false,
  args: {
    id: z.string(),
    actor: z.string().optional(),
  },
});

const governanceArgs = {
  option_id: z.string(),
  factId: z.string(),
  opposingFactId: z.string(),
  proposer: z.string(),
  arbiter: z.string(),
  executor: z.string().optional(),
  rationale: z.string().optional(),
  policyVersion: z.string().optional(),
};

export const settleContract = defineToolContract({
  name: "settle",
  description: "Settle the higher-priority hardness measurement and preserve its governance chain",
  phase: 3,
  readOnly: false,
  args: governanceArgs,
});

export const revokeContract = defineToolContract({
  name: "revoke",
  description: "Revoke the lower-priority hardness measurement and retain it as dormant history",
  phase: 3,
  readOnly: false,
  args: governanceArgs,
});

export const OPTIONMEMORY_TOOL_CONTRACTS = {
  memory_set: memorySetContract,
  memory_get: memoryGetContract,
  memory_query: memoryQueryContract,
  memory_retract: memoryRetractContract,
  propose_option: proposeOptionContract,
  settle: settleContract,
  revoke: revokeContract,
} as const;

export function toolContractToJsonSchema(
  contract: ToolContract<z.ZodRawShape>,
): Record<string, unknown> {
  return z.toJSONSchema(z.object(contract.args)) as Record<string, unknown>;
}
