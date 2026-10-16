#!/usr/bin/env bash
# readonly-list.sh: one reader for the shared-data read-only list, used by
# zai-fence.sh (sandbox deny) and readonly-data.sh (chmod on disk).
#
# Incident MDTWII 2026-10-16: a test Drop impl wiped 7.5 GB of shared data
# through a worktree symlink four times. The list names what must never be
# written or deleted.
#
# cfn_ro_root
#   Prints the main checkout's toplevel for the cwd (worktrees resolve to the
#   repo that owns them), or the cwd when not in a git repo.
# cfn_ro_entries ROOT
#   Prints one entry per line from ROOT/.zai-fence-readonly plus
#   ZAI_FENCE_READONLY (colon-separated); # comments and blank lines dropped.
#
# Bash 3.2 compatible; defines functions only.

cfn_ro_root() {
    local common
    if common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
        realpath "$(dirname "$common")"
    else
        pwd -P
    fi
}

cfn_ro_entries() {
    local root="$1"
    { [ -f "$root/.zai-fence-readonly" ] && cat "$root/.zai-fence-readonly"
      printf '%s\n' "${ZAI_FENCE_READONLY:-}" | tr ':' '\n'
    } | sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | grep -v '^$'
    return 0
}
