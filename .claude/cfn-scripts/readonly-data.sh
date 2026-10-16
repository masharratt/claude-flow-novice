#!/usr/bin/env bash
# readonly-data.sh: make shared data read-only on disk, so a recursive delete
# fails for every process and every agent (claude, glm, codex, a test binary).
# zai-fence.sh blocks the same list for glm workers only; this covers the rest.
#
# Usage: readonly-data.sh lock|unlock|status
#   Reads <repo>/.zai-fence-readonly (one path per line, relative to the main
#   checkout's root, # comments) plus ZAI_FENCE_READONLY (colon-separated).
#   Works from a worktree: paths resolve against the repo that owns it.
#   lock    chmod -R a-w each listed path (run after a rebuild)
#   unlock  chmod -R u+w each listed path (run before a rebuild)
#   status  prints locked | unlocked | missing for each entry
#
# Exit: 0 ok; 1 an entry is unsafe (nothing is changed); 2 no entries, so
# nothing is protected; 64 usage.
#
# Incident MDTWII 2026-10-16: a test Drop impl wiped 7.5 GB through a worktree
# symlink four times; chmod a-w was the guard that held.
set -uo pipefail

# shellcheck disable=SC1091
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")")/lib/readonly-list.sh"

die(){ echo "readonly-data: $*" >&2; exit "${2:-1}"; }
case "${1:-}" in lock|unlock|status) MODE=$1 ;; *) echo "usage: readonly-data.sh lock|unlock|status" >&2; exit 64 ;; esac

ROOT=$(cfn_ro_root) || die "cannot resolve repo root"
HOME_R=$(realpath "$HOME")
ENTRIES=$(cfn_ro_entries "$ROOT")
[ -n "$ENTRIES" ] || die "no entries in $ROOT/.zai-fence-readonly or ZAI_FENCE_READONLY; nothing is protected" 2

# Validate every entry before touching anything.
PATHS=(); MISSING=()
while IFS= read -r e; do
    case "/$e/" in */../*) die "refusing entry '$e': contains .." ;; esac
    case "$e" in /*) p="$e" ;; *) p="$ROOT/$e" ;; esac
    if [ ! -e "$p" ]; then MISSING+=("$e"); continue; fi
    p=$(realpath "$p") || die "cannot resolve '$e'"
    case "$p" in
        /|"$HOME_R"|"$ROOT") die "refusing entry '$e': resolves to $p" ;;
        "$ROOT"/*) ;;
        *) die "refusing entry '$e': $p is outside $ROOT" ;;
    esac
    PATHS+=("$p")
done <<<"$ENTRIES"

for e in ${MISSING[@]+"${MISSING[@]}"}; do echo "missing   $e"; done
for p in ${PATHS[@]+"${PATHS[@]}"}; do
    case "$MODE" in
        lock)   chmod -R a-w "$p" || die "chmod failed on $p" ;;
        unlock) chmod -R u+w "$p" || die "chmod failed on $p" ;;
    esac
    if [ -n "$(find "$p" -perm -u+w -print -quit 2>/dev/null)" ]; then
        echo "unlocked  ${p#"$ROOT"/}"
    else
        echo "locked    ${p#"$ROOT"/}"
    fi
done
exit 0
