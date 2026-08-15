#!/usr/bin/env bash
# test-grounding.sh - functional + edge-case tests for Bar K (check-grounding.sh).
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BAR="$SKILL_DIR/bars/check-grounding.sh"

PASS=0; FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
check(){ [[ "$2" == "$3" ]] && ok "$1" || bad "$1 (got '$2', want '$3')"; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/cfn-groundtest-XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM

rules() { python3 -c "import json,sys;print(','.join(sorted({r['rule'] for r in json.load(sys.stdin)})))"; }

cat > "$TMP/sources.md" <<'EOF'
# Sources
| ID | Source | Format |
|---|---|---|
| SRC-1 | Margolis, Bullseye Customer | pdf |
| SRC-2 | Granola transcript 2026-08-01 | transcript |
EOF

clean_doc() {
cat > "$1" <<'EOF'
# Proposal

Adoption stalls at the handoff [C-1], so the wedge is the ops lead [C-2].
We assume budget holds [C-3].

## Claims Ledger

| ID | Claim | Type | Source | Locator | Confidence |
|---|---|---|---|---|---|
| C-1 | Adoption stalls at handoff | EVIDENCE | SRC-1 | p.42 | high |
| C-2 | Ops lead is the wedge | INFERENCE | C-1 | - | medium |
| C-3 | Budget holds through Q4 | ASSUMPTION | - | - | low |
EOF
}

echo "== clean doc passes =="
clean_doc "$TMP/clean.md"
OUT=$("$BAR" "$TMP/clean.md" "$TMP/sources.md"); RC=$?
check "exit 0 clean" "$RC" "0"
check "empty findings" "$(echo "$OUT" | tr -d ' \n')" "[]"

echo "== G7 no ledger =="
printf '# Doc\n\nClaims with no ledger.\n' > "$TMP/g7.md"
OUT=$("$BAR" "$TMP/g7.md"); RC=$?
check "G7 exit 1" "$RC" "1"
check "G7 rule"   "$(echo "$OUT" | rules)" "G7"

echo "== G1 prose cites unknown claim =="
clean_doc "$TMP/g1.md"
sed -i 's/\[C-2\]/[C-9]/' "$TMP/g1.md"
OUT=$("$BAR" "$TMP/g1.md" "$TMP/sources.md"); RC=$?
check "G1 exit 1" "$RC" "1"
check "G1+G3 (C-2 now orphaned)" "$(echo "$OUT" | rules)" "G1,G3"

echo "== G2 EVIDENCE missing locator =="
clean_doc "$TMP/g2.md"
sed -i 's/| SRC-1 | p.42 |/| SRC-1 | - |/' "$TMP/g2.md"
check "G2 rule" "$("$BAR" "$TMP/g2.md" "$TMP/sources.md" | rules)" "G2"

echo "== G3 orphan ledger row =="
clean_doc "$TMP/g3.md"
sed -i 's/We assume budget holds \[C-3\]./We assume budget holds./' "$TMP/g3.md"
check "G3 rule" "$("$BAR" "$TMP/g3.md" "$TMP/sources.md" | rules)" "G3"

echo "== G4 unknown source id =="
clean_doc "$TMP/g4.md"
sed -i 's/| SRC-1 | p.42 |/| SRC-7 | p.42 |/' "$TMP/g4.md"
check "G4 with sources file" "$("$BAR" "$TMP/g4.md" "$TMP/sources.md" | rules)" "G4"
check "G4 skipped without sources file" "$("$BAR" "$TMP/g4.md" | rules)" ""

echo "== G5 duplicate id =="
clean_doc "$TMP/g5.md"
sed -i 's/| C-3 | Budget holds through Q4 | ASSUMPTION | - | - | low |/| C-1 | Budget holds through Q4 | ASSUMPTION | - | - | low |/' "$TMP/g5.md"
check "G5 present" "$("$BAR" "$TMP/g5.md" "$TMP/sources.md" | rules | grep -c G5)" "1"

echo "== G6 bad type =="
clean_doc "$TMP/g6.md"
sed -i 's/| ASSUMPTION | - | - | low |/| VIBES | - | - | low |/' "$TMP/g6.md"
check "G6 rule" "$("$BAR" "$TMP/g6.md" "$TMP/sources.md" | rules)" "G6"

echo "== G8 bad confidence =="
clean_doc "$TMP/g8.md"
sed -i 's/| p.42 | high |/| p.42 | very-sure |/' "$TMP/g8.md"
check "G8 rule" "$("$BAR" "$TMP/g8.md" "$TMP/sources.md" | rules)" "G8"

echo "== G9 inference with no upstream claim =="
clean_doc "$TMP/g9.md"
sed -i 's/| C-2 | Ops lead is the wedge | INFERENCE | C-1 | - | medium |/| C-2 | Ops lead is the wedge | INFERENCE | - | - | medium |/' "$TMP/g9.md"
check "G9 rule" "$("$BAR" "$TMP/g9.md" "$TMP/sources.md" | rules)" "G9"

echo "== usage errors =="
"$BAR" >/dev/null 2>&1;                       check "exit 2 no args"        "$?" "2"
"$BAR" "$TMP/nope.md" >/dev/null 2>&1;        check "exit 2 missing doc"    "$?" "2"
"$BAR" "$TMP/clean.md" "$TMP/nope.md" >/dev/null 2>&1; check "exit 2 missing sources" "$?" "2"

echo "== ledger with trailing section still parses =="
clean_doc "$TMP/tail.md"
printf '\n## Next Steps\n\n| not | a | ledger | row |\n' >> "$TMP/tail.md"
check "trailing table ignored" "$("$BAR" "$TMP/tail.md" "$TMP/sources.md"; echo $?)" "[]
0"

echo
echo "passed=$PASS failed=$FAIL"
[[ $FAIL -eq 0 ]]
