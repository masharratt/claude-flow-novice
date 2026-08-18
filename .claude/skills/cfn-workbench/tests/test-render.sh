#!/usr/bin/env bash
# test-render.sh - STRAT-005 coverage for cfn-workbench render.sh
# Asserts: rendering, self-containment, HTML escaping, column-tolerant AC parser,
# screenshot caps, data-gap recording, empty-state, exit codes, no em dashes.
#
# Run: bash .claude/skills/cfn-workbench/tests/test-render.sh

set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RENDER="$SKILL_DIR/render.sh"
FIX="$SKILL_DIR/tests/fixtures"

# Stage a realistic runtime layout in a temp root. Fixture SOURCES ship under
# data/ (non-ignored paths); copy them into the runtime paths render.sh reads
# (.cfn-cache/, tmp/) so the test exercises real path logic without shipping
# files at gitignored locations (repo .gitignore excludes .cfn-cache/ + tmp/).
ROOT="$(mktemp -d)"
mkdir -p "$ROOT/.cfn-cache/manifests" "$ROOT/tmp" "$ROOT/planning" "$ROOT/tests/screenshots"
cp "$FIX"/data/manifests/*    "$ROOT/.cfn-cache/manifests/" 2>/dev/null || true
cp "$FIX"/data/lane-tmp/*     "$ROOT/tmp/"                  2>/dev/null || true
# planning/ holds a dotfile fixture (.VERIFY_<slug>.bless.json); the bare *
# glob skips dotfiles, so copy the dir contents including hidden entries.
cp -a "$FIX/planning/."       "$ROOT/planning/"              2>/dev/null || true
cp "$FIX"/tests/screenshots/* "$ROOT/tests/screenshots/"    2>/dev/null || true

# Output dir per test (isolated, cleaned on exit)
TMP_OUT="$(mktemp -d)"
trap 'rm -rf "$TMP_OUT" "$ROOT" /tmp/cfn-workbench-opened-wb14-*' EXIT

# Counters
PASS=0
FAIL=0
FAILED_TESTS=()

# Colors
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_NC=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_NC=""
fi

ok()   { PASS=$((PASS+1)); printf "  ${C_GREEN}PASS${C_NC}  %s\n" "$1"; }
fail() { FAIL=$((FAIL+1)); FAILED_TESTS+=("$1"); printf "  ${C_RED}FAIL${C_NC}  %s\n" "$1"; }

# assert_contains NAME FILE NEEDLE
assert_contains() {
  local name="$1" file="$2" needle="$3"
  if grep -qF -- "$needle" "$file"; then ok "$name"
  else fail "$name (missing: $needle)"; fi
}

# assert_not_contains NAME FILE NEEDLE
assert_not_contains() {
  local name="$1" file="$2" needle="$3"
  if grep -qF -- "$needle" "$file"; then fail "$name (found banned: $needle)"
  else ok "$name"; fi
}

# assert_match NAME FILE REGEX
assert_match() {
  local name="$1" file="$2" regex="$3"
  if grep -qE -- "$regex" "$file"; then ok "$name"
  else fail "$name (no match: $regex)"; fi
}

# assert_no_match NAME FILE REGEX
assert_no_match() {
  local name="$1" file="$2" regex="$3"
  if grep -qE -- "$regex" "$file"; then fail "$name (matched banned: $regex)"
  else ok "$name"; fi
}

# assert_exit NAME EXPECTED CMD...
assert_exit() {
  local name="$1" expected="$2"; shift 2
  "$@" >/dev/null 2>&1; local rc=$?
  if [[ "$rc" -eq "$expected" ]]; then ok "$name (exit=$rc)"
  else fail "$name (expected exit=$expected got=$rc)"; fi
}

# assert_file_exists NAME PATH
assert_file_exists() {
  if [[ -f "$2" ]]; then ok "$1"
  else fail "$1 (no file: $2)"; fi
}

echo "=== cfn-workbench render.sh test suite ==="
echo "skill dir: $SKILL_DIR"
echo

# ---------------------------------------------------------------
# GROUP 1: existence, args, exit codes
# ---------------------------------------------------------------
echo "[1] existence and args"

if [[ -x "$RENDER" ]]; then ok "render.sh is executable"
elif [[ -f "$RENDER" ]]; then
  chmod +x "$RENDER" 2>/dev/null || true
  if [[ -x "$RENDER" ]]; then ok "render.sh is executable (after chmod)"
  else fail "render.sh exists but not executable"; fi
else fail "render.sh missing"; fi

assert_exit "missing --slug exits 2" 2 \
  "$RENDER" --root "$ROOT" --out "$TMP_OUT/x.html"
assert_exit "unknown arg exits 2" 2 \
  "$RENDER" --slug x --bogus yes --root "$ROOT" --out "$TMP_OUT/x.html"
assert_exit "--help exits 0" 0 \
  "$RENDER" --help

# ---------------------------------------------------------------
# GROUP 2: empty state (no manifests, no VERIFY)
# ---------------------------------------------------------------
echo "[2] empty state"
EMPTY_ROOT="$(mktemp -d)"
EMPTY_OUT="$TMP_OUT/empty.html"
"$RENDER" --slug "empty-slug" --root "$EMPTY_ROOT" --out "$EMPTY_OUT" 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then
  fail "empty-state exit code (got=$RC want=0)"
elif [[ ! -f "$EMPTY_OUT" ]]; then
  fail "empty-state produced no file"
else
  ok "empty-state exit 0 and wrote HTML"
  assert_contains "empty-state has header" "$EMPTY_OUT" "<header"
  assert_match "empty-state names slug" "$EMPTY_OUT" "empty-slug"
  assert_contains "empty-state has footer" "$EMPTY_OUT" "<footer"
  # An empty-state card or message must be present
  assert_match "empty-state has empty/data-gap message" "$EMPTY_OUT" \
    "(empty|no data|data gap|Data gap|missing)"
fi
rm -rf "$EMPTY_ROOT"

# ---------------------------------------------------------------
# GROUP 3: 5-column AC table (no reference column)
# ---------------------------------------------------------------
echo "[3] 5-column AC table"
OUT5="$TMP_OUT/workbench_5col.html"
"$RENDER" --slug "workbench_5col" --root "$ROOT" --out "$OUT5" 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then fail "5col render failed (exit=$RC)"
else
  ok "5col render exit 0"
  assert_file_exists "5col HTML exists" "$OUT5"
  assert_contains "5col contains AC1 id" "$OUT5" "AC1"
  assert_contains "5col contains check text" "$OUT5" "Renders 5-col table"
  assert_contains "5col contains AC3" "$OUT5" "Tolerates missing data sources"
  # The 5-col fixture has no reference header. Workbench renders a consistent
  # display; the reference cell must be empty/dash, NOT a stray column shift.
  assert_no_match "5col does not leak 9col reference path" "$OUT5" "docs/ref\\.md"
fi

# ---------------------------------------------------------------
# GROUP 4: 9-column AC table (WITH reference column)
# ---------------------------------------------------------------
echo "[4] 9-column AC table"
OUT9="$TMP_OUT/workbench_9col.html"
"$RENDER" --slug "workbench_9col" --root "$ROOT" --out "$OUT9" 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then fail "9col render failed (exit=$RC)"
else
  ok "9col render exit 0"
  assert_file_exists "9col HTML exists" "$OUT9"
  assert_contains "9col contains AC1" "$OUT9" "AC1"
  assert_contains "9col renders reference value" "$OUT9" "docs/ref.md"
  assert_contains "9col renders second reference value" "$OUT9" "docs/xss.md"
  # Header-name parsing: column titled "reference" must appear as a column header.
  assert_match "9col has reference column header" "$OUT9" "(reference|Reference)"
fi

# ---------------------------------------------------------------
# GROUP 5: HTML escaping (XSS injection payloads)
# ---------------------------------------------------------------
echo "[5] HTML escaping"
# Manifest one_liner has: <script>alert(1)</script>
# Manifest description has: "><img src=x>
# AC table cell has: <script>alert(1)</script>
# Embedded JSON evidence has: <script>alert(1)</script>
for HTML in "$OUT5" "$OUT9"; do
  [[ -f "$HTML" ]] || continue
  name="$(basename "$HTML")"
  assert_not_contains "$name: no raw <script>alert" "$HTML" "<script>alert(1)</script>"
  assert_not_contains "$name: no raw <img src=x>" "$HTML" "<img src=x>"
  assert_contains    "$name: has escaped script" "$HTML" "&lt;script&gt;"
done

# ---------------------------------------------------------------
# GROUP 6: self-containment (zero <link, zero non-data: src/href)
# ---------------------------------------------------------------
echo "[6] self-containment"
for HTML in "$OUT5" "$OUT9" "$EMPTY_OUT"; do
  [[ -f "$HTML" ]] || continue
  name="$(basename "$HTML")"
  # zero <link tags anywhere
  assert_no_match "$name: no <link tag" "$HTML" "<link[[:space:]>]"
  # every src="..." must be src="data:..."
  if grep -oE 'src="[^"]*"' "$HTML" | grep -vq '^src="data:'; then
    fail "$name: found non-data: src= "
    grep -oE 'src="[^"]*"' "$HTML" | grep -v '^src="data:' | head -3 | sed 's/^/      /'
  else ok "$name: all src= are data:"; fi
  # every href="..." must be data: or an in-page fragment (#sec-...); no external fetches.
  if grep -oE 'href="[^"]*"' "$HTML" | grep -vqE '^href="(data:|#)'; then
    fail "$name: found non-data/non-fragment href= "
    grep -oE 'href="[^"]*"' "$HTML" | grep -vE '^href="(data:|#)' | head -3 | sed 's/^/      /'
  else ok "$name: all href= are data:/fragment"; fi
done

# ---------------------------------------------------------------
# GROUP 7: screenshot caps (--max-screenshots, --no-screenshots)
# ---------------------------------------------------------------
echo "[7] screenshot caps"
# Slug "workbench" matches fixture screenshots workbench-iteration-*.png (3 files).
# Render with --max-screenshots 1 -> overflow card must appear.
OUT_CAP="$TMP_OUT/cap1.html"
"$RENDER" --slug "workbench" --root "$ROOT" --out "$OUT_CAP" --max-screenshots 1 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then fail "cap render failed (exit=$RC)"
else
  ok "cap render exit 0"
  # 3 screenshots total, cap=1 -> 2 overflowed. Look for overflow/omitted message.
  assert_match "cap1 has overflow message" "$OUT_CAP" "(overflow|omitted|capped|too many|truncated)"
  assert_match "cap1 names overflow count" "$OUT_CAP" "2"
fi

# --no-screenshots -> zero data:image/png;base64 in output
OUT_NOSHX="$TMP_OUT/no-shx.html"
"$RENDER" --slug "workbench" --root "$ROOT" --out "$OUT_NOSHX" --no-screenshots 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then fail "no-screenshots render failed (exit=$RC)"
else
  ok "no-screenshots exit 0"
  assert_no_match "no-screenshots has zero data: URIs" "$OUT_NOSHX" "data:image/png;base64"
fi

# Default render with screenshots -> at least one data: URI
OUT_SHX="$TMP_OUT/shx.html"
"$RENDER" --slug "workbench" --root "$ROOT" --out "$OUT_SHX" 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then fail "default render failed (exit=$RC)"
else
  ok "default render exit 0"
  assert_match "default has data: URI for screenshot" "$OUT_SHX" "data:image/png;base64,"
fi

# ---------------------------------------------------------------
# GROUP 8: data gaps recorded in footer
# ---------------------------------------------------------------
echo "[8] data gaps"
# Slug "workbench" has no VERIFY_workbench.md (only 5col/9col). Footer must
# record the missing VERIFY doc as a data gap.
assert_match "data gap for missing VERIFY" "$OUT_SHX" "(gap|Gap|missing|Missing).*(VERIFY|verify)"

# Empty-state must record multiple gaps.
GAP_COUNT=$(grep -oE "(gap|Gap|missing|Missing)" "$EMPTY_OUT" | wc -l)
if [[ "$GAP_COUNT" -ge 1 ]]; then ok "empty-state records gaps ($GAP_COUNT)"
else fail "empty-state records no gaps"; fi

# ---------------------------------------------------------------
# GROUP 9: vote ledger + bless ledger + tech-debt
# ---------------------------------------------------------------
echo "[9] ledgers"
# Fixtures have manifest with sugg-1 status=accepted (vote-implement).
assert_contains "vote ledger has sugg-1" "$OUT_SHX" "sugg-1"
assert_match "vote ledger has accepted verdict" "$OUT_SHX" "(accepted|Accepted)"
# Bless ledger fixture has structure_changed render.sh + lib/html.sh.
assert_contains "bless ledger mentions structure_changed" "$OUT_SHX" "structure_changed"
assert_contains "bless ledger lists render.sh" "$OUT_SHX" "render.sh"
assert_contains "bless ledger lists lib/html.sh" "$OUT_SHX" "lib/html.sh"
# Tech-debt section (suggestions with category=tech-debt exist).
assert_match "tech-debt section present" "$OUT_SHX" "(tech.debt|Tech[ -]?Debt|tech_debt)"

# ---------------------------------------------------------------
# GROUP 10: no em dashes (project rule)
# ---------------------------------------------------------------
echo "[10] no em dashes"
for HTML in "$OUT5" "$OUT9" "$EMPTY_OUT" "$OUT_SHX" "$OUT_CAP" "$OUT_NOSHX"; do
  [[ -f "$HTML" ]] || continue
  name="$(basename "$HTML")"
  assert_not_contains "$name: no em dash char" "$HTML" $'—'
  assert_not_contains "$name: no &mdash;" "$HTML" "&mdash;"
done

# ---------------------------------------------------------------
# GROUP 11: HTML structure sanity
# ---------------------------------------------------------------
echo "[11] html structure"
for HTML in "$OUT5" "$OUT9" "$OUT_SHX"; do
  [[ -f "$HTML" ]] || continue
  name="$(basename "$HTML")"
  assert_contains "$name: has <!DOCTYPE" "$HTML" "<!DOCTYPE html>"
  assert_contains "$name: has <html" "$HTML" "<html"
  assert_contains "$name: has inline <style>" "$HTML" "<style>"
  assert_contains "$name: has </html>" "$HTML" "</html>"
done

# ---------------------------------------------------------------
# GROUP 12: UI / readability improvements (review P0-P2)
# ---------------------------------------------------------------
echo "[12] ui readability"
# P0-1: Nocturne state-label system. A state bucket rule exists; dark bg token set.
assert_match "9col: state-action rule styled" "$OUT9" '\.state-action[[:space:]]*\{'
assert_contains "9col: dark bg token present" "$OUT9" "--color-bg: #161826"
# P0-2: HTML size backfilled (no "?" placeholder).
assert_no_match "9col: no '?' size placeholder" "$OUT9" 'HTML size: \? bytes'
assert_match "9col: size is numeric" "$OUT9" 'HTML size: [0-9]+ bytes'
# P0-3: no mktemp scratch paths leak into user-facing copy.
assert_no_match "9col: no /tmp/tmp. leak" "$OUT9" '/tmp/tmp\.'
assert_contains "9col: AC note relativized" "$OUT9" "from planning/VERIFY_workbench_9col.md"
# P1-4: every table wrapped in a scroll container for mobile.
for HTML in "$OUT5" "$OUT9" "$OUT_SHX"; do
  [[ -f "$HTML" ]] || continue
  name="$(basename "$HTML")"
  assert_contains "$name: has table-wrap" "$HTML" 'class="table-wrap"'
  tbl=$(grep -oE '<table' "$HTML" | wc -l | tr -d ' ')
  wrap=$(grep -oE 'class="table-wrap"' "$HTML" | wc -l | tr -d ' ')
  if [[ "$wrap" -ge 1 && "$tbl" -eq "$wrap" ]]; then ok "$name: all tables wrapped ($tbl)"
  else fail "$name: table/wrap mismatch tables=$tbl wraps=$wrap"; fi
done
# P1-5: empty lanes -> message, not header-only table.
assert_match "9col: empty-lanes message" "$OUT9" "no lane reports"
assert_contains "shx: lane row present" "$OUT_SHX" "backend"
# P1-6: timeline n/a renders muted.
assert_match "9col: muted n/a iter-value" "$OUT9" "iter-na"
# P1-7: generated time humanized with datetime attr.
assert_match "9col: time has datetime attr" "$OUT9" '<time datetime='
assert_no_match "9col: no raw ISO in time display" "$OUT9" '<time>[0-9]{4}-[0-9]{2}-[0-9]{2}T'
# P2-8: inline styles extracted to classes.
assert_no_match "shx: no inline font-size styles" "$OUT_SHX" 'style="[^"]*font-size:15px'
assert_no_match "shx: no inline box-shadow" "$OUT_SHX" 'box-shadow:none'
assert_contains "9col: has sub-card class" "$OUT9" 'class="card sub-card"'
assert_contains "9col: has sub-head class" "$OUT9" "sub-head"
# P2-9: section jump-nav with anchor targets.
assert_contains "9col: section-nav present" "$OUT9" 'class="section-nav"'
assert_contains "9col: nav anchors ac" "$OUT9" 'href="#sec-ac"'
assert_contains "9col: section id ac" "$OUT9" 'id="sec-ac"'
# P2-10: only the first iteration detail is open (slug workbench spans 0,1,2).
if [[ -f "$OUT_SHX" ]]; then
  open_count=$(grep -oE '<details open>' "$OUT_SHX" | wc -l | tr -d ' ')
  if [[ "$open_count" -eq 1 ]]; then ok "shx: only first iter details open"
  else fail "shx: expected 1 <details open> got $open_count"; fi
fi

# ---------------------------------------------------------------
# GROUP 13: Nocturne dark-theme re-skin
# ---------------------------------------------------------------
echo "[13] nocturne theme"
# 1. dark tokens present
assert_contains "9col: bg token" "$OUT9" "--color-bg: #161826"
assert_contains "9col: accent token" "$OUT9" "--color-accent: #9184d9"
# 2. no Google Fonts / no external font fetch
assert_no_match "9col: no google fonts" "$OUT9" "fonts\.googleapis"
assert_no_match "shx: no google fonts" "$OUT_SHX" "fonts\.googleapis"
# 10. still self-contained: no @import, no https in <style>
assert_no_match "9col: no @import" "$OUT9" "@import"
assert_no_match "9col: no https in style" "$OUT9" "https://"
# 3. .hr fading rule present (linear-gradient + transparent)
assert_match "9col: hr fading rule" "$OUT9" "\.hr[^{]*\{[^}]*linear-gradient"
# 4. state-label buckets emitted across sections
assert_match "9col: state-settled emitted (pass AC)" "$OUT9" "state-settled"
assert_match "shx: state-waiting emitted (open suggestion)" "$OUT_SHX" "state-waiting"
assert_match "shx: state-action or state-fatal present" "$OUT_SHX" "state-(action|fatal)"
# 5. sticky header + verdict headline
assert_contains "9col: sticky header class" "$OUT9" 'class="wb-sticky-header"'
assert_contains "9col: verdict headline" "$OUT9" 'class="verdict-headline"'
# 6. gaps strip at top when gaps exist (must precede sec-detail in byte order)
if [[ -f "$OUT_SHX" ]]; then
  strip_off=$(grep -bo 'class="gaps-strip"' "$OUT_SHX" | head -1 | cut -d: -f1)
  detail_off=$(grep -bo 'id="sec-detail"' "$OUT_SHX" | head -1 | cut -d: -f1)
  if [[ -n "$strip_off" && -n "$detail_off" && "$strip_off" -lt "$detail_off" ]]; then
    ok "shx: gaps-strip precedes sec-detail"
  else fail "shx: gaps-strip not before sec-detail (strip=$strip_off detail=$detail_off)"; fi
fi
# 7. legend present
assert_contains "9col: legend present" "$OUT9" 'class="legend"'
# 8. decisions section: id always present; card vs empty-state by ledger presence
assert_contains "9col: decisions section id" "$OUT9" 'id="sec-decisions"'
assert_contains "shx: decisions section id" "$OUT_SHX" 'id="sec-decisions"'
assert_contains "empty: decisions section id" "$EMPTY_OUT" 'id="sec-decisions"'
assert_contains "shx: decision card with actor-human" "$OUT_SHX" "actor-human"
assert_match "9col: decisions empty-state" "$OUT9" "(No decisions logged|no decisions)"
assert_match "empty: decisions empty-state" "$EMPTY_OUT" "(No decisions logged|no decisions)"
# 9. nav has Decisions anchor
assert_contains "9col: nav decisions anchor" "$OUT9" 'href="#sec-decisions"'
# decisions XSS payload (in workbench slug rationale) stays escaped
assert_not_contains "shx: decisions rationale escaped" "$OUT_SHX" "<script>alert(1)</script>"

# ---------------------------------------------------------------
# GROUP 14: --live (meta refresh) + --open (browser launch + idempotency)
# ---------------------------------------------------------------
echo "[14] live + open flags"
# Suppress actual browser spawn during tests; marker + HTML injection are what we assert.
export WORKBENCH_NO_LAUNCH=1

# --live 10 injects a self-refresh meta tag.
OUT_LIVE="$TMP_OUT/wb14-live-$$.html"
"$RENDER" --slug "workbench_9col" --root "$ROOT" --out "$OUT_LIVE" --live 10 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then fail "--live render failed (exit=$RC)"
else
  ok "--live render exit 0"
  assert_contains "live: meta refresh present" "$OUT_LIVE" '<meta http-equiv="refresh" content="10">'
fi

# --live output stays self-contained: no <link, no external src/href.
assert_no_match "live: no <link tag" "$OUT_LIVE" "<link[[:space:]>]"
if grep -oE 'src="[^"]*"' "$OUT_LIVE" | grep -vq '^src="data:'; then
  fail "live: found non-data: src="
else ok "live: all src= are data:"; fi
if grep -oE 'href="[^"]*"' "$OUT_LIVE" | grep -vqE '^href="(data:|#)'; then
  fail "live: found non-data/non-fragment href="
else ok "live: all href= are data:/fragment"; fi

# Header prints the project name (repo dir) so the dashboard says what it belongs to.
assert_contains "live: header has Project label" "$OUT_LIVE" ">Project<"
assert_contains "live: header names project (root basename)" "$OUT_LIVE" "$(basename "$ROOT")"

# Regression guard: a render WITHOUT --live must not emit any refresh meta.
assert_no_match "9col (no --live): no refresh meta" "$OUT9" 'http-equiv="refresh"'

# --open writes a per-output marker file under /tmp and stays idempotent.
OUT_OPEN="$TMP_OUT/wb14-open-$$.html"
MARKER="/tmp/cfn-workbench-opened-wb14-open-$$.html"
rm -f "$MARKER"
"$RENDER" --slug "workbench_9col" --root "$ROOT" --out "$OUT_OPEN" --open 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then fail "--open render failed (exit=$RC)"
else
  ok "--open render exit 0"
  assert_file_exists "open: marker file written" "$MARKER"
fi

# Idempotency: second --open does not error and does not rewrite the marker
# (open_if_needed early-returns when the marker exists). Stable mtime proves it.
MT1=$(stat -c %Y "$MARKER" 2>/dev/null || echo 0)
"$RENDER" --slug "workbench_9col" --root "$ROOT" --out "$OUT_OPEN" --open 2>&1
RC2=$?
MT2=$(stat -c %Y "$MARKER" 2>/dev/null || echo 0)
if [[ "$RC2" -eq 0 ]]; then ok "open: second render exit 0 (idempotent)"
else fail "open: second render failed (exit=$RC2)"; fi
if [[ "$MT1" -eq "$MT2" ]]; then ok "open: marker untouched on re-render"
else fail "open: marker rewritten (mt1=$MT1 mt2=$MT2)"; fi

# --open + --live combine cleanly.
OUT_BOTH="$TMP_OUT/wb14-both-$$.html"
"$RENDER" --slug "workbench_9col" --root "$ROOT" --out "$OUT_BOTH" --open --live 5 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then fail "open+live render failed (exit=$RC)"
else
  ok "open+live render exit 0"
  assert_contains "both: meta refresh present" "$OUT_BOTH" '<meta http-equiv="refresh" content="5">'
  assert_file_exists "both: marker file written" "/tmp/cfn-workbench-opened-wb14-both-$$.html"
fi

# Bad --live values are usage errors (exit 2).
assert_exit "live: non-numeric exits 2" 2 \
  "$RENDER" --slug "workbench_9col" --root "$ROOT" --out "$TMP_OUT/bad1.html" --live abc
assert_exit "live: zero exits 2" 2 \
  "$RENDER" --slug "workbench_9col" --root "$ROOT" --out "$TMP_OUT/bad2.html" --live 0
assert_exit "live: missing value exits 2" 2 \
  "$RENDER" --slug "workbench_9col" --root "$ROOT" --out "$TMP_OUT/bad3.html" --live

unset WORKBENCH_NO_LAUNCH

# ---------------------------------------------------------------
# Summary
# ---------------------------------------------------------------
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
