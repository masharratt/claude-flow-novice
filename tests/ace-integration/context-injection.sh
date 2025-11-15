#!/usr/bin/env bash
set -euo pipefail

# Mock context injection script for testing
AGENT_TYPE=""
CONTEXT_KEY=""
HISTORICAL_CONTEXT=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --agent-type)
      AGENT_TYPE="$2"
      shift 2
      ;;
    --context-key)
      CONTEXT_KEY="$2"
      shift 2
      ;;
    --historical-context)
      HISTORICAL_CONTEXT="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [[ -z "$AGENT_TYPE" ]] || [[ -z "$CONTEXT_KEY" ]]; then
  echo "Missing required parameters"
  exit 1
fi

# Fetch context from Redis
CONTEXT=$(redis-cli GET "$CONTEXT_KEY")

# Fallback/error handling
if [[ -z "$CONTEXT" ]]; then
  echo "Fallback to general context"
  CONTEXT=$(redis-cli GET "cfn_loop:context-test:general_context")
fi

# Mock processing
case "$AGENT_TYPE" in
  "backend-dev")
    echo "## Backend Context

### Strategies
* Backend Strategy 1
* Backend Strategy 2
* Backend Strategy 3

### Anti-Patterns
* Backend Anti-Pattern 1
* Backend Anti-Pattern 2

### Edge Cases
* Backend Edge Case 1"
    ;;
  "frontend-dev")
    echo "## Frontend Context

### Strategies
* Frontend Strategy 1
* Frontend Strategy 2

### Anti-Patterns
* Frontend Anti-Pattern 1"
    ;;
  *)
    echo "## General Context

### Strategies
* General Strategy 1"
    ;;
esac