#!/usr/bin/env bash
# cfn-fleet lib/cmd-spawn.sh — launch the worker session(s) for a workstream.
#
# Real-run origin: spare sessions back compaction restarts (run e59a7826).
# Engine rewrite origin: planning/HANDOFF_cfn-fleet-engines.md section 3 —
# workers are launched ENGINES (claude-sub, glm via z.ai, codex), never bare
# bash with the brief typed in. lib/common.sh is sourced first (by cli/fleet);
# this file lazy-sources lib/engines.sh when the router has not already.
# The command runs with cwd inside the target project repo.
#
#   fleet spawn WSxx [--spares N] [--engine e] [--host H] [--no-tmux] [--dry-run]
#
# --host H runs the worker on server H (claude engines only): see
# lib/spawn-remote.sh; local spawns never reach it.
#
# Order of operations (tmux path):
#   1. resolve engine: --engine flag > roster column > FLEET_DEFAULT_ENGINE
#      (fleet.env or env) > claude-sub
#   2. resolve the engine's set-vars from the master shell; missing/empty
#      $SOURCE_VAR -> exit 66 naming the var, before any side effect
#   3. guard rails (warn unless stated): codex billing (66 when the master
#      env's OPENAI_API_KEY is not in the engine's unset list; warn when
#      ~/.codex/auth.json auth_mode != chatgpt), claude-sub armed ANTHROPIC_*
#      keys in the target repo's .claude/settings*.json (warn, file:line),
#      dirty tmux server global env (warn + set-environment -gu suggestion)
#   4. tmux -L <socket> new-session -d -s <name> -c <cwd>, no -e: set-var
#      values and the pane command go in a 0600 launch script; only a short
#      `. <script>` is typed (spawn-env.sh). Never argv (the tmux server keeps
#      its argv, readable by every process); never a long typed line (a fresh
#      macOS pty drops typed input past ~1024 bytes)
#   5. first pane command, one line: export FLEET_RUN_DIR=<run dir>;
#      unset <unset list>; exec <bin> <args>  (exec so the pane dies with the
#      engine and `tmux has-session` sees it). The activity-gated heartbeat
#      ticker, when enabled (FLEET_TICK_SECS, default 30s), is spliced in
#      front of this segment as a backgrounded loop (lib/heartbeat-ticker.sh)
#   6. trust prompt: poll capture-pane up to FLEET_TRUST_TIMEOUT (default 15s)
#      for the folder-trust prompt text (derived from the engine bin: the
#      registry pins trust_keys, not the prompt text); send the keys
#      (claude: Down,Enter; codex: Enter) only if the prompt is seen.
#      Worktree mode hits this every run (new directory each time).
#   7. banner verification: poll capture-pane up to FLEET_BANNER_TIMEOUT
#      (default 20s) for the engine's banner_regex. Match -> roster status
#      started, heartbeat now, engine column written, and
#      "spawned <ws> engine=<e> banner=\"<line>\"". Timeout -> the row stays
#      pending, the last 10 pane lines are printed, exit 66. A worker on the
#      wrong model never reaches started.
#   8. only after the banner: the thin prompt "read <brief path> and start;
#      coordinate as the brief says ..." — never the brief body.
#   9. spares: same engine/env, launched to the banner, NO prompt sent.
#
# Modes:
#   default    start tmux sessions on the run's dedicated socket
#   --no-tmux  print the exact tmux new-session / send-keys lines to paste
#              (token values printed as $SOURCE_VAR references, never
#              resolved); the spawn still counts: roster -> started
#   --dry-run  print the PLAN lines only; mutates nothing (no worktree, no
#              roster, no set-var resolution, no guards)
#
# Socket: FLEET_TMUX_SOCKET (fleet.env) or fleet-<slug> by default. EVERY tmux
# invocation passes -L, so a run's sessions live on their own server that can
# be started clean (kill with: tmux -L fleet-<slug> kill-server).
# Main-in-place default: session cwd = repo root. FLEET_WORKTREE=on: session
# cwd = a dedicated git worktree on branch fleet/<WSxx>; claims stay in the
# shared roster.

# engines.sh may be sourced by the router; source it lazily when not (the
# file only defines functions, so re-sourcing is harmless either way).
if ! declare -F fleet_engine_get >/dev/null 2>&1; then
  # shellcheck source=engines.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/engines.sh"
fi

# heartbeat-ticker.sh: the activity-gated heartbeat sidecar the tmux branch
# below splices into worker panes. Functions only, silent, safe to re-source.
# shellcheck source=heartbeat-ticker.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/heartbeat-ticker.sh"

# spawn-env.sh: engine env reaches the pane through a 0600 file, never argv
# (shared with cfn-tmux-agents; the file explains the leak it closes).
# shellcheck source=../../../cfn-scripts/spawn-env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../cfn-scripts" && pwd)/spawn-env.sh"

# host.sh: ssh transport for `--host` spawns (functions only, safe to re-source).
if ! command -v _fleet_host_run >/dev/null 2>&1; then
  # shellcheck source=host.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/host.sh"
fi

# spawn-remote.sh: the --host path, its sandbox settings and limits.
# shellcheck source=spawn-remote.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/spawn-remote.sh"

# _spawn_tmux ARGS... — tmux on the spawn's host. _SPAWN_HOST is set by main
# (dynamic scope) only for --host spawns; empty runs plain local `tmux ARGS`,
# so the local path is unchanged.
_spawn_tmux(){
  _fleet_tmux "${_SPAWN_HOST:-}" "$@"
}

# _spawn_socket — dedicated tmux socket for this run; delegates to the shared
# helper in lib/common.sh (same logic for watch, dashboard, and spawn).
_fleet_spawn_socket(){
  _fleet_tmux_socket
}

# _fleet_env_seconds KEY DEFAULT — numeric fleet.env knob with a fallback.
_fleet_env_seconds(){
  local v
  v=$(fleet_env_get "$1")
  [[ "$v" =~ ^[0-9]+$ ]] || v="$2"
  printf '%s\n' "$v"
}

# --- spawning state -------------------------------------------------------
# A launch takes a while (banner wait, ssh round trips). Between "launch
# begins" and "banner seen" the row reads `spawning`, so a backgrounded spawn
# does not look dead and a second spawn of the same row is refused instead of
# colliding on the tmux session (MDTWII WS350, 2026-10-13).
#
# Marker: <run_dir>/.spawning/<WS>, key=value lines (pid, started, prev_status,
# prev_host). A file rather than a roster note: it is created atomically
# (noclobber), so two racing spawns cannot both win; it keeps the prior status
# and host for the restore; and no roster column or heartbeat reader ever sees
# it. Liveness is `kill -0 <pid>`: a dead pid is a stale marker (cleared with
# a WARN). Success clears it when the row becomes started; any failure exit
# restores the previous status and host through the EXIT trap.
_SPAWN_MARK_FILE="" _SPAWN_MARK_WS="" _SPAWN_MARK_OWNER=""
_SPAWN_MARK_PREV_STATUS="" _SPAWN_MARK_PREV_HOST="" _SPAWN_MARK_HOST_SET=0
_SPAWN_MARK_DONE=0

# _spawn_marker_read FILE: sets _SPAWN_M_PID/_STARTED/_PREV_STATUS/_PREV_HOST.
_spawn_marker_read(){
  local k v
  _SPAWN_M_PID="" _SPAWN_M_STARTED="" _SPAWN_M_PREV_STATUS="" _SPAWN_M_PREV_HOST=""
  while IFS== read -r k v || [ -n "$k" ]; do
    case "$k" in
      pid) _SPAWN_M_PID="$v" ;;
      started) _SPAWN_M_STARTED="$v" ;;
      prev_status) _SPAWN_M_PREV_STATUS="$v" ;;
      prev_host) _SPAWN_M_PREV_HOST="$v" ;;
    esac
  done < "$1"
}

# _spawn_restore: EXIT trap. Runs only in the owning shell and only when the
# spawn did not reach started: restores status (and host if this spawn wrote
# it), then drops the marker.
_spawn_restore(){
  [ "${BASHPID:-$$}" = "$_SPAWN_MARK_OWNER" ] || return 0
  [ "$_SPAWN_MARK_DONE" -eq 0 ] || return 0
  roster_set "$_SPAWN_MARK_WS" status "$_SPAWN_MARK_PREV_STATUS" 2>/dev/null || true
  [ "$_SPAWN_MARK_HOST_SET" -eq 0 ] \
    || roster_set "$_SPAWN_MARK_WS" host "$_SPAWN_MARK_PREV_HOST" 2>/dev/null || true
  rm -f "$_SPAWN_MARK_FILE"
}

# _spawn_begin WS RUN_DIR HOST: refuse when a live spawn owns the row, clear a
# stale marker, then write the marker and set status=spawning (plus host).
_spawn_begin(){
  local ws="$1" run_dir="$2" host="$3" f prev_status prev_host attempt now
  f="$run_dir/.spawning/$ws"
  mkdir -p "$run_dir/.spawning" || fleet_die 71 "spawn: cannot create $run_dir/.spawning"
  prev_status=$(roster_get "$ws" status)
  prev_host=$(roster_get "$ws" host 2>/dev/null || true)
  [ "$prev_status" != spawning ] || prev_status=pending
  now=$(date +%s)
  for attempt in 1 2; do
    if ( set -C; printf 'pid=%s\nstarted=%s\nprev_status=%s\nprev_host=%s\n' \
           "${BASHPID:-$$}" "$now" "$prev_status" "$prev_host" > "$f" ) 2>/dev/null; then
      break
    fi
    _spawn_marker_read "$f" 2>/dev/null || true
    if [[ "$_SPAWN_M_PID" =~ ^[0-9]+$ ]] && kill -0 "$_SPAWN_M_PID" 2>/dev/null; then
      local age=0
      [[ "$_SPAWN_M_STARTED" =~ ^[0-9]+$ ]] && age=$((now - _SPAWN_M_STARTED))
      fleet_die 66 "spawn: $ws is already spawning (pid $_SPAWN_M_PID, started ${age}s ago); wait or kill it"
    fi
    echo "WARN spawn: stale spawning marker for $ws (pid ${_SPAWN_M_PID:-unknown} is gone); clearing it" >&2
    # The dead spawn never restored the row, so its recorded previous values
    # are the truth, not the `spawning` it left behind.
    if [ "$(roster_get "$ws" status)" = spawning ] && [ -n "$_SPAWN_M_PREV_STATUS" ]; then
      prev_status="$_SPAWN_M_PREV_STATUS"
      prev_host="$_SPAWN_M_PREV_HOST"
    fi
    rm -f "$f"
    [ "$attempt" -eq 1 ] || fleet_die 66 "spawn: $ws is already spawning (marker could not be taken)"
  done
  [ -f "$f" ] || fleet_die 66 "spawn: $ws is already spawning (marker could not be taken)"
  _SPAWN_MARK_FILE="$f" _SPAWN_MARK_WS="$ws" _SPAWN_MARK_OWNER="${BASHPID:-$$}"
  _SPAWN_MARK_PREV_STATUS="$prev_status" _SPAWN_MARK_PREV_HOST="$prev_host"
  _SPAWN_MARK_HOST_SET=0 _SPAWN_MARK_DONE=0
  trap _spawn_restore EXIT
  roster_set "$ws" status spawning
  if [ -n "$host" ]; then
    roster_set "$ws" host "$host"
    _SPAWN_MARK_HOST_SET=1
  fi
}

# _spawn_commit: the row reached started; the marker has served its purpose.
_spawn_commit(){
  [ -n "$_SPAWN_MARK_FILE" ] || return 0
  _SPAWN_MARK_DONE=1
  rm -f "$_SPAWN_MARK_FILE"
  trap - EXIT
}

# _fleet_set_names RAW_COMMA_LIST — the NAME side of each NAME=$SRC or
# NAME=literal item, comma-joined (for the PLAN engine line; no values).
_fleet_set_names(){
  local out="" item
  [ -n "$1" ] || return 0
  while IFS= read -r item || [ -n "$item" ]; do
    [ -n "$item" ] || continue
    out+="${out:+,}${item%%=*}"
  done < <(printf '%s' "$1" | tr ',' '\n')
  printf '%s\n' "$out"
}

# _fleet_pane_wait SOCK TARGET REGEX TIMEOUT_S — poll capture-pane until a
# line matches REGEX; echo the (right-trimmed) line, rc 1 on timeout.
_fleet_pane_wait(){
  # Deadline on the clock, not a round count: over ssh one capture is a
  # round trip, and timeout*5 rounds ran for minutes (MDTWII, 2026-10-13).
  local sock="$1" tgt="$2" re="$3" timeout="$4" line
  local deadline=$((SECONDS + timeout))
  while [ "$SECONDS" -lt "$deadline" ]; do
    line=$(_spawn_tmux -L "$sock" capture-pane -p -t "$tgt" 2>/dev/null \
      | sed -e 's/\r$//' -e 's/[[:space:]]*$//' -e '/^$/d' \
      | grep -v -E -- 'exec (claude|codex)|--model |send-keys|cfn-spawn-launch' \
      | grep -E -- "$re" || true)
    line="${line%%$'\n'*}"
    if [ -n "$line" ]; then
      printf '%s\n' "$line"
      return 0
    fi
    sleep 0.2
  done
  return 1
}

# _fleet_codex_flag_check REPO — Codex delegation gate (global CLAUDE.md):
# the codex engine may only run in projects whose CLAUDE.md carries a
# literal codex=true line. However the engine was chosen (--engine flag,
# roster column, FLEET_DEFAULT_ENGINE), this runs after engine resolution
# and before any side effect. Dies 66 naming the file when absent.
_fleet_codex_flag_check() {
  local f="$1/CLAUDE.md"
  if [ ! -f "$f" ] || ! grep -Eq '^[[:space:]]*codex=true[[:space:]]*$' "$f"; then
    fleet_die 66 "spawn: codex engine requires a literal 'codex=true' line in $f (Codex delegation gate; add it to the project's CLAUDE.md or use claude-sub/glm)"
  fi
}

# _fleet_codex_auth_warn — subscription billing needs auth_mode chatgpt in
# ~/.codex/auth.json. Warn only; the hard refusal is the unset-list guard.
_fleet_codex_auth_warn(){
  local af="${HOME:-}/.codex/auth.json" mode=""
  if [ ! -f "$af" ]; then
    echo "WARN codex: $af not found; cannot confirm ChatGPT-plan auth (spawn proceeds; check billing mode)" >&2
    return 0
  fi
  mode=$(sed -n 's/.*"auth_mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$af" | head -n1)
  if [ "$mode" != "chatgpt" ]; then
    echo "WARN codex: $af auth_mode='${mode:-unknown}' (subscription billing needs auth_mode chatgpt)" >&2
  fi
}

# _fleet_claude_repo_settings_warn REPO SESSION_CWD — armed (no _ prefix)
# ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN keys in the repo's .claude settings
# apply at Claude Code startup regardless of the pane env. Warn with file:line.
_fleet_claude_repo_settings_warn(){
  local dir f hit v
  for dir in "$1" "$2"; do
    [ -n "$dir" ] || continue
    for f in "$dir/.claude/settings.local.json" "$dir/.claude/settings.json"; do
      [ -f "$f" ] || continue
      while IFS= read -r hit; do
        [ -n "$hit" ] || continue
        v=$(printf '%s' "${hit#*:}" | sed -n 's/[^"]*"\(ANTHROPIC_[A-Z_]*\)".*/\1/p')
        echo "WARN claude: ${f}:${hit%%:*} arms ${v:-ANTHROPIC_*} in its env block; the pane env cannot override it (disarm with a _ prefix)" >&2
      done < <(grep -nE '"(ANTHROPIC_BASE_URL|ANTHROPIC_AUTH_TOKEN)"' "$f" 2>/dev/null || true)
    done
  done
  return 0
}

# _fleet_tmux_server_warn SOCKET — warn (never fail) when the tmux server's
# global env carries inherited ANTHROPIC_*/OPENAI_* vars.
_fleet_tmux_server_warn(){
  local sock="$1" line names="" n
  while IFS= read -r line; do
    case "$line" in
      ANTHROPIC_*|OPENAI_*) names+="${names:+ }${line%%=*}" ;;
    esac
  done < <(tmux -L "$sock" show-environment -g 2>/dev/null || true)
  [ -n "$names" ] || return 0
  echo "WARN tmux: server socket '$sock' carries inherited vars:$names" >&2
  for n in $names; do
    echo "WARN tmux:   clear with: tmux -L $sock set-environment -gu $n" >&2
  done
  return 0
}

# _spawn_launch_one SOCK SNAME SESSION_CWD PANE_CMD TRUST_RE TRUST_KEYS
# TRUST_TIMEOUT BANNER_RE BANNER_TIMEOUT — new-session, a per-session launch
# script (env from the global _SPAWN_SET_LINES + PANE_CMD) typed into the
# pane as one short `. <script>` line, trust poll, banner poll. Echoes the
# matching banner line, rc 0. On failure prints the diagnostics to stderr and
# returns 1 — the caller owns the fleet_die, because a die inside this
# function could not abort the caller's command substitution under a
# suppressed errexit.
_spawn_launch_one(){
  local sock="$1" sname="$2" session_cwd="$3" pane_cmd="$4" trust_re="$5"
  local trust_keys="$6" trust_timeout="$7" banner_re="$8" banner_timeout="$9"
  local banner_line

  # One launch script per session: it deletes itself on first source, so a
  # spare cannot reuse the main session's.
  # Host spawns ship the launch script to the server beforehand and only
  # type its `. <path>` line (_SPAWN_REMOTE_LAUNCH_LINE); nothing local to write.
  if [ -n "${_SPAWN_REMOTE_LAUNCH_LINE:-}" ]; then
    CFN_SPAWN_ENV_DIR="" CFN_SPAWN_LAUNCH_LINE="$_SPAWN_REMOTE_LAUNCH_LINE"
  elif ! cfn_spawn_launch_write "${_SPAWN_SET_LINES:-}" "${pane_cmd/@@SPAWN_ENV@@/}"; then
    echo "fleet: spawn: could not write the private launch script for $sname" >&2
    return 1
  fi
  if ! _spawn_tmux -L "$sock" new-session -d -s "$sname" -c "$session_cwd"; then
    echo "fleet: spawn: tmux new-session failed for $sname (duplicate session? socket: $sock)" >&2
    [ -z "$CFN_SPAWN_ENV_DIR" ] || rm -rf "$CFN_SPAWN_ENV_DIR"
    return 1
  fi
  if ! _spawn_tmux -L "$sock" send-keys -t "$sname" -l "$CFN_SPAWN_LAUNCH_LINE"; then
    echo "fleet: spawn: could not reach pane $sname (session died?)" >&2
    [ -z "$CFN_SPAWN_ENV_DIR" ] || rm -rf "$CFN_SPAWN_ENV_DIR"
    return 1
  fi
  _spawn_tmux -L "$sock" send-keys -t "$sname" Enter

  # Startup gates: ONE poll over the folder-trust and startup-modal regexes,
  # dispatch on the matched line. Keys are sent only when a prompt actually
  # shows (registry trust_keys is a comma list, "Down,Enter"; send-keys wants
  # them as separate words).
  # - codex-cli update modal ("Update available ... Press enter to
  #   continue"): bare Enter would pick "1. Update now" = a surprise
  #   npm install -g, so send "2" (Skip) then Enter (measured live,
  #   codex-cli 0.153.4, 2026-09-10).
  # - folder-trust prompts: the engine trust_keys.
  local gate_re="Update available|Press enter to continue" gate_line
  if [ -n "$trust_re" ]; then gate_re="$gate_re|$trust_re"; fi
  gate_line=$(_fleet_pane_wait "$sock" "$sname" "$gate_re" "$trust_timeout" || true)
  if [ -n "$gate_line" ]; then
    case "$gate_line" in
      *Update\ available*|*Press\ enter*)
        _spawn_tmux -L "$sock" send-keys -t "$sname" -l "2"
        sleep 0.3
        _spawn_tmux -L "$sock" send-keys -t "$sname" Enter
        # a folder-trust prompt may surface once the modal is cleared
        if [ -n "$trust_re" ] && _fleet_pane_wait "$sock" "$sname" "$trust_re" "$trust_timeout" >/dev/null; then
          if [ -n "$trust_keys" ]; then
            # shellcheck disable=SC2086  # word-split key list is the point
            sleep "${FLEET_TRUST_SETTLE:-1.5}"  # TUI draws the prompt before it reads keys
            _spawn_tmux -L "$sock" send-keys -t "$sname" ${trust_keys//,/ }
          fi
        fi
        ;;
      *)
        if [ -n "$trust_keys" ]; then
          # shellcheck disable=SC2086  # word-split key list is the point
          # The TUI draws the prompt before it reads input; keys sent on first
          # sight were lost live (2026-10-12) and the prompt sat until the
          # banner timeout. FLEET_TRUST_SETTLE (seconds) tunes the wait.
          sleep "${FLEET_TRUST_SETTLE:-1.5}"
          _spawn_tmux -L "$sock" send-keys -t "$sname" ${trust_keys//,/ }
        fi
        ;;
    esac
  fi

  if [ -n "$banner_re" ]; then
    banner_line=$(_fleet_pane_wait "$sock" "$sname" "$banner_re" "$banner_timeout" || true)
  fi
  if [ -z "$banner_line" ]; then
    echo "spawn: $sname: no banner match within ${banner_timeout}s (regex: $banner_re); last pane lines:" >&2
    _spawn_tmux -L "$sock" capture-pane -p -t "$sname" 2>/dev/null | tail -n 10 >&2
    return 1
  fi
  printf '%s\n' "$banner_line"
}

# --- Host (remote worker) spawns: lib/spawn-remote.sh (sourced above) ------

# --- Mailbox (stage 5): every worker talks to the master through the mailbox --
# _spawn_mailbox_prepare WS: sets _SPAWN_MB_NAME (worker address name),
# _SPAWN_MB_MASTER (master address) and _SPAWN_MB_SECRET (the run's coordinator
# secret file) in the caller's scope, and claims the master role name for the
# session running spawn. All three stay empty when the mailbox is off for the
# run or not configured on this machine: the worker then reports through
# roster files only (said once, as a WARN). Never prints the secret.
_spawn_mailbox_prepare(){
  local ws="$1" project owner master_name out rc
  _SPAWN_MB_NAME="" _SPAWN_MB_MASTER="" _SPAWN_MB_SECRET=""
  _fleet_mb_enabled || return 0
  project=$(_fleet_mb_project)
  if ! owner=$(_fleet_mb_owner); then
    echo "WARN spawn: the mailbox is not configured on this machine (mailbox.sh whoami failed); $ws reports through roster files only" >&2
    return 0
  fi
  master_name=$(fleet_master_mail_name "$project")
  _SPAWN_MB_NAME=$(fleet_mail_name "$project" "$ws")
  _SPAWN_MB_MASTER="$owner/s/$master_name"
  _SPAWN_MB_SECRET=$(_fleet_coord_secret_file)
  if [ -n "${MAILBOX_SESSION_ID:-}${CLAUDE_CODE_SESSION_ID:-}" ]; then
    rc=0
    out=$(_fleet_mb claim "$master_name" 2>&1) || rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "mailbox: master address $_SPAWN_MB_MASTER (claimed by this session)"
    else
      echo "WARN spawn: could not claim $_SPAWN_MB_MASTER for this session: ${out##*mailbox: }" >&2
    fi
  else
    echo "mailbox: master address $_SPAWN_MB_MASTER (claim it from the master session: mailbox.sh claim $master_name)"
  fi
  return 0
}

# _spawn_mb_exports SESSION_NAME COORD_FILE OUTQ: the pane's mailbox env as one
# shell segment ("export ...; "), %q-quoted. Empty when the mailbox is off.
_spawn_mb_exports(){
  [ -n "$_SPAWN_MB_NAME" ] || return 0
  printf 'export MAILBOX_SESSION=%q MAILBOX_COORD_FILE=%q MAILBOX_COORD_FROM=%q MAILBOX_OUTQ=%q FLEET_MASTER_MAIL=%q FLEET_WS=%q; ' \
    "$1" "$2" "$_SPAWN_MB_MASTER" "$3" "$_SPAWN_MB_MASTER" "$_SPAWN_MB_WS"
}

# _fleet_spawn_relay: copy stdin to stdout; once stdout is gone, keep
# draining into /dev/null so the writer never sees a failed write.
_fleet_spawn_relay(){
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    printf '%s\n' "$line" 2>/dev/null || exec >/dev/null
  done
}

main() {
  # A reader that stops early (`fleet spawn WSxx 2>&1 | head -1`) used to kill
  # spawn with SIGPIPE on its next write, before the brief prompt was sent, so
  # the worker sat idle (MDTWII, 2026-10-12). Ignore SIGPIPE and route both
  # streams through relays that swallow write failures: output may be lost,
  # the launch is not.
  trap '' PIPE
  exec > >(_fleet_spawn_relay) 2> >(_fleet_spawn_relay >&2)
  local ws="" spares=0 no_tmux=0 dry_run=0 engine="" host=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --spares)
        [ $# -ge 2 ] || fleet_die 64 "spawn: --spares needs a number"
        spares="$2"; shift 2 ;;
      --engine)
        [ $# -ge 2 ] || fleet_die 64 "spawn: --engine needs a value"
        engine="$2"; shift 2 ;;
      --engine=*) engine="${1#--engine=}"; shift ;;
      --host)
        [ $# -ge 2 ] || fleet_die 64 "spawn: --host needs an ssh alias"
        host="$2"; shift 2 ;;
      --host=*) host="${1#--host=}"; shift ;;
      --no-tmux) no_tmux=1; shift ;;
      --dry-run) dry_run=1; shift ;;
      -*)
        fleet_die 64 "spawn: unknown option $1" ;;
      *)
        [ -z "$ws" ] || fleet_die 64 "spawn: unexpected argument $1"
        ws="$1"; shift ;;
    esac
  done
  [ -n "$ws" ] || fleet_die 64 "usage: fleet spawn WSxx [--spares N] [--engine e] [--host H] [--no-tmux] [--dry-run]"
  [[ "$spares" =~ ^[0-9]+$ ]] || fleet_die 64 "spawn: --spares expects a number"

  local run_dir
  run_dir=$(fleet_run_dir)
  roster_exists "$ws" || fleet_die 65 "spawn: $ws not in roster (fleet add first)"
  local brief="$run_dir/briefs/$ws.md"
  [ -f "$brief" ] || fleet_die 65 "spawn: missing brief $brief (write briefs/$ws.md first)"

  local name
  name=$(roster_get "$ws" name)
  [ -n "$name" ] || name="${ws,,}"

  local repo
  repo=$(git rev-parse --show-toplevel 2>/dev/null) \
    || fleet_die 64 "spawn: not inside a git repo (run from the target project)"

  # 1. Resolve engine: --engine flag > roster column > default.
  if [ -z "$engine" ]; then
    engine=$(fleet_ws_engine "$ws" 2>/dev/null || true)
  fi
  if [ -z "$engine" ]; then
    engine=$(fleet_engine_default 2>/dev/null || true)
  fi
  [ -n "$engine" ] || engine="claude-sub"
  # Membership via whole-line case, not `grep -q |`: grep -q exits early and
  # SIGPIPEs the producer, which pipefail turns into a false negative.
  local known
  known=$(fleet_engine_list 2>/dev/null || true)
  case $'\n'"$known"$'\n' in
    *$'\n'"$engine"$'\n'*) : ;;
    *) fleet_die 65 "spawn: unknown engine '$engine' (have: $(printf '%s' "$known" | tr '\n' ' '))" ;;
  esac

  # Engine fields (raw, no $SOURCE_VAR resolution here). The registry has no
  # trust_regex field (D's contract is additive-only), so the folder-trust
  # prompt text is derived from the engine bin here; move it into the registry
  # as a trust_regex column if an engine ever needs a custom one.
  # `|| exit "$?"`: fleet_die inside a command substitution cannot abort this
  # shell when errexit is suppressed (the caller's || context), so the exit is
  # explicit; the die message is already on stderr.
  local bin args_str set_raw unset_raw trust_re trust_keys banner_re
  bin=$(fleet_engine_get bin "$engine") || exit "$?"
  args_str=$(fleet_engine_get args "$engine") || exit "$?"
  set_raw=$(fleet_engine_get set "$engine") || exit "$?"
  unset_raw=$(fleet_engine_get unset "$engine") || exit "$?"
  trust_keys=$(fleet_engine_get trust_keys "$engine") || exit "$?"
  banner_re=$(fleet_engine_get banner_regex "$engine") || exit "$?"
  # The prompt text follows the engine, not the launcher: a zai-fence.sh
  # wrapper bin runs the program named by the first word of args.
  local bin_kind
  bin_kind=$(basename "$bin")
  [ "$bin_kind" = "zai-fence.sh" ] && bin_kind=$(basename "${args_str%% *}")
  case "$bin_kind" in
    claude) trust_re="Do you trust the files in this folder|Yes, I trust this folder" ;;
    codex)  trust_re="trust this folder|work in this folder" ;;
    *)      trust_re="" ;;
  esac

  local session_cwd="$repo" wt_path branch="fleet/$ws"
  wt_path=$(fleet_worktree_path "$repo" "$ws")

  local worktree=0
  [ "$(fleet_env_get FLEET_WORKTREE)" = "on" ] && worktree=1
  [ "$worktree" -eq 1 ] && session_cwd="$wt_path"

  # Host rows: a roster host column makes a respawn go to the same host.
  [ -n "$host" ] || host=$(roster_get "$ws" host 2>/dev/null || true)
  if [ -n "$host" ]; then
    fleet_valid_host "$host" && [[ "$host" != -* ]] \
      || fleet_die 64 "spawn: invalid host alias '$host' (letters, digits, dot, dash, underscore; no leading dash)"
    case "$engine" in
      claude-*) : ;;
      *) fleet_die 64 "spawn: --host runs claude engines only (claude-*); engine '$engine' keeps its token or login on the Mac" ;;
    esac
    [ "$no_tmux" -eq 0 ] || fleet_die 64 "spawn: --host cannot be combined with --no-tmux"
    [ "$spares" -eq 0 ] || fleet_die 64 "spawn: --spares is not supported with --host"
    [ -n "$(roster_get "$ws" claims)" ] \
      || fleet_die 65 "spawn: $ws has no claims; a host worker could never commit (fleet claim first)"
  fi

  if [ "$dry_run" -eq 1 ] && [ -n "$host" ]; then
    local pj rn gr
    pj=$(fleet_project_name "$repo"); rn=$(basename "$run_dir")
    gr=$(fleet_env_get FLEET_HOST_REMOTE); gr="${gr:-$host}"
    _spawn_remote_limits
    echo "PLAN spawn $ws name=$name cwd=~/fleet-repos/$pj-wt/${ws,,} brief=$brief"
    echo "PLAN engine $ws engine=$engine bin=$bin set=$(_fleet_set_names "$set_raw") unset=$(_fleet_set_names "$unset_raw")"
    echo "PLAN host $ws host=$host git_remote=$gr remote_wt=~/fleet-repos/$pj-wt/${ws,,} outbox=~/fleet-runs/$pj/$rn/$ws branch=$branch base=fleet-base/$ws"
    echo "PLAN fence $ws sandbox=bwrap (refuses without it unless FLEET_REMOTE_UNSANDBOXED=1) scope=MemoryMax=$_SPAWN_REMOTE_MEM,CPUQuota=$_SPAWN_REMOTE_CPU"
    return 0
  fi

  if [ "$dry_run" -eq 1 ]; then
    echo "PLAN spawn $ws name=$name cwd=$session_cwd brief=$brief"
    echo "PLAN engine $ws engine=$engine bin=$bin set=$(_fleet_set_names "$set_raw") unset=$(_fleet_set_names "$unset_raw")"
    if [ "$worktree" -eq 1 ]; then
      echo "PLAN worktree $ws path=$wt_path branch=$branch"
    fi
    local k
    for ((k = 1; k <= spares; k++)); do
      echo "PLAN spare $name-spare$k cwd=$session_cwd"
    done
    return 0
  fi

  # Guard rails (real spawns only; --dry-run already returned). Both this and
  # the resolution below are exit-66 paths that run before ANY side effect.
  if [ "$bin" = "codex" ]; then
    if [ -n "${OPENAI_API_KEY:-}" ]; then
      case ",$unset_raw," in
        *,OPENAI_API_KEY,*) : ;;  # covered: the pane command unsets it
        *) fleet_die 66 "spawn: OPENAI_API_KEY is set in the master env but engine '$engine' does not unset it (a set key silently bills the API instead of the ChatGPT plan; add OPENAI_API_KEY to the engine unset list or unset it before spawn)" ;;
      esac
    fi
    _fleet_codex_flag_check "$repo"
    _fleet_codex_auth_warn
  fi
  if [ "$engine" = "claude-sub" ]; then
    _fleet_claude_repo_settings_warn "$repo" "$session_cwd"
  fi

  # Resolve every $SOURCE_VAR now: 66 leaves the roster pending and never
  # touches tmux or the worktree (engines.sh names the missing var). The
  # explicit `|| exit` is load-bearing: a fleet_die inside the substitution
  # cannot abort this shell when errexit is suppressed by the caller.
  local _SPAWN_SET_LINES=""
  if [ "$no_tmux" -eq 0 ]; then
    _SPAWN_SET_LINES=$(fleet_engine_resolve_set "$engine") || exit "$?"
  fi

  # Everything above is validation; from here the launch is real. Mark the
  # row spawning (and record the host) before any server or tmux work.
  [ "$no_tmux" -eq 1 ] || _spawn_begin "$ws" "$run_dir" "$host"

  # Mailbox names, the run's coordinator secret and the master's role name
  # (dynamic scope: the remote path reads these too).
  local _SPAWN_MB_NAME="" _SPAWN_MB_MASTER="" _SPAWN_MB_SECRET="" _SPAWN_MB_WS="$ws"
  _spawn_mailbox_prepare "$ws"

  if [ -n "$host" ]; then
    local _SPAWN_SET_LINES=""
    _SPAWN_SET_LINES=$(fleet_engine_resolve_set "$engine") || exit "$?"
    _spawn_remote "$ws" "$name" "$host" "$engine" "$bin" "$args_str" "$unset_raw" \
      "$trust_re" "$trust_keys" "$banner_re" "$repo" "$run_dir" "$brief"
    return $?
  fi

  if [ "$worktree" -eq 1 ]; then
    if ! git -C "$repo" worktree list --porcelain | grep -qxF "worktree $wt_path"; then
      if git -C "$repo" show-ref --verify --quiet "refs/heads/$branch"; then
        git -C "$repo" worktree add "$wt_path" "$branch" >/dev/null
      else
        git -C "$repo" worktree add "$wt_path" -b "$branch" >/dev/null
      fi
    fi
  fi

  # The pane command: one line, exec so the pane dies with the engine.
  # @@MBX@@ becomes each session's own mailbox env (_spawn_mb_exports): the main
  # session and every spare get distinct names, so a spare never reads the
  # worker's mail.
  local pane_cmd="@@SPAWN_ENV@@export FLEET_RUN_DIR=$run_dir"
  [ -n "$unset_raw" ] && pane_cmd+="; unset ${unset_raw//,/ }"
  pane_cmd+="; @@MBX@@exec $bin${args_str:+ $args_str}"
  local mb_outq="$run_dir/mail-out/$ws"
  if [ -n "$_SPAWN_MB_NAME" ]; then
    ( umask 077; mkdir -p "$mb_outq" ) && chmod 700 "$mb_outq" \
      || fleet_die 71 "spawn: cannot create the worker mail queue $mb_outq"
    # Runtime queue inside the (tracked) run dir: keep it out of git.
    [ -f "$run_dir/mail-out/.gitignore" ] || printf '*\n' > "$run_dir/mail-out/.gitignore"
  fi

  # The brief owns the coordination rules: "roster files only" here once
  # overrode briefs that require a SendMessage on handoff (MDTWII, 2026-10-13).
  local prompt_line="read $brief and start; coordinate as the brief says (roster files unless it asks for messages)"
  local trust_timeout banner_timeout sock k sname banner_line
  trust_timeout=$(_fleet_env_seconds FLEET_TRUST_TIMEOUT 15)
  banner_timeout=$(_fleet_env_seconds FLEET_BANNER_TIMEOUT 20)
  sock=$(_fleet_spawn_socket)

  if [ "$no_tmux" -eq 1 ]; then
    # Print the exact lines to paste. Literal values may ride -e; secret
    # ($SOURCE_VAR) values never print and never go on argv: the pane reads
    # them with a silent prompt.
    local line set_flags
    set_flags=$(cfn_spawn_env_literal_flags "$set_raw")
    pane_cmd="${pane_cmd/@@SPAWN_ENV@@/"$(cfn_spawn_env_secret_prompt "$set_raw")"}"
    cfn_spawn_env_secret_notes "$set_raw"
    line="tmux -L $sock new-session -d -s $name -c $session_cwd$set_flags"
    echo "$line"
    echo "tmux -L $sock send-keys -t $name -l \"${pane_cmd/@@MBX@@/"$(_spawn_mb_exports "$_SPAWN_MB_NAME" "$_SPAWN_MB_SECRET" "$mb_outq")"}\""
    echo "tmux -L $sock send-keys -t $name Enter"
    [ -n "$trust_re" ] && echo "# if the trust prompt appears: tmux -L $sock send-keys -t $name ${trust_keys//,/ }"
    echo "# after the banner shows (/$banner_re/):"
    echo "tmux -L $sock send-keys -t $name -l \"$prompt_line\""
    echo "tmux -L $sock send-keys -t $name Enter"
    for ((k = 1; k <= spares; k++)); do
      sname="$name-spare$k"
      echo "tmux -L $sock new-session -d -s $sname -c $session_cwd$set_flags"
      echo "tmux -L $sock send-keys -t $sname -l \"${pane_cmd/@@MBX@@/"$(_spawn_mb_exports "$_SPAWN_MB_NAME-spare$k" "$_SPAWN_MB_SECRET" "$mb_outq")"}\""
      echo "tmux -L $sock send-keys -t $sname Enter"
    done
    roster_set "$ws" status started
    roster_set "$ws" heartbeat "$(date +%s)"
    ( roster_get "$ws" engine >/dev/null 2>&1 ) && roster_set "$ws" engine "$engine"
    echo "spawn $ws: status=started engine=$engine${spares:+, spares=$spares} (paste the commands above; confirm the banner before sending the prompt line)"
    return 0
  fi

  command -v tmux >/dev/null 2>&1 \
    || fleet_die 66 "spawn: tmux not available (use --no-tmux for copy-paste commands)"

  # Activity-gated heartbeat ticker (before anything more is composed): the
  # ws id is user-typed (roster cell) and gets baked unquoted into the pane
  # shell string below, so validate it first. Then resolve the knob:
  # FLEET_TICK_SECS env > fleet.env > 30s; `off`/0 disables the ticker;
  # non-numeric garbage is treated as off with a stderr warning.
  [[ "$ws" =~ ^[A-Za-z0-9._-]+$ ]] \
    || fleet_die 64 "spawn: invalid workstream id '$ws' (allowed: letters, digits, dot, dash, underscore; the id is baked unquoted into the pane shell string)"
  local tick_secs tick=""
  tick_secs="${FLEET_TICK_SECS:-$(fleet_env_get FLEET_TICK_SECS)}"
  tick_secs="${tick_secs:-30}"
  case "$tick_secs" in
    off|0) : ;;
    *[!0-9]*)
      echo "WARN spawn: FLEET_TICK_SECS='$tick_secs' is not a number or 'off'; heartbeat ticker disabled" >&2 ;;
    *) tick="$tick_secs" ;;
  esac
  if [ -n "$tick" ]; then
    # Splice the sidecar in front of the export/exec segment: the backgrounded
    # compound survives the engine exec as a reparented child and dies with
    # the pane. Alt-screen TUIs (vim, less) hide real activity from
    # capture-pane, so such panes degrade to wall-clock beating; accepted
    # (wedge detection is lost for those panes only). Spares reuse this same
    # string, so their copies watch the main pane and stamp the same ws row.
    local tick_lib tick_cli autosave
    tick_lib=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
    tick_cli="$tick_lib/../cli/fleet"
    # Autosave interval rides the ticker (heartbeat-ticker.sh documents the
    # snapshot layout and restore): FLEET_AUTOSAVE_SECS env > fleet.env >
    # 1200; `off`/0 disables. Baked unquoted, so only digits or `off` pass.
    autosave="${FLEET_AUTOSAVE_SECS:-$(fleet_env_get FLEET_AUTOSAVE_SECS)}"
    autosave="${autosave:-1200}"
    case "$autosave" in
      off|0) autosave=off ;;
      *[!0-9]*)
        echo "WARN spawn: FLEET_AUTOSAVE_SECS='$autosave' is not a number or 'off'; autosave disabled" >&2
        autosave=off ;;
    esac
    pane_cmd="source $tick_lib/heartbeat-ticker.sh >/dev/null 2>&1 && FLEET_AUTOSAVE_SECS=$autosave FLEET_RUN_DIR=$run_dir FLEET_TICK_FLEET_CLI=$tick_cli _fleet_tick_loop $sock $name $ws $tick_cli $run_dir $tick >/dev/null 2>&1 & $pane_cmd"
  fi

  # Warn-only check of the dedicated server's global env.
  _fleet_tmux_server_warn "$sock"

  # 4-7. Main session: launch, trust, banner, roster write, then the prompt.
  banner_line=$(_spawn_launch_one "$sock" "$name" "$session_cwd" \
    "${pane_cmd/@@MBX@@/"$(_spawn_mb_exports "$_SPAWN_MB_NAME" "$_SPAWN_MB_SECRET" "$mb_outq")"}" \
    "$trust_re" "$trust_keys" "$trust_timeout" "$banner_re" "$banner_timeout") \
    || fleet_die 66 "spawn: $name left pending (launch failed or engine '$engine' never showed its banner; a worker on the wrong model must not reach started)"
  roster_set "$ws" status started
  _spawn_commit
  roster_set "$ws" heartbeat "$(date +%s)"
  ( roster_get "$ws" engine >/dev/null 2>&1 ) && roster_set "$ws" engine "$engine"
  echo "spawned $ws engine=$engine banner=\"$banner_line\""

  # 8. Thin prompt only after the banner.
  tmux -L "$sock" send-keys -t "$name" -l "$prompt_line"
  tmux -L "$sock" send-keys -t "$name" Enter

  # 8b. Auth check after the first request. A relay token that the banner
  # cannot see (the banner renders before any API call) surfaces here as
  # "401 Authentication Failed ... Retrying". Measured 2026-09-09: two glm
  # workers reached started on an expired z.ai token and sat in retry loops.
  # Warn loudly; the row is already started, the master decides.
  if _fleet_pane_wait "$sock" "$name" '401 Authentication Failed|Authentication Failed|invalid_api_key|authentication_error' "$(_fleet_env_seconds FLEET_AUTH_TIMEOUT 12)" >/dev/null; then
    echo "spawn: WARNING $name: engine reports an authentication failure after the first request (token for engine '$engine' rejected). Fix the source var and respawn." >&2
  fi

  # 9. Spares: same engine/env, launched to the banner, NO prompt.
  for ((k = 1; k <= spares; k++)); do
    sname="$name-spare$k"
    banner_line=$(_spawn_launch_one "$sock" "$sname" "$session_cwd" \
      "${pane_cmd/@@MBX@@/"$(_spawn_mb_exports "$_SPAWN_MB_NAME-spare$k" "$_SPAWN_MB_SECRET" "$mb_outq")"}" \
      "$trust_re" "$trust_keys" "$trust_timeout" "$banner_re" "$banner_timeout") \
      || fleet_die 66 "spawn: spare $sname failed (launch failed or engine '$engine' never showed its banner)"
    echo "spawned $sname engine=$engine banner=\"$banner_line\""
  done

  # Operator pointer to the dashboard (helpers live in lib/common.sh). The
  # port resolution is pure (flag > env > fleet.env > 4880): nothing here
  # binds a port. "live" vs the start hint depends only on the dashboard
  # server's pidfile, never on this command.
  local dash_port
  dash_port=$(_fleet_dash_port "")
  if _fleet_dash_serve_is_serving "$run_dir"; then
    echo "dashboard live: http://127.0.0.1:$dash_port/dashboard.html"
  else
    echo "dashboard: http://127.0.0.1:$dash_port/dashboard.html (start: fleet dashboard --open)"
  fi
  return 0
}
