#!/usr/bin/env bash

##############################################################################
# ACE System: Simplified Test Data Population
# Generates basic sample reflections for testing context queries
##############################################################################

set -euo pipefail

DB_PATH="${ACE_DB_PATH:-./.artifacts/database/swarm-memory.db}"
COUNT="${1:-10}"

echo "=== ACE System: Populating Test Data ==="
echo "Database: $DB_PATH"
echo "Reflections to generate: $COUNT"

# Simple insert function with pre-escaped JSON
insert_reflection() {
  local id="refl-$(date +%s)-$RANDOM"
  local type="$1"
  local domain="$2"
  local conf="$3"

  sqlite3 "$DB_PATH" <<EOF
INSERT INTO context_reflections (
  id, reflection_type, task_id, agent_id, swarm_id,
  execution_trace, feedback_signals, extracted_lessons, metadata,
  curator_status, confidence, success_count, total_count, acl_level
) VALUES (
  '$id',
  '$type',
  'task-$domain-$RANDOM',
  'agent-$domain-dev',
  'swarm-test-001',
  '{"iterations":2,"loops":["loop3","loop2"]}',
  '{"loop2_feedback":["Good work"],"product_owner_decision":"PROCEED"}',
  '{"strategies":[{"title":"Test Strategy","confidence":0.9}],"antiPatterns":[],"edgeCases":[]}',
  '{"domain":["$domain"],"keywords":["test","$domain"],"tags":["test"]}',
  'curated',
  $conf,
  5,
  10,
  3
);
EOF
}

# Generate mix of reflections
for i in $(seq 1 "$COUNT"); do
  case $((i % 3)) in
    0) insert_reflection "strategy" "backend" "0.92" ;;
    1) insert_reflection "anti-pattern" "frontend" "0.58" ;;
    2) insert_reflection "strategy" "security" "0.87" ;;
  esac
  echo "✓ Generated reflection $i"
done

echo ""
echo "=== Summary ==="
sqlite3 "$DB_PATH" "SELECT reflection_type, COUNT(*) as count FROM context_reflections GROUP BY reflection_type;"
echo ""
echo "Total: $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM context_reflections;') reflections"
