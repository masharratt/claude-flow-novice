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
# --host H runs the worker on server H (claude engines only): see the Host
# spawns block below; local spawns never reach it.
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

# --- Host (remote worker) spawns ---------------------------------------------
# cfn: this block is a second responsibility in a file past the size ceiling;
# split it into lib/spawn-remote.sh when the next remote feature lands.
#
# Server layout (all under the server's $HOME, set up by `fleet host-setup`):
#   ~/git/<project>.git           bare repo; the Mac pushes fleet-base/<WS> here
#   ~/fleet-repos/<project>       fleet clone of the bare repo (origin = bare)
#   ~/fleet-repos/<project>-wt/<ws>   worker worktree on branch fleet/<WS>
#   ~/fleet-runs/<project>/<run>/<WS>/  outbox: brief, claims, outbox.env,
#                                 remote-worker.sh, reports/
# Server scripts run as `bash -c SCRIPT _ ARGS...`: host.sh %q-quotes each word,
# so ~ and $HOME only expand inside the script, never in an argument.

# Preflight, args: clone bare wt base_ref. Prints facts; the Mac decides.
_SPAWN_REMOTE_PREFLIGHT='
clone="$1"; bare="$2"; wt="$3"; baseref="$4"
if [ ! -d "$clone/.git" ]; then
  echo NOCLONE
else
  for r in $(git -C "$clone" remote); do
    echo "REMOTE $r $(git -C "$clone" remote get-url "$r" 2>/dev/null)"
  done
fi
[ -d "$wt" ] && echo WT_EXISTS
git --git-dir="$bare" rev-parse --verify -q "refs/heads/$baseref" >/dev/null 2>&1 && echo BASE_EXISTS
for d in "$HOME/claude-flow-novice-src" "$HOME/Projects/claude-flow-novice-src" "$HOME/fleet-repos/claude-flow-novice-src"; do
  if [ -d "$d/.git" ]; then echo "CFN_COMMIT $(git -C "$d" rev-parse HEAD 2>/dev/null)"; break; fi
done
exit 0
'

# Prepare, args: clone wt branch base_ref links_csv project outbox. Fetches the
# pushed base, adds the worktree, links the user-checkout paths (git-ignored via
# the clone exclude so they never dirty the worktree), makes the 0700 outbox.
# Prints WT_NEW / BRANCH_NEW / OUTBOX_NEW so a failed spawn can undo exactly
# what it made, plus LINKED / MISSING_LINK / BAD_LINK per link.
_SPAWN_REMOTE_PREPARE='
clone="$1"; wt="$2"; branch="$3"; baseref="$4"; links="$5"; project="$6"; ob="$7"
git -C "$clone" worktree prune >/dev/null 2>&1
git -C "$clone" fetch -q origin || { echo "ERR fetch from the bare repo failed"; exit 70; }
if [ -d "$wt" ]; then
  echo WT_REUSED
else
  mkdir -p "$(dirname "$wt")" || exit 71
  if git -C "$clone" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$clone" worktree add -q "$wt" "$branch" || { echo "ERR worktree add failed"; exit 71; }
  else
    git -C "$clone" worktree add -q -b "$branch" "$wt" "origin/$baseref" \
      || { echo "ERR worktree add failed (is $baseref pushed?)"; exit 71; }
    echo BRANCH_NEW
  fi
  echo WT_NEW
fi
exclude="$clone/.git/info/exclude"
IFS=, read -ra L <<< "$links"
for p in "${L[@]}"; do
  p="${p// /}"
  [ -n "$p" ] || continue
  case "$p" in /*|*..*|*[!A-Za-z0-9._/-]*) echo "BAD_LINK $p"; continue ;; esac
  src="$HOME/Projects/$project/$p"
  if [ ! -e "$src" ]; then echo "MISSING_LINK $p"; continue; fi
  if [ -e "$wt/$p" ] || [ -L "$wt/$p" ]; then continue; fi
  mkdir -p "$(dirname "$wt/$p")" && ln -s "$src" "$wt/$p" || continue
  grep -qxF "/$p" "$exclude" 2>/dev/null || echo "/$p" >> "$exclude"
  echo "LINKED $p"
done
[ -e "$ob" ] || echo OUTBOX_NEW
( umask 077; mkdir -p "$ob" ) && chmod 700 "$ob" || { echo "ERR outbox not created"; exit 71; }
exit 0
'

# Undo, args: clone wt branch wt_new branch_new outbox outbox_new. Removes only
# what this spawn created, so a respawn never loses the worker'"'"'s work.
_SPAWN_REMOTE_UNDO='
clone="$1"; wt="$2"; branch="$3"; wt_new="$4"; branch_new="$5"; ob="$6"; ob_new="$7"
if [ "$wt_new" = 1 ]; then
  git -C "$clone" worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"
  git -C "$clone" worktree prune >/dev/null 2>&1
fi
[ "$branch_new" = 1 ] && git -C "$clone" branch -D "$branch" >/dev/null 2>&1
if [ "$ob_new" = 1 ]; then
  case "$ob" in "$HOME"/fleet-runs/?*) rm -rf "$ob" ;; esac
fi
exit 0
'

# _spawn_remote_brief TEMPLATE PROJECT RUN WS CLAIMS MIGRATION MASTER_BRIEF
# -> the shipped brief on stdout: the BRIEF_REMOTE.md template with its
# placeholders filled, then the master's brief (task, allowed commands, done
# criteria) appended.
_spawn_remote_brief(){
  local tpl="$1" project="$2" run="$3" ws="$4" claims="$5" mig="$6" master="$7" t lc
  # bash 5.2 treats & in a replacement as the match; claims may contain one.
  shopt -u patsub_replacement 2>/dev/null || true
  lc=$(printf '%s' "$ws" | tr '[:upper:]' '[:lower:]')
  t=$(cat "$tpl")
  t=${t//'<project>'/$project}
  t=${t//'<run>'/$run}
  t=${t//'<ws>'/$lc}
  t=${t//'WSxx'/$ws}
  t=${t//'<reserved migration number or none>'/${mig:-none}}
  t=${t//'<path1> <path2> ...'/$claims}
  t=${t//"<one-paragraph statement of the workstream's task>"/"The task is in the master brief at the end of this file."}
  t=${t//'<the commands this workstream may run, e.g. test runner, linter>'/"Scoped tests and type checks for your claims, as the master brief lists."}
  t=${t//'<verifiable condition 1>'/"Every done criterion in the master brief below is met"}
  t=${t//'<verifiable condition 2>'/"Nothing outside your claims was changed"}
  printf '%s\n\n---\n\n# Master brief\n\n' "$t"
  cat "$master"
}

# _spawn_remote_claims ROSTER_CLAIMS -> one claim per line (commas or spaces).
_spawn_remote_claims(){
  printf '%s' "$1" | tr ', \t' '\n\n\n\n' | sed '/^$/d'
}

# _spawn_remote_ship_launch ... — everything after the remote worktree exists:
# build and ship the kit, launch on the host, then record the spawn. Returns 1
# (message on stderr) on any failure; the caller undoes the remote setup.
# Sets session_up=1 (caller's local) once a tmux session may exist.
_spawn_remote_ship_launch(){
  local ws="$1" name="$2" host="$3" engine="$4" bin="$5" args_str="$6" unset_raw="$7"
  local trust_re="$8" trust_keys="$9" banner_re="${10}" run_dir="${11}" brief="${12}" kit="${13}"
  local project="${14}" run="${15}" wt="${16}" ob="${17}" sock="${18}" gitremote="${19}"
  local tpl_dir gen claims_sp mig remote_launch pane_cmd line

  tpl_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../templates" && pwd)"
  gen=$(od -An -tx1 -N8 /dev/urandom | tr -d ' \n')
  [ -n "$gen" ] || { echo "spawn: could not make a generation id" >&2; return 1; }
  claims_sp=$(_spawn_remote_claims "$(roster_get "$ws" claims)" | tr '\n' ' ')
  claims_sp="${claims_sp% }"
  mig=$(roster_get "$ws" migration_num 2>/dev/null || true)

  _spawn_remote_claims "$(roster_get "$ws" claims)" > "$kit/claims.txt" || return 1
  _spawn_remote_brief "$tpl_dir/BRIEF_REMOTE.md" "$project" "$run" "$ws" "$claims_sp" "$mig" "$brief" > "$kit/brief.md" || return 1
  {
    printf 'FLEET_WS=%q\n' "$ws"
    printf 'FLEET_GEN=%q\n' "$gen"
    printf 'FLEET_OUTBOX=%q\n' "$ob"
    printf 'FLEET_BRANCH=%q\n' "fleet/$ws"
    printf 'FLEET_PUSH_REMOTE=origin\n'
  } > "$kit/outbox.env" || return 1

  # Launch script: same private env script the local path types, but it lives
  # in the 0700 outbox on the server and deletes itself there.
  remote_launch="$ob/.launch-$name"
  pane_cmd=""
  [ -z "$unset_raw" ] || pane_cmd="unset ${unset_raw//,/ }; "
  pane_cmd+="exec $bin${args_str:+ $args_str}"
  cfn_spawn_launch_write "${_SPAWN_SET_LINES:-}" "$pane_cmd" \
    || { echo "spawn: could not write the private launch script for $name" >&2; return 1; }
  (
    umask 077
    swapped=0
    while IFS= read -r line || [ -n "$line" ]; do
      if [ "$line" = "rm -rf '$CFN_SPAWN_ENV_DIR'" ]; then
        printf "rm -f '%s'\n" "$remote_launch"
        swapped=1
      else
        printf '%s\n' "$line"
      fi
    done < "$CFN_SPAWN_ENV_DIR/launch" > "$kit/.launch-$name"
    [ "$swapped" -eq 1 ]
  ) || { echo "spawn: launch script rewrite for the host failed" >&2; return 1; }

  local scp_opts=(-q -o BatchMode=yes -o ConnectTimeout=10)
  scp "${scp_opts[@]}" -- "$kit/brief.md" "$kit/claims.txt" "$kit/outbox.env" \
      "$tpl_dir/remote-worker.sh" "$host:$ob/" \
    || { echo "spawn: scp of the outbox kit to $host failed" >&2; return 1; }
  scp "${scp_opts[@]}" -- "$kit/.launch-$name" "$host:$remote_launch" \
    || { echo "spawn: scp of the launch script to $host failed" >&2; return 1; }
  _fleet_host_run "$host" bash -c 'chmod 700 "$1" && chmod 600 "$2" "$3" "$4" "$5"' _ \
      "$ob/remote-worker.sh" "$ob/brief.md" "$ob/claims.txt" "$ob/outbox.env" "$remote_launch" \
    || { echo "spawn: could not set modes on the outbox kit at $host" >&2; return 1; }

  local trust_timeout banner_timeout auth_timeout banner_line prompt_line
  trust_timeout=$(_fleet_env_seconds FLEET_TRUST_TIMEOUT 15)
  banner_timeout=$(_fleet_env_seconds FLEET_BANNER_TIMEOUT 20)
  auth_timeout=$(_fleet_env_seconds FLEET_AUTH_TIMEOUT 12)
  # Dynamic scope for _spawn_launch_one / _spawn_tmux.
  local _SPAWN_HOST="$host" _SPAWN_REMOTE_LAUNCH_LINE=". '$remote_launch'"
  session_up=1
  banner_line=$(_spawn_launch_one "$sock" "$name" "$wt" "$pane_cmd" "$trust_re" "$trust_keys" \
    "$trust_timeout" "$banner_re" "$banner_timeout") || return 1

  # remote/<WS>.env: the contract fleet sync and land read. Written only after
  # the banner, so a failed spawn leaves no env file behind.
  local envf="$run_dir/remote/$ws.env" tmpf
  tmpf="$envf.tmp.$$"
  (
    umask 077
    mkdir -p "$run_dir/remote" || exit 1
    {
      printf 'FLEET_HOST=%q\n' "$host"
      printf 'FLEET_GIT_REMOTE=%q\n' "$gitremote"
      printf 'FLEET_PROJECT=%q\n' "$project"
      printf 'FLEET_RUN=%q\n' "$run"
      printf 'FLEET_GEN=%q\n' "$gen"
      printf 'FLEET_REMOTE_WT=%q\n' "$wt"
      printf 'FLEET_OUTBOX=%q\n' "$ob"
      printf 'FLEET_BRANCH=%q\n' "fleet/$ws"
      printf 'FLEET_BASE_REF=%q\n' "fleet-base/$ws"
      printf 'FLEET_SOCK=%q\n' "$sock"
      printf 'FLEET_SESSION=%q\n' "$name"
      printf 'FLEET_SPAWNED_AT=%q\n' "$(date +%s)"
    } > "$tmpf" && chmod 600 "$tmpf" && mv -f "$tmpf" "$envf"
  ) || { rm -f "$tmpf"; echo "spawn: could not write $envf" >&2; return 1; }

  roster_set "$ws" status started
  roster_set "$ws" heartbeat "$(date +%s)"
  roster_set "$ws" host "$host"
  _spawn_commit
  ( roster_get "$ws" engine >/dev/null 2>&1 ) && roster_set "$ws" engine "$engine"
  echo "spawned $ws engine=$engine host=$host banner=\"$banner_line\""

  # Thin prompt only after the banner; the brief on the server owns the rules.
  prompt_line="read $ob/brief.md and start; report to the master only through $ob/remote-worker.sh, as the brief says"
  _spawn_tmux -L "$sock" send-keys -t "$name" -l "$prompt_line"
  _spawn_tmux -L "$sock" send-keys -t "$name" Enter
  if _fleet_pane_wait "$sock" "$name" '401 Authentication Failed|Authentication Failed|invalid_api_key|authentication_error' "$auth_timeout" >/dev/null; then
    echo "spawn: WARNING $name: engine reports an authentication failure after the first request on $host (log in to claude there and respawn)." >&2
  fi
  return 0
}

# _spawn_remote WS NAME HOST ENGINE BIN ARGS UNSET TRUST_RE TRUST_KEYS BANNER_RE
# REPO RUN_DIR BRIEF — the whole --host path: preflight, push base, remote
# worktree, ship, launch. Exits via fleet_die; never leaves a half-made remote
# worktree behind (a respawn's existing worktree is left alone).
_spawn_remote(){
  local ws="$1" name="$2" host="$3" engine="$4" bin="$5" args_str="$6" unset_raw="$7"
  local trust_re="$8" trust_keys="$9" banner_re="${10}" repo="${11}" run_dir="${12}" brief="${13}"
  local project run lc sock gitremote home clone bare wt ob rc=0 out line
  project=$(fleet_project_name "$repo")
  run=$(basename "$run_dir")
  lc=$(printf '%s' "$ws" | tr '[:upper:]' '[:lower:]')
  [[ "$project" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$run" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || fleet_die 64 "spawn: project '$project', run '$run' and session name '$name' must be safe for server paths (letters, digits, dot, dash, underscore)"
  sock=$(_fleet_spawn_socket)
  gitremote=$(fleet_env_get FLEET_HOST_REMOTE)
  gitremote="${gitremote:-$host}"
  [[ "$gitremote" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || fleet_die 64 "spawn: FLEET_HOST_REMOTE '$gitremote' is not a safe git remote name"

  # 1. Server home, once: later steps use absolute paths, never ~ expansion.
  home=$(_fleet_host_run "$host" bash -c 'printf %s "$HOME"') || rc=$?
  if [ "$rc" -ne 0 ] || [ -z "$home" ]; then
    fleet_die 66 "spawn: host $host is unreachable over ssh (rc $rc); $ws left pending"
  fi
  case "$home" in /*) : ;; *) fleet_die 66 "spawn: host $host reported an odd home directory '$home'; $ws left pending" ;; esac
  clone="$home/fleet-repos/$project"
  bare="$home/git/$project.git"
  wt="$home/fleet-repos/$project-wt/$lc"
  ob="$home/fleet-runs/$project/$run/$ws"

  # 2. Preflight (read-only on the server).
  rc=0
  out=$(_fleet_host_run "$host" bash -c "$_SPAWN_REMOTE_PREFLIGHT" _ "$clone" "$bare" "$wt" "fleet-base/$ws") || rc=$?
  [ "$rc" -eq 0 ] || fleet_die 66 "spawn: host $host is unreachable over ssh (rc $rc); $ws left pending"
  local wt_exists=0 base_exists=0 srv_commit=""
  while IFS= read -r line; do
    case "$line" in
      NOCLONE)
        fleet_die 66 "spawn: no fleet clone at ~/fleet-repos/$project on $host; run: fleet host-setup $host" ;;
      "REMOTE "*)
        local rname rurl
        rname=$(printf '%s' "$line" | awk '{print $2}')
        rurl=$(printf '%s' "$line" | awk '{print $3}')
        [ "$rname" = origin ] \
          || fleet_die 66 "spawn: the fleet clone on $host has a remote named '$rname' ($rurl); it may only have the bare repo as origin. Run: fleet host-setup $host (after removing that remote)"
        case "$rurl" in
          *://*|*@*) fleet_die 66 "spawn: the fleet clone on $host has origin '$rurl', which is not the bare repo ~/git/$project.git; run: fleet host-setup $host" ;;
        esac
        [ "$rurl" = "$bare" ] || [ "${rurl%/git/$project.git}" != "$rurl" ] \
          || fleet_die 66 "spawn: the fleet clone on $host has origin '$rurl', not the bare repo ~/git/$project.git; run: fleet host-setup $host" ;;
      WT_EXISTS) wt_exists=1 ;;
      BASE_EXISTS) base_exists=1 ;;
      "CFN_COMMIT "*) srv_commit="${line#CFN_COMMIT }" ;;
    esac
  done <<< "$out"

  local min_gb free_gb
  min_gb=$(fleet_env_get FLEET_REMOTE_MIN_FREE_GB)
  [[ "$min_gb" =~ ^[0-9]+$ ]] || min_gb=15
  if free_gb=$(_fleet_host_free_gb "$host"); then
    [ "$free_gb" -ge "$min_gb" ] \
      || fleet_die 66 "spawn: host $host has ${free_gb} GiB free disk, below FLEET_REMOTE_MIN_FREE_GB=$min_gb; free space or lower the knob"
  else
    echo "WARN spawn: could not read free disk on $host; continuing" >&2
  fi
  if [ -n "$srv_commit" ]; then
    local mac_commit
    mac_commit=$(git -C "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)" rev-parse HEAD 2>/dev/null || true)
    if [ -n "$mac_commit" ] && [ "$srv_commit" != "$mac_commit" ]; then
      echo "WARN spawn: claude-flow-novice-src on $host (${srv_commit:0:8}) differs from this machine (${mac_commit:0:8})" >&2
    fi
  fi
  # A live session of that name must never be adopted or killed by this spawn.
  rc=0
  _fleet_tmux "$host" -L "$sock" has-session -t "$name" >/dev/null 2>&1 || rc=$?
  [ "$rc" -ne 0 ] || fleet_die 66 "spawn: tmux session '$name' already exists on $host (socket $sock); stop it first"
  [ "$rc" -ne "$_FLEET_SSH_FAIL_RC" ] || fleet_die 66 "spawn: host $host is unreachable over ssh; $ws left pending"

  # 3. Push the base the worker branches from (fleet land fetches it back).
  git -C "$repo" remote get-url "$gitremote" >/dev/null 2>&1 \
    || fleet_die 66 "spawn: this repo has no git remote '$gitremote' for $host; run: fleet host-setup $host"
  if [ "$wt_exists" -eq 0 ] || [ "$base_exists" -eq 0 ]; then
    GIT_TERMINAL_PROMPT=0 git -C "$repo" push -q "$gitremote" "+HEAD:refs/heads/fleet-base/$ws" \
      || fleet_die 66 "spawn: git push $gitremote HEAD:fleet-base/$ws failed; $ws left pending"
  fi

  # 4. Remote worktree, links, outbox.
  local links wt_new=0 branch_new=0 ob_new=0 session_up=0
  links=$(fleet_env_get FLEET_REMOTE_LINKS)
  rc=0
  out=$(_fleet_host_run "$host" bash -c "$_SPAWN_REMOTE_PREPARE" _ \
    "$clone" "$wt" "fleet/$ws" "fleet-base/$ws" "$links" "$project" "$ob") || rc=$?
  while IFS= read -r line; do
    case "$line" in
      WT_NEW) wt_new=1 ;;
      BRANCH_NEW) branch_new=1 ;;
      OUTBOX_NEW) ob_new=1 ;;
      "MISSING_LINK "*) echo "WARN spawn: link source ${line#MISSING_LINK } is not in ~/Projects/$project on $host; not linked" >&2 ;;
      "BAD_LINK "*) echo "WARN spawn: FLEET_REMOTE_LINKS entry '${line#BAD_LINK }' is not a plain relative path; skipped" >&2 ;;
      "ERR "*) echo "spawn: ${line#ERR }" >&2 ;;
    esac
  done <<< "$out"

  local kit=""
  if [ "$rc" -eq 0 ]; then
    kit=$(umask 077 && mktemp -d "${TMPDIR:-/tmp}/fleet-spawn-kit.XXXXXX") || rc=1
  fi
  if [ "$rc" -eq 0 ]; then
    _spawn_remote_ship_launch "$ws" "$name" "$host" "$engine" "$bin" "$args_str" "$unset_raw" \
      "$trust_re" "$trust_keys" "$banner_re" "$run_dir" "$brief" "$kit" \
      "$project" "$run" "$wt" "$ob" "$sock" "$gitremote" || rc=$?
  fi
  [ -z "$kit" ] || rm -rf "$kit"
  [ -z "${CFN_SPAWN_ENV_DIR:-}" ] || rm -rf "$CFN_SPAWN_ENV_DIR"
  [ "$rc" -eq 0 ] && return 0

  # Failure after partial setup: row stays pending, remote leftovers go.
  [ "$session_up" -eq 0 ] || _fleet_tmux "$host" -L "$sock" kill-session -t "$name" >/dev/null 2>&1 || true
  _fleet_host_run "$host" bash -c "$_SPAWN_REMOTE_UNDO" _ \
      "$clone" "$wt" "fleet/$ws" "$wt_new" "$branch_new" "$ob" "$ob_new" >/dev/null 2>&1 \
    || echo "WARN spawn: could not clean up $wt on $host; remove it by hand" >&2
  fleet_die 66 "spawn: $name left pending (remote setup or launch on $host failed, or engine '$engine' never showed its banner); the half-made remote worktree was removed"
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
    echo "PLAN spawn $ws name=$name cwd=~/fleet-repos/$pj-wt/${ws,,} brief=$brief"
    echo "PLAN engine $ws engine=$engine bin=$bin set=$(_fleet_set_names "$set_raw") unset=$(_fleet_set_names "$unset_raw")"
    echo "PLAN host $ws host=$host git_remote=$gr remote_wt=~/fleet-repos/$pj-wt/${ws,,} outbox=~/fleet-runs/$pj/$rn/$ws branch=$branch base=fleet-base/$ws"
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
  local pane_cmd="@@SPAWN_ENV@@export FLEET_RUN_DIR=$run_dir"
  [ -n "$unset_raw" ] && pane_cmd+="; unset ${unset_raw//,/ }"
  pane_cmd+="; exec $bin${args_str:+ $args_str}"

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
    echo "tmux -L $sock send-keys -t $name -l \"$pane_cmd\""
    echo "tmux -L $sock send-keys -t $name Enter"
    [ -n "$trust_re" ] && echo "# if the trust prompt appears: tmux -L $sock send-keys -t $name ${trust_keys//,/ }"
    echo "# after the banner shows (/$banner_re/):"
    echo "tmux -L $sock send-keys -t $name -l \"$prompt_line\""
    echo "tmux -L $sock send-keys -t $name Enter"
    for ((k = 1; k <= spares; k++)); do
      sname="$name-spare$k"
      echo "tmux -L $sock new-session -d -s $sname -c $session_cwd$set_flags"
      echo "tmux -L $sock send-keys -t $sname -l \"$pane_cmd\""
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
    "$pane_cmd" "$trust_re" "$trust_keys" "$trust_timeout" "$banner_re" "$banner_timeout") \
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
      "$pane_cmd" "$trust_re" "$trust_keys" "$trust_timeout" "$banner_re" "$banner_timeout") \
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
