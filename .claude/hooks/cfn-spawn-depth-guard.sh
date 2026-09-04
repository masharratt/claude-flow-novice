#!/usr/bin/env bash
# cfn-spawn-depth-guard — PreToolUse (Agent) hook. Two rules, one payload:
#
# 1. DEPTH LIMIT (block). Enforces the rule in ~/.claude/CLAUDE.md: only the
#    main chat spawns agents. A subagent is a leaf and executes its brief
#    directly.
#
#    Discriminator, verified 2026-09-03 by probing a live payload: Claude Code
#    includes `agent_id` and `agent_type` in the PreToolUse payload ONLY when the
#    tool call originates inside a subagent. A main-chat call carries neither key.
#
#    Escape hatch: put an agent_type on its own line in
#    ~/.claude/nested-spawn-allowlist.txt (override the path with
#    CFN_NESTED_SPAWN_ALLOWFILE) for orchestrator profiles that spawn by design.
#
# 2. BRIEF BUDGET (warn by default). A main-chat spawn prompt over
#    CFN_BRIEF_MAX_BYTES (default 4096) is flagged: big brief makes a big
#    artifact, which blows the artifact cap and triggers a compress pass
#    (measured 2026-09-03: thousands-of-words briefs -> 36KB SPEC vs 24KB cap
#    -> 234K subagent tokens compressing two files). The fix is always the
#    same: move context into an input file and pass the path.
#
#    CFN_BRIEF_GUARD=warn (default) logs + prints, spawn proceeds.
#    CFN_BRIEF_GUARD=deny blocks like the depth rule. CFN_BRIEF_GUARD=off
#    disables. Warns append to CFN_BRIEF_WARN_LOG
#    (default ~/.claude/brief-size-warn.log).
set -uo pipefail

RAW=$(timeout 1 cat 2>/dev/null || true)
[ -n "$RAW" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

AGENT_ID=$(printf '%s' "$RAW" | jq -r '.agent_id // empty' 2>/dev/null || true)

if [ -z "$AGENT_ID" ]; then
  # Main chat: depth rule does not apply; run the brief-budget check.
  GUARD_MODE="${CFN_BRIEF_GUARD:-warn}"
  MAX_BYTES="${CFN_BRIEF_MAX_BYTES:-4096}"
  if [ "$GUARD_MODE" != "off" ] && [[ "$MAX_BYTES" =~ ^[0-9]+$ ]] && [ "$MAX_BYTES" -gt 0 ]; then
    PROMPT=$(printf '%s' "$RAW" | jq -r '.tool_input.prompt // empty' 2>/dev/null || true)
    if [ -n "$PROMPT" ]; then
      SIZE=$(printf '%s' "$PROMPT" | wc -c)
      if [ "$SIZE" -gt "$MAX_BYTES" ]; then
        {
          echo "BRIEF OVER BUDGET: spawn prompt is ${SIZE} bytes (max ${MAX_BYTES})."
          echo "Brief = assignment + input paths + cap. Context belongs in an input"
          echo "file the agent reads, not in the prompt. Big brief makes a big"
          echo "artifact makes a compress pass."
          echo "(guard mode: ${GUARD_MODE}; tune CFN_BRIEF_MAX_BYTES, or CFN_BRIEF_GUARD=off)"
        } >&2
        WARN_LOG="${CFN_BRIEF_WARN_LOG:-$HOME/.claude/brief-size-warn.log}"
        printf '%s mode=%s size=%s max=%s\n' \
          "$(date +%FT%T)" "$GUARD_MODE" "$SIZE" "$MAX_BYTES" >> "$WARN_LOG" 2>/dev/null || true
        [ "$GUARD_MODE" = "deny" ] && exit 2
      fi
    fi
  fi
  exit 0
fi

# Subagent: enforce the depth limit.
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
