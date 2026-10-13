#!/usr/bin/env bash
# cfn-fleet lib/cmd-sync.sh: pull remote worker reports into the Mac roster.
#
#   fleet sync [WSxx]
#
# A worker on a remote host has no fleet CLI. It drops small JSON reports in
# its outbox (templates/remote-worker.sh); this command fetches them with ONE
# ssh call per host row (a tar of reports/ and handoffs/ on stdout), drops any
# report from another generation or at/below the applied seq, and applies the
# rest under ONE roster lock. Only worker fields are ever written: heartbeat
# (stamped at Mac receive time, never the worker's clock), notes, status
# (allowed transitions only), handoff files copied into <run>/handoffs/, and
# claim requests appended to handoffs/CLAIM_REQ_<WS>.md for the master to
# decide. claims and migration_num are never touched: a remote report is
# input, not authority.
#
# Progress lives in <run>/remote/<WS>.applied as "<gen> <max seq>". A new
# generation (respawn) restarts from seq 0.
#
# Output (one line each): SYNC <ws> applied N | up to date | ..., UNREACHABLE
# <ws> <host> (link down; roster untouched, never a DEAD), HANDOFF <ws> <file>,
# CLAIM-REQ <ws> <path>. Exit 0 unless the ws is unknown (65) or usage (64).
#
# This file also holds the remote-row helpers watch, dashboard and peek share
# (env loader, pane capture, prompt regex, live state), because the router
# sources common.sh plus only the invoked cmd file.

# shellcheck source=host.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/host.sh"

# A permission or confirmation prompt on a worker pane. One constant so watch,
# dashboard and peek agree on what "waiting on a human" looks like.
_FLEET_PROMPT_RE='Do you want to |\(y/n\)|\[Y/n\]|[0-9]\. Yes'

# A worker may only move its row between these states. landed, dead and
# pending belong to the master; done is final until the master resets it.
_FLEET_SYNC_FROM='started working blocked'
_FLEET_SYNC_TO='started working blocked done'

# _fleet_remote_env_load WS: read <run>/remote/<WS>.env (written by spawn
# --host) into _RE_FLEET_* variables. The file holds %q-quoted values; a child
# bash sources it and re-quotes the few keys we need, so nothing in the file
# runs in this shell. Returns 1 when the file is missing or unreadable.
_fleet_remote_env_load() {
  _RE_FLEET_HOST="" _RE_FLEET_GEN="" _RE_FLEET_OUTBOX=""
  _RE_FLEET_SOCK="" _RE_FLEET_SESSION="" _RE_FLEET_SPAWNED_AT=""
  local f out
  f="$(fleet_run_dir)/remote/$1.env"
  [ -f "$f" ] || return 1
  out=$(bash -c 'source "$1" >/dev/null 2>&1 || exit 1
    for k in FLEET_HOST FLEET_GEN FLEET_OUTBOX FLEET_SOCK FLEET_SESSION FLEET_SPAWNED_AT; do
      printf "_RE_%s=%q\n" "$k" "${!k-}"
    done' _ "$f") || return 1
  eval "$out"
  return 0
}

# _fleet_roster_has_host ROSTER: 0 when any row names a host.
_fleet_roster_has_host() {
  local idx
  idx=$(_roster_field_index host)
  [ -n "$idx" ] || return 1
  awk -F'\t' -v i="$idx" 'NR > 1 && $i != "" { found = 1; exit } END { exit !found }' "$1"
}

# _fleet_pane_capture HOST SOCK SESSION [LINES]: the last LINES lines of the
# pane (default 40). Returns tmux's rc, or the ssh failure code.
_fleet_pane_capture() {
  local host="$1" sock="$2" session="$3" lines="${4:-40}"
  _fleet_tmux "$host" -L "$sock" capture-pane -p -t "$session" -S "-$lines"
}

# _fleet_pane_prompt_shown HOST SOCK SESSION: 0 when the visible tail of the
# pane shows a permission prompt.
_fleet_pane_prompt_shown() {
  local cap
  cap=$(_fleet_pane_capture "$1" "$2" "$3" 15 2>/dev/null) || return 1
  printf '%s\n' "$cap" | grep -Eq "$_FLEET_PROMPT_RE"
}

# _fleet_host_live_state WS HOST: prints unreachable | dead | prompt | alive,
# or unknown when the row has no remote env. unreachable only ever means "could
# not ask"; dead only when tmux itself answered.
_fleet_host_live_state() {
  local ws="$1" host="$2" st
  _fleet_remote_env_load "$ws" || { echo unknown; return 0; }
  st=$(_fleet_pane_state "$host" "$_RE_FLEET_SOCK" "$_RE_FLEET_SESSION")
  case "$st" in
    alive)
      if _fleet_pane_prompt_shown "$host" "$_RE_FLEET_SOCK" "$_RE_FLEET_SESSION"; then
        echo prompt
      else
        echo alive
      fi ;;
    *) echo "$st" ;;
  esac
  return 0
}

# _fleet_remote_noreport WS NOW: 0 when the worker was spawned more than
# FLEET_FIRST_REPORT_SECS ago and no report of the current generation has been
# applied yet (dead launch, wrong login, a prompt nobody answered).
_fleet_remote_noreport() {
  local ws="$1" now="$2" secs applied gen max
  _fleet_remote_env_load "$ws" || return 1
  secs="${FLEET_FIRST_REPORT_SECS:-$(fleet_env_get FLEET_FIRST_REPORT_SECS)}"
  [[ "$secs" =~ ^[0-9]+$ ]] || secs=300
  [[ "$_RE_FLEET_SPAWNED_AT" =~ ^[0-9]+$ ]] || return 1
  applied="$(fleet_run_dir)/remote/$ws.applied"
  if [ -f "$applied" ]; then
    read -r gen max < "$applied" || true
    [ "${gen:-}" = "$_RE_FLEET_GEN" ] && [[ "${max:-}" =~ ^[0-9]+$ ]] && [ "$max" -ge 1 ] && return 1
  fi
  [ $((now - _RE_FLEET_SPAWNED_AT)) -ge "$secs" ]
}

# Reads reports/ from an extracted outbox and prints the ones to apply, sorted
# by numeric seq, one per line, fields separated by the unit separator:
#   seq kind note status path sha file wsok
# Filters the generation and applied seq itself. Control characters are
# flattened and values capped so a worker cannot inject lines or fields.
# Only whitelisted keys leave this script.
_FLEET_SYNC_PY='
import json, os, re, sys
d, ws, gen, applied = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
rd = os.path.join(d, "reports")
rows = []
for n in (os.listdir(rd) if os.path.isdir(rd) else []):
    if n.startswith(".") or not n.endswith(".json"):
        continue
    m = re.fullmatch(r"(.+)-([0-9]+)\.json", n)
    if not m or m.group(1) != gen:
        continue
    seq = int(m.group(2))
    if seq <= applied:
        continue
    p = os.path.join(rd, n)
    if os.path.islink(p) or not os.path.isfile(p):
        continue
    try:
        with open(p) as fh:
            o = json.load(fh)
        ok = (isinstance(o, dict) and o.get("ws") == ws and o.get("gen") == gen
              and int(o.get("seq")) == seq)
    except Exception:
        o, ok = {}, False
    def clean(k):
        v = o.get(k, "") if ok else ""
        v = "" if v is None else str(v)
        return re.sub(r"[\x00-\x1f\x7f]", " ", v)[:300]
    rows.append((seq, o.get("kind", "") if ok else "", clean("note"), clean("status"),
                 clean("path"), clean("sha"), clean("file"), "1" if ok else "0"))
rows.sort(key=lambda r: r[0])
for r in rows:
    print("\x1f".join(str(x) for x in r))
'

# fleet_sync [WS]: sync one host row, or every host row when WS is empty.
fleet_sync() {
  local only="${1:-}" roster hidx ws host
  roster=$(fleet_roster_file)
  [ -f "$roster" ] || fleet_die 65 "sync: roster missing at $roster"
  if [ -n "$only" ]; then
    roster_exists "$only" || fleet_die 65 "unknown workstream: $only"
  fi
  hidx=$(_roster_field_index host)
  while IFS=$'\037' read -r ws host; do
    [ -n "$ws" ] || continue
    [ -z "$only" ] || [ "$ws" = "$only" ] || continue
    if [ -z "$host" ]; then
      [ -z "$only" ] || echo "SYNC $ws local row, nothing to pull"
      continue
    fi
    _fleet_sync_one "$ws" "$host" "$only"
  done < <(awk -F'\t' -v i="$hidx" 'NR > 1 { printf "%s\037%s\n", $1, $i }' "$roster")
  return 0
}

# _fleet_sync_one WS HOST EXPLICIT: pull and apply one host row. EXPLICIT is
# non-empty when the user named the ws (then a missing env is worth saying).
_fleet_sync_one() {
  local ws="$1" host="$2" explicit="$3" tmp rc=0
  if ! _fleet_remote_env_load "$ws"; then
    [ -z "$explicit" ] || echo "SYNC $ws no remote env (row was not spawned with --host)"
    return 0
  fi
  local gen="$_RE_FLEET_GEN" outbox="$_RE_FLEET_OUTBOX"
  if [ -z "$gen" ] || [ -z "$outbox" ]; then
    echo "SYNC $ws remote env incomplete (needs FLEET_GEN and FLEET_OUTBOX)"
    return 0
  fi
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/fleet-sync.XXXXXX") || fleet_die 71 "sync: cannot create temp dir"
  _fleet_sync_apply "$ws" "$host" "$gen" "$outbox" "$tmp" || rc=$?
  rm -rf "$tmp"
  return 0
}

_fleet_sync_apply() {
  local ws="$1" host="$2" gen="$3" outbox="$4" tmp="$5"
  local rd rc=0 applied_file agen amax=0
  rd=$(fleet_run_dir)
  applied_file="$rd/remote/$ws.applied"
  if [ -f "$applied_file" ]; then
    read -r agen amax < "$applied_file" || true
    [ "${agen:-}" = "$gen" ] && [[ "${amax:-}" =~ ^[0-9]+$ ]] || amax=0
  fi

  # One ssh call: the whole outbox state this command needs, as a tar.
  _fleet_host_run "$host" bash -c \
    'cd "$1" 2>/dev/null || exit 3; mkdir -p reports handoffs; tar -cf - reports handoffs' \
    _ "$outbox" > "$tmp/pull.tar" 2>/dev/null || rc=$?
  case "$rc" in
    0) ;;
    3) echo "SYNC $ws no outbox on $host yet"; return 0 ;;
    "$_FLEET_SSH_FAIL_RC"|"$_FLEET_TIMEOUT_RC") echo "UNREACHABLE $ws $host"; return 0 ;;
    *) echo "SYNC $ws pull failed on $host (rc $rc)"; return 0 ;;
  esac
  mkdir -p "$tmp/x"
  tar -xf "$tmp/pull.tar" -C "$tmp/x" 2>/dev/null \
    || { echo "SYNC $ws pull failed on $host (unreadable archive)"; return 0; }

  local lines
  lines=$(python3 -I -c "$_FLEET_SYNC_PY" "$tmp/x" "$ws" "$gen" "$amax") \
    || { echo "SYNC $ws could not read reports (python3 needed)"; return 0; }
  if [ -z "$lines" ]; then
    echo "SYNC $ws up to date"
    return 0
  fi

  local lock="$rd/.roster.lock" safe_ws=0
  [[ "$ws" =~ ^[A-Za-z0-9._-]+$ ]] && safe_ws=1
  mkdir -p "$rd/handoffs" "$rd/remote"
  (
    flock -x 9 || exit 71
    local seq kind note status path sha file wsok
    local max="$amax" accepted=0 dropped=0 new_note="" have_note=0
    local cur_status new_status
    cur_status=$(roster_get "$ws" status)
    new_status="$cur_status"
    while IFS=$'\037' read -r seq kind note status path sha file wsok; do
      [ "$seq" -gt "$max" ] && max="$seq"
      if [ "$wsok" != 1 ]; then
        dropped=$((dropped + 1))
        continue
      fi
      case "$kind" in
        heartbeat)
          accepted=$((accepted + 1))
          [ -z "$note" ] || { new_note="$note"; have_note=1; } ;;
        status)
          if [[ " $_FLEET_SYNC_FROM " == *" $new_status "* && " $_FLEET_SYNC_TO " == *" $status "* ]]; then
            accepted=$((accepted + 1))
            new_status="$status"
          else
            echo "SYNC $ws refused status '$status' (row is '$new_status', seq $seq)"
          fi ;;
        handoff)
          if [[ "$file" =~ ^[A-Za-z0-9._-]+$ && "$file" != *..* \
                && -f "$tmp/x/handoffs/$file" && ! -L "$tmp/x/handoffs/$file" ]]; then
            cp "$tmp/x/handoffs/$file" "$rd/handoffs/$file" \
              && { accepted=$((accepted + 1)); echo "HANDOFF $ws $file"; }
          else
            echo "SYNC $ws refused handoff '$file' (unsafe name or not in the outbox, seq $seq)"
          fi ;;
        claim_request)
          if [ "$safe_ws" = 1 ] && [ -n "$path" ]; then
            local cr="$rd/handoffs/CLAIM_REQ_$ws.md"
            [ -f "$cr" ] || printf '# Claim requests from %s\n\nDecide with `fleet claim`; sync never changes claims.\n\n' "$ws" > "$cr"
            printf -- '- %s (gen %s, seq %s)\n' "$path" "$gen" "$seq" >> "$cr"
            accepted=$((accepted + 1))
            echo "CLAIM-REQ $ws $path"
          fi ;;
        commit)
          accepted=$((accepted + 1))
          new_note="commit ${sha:0:12}${note:+ $note}"; have_note=1 ;;
        *) dropped=$((dropped + 1)) ;;
      esac
    done <<< "$lines"

    if [ "$accepted" -gt 0 ]; then
      _roster_set_locked "$ws" heartbeat "$(date +%s)" || exit 71
      [ "$have_note" -eq 0 ] || _roster_set_locked "$ws" notes "${new_note:0:200}" || exit 71
      [ "$new_status" = "$cur_status" ] || _roster_set_locked "$ws" status "$new_status" || exit 71
    fi
    printf '%s %s\n' "$gen" "$max" > "$applied_file.tmp" && mv "$applied_file.tmp" "$applied_file"
    if [ "$accepted" -gt 0 ]; then
      echo "SYNC $ws applied $accepted"
    else
      echo "SYNC $ws dropped $dropped report(s), nothing to apply"
    fi
  ) 9>"$lock" || fleet_die 71 "sync: roster update failed for $ws"
  return 0
}

main() {
  local ws=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -*) fleet_die 64 "sync: unknown option $1" ;;
      *)  [ -z "$ws" ] || fleet_die 64 "sync: one workstream at most"
          ws="$1"; shift ;;
    esac
  done
  fleet_sync "$ws"
}
