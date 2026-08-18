#!/usr/bin/env bash
# PreCompact hook: re-assert the status-line task across compaction.
#
# Fires BEFORE compaction. The hookSpecificOutput.additionalContext we emit is
# injected AFTER compaction completes, so the model keeps (and can refresh) its
# current task in the post-compact context instead of losing the thread.
#
# Task precedence mirrors statusline-command.sh:
#   session > project banner > global
#   $cwd/.claude/tasks/<session_id>.txt > $cwd/.claude/current-task.txt
#                                       > ~/.claude/current-task.txt
#
# Output is PLAIN TEXT (stdout). PreCompact does NOT support
# hookSpecificOutput.additionalContext (only PreToolUse/UserPromptSubmit/
# PostToolUse/PostToolBatch/Stop/SubagentStop do). Emitting JSON makes the
# harness run JSON-schema validation and reject it. Plain stdout is added to
# the pre-compaction context, so the summary carries the task forward.
set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

input=$(timeout 2s cat 2>/dev/null || echo "{}")
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || true)
cwd=$(printf '%s' "$input" | jq -r '.cwd // .workspace.current_dir // empty' 2>/dev/null || true)
[ -z "$cwd" ] && cwd="${CLAUDE_PROJECT_DIR:-$PWD}"

task=""
if [ -n "$sid" ] && [ -n "$cwd" ]; then
  task=$(head -1 "$cwd/.claude/tasks/$sid.txt" 2>/dev/null | tr -d '\r\n' || true)
fi
[ -z "$task" ] && task=$(head -1 "$cwd/.claude/current-task.txt" 2>/dev/null | tr -d '\r\n' || true)
[ -z "$task" ] && task=$(head -1 "$HOME/.claude/current-task.txt" 2>/dev/null | tr -d '\r\n' || true)

# Fire-log: observable proof the hook ran (answers "did it trigger?").
# One JSON line per invocation. Runtime, gitignored (.claude/cfn-data/*.jsonl).
trigger=$(printf '%s' "$input" | jq -r '.trigger // empty' 2>/dev/null || true)
LOG="$HOME/.claude/cfn-data/precompact-fires.jsonl"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
printf '{"ts":"%s","sid":"%s","cwd":"%s","trigger":"%s","task":%s}\n' \
  "$(date -Iseconds 2>/dev/null)" \
  "${sid:-}" "${cwd:-}" "${trigger:-?}" \
  "$(printf '%s' "$task" | jq -Rs . 2>/dev/null || echo '""')" \
  >> "$LOG" 2>/dev/null || true

if [ -n "$task" ]; then
  printf 'Compaction reminder: Active task (status bar): %s\n' "$task"
  printf 'If your focus has shifted since this was set, refresh it now: cfn-task "<new summary>"\n'
else
  printf 'Compaction reminder: No active task is set. Set one so the status bar tracks your work across compaction: cfn-task "<summary>"\n'
fi
exit 0
