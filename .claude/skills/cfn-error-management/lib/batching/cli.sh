#!/usr/bin/env bash

# CFN Error Batching Strategy - Main CLI Entry Point
# Orchestrates all phases of error batching: analysis → clustering → batching → wave planning

set -eo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default configuration
COMMAND=""
WORKSPACE=""
LANGUAGE=""
STRATEGY="directory"
MEMORY_BUDGET="40g"
MAX_PARALLEL=32
TIER_CONFIG=""
OUTPUT_FILE=""
OUTPUT_FORMAT="text"
VERBOSE=false
TEMP_DIR=$(mktemp -d)

# Cleanup temp directory on exit
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Helper functions
log() {
  if [ "$VERBOSE" = true ]; then
    echo "[INFO] $*" >&2
  fi
}

error() {
  echo "[ERROR] $*" >&2
  exit 1
}

info() {
  echo "$*"
}

# Parse command line arguments
parse_args() {
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
      --strategy)
        STRATEGY="$2"
        shift 2
        ;;
      --budget)
        MEMORY_BUDGET="$2"
        shift 2
        ;;
      --max-parallel)
        MAX_PARALLEL="$2"
        shift 2
        ;;
      --tier-config)
        TIER_CONFIG="$2"
        shift 2
        ;;
      --output)
        OUTPUT_FILE="$2"
        shift 2
        ;;
      --format)
        OUTPUT_FORMAT="$2"
        shift 2
        ;;
      --verbose)
        VERBOSE=true
        shift
        ;;
      --help)
        show_help
        exit 0
        ;;
      *)
        error "Unknown option: $1"
        ;;
    esac
  done
}

show_help() {
  cat << 'EOF'
CFN Error Batching Strategy - Transform errors into strategic batches

USAGE:
  cli.sh --command "ERROR_COMMAND" --workspace PATH [OPTIONS]

REQUIRED:
  --command CMD           Error command (e.g., "npx tsc --noEmit", "python -m mypy src")
  --workspace PATH        Workspace path (e.g., "/workspace")

OPTIONS:
  --language LANG         Language hint (typescript, python, rust, eslint, shell, generic)
  --strategy STRAT        Clustering strategy (directory, ast) [default: directory]
  --budget BUDGET         Memory budget (e.g., "40g", "16g") [default: 40g]
  --max-parallel NUM      Max parallel agents [default: 32]
  --tier-config FILE      Custom tier configuration JSON file
  --output FILE           Output file path (default: stdout)
  --format FORMAT         Output format (text, json, yaml) [default: text]
  --verbose               Enable verbose logging
  --help                  Show this help message

EXAMPLES:
  # TypeScript project (defaults)
  cli.sh --command "npx tsc --noEmit" --workspace /workspace

  # Python with AST clustering
  cli.sh --command "python -m mypy src" --workspace /workspace \
         --language python --strategy ast

  # Custom configuration
  cli.sh --command "npx tsc --noEmit" --workspace /workspace \
         --budget "32g" --tier-config ./tiers.json --format json

EOF
}

# Validate inputs
validate_inputs() {
  [ -z "$COMMAND" ] && error "Missing required option: --command"
  [ -z "$WORKSPACE" ] && error "Missing required option: --workspace"
  [ ! -d "$WORKSPACE" ] && error "Workspace directory not found: $WORKSPACE"

  case "$STRATEGY" in
    directory|ast) ;;
    *) error "Invalid strategy: $STRATEGY (must be 'directory' or 'ast')" ;;
  esac

  case "$OUTPUT_FORMAT" in
    text|json|yaml) ;;
    *) error "Invalid format: $OUTPUT_FORMAT (must be 'text', 'json', or 'yaml')" ;;
  esac

  if [ -n "$TIER_CONFIG" ] && [ ! -f "$TIER_CONFIG" ]; then
    error "Tier config file not found: $TIER_CONFIG"
  fi
}

# Auto-detect language from command
detect_language() {
  if [ -n "$LANGUAGE" ]; then
    return
  fi

  case "$COMMAND" in
    *tsc*|*typescript*)
      LANGUAGE="typescript"
      ;;
    *mypy*|*python*)
      LANGUAGE="python"
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

  log "Auto-detected language: $LANGUAGE"
}

# Phase 1: Analyze errors
phase_analyze() {
  info ""
  info "Phase 1: Analyzing errors..."

  # Source analyze-errors module
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/analyze-errors.sh"

  local errors_json
  errors_json=$("$SCRIPT_DIR/analyze-errors.sh" \
    --command "$COMMAND" \
    --workspace "$WORKSPACE" \
    --language "$LANGUAGE" \
    --output-format json \
    2>/dev/null)

  echo "$errors_json" > "$TEMP_DIR/errors.json"

  local total_errors
  local file_count
  total_errors=$(echo "$errors_json" | jq '.total_errors // 0')
  file_count=$(echo "$errors_json" | jq '.files_with_errors | length')

  info "  ✓ Found $total_errors errors across $file_count files"

  if [ "$total_errors" -eq 0 ]; then
    info ""
    info "No errors found! Nothing to batch."
    echo "{\"status\": \"no_errors\", \"total_errors\": 0}" > "$TEMP_DIR/result.json"
    return 1
  fi

  return 0
}

# Phase 2: Cluster files
phase_cluster() {
  info ""
  info "Phase 2: Clustering files ($STRATEGY strategy)..."

  # Extract file list from errors
  local files_json
  files_json=$(jq '.files_with_errors | keys' "$TEMP_DIR/errors.json")

  # Source cluster-files module
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/cluster-files.sh"

  local clusters_json
  clusters_json=$("$SCRIPT_DIR/cluster-files.sh" \
    --files "$files_json" \
    --workspace "$WORKSPACE" \
    --strategy "$STRATEGY" \
    --output-format json \
    2>/dev/null)

  echo "$clusters_json" > "$TEMP_DIR/clusters.json"

  local cluster_count
  cluster_count=$(echo "$clusters_json" | jq '.total_clusters')

  info "  ✓ Created $cluster_count clusters"
}

# Phase 3: Assign tiers and create batches
phase_batch() {
  info ""
  info "Phase 3: Creating batches..."

  # Load tier configuration
  local tier_config="$TIER_CONFIG"
  if [ -z "$tier_config" ]; then
    tier_config="$SCRIPT_DIR/templates/default-tiers.json"
  fi

  # Source create-batches module
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/create-batches.sh"

  local clusters_json
  clusters_json=$(cat "$TEMP_DIR/clusters.json")

  local batches_json
  batches_json=$("$SCRIPT_DIR/create-batches.sh" \
    --clusters "$clusters_json" \
    --tier-config "$tier_config" \
    --errors-json "$(cat "$TEMP_DIR/errors.json")" \
    --output-format json \
    2>/dev/null)

  echo "$batches_json" > "$TEMP_DIR/batches.json"

  local tier_1=$(echo "$batches_json" | jq '.tier_distribution.tier_1 // 0')
  local tier_2=$(echo "$batches_json" | jq '.tier_distribution.tier_2 // 0')
  local tier_3=$(echo "$batches_json" | jq '.tier_distribution.tier_3 // 0')
  local tier_4=$(echo "$batches_json" | jq '.tier_distribution.tier_4 // 0')
  local total_mem=$(echo "$batches_json" | jq -r '.total_memory_needed')

  info "  ✓ Tier distribution: Tier1=$tier_1, Tier2=$tier_2, Tier3=$tier_3, Tier4=$tier_4"
  info "  ✓ Total memory needed: $total_mem"
}

# Phase 4: Calculate spawn waves
phase_waves() {
  info ""
  info "Phase 4: Calculating spawn waves..."

  # Source calculate-waves module
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/calculate-waves.sh"

  local batches_json
  batches_json=$(cat "$TEMP_DIR/batches.json")

  local waves_json
  waves_json=$("$SCRIPT_DIR/calculate-waves.sh" \
    --batches "$batches_json" \
    --budget "$MEMORY_BUDGET" \
    --max-parallel "$MAX_PARALLEL" \
    --output-format json \
    2>/dev/null)

  echo "$waves_json" > "$TEMP_DIR/waves.json"

  local wave_count
  local max_parallelism
  local budget_util
  wave_count=$(echo "$waves_json" | jq '.summary.total_waves')
  max_parallelism=$(echo "$waves_json" | jq '.summary.max_parallelism')
  budget_util=$(echo "$waves_json" | jq -r '.summary.budget_utilization')

  info "  ✓ $wave_count waves with max parallelism: $max_parallelism agents"
  info "  ✓ Budget utilization: $budget_util"
}

# Generate output
generate_output() {
  info ""
  info "Generating output..."

  # Merge all results
  local merged_json
  merged_json=$(jq -s '{
    metadata: {
      generated_at: now | todate,
      command: "'$COMMAND'",
      workspace: "'$WORKSPACE'",
      language: "'$LANGUAGE'",
      strategy: "'$STRATEGY'",
      memory_budget: "'$MEMORY_BUDGET'"
    },
    analysis: .[0],
    clustering: .[1],
    batching: .[2],
    waves: .[3]
  }' \
    "$TEMP_DIR/errors.json" \
    "$TEMP_DIR/clusters.json" \
    "$TEMP_DIR/batches.json" \
    "$TEMP_DIR/waves.json")

  case "$OUTPUT_FORMAT" in
    json)
      echo "$merged_json"
      ;;
    yaml)
      echo "$merged_json" | jq -r 'to_entries | .[] | "\(.key): \(.value)"'
      ;;
    text)
      format_text_output "$merged_json"
      ;;
  esac
}

# Format text output (human-readable)
format_text_output() {
  local json="$1"

  local total_errors=$(echo "$json" | jq '.analysis.total_errors')
  local file_count=$(echo "$json" | jq '.analysis.files_with_errors')
  local total_clusters=$(echo "$json" | jq '.clustering.total_clusters')
  local total_batches=$(echo "$json" | jq '.batching.batches | length')
  local total_memory=$(echo "$json" | jq -r '.batching.total_memory_needed')
  local waves=$(echo "$json" | jq '.waves.summary.total_waves')
  local parallelism=$(echo "$json" | jq '.waves.summary.max_parallelism')
  local utilization=$(echo "$json" | jq -r '.waves.summary.budget_utilization')

  cat << EOF

CFN Error Batching Summary
==========================

Error Analysis:
  Total Errors: $total_errors
  Files with Errors: $file_count
  Language: $LANGUAGE

File Clustering:
  Strategy: $STRATEGY
  Total Clusters: $total_clusters

Batch Creation:
  Total Batches: $total_batches
  Total Memory: $total_memory
  Tiers:
    Tier 1 (512MB): $(echo "$json" | jq '.batching.tier_distribution.tier_1 // 0') batches
    Tier 2 (600MB): $(echo "$json" | jq '.batching.tier_distribution.tier_2 // 0') batches
    Tier 3 (800MB): $(echo "$json" | jq '.batching.tier_distribution.tier_3 // 0') batches
    Tier 4 (1GB):   $(echo "$json" | jq '.batching.tier_distribution.tier_4 // 0') batches

Spawn Waves:
  Total Waves: $waves
  Max Parallelism: $parallelism agents
  Budget ($MEMORY_BUDGET) Utilization: $utilization

Memory Optimization:
  Naive Approach: $file_count files × 1GB = $(echo "$file_count * 1024" | bc -l | xargs printf "%.1f")GB
  Strategic Batching: $total_memory
  Reduction: $(echo "scale=1; (1 - $(echo "$total_memory" | sed 's/GB//')/($file_count)) * 100" | bc)%

EOF
}

# Save output to file if specified
save_output() {
  if [ -z "$OUTPUT_FILE" ]; then
    return
  fi

  local merged_json
  merged_json=$(jq -s '{
    metadata: {
      generated_at: now | todate,
      command: "'$COMMAND'",
      workspace: "'$WORKSPACE'",
      language: "'$LANGUAGE'",
      strategy: "'$STRATEGY'",
      memory_budget: "'$MEMORY_BUDGET'"
    },
    analysis: .[0],
    clustering: .[1],
    batching: .[2],
    waves: .[3]
  }' \
    "$TEMP_DIR/errors.json" \
    "$TEMP_DIR/clusters.json" \
    "$TEMP_DIR/batches.json" \
    "$TEMP_DIR/waves.json")

  case "$OUTPUT_FORMAT" in
    json)
      echo "$merged_json" > "$OUTPUT_FILE"
      ;;
    yaml)
      echo "$merged_json" | jq -r 'to_entries | .[] | "\(.key): \(.value)"' > "$OUTPUT_FILE"
      ;;
    text)
      format_text_output "$merged_json" > "$OUTPUT_FILE"
      ;;
  esac

  info ""
  info "✓ Results saved to: $OUTPUT_FILE"
}

# Main execution
main() {
  parse_args "$@"
  validate_inputs
  detect_language

  info "CFN Error Batching Strategy"
  info "================================"
  info "Command: $COMMAND"
  info "Workspace: $WORKSPACE"
  info "Language: $LANGUAGE"
  info "Strategy: $STRATEGY"
  info "Memory Budget: $MEMORY_BUDGET"
  info ""

  # Execute phases
  phase_analyze || {
    if [ -n "$OUTPUT_FILE" ]; then
      cp "$TEMP_DIR/result.json" "$OUTPUT_FILE"
      info "Results saved to: $OUTPUT_FILE"
    else
      cat "$TEMP_DIR/result.json"
    fi
    return 0
  }

  phase_cluster
  phase_batch
  phase_waves

  # Generate and output results
  if [ "$OUTPUT_FORMAT" = "json" ]; then
    jq -s '{
      metadata: {
        generated_at: now | todate,
        command: "'$COMMAND'",
        workspace: "'$WORKSPACE'",
        language: "'$LANGUAGE'",
        strategy: "'$STRATEGY'",
        memory_budget: "'$MEMORY_BUDGET'"
      },
      analysis: .[0],
      clustering: .[1],
      batching: .[2],
      waves: .[3]
    }' \
      "$TEMP_DIR/errors.json" \
      "$TEMP_DIR/clusters.json" \
      "$TEMP_DIR/batches.json" \
      "$TEMP_DIR/waves.json"
  elif [ "$OUTPUT_FORMAT" = "text" ]; then
    format_text_output "$(jq -s '{
      analysis: .[0],
      clustering: .[1],
      batching: .[2],
      waves: .[3]
    }' \
      "$TEMP_DIR/errors.json" \
      "$TEMP_DIR/clusters.json" \
      "$TEMP_DIR/batches.json" \
      "$TEMP_DIR/waves.json")"
  fi

  save_output
  info "✅ Done!"
}

# Execute
main "$@"
