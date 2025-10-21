#!/bin/bash
# Deliverable Verification - Prevent "consensus on vapor"

set -euo pipefail

# Parse arguments
TASK_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$TASK_ID" ]; then
  echo "ERROR: --task-id required" >&2
  exit 1
fi

# Get task description from Redis
TASK_DESC=$(redis-cli GET "swarm:${TASK_ID}:task" 2>/dev/null || echo "")

# Check if task requires implementation (file creation)
REQUIRES_FILES=false
if echo "$TASK_DESC" | grep -qiE "create|build|implement|generate|file|component|module|test|write|add"; then
  REQUIRES_FILES=true
fi

# If task doesn't require files, skip verification
if [ "$REQUIRES_FILES" = false ]; then
  echo "PASSED"
  exit 0
fi

# Check for file changes in git
FILES_CREATED=$(git status --short 2>/dev/null | grep -E "^(A|M|\?\?)" | wc -l)

if [ "$FILES_CREATED" -eq 0 ]; then
  echo "FAILED"
  exit 0
else
  echo "PASSED"
  exit 0
fi
