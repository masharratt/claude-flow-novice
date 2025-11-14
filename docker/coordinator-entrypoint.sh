#!/bin/bash
set -euo pipefail

# Validate required environment variables
: "${TASK_ID:?TASK_ID environment variable required}"
: "${TASK_DESCRIPTION:?TASK_DESCRIPTION environment variable required}"
: "${MODE:=standard}"

echo "🚀 CFN Docker V3 Coordinator Starting"
echo "   Task ID: ${TASK_ID}"
echo "   Mode: ${MODE}"
echo "   Description: ${TASK_DESCRIPTION}"

# Verify Docker socket access (for Docker-in-Docker)
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Cannot access Docker daemon. Ensure /var/run/docker.sock is mounted."
    exit 1
fi
echo "✅ Docker access verified"

# Verify Redis connectivity
if ! redis-cli -h "${CFN_REDIS_HOST:-cfn-redis}" -p "${CFN_REDIS_PORT:-6379}" ping > /dev/null 2>&1; then
    echo "❌ Cannot connect to Redis at ${CFN_REDIS_HOST:-cfn-redis}:${CFN_REDIS_PORT:-6379}"
    exit 1
fi
echo "✅ Redis connection verified"

# Set codebase path for agent
export PROJECT_ROOT=/workspace
cd "$PROJECT_ROOT"

# Verify agent definition exists
AGENT_FILE="$PROJECT_ROOT/.claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md"
if [[ ! -f "$AGENT_FILE" ]]; then
    echo "❌ Coordinator agent not found at: $AGENT_FILE"
    echo "   Ensure codebase is mounted at /workspace"
    exit 1
fi
echo "✅ Coordinator agent located"

# Create task context file for agent
CONTEXT_FILE="/tmp/task-context-${TASK_ID}.json"
cat > "$CONTEXT_FILE" << CONTEXT_EOF
{
  "task_id": "${TASK_ID}",
  "task_description": "${TASK_DESCRIPTION}",
  "mode": "${MODE}",
  "agents": "${AGENTS:-}",
  "max_iterations": ${MAX_ITERATIONS:-10},
  "gate_threshold": ${GATE_THRESHOLD:-0.75},
  "consensus_threshold": ${CONSENSUS_THRESHOLD:-0.90},
  "memory_limit": "${MEMORY_LIMIT:-1g}",
  "network": "${NETWORK:-mcp-network}",
  "redis_host": "${CFN_REDIS_HOST:-cfn-redis}",
  "redis_port": ${CFN_REDIS_PORT:-6379},
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
CONTEXT_EOF

echo "✅ Task context created: $CONTEXT_FILE"

# Set environment for Docker mode (coordinator should spawn via Docker)
export CFN_DOCKER_MODE=true
export CFN_DOCKER_CONTAINER=true

# Invoke coordinator agent
echo "📋 Invoking coordinator agent..."
echo ""

echo "⚠️  Direct agent invocation not yet supported by CLI"
echo "    Falling back to orchestrate.sh with planning phase"

ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

if [[ ! -f "$ORCHESTRATE_SCRIPT" ]]; then
    echo "❌ orchestrate.sh not found at: $ORCHESTRATE_SCRIPT"
    exit 1
fi

# Skip chmod on mounted volumes (CIFS restrictions prevent permission changes)
# File has 0777 permissions from host - chmod would fail on Docker mounts
if ! chmod +x "$ORCHESTRATE_SCRIPT" 2>/dev/null; then
    echo "⚠️  chmod skipped (mounted filesystem with restricted permissions)"
    echo "    File will execute with current permissions (0777 from host)"
fi

# Execute orchestration with planning enabled
"$ORCHESTRATE_SCRIPT" execute "$TASK_ID" \
    --task-description "$TASK_DESCRIPTION" \
    --mode "$MODE" \
    --agents "${AGENTS:-}" \
    --max-iterations "${MAX_ITERATIONS:-10}" \
    --gate-threshold "${GATE_THRESHOLD:-0.75}" \
    --consensus-threshold "${CONSENSUS_THRESHOLD:-0.90}" \
    --memory-limit "${MEMORY_LIMIT:-1g}" \
    --network "${NETWORK:-mcp-network}" \
    --context-file "$CONTEXT_FILE" \
    --verbose

EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
    echo "✅ CFN Loop execution completed successfully"
else
    echo "❌ CFN Loop execution failed with code: $EXIT_CODE"
fi

exit $EXIT_CODE
