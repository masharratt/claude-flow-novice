#!/usr/bin/env bash
# Tests for cfn-a11y-gate execute.sh
# Always-on path (no live browser needed): usage error with no URLs, and the
# graceful dependency-gate when axe-core/playwright are not installed.
# Live path (guarded): only runs when @axe-core/playwright + playwright resolve.
# It serves a tiny HTML file with a known violation (img with no alt) and
# asserts a violation suggestion is emitted into the manifest.
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
check_rc() { # desc, expected-rc, actual-rc
  if [ "$3" -eq "$2" ]; then
    echo "PASS: $1"; PASS=$((PASS+1))
  else
    echo "FAIL: $1 (want rc $2, got $3)"; FAIL=$((FAIL+1))
  fi
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
git init -q
git config user.email t@t.test; git config user.name t
git commit -q --allow-empty -m init

# Case 1: no URLs -> usage error, exit 2
OUT=$(bash "$SCRIPT" 2>&1); RC=$?
check "no URLs: usage message" "no target URLs" "$OUT"
check_rc "no URLs exits 2" 2 "$RC"

# Determine whether the live dependency is present
HAS_AXE=0
if command -v node >/dev/null 2>&1 \
   && node -e "require.resolve('@axe-core/playwright'); require.resolve('playwright')" >/dev/null 2>&1; then
  HAS_AXE=1
fi

if [ "$HAS_AXE" -eq 0 ]; then
  # Case 2 (no-axe): dependency gate -> exit 3 + documented install line
  OUT=$(bash "$SCRIPT" --url http://localhost:1/nope 2>&1); RC=$?
  check "missing dep: gate message" "not installed" "$OUT"
  check "missing dep: install line" "npm install --save-dev @axe-core/playwright playwright" "$OUT"
  check_rc "missing dep exits 3" 3 "$RC"
  echo "NOTE: axe-core/playwright not installed; live scan path skipped (graceful degradation verified)."
else
  # Case 2 (live): serve a tiny HTML page with a known violation (img, no alt)
  printf '<!doctype html><html lang="en"><head><title>t</title></head><body><img src="x.png"></body></html>\n' > index.html
  PORT=8731
  python3 -m http.server "$PORT" >/dev/null 2>&1 &
  SRV=$!
  trap 'kill "$SRV" 2>/dev/null; rm -rf "$WORK"' EXIT
  # wait for server
  for _ in $(seq 1 20); do
    curl -fsS "http://localhost:${PORT}/" >/dev/null 2>&1 && break
    sleep 0.25
  done
  OUT=$(bash "$SCRIPT" --url "http://localhost:${PORT}/index.html" 2>&1); RC=$?
  check "live scan: reports violations" "violations found:" "$OUT"
  check_rc "violations found exits 1" 1 "$RC"
  MANIFEST=$(ls -t .cfn-cache/manifests/cfn-a11y-gate-*.json 2>/dev/null | head -1)
  check "manifest filename pattern" "cfn-a11y-gate-" "$MANIFEST"
  if [ -n "$MANIFEST" ] && jq -e \
       '.source=="cfn-a11y-gate" and (.suggestions|type=="array") and (.suggestions|length>0) and ([.suggestions[].category]|index("image-alt") != null)' \
       "$MANIFEST" >/dev/null 2>&1; then
    echo "PASS: manifest has image-alt violation suggestion"; PASS=$((PASS+1))
  else
    echo "FAIL: manifest has image-alt violation suggestion"; FAIL=$((FAIL+1))
  fi
fi

echo "---"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
