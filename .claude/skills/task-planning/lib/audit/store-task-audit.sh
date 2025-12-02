#!/bin/bash
# Task Mode Audit Storage Script
# Stores Task Mode agent output in Redis/SQLite for complete audit trail
#
# Usage: store-task-audit.sh --task-id <id> --agent-type <type> --output <json>
#
# This script provides audit storage for Task Mode agents while maintaining
# ANTI-023 memory leak protection by keeping agents out of Redis coordination

set -euo pipefail

# Import SQLite parameterized query library for SQL injection prevention
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
source "${SCRIPT_DIR}/../bootstrap/sqlite-params.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Initialize variables
TASK_ID=""
AGENT_TYPE=""
OUTPUT=""
MODE="Task"
TIMESTAMP=""
DB_PATH="${HOME}/.claude/memory/cfn-loop.db"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --agent-type)
      AGENT_TYPE="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$TASK_ID" ] || [ -z "$AGENT_TYPE" ] || [ -z "$OUTPUT" ]; then
    echo "Error: Missing required parameters" >&2
    echo "Usage: $0 --task-id <id> --agent-type <type> --output <json> [--mode <mode>]" >&2
    exit 1
fi

# Generate timestamp
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Ensure database directory exists
mkdir -p "$(dirname "$DB_PATH")"

# Initialize SQLite database if needed
if [ ! -f "$DB_PATH" ]; then
    echo "Initializing audit database..." >&2
    sqlite3 "$DB_PATH" <<'EOF'
CREATE TABLE IF NOT EXISTS agent_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    decision TEXT,
    reasoning TEXT,
    confidence REAL,
    mode TEXT NOT NULL,
    deliverables TEXT,  -- JSON array
    timestamp INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    metadata TEXT  -- JSON
);

CREATE INDEX IF NOT EXISTS idx_audit_task ON agent_audit(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_agent ON agent_audit(agent_type);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON agent_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_mode ON agent_audit(mode);
EOF
fi

# Parse JSON output using jq (fallback to basic parsing if jq unavailable)
DECISION=""
REASONING=""
CONFIDENCE=""
DELIVERABLES="[]"

if command -v jq &> /dev/null; then
    # Use jq for robust JSON parsing
    DECISION=$(echo "$OUTPUT" | jq -r '.decision // "UNKNOWN"')
    REASONING=$(echo "$OUTPUT" | jq -r '.reasoning // ""')
    CONFIDENCE=$(echo "$OUTPUT" | jq -r '.confidence // 0.0')
    DELIVERABLES=$(echo "$OUTPUT" | jq -r '(.deliverables // []) | tostring')
else
    # Fallback: basic string parsing
    DECISION=$(echo "$OUTPUT" | grep -o '"decision":"[^"]*"' | cut -d'"' -f4 || echo "UNKNOWN")
    REASONING=$(echo "$OUTPUT" | grep -o '"reasoning":"[^"]*"' | cut -d'"' -f4 || echo "")
    CONFIDENCE=$(echo "$OUTPUT" | grep -o '"confidence":[0-9.]*' | cut -d: -f2 || echo "0.0")
    DELIVERABLES=$(echo "$OUTPUT" | grep -o '"deliverables":\[[^]]*\]' | sed 's/"deliverables":\[//g' | sed 's/\]//g' || echo "[]")
fi

# Validate confidence is a number
if ! [[ "$CONFIDENCE" =~ ^[0-9]*\.?[0-9]*$ ]]; then
    CONFIDENCE="0.0"
fi

# Store in Redis (fast access for Main Chat coordination)
echo -e "${YELLOW}💾 Storing Task Mode audit data in Redis...${NC}"
REDIS_KEY="swarm:${TASK_ID}:${AGENT_TYPE}:audit"

redis-cli HSET "$REDIS_KEY" \
    "decision" "$DECISION" \
    "reasoning" "$REASONING" \
    "confidence" "$CONFIDENCE" \
    "mode" "$MODE" \
    "deliverables" "$DELIVERABLES" \
    "timestamp" "$TIMESTAMP" \
    "agent_output" "$OUTPUT" > /dev/null

# Set TTL for Redis (24 hours)
redis-cli EXPIRE "$REDIS_KEY" 86400 > /dev/null

# Store in SQLite (permanent audit trail)
echo -e "${GREEN}💾 Storing Task Mode audit data in SQLite...${NC}"
UNIX_TIMESTAMP=$(date -d "$TIMESTAMP" +%s 2>/dev/null || date +%s)

# Use parameterized query to prevent SQL injection
sqlite_insert "$DB_PATH" \
    "INSERT OR REPLACE INTO agent_audit (
        task_id, agent_type, decision, reasoning, confidence, mode,
        deliverables, timestamp, created_at, metadata
    ) VALUES (
        ?1, ?2, ?3, ?4, $CONFIDENCE, ?5,
        ?6, $UNIX_TIMESTAMP, ?7,
        '{\"stored_via\": \"store-task-audit.sh\", \"version\": \"1.0.0\"}'
    )" \
    "$TASK_ID" "$AGENT_TYPE" "$DECISION" "$REASONING" "$MODE" \
    "$DELIVERABLES" "$TIMESTAMP"

# Store metadata in Redis for quick access
METADATA_KEY="swarm:${TASK_ID}:metadata"
redis-cli HSET "$METADATA_KEY" \
    "task_mode_audit" "true" \
    "last_agent" "$AGENT_TYPE" \
    "last_decision" "$DECISION" \
    "last_confidence" "$CONFIDENCE" \
    "last_updated" "$TIMESTAMP" > /dev/null

redis-cli EXPIRE "$METADATA_KEY" 86400 > /dev/null

# Output success information
echo -e "${GREEN}✅ Task Mode audit stored successfully${NC}"
echo -e "   Task ID: $TASK_ID"
echo -e "   Agent Type: $AGENT_TYPE"
echo -e "   Decision: $DECISION"
echo -e "   Confidence: $CONFIDENCE"
echo -e "   Mode: $MODE"
echo -e "   Deliverables: $DELIVERABLES"
echo -e "   Timestamp: $TIMESTAMP"

# Store agent output for debugging (optional, size-limited)
if [ ${#OUTPUT} -le 1000 ]; then
    OUTPUT_KEY="swarm:${TASK_ID}:${AGENT_TYPE}:output"
    redis-cli HSET "$OUTPUT_KEY" "data" "$OUTPUT" "timestamp" "$TIMESTAMP" > /dev/null
    redis-cli EXPIRE "$OUTPUT_KEY" 3600 > /dev/null
    echo -e "   Output: ${#OUTPUT} characters stored in Redis"
else
    echo -e "   Output: ${#OUTPUT} characters (too large for Redis, logged in SQLite only)"
fi

# Log to file for debugging
LOG_DIR="${HOME}/.claude/logs/task-audit"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/task-audit-$(date +%Y%m%d).log"

echo "[$TIMESTAMP] TASK_MODE_AUDIT: task_id=$TASK_ID agent_type=$AGENT_TYPE decision=$DECISION confidence=$CONFIDENCE mode=$MODE" >> "$LOG_FILE"

exit 0