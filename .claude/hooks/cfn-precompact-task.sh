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
# Output is pure JSON (no free text) so the harness parses additionalContext.
set -euo pipefail

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

if [ -n "$task" ]; then
  ctx="[Compaction reminder] Active task (status bar): ${task}
If your focus has shifted since this was set, refresh it now: cfn-task \"<new summary>\""
else
  ctx="[Compaction reminder] No active task is set. Set one so the status bar tracks your work across compaction: cfn-task \"<summary>\""
fi

jq -nc --arg ctx "$ctx" \
  '{hookSpecificOutput:{hookEventName:"PreCompact", additionalContext:$ctx}}'
exit 0
