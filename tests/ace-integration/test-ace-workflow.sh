#!/bin/bash
# Test ACE workflow: reflection → curation → database persistence
# Usage: ./test-ace-workflow.sh

set -e

DB_PATH="./.artifacts/database/swarm-memory.db"
SCRIPT_DIR="./.claude/skills/ace-system"

echo "=========================================="
echo "ACE Workflow Test Suite"
echo "=========================================="
echo ""

# Test 1: Store reflection
echo "[TEST 1] Store reflection..."

cat > /tmp/test-lessons.json <<'EOF'
[
  {
    "bullet_id": "TEST-001",
    "category": "pattern",
    "content": "Test pattern for ACE workflow validation",
    "confidence": 0.85,
    "tags": ["test", "validation", "ace"]
  }
]
EOF

RESULT=$("$SCRIPT_DIR/store-reflection.sh" \
  --reflection-type "success" \
  --task-id "test-ace-$(date +%s)" \
  --lessons-file "/tmp/test-lessons.json")

REFLECTION_ID=$(echo "$RESULT" | jq -r '.reflection_id')

if [ -n "$REFLECTION_ID" ]; then
  echo "✅ Reflection stored: $REFLECTION_ID"
else
  echo "❌ Failed to store reflection"
  exit 1
fi

# Test 2: Query pending reflections
echo "[TEST 2] Query pending reflections..."

REFLECTIONS=$("$SCRIPT_DIR/query-reflections.sh" --status pending --limit 5)
COUNT=$(echo "$REFLECTIONS" | jq 'length')

if [ "$COUNT" -gt 0 ]; then
  echo "✅ Found $COUNT pending reflections"
else
  echo "❌ No pending reflections found"
  exit 1
fi

# Test 3: Add bullet to adaptive_context
echo "[TEST 3] Add bullet to adaptive_context..."

BULLET_RESULT=$("$SCRIPT_DIR/add-bullet.sh" \
  --bullet-id "TEST-001" \
  --category "pattern" \
  --content "Test pattern for ACE workflow validation" \
  --confidence 0.85 \
  --priority 5 \
  --tags '["test","validation","ace"]' \
  --source-context "ACE workflow test" \
  --source-task-id "test-ace")

BULLET_ID=$(echo "$BULLET_RESULT" | jq -r '.bullet_id')

if [ "$BULLET_ID" = "TEST-001" ]; then
  echo "✅ Bullet added: $BULLET_ID"
else
  echo "❌ Failed to add bullet"
  exit 1
fi

# Test 4: Log merge action
echo "[TEST 4] Log merge action..."

LOG_RESULT=$("$SCRIPT_DIR/log-merge.sh" \
  --merge-type "new_bullet" \
  --bullet-id "TEST-001" \
  --reflection-id "$REFLECTION_ID" \
  --curator-reasoning "Test curation workflow")

LOG_ID=$(echo "$LOG_RESULT" | jq -r '.log_id')

if [ -n "$LOG_ID" ]; then
  echo "✅ Merge logged: $LOG_ID"
else
  echo "❌ Failed to log merge"
  exit 1
fi

# Test 5: Update reflection status
echo "[TEST 5] Update reflection status..."

UPDATE_RESULT=$("$SCRIPT_DIR/update-reflection.sh" \
  --reflection-id "$REFLECTION_ID" \
  --status "merged" \
  --merged-bullet-ids '["TEST-001"]')

STATUS=$(echo "$UPDATE_RESULT" | jq -r '.new_status')

if [ "$STATUS" = "merged" ]; then
  echo "✅ Reflection marked as merged"
else
  echo "❌ Failed to update reflection"
  exit 1
fi

# Verify database state
echo ""
echo "[VERIFICATION] Checking database state..."

REFL_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM context_reflections WHERE curator_status = 'merged';")
BULLET_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM adaptive_context WHERE is_active = 1;")
LOG_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM context_merge_log;")

echo "  Reflections (merged): $REFL_COUNT"
echo "  Active bullets: $BULLET_COUNT"
echo "  Merge log entries: $LOG_COUNT"

if [ "$REFL_COUNT" -gt 0 ] && [ "$BULLET_COUNT" -gt 0 ] && [ "$LOG_COUNT" -gt 0 ]; then
  echo ""
  echo "=========================================="
  echo "✅ ALL TESTS PASSED"
  echo "=========================================="
  echo ""
  echo "ACE workflow is operational:"
  echo "  - Reflections can be stored"
  echo "  - Bullets can be added"
  echo "  - Merge actions are logged"
  echo "  - Database persistence works"
  exit 0
else
  echo ""
  echo "=========================================="
  echo "❌ VERIFICATION FAILED"
  echo "=========================================="
  exit 1
fi
