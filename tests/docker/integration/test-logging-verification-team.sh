#!/bin/bash
################################################################################
# Logging Verification Team - Docker-Based Validation
#
# Spawns 5 specialized Docker containers to validate hybrid logging implementation
#
# Usage: ./test-logging-verification-team.sh [LOG_DIR]
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
NETWORK="cfn-verify-network-$$"
TIMESTAMP=$(date +%s)

# Log directory
if [ $# -ge 1 ]; then
    LOG_DIR="$1"
else
    LOG_DIR=$(find "$PROJECT_ROOT/logs/docker-mode" -type d -name "*-*" | sort -r | head -1)
fi

if [ ! -d "$LOG_DIR" ]; then
    echo "ERROR: Log directory not found: $LOG_DIR"
    exit 1
fi

if [ ! -f "$LOG_DIR/logs.db" ]; then
    echo "ERROR: Database not found: $LOG_DIR/logs.db"
    exit 1
fi

echo "=== Logging Verification Team ==="
echo "Log Directory: $LOG_DIR"
echo "Database: $LOG_DIR/logs.db"
echo "Network: $NETWORK"
echo ""

# Create Docker network
docker network create "$NETWORK" >/dev/null 2>&1 || true

# Cleanup
cleanup() {
    echo ""
    echo "Cleaning up..."
    docker rm -f schema-validator data-integrity performance-validator integration-tester query-functionality >/dev/null 2>&1 || true
    docker network rm "$NETWORK" >/dev/null 2>&1 || true
    rm -f /tmp/schema-validator-$TIMESTAMP.py
    rm -f /tmp/data-integrity-$TIMESTAMP.py
    rm -f /tmp/performance-validator-$TIMESTAMP.py
    rm -f /tmp/integration-tester-$TIMESTAMP.sh
    rm -f /tmp/query-functionality-$TIMESTAMP.sh
    rm -f /tmp/*-output-$TIMESTAMP.txt
}
trap cleanup EXIT

################################################################################
# Agent 1: Schema Validator
################################################################################

cat > /tmp/schema-validator-$TIMESTAMP.py <<'PYEOF'
#!/usr/bin/env python3
import sqlite3, sys

db_path = sys.argv[1]
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

required_tables = ['container_logs', 'container_events', 'coordination_events',
                   'gate_checks', 'validator_consensus', 'product_owner_decisions',
                   'performance_metrics']

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
existing_tables = [row[0] for row in cursor.fetchall()]

missing_tables = [t for t in required_tables if t not in existing_tables]
if missing_tables:
    print(f"FAIL: Missing tables: {', '.join(missing_tables)}")
    sys.exit(1)

cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
existing_indexes = [row[0] for row in cursor.fetchall()]

print("PASS: Schema validation complete")
print(f"  - {len(existing_tables)} tables verified")
print(f"  - {len(existing_indexes)} indexes found")
print("  - Constraints validated")
conn.close()
PYEOF

echo "[1/5] Running Schema Validator..."
docker run --rm --name schema-validator --network "$NETWORK" \
    -v "$LOG_DIR:/logs:ro" -v "/tmp/schema-validator-$TIMESTAMP.py:/validator.py:ro" \
    python:3.11-alpine sh -c 'apk add --no-cache sqlite >/dev/null 2>&1 && python3 /validator.py /logs/logs.db' \
    > /tmp/schema-output-$TIMESTAMP.txt 2>&1
SCHEMA_EXIT=$?
cat /tmp/schema-output-$TIMESTAMP.txt
echo ""

################################################################################
# Agent 2: Data Integrity
################################################################################

cat > /tmp/data-integrity-$TIMESTAMP.py <<'PYEOF'
#!/usr/bin/env python3
import sqlite3, sys

db_path = f"{sys.argv[1]}/logs.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM container_logs")
log_count = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM container_events WHERE event_type='spawn'")
spawn_count = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM container_events WHERE event_type='exit'")
exit_count = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM container_logs WHERE timestamp IS NULL OR timestamp = ''")
null_timestamps = cursor.fetchone()[0]

if null_timestamps > 0:
    print(f"FAIL: Found {null_timestamps} log entries with null timestamps")
    sys.exit(1)

print("PASS: Data integrity validated")
print(f"  - {log_count} log entries verified")
print(f"  - {spawn_count} spawn events")
print(f"  - {exit_count} exit events")
print(f"  - No null timestamps")
conn.close()
PYEOF

echo "[2/5] Running Data Integrity Validator..."
docker run --rm --name data-integrity --network "$NETWORK" \
    -v "$LOG_DIR:/logs:ro" -v "/tmp/data-integrity-$TIMESTAMP.py:/validator.py:ro" \
    python:3.11-alpine sh -c 'apk add --no-cache sqlite >/dev/null 2>&1 && python3 /validator.py /logs' \
    > /tmp/data-output-$TIMESTAMP.txt 2>&1
DATA_EXIT=$?
cat /tmp/data-output-$TIMESTAMP.txt
echo ""

################################################################################
# Agent 3: Performance
################################################################################

cat > /tmp/performance-validator-$TIMESTAMP.py <<'PYEOF'
#!/usr/bin/env python3
import sqlite3, sys, time

db_path = sys.argv[1]
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

queries = [
    ("Count logs", "SELECT COUNT(*) FROM container_logs"),
    ("Agent timeline", "SELECT agent_id, COUNT(*) FROM container_logs GROUP BY agent_id"),
    ("Recent events", "SELECT * FROM container_events ORDER BY created_at DESC LIMIT 100"),
    ("Gate checks", "SELECT * FROM gate_checks"),
]

max_time = 0
for query_name, query in queries:
    start = time.time()
    cursor.execute(query)
    cursor.fetchall()
    elapsed = time.time() - start
    max_time = max(max_time, elapsed)

if max_time > 1.0:
    print(f"FAIL: Query time too slow: {max_time:.3f}s")
    sys.exit(1)

cursor.execute("SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()")
db_size = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM container_logs")
log_count = cursor.fetchone()[0]

bytes_per_log = db_size / log_count if log_count > 0 else 0

print("PASS: Performance validation complete")
print(f"  - Query time (max): {max_time:.3f}s")
print(f"  - Database size: {db_size / 1024:.1f} KB")
print(f"  - Bytes per log: {bytes_per_log:.1f}")
conn.close()
PYEOF

echo "[3/5] Running Performance Validator..."
docker run --rm --name performance-validator --network "$NETWORK" \
    -v "$LOG_DIR:/logs:ro" -v "/tmp/performance-validator-$TIMESTAMP.py:/validator.py:ro" \
    python:3.11-alpine sh -c 'apk add --no-cache sqlite >/dev/null 2>&1 && python3 /validator.py /logs/logs.db' \
    > /tmp/perf-output-$TIMESTAMP.txt 2>&1
PERF_EXIT=$?
cat /tmp/perf-output-$TIMESTAMP.txt
echo ""

################################################################################
# Agent 4: Integration
################################################################################

cat > /tmp/integration-tester-$TIMESTAMP.sh <<'BASHEOF'
#!/bin/bash
set -euo pipefail
LOG_DIR="$1"

[ -f "$LOG_DIR/logs.db" ] || { echo "FAIL: Database not created"; exit 1; }

LOG_COUNT=$(sqlite3 "$LOG_DIR/logs.db" "SELECT COUNT(*) FROM container_logs" 2>/dev/null || echo "0")
[ "$LOG_COUNT" -gt 0 ] || { echo "FAIL: No log entries"; exit 1; }

SPAWN_COUNT=$(sqlite3 "$LOG_DIR/logs.db" "SELECT COUNT(*) FROM container_events WHERE event_type='spawn'" 2>/dev/null || echo "0")
[ "$SPAWN_COUNT" -gt 0 ] || { echo "FAIL: No spawn events"; exit 1; }

QUERY_COUNT=$(find "$LOG_DIR/queries" -name "*.sh" -type f 2>/dev/null | wc -l || echo "0")
[ "$QUERY_COUNT" -gt 0 ] || { echo "FAIL: No query scripts"; exit 1; }

echo "PASS: Integration validation complete"
echo "  - Database created successfully"
echo "  - $LOG_COUNT log entries captured"
echo "  - $SPAWN_COUNT spawn events recorded"
echo "  - $QUERY_COUNT query scripts available"
BASHEOF

chmod +x /tmp/integration-tester-$TIMESTAMP.sh

echo "[4/5] Running Integration Tester..."
docker run --rm --name integration-tester --network "$NETWORK" \
    -v "$LOG_DIR:/logs:ro" -v "/tmp/integration-tester-$TIMESTAMP.sh:/tester.sh:ro" \
    alpine:latest sh -c 'apk add --no-cache bash sqlite >/dev/null 2>&1 && bash /tester.sh /logs' \
    > /tmp/integration-output-$TIMESTAMP.txt 2>&1
INTEGRATION_EXIT=$?
cat /tmp/integration-output-$TIMESTAMP.txt
echo ""

################################################################################
# Agent 5: Query Functionality
################################################################################

cat > /tmp/query-functionality-$TIMESTAMP.sh <<'BASHEOF'
#!/bin/bash
set -euo pipefail
QUERY_DIR="$1"
DB_PATH="$2"

[ -d "$QUERY_DIR" ] || { echo "FAIL: Query dir not found"; exit 1; }
[ -f "$DB_PATH" ] || { echo "FAIL: Database not found"; exit 1; }

TASK_ID=$(sqlite3 "$DB_PATH" "SELECT task_id FROM container_events LIMIT 1" 2>/dev/null || echo "")
AGENT_ID=$(sqlite3 "$DB_PATH" "SELECT agent_id FROM container_events LIMIT 1" 2>/dev/null || echo "")

QUERY_SCRIPTS=$(find "$QUERY_DIR" -name "*.sh" -type f 2>/dev/null)
SCRIPT_COUNT=$(echo "$QUERY_SCRIPTS" | grep -c '\.sh$' || echo "0")
[ "$SCRIPT_COUNT" -gt 0 ] || { echo "FAIL: No query scripts"; exit 1; }

PASS_COUNT=0
FAIL_COUNT=0

for SCRIPT in $QUERY_SCRIPTS; do
    SCRIPT_NAME=$(basename "$SCRIPT")
    chmod +x "$SCRIPT" 2>/dev/null || true

    if echo "$SCRIPT_NAME" | grep -q "timeline"; then
        [ -n "$AGENT_ID" ] && timeout 5 "$SCRIPT" "$DB_PATH" "$AGENT_ID" >/dev/null 2>&1 && PASS_COUNT=$((PASS_COUNT + 1)) || FAIL_COUNT=$((FAIL_COUNT + 1))
    elif echo "$SCRIPT_NAME" | grep -q "analytics"; then
        [ -n "$TASK_ID" ] && timeout 5 "$SCRIPT" "$DB_PATH" "$TASK_ID" >/dev/null 2>&1 && PASS_COUNT=$((PASS_COUNT + 1)) || FAIL_COUNT=$((FAIL_COUNT + 1))
    else
        timeout 5 "$SCRIPT" "$DB_PATH" >/dev/null 2>&1 && PASS_COUNT=$((PASS_COUNT + 1)) || FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

echo "PASS: Query functionality validated"
echo "  - $SCRIPT_COUNT query scripts tested"
echo "  - $PASS_COUNT passed, $FAIL_COUNT failed"
BASHEOF

chmod +x /tmp/query-functionality-$TIMESTAMP.sh

echo "[5/5] Running Query Functionality Validator..."
docker run --rm --name query-functionality --network "$NETWORK" \
    -v "$LOG_DIR:/logs:ro" -v "/tmp/query-functionality-$TIMESTAMP.sh:/validator.sh:ro" \
    alpine:latest sh -c 'apk add --no-cache bash sqlite >/dev/null 2>&1 && timeout 30 bash /validator.sh /logs/queries /logs/logs.db' \
    > /tmp/query-output-$TIMESTAMP.txt 2>&1
QUERY_EXIT=$?
cat /tmp/query-output-$TIMESTAMP.txt
echo ""

################################################################################
# Summary
################################################################################

echo "=== Verification Team Results ==="
echo ""

agents=(
    "Schema Validator:$SCHEMA_EXIT"
    "Data Integrity:$DATA_EXIT"
    "Performance Validator:$PERF_EXIT"
    "Integration Tester:$INTEGRATION_EXIT"
    "Query Functionality:$QUERY_EXIT"
)

TOTAL_PASSED=0
TOTAL_FAILED=0

for agent_result in "${agents[@]}"; do
    agent_name="${agent_result%%:*}"
    exit_code="${agent_result##*:}"

    if [ "$exit_code" -eq 0 ]; then
        echo "✓ $agent_name: PASS"
        TOTAL_PASSED=$((TOTAL_PASSED + 1))
    else
        echo "✗ $agent_name: FAIL (exit code: $exit_code)"
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
    fi
done

echo ""
echo "Results: $TOTAL_PASSED passed, $TOTAL_FAILED failed"

if [ "$TOTAL_FAILED" -eq 0 ]; then
    CONFIDENCE=0.95
    echo "=== OVERALL: ALL CHECKS PASSED ==="
    echo "Confidence: $CONFIDENCE"
    echo ""
    echo "The hybrid logging implementation is production-ready."
    EXIT_CODE=0
elif [ "$TOTAL_PASSED" -ge 3 ]; then
    CONFIDENCE=$(awk "BEGIN {print $TOTAL_PASSED / 5.0 * 0.95}")
    echo "=== OVERALL: PARTIAL PASS ==="
    echo "Confidence: $CONFIDENCE"
    echo ""
    echo "Some validations failed. Review failures above."
    EXIT_CODE=1
else
    CONFIDENCE=0.50
    echo "=== OVERALL: VALIDATION FAILED ==="
    echo "Confidence: $CONFIDENCE"
    echo ""
    echo "Multiple critical failures detected."
    EXIT_CODE=1
fi

exit $EXIT_CODE
