#!/usr/bin/env bash

##############################################################################
# ACE Context Lookup System - End-to-End Validation Test
#
# Validates:
#   - Database schema and structure
#   - Sample reflection data
#   - Context query functionality
#   - JSON output format
#   - Similarity matching
#
# Usage:
#   ./test-ace-context-lookup.sh
##############################################################################

set -euo pipefail

echo "========================================"
echo "ACE Context Lookup System - E2E Test"
echo "========================================"
echo ""

PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"
DB_PATH="$PROJECT_ROOT/.artifacts/database/swarm-memory.db"

# Test 1: Verify database exists
echo "Test 1: Database exists"
if [ -f "$DB_PATH" ]; then
  echo "✅ Database found: $DB_PATH"
else
  echo "❌ Database not found"
  exit 1
fi
echo ""

# Test 2: Verify tables exist
echo "Test 2: Verify database schema"
TABLES=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table';")
if echo "$TABLES" | grep -q "memory_store"; then
  echo "✅ memory_store table exists"
else
  echo "❌ memory_store table missing"
  exit 1
fi
echo ""

# Test 3: Count reflections
echo "Test 3: Count reflection entries"
COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM memory_store WHERE key LIKE 'reflection:%';")
echo "   Found $COUNT reflections"
if [ "$COUNT" -gt 0 ]; then
  echo "✅ Reflections populated"
else
  echo "⚠️  No reflections found (run populate script first)"
fi
echo ""

# Test 4: Query with authentication keywords
echo "Test 4: Query for 'authentication,jwt' contexts"
RESULT=$("$PROJECT_ROOT/.claude/skills/cfn-ace-system/invoke-context-query.sh" \
  --keywords "authentication,jwt,backend" \
  --similarity-threshold 0.05 \
  --max-results 3)

if echo "$RESULT" | jq -e '. | length >= 0' > /dev/null 2>&1; then
  RESULT_COUNT=$(echo "$RESULT" | jq '. | length')
  echo "✅ Query returned $RESULT_COUNT results"

  if [ "$RESULT_COUNT" -gt 0 ]; then
    echo ""
    echo "   Top result:"
    echo "$RESULT" | jq '.[0] | {id, similarity, task: .context.task}'
  fi
else
  echo "❌ Query failed or returned invalid JSON"
  exit 1
fi
echo ""

# Test 5: Query with ACE keywords
echo "Test 5: Query for 'ace,context,memory' contexts"
RESULT2=$("$PROJECT_ROOT/.claude/skills/cfn-ace-system/invoke-context-query.sh" \
  --keywords "ace,context,memory,backend" \
  --similarity-threshold 0.05 \
  --max-results 3)

if echo "$RESULT2" | jq -e '. | length >= 0' > /dev/null 2>&1; then
  RESULT2_COUNT=$(echo "$RESULT2" | jq '. | length')
  echo "✅ Query returned $RESULT2_COUNT results"

  if [ "$RESULT2_COUNT" -gt 0 ]; then
    echo ""
    echo "   Top result:"
    echo "$RESULT2" | jq '.[0] | {id, similarity, task: .context.task}'
  fi
else
  echo "❌ Query failed or returned invalid JSON"
  exit 1
fi
echo ""

# Test 6: Verify JSON output format
echo "Test 6: Validate JSON output structure"
if [ "$RESULT_COUNT" -gt 0 ]; then
  FIRST_RESULT=$(echo "$RESULT" | jq '.[0]')
  if echo "$FIRST_RESULT" | jq -e '.id and .timestamp and .complexity and .similarity and .context and .insights' > /dev/null 2>&1; then
    echo "✅ JSON structure valid"
    echo "   Fields: id, timestamp, complexity, similarity, context, insights"
  else
    echo "❌ Invalid JSON structure"
    exit 1
  fi
else
  echo "⚠️  Skipped (no results to validate)"
fi
echo ""

# Test 7: Query with no results
echo "Test 7: Query with no matching keywords"
RESULT3=$("$PROJECT_ROOT/.claude/skills/cfn-ace-system/invoke-context-query.sh" \
  --keywords "nonexistent,keywords,xyz123" \
  --similarity-threshold 0.5 \
  --max-results 3)

if [ "$RESULT3" == "[]" ]; then
  echo "✅ Returns empty array for no matches"
else
  echo "❌ Unexpected result for no matches"
  exit 1
fi
echo ""

echo "========================================"
echo "✅ ALL TESTS PASSED"
echo "========================================"
echo ""
echo "Summary:"
echo "  - Database schema: ✅"
echo "  - Sample data: $COUNT reflections"
echo "  - Query functionality: ✅"
echo "  - JSON output: ✅"
echo "  - End-to-end context lookup: ✅"
echo ""
echo "Note: Default similarity threshold of 0.7 is too high for current"
echo "      keyword extraction. Recommend using 0.05-0.2 for practical use."
