#!/usr/bin/env bash
# Tests for check-test-hygiene.sh (W3a) and gate-check.sh --baseline (W3b / G39).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HYG="$DIR/../check-test-hygiene.sh"
GATE="$DIR/../gate-check.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

RUN=0; PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }
assert_exit() { if [ "$1" -eq "$2" ]; then ok "$3"; else no "$3 (exit $1 wanted $2)"; fi; }

# ---- hygiene: explicit file with markers ----
cat > "$WORK/dirty.spec.ts" <<'EOF'
describe('x', () => {
  it.only('focused', () => {});
  it.skip('disabled', () => {});
  it('kept', () => {});
});
EOF
OUT=$("$HYG" "$WORK/dirty.spec.ts"); CODE=$?
assert_exit $CODE 1 "hygiene: dirty file exits 1"
echo "$OUT" | grep -q '\.only' && ok "hygiene: flags .only" || no "hygiene: flags .only"
echo "$OUT" | grep -q '\.skip' && ok "hygiene: flags .skip" || no "hygiene: flags .skip"

# ---- hygiene: cfn-allow-skip suppresses ----
cat > "$WORK/quarantine.spec.ts" <<'EOF'
describe('x', () => {
  it.skip('flaky', () => {}); // cfn-allow-skip: quarantined 2026-07-09 flaky in CI
  it('kept', () => {});
});
EOF
OUT=$("$HYG" "$WORK/quarantine.spec.ts"); CODE=$?
assert_exit $CODE 0 "hygiene: allow-skip suppresses -> exit 0"
[ "$OUT" = "[]" ] && ok "hygiene: allow-skip clean array" || no "hygiene: allow-skip clean array ($OUT)"

# ---- hygiene: clean file ----
cat > "$WORK/clean.spec.ts" <<'EOF'
describe('x', () => { it('kept', () => {}); });
EOF
OUT=$("$HYG" "$WORK/clean.spec.ts"); CODE=$?
assert_exit $CODE 0 "hygiene: clean -> exit 0"

# ---- gate-check.sh --baseline: byte-identical legacy output ----
cat > "$WORK/vitest.out" <<'EOF'
 Tests  10 passed (10)
EOF
LEGACY=$("$GATE" --out "$WORK/vitest.out" --threshold 0.9)
[ "$LEGACY" = '{"pass":10,"total":10,"rate":1.0000,"passed":true}' ] && ok "baseline absent: legacy output unchanged" || no "baseline absent: legacy output ($LEGACY)"

# ---- gate-check.sh --baseline: shrink -> exit 3 ----
cat > "$WORK/shrunk.out" <<'EOF'
 Tests  8 passed (8)
EOF
OUT=$("$GATE" --out "$WORK/shrunk.out" --threshold 0.9 --baseline 10); CODE=$?
assert_exit $CODE 3 "baseline: total<baseline -> exit 3"
echo "$OUT" | grep -q '"shrunk":true' && ok "baseline: shrunk flag true" || no "baseline: shrunk flag true"

# ---- gate-check.sh --baseline: no shrink -> normal pass ----
OUT=$("$GATE" --out "$WORK/vitest.out" --threshold 0.9 --baseline 10); CODE=$?
assert_exit $CODE 0 "baseline: total==baseline all pass -> exit 0"
echo "$OUT" | grep -q '"shrunk":false' && ok "baseline: shrunk false" || no "baseline: shrunk false"

# ---- gate-check.sh --baseline: bad value -> exit 2 ----
"$GATE" --out "$WORK/vitest.out" --threshold 0.9 --baseline abc >/dev/null 2>&1
assert_exit $? 2 "baseline: non-integer -> exit 2"

echo "----"
echo "W3 hygiene + baseline: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
