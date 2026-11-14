import { setMemoryClient } from "../../memory/client";
import { MnesticClient, type MnesticClientOptions } from "../../memory/mnesticClient";

export function openCodeClientOptions(options?: Record<string, unknown>): MnesticClientOptions {
  const optionEndpoint = options?.endpoint;
  const optionToken = options?.token;
  const optionTimeout = options?.timeoutMs;
  const timeoutValue = Number(optionTimeout ?? process.env.OPTIONMEMORY_TIMEOUT_MS);
  return {
    endpoint:
      typeof optionEndpoint === "string" && optionEndpoint.length > 0
        ? optionEndpoint
        : process.env.OPTIONMEMORY_ENDPOINT ??
          process.env.MNESTIC_ENDPOINT ??
          "http://127.0.0.1:9070/text-query",
    token:
      typeof optionToken === "string" && optionToken.length > 0
        ? optionToken
        : process.env.OPTIONMEMORY_TOKEN || undefined,
    timeoutMs: Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 5000,
  };
}

export function configureOpenCodeMemory(options?: Record<string, unknown>): void {
  setMemoryClient(new MnesticClient(openCodeClientOptions(options)));
}
