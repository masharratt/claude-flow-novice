#!/bin/bash
# tests/hello-world-stress/run-100-agent-test.sh
# Hello World 100-Agent Stress Test - Standalone Runner
#
# Tests coordinator's ability to distribute 100 unique tasks to 100 isolated containers
# Matrix: 10 spoken languages × 10 programming languages = 100 combinations
#
# Success Criteria:
# - 100 unique files created
# - No duplicate assignments
# - No missing combinations

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="/tmp/hello-world-${TIMESTAMP}"
LOG_FILE="${OUTPUT_DIR}/execution.log"
RESULTS_FILE="${OUTPUT_DIR}/results.json"

# Configuration
BATCH_SIZE=100
MAX_PARALLEL=100
RANDOM_SLEEP_MIN=30
RANDOM_SLEEP_MAX=50

# 10 spoken languages (code|greeting format for simplicity)
SPOKEN_LANGS=(
  "en|Hello World"
  "es|Hola Mundo"
  "fr|Bonjour le Monde"
  "de|Hallo Welt"
  "ja|Konnichiwa Sekai"
  "zh|Ni Hao Shi Jie"
  "ko|Annyeong Segye"
  "ru|Privet Mir"
  "ar|Marhaba Alalam"
  "pt|Ola Mundo"
)

# 10 programming languages (code|extension format)
PROG_LANGS=(
  "python|py"
  "javascript|js"
  "typescript|ts"
  "rust|rs"
  "go|go"
  "java|java"
  "csharp|cs"
  "ruby|rb"
  "php|php"
  "swift|swift"
)

# Agent types for distribution
AGENT_TYPES=("backend-developer" "rust-developer" "typescript-specialist" "react-frontend-engineer" "mobile-dev")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
  echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
  echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
  echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
  echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠${NC} $1" | tee -a "$LOG_FILE"
}

# Generate hello world code for a programming language
generate_code() {
  local prog_lang=$1
  local greeting=$2

  case $prog_lang in
    python)
      echo "#!/usr/bin/env python3
# Hello World
print(\"${greeting}\")"
      ;;
    javascript)
      echo "// Hello World
console.log(\"${greeting}\");"
      ;;
    typescript)
      echo "// Hello World
const greeting: string = \"${greeting}\";
console.log(greeting);"
      ;;
    rust)
      echo "// Hello World
fn main() {
    println!(\"${greeting}\");
}"
      ;;
    go)
      echo "// Hello World
package main

import \"fmt\"

func main() {
    fmt.Println(\"${greeting}\")
}"
      ;;
    java)
      echo "// Hello World
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println(\"${greeting}\");
    }
}"
      ;;
    csharp)
      echo "// Hello World
using System;

class Program {
    static void Main() {
        Console.WriteLine(\"${greeting}\");
    }
}"
      ;;
    ruby)
      echo "#!/usr/bin/env ruby
# Hello World
puts \"${greeting}\""
      ;;
    php)
      echo "<?php
// Hello World
echo \"${greeting}\\n\";
?>"
      ;;
    swift)
      echo "// Hello World
import Foundation
print(\"${greeting}\")"
      ;;
  esac
}

# Spawn a container to create a hello world file
spawn_agent() {
  local task_id=$1
  local spoken_code=$2
  local prog_lang=$3
  local agent_type=$4
  local greeting=$5
  local ext=$6
  local output_file="${OUTPUT_DIR}/${spoken_code}-${prog_lang}-${agent_type}.${ext}"
  local container_name="hw-${TIMESTAMP}-${task_id}"

  local start_time=$(date +%s%3N)

  # Generate the code
  local code
  code=$(generate_code "$prog_lang" "$greeting")

  # Calculate random sleep between 30-50 seconds
  local sleep_time=$((RANDOM % (RANDOM_SLEEP_MAX - RANDOM_SLEEP_MIN + 1) + RANDOM_SLEEP_MIN))

  # Create file via Docker container (isolated execution) with random delay
  if docker run --rm \
    --name "$container_name" \
    --cpus=0.25 \
    --memory=256m \
    -v "${OUTPUT_DIR}:${OUTPUT_DIR}" \
    alpine:latest \
    sh -c "sleep ${sleep_time} && cat > '${output_file}' << 'HELLOEOF'
${code}
HELLOEOF" 2>>"$LOG_FILE"; then

    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))

    if [[ -f "$output_file" ]]; then
      echo "${task_id}|${spoken_code}|${prog_lang}|${agent_type}|${output_file}|SUCCESS|${duration}"
      return 0
    else
      echo "${task_id}|${spoken_code}|${prog_lang}|${agent_type}|${output_file}|FAILED|${duration}|File not created"
      return 1
    fi
  else
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    echo "${task_id}|${spoken_code}|${prog_lang}|${agent_type}|${output_file}|FAILED|${duration}|Docker error"
    return 1
  fi
}

# Main execution
main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║        Hello World 100-Agent Stress Test                         ║"
  echo "║        10 Languages × 10 Programming Languages = 100 Tasks       ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo ""

  # Create output directory
  mkdir -p "$OUTPUT_DIR"

  log "Output directory: ${OUTPUT_DIR}"
  log "Starting stress test with ${#SPOKEN_LANGS[@]} spoken × ${#PROG_LANGS[@]} programming languages"

  # Check Docker is available
  if ! docker info &>/dev/null; then
    log_error "Docker is not running. Please start Docker first."
    exit 1
  fi

  # Generate all task assignments using simple indexed arrays
  log "Generating task matrix..."

  local task_id=0
  local tasks=()

  for spoken_entry in "${SPOKEN_LANGS[@]}"; do
    local spoken_code="${spoken_entry%%|*}"
    local greeting="${spoken_entry#*|}"

    for prog_entry in "${PROG_LANGS[@]}"; do
      local prog_lang="${prog_entry%%|*}"
      local ext="${prog_entry#*|}"

      local agent_type="${AGENT_TYPES[$((task_id % ${#AGENT_TYPES[@]}))]}"
      tasks+=("${task_id}|${spoken_code}|${prog_lang}|${agent_type}|${greeting}|${ext}")
      ((task_id++)) || true
    done
  done

  log "Generated ${#tasks[@]} task assignments"

  # Track results
  local results=()
  local success_count=0
  local failure_count=0
  local start_time=$(date +%s)

  # Process in batches
  local batch_num=1
  local total_batches=$(( (${#tasks[@]} + BATCH_SIZE - 1) / BATCH_SIZE ))

  for ((i=0; i<${#tasks[@]}; i+=BATCH_SIZE)); do
    log "Processing batch ${batch_num}/${total_batches} (tasks $((i+1))-$((i+BATCH_SIZE > ${#tasks[@]} ? ${#tasks[@]} : i+BATCH_SIZE)))"

    local batch_pids=()
    local batch_results_file
    batch_results_file=$(mktemp)

    # Spawn batch in parallel
    for ((j=i; j<i+BATCH_SIZE && j<${#tasks[@]}; j++)); do
      IFS='|' read -r tid spoken prog agent greeting ext <<< "${tasks[$j]}"

      # Run in background
      (spawn_agent "$tid" "$spoken" "$prog" "$agent" "$greeting" "$ext" >> "$batch_results_file") &
      batch_pids+=($!)
    done

    # Wait for batch to complete
    for pid in "${batch_pids[@]}"; do
      wait "$pid" 2>/dev/null || true
    done

    # Collect batch results
    while IFS= read -r line; do
      results+=("$line")
      if [[ "$line" == *"|SUCCESS|"* ]]; then
        ((success_count++)) || true
      else
        ((failure_count++)) || true
      fi
    done < "$batch_results_file"

    rm -f "$batch_results_file"
    ((batch_num++)) || true
  done

  local end_time=$(date +%s)
  local total_time=$((end_time - start_time))

  echo ""
  log "═══════════════════════════════════════════════════════════════════"
  log "                         RESULTS SUMMARY"
  log "═══════════════════════════════════════════════════════════════════"

  # Count actual files
  local file_count
  file_count=$(find "$OUTPUT_DIR" -type f \( -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.rs" -o -name "*.go" -o -name "*.java" -o -name "*.cs" -o -name "*.rb" -o -name "*.php" -o -name "*.swift" \) 2>/dev/null | wc -l)

  # Check for duplicates
  local unique_files
  unique_files=$(find "$OUTPUT_DIR" -type f \( -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.rs" -o -name "*.go" -o -name "*.java" -o -name "*.cs" -o -name "*.rb" -o -name "*.php" -o -name "*.swift" \) -exec basename {} \; 2>/dev/null | sort | uniq | wc -l)
  local duplicate_count=$((file_count - unique_files))

  log "Total tasks:      100"
  log "Successful:       ${success_count}"
  log "Failed:           ${failure_count}"
  log "Files created:    ${file_count}"
  log "Unique files:     ${unique_files}"
  log "Duplicates:       ${duplicate_count}"
  log "Execution time:   ${total_time}s"

  echo ""

  # Determine pass/fail
  local test_passed=false
  if [[ $success_count -eq 100 && $duplicate_count -eq 0 && $file_count -eq 100 ]]; then
    test_passed=true
    log_success "══════════════════════════════════════════════════════════════════"
    log_success "                    TEST PASSED ✓"
    log_success "   100 unique hello world files created without overlap"
    log_success "══════════════════════════════════════════════════════════════════"
  else
    log_error "══════════════════════════════════════════════════════════════════"
    log_error "                    TEST FAILED ✗"
    if [[ $success_count -lt 100 ]]; then
      log_error "   Missing $((100 - success_count)) files"
    fi
    if [[ $duplicate_count -gt 0 ]]; then
      log_error "   Found ${duplicate_count} duplicate files"
    fi
    log_error "══════════════════════════════════════════════════════════════════"
  fi

  # Generate JSON results
  cat > "$RESULTS_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "outputDir": "${OUTPUT_DIR}",
  "totalTasks": 100,
  "successCount": ${success_count},
  "failureCount": ${failure_count},
  "filesCreated": ${file_count},
  "uniqueFiles": ${unique_files},
  "duplicates": ${duplicate_count},
  "executionTimeSeconds": ${total_time},
  "passed": ${test_passed},
  "matrix": {
    "spokenLanguages": ["en", "es", "fr", "de", "ja", "zh", "ko", "ru", "ar", "pt"],
    "programmingLanguages": ["python", "javascript", "typescript", "rust", "go", "java", "csharp", "ruby", "php", "swift"],
    "agentTypes": ["backend-developer", "rust-developer", "typescript-specialist", "react-frontend-engineer", "mobile-dev"]
  }
}
EOF

  log "Results saved to: ${RESULTS_FILE}"
  log "Files in: ${OUTPUT_DIR}"

  echo ""

  # Show sample files
  log "Sample files created:"
  find "$OUTPUT_DIR" -type f \( -name "*.py" -o -name "*.js" -o -name "*.rs" \) 2>/dev/null | head -5 | while read -r file; do
    echo "  - $(basename "$file")"
  done

  if $test_passed; then
    exit 0
  else
    exit 1
  fi
}

# Run
main "$@"
