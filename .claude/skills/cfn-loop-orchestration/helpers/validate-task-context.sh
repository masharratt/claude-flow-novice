#!/bin/bash
# Task Context Validation Helper
# Validates that CLI mode has complete task context (prevents "consensus on vapor")
#
# Usage: validate-task-context.sh --task-id <id> [--task-description <desc>] [--expected-files <files>] [--success-criteria <criteria>]

set -euo pipefail

# Initialize variables
TASK_ID=""
TASK_DESCRIPTION=""
EXPECTED_FILES=""
SUCCESS_CRITERIA=""
NAMESPACE="swarm"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --task-description)
      TASK_DESCRIPTION="$2"
      shift 2
      ;;
    --expected-files)
      EXPECTED_FILES="$2"
      shift 2
      ;;
    --success-criteria)
      SUCCESS_CRITERIA="$2"
      shift 2
      ;;
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$TASK_ID" ]]; then
  echo "Error: --task-id is required" >&2
  echo "Usage: $0 --task-id <id> [--task-description <desc>] [--expected-files <files>] [--success-criteria <criteria>]" >&2
  exit 1
fi

# Validation functions
validate_task_description() {
  local task_desc="$1"

  if [[ -z "$task_desc" ]]; then
    echo "❌ Task description is empty or missing"
    return 1
  fi

  # Check minimum length (should be meaningful)
  if [[ ${#task_desc} -lt 10 ]]; then
    echo "❌ Task description too short (${#task_desc} chars, minimum 10)"
    return 1
  fi

  # Check for actionable verbs
  if [[ ! "$task_desc" =~ (create|build|implement|fix|migrate|update|add|remove|refactor|test|review|validate) ]]; then
    echo "⚠️  Task description lacks clear action verb"
  fi

  # Check for specific deliverables (Zone A fix: prevent generic context)
  if [[ "$task_desc" =~ (zone-d-round2|checkpoint|iteration [0-9]+) ]]; then
    echo "❌ Task description contains generic identifier (Zone A issue)"
    return 1
  fi

  echo "✅ Task description validation passed"
  return 0
}

validate_expected_files() {
  local files="$1"
  local errors=0

  if [[ -z "$files" ]]; then
    echo "⚠️  No expected files specified (may be OK for analysis tasks)"
    return 0
  fi

  # Split files by comma and validate each
  IFS=',' read -ra file_array <<< "$files"
  for file in "${file_array[@]}"; do
    # Remove whitespace
    file=$(echo "$file" | xargs)

    if [[ -z "$file" ]]; then
      continue
    fi

    # Check file path format
    if [[ ! "$file" =~ ^[a-zA-Z0-9_/-]+\.[a-zA-Z]+$ && ! "$file" =~ ^[a-zA-Z0-9_/-]+/ ]]; then
      echo "❌ Invalid file format: $file"
      ((errors++))
      continue
    fi

    # Check for generic placeholders
    if [[ "$file" =~ (placeholder|example|template) ]]; then
      echo "❌ Generic file placeholder: $file"
      ((errors++))
      continue
    fi

  done

  if [[ $errors -eq 0 ]]; then
    echo "✅ Expected files validation passed"
    return 0
  else
    return 1
  fi
}

validate_success_criteria() {
  local criteria="$1"
  local errors=0

  if [[ -z "$criteria" ]]; then
    echo "⚠️  No success criteria specified (may be OK for discovery tasks)"
    return 0
  fi

  # Check criteria length
  if [[ ${#criteria} -lt 5 ]]; then
    echo "❌ Success criteria too short: $criteria"
    ((errors++))
  fi

  # Check for measurable outcomes
  if [[ ! "$criteria" =~ (test|pass|fail|error|success|complete|0.*errors|100%) ]]; then
    echo "⚠️  Success criteria lacks measurable outcomes"
  fi

  # Check for generic statements
  if [[ "$criteria" =~ (done|finished|complete|good) && ${#criteria} -lt 20 ]]; then
    echo "❌ Success criteria too generic: $criteria"
    ((errors++))
  fi

  if [[ $errors -eq 0 ]]; then
    echo "✅ Success criteria validation passed"
    return 0
  else
    return 1
  fi
}

check_redis_context() {
  local task_id="$1"
  local redis_key="${NAMESPACE}:${task_id}:context"

  # Check if context exists
  if ! redis-cli EXISTS "$redis_key" >/dev/null 2>&1; then
    echo "❌ No context found in Redis for task: $task_id"
    return 1
  fi

  # Get all context fields
  local context_fields
  context_fields=$(redis-cli HGETALL "$redis_key" 2>/dev/null || echo "")

  if [[ -z "$context_fields" ]]; then
    echo "❌ Context exists but is empty for task: $task_id"
    return 1
  fi

  # Count non-metadata fields
  local field_count=0
  while IFS= read -r field; do
    # Skip metadata fields
    if [[ ! "$field" =~ (updated_at|stored_at) ]]; then
      ((field_count++))
    fi
  done <<< "$context_fields"

  if [[ $field_count -eq 0 ]]; then
    echo "❌ Context contains only metadata fields"
    return 1
  fi

  echo "✅ Redis context validation passed ($field_count data fields)"
  return 0
}

# Main validation
validation_errors=0
echo "🔍 Validating task context for: $TASK_ID"
echo ""

# Validate task description
if [[ -n "$TASK_DESCRIPTION" ]]; then
  if ! validate_task_description "$TASK_DESCRIPTION"; then
    ((validation_errors++))
  fi
fi

# Validate expected files
if [[ -n "$EXPECTED_FILES" ]]; then
  if ! validate_expected_files "$EXPECTED_FILES"; then
    ((validation_errors++))
  fi
fi

# Validate success criteria
if [[ -n "$SUCCESS_CRITERIA" ]]; then
  if ! validate_success_criteria "$SUCCESS_CRITERIA"; then
    ((validation_errors++))
  fi
fi

# Check Redis context
if ! check_redis_context "$TASK_ID"; then
  ((validation_errors++))
fi

echo ""

# Final result
if [[ $validation_errors -eq 0 ]]; then
  echo "🎉 All context validations passed!"
  echo "✅ CLI Mode has complete, structured task context"
  echo "✅ Zone A 'consensus on vapor' issue prevented"
  exit 0
else
  echo "❌ $validation_errors validation(s) failed"
  echo "⚠️  Task context may be incomplete"
  echo "⚠️  Risk of 'consensus on vapor' - please add missing context"
  exit 1
fi