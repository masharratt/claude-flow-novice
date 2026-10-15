#!/usr/bin/env bash
# safe-rm.sh: the one way scripts and tests delete a temp dir.
#
# Incident 2026-10-15: a test did `TEST_TMP=$(cd "$(mktemp -d -t X)" && pwd -P)`.
# mktemp failed in a sandbox, `cd ""` succeeded and stayed in the cwd, so
# TEST_TMP became the repo root and the EXIT trap `rm -rf "$TEST_TMP"` wiped
# the repo, .git included. The PreToolUse rm guard never saw it: it inspects
# the command Claude types, not the rm calls inside the scripts it runs.
#
# cfn_safe_rm_tmp PATH...
#   Deletes each PATH (rm -rf) only if every one of them passes the checks
#   below. If any PATH is refused, NOTHING is deleted, a reason goes to stderr
#   and the function returns 1. A PATH that does not exist is a no-op.
#
#   Refused when the path (after resolving symlinks with `cd -P`) is:
#     - empty
#     - /
#     - $HOME, or an ancestor of $HOME
#     - the cwd, or an ancestor of the cwd
#     - a git toplevel (contains .git), or the cwd's git toplevel or an
#       ancestor of it
#     - not strictly under an allowed temp root: $TMPDIR, /tmp, /private/tmp,
#       /var/folders, /private/var/folders. A root itself (and $TMPDIR itself,
#       even when it sits under /tmp) is never deletable.
#       $TMPDIR only counts as a root when it is not /, $HOME or an ancestor of
#       either, so a poisoned TMPDIR cannot widen the allowlist to the disk.
#   What gets deleted is the resolved physical path, i.e. exactly what was
#   checked.
#
# Bash 3.2 compatible (macOS /bin/bash): no associative arrays, no ${x,,}.
# Safe to source under `set -euo pipefail`; defines functions only.

# Print the physical absolute path of $1, or nothing (return 1) if it cannot be
# resolved. Directories resolve fully; for anything else the parent resolves
# and the last component is kept as-is (rm on a symlink removes the link).
_cfn_saferm_resolve() {
    local p="$1" dir base phys
    if [ -d "$p" ]; then
        (cd -P -- "$p" 2>/dev/null && pwd -P) || return 1
        return 0
    fi
    case "$p" in
        */*) dir="${p%/*}"; base="${p##*/}"; [ -n "$dir" ] || dir=/ ;;
        *)   dir=.; base="$p" ;;
    esac
    case "$base" in ''|.|..) return 1 ;; esac
    phys=$(cd -P -- "$dir" 2>/dev/null && pwd -P) || return 1
    [ "$phys" = / ] && printf '/%s\n' "$base" || printf '%s/%s\n' "$phys" "$base"
}

# True when $1 equals $2 or is an ancestor of $2 (both physical, absolute).
_cfn_saferm_covers() {
    local a="$1" b="$2"
    [ -n "$a" ] && [ -n "$b" ] || return 1
    [ "$a" = / ] && return 0
    [ "$b" = "$a" ] && return 0
    case "$b" in "$a"/*) return 0 ;; esac
    return 1
}

# Echo the reason PATH ($1, physical) is refused; empty output = allowed.
_cfn_saferm_reason() {
    local phys="$1" home cwd top root roots tmpdir_phys
    [ "$phys" = / ] && { echo "is /"; return; }

    home=$( (cd -P -- "${HOME:-/nonexistent-home}" 2>/dev/null && pwd -P) || true)
    if [ -n "$home" ] && _cfn_saferm_covers "$phys" "$home"; then
        echo "is \$HOME or an ancestor of it ($home)"; return
    fi

    cwd=$(pwd -P 2>/dev/null || true)
    if [ -n "$cwd" ] && _cfn_saferm_covers "$phys" "$cwd"; then
        echo "is the cwd or an ancestor of it ($cwd)"; return
    fi

    if [ -d "$phys" ] && [ -e "$phys/.git" ]; then
        echo "is a git toplevel (contains .git)"; return
    fi
    top=$(git rev-parse --show-toplevel 2>/dev/null || true)
    if [ -n "$top" ]; then
        top=$( (cd -P -- "$top" 2>/dev/null && pwd -P) || true)
        if [ -n "$top" ] && _cfn_saferm_covers "$phys" "$top"; then
            echo "is the cwd's git toplevel or an ancestor of it ($top)"; return
        fi
    fi

    roots="/tmp
/private/tmp
/var/folders
/private/var/folders"
    if [ -n "${TMPDIR:-}" ]; then
        tmpdir_phys=$( (cd -P -- "$TMPDIR" 2>/dev/null && pwd -P) || true)
        if [ -n "$tmpdir_phys" ] && [ "$phys" = "$tmpdir_phys" ]; then
            echo "is \$TMPDIR itself ($tmpdir_phys)"; return
        fi
        if [ -n "$tmpdir_phys" ] && [ "$tmpdir_phys" != / ] \
            && ! { [ -n "$home" ] && _cfn_saferm_covers "$tmpdir_phys" "$home"; } \
            && ! { [ -n "$cwd" ] && _cfn_saferm_covers "$tmpdir_phys" "$cwd"; }; then
            roots="$roots
$tmpdir_phys"
        fi
    fi
    while IFS= read -r root; do
        [ -n "$root" ] || continue
        case "$phys" in "$root"/?*) return 0 ;; esac
    done <<EOF
$roots
EOF
    echo "is not strictly under an allowed temp root (\$TMPDIR, /tmp, /private/tmp, /var/folders, /private/var/folders)"
}

cfn_safe_rm_tmp() {
    if [ "$#" -eq 0 ]; then
        echo "cfn_safe_rm_tmp: REFUSED: no path given" >&2
        return 1
    fi
    local p phys reason targets="" refused=0
    for p in "$@"; do
        if [ -z "$p" ]; then
            echo "cfn_safe_rm_tmp: REFUSED '' : empty path" >&2
            refused=1; continue
        fi
        if [ ! -e "$p" ] && [ ! -L "$p" ]; then
            continue  # nothing there: deleting it is a no-op
        fi
        phys=$(_cfn_saferm_resolve "$p") || phys=""
        if [ -z "$phys" ]; then
            echo "cfn_safe_rm_tmp: REFUSED '$p': path does not resolve" >&2
            refused=1; continue
        fi
        reason=$(_cfn_saferm_reason "$phys")
        if [ -n "$reason" ]; then
            echo "cfn_safe_rm_tmp: REFUSED '$p' (resolves to '$phys'): $reason" >&2
            refused=1; continue
        fi
        targets="$targets$phys
"
    done
    [ "$refused" -eq 0 ] || return 1
    while IFS= read -r phys; do
        [ -n "$phys" ] || continue
        rm -rf -- "$phys" || return 1
    done <<EOF
$targets
EOF
    return 0
}
