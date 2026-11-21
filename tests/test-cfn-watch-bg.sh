#!/usr/bin/env bash
# cfn-watch-bg.sh: acknowledges this session's unwatched background task shells
# to the shell watchdog. Request (mdtwii-tooling): the marker touch was a hand
# step typed 7 times, with 2 Stop-hook blocks when forgotten.
# Contract: marks live, unwatched, kind=task ledger rows whose cmd matches the
# pattern; prints marked pids; exits non-zero with missing=[...] when none.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$HERE/.claude/cfn-scripts/cfn-watch-bg.sh"
HOOKS="$HERE/.claude/hooks"
WORK="$(mktemp -d /tmp/cfn-watch-bg-test.XXXXXX)" || exit 1
source "$HERE/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
export CFN_SHELL_WATCH_DIR="$WORK/watch"
SID="wbgsess$$"
export CLAUDE_CODE_SESSION_ID="$SID"
PASS=0; FAIL=0; PIDS=""
cleanup() { for p in $PIDS; do kill "$p" 2>/dev/null; done; cfn_safe_rm_tmp "$WORK"; }
trap cleanup EXIT
ok() { PASS=$((PASS + 1)); echo "  ok: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }
assert_contains() { case "$2" in *"$3"*) ok "$1" ;; *) fail "$1: '$3' not in '$2'" ;; esac; }
assert_not_contains() { case "$2" in *"$3"*) fail "$1: '$3' unexpectedly in '$2'" ;; *) ok "$1" ;; esac; }
marker() { printf '%s/%s.%s.watched' "$CFN_SHELL_WATCH_DIR" "$SID" "$1"; }
bg() { sleep 300 & PIDS="$PIDS $!"; LAST=$!; }

mkdir -p "$CFN_SHELL_WATCH_DIR"
LEDGER="$CFN_SHELL_WATCH_DIR/$SID.tsv"
bg; P_BUILD=$LAST
bg; P_TEST=$LAST
bg; P_SVC=$LAST
bg; P_DONE=$LAST
printf '%s\t1\ttask\tcargo build --release\n' "$P_BUILD" >> "$LEDGER"
printf '%s\t1\ttask\tpnpm test --run\n' "$P_TEST" >> "$LEDGER"
printf '%s\t1\tservice\tcargo watch build\n' "$P_SVC" >> "$LEDGER"
printf '%s\t1\ttask\tcargo build old\n' "$P_DONE" >> "$LEDGER"
touch "$(marker "$P_DONE")"

echo "== cfn-watch-bg =="
[ -x "$HELPER" ] && ok "helper is executable" || fail "helper missing or not executable"

OUT=$(bash "$HELPER" cargo 2>&1); RC=$?
[ "$RC" = 0 ] && ok "match exits 0" || fail "match exits 0: rc=$RC out=$OUT"
[ -f "$(marker "$P_BUILD")" ] && ok "matching task marked" || fail "matching task not marked"
assert_contains "prints marked pid" "$OUT" "$P_BUILD"
[ -f "$(marker "$P_TEST")" ] && fail "non-matching task marked" || ok "non-matching task untouched"
[ -f "$(marker "$P_SVC")" ] && fail "service marked" || ok "service rows never marked"
assert_not_contains "already-watched pid not re-reported" "$OUT" "$P_DONE"

OUT=$(bash "$HELPER" cargo 2>&1); RC=$?
[ "$RC" != 0 ] && ok "nothing left to mark exits non-zero" || fail "second run should exit non-zero"
assert_contains "second run missing=[]" "$OUT" "missing=["

OUT=$(bash "$HELPER" zzz-nomatch 2>&1); RC=$?
[ "$RC" != 0 ] && ok "no match exits non-zero" || fail "no match should exit non-zero"
assert_contains "no match reports missing=[" "$OUT" "missing=[zzz-nomatch]"

kill "$P_TEST"; wait "$P_TEST" 2>/dev/null
OUT=$(bash "$HELPER" pnpm 2>&1); RC=$?
[ "$RC" != 0 ] && ok "dead pid not marked, non-zero" || fail "dead pid marked"
[ -f "$(marker "$P_TEST")" ] && fail "dead pid got marker" || ok "dead pid no marker"

OUT=$(env -u CLAUDE_CODE_SESSION_ID bash "$HELPER" cargo 2>&1); RC=$?
[ "$RC" = 2 ] && ok "no session id exits 2" || fail "no session id: rc=$RC"
OUT=$(bash "$HELPER" 2>&1); RC=$?
[ "$RC" = 2 ] && ok "no pattern exits 2" || fail "no pattern: rc=$RC"

# Watchdog block text points at the helper.
bg; P_NEW=$LAST
printf '%s\t1\ttask\tmake all\n' "$P_NEW" >> "$LEDGER"
OUT=$(printf '{"session_id":"%s"}' "$SID" | bash "$HOOKS/cfn-shell-watchdog.sh")
assert_contains "block names helper" "$OUT" '$HOME/.claude/cfn-scripts/cfn-watch-bg.sh'

echo; echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
