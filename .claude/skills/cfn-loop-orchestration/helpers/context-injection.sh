#!/usr/bin/env bash

#!/usr/bin/env bash

##############################################################################
# CFN Loop Context Injection Helper - Phase 3.3 Integration
# Unified ACE context injection using invoke-context-inject.sh
#
# Usage:
#   source context-injection.sh
#   inject_ace_context "$TASK_DESCRIPTION" "$TASK_TAGS" "$DOMAIN"
##############################################################################

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ACE_INJECT_SCRIPT="${PROJECT_ROOT}/.claude/skills/cfn-ace-system/invoke-context-inject.sh"

##############################################################################
# Inject ACE Context (Unified Positive + Negative)
##############################################################################
inject_ace_context() {
  local task_description="$1"
  local task_tags="${2:-}"
  local domain="${3:-}"
  local enable_ace="${4:-true}"
  local output_file="${5:-}"

  # Validate dependencies
  if [ ! -f "$ACE_INJECT_SCRIPT" ]; then
    echo "# ACE Context (Unavailable)"
    echo ""
    echo "_ACE context injection script not found._"
    return 1
  fi

  # Build invocation parameters
  local invoke_params="--task-description \"$task_description\""

  if [ -n "$task_tags" ]; then
    invoke_params="$invoke_params --task-tags \"$task_tags\""
  fi

  if [ -n "$domain" ]; then
    invoke_params="$invoke_params --domain \"$domain\""
  fi

  invoke_params="$invoke_params --enable-ace $enable_ace"

  if [ -n "$output_file" ]; then
    invoke_params="$invoke_params --output \"$output_file\""
  fi

  # Execute unified context injection
  eval "$ACE_INJECT_SCRIPT" $invoke_params 2>/dev/null || {
    echo "# ACE Context (Error)"
    echo ""
    echo "_Failed to retrieve ACE context._"
    return 1
  }

  return 0
}

##############################################################################
# Extract Tags from Context (Helper for Orchestrator)
##############################################################################
extract_tags_from_context() {
  local context_json="$1"

  # Extract tags from deliverables, acceptance criteria, etc.
  local extracted_tags
  extracted_tags=$(echo "$context_json" | jq -r '
    [
      (.deliverables // [] | .[]),
      (.acceptanceCriteria // [] | .[]),
      (.epicGoal // "" | split(" ") | .[])
    ] |
    map(select(. != "")) |
    unique |
    join(",")
  ' 2>/dev/null || echo "")

  echo "$extracted_tags"
}

##############################################################################
# Classify Domain from Task Description (Helper)
##############################################################################
classify_domain() {
  local task_description="$1"

  local classifier_script="${PROJECT_ROOT}/.claude/skills/cfn-task-classifier/classify-task.sh"

  if [ ! -f "$classifier_script" ]; then
    echo "general"
    return
  fi

  local classification
  classification=$("$classifier_script" "$task_description" --format json 2>/dev/null || echo '{"domains":["general"]}')

  local primary_domain
  primary_domain=$(echo "$classification" | jq -r '.domains[0] // "general"')

  echo "$primary_domain"
}

##############################################################################
# Main Context Injection Wrapper (For Orchestrator Use)
##############################################################################
inject_context_for_agent() {
  local agent_type="$1"
  local task_id="$2"
  local iteration="${3:-1}"

  # Retrieve task context from Redis
  local task_context
  if command -v redis-cli &> /dev/null; then
    task_context=$(redis-cli HGET "cfn_loop:task:$task_id:context" "task_description" 2>/dev/null || echo "")
  else
    task_context=""
  fi

  if [ -z "$task_context" ]; then
    echo "# ACE Context (No Task Description)"
    echo ""
    echo "_Task description not available for context injection._"
    return 1
  fi

  # Extract tags and classify domain
  local task_tags=$(extract_tags_from_context "$task_context")
  local domain=$(classify_domain "$task_context")

  # Inject unified context
  inject_ace_context "$task_context" "$task_tags" "$domain" "true" ""

  return 0
}