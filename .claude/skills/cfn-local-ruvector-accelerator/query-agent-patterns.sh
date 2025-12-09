#!/bin/bash
# query-agent-patterns.sh - Query agent lifecycle patterns and failures
#
# Purpose: Search historical agent transcripts, failure patterns, and tool usage
#          to provide guidance for current tasks.
#
# Usage:
#   ./query-agent-patterns.sh --query "error handling patterns" [--type TYPE]
#
# Examples:
#   ./query-agent-patterns.sh --query "pre-edit hook validation failure"
#   ./query-agent-patterns.sh --query "rust coder patterns" --type coder
#   ./query-agent-patterns.sh --query "timeout recovery" --limit 5

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
DB_PATH="${PROJECT_ROOT}/.claude/skills/cfn-redis-coordination/data/cfn-loop.db"

# ============================================================================
# Parse Arguments
# ============================================================================

QUERY=""
AGENT_TYPE=""
LIMIT=10
SEARCH_TYPE="all"  # all, transcripts, failures

while [[ $# -gt 0 ]]; do
    case $1 in
        --query)
            QUERY="$2"
            shift 2
            ;;
        --type)
            AGENT_TYPE="$2"
            shift 2
            ;;
        --limit)
            LIMIT="$2"
            shift 2
            ;;
        --search-type)
            SEARCH_TYPE="$2"
            shift 2
            ;;
        --help)
            cat <<'HELP'
Query Agent Patterns - Search historical agent data

Usage:
  ./query-agent-patterns.sh --query "search terms" [OPTIONS]

Options:
  --query TEXT          Search query (required)
  --type TYPE           Filter by agent type (e.g., coder, validator)
  --limit N             Max results (default: 10)
  --search-type TYPE    What to search: all, transcripts, failures

Examples:
  # Search all patterns
  ./query-agent-patterns.sh --query "authentication error"

  # Search only failure patterns
  ./query-agent-patterns.sh --query "validation" --search-type failures

  # Filter by agent type
  ./query-agent-patterns.sh --query "file write" --type coder --limit 5
HELP
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

if [ -z "$QUERY" ] && [ "$SEARCH_TYPE" != "stats" ]; then
    echo "Error: --query is required (except for --search-type stats)"
    echo "Use --help for usage information"
    exit 1
fi

if [ ! -f "$DB_PATH" ]; then
    echo "Error: Database not found at $DB_PATH"
    exit 1
fi

# ============================================================================
# Search Functions
# ============================================================================

search_transcripts() {
    local query="$1"
    local type_filter="$2"

    echo "=== Agent Transcript Matches ==="
    echo ""

    local sql="SELECT agent_id, agent_type, snippet_type, substr(snippet, 1, 100) as snippet_preview
FROM agent_transcripts
WHERE snippet LIKE '%${query}%'"

    if [ -n "$type_filter" ]; then
        sql="${sql} AND agent_type LIKE '%${type_filter}%'"
    fi

    sql="${sql} ORDER BY created_at DESC LIMIT ${LIMIT};"

    sqlite3 -line "$DB_PATH" "$sql" | while read -r line; do
        if [ -z "$line" ]; then
            echo ""
        else
            echo "$line"
        fi
    done
}

search_failures() {
    local query="$1"
    local type_filter="$2"

    echo "=== Failure Pattern Matches ==="
    echo ""

    local sql="SELECT agent_type, failure_mode, occurrence_count, substr(root_cause, 1, 100) as root_cause_preview, recovery_strategy
FROM agent_failure_patterns
WHERE (failure_mode LIKE '%${query}%' OR root_cause LIKE '%${query}%')"

    if [ -n "$type_filter" ]; then
        sql="${sql} AND agent_type LIKE '%${type_filter}%'"
    fi

    sql="${sql} ORDER BY occurrence_count DESC LIMIT ${LIMIT};"

    sqlite3 -line "$DB_PATH" "$sql" | while read -r line; do
        if [ -z "$line" ]; then
            echo ""
        else
            echo "$line"
        fi
    done
}

get_agent_stats() {
    echo "=== Agent Lifecycle Statistics ==="
    echo ""

    # Total agents by type
    echo "Agent executions by type:"
    sqlite3 "$DB_PATH" "SELECT type, COUNT(*) as count FROM agents GROUP BY type ORDER BY count DESC LIMIT 10;"
    echo ""

    # Recent failures
    echo "Recent failures (last 7 days):"
    sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agents WHERE status='completed' AND confidence < 0.70 AND datetime(completed_at) >= datetime('now', '-7 days');"
    echo ""

    # Most common failure modes
    echo "Most common failure modes:"
    sqlite3 "$DB_PATH" "SELECT failure_mode, SUM(occurrence_count) as total FROM agent_failure_patterns GROUP BY failure_mode ORDER BY total DESC LIMIT 5;"
    echo ""
}

# ============================================================================
# Execute Search
# ============================================================================

case "$SEARCH_TYPE" in
    all)
        search_transcripts "$QUERY" "$AGENT_TYPE"
        echo ""
        search_failures "$QUERY" "$AGENT_TYPE"
        ;;
    transcripts)
        search_transcripts "$QUERY" "$AGENT_TYPE"
        ;;
    failures)
        search_failures "$QUERY" "$AGENT_TYPE"
        ;;
    stats)
        get_agent_stats
        ;;
    *)
        echo "Error: Invalid search type: $SEARCH_TYPE"
        exit 1
        ;;
esac

exit 0
