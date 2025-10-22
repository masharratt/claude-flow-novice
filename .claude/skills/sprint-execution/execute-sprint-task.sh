#!/bin/bash
# Sprint-aware CLI agent execution wrapper
# Bridges CLI agents to sprint-based CFN Loop execution

set -euo pipefail

AGENT_TYPE="$1"
TASK_ID="$2"
AGENT_ID="$3"
SPRINT_ID="${4:-}"  # Optional sprint identifier

# Check if running in sprint mode
if [ -n "$SPRINT_ID" ]; then
  echo "[Sprint Execution] Retrieving sprint context for $SPRINT_ID..."

  # Retrieve sprint context from Redis
  SPRINT_CONTEXT=$(redis-cli GET "swarm:${TASK_ID}:sprint:${SPRINT_ID}:context" 2>/dev/null)

  if [ -n "$SPRINT_CONTEXT" ] && [ "$SPRINT_CONTEXT" != "(nil)" ]; then
    # Extract sprint metadata
    SPRINT_NAME=$(echo "$SPRINT_CONTEXT" | jq -r '.sprint_name')
    SPRINT_NUM=$(echo "$SPRINT_CONTEXT" | jq -r '.sprint_num')
    TOTAL_SPRINTS=$(echo "$SPRINT_CONTEXT" | jq -r '.total_sprints')
    SPRINT_DELIVERABLES=$(echo "$SPRINT_CONTEXT" | jq -r '.deliverables[]' | sed 's/^/- /')
    SPRINT_IN_SCOPE=$(echo "$SPRINT_CONTEXT" | jq -r '.in_scope[]' | sed 's/^/- /')
    SPRINT_OUT_SCOPE=$(echo "$SPRINT_CONTEXT" | jq -r '.out_of_scope[]' | sed 's/^/- /')
    SPRINT_DIRECTORY=$(echo "$SPRINT_CONTEXT" | jq -r '.directory // ""')

    # Build sprint-focused agent context
    AGENT_CONTEXT="Sprint: $SPRINT_ID - $SPRINT_NAME (Sprint $SPRINT_NUM of $TOTAL_SPRINTS)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOCUSED SPRINT EXECUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: This is a FOCUSED SPRINT. Create ONLY sprint-specific deliverables.
DO NOT create epic-level or phase-level summaries.

Sprint Deliverables (CREATE EXACTLY THESE FILES):
$SPRINT_DELIVERABLES
$([ -n "$SPRINT_DIRECTORY" ] && echo "
Target Directory: $SPRINT_DIRECTORY")

Sprint Scope (IMPLEMENT ONLY THESE ITEMS):
$SPRINT_IN_SCOPE

Out of Sprint Scope (DO NOT IMPLEMENT):
$SPRINT_OUT_SCOPE

Instructions:
1. Use Write tool to create EACH deliverable file
2. Verify files created with 'ls -la' after each Write
3. Focus ONLY on sprint scope items
4. DO NOT implement out-of-scope items (they're handled in other sprints)
5. Report confidence based on sprint deliverable completion (not epic completion)
6. If you identify out-of-scope improvements, note them but DO NOT implement

Context:
This is Sprint $SPRINT_NUM of $TOTAL_SPRINTS in a larger epic. Other sprints will handle
out-of-scope items. Your success is measured by delivering sprint-specific files with
high quality, NOT by completing the entire epic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"

    echo "[Sprint Execution] ✅ Sprint context built ($(echo "$AGENT_CONTEXT" | wc -c) chars)"
  else
    echo "[Sprint Execution] ⚠️  Sprint context not found, using standard context"
    # Fall back to standard context retrieval
    AGENT_CONTEXT=$(redis-cli GET "swarm:${TASK_ID}:agent-context" 2>/dev/null || echo "")
  fi
else
  # Non-sprint mode: retrieve standard context
  echo "[Execution] Standard (non-sprint) mode"
  AGENT_CONTEXT=$(redis-cli GET "swarm:${TASK_ID}:agent-context" 2>/dev/null || echo "")
fi

# Execute agent with sprint-aware or standard context
echo "[Execution] Spawning $AGENT_TYPE agent (ID: $AGENT_ID)..."
npx claude-flow-novice agent "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$AGENT_CONTEXT"