#!/bin/bash
set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${COORDINATION_DB_PATH:-$SCRIPT_DIR/generations.db}"
CODESEARCH_INDEX="${CODESEARCH_INDEX_PATH:-./.claude/skills/cfn-codesearch/data}"

# Parse arguments
FILE_TYPE=""
PATTERN=""
AGENT_ID=""
SUCCESS_RATE_THRESHOLD=""
LIMIT="10"
FORMAT="table"

while [[ $# -gt 0 ]]; do
    case $1 in
        --file-type) FILE_TYPE="$2"; shift 2 ;;
        --pattern) PATTERN="$2"; shift 2 ;;
        --agent-id) AGENT_ID="$2"; shift 2 ;;
        --success-rate-threshold) SUCCESS_RATE_THRESHOLD="$2"; shift 2 ;;
        --limit) LIMIT="$2"; shift 2 ;;
        --format) FORMAT="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Query successful patterns from database
query_db_patterns() {
    local where_clause="WHERE success = 1"

    [[ -n "$FILE_TYPE" ]] && where_clause="$where_clause AND file_type = '$FILE_TYPE'"
    [[ -n "$AGENT_ID" ]] && where_clause="$where_clause AND agent_id LIKE '%$AGENT_ID%'"
    [[ -n "$SUCCESS_RATE_THRESHOLD" ]] && where_clause="$where_clause AND confidence_score >= $SUCCESS_RATE_THRESHOLD"

    sqlite3 "$DB_PATH" <<EOF
SELECT
    agent_id,
    file_type,
    prompt,
    confidence_score,
    created_at,
    model
FROM generations
$where_clause
ORDER BY confidence_score DESC, created_at DESC
LIMIT $LIMIT;
EOF
}

# Query patterns from CodeSearch
query_codesearch_patterns() {
    local query=""

    [[ -n "$FILE_TYPE" ]] && query="$query $FILE_TYPE"
    [[ -n "$PATTERN" ]] && query="$query $PATTERN"

    if [[ -z "$query" ]]; then
        echo "No query specified for CodeSearch search"
        return 1
    fi

    if [[ -f "$CODESEARCH_INDEX/search.sh" ]]; then
        echo "Querying CodeSearch for: $query"
        "$CODESEARCH_INDEX/search.sh" "$query" --top "$LIMIT" 2>/dev/null || \
        echo "CodeSearch search failed"
    else
        echo "CodeSearch not found at $CODESEARCH_INDEX"
    fi
}

# Format output
format_table() {
    echo "📊 Successful Code Generation Patterns"
    echo "======================================"
    echo

    if command -v column >/dev/null 2>&1; then
        # Use column for pretty formatting
        query_db_patterns | \
        awk 'NR>1 {printf "%-15s %-8s %-50s %-8s %s\n", $1, $2, substr($3, 1, 50), $4, $5}' | \
        column -t -s " " -N "Agent,Type,Prompt,Confidence,Created"
    else
        # Simple formatting
        echo "Agent         | Type   | Prompt Preview                                    | Confidence | Created"
        echo "--------------|--------|--------------------------------------------------|------------|---------"
        query_db_patterns | \
        awk 'NR>1 {printf "%-13s | %-6s | %-48s | %-10s | %s\n", $1, $2, substr($3, 1, 48), $4, $5}'
    fi
}

format_json() {
    echo "{"
    echo "  \"patterns\": ["
    local first=true
    query_db_patterns | while IFS='|' read -r agent_id file_type prompt confidence created_at model; do
        if [[ "$first" == "false" ]]; then
            echo ","
        fi
        echo "    {"
        echo "      \"agent_id\": \"$agent_id\","
        echo "      \"file_type\": \"$file_type\","
        echo "      \"prompt\": $(echo "$prompt" | jq -Rs .),"
        echo "      \"confidence_score\": $confidence,"
        echo "      \"created_at\": \"$created_at\","
        echo "      \"model\": \"$model\""
        echo -n "    }"
        first=false
    done
    echo ""
    echo "  ]"
    echo "}"
}

format_prompt() {
    echo "# Top Prompts for $FILE_TYPE files"
    echo
    query_db_patterns | while IFS='|' read -r agent_id file_type prompt confidence created_at model; do
        echo "## Prompt (Confidence: $confidence)"
        echo
        echo "$prompt"
        echo
        echo "---"
        echo
    done
}

# Get statistics
get_statistics() {
    echo "📈 Pattern Statistics"
    echo "===================="
    echo

    sqlite3 "$DB_PATH" <<'EOF'
SELECT
    'Total Generations:' as metric,
    COUNT(*) as value
FROM generations
UNION ALL
SELECT
    'Success Rate:',
    ROUND(COUNT(CASE WHEN success = 1 THEN 1 END) * 100.0 / COUNT(*), 2) || '%'
FROM generations
UNION ALL
SELECT
    'Avg Confidence:',
    ROUND(AVG(confidence_score), 2)
FROM generations
WHERE success = 1
UNION ALL
SELECT
    'Top Agent:',
    agent_id
FROM generations
GROUP BY agent_id
ORDER BY COUNT(*) DESC
LIMIT 1;
EOF
}

# Main execution
echo "🔍 Querying Code Generation Patterns"
echo "=================================="
echo

if [[ "$FORMAT" == "json" ]]; then
    format_json
elif [[ "$FORMAT" == "prompt" ]]; then
    format_prompt
else
    get_statistics
    echo
    format_table
fi

echo
echo "💡 Tips:"
echo "  - Use --agent-id to find patterns specific to an agent"
echo "  - Use --file-type to filter by file extension (rs, ts, py, etc.)"
echo "  - Use --success-rate-threshold to find high-confidence patterns"
echo "  - Use --format json for machine-readable output"