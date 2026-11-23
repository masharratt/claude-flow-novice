#!/usr/bin/env bash
# tests/test-cfn-test-box.sh
# cfn-test-box.sh: run a command in a bubblewrap box where the whole disk is
# read-only except the current git worktree (+ its shared .git when linked)
# and any --rw dirs, with a private /tmp.
#
# Why (incident 2026-11-23, MDTWII): a builder test's empty temp variable ran
# rm -rf /home /tmp. safe-bin/rm (phase 1) catches rm on PATH only; /bin/rm,
# find -delete, python shutil.rmtree and git clean bypass it. The box stops
# all of them because the files are simply not writable.
#
# Safety: protected dirs here are mktemp dirs, never the real home. The only
# deletes are cfn_safe_rm_tmp of the checked temp dirs.
set -u

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P) || exit 1
BOX="$REPO/.claude/cfn-scripts/cfn-test-box.sh"
# shellcheck source=/dev/null
source "$REPO/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1

T=$(mktemp -d /tmp/cfn-test-box-test.XXXXXX) || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
case "$T" in /tmp/cfn-test-box-test.?*) ;; *) echo "bad temp dir '$T'"; exit 1 ;; esac
# A second protected dir OUTSIDE /tmp (the box hides host /tmp, so a dir there
# proves the read-only root itself, not just --ro). Cleaned with TMPDIR set to
# its base so cfn_safe_rm_tmp accepts it.
V=""
if V=$(mktemp -d /var/tmp/cfn-test-box-test.XXXXXX 2>/dev/null); then
    case "$V" in /var/tmp/cfn-test-box-test.?*) ;; *) echo "bad /var/tmp dir '$V'"; exit 1 ;; esac
else
    V=""
fi
MARK="$T.box-marker"
cleanup() {
    cfn_safe_rm_tmp "$T"
    [ -e "$MARK" ] && cfn_safe_rm_tmp "$MARK"
    [ -n "$V" ] && TMPDIR=/var/tmp cfn_safe_rm_tmp "$V"
}
trap cleanup EXIT

PASS=0 FAIL=0 SKIP=0
ok()   { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  skip $1"; }

# box DIR ARGS...: run the box from DIR; rc in RC, stdout in OUT, stderr in ERR.
box() { local d="$1"; shift; OUT=$(cd "$d" && "$BOX" "$@" 2>"$T/err"); RC=$?; ERR=$(cat "$T/err"); }

# --- fixtures ---------------------------------------------------------------
G=(git -c user.name=box-test -c user.email=box-test@example.invalid -c init.defaultBranch=main -c commit.gpgsign=false)
mkdir -p "$T/repo" "$T/prot/sub" "$T/extra" "$T/fakehome/.cache" "$T/norepo" "$T/emptybin"
echo keep >"$T/prot/keep.txt"; echo keep >"$T/prot/sub/deep.txt"
"${G[@]}" -C "$T/repo" init -q && echo a >"$T/repo/a.txt" && "${G[@]}" -C "$T/repo" add a.txt \
    && "${G[@]}" -C "$T/repo" commit -qm init || { echo "fixture repo failed"; exit 1; }
"${G[@]}" -C "$T/repo" worktree add -q "$T/wt" -b wt-branch || { echo "fixture worktree failed"; exit 1; }
[ -n "$V" ] && { echo keep >"$V/keep.txt"; }

echo "== missing bubblewrap =="
OUT=$(cd "$T/repo" && env PATH="$T/emptybin" /bin/bash "$BOX" -- /bin/sh -c "echo ran >'$T/repo/ran.txt'" 2>&1); RC=$?
[ "$RC" -eq 69 ] && [ ! -e "$T/repo/ran.txt" ] && case "$OUT" in *bwrap*) true ;; *) false ;; esac \
    && ok "no bwrap: exit 69, command not run, message names bwrap" || bad "no bwrap: rc=$RC out=$OUT"

if [ ! -f "$BOX" ]; then
    bad "box script exists at $BOX"
elif ! command -v bwrap >/dev/null 2>&1 || ! bwrap --ro-bind / / --dev /dev --proc /proc true 2>/dev/null; then
    skip "bwrap missing or unusable here (no user namespaces): box cases not run"
else
    echo "== repo is writable =="
    box "$T/repo" -- /bin/sh -c 'echo hi >new.txt'
    [ "$RC" -eq 0 ] && [ "$(cat "$T/repo/new.txt" 2>/dev/null)" = hi ] && ok "write in the repo lands on disk" || bad "repo write rc=$RC out=$OUT"
    box "$T/repo/" -- /bin/sh -c 'pwd'
    [ "$OUT" = "$T/repo" ] && ok "command runs in the caller's directory" || bad "cwd inside box: $OUT"

    echo "== protected dir (passed with --ro) =="
    P="$T/prot"
    box "$T/repo" --ro "$P" -- cat "$P/keep.txt"
    [ "$RC" -eq 0 ] && [ "$OUT" = keep ] && ok "--ro dir is visible inside" || bad "--ro dir not visible: rc=$RC out=$OUT"
    box "$T/repo" --ro "$P" -- /bin/sh -c "echo x >'$P/new.txt'"
    [ "$RC" -ne 0 ] && [ ! -e "$P/new.txt" ] && ok "write into --ro dir fails" || bad "write into --ro dir: rc=$RC"
    box "$T/repo" --ro "$P" -- /bin/rm -rf "$P/sub"
    [ "$RC" -ne 0 ] && [ -f "$P/sub/deep.txt" ] && ok "/bin/rm -rf (bypassing safe-bin) fails" || bad "/bin/rm: rc=$RC"
    box "$T/repo" --ro "$P" -- find "$P" -delete
    [ -f "$P/keep.txt" ] && [ -f "$P/sub/deep.txt" ] && ok "find -delete removes nothing" || bad "find -delete removed files"
    if command -v python3 >/dev/null 2>&1; then
        box "$T/repo" --ro "$P" -- python3 -c "import shutil,sys; shutil.rmtree(sys.argv[1])" "$P/sub"
        [ "$RC" -ne 0 ] && [ -f "$P/sub/deep.txt" ] && ok "python shutil.rmtree fails" || bad "shutil.rmtree: rc=$RC"
    else
        skip "python3 missing: shutil.rmtree case"
    fi
    box "$T/repo" -- /bin/sh -c "test -e '$P/keep.txt'"
    [ "$RC" -ne 0 ] && ok "host /tmp content is hidden without --ro" || bad "host /tmp visible in box"

    echo "== read-only root (dir outside /tmp, no flags) =="
    if [ -n "$V" ]; then
        box "$T/repo" -- /bin/sh -c "cat '$V/keep.txt' && echo x >'$V/new.txt'"
        [ "$RC" -ne 0 ] && [ "$OUT" = keep ] && [ ! -e "$V/new.txt" ] && ok "outside dir readable, not writable" || bad "ro root: rc=$RC out=$OUT err=$ERR"
        box "$T/repo" -- /bin/rm -f "$V/keep.txt"
        [ -f "$V/keep.txt" ] && ok "/bin/rm of an outside file fails" || bad "outside file deleted"
    else
        skip "/var/tmp not writable: read-only root case"
    fi

    echo "== private /tmp =="
    box "$T/repo" -- /bin/sh -c "echo x >'$MARK' && test -f '$MARK' && echo \"\$TMPDIR\""
    [ "$RC" -eq 0 ] && [ ! -e "$MARK" ] && ok "file written in box /tmp is absent outside" || bad "/tmp not private: rc=$RC marker=$([ -e "$MARK" ] && echo present)"
    case "$OUT" in /tmp|/tmp/) ok "TMPDIR inside is /tmp" ;; *) bad "TMPDIR inside: $OUT" ;; esac

    echo "== exit code and PATH =="
    box "$T/repo" -- /bin/sh -c 'exit 42'
    [ "$RC" -eq 42 ] && ok "exit code passes through (42)" || bad "exit code: $RC"
    box "$T/repo" -- /bin/sh -c 'command -v rm'
    [ "$OUT" = "$REPO/.claude/cfn-scripts/safe-bin/rm" ] && ok "safe-bin/rm first on PATH inside" || bad "rm inside box: $OUT"

    echo "== --rw rules =="
    for bad_dir in "$HOME" / /usr "$T/fakehome" "$T/fakehome/.cache"; do
        OUT=$(cd "$T/repo" && HOME="$T/fakehome" "$BOX" --rw "$bad_dir" -- /bin/sh -c "echo ran >'$T/repo/ran-rw.txt'" 2>&1); RC=$?
        [ "$RC" -eq 64 ] && [ ! -e "$T/repo/ran-rw.txt" ] && ok "--rw $bad_dir refused (64), nothing run" || bad "--rw $bad_dir: rc=$RC out=$OUT"
    done
    box "$T/repo" --rw "$T/extra" -- /bin/sh -c "echo y >'$T/extra/y.txt'"
    [ "$RC" -eq 0 ] && [ -f "$T/extra/y.txt" ] && ok "--rw of a safe dir is writable" || bad "--rw extra: rc=$RC out=$OUT"
    box "$T/repo" --rw "$T/missing" -- true
    [ "$RC" -eq 64 ] && ok "--rw of a missing dir refused" || bad "--rw missing: rc=$RC"
    box "$T/repo" -- 
    [ "$RC" -eq 64 ] && ok "no command: usage error 64" || bad "no command: rc=$RC"

    echo "== linked worktree =="
    echo w >"$T/wt/w.txt"
    box "$T/wt" -- /bin/sh -c 'git -c user.name=b -c user.email=b@example.invalid add w.txt && git -c user.name=b -c user.email=b@example.invalid -c commit.gpgsign=false commit -qm wt'
    [ "$RC" -eq 0 ] && [ "$("${G[@]}" -C "$T/repo" log -1 --format=%s wt-branch)" = wt ] && ok "git commit works in a linked worktree" || bad "worktree commit: rc=$RC err=$ERR"
    # The main checkout here sits under host /tmp, which the box replaces with
    # its own tmpfs: a write may "succeed" into that throwaway copy, but must
    # never reach the host file.
    box "$T/wt" -- /bin/sh -c "echo z >'$T/repo/a.txt'"
    [ "$(cat "$T/repo/a.txt")" = a ] && ok "main checkout files untouched from a worktree" || bad "main checkout changed from wt"

    echo "== outside a git repo =="
    box "$T/norepo" -- /bin/sh -c "echo ran >'$T/norepo/ran.txt'"
    [ "$RC" -eq 64 ] && [ ! -e "$T/norepo/ran.txt" ] && ok "outside a git repo: refused (64)" || bad "norepo: rc=$RC out=$OUT"
fi

echo "== results: $PASS passed, $FAIL failed, $SKIP skipped =="
[ "$FAIL" -eq 0 ]
