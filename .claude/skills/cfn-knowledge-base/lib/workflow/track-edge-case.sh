#!/usr/bin/env bash
set -euo pipefail

# track-edge-case.sh - Capture and analyze skill execution failures
# Records edge cases, detects patterns, and triggers skill update proposals

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source parameterized query library for SQL injection prevention
source "${SCRIPT_DIR}/../bootstrap/sqlite-params.sh"

DB_PATH="${DB_PATH:-${SCRIPT_DIR}/../../../../data/workflow-codification.db}"
RECURRENCE_THRESHOLD=3

# Initialize database schema
init_database() {
    sqlite3 "$DB_PATH" <<'EOF'
CREATE TABLE IF NOT EXISTS edge_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    skill_version TEXT NOT NULL,
    exit_code INTEGER NOT NULL,
    input_params TEXT NOT NULL,
    expected_output TEXT,
    actual_output TEXT,
    error_message TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    occurrence_count INTEGER DEFAULT 1,
    edge_case_hash TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'analyzing', 'proposal_generated', 'resolved')),
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_edge_cases_skill ON edge_cases(skill_name, skill_version);
CREATE INDEX IF NOT EXISTS idx_edge_cases_status ON edge_cases(status);
CREATE INDEX IF NOT EXISTS idx_edge_cases_hash ON edge_cases(edge_case_hash);
CREATE INDEX IF NOT EXISTS idx_edge_cases_timestamp ON edge_cases(timestamp);
EOF
}

# Generate unique hash for edge case pattern
generate_edge_case_hash() {
    local skill_name="$1"
    local exit_code="$2"
    local input_params="$3"

    echo -n "${skill_name}:${exit_code}:${input_params}" | sha256sum | awk '{print $1}'
}

# Record edge case
record_edge_case() {
    local skill_name="$1"
    local skill_version="$2"
    local exit_code="$3"
    local input_params="$4"
    local expected_output="${5:-}"
    local actual_output="${6:-}"
    local error_message="${7:-}"
    local metadata="${8:-{}}"

    local edge_case_hash
    edge_case_hash=$(generate_edge_case_hash "$skill_name" "$exit_code" "$input_params")

    # Check if edge case already exists (parameterized query)
    local existing_count
    existing_count=$(sqlite_select "$DB_PATH" "SELECT occurrence_count FROM edge_cases WHERE edge_case_hash = ?1" "$edge_case_hash" 2>/dev/null || echo "0")

    if [[ -n "$existing_count" && "$existing_count" != "0" ]]; then
        # Update existing edge case (parameterized query)
        local new_count=$((existing_count + 1))
        sqlite_update "$DB_PATH" \
            "UPDATE edge_cases SET occurrence_count = ?1, timestamp = datetime('now'), actual_output = ?2, error_message = ?3 WHERE edge_case_hash = ?4" \
            "$new_count" "$actual_output" "$error_message" "$edge_case_hash"
        echo "Updated edge case (occurrence: $new_count): $edge_case_hash"

        # Check if threshold reached
        if [[ $new_count -ge $RECURRENCE_THRESHOLD ]]; then
            echo "⚠️  Recurrence threshold reached ($new_count >= $RECURRENCE_THRESHOLD)"
            echo "Generating skill update proposal..."

            # Trigger skill update proposal generation
            "${SCRIPT_DIR}/generate-skill-update.sh" \
                --skill-name "$skill_name" \
                --edge-case-hash "$edge_case_hash" \
                --occurrence-count "$new_count"
        fi
    else
        # Insert new edge case (parameterized query)
        sqlite_insert "$DB_PATH" \
            "INSERT INTO edge_cases (skill_name, skill_version, exit_code, input_params, expected_output, actual_output, error_message, edge_case_hash, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)" \
            "$skill_name" "$skill_version" "$exit_code" "$input_params" "$expected_output" "$actual_output" "$error_message" "$edge_case_hash" "$metadata"
        echo "Recorded new edge case: $edge_case_hash"
    fi
}

# Query recurring edge cases
query_recurring_edge_cases() {
    local skill_name="${1:-}"

    # Use parameterized query for filtering by skill_name
    if [[ -n "$skill_name" ]]; then
        sqlite_select "$DB_PATH" \
            "SELECT skill_name, skill_version, exit_code, occurrence_count, status, timestamp, edge_case_hash FROM edge_cases WHERE skill_name = ?1 AND occurrence_count >= ?2 ORDER BY occurrence_count DESC, timestamp DESC" \
            "$skill_name" "$RECURRENCE_THRESHOLD" | sqlite3 -header -column "$DB_PATH" ".mode column"
    else
        sqlite_select "$DB_PATH" \
            "SELECT skill_name, skill_version, exit_code, occurrence_count, status, timestamp, edge_case_hash FROM edge_cases WHERE occurrence_count >= ?1 ORDER BY occurrence_count DESC, timestamp DESC" \
            "$RECURRENCE_THRESHOLD" | sqlite3 -header -column "$DB_PATH" ".mode column"
    fi
}

# Get edge case details
get_edge_case_details() {
    local edge_case_hash="$1"

    # Use parameterized query with JSON output mode
    sqlite_select "$DB_PATH" "SELECT * FROM edge_cases WHERE edge_case_hash = ?1" "$edge_case_hash" | sqlite3 -json "$DB_PATH" ".mode json"
}

# Update edge case status
update_edge_case_status() {
    local edge_case_hash="$1"
    local status="$2"

    # Use parameterized query for status update
    sqlite_update "$DB_PATH" \
        "UPDATE edge_cases SET status = ?1 WHERE edge_case_hash = ?2" \
        "$status" "$edge_case_hash"
    echo "Updated edge case status to: $status"
}

# Main execution
main() {
    # Initialize database
    init_database

    # Parse arguments
    local action=""
    local skill_name=""
    local skill_version=""
    local exit_code=""
    local input_params=""
    local expected_output=""
    local actual_output=""
    local error_message=""
    local edge_case_hash=""
    local metadata="{}"

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
            --exit-code)
                exit_code="$2"
                shift 2
                ;;
            --input-params)
                input_params="$2"
                shift 2
                ;;
            --expected-output)
                expected_output="$2"
                shift 2
                ;;
            --actual-output)
                actual_output="$2"
                shift 2
                ;;
            --error-message)
                error_message="$2"
                shift 2
                ;;
            --edge-case-hash)
                edge_case_hash="$2"
                shift 2
                ;;
            --metadata)
                metadata="$2"
                shift 2
                ;;
            --help)
                cat <<HELP
Usage: track-edge-case.sh --action <ACTION> [OPTIONS]

Actions:
  record           Record a new edge case
  query            Query recurring edge cases
  details          Get edge case details
  update-status    Update edge case status

Record Options:
  --skill-name STRING         Skill name (required)
  --skill-version STRING      Skill version (required)
  --exit-code INTEGER         Exit code (required)
  --input-params STRING       Input parameters (required)
  --expected-output STRING    Expected output (optional)
  --actual-output STRING      Actual output (optional)
  --error-message STRING      Error message (optional)
  --metadata JSON             Additional metadata (optional)

Query Options:
  --skill-name STRING         Filter by skill name (optional)

Details Options:
  --edge-case-hash STRING     Edge case hash (required)

Update Status Options:
  --edge-case-hash STRING     Edge case hash (required)
  --status STRING             New status (new|analyzing|proposal_generated|resolved)

Environment Variables:
  DB_PATH                     Path to SQLite database (default: ./workflow-codification.db)

Examples:
  # Record edge case
  track-edge-case.sh --action record \\
    --skill-name "cfn-coordination" \\
    --skill-version "1.0.0" \\
    --exit-code 1 \\
    --input-params "task-id=123 timeout=30" \\
    --error-message "Connection timeout"

  # Query recurring edge cases
  track-edge-case.sh --action query --skill-name "cfn-coordination"

  # Get edge case details
  track-edge-case.sh --action details --edge-case-hash "abc123..."

  # Update edge case status
  track-edge-case.sh --action update-status \\
    --edge-case-hash "abc123..." \\
    --status "proposal_generated"
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
        record)
            if [[ -z "$skill_name" || -z "$skill_version" || -z "$exit_code" || -z "$input_params" ]]; then
                echo "Error: --skill-name, --skill-version, --exit-code, and --input-params are required" >&2
                exit 1
            fi
            record_edge_case "$skill_name" "$skill_version" "$exit_code" "$input_params" \
                "$expected_output" "$actual_output" "$error_message" "$metadata"
            ;;
        query)
            query_recurring_edge_cases "$skill_name"
            ;;
        details)
            if [[ -z "$edge_case_hash" ]]; then
                echo "Error: --edge-case-hash is required" >&2
                exit 1
            fi
            get_edge_case_details "$edge_case_hash"
            ;;
        update-status)
            if [[ -z "$edge_case_hash" ]]; then
                echo "Error: --edge-case-hash is required" >&2
                exit 1
            fi
            update_edge_case_status "$edge_case_hash" "$status"
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
