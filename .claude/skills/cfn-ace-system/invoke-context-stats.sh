#!/usr/bin/env bash

##############################################################################
# ACE Context Statistics Wrapper
# Queries reflection database for statistics and analysis
#
# Usage:
#   ./invoke-context-stats.sh --query <type> [OPTIONS]
#
# Arguments:
#   --query            Query type: reflections, insights, summary (required)
#   --filter           MongoDB-style filter JSON (optional)
#   --limit            Maximum results (default: 100)
#   --memory-path      SQLite memory path (optional)
##############################################################################

set -euo pipefail

# Default values
QUERY=""
FILTER="{}"
LIMIT=100
MEMORY_PATH="${ACE_MEMORY_PATH:-./.artifacts/database/swarm-memory.db}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --query)
      QUERY="$2"
      shift 2
      ;;
    --filter)
      FILTER="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --memory-path)
      MEMORY_PATH="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$QUERY" ]; then
  echo "Error: --query is required"
  echo "Usage: $0 --query <reflections|insights|summary> [OPTIONS]"
  exit 1
fi

# Validate filter JSON
if ! echo "$FILTER" | jq . > /dev/null 2>&1; then
  echo "Error: Invalid JSON filter"
  exit 1
fi

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"

# Create Node.js runner script
RUNNER_SCRIPT=$(mktemp --suffix=.mjs)
trap "rm -f $RUNNER_SCRIPT" EXIT

cat > "$RUNNER_SCRIPT" << EOF
import { SQLiteMemorySystem } from '${PROJECT_ROOT}/dist/memory/sqlite-memory-system.js';
import { AccessLevel } from '${PROJECT_ROOT}/dist/memory/memory-adapter.js';

const queryType = process.argv[2];
const filter = JSON.parse(process.argv[3]);
const limit = parseInt(process.argv[4]);
const memoryPath = process.argv[5];

const memorySystem = new SQLiteMemorySystem(memoryPath);
await memorySystem.initialize();

async function queryReflections() {
  // Query all reflections matching filter
  const db = memorySystem['db'];
  if (!db) {
    throw new Error('Database not initialized');
  }

  let sql = 'SELECT * FROM cognitive_reflections';
  const whereClauses = [];
  const params = [];

  // Apply filters
  if (filter.complexity) {
    if (filter.complexity.$gt !== undefined) {
      whereClauses.push('complexity > ?');
      params.push(filter.complexity.$gt);
    }
    if (filter.complexity.$lt !== undefined) {
      whereClauses.push('complexity < ?');
      params.push(filter.complexity.$lt);
    }
  }

  if (filter.timestamp) {
    if (filter.timestamp.$gt !== undefined) {
      whereClauses.push('timestamp > ?');
      params.push(filter.timestamp.$gt);
    }
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);

  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    complexity: row.complexity,
    context: JSON.parse(row.context),
    insights: JSON.parse(row.insights)
  }));
}

async function queryInsights() {
  const reflections = await queryReflections();
  const allInsights = reflections.flatMap(r => r.insights);

  // Count insight frequency
  const insightCounts = {};
  allInsights.forEach(insight => {
    insightCounts[insight] = (insightCounts[insight] || 0) + 1;
  });

  return Object.entries(insightCounts)
    .map(([insight, count]) => ({ insight, count }))
    .sort((a, b) => b.count - a.count);
}

async function querySummary() {
  const reflections = await queryReflections();

  const complexities = reflections.map(r => r.complexity);
  const avgComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
  const maxComplexity = Math.max(...complexities);
  const minComplexity = Math.min(...complexities);

  return {
    totalReflections: reflections.length,
    avgComplexity: avgComplexity || 0,
    maxComplexity: maxComplexity || 0,
    minComplexity: minComplexity || 0,
    timeRange: {
      earliest: Math.min(...reflections.map(r => r.timestamp)),
      latest: Math.max(...reflections.map(r => r.timestamp))
    }
  };
}

let result;

switch (queryType) {
  case 'reflections':
    result = await queryReflections();
    break;
  case 'insights':
    result = await queryInsights();
    break;
  case 'summary':
    result = await querySummary();
    break;
  default:
    throw new Error(`Unknown query type: ${queryType}`);
}

console.log(JSON.stringify(result, null, 2));
EOF

# Execute query
cd "$PROJECT_ROOT"
node "$RUNNER_SCRIPT" "$QUERY" "$FILTER" "$LIMIT" "$MEMORY_PATH"
