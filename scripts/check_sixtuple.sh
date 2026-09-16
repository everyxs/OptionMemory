#!/usr/bin/env bash
# 六元组字段点核：对 facts / options / models / procedural_knowledge 四表
# 按 §2.1 设计逐字段确认存在（✓）或缺失（✗）。
EP="${MNESTIC_ENDPOINT:-http://127.0.0.1:9070/text-query}"

check() {
  local t=$1; shift
  local cols miss=0
  cols=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"script\":\"::columns $t\"}" "$EP")
  echo "=== $t"
  for f in "$@"; do
    if printf '%s' "$cols" | grep -q "\"$f\""; then
      echo "  ✓ $f"
    else
      echo "  ✗ 缺 $f"; miss=1
    fi
  done
  [ "$miss" -eq 0 ] && echo "  → 齐全" || echo "  → 有缺失"
}

# facts：六元组全件（claim/layer/J系/ε系/lin系/verify）
check facts claim layer j_premise_ids j_rule_id \
  eps_type eps_value eps_source \
  lin_source lin_version lin_theta lin_actor verify

# options（2026-09-15 修订后）：layer 已补；J 系 = rule_ref + j_premise_ids；lin 系设计为 3 件
check options claim layer rule_ref j_premise_ids \
  eps_type eps_value eps_source \
  lin_source lin_version lin_theta verify

# models（2026-09-15 修订后）：claim/layer/ε 系已补；J 系为 j_records
check models claim layer j_records \
  eps_type eps_value eps_source \
  lin_source lin_version lin_theta lin_actor verify

# procedural_knowledge（2026-09-15 修订后）：layer 已补；J 系即 s/o/m 三元组；ε 系为 eps_value/eps_ceiling
check procedural_knowledge claim layer s_id o_id m_id \
  eps_value eps_ceiling \
  lin_source lin_version lin_theta lin_actor verify
