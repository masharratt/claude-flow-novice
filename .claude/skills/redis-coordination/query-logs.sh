#!/bin/bash
##############################################################################
# CFN Loop Log Query Tool
#
# Usage:
#   ./query-logs.sh --task-id <id> [options]
#
# Parameters:
#   --task-id       Task/swarm identifier (required)
#   --event-type    Filter by event type (optional)
#   --level         Filter by log level: DEBUG, INFO, WARN, ERROR (optional)
#   --loop          Filter by loop: loop3, loop2, product_owner, coordinator (optional)
#   --agent-id      Filter by agent ID (optional)
#   --iteration     Filter by iteration number (optional)
#   --limit         Maximum number of results (default: 100)
#   --format        Output format: json, csv, table (default: json)
#
# Examples:
#   # Get all logs for a task
#   ./query-logs.sh --task-id "cfn-task-123"
#
#   # Get errors only
#   ./query-logs.sh --task-id "cfn-task-123" --level ERROR
#
#   # Get Loop 3 agent spawns
#   ./query-logs.sh --task-id "cfn-task-123" --event-type agent_spawn --loop loop3
#
#   # Get latest 10 events in table format
#   ./query-logs.sh --task-id "cfn-task-123" --limit 10 --format table
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${DB_PATH:-${SCRIPT_DIR}/../../data/cfn-loop.db}"

# Parameters
TASK_ID=""
EVENT_TYPE=""
LEVEL=""
LOOP=""
AGENT_ID=""
ITERATION=""
LIMIT=100
FORMAT="json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --event-type) EVENT_TYPE="$2"; shift 2 ;;
    --level) LEVEL="$2"; shift 2 ;;
    --loop) LOOP="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --iteration) ITERATION="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Validate required parameters
if [ -z "$TASK_ID" ]; then
  echo "Error: --task-id is required" >&2
  echo "Usage: $0 --task-id <id> [--event-type <type>] [--level <level>] [--limit <n>] [--format json|csv|table]" >&2
  exit 1
fi

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH" >&2
  echo "No logs have been written yet." >&2
  exit 1
fi

# Build query
QUERY="SELECT * FROM cfn_loop_logs WHERE task_id = '$TASK_ID'"

[ -n "$EVENT_TYPE" ] && QUERY="$QUERY AND event_type = '$EVENT_TYPE'"
[ -n "$LEVEL" ] && QUERY="$QUERY AND level = '$LEVEL'"
[ -n "$LOOP" ] && QUERY="$QUERY AND loop = '$LOOP'"
[ -n "$AGENT_ID" ] && QUERY="$QUERY AND agent_id = '$AGENT_ID'"
[ -n "$ITERATION" ] && QUERY="$QUERY AND iteration = $ITERATION"

QUERY="$QUERY ORDER BY timestamp DESC LIMIT $LIMIT"

# Execute query with selected format
case "$FORMAT" in
  json)
    sqlite3 -json "$DB_PATH" "$QUERY"
    ;;
  csv)
    sqlite3 -csv "$DB_PATH" "$QUERY"
    ;;
  table)
    sqlite3 -column -header "$DB_PATH" "$QUERY"
    ;;
  *)
    echo "Error: Invalid format '$FORMAT'. Use: json, csv, or table" >&2
    exit 1
    ;;
esac
