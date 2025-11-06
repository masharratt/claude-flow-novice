#!/bin/bash
# Combined Audit Data Retrieval Script
# Retrieves audit trails from both Task Mode and CLI Mode agents
#
# Usage: get-audit-data.sh --task-id <id> [--mode <mode>] [--format <format>]
#
# This script provides unified access to audit data from both execution modes,
# enabling complete audit trail visibility for compliance and debugging.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Initialize variables
TASK_ID=""
MODE="combined"
FORMAT="json"
DB_PATH="${HOME}/.claude/memory/cfn-loop.db"
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      echo "Usage: $0 --task-id <id> [--mode <mode>] [--format <format>] [--verbose]"
      echo ""
      echo "Options:"
      echo "  --task-id <id>    Task ID to retrieve audit data for (required)"
      echo "  --mode <mode>     Retrieval mode: combined|task|cli (default: combined)"
      echo "  --format <format> Output format: json|table|summary (default: json)"
      echo "  --verbose         Show detailed retrieval information"
      echo "  --help            Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 --task-id task-123"
      echo "  $0 --task-id task-123 --mode task --format table"
      echo "  $0 --task-id task-123 --mode combined --verbose"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Use --help for usage information" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$TASK_ID" ]; then
    echo "Error: --task-id is required" >&2
    echo "Use --help for usage information" >&2
    exit 1
fi

# Validate mode
if [[ ! "$MODE" =~ ^(combined|task|cli)$ ]]; then
    echo "Error: --mode must be one of: combined, task, cli" >&2
    exit 1
fi

# Validate format
if [[ ! "$FORMAT" =~ ^(json|table|summary)$ ]]; then
    echo "Error: --format must be one of: json, table, summary" >&2
    exit 1
fi

# Helper functions
log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[VERBOSE]${NC} $1" >&2
    fi
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Retrieve Task Mode audit data from Redis
retrieve_task_mode_redis() {
    local task_id="$1"
    local redis_keys
    local task_data=()

    log_verbose "Searching for Task Mode Redis keys for task: $task_id"

    # Find all Task Mode audit keys for this task
    redis_keys=$(redis-cli --scan --pattern "swarm:${task_id}:*:audit" 2>/dev/null || true)

    if [ -z "$redis_keys" ]; then
        log_warning "No Task Mode Redis audit data found for task: $task_id"
        echo "[]"
        return
    fi

    log_verbose "Found Task Mode Redis keys: $redis_keys"

    # Retrieve data from each key
    for key in $redis_keys; do
        local agent_type
        local audit_data

        agent_type=$(echo "$key" | sed "s|swarm:${task_id}:||g" | sed "s|:audit||g")

        if command -v jq &> /dev/null; then
            audit_data=$(redis-cli HGETALL "$key" 2>/dev/null | jq -n 'reduce inputs as $k ({}; .[$k] = input)' || echo "{}")
        else
            audit_data=$(redis-cli HGETALL "$key" 2>/dev/null || echo "")
        fi

        if [ -n "$audit_data" ] && [ "$audit_data" != "{}" ]; then
            task_data+=("$audit_data")
        fi
    done

    if [ ${#task_data[@]} -eq 0 ]; then
        echo "[]"
    else
        if command -v jq &> /dev/null; then
            echo "[${task_data[*]}]" | jq 'flatten'
        else
            printf '%s\n' "${task_data[@]}"
        fi
    fi
}

# Retrieve CLI Mode audit data from Redis
retrieve_cli_mode_redis() {
    local task_id="$1"
    local redis_keys
    local cli_data=()

    log_verbose "Searching for CLI Mode Redis keys for task: $task_id"

    # Find all CLI Mode result keys for this task
    redis_keys=$(redis-cli --scan --pattern "swarm:${task_id}:*:result" 2>/dev/null || true)

    if [ -z "$redis_keys" ]; then
        log_warning "No CLI Mode Redis audit data found for task: $task_id"
        echo "[]"
        return
    fi

    log_verbose "Found CLI Mode Redis keys: $redis_keys"

    # Retrieve data from each key
    for key in $redis_keys; do
        local agent_id
        local result_data

        agent_id=$(echo "$key" | sed "s|swarm:${task_id}:||g" | sed "s|:result||g")

        if command -v jq &> /dev/null; then
            result_data=$(redis-cli HGETALL "$key" 2>/dev/null | jq -n 'reduce inputs as $k ({}; .[$k] = input)' || echo "{}")
        else
            result_data=$(redis-cli HGETALL "$key" 2>/dev/null || echo "")
        fi

        if [ -n "$result_data" ] && [ "$result_data" != "{}" ]; then
            cli_data+=("$result_data")
        fi
    done

    if [ ${#cli_data[@]} -eq 0 ]; then
        echo "[]"
    else
        if command -v jq &> /dev/null; then
            echo "[${cli_data[*]}]" | jq 'flatten'
        else
            printf '%s\n' "${cli_data[@]}"
        fi
    fi
}

# Retrieve audit data from SQLite database
retrieve_sqlite_data() {
    local task_id="$1"
    local mode="$2"
    local sqlite_data

    log_verbose "Retrieving SQLite audit data for task: $task_id, mode: $mode"

    if [ ! -f "$DB_PATH" ]; then
        log_warning "SQLite database not found at: $DB_PATH"
        echo "[]"
        return
    fi

    local where_clause="task_id = '$task_id'"
    if [ "$mode" != "combined" ]; then
        where_clause="$where_clause AND mode = '$mode'"
    fi

    sqlite_data=$(sqlite3 "$DB_PATH" 2>/dev/null "
        SELECT
            task_id,
            agent_type,
            decision,
            reasoning,
            confidence,
            mode,
            deliverables,
            timestamp,
            created_at,
            metadata
        FROM agent_audit
        WHERE $where_clause
        ORDER BY timestamp, agent_type;
    " || echo "")

    if [ -z "$sqlite_data" ]; then
        echo "[]"
        return
    fi

    # Convert to JSON
    if command -v jq &> /dev/null; then
        echo "$sqlite_data" | awk -F'|' '
        NR > 1 {
            gsub(/"/, "\\\"", $0)
            print "{"
            print "  \"task_id\": \"" $1 "\","
            print "  \"agent_type\": \"" $2 "\","
            print "  \"decision\": \"" $3 "\","
            print "  \"reasoning\": \"" $4 "\","
            print "  \"confidence\": " $5 ","
            print "  \"mode\": \"" $6 "\","
            print "  \"deliverables\": " $7 ","
            print "  \"timestamp\": " $8 ","
            print "  \"created_at\": \"" $9 "\","
            print "  \"metadata\": " $10
            print "}"
        }
        ' | jq -s '.'
    else
        echo "$sqlite_data" | awk -F'|' 'NR > 1 {print $0}'
    fi
}

# Format output as table
format_as_table() {
    local data="$1"

    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required for table formatting" >&2
        echo "$data"
        return
    fi

    echo "$data" | jq -r '
    .[] |
    [
        .task_id // "N/A",
        .agent_type // "N/A",
        .decision // "N/A",
        (.confidence // 0 | tostring),
        .mode // "N/A",
        (.deliverables // [] | join(", "))
    ] | @tsv
    ' | {
        echo -e "TASK_ID\tAGENT_TYPE\tDECISION\tCONFIDENCE\tMODE\tDELIVERABLES"
        echo -e "-------\t-----------\t--------\t----------\t----\t-----------"
        cat
    } | column -t -s $'\t'
}

# Format output as summary
format_as_summary() {
    local data="$1"

    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required for summary formatting" >&2
        echo "$data"
        return
    fi

    local total_agents
    local task_mode_agents
    local cli_mode_agents
    local avg_confidence
    local decisions

    total_agents=$(echo "$data" | jq '. | length')
    task_mode_agents=$(echo "$data" | jq '[.[] | select(.mode == "Task")] | length')
    cli_mode_agents=$(echo "$data" | jq '[.[] | select(.mode == "CLI")] | length')
    avg_confidence=$(echo "$data" | jq '[.[] | select(.confidence != null) | .confidence] | add / (length | if . == 0 then 1 else . end)')
    decisions=$(echo "$data" | jq -r '[.[] | .decision // "UNKNOWN"] | sort | group_by(.) | map({decision: .[0], count: length}) | .[] | "\(.decision): \(.count)"' | tr '\n' ', ' | sed 's/,$//')

    echo "=== AUDIT SUMMARY FOR TASK: $TASK_ID ==="
    echo "Total Agents: $total_agents"
    echo "Task Mode Agents: $task_mode_agents"
    echo "CLI Mode Agents: $cli_mode_agents"
    echo "Average Confidence: $(printf "%.2f" "$avg_confidence")"
    echo "Decisions: $decisions"
    echo ""
    echo "=== AGENT BREAKDOWN ==="
    echo "$data" | jq -r '.[] | "- \(.agent_type // "Unknown") (\(.mode // "Unknown")): \(.decision // "Unknown") (confidence: \(.confidence // "N/A"))"'
}

# Main retrieval logic
log_info "Retrieving audit data for task: $TASK_ID (mode: $MODE, format: $FORMAT)"

# Initialize result containers
task_mode_data="[]"
cli_mode_data="[]"
sqlite_data="[]"

# Retrieve data based on mode
case "$MODE" in
    "task")
        log_verbose "Retrieving Task Mode data only"
        task_mode_data=$(retrieve_task_mode_redis "$TASK_ID")
        sqlite_data=$(retrieve_sqlite_data "$TASK_ID" "Task")
        ;;
    "cli")
        log_verbose "Retrieving CLI Mode data only"
        cli_mode_data=$(retrieve_cli_mode_redis "$TASK_ID")
        sqlite_data=$(retrieve_sqlite_data "$TASK_ID" "CLI")
        ;;
    "combined")
        log_verbose "Retrieving combined Task Mode and CLI Mode data"
        task_mode_data=$(retrieve_task_mode_redis "$TASK_ID")
        cli_mode_data=$(retrieve_cli_mode_redis "$TASK_ID")
        sqlite_data=$(retrieve_sqlite_data "$TASK_ID" "combined")
        ;;
esac

# Combine all data
if command -v jq &> /dev/null; then
    combined_data=$(echo "$task_mode_data $cli_mode_data $sqlite_data" | jq -s 'flatten | group_by(.task_id + .agent_type + .timestamp) | map(.[0])')
else
    combined_data=$(printf '%s\n%s\n%s' "$task_mode_data" "$cli_mode_data" "$sqlite_data")
fi

# Format and output results
case "$FORMAT" in
    "json")
        echo "$combined_data"
        ;;
    "table")
        format_as_table "$combined_data"
        ;;
    "summary")
        format_as_summary "$combined_data"
        ;;
esac

log_verbose "Audit data retrieval completed for task: $TASK_ID"