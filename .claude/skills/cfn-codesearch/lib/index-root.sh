#!/usr/bin/env bash
# Shared by search.sh and hooks/cfn-codesearch-gate.sh: which indexed
# project_root answers searches for a given checkout.
#
# cs_index_root <root> <db>  prints the indexed root, or nothing.
#   1. <root> itself when the index has rows for it.
#   2. Otherwise an indexed root whose git origin URL matches <root>'s. Fleet
#      workers run in clones/worktrees (~/fleet-repos/MDTWII-wt/wsNNN) while
#      the index is keyed by the main checkout (~/Projects/MDTWII); before this
#      fallback, search.sh answered "No results" there (found 2026-11-10).
# Results then come from the main checkout's last index pass, so files the
# worker changed but has not merged are not reflected.
# cfn: origin-URL match only, add a git-common-dir match if a repo with no origin needs it

cs_index_root() {
  local root="$1" db="$2" q origin r
  [ -n "$root" ] && [ -f "$db" ] && command -v sqlite3 >/dev/null 2>&1 || return 0
  q=$(printf '%s' "$root" | sed "s/'/''/g")
  if [ -n "$(sqlite3 "$db" "SELECT 1 FROM entities WHERE project_root = '$q' LIMIT 1" 2>/dev/null)" ]; then
    printf '%s\n' "$root"; return 0
  fi
  origin=$(git -C "$root" remote get-url origin 2>/dev/null) || return 0
  [ -n "$origin" ] || return 0
  while IFS= read -r r; do
    [ -n "$r" ] && [ -d "$r" ] || continue
    if [ "$(git -C "$r" remote get-url origin 2>/dev/null)" = "$origin" ]; then
      printf '%s\n' "$r"; return 0
    fi
  done < <(sqlite3 "$db" "SELECT DISTINCT project_root FROM entities" 2>/dev/null)
  return 0
}
