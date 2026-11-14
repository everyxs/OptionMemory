import { MnesticClient } from "./mnesticClient";

let client = new MnesticClient();

export function setMemoryClient(next: MnesticClient): void {
  client = next;
}

export function getMemoryClient(): MnesticClient {
  return client;
}
