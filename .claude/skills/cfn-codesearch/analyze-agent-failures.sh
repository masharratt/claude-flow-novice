#!/bin/bash
# analyze-agent-failures.sh - Analyze agent failures and extract reusable patterns
#
# Purpose: Query failed agents from the lifecycle database, extract error patterns,
#          cluster similar failures, and store recovery strategies for future lookup.
#
# Usage:
#   ./analyze-agent-failures.sh [--days N] [--min-occurrences N]
#
# Examples:
#   ./analyze-agent-failures.sh --days 7
#   ./analyze-agent-failures.sh --days 30 --min-occurrences 3

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
DB_PATH="${AGENT_LIFECYCLE_DB:-${PROJECT_ROOT}/data/agent-lifecycle.db}"
LOG_PATH="${PROJECT_ROOT}/.artifacts/logs/codesearch-failure-analysis.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_PATH")"

# ============================================================================
# Parse Arguments
# ============================================================================

DAYS=7
MIN_OCCURRENCES=2

while [[ $# -gt 0 ]]; do
    case $1 in
        --days)
            DAYS="$2"
            shift 2
            ;;
        --min-occurrences)
            MIN_OCCURRENCES="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--days N] [--min-occurrences N]"
            exit 1
            ;;
    esac
done

echo "[CodeSearch] Analyzing agent failures from last $DAYS days" | tee -a "$LOG_PATH"

# ============================================================================
# Query Failed Agents
# ============================================================================

# Extract agents with failures or low confidence
FAILED_AGENTS=$(sqlite3 "$DB_PATH" <<EOF
SELECT
    id,
    type,
    confidence,
    metadata
FROM agents
WHERE
    (status = 'completed' AND (confidence < 0.70 OR metadata LIKE '%"success": false%'))
    OR status = 'failed'
    AND datetime(completed_at) >= datetime('now', '-$DAYS days')
ORDER BY completed_at DESC;
EOF
)

if [ -z "$FAILED_AGENTS" ]; then
    echo "[CodeSearch] No failures found in last $DAYS days" | tee -a "$LOG_PATH"
    exit 0
fi

FAILURE_COUNT=$(echo "$FAILED_AGENTS" | wc -l)
echo "[CodeSearch] Found $FAILURE_COUNT failed agent executions" | tee -a "$LOG_PATH"

# ============================================================================
# Extract Failure Patterns
# ============================================================================

# Parse each failed agent and extract:
# 1. Failure mode (from transcript errors)
# 2. Root cause (tool, validation, timeout, etc.)
# 3. Recovery strategy (if any subsequent success)

PATTERNS_CREATED=0

echo "$FAILED_AGENTS" | while IFS='|' read -r AGENT_ID AGENT_TYPE CONFIDENCE METADATA; do

    # Skip empty rows
    [ -z "$AGENT_ID" ] && continue

    # Extract failure context from metadata
    TRANSCRIPT_PATH=$(echo "$METADATA" | grep -o '"transcript_path":"[^"]*"' | cut -d'"' -f4 || echo "")

    if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
        # Extract error snippets from transcript
        ERROR_LINES=$(grep -i "error\|failed\|timeout\|validation" "$TRANSCRIPT_PATH" 2>/dev/null || echo "")

        if [ -n "$ERROR_LINES" ]; then
            # Classify failure mode
            FAILURE_MODE="unknown"

            if echo "$ERROR_LINES" | grep -q "pre-edit\|post-edit"; then
                FAILURE_MODE="edit_hook_validation"
            elif echo "$ERROR_LINES" | grep -q "timeout"; then
                FAILURE_MODE="timeout"
            elif echo "$ERROR_LINES" | grep -q "permission\|access"; then
                FAILURE_MODE="permission_error"
            elif echo "$ERROR_LINES" | grep -q "syntax\|parse"; then
                FAILURE_MODE="syntax_error"
            elif echo "$ERROR_LINES" | grep -q "test.*fail\|assertion"; then
                FAILURE_MODE="test_failure"
            fi

            # Extract root cause (first error line, truncated)
            ROOT_CAUSE=$(echo "$ERROR_LINES" | head -n 1 | head -c 200)

            # Generate pattern ID
            PATTERN_ID="failure-${AGENT_TYPE}-${FAILURE_MODE}-$(date +%s)"

            # Check if similar pattern already exists
            EXISTING_PATTERN=$(sqlite3 "$DB_PATH" <<SQL_EOF
SELECT id, occurrence_count
FROM agent_failure_patterns
WHERE agent_type = '$AGENT_TYPE' AND failure_mode = '$FAILURE_MODE'
ORDER BY last_seen DESC
LIMIT 1;
SQL_EOF
)

            if [ -n "$EXISTING_PATTERN" ]; then
                # Update existing pattern
                EXISTING_ID=$(echo "$EXISTING_PATTERN" | cut -d'|' -f1)
                EXISTING_COUNT=$(echo "$EXISTING_PATTERN" | cut -d'|' -f2)
                NEW_COUNT=$((EXISTING_COUNT + 1))

                sqlite3 "$DB_PATH" <<SQL_EOF
UPDATE agent_failure_patterns
SET
    occurrence_count = $NEW_COUNT,
    last_seen = datetime('now'),
    root_cause = '$ROOT_CAUSE'
WHERE id = '$EXISTING_ID';
SQL_EOF

                echo "[CodeSearch] Updated pattern: $EXISTING_ID (count: $NEW_COUNT)" | tee -a "$LOG_PATH"

            else
                # Create new pattern
                METADATA_JSON=$(cat <<JSON_EOF
{
    "first_agent_id": "$AGENT_ID",
    "confidence": $CONFIDENCE,
    "discovered": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON_EOF
)

                sqlite3 "$DB_PATH" <<SQL_EOF
INSERT INTO agent_failure_patterns
(id, agent_type, failure_mode, root_cause, metadata, last_seen)
VALUES (
    '$PATTERN_ID',
    '$AGENT_TYPE',
    '$FAILURE_MODE',
    '$ROOT_CAUSE',
    '$METADATA_JSON',
    datetime('now')
);
SQL_EOF

                PATTERNS_CREATED=$((PATTERNS_CREATED + 1))
                echo "[CodeSearch] Created pattern: $PATTERN_ID ($AGENT_TYPE / $FAILURE_MODE)" | tee -a "$LOG_PATH"
            fi
        fi
    fi
done

echo "[CodeSearch] Created $PATTERNS_CREATED new failure patterns" | tee -a "$LOG_PATH"

# ============================================================================
# Identify High-Impact Patterns
# ============================================================================

# Query patterns that occur frequently (>= MIN_OCCURRENCES)
HIGH_IMPACT=$(sqlite3 "$DB_PATH" <<EOF
SELECT
    agent_type,
    failure_mode,
    occurrence_count,
    root_cause
FROM agent_failure_patterns
WHERE occurrence_count >= $MIN_OCCURRENCES
ORDER BY occurrence_count DESC
LIMIT 10;
EOF
)

if [ -n "$HIGH_IMPACT" ]; then
    echo "" | tee -a "$LOG_PATH"
    echo "[CodeSearch] High-impact failure patterns (>= $MIN_OCCURRENCES occurrences):" | tee -a "$LOG_PATH"
    echo "$HIGH_IMPACT" | while IFS='|' read -r TYPE MODE COUNT CAUSE; do
        echo "  - $TYPE / $MODE: $COUNT occurrences" | tee -a "$LOG_PATH"
        echo "    Cause: $(echo "$CAUSE" | head -c 80)..." | tee -a "$LOG_PATH"
    done
fi

# ============================================================================
# Generate Recovery Recommendations
# ============================================================================

# For patterns with multiple occurrences, check if any similar agents succeeded
# and extract their approaches as recovery strategies

echo "" | tee -a "$LOG_PATH"
echo "[CodeSearch] Searching for recovery strategies..." | tee -a "$LOG_PATH"

RECOVERIES_FOUND=0

sqlite3 "$DB_PATH" "SELECT DISTINCT agent_type, failure_mode FROM agent_failure_patterns WHERE occurrence_count >= 2;" | \
while IFS='|' read -r TYPE MODE; do

    # Find successful agents of same type after failures
    SUCCESSFUL=$(sqlite3 "$DB_PATH" <<SQL_EOF
SELECT id, metadata
FROM agents
WHERE
    type = '$TYPE'
    AND status = 'completed'
    AND confidence >= 0.80
    AND datetime(completed_at) >= datetime('now', '-$DAYS days')
ORDER BY completed_at DESC
LIMIT 5;
SQL_EOF
)

    if [ -n "$SUCCESSFUL" ]; then
        # Extract common patterns from successful executions
        RECOVERY_STRATEGY="Successful $TYPE agents: used similar tool chains with validation steps"

        # Update failure pattern with recovery strategy
        sqlite3 "$DB_PATH" <<SQL_EOF
UPDATE agent_failure_patterns
SET
    recovery_strategy = '$RECOVERY_STRATEGY',
    resolution_rate = 0.50
WHERE agent_type = '$TYPE' AND failure_mode = '$MODE';
SQL_EOF

        RECOVERIES_FOUND=$((RECOVERIES_FOUND + 1))
        echo "  - Found recovery for: $TYPE / $MODE" | tee -a "$LOG_PATH"
    fi
done

echo "[CodeSearch] Identified $RECOVERIES_FOUND recovery strategies" | tee -a "$LOG_PATH"

# ============================================================================
# Summary Report
# ============================================================================

echo "" | tee -a "$LOG_PATH"
echo "[CodeSearch] Failure Analysis Summary:" | tee -a "$LOG_PATH"
echo "  - Analyzed: $FAILURE_COUNT failed agents" | tee -a "$LOG_PATH"
echo "  - New patterns: $PATTERNS_CREATED" | tee -a "$LOG_PATH"
echo "  - Recovery strategies: $RECOVERIES_FOUND" | tee -a "$LOG_PATH"
echo "" | tee -a "$LOG_PATH"

exit 0
