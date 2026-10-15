#!/usr/bin/env bash
# Work mode context injection. Registered under SessionStart AND UserPromptSubmit.
# Flag on: one-line reminder (plain stdout for SessionStart, JSON additionalContext for
# UserPromptSubmit). Flag off or jq missing: silent exit 0.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

WORK_DIR="${CFN_WORK_MODE_DIR:-$HOME/.claude}"
FLAG="$WORK_DIR/.work-mode-active"
[ -f "$FLAG" ] || exit 0

INPUT=$(cat)
EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null)
if [ -z "$EVENT" ]; then
    if printf '%s' "$INPUT" | jq -e 'has("prompt")' >/dev/null 2>&1; then
        EVENT="UserPromptSubmit"
    else
        EVENT="SessionStart"
    fi
fi

LINE="WORK MODE is ON (since $(cat "$FLAG")): the user is at work and the screen may be seen. Open no visible window: no open, osascript, GUI apps, player builds, headed browsers; Unity only -batchmode -nographics, Blender only -b; queue visual checks for later. Prefer the VPS for heavy builds/tests. Questions are fine but never wait on them: ask, then keep working."

case "$EVENT" in
    SessionStart) printf '%s\n' "$LINE" ;;
    *) jq -n --arg ctx "$LINE" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}' ;;
esac
exit 0
