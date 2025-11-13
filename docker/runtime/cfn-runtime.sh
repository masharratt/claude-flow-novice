#!/bin/bash
# CFN Runtime Environment Script
# Generated from docker/runtime/cfn-runtime.contract.yml
# Timestamp: 2025-11-13T10:18:25.600Z
# Source this file to load environment variables

set -euo pipefail

export CFN_REDIS_HOST="${CFN_REDIS_HOST:-cfn-redis}"
export REDIS_HOST="${CFN_REDIS_HOST}" # legacy alias
export MCP_REDIS_HOST="${CFN_REDIS_HOST}" # legacy alias
export CFN_REDIS_PORT="${CFN_REDIS_PORT:-6379}"
export REDIS_PORT="${CFN_REDIS_PORT}" # legacy alias
export MCP_REDIS_PORT="${CFN_REDIS_PORT}" # legacy alias
export CFN_REDIS_URL="${CFN_REDIS_URL:-}"
export REDIS_URL="${CFN_REDIS_URL}" # legacy alias
export MCP_REDIS_URL="${CFN_REDIS_URL}" # legacy alias
export CFN_REDIS_PASSWORD="${CFN_REDIS_PASSWORD:-}"
export REDIS_PASSWORD="${CFN_REDIS_PASSWORD}" # legacy alias
export MCP_REDIS_PASSWORD="${CFN_REDIS_PASSWORD}" # legacy alias
export CFN_AGENT_ID="${CFN_AGENT_ID:-auto-generated}"
export AGENT_ID="${CFN_AGENT_ID}" # legacy alias
export CFN_AGENT_TYPE="${CFN_AGENT_TYPE:-unknown}"
export AGENT_TYPE="${CFN_AGENT_TYPE}" # legacy alias
export CFN_AGENT_IMAGE="${CFN_AGENT_IMAGE:-claude-flow-novice-agent:latest}"
export AGENT_IMAGE="${CFN_AGENT_IMAGE}" # legacy alias
export CFN_AGENT_REGISTRY="${CFN_AGENT_REGISTRY:-docker.io}"
export AGENT_REGISTRY="${CFN_AGENT_REGISTRY}" # legacy alias
export CFN_TASK_ID="${CFN_TASK_ID:-auto-generated}"
export TASK_ID="${CFN_TASK_ID}" # legacy alias
export SWARM_ID="${CFN_TASK_ID}" # legacy alias
export CFN_TASK_TIMEOUT="${CFN_TASK_TIMEOUT:-3600}"
export CFN_ITERATION_LIMIT="${CFN_ITERATION_LIMIT:-10}"
export CFN_MEMORY_BUDGET="${CFN_MEMORY_BUDGET:-40g}"
export MEMORY_BUDGET="${CFN_MEMORY_BUDGET}" # legacy alias
export CFN_CPU_LIMIT="${CFN_CPU_LIMIT:-4}"
export CFN_MAX_PARALLEL_AGENTS="${CFN_MAX_PARALLEL_AGENTS:-4}"
export CFN_SPAWN_INTERVAL_MS="${CFN_SPAWN_INTERVAL_MS:-500}"
export CFN_ORCHESTRATOR_MODE="${CFN_ORCHESTRATOR_MODE:-standard}"
export CFN_GATE_CONFIDENCE_THRESHOLD="${CFN_GATE_CONFIDENCE_THRESHOLD:-0.75}"
export CFN_CONSENSUS_THRESHOLD="${CFN_CONSENSUS_THRESHOLD:-0.90}"
export CFN_API_HOST="${CFN_API_HOST:-0.0.0.0}"
export CFN_API_PORT="${CFN_API_PORT:-9000}"
export CFN_API_KEY="${CFN_API_KEY:-auto-generated}"
export CFN_CUSTOM_ROUTING="${CFN_CUSTOM_ROUTING:-false}"
export CFN_DEFAULT_PROVIDER="${CFN_DEFAULT_PROVIDER:-zai}"
export CFN_LOG_LEVEL="${CFN_LOG_LEVEL:-info}"
export CFN_LOG_FORMAT="${CFN_LOG_FORMAT:-json}"
export CFN_CONTAINER_MODE="${CFN_CONTAINER_MODE:-false}"
export CFN_DOCKER_SOCKET="${CFN_DOCKER_SOCKET:-/var/run/docker.sock}"
export CFN_NETWORK_NAME="${CFN_NETWORK_NAME:-cfn-network}"
export CFN_ENABLE_PROGRESS_TRACKING="${CFN_ENABLE_PROGRESS_TRACKING:-true}"
export CFN_ENABLE_HEALTH_CHECKS="${CFN_ENABLE_HEALTH_CHECKS:-true}"
export CFN_ENABLE_METRICS="${CFN_ENABLE_METRICS:-true}"
