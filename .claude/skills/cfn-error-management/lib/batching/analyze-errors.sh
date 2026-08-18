#!/usr/bin/env bash

# CFN Error Batching Strategy - Phase 1: Analyze Errors
# Parses error output from multiple languages and tools

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
COMMAND=""
WORKSPACE=""
LANGUAGE=""
OUTPUT_FORMAT="json"
TIMEOUT=30

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --command)
      COMMAND="$2"
      shift 2
      ;;
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    --language)
      LANGUAGE="$2"
      shift 2
      ;;
    --output-format)
      OUTPUT_FORMAT="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate inputs
if [ -z "$COMMAND" ] || [ -z "$WORKSPACE" ]; then
  echo "Error: Missing required options --command and --workspace" >&2
  exit 1
fi

# Run error command with timeout
run_error_command() {
  cd "$WORKSPACE" || return 1

  # Execute with timeout, capturing both stdout and stderr
  timeout "$TIMEOUT" bash -c "$COMMAND" 2>&1 || {
    local exit_code=$?
    # Timeout (124) or other errors are expected for error-detecting tools
    if [ $exit_code -eq 124 ]; then
      echo "[ERROR] Command timeout after ${TIMEOUT}s" >&2
    fi
    # Return command output anyway if available
  }
}

# Parse TypeScript errors (tsc output)
parse_typescript() {
  local output="$1"

  # Pattern: src/file.ts(line,col): error TSxxxx: message
  jq -R -s '
    split("\n") |
    map(select(test("error TS[0-9]+"))) |
    map(
      capture("^(?<file>[^(]+)\\((?<line>[0-9]+),(?<col>[0-9]+)\\): error TS(?<code>[0-9]+): (?<message>.*)$") |
      select(.file != null) |
      {
        file: .file,
        line: (.line | tonumber),
        column: (.col | tonumber),
        code: .code,
        error: .message
      }
    )
  ' <<< "$output"
}

# Parse Python mypy errors
parse_python_mypy() {
  local output="$1"

  # Pattern: file.py:line:col: error: message
  jq -R -s '
    split("\n") |
    map(select(test("error:"))) |
    map(
      capture("^(?<file>[^:]+):(?<line>[0-9]+):(?<col>[0-9]+): error: (?<message>.*)$") |
      select(.file != null) |
      {
        file: .file,
        line: (.line | tonumber),
        column: (.col | tonumber),
        error: .message,
        code: "mypy"
      }
    )
  ' <<< "$output"
}

# Parse Python ruff errors
parse_python_ruff() {
  local output="$1"

  # Pattern: file.py:line:col: E/W/Fxxx: message
  jq -R -s '
    split("\n") |
    map(select(test("[EWF][0-9]{3}"))) |
    map(
      capture("^(?<file>[^:]+):(?<line>[0-9]+):(?<col>[0-9]+): (?<code>[EWF][0-9]{3}): (?<message>.*)$") |
      select(.file != null) |
      {
        file: .file,
        line: (.line | tonumber),
        column: (.col | tonumber),
        code: .code,
        error: .message
      }
    )
  ' <<< "$output"
}

# Parse Rust cargo errors
parse_rust() {
  local output="$1"

  # Pattern: error[Exxx]: message
  jq -R -s '
    split("\n") |
    map(select(test("^error\\["))) |
    map(
      capture("^error\\[(?<code>E[0-9]{4})\\]: (?<message>.*)") |
      select(.code != null) |
      {
        file: "unknown",
        line: 0,
        column: 0,
        code: .code,
        error: .message
      }
    )
  ' <<< "$output"
}

# Parse ESLint errors
parse_eslint() {
  local output="$1"

  # Pattern: file.js:line:col: level: message (rule)
  jq -R -s '
    split("\n") |
    map(select(test("error|warning"))) |
    map(
      capture("^(?<file>[^:]+):(?<line>[0-9]+):(?<col>[0-9]+): (?<level>error|warning): (?<message>[^(]+)") |
      select(.file != null) |
      {
        file: .file,
        line: (.line | tonumber),
        column: (.col | tonumber),
        error: .message | gsub("\\s+$"; ""),
        code: .level
      }
    )
  ' <<< "$output"
}

# Parse ShellCheck errors
parse_shell() {
  local output="$1"

  # Pattern: file:line:col: level: code: message
  jq -R -s '
    split("\n") |
    map(select(test("error|warning"))) |
    map(
      capture("^(?<file>[^:]+):(?<line>[0-9]+):(?<col>[0-9]+): (?<level>error|warning): (?<message>[^\\[]+)") |
      select(.file != null) |
      {
        file: .file,
        line: (.line | tonumber),
        column: (.col | tonumber),
        error: .message | gsub("\\s+$"; ""),
        code: .level
      }
    )
  ' <<< "$output"
}

# Generic parser (file:line:message)
parse_generic() {
  local output="$1"

  # Try to extract file:line:message pattern
  jq -R -s '
    split("\n") |
    map(select(length > 0)) |
    map(
      capture("^(?<file>[^:]+):(?<line>[0-9]+):(?<message>.*)$") |
      select(.file != null) |
      {
        file: .file,
        line: (.line | tonumber),
        column: 0,
        error: .message | gsub("^\\s+"; ""),
        code: "unknown"
      }
    )
  ' <<< "$output"
}

# Auto-detect language from command
auto_detect_language() {
  if [ -n "$LANGUAGE" ]; then
    return
  fi

  case "$COMMAND" in
    *tsc*|*typescript*)
      LANGUAGE="typescript"
      ;;
    *mypy*)
      LANGUAGE="python_mypy"
      ;;
    *ruff*)
      LANGUAGE="python_ruff"
      ;;
    *cargo*|*rustc*)
      LANGUAGE="rust"
      ;;
    *eslint*|*prettier*)
      LANGUAGE="eslint"
      ;;
    *shellcheck*)
      LANGUAGE="shell"
      ;;
    *)
      LANGUAGE="generic"
      ;;
  esac
}

# Select parser based on language
select_parser() {
  local language="${1:-generic}"

  case "$language" in
    typescript|ts)
      parse_typescript
      ;;
    python_mypy)
      parse_python_mypy
      ;;
    python_ruff|python)
      parse_python_ruff
      ;;
    rust)
      parse_rust
      ;;
    eslint|tslint)
      parse_eslint
      ;;
    shell|shellcheck)
      parse_shell
      ;;
    *)
      parse_generic
      ;;
  esac
}

# Main analysis
main() {
  auto_detect_language

  # Run error command
  local error_output
  error_output=$(run_error_command)

  # Parse errors using selected parser
  local parsed_errors
  parsed_errors=$(select_parser "$LANGUAGE" <<< "$error_output")

  # Count errors
  local total_errors
  total_errors=$(echo "$parsed_errors" | jq 'length')

  # Group by file
  local files_with_errors
  files_with_errors=$(echo "$parsed_errors" | jq 'group_by(.file) | map({(.[0].file): length}) | add // {}')

  # Get error code distribution (if available)
  local error_distribution
  error_distribution=$(echo "$parsed_errors" | \
    jq '[.[] | select(.code != null and .code != "unknown")] | group_by(.code) | map({code: .[0].code, count: length}) | from_entries')

  # Get sample errors (first 10)
  local error_samples
  error_samples=$(echo "$parsed_errors" | jq '.[0:10]')

  # Output JSON
  jq -n \
    --argjson total_errors "$total_errors" \
    --argjson files_with_errors "$files_with_errors" \
    --argjson error_distribution "$error_distribution" \
    --argjson error_samples "$error_samples" \
    --arg language "$LANGUAGE" \
    '{
      total_errors: $total_errors,
      files_with_errors: $files_with_errors,
      error_distribution: $error_distribution,
      error_samples: $error_samples,
      language: $language
    }'
}

main
