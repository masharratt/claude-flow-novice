#!/usr/bin/env bash
# project-name.sh: the one definition of "which project is this directory in" for the mailbox and
# cfn-fleet. Source it; it defines a function and runs nothing.
#
# mailbox_project_name DIR: folder name of the MAIN checkout, even when DIR is inside a linked
# worktree (a worktree's own folder, such as .claude/worktrees/ws01, is not the project).
#   1. git common dir ends in ".git": its parent folder's name (the main checkout)
#   2. else the git toplevel's folder name (bare or odd layouts)
#   3. else DIR's own folder name (not a git repo)
mailbox_project_name() {
  local dir="${1:-$PWD}" common top
  common="$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [ -n "$common" ] && [ "$(basename "$common")" = ".git" ]; then
    basename "$(dirname "$common")"
    return 0
  fi
  top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || true)"
  basename "${top:-$dir}"
}
