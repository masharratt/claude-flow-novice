#!/usr/bin/env bash

##############################################################################
# ACE Context Reflection Wrapper
# Generates cognitive reflections on context data
#
# Usage:
#   ./invoke-context-reflect.sh --context '{"task": "..."}' [OPTIONS]
#
# Arguments:
#   --context          JSON context object (required)
#   --complexity       Override complexity calculation (optional)
#   --output           Output file path (optional, default: stdout)
#   --memory-path      SQLite memory path (optional)
##############################################################################

set -euo pipefail

# Default values
CONTEXT=""
COMPLEXITY=""
OUTPUT=""
MEMORY_PATH="${ACE_MEMORY_PATH:-./.artifacts/database/swarm-memory.db}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --context)
      CONTEXT="$2"
      shift 2
      ;;
    --complexity)
      COMPLEXITY="$2"
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
if [ -z "$CONTEXT" ]; then
  echo "Error: --context is required"
  echo "Usage: $0 --context '{\"task\": \"...\"}' [OPTIONS]"
  exit 1
fi

# Validate JSON
if ! echo "$CONTEXT" | jq . > /dev/null 2>&1; then
  echo "Error: Invalid JSON context"
  exit 1
fi

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"

# Execute reflection using Node.js with inline code
if [ -n "$OUTPUT" ]; then
  node --input-type=module --eval "
import ACEReflector from '${PROJECT_ROOT}/dist/ace/ace-reflector.js';

const context = JSON.parse(process.argv[1]);
const complexity = process.argv[2] ? parseFloat(process.argv[2]) : undefined;
const memoryPath = process.argv[3];

const reflector = new ACEReflector(memoryPath);
await reflector.initialize();

const reflection = await reflector.reflect(context, { complexity });
console.log(JSON.stringify(reflection, null, 2));
" "$CONTEXT" "$COMPLEXITY" "$MEMORY_PATH" > "$OUTPUT"
  echo "Reflection saved to: $OUTPUT" >&2
else
  node --input-type=module --eval "
import ACEReflector from '${PROJECT_ROOT}/dist/ace/ace-reflector.js';

const context = JSON.parse(process.argv[1]);
const complexity = process.argv[2] ? parseFloat(process.argv[2]) : undefined;
const memoryPath = process.argv[3];

const reflector = new ACEReflector(memoryPath);
await reflector.initialize();

const reflection = await reflector.reflect(context, { complexity });
console.log(JSON.stringify(reflection, null, 2));
" "$CONTEXT" "$COMPLEXITY" "$MEMORY_PATH"
fi
