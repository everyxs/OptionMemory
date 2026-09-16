#!/usr/bin/env bash
# One-click start: mnestic memory engine in Mem (in-memory, non-persistent) mode.
# Serves the CozoScript HTTP endpoint and an interactive REPL. Default port 9070.
# Usage: scripts/mnestic_start.sh [--port <n>]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # repo root (option-memory-core)
TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT/target}"
EXE="$TARGET_DIR/debug/mnestic-mem-adapter"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) EXE="$EXE.exe";; esac

if [[ ! -f "$EXE" ]]; then
  echo "[mnestic_start] binary not found — building (offline, shared target)..."
  CARGO_TARGET_DIR="$TARGET_DIR" cargo build --offline --manifest-path "$ROOT/server/Cargo.toml"
fi

echo "[mnestic_start] starting mnestic engine=mem (default port 9070; override: --port <n>)"
exec "$EXE" "$@"
