#!/bin/bash

# Agent Spawning CLI Wrapper
# Enables agents to spawn other agents or stop existing agents via simple CLI interface

set -euo pipefail

# ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Block Task Mode agents
# Task Mode agents spawn via Task() tool and should NOT use agent spawning CLI
if [[ -z "${1:-}" || -z "${TASK_ID:-}" ]]; then
    echo "❌ TASK MODE DETECTED - Agent spawning CLI forbidden" >&2
    echo "🚨 ANTI-023: This script is for CLI-spawned coordinators only" >&2
    echo "💡 Task Mode agent spawning should be handled directly by Main Chat" >&2
    echo "🔧 Agent spawned via Task() tool - use Task() tool for spawning instead" >&2
    exit 1
fi

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================
log_error() {
    echo "[ERROR] $*" >&2
}

log_warning() {
    echo "[WARNING] $*" >&2
}

log_info() {
    echo "[INFO] $*"
}

# ============================================================================
# DEPENDENCY CHECKS
# ============================================================================

check_dependencies() {
  local missing_deps=()

  # Check bash version
  if [[ "${BASH_VERSINFO[0]}" -lt 4 ]]; then
    missing_deps+=("bash>=4.0")
  fi

  # Check required command-line tools
  local required_tools=("npx" "node" "grep" "sed")
  for tool in "${required_tools[@]}"; do
    if ! command -v "$tool" &> /dev/null; then
      missing_deps+=("$tool")
    fi
  done

  # Check required Node.js modules
  local node_modules=(
    "redis"
    "dotenv"
  )

  for module in "${node_modules[@]}"; do
    if [[ ! -d "node_modules/$module" ]]; then
      missing_deps+=("$module")
    fi
  done

  # Specific Claude Flow dependencies
  local claude_deps=(
    "Task tool"
    "session-manager.js"
    "redis-coordination scripts"
  )

  # Use current directory as PROJECT_ROOT if not set
  PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"

  for dep in "${claude_deps[@]}"; do
    if [[ ! -d "$PROJECT_ROOT/.claude" ]]; then
      missing_deps+=("$dep")
    fi
  done

  # Report missing dependencies
  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    log_error "Missing Dependencies:"
    for dep in "${missing_deps[@]}"; do
      echo "  - $dep"
    done

    log_warning "Recommended Installation:"
    echo "  1. Install Node.js and npm (latest LTS version)"
    echo "  2. Run: npm install redis dotenv"
    echo "  3. Clone Claude Flow Novice repository"

    exit 1
  fi
}

# ============================================================================
# AGENT SPAWNING FUNCTIONS
# ============================================================================

# Spawn agents via CLI
spawn_agents() {
  local task="$1"
  local agents="$2"
  local agent_id="${3:-main}"
  local provider="${4:-zai}"
  local redis_channel="${5:-}"

  log_info "Spawning agents: $agents"
  log_info "Task: $task"

  # Build spawn command
  local spawn_cmd="npx claude-flow-spawn \"$task\" --agents=$agents --provider=$provider"

  # Add optional Redis channel
  if [[ -n "$redis_channel" ]]; then
    spawn_cmd="$spawn_cmd --redis-channel=$redis_channel"
  fi

  # Execute spawn
  eval "$spawn_cmd"
  local exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    log_info "Agents spawned successfully"
  else
    log_error "Failed to spawn agents (exit code: $exit_code)"
    exit $exit_code
  fi
}

# Stop agent by task ID
stop_agent() {
  local task_id="$1"

  log_info "Stopping agent: $task_id"
  npx claude-flow-spawn --stop="$task_id"

  if [[ $? -eq 0 ]]; then
    log_info "Agent stopped successfully"
  else
    log_error "Failed to stop agent"
    exit 1
  fi
}

# Stop all agents
stop_all_agents() {
  log_info "Stopping all agents"
  npx claude-flow-spawn --stop-all

  if [[ $? -eq 0 ]]; then
    log_info "All agents stopped"
  else
    log_error "Failed to stop all agents"
    exit 1
  fi
}

# Configuration handler function
handle_config() {
  local action="$1"
  local key="${2:-}"
  local value="${3:-}"

  case "$action" in
    list)
      # Placeholder: List configuration (modify as needed)
      echo "redis_host=localhost"
      echo "redis_port=6379"
      ;;
    get)
      # Placeholder: Return config value (modify as needed)
      case "$key" in
        redis_host)
          echo "localhost"
          ;;
        *)
          log_error "Unknown config key: $key"
          exit 1
          ;;
      esac
      ;;
    set)
      # Placeholder: Set config value (modify as needed)
      log_info "Setting $key to $value"
      ;;
    *)
      log_error "Invalid config action: $action"
      exit 1
      ;;
  esac
}

# Main function to include dependency check and argument parsing
main() {
  check_dependencies  # Dependency check before processing

  # Parse arguments
  case "${1:-}" in
    --check-dependencies)
      log_info "Dependencies checked successfully"
      ;;
    --config)
      shift
      handle_config "$@"
      ;;
    --task)
      shift
      local task="$1"
      shift
      local agents=""
      local agent_id="main"
      local provider="zai"
      local redis_channel=""

      # Parse remaining arguments
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --agents)
            agents="$2"
            shift 2
            ;;
          --agent-id)
            agent_id="$2"
            shift 2
            ;;
          --provider)
            provider="$2"
            shift 2
            ;;
          --redis-channel)
            redis_channel="$2"
            shift 2
            ;;
          *)
            log_error "Unknown argument: $1"
            exit 1
            ;;
        esac
      done

      # Validate required arguments
      if [[ -z "$task" ]] || [[ -z "$agents" ]]; then
        log_error "Missing required arguments: --task and --agents"
        exit 1
      fi

      # Spawn agents
      spawn_agents "$task" "$agents" "$agent_id" "$provider" "$redis_channel"
      ;;
    --stop)
      shift
      stop_agent "$1"
      ;;
    --stop-all)
      stop_all_agents
      ;;
    *)
      log_error "Unknown argument: $1"
      echo "Usage:"
      echo "  spawn-agent.sh --task \"Task description\" --agents coder,tester [--provider zai] [--redis-channel channel]"
      echo "  spawn-agent.sh --stop <task-id>"
      echo "  spawn-agent.sh --stop-all"
      echo "  spawn-agent.sh --check-dependencies"
      echo "  spawn-agent.sh --config list|get|set"
      exit 1
      ;;
  esac
}

# Run main function
main "$@"