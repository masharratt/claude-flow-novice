#!/usr/bin/env bash
# Fake Codex-shape worker for tests: a long burst of typed text collapses into a
# "[Pasted Content N chars]" block on the input line, and the FIRST Enter after
# it only arms the block; the SECOND Enter submits (BUG tmux-send-paste,
# 2026-11-19). Each submitted message's length is appended to $FAKE_PASTE_LOG.
# If "$FAKE_PASTE_LOG.never" exists, a block is never submitted.
printf 'AGENTS-TEST-BANNER ready\n'
stty -echo -icanon min 1 2>/dev/null
buf="" armed=0
draw() {
  if [ "${#buf}" -gt 50 ]; then
    printf '\r\033[K› [Pasted Content %d chars]' "${#buf}"
  else
    printf '\r\033[K› %s' "$buf"
  fi
}
draw
while IFS= read -r -s -n1 c; do
  if [ -z "$c" ]; then
    if [ "${#buf}" -gt 50 ] && [ "$armed" = 0 ]; then armed=1; continue; fi
    [ -e "${FAKE_PASTE_LOG}.never" ] && continue
    [ -n "$buf" ] && printf '%d\n' "${#buf}" >> "$FAKE_PASTE_LOG"
    buf="" armed=0; draw
  else
    buf+="$c"; draw
  fi
done
