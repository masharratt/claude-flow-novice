#!/usr/bin/env bash

##############################################################################
# SUPPORTED FALLBACK - this is the default agent-selection path, not a
# deprecated one.
#
# execute.sh's select-agents command runs this script by default; the
# TypeScript build (dist/cli.cjs) only runs when the caller passes
# --typescript. The 2026-02-20 removal date this header used to carry has
# passed with no removal, because the bash path is still the default, not
# a migration step. No removal is planned. Keep bash and TypeScript
# behavior in sync when either changes.
##############################################################################

set -eu

# Agent Selection with Fallback
# Usage: ./select-agents.sh "task description" [--min-validators N]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="${SCRIPT_DIR}/../../agents/cfn-dev-team"
MAPPINGS_FILE="${SCRIPT_DIR}/agent-mappings.json"
CLASSIFIER="${SCRIPT_DIR}/task-classifier.sh"

# Check dependencies
if ! command -v jq &> /dev/null; then
  echo '{"error": "jq not installed", "loop3": ["backend-developer"], "loop2": ["code-reviewer", "tester"], "product_owner": "product-owner", "category": "default", "confidence": 0.0}' >&2
  exit 1
fi

# Parse arguments
TASK_DESCRIPTION="${1:-}"
MIN_VALIDATORS=3

shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --min-validators)
      MIN_VALIDATORS="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Validate task description
if [ -z "$TASK_DESCRIPTION" ]; then
  echo '{"error": "empty task description", "loop3": ["backend-developer", "devops-engineer"], "loop2": ["code-reviewer", "tester", "code-quality-validator"], "product_owner": "product-owner", "category": "default", "confidence": 0.70}' | jq -c .
  exit 0
fi

# Classify task
CATEGORY="default"
if [ -x "$CLASSIFIER" ]; then
  CATEGORY=$("$CLASSIFIER" "$TASK_DESCRIPTION" || echo "default")
fi

# Validate category exists in agent-mappings.json
if [ -f "$MAPPINGS_FILE" ]; then
  VALID_CATEGORIES=$(jq -r '.categories | keys[]' "$MAPPINGS_FILE" 2>/dev/null | tr '\n' '|' | sed 's/|$//')
  if [[ ! "$CATEGORY" =~ ^($VALID_CATEGORIES)$ ]]; then
    echo "Warning: Invalid category '$CATEGORY', falling back to 'default'" >&2
    CATEGORY="default"
  fi
fi

# Load agent mappings
if [ ! -f "$MAPPINGS_FILE" ]; then
  # Hardcoded fallback if mappings file missing
  echo '{"loop3": ["backend-developer", "devops-engineer"], "loop2": ["code-reviewer", "tester", "code-quality-validator"], "product_owner": "product-owner", "category": "default", "confidence": 0.70}' | jq -c .
  exit 0
fi

MAPPINGS=$(cat "$MAPPINGS_FILE")

# Extract agents for category
LOOP3_AGENTS=$(echo "$MAPPINGS" | jq -r --arg cat "$CATEGORY" '.categories[$cat].loop3[]? // empty' | jq -R -s -c 'split("\n") | map(select(length > 0))')
LOOP2_AGENTS=$(echo "$MAPPINGS" | jq -r --arg cat "$CATEGORY" '.categories[$cat].loop2[]? // empty' | jq -R -s -c 'split("\n") | map(select(length > 0))')
CONFIDENCE=$(echo "$MAPPINGS" | jq -r --arg cat "$CATEGORY" '.categories[$cat].confidence // 0.70')
PRODUCT_OWNER=$(echo "$MAPPINGS" | jq -r '.product_owner // "product-owner"')

# Fallback if empty arrays
if [ "$(echo "$LOOP3_AGENTS" | jq 'length')" -eq 0 ]; then
  echo "[WARN] Empty Loop 3 agents for category '$CATEGORY', using default" >&2
  LOOP3_AGENTS=$(echo "$MAPPINGS" | jq -r '.categories.default.loop3[]' | jq -R -s -c 'split("\n") | map(select(length > 0))')
  CONFIDENCE=0.70
fi

if [ "$(echo "$LOOP2_AGENTS" | jq 'length')" -eq 0 ]; then
  echo "[WARN] Empty Loop 2 agents for category '$CATEGORY', using default" >&2
  LOOP2_AGENTS=$(echo "$MAPPINGS" | jq -r '.categories.default.loop2[]' | jq -R -s -c 'split("\n") | map(select(length > 0))')
  CONFIDENCE=0.70
fi

# Validate agents exist in agent profiles
AGENT_ALIASES=$(echo "$MAPPINGS" | jq -r '.agent_aliases')

validate_agent() {
  local agent="$1"
  local agent_path=$(echo "$AGENT_ALIASES" | jq -r --arg agent "$agent" '.[$agent] // empty')

  if [ -z "$agent_path" ]; then
    return 1
  fi

  local full_path="${AGENTS_DIR}/${agent_path}"

  # Validate file exists
  if [ ! -f "$full_path" ]; then
    return 1
  fi

  # Validate realpath stays within AGENTS_DIR (prevent path traversal)
  local real_path=$(realpath "$full_path" 2>/dev/null || echo "")
  local real_agents_dir=$(realpath "$AGENTS_DIR" 2>/dev/null || echo "")

  if [[ -z "$real_path" || -z "$real_agents_dir" ]]; then
    return 1
  fi

  # Check if resolved path is inside agents directory
  if [[ "$real_path" != "$real_agents_dir"* ]]; then
    echo "Warning: Agent path '$agent_path' escapes agents directory" >&2
    return 1
  fi

  return 0
}

# Validate and replace invalid Loop 3 agents
VALID_LOOP3=()
for agent in $(echo "$LOOP3_AGENTS" | jq -r '.[]'); do
  if validate_agent "$agent"; then
    VALID_LOOP3+=("$agent")
  else
    echo "[WARN] Invalid Loop 3 agent '$agent', replacing with backend-developer" >&2
    VALID_LOOP3+=("backend-developer")
  fi
done

# Ensure minimum 2 Loop 3 agents
if [ ${#VALID_LOOP3[@]} -lt 2 ]; then
  echo "[WARN] Less than 2 Loop 3 agents, adding devops-engineer" >&2
  VALID_LOOP3+=("devops-engineer")
fi

# Validate and replace invalid Loop 2 agents
VALID_LOOP2=()
for agent in $(echo "$LOOP2_AGENTS" | jq -r '.[]'); do
  if validate_agent "$agent"; then
    VALID_LOOP2+=("$agent")
  else
    echo "[WARN] Invalid Loop 2 agent '$agent', replacing with tester" >&2
    VALID_LOOP2+=("tester")
  fi
done

# Ensure minimum validators (default 3)
while [ ${#VALID_LOOP2[@]} -lt $MIN_VALIDATORS ]; do
  echo "[WARN] Less than $MIN_VALIDATORS Loop 2 validators, adding code-quality-validator" >&2
  VALID_LOOP2+=("code-quality-validator")
done

# Convert arrays to JSON
LOOP3_JSON=$(printf '%s\n' "${VALID_LOOP3[@]}" | jq -R . | jq -s -c .)
LOOP2_JSON=$(printf '%s\n' "${VALID_LOOP2[@]}" | jq -R . | jq -s -c .)

# Build output JSON
OUTPUT=$(jq -n \
  --argjson loop3 "$LOOP3_JSON" \
  --argjson loop2 "$LOOP2_JSON" \
  --arg product_owner "$PRODUCT_OWNER" \
  --arg category "$CATEGORY" \
  --argjson confidence "$CONFIDENCE" \
  '{
    loop3: $loop3,
    loop2: $loop2,
    product_owner: $product_owner,
    category: $category,
    confidence: $confidence
  }')

echo "$OUTPUT" | jq -c .
exit 0
