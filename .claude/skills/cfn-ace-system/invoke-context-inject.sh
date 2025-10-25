#!/usr/bin/env bash

##############################################################################
# ACE Context Injection Wrapper
# Dynamically injects context into execution environments
#
# Usage:
#   ./invoke-context-inject.sh --context-file <file> --target-task <id> [OPTIONS]
#
# Arguments:
#   --context-file     Source context JSON file (required)
#   --target-task      Task ID to inject into (required)
#   --merge-strategy   Merge strategy: simple, deep, priority-weighted, consensus-weighted
#   --output           Output file path (optional, default: stdout)
#   --memory-path      SQLite memory path (optional)
##############################################################################

set -euo pipefail

# Default values
CONTEXT_FILE=""
TARGET_TASK=""
MERGE_STRATEGY="deep"
OUTPUT=""
MEMORY_PATH="${ACE_MEMORY_PATH:-./.artifacts/database/swarm-memory.db}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --context-file)
      CONTEXT_FILE="$2"
      shift 2
      ;;
    --target-task)
      TARGET_TASK="$2"
      shift 2
      ;;
    --merge-strategy)
      MERGE_STRATEGY="$2"
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
if [ -z "$CONTEXT_FILE" ] || [ -z "$TARGET_TASK" ]; then
  echo "Error: --context-file and --target-task are required"
  echo "Usage: $0 --context-file <file> --target-task <id> [OPTIONS]"
  exit 1
fi

if [ ! -f "$CONTEXT_FILE" ]; then
  echo "Error: Context file not found: $CONTEXT_FILE"
  exit 1
fi

# Validate context file JSON
if ! jq . "$CONTEXT_FILE" > /dev/null 2>&1; then
  echo "Error: Invalid JSON in context file"
  exit 1
fi

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"

# Create Node.js runner script
RUNNER_SCRIPT=$(mktemp --suffix=.mjs)
trap "rm -f $RUNNER_SCRIPT" EXIT

cat > "$RUNNER_SCRIPT" << EOF
import ContextInjector from '${PROJECT_ROOT}/dist/ace/context-injection.js';
import { readFileSync } from 'fs';

const contextFile = process.argv[2];
const targetTask = process.argv[3];
const mergeStrategy = process.argv[4];

const contextInjector = new ContextInjector();

// Load source context
const sourceContext = JSON.parse(readFileSync(contextFile, 'utf-8'));

// Prepare target object for injection
const target = {
  taskId: targetTask,
  timestamp: Date.now(),
  status: 'pending'
};

// Strategy-specific injection
async function injectByStrategy() {
  switch (mergeStrategy) {
    case 'simple':
      // Simple override
      return { ...target, ...sourceContext };

    case 'deep':
      // Deep merge using context injector
      return await contextInjector.injectContext(target, sourceContext);

    case 'priority-weighted':
      // Weighted merge based on priority field
      const prioritized = Object.entries(sourceContext)
        .sort(([, a], [, b]) => {
          const priorityA = typeof a === 'object' && a.priority ? a.priority : 0;
          const priorityB = typeof b === 'object' && b.priority ? b.priority : 0;
          return priorityB - priorityA;
        })
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
      return await contextInjector.injectContext(target, prioritized);

    case 'consensus-weighted':
      // Weight by consensus confidence if available
      const weighted = Object.entries(sourceContext)
        .filter(([, value]) => {
          if (typeof value === 'object' && value.confidence !== undefined) {
            return value.confidence >= 0.5; // Filter low confidence
          }
          return true;
        })
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
      return await contextInjector.injectContext(target, weighted);

    default:
      throw new Error(`Unknown merge strategy: ${mergeStrategy}`);
  }
}

const injectedContext = await injectByStrategy();

console.log(JSON.stringify({
  taskId: targetTask,
  mergeStrategy,
  injectedAt: Date.now(),
  context: injectedContext
}, null, 2));
EOF

# Execute injection
cd "$PROJECT_ROOT"

if [ -n "$OUTPUT" ]; then
  node "$RUNNER_SCRIPT" "$CONTEXT_FILE" "$TARGET_TASK" "$MERGE_STRATEGY" > "$OUTPUT"
  echo "Injected context saved to: $OUTPUT" >&2
else
  node "$RUNNER_SCRIPT" "$CONTEXT_FILE" "$TARGET_TASK" "$MERGE_STRATEGY"
fi
