#!/usr/bin/env bash
# Tests for preflight.sh (what still needs a human before /cfn-loop-task starts).
#
# Why this script exists: measured 2026-08-20, a coordinator spent ~41k context tokens
# and 26 bash calls answering "which escalations and deferrals in this plan are still
# open" by grepping SPEC/DECISIONS/PLAN in the main chat. One grep alone returned 7.1k
# tokens. The answer is a bounded, section-structured read of the plan dir.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PF="$SCRIPT_DIR/../preflight.sh"
FIX="$SCRIPT_DIR/fixtures-preflight"

PASS=0; FAIL=0

run() { # label args... -- expected_exit [expect_substr]
  local label="$1"; shift
  local args=()
  while [ "$1" != "--" ]; do args+=("$1"); shift; done
  shift
  local exp_exit="$1" substr="${2:-}"
  local out ec
  out="$("$PF" "${args[@]}" 2>&1)"; ec=$?
  local ok=1
  [ "$ec" = "$exp_exit" ] || ok=0
  if [ -n "$substr" ]; then echo "$out" | grep -qF "$substr" || ok=0; fi
  if [ "$ok" = 1 ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$label"
  else FAIL=$((FAIL+1)); printf 'FAIL %s (exit=%s want=%s)\n     out=%s\n' "$label" "$ec" "$exp_exit" "$out"; fi
}

expect_jq() { # label slug filter expected [extra...]
  local label="$1" slug="$2" filt="$3" want="$4"; shift 4
  local got
  got="$("$PF" --plan-dir "$FIX/planning/$slug" --json "$@" 2>/dev/null | jq -c "$filt")"
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$label"
  else FAIL=$((FAIL+1)); printf 'FAIL %s\n     got=%s\n     want=%s\n' "$label" "$got" "$want"; fi
}

# ---- guards ----
"$PF" >/dev/null 2>&1; ec=$?
if [ "$ec" = 2 ]; then PASS=$((PASS+1)); echo "ok   no-arg exits 2"
else FAIL=$((FAIL+1)); echo "FAIL no-arg exits 2 (got $ec)"; fi
run "missing plan dir exits 2" --plan-dir "$FIX/planning/nope" -- 2 "not found"

# ---- open items present: exit 1, human still needed ----
run "open escalations exit 1" --plan-dir "$FIX/planning/demo_slug" -- 1 "NEEDS A HUMAN"
expect_jq "demo: needs_human true"     demo_slug '.needs_human' 'true'
expect_jq "demo: 4 open sections"      demo_slug '[.open_sections[].heading]|length' '4'
expect_jq "demo: escalation section found" demo_slug \
  '[.open_sections[]|select(.heading|test("Escalations for the decision holder"))]|length' '1'
expect_jq "demo: answered section excluded" demo_slug \
  '[.open_sections[]|select(.heading|test("answered by the decision holder"))]|length' '0'
expect_jq "demo: resolved-forks section excluded" demo_slug \
  '[.open_sections[]|select(.heading|test("Remaining forks, resolved"))]|length' '0'
expect_jq "demo: not-re-litigated section excluded" demo_slug \
  '[.open_sections[]|select(.heading|test("not re-litigated"))]|length' '0'
expect_jq "demo: still-open section found"  demo_slug \
  '[.open_sections[]|select(.heading|test("Still open"))]|length' '1'
expect_jq "demo: parked section found"      demo_slug \
  '[.open_sections[]|select(.heading|test("Parked"))]|length' '1'
expect_jq "demo: unpatched-defects section found" demo_slug \
  '[.open_sections[]|select(.heading|test("not patched"))]|length' '1'
expect_jq "demo: escalation items extracted" demo_slug \
  '[.open_sections[]|select(.heading|test("Escalations for"))][0].items|length' '2'
expect_jq "demo: first escalation named"     demo_slug \
  '[.open_sections[]|select(.heading|test("Escalations for"))][0].items[0]' \
  '"E-1. Branch protection needs a paid plan"'
expect_jq "demo: open item count"       demo_slug '.open_item_count' '5'

# ---- artifact inventory ----
expect_jq "demo: PLAN found"            demo_slug '.artifacts.PLAN|test("PLAN_demo_slug.md")' 'true'
expect_jq "demo: VERIFY found"          demo_slug '.artifacts.VERIFY|test("VERIFY_demo_slug.md")' 'true'
expect_jq "demo: SPEC found"            demo_slug '.artifacts.SPEC|test("SPEC_demo_slug.md")' 'true'
expect_jq "clean: SPEC found"           clean_slug '.artifacts.SPEC|test("SPEC_clean_slug.md")' 'true'
expect_jq "clean: nothing missing"      clean_slug '.missing_artifacts' '[]'

# ---- a missing required artifact needs a human on its own ----
# Reported AND blocking: lanes derived from a plan whose SPEC never landed are
# derived from an unreviewed plan. Separate fixture from clean_slug so the two
# cases cannot contradict each other.
run "missing SPEC exits 1" --plan-dir "$FIX/planning/nospec_slug" -- 1 "MISSING ARTIFACT: SPEC"
expect_jq "nospec: SPEC absent reported"     nospec_slug '.artifacts.SPEC' 'null'
expect_jq "nospec: missing artifacts listed" nospec_slug '.missing_artifacts' '["SPEC"]'
expect_jq "nospec: needs_human true"         nospec_slug '.needs_human' 'true'
expect_jq "nospec: no open sections"         nospec_slug '.open_sections' '[]'

# ---- clean plan dir: nothing open, exit 0 ----
run "clean plan dir exits 0" --plan-dir "$FIX/planning/clean_slug" -- 0 "clear to start"
expect_jq "clean: needs_human false"    clean_slug '.needs_human' 'false'
expect_jq "clean: no open sections"     clean_slug '.open_sections' '[]'
expect_jq "clean: open item count 0"    clean_slug '.open_item_count' '0'

# ---- output stays bounded: this replaces a 41k-token grep session ----
sz=$("$PF" --plan-dir "$FIX/planning/demo_slug" 2>&1 | wc -c)
if [ "$sz" -lt 3000 ]; then PASS=$((PASS+1)); echo "ok   human report under 3000 chars ($sz)"
else FAIL=$((FAIL+1)); echo "FAIL human report under 3000 chars (got $sz)"; fi

# ---- per-section item cap keeps a pathological file bounded ----
BIG="$FIX/planning/big_slug"
mkdir -p "$BIG"
cp "$FIX/planning/demo_slug/PLAN_demo_slug.md" "$BIG/PLAN_big_slug.md"
{ echo "# Decisions: big"; echo; echo "## 4. Escalations for the decision holder"; echo
  for i in $(seq 1 60); do echo "- E-$i. escalation number $i"; done; } > "$BIG/DECISIONS_big_slug.md"
expect_jq "big: items capped per section" big_slug \
  '[.open_sections[]|select(.heading|test("Escalations for"))][0].items|length' '8'
expect_jq "big: truncation reported"     big_slug \
  '[.open_sections[]|select(.heading|test("Escalations for"))][0].truncated' '52'
expect_jq "big: full count still exact"  big_slug '.open_item_count' '60'
sz=$("$PF" --plan-dir "$BIG" 2>&1 | wc -c)
if [ "$sz" -lt 3000 ]; then PASS=$((PASS+1)); echo "ok   60-item file still under 3000 chars ($sz)"
else FAIL=$((FAIL+1)); echo "FAIL 60-item file still under 3000 chars (got $sz)"; fi
rm -rf "$BIG"

# ---- deferrals: reported when the side-manifest has open blocking entries ----
DEF="$FIX/planning/.DEFERRALS_demo_slug.json"
cat > "$DEF" <<'EOJ'
{"deferrals":[{"id":1,"lane":"2","need":"src/x.ts: needs wiring","status":"OPEN","blocking":true},
              {"id":2,"lane":"3","need":"src/y.ts: done","status":"RESOLVED","blocking":true}]}
EOJ
expect_jq "deferrals: one open blocking" demo_slug '.open_blocking_deferrals' '1'
run "deferrals surface in the report" --plan-dir "$FIX/planning/demo_slug" -- 1 "open blocking deferral"
rm -f "$DEF"
expect_jq "no deferrals file = zero"     demo_slug '.open_blocking_deferrals' '0'

echo
echo "preflight: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
