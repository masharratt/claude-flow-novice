#!/usr/bin/env bash

##############################################################################
# Store Epic Context in Redis
# Stores epic-level context for CLI-spawned agents to access
#
# Usage:
#   ./store-epic-context.sh --task-id <id> \
#                           --epic-context <json> \
#                           [--phase-context <json>] \
#                           [--success-criteria <json>] \
#                           [--ttl <seconds>]
#
# Example:
#   ./store-epic-context.sh --task-id "epic-auth-123" \
#     --epic-context '{
#       "epicGoal": "Build authentication system",
#       "inScope": ["JWT auth", "RBAC", "Session management"],
#       "outOfScope": ["OAuth", "MFA", "Biometrics"],
#       "phases": ["assessment", "implementation", "validation"]
#     }' \
#     --phase-context '{
#       "currentPhase": "assessment",
#       "dependencies": [],
#       "deliverables": ["Requirements doc", "Architecture design"]
#     }' \
#     --success-criteria '{
#       "acceptanceCriteria": [
#         "Core functionality implemented",
#         "Tests pass >80% coverage",
#         "Security review complete"
#       ],
#       "gateThreshold": 0.75,
#       "consensusThreshold": 0.90
#     }' \
#     --ttl 86400
#
# Redis Keys Created:
#   - swarm:<task-id>:epic-context
#   - swarm:<task-id>:phase-context
#   - swarm:<task-id>:success-criteria
#
# These keys are automatically read by cfn-spawn and injected as environment
# variables into spawned agents:
#   - EPIC_CONTEXT
#   - PHASE_CONTEXT
#   - SUCCESS_CRITERIA
##############################################################################

set -euo pipefail

# Configuration
TASK_ID=""
EPIC_CONTEXT=""
PHASE_CONTEXT=""
SUCCESS_CRITERIA=""
TTL=86400  # 24 hours default

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --epic-context)
      EPIC_CONTEXT="$2"
      shift 2
      ;;
    --phase-context)
      PHASE_CONTEXT="$2"
      shift 2
      ;;
    --success-criteria)
      SUCCESS_CRITERIA="$2"
      shift 2
      ;;
    --ttl)
      TTL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$TASK_ID" ]; then
  echo "Error: --task-id is required"
  exit 1
fi

if [ -z "$EPIC_CONTEXT" ]; then
  echo "Error: --epic-context is required"
  exit 1
fi

# Store epic context
echo "Storing epic context for task: $TASK_ID"

if [ -n "$EPIC_CONTEXT" ]; then
  redis-cli set "swarm:${TASK_ID}:epic-context" "$EPIC_CONTEXT" EX "$TTL" > /dev/null
  echo "  ✓ Epic context stored (TTL: ${TTL}s)"
fi

if [ -n "$PHASE_CONTEXT" ]; then
  redis-cli set "swarm:${TASK_ID}:phase-context" "$PHASE_CONTEXT" EX "$TTL" > /dev/null
  echo "  ✓ Phase context stored (TTL: ${TTL}s)"
fi

if [ -n "$SUCCESS_CRITERIA" ]; then
  redis-cli set "swarm:${TASK_ID}:success-criteria" "$SUCCESS_CRITERIA" EX "$TTL" > /dev/null
  echo "  ✓ Success criteria stored (TTL: ${TTL}s)"
fi

echo "✅ Context storage complete"
echo ""
echo "CLI-spawned agents will automatically receive this context via environment variables:"
echo "  - EPIC_CONTEXT"
echo "  - PHASE_CONTEXT"
echo "  - SUCCESS_CRITERIA"
