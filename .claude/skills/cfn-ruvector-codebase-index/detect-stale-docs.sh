#!/bin/bash
set -euo pipefail

# Detect Stale Documentation Using RuVector
#
# Analyzes .md files to detect legacy/outdated documentation by:
# 1. Extracting code references from documentation
# 2. Checking if referenced files/functions still exist
# 3. Finding documentation with no code references (orphaned)
# 4. Detecting docs mentioning deprecated patterns
#
# Usage:
#   detect-stale-docs.sh                    # Analyze all .md files
#   detect-stale-docs.sh --report           # Generate detailed report
#   detect-stale-docs.sh --cleanup          # Interactive cleanup mode

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEARCH_SCRIPT="$SCRIPT_DIR/search.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

log_stale() {
  echo -e "${MAGENTA}[STALE]${NC} $*"
}

# Find all .md files
find_all_docs() {
  find . -type f -name "*.md" \
    -not -path "*/node_modules/*" \
    -not -path "*/dist/*" \
    -not -path "*/.git/*" \
    -not -path "*/coverage/*" \
    2>/dev/null || true
}

# Extract code file references from markdown
# Looks for: src/file.ts, ./path/to/file.py, backtick code references
extract_file_references() {
  local md_file="$1"

  # Pattern 1: Explicit file paths (src/file.ts, ./path/file.py)
  grep -oE '\.?/?[a-zA-Z0-9_/-]+\.(ts|tsx|js|jsx|py|rs|go|java|sh)' "$md_file" 2>/dev/null || true

  # Pattern 2: Backtick code references (`fileName.ts`)
  grep -oE '`[a-zA-Z0-9_/-]+\.(ts|tsx|js|jsx|py|rs|go|java|sh)`' "$md_file" 2>/dev/null | tr -d '`' || true
}

# Extract function/class references from markdown
extract_code_references() {
  local md_file="$1"

  # Pattern: `functionName()`, `ClassName`, `methodName()`
  grep -oE '`[a-zA-Z_][a-zA-Z0-9_]*(\(\))?`' "$md_file" 2>/dev/null | tr -d '`()' || true
}

# Check if file exists in codebase
file_exists_check() {
  local file_ref="$1"

  # Try exact path
  if [[ -f "$file_ref" ]]; then
    echo "exists"
    return 0
  fi

  # Try without leading ./
  local clean_path="${file_ref#./}"
  if [[ -f "$clean_path" ]]; then
    echo "exists"
    return 0
  fi

  # Try searching in common directories
  for prefix in "src/" "docker/" "tests/" "scripts/" ".claude/"; do
    if [[ -f "${prefix}${clean_path}" ]]; then
      echo "exists"
      return 0
    fi
  done

  echo "missing"
  return 1
}

# Search for code reference in indexed codebase
search_code_reference() {
  local ref="$1"

  # Use semantic search to find references
  local results
  results=$("$SEARCH_SCRIPT" "$ref" --top 1 2>/dev/null || echo "[]")

  # Check if we got any results
  local count
  count=$(echo "$results" | jq -r 'length // 0')

  if [[ $count -gt 0 ]]; then
    echo "found"
  else
    echo "not-found"
  fi
}

# Get file modification time
get_file_age_days() {
  local file="$1"
  local mod_time

  # macOS vs Linux stat
  if [[ "$OSTYPE" == "darwin"* ]]; then
    mod_time=$(stat -f %m "$file")
  else
    mod_time=$(stat -c %Y "$file")
  fi

  local current_time=$(date +%s)
  local age_seconds=$((current_time - mod_time))
  local age_days=$((age_seconds / 86400))

  echo "$age_days"
}

# Analyze single markdown file
analyze_doc() {
  local md_file="$1"
  local stale_score=0
  local findings=()

  # Get file age
  local age_days
  age_days=$(get_file_age_days "$md_file")

  # Extract references
  local file_refs
  file_refs=$(extract_file_references "$md_file" | sort -u)

  local code_refs
  code_refs=$(extract_code_references "$md_file" | sort -u)

  local total_file_refs=0
  local missing_file_refs=0
  local total_code_refs=0
  local missing_code_refs=0

  # Check file references
  while IFS= read -r file_ref; do
    [[ -z "$file_ref" ]] && continue
    ((total_file_refs++))

    if [[ $(file_exists_check "$file_ref") == "missing" ]]; then
      ((missing_file_refs++))
      findings+=("Missing file: $file_ref")
    fi
  done <<< "$file_refs"

  # Check code references (sample first 10 to avoid too many API calls)
  local code_refs_sample
  code_refs_sample=$(echo "$code_refs" | head -10)

  while IFS= read -r code_ref; do
    [[ -z "$code_ref" ]] && continue
    [[ ${#code_ref} -lt 3 ]] && continue  # Skip very short refs
    ((total_code_refs++))

    if [[ $(search_code_reference "$code_ref") == "not-found" ]]; then
      ((missing_code_refs++))
      findings+=("Not found in code: $code_ref")
    fi
  done <<< "$code_refs_sample"

  # Calculate staleness score
  # Age factor: 1 point per 90 days (old docs more likely stale)
  local age_score=$((age_days / 90))
  stale_score=$((stale_score + age_score))

  # Missing references factor
  if [[ $total_file_refs -gt 0 ]]; then
    local missing_ratio=$((missing_file_refs * 100 / total_file_refs))
    stale_score=$((stale_score + missing_ratio / 10))

    if [[ $missing_ratio -gt 50 ]]; then
      findings+=("HIGH: ${missing_ratio}% of file references are missing")
    fi
  fi

  # No references at all (orphaned doc)
  if [[ $total_file_refs -eq 0 && $total_code_refs -eq 0 ]]; then
    stale_score=$((stale_score + 5))
    findings+=("No code references found (orphaned)")
  fi

  # Check for deprecated keywords
  if grep -qi "deprecated\|legacy\|old\|obsolete\|outdated" "$md_file"; then
    stale_score=$((stale_score + 3))
    findings+=("Contains deprecated/legacy keywords")
  fi

  # Output results
  echo "$md_file|$stale_score|$age_days|$total_file_refs|$missing_file_refs|$total_code_refs|$missing_code_refs|$(IFS=';'; echo "${findings[*]}")"
}

# Main analysis
main() {
  local mode="${1:-}"

  log_info "Detecting stale documentation..."
  log_info "This may take a few minutes for large codebases..."
  echo ""

  local all_docs
  all_docs=$(find_all_docs)

  local total_docs
  total_docs=$(echo "$all_docs" | wc -l)

  log_info "Found $total_docs markdown files"
  echo ""

  # Results array
  declare -a results
  local progress=0

  # Analyze each doc
  while IFS= read -r md_file; do
    [[ -z "$md_file" ]] && continue

    ((progress++))
    echo -ne "\r${BLUE}[PROGRESS]${NC} Analyzing $progress/$total_docs files..."

    local result
    result=$(analyze_doc "$md_file")
    results+=("$result")
  done <<< "$all_docs"

  echo "" # New line after progress
  echo ""

  # Sort by staleness score (descending)
  IFS=$'\n' sorted=($(sort -t'|' -k2 -nr <<<"${results[*]}"))

  # Display results
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}   Stale Documentation Report${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""

  local stale_count=0
  local potentially_stale_count=0

  for result in "${sorted[@]}"; do
    IFS='|' read -r file score age total_files missing_files total_code missing_code findings <<< "$result"

    # Skip if score is very low
    [[ $score -lt 2 ]] && continue

    # Determine status
    local status
    local status_color
    if [[ $score -ge 10 ]]; then
      status="STALE"
      status_color="$RED"
      ((stale_count++))
    elif [[ $score -ge 5 ]]; then
      status="LIKELY STALE"
      status_color="$MAGENTA"
      ((potentially_stale_count++))
    else
      status="POSSIBLY STALE"
      status_color="$YELLOW"
    fi

    echo -e "${status_color}[${status}]${NC} Score: $score | Age: ${age}d"
    echo "  File: $file"
    echo "  References: ${total_files} files (${missing_files} missing), ${total_code} code refs (${missing_code} missing)"

    if [[ -n "$findings" ]]; then
      IFS=';' read -ra finding_array <<< "$findings"
      for finding in "${finding_array[@]}"; do
        echo "  - $finding"
      done
    fi

    echo ""
  done

  # Summary
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}Stale docs:${NC} $stale_count"
  echo -e "${MAGENTA}Likely stale:${NC} $potentially_stale_count"
  echo -e "${BLUE}Total analyzed:${NC} $total_docs"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"

  # Recommendations
  echo ""
  log_info "Recommendations:"
  echo "  1. Review files with score >= 10 for archival"
  echo "  2. Update files with missing references"
  echo "  3. Mark deprecated docs with clear warnings"
  echo "  4. Consider moving legacy docs to /archive or /legacy directory"
}

main "$@"
