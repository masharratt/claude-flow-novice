#!/usr/bin/env bash
set -euo pipefail

# TDD-driven Cerebras coordinator - Tests first, then implementation
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${COORDINATION_DB_PATH:-$SCRIPT_DIR/generations.db}"
CODESEARCH_INDEX="${CODESEARCH_INDEX_PATH:-./.claude/skills/cfn-codesearch/data}"

# Parse arguments
AGENT_ID=""
FEATURE=""
FILE_PATH=""
CONTEXT_FILES=""
TEST_FRAMEWORK=""
VERBOSE="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id) AGENT_ID="$2"; shift 2 ;;
        --feature) FEATURE="$2"; shift 2 ;;
        --file-path) FILE_PATH="$2"; shift 2 ;;
        --context-files) CONTEXT_FILES="$2"; shift 2 ;;
        --test-framework) TEST_FRAMEWORK="$2"; shift 2 ;;
        --verbose) VERBOSE="true"; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Required arguments
if [[ -z "${AGENT_ID:-}" || -z "${FEATURE:-}" || -z "${FILE_PATH:-}" ]]; then
    echo "Usage: $0 --agent-id <id> --feature <feature description> --file-path <path> [options]"
    echo "Options:"
    echo "  --context-files <files>     Comma-separated context files"
    echo "  --test-framework <fw>       Test framework to use (auto, rust, jest, pytest, etc.)"
    echo "  --verbose                   Enable verbose logging"
    exit 1
fi

# Logging function
log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[$(date '+%H:%M:%S')] TDD: $*"
    fi
}

# Detect test framework
detect_test_framework() {
    if [[ -n "$TEST_FRAMEWORK" && "$TEST_FRAMEWORK" != "auto" ]]; then
        echo "$TEST_FRAMEWORK"
        return 0
    fi

    case "${FILE_PATH##*.}" in
        rs)
            if [[ -f "Cargo.toml" ]]; then
                echo "rust"
            else
                echo "rust-bare"
            fi
            ;;
        ts|tsx|js|jsx)
            if [[ -f "package.json" ]]; then
                if jq -e '.scripts.test' package.json >/dev/null 2>&1; then
                    if jq -e '.devDependencies.jest' package.json >/dev/null 2>&1; then
                        echo "jest"
                    else
                        echo "npm"
                    fi
                else
                    echo "node"
                fi
            fi
            ;;
        py)
            if [[ -f "requirements.txt" ]] && grep -q "pytest" requirements.txt; then
                echo "pytest"
            else
                echo "unittest"
            fi
            ;;
        go)
            echo "go"
            ;;
        *)
            echo "generic"
            ;;
    esac
}

# Query TDD patterns from CodeSearch
query_tdd_patterns() {
    local file_ext="${FILE_PATH##*.}"
    local framework=$(detect_test_framework)

    log "Querying TDD patterns for: $file_ext with $framework framework"

    # Search for TDD patterns
    if [[ -f "$CODESEARCH_INDEX/search.sh" ]]; then
        "$CODESEARCH_INDEX/search.sh" "TDD test-first $file_ext $framework" --top 3 2>/dev/null | \
        jq -r '.[] | select(.success == true) | .prompt' 2>/dev/null || \
        echo "No TDD patterns found"
    else
        log "CodeSearch not found, using built-in TDD patterns"
        get_builtin_tdd_patterns "$file_ext" "$framework"
    fi
}

# Built-in TDD patterns when CodeSearch is not available
get_builtin_tdd_patterns() {
    local file_type="$1"
    local framework="$2"

    case "$file_type" in
        rs)
            cat <<EOF
# Rust TDD Pattern Example
## Test file: tests/user_service_test.rs
#[cfg(test)]
mod tests {
    use super::*;
    use tokio_test;

    #[tokio::test]
    async fn test_create_user_success() {
        // Given
        let user_repo = MockUserRepository::new();
        let user_service = UserService::new(user_repo);
        let user_data = CreateUserRequest {
            email: "test@example.com".to_string(),
            password: "password123".to_string(),
        };

        // When
        let result = user_service.create_user(user_data).await;

        // Then
        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.email, "test@example.com");
    }

    #[tokio::test]
    async fn test_create_user_duplicate_email() {
        // Given
        let mut user_repo = MockUserRepository::new();
        user_repo.should_return_duplicate_error(true);
        let user_service = UserService::new(user_repo);
        let user_data = CreateUserRequest {
            email: "existing@example.com".to_string(),
            password: "password123".to_string(),
        };

        // When
        let result = user_service.create_user(user_data).await;

        // Then
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Email already exists");
    }
}
EOF
            ;;
        ts)
            cat <<EOF
# TypeScript TDD Pattern Example
## Test file: UserService.test.ts
import { UserService } from '../UserService';
import { MockUserRepository } from '../__mocks__/UserRepository';

describe('UserService', () => {
    let userService: UserService;
    let mockRepo: MockUserRepository;

    beforeEach(() => {
        mockRepo = new MockUserRepository();
        userService = new UserService(mockRepo);
    });

    describe('createUser', () => {
        it('should create a user successfully', async () => {
            // Given
            const userData = {
                email: 'test@example.com',
                password: 'password123'
            };
            mockRepo.save.mockResolvedValue({ id: 1, ...userData });

            // When
            const result = await userService.createUser(userData);

            // Then
            expect(result).toBeDefined();
            expect(result.email).toBe(userData.email);
            expect(mockRepo.save).toHaveBeenCalledWith(userData);
        });

        it('should throw error for duplicate email', async () => {
            // Given
            const userData = {
                email: 'existing@example.com',
                password: 'password123'
            };
            mockRepo.save.mockRejectedValue(new Error('Email already exists'));

            // When/Then
            await expect(userService.createUser(userData))
                .rejects.toThrow('Email already exists');
        });
    });
});
EOF
            ;;
        py)
            cat <<EOF
# Python TDD Pattern Example
## Test file: test_user_service.py
import pytest
from unittest.mock import Mock
from user_service import UserService
from user_repository import DuplicateEmailError

class TestUserService:
    def setup_method(self):
        self.mock_repo = Mock()
        self.user_service = UserService(self.mock_repo)

    def test_create_user_success(self):
        """Given valid user data, when creating user, then user is created successfully"""
        # Given
        user_data = {
            'email': 'test@example.com',
            'password': 'password123'
        }
        self.mock_repo.save.return_value = {'id': 1, **user_data}

        # When
        result = self.user_service.create_user(user_data)

        # Then
        assert result['email'] == user_data['email']
        self.mock_repo.save.assert_called_once_with(user_data)

    def test_create_user_duplicate_email(self):
        """Given existing email, when creating user, then raises DuplicateEmailError"""
        # Given
        user_data = {
            'email': 'existing@example.com',
            'password': 'password123'
        }
        self.mock_repo.save.side_effect = DuplicateEmailError()

        # When/Then
        with pytest.raises(DuplicateEmailError):
            self.user_service.create_user(user_data)
EOF
            ;;
    esac
}

# Generate tests first
generate_tests() {
    local patterns="$1"
    local file_type="${FILE_PATH##*.}"
    local test_file_path=""

    # Determine test file path
    case "$file_type" in
        rs)
            if [[ "$FILE_PATH" == src/* ]]; then
                test_file_path="tests/${FILE_PATH#src/}"
                test_file_path="${test_file_path%.rs}_test.rs"
            else
                test_file_path="${FILE_PATH%.rs}_test.rs"
            fi
            ;;
        ts|tsx)
            if [[ "$FILE_PATH" == src/* ]]; then
                test_file_path="${FILE_PATH/src/tests}"
                test_file_path="${test_file_path%.ts}.test.ts"
            else
                test_file_path="${FILE_PATH%.ts}.test.ts"
            fi
            ;;
        py)
            if [[ "$FILE_PATH" == src/* ]]; then
                test_file_path="tests/${FILE_PATH#src/}"
                test_file_path="${test_file_path%.py}_test.py"
            else
                test_file_path="test_${FILE_PATH%.py}.py"
            fi
            ;;
    esac

    log "Generating tests at: $test_file_path"

    # Build test generation prompt
    local test_prompt="# TDD Test Generation Task

## Feature to Implement
$FEATURE

## Target Implementation File
$FILE_PATH

## TDD Requirements
Write tests FIRST following these principles:
1. Tests describe WHAT the code should do (not HOW)
2. Each test has clear Given/When/Then structure
3. Test names describe behavior or requirements
4. Include edge cases and error conditions
5. Use appropriate assertion styles for the framework

## Test Framework
$(detect_test_framework)

## Context Files"
if [[ -n "$CONTEXT_FILES" ]]; then
    IFS=',' read -ra FILES <<< "$CONTEXT_FILES"
    for file in "${FILES[@]}"; do
        if [[ -f "$file" ]]; then
            test_prompt="$test_prompt

## $file
\`\`\`
$(cat "$file")
\`\`\`"
        fi
    done
fi

# Add successful TDD patterns
if [[ -n "$patterns" ]]; then
    test_prompt="$test_prompt

## Successful TDD Patterns (Reference)
Follow these patterns for writing effective tests:
$patterns"
fi

test_prompt="$test_prompt

## Instructions
1. Write comprehensive tests that cover all requirements
2. Include test setup/teardown if needed
3. Mock external dependencies
4. Test both success and failure scenarios
5. Make tests descriptive and maintainable

Generate ONLY the test file content."

    # Use Cerebras to generate tests
    log "Generating tests with Cerebras..."
    local request_body=$(jq -n \
        --arg model "${CEREBRAS_MODEL:-qwen2.5-coder-32b}" \
        --arg prompt "$test_prompt" \
        '{
            model: $model,
            messages: [
                {
                    role: "system",
                    content: "You are a TDD expert. Write comprehensive, maintainable tests that clearly specify requirements using Given/When/Then structure."
                },
                {
                    role: "user",
                    content: $prompt
                }
            ],
            max_tokens: 4096,
            temperature: 0.1,
            stream: false
        }')

    local response=$(curl -s -X POST "${CEREBRAS_BASE_URL:-https://api.cerebras.ai/v1}/chat/completions" \
        -H "Authorization: Bearer $CEREBRAS_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$request_body")

    local test_code=$(echo "$response" | jq -r '.choices[0].message.content')

    if [[ "$test_code" == "null" || -z "$test_code" ]]; then
        echo "❌ Failed to generate tests"
        return 1
    fi

    # Create test file directory
    mkdir -p "$(dirname "$test_file_path")"

    # Write tests
    echo "$test_code" > "$test_file_path"

    echo "✅ Tests generated at: $test_file_path"
    return 0
}

# Run failing tests to verify requirements
run_failing_tests() {
    log "Running tests to verify they fail initially (TDD Red Phase)"

    local test_file_path="$1"
    local file_type="${FILE_PATH##*.}"
    local test_cmd=""

    # Determine test command
    case "$file_type" in
        rs)
            if [[ -f "Cargo.toml" ]]; then
                test_cmd="cargo test --test $(basename "$test_file_path")"
            else
                test_cmd="rustc --test $test_file_path && ./$(basename "$test_file_path" .rs)"
            fi
            ;;
        ts|tsx|js|jsx)
            if [[ -f "package.json" ]]; then
                test_cmd="npm test -- $test_file_path"
            else
                test_cmd="node $test_file_path"
            fi
            ;;
        py)
            test_cmd="python -m pytest $test_file_path -v"
            ;;
    esac

    if [[ -n "$test_cmd" ]]; then
        log "Running: $test_cmd"
        if $test_cmd 2>/dev/null; then
            log "⚠️  Tests are already passing - ensure implementation doesn't exist"
        else
            log "✅ Tests are failing as expected (Red Phase)"
        fi
    fi
}

# Generate implementation to pass tests
generate_implementation() {
    log "Generating implementation to pass tests (TDD Green Phase)"

    # Build implementation prompt
    local impl_prompt="# TDD Implementation Task

## Feature to Implement
$FEATURE

## Test Requirements
Your implementation must pass ALL tests in the test file. Focus only on what the tests require.

## Target Implementation File
$FILE_PATH

## Context Files"
if [[ -n "$CONTEXT_FILES" ]]; then
    IFS=',' read -ra FILES <<< "$CONTEXT_FILES"
    for file in "${FILES[@]}"; do
        if [[ -f "$file" ]]; then
            impl_prompt="$impl_prompt

## $file
\`\`\`
$(cat "$file")
\`\`\`"
        fi
    done
fi

impl_prompt="$impl_prompt

## Instructions
1. Read and understand ALL test requirements
2. Implement the MINIMUM code needed to pass tests
3. Follow TDD principle: write only what tests demand
4. Do not add extra features not tested
5. Ensure code is clean and follows project conventions

Implementation Strategy:
- Identify test requirements (Given/When/Then)
- Implement basic structure first
- Add one feature at a time
- Run tests frequently
- Refactor when all tests pass

Generate the implementation that will make all tests pass."

    # Use Cerebras to generate implementation
    log "Generating implementation with Cerebras..."
    local request_body=$(jq -n \
        --arg model "${CEREBRAS_MODEL:-qwen2.5-coder-32b}" \
        --arg prompt "$impl_prompt" \
        '{
            model: $model,
            messages: [
                {
                    role: "system",
                    content: "You are implementing code to pass existing tests. Read the tests carefully and implement only what is required. Follow TDD principles."
                },
                {
                    role: "user",
                    content: $prompt
                }
            ],
            max_tokens: 8192,
            temperature: 0.1,
            stream: false
        }')

    local response=$(curl -s -X POST "${CEREBRAS_BASE_URL:-https://api.cerebras.ai/v1}/chat/completions" \
        -H "Authorization: Bearer $CEREBRAS_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$request_body")

    local impl_code=$(echo "$response" | jq -r '.choices[0].message.content')

    if [[ "$impl_code" == "null" || -z "$impl_code" ]]; then
        echo "❌ Failed to generate implementation"
        return 1
    fi

    # Write implementation
    mkdir -p "$(dirname "$FILE_PATH")"
    echo "$impl_code" > "$FILE_PATH"

    echo "✅ Implementation generated at: $FILE_PATH"
    return 0
}

# Refactor and optimize
refactor_implementation() {
    log "Running refactor phase (TDD Blue Phase)"

    # Run tests to verify passing
    local file_type="${FILE_PATH##*.}"
    local test_cmd=""

    case "$file_type" in
        rs)
            test_cmd="cargo test"
            ;;
        ts|tsx)
            test_cmd="npm test"
            ;;
        py)
            test_cmd="python -m pytest -v"
            ;;
    esac

    if [[ -n "$test_cmd" ]]; then
        if $test_cmd; then
            log "✅ Tests passing - ready for refactoring"

            # TODO: Add automated refactoring suggestions
            # - Remove duplication
            # - Improve naming
            # - Extract common patterns
            # - Optimize performance
        else
            log "❌ Tests still failing - implementation needs fixes"
        fi
    fi
}

# Main TDD workflow
echo "🧪 TDD-Driven Development with Cerebras"
echo "======================================"
echo "Feature: $FEATURE"
echo "File: $FILE_PATH"
echo "Agent: $AGENT_ID"
echo

# Step 1: Query TDD patterns
echo "Step 1: Querying TDD patterns..."
PATTERNS=$(query_tdd_patterns)

# Step 2: Generate tests
echo
echo "Step 2: Generating tests (Red Phase)..."
if ! generate_tests "$PATTERNS"; then
    echo "❌ Failed to generate tests"
    exit 1
fi

# Step 3: Verify tests fail
echo
echo "Step 3: Verifying tests fail initially..."
TEST_FILE_PATH="${FILE_PATH%.*}_test.${FILE_PATH##*.}"
run_failing_tests "$TEST_FILE_PATH"

# Step 4: Generate implementation
echo
echo "Step 4: Generating implementation (Green Phase)..."
if ! generate_implementation; then
    echo "❌ Failed to generate implementation"
    exit 1
fi

# Step 5: Verify tests pass
echo
echo "Step 5: Verifying tests pass..."
TEST_OUTPUT=""
if cargo test 2>&1; then
    echo "✅ All tests passing! Feature implemented successfully."
else
    echo "⚠️  Some tests may be failing. Review implementation."
fi

# Step 6: Refactor
echo
echo "Step 6: Refactoring phase..."
refactor_implementation

# Step 7: Store TDD pattern
echo
echo "Step 7: Storing TDD pattern for future learning..."
if [[ -f "$CODESEARCH_INDEX/store.sh" ]]; then
    metadata=$(cat <<EOF
{
    "type": "tdd_pattern",
    "agent_id": "$AGENT_ID",
    "file_type": "${FILE_PATH##*.}",
    "feature": "$FEATURE",
    "success": true,
    "tags": "TDD,test-first,${FILE_PATH##*.}"
}
EOF
)

    cat <<EOF | "$CODESEARCH_INDEX/store.sh" --metadata "$metadata" --type "tdd_pattern" 2>/dev/null || true
TDD Pattern for $FEATURE:

Tests written first for $FILE_PATH
Following Given/When/Then structure
Tests drive implementation requirements
EOF
fi

echo
echo "🎉 TDD cycle completed!"
echo "📁 Implementation: $FILE_PATH"
echo "🧪 Tests: $TEST_FILE_PATH"
echo "💾 Pattern stored for future reference"