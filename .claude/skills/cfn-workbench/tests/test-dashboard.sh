#!/usr/bin/env bash
# test-dashboard.sh - TDD coverage for the project-wide dashboard
# (dashboard.sh + lib/section-map-all.sh): one transit line per loop run in the
# project, combined on one page.
#
# Run: bash .claude/skills/cfn-workbench/tests/test-dashboard.sh

set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DASH="$SKILL_DIR/dashboard.sh"
FIX="$SKILL_DIR/tests/fixtures"

ROOT="$(mktemp -d)"
mkdir -p "$ROOT/planning" "$ROOT/tmp"

TMP_OUT="$(mktemp -d)"
# Unique /tmp-only slug so parallel suite runs cannot collide.
OTMP_SLUG="dashC-$$"
trap 'rm -rf "$TMP_OUT" "$ROOT" "/tmp/cfn-events-${OTMP_SLUG}-foreign.jsonl"' EXIT

PASS=0
FAIL=0
FAILED_TESTS=()

if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_NC=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_NC=""
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

assert_file_exists() {
  if [[ -f "$2" ]]; then ok "$1"
  else fail "$1 (no file: $2)"; fi
}

assert_count() {
  local name="$1" file="$2" pattern="$3" expected="$4"
  local got
  got=$(grep -oE -- "$pattern" "$file" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$got" -eq "$expected" ]]; then ok "$name ($got)"
  else fail "$name (expected=$expected got=$got)"; fi
}

echo "=== cfn-workbench dashboard test suite ==="
echo "skill dir: $SKILL_DIR"
echo

# ---------------------------------------------------------------
# GROUP 1: multi-run render (per-plan dir + legacy flat + /tmp events)
# ---------------------------------------------------------------
echo "[1] combined render: 3 runs on one page"

mkdir -p "$ROOT/planning/dashA"
cat > "$ROOT/planning/dashA/run-plan-dashA.json" <<'JSON'
{"slug":"dashA","generated_at":"2026-08-11T12:00:00Z","phases":["Wave 1","Wave 2"],
 "lanes":[{"id":"alpha","name":"Alpha","phase":"Wave 1"},
          {"id":"beta","name":"Beta","phase":"Wave 1"},
          {"id":"gamma","name":"Gamma","phase":"Wave 2"}]}
JSON
cat > "$ROOT/tmp/cfn-events-dashA.jsonl" <<'JSONL'
{"ts":"2026-08-11T12:00:00Z","event":"loop_started"}
{"ts":"2026-08-11T12:00:10Z","event":"lane_spawned","lane":"alpha","phase":"Wave 1"}
{"ts":"2026-08-11T12:01:00Z","event":"lane_landed","lane":"alpha"}
{"ts":"2026-08-11T12:02:00Z","event":"lane_spawned","lane":"beta","phase":"Wave 1"}
{"ts":"2026-08-11T12:05:00Z","event":"gate_verdict","detail":"P/T exit 1"}
{"ts":"2026-08-11T12:06:00Z","event":"loop_started"}
JSONL

# Legacy flat plan; last event 12:30 -> most recent -> must be listed FIRST.
cat > "$ROOT/planning/run-plan-dashB.json" <<'JSON'
{"slug":"dashB","generated_at":"2026-08-11T12:00:00Z","phases":["Wave 1"],
 "lanes":[{"id":"delta","name":"Delta","phase":"Wave 1"},
          {"id":"x<img>\"","name":"XSS","phase":"Wave 1"}]}
JSON
cat > "$ROOT/tmp/cfn-events-dashB.jsonl" <<'JSONL'
{"ts":"2026-08-11T12:00:00Z","event":"loop_started"}
{"ts":"2026-08-11T12:10:00Z","event":"lane_spawned","lane":"delta","phase":"Wave 1"}
{"ts":"2026-08-11T12:30:00Z","event":"lane_landed","lane":"delta"}
JSONL

# Plan-less run, events under ROOT tmp only: single wave from lane_spawned.
# A lookalike FOREIGN slug lives in /tmp ONLY and must NOT appear (machine-
# global /tmp streams carry no project marker and never discover a run).
cat > "$ROOT/tmp/cfn-events-${OTMP_SLUG}.jsonl" <<'JSONL'
{"ts":"2026-08-11T12:03:00Z","event":"loop_started"}
{"ts":"2026-08-11T12:04:00Z","event":"lane_spawned","lane":"epsilon"}
JSONL
cat > "/tmp/cfn-events-${OTMP_SLUG}-foreign.jsonl" <<'JSONL'
{"ts":"2026-08-29T23:59:00Z","event":"loop_started"}
{"ts":"2026-08-29T23:59:30Z","event":"lane_spawned","lane":"zeta"}
JSONL

OUT_DASH="$TMP_OUT/dash.html"
WORKBENCH_NO_LAUNCH=1 "$DASH" --root "$ROOT" --out "$OUT_DASH" 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "dashboard render exit 0 (got=$RC)"
else
  ok "dashboard render exit 0"
  assert_file_exists "dashboard wrote HTML" "$OUT_DASH"
  assert_contains "dash: section id present" "$OUT_DASH" 'id="sec-dashboard"'

  # All three runs present.
  assert_contains "dashA run band present" "$OUT_DASH" 'data-run="dashA"'
  assert_contains "dashB run band present" "$OUT_DASH" 'data-run="dashB"'
  assert_contains "tmp-only run band present" "$OUT_DASH" "data-run=\"${OTMP_SLUG}\""

  # Sorted by last activity desc: dashB (12:30) before dashA (12:06).
  # Bands render as one long line, so compare byte offsets, not line numbers.
  PB=$(grep -bo 'data-run="dashB"' "$OUT_DASH" | head -1 | cut -d: -f1)
  PA=$(grep -bo 'data-run="dashA"' "$OUT_DASH" | head -1 | cut -d: -f1)
  if [[ -n "$PB" && -n "$PA" && "$PB" -lt "$PA" ]]; then
    ok "sorted by last activity (dashB before dashA)"
  else fail "sorted by last activity (dashB@$PB vs dashA@$PA)"; fi

  # Distinct line colors: run index classes dash-run-0 and dash-run-1 both used.
  assert_match "dash: line class dash-run-0 used" "$OUT_DASH" 'dash-run-0'
  assert_match "dash: line class dash-run-1 used" "$OUT_DASH" 'dash-run-1'

  # Per-run derivation on the combined page.
  assert_match "dashA alpha landed" "$OUT_DASH" \
    'data-lane="alpha" data-status="landed"'
  assert_match "dashA beta in-flight" "$OUT_DASH" \
    'data-lane="beta" data-status="in-flight"'
  assert_match "dashA gamma pending" "$OUT_DASH" \
    'data-lane="gamma" data-status="pending"'
  assert_match "dashB delta landed" "$OUT_DASH" \
    'data-lane="delta" data-status="landed"'
  assert_match "plan-less epsilon in-flight (root tmp events)" "$OUT_DASH" \
    "data-lane=\"epsilon\" data-status=\"in-flight\""
  assert_not_contains "foreign /tmp-only slug NOT discovered" "$OUT_DASH" \
    "${OTMP_SLUG}-foreign"

  # Gate + iteration chips on runA (fail verdict, 2x loop_started).
  assert_contains "dashA gate fail class" "$OUT_DASH" 'map-gate-fail'
  assert_match "dashA iteration badge = 2" "$OUT_DASH" 'data-iteration="2"'

  # In-flight lane gets a train with baked transform (JS-off completeness).
  assert_match "dash: train for beta with baked transform" "$OUT_DASH" \
    '<g class="map-train" data-lane="beta"[^>]*transform="translate\([0-9]+,[0-9]+\)"'

  # Failed gate + later loop_started -> dashed loop-back on the run band.
  assert_match "dash: loop-back path present" "$OUT_DASH" '<path[^>]*class="map-loop"'

  # Vision-pass fixes (2026-08-28): band readability contract.
  # Gate text label removed: gate chip in run header + <title> carry it; the
  # old y=34 label collided with the last station label. (Legend still spells
  # "gate" inside a .map-key span; that one stays.)
  assert_not_contains "dash: no gate text label" "$OUT_DASH" \
    'class="map-label" y="34">gate'
  # Station labels moved above the line (rel y=-22, abs 32); y=30 (abs 84)
  # collided with the loop-back curve and iterate text below the line.
  assert_not_contains "dash: station labels not below line" "$OUT_DASH" \
    'class="map-label" y="30"'
  assert_match "dash: station labels above line" "$OUT_DASH" \
    'class="map-label" y="-22"'
  # Label width scales with station spacing (mono 10px, ~6px/char), so labels
  # cannot overrun the 34px minimum step. Dash svg sets its own label size;
  # the shared .map-label font only applies via map-tier-* which dash lacks.
  assert_match "dash: dash-scoped label font size" "$OUT_DASH" \
    '\.dash-svg \.map-label\{font-size:10px'
  # Every wave gets a tick, W1 included (was wave>0 only, hid W1).
  assert_contains "dash: W1 wave tick present" "$OUT_DASH" '>W1<'
  assert_contains "dash: W2 wave tick present" "$OUT_DASH" '>W2<'

  # Lane id payload escaped (from dashB plan JSON).
  assert_contains "dash: lane id XSS escaped" "$OUT_DASH" 'data-lane="x&lt;img&gt;&quot;"'
  assert_not_contains "dash: raw <img> not present" "$OUT_DASH" '<img>"'

  # Self-containment + copy rules.
  assert_no_match "dash: no <link tag" "$OUT_DASH" "<link[[:space:]>/]"
  assert_no_match "dash: no script src=" "$OUT_DASH" '<script[^>]*\ssrc='
  if grep -oE 'src="[^"]*"' "$OUT_DASH" | grep -vq '^src="data:'; then
    fail "dash: found non-data: src="
  else ok "dash: all src= are data:"; fi
  if grep -oE 'href="[^"]*"' "$OUT_DASH" | grep -vqE '^href="(data:|#)'; then
    fail "dash: found non-data/non-fragment href="
  else ok "dash: all href= are data:/fragment"; fi
  assert_not_contains "dash: no em dash char" "$OUT_DASH" $'—'
  assert_not_contains "dash: no &mdash;" "$OUT_DASH" "&mdash;"
fi

# ---------------------------------------------------------------
# GROUP 2: empty project
# ---------------------------------------------------------------
echo "[2] empty project"
EMPTY_ROOT="$(mktemp -d)"
OUT_EMPTY="$TMP_OUT/empty.html"
"$DASH" --root "$EMPTY_ROOT" --out "$OUT_EMPTY" 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "empty render exit 0 (got=$RC)"
else
  ok "empty render exit 0"
  assert_file_exists "empty render wrote HTML" "$OUT_EMPTY"
  assert_contains "empty: section id still present" "$OUT_EMPTY" 'id="sec-dashboard"'
  assert_match "empty: empty-state copy" "$OUT_EMPTY" "(no runs|No runs|no data)"
fi
rm -rf "$EMPTY_ROOT"

# ---------------------------------------------------------------
# GROUP 3: run cap + overflow note
# ---------------------------------------------------------------
echo "[3] cap (default 12, overflow note)"
CAP_ROOT="$(mktemp -d)"
mkdir -p "$CAP_ROOT/planning"
for i in $(seq 1 14); do
  printf '{"slug":"cap%d","generated_at":"2026-08-11T12:%02d:00Z","phases":["W1"],"lanes":[{"id":"l%d","phase":"W1"}]}' \
    "$i" "$i" "$i" > "$CAP_ROOT/planning/run-plan-cap${i}.json"
done
OUT_CAP="$TMP_OUT/cap.html"
"$DASH" --root "$CAP_ROOT" --out "$OUT_CAP" 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "cap render exit 0 (got=$RC)"
else
  ok "cap render exit 0"
  assert_count "cap: exactly 12 run bands" "$OUT_CAP" 'data-run="cap' 12
  assert_contains "cap: overflow note names hidden count" "$OUT_CAP" "2 more"
fi
# Explicit cap override raises the ceiling.
OUT_CAP20="$TMP_OUT/cap20.html"
"$DASH" --root "$CAP_ROOT" --out "$OUT_CAP20" --max-lines 20 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "cap20 render exit 0 (got=$RC)"
else
  ok "cap20 render exit 0"
  assert_count "cap20: all 14 run bands" "$OUT_CAP20" 'data-run="cap' 14
fi
rm -rf "$CAP_ROOT"

# ---------------------------------------------------------------
# GROUP 4: CLI contract
# ---------------------------------------------------------------
echo "[4] CLI contract"

"$DASH" --help >/dev/null 2>&1
[[ $? -eq 0 ]] && ok "--help exits 0" || fail "--help nonzero"

"$DASH" --root "$ROOT" --live notanumber --out "$TMP_OUT/bad.html" >/dev/null 2>&1
[[ $? -eq 2 ]] && ok "bad --live exits 2" || fail "bad --live exit code"

OUT_LIVE="$TMP_OUT/live.html"
"$DASH" --root "$ROOT" --out "$OUT_LIVE" --live 10 2>&1 >/dev/null
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "live render exit 0 (got=$RC)"
else
  ok "live render exit 0"
  assert_contains "live: meta refresh injected" "$OUT_LIVE" \
    '<meta http-equiv="refresh" content="10">'
fi

"$DASH" --root /nonexistent-dir-$$ --out "$TMP_OUT/nodir.html" >/dev/null 2>&1
[[ $? -eq 2 ]] && ok "missing --root exits 2" || fail "missing --root exit code"

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
