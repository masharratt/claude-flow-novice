#!/usr/bin/env bash
# test-live-sections.sh - TDD coverage for the cfn-workbench live-transparency
# features: staleness banner (F2), roster section (F3), events feed (F4),
# and their wiring into render.sh nav/output.
#
# Asserts against contracts in workbench-live-contracts.md. Written before the
# implementation exists; expected to FAIL until watch.sh/emit-event.sh/
# lib/section-roster.sh/lib/section-events.sh land and render.sh is wired.
#
# Run: bash .claude/skills/cfn-workbench/tests/test-live-sections.sh

set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RENDER="$SKILL_DIR/render.sh"
EMIT="$SKILL_DIR/emit-event.sh"
FIX="$SKILL_DIR/tests/fixtures"

# Stage a realistic runtime layout in a temp root, same pattern as
# test-render.sh: fixture SOURCES ship under data/ (non-ignored paths); copy
# them into the runtime paths render.sh reads (.cfn-cache/, tmp/, planning/).
ROOT="$(mktemp -d)"
mkdir -p "$ROOT/.cfn-cache/manifests" "$ROOT/tmp" "$ROOT/planning" "$ROOT/tests/screenshots"
cp "$FIX"/data/manifests/*    "$ROOT/.cfn-cache/manifests/" 2>/dev/null || true
cp "$FIX"/data/lane-tmp/*     "$ROOT/tmp/"                  2>/dev/null || true
# planning/ holds dotfile fixtures; the bare * glob skips dotfiles, so copy
# the dir contents including hidden entries (this also carries in our new
# run-plan-workbench.json fixture).
cp -a "$FIX/planning/."       "$ROOT/planning/"              2>/dev/null || true
cp "$FIX"/tests/screenshots/* "$ROOT/tests/screenshots/"    2>/dev/null || true

TMP_OUT="$(mktemp -d)"
DEFAULT_EMIT_FILE="/tmp/cfn-events-wbtest-emit-live-$$.jsonl"
trap 'rm -rf "$TMP_OUT" "$ROOT" "$DEFAULT_EMIT_FILE"' EXIT

# Counters
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

assert_exit() {
  local name="$1" expected="$2"; shift 2
  "$@" >/dev/null 2>&1; local rc=$?
  if [[ "$rc" -eq "$expected" ]]; then ok "$name (exit=$rc)"
  else fail "$name (expected exit=$expected got=$rc)"; fi
}

assert_file_exists() {
  if [[ -f "$2" ]]; then ok "$1"
  else fail "$1 (no file: $2)"; fi
}

# assert_count NAME FILE REGEX EXPECTED
assert_count() {
  local name="$1" file="$2" pattern="$3" expected="$4"
  local got
  got=$(grep -oE -- "$pattern" "$file" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$got" -eq "$expected" ]]; then ok "$name ($got)"
  else fail "$name (expected=$expected got=$got)"; fi
}

echo "=== cfn-workbench live-sections test suite ==="
echo "skill dir: $SKILL_DIR"
echo

# ---------------------------------------------------------------
# GROUP 1: full render, slug "workbench" (roster + events populated)
# ---------------------------------------------------------------
echo "[1] full render: roster + events populated"
OUT_FULL="$TMP_OUT/full.html"
"$RENDER" --slug "workbench" --root "$ROOT" --out "$OUT_FULL" --no-screenshots 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "full render exit 0 (got=$RC)"
else
  ok "full render exit 0"
  assert_file_exists "full render wrote HTML" "$OUT_FULL"

  # --- roster (F3) ---
  assert_contains "roster: section id present" "$OUT_FULL" 'id="sec-roster"'
  assert_contains "roster: headline (2 of 4 lanes landed)" "$OUT_FULL" "2 of 4 lanes landed"
  assert_contains "roster: frontend lane listed" "$OUT_FULL" "frontend"
  assert_contains "roster: backend lane listed" "$OUT_FULL" "backend"
  assert_contains "roster: qa lane listed" "$OUT_FULL" "qa"
  assert_contains "roster: docs lane listed" "$OUT_FULL" "docs"
  assert_count "roster: 2 lane-landed pills" "$OUT_FULL" 'class="lane-landed"' 2
  assert_count "roster: 1 lane-inflight pill" "$OUT_FULL" 'class="lane-inflight"' 1
  assert_count "roster: 1 lane-pending pill" "$OUT_FULL" 'class="lane-pending"' 1
  # qa's Since column derives from its lane_spawned event ts (10:02:12Z -> 10:02).
  assert_contains "roster: qa since HH:MM (10:02)" "$OUT_FULL" "10:02"

  # --- events (F4) ---
  assert_contains "events: section id present" "$OUT_FULL" 'id="sec-events"'
  assert_contains "events: loop_started row" "$OUT_FULL" "loop_started"
  assert_contains "events: lane_spawned row" "$OUT_FULL" "lane_spawned"
  assert_contains "events: gate_started row" "$OUT_FULL" "gate_started"
  # Malformed JSONL line must be skipped silently, never echoed raw.
  assert_not_contains "events: malformed line not echoed" "$OUT_FULL" "this line is not valid json"
  # Only 7 valid rows (< 30 cap); no overflow note expected.
  assert_no_match "events: no overflow note under cap" "$OUT_FULL" "[0-9]+ earlier events not shown"

  # --- nav wiring ---
  assert_contains "nav: roster anchor" "$OUT_FULL" 'href="#sec-roster"'
  assert_contains "nav: events anchor" "$OUT_FULL" 'href="#sec-events"'

  # --- self-containment still holds ---
  assert_no_match "full: no <link tag" "$OUT_FULL" "<link[[:space:]>]"
  if grep -oE 'src="[^"]*"' "$OUT_FULL" | grep -vq '^src="data:'; then
    fail "full: found non-data: src="
  else ok "full: all src= are data:"; fi
  if grep -oE 'href="[^"]*"' "$OUT_FULL" | grep -vqE '^href="(data:|#)'; then
    fail "full: found non-data/non-fragment href="
  else ok "full: all href= are data:/fragment"; fi

  # --- no em dashes ---
  assert_not_contains "full: no em dash char" "$OUT_FULL" $'—'
  assert_not_contains "full: no &mdash;" "$OUT_FULL" "&mdash;"
fi

# ---------------------------------------------------------------
# GROUP 2: staleness banner (F2)
# ---------------------------------------------------------------
echo "[2] staleness banner"
OUT_BANNER="$TMP_OUT/banner.html"
"$RENDER" --slug "workbench_9col" --root "$ROOT" --out "$OUT_BANNER" --no-screenshots 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "banner render exit 0 (got=$RC)"
else
  ok "banner render exit 0"
  assert_contains "banner: element id present" "$OUT_BANNER" 'id="wb-staleness"'
  assert_match "banner: data-generated-epoch numeric" "$OUT_BANNER" 'data-generated-epoch="[0-9]+"'
  assert_contains "banner: fallback text says generated" "$OUT_BANNER" "generated"
  assert_contains "banner: UTC in fallback text" "$OUT_BANNER" "UTC"
  # thresholds as literals in the script
  assert_contains "banner: threshold 120 present" "$OUT_BANNER" "120"
  assert_contains "banner: threshold 600 present" "$OUT_BANNER" "600"
  # class names for the 3 buckets, defined as CSS selectors
  assert_match "banner: .stale-pill css rule" "$OUT_BANNER" '\.stale-pill\b'
  assert_match "banner: .stale-ok css rule" "$OUT_BANNER" '\.stale-ok\b'
  assert_match "banner: .stale-warn css rule" "$OUT_BANNER" '\.stale-warn\b'
  assert_match "banner: .stale-bad css rule" "$OUT_BANNER" '\.stale-bad\b'
  # JS text fragments per spec ("updated <N>s ago" / "updated <N>m ago")
  assert_contains "banner: 's ago' fragment" "$OUT_BANNER" "s ago"
  assert_contains "banner: 'm ago' fragment" "$OUT_BANNER" "m ago"
  # inline <script> tags must never carry src=
  assert_no_match "banner: no script src=" "$OUT_BANNER" '<script[^>]*\ssrc='
fi

# ---------------------------------------------------------------
# GROUP 3: roster + events gap handling (missing sources)
# ---------------------------------------------------------------
echo "[3] gap handling (missing run-plan, missing events file)"
# Slug workbench_5col has AC fixtures but no run-plan-workbench_5col.json and
# no cfn-events-workbench_5col.jsonl anywhere under ROOT/tmp or /tmp.
OUT_GAP="$TMP_OUT/gap.html"
"$RENDER" --slug "workbench_5col" --root "$ROOT" --out "$OUT_GAP" --no-screenshots 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "gap render exit 0 (got=$RC)"
else
  ok "gap render exit 0"
  assert_contains "gap: roster section id still present" "$OUT_GAP" 'id="sec-roster"'
  assert_contains "gap: events section id still present" "$OUT_GAP" 'id="sec-events"'
  # The gap names the canonical per-plan location (planning/<slug>/), which is where
  # the file SHOULD be, so the message doubles as the fix instruction.
  assert_contains "gap: run-plan gap message" "$OUT_GAP" \
    "planning/workbench_5col/run-plan-workbench_5col.json missing; roster skipped)"
  assert_contains "gap: events gap message" "$OUT_GAP" \
    "events feed (no cfn-events-workbench_5col.jsonl)"
  # Empty-state cards, not a bare empty table.
  assert_match "gap: roster/events have empty-state copy" "$OUT_GAP" \
    "(empty|no data|no lanes|no events|Data gap|data gap)"
fi

# ---------------------------------------------------------------
# GROUP 4: events feed 30-row cap (synthetic, generated at test time)
# ---------------------------------------------------------------
echo "[4] events cap (>30 rows)"
CAP_SLUG="workbench_9col"
CAP_EVENTS="$ROOT/tmp/cfn-events-${CAP_SLUG}.jsonl"
: > "$CAP_EVENTS"
for i in $(seq 1 35); do
  printf '{"ts":"2026-08-11T11:%02d:00Z","event":"phase_started","phase":"Phase %d"}\n' \
    "$((i % 60))" "$i" >> "$CAP_EVENTS"
done
printf '{not valid json at all\n' >> "$CAP_EVENTS"

OUT_CAP="$TMP_OUT/events-cap.html"
"$RENDER" --slug "$CAP_SLUG" --root "$ROOT" --out "$OUT_CAP" --no-screenshots 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "cap render exit 0 (got=$RC)"
else
  ok "cap render exit 0"
  assert_contains "cap: overflow note (5 earlier events not shown)" "$OUT_CAP" \
    "5 earlier events not shown"
fi
rm -f "$CAP_EVENTS"

# ---------------------------------------------------------------
# GROUP 5: emit-event.sh contract
# ---------------------------------------------------------------
echo "[5] emit-event.sh"

if [[ -x "$EMIT" ]]; then ok "emit-event.sh is executable"
elif [[ -f "$EMIT" ]]; then
  chmod +x "$EMIT" 2>/dev/null || true
  if [[ -x "$EMIT" ]]; then ok "emit-event.sh is executable (after chmod)"
  else fail "emit-event.sh exists but not executable"; fi
else fail "emit-event.sh missing"; fi

assert_exit "unknown event type exits 2" 2 \
  "$EMIT" --slug wbtest-emit --event bogus_event_type --file "$TMP_OUT/ev-bad.jsonl"
assert_exit "missing --slug exits 2" 2 \
  "$EMIT" --event loop_started --file "$TMP_OUT/ev-bad2.jsonl"
assert_exit "missing --event exits 2" 2 \
  "$EMIT" --slug wbtest-emit --file "$TMP_OUT/ev-bad3.jsonl"
assert_exit "--help exits 0" 0 \
  "$EMIT" --help

# Minimal required-only event: ts + event keys, no optional keys.
EV_BASIC="$TMP_OUT/ev-basic.jsonl"
rm -f "$EV_BASIC"
"$EMIT" --slug wbtest-emit --event loop_started --file "$EV_BASIC" >/dev/null 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "basic emit exit 0 (got=$RC)"
else
  ok "basic emit exit 0"
  assert_file_exists "basic emit wrote file" "$EV_BASIC"
  LINES=$(wc -l < "$EV_BASIC" | tr -d ' ')
  [[ "$LINES" -eq 1 ]] && ok "basic emit: exactly one line" || fail "basic emit: expected 1 line got $LINES"
  if jq -e 'has("ts") and has("event") and .event == "loop_started"' "$EV_BASIC" >/dev/null 2>&1; then
    ok "basic emit: has ts + event=loop_started"
  else fail "basic emit: missing ts/event fields"; fi
  if jq -e '(has("lane")|not) and (has("phase")|not) and (has("detail")|not)' "$EV_BASIC" >/dev/null 2>&1; then
    ok "basic emit: no optional keys when omitted"
  else fail "basic emit: unexpected optional keys present"; fi
fi

# Full event: all optional keys present when passed.
EV_FULL="$TMP_OUT/ev-full.jsonl"
rm -f "$EV_FULL"
"$EMIT" --slug wbtest-emit --event lane_spawned --lane frontend --phase "Phase 2" \
  --detail "starting lane" --file "$EV_FULL" >/dev/null 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "full emit exit 0 (got=$RC)"
else
  ok "full emit exit 0"
  if jq -e '.lane == "frontend" and .phase == "Phase 2" and .detail == "starting lane"' \
    "$EV_FULL" >/dev/null 2>&1; then
    ok "full emit: lane/phase/detail present and correct"
  else fail "full emit: optional keys missing or wrong"; fi
fi

# Appends, does not overwrite.
"$EMIT" --slug wbtest-emit --event gate_started --file "$EV_FULL" >/dev/null 2>&1
LINES2=$(wc -l < "$EV_FULL" | tr -d ' ')
[[ "$LINES2" -eq 2 ]] && ok "emit appends (2 lines after 2nd call)" \
  || fail "emit did not append (expected 2 lines got $LINES2)"

# Default output path (--file omitted) writes /tmp/cfn-events-<slug>.jsonl.
rm -f "$DEFAULT_EMIT_FILE"
DEFAULT_SLUG="wbtest-emit-live-$$"
DEFAULT_TARGET="/tmp/cfn-events-${DEFAULT_SLUG}.jsonl"
rm -f "$DEFAULT_TARGET"
"$EMIT" --slug "$DEFAULT_SLUG" --event verify_started >/dev/null 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "default-path emit exit 0 (got=$RC)"
else
  ok "default-path emit exit 0"
  assert_file_exists "default-path emit wrote /tmp/cfn-events-<slug>.jsonl" "$DEFAULT_TARGET"
fi
rm -f "$DEFAULT_TARGET"

# ---------------------------------------------------------------
# GROUP 6: transit map derivation (synthetic gate-fail + iterate cycle)
# ---------------------------------------------------------------
echo "[6] transit map (synthetic gate-fail iterate cycle)"

MAP_SLUG="mapsyn"
cat > "$ROOT/planning/run-plan-${MAP_SLUG}.json" <<'JSON'
{"slug":"mapsyn","generated_at":"2026-08-11T12:00:00Z","phases":["Wave 1","Wave 2"],
 "lanes":[{"id":"alpha","name":"Alpha","phase":"Wave 1"},
          {"id":"beta","name":"Beta","phase":"Wave 2"}]}
JSON
MAP_EVENTS="$ROOT/tmp/cfn-events-${MAP_SLUG}.jsonl"
cat > "$MAP_EVENTS" <<'JSONL'
{"ts":"2026-08-11T12:00:00Z","event":"loop_started"}
{"ts":"2026-08-11T12:00:10Z","event":"lane_spawned","lane":"alpha","phase":"Wave 1"}
{"ts":"2026-08-11T12:01:00Z","event":"lane_landed","lane":"alpha"}
{"ts":"2026-08-11T12:02:00Z","event":"lane_spawned","lane":"beta","phase":"Wave 2"}
{"ts":"2026-08-11T12:05:00Z","event":"gate_verdict","detail":"P/T exit 1"}
{"ts":"2026-08-11T12:06:00Z","event":"loop_started"}
JSONL

OUT_MAP="$TMP_OUT/map.html"
"$RENDER" --slug "$MAP_SLUG" --root "$ROOT" --out "$OUT_MAP" --no-screenshots 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "map render exit 0 (got=$RC)"
else
  ok "map render exit 0"
  assert_contains "map: section id present" "$OUT_MAP" 'id="sec-map"'
  assert_contains "map: nav anchor present" "$OUT_MAP" 'href="#sec-map"'
  # Two loop_started events -> iteration 2.
  assert_contains "map: iteration badge = 2" "$OUT_MAP" 'data-iteration="2"'
  # gate_verdict "P/T exit 1" -> fail.
  assert_contains "map: gate fail class" "$OUT_MAP" 'map-gate map-gate-fail'
  # Failed gate + a later loop_started -> loop-back track drawn.
  assert_match "map: loop-back path present" "$OUT_MAP" '<path[^>]*class="map-loop"'
  assert_contains "map: loop-back iterate label" "$OUT_MAP" ">iterate<"
  # Derivation: alpha landed, beta still in-flight.
  assert_match "map: landed station (alpha)" "$OUT_MAP" \
    'data-lane="alpha" data-status="landed"'
  assert_match "map: in-flight station (beta)" "$OUT_MAP" \
    'data-lane="beta" data-status="in-flight"'
  # In-flight lane -> train with a baked static transform and depart epoch.
  assert_match "map: train for beta with baked transform" "$OUT_MAP" \
    '<g class="map-train" data-lane="beta"[^>]*transform="translate\([0-9]+,[0-9]+\)"'
  assert_match "map: train carries depart epoch" "$OUT_MAP" \
    'data-lane="beta"[^>]*data-depart-epoch="[0-9]+"'
  assert_no_match "map: no train for landed alpha" "$OUT_MAP" \
    '<g class="map-train" data-lane="alpha"'
  # Map inline script stays self-contained; no em dashes in rendered copy.
  assert_no_match "map: no script src=" "$OUT_MAP" '<script[^>]*\ssrc='
  assert_not_contains "map: no em dash" "$OUT_MAP" $'—'
fi
rm -f "$MAP_EVENTS"

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
