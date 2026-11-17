# shellcheck shell=bash
# cfn-tmux-agents shared helpers. Ported from cfn-fleet lib/common.sh +
# lib/cmd-spawn.sh guards (planning/HANDOFF_cfn-fleet-engines.md), with the
# roster/run-dir/worktree machinery stripped.

# _ta_die CODE MSG — exit with a prefixed message on stderr.
_ta_die() {
  echo "tmux-agents: $2" >&2
  exit "$1"
}

# _ta_socket: dedicated tmux socket for agent sessions. TMUX_AGENTS_SOCKET
# env, else "tmux-agents". A dedicated socket keeps agent sessions isolated
# from the user's default tmux server, so kill-server only ever kills agents.
_ta_socket() {
  local sock="${TMUX_AGENTS_SOCKET:-tmux-agents}"
  sock="${sock//[^A-Za-z0-9_.-]/-}"
  printf '%s\n' "$sock"
}

# _ta_env_seconds VAR DEFAULT — numeric env knob or the default.
_ta_env_seconds() {
  local v="${!1:-}"
  [[ "$v" =~ ^[0-9]+$ ]] && { printf '%s\n' "$v"; return 0; }
  printf '%s\n' "$2"
}

# _ta_pane_wait SOCK TARGET REGEX TIMEOUT_S — poll capture-pane until a line
# matches REGEX; echo the (first) matching line, rc 1 on timeout. The noise
# filter is load-bearing: without it the poll can match its own echo of the
# launch command or a send-keys payload.
_ta_pane_wait() {
  local sock="$1" tgt="$2" re="$3" timeout="$4" i=0 line
  local max=$((timeout * 5))
  while [ "$i" -lt "$max" ]; do
    # a dead pane (kept by remain-on-exit) will never match: stop polling
    [ "$(tmux -L "$sock" display-message -p -t "$tgt" '#{pane_dead}' 2>/dev/null || echo 1)" = 1 ] && return 1
    line=$(tmux -L "$sock" capture-pane -p -t "$tgt" 2>/dev/null \
      | sed -e 's/\r$//' -e 's/[[:space:]]*$//' -e '/^$/d' \
      | grep -v -E -- 'exec |--model |send-keys|^unset |cfn-spawn-launch' \
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

# _ta_pane_raw SOCK TARGET LINES — lightly cleaned pane tail for humans:
# CR and trailing space stripped, blanks kept for context.
_ta_pane_raw() {
  tmux -L "$1" capture-pane -p -t "$2" 2>/dev/null \
    | sed -e 's/\r$//' -e 's/[[:space:]]*$//' \
    | tail -n "${3:-40}"
}

# _ta_tmux_server_warn SOCKET — warn (never fail) when the tmux server's
# global env carries inherited ANTHROPIC_*/OPENAI_* vars; the per-session
# -e vars only ADD, they cannot clear these.
_ta_tmux_server_warn() {
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

# _ta_codex_flag_check DIR — Codex delegation gate (global CLAUDE.md): the
# codex engine may only run in projects whose CLAUDE.md carries a literal
# codex=true line. Dies 66 naming the file when absent.
_ta_codex_flag_check() {
  local f="$1/CLAUDE.md"
  if [ ! -f "$f" ] || ! grep -Eq '^[[:space:]]*codex=true[[:space:]]*$' "$f"; then
    _ta_die 66 "spawn: codex engine requires a literal 'codex=true' line in $f (Codex delegation gate; add it to the project's CLAUDE.md or use claude-sub/glm)"
  fi
}

# _ta_codex_auth_warn — subscription billing needs auth_mode chatgpt in
# ~/.codex/auth.json. Warn only; the hard refusal is the unset-list guard.
_ta_codex_auth_warn() {
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

# _ta_claude_repo_settings_warn DIR — armed (no _ prefix) ANTHROPIC_BASE_URL/
# ANTHROPIC_AUTH_TOKEN keys in the project's .claude settings apply at Claude
# Code startup regardless of the pane env. Warn with file:line.
_ta_claude_repo_settings_warn() {
  local dir f hit v
  for dir in "$@"; do
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

# _ta_resolve_bin BIN — absolute path of the engine binary, resolved in the
# LAUNCHING shell (a leading $HOME or ~ is expanded; a bare name goes
# through this shell's PATH). rc 1 when it does not exist or is not
# executable. Spawn calls this before any side effect: a missing binary
# used to surface only as a dead pane and an empty "no banner match" dump.
_ta_resolve_bin() {
  # Prints an ABSOLUTE path (directory part physical, the file itself kept so a
  # symlinked launcher such as ~/.local/bin/claude stays what it is), or rc 1.
  # A path with a slash must already be absolute; a bare name is looked up only
  # in absolute PATH entries ("." or "" would pick a file in the pane's cwd).
  local b="$1" p d IFS
  # shellcheck disable=SC2016,SC2088  # literal $HOME / ~ from the registry
  case "$b" in '$HOME/'*) b="${HOME}/${b#\$HOME/}" ;; '~/'*) b="${HOME}/${b#\~/}" ;; esac
  case "$b" in
    /*) p="$b" ;;
    */*) return 1 ;;
    *) p=""
       IFS=:
       for d in $PATH; do
         case "$d" in /*) ;; *) continue ;; esac
         if [ -f "$d/$b" ] && [ -x "$d/$b" ]; then p="$d/$b"; break; fi
       done
       unset IFS
       [ -n "$p" ] || return 1 ;;
  esac
  [ -f "$p" ] && [ -x "$p" ] || return 1
  d=$(cd "$(dirname "$p")" 2>/dev/null && pwd -P) || return 1
  printf '%s/%s\n' "$d" "$(basename "$p")"
}

# _ta_shebang_interp FILE — for a script whose #! line names an interpreter
# (`#!/usr/bin/env node`, `#!/usr/bin/env -S node --flag`, `#!/bin/bash`),
# print that interpreter's name or path; print nothing for binaries.
_ta_shebang_interp() {
  local f="$1" line w
  local -a words=()
  [ "$(head -c 2 "$f" 2>/dev/null || true)" = "#!" ] || return 0
  line=$(head -n 1 "$f" 2>/dev/null | tr -d '\r') || return 0
  read -r -a words <<< "${line#\#!}"
  [ "${#words[@]}" -gt 0 ] || return 0
  if [ "$(basename "${words[0]}")" = "env" ]; then
    for w in "${words[@]:1}"; do
      case "$w" in -*|*=*) continue ;; esac
      printf '%s\n' "$w"
      return 0
    done
    return 0
  fi
  printf '%s\n' "${words[0]}"
}

# _ta_send_followup SOCK TARGET TEXT — mid-turn follow-up. Sending text and
# Enter in one motion leaves the text unsent while the worker is mid-turn
# (cfn-fleet trap 6): text, one second, then a separate Enter.
_ta_send_followup() {
  tmux -L "$1" send-keys -t "$2" -l "$3" || return 1
  sleep 1
  tmux -L "$1" send-keys -t "$2" Enter
}

# _ta_gate_cleared SOCK TARGET LINE — after a startup-modal key, wait (up to
# 4s) until LINE is gone from the pane, so the next poll does not re-match the
# stale screen and send a second key into the next screen.
_ta_gate_cleared() {
  local i
  for ((i = 0; i < 20; i++)); do
    tmux -L "$1" capture-pane -p -t "$2" 2>/dev/null \
      | sed -e 's/\r$//' -e 's/[[:space:]]*$//' | grep -Fxq -- "$3" || return 0
    sleep 0.2
  done
  return 0
}

# First-prompt ready check, send and landing check: shared with cfn-fleet in
# cfn-scripts/lib/tui-prompt.sh (tui_send_first_prompt), sourced by execute.sh.
