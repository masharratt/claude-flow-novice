#!/usr/bin/env bash
# Tests for decision-log enhancements: recency boost, project affinity, lookup.sh
# Uses a temp DB so it never touches the real decisions.db

set -euo pipefail

PASS=0
FAIL=0
SKIP=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
skip() { echo "  SKIP: $1"; SKIP=$((SKIP + 1)); }

SKILL_DIR="$(cd "$(dirname "$0")/../.claude/skills/decision-log" && pwd)"
TMPDB=$(mktemp /tmp/dl-test-XXXXXX.db)
SCHEMA="$SKILL_DIR/schema.sql"

cleanup() { rm -f "$TMPDB"; }
trap cleanup EXIT

echo "=== decision-log enhancement tests ==="
echo ""

# --- Setup: seed temp DB ---
echo "Seeding test database..."
sqlite3 "$TMPDB" < "$SCHEMA"

sqlite3 "$TMPDB" <<'SQL'
INSERT INTO messages (session_id, project, uuid, role, content, timestamp)
VALUES
  ('sess1', 'daily-seo',  'uuid-1', 'user',      'database migration postgres schema change', '2024-01-01T00:00:00Z'),
  ('sess1', 'daily-seo',  'uuid-2', 'assistant', 'always use explicit schema qualification', '2024-01-02T00:00:00Z'),
  ('sess2', 'fireside',   'uuid-3', 'user',      'database connection pool configuration', '2026-04-01T00:00:00Z'),
  ('sess2', 'fireside',   'uuid-4', 'assistant', 'use pool_size param in connection string', '2026-04-02T00:00:00Z'),
  ('sess3', 'daily-seo',  'uuid-5', 'user',      'deploy fly.io environment variable missing', '2026-04-10T00:00:00Z'),
  ('sess3', 'daily-seo',  'uuid-6', 'assistant', 'check build args in fly.toml', '2026-04-11T00:00:00Z');
-- Populate FTS
INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
SQL

echo "  DB seeded with 6 messages across 2 projects"
echo ""

# --- Test 1: query.sh returns id as first column ---
echo "Test 1: query.sh outputs id as first pipe-separated column"
RESULT=$(HOME="$(dirname "$TMPDB")" DB_OVERRIDE="$TMPDB" bash -c "
    DB_PATH='$TMPDB' bash '$SKILL_DIR/query.sh' 'database' 3
" 2>/dev/null || true)

if echo "$RESULT" | head -1 | grep -qE '^[0-9]+\|'; then
    pass "query.sh first column is numeric ID"
else
    # Try overriding DB_PATH directly
    RESULT=$(DB_PATH="$TMPDB" bash "$SKILL_DIR/query.sh" 'database' 3 2>/dev/null || true)
    if echo "$RESULT" | head -1 | grep -qE '^[0-9]+\|'; then
        pass "query.sh first column is numeric ID"
    else
        fail "query.sh first column is not numeric ID. Output: $(echo "$RESULT" | head -2)"
    fi
fi

# --- Test 2: query.sh recency - recent result has better score ---
echo "Test 2: query.sh recency boost - recent 'database' match ranks before old one"
RESULT=$(DB_PATH="$TMPDB" bash "$SKILL_DIR/query.sh" 'database connection' 5 2>/dev/null || true)
# sess2/fireside (2026-04) should rank before sess1/daily-seo (2024-01) for same term
FIRST_PROJECT=$(echo "$RESULT" | head -1 | cut -d'|' -f4)
if [ "$FIRST_PROJECT" = "fireside" ]; then
    pass "Recent match (fireside, 2026) ranked before old match (daily-seo, 2024)"
else
    fail "Expected fireside first, got: $FIRST_PROJECT"
fi

# --- Test 3: query.sh project filter still works ---
echo "Test 3: query.sh project filter restricts results"
RESULT=$(DB_PATH="$TMPDB" bash "$SKILL_DIR/query.sh" 'database' 5 'daily-seo' 2>/dev/null || true)
PROJECTS=$(echo "$RESULT" | cut -d'|' -f4 | sort -u)
if [ "$PROJECTS" = "daily-seo" ]; then
    pass "Project filter returns only daily-seo results"
else
    fail "Project filter leaked other projects: $PROJECTS"
fi

# --- Test 4: lookup.sh returns full content ---
echo "Test 4: lookup.sh returns full content for a message ID"
# Get an ID from query results
MSG_ID=$(DB_PATH="$TMPDB" bash "$SKILL_DIR/query.sh" 'database' 1 2>/dev/null | head -1 | cut -d'|' -f1 || true)
if [ -z "$MSG_ID" ] || ! echo "$MSG_ID" | grep -qE '^[0-9]+$'; then
    fail "Could not get a valid message ID from query.sh (got: $MSG_ID)"
else
    LOOKUP=$(DB_PATH="$TMPDB" bash "$SKILL_DIR/lookup.sh" "$MSG_ID" 1 2>/dev/null || true)
    if [ -n "$LOOKUP" ] && echo "$LOOKUP" | grep -q "id:${MSG_ID}"; then
        pass "lookup.sh returned content for id=$MSG_ID"
    else
        fail "lookup.sh output missing. Got: $(echo "$LOOKUP" | head -2)"
    fi
fi

# --- Test 5: lookup.sh returns surrounding context ---
echo "Test 5: lookup.sh returns adjacent messages (context window)"
# sess1 has uuid-1 (id likely 1) and uuid-2 (id likely 2)
MSG_ID=$(DB_PATH="$TMPDB" bash "$SKILL_DIR/query.sh" 'schema qualification' 1 2>/dev/null | head -1 | cut -d'|' -f1 || true)
if [ -z "$MSG_ID" ] || ! echo "$MSG_ID" | grep -qE '^[0-9]+$'; then
    skip "Could not get message ID for context test"
else
    LOOKUP=$(DB_PATH="$TMPDB" bash "$SKILL_DIR/lookup.sh" "$MSG_ID" 2 2>/dev/null || true)
    LINE_COUNT=$(echo "$LOOKUP" | grep -c '\[' || true)
    if [ "$LINE_COUNT" -ge 2 ]; then
        pass "lookup.sh returned $LINE_COUNT messages with context window=2"
    else
        fail "lookup.sh returned only $LINE_COUNT message(s) with context window=2"
    fi
fi

# --- Test 6: lookup.sh missing ID returns non-zero exit ---
echo "Test 6: lookup.sh exits non-zero for nonexistent ID"
if DB_PATH="$TMPDB" bash "$SKILL_DIR/lookup.sh" 99999 2>/dev/null; then
    fail "lookup.sh should exit non-zero for missing ID"
else
    pass "lookup.sh exits non-zero for missing ID"
fi

# --- Test 7: ingest hook uses symlink path ---
echo "Test 7: ingest hook uses portable symlink path"
INGEST_HOOK="$(cd "$(dirname "$0")/.." && pwd)/.claude/hooks/cfn-decision-log-ingest.sh"
SKILL_LINE=$(grep 'SKILL_DIR=' "$INGEST_HOOK" | head -1)
if echo "$SKILL_LINE" | grep -q '\.claude/skills/decision-log"$'; then
    pass "Ingest hook uses ~/.claude/skills/decision-log path"
else
    fail "Ingest hook still has hardcoded path: $SKILL_LINE"
fi

# --- Test 8: briefing.sh accepts --project flag ---
echo "Test 8: briefing.sh accepts --project flag without error"
OUTPUT=$(DB_PATH="$TMPDB" bash "$SKILL_DIR/briefing.sh" 'database migration' 500 --project 'daily-seo' 2>&1 || true)
if echo "$OUTPUT" | grep -q 'Usage:'; then
    fail "briefing.sh failed with --project flag: $OUTPUT"
else
    pass "briefing.sh accepts --project flag"
fi

# --- Test 9: briefing.sh project affinity boosts same-project results ---
echo "Test 9: briefing.sh project affinity - daily-seo results appear when --project daily-seo"
OUTPUT=$(DB_PATH="$TMPDB" bash "$SKILL_DIR/briefing.sh" 'database' 2000 --project 'daily-seo' 2>/dev/null || true)
if echo "$OUTPUT" | grep -q 'daily-seo'; then
    pass "briefing.sh shows daily-seo results with --project daily-seo"
else
    fail "briefing.sh returned no daily-seo results with --project daily-seo. Output: $(echo "$OUTPUT" | head -3)"
fi

# --- Summary ---
echo ""
echo "=== Results: $PASS passed, $FAIL failed, $SKIP skipped ==="

[ "$FAIL" -eq 0 ]
