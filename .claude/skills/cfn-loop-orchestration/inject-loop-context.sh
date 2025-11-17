#!/bin/bash
# inject-loop-context.sh - Inject loop-specific context into agent prompts

set -euo pipefail

LOOP_TYPE="$1"  # loop3, loop2, loop4, loop1
AGENT_CONTEXT="$2"  # Original agent context

# Use absolute path from current working directory
PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"

# Load base CFN Loop context
BASE_CONTEXT_FILE="$PROJECT_ROOT/.claude/prompts/cfn-loop-context.md"
if [[ ! -f "$BASE_CONTEXT_FILE" ]]; then
  echo "ERROR: Base context file not found: $BASE_CONTEXT_FILE" >&2
  exit 1
fi
BASE_CONTEXT=$(cat "$BASE_CONTEXT_FILE")

# Load loop-specific context (optional)
LOOP_CONTEXT_FILE="$PROJECT_ROOT/.claude/prompts/loop-specific/${LOOP_TYPE}.md"
if [[ -f "$LOOP_CONTEXT_FILE" ]]; then
  LOOP_CONTEXT=$(cat "$LOOP_CONTEXT_FILE")
else
  LOOP_CONTEXT=""
fi

# Combine contexts
cat <<EOF
$BASE_CONTEXT

---

$LOOP_CONTEXT

---

# Your Task

$AGENT_CONTEXT
EOF
