/**
 * vitest globalSetup：拉起测试专用 mnestic Mem 实例（端口见 testServer.ts）并建表。
 *
 * 依赖已编译的适配层二进制 target/debug/mnestic-mem-adapter(.exe)；
 * 缺失时先构建：cargo build --manifest-path server/Cargo.toml
 * （scripts/mnestic_start.sh 会在二进制缺失时自动触发构建）。
 * 建表逻辑与 schema/apply_all.sh 一致：按空行切分语句、跳过纯注释段、逐条 POST。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TEST_PORT } from "./testServer";

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const QUERY_URL = `${BASE_URL}/text-query`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitReady(deadlineMs: number): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE_URL}/`, { method: "HEAD" });
      if (res.ok) return;
    } catch {
      // 实例尚未就绪，继续等
    }
    if (Date.now() - t0 > deadlineMs) {
      throw new Error(
        `mnestic test server not ready on :${TEST_PORT} within ${deadlineMs}ms`,
      );
    }
    await sleep(250);
  }
}

async function applySchema(): Promise<void> {
  const dir = resolve("schema");
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".cozo"))
    .sort();
  for (const f of files) {
    const text = await readFile(resolve(dir, f), "utf8");
    for (const block of text.split(/\r?\n\s*\r?\n/)) {
      const hasStatement = block
        .split(/\r?\n/)
        .some((l) => l.trim().length > 0 && !l.trim().startsWith("#"));
      if (!hasStatement) continue;
      const res = await fetch(QUERY_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ script: block }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.ok === false) {
        throw new Error(
          `apply schema ${f} failed: ${data?.message ?? `HTTP ${res.status}`}`,
        );
      }
    }
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  const exe = resolve(
    process.platform === "win32"
      ? "target/debug/mnestic-mem-adapter.exe"
      : "target/debug/mnestic-mem-adapter",
  );
  if (!existsSync(exe)) {
    throw new Error(
      `mnestic adapter binary not found: ${exe}\n` +
        `先构建：cargo build --manifest-path server/Cargo.toml（或运行 scripts/mnestic_start.sh）`,
    );
  }
  const child: ChildProcess = spawn(exe, ["--port", String(TEST_PORT)], {
    stdio: "ignore",
  });
  await waitReady(15_000);
  await applySchema();
  return async () => {
    child.kill();
  };
}
