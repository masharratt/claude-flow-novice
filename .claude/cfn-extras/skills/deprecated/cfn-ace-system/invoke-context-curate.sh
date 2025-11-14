#!/usr/bin/env bash

##############################################################################
# ACE Context Curation Wrapper
# Merges and curates multiple contexts from different sources
#
# Usage:
#   ./invoke-context-curate.sh --contexts <file1,file2,...> [OPTIONS]
#
# Arguments:
#   --contexts         Comma-separated list of context files (required)
#   --strategy         Curation strategy: simple, priority-weighted, consensus-weighted
#   --output           Output file path (optional, default: stdout)
#   --memory-path      SQLite memory path (optional)
##############################################################################

set -euo pipefail

# Default values
CONTEXTS=""
STRATEGY="simple"
OUTPUT=""
MEMORY_PATH="${ACE_MEMORY_PATH:-./.artifacts/database/swarm-memory.db}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --contexts)
      CONTEXTS="$2"
      shift 2
      ;;
    --strategy)
      STRATEGY="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
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
if [ -z "$CONTEXTS" ]; then
  echo "Error: --contexts is required"
  echo "Usage: $0 --contexts 'file1.json,file2.json' [OPTIONS]"
  exit 1
fi

# Validate all context files exist
IFS=',' read -ra CONTEXT_FILES <<< "$CONTEXTS"
for file in "${CONTEXT_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "Error: Context file not found: $file"
    exit 1
  fi

  # Validate JSON
  if ! jq . "$file" > /dev/null 2>&1; then
    echo "Error: Invalid JSON in file: $file"
    exit 1
  fi
done

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"

# Create Node.js runner script
RUNNER_SCRIPT=$(mktemp --suffix=.mjs)
trap "rm -f $RUNNER_SCRIPT" EXIT

cat > "$RUNNER_SCRIPT" << EOF
import ACECurator from '${PROJECT_ROOT}/dist/ace/ace-curator.js';
import { readFileSync } from 'fs';

const contextFiles = process.argv[2].split(',');
const strategy = process.argv[3];
const memoryPath = process.argv[4];

const curator = new ACECurator({}, memoryPath);

// Load all contexts
const contexts = contextFiles.map(file => JSON.parse(readFileSync(file.trim(), 'utf-8')));

// Strategy implementations
function simpleMerge(contexts) {
  return contexts.reduce((merged, ctx) => ({ ...merged, ...ctx }), {});
}

function priorityWeightedMerge(contexts) {
  // Sort by priority (if available) and merge
  const sorted = contexts.sort((a, b) => {
    const priorityA = a.priority ?? 0;
    const priorityB = b.priority ?? 0;
    return priorityB - priorityA;
  });

  return sorted.reduce((merged, ctx) => {
    return deepMerge(merged, ctx);
  }, {});
}

function consensusWeightedMerge(contexts) {
  // Weight contexts by confidence scores
  const weighted = contexts.map(ctx => {
    const confidence = ctx.confidence ?? 1.0;

    // Apply confidence weighting to all numeric values
    return Object.entries(ctx).reduce((acc, [key, value]) => {
      if (typeof value === 'number') {
        acc[key] = value * confidence;
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
  });

  // Merge weighted contexts
  return weighted.reduce((merged, ctx) => deepMerge(merged, ctx), {});
}

function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key])
      ) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else if (Array.isArray(source[key])) {
        // Merge arrays by concatenating and deduplicating
        result[key] = [...new Set([...(result[key] || []), ...source[key]])];
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

// Execute curation strategy
let curatedContext;

switch (strategy) {
  case 'simple':
    curatedContext = simpleMerge(contexts);
    break;
  case 'priority-weighted':
    curatedContext = priorityWeightedMerge(contexts);
    break;
  case 'consensus-weighted':
    curatedContext = consensusWeightedMerge(contexts);
    break;
  default:
    throw new Error(`Unknown curation strategy: ${strategy}`);
}

// Add curation metadata
const result = {
  curated: true,
  strategy,
  sourceCount: contexts.length,
  curatedAt: Date.now(),
  context: curatedContext
};

console.log(JSON.stringify(result, null, 2));
EOF

# Execute curation
cd "$PROJECT_ROOT"

if [ -n "$OUTPUT" ]; then
  node "$RUNNER_SCRIPT" "$CONTEXTS" "$STRATEGY" "$MEMORY_PATH" > "$OUTPUT"
  echo "Curated context saved to: $OUTPUT" >&2
else
  node "$RUNNER_SCRIPT" "$CONTEXTS" "$STRATEGY" "$MEMORY_PATH"
fi
