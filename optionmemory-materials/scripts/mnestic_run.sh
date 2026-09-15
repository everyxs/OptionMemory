#!/usr/bin/env bash
# Run a CozoScript file (or stdin) against the mnestic HTTP endpoint.
# Usage:
#   scripts/mnestic_run.sh path/to/query.cozo
#   cat query.cozo | scripts/mnestic_run.sh
# Env: MNESTIC_ENDPOINT (default http://127.0.0.1:9070/text-query)
set -euo pipefail

ENDPOINT="${MNESTIC_ENDPOINT:-http://127.0.0.1:9070/text-query}"
SRC="${1:-/dev/stdin}"

BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

# JSON-encode the script file (jq 不在机时以 node 代之)
node -e 'const fs=require("fs");const s=fs.readFileSync(0,"utf8");process.stdout.write(JSON.stringify({script:s}))' < "$SRC" > "$BODY"

curl -s -X POST -H "Content-Type: application/json" --data-binary @"$BODY" "$ENDPOINT" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.stringify(JSON.parse(s),null,2))}catch{process.stdout.write(s+"\n")}})'
