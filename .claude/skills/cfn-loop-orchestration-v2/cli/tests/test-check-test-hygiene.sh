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

# ---- S001 regression (origin: ROOTCAUSE_mpa_thread_wiring_gap.md, AC-77) ----
# The wiring-guard test that shipped a thread feature 81/81 all-green while
# unreachable from src/index.ts was written as
# `describe.skipIf(!THREAD_REFACTOR_ENABLED)`. The old `\.skip\(` pattern
# required a literal `(` immediately after `skip`, so `skipIf(` never matched
# and the guard silently no-op'd while still counting green. This fixture
# reproduces that exact shape plus the sibling runIf/concurrent.skip evasions.
cat > "$WORK/skip-family.spec.ts" <<'EOF'
describe.skipIf(!THREAD_REFACTOR_ENABLED)('wiring guard', () => {
  it('routes to prod call site', () => {});
});
it.runIf(FLAG)('conditionally kept', () => {});
describe.concurrent.skip('disabled concurrent suite', () => {});
EOF
OUT=$("$HYG" "$WORK/skip-family.spec.ts"); CODE=$?
assert_exit $CODE 1 "hygiene: skipIf/runIf/concurrent.skip family flagged (AC-77 regression)"
echo "$OUT" | grep -q 'skipIf' && ok "hygiene: flags .skipIf(" || no "hygiene: flags .skipIf("
echo "$OUT" | grep -q 'runIf' && ok "hygiene: flags .runIf(" || no "hygiene: flags .runIf("
echo "$OUT" | grep -q 'concurrent.skip' && ok "hygiene: flags .concurrent.skip" || no "hygiene: flags .concurrent.skip"

# ---- S001 regression: pytest.mark.skipif (non-@-anchored form) ----
cat > "$WORK/skipif_test.py" <<'EOF'
import pytest

pytest.mark.skipif(True, reason="disabled dynamically")
def test_guard():
    pass
EOF
OUT=$("$HYG" "$WORK/skipif_test.py"); CODE=$?
assert_exit $CODE 1 "hygiene: pytest.mark.skipif flagged (AC-77 regression)"
echo "$OUT" | grep -q 'skipif' && ok "hygiene: flags pytest.mark.skipif" || no "hygiene: flags pytest.mark.skipif"

# ---- S001: skipIf still suppressible via cfn-allow-skip ----
cat > "$WORK/skipif-quarantine.spec.ts" <<'EOF'
describe.skipIf(!FLAG)('quarantined', () => {}); // cfn-allow-skip: quarantined 2026-07-11 pending flag cleanup
EOF
OUT=$("$HYG" "$WORK/skipif-quarantine.spec.ts"); CODE=$?
assert_exit $CODE 0 "hygiene: skipIf with cfn-allow-skip suppresses -> exit 0"
[ "$OUT" = "[]" ] && ok "hygiene: skipIf allow-skip clean array" || no "hygiene: skipIf allow-skip clean array ($OUT)"

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

# ---- S003 regression (origin: ROOTCAUSE_mpa_thread_wiring_gap.md): pytest
# branch used to compute TOTAL = PASS + FAIL + ERR, dropping SKIPPED, so
# skipping a failing test RAISED the reported pass rate. Now sourced from the
# shared lib/parse-test-summary.sh parser, which includes skipped in the
# denominator for every runner (matching the vitest branch's prior behavior). ----
cat > "$WORK/pytest-skip.out" <<'EOF'
===== 7 passed, 1 failed, 2 skipped in 1.23s =====
EOF
OUT=$("$GATE" --out "$WORK/pytest-skip.out" --threshold 1.0)
echo "$OUT" | grep -q '"total":10' && ok "S003: pytest TOTAL includes skipped (7+1+0+2=10)" || no "S003: pytest TOTAL includes skipped ($OUT)"
echo "$OUT" | grep -q '"pass":7' && ok "S003: pytest pass count correct" || no "S003: pytest pass count correct"
echo "$OUT" | grep -q '"rate":0.7000' && ok "S003: pytest rate reflects skipped in denominator (0.7, not the old 0.875)" || no "S003: pytest rate reflects skipped in denominator ($OUT)"

echo "----"
echo "W3 hygiene + baseline: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
