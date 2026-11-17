#!/usr/bin/env bash
# cfn-trash.sh -- rm-compatible "move to trash" for the cfn-careful guard.
#
# The careful guard (hooks/cfn-careful-guard.sh + skills/cfn-careful/lib/
# rm-target-check.py) rewrites an rm of unsaved work (untracked or modified
# files in a project, user data outside any project) to:
#     bash "$HOME/.claude/cfn-scripts/cfn-trash.sh" <same flags> <same args>
# so nothing is lost and nobody is asked.
#
# Behaviour, rm-compatible where it matters:
#   -f / --force      a missing target is fine (exit 0); otherwise it is an error
#   -r / -R / --recursive   needed to trash a folder (else "Is a directory")
#   -d / --dir        lets an empty folder go without -r
#   --                ends options; other rm flags (-i, -v, -I, ...) are accepted and ignored
#   exit 1 when any target could not be trashed, as rm does
#   A trailing / is dropped: the link itself is trashed, never what it points at.
#
# Layout: <root>/<YYYY-MM-DD>/<HHMMSS>-<pid>/<n>/<name>, and one JSON line per
# target in <root>/<YYYY-MM-DD>/manifest.jsonl (ts, orig, trashed, cwd, session).
# Every run reaps dated folders older than 7 days from every root it has used
# (no cron). Restore by hand: mv the <name> back to "orig".
#
# Trash root (no huge cross-filesystem copies): CFN_TRASH_ROOT when set (tests);
# else ${XDG_DATA_HOME:-~/.local/share}/cfn-trash when the target is on the
# same filesystem as that folder (mv is then a rename); else <mount>/.cfn-trash-<uid>
# at the top of the target's own filesystem (e.g. /mnt/c/.cfn-trash-1000), so
# a big folder on another drive is renamed in place, not copied. If that is
# not writable it falls back to the home trash (a copy). Roots used are listed
# in <home trash>/roots so the reaper finds them all.
# A target already inside a trash root is deleted for real (emptying the trash).
#
# Tests: tests/test-careful-guard-rm.sh (cfn-trash section).
set -uo pipefail

KEEP_DAYS_MINUS_ONE=6   # find -mtime +6: at least 7 whole days old
HOME_TRASH="${XDG_DATA_HOME:-$HOME/.local/share}/cfn-trash"

force=0 recursive=0 dir_ok=0 opts_done=0
targets=()
for a in "$@"; do
    if [ "$opts_done" = 0 ] && [ "$a" = "--" ]; then opts_done=1; continue; fi
    if [ "$opts_done" = 0 ] && [ "${a#-}" != "$a" ] && [ "$a" != "-" ]; then
        case "$a" in
            --force) force=1 ;;
            --recursive) recursive=1 ;;
            --dir) dir_ok=1 ;;
            --*) ;;
            *)  flags=${a#-}
                case "$flags" in *f*) force=1 ;; esac
                case "$flags" in *[rR]*) recursive=1 ;; esac
                case "$flags" in *d*) dir_ok=1 ;; esac ;;
        esac
        continue
    fi
    targets+=("$a")
done

if [ "${#targets[@]}" = 0 ]; then
    [ "$force" = 1 ] && exit 0
    echo "cfn-trash: missing operand" >&2
    exit 1
fi

json_str() { # JSON string body: escape \ " and the control characters we may meet
    local s=$1
    s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}; s=${s//$'\r'/\\r}
    printf '%s' "$s"
}

mount_of() { df -P -- "$1" 2>/dev/null | awk 'NR==2 {for (i=6; i<=NF; i++) printf "%s%s", $i, (i<NF ? " " : "")}'; }

register_root() {
    mkdir -p "$HOME_TRASH" 2>/dev/null || return 0
    grep -qxF -- "$1" "$HOME_TRASH/roots" 2>/dev/null || printf '%s\n' "$1" >> "$HOME_TRASH/roots"
}

pick_root() { # target(abs) -> trash root on stdout
    if [ -n "${CFN_TRASH_ROOT:-}" ]; then printf '%s' "$CFN_TRASH_ROOT"; return; fi
    mkdir -p "$HOME_TRASH" 2>/dev/null
    local tm hm alt
    tm=$(mount_of "$(dirname -- "$1")"); hm=$(mount_of "$HOME_TRASH")
    if [ -z "$tm" ] || [ "$tm" = "$hm" ]; then printf '%s' "$HOME_TRASH"; return; fi
    alt="${tm%/}/.cfn-trash-$(id -u)"
    if mkdir -p "$alt" 2>/dev/null && [ -w "$alt" ]; then printf '%s' "$alt"; else printf '%s' "$HOME_TRASH"; fi
}

reap() { # remove dated folders older than 7 days under one root
    [ -d "$1" ] || return 0
    find "$1" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' \
        -mtime +"$KEEP_DAYS_MINUS_ONE" -exec rm -rf -- {} + 2>/dev/null || true
}

known_roots() {
    [ -z "${CFN_TRASH_ROOT:-}" ] || printf '%s\n' "$CFN_TRASH_ROOT"
    printf '%s\n' "$HOME_TRASH"
    [ ! -f "$HOME_TRASH/roots" ] || cat "$HOME_TRASH/roots"
}

in_any_root() { # abs path -> 0 when inside a known trash root
    local r
    while IFS= read -r r; do
        [ -n "$r" ] || continue
        case "$1" in "$r"/*) return 0 ;; esac
    done < <(known_roots)
    return 1
}

day=$(date +%F); stamp="$(date +%H%M%S)-$$"; ts=$(date +%Y-%m-%dT%H:%M:%S%z)
cwd=$(pwd -P); session=${CFN_TRASH_SESSION:-}
rc=0 n=0
for t in "${targets[@]}"; do
    # Drop trailing slashes, keeping "/" itself (the guard never lets it through).
    while [ "${#t}" -gt 1 ] && [ "${t%/}" != "$t" ]; do t=${t%/}; done
    if [ ! -e "$t" ] && [ ! -L "$t" ]; then
        if [ "$force" = 0 ]; then echo "cfn-trash: cannot remove '$t': No such file or directory" >&2; rc=1; fi
        continue
    fi
    if [ -d "$t" ] && [ ! -L "$t" ] && [ "$recursive" = 0 ]; then
        if [ "$dir_ok" = 0 ] || [ -n "$(ls -A -- "$t" 2>/dev/null)" ]; then
            echo "cfn-trash: cannot remove '$t': Is a directory" >&2; rc=1; continue
        fi
    fi
    case "$t" in /*) abs=$t ;; *) abs="$cwd/$t" ;; esac
    abs="$(cd -- "$(dirname -- "$abs")" 2>/dev/null && pwd -P)/$(basename -- "$abs")"
    if in_any_root "$abs"; then
        if [ "$recursive" = 1 ]; then rm -rf -- "$abs" || rc=1; else rm -f -- "$abs" || rc=1; fi
        continue
    fi
    root=$(pick_root "$abs")
    n=$((n + 1))
    dest="$root/$day/$stamp/$n"
    if ! mkdir -p "$dest"; then echo "cfn-trash: cannot create $dest" >&2; rc=1; continue; fi
    register_root "$root"
    if mv -- "$abs" "$dest/"; then
        printf '{"ts": "%s", "orig": "%s", "trashed": "%s", "cwd": "%s", "session": "%s"}\n' \
            "$ts" "$(json_str "$abs")" "$(json_str "$dest/$(basename -- "$abs")")" \
            "$(json_str "$cwd")" "$(json_str "$session")" >> "$root/$day/manifest.jsonl"
        echo "cfn-trash: moved $abs to $dest/ (kept 7 days)" >&2
    else
        rc=1
    fi
done

# Reap every root this machine has used, plus the one in use now.
while IFS= read -r r; do [ -n "$r" ] && reap "$r"; done < <(known_roots | sort -u)
exit "$rc"
