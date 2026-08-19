#!/usr/bin/env bash
# Tests for check-size.sh (per-artifact-kind byte size cap gate, cfn-megaplan-fast).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$SCRIPT_DIR/../check-size.sh"
FIX="$SCRIPT_DIR/fixtures-size"

PASS=0; FAIL=0
run() { # label args... -- expected_exit expect_substr(optional)
  local label="$1"; shift
  local args=()
  while [ "$1" != "--" ]; do args+=("$1"); shift; done
  shift # drop --
  local exp_exit="$1" substr="${2:-}"
  local out ec
  out="$("$CHECK" "${args[@]}" 2>&1)"; ec=$?
  local ok=1
  [ "$ec" = "$exp_exit" ] || ok=0
  if [ -n "$substr" ]; then echo "$out" | grep -qF "$substr" || ok=0; fi
  if [ "$ok" = 1 ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$label"
  else FAIL=$((FAIL+1)); printf 'FAIL %s (exit=%s want=%s)\n     out=%s\n' "$label" "$ec" "$exp_exit" "$out"; fi
}

# ---- single-file cases, built-in defaults (no --profile / no fast.json yet) ----
run "under cap: exit 0, OK line"          "$FIX/SPEC_under.md" -- 0 "OK"
run "exact cap: exit 0"                   "$FIX/SPEC_exact.md" -- 0 "OK"
run "over cap: exit 1, OVER line"         "$FIX/SPEC_over.md"  -- 1 "OVER"

# ---- usage / missing file / unknown kind ----
"$CHECK" >/dev/null 2>&1; ec=$?
if [ "$ec" = 2 ]; then PASS=$((PASS+1)); echo "ok   no-arg exits 2"
else FAIL=$((FAIL+1)); echo "FAIL no-arg exits 2 (got $ec)"; fi

run "missing file: exit 2"                "$FIX/does-not-exist.md" -- 2
run "unknown kind (unrecognized prefix): exit 2" "$FIX/UNKNOWNKIND_file.md" -- 2

# ---- --kind override ----
run "--kind override to unknown kind: exit 2" "$FIX/SPEC_under.md" --kind BOGUS -- 2
run "--kind override to known kind: exit 0"   "$FIX/SPEC_under.md" --kind SPEC -- 0 "OK"

# ---- --profile override changes verdict ----
run "cap override via --profile flips OK to OVER" "$FIX/SPEC_under.md" --profile "$FIX/profile-small.json" -- 1 "OVER"

# ---- MEGAPLAN kind (full-megaplan synthesis artifact) is a known kind ----
run "MEGAPLAN_ prefix is a known kind: exit 0" "$FIX/MEGAPLAN_tiny.md" -- 0 "OK MEGAPLAN"

run "PARTSPEC_ prefix is a known kind: exit 0" "$FIX/PARTSPEC_tiny.md" -- 0 "OK PARTSPEC"
run "PARTSPEC cap from fast.json is 16384" "$FIX/PARTSPEC_tiny.md" --profile "$SCRIPT_DIR/../../../cfn-megaplan-fast/profiles/fast.json" -- 0 "/16384"

# ---- full-megaplan tier profiles carry caps that check-size honors ----
TIERS="$SCRIPT_DIR/../../profiles"
run "mvp.json caps: SPEC cap read from tier profile"  "$FIX/SPEC_under.md" --profile "$TIERS/mvp.json" -- 0 "/49152"
run "beta.json caps: SPEC cap read from tier profile" "$FIX/SPEC_under.md" --profile "$TIERS/beta.json" -- 0 "/73728"
run "enterprise.json caps: SPEC cap read from tier profile" "$FIX/SPEC_under.md" --profile "$TIERS/enterprise.json" -- 0 "/98304"

# ---- --all directory mode ----
run "--all: exits 1 if any recognized file over cap" --all "$FIX/all-dir" -- 1 "OVER"
run "--all: prints a line for each recognized artifact (DECISIONS_ok)" --all "$FIX/all-dir" -- 1 "DECISIONS_ok.md"
run "--all: prints a line for each recognized artifact (SPEC_ok)"      --all "$FIX/all-dir" -- 1 "SPEC_ok.md"

# unrecognized files in the dir must be ignored (not printed, not causing exit 2)
out_all="$("$CHECK" --all "$FIX/all-dir" 2>&1)"
if ! echo "$out_all" | grep -qF "NOTAKIND_ignored.md" && ! echo "$out_all" | grep -qF "README.md"; then
  PASS=$((PASS+1)); echo "ok   --all: unrecognized files ignored"
else
  FAIL=$((FAIL+1)); echo "FAIL --all: unrecognized files ignored (out=$out_all)"
fi

# ---- --json output ----
run "--json on clean file emits []"       "$FIX/SPEC_under.md" --json -- 0 "[]"
run "--json on over-cap file emits finding with KIND ac_id" "$FIX/SPEC_over.md" --json -- 1 "\"ac_id\":\"SPEC\""
run "--json on over-cap file names the issue" "$FIX/SPEC_over.md" --json -- 1 "over cap by"

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
