import {
  registerControlledOptionImplementation,
  type OptionImplementationContext,
  type OptionImplementationResult,
} from "./option-executor";

export type NativeSkillHandler = (
  args: Record<string, unknown>,
  context: OptionImplementationContext,
) => Promise<OptionImplementationResult>;

const nativeSkills = new Map<string, NativeSkillHandler>();

export function registerNativeSkillOption(piType: string, piRef: string, handler: NativeSkillHandler): void {
  nativeSkills.set(`${piType}:${piRef}`, handler);
  registerControlledOptionImplementation(piType, piRef, async (args, context) => {
    if (context.signal.aborted) throw new DOMException("Native Skill execution cancelled", "AbortError");
    const native = nativeSkills.get(`${piType}:${piRef}`);
    if (!native) throw new Error(`Native Skill adapter is not registered: ${piType}:${piRef}`);
    const result = await native(args, context);
    if (context.signal.aborted) throw new DOMException("Native Skill execution cancelled", "AbortError");
    return result;
  });
}
