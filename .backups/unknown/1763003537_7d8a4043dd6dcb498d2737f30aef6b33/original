#!/usr/bin/env bash

##############################################################################
# Complete Swarm - Mark swarm as completed with final metrics
#
# Updates swarm metadata status to "completed" and stores final metrics.
#
# Usage:
#   ./complete-swarm.sh --swarm-id <id> \
#                       [--final-metric <name=value>] \
#                       [--final-metric <name=value>] ...
#
# Example:
#   ./complete-swarm.sh --swarm-id "swarm-auth-123" \
#                       --final-metric "consensus=0.92" \
#                       --final-metric "iterations=3"
##############################################################################

set -euo pipefail

# Configuration
SWARM_ID=""
declare -A FINAL_METRICS

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --swarm-id)
      SWARM_ID="$2"
      shift 2
      ;;
    --final-metric)
      # Parse name=value
      IFS='=' read -r KEY VALUE <<< "$2"
      FINAL_METRICS["$KEY"]="$VALUE"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --swarm-id <id> [--final-metric <name=value>]"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$SWARM_ID" ]; then
  echo "Error: --swarm-id required"
  echo "Usage: $0 --swarm-id <id>"
  exit 1
fi

METADATA_KEY="swarm:${SWARM_ID}:metadata"

# Check if swarm exists
if ! redis-cli exists "$METADATA_KEY" | grep -q "1"; then
  echo "Error: Swarm not found: $SWARM_ID"
  exit 1
fi

echo "[Swarm] Completing swarm: $SWARM_ID"

# Update status
redis-cli hset "$METADATA_KEY" \
  status "completed" \
  completed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /dev/null

# Add final metrics
for KEY in "${!FINAL_METRICS[@]}"; do
  VALUE="${FINAL_METRICS[$KEY]}"
  redis-cli hset "$METADATA_KEY" "$KEY" "$VALUE" > /dev/null
  echo "[Swarm] Stored metric: $KEY = $VALUE"
done

echo "[Swarm] ✅ Completion recorded"
