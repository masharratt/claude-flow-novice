#!/usr/bin/env bash
# cfn-notify.sh - audible completion / attention signal for WSL2 Claude Code sessions.
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
# Defaults: stop=chimes, input=Windows Notify Calendar, error=Windows Critical Stop.
# Pick your own without editing this file. Set a basename from --list:
#   export CFN_NOTIFY_STOP="Windows Print complete"
#   export CFN_NOTIFY_INPUT="Windows Exclamation"
#   export CFN_NOTIFY_ERROR="Windows Hardware Fail"
#
# Fire-and-forget: the PowerShell call is backgrounded and detached so the hook
# never adds latency to the turn. Silent no-op outside WSL (no powershell.exe).
# Disable entirely:  export CFN_NOTIFY=0
set -uo pipefail

MEDIA_UNIX='/mnt/c/Windows/Media'
MEDIA_WIN='C:\Windows\Media'

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

if [ "$EVENT" = "__direct__" ]; then
  # audition: play synchronously so a sequence of --play calls does not overlap
  powershell.exe -NoProfile -NonInteractive -Command "$PS_CMD" >/dev/null 2>&1
else
  setsid powershell.exe -NoProfile -NonInteractive -Command "$PS_CMD" \
    >/dev/null 2>&1 < /dev/null &
  disown 2>/dev/null || true
fi

exit 0
