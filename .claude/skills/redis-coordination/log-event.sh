#!/bin/bash
##############################################################################
# CFN Loop Event Logging to SQLite
#
# Usage:
#   ./log-event.sh --task-id <id> --event-type <type> [options]
#
# Parameters:
#   --task-id       Task/swarm identifier (required)
#   --event-type    Event type: spawn, complete, gate_check, decision, error, etc. (required)
#   --details       JSON payload with event-specific data (optional, default: {})
#   --level         Log level: DEBUG, INFO, WARN, ERROR (optional, default: INFO)
#   --loop          Loop identifier: loop3, loop2, product_owner, coordinator (optional)
#   --agent-id      Agent identifier (optional)
#   --iteration     Iteration number (optional)
#
# Example:
#   ./log-event.sh \
#     --task-id "cfn-task-123" \
#     --event-type "agent_spawn" \
#     --loop "loop3" \
#     --agent-id "coder-1" \
#     --iteration 1 \
#     --details '{"agent_type": "coder", "timeout": 900}' \
#     --level "INFO"
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Default to project root data/ directory (consistent with web portal)
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DB_PATH="${DB_PATH:-${PROJECT_ROOT}/data/cfn-loop.db}"

# Parameters
TASK_ID=""
EVENT_TYPE=""
DETAILS="{}"
LEVEL="INFO"
LOOP=""
AGENT_ID=""
ITERATION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --event-type) EVENT_TYPE="$2"; shift 2 ;;
    --details) DETAILS="$2"; shift 2 ;;
    --level) LEVEL="$2"; shift 2 ;;
    --loop) LOOP="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --iteration) ITERATION="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Validate required parameters
if [ -z "$TASK_ID" ] || [ -z "$EVENT_TYPE" ]; then
  echo "Error: --task-id and --event-type are required" >&2
  echo "Usage: $0 --task-id <id> --event-type <type> [--details <json>] [--level <level>] [--loop <loop>] [--agent-id <id>] [--iteration <n>]" >&2
  exit 1
fi

# Validate JSON
if ! echo "$DETAILS" | jq empty 2>/dev/null; then
  echo "Error: --details must be valid JSON" >&2
  exit 1
fi

# Create data directory if it doesn't exist
mkdir -p "$(dirname "$DB_PATH")"

# Initialize database schema if needed
sqlite3 "$DB_PATH" <<'EOF'
CREATE TABLE IF NOT EXISTS cfn_loop_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  timestamp TEXT DEFAULT (datetime('now')),
  event_type TEXT NOT NULL,
  loop TEXT,
  agent_id TEXT,
  iteration INTEGER,
  details TEXT,
  level TEXT DEFAULT 'INFO'
);

CREATE INDEX IF NOT EXISTS idx_task_id ON cfn_loop_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_event_type ON cfn_loop_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_timestamp ON cfn_loop_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_level ON cfn_loop_logs(level);
EOF

# Escape single quotes in JSON for SQLite
DETAILS_ESCAPED="${DETAILS//\'/\'\'}"

# Insert log entry
sqlite3 "$DB_PATH" <<EOF
INSERT INTO cfn_loop_logs (task_id, event_type, loop, agent_id, iteration, details, level)
VALUES ('$TASK_ID', '$EVENT_TYPE', '$LOOP', '$AGENT_ID', '$ITERATION', '$DETAILS_ESCAPED', '$LEVEL');
EOF

# Also echo to stderr for orchestrator visibility (with timestamp)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[$TIMESTAMP] [$LEVEL] [$EVENT_TYPE] $DETAILS" >&2

# Return success
exit 0
