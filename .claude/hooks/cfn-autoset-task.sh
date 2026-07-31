#!/usr/bin/env bash
# UserPromptSubmit hook: auto-set the status-line task from the session's first
# substantive user prompt, once per session.
#
#   - Fires on every prompt, but exits immediately if a task is already set for
#     this session (by an earlier prompt or an explicit `cfn-task`). No clobber.
#   - Derives the task from the prompt's first line, whitespace-collapsed,
#     capped at 50 chars (the bar's truncation limit). No LLM, deterministic.
#   - Skips slash commands and trivial (<8 char) prompts; the next substantive
#     prompt sets it instead.
#   - Silent: no stdout (would otherwise inject as context on every prompt).
#
# Result lands in $cwd/.claude/tasks/<session_id>.txt, which the status line and
# the PreCompact hook both read.
set -euo pipefail

input=$(timeout 2s cat 2>/dev/null || echo "{}")
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || true)
cwd=$(printf '%s' "$input" | jq -r '.cwd // .workspace.current_dir // empty' 2>/dev/null || true)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null || true)

[ -n "$sid" ] && [ -n "$cwd" ] || exit 0

tasks_dir="$cwd/.claude/tasks"
task_file="$tasks_dir/$sid.txt"

# already set -> don't clobber (autoset, manual cfn-task, or prior prompt)
[ -s "$task_file" ] && exit 0

# skip slash commands and empty prompts
case "$prompt" in
  ""|/*) exit 0 ;;
esac

# first line, collapse whitespace, trim ends
line=$(printf '%s' "$prompt" | sed 's/\r//g' | awk 'NR==1' | tr -s ' \t' ' ' | sed 's/^ //; s/ $//')
[ "${#line}" -ge 8 ] || exit 0   # too trivial, wait for a real prompt

# cap at 50 chars
if [ "${#line}" -gt 50 ]; then
  line="${line:0:49}…"
fi

mkdir -p "$tasks_dir" 2>/dev/null || true
printf '%s\n' "$line" > "$task_file"

# observability: one line per autoset
LOG="$HOME/.claude/cfn-data/autoset-task-fires.jsonl"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
printf '{"ts":"%s","sid":"%s","cwd":"%s","task":%s}\n' \
  "$(date -Iseconds 2>/dev/null)" \
  "$sid" "$cwd" \
  "$(printf '%s' "$line" | jq -Rs . 2>/dev/null || echo '""')" \
  >> "$LOG" 2>/dev/null || true

exit 0
