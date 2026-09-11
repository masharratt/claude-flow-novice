#!/usr/bin/env bash
# cfn-tmux-agents: launch and drive subagent sessions in tmux without the
# fleet roster. One dedicated tmux socket, one session per agent, prompts
# delivered literally via send-keys. Ported from cfn-fleet spawn mechanics.
#
# Exit codes: 0 ok | 64 usage | 3 tmux missing | 65 unknown engine/session
#             66 env/guard refusal or launch failure | 68 banner timeout

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SKILL_DIR/lib/common.sh"
# shellcheck source=lib/engines.sh
. "$SKILL_DIR/lib/engines.sh"

TA_SOCK=""

_ta_usage() {
  cat <<'EOF'
Usage: execute.sh <command> [options]

Commands:
  spawn NAME [--engine claude|claude-sub|glm|codex] [--model M] [--cwd DIR]
        [--prompt TEXT | --prompt-file PATH] [--dry-run]
        [--bin PATH] [--args STR] [--banner-regex RE]
        [--trust-timeout S] [--banner-timeout S]
        [--socket SOCK]
  send NAME TEXT... [--socket SOCK]
  status [NAME] [--socket SOCK]
  capture NAME [--lines N] [--socket SOCK]
  list [--socket SOCK]
  kill NAME | --all [--socket SOCK]

Engines (default claude-sub):
  claude-sub  claude --model sonnet --permission-mode bypassPermissions
              (unsets ANTHROPIC_* relay vars: subscription billing)
  glm         claude via z.ai (needs TMUX_AGENTS_ZAI_TOKEN, or
              FLEET_ZAI_TOKEN / ZAI_TOKEN which the skill picks up)
  codex       codex --sandbox workspace-write --ask-for-approval never
              (unsets OPENAI_API_KEY: ChatGPT-plan billing; requires a
              literal codex=true line in the target project's CLAUDE.md)

Env knobs: TMUX_AGENTS_SOCKET, TMUX_AGENTS_TRUST_TIMEOUT (15),
  TMUX_AGENTS_BANNER_TIMEOUT (20), TMUX_AGENTS_AUTH_TIMEOUT (12)
EOF
}

# _ta_strip_socket ARGV... — pull --socket/--socket= out of the args into
# TA_SOCK, echo the rest one per line-safe NUL? Args with newlines are not a
# target; use argv echoing via printf and caller re-reads with mapfile.
_ta_next_arg() { # _ta_next_arg FLAG NAME — die 2 when a flag lacks its value
  [ $# -ge 2 ] || _ta_die 64 "$1 needs a value"
}

cmd_spawn() {
  local name="" engine="" model="" cwd="" prompt="" prompt_file="" dry_run=0
  local bin_ov="" args_ov="" banner_ov="" trust_timeout="" banner_timeout=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --engine)      _ta_next_arg "$1" "${2:-}"; engine="$2"; shift 2 ;;
      --engine=*)    engine="${1#--engine=}"; shift ;;
      --model)       _ta_next_arg "$1" "${2:-}"; model="$2"; shift 2 ;;
      --model=*)     model="${1#--model=}"; shift ;;
      --cwd)         _ta_next_arg "$1" "${2:-}"; cwd="$2"; shift 2 ;;
      --cwd=*)       cwd="${1#--cwd=}"; shift ;;
      --prompt)      _ta_next_arg "$1" "${2:-}"; prompt="$2"; shift 2 ;;
      --prompt=*)    prompt="${1#--prompt=}"; shift ;;
      --prompt-file) _ta_next_arg "$1" "${2:-}"; prompt_file="$2"; shift 2 ;;
      --prompt-file=*) prompt_file="${1#--prompt-file=}"; shift ;;
      --bin)         _ta_next_arg "$1" "${2:-}"; bin_ov="$2"; shift 2 ;;
      --bin=*)       bin_ov="${1#--bin=}"; shift ;;
      --args)        _ta_next_arg "$1" "${2:-}"; args_ov="$2"; shift 2 ;;
      --args=*)      args_ov="${1#--args=}"; shift ;;
      --banner-regex) _ta_next_arg "$1" "${2:-}"; banner_ov="$2"; shift 2 ;;
      --banner-regex=*) banner_ov="${1#--banner-regex=}"; shift ;;
      --trust-timeout) _ta_next_arg "$1" "${2:-}"; trust_timeout="$2"; shift 2 ;;
      --banner-timeout) _ta_next_arg "$1" "${2:-}"; banner_timeout="$2"; shift 2 ;;
      --dry-run)     dry_run=1; shift ;;
      -*)            _ta_die 64 "spawn: unknown option $1" ;;
      *)             [ -z "$name" ] || _ta_die 64 "spawn: unexpected argument $1"
                     name="$1"; shift ;;
    esac
  done

  [ -n "$name" ] || _ta_die 64 "usage: execute.sh spawn NAME [options]"
  [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] \
    || _ta_die 64 "spawn: bad session name '$name' (allowed: letters, digits, dot, dash, underscore)"

  [ "$engine" = "claude" ] && engine="claude-sub"
  [ -n "$engine" ] || engine="claude-sub"
  _ta_engine_row "$engine" >/dev/null \
    || _ta_die 65 "spawn: unknown engine '$engine' (have: $(_ta_engine_list | tr '\n' ' '))"

  local bin args_str unset_raw trust_keys banner_re trust_re
  bin=$(_ta_engine_field "$engine" 2)
  args_str=$(_ta_engine_field "$engine" 3)
  unset_raw=$(_ta_engine_field "$engine" 5)
  trust_keys=$(_ta_engine_field "$engine" 6)
  banner_re=$(_ta_engine_field "$engine" 7)
  [ -n "$bin_ov" ] && bin="$bin_ov"
  [ -n "$args_ov" ] && args_str="$args_ov"
  [ -n "$banner_ov" ] && banner_re="$banner_ov"
  case "$bin" in
    claude) trust_re="Do you trust the files in this folder" ;;
    codex)  trust_re="trust this folder|work in this folder" ;;
    *)      trust_re="" ;;
  esac

  if [ -n "$model" ]; then
    local -a parts=() keep=() p
    read -r -a parts <<< "$args_str"
    local skip=0
    for p in ${parts[@]+"${parts[@]}"}; do
      if [ "$skip" = 1 ]; then skip=0; continue; fi
      if [ "$p" = "--model" ]; then skip=1; continue; fi
      keep+=("$p")
    done
    args_str="${keep[*]:-}"
    args_str="${args_str:+$args_str }--model $model"
  fi

  if [ -z "$cwd" ]; then
    cwd=$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "$PWD")
  fi
  [ -d "$cwd" ] || _ta_die 64 "spawn: --cwd directory not found: $cwd"

  # Guard rails run before ANY side effect (exit 66 paths). basename match
  # so --bin /path/to/codex gets the same codex guards.
  local bin_name
  bin_name=$(basename "$bin")
  if [ "$bin_name" = "codex" ]; then
    if [ -n "${OPENAI_API_KEY:-}" ]; then
      case ",$unset_raw," in
        *,OPENAI_API_KEY,*) : ;;
        *) _ta_die 66 "spawn: OPENAI_API_KEY is set in the master env but engine '$engine' does not unset it (a set key silently bills the API instead of the ChatGPT plan)" ;;
      esac
    fi
    _ta_codex_flag_check "$cwd"
    _ta_codex_auth_warn
  fi
  [ "$engine" = "claude-sub" ] && _ta_claude_repo_settings_warn "$cwd"

  _ta_zai_token_prefill
  local -a set_args=() resolved sv
  resolved=$(_ta_engine_resolve_set "$engine") || exit "$?"
  while IFS= read -r sv; do
    [ -n "$sv" ] || continue
    set_args+=(-e "$sv")
  done <<< "$resolved"

  # The pane command: one literal line, exec so the pane dies with the engine.
  local pane_cmd="unset ${unset_raw//,/ }; exec $bin${args_str:+ $args_str}"

  [ -n "$trust_timeout" ] || trust_timeout=$(_ta_env_seconds TMUX_AGENTS_TRUST_TIMEOUT 15)
  [ -n "$banner_timeout" ] || banner_timeout=$(_ta_env_seconds TMUX_AGENTS_BANNER_TIMEOUT 20)

  if [ "$dry_run" = 1 ]; then
    local set_str="${set_args[*]}"
    echo "tmux -L $TA_SOCK new-session -d -s $name -c $cwd${set_str:+ $set_str}"
    echo "tmux -L $TA_SOCK send-keys -t $name -l \"$pane_cmd\""
    echo "tmux -L $TA_SOCK send-keys -t $name Enter"
    [ -n "$trust_re" ] && echo "# if the trust prompt appears: tmux -L $TA_SOCK send-keys -t $name ${trust_keys//,/ }"
    echo "# after the banner shows (/$banner_re/):"
    echo "tmux -L $TA_SOCK send-keys -t $name -l \"<prompt>\""
    echo "tmux -L $TA_SOCK send-keys -t $name Enter"
    return 0
  fi

  command -v tmux >/dev/null 2>&1 || _ta_die 3 "spawn: tmux not available (use --dry-run for copy-paste commands)"
  _ta_tmux_server_warn "$TA_SOCK"

  if ! tmux -L "$TA_SOCK" new-session -d -s "$name" -c "$cwd" \
      ${set_args[@]+"${set_args[@]}"}; then
    _ta_die 66 "spawn: tmux new-session failed for $name (duplicate session name? socket: $TA_SOCK)"
  fi
  if ! tmux -L "$TA_SOCK" send-keys -t "$name" -l "$pane_cmd"; then
    _ta_die 66 "spawn: could not reach pane $name (session died at launch?)"
  fi
  tmux -L "$TA_SOCK" send-keys -t "$name" Enter

  # Startup gates before the banner poll. One poll, dispatch on the matched
  # line; keys are sent only when a prompt actually shows.
  # - codex-cli update modal ("Update available ... Press enter to
  #   continue"): Enter would pick "1. Update now" (surprise npm -g
  #   install), so send "2" (Skip) then Enter. Measured live on 0.153.4.
  # - folder-trust prompts: engine trust_keys (claude Down,Enter; codex Enter).
  local gate_re="Update available|Press enter to continue" gate_timeout="$trust_timeout" gate_line
  if [ -n "$trust_re" ]; then gate_re+="|$trust_re"; else gate_timeout=5; fi
  gate_line=$(_ta_pane_wait "$TA_SOCK" "$name" "$gate_re" "$gate_timeout" || true)
  if [ -n "$gate_line" ]; then
    case "$gate_line" in
      *Update\ available*|*Press\ enter*)
        tmux -L "$TA_SOCK" send-keys -t "$name" -l "2"
        sleep 0.3
        tmux -L "$TA_SOCK" send-keys -t "$name" Enter
        # a folder-trust prompt may surface next
        if [ -n "$trust_re" ] && _ta_pane_wait "$TA_SOCK" "$name" "$trust_re" 5 >/dev/null; then
          if [ -n "$trust_keys" ]; then
            # shellcheck disable=SC2086  # word-split key list is the point
            tmux -L "$TA_SOCK" send-keys -t "$name" ${trust_keys//,/ }
          fi
        fi
        ;;
      *)
        if [ -n "$trust_keys" ]; then
          # shellcheck disable=SC2086  # word-split key list is the point
          tmux -L "$TA_SOCK" send-keys -t "$name" ${trust_keys//,/ }
        fi
        ;;
    esac
  fi

  local banner_line=""
  if [ -n "$banner_re" ]; then
    banner_line=$(_ta_pane_wait "$TA_SOCK" "$name" "$banner_re" "$banner_timeout" || true)
  fi
  if [ -z "$banner_line" ]; then
    echo "spawn: $name: no banner match within ${banner_timeout}s (regex: $banner_re); last pane lines:" >&2
    tmux -L "$TA_SOCK" capture-pane -p -t "$name" 2>/dev/null | tail -n 10 >&2
    tmux -L "$TA_SOCK" kill-session -t "$name" 2>/dev/null || true
    exit 68
  fi
  echo "spawned $name engine=$engine cwd=$cwd banner=\"$banner_line\""

  if [ -n "$prompt_file" ]; then
    [ -f "$prompt_file" ] || _ta_die 64 "spawn: --prompt-file not found: $prompt_file"
    [ -n "$prompt" ] && _ta_die 64 "spawn: --prompt and --prompt-file are mutually exclusive"
    prompt=$(cat "$prompt_file")
  fi
  if [ -n "$prompt" ]; then
    _ta_send_text "$TA_SOCK" "$name" "$prompt"
  fi

  # Auth probe after the first request: a relay token the banner cannot see
  # surfaces here as a 401 retry loop (cfn-fleet measured 2026-09-09).
  local auth_timeout
  auth_timeout=$(_ta_env_seconds TMUX_AGENTS_AUTH_TIMEOUT 12)
  if [ -n "$prompt" ]; then
    if _ta_pane_wait "$TA_SOCK" "$name" \
        '401 Authentication Failed|Authentication Failed|invalid_api_key|authentication_error' \
        "$auth_timeout" >/dev/null; then
      echo "spawn: WARNING $name: engine reports an authentication failure after the first request (token for engine '$engine' rejected). Fix the source var and respawn." >&2
    fi
  fi
  return 0
}

cmd_send() {
  local name="" text=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -*) _ta_die 64 "send: unknown option $1" ;;
      *)  if [ -z "$name" ]; then name="$1"; else text="${text:+$text }$1"; fi; shift ;;
    esac
  done
  [ -n "$name" ] && [ -n "$text" ] || _ta_die 64 "usage: execute.sh send NAME TEXT..."
  tmux -L "$TA_SOCK" has-session -t "$name" 2>/dev/null \
    || _ta_die 65 "send: no session '$name' on socket $TA_SOCK"
  _ta_send_followup "$TA_SOCK" "$name" "$text"
  echo "sent $name: ${text:0:60}${text:60:+...}"
}

cmd_status() {
  local name="${1:-}"
  if [ -n "$name" ]; then
    local err rc=0
    err=$(tmux -L "$TA_SOCK" has-session -t "$name" 2>&1) || rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "$name: alive (socket $TA_SOCK)"
      _ta_pane_raw "$TA_SOCK" "$name" 3 | sed 's/^/  last: /'
      return 0
    fi
    case "$err" in
      *"no server running"*|*"error connecting"*) echo "$name: no server on socket $TA_SOCK" >&2 ;;
      *) echo "$name: DEAD (pane exited)" >&2 ;;
    esac
    return 1
  fi
  local sessions
  sessions=$(tmux -L "$TA_SOCK" ls -F '#S' 2>/dev/null) \
    || _ta_die 65 "status: no server on socket $TA_SOCK (nothing spawned)"
  local s any_dead=0
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    cmd_status "$s" || any_dead=1
  done <<< "$sessions"
  return "$any_dead"
}

cmd_capture() {
  local name="" lines=40
  while [ $# -gt 0 ]; do
    case "$1" in
      --lines)  _ta_next_arg "$1" "${2:-}"; lines="$2"; shift 2 ;;
      --lines=*) lines="${1#--lines=}"; shift ;;
      -*)       _ta_die 64 "capture: unknown option $1" ;;
      *)        [ -z "$name" ] || _ta_die 64 "capture: unexpected argument $1"
                name="$1"; shift ;;
    esac
  done
  [ -n "$name" ] || _ta_die 64 "usage: execute.sh capture NAME [--lines N]"
  [[ "$lines" =~ ^[0-9]+$ ]] || _ta_die 64 "capture: --lines expects a number"
  tmux -L "$TA_SOCK" has-session -t "$name" 2>/dev/null \
    || _ta_die 65 "capture: no session '$name' on socket $TA_SOCK"
  _ta_pane_raw "$TA_SOCK" "$name" "$lines"
}

cmd_list() {
  tmux -L "$TA_SOCK" ls -F '#S' 2>/dev/null \
    || _ta_die 65 "list: no server on socket $TA_SOCK (nothing spawned)"
}

cmd_kill() {
  if [ "${1:-}" = "--all" ]; then
    tmux -L "$TA_SOCK" kill-server 2>/dev/null \
      || _ta_die 65 "kill: no server on socket $TA_SOCK"
    echo "killed all sessions on socket $TA_SOCK"
    return 0
  fi
  local name="${1:-}"
  [ -n "$name" ] || _ta_die 64 "usage: execute.sh kill NAME | kill --all"
  tmux -L "$TA_SOCK" kill-session -t "$name" 2>/dev/null \
    || _ta_die 65 "kill: no session '$name' on socket $TA_SOCK"
  echo "killed $name"
}

main() {
  local -a argv=()
  local sock=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --socket)   _ta_next_arg "$1" "${2:-}"; sock="$2"; shift 2 ;;
      --socket=*) sock="${1#--socket=}"; shift ;;
      *)          argv+=("$1"); shift ;;
    esac
  done
  [ "${#argv[@]}" -gt 0 ] || { _ta_usage >&2; exit 2; }

  if [ -n "$sock" ]; then
    TA_SOCK="${sock//[^A-Za-z0-9_.-]/-}"
  else
    TA_SOCK=$(_ta_socket)
  fi

  local cmd="${argv[0]}"
  shift_argv=("${argv[@]:1}")
  case "$cmd" in
    spawn)   cmd_spawn ${shift_argv[@]+"${shift_argv[@]}"} ;;
    send)    cmd_send ${shift_argv[@]+"${shift_argv[@]}"} ;;
    status)  cmd_status ${shift_argv[@]+"${shift_argv[@]}"} ;;
    capture) cmd_capture ${shift_argv[@]+"${shift_argv[@]}"} ;;
    list)    cmd_list ${shift_argv[@]+"${shift_argv[@]}"} ;;
    kill)    cmd_kill ${shift_argv[@]+"${shift_argv[@]}"} ;;
    help|-h|--help) _ta_usage ;;
    *) _ta_usage >&2; _ta_die 64 "unknown command: $cmd" ;;
  esac
}

main "$@"
