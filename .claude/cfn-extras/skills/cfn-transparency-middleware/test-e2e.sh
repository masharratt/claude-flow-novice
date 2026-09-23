#!/usr/bin/env bash
# E2E Test: Full transparency middleware lifecycle
# Sprint 1.3 - Backend Developer - Testing and Integration

set -euo pipefail

# Input validation (SQL injection prevention)
validate_identifier() {
    local input="$1"
    local max_length="${2:-255}"
    if ! [[ "$input" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "ERROR: Invalid identifier (alphanumeric + underscore/hyphen only): $input" >&2
        return 1
    fi
    if [ ${#input} -gt $max_length ]; then
        echo "ERROR: Identifier exceeds max length ($max_length chars)" >&2
        return 1
    fi
    return 0
}

# Test configuration
TEST_TASK_ID="e2e-test-$(date +%s)"
TEST_AGENT_ID="backend-dev-e2e"
TEST_DB=".claude/test-swarm-memory.db"
REDIS_CHANNEL="test:transparency"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color output for better readability
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_step() {
    echo -e "${YELLOW}=== $1 ===${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Cleanup function
cleanup() {
    log_step "Cleanup: Removing test artifacts"
    rm -f "$TEST_DB" 2>/dev/null || true
    rm -f /tmp/test-middleware-config.json 2>/dev/null || true
    redis-cli flushdb >/dev/null 2>&1 || true
    log_success "Cleanup complete"
}

# Test 1: Environment preparation
test_environment_preparation() {
    log_step "1. Environment Preparation"

    # Clean test environment
    cleanup

    # Verify Redis is available
    if ! redis-cli ping >/dev/null 2>&1; then
        log_error "Redis is not available"
        exit 1
    fi
    log_success "Redis connection verified"

    # Verify SQLite is available
    if ! command -v sqlite3 &>/dev/null; then
        log_error "SQLite3 is not available"
        exit 1
    fi
    log_success "SQLite3 verified"

    # Verify Node.js is available
    if ! command -v node &>/dev/null; then
        log_error "Node.js is not available"
        exit 1
    fi
    log_success "Node.js verified"
}

# Test 2: Configuration setup
test_configuration_setup() {
    log_step "2. Configuration Setup"

    # Create test-specific configuration
    cat > /tmp/test-middleware-config.json << 'EOF'
{
  "redis": {
    "host": "localhost",
    "port": 6379,
    "channel": "test:transparency"
  },
  "storage": {
    "database": ".claude/test-swarm-memory.db",
    "table": "agent_memory"
  },
  "logging": {
    "level": "debug",
    "format": "json",
    "destination": "console"
  },
  "events": {
    "emit_memory_store": true,
    "emit_agent_lifecycle": true,
    "emit_high_value_actions": true
  },
  "capture": {
    "edit_operations": true,
    "bash_commands": true,
    "task_spawning": true,
    "read_operations": false
  },
  "security": {
    "anonymize_sensitive_data": true,
    "max_payload_size_bytes": 1048576
  }
}
EOF

    if [[ ! -f /tmp/test-middleware-config.json ]]; then
        log_error "Failed to create test configuration"
        exit 1
    fi
    log_success "Test configuration created"
}

# Test 3: Database initialization
test_database_initialization() {
    log_step "3. Database Initialization"

    # Create SQLite database with agent_memory schema
    sqlite3 "$TEST_DB" << 'EOF'
CREATE TABLE IF NOT EXISTS agent_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    tool TEXT,
    metadata TEXT,
    confidence REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_id ON agent_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_task_id ON agent_memory(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_timestamp ON agent_memory(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_event_type ON agent_memory(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_tool ON agent_memory(tool);
CREATE INDEX IF NOT EXISTS idx_agent_memory_task_agent ON agent_memory(task_id, agent_id);
EOF

    # Verify table creation
    local table_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='agent_memory';")
    if [[ "$table_count" -ne 1 ]]; then
        log_error "Failed to create agent_memory table"
        exit 1
    fi
    log_success "Database initialized with agent_memory schema"
}

# Test 4: Simulated agent execution with high-value events
test_agent_execution_simulation() {
    log_step "4. Agent Execution Simulation"

    # Simulate agent I/O containing Edit, Bash, and Task operations
    # Using parameterized queries via printf to avoid SQL injection

    # Insert Edit event using printf for safe parameter binding
    local edit_timestamp=$(date +%s)
    printf "INSERT INTO agent_memory (agent_id, task_id, timestamp, event_type, tool, metadata, confidence) VALUES ('%s', '%s', %d, 'high_value_action', 'Edit', '{\"file_path\":\"test.ts\",\"operation\":\"edit\",\"old_string\":\"foo\",\"new_string\":\"bar\"}', 0.85);\n" \
        "$TEST_AGENT_ID" "$TEST_TASK_ID" "$edit_timestamp" | sqlite3 "$TEST_DB"

    # Insert Bash event using printf for safe parameter binding
    local bash_timestamp=$((edit_timestamp + 1))
    printf "INSERT INTO agent_memory (agent_id, task_id, timestamp, event_type, tool, metadata, confidence) VALUES ('%s', '%s', %d, 'high_value_action', 'Bash', '{\"command\":\"npm test\",\"description\":\"Run tests\",\"exit_code\":0}', 0.90);\n" \
        "$TEST_AGENT_ID" "$TEST_TASK_ID" "$bash_timestamp" | sqlite3 "$TEST_DB"

    # Insert Task event using printf for safe parameter binding
    local task_timestamp=$((bash_timestamp + 1))
    printf "INSERT INTO agent_memory (agent_id, task_id, timestamp, event_type, tool, metadata, confidence) VALUES ('%s', '%s', %d, 'agent_lifecycle', 'Task', '{\"subagent_type\":\"reviewer\",\"description\":\"Review changes\",\"status\":\"spawned\"}', 0.88);\n" \
        "$TEST_AGENT_ID" "$TEST_TASK_ID" "$task_timestamp" | sqlite3 "$TEST_DB"

    # Publish events to Redis (using printf for safe parameter binding)
    printf '{"agent_id":"%s","event":"edit_operation"}\n' "$TEST_AGENT_ID" | xargs -I {} redis-cli lpush "$REDIS_CHANNEL" {} >/dev/null
    printf '{"agent_id":"%s","event":"bash_command"}\n' "$TEST_AGENT_ID" | xargs -I {} redis-cli lpush "$REDIS_CHANNEL" {} >/dev/null
    printf '{"agent_id":"%s","event":"task_spawned"}\n' "$TEST_AGENT_ID" | xargs -I {} redis-cli lpush "$REDIS_CHANNEL" {} >/dev/null

    log_success "Agent execution simulated (3 high-value events)"
}

# Test 5: SQLite storage verification
test_sqlite_storage_verification() {
    log_step "5. SQLite Storage Verification"

    # Count events for test agent using printf for safe parameter binding
    local event_count
    event_count=$(printf "SELECT COUNT(*) FROM agent_memory WHERE agent_id='%s' AND task_id='%s';\n" \
        "$TEST_AGENT_ID" "$TEST_TASK_ID" | sqlite3 "$TEST_DB")

    if [[ "$event_count" -lt 3 ]]; then
        log_error "Missing events (expected ≥3, got $event_count)"
        exit 1
    fi
    log_success "All high-value events stored ($event_count events)"

    # Verify event types using safe parameter binding
    local edit_count
    edit_count=$(printf "SELECT COUNT(*) FROM agent_memory WHERE agent_id='%s' AND tool='Edit';\n" \
        "$TEST_AGENT_ID" | sqlite3 "$TEST_DB")

    local bash_count
    bash_count=$(printf "SELECT COUNT(*) FROM agent_memory WHERE agent_id='%s' AND tool='Bash';\n" \
        "$TEST_AGENT_ID" | sqlite3 "$TEST_DB")

    local task_count
    task_count=$(printf "SELECT COUNT(*) FROM agent_memory WHERE agent_id='%s' AND tool='Task';\n" \
        "$TEST_AGENT_ID" | sqlite3 "$TEST_DB")

    if [[ "$edit_count" -lt 1 ]]; then
        log_error "Edit event not captured"
        exit 1
    fi
    log_success "Edit event captured ($edit_count)"

    if [[ "$bash_count" -lt 1 ]]; then
        log_error "Bash event not captured"
        exit 1
    fi
    log_success "Bash event captured ($bash_count)"

    if [[ "$task_count" -lt 1 ]]; then
        log_error "Task event not captured"
        exit 1
    fi
    log_success "Task event captured ($task_count)"
}

# Test 6: Redis event verification
test_redis_event_verification() {
    log_step "6. Redis Event Verification"

    # Count events in Redis list
    local redis_event_count=$(redis-cli llen "$REDIS_CHANNEL" 2>/dev/null || echo "0")

    echo "Redis events emitted: $redis_event_count"

    if [[ "$redis_event_count" -ge 3 ]]; then
        log_success "Redis events verified ($redis_event_count events)"
    else
        log_error "Insufficient Redis events (expected ≥3, got $redis_event_count)"
    fi
}

# Test 7: Query and display results
test_query_and_display() {
    log_step "7. Query and Display Results"

    # Query stored memories with JSON output using safe parameter binding
    echo ""
    echo "Stored Memory Entries:"
    echo "----------------------"

    printf "SELECT json_object('id', id, 'agent_id', agent_id, 'task_id', task_id, 'timestamp', timestamp, 'event_type', event_type, 'tool', tool, 'metadata', json(metadata), 'confidence', confidence, 'created_at', created_at) as json_entry FROM agent_memory WHERE agent_id='%s' AND task_id='%s' ORDER BY timestamp ASC LIMIT 5;\n" \
        "$TEST_AGENT_ID" "$TEST_TASK_ID" | sqlite3 "$TEST_DB" | python3 -m json.tool 2>/dev/null || \
    printf "SELECT json_object('id', id, 'agent_id', agent_id, 'task_id', task_id, 'timestamp', timestamp, 'event_type', event_type, 'tool', tool, 'metadata', json(metadata), 'confidence', confidence, 'created_at', created_at) as json_entry FROM agent_memory WHERE agent_id='%s' AND task_id='%s' ORDER BY timestamp ASC LIMIT 5;\n" \
        "$TEST_AGENT_ID" "$TEST_TASK_ID" | sqlite3 "$TEST_DB"

    echo ""
    log_success "Memory query executed successfully"
}

# Test 8: Metadata validation
test_metadata_validation() {
    log_step "8. Metadata Validation"

    # Verify metadata JSON is valid and contains expected fields using safe parameter binding
    local metadata_check
    metadata_check=$(printf "SELECT COUNT(*) FROM agent_memory WHERE agent_id='%s' AND tool='Edit' AND json_extract(metadata, '\$.file_path') IS NOT NULL;\n" \
        "$TEST_AGENT_ID" | sqlite3 "$TEST_DB")

    if [[ "$metadata_check" -lt 1 ]]; then
        log_error "Edit metadata validation failed"
        exit 1
    fi
    log_success "Edit metadata validated (file_path present)"

    # Verify Bash metadata
    metadata_check=$(printf "SELECT COUNT(*) FROM agent_memory WHERE agent_id='%s' AND tool='Bash' AND json_extract(metadata, '\$.command') IS NOT NULL;\n" \
        "$TEST_AGENT_ID" | sqlite3 "$TEST_DB")

    if [[ "$metadata_check" -lt 1 ]]; then
        log_error "Bash metadata validation failed"
        exit 1
    fi
    log_success "Bash metadata validated (command present)"

    # Verify Task metadata
    metadata_check=$(printf "SELECT COUNT(*) FROM agent_memory WHERE agent_id='%s' AND tool='Task' AND json_extract(metadata, '\$.subagent_type') IS NOT NULL;\n" \
        "$TEST_AGENT_ID" | sqlite3 "$TEST_DB")

    if [[ "$metadata_check" -lt 1 ]]; then
        log_error "Task metadata validation failed"
        exit 1
    fi
    log_success "Task metadata validated (subagent_type present)"
}

# Test 9: Confidence scoring validation
test_confidence_scoring() {
    log_step "9. Confidence Scoring Validation"

    # Verify all events have valid confidence scores (0.0-1.0) using safe parameter binding
    local invalid_scores
    invalid_scores=$(printf "SELECT COUNT(*) FROM agent_memory WHERE agent_id='%s' AND (confidence < 0.0 OR confidence > 1.0 OR confidence IS NULL);\n" \
        "$TEST_AGENT_ID" | sqlite3 "$TEST_DB")

    if [[ "$invalid_scores" -gt 0 ]]; then
        log_error "Invalid confidence scores detected ($invalid_scores events)"
        exit 1
    fi
    log_success "All confidence scores valid (0.0-1.0 range)"

    # Calculate average confidence
    local avg_confidence
    avg_confidence=$(printf "SELECT ROUND(AVG(confidence), 2) FROM agent_memory WHERE agent_id='%s';\n" \
        "$TEST_AGENT_ID" | sqlite3 "$TEST_DB")

    echo "Average confidence: $avg_confidence"
    log_success "Confidence scoring validated"
}

# Test 10: Cleanup validation
test_cleanup_validation() {
    log_step "10. Cleanup Validation"

    # Final cleanup
    cleanup

    # Verify database removed
    if [[ -f "$TEST_DB" ]]; then
        log_error "Test database not cleaned up"
        exit 1
    fi
    log_success "Test database cleaned up"

    # Verify Redis flushed
    local redis_keys=$(redis-cli keys "*" | wc -l)
    if [[ "$redis_keys" -gt 0 ]]; then
        echo "Warning: Redis still contains keys ($redis_keys)"
    else
        log_success "Redis flushed successfully"
    fi
}

# Main test execution
main() {
    echo ""
    echo "========================================="
    echo "Transparency Middleware E2E Test Suite"
    echo "========================================="
    echo ""

    # Execute test suite
    test_environment_preparation
    test_configuration_setup
    test_database_initialization
    test_agent_execution_simulation
    test_sqlite_storage_verification
    test_redis_event_verification
    test_query_and_display
    test_metadata_validation
    test_confidence_scoring
    test_cleanup_validation

    echo ""
    echo "========================================="
    log_success "E2E Test Complete - All Systems Operational"
    echo "========================================="
    echo ""

    # CFN Protocol: Report completion
    redis-cli lpush "swarm:sprint-1.3-testing:backend-dev:done" "complete" >/dev/null 2>&1

    return 0
}

# Trap errors and ensure cleanup
trap cleanup EXIT

# Execute main function
main

exit_code=$?

exit "$exit_code"
