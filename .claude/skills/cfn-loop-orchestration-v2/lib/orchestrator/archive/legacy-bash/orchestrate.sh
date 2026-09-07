#!/usr/bin/env bash

##############################################################################
# DEPRECATED: Use ./dist/cli/orchestrator-cli.js instead
#
# This bash wrapper is preserved for reference only.
# Migrate to the TypeScript CLI for improved type safety and performance.
#
# NEW: ./dist/cli/orchestrator-cli.js --task-id <id> --mode <mode> ...
# OLD: ./orchestrate.sh --task-id <id> --mode <mode> ...
##############################################################################

##############################################################################
# Bash Wrapper for TypeScript Orchestrator [DEPRECATED]
# Provides backward compatibility with bash-based orchestration
# Routes all calls to TypeScript implementation
#
# Usage:
#   ./orchestrate-ts.sh --task-id <id> \
#                       --mode <mvp|standard|enterprise> \
#                       --max-iterations <n> \
#                       [--loop3-agents <agents>] \
#                       [--loop2-agents <agents>] \
#                       [--product-owner <agent>] \
#                       [--success-criteria <flag>]
##############################################################################

set -euo pipefail

# Determine script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Handle both locations: helpers/orchestrate-ts.sh and root orchestrate.sh
if [[ "$SCRIPT_DIR" == *"/helpers" ]]; then
  ORCHESTRATION_SKILL="$SCRIPT_DIR/.."
else
  ORCHESTRATION_SKILL="$SCRIPT_DIR"
fi

# Input validation
sanitize_input() {
  local input="$1"
  local max_length="${2:-256}"

  input="${input:0:$max_length}"
  echo "$input" | sed 's/[^a-zA-Z0-9._:, /-]//g'
}

# Configuration
TASK_ID=""
MODE="standard"
MAX_ITERATIONS=10
LOOP3_AGENTS=""
LOOP2_AGENTS=""
PRODUCT_OWNER=""
SUCCESS_CRITERIA=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      if [[ $# -lt 2 ]]; then
        echo "Error: --task-id requires a value" >&2
        exit 1
      fi
      TASK_ID=$(sanitize_input "$2") || { echo "Invalid task ID"; exit 1; }
      shift 2
      ;;
    --mode)
      if [[ $# -lt 2 ]]; then
        echo "Error: --mode requires a value" >&2
        exit 1
      fi
      MODE="$2"
      if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
        echo "Invalid mode. Must be mvp, standard, or enterprise." >&2
        exit 1
      fi
      shift 2
      ;;
    --max-iterations)
      if [[ $# -lt 2 ]]; then
        echo "Error: --max-iterations requires a value" >&2
        exit 1
      fi
      if [[ ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Max iterations must be a positive integer" >&2
        exit 1
      fi
      if [[ "$2" -gt 100 ]]; then
        echo "Max iterations cannot exceed 100" >&2
        exit 1
      fi
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --loop3-agents)
      if [[ $# -lt 2 ]]; then
        echo "Error: --loop3-agents requires a value" >&2
        exit 1
      fi
      LOOP3_AGENTS=$(sanitize_input "$2" 512) || { echo "Invalid loop3-agents"; exit 1; }
      shift 2
      ;;
    --loop2-agents)
      if [[ $# -lt 2 ]]; then
        echo "Error: --loop2-agents requires a value" >&2
        exit 1
      fi
      LOOP2_AGENTS=$(sanitize_input "$2" 512) || { echo "Invalid loop2-agents"; exit 1; }
      shift 2
      ;;
    --product-owner)
      if [[ $# -lt 2 ]]; then
        echo "Error: --product-owner requires a value" >&2
        exit 1
      fi
      PRODUCT_OWNER=$(sanitize_input "$2") || { echo "Invalid product-owner"; exit 1; }
      shift 2
      ;;
    --success-criteria)
      if [[ $# -lt 2 ]]; then
        echo "Error: --success-criteria requires a value" >&2
        exit 1
      fi
      SUCCESS_CRITERIA="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown option: '$1'" >&2
      echo "Usage: $0 --task-id <id> --mode <mode> [--max-iterations <n>] [--loop3-agents <agents>] [--loop2-agents <agents>] [--product-owner <agent>] [--success-criteria <flag>]" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$TASK_ID" ]; then
  echo "Error: --task-id is required" >&2
  exit 1
fi

# Ensure TypeScript is compiled
if [ ! -d "$ORCHESTRATION_SKILL/dist" ]; then
  echo "Building TypeScript orchestrator..." >&2
  cd "$ORCHESTRATION_SKILL"
  npm run build >/dev/null 2>&1 || {
    echo "Error: Failed to build TypeScript orchestrator" >&2
    exit 1
  }
fi

# Build the node invocation with all parameters
NODE_ARGS=(
  "$ORCHESTRATION_SKILL/dist/orchestrate.js"
  --task-id "$TASK_ID"
  --mode "$MODE"
  --max-iterations "$MAX_ITERATIONS"
)

# Add optional parameters if provided
if [[ -n "$LOOP3_AGENTS" ]]; then
  NODE_ARGS+=(--loop3-agents "$LOOP3_AGENTS")
fi

if [[ -n "$LOOP2_AGENTS" ]]; then
  NODE_ARGS+=(--loop2-agents "$LOOP2_AGENTS")
fi

if [[ -n "$PRODUCT_OWNER" ]]; then
  NODE_ARGS+=(--product-owner "$PRODUCT_OWNER")
fi

if [[ -n "$SUCCESS_CRITERIA" ]]; then
  NODE_ARGS+=(--success-criteria "$SUCCESS_CRITERIA")
fi

# Execute TypeScript orchestrator via Node
node "${NODE_ARGS[@]}"

exit $?
