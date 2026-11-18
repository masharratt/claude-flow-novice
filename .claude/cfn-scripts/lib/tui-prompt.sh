#!/usr/bin/env bash
# shellcheck shell=bash
# tui-prompt.sh: the one ready check + first-prompt send for agent TUIs in tmux.
# Shared by cfn-tmux-agents (execute.sh spawn) and cfn-fleet (cmd-spawn.sh), so
# a TUI change (a new opt-in modal, a new input-box glyph) is fixed once.
# Functions only, silent, safe to re-source.
#
# Every tmux call goes through ${TUI_TMUX_CMD:-tmux}, so a caller that reaches
# its panes over ssh (cfn-fleet host lanes) passes its own wrapper function.
#
# Knobs (callers map their own env names onto these on the call):
#   TUI_READY_TIMEOUT   seconds to wait for the input box (12)
#   TUI_READY_WAIT      0 skips the input-box wait (non-claude TUIs) (1)
#   TUI_MODAL_SETTLE    seconds before keys reach a freshly drawn modal (1.5)
#   TUI_SUBMIT_SETTLE   seconds between the typed text and Enter (1)
#   TUI_SUBMIT_VERIFY   seconds per landing check (3)
#   TUI_SUBMIT_RETRIES  extra Enters while the text still sits in the input (3)
#   TUI_WORKING_RE      ERE for "the agent is working" lines (spinner, esc to interrupt)

TUI_WORKING_RE_DEFAULT='[Ee]sc to interrupt|^[[:space:]]*[✻✽✶✳✢⏺·*][[:space:]]+[A-Z][a-z]+(ing)?…'

_tui_tmux() { "${TUI_TMUX_CMD:-tmux}" "$@"; }

# _tui_screen SOCK TARGET: visible pane text, CR and trailing space stripped.
_tui_screen() {
  _tui_tmux -L "$1" capture-pane -p -t "$2" 2>/dev/null | sed -e 's/\r$//' -e 's/[[:space:]]*$//'
}

_tui_pane_dead() {
  [ "$(_tui_tmux -L "$1" display-message -p -t "$2" '#{pane_dead}' 2>/dev/null || echo 1)" = 1 ]
}

# tui_ready_wait SOCK TARGET TIMEOUT_S: rc 0 once the input box ("❯" line) shows.
# Always rc 0 (a TUI that never draws it still gets the prompt; the landing
# check below then decides).
# BUG glm-first-prompt-lost (2026-11-17): a modal's menu cursor ("❯ 1. Yes,
# try it", Claude Code 2.1.326 flicker-free opt-in) also starts with "❯" and
# counted as the input box, so the prompt was typed into the modal and lost.
# A screen with "Enter to confirm" / "Esc to cancel" is a modal, not ready; the
# known opt-in gets Escape (start without it), an unknown modal is waited out.
tui_ready_wait() {
  local sock="$1" tgt="$2" deadline=$((SECONDS + $3)) scr
  while [ "$SECONDS" -lt "$deadline" ]; do
    _tui_pane_dead "$sock" "$tgt" && return 0
    scr=$(_tui_screen "$sock" "$tgt")
    if grep -Eq 'Enter to confirm|Esc to cancel' <<<"$scr"; then
      grep -Eq 'Flicker-free output' <<<"$scr" && _tui_tmux -L "$sock" send-keys -t "$tgt" Escape
      # settle: the TUI redraws before it reads keys again (first char lost live otherwise)
      sleep "${TUI_MODAL_SETTLE:-1.5}"; continue
    fi
    grep -Eq '^[[:space:]]*❯' <<<"$scr" && return 0
    sleep 0.2
  done
  return 0
}

# _tui_cursor_line SOCK TARGET: the visible line holding the cursor. TUIs
# (Claude Code 2.1.318, measured 2026-11-05) park it at the end of the input.
_tui_cursor_line() {
  local y
  y=$(_tui_tmux -L "$1" display-message -p -t "$2" '#{cursor_y}' 2>/dev/null) || return 1
  [[ "$y" =~ ^[0-9]+$ ]] || return 1
  _tui_screen "$1" "$2" | sed -n "$((y + 1))p"
}

# tui_input_pending SOCK TARGET TEXT: rc 0 when the input line still holds
# TEXT: the cursor line ends with the tail of TEXT's last line (works when the
# text wraps), or shows a paste placeholder. Without a cursor line, the LAST
# "❯" line is the live input box (submitted prompts echo above it).
tui_input_pending() {
  local cl tail k
  cl=$(_tui_cursor_line "$1" "$2") || cl=""
  if [ -z "$cl" ]; then
    cl=$(_tui_screen "$1" "$2" | grep -E '^[[:space:]]*❯' | tail -n 1 | sed -e 's/^[[:space:]]*❯[[:space:]]*//')
  fi
  [ -n "$cl" ] || return 1
  case "$cl" in *"[Pasted text"*) return 0 ;; esac
  tail="${3##*$'\n'}"
  tail="${tail%"${tail##*[![:space:]]}"}"
  [ -n "$tail" ] || return 1
  k=12
  [ "${#cl}" -lt "$k" ] && k="${#cl}"
  [ "${#tail}" -lt "$k" ] && k="${#tail}"
  [ "${tail: -$k}" = "${cl: -$k}" ]
}

# tui_prompt_landed SOCK TARGET TEXT: rc 0 when the prompt reached the agent:
# its opening words show ABOVE the live input line (submitted history), or the
# agent shows it is working (TUI_WORKING_RE). Text still in the input box, or
# typed into a modal that swallowed it, is not landed.
# BUG landed-while-pending (2026-11-18, test-spawn-path.sh 13/16): a TUI whose
# input line is not drawn with "❯"/"›" (a "> " box) had no input line to cut
# at, so the text still sitting in the box counted as history and "landed":
# no Enter retry, and a never-clearing input exited 0 instead of 69. Pending
# input is never landed, and the input line is the cursor line when tmux
# reports one (the last "❯"/"›" line otherwise).
tui_prompt_landed() {
  local scr above head n y
  tui_input_pending "$1" "$2" "$3" && return 1
  scr=$(_tui_screen "$1" "$2")
  grep -Eq -- "${TUI_WORKING_RE:-$TUI_WORKING_RE_DEFAULT}" <<<"$scr" && return 0
  y=$(_tui_tmux -L "$1" display-message -p -t "$2" '#{cursor_y}' 2>/dev/null || true)
  if [[ "$y" =~ ^[0-9]+$ ]]; then n=$((y + 1))
  else n=$(grep -nE '^[[:space:]]*(❯|›)' <<<"$scr" | tail -n 1 | cut -d: -f1); fi
  if [ -n "$n" ]; then above=$(head -n $((n - 1)) <<<"$scr"); else above="$scr"; fi
  head="${3%%$'\n'*}"
  head="${head#"${head%%[![:space:]]*}"}"
  head="${head:0:24}"
  head="${head%"${head##*[![:space:]]}"}"
  [ -n "$head" ] || return 1
  grep -Fq -- "$head" <<<"$above"
}

# tui_send_first_prompt SOCK TARGET TEXT: wait for the input box, type, settle,
# Enter, then confirm the prompt LANDED (tui_prompt_landed). Enter is retried
# while the text still sits in the input line.
# rc 0 landed; 1 tmux failure; 2 typed but never submitted (text still in the
# input line); 3 submitted nowhere (no history echo, no working indicator: a
# modal or a not-yet-ready TUI swallowed it). The pane is never killed.
tui_send_first_prompt() {
  local sock="$1" tgt="$2" text="$3" i try verify retries deadline
  verify="${TUI_SUBMIT_VERIFY:-3}"
  retries="${TUI_SUBMIT_RETRIES:-3}"
  [ "${TUI_READY_WAIT:-1}" = 0 ] || tui_ready_wait "$sock" "$tgt" "${TUI_READY_TIMEOUT:-12}"
  _tui_tmux -L "$sock" send-keys -t "$tgt" -l "$text" || return 1
  # echo wait: up to 5s for the text to show on the input line
  for ((i = 0; i < 25; i++)); do
    tui_input_pending "$sock" "$tgt" "$text" && break
    sleep 0.2
  done
  sleep "${TUI_SUBMIT_SETTLE:-1}"
  _tui_tmux -L "$sock" send-keys -t "$tgt" Enter || return 1
  for ((try = 0; try <= retries; try++)); do
    deadline=$((SECONDS + verify))
    while :; do
      sleep 0.2
      tui_prompt_landed "$sock" "$tgt" "$text" && return 0
      [ "$SECONDS" -lt "$deadline" ] || break
    done
    [ "$try" -lt "$retries" ] || break
    # Enter again only while the text still waits in the input line; an
    # empty input with no echo means it was swallowed, and a blind Enter could
    # pick a modal's default row.
    tui_input_pending "$sock" "$tgt" "$text" && { _tui_tmux -L "$sock" send-keys -t "$tgt" Enter || return 1; }
  done
  tui_input_pending "$sock" "$tgt" "$text" && return 2
  return 3
}
