#!/usr/bin/env bash
# cfn-test-box.sh: run a command (a builder's test suite) inside a bubblewrap
# box where the disk is read-only except the work being tested.
#
#   cfn-test-box.sh [--rw DIR]... [--ro PATH]... -- CMD ARGS...
#
# Why (incident 2026-11-23, MDTWII): a test's empty temp variable ran
# rm -rf /home /tmp. safe-bin/rm only catches rm found on PATH; /bin/rm,
# find -delete, python shutil.rmtree and git clean go around it. In the box
# those fail because nothing outside the worktree is writable.
#
# Inside the box:
#   /          the host root, read-only (home, other repos, /mnt/c included)
#   worktree   the git top of the current directory, read-write; for a linked
#              worktree also its shared .git dir (so git commit works), but not
#              the main checkout's files
#   /tmp       a private, empty tmpfs (TMPDIR=/tmp); host /tmp is hidden, so
#              host files there are visible only through --ro
#   --rw DIR   extra writable dir; refused (exit 64) when lib/path-guard.sh
#              refuses it, the same rules as safe-bin/rm: /, top-level dirs,
#              a home, its parents or direct children (~/.cache), Windows user
#              folders, listed protected paths. Repo roots are allowed here.
#   --ro PATH  extra path made visible read-only (e.g. a dir under host /tmp)
#   /dev /proc fresh; own pid namespace (stray background jobs die with the
#              command); network shared with the host
#   PATH       safe-bin/ first, so rm is still the guarded wrapper
#
# Exit: the command's own code; 64 usage or refused path; 69 bwrap missing
# (never runs the command unboxed); 70 internal error.
#
# Why not zai-fence.sh: that fence builds an empty root with a private home,
# a filtered network broker and secret masks for GLM workers. Tests need the
# real toolchain, the real home (read-only) and the network, so a mode there
# would mean switching off most of it. This script shares the danger rules
# (lib/path-guard.sh) and safe-bin instead.
# cfn: no seccomp or --new-session, it guards against accidents not hostile code; use zai-fence.sh for untrusted workers
set -u

die() { local rc="$1"; shift; printf 'cfn-test-box: %s\n' "$*" >&2; exit "$rc"; }

# bwrap first, with builtins only: a missing bwrap must refuse, never fall back.
BWRAP=$(command -v bwrap 2>/dev/null) \
    || die 69 "bubblewrap (bwrap) is not installed, refusing to run the command unboxed. Install it: sudo apt install bubblewrap"

usage() {
    echo "usage: cfn-test-box.sh [--rw DIR]... [--ro PATH]... -- CMD ARGS..." >&2
    exit 64
}

RW_IN=() RO_IN=()
while [ "$#" -gt 0 ]; do
    case "$1" in
        --rw) [ "$#" -ge 2 ] || usage; RW_IN+=("$2"); shift 2 ;;
        --ro) [ "$#" -ge 2 ] || usage; RO_IN+=("$2"); shift 2 ;;
        --rw=*) RW_IN+=("${1#--rw=}"); shift ;;
        --ro=*) RO_IN+=("${1#--ro=}"); shift ;;
        -h|--help) usage ;;
        --) shift; break ;;
        *) echo "cfn-test-box: unknown argument '$1' (the command goes after --)" >&2; usage ;;
    esac
done
[ "$#" -gt 0 ] || usage

SELF_DIR=$(cd -P "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P) || die 70 "cannot find my own directory"
# shellcheck source=/dev/null
source "$SELF_DIR/lib/path-guard.sh" 2>/dev/null || die 70 "cannot load $SELF_DIR/lib/path-guard.sh"

CWD=$(pwd -P) || die 70 "cannot resolve the current directory"
TOP=$(git rev-parse --show-toplevel 2>/dev/null) && TOP=$(realpath -e -- "$TOP" 2>/dev/null) \
    || die 64 "$CWD is not inside a git worktree; run the box from the repo or worktree under test"
cfn_path_guard_check "$TOP" allow-repo-root || die 64 "refusing to make the worktree $TOP writable: $CFN_PG_WHY"

A=(--ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --bind "$TOP" "$TOP")
RW_SHOWN=("$TOP")

# A linked worktree's commits, index and refs live in the main repo's .git.
COMMON=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && COMMON=$(realpath -e -- "$COMMON" 2>/dev/null) \
    || die 70 "cannot resolve the git common dir of $TOP"
case "$COMMON/" in
    "$TOP"/*) ;;
    *)  # judged by the repo it belongs to (its own path is "a project's .git")
        cfn_path_guard_check "$(dirname "$COMMON")" allow-repo-root \
            || die 64 "refusing to make the shared git dir $COMMON writable: $CFN_PG_WHY"
        A+=(--bind "$COMMON" "$COMMON"); RW_SHOWN+=("$COMMON") ;;
esac

for d in "${RW_IN[@]+"${RW_IN[@]}"}"; do
    r=$(realpath -e -- "$d" 2>/dev/null) || die 64 "--rw $d: no such directory"
    [ -d "$r" ] || die 64 "--rw $d: not a directory"
    cfn_path_guard_check "$r" allow-repo-root || die 64 "--rw $d refused: $CFN_PG_WHY"
    A+=(--bind "$r" "$r"); RW_SHOWN+=("$r")
done
# --ro after the writable binds, so an explicit --ro inside one of them wins.
for p in "${RO_IN[@]+"${RO_IN[@]}"}"; do
    r=$(realpath -e -- "$p" 2>/dev/null) || die 64 "--ro $p: no such path"
    A+=(--ro-bind "$r" "$r")
done

SAFE_BIN="$SELF_DIR/safe-bin"
NEW_PATH="${PATH:-/usr/bin:/bin}"
[ -x "$SAFE_BIN/rm" ] && NEW_PATH="$SAFE_BIN:$NEW_PATH"

A+=(--unshare-pid --die-with-parent --chdir "$CWD"
    --setenv PATH "$NEW_PATH" --setenv TMPDIR /tmp --setenv CLAUDE_CODE_TMPDIR /tmp
    --setenv CFN_TEST_BOX 1)

[ "${CFN_TEST_BOX_QUIET:-0}" = 1 ] || printf 'cfn-test-box: writable: %s + private /tmp; everything else read-only\n' "${RW_SHOWN[*]}" >&2
# shellcheck disable=SC2093  # the die below only runs when exec itself fails
exec "$BWRAP" "${A[@]}" -- "$@"
die 70 "exec of bwrap failed"
