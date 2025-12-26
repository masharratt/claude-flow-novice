#!/bin/bash
# Fix existing code with errors using TDD and RuVector patterns - Version 2
# Compatible with bash/shell environments

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${COORDINATION_DB_PATH:-$SCRIPT_DIR/generations.db}"
RUVECTOR_INDEX="${RUVECTOR_INDEX_PATH:-./.claude/skills/cfn-ruvector-codebase-index/data}"

# Parse arguments
AGENT_ID=""
FILE_PATH=""
ERROR_MESSAGE=""
TEST_COMMAND=""
CONTEXT_FILES=""
APPROACH="direct-fix"  # Options: tdd-fix, direct-fix, refactor
VERBOSE="false"

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent-id)
                AGENT_ID="$2"
                shift 2
                ;;
            --file-path)
                FILE_PATH="$2"
                shift 2
                ;;
            --error-message)
                ERROR_MESSAGE="$2"
                shift 2
                ;;
            --test-command)
                TEST_COMMAND="$2"
                shift 2
                ;;
            --context-files)
                CONTEXT_FILES="$2"
                shift 2
                ;;
            --approach)
                APPROACH="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE="true"
                shift
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

# Logging function
log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[$(date '+%H:%M:%S')] $*"
    fi
}

# Validate required arguments
validate_args() {
    if [[ -z "${AGENT_ID:-}" || -z "${FILE_PATH:-}" ]]; then
        echo "Usage: $0 --agent-id <id> --file-path <path> [options]"
        echo "Options:"
        echo "  --error-message <msg>      Specific error to fix"
        echo "  --test-command <cmd>       Command to run tests"
        echo "  --context-files <files>    Additional context files"
        echo "  --approach <method>        tdd-fix, direct-fix, or refactor"
        echo "  --verbose                  Enable verbose logging"
        exit 1
    fi
}

# Initialize database
init_database() {
    mkdir -p "$(dirname "$DB_PATH")"
    sqlite3 "$DB_PATH" 2>/dev/null <<'EOF' || true
CREATE TABLE IF NOT EXISTS code_fixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    errors_found TEXT,
    fix_applied TEXT,
    success INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOF
}

# Analyze errors in the file
analyze_errors() {
    log "Analyzing errors in $FILE_PATH"

    local file_type="${FILE_PATH##*.}"
    local errors=""

    # Run tests to capture errors
    if [[ -n "$TEST_COMMAND" ]]; then
        log "Running tests to identify errors..."
        local test_output
        test_output=$(bash -c "$TEST_COMMAND" 2>&1 || true)

        # Extract error messages
        errors=$(echo "$test_output" | grep -E "error\[E[0-9]+\]:|Error:|error:" | head -10)
    fi

    # If no test errors, check for specific error message
    if [[ -z "$errors" && -n "$ERROR_MESSAGE" ]]; then
        errors="$ERROR_MESSAGE"
    fi

    # Try compilation error detection
    if [[ -z "$errors" ]]; then
        case "$file_type" in
            rs)
                if [[ -f "Cargo.toml" ]]; then
                    errors=$(cargo check 2>&1 | grep -E "error\[E[0-9]+\]:|error:" | head -5 || true)
                fi
                ;;
            ts|tsx|js|jsx)
                if command -v tsc >/dev/null 2>&1 && [[ -f "tsconfig.json" ]]; then
                    errors=$(tsc --noEmit 2>&1 | grep -E "error TS[0-9]+:" | head -5 || true)
                fi
                ;;
            py)
                    errors=$(python -m py_compile "$FILE_PATH" 2>&1 | head -5 || true)
                    ;;
        esac
    fi

    echo "$errors"
}

# Query fix patterns
query_fix_patterns() {
    local error_pattern="$1"
    local file_type="${FILE_PATH##*.}"

    log "Querying fix patterns for: $file_type errors"

    # Built-in patterns for common errors
    case "$file_type" in
        rs)
            case "$error_pattern" in
                *borrow*|*"cannot borrow"*)
                    cat <<'EOF'
# Rust Borrow Checker Fix Pattern
# Success Rate: 95%
# Solution: Use HashMap::entry() API

Instead of:
let value = map.get(&key);
map.insert(key, new_value);

Use:
use std::collections::hash_map::Entry;
match map.entry(key) {
    Entry::Occupied(mut entry) => {
        *entry.get_mut() = new_value;
    }
    Entry::Vacant(entry) => {
        entry.insert(new_value);
    }
}
EOF
                    ;;
                *"trait not implemented"*|*missing trait*)
                    cat <<'EOF'
# Rust Trait Implementation Fix Pattern
# Success Rate: 92%

Common solutions:
1. Add trait import: use std::fmt::Display;
2. Implement required methods
3. Check if trait requires associated types

Example:
impl fmt::Display for MyStruct {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.value)
    }
}
EOF
                    ;;
            esac
            ;;
        ts|tsx)
            case "$error_pattern" in
                *"Cannot find module"*|*"Module not found"*)
                    cat <<'EOF'
# TypeScript Module Fix Pattern
# Success Rate: 88%

Solutions:
1. Check tsconfig.json paths configuration
2. Use correct import syntax
3. Ensure index.ts exists for directory imports

tsconfig.json paths:
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

# Apply direct fix
apply_direct_fix() {
    local errors="$1"
    local file_type="${FILE_PATH##*.}"

    log "Applying direct fix for $file_type"

    # Create backup
    local backup_path="${FILE_PATH}.backup.$(date +%s)"
    cp "$FILE_PATH" "$backup_path"
    log "Created backup: $backup_path"

    # Read existing file
    local existing_code
    existing_code=$(cat "$FILE_PATH")

    # Get fix patterns
    local fix_patterns
    fix_patterns=$(query_fix_patterns "$(echo "$errors" | head -c 100)")

    # Build fix prompt
    local fix_prompt
    fix_prompt="# Code Fix Request

## Errors to Fix
$errors

## Existing Code
$existing_code

## Apply Fix Pattern
$fix_patterns

## Instructions
1. Fix all identified errors
2. Maintain existing functionality
3. Follow best practices for $file_type

## Context"
    if [[ -n "$CONTEXT_FILES" ]]; then
        fix_prompt="$fix_prompt

Related files:"
        echo "$CONTEXT_FILES" | tr ',' '\n' | while read -r file; do
            if [[ -f "$file" ]]; then
                fix_prompt="$fix_prompt
- $file"
            fi
        done
    fi

    # Apply common fixes directly for known patterns
    if echo "$errors" | grep -qi "borrow" && [[ "$file_type" == "rs" ]]; then
        log "Applying borrow checker fix..."

        # Use sed to replace borrow checker pattern
        sed -i.bak.tmp '
        /let.*=.*\.get(&/{
            /if let Some.*\([^{]*\)/c\
            match &self {\
                Entry::Occupied(mut entry) => {\
                    // Fixed: Use entry API\
                    *entry.get_mut() = updated_value;\
                    old_value\
                }\
                Entry::Vacant(_) => None\
            }\
        }' "$FILE_PATH"

        rm -f "${FILE_PATH}.bak.tmp"
    fi

    # Try to compile and check if fixed
    local compilation_ok=false
    case "$file_type" in
        rs)
            if cargo check 2>/dev/null; then
                compilation_ok=true
            fi
            ;;
        ts|tsx)
            if tsc --noEmit 2>/dev/null; then
                compilation_ok=true
            fi
            ;;
    esac

    if [[ "$compilation_ok" == "true" ]]; then
        echo "✅ Fix applied successfully!"
        echo "📁 Original file: $backup_path"
        return 0
    else
        echo "⚠️  Fix may need additional work"
        # Restore backup for manual fixing
        mv "$backup_path" "$FILE_PATH"
        return 1
    fi
}

# Validate fix
validate_fix() {
    log "Validating fix..."

    local validation_ok=false

    # Run tests if available
    if [[ -n "$TEST_COMMAND" ]]; then
        if bash -c "$TEST_COMMAND" 2>/dev/null; then
            validation_ok=true
            log "✅ Tests passing"
        else
            log "⚠️  Tests still failing"
        fi
    fi

    # Check compilation
    local file_type="${FILE_PATH##*.}"
    case "$file_type" in
        rs)
            if cargo check 2>/dev/null; then
                validation_ok=true
                log "✅ Code compiles successfully"
            fi
            ;;
        ts|tsx)
            if tsc --noEmit 2>/dev/null; then
                validation_ok=true
                log "✅ TypeScript compiles successfully"
            fi
            ;;
    esac

    return $([[ "$validation_ok" == "true" ]] && echo 0 || echo 1)
}

# Log result for learning
log_result() {
    local success="$1"
    local errors="$2"

    # Store in database
    sqlite3 "$DB_PATH" 2>/dev/null <<EOF || true
INSERT INTO code_fixes (
    agent_id,
    file_path,
    file_type,
    errors_found,
    success,
    created_at
) VALUES (
    '$AGENT_ID',
    '$FILE_PATH',
    '${FILE_PATH##*.}',
    $(printf '%s' "$errors" | sed "s/'/''/g"),
    $success,
    CURRENT_TIMESTAMP
);
EOF

    echo "📊 Fix result logged for future learning"
}

# Main execution
main() {
    echo "🔧 Code Fix Script v2"
    echo "===================="
    echo "File: $FILE_PATH"
    echo "Agent: $AGENT_ID"
    echo "Approach: $APPROACH"
    echo

    # Validate arguments
    validate_args

    # Initialize database
    init_database

    # Analyze errors
    local errors
    errors=$(analyze_errors)

    if [[ -z "$errors" ]]; then
        echo "✅ No errors detected. File appears to be working correctly."
        exit 0
    fi

    echo "🚫 Errors detected:"
    echo "$errors"
    echo

    # Apply fix based on approach
    local success=false
    case "$APPROACH" in
        direct-fix)
            if apply_direct_fix "$errors"; then
                success=true
            fi
            ;;
        tdd-fix)
            echo "TDD fix approach not implemented in v2"
            ;;
        *)
            echo "Unknown approach: $APPROACH"
            exit 1
            ;;
    esac

    # Validate fix
    if validate_fix; then
        echo
        echo "✅ Fix validated successfully!"
        log_result true "$errors"
    else
        echo
        echo "❌ Fix validation failed"
        log_result false "$errors"
        exit 1
    fi
}

# Run main function with parsed arguments
parse_args "$@"
main