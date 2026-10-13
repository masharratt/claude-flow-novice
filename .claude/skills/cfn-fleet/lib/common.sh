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
#   _fleet_html_escape STR   escaped HTML for STR (& first, then < > " ')
#   _fleet_tsv_split LINE    split a TSV line into _FIELDS preserving empty cells
#   _fleet_tmux_socket       run's dedicated tmux socket (env > fleet-<slug>)
#   _fleet_tmux_pane_alive SOCKET SESSION
#                            0 while the session exists; tmux-absent rc is
#                            tooling, never a dead pane
#
# Engine registry helpers (fleet_engine_*, fleet_ws_engine) live in engines.sh,
# sourced below; their contract is pinned by planning/HANDOFF_cfn-fleet-engines.md.

# shellcheck source=engines.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/engines.sh"

# Canonical roster columns (order IS the TSV layout; do not reorder). New
# columns are APPENDED only, so cut/awk positional consumers keep their
# indexes. Pre-engine rosters on disk carry the old 10-column header; readers
# treat a missing canonical field as empty and the first writer migrates the
# file (see _roster_migrate_locked).
# `host` (col 12) names the ssh alias a remote worker runs on; empty = local.
# Consumed by cmd-init.sh (and any cmd file that writes rows), not here.
# shellcheck disable=SC2034
FLEET_ROSTER_HEADER=$'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\thost'

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
# A field that exists in the canonical FLEET_ROSTER_HEADER but not in the
# file's older header (e.g. engine on a pre-engine roster) falls back to the
# canonical index: reads then see the missing trailing cell as empty, and
# migrate-on-first-write (roster_set / cmd-add) upgrades the file under the
# lock it already holds.
_roster_field_index(){
  local field="$1" f idx
  f=$(fleet_roster_file)
  [ -f "$f" ] || fleet_die 64 "no roster at $f (fleet init first)"
  idx=$(head -n1 "$f" | awk -F'\t' -v want="$field" \
    '{for (i=1; i<=NF; i++) if ($i == want) { print i; exit }}')
  if [ -z "$idx" ]; then
    idx=$(printf '%s\n' "$FLEET_ROSTER_HEADER" | awk -F'\t' -v want="$field" \
      '{for (i=1; i<=NF; i++) if ($i == want) { print i; exit }}')
  fi
  printf '%s\n' "$idx"
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

# _roster_migrate_locked FILE — bring a stale-header roster up to the current
# FLEET_ROSTER_HEADER: header line replaced with the canonical one, every data
# row padded with empty trailing cells to match. Migrate-on-first-write policy:
# readers keep working on old files (a missing canonical field reads as empty
# via the _roster_field_index fallback); the first WRITER upgrades the file.
# Must be called with the roster flock already held (roster_set, cmd-add) —
# it takes no lock of its own, so it never self-deadlocks. No-op when the
# header is current; never truncates a longer (future) header's rows.
_roster_migrate_locked(){
  local f="$1" nf tmp
  [ "$(head -n1 "$f")" = "$FLEET_ROSTER_HEADER" ] && return 0
  nf=$(printf '%s\n' "$FLEET_ROSTER_HEADER" | awk -F'\t' '{print NF}')
  tmp="${f}.tmp.$$"
  awk -F'\t' -v OFS='\t' -v hdr="$FLEET_ROSTER_HEADER" -v nf="$nf" '
    NR == 1  { print hdr; next }
             { while (NF < nf) $(NF+1) = ""; print }' "$f" > "$tmp" \
    || { rm -f "$tmp"; return 71; }
  mv -f "$tmp" "$f" || { rm -f "$tmp"; return 71; }
}

# roster_set WS FIELD VAL — rewrite one cell under an exclusive flock on
# .roster.lock, atomically (write tmp in the same dir, mv over). Tabs and
# newlines in VAL are flattened to spaces to keep the TSV parseable.
roster_set(){
  local ws="$1" field="$2" val="$3" f lock
  f=$(fleet_roster_file)
  [ -f "$f" ] || fleet_die 64 "no roster at $f (fleet init first)"
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
  lock="$(dirname "$f")/.roster.lock"
  (
    flock -x 9 || exit 71
    _roster_set_locked "$ws" "$field" "$val" || exit 71
  ) 9>"$lock" || fleet_die 71 "roster rewrite failed for $ws.$field"
}

# _roster_set_locked WS FIELD VAL: the roster_set body for callers that already
# hold the roster flock (cmd-claim's check-then-write). flock is not re-entrant
# across fds, so calling roster_set while holding the lock would deadlock.
_roster_set_locked(){
  local ws="$1" field="$2" val="$3" f idx tmp
  f=$(fleet_roster_file)
  idx=$(_roster_field_index "$field")
  [ -n "$idx" ] || fleet_die 65 "unknown roster field: $field"
  val="${val//$'\t'/ }"
  val="${val//$'\n'/ }"
  tmp="${f}.tmp.$$"
  _roster_migrate_locked "$f" || return 71
  awk -F'\t' -v OFS='\t' -v ws="$ws" -v i="$idx" -v v="$val" '
    NR == 1  { print; next }
    $1 == ws { $i = v; print; next }
             { print }' "$f" > "$tmp" || { rm -f "$tmp"; return 71; }
  mv -f "$tmp" "$f"
}

# fleet_valid_host NAME: 0 when NAME is a safe ssh alias. It lands in ssh argv
# and roster cells, so shell metacharacters and whitespace are refused.
fleet_valid_host(){
  [[ "${1:-}" =~ ^[A-Za-z0-9._-]+$ ]]
}

# fleet_worktree_path REPO WS: local worktree dir for a workstream. One
# definition for spawn and land so the two never drift.
fleet_worktree_path(){
  local repo="$1" ws="$2"
  printf '%s/.claude/worktrees/%s\n' "$repo" "$(printf '%s' "$ws" | tr '[:upper:]' '[:lower:]')"
}

# --- Claim overlap (cmd-claim.sh + cmd-add.sh) ------------------------------
# Normalize a claim path/glob to its comparable scope prefix. Globs compare by
# their containing directory ('docs/*.md' scopes to 'docs').
_claim_prefix(){
  local p="$1"
  p="${p#./}"
  p="${p%/}"
  case "$p" in
    *[\*\?\[]*) printf '%s\n' "$(dirname "$p")";;
    *)          printf '%s\n' "$p";;
  esac
}

# 0 when the two prefixes are equal or one is a directory-prefix of the other.
_paths_overlap(){
  local a="$1" b="$2"
  [ "$a" = "$b" ] && return 0
  case "/$b/" in "/$a/"*) return 0 ;; esac
  case "/$a/" in "/$b/"*) return 0 ;; esac
  return 1
}

# _roster_claims_conflict WS CLAIM...: prints a message and returns 0 when any
# CLAIM overlaps another row's claims (rows other than WS). Returns 1 when none
# do. Reads the roster, so callers hold the roster flock to make the answer
# stay true until their write lands. awk (not `IFS=$'\t' read`) so rows with
# empty claims keep their field positions.
_roster_claims_conflict(){
  local ws="$1" ows oclaims oc opfx p pp
  shift
  while IFS=$'\t' read -r ows oclaims; do
    [ "$ows" = "$ws" ] && continue
    for oc in $oclaims; do
      opfx=$(_claim_prefix "$oc")
      for p in "$@"; do
        pp=$(_claim_prefix "$p")
        if _paths_overlap "$pp" "$opfx"; then
          printf "claim '%s' for %s overlaps '%s' owned by %s\n" "$p" "$ws" "$oc" "$ows"
          return 0
        fi
      done
    done
  done < <(awk -F'\t' 'NR > 1 && $5 != "" { print $1 "\t" $5 }' "$(fleet_roster_file)")
  return 1
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
    # A directory claim may carry a trailing slash (roster rows written for
    # shared-directory arrangements do). Strip it, or the prefix pattern
    # becomes "dir//*" and never matches a real path (measured 2026-09-11:
    # fleet commit refused every file under four trailing-slash claims).
    c="${c%/}"
    [ "$path" = "$c" ] && return 0
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

# --- Shared presentation / tmux helpers (watch, dashboard, spawn) -----------

# _fleet_html_escape STR — escaped HTML. Order is load-bearing: & must be
# replaced first or each escape's own ampersand gets re-escaped.
_fleet_html_escape() {
  local s="$1"
  # \& forms: in bash 5.2 ${//} replacement a bare & is a backreference to
  # the matched text (so &lt; would emit <lt;). Same fix as workbench
  # lib/html.sh html_escape.
  s="${s//&/\&amp;}"
  s="${s//</\&lt;}"
  s="${s//>/\&gt;}"
  s="${s//\"/\&quot;}"
  s="${s//\'/\&apos;}"
  printf '%s' "$s"
}

# _fleet_tsv_split LINE — split a TSV line into _FIELDS preserving empty
# cells (tab -> octal unit separator, which is NOT whitespace-collapsed by
# bash's IFS handling the way literal tabs are). Extracted from cmd-watch.sh;
# never parse the roster with positional `IFS=$'\t' read` (consecutive empty
# cells collapse and columns shift).
_fleet_tsv_split() {
  _FIELDS=()
  local IFS=$'\037'
  read -r -a _FIELDS <<< "$(printf '%s' "$1" | tr '\t' '\037')"
}

# _fleet_tmux_socket: the run's dedicated tmux socket. FLEET_TMUX_SOCKET from
# fleet.env, else fleet-<slug> from the run dir basename (non-alphanumerics
# folded to dashes). Single source of truth for watch, dashboard, and spawn.
_fleet_tmux_socket() {
  local sock
  sock=$(fleet_env_get FLEET_TMUX_SOCKET)
  if [ -z "$sock" ]; then
    sock=$(basename "$(fleet_run_dir)")
    sock="fleet-${sock#fleet-}"
    sock="${sock//[^A-Za-z0-9_.-]/-}"
  fi
  printf '%s\n' "$sock"
}

# _fleet_tmux_pane_alive SOCKET SESSION: 0 while the session exists on the
# run's socket, 1 once it is gone (spawn's exec makes the pane die with the
# engine, so tmux answers rc 1 "can't find session"). rc 1 alongside tmux's
# "no server running" / "error connecting" text is TOOLING, not a dead
# worker: it reports 0 so an absent tmux server can never manufacture a
# false DEAD.
_fleet_tmux_pane_alive() {
  local err rc=0
  err=$(tmux -L "$1" has-session -t "$2" 2>&1) || rc=$?
  [ "$rc" -eq 0 ] && return 0
  case "$err" in
    *"no server running"*|*"error connecting"*) return 0 ;;
  esac
  return 1
}

# --- Dashboard helpers shared beyond cmd-dashboard.sh ------------------------
# Lives here, not in cmd-dashboard.sh: the dispatcher sources common.sh plus
# only the invoked cmd file, so `fleet spawn` would never see definitions
# left in cmd-dashboard.sh (plan 1.0). Bodies are verbatim moves.

# _fleet_dash_port [FLAG_VALUE]: resolved dashboard port. Precedence:
# --port flag > FLEET_DASHBOARD_PORT env > fleet.env FLEET_DASHBOARD_PORT >
# 4880 (unassigned per project-ports.md).
_fleet_dash_port() {
  local flag="${1:-}"
  if [ -n "$flag" ]; then
    printf '%s\n' "$flag"
    return 0
  fi
  if [ -n "${FLEET_DASHBOARD_PORT:-}" ]; then
    printf '%s\n' "$FLEET_DASHBOARD_PORT"
    return 0
  fi
  local v
  v=$(fleet_env_get FLEET_DASHBOARD_PORT)
  printf '%s\n' "${v:-4880}"
}

# _fleet_dash_serve_is_serving RUN_DIR: 0 when the pidfile names a live
# python3 http.server. The command-line check is load-bearing: a recycled pid
# whose command line is not http.server is "not serving", so --stop never
# kills an innocent process.
_fleet_dash_serve_is_serving() {
  local rd="$1" pid
  [ -f "$rd/.dashboard.pid" ] || return 1
  pid=$(cat "$rd/.dashboard.pid" 2>/dev/null) || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  _fleet_pid_cmdline "$pid" | grep -q 'http.server'
}

# --- Portable userland helpers (GNU/Linux and BSD/macOS) ---------------------
# The skill once assumed a GNU userland; on macOS `fleet dashboard` reported a
# running server as failed (/proc), timeline times printed "?" (date -d) and
# the poll fingerprint never changed (stat -c). Each helper tries the GNU form
# first with stderr silenced, then the BSD form. Pinned by
# tests/test-cfn-fleet-portability.sh.

# _fleet_pid_cmdline PID: the process's command line, empty when it is gone.
# /proc where it exists (Linux), else ps (macOS; also present on Linux).
_fleet_pid_cmdline() {
  if [ -r "/proc/$1/cmdline" ]; then  # GNU first
    tr '\0' ' ' < "/proc/$1/cmdline"  # GNU first
  else
    ps -p "$1" -o command= 2>/dev/null
  fi
}

# _fleet_pid_alive PID: 0 while the process exists.
_fleet_pid_alive() { kill -0 "$1" 2>/dev/null; }

# _fleet_stat_mtime_size FILE: "<mtime epoch> <size bytes>".
_fleet_stat_mtime_size() { stat -c '%Y %s' "$1" 2>/dev/null || stat -f '%m %z' "$1"; }  # GNU first

# _fleet_file_mode FILE: octal permission bits, e.g. 600.
_fleet_file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }  # GNU first

# _fleet_epoch_hms EPOCH: HH:MM:SS in UTC, "?" when neither date form works.
_fleet_epoch_hms() { date -u -d "@$1" '+%H:%M:%S' 2>/dev/null || date -u -r "$1" '+%H:%M:%S' 2>/dev/null || printf '?'; }  # GNU first

# _fleet_sha1: stdin -> "<hex>  -" (sha1sum where present, else shasum).
_fleet_sha1() {
  if command -v sha1sum >/dev/null 2>&1; then sha1sum; else shasum -a 1; fi
}

# _fleet_reverse_lines: stdin lines in reverse order (tac is GNU only).
_fleet_reverse_lines() { awk '{ l[NR] = $0 } END { for (i = NR; i > 0; i--) print l[i] }'; }
