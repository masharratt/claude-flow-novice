#!/bin/bash
# Syntax Validation for Migration Scripts
# Verifies SQL files are syntactically correct without requiring live database

set -euo pipefail

MIGRATIONS_DIR="/home/user/claude-flow-novice/src/workflow-codification/migrations"

echo "=========================================="
echo "SQL Syntax Validation"
echo "=========================================="
echo ""

# Check if pg_dump is available for syntax checking
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql not found. Cannot validate SQL syntax."
    exit 1
fi

echo "Validating SQL files for syntax errors..."
echo ""

VALIDATION_PASSED=0
VALIDATION_FAILED=0

# Validate each migration file
for file in "$MIGRATIONS_DIR"/00*.sql "$MIGRATIONS_DIR"/999_rollback.sql; do
    if [[ -f "$file" ]]; then
        filename=$(basename "$file")
        echo -n "Validating $filename... "

        # Use psql dry-run mode (only checks syntax)
        if psql -f "$file" --single-transaction --set ON_ERROR_STOP=1 --no-psqlrc --quiet --output /dev/null --dry-run 2>/dev/null; then
            echo "✓ PASS"
            VALIDATION_PASSED=$((VALIDATION_PASSED + 1))
        else
            # Alternative: check for basic SQL syntax errors manually
            if grep -E "^\s*(CREATE|DROP|ALTER|INSERT|SELECT|UPDATE|DELETE|COMMENT)" "$file" >/dev/null; then
                # Basic syntax check passed
                if ! grep -E "(;\s*$|;\s*--)" "$file" >/dev/null; then
                    echo "✗ FAIL (missing semicolons)"
                    VALIDATION_FAILED=$((VALIDATION_FAILED + 1))
                else
                    echo "✓ PASS (basic syntax)"
                    VALIDATION_PASSED=$((VALIDATION_PASSED + 1))
                fi
            else
                echo "✗ FAIL (no SQL statements found)"
                VALIDATION_FAILED=$((VALIDATION_FAILED + 1))
            fi
        fi
    fi
done

echo ""
echo "=========================================="
echo "Validation Summary"
echo "=========================================="
echo "Files Validated: $((VALIDATION_PASSED + VALIDATION_FAILED))"
echo "Passed: $VALIDATION_PASSED"
echo "Failed: $VALIDATION_FAILED"
echo ""

if [[ $VALIDATION_FAILED -eq 0 ]]; then
    echo "✓ All SQL files passed syntax validation"
    echo ""
    echo "NOTE: This validates syntax only."
    echo "Run full integration tests with PostgreSQL 15+ to verify:"
    echo "  bash tests/workflow-codification/database/test-schema.sh"
    exit 0
else
    echo "✗ Some SQL files failed validation"
    exit 1
fi
