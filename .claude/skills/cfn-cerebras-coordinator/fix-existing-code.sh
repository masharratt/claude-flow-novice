#!/bin/bash
set -euo pipefail

# Fix existing code with errors using TDD and RuVector patterns
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${COORDINATION_DB_PATH:-$SCRIPT_DIR/generations.db}"
RUVECTOR_INDEX="${RUVECTOR_INDEX_PATH:-./.claude/skills/cfn-ruvector-codebase-index/data}"

# Parse arguments
AGENT_ID=""
FILE_PATH=""
ERROR_MESSAGE=""
TEST_COMMAND=""
CONTEXT_FILES=""
APPROACH="tdd-fix"  # Options: tdd-fix, direct-fix, refactor

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id) AGENT_ID="$2"; shift 2 ;;
        --file-path) FILE_PATH="$2"; shift 2 ;;
        --error-message) ERROR_MESSAGE="$2"; shift 2 ;;
        --test-command) TEST_COMMAND="$2"; shift 2 ;;
        --context-files) CONTEXT_FILES="$2"; shift 2 ;;
        --approach) APPROACH="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Required arguments
if [[ -z "${AGENT_ID:-}" || -z "${FILE_PATH:-}" ]]; then
    echo "Usage: $0 --agent-id <id> --file-path <path> [options]"
    echo "Options:"
    echo "  --error-message <msg>      Specific error to fix"
    echo "  --test-command <cmd>       Command to run tests"
    echo "  --context-files <files>    Additional context files"
    echo "  --approach <method>        tdd-fix, direct-fix, or refactor"
    exit 1
fi

# Logging
log() {
    echo "[$(date '+%H:%M:%S')] Fix: $*"
}

# Step 1: Analyze the existing file and errors
analyze_errors() {
    log "Analyzing errors in $FILE_PATH"

    # Run tests to see current errors
    if [[ -n "$TEST_COMMAND" ]]; then
        log "Running tests to identify errors..."
        TEST_OUTPUT=$(bash -c "$TEST_COMMAND" 2>&1 || true)
        log "Test output: $TEST_OUTPUT"
    fi

    # Parse file for syntax issues
    FILE_TYPE="${FILE_PATH##*.}"
    local file_errors=""

    case "$FILE_TYPE" in
        rs)
            # Rust compilation errors
            if cargo check --message-format=json 2>/dev/null | jq -r '.message.message' 2>/dev/null; then
                file_errors=$(cargo check --message-format=json 2>&1 | jq -r '.message.message' 2>/dev/null || true)
            fi
            ;;
        ts|tsx)
            # TypeScript compilation errors
            if command -v tsc >/dev/null 2>&1; then
                file_errors=$(tsc --noEmit 2>&1 || true)
            fi
            ;;
        py)
            # Python syntax/lint errors
            file_errors=$(python -m py_compile "$FILE_PATH" 2>&1 || true)
            ;;
    esac

    echo "$file_errors"
}

# Step 2: Query fix patterns from RuVector
query_fix_patterns() {
    local error_pattern="$1"
    local file_type="${FILE_PATH##*.}"

    log "Querying fix patterns for: $file_type errors - $error_pattern"

    if [[ -f "$RUVECTOR_INDEX/search.sh" ]]; then
        # Search for similar fix patterns
        "$RUVECTOR_INDEX/search.sh" "fix $file_type $error_pattern" --top 5 2>/dev/null | \
        jq -r '.[] | select(.success == true) | .prompt' 2>/dev/null || \
        get_builtin_fix_patterns "$file_type" "$error_pattern"
    else
        get_builtin_fix_patterns "$file_type" "$error_pattern"
    fi
}

# Built-in fix patterns when RuVector not available
get_builtin_fix_patterns() {
    local file_type="$1"
    local error_pattern="$2"

    case "$file_type" in
        rs)
            case "$error_pattern" in
                *"borrow checker"*|*"cannot borrow"*)
                    cat <<EOF
// Rust Borrow Checker Fix Pattern:
// Common solutions:
// 1. Use references instead of moving values
// 2. Clone the value if needed
// 3. Use Rc<RefCell> for shared ownership
// 4. Restructure code to avoid multiple borrows

Example:
// Instead of: vec.push(item); vec.iter()
// Use: let item = item.clone(); vec.push(item); vec.iter()

// For shared mutable access:
use std::rc::Rc;
use std::cell::RefCell;
let shared = Rc::new(RefCell::new(vec![]));
EOF
                    ;;
                *"trait not implemented"*)
                    cat <<EOF
// Trait Implementation Fix Pattern:
// Common issues:
// 1. Missing trait imports
// 2. Incorrect method signatures
// 3. Missing associated types

Example fix:
use std::fmt;  // Add trait import

impl fmt::Display for MyStruct {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.value)
    }
}
EOF
                    ;;
            esac
            ;;
        ts)
            case "$error_pattern" in
                *"Cannot find module"*|*"Module not found"*)
                    cat <<EOF
// TypeScript Module Fix Pattern:
// Common solutions:
// 1. Check tsconfig.json paths configuration
// 2. Use correct import syntax
// 3. Ensure module exports exist

Example:
// Instead of: import { thing } from './module'
// Use: import * as module from './module'; const thing = module.thing

// Or add to tsconfig.json:
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
EOF
                    ;;
            esac
            ;;
    esac
}

# Step 3: TDD Fix Approach
tdd_fix_approach() {
    local errors="$1"
    local fix_patterns="$2"

    log "Using TDD approach to fix errors"

    # Create test that exposes the error
    local test_file_path="${FILE_PATH%.*}_fix_test.${FILE_PATH##*.}"

    log "Creating test to reproduce error..."
    local test_prompt="# TDD Fix Test for $FILE_PATH

## Current Errors
$errors

## Fix Patterns Available
$fix_patterns

## Task
Create a test that:
1. Reproduces the current error
2. Describes the expected behavior
3. Will pass once the error is fixed

Write a test that fails now due to the error but should pass after fixing."

    # Generate failing test
    local request_body=$(jq -n \
        --arg model "${CEREBRAS_MODEL:-qwen2.5-coder-32b}" \
        --arg prompt "$test_prompt" \
        '{
            model: $model,
            messages: [
                {
                    role: "system",
                    content: "You are a TDD specialist. Write a test that exposes the current error and describes the fix needed."
                },
                {
                    role: "user",
                    content: $prompt
                }
            ],
            max_tokens: 2048,
            temperature: 0.1
        }')

    local response=$(curl -s -X POST "${CEREBRAS_BASE_URL:-https://api.cerebras.ai/v1}/chat/completions" \
        -H "Authorization: Bearer $CEREBRAS_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$request_body")

    local test_code=$(echo "$response" | jq -r '.choices[0].message.content')

    if [[ "$test_code" != "null" && -n "$test_code" ]]; then
        echo "$test_code" > "$test_file_path"
        log "Created test file: $test_file_path"
    fi

    # Now generate the fix
    log "Generating fix for $FILE_PATH..."

    # Read existing file
    local existing_code=$(cat "$FILE_PATH")

    local fix_prompt="# Fix Request for $FILE_PATH

## Current Errors
$errors

## Existing Code
\`\`\`
$existing_code
\`\`\`

## Fix Patterns to Use
$fix_patterns

## Instructions
1. Fix all identified errors
2. Maintain existing functionality
3. Follow Rust best practices
4. Ensure tests pass
5. Add comments explaining the fix

## Context Files"
if [[ -n "$CONTEXT_FILES" ]]; then
    IFS=',' read -ra FILES <<< "$CONTEXT_FILES"
    for file in "${FILES[@]}"; do
        if [[ -f "$file" ]]; then
            fix_prompt="$fix_prompt

### $file
\`\`\`
$(cat "$file)
\`\`\`"
        fi
    done
fi

    # Generate fix
    request_body=$(jq -n \
        --arg model "${CEREBRAS_MODEL:-qwen2.5-coder-32b}" \
        --arg prompt "$fix_prompt" \
        '{
            model: $model,
            messages: [
                {
                    role: "system",
                    content: "You are fixing compilation/runtime errors in existing code. Apply the provided fix patterns and ensure the code compiles and passes tests."
                },
                {
                    role: "user",
                    content: $prompt
                }
            ],
            max_tokens: 8192,
            temperature: 0.1
        }')

    response=$(curl -s -X POST "${CEREBRAS_BASE_URL:-https://api.cerebras.ai/v1}/chat/completions" \
        -H "Authorization: Bearer $CEREBRAS_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$request_body")

    local fixed_code=$(echo "$response" | jq -r '.choices[0].message.content')

    if [[ "$fixed_code" != "null" && -n "$fixed_code" ]]; then
        # Create backup
        cp "$FILE_PATH" "${FILE_PATH}.backup.$(date +%s)"

        # Write fixed code
        echo "$fixed_code" > "$FILE_PATH"
        log "Applied fix to $FILE_PATH"
    fi
}

# Step 4: Direct Fix Approach
direct_fix_approach() {
    local errors="$1"
    local fix_patterns="$2"

    log "Using direct fix approach"

    # Read existing code
    local existing_code=$(cat "$FILE_PATH")

    local fix_prompt="# Direct Fix Request

## Errors to Fix
$errors

## Existing Code
\`\`\`
$existing_code
\`\`\`

## Apply These Fix Patterns
$fix_patterns

## Instructions
Fix the errors directly in the code. Explain what you changed and why.

## Context"
if [[ -n "$CONTEXT_FILES" ]]; then
    IFS=',' read -ra FILES <<< "$CONTEXT_FILES"
    for file in "${FILES[@]}"; do
        if [[ -f "$file" ]]; then
            fix_prompt="$fix_prompt

- $file: $(head -5 "$file")..."
        fi
    done
fi

    # Generate and apply fix
    local request_body=$(jq -n \
        --arg model "${CEREBRAS_MODEL:-qwen2.5-coder-32b}" \
        --arg prompt "$fix_prompt" \
        '{
            model: $model,
            messages: [
                {
                    role: "system",
                    content: "You are fixing errors in existing code. Apply the fix patterns and explain your changes."
                },
                {
                    role: "user",
                    content: $prompt
                }
            ],
            max_tokens: 4096,
            temperature: 0.1
        }')

    local response=$(curl -s -X POST "${CEREBRAS_BASE_URL:-https://api.cerebras.ai/v1}/chat/completions" \
        -H "Authorization: Bearer $CEREBRAS_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$request_body")

    local fix_result=$(echo "$response" | jq -r '.choices[0].message.content')

    echo "$fix_result"
}

# Step 5: Validate fix
validate_fix() {
    log "Validating fix..."

    # Run tests if available
    if [[ -n "$TEST_COMMAND" ]]; then
        if bash -c "$TEST_COMMAND" 2>&1; then
            log "✅ Tests passing - fix successful!"
            return 0
        else
            log "❌ Tests still failing - may need additional fixes"
            return 1
        fi
    fi

    # Check compilation
    case "${FILE_PATH##*.}" in
        rs)
            if cargo check 2>/dev/null; then
                log "✅ Code compiles successfully"
                return 0
            fi
            ;;
        ts|tsx)
            if tsc --noEmit 2>/dev/null; then
                log "✅ TypeScript compiles successfully"
                return 0
            fi
            ;;
    esac

    return 1
}

# Step 6: Log the fix for learning
log_fix_result() {
    local success="$1"
    local errors="$2"
    local fix_applied="$3"

    # Store in database
    sqlite3 "$DB_PATH" <<EOF
INSERT INTO code_fixes (
    agent_id,
    file_path,
    file_type,
    errors_found,
    fix_applied,
    success,
    created_at
) VALUES (
    '$AGENT_ID',
    '$FILE_PATH',
    '${FILE_PATH##*.}',
    $(printf '%s' "$errors" | sed "s/'/''/g"),
    $(printf '%s' "$fix_applied" | sed "s/'/''/g"),
    $success,
    CURRENT_TIMESTAMP
);
EOF

    # Store pattern in RuVector
    if [[ -f "$RUVECTOR_INDEX/store.sh" ]]; then
        local metadata=$(cat <<EOF
{
    "type": "code_fix",
    "agent_id": "$AGENT_ID",
    "file_type": "${FILE_PATH##*.}",
    "success": $success,
    "tags": "fix,${FILE_PATH##*.},${success}"
}
EOF
)

        echo "$fix_applied" | \
        "$RUVECTOR_INDEX/store.sh" \
            --metadata "$metadata" \
            --type "code_fix" \
            --tags "fix,${FILE_PATH##*.}" \
            2>/dev/null || true
    fi

    log "Fix result logged for future learning"
}

# Main execution
echo "🔧 Code Fix with Cerebras + RuVector"
echo "==================================="
echo "File: $FILE_PATH"
echo "Agent: $AGENT_ID"
echo "Approach: $APPROACH"
echo

# Analyze errors
ERRORS=$(analyze_errors)
if [[ -z "$ERRORS" && -n "${ERROR_MESSAGE:-}" ]]; then
    ERRORS="$ERROR_MESSAGE"
fi

if [[ -z "$ERRORS" ]]; then
    log "No errors detected. File appears to be working correctly."
    exit 0
fi

echo "🚫 Errors detected:"
echo "$ERRORS"
echo

# Query fix patterns
FIX_PATTERNS=$(query_fix_patterns "$(echo "$ERRORS" | head -c 100)")

echo "📚 Fix patterns found:"
echo "$FIX_PATTERNS"
echo

# Apply fix based on approach
case "$APPROACH" in
    tdd-fix)
        tdd_fix_approach "$ERRORS" "$FIX_PATTERNS"
        ;;
    direct-fix)
        direct_fix_approach "$ERRORS" "$FIX_PATTERNS"
        ;;
    refactor)
        log "Refactor approach - analyze and suggest improvements"
        # TODO: Implement refactor approach
        ;;
esac

# Validate fix
if validate_fix; then
    echo
    echo "✅ Fix applied successfully!"
    log_fix_result true "$ERRORS" "Fixed using $APPROACH approach"
else
    echo
    echo "⚠️  Fix may need additional work"
    log_fix_result false "$ERRORS" "Partial fix using $APPROACH approach"
fi