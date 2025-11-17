#!/bin/bash

# ACE System - Task Classifier Wrapper
# Delegates to cfn-task-classifier skill for domain classification

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLASSIFIER_PATH="${SCRIPT_DIR}/../cfn-task-classifier/classify-task.sh"

# Validate classifier exists
if [[ ! -f "$CLASSIFIER_PATH" ]]; then
  echo "ERROR: Task classifier not found at: $CLASSIFIER_PATH" >&2
  exit 1
fi

# Delegate to task classifier with all arguments
exec "$CLASSIFIER_PATH" "$@"
