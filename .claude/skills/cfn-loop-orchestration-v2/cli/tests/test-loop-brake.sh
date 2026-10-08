#!/usr/bin/env bash
# Tests for loop-brake.sh: stop a cfn-loop-task run that is not making progress.
# Origin: MAX_ITERATIONS (5/10/15) is the only stop, so a run whose rounds fail
# identically burns every remaining round before anyone hears about it.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/../loop-brake.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export CFN_LOOP_BRAKE_DIR="$WORK/brake"
unset CFN_LOOP_BRAKE_REPEATS

RUN=0; PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }
assert_exit() { if [ "$1" -eq "$2" ]; then ok "$3"; else no "$3 (exit $1 wanted $2)"; fi; }
assert_has() { if echo "$1" | grep -q -- "$2"; then ok "$3"; else no "$3 (missing '$2' in: $1)"; fi; }

# Two vitest-shaped outputs: same failing tests, different timings and colours.
cat > "$WORK/a.txt" <<'TXT'
 ✓ src/ok.test.ts (3 tests) 12ms
 FAIL  src/auth.test.ts > parseToken > rejects expired (4 ms)
 FAIL  src/session.test.ts > loadSession > missing id
 Test Files  2 failed | 1 passed (3)
      Tests  2 failed | 3 passed (5)
TXT
printf ' \033[31mFAIL\033[39m  src/auth.test.ts > parseToken > rejects expired (19 ms)\n FAIL  src/session.test.ts > loadSession > missing id\n      Tests  2 failed | 3 passed (5)\n' > "$WORK/a2.txt"
cat > "$WORK/b.txt" <<'TXT'
 FAIL  src/session.test.ts > loadSession > missing id
      Tests  1 failed | 4 passed (5)
TXT
# pytest, go, cargo shapes
cat > "$WORK/py.txt" <<'TXT'
FAILED tests/test_api.py::test_create - AssertionError: 400 != 201
FAILED tests/test_api.py::test_delete - KeyError: 'id'
TXT
cat > "$WORK/go.txt" <<'TXT'
--- FAIL: TestParse (0.00s)
--- FAIL: TestLoad (0.12s)
TXT
printf 'no recognizable failure lines here\n' > "$WORK/unknown.txt"

rec() { bash "$SCRIPT" record --run-id "$1" --iteration "$2" --test-output "$3" "${@:4}"; }

echo "## 1. same failures three rounds in a row engages the brake"
OUT=$(rec r1 1 "$WORK/a.txt"); assert_exit $? 0 "round 1 continues"
OUT=$(rec r1 2 "$WORK/a2.txt"); assert_exit $? 0 "round 2 (first repeat, timing+ANSI differ) continues"
assert_has "$OUT" '"streak":2' "timing and colour noise ignored: streak 2"
OUT=$(rec r1 3 "$WORK/a.txt"); assert_exit $? 1 "round 3 (second repeat) brakes"
assert_has "$OUT" '"brake":true' "brake flag in JSON"
assert_has "$OUT" 'rejects expired' "brake output names the stuck tests"

echo "## 2. progress resets the streak"
rec r2 1 "$WORK/a.txt" >/dev/null
rec r2 2 "$WORK/a.txt" >/dev/null
OUT=$(rec r2 3 "$WORK/b.txt"); assert_exit $? 0 "different failures continue"
assert_has "$OUT" '"streak":1' "streak reset to 1"

echo "## 3. re-recording the same iteration replaces, never double-counts"
rec r3 1 "$WORK/a.txt" >/dev/null
rec r3 2 "$WORK/a.txt" >/dev/null
OUT=$(rec r3 2 "$WORK/a.txt"); assert_exit $? 0 "flaky re-run of round 2 does not brake"
assert_has "$OUT" '"streak":2' "still streak 2"

echo "## 4. other runners"
rec r4 1 "$WORK/py.txt" >/dev/null; rec r4 2 "$WORK/py.txt" >/dev/null
OUT=$(rec r4 3 "$WORK/py.txt"); assert_exit $? 1 "pytest FAILED lines brake"
assert_has "$OUT" 'test_create' "pytest names listed"
rec r5 1 "$WORK/go.txt" >/dev/null; rec r5 2 "$WORK/go.txt" >/dev/null
OUT=$(rec r5 3 "$WORK/go.txt"); assert_exit $? 1 "go --- FAIL lines brake (durations ignored)"

echo "## 5. unknown output falls back to pass/total counts"
rec r6 1 "$WORK/unknown.txt" --pass 7 --total 10 >/dev/null
rec r6 2 "$WORK/unknown.txt" --pass 8 --total 10 >/dev/null
OUT=$(rec r6 3 "$WORK/unknown.txt" --pass 8 --total 10); assert_exit $? 0 "count changed in round 2: no brake"
OUT=$(rec r6 4 "$WORK/unknown.txt" --pass 8 --total 10); assert_exit $? 1 "same counts three rounds: brake"
OUT=$(rec r7 1 "$WORK/unknown.txt"); assert_exit $? 0 "no lines and no counts: never brakes"
rec r7 2 "$WORK/unknown.txt" >/dev/null
OUT=$(rec r7 3 "$WORK/unknown.txt"); assert_exit $? 0 "empty fingerprint never brakes"
assert_has "$OUT" '"fingerprint":"none"' "empty fingerprint reported as none"

echo "## 6. threshold is tunable"
CFN_LOOP_BRAKE_REPEATS=1 rec r8 1 "$WORK/a.txt" >/dev/null
OUT=$(CFN_LOOP_BRAKE_REPEATS=1 rec r8 2 "$WORK/a.txt"); assert_exit $? 1 "REPEATS=1 brakes on first repeat"

echo "## 7. usage errors"
bash "$SCRIPT" record --run-id x --iteration 1 >/dev/null 2>&1; assert_exit $? 2 "missing --test-output exits 2"
bash "$SCRIPT" record --run-id x --iteration one --test-output "$WORK/a.txt" >/dev/null 2>&1; assert_exit $? 2 "non-numeric iteration exits 2"
bash "$SCRIPT" record --run-id x --iteration 1 --test-output "$WORK/nope.txt" >/dev/null 2>&1; assert_exit $? 2 "missing output file exits 2"
bash "$SCRIPT" record --run-id '../evil' --iteration 1 --test-output "$WORK/a.txt" >/dev/null 2>&1; assert_exit $? 2 "path-like run id rejected"

echo
echo "loop-brake: $PASS passed, $FAIL failed ($RUN run)"
[ "$FAIL" -eq 0 ]
