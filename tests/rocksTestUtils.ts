import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitReady(port: number, deadlineMs = 15_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: "HEAD" });
      if (res.ok) return;
    } catch {
      // 实例尚未就绪，继续等
    }
    if (Date.now() - started > deadlineMs) throw new Error(`RocksDB test server not ready on :${port}`);
    await sleep(250);
  }
}

async function applySchema(port: number): Promise<void> {
  const endpoint = `http://127.0.0.1:${port}/text-query`;
  const dir = resolve("schema");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".cozo")).sort();
  for (const file of files) {
    const text = await readFile(resolve(dir, file), "utf8");
    for (const block of text.split(/\r?\n\s*\r?\n/)) {
      const hasStatement = block.split(/\r?\n/).some((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
      if (!hasStatement) continue;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ script: block }),
      });
      const data: any = await res.json().catch(() => null);
      if (data?.message?.includes("conflicts with an existing one") || data?.message?.includes("already exists")) continue;
      if (!res.ok || data?.ok === false) throw new Error(`apply schema ${file} failed: ${data?.message ?? res.status}`);
    }
  }
}

async function terminate(child: ChildProcess): Promise<void> {
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    await new Promise((resolve) => killer.once("exit", resolve));
    return;
  }
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000),
  ]);
}

export interface RocksTestServer {
  endpoint: string;
  directory: string;
  stop: (options?: { preserve?: boolean }) => Promise<void>;
}

export async function startRocksTestServer(port = 9075, existingDirectory?: string): Promise<RocksTestServer> {
  const directory = existingDirectory ?? await mkdtemp(resolve(".data/rocksdb-test-"));
  const exe = resolve(process.platform === "win32" ? "target/debug/mnestic-mem-adapter.exe" : "target/debug/mnestic-mem-adapter");
  if (!existsSync(exe)) throw new Error(`mnestic adapter binary not found: ${exe}`);
  const child: ChildProcess = spawn(exe, ["--engine", "rocksdb", "--data", directory, "--port", String(port)], { stdio: "ignore" });
  try {
    await waitReady(port);
    await applySchema(port);
  } catch (error) {
    await terminate(child);
    if (!existingDirectory) await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    endpoint: `http://127.0.0.1:${port}/text-query`,
    directory,
    stop: async (options = {}) => {
      await terminate(child);
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        sleep(2000),
      ]);
      if (!options.preserve) await rm(directory, { recursive: true, force: true });
    },
  };
}
