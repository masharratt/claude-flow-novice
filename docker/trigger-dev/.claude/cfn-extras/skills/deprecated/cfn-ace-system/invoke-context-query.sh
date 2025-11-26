#!/usr/bin/env bash

##############################################################################
# ACE Context Query Wrapper
# Searches for similar contexts using keyword matching
#
# Usage:
#   ./invoke-context-query.sh --keywords "keyword1,keyword2" [OPTIONS]
#
# Arguments:
#   --keywords              Comma-separated keywords (required)
#   --similarity-threshold  Minimum similarity (0.0-1.0, default: 0.7)
#   --max-results          Maximum results (default: 10)
#   --memory-path          SQLite memory path (optional)
##############################################################################

set -euo pipefail

# Default values
KEYWORDS=""
SIMILARITY_THRESHOLD=0.7
MAX_RESULTS=10
MEMORY_PATH="${ACE_MEMORY_PATH:-./.artifacts/database/swarm-memory.db}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --keywords)
      KEYWORDS="$2"
      shift 2
      ;;
    --similarity-threshold)
      SIMILARITY_THRESHOLD="$2"
      shift 2
      ;;
    --max-results)
      MAX_RESULTS="$2"
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
if [ -z "$KEYWORDS" ]; then
  echo "Error: --keywords is required"
  echo "Usage: $0 --keywords 'keyword1,keyword2' [OPTIONS]"
  exit 1
fi

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Create Node.js runner script
RUNNER_SCRIPT=$(mktemp --suffix=.mjs)
trap "rm -f $RUNNER_SCRIPT" EXIT

cat > "$RUNNER_SCRIPT" << EOF
import { SQLiteMemorySystem } from '${PROJECT_ROOT}/dist/memory/sqlite-memory-system.js';

const keywords = process.argv[2].split(',').map(k => k.trim().toLowerCase());
const similarityThreshold = parseFloat(process.argv[3]);
const maxResults = parseInt(process.argv[4]);
const memoryPath = process.argv[5];

const memorySystem = new SQLiteMemorySystem(memoryPath);
await memorySystem.initialize();

// Calculate Jaccard similarity
function jaccardSimilarity(set1, set2) {
  const intersection = set1.filter(x => set2.includes(x));
  const union = [...new Set([...set1, ...set2])];
  return intersection.length / union.length;
}

// Extract keywords from context
function extractKeywords(context) {
  const text = JSON.stringify(context).toLowerCase();
  const words = text.match(/\b\w+\b/g) || [];
  return [...new Set(words)];
}

async function queryContexts() {
  const db = memorySystem['db'];
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Query memory_store for reflection entries
  // Reflections are stored as: reflection:ref-{timestamp} -> JSON
  const rows = await db.all(
    "SELECT key, value FROM memory_store WHERE key LIKE 'reflection:%' ORDER BY created_at DESC"
  );

  if (rows.length === 0) {
    return [];
  }

  const results = rows.map(row => {
    // Parse the reflection JSON from BLOB/TEXT value
    const reflection = JSON.parse(row.value);

    // Extract context and keywords
    const context = reflection.context || {};
    const contextKeywords = extractKeywords(context);
    const similarity = jaccardSimilarity(keywords, contextKeywords);

    return {
      id: reflection.id,
      timestamp: reflection.timestamp,
      complexity: reflection.complexity || 0,
      similarity,
      context: reflection.context,
      insights: reflection.insights || []
    };
  });

  // Filter by similarity threshold and sort
  return results
    .filter(r => r.similarity >= similarityThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
}

const results = await queryContexts();
console.log(JSON.stringify(results, null, 2));
EOF

# Execute query
cd "$PROJECT_ROOT"
node "$RUNNER_SCRIPT" "$KEYWORDS" "$SIMILARITY_THRESHOLD" "$MAX_RESULTS" "$MEMORY_PATH"