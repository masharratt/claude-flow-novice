#!/bin/bash
# Docker Container Metadata Capture and Cleanup
# Captures container metadata before removal for debugging while keeping environment clean
set -euo pipefail

CONTAINER_ID="${1:?Container ID required}"
TASK_ID="${2:-unknown}"
AGENT_ID="${3:-unknown}"
KEEP_CONTAINERS="${CFN_DOCKER_KEEP_CONTAINERS:-false}"

# Debug output directory
DEBUG_DIR="${CFN_DOCKER_DEBUG_DIR:-/tmp/cfn-debug}"
CONTAINER_DEBUG_DIR="$DEBUG_DIR/$TASK_ID/$AGENT_ID"

# Create debug directory structure
mkdir -p "$CONTAINER_DEBUG_DIR"

# Capture container metadata
echo "📸 Capturing container metadata: $CONTAINER_ID"

# 1. Container inspection (full metadata)
if docker inspect "$CONTAINER_ID" > "$CONTAINER_DEBUG_DIR/inspect.json" 2>/dev/null; then
    echo "   ✅ Inspect data saved"
else
    echo "   ⚠️  Failed to capture inspect data"
fi

# 2. Container logs (stdout/stderr)
if docker logs "$CONTAINER_ID" > "$CONTAINER_DEBUG_DIR/logs.txt" 2>&1; then
    echo "   ✅ Logs saved ($(wc -l < "$CONTAINER_DEBUG_DIR/logs.txt" | tr -d ' ') lines)"
else
    echo "   ⚠️  Failed to capture logs"
fi

# 3. Resource stats (final snapshot)
if docker stats --no-stream --format "json" "$CONTAINER_ID" > "$CONTAINER_DEBUG_DIR/stats.json" 2>/dev/null; then
    echo "   ✅ Resource stats saved"
else
    echo "   ⚠️  Failed to capture stats"
fi

# 4. Exit code and status
EXIT_CODE=$(docker inspect "$CONTAINER_ID" --format='{{.State.ExitCode}}' 2>/dev/null || echo "unknown")
STATUS=$(docker inspect "$CONTAINER_ID" --format='{{.State.Status}}' 2>/dev/null || echo "unknown")

cat > "$CONTAINER_DEBUG_DIR/summary.txt" << EOF
Container ID: $CONTAINER_ID
Task ID: $TASK_ID
Agent ID: $AGENT_ID
Exit Code: $EXIT_CODE
Status: $STATUS
Captured: $(date -Iseconds)
Debug Path: $CONTAINER_DEBUG_DIR
EOF

echo "   ✅ Summary saved"

# 5. Container removal decision
if [ "$KEEP_CONTAINERS" = "true" ]; then
    echo "🔒 Container preserved (CFN_DOCKER_KEEP_CONTAINERS=true)"
    echo "   Container ID: $CONTAINER_ID"
    echo "   Inspect: docker inspect $CONTAINER_ID"
    echo "   Logs: docker logs $CONTAINER_ID"
    echo "   Exec: docker exec -it $CONTAINER_ID sh"
else
    echo "🗑️  Removing container (metadata preserved)"
    if docker rm -f "$CONTAINER_ID" >/dev/null 2>&1; then
        echo "   ✅ Container removed"
    else
        echo "   ⚠️  Failed to remove container"
    fi
fi

# Output debug directory for caller
echo ""
echo "📁 Debug artifacts: $CONTAINER_DEBUG_DIR"
echo "   - inspect.json (full metadata)"
echo "   - logs.txt (stdout/stderr)"
echo "   - stats.json (resource usage)"
echo "   - summary.txt (quick reference)"

# Return exit code for orchestrator decision-making
exit "$EXIT_CODE"
