#!/usr/bin/env bash
set -euo pipefail

# Example usage demonstrations for TDD Conversation Coordinator
# This script shows common patterns and use cases

COORDINATOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tdd-conversation-coordinator.sh"

echo "================================================"
echo "  TDD Coordinator - Example Usage"
echo "================================================"
echo

# Ensure API key is set
if [[ -z "${ZAI_API_KEY:-}" ]]; then
    echo "ERROR: ZAI_API_KEY environment variable required"
    echo "Set it in your .env file or export it:"
    echo "  export ZAI_API_KEY='your-api-key'"
    exit 1
fi

echo "Available examples:"
echo "  1) Simple TypeScript function"
echo "  2) Python data validator"
echo "  3) Go HTTP middleware"
echo "  4) Complex authentication flow"
echo "  5) Custom example (interactive)"
echo

read -p "Choose example (1-5): " choice

case $choice in
    1)
        echo
        echo "Example 1: Simple TypeScript Email Validator"
        echo "============================================"
        echo
        echo "This will:"
        echo "  - Generate tests for email validation"
        echo "  - Implement regex-based validator"
        echo "  - Handle edge cases (plus signs, multiple dots, etc.)"
        echo
        read -p "Press Enter to continue or Ctrl+C to cancel..."

        "$COORDINATOR" \
            --agent-id "example-ts-$(date +%s)" \
            --feature "Email validator function that validates RFC-compliant email addresses" \
            --file "./examples/email-validator.ts" \
            --test-command "npx tsx --test examples/email-validator.test.ts || npm test examples/email-validator.test.ts" \
            --context "./examples/types.ts" \
            --max-iterations 3 \
            --verbose
        ;;

    2)
        echo
        echo "Example 2: Python SQL Sanitizer"
        echo "================================"
        echo
        echo "This will:"
        echo "  - Generate pytest tests for SQL injection prevention"
        echo "  - Implement parameterized query builder"
        echo "  - Handle various injection vectors"
        echo
        read -p "Press Enter to continue or Ctrl+C to cancel..."

        "$COORDINATOR" \
            --agent-id "example-py-$(date +%s)" \
            --feature "SQL query sanitizer that prevents injection attacks using parameterized queries" \
            --file "./examples/sql_sanitizer.py" \
            --test-command "pytest examples/test_sql_sanitizer.py -v" \
            --context "./examples/database_types.py" \
            --max-iterations 5 \
            --verbose
        ;;

    3)
        echo
        echo "Example 3: Go Rate Limiter"
        echo "=========================="
        echo
        echo "This will:"
        echo "  - Generate Go tests for rate limiting middleware"
        echo "  - Implement token bucket algorithm"
        echo "  - Handle concurrent requests"
        echo
        read -p "Press Enter to continue or Ctrl+C to cancel..."

        "$COORDINATOR" \
            --agent-id "example-go-$(date +%s)" \
            --feature "HTTP middleware for rate limiting using token bucket algorithm with per-IP tracking" \
            --file "./examples/rate_limiter.go" \
            --test-command "go test -v ./examples/..." \
            --context "./examples/types.go,./examples/config.go" \
            --max-iterations 5 \
            --verbose
        ;;

    4)
        echo
        echo "Example 4: Complex JWT Authentication"
        echo "====================================="
        echo
        echo "This will:"
        echo "  - Generate comprehensive JWT validation tests"
        echo "  - Implement signature, expiration, and claims validation"
        echo "  - Handle edge cases and security concerns"
        echo
        read -p "Press Enter to continue or Ctrl+C to cancel..."

        "$COORDINATOR" \
            --agent-id "example-jwt-$(date +%s)" \
            --feature "JWT token validator with signature verification, expiration checking, issuer validation, and custom claims support" \
            --file "./examples/jwt-validator.ts" \
            --test-command "npm test examples/jwt-validator.test.ts" \
            --context "./examples/auth-types.ts,./examples/crypto-utils.ts,./examples/config.ts" \
            --max-iterations 7 \
            --verbose
        ;;

    5)
        echo
        echo "Example 5: Custom Feature"
        echo "========================="
        echo
        read -p "Agent ID (default: custom-$(date +%s)): " agent_id
        agent_id="${agent_id:-custom-$(date +%s)}"

        read -p "Feature description: " feature
        if [[ -z "$feature" ]]; then
            echo "ERROR: Feature description required"
            exit 1
        fi

        read -p "Target file path: " file_path
        if [[ -z "$file_path" ]]; then
            echo "ERROR: File path required"
            exit 1
        fi

        read -p "Test command: " test_command
        if [[ -z "$test_command" ]]; then
            echo "ERROR: Test command required"
            exit 1
        fi

        read -p "Context files (comma-separated, optional): " context_files

        read -p "Max iterations (default: 5): " max_iterations
        max_iterations="${max_iterations:-5}"

        read -p "Enable verbose mode? (y/N): " verbose_choice
        verbose_flag=""
        if [[ "$verbose_choice" =~ ^[Yy]$ ]]; then
            verbose_flag="--verbose"
        fi

        echo
        echo "Configuration:"
        echo "  Agent ID:    $agent_id"
        echo "  Feature:     $feature"
        echo "  File:        $file_path"
        echo "  Test cmd:    $test_command"
        echo "  Context:     ${context_files:-none}"
        echo "  Iterations:  $max_iterations"
        echo "  Verbose:     ${verbose_flag:-no}"
        echo
        read -p "Proceed? (y/N): " confirm

        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            echo "Cancelled"
            exit 0
        fi

        context_arg=""
        if [[ -n "$context_files" ]]; then
            context_arg="--context $context_files"
        fi

        "$COORDINATOR" \
            --agent-id "$agent_id" \
            --feature "$feature" \
            --file "$file_path" \
            --test-command "$test_command" \
            $context_arg \
            --max-iterations "$max_iterations" \
            $verbose_flag
        ;;

    *)
        echo "Invalid choice: $choice"
        exit 1
        ;;
esac

echo
echo "================================================"
echo "  Example completed!"
echo "================================================"
echo
echo "Next steps:"
echo "  1. Review generated tests and implementation"
echo "  2. Run full test suite"
echo "  3. Check conversation file in conversations/"
echo "  4. Query CodeSearch for learned patterns"
echo
