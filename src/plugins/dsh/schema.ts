import type { ParameterSchemaSpec, ValueSchemaSpec } from "@deepseek-ai/dsh-tools" with { "resolution-mode": "import" };
import { toolContractToJsonSchema, type ToolContract } from "../../api/tool-contracts";
import type { z } from "zod";

interface JsonSchema {
  type?: string;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: unknown;
  enum?: unknown[];
  const?: unknown;
}

function toValueSchema(schema: JsonSchema): ValueSchemaSpec {
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (alternatives && alternatives.length > 0) {
    if (alternatives.length === 1) return toValueSchema(alternatives[0]);
    return { oneOf: alternatives.map(toValueSchema) as [ValueSchemaSpec, ValueSchemaSpec, ...ValueSchemaSpec[]] };
  }
  switch (schema.type) {
    case "string":
      return { type: "string", ...(schema.enum ? { enum: schema.enum as string[] } : {}), ...(schema.const !== undefined ? { const: schema.const as string } : {}) };
    case "number":
      return { type: "number", ...(schema.enum ? { enum: schema.enum as number[] } : {}), ...(schema.const !== undefined ? { const: schema.const as number } : {}) };
    case "integer":
      return { type: "integer", ...(schema.enum ? { enum: schema.enum as number[] } : {}), ...(schema.const !== undefined ? { const: schema.const as number } : {}) };
    case "boolean":
      return { type: "boolean", ...(schema.enum ? { enum: schema.enum as boolean[] } : {}), ...(schema.const !== undefined ? { const: schema.const as boolean } : {}) };
    case "null":
      return { type: "null" };
    case "array":
      return { type: "array", ...(schema.items ? { items: toValueSchema(schema.items) } : {}) };
    case "object": {
      const required = new Set(schema.required ?? []);
      const properties = schema.properties
        ? Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [
            key,
            { ...toValueSchema(value), ...(required.has(key) ? { required: true as const } : {}) },
          ])) as ParameterSchemaSpec
        : undefined;
      return {
        type: "object",
        ...(properties ? { properties } : {}),
        additionalProperties: schema.additionalProperties !== false,
      };
    }
    default:
      return { type: "json" };
  }
}

export function dshParametersFromZodShape(args: z.ZodRawShape): ParameterSchemaSpec {
  return dshParametersFromContract({ name: "bridge", description: "", phase: 4, readOnly: true, args });
}

export function dshParametersFromContract(contract: ToolContract<z.ZodRawShape>): ParameterSchemaSpec {
  const schema = toolContractToJsonSchema(contract) as JsonSchema;
  const required = new Set(schema.required ?? []);
  return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, value]) => [
    key,
    { ...toValueSchema(value), ...(required.has(key) ? { required: true as const } : {}) },
  ]));
}
