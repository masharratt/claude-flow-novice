#!/bin/bash
# CFN Dependency Ingestion - Dynamic file discovery from dependency diagram
# Parses readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt and outputs Read commands
# Usage: ./ingest-dependencies.sh [--priority P0,P1] [--type TS,SH] [--include-deprecated]

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
DIAGRAM="${PROJECT_ROOT}/readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt"

# Default parameters
PRIORITY_FILTER=""
TYPE_FILTER=""
INCLUDE_DEPRECATED=false
SKIP_VALIDATION=false

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --priority)
      PRIORITY_FILTER="$2"
      shift 2
      ;;
    --type)
      TYPE_FILTER="$2"
      shift 2
      ;;
    --include-deprecated)
      INCLUDE_DEPRECATED=true
      shift
      ;;
    --skip-validation)
      SKIP_VALIDATION=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--priority P0,P1,P2] [--type TS,SH] [--include-deprecated] [--skip-validation]" >&2
      exit 1
      ;;
  esac
done

# Validate diagram exists
if [[ ! -f "$DIAGRAM" ]]; then
  echo "ERROR: Dependency diagram not found: $DIAGRAM"
  exit 1
fi

# Extract all file paths from the diagram
# Pattern: \.claude/ or src/ or tests/ followed by path and file extension
# Exclude wildcards and generic patterns
# Uses sort -u for deduplication (Enhancement #1)
extract_all_files() {
  grep -E '\.(claude|src|tests)/[^ ]+\.(md|ts|sh|js|cjs)' "$DIAGRAM" | \
    grep -oE '\.(claude|src|tests)/[^ ,)]+\.(md|ts|sh|js|cjs)' | \
    grep -v '\*' | \
    grep -v '<' | \
    sort -u
}

# Validate file existence (Enhancement #3)
# Checks if each file exists on filesystem and reports missing files to stderr
validate_file_existence() {
  if [[ "$SKIP_VALIDATION" == true ]]; then
    cat
    return
  fi

  local missing_count=0

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    local full_path="${PROJECT_ROOT}/${file}"

    if [[ -f "$full_path" ]]; then
      echo "$file"
    else
      echo "WARNING: File not found: $file" >&2
      missing_count=$((missing_count + 1))
    fi
  done

  if [[ $missing_count -gt 0 ]]; then
    echo "WARNING: $missing_count file(s) not found (use --skip-validation to disable checks)" >&2
  fi

  return 0
}

# Filter by priority markers ([P0], [P1], [P2])
filter_by_priority() {
  if [[ -z "$PRIORITY_FILTER" ]]; then
    cat
    return
  fi

  # Convert comma-separated priorities to grep pattern
  local priority_pattern=$(echo "$PRIORITY_FILTER" | sed 's/,/\\|/g')

  # For each file, check if its line contains a priority marker
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    local filename=$(basename "$file")
    if grep -E "\[($priority_pattern)\]" "$DIAGRAM" | grep -q "$filename"; then
      echo "$file"
    fi
  done
}

# Filter by type markers ([TS], [SH])
filter_by_type() {
  if [[ -z "$TYPE_FILTER" ]]; then
    cat
    return
  fi

  # Convert comma-separated types to extension pattern
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    # Check if type matches
    local should_include=false

    # TypeScript filter (includes .ts, .js, .cjs)
    if [[ "$TYPE_FILTER" == *"TS"* ]]; then
      if [[ "$file" =~ \.ts$ || "$file" =~ \.js$ || "$file" =~ \.cjs$ ]]; then
        should_include=true
      fi
    fi

    # Shell filter (includes .sh)
    if [[ "$TYPE_FILTER" == *"SH"* ]]; then
      if [[ "$file" =~ \.sh$ ]]; then
        should_include=true
      fi
    fi

    # Include if match found
    [[ "$should_include" == true ]] && echo "$file"
  done
}

# Exclude deprecated files unless explicitly included
filter_deprecated() {
  if [[ "$INCLUDE_DEPRECATED" == true ]]; then
    cat
    return
  fi

  # Exclude files marked as DEPRECATED or in deprecated paths
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    local filename=$(basename "$file")
    # Check if file is marked DEPRECATED or in deprecated section
    if ! grep -E "\[DEPRECATED\]" "$DIAGRAM" | grep -q "$filename"; then
      # Also check if file is in deprecated helpers/ directory
      if [[ "$file" != *"/helpers/"* ]] || grep -q "\[P0\].*$filename\|\[P1\].*$filename\|\[P2\].*$filename" "$DIAGRAM"; then
        echo "$file"
      fi
    fi
  done
}

# Track already-output files for global deduplication (using temp file)
SEEN_FILES=$(mktemp)
trap "rm -f $SEEN_FILES" EXIT

# Helper function to output file if not already seen
output_file_if_new() {
  local file="$1"
  if ! grep -Fxq "$file" "$SEEN_FILES" 2>/dev/null; then
    echo "$file" >> "$SEEN_FILES"
    echo "Read: $file"
  fi
}

# Main execution
echo "# CFN Loop CLI Dependency Ingestion"
echo "# Generated from: readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt"
echo ""

# Step 1: Read the dependency diagram itself
echo "# Step 1: Read the dependency diagram"
output_file_if_new "readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt"
echo ""

# Step 2: Extract all files
ALL_FILES=$(extract_all_files)

# Step 3: Filter P0 critical path files
echo "# Step 2: Read P0 critical path files (required for 5-iteration e2e)"
P0_FILES=$(echo "$ALL_FILES" | while read -r file; do
  [[ -z "$file" ]] && continue
  filename=$(basename "$file")
  if grep -E "\[P0\]" "$DIAGRAM" | grep -q "$filename"; then
    echo "$file"
  fi
done | filter_by_type | filter_deprecated | validate_file_existence | sort -u)

if [[ -n "$P0_FILES" ]]; then
  echo "$P0_FILES" | while IFS= read -r file; do
    [[ -n "$file" ]] && output_file_if_new "$file"
  done
else
  echo "# No P0 files found matching filters"
fi
echo ""

# Step 4: Filter P1 files (post-validation)
echo "# Step 3: Read P1 files (post-validation features)"
P1_FILES=$(echo "$ALL_FILES" | while read -r file; do
  [[ -z "$file" ]] && continue
  filename=$(basename "$file")
  if grep -E "\[P1\]" "$DIAGRAM" | grep -q "$filename"; then
    echo "$file"
  fi
done | filter_by_type | filter_deprecated | validate_file_existence | sort -u)

if [[ -n "$P1_FILES" ]]; then
  echo "$P1_FILES" | while IFS= read -r file; do
    [[ -n "$file" ]] && output_file_if_new "$file"
  done
else
  echo "# No P1 files found matching filters"
fi
echo ""

# Step 5: Filter P2 files (deferred features)
if [[ -z "$PRIORITY_FILTER" ]] || [[ "$PRIORITY_FILTER" == *"P2"* ]]; then
  echo "# Step 4: Read P2 files (deferred features)"
  P2_FILES=$(echo "$ALL_FILES" | while read -r file; do
    [[ -z "$file" ]] && continue
    filename=$(basename "$file")
    if grep -E "\[P2\]" "$DIAGRAM" | grep -q "$filename"; then
      echo "$file"
    fi
  done | filter_by_type | filter_deprecated | validate_file_existence | sort -u)

  if [[ -n "$P2_FILES" ]]; then
    echo "$P2_FILES" | while IFS= read -r file; do
      [[ -n "$file" ]] && output_file_if_new "$file"
    done
  else
    echo "# No P2 files found matching filters"
  fi
  echo ""
fi

# Step 6: Extract coordination layer files (Redis/Shell)
echo "# Step 5: Read coordination layer (Redis/Shell scripts)"
COORD_FILES=$(echo "$ALL_FILES" | grep -E 'coordination-wait|report-completion|orchestrate|cfn-redis' | filter_by_type | filter_deprecated | validate_file_existence | sort -u)

if [[ -n "$COORD_FILES" ]]; then
  echo "$COORD_FILES" | while IFS= read -r file; do
    [[ -n "$file" ]] && output_file_if_new "$file"
  done
else
  echo "# No coordination files found matching filters"
fi
echo ""

# Step 7: Extract agent profile files
echo "# Step 6: Read agent profiles (coordinators and workers)"
AGENT_FILES=$(echo "$ALL_FILES" | grep -E '\.claude/agents/cfn-dev-team' | filter_by_type | filter_deprecated | validate_file_existence | sort -u)

if [[ -n "$AGENT_FILES" ]]; then
  echo "$AGENT_FILES" | while IFS= read -r file; do
    [[ -n "$file" ]] && output_file_if_new "$file"
  done
else
  echo "# No agent profile files found"
fi
echo ""

# Step 8: Extract slash commands
echo "# Step 7: Read slash commands"
COMMAND_FILES=$(echo "$ALL_FILES" | grep -E '\.claude/commands' | filter_by_type | filter_deprecated | validate_file_existence | sort -u)

if [[ -n "$COMMAND_FILES" ]]; then
  echo "$COMMAND_FILES" | while IFS= read -r file; do
    [[ -n "$file" ]] && output_file_if_new "$file"
  done
else
  echo "# No command files found"
fi
echo ""

# Summary
echo "# Ingestion complete"
echo "# Priority filter: ${PRIORITY_FILTER:-all}"
echo "# Type filter: ${TYPE_FILTER:-all}"
echo "# Include deprecated: $INCLUDE_DEPRECATED"
echo "# Total files discovered: $(echo "$ALL_FILES" | grep -c . || echo 0)"
