#!/usr/bin/env bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: coordination-wrapper.js
#
# This script will be removed in 90 days. Please migrate to TypeScript.
#
# Migration Guide: See docs/BASH_DEPRECATION_NOTICE.md
# TypeScript Benefits:
#   - Type safety (zero runtime type errors)
#   - 90%+ test coverage
#   - Better performance
#   - Comprehensive documentation
#
# Automatic Migration:
#   Set USE_TYPESCRIPT=true to use TypeScript implementation automatically
#
##############################################################################


##############################################################################
# Cancel Swarm - Graceful shutdown for all agents in a swarm
#
# Publishes shutdown signals to all active agents via their wake channels,
# marks swarm status as cancelled, and reports cancellation metrics.
#
# Usage:
#   ./cancel-swarm.sh --task-id <id> \
#                     [--reason <text>] \
#                     [--initiator <name>] \
#                     [--force]
#
# Options:
#   --task-id      Task/swarm identifier (required)
#   --reason       Cancellation reason (default: user_requested_cancellation)
#   --initiator    Who initiated cancellation (default: main-chat)
#   --force        Skip confirmation prompt
#
# Shutdown Signal Format (broadcasted to shutdown channel):
# {
#   "reason": "user_requested_cancellation",
#   "timestamp": 1760896218,
#   "initiator": "main-chat"
# }
#
# How It Works:
#   1. Broadcasts a single shutdown message to swarm:${TASK_ID}:shutdown
#   2. All agents in waiting mode poll this key every 1 second
#   3. When agents detect the shutdown signal, they exit gracefully (exit 130)
#   4. Swarm metadata is updated to status="cancelled" with metrics
#
# Benefits:
#   - Graceful agent termination (agents receive explicit shutdown signal)
#   - Prevents orphaned BLPOP operations
#   - Audit trail (cancellation reason + timestamp)
#   - Cleanup coordination (all agents notified simultaneously)
##############################################################################

set -euo pipefail

# Configuration
TASK_ID=""
REASON="user_requested_cancellation"
INITIATOR="main-chat"
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --reason)
      REASON="$2"
      shift 2
      ;;
    --initiator)
      INITIATOR="$2"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --task-id <id> [--reason <text>] [--initiator <name>] [--force]"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$TASK_ID" ]; then
  echo "Error: --task-id required"
  echo "Usage: $0 --task-id <id>"
  exit 1
fi

# Look for swarm metadata (try both task-id and swarm-id patterns)
METADATA_KEY="swarm:${TASK_ID}:metadata"
SWARM_ID_KEY=""

# Check if metadata exists with task-id
if redis-cli exists "$METADATA_KEY" | grep -q "1"; then
  SWARM_ID_KEY="$METADATA_KEY"
else
  # Try to find swarm by task_id field
  SWARM_KEYS=$(redis-cli --scan --pattern "swarm:*:metadata" 2>/dev/null || echo "")

  if [ -n "$SWARM_KEYS" ]; then
    for KEY in $SWARM_KEYS; do
      TASK_VAL=$(redis-cli hget "$KEY" task_id 2>/dev/null || echo "")
      if [ "$TASK_VAL" = "$TASK_ID" ]; then
        SWARM_ID_KEY="$KEY"
        break
      fi
    done
  fi
fi

# Validate swarm exists
if [ -z "$SWARM_ID_KEY" ]; then
  echo "Error: No swarm found for task-id: $TASK_ID"
  echo "Hint: Verify task-id or check 'list-active-swarms.sh' for active swarms"
  exit 1
fi

# Extract swarm_id from key
SWARM_ID=$(redis-cli hget "$SWARM_ID_KEY" swarm_id)

# Get agent list
AGENTS_STR=$(redis-cli hget "$SWARM_ID_KEY" agents)
if [ -z "$AGENTS_STR" ] || [ "$AGENTS_STR" = "(nil)" ]; then
  echo "Warning: No agents found in swarm metadata"
  AGENTS_STR=""
fi

# Get current swarm status
CURRENT_STATUS=$(redis-cli hget "$SWARM_ID_KEY" status)

echo "========================================="
echo "Swarm Cancellation Request"
echo "========================================="
echo "Swarm ID:       $SWARM_ID"
echo "Task ID:        $TASK_ID"
echo "Current Status: $CURRENT_STATUS"
echo "Agents:         $AGENTS_STR"
echo "Reason:         $REASON"
echo "Initiator:      $INITIATOR"
echo "========================================="

# Confirmation prompt (unless --force)
if [ "$FORCE" = false ]; then
  read -p "Proceed with cancellation? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Cancellation aborted by user."
    exit 0
  fi
fi

echo ""
echo "[Cancel] Starting graceful shutdown..."

# Build shutdown message
TIMESTAMP=$(date +%s)
SHUTDOWN_MSG=$(jq -n \
  --arg reason "$REASON" \
  --arg ts "$TIMESTAMP" \
  --arg init "$INITIATOR" \
  '{
    reason: $reason,
    timestamp: ($ts | tonumber),
    initiator: $init
  }')

# Broadcast shutdown signal to all waiting agents
SHUTDOWN_KEY="swarm:${TASK_ID}:shutdown"

# Use LPUSH to add shutdown signal (all agents in waiting mode will check this key)
if echo "$SHUTDOWN_MSG" | redis-cli -x LPUSH "$SHUTDOWN_KEY" > /dev/null 2>&1; then
  echo "[Cancel] ✓ Shutdown signal broadcasted to: $SHUTDOWN_KEY"
else
  echo "[Cancel] ✗ Failed to broadcast shutdown signal"
  exit 1
fi

# Set TTL on shutdown key to prevent indefinite retention
redis-cli expire "$SHUTDOWN_KEY" 3600 > /dev/null 2>&1 || true

# Counter for agent list (for metrics)
AGENT_COUNT=0
if [ -n "$AGENTS_STR" ]; then
  IFS=',' read -ra AGENT_ARRAY <<< "$AGENTS_STR"
  AGENT_COUNT=${#AGENT_ARRAY[@]}

  echo "[Cancel] Agents in swarm: $AGENT_COUNT"
  for AGENT_ID in "${AGENT_ARRAY[@]}"; do
    AGENT_ID=$(echo "$AGENT_ID" | xargs)
    if [ -n "$AGENT_ID" ]; then
      echo "[Cancel]   - $AGENT_ID (will receive shutdown on next poll)"
    fi
  done
else
  echo "[Cancel] No agents in swarm"
fi

# Note: We broadcast once to all agents instead of individual notifications
# This is more efficient and follows the same pattern as invoke-waiting-mode.sh shutdown command
NOTIFIED_COUNT="$AGENT_COUNT"
FAILED_COUNT=0

# Update swarm metadata
redis-cli hset "$SWARM_ID_KEY" \
  status "cancelled" \
  cancelled_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  cancellation_reason "$REASON" \
  cancellation_initiator "$INITIATOR" \
  agents_notified "$NOTIFIED_COUNT" \
  agents_failed "$FAILED_COUNT" > /dev/null

echo ""
echo "========================================="
echo "Cancellation Summary"
echo "========================================="
echo "Swarm ID:          $SWARM_ID"
echo "Status:            cancelled"
echo "Agents in Swarm:   $NOTIFIED_COUNT"
echo "Shutdown Broadcast: Sent to $SHUTDOWN_KEY"
echo ""
echo "Note: All agents in waiting mode will receive"
echo "      the shutdown signal on their next poll"
echo "      cycle (max 1 second delay)."
echo "========================================="
echo ""

echo "[Cancel] ✅ Graceful shutdown complete"
exit 0
