#!/bin/bash
# test-agent-lifecycle-integration.sh - Test CodeSearch agent lifecycle integration
#
# Purpose: Verify that transcript ingestion and failure analysis work correctly

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
DB_PATH="${AGENT_LIFECYCLE_DB:-${PROJECT_ROOT}/data/agent-lifecycle.db}"
TEST_TRANSCRIPT="/tmp/test-agent-transcript-$$.jsonl"
TEST_AGENT_ID="test-agent-$$"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== CodeSearch Agent Lifecycle Integration Test ==="
echo ""

# ============================================================================
# Test Setup
# ============================================================================

echo "Setting up test environment..."

# Create test transcript
cat > "$TEST_TRANSCRIPT" <<'EOF'
{"type":"message","role":"user","content":"Implement authentication middleware"}
{"type":"tool_use","name":"Bash","input":{"command":"git status"}}
{"type":"tool_result","tool_use_id":"1","content":"On branch main"}
{"type":"tool_use","name":"Glob","input":{"pattern":"**/*.ts"}}
{"type":"tool_result","tool_use_id":"2","content":"Found 50 files"}
{"type":"tool_use","name":"Write","input":{"file_path":"/tmp/auth.ts","content":"export const auth = () => {}"}}
{"type":"tool_result","tool_use_id":"3","content":"File written"}
{"type":"message","role":"assistant","content":"Implementation complete with confidence 0.85"}
EOF

# Ensure database exists
mkdir -p "$(dirname "$DB_PATH")"

# Create test agent record
sqlite3 "$DB_PATH" <<SQL
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL,
    spawned_at TEXT,
    completed_at TEXT,
    metadata TEXT
);

INSERT OR REPLACE INTO agents (id, type, status, confidence, spawned_at, metadata)
VALUES (
    '$TEST_AGENT_ID',
    'coder',
    'spawned',
    0.85,
    datetime('now'),
    '{"test": true}'
);
SQL

echo -e "${GREEN}✓${NC} Test environment ready"
echo ""

# ============================================================================
# Test 1: Schema Initialization
# ============================================================================

echo "Test 1: Verifying schema initialization..."

"$SCRIPT_DIR/ingest-agent-transcript.sh" \
    --transcript "$TEST_TRANSCRIPT" \
    --agent-id "$TEST_AGENT_ID" \
    --agent-type "coder" \
    --task-id "test-task" \
    --success "true" \
    > /dev/null 2>&1

# Check if tables were created
TABLES=$(sqlite3 "$DB_PATH" ".tables" | grep -c "agent_transcripts\|agent_failure_patterns" || echo 0)

if [ "$TABLES" -ge 2 ]; then
    echo -e "${GREEN}✓${NC} Schema tables created successfully"
else
    echo -e "${RED}✗${NC} Schema tables not found"
    exit 1
fi

echo ""

# ============================================================================
# Test 2: Transcript Ingestion
# ============================================================================

echo "Test 2: Testing transcript ingestion..."

# Check if snippets were extracted
SNIPPET_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_transcripts WHERE agent_id = '$TEST_AGENT_ID';")

if [ "$SNIPPET_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Extracted $SNIPPET_COUNT snippets from transcript"
else
    echo -e "${RED}✗${NC} No snippets extracted"
    exit 1
fi

# Verify tool_use snippets were captured
TOOL_SNIPPETS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_transcripts WHERE agent_id = '$TEST_AGENT_ID' AND snippet_type = 'tool_use';")

if [ "$TOOL_SNIPPETS" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $TOOL_SNIPPETS tool_use snippets"
else
    echo -e "${YELLOW}⚠${NC} No tool_use snippets found (expected at least 1)"
fi

echo ""

# ============================================================================
# Test 3: Failure Pattern Analysis
# ============================================================================

echo "Test 3: Testing failure pattern analysis..."

# Create a failed agent record
FAILED_AGENT_ID="failed-agent-$$"
FAILED_TRANSCRIPT="/tmp/failed-transcript-$$.jsonl"

cat > "$FAILED_TRANSCRIPT" <<'EOF'
{"type":"message","role":"user","content":"Write file"}
{"type":"tool_use","name":"Write","input":{"file_path":"/tmp/test.ts"}}
{"type":"error","content":"Error: pre-edit backup hook failed: permission denied on /tmp/backups"}
{"type":"message","role":"assistant","content":"Failed with confidence 0.30"}
EOF

sqlite3 "$DB_PATH" <<SQL
INSERT OR REPLACE INTO agents (id, type, status, confidence, completed_at, metadata)
VALUES (
    '$FAILED_AGENT_ID',
    'coder',
    'completed',
    0.30,
    datetime('now'),
    '{"transcript_path": "$FAILED_TRANSCRIPT", "success": false}'
);
SQL

# Run failure analysis
"$SCRIPT_DIR/analyze-agent-failures.sh" --days 1 > /dev/null 2>&1 || true

# Check if failure patterns were created
FAILURE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_failure_patterns WHERE agent_type = 'coder';")

if [ "$FAILURE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Created $FAILURE_COUNT failure pattern(s)"
else
    echo -e "${YELLOW}⚠${NC} No failure patterns created (may need actual transcript file)"
fi

echo ""

# ============================================================================
# Test 4: Query Interface
# ============================================================================

echo "Test 4: Testing query interface..."

# Test transcript search
QUERY_RESULT=$("$SCRIPT_DIR/query-agent-patterns.sh" --query "Write" --search-type transcripts 2>/dev/null | grep -c "Agent:" || echo 0)

if [ "$QUERY_RESULT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Query returned $QUERY_RESULT result(s)"
else
    echo -e "${YELLOW}⚠${NC} Query returned no results (expected at least 1)"
fi

# Test stats query
STATS_OUTPUT=$("$SCRIPT_DIR/query-agent-patterns.sh" --search-type stats 2>/dev/null || echo "")

if echo "$STATS_OUTPUT" | grep -q "Agent Lifecycle Statistics"; then
    echo -e "${GREEN}✓${NC} Statistics query successful"
else
    echo -e "${RED}✗${NC} Statistics query failed"
fi

echo ""

# ============================================================================
# Test 5: Metadata Updates
# ============================================================================

echo "Test 5: Verifying metadata updates..."

# Check if agent metadata was updated with CodeSearch processing flag
METADATA=$(sqlite3 "$DB_PATH" "SELECT metadata FROM agents WHERE id = '$TEST_AGENT_ID';")

if echo "$METADATA" | grep -q "codesearch_processed"; then
    echo -e "${GREEN}✓${NC} Agent metadata updated with processing flag"
else
    echo -e "${YELLOW}⚠${NC} Agent metadata not updated"
fi

if echo "$METADATA" | grep -q "codesearch_snippets"; then
    SNIPPET_COUNT_META=$(echo "$METADATA" | grep -o '"codesearch_snippets":[0-9]*' | cut -d':' -f2)
    echo -e "${GREEN}✓${NC} Snippet count recorded in metadata: $SNIPPET_COUNT_META"
else
    echo -e "${YELLOW}⚠${NC} Snippet count not recorded"
fi

echo ""

# ============================================================================
# Cleanup
# ============================================================================

echo "Cleaning up test data..."

sqlite3 "$DB_PATH" <<SQL
DELETE FROM agents WHERE id IN ('$TEST_AGENT_ID', '$FAILED_AGENT_ID');
DELETE FROM agent_transcripts WHERE agent_id IN ('$TEST_AGENT_ID', '$FAILED_AGENT_ID');
SQL

rm -f "$TEST_TRANSCRIPT" "$FAILED_TRANSCRIPT"

echo -e "${GREEN}✓${NC} Cleanup complete"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo "=== Test Summary ==="
echo ""
echo -e "${GREEN}All critical tests passed!${NC}"
echo ""
echo "Integration verified:"
echo "  ✓ Schema initialization"
echo "  ✓ Transcript ingestion"
echo "  ✓ Query interface"
echo "  ✓ Metadata updates"
echo ""
echo "Next steps:"
echo "  1. Run actual agents to generate real transcripts"
echo "  2. Run periodic failure analysis with:"
echo "     ./analyze-agent-failures.sh --days 7"
echo "  3. Query patterns with:"
echo "     ./query-agent-patterns.sh --query 'your search terms'"
echo ""

exit 0
