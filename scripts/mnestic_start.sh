#!/usr/bin/env bash
# One-click start: mnestic memory engine.
#
# 模式：
#   scripts/mnestic_start.sh --mem              # Mem（内存、非持久化；默认）
#   scripts/mnestic_start.sh --rocks            # RocksDB 持久化（数据目录 .data/mnestic）
# 公共参数：--port <n>（默认 9070）；数据目录可用 MNESTIC_DATA_DIR 覆盖。
#
# 注意：
# - rocks 模式要求二进制以 storage-rocksdb feature 编译（server/Cargo.toml 已启用）；
#   该 feature 的 bindgen 依赖 libclang —— 未设 LIBCLANG_PATH 时本脚本探测用户级 LLVM
#   （%LOCALAPPDATA%\LLVM）。首次构建耗时长（librocksdb-sys 为 C++ 源码编译）。
# - Mem 引擎重启即丢数据：重启后须重跑 schema/apply_all.sh + scripts/seed_s01.ts
#   （rocks 模式 schema 与数据均持久，无需重建）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # repo root (optionmemory)
TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT/target}"
EXE="$TARGET_DIR/debug/mnestic-mem-adapter"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) EXE="$EXE.exe";; esac

MODE="mem"
PASSTHRU=()
for a in "$@"; do
  case "$a" in
    --mem) MODE="mem";;
    --rocks|--rocksdb) MODE="rocksdb";;
    *) PASSTHRU+=("$a");;
  esac
done

DATA_DIR="${MNESTIC_DATA_DIR:-$ROOT/.data/mnestic}"
if [[ "$MODE" == "rocksdb" ]]; then
  mkdir -p "$DATA_DIR"
fi

# bindgen 依赖 libclang；未设置 LIBCLANG_PATH 时探测用户级 LLVM 安装。
if [[ -z "${LIBCLANG_PATH:-}" && -f "$HOME/AppData/Local/LLVM/bin/libclang.dll" ]]; then
  export LIBCLANG_PATH="$HOME/AppData/Local/LLVM/bin"
fi

if [[ ! -f "$EXE" ]]; then
  echo "[mnestic_start] binary not found — building (shared target)..."
  CARGO_TARGET_DIR="$TARGET_DIR" cargo build --manifest-path "$ROOT/server/Cargo.toml"
fi

echo "[mnestic_start] starting mnestic engine=$MODE (data: $DATA_DIR; default port 9070)"
exec "$EXE" --engine "$MODE" --data "$DATA_DIR" "${PASSTHRU[@]}"
