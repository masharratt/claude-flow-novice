#!/bin/bash
# DEPRECATED: This shell script has been migrated to TypeScript
#
# Use the TypeScript version instead:
#   src/docker/coordinator/coordinator-entrypoint.ts
#
# The TypeScript version provides:
#   - Full type safety with strict TypeScript interfaces
#   - Comprehensive test coverage (54 tests)
#   - Security hardening (path traversal prevention, JSON DoS protection)
#   - Better error handling and validation
#   - Type-safe context creation
#   - Async/await promise support
#
# This file will be removed in the next major version.
# To use the new TypeScript version:
#
#   import { CoordinatorEntrypoint, runCoordinator } from 'src/docker/coordinator/coordinator-entrypoint';
#   const coordinator = new CoordinatorEntrypoint({
#     task_id: 'task-123',
#     task_description: 'Fix TypeScript errors'
#   });
#   const result = await coordinator.execute();
#
#   OR use the convenience function:
#   await runCoordinator();
#

echo "⚠️  DEPRECATED: docker/coordinator-entrypoint.sh has been migrated to TypeScript"
echo "   Use: src/docker/coordinator/coordinator-entrypoint.ts instead"
exit 1

# ==== ORIGINAL SHELL SCRIPT (DEPRECATED) ====
#!/bin/bash
set -euo pipefail

# Validate required environment variables
if [ -z "${TASK_ID:-}" ]; then
    echo "❌ ERROR: TASK_ID environment variable required"
    exit 1
fi

if [ -z "${TASK_DESCRIPTION:-}" ]; then
    echo "❌ ERROR: TASK_DESCRIPTION environment variable required"
    exit 1
fi

echo "🚀 CFN Docker V3 Coordinator Starting"
echo "   Task ID: ${TASK_ID}"
echo "   Mode: docker"
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
    echo "❌ Coordinator agent not found at: ${AGENT_FILE}"
    echo "   Ensure codebase is mounted at /workspace"
    exit 1
fi
echo "✅ Coordinator agent located"

# Load success criteria from environment or file
SUCCESS_CRITERIA=""
if [[ -n "${CFN_SUCCESS_CRITERIA:-}" ]]; then
    # Check if CFN_SUCCESS_CRITERIA is a file path
    if [[ -f "$CFN_SUCCESS_CRITERIA" ]]; then
        # SECURITY FIX #1: Path traversal protection
        # Only allow files in /workspace or /etc/cfn directories
        RESOLVED_PATH=$(readlink -f "$CFN_SUCCESS_CRITERIA" 2>/dev/null || echo "$CFN_SUCCESS_CRITERIA")
        if [[ ! "$RESOLVED_PATH" =~ ^/workspace/ ]] && [[ ! "$RESOLVED_PATH" =~ ^/etc/cfn/ ]]; then
            echo "❌ ERROR: Success criteria file must be in /workspace or /etc/cfn"
            echo "   Attempted path: ${CFN_SUCCESS_CRITERIA}"
            echo "   Resolved path: ${RESOLVED_PATH}"
            echo "   Security Risk: Path traversal attack prevented"
            exit 1
        fi

        # SECURITY FIX #4: JSON DoS protection
        # Check file size (max 10MB) before loading
        FILE_SIZE=$(stat -f%z "$CFN_SUCCESS_CRITERIA" 2>/dev/null || stat -c%s "$CFN_SUCCESS_CRITERIA" 2>/dev/null || echo "0")
        MAX_JSON_SIZE=$((10 * 1024 * 1024))  # 10MB limit

        if [[ "$FILE_SIZE" -gt "$MAX_JSON_SIZE" ]]; then
            echo "❌ ERROR: Success criteria file exceeds 10MB limit"
            echo "   File size: $((FILE_SIZE / 1024 / 1024))MB"
            echo "   Security Risk: DoS via excessive memory consumption prevented"
            exit 1
        fi

        echo "📋 Loading success criteria from file: ${CFN_SUCCESS_CRITERIA}"
        echo "   File size: $((FILE_SIZE / 1024))KB (validated)"
        SUCCESS_CRITERIA=$(cat "$CFN_SUCCESS_CRITERIA")
    else
        echo "📋 Loading success criteria from environment variable"
        SUCCESS_CRITERIA="$CFN_SUCCESS_CRITERIA"
    fi

    # Validate JSON format
    if ! echo "$SUCCESS_CRITERIA" | jq empty 2>/dev/null; then
        echo "❌ Invalid success criteria JSON format"
        echo "   Criteria must be valid JSON matching success criteria schema"
        exit 1
    fi
    echo "✅ Success criteria loaded and validated"
else
    echo "⚠️  No success criteria provided - coordinator will auto-generate"
    SUCCESS_CRITERIA=""
fi

# Export for orchestrator
export SUCCESS_CRITERIA

# Create task context file for agent (using mktemp for security)
CONTEXT_FILE=$(mktemp "/tmp/task-context-${TASK_ID}.XXXXXX.json")
trap 'rm -f "${CONTEXT_FILE}"' EXIT INT TERM
cat > "$CONTEXT_FILE" << CONTEXT_EOF
{
  "task_id": "${TASK_ID}",
  "task_description": "${TASK_DESCRIPTION}",
  "agents": "${AGENTS:-}",
  "max_iterations": ${MAX_ITERATIONS:-10},
  "gate_threshold": ${GATE_THRESHOLD:-0.75},
  "consensus_threshold": ${CONSENSUS_THRESHOLD:-0.90},
  "memory_limit": "${MEMORY_LIMIT:-1g}",
  "network": "${CFN_NETWORK_NAME:-${NETWORK:-mcp-network}}",
  "redis_host": "${CFN_REDIS_HOST:-cfn-redis}",
  "redis_port": ${CFN_REDIS_PORT:-6379},
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
CONTEXT_EOF

echo "✅ Task context created: ${CONTEXT_FILE}"

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
    echo "❌ orchestrate.sh not found at: ${ORCHESTRATE_SCRIPT}"
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
    --agents "${AGENTS:-}" \
    --max-iterations "${MAX_ITERATIONS:-10}" \
    --gate-threshold "${GATE_THRESHOLD:-0.75}" \
    --consensus-threshold "${CONSENSUS_THRESHOLD:-0.90}" \
    --memory-limit "${MEMORY_LIMIT:-1g}" \
    --network "${CFN_NETWORK_NAME:-${NETWORK:-mcp-network}}" \
    --context-file "$CONTEXT_FILE" \
    --verbose

EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
    echo "✅ CFN Loop execution completed successfully"
else
    echo "❌ CFN Loop execution failed with code: ${EXIT_CODE}"
fi

exit "$EXIT_CODE"
