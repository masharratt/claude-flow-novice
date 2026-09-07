#!/usr/bin/env bash
# cfn-fleet lib/common.sh — shared helpers for every fleet cmd file.
#
# Sourced by cli/fleet after --run-dir parsing; also safe to source standalone
# (defines functions only, no side effects). The signatures below are the
# contract other cmd-* agents code against (SPEC-cfn-fleet.md, section
# "lib/common.sh"): change them only additively.
#
#   fleet_run_dir            echoes resolved run dir path, exit 64 if none
#   fleet_env_get KEY        echoes value from fleet.env or default; empty if unset
#   fleet_roster_file        echoes roster.tsv path
#   roster_exists WS         0 if row present
#   roster_get WS FIELD      echoes field value by header name; exit 65 unknown WS/FIELD
#   roster_set WS FIELD VAL  flock .roster.lock, rewrite row atomically (tmp+mv)
#   roster_rows              TSV lines minus header
#   fleet_die CODE MSG       msg to stderr, exit CODE

# Canonical roster columns (order IS the TSV layout; do not reorder).
# Consumed by cmd-init.sh (and any cmd file that writes rows), not here.
# shellcheck disable=SC2034
FLEET_ROSTER_HEADER=$'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes'

fleet_die(){ # fleet_die CODE MSG — message to stderr, exit CODE
  local code="$1"
  shift
  printf 'fleet: %s\n' "$*" >&2
  exit "$code"
}

# Resolve the active run dir. Precedence: $FLEET_RUN_DIR (set by the router's
# --run-dir flag or the caller's env) > nearest planning/fleet-* walking up
# from cwd (newest by mtime per level) > exit 64.
fleet_run_dir(){
  if [ -n "${FLEET_RUN_DIR:-}" ]; then
    [ -d "$FLEET_RUN_DIR" ] \
      || fleet_die 64 "fleet run dir not found: $FLEET_RUN_DIR (fleet init first)"
    printf '%s\n' "$FLEET_RUN_DIR"
    return 0
  fi
  local dir="$PWD" best d
  while :; do
    best=""
    # compgen -G: glob match test that is safe under set -e / set -u
    if compgen -G "$dir/planning/fleet-*" >/dev/null 2>&1; then
      for d in "$dir"/planning/fleet-*; do
        [ -d "$d" ] || continue
        if [ -z "$best" ] || [ "$d" -nt "$best" ]; then best="$d"; fi
      done
      if [ -n "$best" ]; then
        printf '%s\n' "$best"
        return 0
      fi
    fi
    [ "$dir" = "/" ] && break
    dir=$(dirname "$dir")
  done
  fleet_die 64 "no fleet run dir (fleet init first)"
}

# Built-in fleet.env defaults. Unknown keys default to empty.
_fleet_env_default(){
  case "$1" in
    FLEET_WORKTREE) printf 'off\n';;
    FLEET_DB)       printf 'none\n';;
    *)              printf '';;
  esac
}

# fleet_env_get KEY — value from <run-dir>/fleet.env, else built-in default,
# else empty. KEY=VALUE lines; '#' comments and blank lines ignored.
fleet_env_get(){
  local key="$1" rd val="" line
  rd=$(fleet_run_dir)
  if [ -f "$rd/fleet.env" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in '#'*|"") continue ;; esac
      if [ "${line%%=*}" = "$key" ]; then
        val="${line#*=}"
        break
      fi
    done < "$rd/fleet.env"
  fi
  [ -n "$val" ] || val=$(_fleet_env_default "$key")
  printf '%s\n' "$val"
}

fleet_roster_file(){ # echoes <run-dir>/roster.tsv
  local rd
  rd=$(fleet_run_dir)
  printf '%s/roster.tsv' "$rd"
}

# 1-based column index for a header name; empty when the field is unknown.
_roster_field_index(){
  local field="$1" f
  f=$(fleet_roster_file)
  [ -f "$f" ] || fleet_die 64 "no roster at $f (fleet init first)"
  head -n1 "$f" | awk -F'\t' -v want="$field" \
    '{for (i=1; i<=NF; i++) if ($i == want) { print i; exit }}'
}

roster_exists(){ # roster_exists WS — 0 if a row with ws_id WS is present
  local ws="$1" f
  f=$(fleet_roster_file)
  [ -f "$f" ] || return 1
  awk -F'\t' -v ws="$ws" '$1 == ws { found=1; exit } END { exit !found }' "$f"
}

roster_get(){ # roster_get WS FIELD — echoes value; 65 on unknown WS or FIELD
  local ws="$1" field="$2" idx f
  f=$(fleet_roster_file)
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
  idx=$(_roster_field_index "$field")
  [ -n "$idx" ] || fleet_die 65 "unknown roster field: $field"
  awk -F'\t' -v ws="$ws" -v i="$idx" '$1 == ws { print $i; exit }' "$f"
}

# roster_set WS FIELD VAL — rewrite one cell under an exclusive flock on
# .roster.lock, atomically (write tmp in the same dir, mv over). Tabs and
# newlines in VAL are flattened to spaces to keep the TSV parseable.
roster_set(){
  local ws="$1" field="$2" val="$3" f lock idx tmp
  f=$(fleet_roster_file)
  [ -f "$f" ] || fleet_die 64 "no roster at $f (fleet init first)"
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
  idx=$(_roster_field_index "$field")
  [ -n "$idx" ] || fleet_die 65 "unknown roster field: $field"
  val="${val//$'\t'/ }"
  val="${val//$'\n'/ }"
  lock="$(dirname "$f")/.roster.lock"
  tmp="${f}.tmp.$$"
  (
    flock -x 9 || exit 71
    awk -F'\t' -v OFS='\t' -v ws="$ws" -v i="$idx" -v v="$val" '
      NR == 1  { print; next }
      $1 == ws { $i = v; print; next }
               { print }' "$f" > "$tmp" || exit 71
    mv -f "$tmp" "$f"
  ) 9>"$lock" || fleet_die 71 "roster rewrite failed for $ws.$field"
}

roster_rows(){ # roster rows without the header line
  local f
  f=$(fleet_roster_file)
  [ -f "$f" ] || fleet_die 64 "no roster at $f (fleet init first)"
  awk 'NR > 1' "$f"
}

# --- Shared claim guard (cmd-commit.sh + cmd-land.sh) -----------------------
# Extracted from the duplicated commit/land matchers: the commit copy lacked
# the fleet-run-dir exclusion, so another workstream's roster heartbeat under
# planning/fleet-*/ would 66 every commit in real runs (land already excluded
# it). One matcher, one exclusion, both guards identical.

# _fleet_path_claimed PATH CLAIMS — 0 if PATH is covered by the space-separated
# claim list: exact match, file under a claimed dir, or glob claim (src/*).
_fleet_path_claimed(){
  local path="$1" claims="$2" c
  for c in $claims; do
    [ -n "$c" ] || continue
    [ "$path" = "$c" ] && return 0        # exact file
    # shellcheck disable=SC2053
    [[ "$path" == "$c"/* ]] && return 0   # file under a claimed dir
    # shellcheck disable=SC2053
    [[ "$path" == $c ]] && return 0       # glob claim, e.g. src/*
  done
  return 1
}

# _fleet_all_dirty RUN_DIR_REL — dirty (incl. untracked, -uall) repo-relative
# paths, one per line; rename sides split onto separate lines so each side is
# claim-checked (and stageable) independently. RUN_DIR_REL (repo-relative
# fleet run dir, empty when the run dir lives outside the repo) is
# control-plane state every workstream writes (roster heartbeats, briefs,
# handoffs), so it is never listed.
_fleet_all_dirty(){
  local run_dir_rel="$1" line path
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    path="${line:3}"   # porcelain v1: XY + space; path starts at column 4
    if [ -n "$run_dir_rel" ]; then
      # shellcheck disable=SC2053
      [[ "$path" == "$run_dir_rel" || "$path" == "$run_dir_rel"/* ]] && continue
    fi
    if [[ "$path" == *' -> '* ]]; then
      printf '%s\n%s\n' "${path%% -> *}" "${path##* -> }"
    else
      printf '%s\n' "$path"
    fi
  done < <(git status --porcelain -uall)
  return 0
}

# _fleet_unclaimed_dirty CLAIMS RUN_DIR_REL — subset of _fleet_all_dirty not
# covered by CLAIMS; empty output when every dirty path is claimed/clean.
_fleet_unclaimed_dirty(){
  local claims="$1" run_dir_rel="$2" path
  while IFS= read -r path; do
    _fleet_path_claimed "$path" "$claims" || printf '%s\n' "$path"
  done < <(_fleet_all_dirty "$run_dir_rel")
  return 0
}
