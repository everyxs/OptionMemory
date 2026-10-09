#!/usr/bin/env bash
# check_s01_sixtuple.sh —— S01 行级六元组点核（取 predicate == "composition" 一条）。
# 逐字段打印值与非空判定；j_premise_ids=[]、j_rule_id/lin_theta=null 为设计允许的空形态。
# 退出码：0 = 必填字段全非空；1 = 查询出错 / 有必填字段为空 / 无此行。
set -euo pipefail

ENDPOINT="${MNESTIC_ENDPOINT:-http://127.0.0.1:9070/text-query}"

QUERY='?[claim, layer, j_premise_ids, j_rule_id, eps_type, eps_value, eps_source, lin_source, lin_version, lin_theta, lin_actor, verify] := *facts{predicate, claim, layer, j_premise_ids, j_rule_id, eps_type, eps_value, eps_source, lin_source, lin_version, lin_theta, lin_actor, verify}, predicate == "composition"'

printf '%s' "$QUERY" | node -e '
const fs = require("fs");
process.stdout.write(JSON.stringify({ script: fs.readFileSync(0, "utf8") }));
' | curl -s -X POST -H "Content-Type: application/json" --data-binary @- "$ENDPOINT" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const r = JSON.parse(s);
  if (r.ok === false) { console.log("ERR: " + r.message); process.exit(1); }
  if (r.rows.length === 0) { console.log("ERR: 无 composition 行"); process.exit(1); }
  const nullable = new Set(["j_premise_ids", "j_rule_id", "lin_theta"]);
  let bad = 0;
  r.headers.forEach((h, i) => {
    const v = r.rows[0][i];
    const empty = v === null || v === "" || (Array.isArray(v) && v.length === 0);
    const ok = !empty || nullable.has(h);
    if (!ok) bad++;
    console.log(
      (ok ? "✓ " : "✗ ") + h.padEnd(14) + " = " + JSON.stringify(v) +
      (empty && nullable.has(h) ? "  （设计可空）" : ""),
    );
  });
  console.log(bad === 0 ? "→ 六要素非空（可空字段豁免）" : `→ ${bad} 个必填字段为空`);
  process.exit(bad === 0 ? 0 : 1);
});
'
