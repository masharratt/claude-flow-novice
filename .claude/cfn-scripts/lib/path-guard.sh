#!/usr/bin/env bash
# lib/path-guard.sh: the ONE list of paths too dangerous to delete or to open
# for writing. Shared by safe-bin/rm (refuse deletes) and cfn-test-box.sh
# (refuse --rw binds), so the two cannot drift.
#
# Sourced; defines functions only. Bash 4 + GNU realpath/getent.
#
# cfn_path_guard_init
#   Loads the homes and the protected list once. "Home" is BOTH the account's
#   real home (getent passwd, so unsetting or changing HOME does not switch the
#   guard off) and $HOME when set. The protected list is
#   <home>/.config/cfn-rm-protect.conf plus the committed default
#   .claude/cfn-config/rm-protect.default (one absolute or ~/ path per line,
#   # comments).
# cfn_path_guard_check ABS [allow-repo-root]
#   ABS is an absolute, already-normalized path. Returns 1 and sets
#   CFN_PG_WHY to the reason when ABS is:
#     - /, any top-level dir (/home, /tmp, /usr, /mnt...), or /mnt/<x>
#     - a Windows home folder: /mnt/<x>/Users or /mnt/<x>/Users/<name>
#     - a git repo root (a dir holding a .git DIRECTORY), unless the second
#       argument is allow-repo-root; a linked worktree (.git FILE) passes
#     - a home, an ancestor of one, or a direct child of one (~/.cache ...)
#     - the .git of a repo directly under ~/projects
#     - a listed protected path or an ancestor of one
#   Returns 0 with CFN_PG_WHY empty otherwise.

_CFN_PG_LIB_DIR=$(cd -P "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P) || _CFN_PG_LIB_DIR=""

cfn_path_guard_init() {
    local h hr f home_raw line
    CFN_PG_REAL_HOME=$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)
    CFN_PG_HOMES_RAW=()
    [ -n "$CFN_PG_REAL_HOME" ] && CFN_PG_HOMES_RAW+=("$CFN_PG_REAL_HOME")
    [ -n "${HOME:-}" ] && [ "${HOME:-}" != "$CFN_PG_REAL_HOME" ] && CFN_PG_HOMES_RAW+=("$HOME")
    CFN_PG_HOMES=()
    for h in "${CFN_PG_HOMES_RAW[@]+"${CFN_PG_HOMES_RAW[@]}"}"; do
        hr=$(realpath -m -- "$h" 2>/dev/null) || continue
        [ "$hr" = / ] || CFN_PG_HOMES+=("$hr")
    done

    CFN_PG_PLIST=()
    local -a lists=()
    for h in "${CFN_PG_HOMES_RAW[@]+"${CFN_PG_HOMES_RAW[@]}"}"; do lists+=("$h/.config/cfn-rm-protect.conf"); done
    [ -n "$_CFN_PG_LIB_DIR" ] && lists+=("$_CFN_PG_LIB_DIR/../../cfn-config/rm-protect.default")
    for f in "${lists[@]+"${lists[@]}"}"; do
        [ -f "$f" ] || continue
        # ~ in a list means the home that list lives in (the default: real home).
        case "$f" in */.config/cfn-rm-protect.conf) home_raw="${f%/.config/cfn-rm-protect.conf}" ;; *) home_raw="$CFN_PG_REAL_HOME" ;; esac
        while IFS= read -r line || [ -n "$line" ]; do
            line="${line%%#*}"; line="${line#"${line%%[![:space:]]*}"}"; line="${line%"${line##*[![:space:]]}"}"
            [ -n "$line" ] || continue
            # shellcheck disable=SC2088  # matching a literal ~ in the list file, expanded by hand
            case "$line" in "~") line="$home_raw" ;; "~/"*) line="$home_raw/${line#\~/}" ;; esac
            case "$line" in /*) CFN_PG_PLIST+=("$line") ;; esac
        done <"$f"
    done
    if [ "${#CFN_PG_PLIST[@]}" -gt 0 ]; then
        mapfile -d '' -t CFN_PG_PLIST < <(realpath -m -z -- "${CFN_PG_PLIST[@]}" 2>/dev/null)
    fi
    CFN_PG_READY=1
}

cfn_path_guard_check() {
    local a="$1" mode="${2:-}" hr pp
    CFN_PG_WHY=""
    [ "${CFN_PG_READY:-0}" = 1 ] || cfn_path_guard_init
    if [ -z "$a" ]; then CFN_PG_WHY="empty path (an unset variable?)"
    elif [ "$a" = / ]; then CFN_PG_WHY="the filesystem root"
    elif [[ "$a" =~ ^/[^/]+$ ]]; then CFN_PG_WHY="a top-level system directory"
    elif [[ "$a" =~ ^/mnt/[^/]+$ ]]; then CFN_PG_WHY="a mounted drive"
    elif [[ "$a" =~ ^/mnt/[^/]+/Users(/[^/]+)?$ ]]; then CFN_PG_WHY="a Windows home folder"
    elif [ "$mode" != allow-repo-root ] && [ -d "$a/.git" ] && [ ! -L "$a/.git" ]; then
        CFN_PG_WHY="a git repository root (a linked worktree, with a .git file, is fine)"
    fi
    if [ -z "$CFN_PG_WHY" ]; then
        for hr in "${CFN_PG_HOMES[@]+"${CFN_PG_HOMES[@]}"}"; do
            if [ "$a" = "$hr" ]; then CFN_PG_WHY="a home directory"
            elif [[ "$hr" == "$a"/* ]]; then CFN_PG_WHY="a parent of a home directory"
            elif [ "${a%/*}" = "$hr" ]; then CFN_PG_WHY="a top-level item in a home directory"
            elif [[ "$a" == "$hr"/projects/*/.git ]] && [ "${a%/*/.git}" = "$hr/projects" ]; then CFN_PG_WHY="a project repository's .git"
            fi
            [ -z "$CFN_PG_WHY" ] || break
        done
    fi
    if [ -z "$CFN_PG_WHY" ]; then
        for pp in "${CFN_PG_PLIST[@]+"${CFN_PG_PLIST[@]}"}"; do
            if [ "$a" = "$pp" ]; then CFN_PG_WHY="listed as protected"; break; fi
            if [[ "$pp" == "$a"/* ]]; then CFN_PG_WHY="holds the protected path $pp"; break; fi
        done
    fi
    [ -z "$CFN_PG_WHY" ]
}
