#!/usr/bin/env bash
# tests/test-safe-rm-tmp.sh
# Unit test for cfn_safe_rm_tmp (.claude/cfn-scripts/lib/safe-rm.sh).
#
# Incident 2026-10-15: a failed mktemp inside `cd "$(mktemp ...)"` left a test's
# temp var pointing at the repo root and its EXIT trap rm -rf'd the repo. This
# test proves the guard refuses every dangerous target and still deletes a
# real temp dir.
#
# Safety of the test itself: every REFUSAL case runs in a subshell where `rm`
# is shadowed by a function that only logs its arguments. A broken guard can
# therefore never delete /, $HOME, the repo or anything else; it only shows up
# as a logged RM line and a failed assertion. Real deletion happens only for
# the ALLOWED cases, and only inside a sacrificial tree made by mktemp and
# checked to match */saferm.* before use.
#
# Override the lib under test with CFN_SAFE_RM_LIB=/path (used to prove red).
set -u

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P) || exit 1
LIB="${CFN_SAFE_RM_LIB:-$PROJECT_ROOT/.claude/cfn-scripts/lib/safe-rm.sh}"
[ -f "$LIB" ] || { echo "FAIL: lib not found: $LIB"; exit 1; }
# shellcheck source=/dev/null
source "$LIB"

T=$(mktemp -d "${TMPDIR:-/tmp}/saferm.XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
case "$T" in */saferm.*) ;; *) echo "FAIL: scratch dir has unexpected shape: $T"; exit 1 ;; esac
trap 'cfn_safe_rm_tmp "$T"' EXIT

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }

RMLOG="$T/rm.log"

# expect_refused NAME CWD [ENV=VAL ...] -- PATH...
# Runs cfn_safe_rm_tmp from CWD in a subshell with rm stubbed. Passes when the
# call returns non-zero, prints REFUSED to stderr, and never reached rm.
expect_refused() {
    local name="$1" cwd="$2"; shift 2
    local envs=()
    while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do envs+=("$1"); shift; done
    [ "${1:-}" = "--" ] && shift
    : >"$RMLOG"
    local err rc
    err=$(
        cd "$cwd" || exit 97
        for kv in ${envs[@]+"${envs[@]}"}; do export "${kv?}"; done
        rm() { printf 'RM %s\n' "$*" >>"$RMLOG"; }
        cfn_safe_rm_tmp "$@" 2>&1 >/dev/null
    )
    rc=$?
    if [ "$rc" -ne 0 ] && [ "$rc" -ne 97 ] && [ ! -s "$RMLOG" ] && printf '%s' "$err" | grep -q 'REFUSED'; then
        ok "$name"
    else
        no "$name (rc=$rc rm_calls=[$(tr '\n' ';' <"$RMLOG")] stderr=[$err])"
    fi
}

mkdir -p "$T/home/sub" "$T/cwd/inner" "$T/plain/inner" "$T/repo/sub" "$T/wt" \
    "$T/victim/a/b" "$T/victim2/x" "$T/keep" "$T/gp/proj/sub"
echo data >"$T/victim/a/b/f"
echo data >"$T/victim2/x/f"
echo keep >"$T/keep/f"
git init -q "$T/repo" 2>/dev/null || mkdir -p "$T/repo/.git"
git init -q "$T/gp/proj" 2>/dev/null || mkdir -p "$T/gp/proj/.git"
echo "gitdir: /nowhere" >"$T/wt/.git"
ln -s "$T/home" "$T/link-to-home"
ln -s /usr "$T/link-to-usr"
ln -s "$T/victim2" "$T/link-to-victim2"

echo "cfn_safe_rm_tmp refusals"
expect_refused "no arguments"                       "$T/plain" --
expect_refused "empty path"                         "$T/plain" -- ""
expect_refused "root /"                             "$T/plain" -- /
expect_refused "root via //"                        "$T/plain" -- //
expect_refused "\$HOME itself"                      "$T/plain" "HOME=$T/home" -- "$T/home"
expect_refused "ancestor of \$HOME"                 "$T/plain" "HOME=$T/home/sub" -- "$T/home"
expect_refused "symlink resolving to \$HOME"        "$T/plain" "HOME=$T/home" -- "$T/link-to-home"
expect_refused "the cwd itself"                     "$T/cwd/inner" -- "$T/cwd/inner"
expect_refused "the cwd as ."                       "$T/cwd/inner" -- .
expect_refused "ancestor of the cwd"                "$T/cwd/inner" -- "$T/cwd"
expect_refused "ancestor of the cwd as .."          "$T/cwd/inner" -- ..
expect_refused "git toplevel (.git dir)"            "$T/plain" -- "$T/repo"
expect_refused "git worktree (.git file)"           "$T/plain" -- "$T/wt"
expect_refused "ancestor of cwd's git toplevel"     "$T/gp/proj/sub" -- "$T/gp"
expect_refused "outside temp roots (/usr)"          "$T/plain" -- /usr
expect_refused "symlink resolving outside roots"    "$T/plain" -- "$T/link-to-usr"
expect_refused "this repo"                          "$T/plain" -- "$PROJECT_ROOT"
expect_refused "/tmp itself (a temp root)"          "$T/plain" -- /tmp
[ -d /private/tmp ] && \
    expect_refused "/private/tmp itself"           "$T/plain" -- /private/tmp
expect_refused "\$TMPDIR itself (a temp root)"      "$T/plain" "TMPDIR=$T" -- "$T"
expect_refused "poisoned TMPDIR=/ does not widen"   "$T/plain" "TMPDIR=/" -- /usr

# A refusal anywhere in the list deletes nothing, including the valid paths.
: >"$RMLOG"
( cd "$T/plain" && cfn_safe_rm_tmp "$T/keep" "" ) 2>/dev/null
rc=$?
if [ "$rc" -ne 0 ] && [ -f "$T/keep/f" ]; then
    ok "one bad path in the list: nothing deleted"
else
    no "one bad path in the list: rc=$rc keep_exists=$([ -f "$T/keep/f" ] && echo yes || echo no)"
fi

echo "cfn_safe_rm_tmp allowed cases"
( cd "$T/plain" && cfn_safe_rm_tmp "$T/victim" ) 2>"$T/err"
rc=$?
if [ "$rc" -eq 0 ] && [ ! -e "$T/victim" ]; then ok "temp dir under \$TMPDIR deleted"
else no "temp dir under \$TMPDIR: rc=$rc exists=$([ -e "$T/victim" ] && echo yes || echo no) err=[$(cat "$T/err")]"; fi

( cd "$T/plain" && cfn_safe_rm_tmp "$T/link-to-victim2" ) 2>"$T/err"
rc=$?
if [ "$rc" -eq 0 ] && [ ! -e "$T/victim2" ]; then ok "symlink to temp dir: resolved target deleted"
else no "symlink to temp dir: rc=$rc err=[$(cat "$T/err")]"; fi

( cd "$T/plain" && cfn_safe_rm_tmp "$T/does-not-exist" ) 2>"$T/err"
rc=$?
if [ "$rc" -eq 0 ]; then ok "missing path is a no-op"; else no "missing path: rc=$rc"; fi

echo "tests/test-utils.sh cleanup_temp_dir delegates to the guard"
: >"$RMLOG"
out=$(
    cd "$T/cwd/inner" || exit 97
    rm() { printf 'RM %s\n' "$*" >>"$RMLOG"; }
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/tests/test-utils.sh" >/dev/null 2>&1
    set +e
    cleanup_temp_dir "$T/cwd/inner" 2>&1
    echo "rc=$?"
)
if printf '%s' "$out" | grep -q 'rc=[1-9]' && [ ! -s "$RMLOG" ] && [ -d "$T/cwd/inner" ]; then
    ok "cleanup_temp_dir refuses the cwd"
else
    no "cleanup_temp_dir refuses the cwd (out=[$out] rm_calls=[$(tr '\n' ';' <"$RMLOG")])"
fi
mkdir -p "$T/ctd/x"
out=$(
    cd "$T/plain" || exit 97
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/tests/test-utils.sh" >/dev/null 2>&1
    set +e
    cleanup_temp_dir "$T/ctd" >/dev/null 2>&1
    echo "rc=$?"
)
if [ "$out" = "rc=0" ] && [ ! -e "$T/ctd" ]; then ok "cleanup_temp_dir deletes a temp dir"
else no "cleanup_temp_dir deletes a temp dir (out=[$out])"; fi

echo
echo "safe-rm: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
