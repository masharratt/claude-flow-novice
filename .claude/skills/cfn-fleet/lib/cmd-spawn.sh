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
#   fleet spawn WSxx [--spares N] [--engine e] [--no-tmux] [--dry-run]
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
#   4. tmux -L <socket> new-session -d -s <name> -c <cwd> -e K=V ... for every
#      set-var; values reach tmux via argv, never disk
#   5. first pane command, one line: export FLEET_RUN_DIR=<run dir>;
#      unset <unset list>; exec <bin> <args>  (exec so the pane dies with the
#      engine and `tmux has-session` sees it)
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
#      coordinate only via roster files" — never the brief body.
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

# _fleet_no_tmux_set_flags RAW_COMMA_LIST — the ` -e "K=V"` suffix for the
# --no-tmux printout. Items are printed verbatim, so $SOURCE_VAR references
# stay unexpanded and the printed command is safe to paste into a ledger.
_fleet_no_tmux_set_flags(){
  local item out=""
  [ -n "$1" ] || return 0
  while IFS= read -r item || [ -n "$item" ]; do
    [ -n "$item" ] || continue
    out+=" -e \"$item\""
  done < <(printf '%s' "$1" | tr ',' '\n')
  printf '%s' "$out"
}

# _fleet_pane_wait SOCK TARGET REGEX TIMEOUT_S — poll capture-pane until a
# line matches REGEX; echo the (right-trimmed) line, rc 1 on timeout.
_fleet_pane_wait(){
  local sock="$1" tgt="$2" re="$3" timeout="$4" i=0 line
  local max=$((timeout * 5))
  while [ "$i" -lt "$max" ]; do
    line=$(tmux -L "$sock" capture-pane -p -t "$tgt" 2>/dev/null \
      | sed -e 's/\r$//' -e 's/[[:space:]]*$//' -e '/^$/d' \
      | grep -v -E -- 'exec (claude|codex)|--model |send-keys' \
      | grep -E -- "$re" || true)
    line="${line%%$'\n'*}"
    if [ -n "$line" ]; then
      printf '%s\n' "$line"
      return 0
    fi
    sleep 0.2
    i=$((i + 1))
  done
  return 1
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
# TRUST_TIMEOUT BANNER_RE BANNER_TIMEOUT — new-session (env from the global
# _SPAWN_SET_ARGS array), pane command, trust poll, banner poll. Echoes the
# matching banner line, rc 0. On failure prints the diagnostics to stderr and
# returns 1 — the caller owns the fleet_die, because a die inside this
# function could not abort the caller's command substitution under a
# suppressed errexit.
_spawn_launch_one(){
  local sock="$1" sname="$2" session_cwd="$3" pane_cmd="$4" trust_re="$5"
  local trust_keys="$6" trust_timeout="$7" banner_re="$8" banner_timeout="$9"
  local banner_line

  if ! tmux -L "$sock" new-session -d -s "$sname" -c "$session_cwd" \
      ${_SPAWN_SET_ARGS[@]+"${_SPAWN_SET_ARGS[@]}"}; then
    echo "fleet: spawn: tmux new-session failed for $sname (duplicate session? socket: $sock)" >&2
    return 1
  fi
  if ! tmux -L "$sock" send-keys -t "$sname" -l "$pane_cmd"; then
    echo "fleet: spawn: could not reach pane $sname (session died?)" >&2
    return 1
  fi
  tmux -L "$sock" send-keys -t "$sname" Enter

  # Trust prompt: send the keys only if the prompt text actually shows.
  # Registry trust_keys is a comma list ("Down,Enter"); send-keys wants them
  # as separate words.
  if [ -n "$trust_re" ]; then
    if _fleet_pane_wait "$sock" "$sname" "$trust_re" "$trust_timeout" >/dev/null; then
      if [ -n "$trust_keys" ]; then
        # shellcheck disable=SC2086  # word-split key list is the point
        tmux -L "$sock" send-keys -t "$sname" ${trust_keys//,/ }
      fi
    fi
  fi

  if [ -n "$banner_re" ]; then
    banner_line=$(_fleet_pane_wait "$sock" "$sname" "$banner_re" "$banner_timeout" || true)
  fi
  if [ -z "$banner_line" ]; then
    echo "spawn: $sname: no banner match within ${banner_timeout}s (regex: $banner_re); last pane lines:" >&2
    tmux -L "$sock" capture-pane -p -t "$sname" 2>/dev/null | tail -n 10 >&2
    return 1
  fi
  printf '%s\n' "$banner_line"
}

main() {
  local ws="" spares=0 no_tmux=0 dry_run=0 engine=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --spares)
        [ $# -ge 2 ] || fleet_die 64 "spawn: --spares needs a number"
        spares="$2"; shift 2 ;;
      --engine)
        [ $# -ge 2 ] || fleet_die 64 "spawn: --engine needs a value"
        engine="$2"; shift 2 ;;
      --engine=*) engine="${1#--engine=}"; shift ;;
      --no-tmux) no_tmux=1; shift ;;
      --dry-run) dry_run=1; shift ;;
      -*)
        fleet_die 64 "spawn: unknown option $1" ;;
      *)
        [ -z "$ws" ] || fleet_die 64 "spawn: unexpected argument $1"
        ws="$1"; shift ;;
    esac
  done
  [ -n "$ws" ] || fleet_die 64 "usage: fleet spawn WSxx [--spares N] [--engine e] [--no-tmux] [--dry-run]"
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
  case "$bin" in
    claude) trust_re="Do you trust the files in this folder" ;;
    codex)  trust_re="trust this folder|work in this folder" ;;
    *)      trust_re="" ;;
  esac

  local session_cwd="$repo" wt_path="$repo/.claude/worktrees/${ws,,}" branch="fleet/$ws"

  local worktree=0
  [ "$(fleet_env_get FLEET_WORKTREE)" = "on" ] && worktree=1
  [ "$worktree" -eq 1 ] && session_cwd="$wt_path"

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
    _fleet_codex_auth_warn
  fi
  if [ "$engine" = "claude-sub" ]; then
    _fleet_claude_repo_settings_warn "$repo" "$session_cwd"
  fi

  # Resolve every $SOURCE_VAR now: 66 leaves the roster pending and never
  # touches tmux or the worktree (engines.sh names the missing var). The
  # explicit `|| exit` is load-bearing: a fleet_die inside the substitution
  # cannot abort this shell when errexit is suppressed by the caller.
  local -a _SPAWN_SET_ARGS=()
  if [ "$no_tmux" -eq 0 ]; then
    local resolved sv
    resolved=$(fleet_engine_resolve_set "$engine") || exit "$?"
    while IFS= read -r sv; do
      [ -n "$sv" ] || continue
      _SPAWN_SET_ARGS+=(-e "$sv")
    done <<< "$resolved"
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
  local pane_cmd="export FLEET_RUN_DIR=$run_dir"
  [ -n "$unset_raw" ] && pane_cmd+="; unset ${unset_raw//,/ }"
  pane_cmd+="; exec $bin${args_str:+ $args_str}"

  local prompt_line="read $brief and start; coordinate only via roster files"
  local trust_timeout banner_timeout sock k sname banner_line
  trust_timeout=$(_fleet_env_seconds FLEET_TRUST_TIMEOUT 15)
  banner_timeout=$(_fleet_env_seconds FLEET_BANNER_TIMEOUT 20)
  sock=$(_fleet_spawn_socket)

  if [ "$no_tmux" -eq 1 ]; then
    # Print the exact lines to paste; values stay as $SOURCE_VAR references.
    local line set_flags
    set_flags=$(_fleet_no_tmux_set_flags "$set_raw")
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

  # Warn-only check of the dedicated server's global env.
  _fleet_tmux_server_warn "$sock"

  # 4-7. Main session: launch, trust, banner, roster write, then the prompt.
  banner_line=$(_spawn_launch_one "$sock" "$name" "$session_cwd" \
    "$pane_cmd" "$trust_re" "$trust_keys" "$trust_timeout" "$banner_re" "$banner_timeout") \
    || fleet_die 66 "spawn: $name left pending (launch failed or engine '$engine' never showed its banner; a worker on the wrong model must not reach started)"
  roster_set "$ws" status started
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
  if _fleet_pane_wait "$sock" "$name" '401 Authentication Failed|Authentication Failed|invalid_api_key|authentication_error' 12 >/dev/null; then
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
  return 0
}
