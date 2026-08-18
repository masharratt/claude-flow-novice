#!/usr/bin/env bash
set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Test runner for generated code with multiple validation strategies
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_TIMEOUT="${DEFAULT_TEST_TIMEOUT:-60}"
VERBOSE="false"

# Parse arguments
FILE_PATH=""
TEST_COMMAND=""
TEST_TYPE="auto"
LANG=""
FRAMEWORK=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --file-path) FILE_PATH="$2"; shift 2 ;;
        --test-command) TEST_COMMAND="$2"; shift 2 ;;
        --test-type) TEST_TYPE="$2"; shift 2 ;;
        --lang) LANG="$2"; shift 2 ;;
        --framework) FRAMEWORK="$2"; shift 2 ;;
        --timeout) TEST_TIMEOUT="$2"; shift 2 ;;
        --verbose) VERBOSE="true"; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Logging function
log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[$(date '+%H:%M:%S')] $*"
    fi
}

# Detect language and framework if not specified
detect_language() {
    if [[ -z "$LANG" && -n "$FILE_PATH" ]]; then
        case "${FILE_PATH##*.}" in
            rs) LANG="rust" ;;
            ts|tsx) LANG="typescript" ;;
            js|jsx) LANG="javascript" ;;
            py) LANG="python" ;;
            go) LANG="go" ;;
            java) LANG="java" ;;
            cpp|cc|cxx) LANG="cpp" ;;
            c) LANG="c" ;;
            *) LANG="unknown" ;;
        esac
    fi
}

# Auto-detect test command if not provided
auto_detect_test() {
    if [[ -n "$TEST_COMMAND" ]]; then
        echo "$TEST_COMMAND"
        return 0
    fi

    detect_language

    case "$LANG" in
        rust)
            # Check for Cargo.toml
            if [[ -f "Cargo.toml" ]]; then
                # Try to find specific test for the file
                local file_name="${FILE_PATH##*/}"
                local file_stem="${file_name%.*}"

                # Look for test file
                if [[ -f "tests/${file_stem}_test.rs" ]]; then
                    echo "cargo test ${file_stem}_test"
                elif [[ -f "tests/${file_stem}.rs" ]]; then
                    echo "cargo test $(basename tests/${file_stem}.rs .rs)"
                else
                    echo "cargo test"
                fi
            else
                echo "rustc --test $FILE_PATH"
            fi
            ;;

        typescript|javascript)
            # Check for package.json
            if [[ -f "package.json" ]]; then
                # Look for test scripts
                if jq -e '.scripts.test' package.json >/dev/null 2>&1; then
                    # Try to run specific test if we can infer it
                    local file_name="${FILE_PATH##*/}"
                    if [[ -f "package.json" ]]; then
                        # Look for test file patterns
                        if [[ -f "tests/${file_name}" ]] || [[ -f "test/${file_name}" ]]; then
                            echo "npm test -- ${file_name}"
                        else
                            echo "npm test"
                        fi
                    else
                        echo "npm test"
                    fi
                else
                    echo "echo 'No test script found in package.json'"
                fi
            else
                echo "echo 'No package.json found for JavaScript/TypeScript project'"
            fi
            ;;

        python)
            # Look for pytest or unittest
            local file_name="${FILE_PATH##*/}"
            local file_stem="${file_name%.*}"

            if [[ -f "requirements.txt" ]] && grep -q "pytest" requirements.txt; then
                # Look for test file
                if [[ -f "tests/test_${file_stem}.py" ]]; then
                    echo "pytest tests/test_${file_stem}.py -v"
                elif [[ -f "test_${file_stem}.py" ]]; then
                    echo "pytest test_${file_stem}.py -v"
                else
                    echo "pytest -v"
                fi
            else
                # Use unittest
                if [[ -f "tests/test_${file_stem}.py" ]]; then
                    echo "python -m unittest tests.test_${file_stem}"
                elif [[ -f "test_${file_stem}.py" ]]; then
                    echo "python -m unittest test_${file_stem}"
                else
                    echo "python -m unittest discover -s tests -p 'test_*.py'"
                fi
            fi
            ;;

        go)
            # Use go test
            local dir_path=$(dirname "$FILE_PATH")
            if [[ -f "${dir_path}/$(basename ${dir_path})_test.go" ]]; then
                echo "go test ${dir_path}"
            else
                echo "go test ./..."
            fi
            ;;

        java)
            # Look for Maven or Gradle
            if [[ -f "pom.xml" ]]; then
                echo "mvn test"
            elif [[ -f "build.gradle" ]]; then
                echo "./gradlew test"
            else
                echo "javac $FILE_PATH && java ${FILE_PATH##*/}"
            fi
            ;;

        *)
            echo "echo 'Unknown language for testing: $LANG'"
            ;;
    esac
}

# Run tests with comprehensive reporting
run_tests() {
    local test_cmd="$1"
    local test_start=$(date +%s%3N)

    log "Running tests: $test_cmd"
    log "Timeout: ${TEST_TIMEOUT}s"

    # Create temporary file for test output
    local test_output_file=$(mktemp)
    local exit_code=0

    # Run tests with timeout
    if timeout "$TEST_TIMEOUT" bash -c "$test_cmd" >"$test_output_file" 2>&1; then
        exit_code=0
    else
        exit_code=$?
    fi

    local test_end=$(date +%s%3N)
    local duration=$((test_end - test_start))

    # Read test output
    local test_output=$(cat "$test_output_file")
    rm -f "$test_output_file"

    # Parse results
    local passed=0
    local failed=0
    local skipped=0
    local errors=0

    case "$LANG" in
        rust)
            # Parse Cargo test output
            passed=$(echo "$test_output" | grep -o 'test result: [^[:space:]]*' | grep -o '[0-9]* passed' | grep -o '[0-9]*' || echo 0)
            failed=$(echo "$test_output" | grep -o 'test result: [^[:space:]]*' | grep -o '[0-9]* failed' | grep -o '[0-9]*' || echo 0)
            ;;

        typescript|javascript)
            # Parse Jest output
            passed=$(echo "$test_output" | grep -E 'Tests:[[:space:]]*[0-9]+ passed' | grep -o '[0-9][0-9]* passed' | grep -o '[0-9]*' || echo 0)
            failed=$(echo "$test_output" | grep -E 'Tests:[[:space:]]*[0-9]+ failed' | grep -o '[0-9][0-9]* failed' | grep -o '[0-9]*' || echo 0)
            ;;

        python)
            # Parse pytest output
            passed=$(echo "$test_output" | grep -E '[0-9]+ passed' | grep -o '[0-9]* passed' | grep -o '[0-9]*' || echo 0)
            failed=$(echo "$test_output" | grep -E '[0-9]+ failed' | grep -o '[0-9]* failed' | grep -o '[0-9]*' || echo 0)
            ;;
    esac

    # Build result JSON
    local success=false
    if [[ $exit_code -eq 0 ]]; then
        success=true
    fi

    local result=$(cat <<EOF
{
    "success": $success,
    "exit_code": $exit_code,
    "duration_ms": $duration,
    "tests": {
        "passed": $passed,
        "failed": $failed,
        "skipped": $skipped,
        "errors": $errors,
        "total": $((passed + failed + skipped + errors))
    },
    "command": "$test_cmd",
    "output": $(echo "$test_output" | jq -Rs .)
}
EOF
)

    echo "$result"

    # Return appropriate exit code
    return $exit_code
}

# Additional validation (linting, formatting, etc.)
run_validation() {
    detect_language
    local validation_results=""

    case "$LANG" in
        rust)
            # Run cargo check
            if command -v cargo >/dev/null 2>&1 && [[ -f "Cargo.toml" ]]; then
                log "Running cargo check..."
                if cargo check --quiet 2>/dev/null; then
                    validation_results="${validation_results}✅ cargo check passed\n"
                else
                    validation_results="${validation_results}❌ cargo check failed\n"
                fi
            fi

            # Run clippy
            if command -v cargo-clippy >/dev/null 2>&1; then
                log "Running cargo clippy..."
                if cargo clippy --quiet -- -D warnings 2>/dev/null; then
                    validation_results="${validation_results}✅ cargo clippy passed\n"
                else
                    validation_results="${validation_results}⚠️  cargo clippy warnings\n"
                fi
            fi
            ;;

        typescript)
            # Run TypeScript compiler
            if command -v tsc >/dev/null 2>&1 && [[ -f "tsconfig.json" ]]; then
                log "Running TypeScript compiler..."
                if tsc --noEmit 2>/dev/null; then
                    validation_results="${validation_results}✅ TypeScript compilation passed\n"
                else
                    validation_results="${validation_results}❌ TypeScript compilation failed\n"
                fi
            fi
            ;;

        python)
            # Run flake8 or pylint
            if command -v flake8 >/dev/null 2>&1; then
                log "Running flake8..."
                if flake8 "$FILE_PATH" 2>/dev/null; then
                    validation_results="${validation_results}✅ flake8 passed\n"
                else
                    validation_results="${validation_results}⚠️  flake8 issues found\n"
                fi
            fi
            ;;
    esac

    if [[ -n "$validation_results" ]]; then
        echo -e "\n📋 Additional Validation:\n$validation_results"
    fi
}

# Main execution
log "Starting test runner for: $FILE_PATH"

# Detect test command
if [[ "$TEST_TYPE" == "auto" ]]; then
    TEST_COMMAND=$(auto_detect_test)
    log "Auto-detected test command: $TEST_COMMAND"
fi

if [[ -z "$TEST_COMMAND" || "$TEST_COMMAND" == echo* ]]; then
    echo "❌ No valid test command found"
    echo "💡 Specify --test-command or ensure your project has proper test setup"
    exit 1
fi

# Run tests
test_result=$(run_tests "$TEST_COMMAND")

# Run additional validation
run_validation

# Print summary
echo "$test_result" | jq -r '
if .success then
    "✅ Tests Passed!"
else
    "❌ Tests Failed!"
end,
"📊 Summary: \(.tests.passed) passed, \(.tests.failed) failed, \(.tests.total) total",
"⏱️  Duration: \(.duration_ms)ms",
"🔧 Command: \(.command)"'

# Exit with test result code
success=$(echo "$test_result" | jq -r '.success')
[[ "$success" == "true" ]] && exit 0 || exit 1