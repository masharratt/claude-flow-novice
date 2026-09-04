#!/usr/bin/env bash
# cfn-spawn-depth-guard — PreToolUse (Agent) hook.
#
# Enforces the DEPTH LIMIT rule in ~/.claude/CLAUDE.md: only the main chat
# spawns agents. A subagent is a leaf and executes its brief directly.
#
# Discriminator, verified 2026-09-03 by probing a live payload: Claude Code
# includes `agent_id` and `agent_type` in the PreToolUse payload ONLY when the
# tool call originates inside a subagent. A main-chat call carries neither key.
#
# Escape hatch: put an agent_type on its own line in
# ~/.claude/nested-spawn-allowlist.txt (override the path with
# CFN_NESTED_SPAWN_ALLOWFILE) for orchestrator profiles that spawn by design.
set -uo pipefail

RAW=$(timeout 1 cat 2>/dev/null || true)
[ -n "$RAW" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

AGENT_ID=$(printf '%s' "$RAW" | jq -r '.agent_id // empty' 2>/dev/null || true)
[ -n "$AGENT_ID" ] || exit 0   # main chat: spawning is the whole point, allow

AGENT_TYPE=$(printf '%s' "$RAW" | jq -r '.agent_type // "unknown"' 2>/dev/null || echo unknown)
ALLOW_FILE="${CFN_NESTED_SPAWN_ALLOWFILE:-$HOME/.claude/nested-spawn-allowlist.txt}"
if [ -f "$ALLOW_FILE" ] && grep -qxF -- "$AGENT_TYPE" "$ALLOW_FILE" 2>/dev/null; then
  exit 0
fi

CHILD=$(printf '%s' "$RAW" | jq -r '.tool_input.subagent_type // "general-purpose"' 2>/dev/null || echo unknown)
{
  echo "BLOCKED: nested subagent spawn (${AGENT_TYPE} tried to spawn ${CHILD})."
  echo ""
  echo "Only the main chat spawns agents. See DEPTH LIMIT in ~/.claude/CLAUDE.md."
  echo "You are a leaf: do the work yourself with Read, Grep, Glob and Bash."
  echo "If the brief is genuinely too large for one agent, stop and say so in your"
  echo "report with what you did finish. The main chat will split it and re-spawn."
} >&2
exit 2
