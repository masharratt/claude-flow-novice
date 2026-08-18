#!/usr/bin/env bash
# Cleanup orphaned test processes from CFN Loop E2E tests

set -euo pipefail

echo "🧹 Cleaning up orphaned test processes..."

# Kill orchestrator processes
ORCHESTRATOR_PIDS=$(ps aux | grep "orchestrate.sh" | grep -v grep | awk '{print $2}' || true)
if [ -n "$ORCHESTRATOR_PIDS" ]; then
    echo "Killing orchestrator processes: $ORCHESTRATOR_PIDS"
    echo "$ORCHESTRATOR_PIDS" | xargs -r kill -9 2>/dev/null || true
fi

# Kill coordinator processes (spawned with --task-id flag)
COORDINATOR_PIDS=$(ps aux | grep "claude-flow-novice agent cfn-v3-coordinator" | grep -v grep | awk '{print $2}' || true)
if [ -n "$COORDINATOR_PIDS" ]; then
    echo "Killing coordinator processes: $COORDINATOR_PIDS"
    echo "$COORDINATOR_PIDS" | xargs -r kill -9 2>/dev/null || true
fi

# Kill any agent processes spawned with task IDs
AGENT_PIDS=$(ps aux | grep "claude-flow-novice agent" | grep "task-id" | grep -v grep | awk '{print $2}' || true)
if [ -n "$AGENT_PIDS" ]; then
    echo "Killing agent processes: $AGENT_PIDS"
    echo "$AGENT_PIDS" | xargs -r kill -9 2>/dev/null || true
fi

# Kill stale Node.js processes (>5 minutes old, high memory)
# Only kill claude-flow-novice processes, not Main Chat
STALE_NODE_PIDS=$(ps -eo pid,etimes,rss,cmd | grep "node.*claude-flow-novice" | grep -v "Main Chat\|grep" | awk '$2 > 300 && $3 > 100000 {print $1}' || true)
if [ -n "$STALE_NODE_PIDS" ]; then
    echo "Killing stale Node.js processes (>5min, >100MB): $STALE_NODE_PIDS"
    echo "$STALE_NODE_PIDS" | xargs -r kill -9 2>/dev/null || true
fi

echo "✅ Cleanup complete"
echo ""
echo "Remaining processes:"
ps aux | grep -E "orchestrate|claude-flow-novice agent" | grep -v grep | wc -l
