#!/usr/bin/env bash
# SessionStart hook: warn when shared data is not protected from deletes.
#
# Finds symlinks in each worktree (maxdepth 2) and in the main checkout
# (maxdepth 3, node_modules/.git/target/.venv/dist/build/.next pruned) whose
# real target is a directory outside the link's own checkout. Skipped as
# restorable code: a git toplevel, or a path inside a git work tree that is not
# git-ignored (tracked source). Flags:
#   (a) a target not covered by the read-only list (<root>/.zai-fence-readonly
#       + ZAI_FENCE_READONLY). Covered = target equals/is under a listed entry,
#       or a listed entry is under the target (the owner reviewed it).
#   (b) a listed entry that readonly-data.sh status would call unlocked
# Silent when clean. Otherwise prints SessionStart additionalContext JSON,
# at most 5 paths per section plus "and N more".
# Read-only, never fails the session (always exit 0). jq missing: silent.
# Speed: one find per checkout, one batched realpath, one verdict per target.
#
# Incident MDTWII 2026-10-16: a test cleanup wiped 7.5 GB through
# worktree/extracted -> main/extracted.
set -uo pipefail
trap 'exit 0' ERR

command -v jq >/dev/null 2>&1 || exit 0
cat >/dev/null 2>&1 || true   # drain the hook payload

# shellcheck disable=SC1091
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")")/../cfn-scripts/lib/readonly-list.sh" 2>/dev/null || exit 0

git rev-parse --git-common-dir >/dev/null 2>&1 || exit 0
ROOT=$(cfn_ro_root 2>/dev/null) || exit 0
HOME_R=$(realpath "$HOME" 2>/dev/null || echo "$HOME")
[ -n "$ROOT" ] && [ "$ROOT" != "$HOME_R" ] && [ -d "$ROOT" ] || exit 0

# Read-only entries -> resolved real paths (missing ones skipped).
ENTRY_PATHS=()
while IFS= read -r e; do
    [ -n "$e" ] || continue
    case "$e" in /*) p="$e" ;; *) p="$ROOT/$e" ;; esac
    [ -e "$p" ] || continue
    p=$(realpath "$p" 2>/dev/null) || continue
    ENTRY_PATHS+=("$p")
done <<<"$(cfn_ro_entries "$ROOT")"

covered(){ # covered <target>: target equals/is under a listed entry, or a listed entry is under it
    local t="$1" e
    for e in ${ENTRY_PATHS[@]+"${ENTRY_PATHS[@]}"}; do
        case "$t" in "$e"|"$e"/*) return 0 ;; esac
        case "$e" in "$t"/*) return 0 ;; esac
    done
    return 1
}

# Checkouts to scan, as "<dir>|<maxdepth>"; deduped, vanished paths skipped.
SCANS=("$ROOT|3"); SEEN_DIRS=$'\n'"$ROOT"$'\n'
add_scan(){ # add_scan <dir>
    local d="${1%/}"
    [ -d "$d" ] || return 0
    case "$SEEN_DIRS" in *$'\n'"$d"$'\n'*) return 0 ;; esac
    SEEN_DIRS="$SEEN_DIRS$d"$'\n'; SCANS+=("$d|2")
}
for d in "$ROOT"/.claude/worktrees/*/; do add_scan "$d"; done
while IFS= read -r line; do
    case "$line" in worktree\ *) add_scan "${line#worktree }" ;; esac
done <<<"$(git worktree list --porcelain 2>/dev/null)"

# One find per checkout; keep only links that resolve to a directory.
LINKS=(); LDIRS=(); SEEN_LINKS=$'\n'
for s in "${SCANS[@]}"; do
    dir=${s%|*}; depth=${s##*|}
    while IFS= read -r link; do
        [ -n "$link" ] && [ -d "$link" ] || continue
        case "$SEEN_LINKS" in *$'\n'"$link"$'\n'*) continue ;; esac
        SEEN_LINKS="$SEEN_LINKS$link"$'\n'
        LINKS+=("$link"); LDIRS+=("$dir")
    done <<<"$(find "$dir" -maxdepth "$depth" \( -name node_modules -o -name .git -o -name target \
        -o -name .venv -o -name dist -o -name build -o -name .next \) -prune -o -type l -print 2>/dev/null)"
done

UNPROTECTED=(); SEEN_T=$'\n'
if [ "${#LINKS[@]}" -gt 0 ]; then
    TARGETS=()
    while IFS= read -r t; do TARGETS+=("$t"); done <<<"$(realpath "${LINKS[@]}" 2>/dev/null)"
    [ "${#TARGETS[@]}" -eq "${#LINKS[@]}" ] || exit 0
    i=0
    while [ "$i" -lt "${#LINKS[@]}" ]; do
        link=${LINKS[$i]}; dir=${LDIRS[$i]}; target=${TARGETS[$i]}; i=$((i+1))
        case "$target" in "$dir"|"$dir"/*) continue ;; esac            # inside own checkout
        case "$SEEN_T" in *$'\n'"$target"$'\n'*) continue ;; esac       # one verdict per target
        SEEN_T="$SEEN_T$target"$'\n'
        covered "$target" && continue
        if top=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null); then
            [ "$top" = "$target" ] && continue                          # a code repo itself
            git -C "$target" check-ignore -q "$target" 2>/dev/null || continue  # tracked source
        fi
        UNPROTECTED+=("$link -> $target")
    done
fi

UNLOCKED=()
for p in ${ENTRY_PATHS[@]+"${ENTRY_PATHS[@]}"}; do
    case "$p" in /|"$HOME_R"|"$ROOT") continue ;; esac
    if [ -n "$(find "$p" -perm -u+w -print -quit 2>/dev/null)" ]; then
        UNLOCKED+=("$p")
    fi
done

[ "${#UNPROTECTED[@]}" -gt 0 ] || [ "${#UNLOCKED[@]}" -gt 0 ] || exit 0

cap_list(){ # first 5 as bullets, then "and N more"
    local n=0 u
    for u in "$@"; do
        n=$((n+1))
        [ "$n" -le 5 ] && printf '\n- %s' "$u"
    done
    [ "$n" -le 5 ] || printf '\n- and %d more' $((n-5))
    return 0
}

MSG="Shared data is exposed to recursive deletes (a test cleanup wiped 7.5 GB this way on MDTWII 2026-10-16)."
if [ "${#UNPROTECTED[@]}" -gt 0 ]; then
    MSG="$MSG
Symlinks to shared data not on the read-only list:$(cap_list "${UNPROTECTED[@]}")"
fi
if [ "${#UNLOCKED[@]}" -gt 0 ]; then
    MSG="$MSG
Listed but still writable:$(cap_list "${UNLOCKED[@]}")"
fi
MSG="$MSG
Fix: add the target path to $ROOT/.zai-fence-readonly, then run ~/.claude/cfn-scripts/readonly-data.sh lock (outside the sandbox)."

jq -n --arg ctx "$MSG" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}' 2>/dev/null
exit 0
