#!/bin/bash
# Tests for cfn-tech-debt harvest.sh
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/harvest.sh"
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

# Case 1+2: valid marker parsed, no-trigger flagged
printf 'x = 1  # cfn: global lock, per-account locks if throughput matters\n' > a.py
printf 'const y = 2; // cfn: hardcoded for now\n' > b.ts
OUT=$(bash "$SCRIPT")
check "valid marker: ceiling parsed"  "ceiling: global lock."                       "$OUT"
check "valid marker: trigger parsed"  "upgrade: per-account locks if throughput matters." "$OUT"
check "no-trigger flagged NONE"       "upgrade: NONE."                                "$OUT"
check "summary counts both"           "2 markers, 1 with no trigger."                "$OUT"

# Case 3: excludes node_modules
mkdir -p node_modules/pkg
printf '// cfn: should not appear, ignored\n' > node_modules/pkg/index.js
OUT=$(bash "$SCRIPT")
check "node_modules excluded"         "2 markers, 1 with no trigger."                "$OUT"

# Case 4: --persist writes ledger
bash "$SCRIPT" --persist >/dev/null
check "persist writes ledger file"    "ceiling: global lock."                        "$(cat docs/TECH_DEBT.md 2>/dev/null)"

# Case 5: clean repo
rm -f a.py b.ts; rm -rf node_modules docs
OUT=$(bash "$SCRIPT")
check "clean repo message"            "No cfn: debt. Clean ledger."                  "$OUT"

echo "---"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
