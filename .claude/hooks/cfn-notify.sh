#!/usr/bin/env bash
# cfn-notify.sh - audible completion / attention signal for Claude Code sessions
# on macOS (afplay + /System/Library/Sounds) and WSL2 (Windows Media).
#
# Usage:
#   cfn-notify.sh <event>          play the sound bound to an event
#   cfn-notify.sh --list           list every available Windows Media sound
#   cfn-notify.sh --play <name>    audition one sound by basename (no .wav needed)
#
#   event = stop   -> session finished a turn   (default)
#           input  -> Claude needs your input   (permission prompt / question)
#           error  -> something failed
#
# WSL defaults:   stop=chimes, input=Windows Notify Calendar, error=Windows Critical Stop.
# macOS defaults: stop=Hero,   input=Glass,                   error=Basso.
# Pick your own without editing this file. Set a basename from --list:
#   export CFN_NOTIFY_STOP="Windows Print complete"   (macOS: "Ping")
#   export CFN_NOTIFY_INPUT="Windows Exclamation"     (macOS: "Submarine")
#   export CFN_NOTIFY_ERROR="Windows Hardware Fail"   (macOS: "Funk")
#
# Fire-and-forget: the player is backgrounded and detached so the hook never
# adds latency to the turn (CFN_NOTIFY_SYNC=1 plays in the foreground, for
# tests). Silent no-op when neither afplay nor powershell.exe exists.
# Disable entirely:  export CFN_NOTIFY=0
# Silent when the session runs inside a detached tmux session (nobody watching).
set -uo pipefail

# A session inside a detached tmux session (no client attached) stays silent:
# the user cannot see it, so a sound only sends them hunting for it. Fails open
# (plays) when tmux cannot answer. --list/--play are interactive, never muted.
if [ -n "${TMUX:-}" ] && [[ "${1:-stop}" != --* ]]; then
  ATTACHED=$(tmux display-message -p -t "${TMUX_PANE:-}" '#{session_attached}' 2>/dev/null)
  [ "$ATTACHED" = "0" ] && exit 0
fi

MEDIA_UNIX='/mnt/c/Windows/Media'
MEDIA_WIN='C:\Windows\Media'
MEDIA_MAC='/System/Library/Sounds'

# macOS: afplay a system .aiff. Kept separate from the PowerShell path below.
if ! command -v powershell.exe >/dev/null 2>&1 && command -v afplay >/dev/null 2>&1; then
  case "${1:-stop}" in
    --list) ls "$MEDIA_MAC" | sed 's/\.aiff$//' | sort; exit 0 ;;
    --play) [ -n "${2:-}" ] || { echo 'usage: cfn-notify.sh --play <sound-name>' >&2; exit 2; }
            [ -f "$MEDIA_MAC/${2%.aiff}.aiff" ] || [ -f "$2" ] || { echo "cfn-notify: no such sound: $2 (see --list)" >&2; exit 1; }
            PICK="$2"; SYNC=1 ;;
    stop)   PICK="${CFN_NOTIFY_STOP:-Hero}" ;;
    input)  PICK="${CFN_NOTIFY_INPUT:-Glass}" ;;
    error)  PICK="${CFN_NOTIFY_ERROR:-Basso}" ;;
    *)      PICK="Ping" ;;
  esac
  [[ "${CFN_NOTIFY:-1}" == "0" ]] && exit 0
  case "$PICK" in
    /*) SND="$PICK" ;;
    *)  SND="$MEDIA_MAC/${PICK%.aiff}.aiff" ;;
  esac
  if [ -n "${SYNC:-}" ] || [ -n "${CFN_NOTIFY_SYNC:-}" ]; then
    afplay "$SND" >/dev/null 2>&1
  else
    ( afplay "$SND" >/dev/null 2>&1 & )
  fi
  exit 0
fi

case "${1:-stop}" in
  --list)
    [ -d "$MEDIA_UNIX" ] || { echo "no $MEDIA_UNIX (not WSL?)" >&2; exit 1; }
    (cd "$MEDIA_UNIX" && ls *.wav 2>/dev/null | sed 's/\.wav$//' | sort)
    exit 0
    ;;
  --play)
    EVENT="__direct__"
    PICK="${2:-}"
    [ -n "$PICK" ] || { echo 'usage: cfn-notify.sh --play <sound-name>' >&2; exit 2; }
    ;;
  *)
    EVENT="${1:-stop}"
    PICK=""
    ;;
esac

[[ "${CFN_NOTIFY:-1}" == "0" ]] && exit 0
command -v powershell.exe >/dev/null 2>&1 || exit 0

case "$EVENT" in
  stop)  PICK="${CFN_NOTIFY_STOP:-chimes}"
         BEEP='[console]::beep(880,120);[console]::beep(1175,160)' ;;
  input) PICK="${CFN_NOTIFY_INPUT:-Windows Notify Calendar}"
         BEEP='[console]::beep(1175,120);[console]::beep(880,120);[console]::beep(1175,120)' ;;
  error) PICK="${CFN_NOTIFY_ERROR:-Windows Critical Stop}"
         BEEP='[console]::beep(440,250);[console]::beep(330,300)' ;;
  __direct__)
         BEEP='[console]::beep(880,150)' ;;
  *)     PICK="Windows Ding"
         BEEP='[console]::beep(880,150)' ;;
esac

# Accept a bare name, a name.wav, or an absolute Windows path.
case "$PICK" in
  *:\\*) WAV="$PICK" ;;
  *.wav) WAV="$MEDIA_WIN\\$PICK" ;;
  *)     WAV="$MEDIA_WIN\\$PICK.wav" ;;
esac

# --play is interactive: report a bad name instead of silently falling back.
if [ "$EVENT" = "__direct__" ] && [ ! -f "$MEDIA_UNIX/${PICK%.wav}.wav" ] && [ ! -f "$PICK" ]; then
  echo "cfn-notify: no such sound: $PICK (see --list)" >&2
  exit 1
fi

PS_CMD="try { (New-Object Media.SoundPlayer '${WAV}').PlaySync() } catch { ${BEEP} }"

if [ "$EVENT" = "__direct__" ] || [ -n "${CFN_NOTIFY_SYNC:-}" ]; then
  # audition: play synchronously so a sequence of --play calls does not overlap
  powershell.exe -NoProfile -NonInteractive -Command "$PS_CMD" >/dev/null 2>&1
else
  setsid powershell.exe -NoProfile -NonInteractive -Command "$PS_CMD" \
    >/dev/null 2>&1 < /dev/null &
  disown 2>/dev/null || true
fi

exit 0
