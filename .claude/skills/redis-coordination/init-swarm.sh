#!/usr/bin/env bash

##############################################################################
# Initialize Swarm - Redis Coordination Primitive
#
# Creates swarm metadata in Redis for coordination tracking across any
# multi-agent workflow (CFN Loop, independent swarms, custom orchestration).
#
# Usage:
#   ./init-swarm.sh --swarm-id <id> \
#                   --agents <agent1,agent2,...> \
#                   [--task-id <id>] \
#                   [--topology <mesh|hierarchical|chain>] \
#                   [--ttl <seconds>] \
#                   [--metadata <json-string>]
#
# Per-Agent Timeout Configuration:
#   Agents can have custom timeout values set via Redis:
#
#   redis-cli SETEX "swarm:<task-id>:<agent-id>:timeout" 86400 <timeout-seconds>
#
#   If no custom timeout is set, the orchestrator will use role-based defaults:
#   - researcher: 7200s (2 hours)
#   - backend-dev, coder, frontend-dev: 3600s (1 hour)
#   - reviewer, tester, security: 1800s (30 minutes)
#   - coordinator, orchestrator, product-owner: 900s (15 minutes)
#   - default: 3600s (1 hour)
#
# Benefits:
#   - Namespace isolation for concurrent swarms
#   - Agent inventory and resource tracking
#   - Status monitoring (in_progress/completed)
#   - Automatic cleanup via TTL
#   - Per-agent timeout configuration via get-agent-timeout.sh
##############################################################################

set -euo pipefail

# Configuration
SWARM_ID=""
AGENTS=""
TASK_ID=""
TOPOLOGY="mesh"
TTL=604800  # 7 days default
MAX_AGENTS=""
METADATA_EXTRA=""
AGENT_TIMEOUTS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --swarm-id)
      SWARM_ID="$2"
      shift 2
      ;;
    --agents)
      AGENTS="$2"
      shift 2
      ;;
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --topology)
      TOPOLOGY="$2"
      shift 2
      ;;
    --ttl)
      TTL="$2"
      shift 2
      ;;
    --max-agents)
      MAX_AGENTS="$2"
      shift 2
      ;;
    --metadata)
      METADATA_EXTRA="$2"
      shift 2
      ;;
    --agent-timeouts)
      AGENT_TIMEOUTS="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --swarm-id <id> --agents <agent1,agent2,...> [options]"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$SWARM_ID" ] || [ -z "$AGENTS" ]; then
  echo "Error: Required parameters missing"
  echo "Usage: $0 --swarm-id <id> --agents <agent1,agent2,...>"
  exit 1
fi

# Calculate max agents if not provided
if [ -z "$MAX_AGENTS" ]; then
  IFS=',' read -ra AGENT_ARRAY <<< "$AGENTS"
  MAX_AGENTS=${#AGENT_ARRAY[@]}
fi

# Use swarm-id as task-id if not provided
if [ -z "$TASK_ID" ]; then
  TASK_ID="$SWARM_ID"
fi

echo "[Swarm] Initializing swarm: $SWARM_ID"
echo "[Swarm] Topology: $TOPOLOGY"
echo "[Swarm] Total agents: $MAX_AGENTS"
echo "[Swarm] TTL: $TTL seconds ($(($TTL / 86400)) days)"

# Create swarm metadata key
METADATA_KEY="swarm:${SWARM_ID}:metadata"

# Store base metadata
redis-cli hset "$METADATA_KEY" \
  swarm_id "$SWARM_ID" \
  task_id "$TASK_ID" \
  topology "$TOPOLOGY" \
  max_agents "$MAX_AGENTS" \
  agents "$AGENTS" \
  created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  status "in_progress" > /dev/null

# Add extra metadata if provided (JSON string)
if [ -n "$METADATA_EXTRA" ]; then
  # Parse JSON and add each key-value pair
  echo "$METADATA_EXTRA" | jq -r 'to_entries | .[] | "\(.key) \(.value)"' | while read -r KEY VALUE; do
    redis-cli hset "$METADATA_KEY" "$KEY" "$VALUE" > /dev/null
  done
fi

# Set TTL
redis-cli expire "$METADATA_KEY" "$TTL" > /dev/null

echo "[Swarm] Registered in Redis: $METADATA_KEY"
echo "[Swarm] ✅ Initialization complete"

# Output swarm ID for chaining
echo "$SWARM_ID"
