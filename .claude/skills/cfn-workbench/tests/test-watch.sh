#!/usr/bin/env bash
# test-watch.sh - TDD coverage for cfn-workbench watch.sh (F1: re-render loop).
#
# Asserts against workbench-live-contracts.md F1. Written before watch.sh
# exists; expected to FAIL until it lands.
#
# Run: bash .claude/skills/cfn-workbench/tests/test-watch.sh

set -uo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCH="$SKILL_DIR/watch.sh"

TMP_OUT="$(mktemp -d)"
WROOT1="$(mktemp -d)"  # foreground change-detection
WROOT2="$(mktemp -d)"  # daemon pidfile lifecycle
WROOT3="$(mktemp -d)"  # stale pidfile

SLUG_STATUS="wbwatch-status-$$"
SLUG_FG="wbwatch-fg-$$"
SLUG_BADROOT="wbwatch-badroot-$$"
SLUG_DAEMON="wbwatch-daemon-$$"
SLUG_STALE="wbwatch-stale-$$"

WPID=""

# Kill any watcher process left running for our slugs, remove pidfiles/logs,
# remove temp roots. Runs on every exit path so no test leaves a background
# process alive or scratch files behind.
cleanup() {
  local s pf p
  for s in "$SLUG_STATUS" "$SLUG_FG" "$SLUG_BADROOT" "$SLUG_DAEMON" "$SLUG_STALE"; do
    pf="/tmp/cfn-workbench-watch-${s}.pid"
    if [[ -f "$pf" ]]; then
      p="$(cat "$pf" 2>/dev/null || true)"
      [[ -n "$p" ]] && kill "$p" 2>/dev/null || true
      rm -f "$pf"
    fi
    rm -f "/tmp/cfn-workbench-watch-${s}.log"
  done
  if [[ -n "$WPID" ]]; then
    kill "$WPID" 2>/dev/null || true
    wait "$WPID" 2>/dev/null || true
  fi
  rm -rf "$TMP_OUT" "$WROOT1" "$WROOT2" "$WROOT3"
}
trap cleanup EXIT

PASS=0
FAIL=0
FAILED_TESTS=()

if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_NC=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_NC=""
fi

ok()   { PASS=$((PASS+1)); printf "  ${C_GREEN}PASS${C_NC}  %s\n" "$1"; }
fail() { FAIL=$((FAIL+1)); FAILED_TESTS+=("$1"); printf "  ${C_RED}FAIL${C_NC}  %s\n" "$1"; }

assert_contains() {
  local name="$1" file="$2" needle="$3"
  if grep -qF -- "$needle" "$file"; then ok "$name"
  else fail "$name (missing: $needle)"; fi
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

# wait_for_file FILE MAX_ITERS(0.25s each)
wait_for_file() {
  local f="$1" max="${2:-20}" i=0
  while [[ ! -f "$f" && $i -lt $max ]]; do
    sleep 0.25; i=$((i+1))
  done
  [[ -f "$f" ]]
}

echo "=== cfn-workbench watch.sh test suite ==="
echo "skill dir: $SKILL_DIR"
echo

for r in "$WROOT1" "$WROOT2" "$WROOT3"; do
  mkdir -p "$r/.cfn-cache/manifests" "$r/planning" "$r/tmp" "$r/tests/screenshots"
done

# ---------------------------------------------------------------
# GROUP 1: existence, args, exit codes
# ---------------------------------------------------------------
echo "[1] existence and args"

if [[ -x "$WATCH" ]]; then ok "watch.sh is executable"
elif [[ -f "$WATCH" ]]; then
  chmod +x "$WATCH" 2>/dev/null || true
  if [[ -x "$WATCH" ]]; then ok "watch.sh is executable (after chmod)"
  else fail "watch.sh exists but not executable"; fi
else fail "watch.sh missing"; fi

assert_exit "missing --slug exits 2" 2 "$WATCH" --foreground
assert_exit "unknown arg exits 2" 2 "$WATCH" --slug x --bogus
assert_exit "--help exits 0" 0 "$WATCH" --help
assert_exit "--interval missing value exits 2" 2 "$WATCH" --slug x --interval
assert_exit "--interval zero exits 2" 2 "$WATCH" --slug x --interval 0
assert_exit "--interval non-numeric exits 2" 2 "$WATCH" --slug x --interval abc
assert_exit "--root missing value exits 2" 2 "$WATCH" --slug x --root

STDERR1="$TMP_OUT/stderr-bad-arg.txt"
"$WATCH" --slug x --bogus >/dev/null 2>"$STDERR1"
assert_match "bad arg: usage printed to stderr" "$STDERR1" "([Uu]sage)"

# ---------------------------------------------------------------
# GROUP 2: --status / --stop when nothing is running
# ---------------------------------------------------------------
echo "[2] status/stop when not running"

STATUS_NONE="$TMP_OUT/status-none.txt"
"$WATCH" --slug "$SLUG_STATUS" --status >"$STATUS_NONE" 2>&1
RC=$?
[[ "$RC" -eq 1 ]] && ok "status: not-running exits 1" || fail "status: not-running exit=$RC (want 1)"
assert_match "status: not-running message" "$STATUS_NONE" "not running"

STOP_NONE="$TMP_OUT/stop-none.txt"
"$WATCH" --slug "$SLUG_STATUS" --stop >"$STOP_NONE" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "stop: no watcher running exits 0" || fail "stop: no watcher running exit=$RC (want 0)"

# ---------------------------------------------------------------
# GROUP 3: foreground loop, change detection (WORKBENCH_WATCH_MAX_TICKS)
# ---------------------------------------------------------------
echo "[3] foreground change detection"

echo '{}' > "$WROOT1/.cfn-cache/manifests/cfn-seed.json"
WOUT1="$TMP_OUT/fg-out.html"
LOG_FG="$TMP_OUT/fg.log"

WORKBENCH_WATCH_MAX_TICKS=6 "$WATCH" --slug "$SLUG_FG" --root "$WROOT1" --out "$WOUT1" \
  --interval 1 --foreground --no-screenshots >"$LOG_FG" 2>&1 &
WPID=$!

if wait_for_file "$WOUT1" 20; then ok "fg: first tick rendered output"
else fail "fg: first tick did not render within timeout"; fi

if [[ -f "$WOUT1" ]]; then
  assert_contains "fg: render invoked with --live 1 (meta refresh)" "$WOUT1" \
    '<meta http-equiv="refresh" content="1">'

  M1=$(stat -c %Y "$WOUT1" 2>/dev/null || echo 0)
  C1=$(md5sum "$WOUT1" 2>/dev/null | awk '{print $1}')

  # Tick with nothing changed: file must be untouched (same mtime + content).
  sleep 1.5
  M2=$(stat -c %Y "$WOUT1" 2>/dev/null || echo 0)
  C2=$(md5sum "$WOUT1" 2>/dev/null | awk '{print $1}')
  if [[ "$M2" -eq "$M1" && "$C2" == "$C1" ]]; then
    ok "fg: no re-render when nothing changed (mtime/content stable)"
  else
    fail "fg: unexpected re-render with no changes (m1=$M1 m2=$M2 c1=$C1 c2=$C2)"
  fi

  # Touch a fingerprint source; expect a re-render on a subsequent tick.
  touch "$WROOT1/.cfn-cache/manifests/cfn-seed.json"
  i=0
  M3="$M1"
  while [[ "$M3" -eq "$M1" && $i -lt 20 ]]; do
    sleep 0.25
    M3=$(stat -c %Y "$WOUT1" 2>/dev/null || echo 0)
    i=$((i+1))
  done
  if [[ "$M3" -ne "$M1" ]]; then ok "fg: re-renders after fixture change"
  else fail "fg: did not re-render after fixture touch (timeout)"; fi
else
  fail "fg: --live meta refresh check skipped (no output file)"
  fail "fg: stability check skipped (no output file)"
  fail "fg: change-detection check skipped (no output file)"
fi

wait "$WPID" 2>/dev/null
FG_RC=$?
[[ "$FG_RC" -eq 0 ]] && ok "fg: watch process exits 0 after MAX_TICKS" \
  || fail "fg: watch process exit=$FG_RC (want 0)"
WPID=""

# ---------------------------------------------------------------
# GROUP 4: render failure never kills the loop
# ---------------------------------------------------------------
echo "[4] render failure resilience"

BADROOT="$TMP_OUT/does-not-exist-$$"
LOG_BAD="$TMP_OUT/badroot.log"
WORKBENCH_WATCH_MAX_TICKS=2 "$WATCH" --slug "$SLUG_BADROOT" --root "$BADROOT" \
  --interval 1 --foreground --no-screenshots >"$LOG_BAD" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "fg: loop survives render failure (bad root), exits 0" \
  || fail "fg: loop exit=$RC on render failure (want 0, must never die)"

# ---------------------------------------------------------------
# GROUP 5: daemon pidfile lifecycle (start/status/stop, idempotent start)
# ---------------------------------------------------------------
echo "[5] daemon pidfile lifecycle"

PIDFILE_D="/tmp/cfn-workbench-watch-${SLUG_DAEMON}.pid"
rm -f "$PIDFILE_D"

START_OUT="$TMP_OUT/daemon-start.txt"
"$WATCH" --slug "$SLUG_DAEMON" --root "$WROOT2" --interval 5 --no-screenshots \
  >"$START_OUT" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "daemon: start exits 0" || fail "daemon: start exit=$RC (want 0)"
assert_match "daemon: start message (Watcher started: pid N interval 5s)" "$START_OUT" \
  "Watcher started: pid [0-9]+ interval 5s"
assert_file_exists "daemon: pidfile written" "$PIDFILE_D"

DPID="$(cat "$PIDFILE_D" 2>/dev/null || echo "")"
if [[ -n "$DPID" ]] && kill -0 "$DPID" 2>/dev/null; then ok "daemon: pidfile pid is alive"
else fail "daemon: pidfile pid not alive (pid=$DPID)"; fi

STATUS_RUN="$TMP_OUT/daemon-status.txt"
"$WATCH" --slug "$SLUG_DAEMON" --status >"$STATUS_RUN" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "daemon: status running exits 0" || fail "daemon: status exit=$RC (want 0)"
assert_match "daemon: status message (running (pid N))" "$STATUS_RUN" "running \(pid [0-9]+\)"

START_OUT2="$TMP_OUT/daemon-start2.txt"
"$WATCH" --slug "$SLUG_DAEMON" --root "$WROOT2" --interval 5 --no-screenshots \
  >"$START_OUT2" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "daemon: double start exits 0 (idempotent)" \
  || fail "daemon: double start exit=$RC (want 0)"
assert_match "daemon: double start message (already running)" "$START_OUT2" \
  "already running \(pid [0-9]+\)"

DPID2="$(cat "$PIDFILE_D" 2>/dev/null || echo "")"
[[ "$DPID" == "$DPID2" ]] && ok "daemon: pid unchanged across double start" \
  || fail "daemon: pid changed on double start ($DPID -> $DPID2)"

STOP_OUT="$TMP_OUT/daemon-stop.txt"
"$WATCH" --slug "$SLUG_DAEMON" --stop >"$STOP_OUT" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "daemon: stop exits 0" || fail "daemon: stop exit=$RC (want 0)"

sleep 0.5
if [[ -n "$DPID" ]] && kill -0 "$DPID" 2>/dev/null; then
  fail "daemon: process still alive after stop (pid=$DPID)"
else
  ok "daemon: process terminated after stop"
fi

[[ ! -f "$PIDFILE_D" ]] && ok "daemon: pidfile removed after stop" \
  || fail "daemon: pidfile still present after stop"

STATUS_AFTER="$TMP_OUT/daemon-status-after-stop.txt"
"$WATCH" --slug "$SLUG_DAEMON" --status >"$STATUS_AFTER" 2>&1
RC=$?
[[ "$RC" -eq 1 ]] && ok "daemon: status not-running after stop exits 1" \
  || fail "daemon: status exit=$RC after stop (want 1)"

# ---------------------------------------------------------------
# GROUP 6: stale pidfile (dead pid) is replaced, not treated as running
# ---------------------------------------------------------------
echo "[6] stale pidfile replacement"

PIDFILE_S="/tmp/cfn-workbench-watch-${SLUG_STALE}.pid"
rm -f "$PIDFILE_S"
echo 999999999 > "$PIDFILE_S"   # far past max pid range: guaranteed dead

STALE_START="$TMP_OUT/stale-start.txt"
"$WATCH" --slug "$SLUG_STALE" --root "$WROOT3" --interval 5 --no-screenshots \
  >"$STALE_START" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "stale pidfile: start exits 0" || fail "stale pidfile: start exit=$RC (want 0)"
assert_match "stale pidfile: fresh start message" "$STALE_START" "Watcher started"
assert_no_match "stale pidfile: not reported as already running" "$STALE_START" "already running"

NEWPID="$(cat "$PIDFILE_S" 2>/dev/null || echo "")"
[[ -n "$NEWPID" && "$NEWPID" != "999999999" ]] && ok "stale pidfile: pid replaced with live pid" \
  || fail "stale pidfile: pid not replaced (got=$NEWPID)"

"$WATCH" --slug "$SLUG_STALE" --stop >/dev/null 2>&1

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
