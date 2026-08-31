#!/usr/bin/env bash
# test-garden.sh - TDD coverage for the garden section (lib/section-garden.sh):
# the run as a growing plant. Espalier v1: jq-grown SVG (static-complete) +
# inline WebGL overlay (hand-written, LYGIA chunks pasted). See
# planning/garden-skin/PLAN_garden-skin.md for the contract.
#
# Run: bash .claude/skills/cfn-workbench/tests/test-garden.sh

set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RENDER="$SKILL_DIR/render.sh"

TMP_OUT="$(mktemp -d)"
trap 'rm -rf "$TMP_OUT"' EXIT

PASS=0
FAIL=0
FAILED_TESTS=()

if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_NC=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_NC=""
fi

ok()   { PASS=$((PASS+1)); printf "  ${C_GREEN}PASS${C_NC}  %s\n" "$1"; }
fail() { FAIL=$((FAIL+1)); FAILED_TESTS+=("$1"); printf "  ${C_RED}FAIL${C_NC}  %s\n" "$1"; }

assert_contains() {
  local name="$1" file="$2" needle="$3"
  if grep -qF -- "$needle" "$file"; then ok "$name"
  else fail "$name (missing: $needle)"; fi
}

assert_not_contains() {
  local name="$1" file="$2" needle="$3"
  if grep -qF -- "$needle" "$file"; then fail "$name (found banned: $needle)"
  else ok "$name"; fi
}

assert_match() {
  local name="$1" file="$2" regex="$3"
  if grep -qE -- "$regex" "$file"; then ok "$name"
  else fail "$name (no match: $regex)"; fi
}

assert_no_match() {
  local name="$1" file="$2" regex="$3"
  if grep -qE -- "$regex" "$file"; then fail "$name (matched banned: $regex)"
  else ok "$name"; fi
}

assert_count() {
  local name="$1" file="$2" pattern="$3" expected="$4"
  local got
  got=$(grep -oE -- "$pattern" "$file" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$got" -eq "$expected" ]]; then ok "$name ($got)"
  else fail "$name (expected=$expected got=$got)"; fi
}

# Garden slice of the page: from sec-garden to the next section id.
garden_slice() {
  local file="$1" out="$2"
  awk '/id="sec-garden"/{f=1} f{print} f && /<\/section>/{exit}' "$file" > "$out"
}

echo "=== cfn-workbench garden test suite ==="
echo "skill dir: $SKILL_DIR"
echo

# ---------------------------------------------------------------
# Fixture: run "plant" - 2 waves, 4 lanes, gate fail + iterate (2 iterations)
# ---------------------------------------------------------------
ROOT="$(mktemp -d)"
mkdir -p "$ROOT/planning/plant" "$ROOT/tmp"

cat > "$ROOT/planning/plant/run-plan-plant.json" <<'JSON'
{"slug":"plant","generated_at":"2026-08-29T12:00:00Z","phases":["Wave 1","Wave 2"],
 "lanes":[{"id":"seedling","name":"Seedling","phase":"Wave 1"},
          {"id":"sprout","name":"Sprout","phase":"Wave 1"},
          {"id":"x<img>\"","name":"XSS","phase":"Wave 1"},
          {"id":"bloom","name":"Bloom","phase":"Wave 2"}]}
JSON
cat > "$ROOT/planning/plant/lanes-plant.json" <<'JSON'
{"slug":"plant","waves":[["seedling","sprout","x<img>\""],["bloom"]]}
JSON
cat > "$ROOT/tmp/cfn-events-plant.jsonl" <<'JSONL'
{"ts":"2026-08-29T12:00:00Z","event":"loop_started"}
{"ts":"2026-08-29T12:00:10Z","event":"lane_spawned","lane":"seedling"}
{"ts":"2026-08-29T12:01:00Z","event":"lane_landed","lane":"seedling"}
{"ts":"2026-08-29T12:02:00Z","event":"lane_spawned","lane":"sprout"}
{"ts":"2026-08-29T12:05:00Z","event":"gate_verdict","detail":"P/T exit 1"}
{"ts":"2026-08-29T12:06:00Z","event":"loop_started"}
{"ts":"2026-08-29T12:06:10Z","event":"lane_spawned","lane":"bloom"}
JSONL
# Blocked lane: latest lane report carries non-null blocked_on.
cat > "$ROOT/tmp/lane-report-plant-0-sprout.json" <<'JSON'
{"lane":"sprout","blocked_on":"bloom: needs API fixture"}
JSON

OUT_A="$TMP_OUT/plant.html"
WORKBENCH_NO_LAUNCH=1 "$RENDER" --slug plant --root "$ROOT" --out "$OUT_A" >/dev/null 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "render exit 0 (got=$RC)"
else
  ok "render exit 0"

  SLICE="$TMP_OUT/plant-slice.html"
  garden_slice "$OUT_A" "$SLICE"
  # Slice must be non-empty (awk fence found the section).
  [[ -s "$SLICE" ]] && ok "garden slice extracted" || fail "garden slice empty"

  # [1] Section + svg roots.
  assert_contains "garden: section id present" "$OUT_A" 'id="sec-garden"'
  assert_contains "garden: svg root class" "$SLICE" 'class="garden-svg"'

  # [2] One leaf node per lane with status classes.
  assert_contains "garden: landed leaf node" "$SLICE" \
    'data-lane="seedling" data-status="landed"'
  assert_contains "garden: blocked leaf node" "$SLICE" \
    'data-lane="sprout" data-status="blocked"'
  assert_contains "garden: in-flight leaf node" "$SLICE" \
    'data-lane="bloom" data-status="in-flight"'
  assert_contains "garden: pending bud node" "$SLICE" \
    'data-lane="x&lt;img&gt;&quot;" data-status="pending"'
  assert_count "garden: leaf group per lane (4)" "$SLICE" 'class="g-leaf[^"]*"' 4
  assert_match "garden: landed modifier class" "$SLICE" 'g-leaf[^"]* g-open'
  assert_match "garden: pending modifier class" "$SLICE" 'g-leaf[^"]* g-bud'
  assert_match "garden: in-flight shimmer class" "$SLICE" 'g-leaf[^"]* g-shimmer'
  assert_match "garden: blocked modifier class" "$SLICE" 'g-leaf[^"]* g-blocked'
  assert_match "garden: thorn on blocked lane" "$SLICE" 'class="g-thorn"'

  # [3] Scars = iterations survived - 1 (2 loop_started -> 1 scar).
  assert_count "garden: one scar for iteration 2" "$SLICE" 'class="g-scar"' 1

  # [4] Gate fail -> wilted head (not flower).
  assert_contains "garden: wilted head on gate fail" "$SLICE" 'class="g-wilted-head"'
  assert_not_contains "garden: no flower on gate fail" "$SLICE" 'class="g-flower"'

  # [5] Determinism: garden slice byte-identical across renders (epoch is
  # wall-clock, normalized; whole-file cmp would hit header timestamps).
  OUT_A2="$TMP_OUT/plant2.html"
  WORKBENCH_NO_LAUNCH=1 "$RENDER" --slug plant --root "$ROOT" --out "$OUT_A2" >/dev/null 2>&1
  SLICE2="$TMP_OUT/plant-slice2.html"
  garden_slice "$OUT_A2" "$SLICE2"
  sed 's/data-generated-epoch="[0-9]*"/data-generated-epoch="E"/' "$SLICE" > "$TMP_OUT/a-norm.html"
  sed 's/data-generated-epoch="[0-9]*"/data-generated-epoch="E"/' "$SLICE2" > "$TMP_OUT/a2-norm.html"
  if cmp -s "$TMP_OUT/a-norm.html" "$TMP_OUT/a2-norm.html"; then
    ok "garden: deterministic re-render"
  else
    fail "garden: re-render differs"
  fi

  # [6] XSS: raw payload never present outside escaped attr.
  assert_not_contains "garden: raw <img> not present" "$SLICE" '<img>"'
  assert_contains "garden: lane title escaped" "$SLICE" 'x&lt;img&gt;&quot;'

  # [7] Shader inline: script block + canvas, zero script src=.
  assert_match "garden: fragment shader block inline" "$SLICE" \
    '<script type="x-shader/x-fragment" id="garden-shader">'
  assert_contains "garden: overlay canvas present" "$SLICE" '<canvas class="garden-canvas"'
  assert_no_match "garden: no script src= anywhere" "$OUT_A" '<script[^>]*\ssrc='

  # [8] Reduced-motion guard in CSS and overlay JS.
  assert_count "garden: prefers-reduced-motion guards (>=2)" "$SLICE" \
    'prefers-reduced-motion' 2

  # [9] Wilt source epoch on the section root.
  assert_match "garden: generated epoch baked" "$SLICE" \
    'data-generated-epoch="[0-9]+"'

  # [13] Overlay capability check hides canvas without WebGL.
  assert_match "garden: webgl capability check" "$SLICE" \
    "getContext\('webgl'"

  # [14] Context loss hides the canvas: a lost WebGL context presents an
  # uninitialized (white) buffer; under mix-blend-mode:screen that white-washes
  # the whole stage over the SVG plant. Repro: 2026-08-31 Playwright session
  # (CONTEXT_LOST_WEBGL in console -> white plate screenshot).
  assert_match "garden: webglcontextlost guard hides canvas" "$SLICE" \
    "addEventListener\('webglcontextlost'"

  # [12] No em dash in the slice.
  assert_not_contains "garden: no em dash char" "$SLICE" $'—'
  assert_not_contains "garden: no &mdash;" "$SLICE" "&mdash;"

  # LYGIA attribution comment.
  assert_match "garden: LYGIA attribution present" "$SLICE" 'LYGIA'

  # [11] Nav anchor.
  assert_contains "garden: nav anchor present" "$OUT_A" 'href="#sec-garden"'
fi

# ---------------------------------------------------------------
# Gate-pass variant: flower at the apex.
# ---------------------------------------------------------------
cat > "$ROOT/tmp/cfn-events-plant.jsonl" <<'JSONL'
{"ts":"2026-08-29T12:00:00Z","event":"loop_started"}
{"ts":"2026-08-29T12:00:10Z","event":"lane_spawned","lane":"seedling"}
{"ts":"2026-08-29T12:01:00Z","event":"lane_landed","lane":"seedling"}
{"ts":"2026-08-29T12:05:00Z","event":"gate_verdict","detail":"P/T exit 0"}
JSONL
rm -f "$ROOT/tmp/lane-report-plant-0-sprout.json"
OUT_B="$TMP_OUT/flower.html"
WORKBENCH_NO_LAUNCH=1 "$RENDER" --slug plant --root "$ROOT" --out "$OUT_B" >/dev/null 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "flower render exit 0 (got=$RC)"
else
  ok "flower render exit 0"
  SLICE_B="$TMP_OUT/flower-slice.html"
  garden_slice "$OUT_B" "$SLICE_B"
  assert_contains "flower: gate pass blooms" "$SLICE_B" 'class="g-flower"'
  assert_not_contains "flower: no wilted head on pass" "$SLICE_B" 'class="g-wilted-head"'
  assert_count "flower: no scar for iteration 1" "$SLICE_B" 'class="g-scar"' 0
fi
rm -rf "$ROOT"

# ---------------------------------------------------------------
# Empty root: section renders empty state, exit 0, gap recorded.
# ---------------------------------------------------------------
EMPTY_ROOT="$(mktemp -d)"
mkdir -p "$EMPTY_ROOT/planning"
OUT_E="$TMP_OUT/empty.html"
WORKBENCH_NO_LAUNCH=1 "$RENDER" --slug barren --root "$EMPTY_ROOT" --out "$OUT_E" >/dev/null 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "empty render exit 0 (got=$RC)"
else
  ok "empty render exit 0"
  assert_contains "empty: section id still present" "$OUT_E" 'id="sec-garden"'
  assert_match "empty: empty-state copy" "$OUT_E" "(no run plan|No run plan|no data)"
  assert_contains "empty: gap recorded in footer" "$OUT_E" 'Data gaps'
fi
rm -rf "$EMPTY_ROOT"

echo
TOTAL=$((PASS + FAIL))
echo "===================================================="
printf "Result: ${C_GREEN}%d PASS${C_NC} / ${C_RED}%d FAIL${C_NC} / %d TOTAL\n" \
  "$PASS" "$FAIL" "$TOTAL"
if [[ "${#FAILED_TESTS[@]}" -gt 0 ]]; then
  echo "Failed tests:"
  for t in "${FAILED_TESTS[@]}"; do echo "  - $t"; done
fi
echo "===================================================="

if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
exit 0
