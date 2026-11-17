#!/usr/bin/env bash
# 一键按序建表：schema/01_facts.cozo 起，按文件名顺序应用全部两位编号关系
# 注意：mnestic 一次请求只执行一条语句（实测：多 :create 只有最后一条生效），
# 故每个文件按空行切分为独立语句逐条 POST；全部成功后打印每表结构供核对。
# 用法：schema/apply_all.sh   （Env: MNESTIC_ENDPOINT，默认 127.0.0.1:9070）
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENDPOINT="${MNESTIC_ENDPOINT:-http://127.0.0.1:9070/text-query}"
TABLES=(facts rules justifications subtasks options models procedural_knowledge plan_templates)
SCHEMA_FILES=("$HERE"/0[1-9]_*.cozo "$HERE"/1[0-9]_*.cozo)
if (($#)); then SCHEMA_FILES=("$@"); fi
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

post() { # $1 = CozoScript 文本 → stdout = 响应 JSON
  printf '%s' "$1" | node -e 'const fs=require("fs");const s=fs.readFileSync(0,"utf8");process.stdout.write(JSON.stringify({script:s}))' > "$TMPD/body.json"
  curl -s -X POST -H "Content-Type: application/json" --data-binary @"$TMPD/body.json" "$ENDPOINT"
}

is_err() { # stdin = 响应 JSON；若 ok===false 则打印 message 并返回 0（表示"是错误"）
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s);if(r&&r.ok===false){console.log(r.message);process.exit(0)}}catch{}process.exit(1)})'
}

fmt() { # stdin = NamedRows JSON → 对齐文本表
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.ok===false){console.log("ERR: "+r.message);return}
const cell=c=>typeof c==="string"?c:JSON.stringify(c);
const w=r.headers.map(h=>h.length);
r.rows.forEach(row=>row.forEach((c,i)=>{w[i]=Math.max(w[i],Math.min(cell(c).length,44))}));
const line=arr=>arr.map((c,i)=>cell(c).padEnd(w[i]).slice(0,44)).join(" | ");
console.log(line(r.headers));console.log(w.map(x=>"-".repeat(x)).join("-+-"));
r.rows.forEach(row=>console.log(line(row)))})'
}

for f in "${SCHEMA_FILES[@]}"; do
  echo "=== $(basename "$f")"
  rm -f "$TMPD"/blk_*
  awk -v outdir="$TMPD" 'BEGIN{RS="";} {print > (outdir "/blk_" NR)}' "$f"
  for b in "$TMPD"/blk_*; do
    grep -qE '^[[:space:]]*[^#[:space:]]' "$b" || continue   # 跳过纯注释/空段
    first="$(grep -m1 -E '^[[:space:]]*[^#[:space:]]' "$b" | tr -d '\r' | cut -c1-48)"
    resp="$(post "$(cat "$b")")"
    if err="$(printf '%s' "$resp" | is_err)"; then
      printf '  FAIL  %s\n         %s\n' "$first" "$err" >&2
      exit 1
    fi
    printf '  OK    %s\n' "$first"
  done
done

echo
echo "=== ::relations ==="
post "::relations" | fmt
for t in "${TABLES[@]}"; do
  echo
  echo "--- ::columns $t"
  post "::columns $t" | fmt
  echo "--- ::indices $t"
  post "::indices $t" | fmt
done
