#!/usr/bin/env bash

##############################################################################
# Deliverable Verifier
# Verifies expected deliverables were created (prevents "consensus on vapor")
#
# Usage:
#   deliverable-verifier.sh --expected-files <file1,file2,...> \
#                           --task-type <keyword-detection>
#
# Returns:
#   Exit 0: Deliverables verified
#   Exit 1: Missing deliverables
##############################################################################

set -euo pipefail

# Parameters
EXPECTED_FILES=""
TASK_TYPE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --expected-files) EXPECTED_FILES="$2"; shift 2 ;;
    --task-type) TASK_TYPE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Check git status for file changes
GIT_CHANGES=$(git status --short | wc -l)

echo "Deliverable Verification:"
echo "  Git changes detected: $GIT_CHANGES files"

# If expected files specified, check them explicitly
if [ -n "$EXPECTED_FILES" ]; then
  IFS=',' read -ra FILE_ARRAY <<< "$EXPECTED_FILES"
  MISSING_COUNT=0

  for file in "${FILE_ARRAY[@]}"; do
    if [ -f "$file" ]; then
      echo "  ✅ Found: $file"
    else
      echo "  ❌ Missing: $file"
      MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
  done

  if [ $MISSING_COUNT -gt 0 ]; then
    echo "❌ Deliverable verification FAILED: $MISSING_COUNT missing files"
    exit 1
  fi
fi

# Keyword-based task type detection
if [ -n "$TASK_TYPE" ]; then
  if [[ "$TASK_TYPE" =~ (create|build|implement|add|generate) ]]; then
    # Implementation tasks require file changes
    if [ $GIT_CHANGES -eq 0 ]; then
      echo "❌ Implementation task detected but no files created"
      echo "   Task type: $TASK_TYPE"
      echo "   This is 'consensus on vapor' - forcing iteration"
      exit 1
    fi
  fi
fi

echo "✅ Deliverable verification PASSED"
exit 0
