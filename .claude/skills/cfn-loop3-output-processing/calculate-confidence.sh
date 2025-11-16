#!/bin/bash
set -euo pipefail

FILES_CHANGED=0
DELIVERABLES="[]"

while [[ $# -gt 0 ]]; do
  case $1 in
    --files-changed) FILES_CHANGED="$2"; shift 2 ;;
    --deliverables) DELIVERABLES="$2"; shift 2 ;;
    *) echo "ERROR: Unknown parameter: $1" >&2; exit 1 ;;
  esac
done

# Calculate confidence based on deliverables
if (( FILES_CHANGED == 0 )); then
  # No files changed - agent did not deliver
  echo "0.0"
elif (( FILES_CHANGED <= 2 )); then
  # Minimal changes - low confidence
  echo "0.50"
elif (( FILES_CHANGED <= 5 )); then
  # Moderate changes - medium confidence
  echo "0.75"
else
  # Significant changes - high confidence
  echo "0.85"
fi
