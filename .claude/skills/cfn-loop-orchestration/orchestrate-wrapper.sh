#!/bin/bash

##############################################################################
# CFN Loop Orchestration Wrapper - Parameter Validation & Fallback Enforcement
# Version: 1.0.0 (BUG #22 Phase 2 - Parameter Fallback)
#
# Purpose:
# Validates and enforces non-empty parameters for orchestrate.sh invocation.
# Applies task-appropriate hardcoded fallbacks when parameters are empty or unset.
# Guarantees that orchestrator is always called with valid, non-empty agent lists.
#
# Usage:
#   ./orchestrate-wrapper.sh --task-id <id> \
#                           --mode <mvp|standard|enterprise> \
#                           [--loop3-agents <agents>] \
#                           [--loop2-agents <agents>] \
#                           [--product-owner <agent>] \
#                           [--task-type <backend|full-stack|default>] \
#                           [--max-iterations <n>] \
#                           [other orchestrate.sh args...]
#
# Exit Codes:
#   0 = Success (orchestrator invoked)
#   1 = Invalid orchestrator path or orchestrator execution failed
#   2 = Missing required parameters (task-id, mode)
##############################################################################

set -euo pipefail

# Determine script location and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ORCHESTRATOR_PATH="$SCRIPT_DIR/orchestrate.sh"

# Parameter storage
TASK_ID=""
MODE=""
LOOP3_AGENTS=""
LOOP2_AGENTS=""
PRODUCT_OWNER=""
TASK_TYPE="default"  # backend, full-stack, or default
REMAINING_ARGS=()

##############################################################################
# Fallback Agent Configuration by Task Type
##############################################################################

# Default fallbacks (for generic tasks with no specific type)
DEFAULT_LOOP3_AGENTS="backend-developer,coder"
DEFAULT_LOOP2_AGENTS="code-reviewer,tester"
DEFAULT_PRODUCT_OWNER="product-owner"

# Backend-specific fallbacks (for API, database, infrastructure tasks)
BACKEND_LOOP3_AGENTS="backend-developer,backend-dev"
BACKEND_LOOP2_AGENTS="code-reviewer,security-specialist,tester"
BACKEND_PRODUCT_OWNER="product-owner"

# Full-stack fallbacks (for tasks requiring both backend and frontend)
FULLSTACK_LOOP3_AGENTS="backend-developer,react-frontend-engineer"
FULLSTACK_LOOP2_AGENTS="code-reviewer,security-specialist,tester,qa-engineer"
FULLSTACK_PRODUCT_OWNER="product-owner"

##############################################################################
# Argument Parsing
##############################################################################

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      if [[ $# -lt 2 ]]; then
        echo "Error: --task-id requires a value" >&2
        exit 2
      fi
      TASK_ID="$2"
      shift 2
      ;;
    --mode)
      if [[ $# -lt 2 ]]; then
        echo "Error: --mode requires a value" >&2
        exit 2
      fi
      MODE="$2"
      shift 2
      ;;
    --loop3-agents)
      if [[ $# -lt 2 ]]; then
        echo "Error: --loop3-agents requires a value" >&2
        exit 2
      fi
      LOOP3_AGENTS="$2"
      shift 2
      ;;
    --loop2-agents)
      if [[ $# -lt 2 ]]; then
        echo "Error: --loop2-agents requires a value" >&2
        exit 2
      fi
      LOOP2_AGENTS="$2"
      shift 2
      ;;
    --product-owner)
      if [[ $# -lt 2 ]]; then
        echo "Error: --product-owner requires a value" >&2
        exit 2
      fi
      PRODUCT_OWNER="$2"
      shift 2
      ;;
    --task-type)
      if [[ $# -lt 2 ]]; then
        echo "Error: --task-type requires a value" >&2
        exit 2
      fi
      TASK_TYPE="$2"
      shift 2
      ;;
    *)
      # Collect remaining arguments for orchestrator
      REMAINING_ARGS+=("$1")
      shift
      ;;
  esac
done

##############################################################################
# Required Parameter Validation
##############################################################################

if [[ -z "$TASK_ID" ]]; then
  echo "❌ Error: --task-id is required" >&2
  exit 2
fi

if [[ -z "$MODE" ]]; then
  echo "❌ Error: --mode is required" >&2
  exit 2
fi

##############################################################################
# Parameter Normalization & Fallback Enforcement
##############################################################################

# Helper function to check if a value is effectively empty
# (handles empty strings, unset variables, and whitespace-only strings)
is_empty() {
  local value="${1:-}"
  # Remove leading/trailing whitespace
  value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [[ -z "$value" ]]
}

# Apply task-type-specific fallbacks to empty parameters
case "$TASK_TYPE" in
  backend)
    # Backend-specific task defaults
    if is_empty "$LOOP3_AGENTS"; then
      LOOP3_AGENTS="$BACKEND_LOOP3_AGENTS"
    fi
    if is_empty "$LOOP2_AGENTS"; then
      LOOP2_AGENTS="$BACKEND_LOOP2_AGENTS"
    fi
    if is_empty "$PRODUCT_OWNER"; then
      PRODUCT_OWNER="$BACKEND_PRODUCT_OWNER"
    fi
    ;;
  full-stack)
    # Full-stack task defaults
    if is_empty "$LOOP3_AGENTS"; then
      LOOP3_AGENTS="$FULLSTACK_LOOP3_AGENTS"
    fi
    if is_empty "$LOOP2_AGENTS"; then
      LOOP2_AGENTS="$FULLSTACK_LOOP2_AGENTS"
    fi
    if is_empty "$PRODUCT_OWNER"; then
      PRODUCT_OWNER="$FULLSTACK_PRODUCT_OWNER"
    fi
    ;;
  *)
    # Default/generic task fallbacks
    if is_empty "$LOOP3_AGENTS"; then
      LOOP3_AGENTS="$DEFAULT_LOOP3_AGENTS"
    fi
    if is_empty "$LOOP2_AGENTS"; then
      LOOP2_AGENTS="$DEFAULT_LOOP2_AGENTS"
    fi
    if is_empty "$PRODUCT_OWNER"; then
      PRODUCT_OWNER="$DEFAULT_PRODUCT_OWNER"
    fi
    ;;
esac

##############################################################################
# Post-Fallback Parameter Validation
##############################################################################

# Verify all parameters are now non-empty (guaranteed by fallbacks)
if is_empty "$LOOP3_AGENTS"; then
  echo "❌ Fatal: LOOP3_AGENTS is empty (fallback failed)" >&2
  echo "   Task Type: $TASK_TYPE" >&2
  echo "   Value: '$LOOP3_AGENTS'" >&2
  exit 1
fi

if is_empty "$LOOP2_AGENTS"; then
  echo "❌ Fatal: LOOP2_AGENTS is empty (fallback failed)" >&2
  echo "   Task Type: $TASK_TYPE" >&2
  echo "   Value: '$LOOP2_AGENTS'" >&2
  exit 1
fi

if is_empty "$PRODUCT_OWNER"; then
  echo "❌ Fatal: PRODUCT_OWNER is empty (fallback failed)" >&2
  echo "   Task Type: $TASK_TYPE" >&2
  echo "   Value: '$PRODUCT_OWNER'" >&2
  exit 1
fi

##############################################################################
# Orchestrator Path Validation
##############################################################################

if [[ ! -f "$ORCHESTRATOR_PATH" ]]; then
  echo "❌ Error: Orchestrator not found at $ORCHESTRATOR_PATH" >&2
  exit 1
fi

if [[ ! -x "$ORCHESTRATOR_PATH" ]]; then
  echo "⚠️  Warning: Orchestrator is not executable. Attempting to fix..." >&2
  chmod +x "$ORCHESTRATOR_PATH" || {
    echo "❌ Error: Cannot make orchestrator executable at $ORCHESTRATOR_PATH" >&2
    exit 1
  }
fi

##############################################################################
# Agent Configuration Logging
##############################################################################

echo "📋 Agent Configuration ($(date +%Y-%m-%d' '%H:%M:%S)):" >&2
echo "   Task ID: $TASK_ID" >&2
echo "   Mode: $MODE" >&2
echo "   Task Type: $TASK_TYPE" >&2
echo "   Loop 3 Agents: $LOOP3_AGENTS" >&2
echo "   Loop 2 Agents: $LOOP2_AGENTS" >&2
echo "   Product Owner: $PRODUCT_OWNER" >&2
echo "" >&2

##############################################################################
# Orchestrator Invocation with Validated Parameters
##############################################################################

# Use exec to replace this process with orchestrator
# This ensures clean exit and proper signal handling
exec "$ORCHESTRATOR_PATH" \
  --task-id "$TASK_ID" \
  --mode "$MODE" \
  --loop3-agents "$LOOP3_AGENTS" \
  --loop2-agents "$LOOP2_AGENTS" \
  --product-owner "$PRODUCT_OWNER" \
  "${REMAINING_ARGS[@]}"

# Note: exec replaces the shell process, so code below never executes
# Exit code comes directly from orchestrator execution
