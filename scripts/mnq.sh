#!/usr/bin/env bash
# mnq.sh —— mnestic 查询助手：把参数里的 CozoScript POST 给本地实例并格式化输出。
# 用法：scripts/mnq.sh '?[count(id)] := *facts{id}'
#   （Env: MNESTIC_ENDPOINT，默认 http://127.0.0.1:9070/text-query）
# 退出码：0 = 查询成功；1 = mnestic 报错；2 = 用法错误。
set -euo pipefail

ENDPOINT="${MNESTIC_ENDPOINT:-http://127.0.0.1:9070/text-query}"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 '<CozoScript>'" >&2
  exit 2
fi

printf '%s' "$1" | node -e '
const fs = require("fs");
process.stdout.write(JSON.stringify({ script: fs.readFileSync(0, "utf8") }));
' | curl -s -X POST -H "Content-Type: application/json" --data-binary @- "$ENDPOINT" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const r = JSON.parse(s);
  if (r.ok === false) {
    console.log("ERR: " + r.message);
    process.exit(1);
  }
  console.log(r.headers.join(" | "));
  r.rows.forEach((row) =>
    console.log(row.map((c) => JSON.stringify(c)).join(" | ")),
  );
  console.log(`(${r.rows.length} rows)`);
});
'
