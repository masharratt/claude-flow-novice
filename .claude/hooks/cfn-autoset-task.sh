#!/usr/bin/env bash
# UserPromptSubmit hook: auto-set the status-line task from the session's first
# substantive user prompt, summarized to a 5-8 word label via z.ai GLM.
#
#   - Fires on every prompt but exits immediately if a task is already set for
#     this session (earlier prompt or explicit `cfn-task`). No clobber.
#   - One LLM call per session (first prompt only). Sync, ~0.8s, on the first
#     prompt — acceptable; later prompts early-exit.
#   - Provider: z.ai GLM (ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN from env,
#     model ANTHROPIC_DEFAULT_HAIKU_MODEL). Anthropic-API/claude-* BANNED;
#     this is z.ai's anthropic-compatible endpoint serving glm-* models.
#   - Fallback: if no token, or curl/jq missing, or the call fails, derive the
#     task from the truncated prompt instead (src=fallback in the fire-log).
#   - Skips slash commands and trivial (<8 char) prompts.
#   - Silent: no stdout (would inject as context on every prompt).
set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

input=$(timeout 2s cat 2>/dev/null || echo "{}")
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || true)
cwd=$(printf '%s' "$input" | jq -r '.cwd // .workspace.current_dir // empty' 2>/dev/null || true)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null || true)

[ -n "$sid" ] && [ -n "$cwd" ] || exit 0

tasks_dir="$cwd/.claude/tasks"
task_file="$tasks_dir/$sid.txt"

# already set -> don't clobber
[ -s "$task_file" ] && exit 0

# skip slash commands and empty prompts
case "$prompt" in
  ""|/*) exit 0 ;;
esac

# first line, collapse whitespace, trim ends (fallback source + LLM input)
line=$(printf '%s' "$prompt" | sed 's/\r//g' | awk 'NR==1' | tr -s ' \t' ' ' | sed 's/^ //; s/ $//')
[ "${#line}" -ge 8 ] || exit 0   # too trivial, wait for a real prompt

# --- Summarize via z.ai GLM (5-8 word imperative label) ---
task=""
src="llm"
base="${ANTHROPIC_BASE_URL:-https://api.z.ai/api/anthropic}"
token="${ANTHROPIC_AUTH_TOKEN:-}"
model="${ANTHROPIC_DEFAULT_HAIKU_MODEL:-glm-4.7}"

# Ban guard: NEVER call the real Anthropic API. z.ai's URL is api.z.ai/api/anthropic
# (host api.z.ai) — does NOT match. Real Anthropic (api.anthropic.com) -> skip,
# fall back to truncated prompt. Keeps the hook ban-safe under any project config.
ban=0
case "$base" in
  *api.anthropic.com*) ban=1 ;;
esac

if [ "$ban" = 0 ] && [ -n "$token" ] && command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  sys='You label a developer task for a status bar. Given the user prompt, output ONLY a concise 5-8 word imperative label. No quotes, no trailing punctuation, drop filler articles. Examples: Fix auth token refresh race | Add RLS policies to listings table | Refactor lender entity read path'
  body=$(jq -nc --arg m "$model" --arg s "$sys" --arg u "$line" \
    '{model:$m,max_tokens:25,system:$s,messages:[{role:"user",content:$u}]}' 2>/dev/null || true)
  if [ -n "$body" ]; then
    resp=$(curl -sS --max-time 10 "$base/v1/messages" \
      -H "content-type: application/json" \
      -H "x-api-key: $token" \
      -H "anthropic-version: 2023-06-01" \
      -d "$body" 2>/dev/null || true)
    task=$(printf '%s' "$resp" | jq -r '.content[0].text // empty' 2>/dev/null \
      | head -1 | tr -d '"' | tr -s ' ' | sed 's/^ //; s/ $//' || true)
  fi
fi

# fallback to truncated prompt if LLM unavailable or returned nothing useful
if [ -z "$task" ] || [ "${#task}" -lt 3 ]; then
  task="$line"
  src="fallback"
fi

# cap at 50 chars (status bar truncation limit)
if [ "${#task}" -gt 50 ]; then
  task="${task:0:49}…"
fi

mkdir -p "$tasks_dir" 2>/dev/null || true
printf '%s\n' "$task" > "$task_file"

# observability: one line per autoset
LOG="$HOME/.claude/cfn-data/autoset-task-fires.jsonl"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
printf '{"ts":"%s","sid":"%s","cwd":"%s","src":"%s","task":%s}\n' \
  "$(date -Iseconds 2>/dev/null)" \
  "$sid" "$cwd" "$src" \
  "$(printf '%s' "$task" | jq -Rs . 2>/dev/null || echo '""')" \
  >> "$LOG" 2>/dev/null || true

exit 0
