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


# Agent Logging Utility - Dual output (terminal + Redis)
#
# Usage:
#   source agent-log.sh
#   agent_log "info" "Message here"
#   agent_log "error" "Error occurred"
#
# Or as standalone:
#   ./agent-log.sh "info" "Agent started" --agent-id "researcher-1" --task-id "task-123"

set -euo pipefail

# Source centralized Redis functions (provides graceful fallback for Task mode)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/redis-functions.sh"

# Color codes for terminal output
COLOR_RESET="\033[0m"
COLOR_DEBUG="\033[0;36m"   # Cyan
COLOR_INFO="\033[0;32m"    # Green
COLOR_WARN="\033[0;33m"    # Yellow
COLOR_ERROR="\033[0;31m"   # Red
COLOR_AGENT="\033[0;35m"   # Magenta

# Get color for log level
get_log_color() {
  local level="$1"
  case "$level" in
    debug) echo "$COLOR_DEBUG" ;;
    info)  echo "$COLOR_INFO" ;;
    warn)  echo "$COLOR_WARN" ;;
    error) echo "$COLOR_ERROR" ;;
    *) echo "$COLOR_RESET" ;;
  esac
}

# Main logging function
# Usage: agent_log <level> <message> [--agent-id <id>] [--task-id <id>] [--no-terminal] [--no-redis]
agent_log() {
  local LEVEL="${1:-info}"
  local MESSAGE="${2:-}"
  local AGENT_ID="${AGENT_ID:-unknown}"
  local TASK_ID="${TASK_ID:-unknown}"
  local REPOSITORY=$(basename "$(pwd)")
  local NO_TERMINAL=false
  local NO_REDIS=false

  # Parse optional arguments
  shift 2 || true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --agent-id)
        AGENT_ID="$2"
        shift 2
        ;;
      --task-id)
        TASK_ID="$2"
        shift 2
        ;;
      --no-terminal)
        NO_TERMINAL=true
        shift
        ;;
      --no-redis)
        NO_REDIS=true
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  local TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local COLOR=$(get_log_color "$LEVEL")

  # 1. Terminal output (with colors)
  if [ "$NO_TERMINAL" = false ]; then
    echo -e "${COLOR}[${LEVEL^^}]${COLOR_RESET} ${COLOR_AGENT}[${AGENT_ID}]${COLOR_RESET} ${MESSAGE}"
  fi

  # 2. File output (no colors, in /tmp)
  local LOG_FILE="/tmp/agent-${AGENT_ID}.log"
  echo "[${TIMESTAMP}] [${LEVEL^^}] [${AGENT_ID}] ${MESSAGE}" >> "$LOG_FILE"

  # 3. Redis pub/sub (for portal)
  if [ "$NO_REDIS" = false ]; then
    local LOG_PAYLOAD=$(cat <<EOF
{
  "level": "${LEVEL}",
  "message": "${MESSAGE}",
  "agentId": "${AGENT_ID}",
  "taskId": "${TASK_ID}",
  "repository": "${REPOSITORY}",
  "timestamp": "${TIMESTAMP}"
}
EOF
)

    # Publish to Redis channel: swarm:<task-id>:logs
    redis-cli publish "swarm:${TASK_ID}:logs" "$LOG_PAYLOAD" > /dev/null 2>&1 || true

    # Also add to sorted set for persistence (with timestamp as score)
    local SCORE=$(date +%s)
    redis-cli zadd "swarm:${TASK_ID}:logs:history" "$SCORE" "$LOG_PAYLOAD" > /dev/null 2>&1 || true

    # Set TTL on history (7 days)
    redis-cli expire "swarm:${TASK_ID}:logs:history" 604800 > /dev/null 2>&1 || true
  fi
}

# If script is executed directly (not sourced)
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if [ $# -lt 2 ]; then
    echo "Usage: $0 <level> <message> [--agent-id <id>] [--task-id <id>]"
    echo ""
    echo "Levels: debug, info, warn, error"
    echo ""
    echo "Examples:"
    echo "  $0 info \"Agent started\" --agent-id researcher-1 --task-id task-123"
    echo "  $0 error \"Connection failed\" --agent-id reviewer-2 --task-id task-456"
    exit 1
  fi

  agent_log "$@"
fi
