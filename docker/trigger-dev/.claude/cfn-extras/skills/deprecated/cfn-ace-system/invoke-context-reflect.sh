#!/usr/bin/env bash

##############################################################################
# ACE Context Reflection Wrapper (Phase 3.1 - Anti-Pattern Detection)
# Generates cognitive reflections on context data with failure analysis
#
# Usage:
#   ./invoke-context-reflect.sh --context '{"task": "..."}' [OPTIONS]
#
# Arguments:
#   --context          JSON context object (required for legacy mode)
#   --confidence       Sprint confidence score 0.0-1.0 (for anti-pattern mode)
#   --iterations       Number of iterations required (for anti-pattern mode)
#   --feedback         ITERATE feedback from Product Owner (for anti-pattern mode)
#   --task-id          Task/sprint identifier (required for anti-pattern mode)
#   --swarm-id         Swarm identifier (optional)
#   --sprint-ref       Sprint reference for tracking (optional)
#   --domain           Domain classification (optional)
#   --final-decision   Final Product Owner decision (PROCEED/ITERATE/ABORT)
#   --final-feedback   Final iteration feedback (solution extraction)
#   --complexity       Override complexity calculation (optional)
#   --output           Output file path (optional, default: stdout)
#   --memory-path      SQLite memory path (optional)
##############################################################################

set -euo pipefail

# Default values
CONTEXT=""
CONFIDENCE=""
ITERATIONS=""
FEEDBACK=""
TASK_ID=""
SWARM_ID="default"
SPRINT_REF=""
DOMAIN=""
FINAL_DECISION=""
FINAL_FEEDBACK=""
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
    --confidence)
      CONFIDENCE="$2"
      shift 2
      ;;
    --iterations)
      ITERATIONS="$2"
      shift 2
      ;;
    --feedback)
      FEEDBACK="$2"
      shift 2
      ;;
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --swarm-id)
      SWARM_ID="$2"
      shift 2
      ;;
    --sprint-ref)
      SPRINT_REF="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --final-decision)
      FINAL_DECISION="$2"
      shift 2
      ;;
    --final-feedback)
      FINAL_FEEDBACK="$2"
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

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Extract failure reason from feedback
extract_failure_reason() {
  local feedback="$1"

  # Parse common failure patterns
  if echo "$feedback" | grep -qi "missing error"; then
    echo "Missing error handling"
  elif echo "$feedback" | grep -qi "security"; then
    echo "Security vulnerability detected"
  elif echo "$feedback" | grep -qi "test.*fail"; then
    echo "Test failures"
  elif echo "$feedback" | grep -qi "performance"; then
    echo "Performance issues"
  elif echo "$feedback" | grep -qi "missing.*validation"; then
    echo "Input validation missing"
  elif echo "$feedback" | grep -qi "no.*deliverable"; then
    echo "No deliverables created"
  elif echo "$feedback" | grep -qi "coverage"; then
    echo "Insufficient test coverage"
  elif echo "$feedback" | grep -qi "documentation"; then
    echo "Missing documentation"
  else
    # Extract first sentence or first 100 chars
    echo "$feedback" | head -n 1 | cut -c 1-100
  fi
}

# Extract solution from final feedback
extract_solution() {
  local feedback="$1"

  if echo "$feedback" | grep -qi "added.*error"; then
    echo "Added comprehensive error handling"
  elif echo "$feedback" | grep -qi "implemented.*security"; then
    echo "Implemented security best practices"
  elif echo "$feedback" | grep -qi "fixed.*test"; then
    echo "Fixed test suite and increased coverage"
  elif echo "$feedback" | grep -qi "optimized.*performance"; then
    echo "Optimized performance bottlenecks"
  else
    # Return generic solution message
    echo "Iterative improvements applied"
  fi
}

# Generate tags from feedback
generate_tags() {
  local feedback="$1"
  local tags="[]"

  # Build tags array
  if echo "$feedback" | grep -qi "error"; then
    tags=$(echo "$tags" | jq '. + ["error-handling"]')
  fi
  if echo "$feedback" | grep -qi "security"; then
    tags=$(echo "$tags" | jq '. + ["security"]')
  fi
  if echo "$feedback" | grep -qi "test"; then
    tags=$(echo "$tags" | jq '. + ["testing"]')
  fi
  if echo "$feedback" | grep -qi "performance"; then
    tags=$(echo "$tags" | jq '. + ["performance"]')
  fi
  if echo "$feedback" | grep -qi "validation"; then
    tags=$(echo "$tags" | jq '. + ["validation"]')
  fi
  if echo "$feedback" | grep -qi "coverage"; then
    tags=$(echo "$tags" | jq '. + ["coverage"]')
  fi
  if echo "$feedback" | grep -qi "documentation"; then
    tags=$(echo "$tags" | jq '. + ["documentation"]')
  fi
  if echo "$feedback" | grep -qi "deliverable"; then
    tags=$(echo "$tags" | jq '. + ["deliverable-tracking"]')
  fi

  echo "$tags"
}

# Anti-Pattern Detection Mode
if [ -n "$CONFIDENCE" ] && [ -n "$ITERATIONS" ] && [ -n "$FEEDBACK" ] && [ -n "$TASK_ID" ]; then

  # Determine lesson type and severity
  LESSON_TYPE="strategy"
  SEVERITY="info"

  # Critical anti-pattern (confidence < 0.50)
  if (( $(echo "$CONFIDENCE < 0.50" | bc -l) )); then
    LESSON_TYPE="anti-pattern"
    SEVERITY="critical"
  # Warning (confidence < 0.70)
  elif (( $(echo "$CONFIDENCE < 0.70" | bc -l) )); then
    LESSON_TYPE="warning"
    SEVERITY="warning"
  # Low confidence success (0.70-0.75)
  elif (( $(echo "$CONFIDENCE < 0.75" | bc -l) )); then
    LESSON_TYPE="pattern"
    SEVERITY="info"
  fi

  # Extract failure reason and solution
  FAILURE_REASON=$(extract_failure_reason "$FEEDBACK")
  SOLUTION=""
  if [ -n "$FINAL_DECISION" ] && [ "$FINAL_DECISION" == "PROCEED" ] && [ -n "$FINAL_FEEDBACK" ]; then
    SOLUTION=$(extract_solution "$FINAL_FEEDBACK")
  fi

  # Generate tags
  TAGS=$(generate_tags "$FEEDBACK")
  if [ -n "$DOMAIN" ]; then
    TAGS=$(echo "$TAGS" | jq ". + [\"$DOMAIN\"]")
  fi

  # Build extracted lessons
  LESSON_CONTENT=""
  if [ "$LESSON_TYPE" == "anti-pattern" ]; then
    LESSON_CONTENT="Avoid: $FAILURE_REASON (caused $ITERATIONS iterations, confidence $CONFIDENCE)"
  elif [ "$LESSON_TYPE" == "warning" ]; then
    LESSON_CONTENT="Caution: $FAILURE_REASON (required $ITERATIONS iterations)"
  else
    LESSON_CONTENT="Pattern observed: $FAILURE_REASON (confidence $CONFIDENCE after $ITERATIONS iterations)"
  fi

  # Add solution if available
  EXTRACTED_LESSONS="{\"anti_pattern\": \"$LESSON_CONTENT\""
  if [ -n "$SOLUTION" ]; then
    EXTRACTED_LESSONS="$EXTRACTED_LESSONS, \"solution\": \"$SOLUTION\""
  fi
  EXTRACTED_LESSONS="$EXTRACTED_LESSONS}"

  # Build metadata
  METADATA="{\"tags\": $TAGS, \"severity\": \"$SEVERITY\""
  if [ -n "$DOMAIN" ]; then
    METADATA="$METADATA, \"domain\": \"$DOMAIN\""
  fi
  if [ -n "$SPRINT_REF" ]; then
    METADATA="$METADATA, \"sprint_ref\": \"$SPRINT_REF\""
  fi
  METADATA="$METADATA, \"failure_reason\": \"$FAILURE_REASON\"}"

  # Generate unique ID
  REFLECTION_ID="ref-$(date +%s)-$(echo $RANDOM | md5sum | head -c 8)"

  # Store in SQLite
  sqlite3 "$MEMORY_PATH" <<EOF
INSERT INTO context_reflections (
  id, reflection_type, task_id, swarm_id,
  execution_trace, feedback_signals, extracted_lessons,
  metadata, confidence, created_at
) VALUES (
  '$REFLECTION_ID',
  '$LESSON_TYPE',
  '$TASK_ID',
  '$SWARM_ID',
  json('{"iterations": $ITERATIONS, "final_confidence": $CONFIDENCE}'),
  json('{"iterate_feedback": $(echo "$FEEDBACK" | jq -Rs .)}'),
  json('$EXTRACTED_LESSONS'),
  json('$METADATA'),
  $CONFIDENCE,
  datetime('now')
);
EOF

  # Output result
  RESULT="{
  \"id\": \"$REFLECTION_ID\",
  \"reflection_type\": \"$LESSON_TYPE\",
  \"task_id\": \"$TASK_ID\",
  \"severity\": \"$SEVERITY\",
  \"confidence\": $CONFIDENCE,
  \"iterations\": $ITERATIONS,
  \"failure_reason\": \"$FAILURE_REASON\",
  \"solution\": \"$SOLUTION\",
  \"stored\": true
}"

  if [ -n "$OUTPUT" ]; then
    echo "$RESULT" > "$OUTPUT"
    echo "Anti-pattern reflection saved to: $OUTPUT" >&2
  else
    echo "$RESULT"
  fi

  exit 0
fi

# Legacy Mode - Original ACE reflector
if [ -z "$CONTEXT" ]; then
  echo "Error: Either --context (legacy mode) or --confidence + --iterations + --feedback + --task-id (anti-pattern mode) required"
  echo ""
  echo "Legacy Mode Usage:"
  echo "  $0 --context '{\"task\": \"...\"}' [OPTIONS]"
  echo ""
  echo "Anti-Pattern Mode Usage:"
  echo "  $0 --confidence 0.45 --iterations 3 --feedback \"Missing error handling\" --task-id \"sprint-001\" [OPTIONS]"
  exit 1
fi

# Validate JSON
if ! echo "$CONTEXT" | jq . > /dev/null 2>&1; then
  echo "Error: Invalid JSON context"
  exit 1
fi

# Execute reflection using Node.js with inline code (original implementation)
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
