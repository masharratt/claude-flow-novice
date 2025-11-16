---
name: bash-fundamentals
category: foundation
team: foundation
approval_level: auto
approval_criteria:
  max_commands: 3
  test_coverage: 0.95
  no_external_calls: true
tags: [bash, scripting, foundation]
version: 1.0.0
owner: cfn-core
---

# Bash Fundamentals - Bootstrap Skill

## Overview
Core bash scripting patterns including variables, functions, process management, control flow, and best practices. Foundation for all bash-based automation.

## Variable Handling

### Variable Declaration and Assignment
```bash
#!/bin/bash

# Simple assignment
NAME="value"

# Command substitution
CURRENT_DATE=$(date +%Y-%m-%d)
FILE_COUNT=$(ls -1 | wc -l)

# Arithmetic
COUNT=0
((COUNT++))
COUNT=$((COUNT + 1))

# Read-only variables
readonly CONFIG_DIR="/etc/myapp"
readonly VERSION="1.0.0"

# Array assignment
ITEMS=("item1" "item2" "item3")
declare -a ARRAY=("a" "b" "c")

# Associative array (hash map)
declare -A CONFIG=(
    ["host"]="localhost"
    ["port"]="3000"
    ["timeout"]="30"
)
```

### Variable Expansion
```bash
# Basic expansion
echo "$VAR"

# Default value if unset
echo "${VAR:-default}"

# Default value and assign if unset
echo "${VAR:=default}"

# Use alternative value if set
echo "${VAR:+alternative}"

# Error if unset
echo "${VAR:?Variable is required}"

# String length
echo "${#VAR}"

# Substring
STR="hello world"
echo "${STR:0:5}"  # "hello"
echo "${STR:6}"    # "world"

# Pattern matching
FILE="document.txt"
echo "${FILE%.txt}"     # "document" (remove suffix)
echo "${FILE#*.}"       # "txt" (remove prefix)
echo "${FILE/doc/DOC}"  # "DOCument.txt" (substitute)
```

### Array Operations
```bash
# Array basics
FRUITS=("apple" "banana" "cherry")

# Access elements
echo "${FRUITS[0]}"      # First element
echo "${FRUITS[@]}"      # All elements
echo "${#FRUITS[@]}"     # Array length

# Iterate over array
for fruit in "${FRUITS[@]}"; do
    echo "Fruit: $fruit"
done

# Add elements
FRUITS+=("date")

# Slice array
echo "${FRUITS[@]:1:2}"  # Elements 1-2

# Associative array operations
declare -A USER=(
    ["name"]="John"
    ["age"]="30"
    ["role"]="admin"
)

# Access
echo "${USER[name]}"

# Iterate
for key in "${!USER[@]}"; do
    echo "$key: ${USER[$key]}"
done
```

### Environment Variables
```bash
# Export for child processes
export DATABASE_URL="sqlite:///data/app.db"

# Read from environment with default
PORT="${PORT:-3000}"

# Unset variable
unset OLD_VAR

# Check if variable is set
if [[ -n "${API_KEY:-}" ]]; then
    echo "API key is configured"
fi
```

## Function Definitions

### Basic Function Pattern
```bash
# Function definition
greet() {
    local name="$1"
    echo "Hello, $name!"
}

# Function call
greet "World"

# Function with return value
add() {
    local a="$1"
    local b="$2"
    echo $((a + b))
}

RESULT=$(add 5 3)
echo "Result: $RESULT"
```

### Function with Error Handling
```bash
safe_divide() {
    local numerator="$1"
    local denominator="$2"

    if [[ "$denominator" -eq 0 ]]; then
        echo "ERROR: Division by zero" >&2
        return 1
    fi

    echo $((numerator / denominator))
    return 0
}

# Usage
if RESULT=$(safe_divide 10 2); then
    echo "Result: $RESULT"
else
    echo "Division failed"
fi
```

### Function with Multiple Return Values
```bash
get_user_info() {
    local user_id="$1"

    # Return multiple values via stdout
    echo "John Doe"
    echo "john@example.com"
    echo "30"
}

# Capture multiple return values
{
    read -r NAME
    read -r EMAIL
    read -r AGE
} < <(get_user_info "123")

echo "Name: $NAME, Email: $EMAIL, Age: $AGE"
```

### Function with Named Parameters
```bash
process_file() {
    local input_file=""
    local output_file=""
    local verbose=false

    # Parse named parameters
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --input)
                input_file="$2"
                shift 2
                ;;
            --output)
                output_file="$2"
                shift 2
                ;;
            --verbose)
                verbose=true
                shift
                ;;
            *)
                echo "Unknown parameter: $1" >&2
                return 1
                ;;
        esac
    done

    # Validate required parameters
    if [[ -z "$input_file" ]]; then
        echo "ERROR: --input is required" >&2
        return 1
    fi

    # Process file
    [[ "$verbose" == true ]] && echo "Processing $input_file..."
}

# Usage
process_file --input "data.txt" --output "result.txt" --verbose
```

## Process Management

### Background Processes
```bash
# Run command in background
long_running_task &
PID=$!

echo "Started process: $PID"

# Wait for background process
wait $PID
EXIT_CODE=$?

echo "Process completed with exit code: $EXIT_CODE"
```

### Process Groups
```bash
#!/bin/bash
set -euo pipefail

# Create new process group
set -m

# Start multiple background processes
worker1 &
WORKER1_PID=$!

worker2 &
WORKER2_PID=$!

# Wait for all background jobs
wait

# Kill entire process group on exit
cleanup() {
    echo "Killing process group..."
    kill 0  # Kill all processes in current group
}

trap cleanup EXIT
```

### Process Substitution
```bash
# Compare output of two commands
diff <(ls dir1) <(ls dir2)

# Read from process output
while read -r line; do
    echo "Line: $line"
done < <(grep "pattern" file.txt)

# Multiple process substitutions
paste <(cut -f1 file1.txt) <(cut -f2 file2.txt)
```

### Parallel Execution
```bash
# Run multiple commands in parallel
parallel_process() {
    local -a pids=()

    for item in "${ITEMS[@]}"; do
        process_item "$item" &
        pids+=($!)
    done

    # Wait for all to complete
    local failed=0
    for pid in "${pids[@]}"; do
        if ! wait "$pid"; then
            ((failed++))
        fi
    done

    return $failed
}

# Usage
ITEMS=("task1" "task2" "task3")
if parallel_process; then
    echo "All tasks completed successfully"
else
    echo "Some tasks failed"
fi
```

### Timeout Management
```bash
# Run command with timeout
run_with_timeout() {
    local timeout="$1"
    shift
    local command=("$@")

    timeout "$timeout" "${command[@]}" || {
        local exit_code=$?
        if [[ $exit_code -eq 124 ]]; then
            echo "ERROR: Command timed out after ${timeout}s" >&2
        fi
        return $exit_code
    }
}

# Usage
run_with_timeout 10 curl -f https://api.example.com/data
```

## Control Flow

### Conditional Statements
```bash
# If-else
if [[ -f "$FILE" ]]; then
    echo "File exists"
elif [[ -d "$FILE" ]]; then
    echo "Directory exists"
else
    echo "Does not exist"
fi

# Test conditions
# File tests
[[ -f file ]]      # Regular file
[[ -d dir ]]       # Directory
[[ -e path ]]      # Exists
[[ -r file ]]      # Readable
[[ -w file ]]      # Writable
[[ -x file ]]      # Executable
[[ -s file ]]      # Not empty

# String tests
[[ -z "$str" ]]    # Empty
[[ -n "$str" ]]    # Not empty
[[ "$a" == "$b" ]] # Equal
[[ "$a" != "$b" ]] # Not equal
[[ "$a" < "$b" ]]  # Less than (lexicographic)

# Numeric tests
[[ "$a" -eq "$b" ]] # Equal
[[ "$a" -ne "$b" ]] # Not equal
[[ "$a" -lt "$b" ]] # Less than
[[ "$a" -le "$b" ]] # Less than or equal
[[ "$a" -gt "$b" ]] # Greater than
[[ "$a" -ge "$b" ]] # Greater than or equal

# Logical operators
[[ -f "$file" && -r "$file" ]]  # AND
[[ -f "$file" || -d "$file" ]]  # OR
[[ ! -f "$file" ]]              # NOT
```

### Case Statements
```bash
case "$OPERATION" in
    start)
        echo "Starting service..."
        start_service
        ;;
    stop)
        echo "Stopping service..."
        stop_service
        ;;
    restart)
        echo "Restarting service..."
        stop_service
        start_service
        ;;
    status)
        check_status
        ;;
    *)
        echo "Unknown operation: $OPERATION" >&2
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
```

### Loops
```bash
# For loop
for i in {1..10}; do
    echo "Iteration: $i"
done

# For loop over array
for item in "${ITEMS[@]}"; do
    process "$item"
done

# For loop over files
for file in *.txt; do
    [[ -f "$file" ]] || continue  # Skip if not a file
    process_file "$file"
done

# While loop
COUNT=0
while [[ $COUNT -lt 10 ]]; do
    echo "Count: $COUNT"
    ((COUNT++))
done

# While reading file
while IFS=',' read -r col1 col2 col3; do
    echo "Columns: $col1, $col2, $col3"
done < data.csv

# Until loop
ATTEMPTS=0
until check_service_ready; do
    ((ATTEMPTS++))
    if [[ $ATTEMPTS -ge 30 ]]; then
        echo "Service failed to start"
        exit 1
    fi
    sleep 1
done

# Break and continue
for i in {1..100}; do
    [[ $i -eq 50 ]] && break        # Exit loop
    [[ $((i % 2)) -eq 0 ]] && continue  # Skip even numbers
    echo "Odd number: $i"
done
```

## Input/Output

### Reading Input
```bash
# Read single line
read -r LINE
echo "You entered: $LINE"

# Read with prompt
read -rp "Enter your name: " NAME

# Read with timeout
if read -rt 5 -p "Enter value (5s timeout): " VALUE; then
    echo "You entered: $VALUE"
else
    echo "Timeout or error"
fi

# Read password (silent)
read -rsp "Enter password: " PASSWORD
echo  # New line after password

# Read multiple values
read -r FIRST LAST <<< "John Doe"
echo "First: $FIRST, Last: $LAST"
```

### Output Redirection
```bash
# Redirect stdout
echo "Log message" > output.log

# Append stdout
echo "Another message" >> output.log

# Redirect stderr
command 2> error.log

# Redirect both stdout and stderr
command &> combined.log
command > combined.log 2>&1

# Redirect to null (discard)
command &> /dev/null

# Here document
cat <<EOF > config.txt
host=localhost
port=3000
timeout=30
EOF

# Here string
grep "pattern" <<< "$VARIABLE"
```

## String Operations

### String Manipulation
```bash
# Concatenation
FULL_NAME="$FIRST_NAME $LAST_NAME"

# Uppercase/lowercase
UPPER="${VAR^^}"
LOWER="${VAR,,}"

# Trim whitespace
trim() {
    local var="$1"
    var="${var#"${var%%[![:space:]]*}"}"  # Remove leading whitespace
    var="${var%"${var##*[![:space:]]}"}"  # Remove trailing whitespace
    echo "$var"
}

# Split string
IFS=',' read -ra PARTS <<< "$CSV_STRING"

# Join array
IFS=',' eval 'JOINED="${ARRAY[*]}"'

# String replacement
NEW_STRING="${OLD_STRING/pattern/replacement}"  # First occurrence
NEW_STRING="${OLD_STRING//pattern/replacement}" # All occurrences
```

### Pattern Matching
```bash
# Wildcard matching
if [[ "$FILENAME" == *.txt ]]; then
    echo "Text file"
fi

# Regex matching
if [[ "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    echo "Valid email"
fi

# Extract regex groups
if [[ "$VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    MAJOR="${BASH_REMATCH[1]}"
    MINOR="${BASH_REMATCH[2]}"
    PATCH="${BASH_REMATCH[3]}"
fi
```

## Test Result Parsing

### Parse Test Output
```bash
parse_test_results() {
    local test_output="$1"
    local total=0
    local passed=0
    local failed=0

    # Parse common test format
    while IFS= read -r line; do
        if [[ "$line" =~ PASS ]]; then
            ((passed++))
            ((total++))
        elif [[ "$line" =~ FAIL ]]; then
            ((failed++))
            ((total++))
        fi
    done <<< "$test_output"

    echo "Total: $total, Passed: $passed, Failed: $failed"

    if [[ $failed -gt 0 ]]; then
        return 1
    fi

    return 0
}

# Usage
TEST_OUTPUT=$(run_tests 2>&1)
if parse_test_results "$TEST_OUTPUT"; then
    echo "All tests passed"
else
    echo "Some tests failed"
    exit 1
fi
```

### TAP (Test Anything Protocol) Parsing
```bash
parse_tap() {
    local tap_output="$1"
    local test_count=0
    local expected_count=0

    while IFS= read -r line; do
        if [[ "$line" =~ ^1\.\.([0-9]+) ]]; then
            expected_count="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^ok ]]; then
            ((test_count++))
        elif [[ "$line" =~ ^not\ ok ]]; then
            ((test_count++))
            echo "FAIL: $line" >&2
        fi
    done <<< "$tap_output"

    if [[ $test_count -ne $expected_count ]]; then
        echo "ERROR: Expected $expected_count tests, ran $test_count" >&2
        return 1
    fi
}
```

### JUnit XML Parsing
```bash
parse_junit_xml() {
    local junit_file="$1"

    # Extract test statistics using grep and basic parsing
    local tests=$(grep -oP 'tests="\K[0-9]+' "$junit_file" | head -1)
    local failures=$(grep -oP 'failures="\K[0-9]+' "$junit_file" | head -1)
    local errors=$(grep -oP 'errors="\K[0-9]+' "$junit_file" | head -1)

    echo "Tests: ${tests:-0}, Failures: ${failures:-0}, Errors: ${errors:-0}"

    if [[ ${failures:-0} -gt 0 || ${errors:-0} -gt 0 ]]; then
        return 1
    fi
}
```

## Best Practices

### Shebang and Options
```bash
#!/usr/bin/env bash
# Use env for portability

# Enable strict mode
set -euo pipefail

# Optional: debug mode
# set -x
```

### Script Template
```bash
#!/usr/bin/env bash
set -euo pipefail

# Script metadata
readonly SCRIPT_NAME=$(basename "$0")
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPT_VERSION="1.0.0"

# Configuration
readonly DEFAULT_TIMEOUT=30
readonly MAX_RETRIES=3

# Usage function
usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS] <command>

Options:
    -h, --help          Show this help message
    -v, --verbose       Enable verbose output
    --timeout SECONDS   Set timeout (default: $DEFAULT_TIMEOUT)

Commands:
    start               Start the service
    stop                Stop the service
    status              Check service status

EOF
    exit 0
}

# Cleanup function
cleanup() {
    local exit_code=$?
    # Cleanup operations
    exit $exit_code
}

trap cleanup EXIT

# Main function
main() {
    local verbose=false
    local timeout=$DEFAULT_TIMEOUT

    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                usage
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            --timeout)
                timeout="$2"
                shift 2
                ;;
            *)
                break
                ;;
        esac
    done

    # Validate arguments
    if [[ $# -eq 0 ]]; then
        echo "ERROR: Command required" >&2
        usage
    fi

    local command="$1"

    # Execute command
    case "$command" in
        start|stop|status)
            "${command}_service"
            ;;
        *)
            echo "ERROR: Unknown command: $command" >&2
            usage
            ;;
    esac
}

# Execute main
main "$@"
```

## Success Criteria

- ✅ Variables properly quoted and expanded
- ✅ Functions with local variables
- ✅ Error handling in all functions
- ✅ Process management with cleanup
- ✅ Proper use of arrays and associative arrays
- ✅ Control flow with appropriate tests
- ✅ Input validation and sanitization
- ✅ Test result parsing patterns included
- ✅ Script template with best practices
- ✅ Comprehensive examples for all patterns
