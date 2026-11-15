#!/usr/bin/env bash
# cfn-fleet lib/lane-deliver.sh: master -> host lane delivery, and claim grants.
#
# A lane on a remote host runs sandboxed: Redis is blocked, so it can queue
# mail out but never read mail in, and remote-worker.sh reads its claims from
# <outbox>/claims.txt (every commit), never from the Mac roster. So whatever
# the master tells a host lane goes over ssh, three ways (MDTWII 2026-11-14:
# lanes sat idle ~7.5 h on mail they never saw, and waited on grants that only
# reached one of the two claim stores):
#   claims.txt      the lane's claim store; remote-worker.sh commit reads it
#   FROM_MASTER.md  the lane's inbox file (BRIEF_REMOTE.md tells it to read it)
#   tmux nudge      a short pointer typed into the lane's pane, then Enter
#
# Grants are two-phase (codex review 2026-11-14, findings 2-4 and 6):
#   1. under the roster flock, no ssh: overlap check, roster write, and a
#      pending-delivery record <run>/remote/<WS>.pending (one GRANTED notice
#      per line) for a host row or a row that is still spawning;
#   2. after the lock, _fleet_lane_reconcile: union the roster claims into the
#      host claims.txt, append the pending notices to FROM_MASTER.md, nudge,
#      then drop the delivered lines. Anything that fails stays pending and
#      the next `fleet claim`, `fleet sync` or the end of `fleet spawn --host`
#      retries it. No remote env means not delivered, never success.
# Every ssh/tmux call here is cut off after FLEET_DELIVER_TIMEOUT seconds
# (env > fleet.env > 20).
#
# Sourced by cmd-sync.sh (so every cmd file that sources it gets these). Uses
# host.sh and _fleet_remote_env_load (cmd-sync.sh) at call time. Functions and
# constants only; prints nothing when sourced.
#
#   _fleet_lane_claims_push WS PATH...      add PATHs to the host claims.txt
#   _fleet_lane_from_master WS TYPE TEXT    append a message to FROM_MASTER.md
#   _fleet_lane_nudge WS TEXT               type TEXT, pause, then a separate Enter
#   _fleet_lane_deliver WS TYPE TEXT        FROM_MASTER.md, then a nudge pointing at it
#   _fleet_lane_pending_add WS PATHS TAG    record a GRANTED notice to deliver
#   _fleet_lane_has_pending WS              0 when a delivery is pending
#   _fleet_lane_reconcile WS                deliver claims + pending notices
#   _fleet_hot_file PATH                    0 when PATH is or holds a hot shared file
#   _fleet_claim_grant_locked WS TAG PATH...     phase 1 of the one grant path
#   _fleet_claim_autogrant_locked WS PATH TAG    decide one claim request
#
# Return codes of the lane functions: 0 done | 2 not a host row, or no
# remote/<WS>.env yet (nothing to deliver to) | 3 no outbox on the host |
# 75 host lock busy | anything else is the ssh/tmux failure code (124 timeout).

# shellcheck source=host.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/host.sh"

# Hot shared files are never auto-granted: every lane touches them, so the
# master decides. Space-separated globs, repo-relative. Override per run with
# FLEET_HOT_FILES (env, then fleet.env), the skill's usual per-run knob.
_FLEET_HOT_FILES_DEFAULT='Cargo.toml Cargo.lock readme/*.md tools/dev/file-size-allow.txt'

# Server-side lock prelude shared by the scripts below: _lane_locked OUTBOX
# CMD... runs CMD while holding the outbox lock (flock when present, else a
# mkdir lock), so concurrent writers (a grant and a `fleet mail`) never
# interleave or truncate each other (finding 7).
_FLEET_LANE_LOCK_SH='
_lane_locked() {
  local ob="$1" l n=0 rc
  shift
  if command -v flock >/dev/null 2>&1; then
    ( flock -w 10 9 || exit 75; "$@" ) 9>>"$ob/.master.lock"
    return $?
  fi
  l="$ob/.master.lockd"
  until mkdir "$l" 2>/dev/null; do
    n=$((n + 1)); [ "$n" -gt 200 ] && return 75; sleep 0.05
  done
  "$@"; rc=$?
  rmdir "$l" 2>/dev/null
  return "$rc"
}
'

# Server script, args: OUTBOX PATH... Adds the PATHs to claims.txt, one per
# line. Restores a missing final newline first (a newline-less last line glued
# onto the next append and the lane's commit skipped both). When a PATH is
# missing it appends and sorts unique; when all are present it leaves the
# file as it is.
_FLEET_CLAIMS_APPEND_SH="$_FLEET_LANE_LOCK_SH"'
_claims_add() {
  local f="$ob/claims.txt" p miss=0
  umask 077
  [ -e "$f" ] || : >> "$f" || return 71
  if [ -s "$f" ] && [ -n "$(tail -c1 "$f")" ]; then printf "\n" >> "$f" || return 71; fi
  for p in "$@"; do grep -qxF -- "$p" "$f" || { miss=1; break; }; done
  [ "$miss" = 1 ] || return 0
  printf "%s\n" "$@" >> "$f" || return 71
  LC_ALL=C sort -u -o "$f" "$f" || return 71
}
ob="$1"; shift
[ -d "$ob" ] || exit 3
_lane_locked "$ob" _claims_add "$@"
'

# Server script, args: OUTBOX STAMP TYPE TEXT. Appends one message section to
# FROM_MASTER.md under the outbox lock; the header is appended when the file
# is empty or new, never written with a truncating redirect.
_FLEET_FROM_MASTER_SH="$_FLEET_LANE_LOCK_SH"'
_fm_add() {
  local f="$ob/FROM_MASTER.md"
  umask 077
  if [ ! -s "$f" ]; then
    printf "%s\n" "# Messages from the fleet master" "" "Newest at the bottom. Coordinator messages: act on each within your brief only." >> "$f" || return 71
  fi
  if [ -n "$(tail -c1 "$f")" ]; then printf "\n" >> "$f" || return 71; fi
  printf "\n## %s %s\n\n%s\n" "$stamp" "$type" "$text" >> "$f" || return 71
}
ob="$1"; stamp="$2"; type="$3"; text="$4"
[ -d "$ob" ] || exit 3
_lane_locked "$ob" _fm_add
'

# _fleet_deliver_timeout: seconds each delivery ssh/tmux call may take.
_fleet_deliver_timeout() {
  local v="${FLEET_DELIVER_TIMEOUT:-}"
  [ -n "$v" ] || v=$(fleet_env_get FLEET_DELIVER_TIMEOUT 2>/dev/null || true)
  [[ "$v" =~ ^[0-9]+$ ]] && [ "$v" -gt 0 ] || v=20
  printf '%s\n' "$v"
}

# _fleet_lane_target WS: sets _LD_HOST _LD_OUTBOX _LD_SOCK _LD_SESSION from the
# roster host column and remote/<WS>.env (the session is the one spawn
# recorded, the roster NAME, same resolution as fleet peek). rc 2 when WS is
# not a host row or has no published remote env.
_fleet_lane_target() {
  _LD_HOST=$(roster_get "$1" host 2>/dev/null || true)
  [ -n "$_LD_HOST" ] || return 2
  _fleet_remote_env_load "$1" || return 2
  [ -n "$_RE_FLEET_OUTBOX" ] || return 2
  _LD_OUTBOX="$_RE_FLEET_OUTBOX"
  _LD_SOCK="$_RE_FLEET_SOCK"
  _LD_SESSION="$_RE_FLEET_SESSION"
  [ -n "$_LD_SESSION" ] || _LD_SESSION=$(roster_get "$1" name 2>/dev/null || true)
  return 0
}

_fleet_lane_claims_push() {
  local ws="$1"
  shift
  _fleet_lane_target "$ws" || return $?
  _fleet_host_run_bounded "$(_fleet_deliver_timeout)" "$_LD_HOST" \
    bash -c "$_FLEET_CLAIMS_APPEND_SH" _ "$_LD_OUTBOX" "$@" >/dev/null 2>&1
}

_fleet_lane_from_master() {
  _fleet_lane_target "$1" || return $?
  _fleet_host_run_bounded "$(_fleet_deliver_timeout)" "$_LD_HOST" \
    bash -c "$_FLEET_FROM_MASTER_SH" _ "$_LD_OUTBOX" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2" "$3" >/dev/null 2>&1
}

# _fleet_lane_nudge WS TEXT: literal text, FLEET_NUDGE_DELAY (default 1) pause,
# then Enter as its own send-keys: one combined send often leaves the text
# unsent in a busy pane. Spinner verification is not done here: no shared
# helper reads "is it working now" for a pane, so the caller only knows the
# keys arrived.
_fleet_lane_nudge() {
  local rc=0 t
  _fleet_lane_target "$1" || return $?
  t=$(_fleet_deliver_timeout)
  _FLEET_HOST_DEADLINE="$t" _fleet_tmux "$_LD_HOST" -L "$_LD_SOCK" send-keys -t "=$_LD_SESSION:" -l -- "$2" >/dev/null 2>&1 || return $?
  sleep "${FLEET_NUDGE_DELAY:-1}"
  _FLEET_HOST_DEADLINE="$t" _fleet_tmux "$_LD_HOST" -L "$_LD_SOCK" send-keys -t "=$_LD_SESSION:" Enter >/dev/null 2>&1 || rc=$?
  return "$rc"
}

# _fleet_lane_deliver WS TYPE TEXT: the message into FROM_MASTER.md, then a
# short pointer nudge. rc 0 both | 5 file written, nudge failed | file rc.
_fleet_lane_deliver() {
  local ws="$1" type="$2" text="$3" rc=0
  _fleet_lane_from_master "$ws" "$type" "$text" || return $?
  _fleet_lane_nudge "$ws" "fleet master: new $type in $_LD_OUTBOX/FROM_MASTER.md; read it and act within your brief" || rc=5
  return "$rc"
}

# --- Pending deliveries (<run>/remote/<WS>.pending) -------------------------
# One line per undelivered GRANTED notice: "<paths>\t<tag>".
# Two local locks per lane, never the roster flock itself:
#   <WS>.pending.lock    short: every append, the snapshot read and the
#                        removal of delivered lines. Appends happen inside the
#                        roster flock (grant phase 1), so the order is always
#                        roster -> pending, and this lock is never held across
#                        ssh (a roster writer never waits on the network).
#   <WS>.reconcile.lock  held for one whole reconcile, ssh included, so two
#                        reconcilers of a lane never overlap. Taken only with
#                        no roster flock held (reconcile runs after callers
#                        release it); while holding it, only the short pending
#                        lock is ever taken.
# (codex review round 2, 2026-11-14: reconcile races.)

_fleet_lane_pending_file() { printf '%s/remote/%s.pending\n' "$(fleet_run_dir)" "$1"; }

# _fleet_local_locked LOCKFILE CMD...: run CMD (a function is fine) holding an
# exclusive lock on LOCKFILE: flock where present, else a mkdir lock
# (LOCKFILE.d), the same pair the host scripts use. rc 75 when the mkdir lock
# stays busy; otherwise CMD's rc.
_fleet_local_locked() {
  local lf="$1" n=0 rc
  shift
  if command -v flock >/dev/null 2>&1; then
    ( flock -x 8 || exit 71; "$@" ) 8>>"$lf"
    return $?
  fi
  until mkdir "$lf.d" 2>/dev/null; do
    n=$((n + 1)); [ "$n" -gt 1200 ] && return 75; sleep 0.05
  done
  "$@"; rc=$?
  rmdir "$lf.d" 2>/dev/null
  return "$rc"
}

_fleet_lane_pending_append() { printf '%s\t%s\n' "$2" "$3" >> "$1"; }

_fleet_lane_pending_add() {
  local f
  f=$(_fleet_lane_pending_file "$1")
  mkdir -p "$(dirname "$f")" || return 71
  _fleet_local_locked "$f.lock" _fleet_lane_pending_append "$f" "$2" "${3//[$'\t\n']/ }"
}

# _fleet_lane_pending_drop FILE SNAPFILE: remove each line of SNAPFILE from
# FILE once, by exact content (never by position: lines appended or removed
# meanwhile stay as they are).
_fleet_lane_pending_drop() {
  local f="$1" snapf="$2"
  [ -f "$f" ] || return 0
  awk 'NR == FNR { c[$0]++; next } ($0 in c) && c[$0] > 0 { c[$0]--; next } { print }' \
    "$snapf" "$f" > "$f.tmp" && mv -f "$f.tmp" "$f" || return 71
  [ -s "$f" ] || rm -f "$f"
}

_fleet_lane_pending_cat() { [ ! -f "$1" ] || cat "$1"; }

_fleet_lane_has_pending() { [ -s "$(_fleet_lane_pending_file "$1")" ]; }

# _fleet_lane_reconcile WS: deliver everything the host lane is owed, holding
# the lane's reconcile lock. Order matters: the pending notices are read FIRST,
# then the roster claims, then claims.txt is pushed, so every notice delivered
# has its path in the pushed set (a grant landing meanwhile stays pending for
# the next reconcile). Then the notices go into FROM_MASTER.md as one GRANTED
# section, the pane is nudged, and exactly the delivered lines are removed.
# Prints DELIVERED / WARN lines. rc 0 | 2 no host row or env | transport rc.
_fleet_lane_reconcile() {
  local f
  f=$(_fleet_lane_pending_file "$1")
  mkdir -p "$(dirname "$f")" || return 71
  _fleet_local_locked "$f.reconcile.lock" _fleet_lane_reconcile_locked "$1"
}

_fleet_lane_reconcile_locked() {
  local ws="$1" f claims rc=0 paths tag text="" line snap snapf
  local -a cl=() delivered=()
  _fleet_lane_target "$ws" || return $?
  f=$(_fleet_lane_pending_file "$ws")
  # 1. Snapshot the pending notices first.
  snap=$(_fleet_local_locked "$f.lock" _fleet_lane_pending_cat "$f") || return 71
  # 2. Then the roster claims (a superset of every path in the snapshot).
  claims=$(roster_get "$ws" claims 2>/dev/null || true)
  # Same split as spawn's claims.txt (_spawn_remote_claims): commas or spaces.
  read -r -a cl <<< "${claims//,/ }"
  # 3. Push them.
  if [ "${#cl[@]}" -gt 0 ]; then
    _fleet_lane_claims_push "$ws" "${cl[@]}" || return $?
  fi
  [ -n "$snap" ] || return 0
  while IFS=$'\t' read -r paths tag; do
    [ -n "$paths" ] || continue
    delivered+=("$paths")
    text+="GRANTED $paths ($tag). claims.txt has them now; your next commit picks them up."$'\n'
  done <<< "$snap"
  if [ -n "$text" ]; then
    _fleet_lane_from_master "$ws" GRANTED "${text%$'\n'}" || return $?
    _fleet_lane_nudge "$ws" "fleet master: new GRANTED in $_LD_OUTBOX/FROM_MASTER.md; read it and act within your brief" \
      || { rc=$?; echo "WARN $ws: GRANTED written to FROM_MASTER.md on $_LD_HOST, but the nudge failed (rc $rc)"; }
  fi
  snapf="$f.snap.$$"
  printf '%s\n' "$snap" > "$snapf" || return 71
  _fleet_local_locked "$f.lock" _fleet_lane_pending_drop "$f" "$snapf" || { rm -f "$snapf"; return 71; }
  rm -f "$snapf"
  for line in ${delivered[@]+"${delivered[@]}"}; do echo "DELIVERED $ws GRANTED $line to $_LD_HOST"; done
  return 0
}

# _fleet_hot_files: the run's hot list (FLEET_HOT_FILES env > fleet.env > default).
_fleet_hot_files() {
  local v="${FLEET_HOT_FILES:-}"
  [ -n "$v" ] || v=$(fleet_env_get FLEET_HOT_FILES 2>/dev/null || true)
  printf '%s\n' "${v:-$_FLEET_HOT_FILES_DEFAULT}"
}

# _fleet_hot_file PATH: 0 when PATH matches a hot glob, or is a directory that
# holds one (a request for readme/ would take every readme/*.md).
_fleet_hot_file() {
  local p pp h hp
  local -a hs
  p=$(_claim_prefix "$1")
  pp="$p"
  read -r -a hs <<< "$(_fleet_hot_files)"
  for h in ${hs[@]+"${hs[@]}"}; do
    # shellcheck disable=SC2053  # h is a glob on purpose
    [[ "$p" == $h ]] && return 0
    hp=$(_claim_prefix "$h")
    case "/$hp/" in "/$pp/"*) return 0 ;; esac
  done
  return 1
}

# _fleet_claim_grant_locked WS TAG PATH...: phase 1 of THE grant path shared
# by `fleet claim` and auto-grant. Caller holds the roster flock; no ssh here.
#   1. PATHs not already in the row are checked against every active row
#      (_roster_claims_conflict); an overlap prints its message, rc 65.
#   2. new PATHs are appended to the roster claims cell (land's claims gate).
#   3. a host row, or a row still spawning, gets a pending GRANTED notice; the
#      caller runs _fleet_lane_reconcile after releasing the lock.
# Prints a GRANTED or ALREADY line. rc 0 | 65 overlap | 71 write failed.
_fleet_claim_grant_locked() {
  local ws="$1" tag="$2" own have p msg host st
  shift 2
  local -a new=()
  own=$(roster_get "$ws" claims)
  have=" $own "
  for p in "$@"; do
    case "$have" in *" $p "*) continue ;; esac
    have="$have$p "
    new+=("$p")
  done
  if [ "${#new[@]}" -eq 0 ]; then
    echo "ALREADY $ws holds $*"
    return 0
  fi
  if msg=$(_roster_claims_conflict "$ws" "${new[@]}"); then
    printf '%s\n' "$msg"
    return 65
  fi
  _roster_set_locked "$ws" claims "${own:+$own }${new[*]}" || return 71
  host=$(roster_get "$ws" host)
  st=$(roster_get "$ws" status)
  if [ -n "$host" ] || [ "$st" = spawning ]; then
    _fleet_lane_pending_add "$ws" "${new[*]}" "$tag" || return 71
  fi
  echo "GRANTED $ws ${new[*]}"
  return 0
}

# _fleet_lane_settle WS PATHS: phase 2 for a caller that just granted, after
# the roster lock is released. Delivers when the row is a host row; prints a
# WARN naming what is pending otherwise. rc 0 delivered or nothing to deliver
# | 66 granted in the roster, host delivery pending.
_fleet_lane_settle() {
  local ws="$1" paths="$2" host st rc=0
  host=$(roster_get "$ws" host 2>/dev/null || true)
  if [ -z "$host" ]; then
    st=$(roster_get "$ws" status 2>/dev/null || true)
    [ "$st" != spawning ] || echo "NOTE $ws: GRANTED in roster, delivery pending: the spawn in progress delivers it"
    return 0
  fi
  _fleet_lane_reconcile "$ws" || rc=$?
  case "$rc" in
    0) return 0 ;;
    2) echo "WARN $ws: GRANTED in roster, delivery pending: no remote env for $ws on $host yet; the next fleet sync or spawn delivers it" ;;
    *) echo "WARN $ws: GRANTED in roster, delivery pending on $host (rc $rc); the next fleet sync retries, or rerun: fleet claim $ws $paths" ;;
  esac
  return 66
}

# _fleet_auto_grant_on: auto-grant runs unless FLEET_AUTO_GRANT (env, then
# fleet.env) is off.
_fleet_auto_grant_on() {
  local v="${FLEET_AUTO_GRANT:-}"
  [ -n "$v" ] || v=$(fleet_env_get FLEET_AUTO_GRANT 2>/dev/null || true)
  case "$v" in off|0|no|false) return 1 ;; esac
  return 0
}

# _fleet_claim_autogrant_locked WS PATH TAG: decide one claim request under the
# roster flock the caller holds (phase 1 only; the caller settles delivery
# after the lock with _fleet_lane_reconcile). Granted when PATH is one
# canonical plain repo path (_fleet_path_canonical), not hot, the requester is
# active and no active row holds an overlapping path. Otherwise the request
# stays in handoffs/CLAIM_REQ_<WS>.md for the master with the reason (the
# holder named). Prints GRANTED/ALREADY or CLAIM-REQ lines. rc 71 on a failed
# roster write.
_fleet_claim_autogrant_locked() {
  local ws="$1" p="$2" tag="$3" why="" st out rc=0 note
  p="${p#./}"
  p="${p%/}"
  if [[ ! "$p" =~ ^[A-Za-z0-9._/-]+$ ]] || ! _fleet_path_canonical "$p"; then
    why="not a plain repo path"
  elif ! _fleet_auto_grant_on; then
    why="auto-grant off"
  elif _fleet_hot_file "$p"; then
    why="hot shared file"
  else
    st=$(roster_get "$ws" status)
    ! _fleet_row_released "$st" "$(roster_get "$ws" host)" || why="row is $st"
  fi
  if [ -z "$why" ]; then
    out=$(_fleet_claim_grant_locked "$ws" "auto-grant, $tag" "$p") || rc=$?
    case "$rc" in
      0)
        note="GRANTED automatically"
        [ -z "$(roster_get "$ws" host)" ] || note="GRANTED in roster, delivery pending"
        case "$out" in ALREADY*) note="already held" ;; esac
        _fleet_claim_req_append "$ws" "$p" "$tag; $note"
        printf '%s\n' "$out"
        return 0 ;;
      65) why="held by ${out##* owned by }" ;;
      *)  return 71 ;;
    esac
  fi
  _fleet_claim_req_append "$ws" "$2" "$tag; for the master: $why"
  echo "CLAIM-REQ $ws $2 ($why)"
  return 0
}

# _fleet_lane_settle_sync WS: after a sync or watch applied reports for a host
# row (roster lock released), deliver whatever is pending. A delivered grant
# is noted in CLAIM_REQ_<WS>.md as GRANTED automatically; a failure prints a
# WARN and stays pending for the next sync.
_fleet_lane_settle_sync() {
  local ws="$1" out rc=0 line
  _fleet_lane_has_pending "$ws" || return 0
  out=$(_fleet_lane_reconcile "$ws") || rc=$?
  [ -z "$out" ] || printf '%s\n' "$out"
  if [ "$rc" -eq 0 ]; then
    while IFS= read -r line; do
      case "$line" in
        "DELIVERED $ws GRANTED "*)
          line="${line#DELIVERED "$ws" GRANTED }"
          _fleet_claim_req_append "$ws" "${line% to *}" "GRANTED automatically, delivered to ${line##* to }" ;;
      esac
    done <<< "$out"
    return 0
  fi
  case "$rc" in
    2) echo "WARN $ws: GRANTED in roster, delivery pending: no remote env yet" ;;
    *) echo "WARN $ws: GRANTED in roster, delivery pending on $(roster_get "$ws" host 2>/dev/null) (rc $rc); the next fleet sync retries" ;;
  esac
  return 0
}
