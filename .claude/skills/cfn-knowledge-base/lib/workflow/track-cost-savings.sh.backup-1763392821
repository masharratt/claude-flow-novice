#!/usr/bin/env bash
set -euo pipefail

# track-cost-savings.sh - Log skill executions and calculate ROI metrics
# Tracks cost savings from script execution vs AI agent usage

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${DB_PATH:-${SCRIPT_DIR}/workflow-codification.db}"

# Cost constants
AI_COST_PER_MILLION=0.50  # $0.50 per 1M tokens (Z.ai glm-4.6)
SCRIPT_COST=0.0001         # Negligible script execution cost
AVG_AI_INPUT_TOKENS=2000   # Average input tokens for skill-equivalent task
AVG_AI_OUTPUT_TOKENS=1000  # Average output tokens for skill-equivalent task

# Initialize database schema
init_database() {
    sqlite3 "$DB_PATH" <<'EOF'
CREATE TABLE IF NOT EXISTS skill_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    skill_version TEXT NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    exit_code INTEGER NOT NULL,
    tokens_avoided INTEGER NOT NULL,
    cost_avoided_usd REAL NOT NULL,
    timestamp TEXT DEFAULT (datetime('now')),
    agent_type TEXT,
    task_description TEXT,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_executions_skill ON skill_executions(skill_name);
CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON skill_executions(timestamp);
CREATE INDEX IF NOT EXISTS idx_executions_exit_code ON skill_executions(exit_code);

CREATE TABLE IF NOT EXISTS roi_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT DEFAULT (date('now')),
    total_executions INTEGER NOT NULL,
    total_cost_avoided_usd REAL NOT NULL,
    total_tokens_avoided INTEGER NOT NULL,
    avg_execution_time_ms REAL NOT NULL,
    top_skill_name TEXT,
    top_skill_savings_usd REAL,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_roi_snapshots_date ON roi_snapshots(snapshot_date);
EOF
}

# Calculate AI cost based on tokens
calculate_ai_cost() {
    local input_tokens="${1:-$AVG_AI_INPUT_TOKENS}"
    local output_tokens="${2:-$AVG_AI_OUTPUT_TOKENS}"

    local total_tokens=$((input_tokens + output_tokens))
    local cost=$(echo "scale=6; ($total_tokens * $AI_COST_PER_MILLION) / 1000000" | bc)

    echo "$cost"
}

# Calculate cost savings
calculate_savings() {
    local ai_cost="$1"
    local script_cost="${2:-$SCRIPT_COST}"

    local savings=$(echo "scale=6; $ai_cost - $script_cost" | bc)
    echo "$savings"
}

# Log skill execution
log_execution() {
    local skill_name="$1"
    local skill_version="$2"
    local execution_time_ms="$3"
    local exit_code="$4"
    local tokens_avoided="${5:-$((AVG_AI_INPUT_TOKENS + AVG_AI_OUTPUT_TOKENS))}"
    local agent_type="${6:-}"
    local task_description="${7:-}"
    local metadata="${8:-{}}"

    # Calculate costs
    local input_tokens=$((tokens_avoided * 2 / 3))
    local output_tokens=$((tokens_avoided / 3))
    local ai_cost
    ai_cost=$(calculate_ai_cost "$input_tokens" "$output_tokens")
    local cost_avoided
    cost_avoided=$(calculate_savings "$ai_cost")

    # Insert execution record
    sqlite3 "$DB_PATH" <<EOF
INSERT INTO skill_executions (
    skill_name,
    skill_version,
    execution_time_ms,
    exit_code,
    tokens_avoided,
    cost_avoided_usd,
    agent_type,
    task_description,
    metadata
) VALUES (
    '$skill_name',
    '$skill_version',
    $execution_time_ms,
    $exit_code,
    $tokens_avoided,
    $cost_avoided,
    '$agent_type',
    '$task_description',
    '$metadata'
);
EOF

    echo "Logged execution: $skill_name (saved \$$cost_avoided)"
}

# Generate ROI snapshot
generate_roi_snapshot() {
    local snapshot_date="${1:-$(date +%Y-%m-%d)}"

    # Calculate aggregate metrics
    local total_executions
    total_executions=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skill_executions WHERE date(timestamp) = '$snapshot_date';")

    if [[ "$total_executions" -eq 0 ]]; then
        echo "No executions found for date: $snapshot_date"
        return 0
    fi

    local total_cost_avoided
    total_cost_avoided=$(sqlite3 "$DB_PATH" "SELECT COALESCE(SUM(cost_avoided_usd), 0) FROM skill_executions WHERE date(timestamp) = '$snapshot_date';")

    local total_tokens_avoided
    total_tokens_avoided=$(sqlite3 "$DB_PATH" "SELECT COALESCE(SUM(tokens_avoided), 0) FROM skill_executions WHERE date(timestamp) = '$snapshot_date';")

    local avg_execution_time
    avg_execution_time=$(sqlite3 "$DB_PATH" "SELECT COALESCE(AVG(execution_time_ms), 0) FROM skill_executions WHERE date(timestamp) = '$snapshot_date';")

    # Get top performing skill
    local top_skill_data
    top_skill_data=$(sqlite3 "$DB_PATH" "SELECT skill_name, SUM(cost_avoided_usd) FROM skill_executions WHERE date(timestamp) = '$snapshot_date' GROUP BY skill_name ORDER BY SUM(cost_avoided_usd) DESC LIMIT 1;")

    local top_skill_name
    local top_skill_savings
    if [[ -n "$top_skill_data" ]]; then
        top_skill_name=$(echo "$top_skill_data" | cut -d'|' -f1)
        top_skill_savings=$(echo "$top_skill_data" | cut -d'|' -f2)
    else
        top_skill_name=""
        top_skill_savings="0"
    fi

    # Insert snapshot
    sqlite3 "$DB_PATH" <<EOF
INSERT INTO roi_snapshots (
    snapshot_date,
    total_executions,
    total_cost_avoided_usd,
    total_tokens_avoided,
    avg_execution_time_ms,
    top_skill_name,
    top_skill_savings_usd,
    metadata
) VALUES (
    '$snapshot_date',
    $total_executions,
    $total_cost_avoided,
    $total_tokens_avoided,
    $avg_execution_time,
    '$top_skill_name',
    $top_skill_savings,
    '{}'
);
EOF

    echo "Generated ROI snapshot for $snapshot_date"
    echo "Total executions: $total_executions"
    echo "Total cost avoided: \$$total_cost_avoided"
    echo "Top skill: $top_skill_name (\$$top_skill_savings)"
}

# Query per-skill ROI ranking
query_skill_roi_ranking() {
    local period="${1:-30}"  # Default: last 30 days

    sqlite3 -header -column "$DB_PATH" <<EOF
SELECT
    skill_name,
    COUNT(*) as executions,
    SUM(cost_avoided_usd) as total_savings_usd,
    AVG(cost_avoided_usd) as avg_savings_per_execution,
    AVG(execution_time_ms) as avg_execution_time_ms,
    SUM(tokens_avoided) as total_tokens_avoided
FROM skill_executions
WHERE timestamp >= datetime('now', '-$period days')
GROUP BY skill_name
ORDER BY total_savings_usd DESC;
EOF
}

# Calculate monthly/annual projections
calculate_projections() {
    local period_days="${1:-30}"

    # Get average daily metrics
    local daily_executions
    daily_executions=$(sqlite3 "$DB_PATH" "SELECT COALESCE(COUNT(*) / $period_days, 0) FROM skill_executions WHERE timestamp >= datetime('now', '-$period_days days');")

    local daily_savings
    daily_savings=$(sqlite3 "$DB_PATH" "SELECT COALESCE(SUM(cost_avoided_usd) / $period_days, 0) FROM skill_executions WHERE timestamp >= datetime('now', '-$period_days days');")

    # Calculate projections
    local monthly_executions=$(echo "$daily_executions * 30" | bc)
    local monthly_savings=$(echo "scale=2; $daily_savings * 30" | bc)
    local annual_savings=$(echo "scale=2; $daily_savings * 365" | bc)

    cat <<PROJECTIONS
Cost Savings Projections (based on last $period_days days):
---------------------------------------------------------
Daily Average:
  - Executions: $daily_executions
  - Savings: \$$daily_savings

Monthly Projection:
  - Executions: $monthly_executions
  - Savings: \$$monthly_savings

Annual Projection:
  - Savings: \$$annual_savings
PROJECTIONS
}

# Export dashboard metrics
export_dashboard_metrics() {
    local output_format="${1:-json}"

    case "$output_format" in
        json)
            cat <<JSON
{
  "total_executions": $(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skill_executions;"),
  "total_cost_avoided_usd": $(sqlite3 "$DB_PATH" "SELECT COALESCE(SUM(cost_avoided_usd), 0) FROM skill_executions;"),
  "total_tokens_avoided": $(sqlite3 "$DB_PATH" "SELECT COALESCE(SUM(tokens_avoided), 0) FROM skill_executions;"),
  "avg_execution_time_ms": $(sqlite3 "$DB_PATH" "SELECT COALESCE(AVG(execution_time_ms), 0) FROM skill_executions;"),
  "success_rate": $(sqlite3 "$DB_PATH" "SELECT COALESCE(CAST(SUM(CASE WHEN exit_code = 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 0) FROM skill_executions;"),
  "last_30_days": {
    "executions": $(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skill_executions WHERE timestamp >= datetime('now', '-30 days');"),
    "cost_avoided_usd": $(sqlite3 "$DB_PATH" "SELECT COALESCE(SUM(cost_avoided_usd), 0) FROM skill_executions WHERE timestamp >= datetime('now', '-30 days');")
  }
}
JSON
            ;;
        table)
            sqlite3 -header -column "$DB_PATH" <<SQL
SELECT
    'All Time' as period,
    COUNT(*) as executions,
    SUM(cost_avoided_usd) as cost_avoided_usd,
    AVG(execution_time_ms) as avg_time_ms
FROM skill_executions
UNION ALL
SELECT
    'Last 30 Days' as period,
    COUNT(*) as executions,
    SUM(cost_avoided_usd) as cost_avoided_usd,
    AVG(execution_time_ms) as avg_time_ms
FROM skill_executions
WHERE timestamp >= datetime('now', '-30 days')
UNION ALL
SELECT
    'Last 7 Days' as period,
    COUNT(*) as executions,
    SUM(cost_avoided_usd) as cost_avoided_usd,
    AVG(execution_time_ms) as avg_time_ms
FROM skill_executions
WHERE timestamp >= datetime('now', '-7 days');
SQL
            ;;
        *)
            echo "Unknown format: $output_format" >&2
            exit 1
            ;;
    esac
}

# Main execution
main() {
    # Initialize database
    init_database

    # Parse arguments
    local action=""
    local skill_name=""
    local skill_version=""
    local execution_time_ms=""
    local exit_code=""
    local tokens_avoided=""
    local agent_type=""
    local task_description=""
    local metadata="{}"
    local period="30"
    local output_format="json"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --action)
                action="$2"
                shift 2
                ;;
            --skill-name)
                skill_name="$2"
                shift 2
                ;;
            --skill-version)
                skill_version="$2"
                shift 2
                ;;
            --execution-time-ms)
                execution_time_ms="$2"
                shift 2
                ;;
            --exit-code)
                exit_code="$2"
                shift 2
                ;;
            --tokens-avoided)
                tokens_avoided="$2"
                shift 2
                ;;
            --agent-type)
                agent_type="$2"
                shift 2
                ;;
            --task-description)
                task_description="$2"
                shift 2
                ;;
            --metadata)
                metadata="$2"
                shift 2
                ;;
            --period)
                period="$2"
                shift 2
                ;;
            --format)
                output_format="$2"
                shift 2
                ;;
            --help)
                cat <<HELP
Usage: track-cost-savings.sh --action <ACTION> [OPTIONS]

Actions:
  log              Log skill execution
  snapshot         Generate ROI snapshot
  ranking          Query per-skill ROI ranking
  projections      Calculate monthly/annual projections
  dashboard        Export dashboard metrics

Log Options:
  --skill-name STRING           Skill name (required)
  --skill-version STRING        Skill version (required)
  --execution-time-ms INTEGER   Execution time in milliseconds (required)
  --exit-code INTEGER           Exit code (required)
  --tokens-avoided INTEGER      Tokens avoided (default: 3000)
  --agent-type STRING           Agent type (optional)
  --task-description STRING     Task description (optional)
  --metadata JSON               Additional metadata (optional)

Ranking/Projections Options:
  --period INTEGER              Analysis period in days (default: 30)

Dashboard Options:
  --format STRING               Output format: json|table (default: json)

Environment Variables:
  DB_PATH                       Path to SQLite database (default: ./workflow-codification.db)

Examples:
  # Log execution
  track-cost-savings.sh --action log \\
    --skill-name "cfn-coordination" \\
    --skill-version "1.0.0" \\
    --execution-time-ms 150 \\
    --exit-code 0 \\
    --tokens-avoided 3000

  # Generate daily ROI snapshot
  track-cost-savings.sh --action snapshot

  # Query skill ROI ranking (last 30 days)
  track-cost-savings.sh --action ranking --period 30

  # Calculate projections
  track-cost-savings.sh --action projections --period 30

  # Export dashboard metrics
  track-cost-savings.sh --action dashboard --format json
HELP
                exit 0
                ;;
            *)
                echo "Unknown argument: $1" >&2
                exit 1
                ;;
        esac
    done

    # Execute action
    case "$action" in
        log)
            if [[ -z "$skill_name" || -z "$skill_version" || -z "$execution_time_ms" || -z "$exit_code" ]]; then
                echo "Error: --skill-name, --skill-version, --execution-time-ms, and --exit-code are required" >&2
                exit 1
            fi
            log_execution "$skill_name" "$skill_version" "$execution_time_ms" "$exit_code" \
                "$tokens_avoided" "$agent_type" "$task_description" "$metadata"
            ;;
        snapshot)
            generate_roi_snapshot
            ;;
        ranking)
            query_skill_roi_ranking "$period"
            ;;
        projections)
            calculate_projections "$period"
            ;;
        dashboard)
            export_dashboard_metrics "$output_format"
            ;;
        *)
            echo "Error: Invalid action. Use --help for usage information." >&2
            exit 1
            ;;
    esac
}

# Execute main if not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
