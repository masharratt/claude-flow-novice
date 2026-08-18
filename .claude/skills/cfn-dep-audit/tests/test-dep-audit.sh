#!/usr/bin/env bash
# Tests for cfn-dep-audit execute.sh
# Guard rails: degrades gracefully with no manifests; runs npm audit + cooldown
# logic on a real package.json; emits a manifest only when findings exist.
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/execute.sh"
PASS=0
FAIL=0

check() { # desc, expected-substring, actual
  if echo "$3" | grep -qF "$2"; then
    echo "PASS: $1"; PASS=$((PASS+1))
  else
    echo "FAIL: $1"; echo "  want substring: $2"; echo "  got: $3"; FAIL=$((FAIL+1))
  fi
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
git init -q
git config user.email t@t.test; git config user.name t
git commit -q --allow-empty -m init

# Case 1: no manifests -> graceful exit, no error
OUT=$(bash "$SCRIPT" 2>&1); RC=$?
check "no manifests: graceful message" "no dependency manifests found" "$OUT"
[ "$RC" -eq 0 ] && { echo "PASS: no manifests exits 0"; PASS=$((PASS+1)); } \
                || { echo "FAIL: no manifests exits 0 (got $RC)"; FAIL=$((FAIL+1)); }

# Case 2: clean package.json, no deps -> reports checks, no manifest
printf '{\n  "name": "t",\n  "version": "1.0.0",\n  "dependencies": {}\n}\n' > package.json
OUT=$(bash "$SCRIPT" 2>&1)
check "reports checks ran/skipped line" "checks" "$OUT"
check "no findings -> no manifest"      "No actionable findings" "$OUT"
[ -d .cfn-cache/manifests ] && [ -n "$(ls .cfn-cache/manifests 2>/dev/null)" ] \
  && { echo "FAIL: should not emit manifest with zero findings"; FAIL=$((FAIL+1)); } \
  || { echo "PASS: no manifest emitted with zero findings"; PASS=$((PASS+1)); }

# Case 3: CFN_DEP_COOLDOWN_DAYS env is honored in summary/manifest plumbing
OUT=$(CFN_DEP_COOLDOWN_DAYS=45 bash "$SCRIPT" 2>&1)
check "custom cooldown does not crash"  "cfn-dep-audit complete" "$OUT"

# Case 4: a Cargo.toml with no audit tool still degrades (no crash)
rm -f package.json
printf '[package]\nname = "t"\n\n[dependencies]\n' > Cargo.toml
OUT=$(bash "$SCRIPT" 2>&1); RC=$?
check "cargo path completes"            "cfn-dep-audit complete" "$OUT"
[ "$RC" -eq 0 ] && { echo "PASS: cargo path exits 0"; PASS=$((PASS+1)); } \
                || { echo "FAIL: cargo path exits 0 (got $RC)"; FAIL=$((FAIL+1)); }

# Case 5: a scripts entry must never be parsed as a dependency.
# Regression: the old whole-file line-grep matched any "key": "value" whose
# value started with a version char (^~>=<0-9v), so a script command starting
# with v or a digit (e.g. "e2e": "vitest run") was flagged as a new package.
rm -f Cargo.toml
source "$(dirname "$SCRIPT")/lib/npm-new-deps.sh"
printf '{\n  "name":"t","version":"1.0.0",\n  "scripts":{"build":"tsc"},\n  "dependencies":{"lodash":"^4.17.21"}\n}\n' > package.json
git add package.json; git commit -q -m base
printf '{\n  "name":"t","version":"1.0.0",\n  "scripts":{"build":"tsc","e2e":"vitest run"},\n  "dependencies":{"lodash":"^4.17.21","react":"^18.2.0"}\n}\n' > package.json
NEW=$(cfn_npm_new_deps "HEAD")
if printf '%s\n' "$NEW" | grep -qE '(^|\t)e2e($|\t)'; then
  echo "FAIL: script key 'e2e' parsed as a dependency"; echo "  got: $NEW"; FAIL=$((FAIL+1))
else
  echo "PASS: script entry not treated as dependency"; PASS=$((PASS+1))
fi
if printf '%s\n' "$NEW" | grep -qE 'react'; then
  echo "PASS: real new dep 'react' detected"; PASS=$((PASS+1))
else
  echo "FAIL: real new dep 'react' not detected"; echo "  got: $NEW"; FAIL=$((FAIL+1))
fi
git rm -qf package.json 2>/dev/null; git commit -q -m reset 2>/dev/null || true

echo "---"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
