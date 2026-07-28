#!/usr/bin/env bash
# cfn-ab-critic — manifest shape, determinism, routing, and edge tests.
#
# STRAT-005: functional + edge + cleanup. The LLM judgment itself cannot run
# in a bash unit test, so this exercises the DETERMINISTIC mechanics only:
# shuffle determinism, manifest schema shape, suggestion-suppression logic,
# and exit-code routing for blocked / missing / unsupported / invalid input.
#
# Winner verdicts are INJECTED via --winner-file / --emit-fixture-winner so
# the routing logic is covered without a live model. execute.sh is designed
# so the winner can be injected for tests; that hook is the only reason the
# routing matrix below is fully coverable in a unit test.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXEC="$HERE/../execute.sh"
# shellcheck source=../../lib/shuffle.sh
source "$HERE/../lib/shuffle.sh"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ok: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL: $1"; }

TMP="$(mktemp -d)"
MANIFEST_DIR="$HERE/../../.cfn-cache/manifests"
mkdir -p "$MANIFEST_DIR"
trap 'rm -rf "$TMP"; rm -f "$MANIFEST_DIR/cfn-ab-critic-test-"*.json' EXIT

# Fixtures.
OURS_PNG="$HERE/fixtures/ours.png"
REF_PNG="$HERE/fixtures/reference.png"
OURS_HTML="$HERE/fixtures/ours.html"
REF_HTML="$HERE/fixtures/reference.html"

# Tiny fake .webm — content irrelevant, dispatch is by extension.
WEBM="$TMP/sample.webm"
printf 'not really a video' > "$WEBM"

# Which raw label (A or B) maps to "ours" for a given (ac_id, iteration)?
# Resolved from the deterministic shuffle so tests never hardcode the mapping.
raw_for_ours() {
  case "$(label_assignment "$1" "$2")" in
    A=ours,*) echo "A" ;;
    *)        echo "B" ;;
  esac
}
raw_for_ref() {
  case "$(label_assignment "$1" "$2")" in
    A=ours,*) echo "B" ;;
    *)        echo "A" ;;
  esac
}

# Write a winner-file JSON map for one AC.
write_winner() {
  # $1 ac, $2 raw_winner, $3 confidence (number), $4 biggest_gap
  jq -n --arg ac "$1" --arg w "$2" --argjson c "$3" --arg g "$4" \
    '{($ac): {raw_winner: $w, confidence: $c, biggest_gap: $g}}' > "$TMP/winner.json"
}

echo "## 1. manifest shape (fixture winner, vision-class artifacts)"

# Echo the BARE exit code. An "rc=N" prefix here makes every `[ "$RC" = "1" ]`
# assertion fail ("rc=1" != "1") — the bug behind the prior false negatives.
run() { "$EXEC" "$@" >"$TMP/out.txt" 2>"$TMP/err.txt"; echo $?; }
M="$TMP/m1.json"
RC=$(run --ac AC-shape --iteration 0 \
  --ours "$OURS_PNG" --reference "$REF_PNG" \
  --emit-fixture-winner A --threshold 0.75 --out "$M")
[ -s "$M" ] && ok "manifest emitted" || { bad "manifest not emitted"; exit 1; }
[ "$(jq -r .source "$M")" = "cfn-ab-critic" ] && ok "source field" || bad "source field"
[ -n "$(jq -r .review_id "$M")" ] && ok "review_id present" || bad "review_id"
[ "$(jq -r .status "$M")" = "pending_review" ] && ok "status pending_review" || bad "status"
jq -e '.comparisons[0].label_assignment | has("A") and has("B")' "$M" >/dev/null \
  && ok "label_assignment has A and B" || bad "label_assignment shape"
jq -e '.comparisons[0].confidence >= 0 and .comparisons[0].confidence <= 1' "$M" >/dev/null \
  && ok "confidence in [0,1]" || bad "confidence range"
[ -n "$(jq -r '.comparisons[0].biggest_gap' "$M")" ] && ok "biggest_gap non-empty" || bad "biggest_gap"
jq -e '.comparisons[0].winner == "ours" or .comparisons[0].winner == "reference" or .comparisons[0].winner == "tie"' "$M" >/dev/null \
  && ok "winner in vocabulary" || bad "winner value"
jq -e '.comparisons[0].status == "compared"' "$M" >/dev/null && ok "status compared" || bad "status compared"

echo "## 2. suggestion schema (when a suggestion is present)"

AC2="AC-sugg"; RAW_REF2=$(raw_for_ref "$AC2" 0)
write_winner "$AC2" "$RAW_REF2" 0.85 "ours renders the wrong hue"
M2="$TMP/m2.json"
RC2=$(run --ac "$AC2" --iteration 0 \
  --ours "$OURS_PNG" --reference "$REF_PNG" \
  --winner-file "$TMP/winner.json" --out "$M2")
[ "$RC2" = "1" ] && ok "findings exit 1" || bad "expected exit 1 got $RC2"
SUG_COUNT=$(jq '.suggestions | length' "$M2")
[ "$SUG_COUNT" -ge 1 ] && ok ">=1 suggestion emitted" || bad "no suggestions"
if [ "$SUG_COUNT" -ge 1 ]; then
  for field in id category tag one_liner title description files impact effort suggested_approach status; do
    jq -e --arg f "$field" '.suggestions[0] | has($f)' "$M2" >/dev/null \
      && ok "suggestion has $field" || bad "suggestion missing $field"
  done
  TAG=$(jq -r '.suggestions[0].tag' "$M2")
  { [ "$TAG" = "fix" ] || [ "$TAG" = "polish" ] || [ "$TAG" = "block" ]; } \
    && ok "tag '$TAG' in vocabulary" || bad "tag '$TAG' out of vocabulary"
fi

echo "## 3. determinism — identical (ac_id, iteration) reproduces assignment"

AC3="AC-det"
M3A="$TMP/m3a.json"; M3B="$TMP/m3b.json"
run --ac "$AC3" --iteration 0 --ours "$OURS_PNG" --reference "$REF_PNG" \
    --emit-fixture-winner A --out "$M3A" >/dev/null 2>&1
run --ac "$AC3" --iteration 0 --ours "$OURS_PNG" --reference "$REF_PNG" \
    --emit-fixture-winner A --out "$M3B" >/dev/null 2>&1
LA_A=$(jq -c '.comparisons[0].label_assignment' "$M3A")
LA_B=$(jq -c '.comparisons[0].label_assignment' "$M3B")
[ "$LA_A" = "$LA_B" ] && ok "label_assignment reproducible ($LA_A)" || bad "assignment drifted: $LA_A vs $LA_B"
# And the assignment matches the sourceable helper.
EXP=$(label_assignment "$AC3" 0)
EXP_OBJ=$(case "$EXP" in A=ours,*) echo '{"A":"ours","B":"reference"}';;*) echo '{"A":"reference","B":"ours"}';;esac)
[ "$LA_A" = "$EXP_OBJ" ] && ok "assignment matches lib helper" || bad "lib/execute disagree"

echo "## 4. suggestion suppression — winner==ours and conf>=threshold"

AC4="AC-clean"; RAW_OURS4=$(raw_for_ours "$AC4" 0)
write_winner "$AC4" "$RAW_OURS4" 0.9 "tight match, ours slightly ahead"
M4="$TMP/m4.json"
RC4=$(run --ac "$AC4" --iteration 0 \
  --ours "$OURS_PNG" --reference "$REF_PNG" \
  --winner-file "$TMP/winner.json" --out "$M4")
[ "$RC4" = "0" ] && ok "clean exit 0" || bad "expected exit 0 got $RC4"
[ "$(jq '.suggestions | length' "$M4")" = "0" ] && ok "no suggestions" || bad "suggestions leaked"
jq -e '.comparisons[0].winner == "ours"' "$M4" >/dev/null && ok "winner recorded as ours" || bad "winner mis-recorded"

echo "## 5. block tag — reference wins at conf>=0.9"

AC5="AC-block"; RAW_REF5=$(raw_for_ref "$AC5" 0)
write_winner "$AC5" "$RAW_REF5" 0.95 "reference is decisively better"
M5="$TMP/m5.json"
RC5=$(run --ac "$AC5" --iteration 0 \
  --ours "$OURS_PNG" --reference "$REF_PNG" \
  --winner-file "$TMP/winner.json" --out "$M5")
[ "$RC5" = "1" ] && ok "findings exit 1" || bad "expected exit 1 got $RC5"
[ "$(jq -r '.suggestions[0].tag' "$M5")" = "block" ] && ok "tag block" || bad "expected block tag"
[ "$(jq -r '.suggestions[0].impact' "$M5")" = "high" ] && ok "block impact high" || bad "expected high impact"

echo "## 6. text/html ingest path (read dispatch)"

AC6="AC-html"; RAW_OURS6=$(raw_for_ours "$AC6" 0)
write_winner "$AC6" "$RAW_OURS6" 0.9 "html matches"
M6="$TMP/m6.json"
RC6=$(run --ac "$AC6" --iteration 0 \
  --ours "$OURS_HTML" --reference "$REF_HTML" \
  --winner-file "$TMP/winner.json" --out "$M6")
[ "$RC6" = "0" ] && ok "html clean exit 0" || bad "expected exit 0 got $RC6"
jq -e '.comparisons[0].status == "compared"' "$M6" >/dev/null && ok "html compared" || bad "html not compared"

echo "## 7. edge — missing reference"

M7="$TMP/m7.json"
RC7=$(run --ac AC-missing --iteration 0 \
  --ours "$OURS_PNG" --reference "/nonexistent/reference.png" \
  --emit-fixture-winner A --out "$M7")
[ "$RC7" = "4" ] && ok "missing reference exit 4" || bad "expected exit 4 got $RC7"
[ -s "$M7" ] && ok "blocked manifest still emitted" || bad "no manifest on blocked"
jq -e '.comparisons[0].status == "blocked"' "$M7" >/dev/null && ok "status blocked" || bad "status not blocked"
[ -n "$(jq -r '.comparisons[0].blocked_reason' "$M7")" ] && ok "blocked_reason present" || bad "no blocked_reason"

echo "## 8. edge — unsupported artifact (.webm)"

M8="$TMP/m8.json"
RC8=$(run --ac AC-webm --iteration 0 \
  --ours "$WEBM" --reference "$REF_PNG" \
  --emit-fixture-winner A --out "$M8")
[ "$RC8" = "4" ] && ok "webm exit 4" || bad "expected exit 4 got $RC8"
jq -e '.comparisons[0].status == "blocked"' "$M8" >/dev/null && ok "webm blocked" || bad "webm not blocked"
jq -e '.comparisons[0].blocked_reason | test("webm")' "$M8" >/dev/null \
  && ok "blocked_reason names webm" || bad "blocked_reason missing webm"

echo "## 9. edge — confidence out of [0,1] rejected"

write_winner "AC-badconf" "A" 1.5 "should be rejected"
RC9=$(run --ac AC-badconf --iteration 0 \
  --ours "$OURS_PNG" --reference "$REF_PNG" \
  --winner-file "$TMP/winner.json" --out "$TMP/m9.json" 2>"$TMP/err9.txt")
[ "$RC9" = "3" ] && ok "bad confidence exit 3" || bad "expected exit 3 got $RC9"

echo "## 10. edge — invalid raw_winner rejected"

jq -n '{("AC-badraw"): {raw_winner: "X", confidence: 0.5, biggest_gap: "x"}}' > "$TMP/winner.json"
RC10=$(run --ac AC-badraw --iteration 0 \
  --ours "$OURS_PNG" --reference "$REF_PNG" \
  --winner-file "$TMP/winner.json" --out "$TMP/m10.json" 2>"$TMP/err10.txt")
[ "$RC10" = "3" ] && ok "bad raw_winner exit 3" || bad "expected exit 3 got $RC10"

echo "## 11. edge — usage error (no --ac)"

RC11=$(run --iteration 0 --out "$TMP/m11.json" 2>"$TMP/err11.txt")
[ "$RC11" = "2" ] && ok "no --ac exit 2" || bad "expected exit 2 got $RC11"

echo "## 12. prompt mode — no winner source emits blinded prompt, no manifest"

M12="$TMP/m12.json"
# run() already sends execute.sh stdout to $TMP/out.txt. Do NOT add a second
# redirection here: it swallows the bare-rc echo (-> empty RC12) AND leaves
# out.txt holding the prompt while out12.txt holds only the rc line, so the
# "blinded prompt" grep below misses. The prompt lives in $TMP/out.txt.
RC12=$(run --ac AC-prompt --iteration 0 \
  --ours "$OURS_PNG" --reference "$REF_PNG" --out "$M12")
[ "$RC12" = "0" ] && ok "prompt mode exit 0" || bad "expected exit 0 got $RC12"
[ ! -f "$M12" ] && ok "no manifest in prompt mode" || bad "manifest leaked in prompt mode"
grep -q "artifact_A" "$TMP/out.txt" && ok "blinded labels emitted" || bad "no blinded prompt"
# Prompt must NOT reveal which side is ours. It uses only artifact_A/artifact_B.
if grep -qE 'A=(ours|reference)|B=(ours|reference)' "$TMP/out.txt"; then
  bad "prompt leaked ours/reference mapping"
else
  ok "prompt did not leak ours/reference identity"
fi

echo
echo "==================================="
echo "PASS=$PASS  FAIL=$FAIL"
echo "==================================="
[ "$FAIL" -eq 0 ]
