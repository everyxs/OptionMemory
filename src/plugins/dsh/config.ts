import { setMemoryClient } from "../../memory/client";
import { MnesticClient, type MnesticClientOptions } from "../../memory/mnesticClient";

export function configureDshMemory(options: Record<string, unknown> = {}): void {
  const timeoutValue = Number(options.timeoutMs ?? process.env.OPTIONMEMORY_TIMEOUT_MS);
  const clientOptions: MnesticClientOptions = {
    endpoint:
      typeof options.endpoint === "string" && options.endpoint.length > 0
        ? options.endpoint
        : process.env.OPTIONMEMORY_ENDPOINT ??
          process.env.MNESTIC_ENDPOINT ??
          "http://127.0.0.1:9070/text-query",
    token:
      typeof options.token === "string" && options.token.length > 0
        ? options.token
        : process.env.OPTIONMEMORY_TOKEN || undefined,
    timeoutMs: Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 5000,
  };
  setMemoryClient(new MnesticClient(clientOptions));
}
