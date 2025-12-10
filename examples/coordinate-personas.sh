#!/bin/bash
# Epic Creator v2 - Persona Coordination Script
# Demonstrates sequential and parallel persona orchestration patterns

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CACHE_DIR="$PROJECT_ROOT/.cache/personas"
STATE_DIR="$PROJECT_ROOT/.state/workflows"
LOG_DIR="$PROJECT_ROOT/.logs/epic-creator"

# Default configuration
DEFAULT_MODE="standard"
DEFAULT_TIMEOUT=300
DEFAULT_RETRIES=3
PARALLEL_EXECUTION=false
USE_CACHE=true
VERBOSE=false

# Persona definitions in execution order
declare -A PERSONAS=(
  ["product-owner"]="1"
  ["architect"]="2"
  ["security-specialist"]="3"
  ["performance-specialist"]="4"
  ["accessibility-advocate-persona"]="5"
  ["devops-engineer"]="6"
)

# Required personas (cannot be skipped)
REQUIRED_PERSONAS=(
  "product-owner"
  "architect"
  "security-specialist"
)

# Optional personas (can be skipped if unavailable)
OPTIONAL_PERSONAS=(
  "performance-specialist"
  "accessibility-advocate-persona"
  "devops-engineer"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initialize directories
init_directories() {
  mkdir -p "$CACHE_DIR" "$STATE_DIR" "$LOG_DIR"
}

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_DIR/coordination.log"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_DIR/coordination.log"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_DIR/coordination.log"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_DIR/coordination.log"
}

log_debug() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo -e "[DEBUG] $1" | tee -a "$LOG_DIR/coordination.log"
  fi
}

# Generate unique identifiers
generate_task_id() {
  echo "task-$(date +%s)-$(openssl rand -hex 4)"
}

generate_epic_id() {
  echo "EPIC-$(date +%s | tail -c 7)"
}

# Cache management functions
get_cache_key() {
  local description="$1"
  local persona="$2"
  local mode="$3"
  echo -n "$description|$persona|$mode" | sha256sum | cut -d' ' -f1
}

get_cached_output() {
  local cache_key="$1"
  local cache_file="$CACHE_DIR/${cache_key}.json"

  if [[ "$USE_CACHE" == "true" && -f "$cache_file" ]]; then
    # Check TTL (24 hours)
    local cache_age=$(($(date +%s) - $(stat -c %Y "$cache_file")))
    if [[ $cache_age -lt 86400 ]]; then
      log_debug "Cache hit for key: $cache_key"
      cat "$cache_file"
      return 0
    else
      rm -f "$cache_file"
      log_debug "Cache expired for key: $cache_key"
    fi
  fi
  return 1
}

cache_output() {
  local cache_key="$1"
  local output="$2"
  local cache_file="$CACHE_DIR/${cache_key}.json"

  if [[ "$USE_CACHE" == "true" ]]; then
    echo "$output" > "$cache_file"
    log_debug "Cached output for key: $cache_key"
  fi
}

# Check persona availability
check_persona_availability() {
  local persona="$1"
  local agent_path="$PROJECT_ROOT/.claude/agents/cfn-dev-team"

  # Find persona file
  local persona_file
  case "$persona" in
    "product-owner")
      persona_file="$agent_path/product-owners/product-owner.md"
      ;;
    "architect")
      persona_file="$agent_path/architecture/system-architect.md"
      ;;
    "security-specialist")
      persona_file="$agent_path/reviewers/quality/security-specialist.md"
      ;;
    "performance-specialist")
      persona_file="$agent_path/reviewers/quality/perf-analyzer.md"
      ;;
    "accessibility-advocate-persona")
      persona_file="$agent_path/product-owners/accessibility-advocate-persona.md"
      ;;
    "devops-engineer")
      persona_file="$agent_path/dev-ops/devops-engineer.md"
      ;;
    *)
      log_warning "Unknown persona: $persona"
      return 1
      ;;
  esac

  if [[ -f "$persona_file" ]]; then
    log_debug "Persona available: $persona ($persona_file)"
    return 0
  else
    log_warning "Persona not found: $persona ($persona_file)"
    return 1
  fi
}

# Prepare persona input
prepare_persona_input() {
  local persona="$1"
  local epic_description="$2"
  local mode="$3"
  local accumulated_outputs="$4"
  local task_id="$5"

  local input_file="$STATE_DIR/${task_id}-${persona}-input.json"

  # Build persona input JSON
  local input_json
  if [[ -n "$accumulated_outputs" ]]; then
    input_json=$(jq -n \
      --arg description "$epic_description" \
      --arg mode "$mode" \
      --arg persona "$persona" \
      --argjson previous "$accumulated_outputs" \
      '{
        epic: {
          description: $description,
          mode: $mode,
          previousInsights: $previous
        },
        persona: {
          name: $persona
        }
      }')
  else
    input_json=$(jq -n \
      --arg description "$epic_description" \
      --arg mode "$mode" \
      --arg persona "$persona" \
      '{
        epic: {
          description: $description,
          mode: $mode
        },
        persona: {
          name: $persona
        }
      }')
  fi

  echo "$input_json" > "$input_file"
  echo "$input_file"
}

# Invoke a persona agent
invoke_persona() {
  local persona="$1"
  local input_file="$2"
  local output_file="$3"
  local timeout="$4"
  local retries="${5:-$DEFAULT_RETRIES}"

  local attempt=1
  local persona_path="cfn-dev-team/${persona}"

  # Adjust persona path for special cases
  case "$persona" in
    "product-owner")
      persona_path="cfn-dev-team/product-owners/product-owner"
      ;;
    "architect")
      persona_path="cfn-dev-team/architecture/system-architect"
      ;;
    "security-specialist")
      persona_path="cfn-dev-team/reviewers/quality/security-specialist"
      ;;
    "performance-specialist")
      persona_path="cfn-dev-team/reviewers/quality/perf-analyzer"
      ;;
    "accessibility-advocate-persona")
      persona_path="cfn-dev-team/product-owners/accessibility-advocate-persona"
      ;;
    "devops-engineer")
      persona_path="cfn-dev-team/dev-ops/devops-engineer"
      ;;
  esac

  while [[ $attempt -le $retries ]]; do
    log_info "Invoking persona: $persona (attempt $attempt/$retries)"

    # Set timeout and retry logic
    if timeout "$timeout" npx claude-flow-novice agent-spawn "$persona_path" \
      --task-id "${TASK_ID}" \
      --context-file "$input_file" \
      --output-file "$output_file" 2>&1 | tee -a "$LOG_DIR/${persona}-${TASK_ID}.log"; then

      # Validate output
      if [[ -f "$output_file" && -s "$output_file" ]]; then
        log_success "Persona $persona completed successfully"
        return 0
      else
        log_warning "Persona $persona produced no output"
      fi
    else
      local exit_code=$?
      log_warning "Persona $persona failed with exit code: $exit_code"
    fi

    if [[ $attempt -lt $retries ]]; then
      local backoff=$((attempt * 10))
      log_info "Retrying in $backoff seconds..."
      sleep $backoff
    fi

    ((attempt++))
  done

  log_error "Persona $persona failed after $retries attempts"
  return 1
}

# Execute personas sequentially
execute_sequential() {
  local epic_description="$1"
  local mode="$2"
  local timeout="$3"
  local task_id="$4"

  local accumulated_outputs="[]"
  local persona_results=()
  local failed_personas=()

  # Sort personas by review order
  local sorted_personas=$(for p in "${!PERSONAS[@]}"; do
    echo "$p ${PERSONAS[$p]}"
  done | sort -k2 -n | cut -d' ' -f1)

  for persona in $sorted_personas; do
    log_info "Processing persona: $persona (order: ${PERSONAS[$persona]})"

    # Check if persona is available
    if ! check_persona_availability "$persona"; then
      if [[ " ${REQUIRED_PERSONAS[@]} " =~ " $persona " ]]; then
        log_error "Required persona $persona is not available"
        return 1
      else
        log_warning "Skipping optional persona: $persona"
        continue
      fi
    fi

    # Check cache first
    local cache_key
    cache_key=$(get_cache_key "$epic_description" "$persona" "$mode")
    local cached_output
    if cached_output=$(get_cached_output "$cache_key"); then
      log_info "Using cached output for $persona"
      persona_results+=("$cached_output")
      accumulated_outputs=$(echo "$accumulated_outputs" | \
        jq --argjson persona "$cached_output" '. += [$persona]')
      continue
    fi

    # Prepare input
    local input_file
    input_file=$(prepare_persona_input "$persona" "$epic_description" "$mode" "$accumulated_outputs" "$task_id")

    # Execute persona
    local output_file="$STATE_DIR/${task_id}-${persona}-output.json"
    local persona_start=$(date +%s)

    if invoke_persona "$persona" "$input_file" "$output_file" "$timeout"; then
      # Process output
      local persona_output
      persona_output=$(jq -n \
        --arg name "$persona" \
        --argjson order "${PERSONAS[$persona]}" \
        --argjson data "$(cat "$output_file" 2>/dev/null || echo '{}')" \
        '{
          name: $name,
          reviewOrder: $order,
          status: "completed",
          insights: ($data.insights // []),
          recommendations: ($data.recommendations // []),
          costAnalysis: ($data.costAnalysis // {}),
          executionTime: $data.executionTime // null,
          confidence: ($data.confidence // 0.8)
        }')

      persona_results+=("$persona_output")
      accumulated_outputs=$(echo "$accumulated_outputs" | \
        jq --argjson persona "$persona_output" '. += [$persona]')

      # Cache the result
      cache_output "$cache_key" "$persona_output"

      # Save checkpoint
      save_checkpoint "$task_id" "$persona" "$accumulated_outputs"
    else
      failed_personas+=("$persona")

      # Check if we can continue
      if [[ " ${REQUIRED_PERSONAS[@]} " =~ " $persona " ]]; then
        log_error "Required persona $persona failed, aborting workflow"
        return 1
      else
        log_warning "Continuing without optional persona: $persona"
      fi
    fi

    # Cleanup temporary files
    rm -f "$input_file" "$output_file"
  done

  # Generate final epic JSON
  generate_epic_json "$task_id" "$epic_description" "$mode" "${persona_results[@]}" "${failed_personas[@]}"
}

# Execute personas in parallel (where independent)
execute_parallel() {
  local epic_description="$1"
  local mode="$2"
  local timeout="$3"
  local task_id="$4"

  log_info "Executing personas in parallel mode"

  # Group personas by dependencies
  local phase1=("product-owner")  # Must run first
  local phase2=("architect")      # Depends on product-owner
  local phase3=("security-specialist" "performance-specialist")  # Can run in parallel
  local phase4=("accessibility-advocate-persona")  # Depends on phase3
  local phase5=("devops-engineer")  # Runs last

  local accumulated_outputs="[]"
  local all_results=()
  local failed_personas=()

  # Execute each phase
  for phase in phase1 phase2 phase3 phase4 phase5; do
    local phase_personas="${phase}[@]"
    local current_phase=(${!phase_personas})

    if [[ ${#current_phase[@]} -eq 1 ]]; then
      # Single persona, execute sequentially
      local persona="${current_phase[0]}"
      log_info "Phase ${phase}: Executing $persona"

      if ! execute_persona_with_state "$persona" "$epic_description" "$mode" "$timeout" "$task_id" "$accumulated_outputs"; then
        if [[ " ${REQUIRED_PERSONAS[@]} " =~ " $persona " ]]; then
          log_error "Required persona $persona failed in phase $phase"
          return 1
        else
          failed_personas+=("$persona")
        fi
      fi

      # Update accumulated outputs
      local persona_output="$STATE_DIR/${task_id}-${persona}-output.json"
      if [[ -f "$persona_output" ]]; then
        accumulated_outputs=$(echo "$accumulated_outputs" | \
          jq --argjson persona "$(cat "$persona_output")" '. += [$persona]')
      fi
    else
      # Multiple personas, execute in parallel
      log_info "Phase ${phase}: Executing ${current_phase[*]} in parallel"
      local pids=()
      local temp_files=()

      for persona in "${current_phase[@]}"; do
        if ! check_persona_availability "$persona"; then
          if [[ " ${REQUIRED_PERSONAS[@]} " =~ " $persona " ]]; then
            log_error "Required persona $persona not available in phase $phase"
            return 1
          else
            log_warning "Skipping optional persona: $persona"
            failed_personas+=("$persona")
            continue
          fi
        fi

        # Execute in background
        {
          local temp_file=$(mktemp)
          if execute_persona_with_state "$persona" "$epic_description" "$mode" "$timeout" "$task_id" "$accumulated_outputs"; then
            cp "$STATE_DIR/${task_id}-${persona}-output.json" "$temp_file"
          else
            echo "FAILED" > "$temp_file"
            if [[ " ${REQUIRED_PERSONAS[@]} " =~ " $persona " ]]; then
              log_error "Required persona $persona failed in parallel phase $phase"
            else
              log_warning "Optional persona $persona failed in parallel phase $phase"
            fi
          fi
          echo "$temp_file"
        } &
        pids+=($!)
        temp_files+=("$(mktemp)")
      done

      # Wait for all personas
      local phase_failed=false
      for i in "${!pids[@]}"; do
        if wait "${pids[$i]}"; then
          # Check results
          local result_file="${temp_files[$i]}"
          if [[ -f "$result_file" && "$(cat "$result_file")" != "FAILED" ]]; then
            log_success "Parallel persona ${current_phase[$i]} completed"
          else
            local persona="${current_phase[$i]}"
            if [[ " ${REQUIRED_PERSONAS[@]} " =~ " $persona " ]]; then
              phase_failed=true
            else
              failed_personas+=("$persona")
            fi
          fi
          rm -f "$result_file"
        else
          local persona="${current_phase[$i]}"
          if [[ " ${REQUIRED_PERSONAS[@]} " =~ " $persona " ]]; then
            phase_failed=true
          else
            failed_personas+=("$persona")
          fi
        fi
      done

      if [[ "$phase_failed" == "true" ]]; then
        log_error "Phase $phase failed due to required persona failure"
        return 1
      fi

      # Collect outputs from completed personas
      for persona in "${current_phase[@]}"; do
        local persona_output="$STATE_DIR/${task_id}-${persona}-output.json"
        if [[ -f "$persona_output" ]]; then
          accumulated_outputs=$(echo "$accumulated_outputs" | \
            jq --argjson persona "$(cat "$persona_output")" '. += [$persona]')
        fi
      done
    fi
  done

  # Collect all results
  for persona in "${!PERSONAS[@]}"; do
    local persona_output="$STATE_DIR/${task_id}-${persona}-output.json"
    if [[ -f "$persona_output" ]]; then
      all_results+=("$(cat "$persona_output")")
    fi
  done

  # Generate final epic JSON
  generate_epic_json "$task_id" "$epic_description" "$mode" "${all_results[@]}" "${failed_personas[@]}"
}

# Execute a single persona with state
execute_persona_with_state() {
  local persona="$1"
  local epic_description="$2"
  local mode="$3"
  local timeout="$4"
  local task_id="$5"
  local accumulated_outputs="$6"

  # Check cache
  local cache_key
  cache_key=$(get_cache_key "$epic_description" "$persona" "$mode")
  local cached_output
  if cached_output=$(get_cached_output "$cache_key"); then
    echo "$cached_output" > "$STATE_DIR/${task_id}-${persona}-output.json"
    return 0
  fi

  # Prepare input
  local input_file
  input_file=$(prepare_persona_input "$persona" "$epic_description" "$mode" "$accumulated_outputs" "$task_id")

  # Execute persona
  local output_file="$STATE_DIR/${task_id}-${persona}-output.json"

  if invoke_persona "$persona" "$input_file" "$output_file" "$timeout"; then
    # Transform output to standard format
    local standard_output
    standard_output=$(jq -n \
      --arg name "$persona" \
      --argjson order "${PERSONAS[$persona]}" \
      --argjson data "$(cat "$output_file" 2>/dev/null || echo '{}')" \
      '{
        name: $name,
        reviewOrder: $order,
        status: "completed",
        insights: ($data.insights // []),
        recommendations: ($data.recommendations // []),
        costAnalysis: ($data.costAnalysis // {}),
        executionTime: $data.executionTime // null,
        confidence: ($data.confidence // 0.8)
      }')

    echo "$standard_output" > "$output_file"
    cache_output "$cache_key" "$standard_output"
    save_checkpoint "$task_id" "$persona" "$(echo "$accumulated_outputs" | jq --argjson persona "$standard_output" '. += [$persona]')"

    rm -f "$input_file"
    return 0
  else
    rm -f "$input_file" "$output_file"
    return 1
  fi
}

# Save workflow checkpoint
save_checkpoint() {
  local task_id="$1"
  local persona="$2"
  local state="$3"

  local checkpoint_file="$STATE_DIR/${task_id}-checkpoint-${PERSONAS[$persona]}.json"
  local checkpoint_data=$(jq -n \
    --arg task_id "$task_id" \
    --arg persona "$persona" \
    --argjson order "${PERSONAS[$persona]}" \
    --argjson state "$state" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" \
    '{
      taskId: $task_id,
      currentPersona: $persona,
      reviewOrder: $order,
      state: $state,
      timestamp: $timestamp
    }')

  echo "$checkpoint_data" > "$checkpoint_file"
  log_debug "Checkpoint saved: $checkpoint_file"
}

# Generate final epic JSON
generate_epic_json() {
  local task_id="$1"
  local epic_description="$2"
  local mode="$3"
  shift 3
  local persona_results=("$@")

  local epic_id
  epic_id=$(generate_epic_id)
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  # Extract title from description
  local title=$(echo "$epic_description" | cut -c1-50 | sed 's/\.$//')
  if [[ ${#title} -lt 20 ]]; then
    title="$title..."
  fi

  # Build personas array
  local personas_json="[]"
  for result in "${persona_results[@]}"; do
    if [[ -n "$result" && "$result" != "FAILED" ]]; then
      personas_json=$(echo "$personas_json" | jq --argjson persona "$result" '. += [$persona]')
    fi
  done

  # Calculate summary
  local summary
  summary=$(echo "$personas_json" | jq -r '{
    totalRecommendations: map(.recommendations | length) | add,
    blockingCount: map(.recommendations | map(select(.type == "blocking")) | length) | add,
    suggestedCount: map(.recommendations | map(select(.type == "suggested")) | length) | add,
    personasCompleted: length
  }')

  # Generate final epic JSON
  local epic_json=$(jq -n \
    --arg id "$epic_id" \
    --arg title "$title" \
    --arg description "$epic_description" \
    --arg mode "$mode" \
    --arg timestamp "$timestamp" \
    --argjson personas "$personas_json" \
    --argjson summary "$summary" \
    '{
      epic: {
        id: $id,
        title: $title,
        description: $description,
        priority: "high",
        estimatedDuration: "TBD",
        budget: "TBD",
        status: "completed",
        metadata: {
          createdAt: $timestamp,
          reviewMode: $mode,
          taskId: ($timestamp | split("T")[1] | split(".")[0])
        },
        personas: $personas,
        implementationRoadmap: [],
        totalCostBreakdown: {},
        riskAssessment: {}
      },
      summary: $summary
    }')

  # Save output
  local output_file="epic-with-personas-$(date +%Y-%m-%d-%H-%M-%S).json"
  echo "$epic_json" | jq '.' > "$output_file"

  # Display summary
  echo ""
  log_success "Epic generation completed!"
  echo "Epic ID: $epic_id"
  echo "Output file: $output_file"
  echo "Personas completed: $(echo "$summary" | jq -r '.personasCompleted')"
  echo "Total recommendations: $(echo "$summary" | jq -r '.totalRecommendations')"
  echo "Blocking recommendations: $(echo "$summary" | jq -r '.blockingCount')"
  echo "Suggested recommendations: $(echo "$summary" | jq -r '.suggestedCount')"
}

# Resume from checkpoint
resume_workflow() {
  local task_id="$1"

  log_info "Resuming workflow from checkpoint: $task_id"

  # Find latest checkpoint
  local latest_checkpoint
  latest_checkpoint=$(ls -1 "$STATE_DIR/${task_id}-checkpoint-*.json 2>/dev/null | sort -V | tail -n1)

  if [[ -z "$latest_checkpoint" ]]; then
    log_error "No checkpoint found for task: $task_id"
    return 1
  fi

  # Load checkpoint state
  local checkpoint_data
  checkpoint_data=$(cat "$latest_checkpoint")

  local epic_description
  local mode
  local current_order
  local accumulated_state

  epic_description=$(echo "$checkpoint_data" | jq -r '.state.epic.description')
  mode=$(echo "$checkpoint_data" | jq -r '.state.epic.mode')
  current_order=$(echo "$checkpoint_data" | jq -r '.reviewOrder')
  accumulated_state=$(echo "$checkpoint_data" | jq '.state.previousInsights // []')

  log_info "Resuming from persona order: $current_order"

  # Continue execution from next persona
  local next_personas=()
  for persona in "${!PERSONAS[@]}"; do
    if [[ ${PERSONAS[$persona]} -gt $current_order ]]; then
      next_personas+=("$persona")
    fi
  done

  if [[ ${#next_personas[@]} -eq 0 ]]; then
    log_warning "No more personas to execute, workflow already complete"
    return 0
  fi

  # Execute remaining personas
  local timeout=${DEFAULT_TIMEOUT}
  for persona in "${next_personas[@]}"; do
    log_info "Executing remaining persona: $persona"

    if execute_persona_with_state "$persona" "$epic_description" "$mode" "$timeout" "$task_id" "$accumulated_state"; then
      local persona_output="$STATE_DIR/${task_id}-${persona}-output.json"
      if [[ -f "$persona_output" ]]; then
        accumulated_state=$(echo "$accumulated_state" | \
          jq --argjson persona "$(cat "$persona_output")" '. += [$persona]')
      fi
    else
      log_error "Failed to execute persona: $persona"
      return 1
    fi
  done

  # Generate final output
  local all_results=()
  for persona in "${!PERSONAS[@]}"; do
    local persona_output="$STATE_DIR/${task_id}-${persona}-output.json"
    if [[ -f "$persona_output" ]]; then
      all_results+=("$(cat "$persona_output")")
    fi
  done

  generate_epic_json "$task_id" "$epic_description" "$mode" "${all_results[@]}"
}

# Display usage information
show_usage() {
  cat << EOF
Epic Creator v2 - Persona Coordination Script

Usage:
  $0 "<epic-description>" [OPTIONS]

Options:
  --mode=MODE           Review mode (mvp|standard|enterprise) [default: standard]
  --timeout=SECONDS     Per-persona timeout [default: 300]
  --parallel            Execute personas in parallel where possible
  --no-cache            Disable persona output caching
  --resume=TASK_ID      Resume from checkpoint
  --verbose             Enable verbose logging
  --help                Show this help message

Examples:
  # Basic sequential execution
  $0 "Build a customer analytics dashboard"

  # With custom mode and timeout
  $0 "Implement real-time data processing" --mode=enterprise --timeout=600

  # Parallel execution for performance
  $0 "Create mobile banking app" --parallel

  # Resume from checkpoint
  $0 --resume=task-1703123456-abcd

  # With all options
  $0 "Develop AI-powered recommendation engine" \
    --mode=enterprise \
    --timeout=600 \
    --parallel \
    --verbose

EOF
}

# Main execution function
main() {
  local epic_description=""
  local mode="$DEFAULT_MODE"
  local timeout="$DEFAULT_TIMEOUT"
  local resume_task_id=""

  # Parse command line arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --mode=*)
        mode="${1#--mode=}"
        if [[ ! "$mode" =~ ^(mvp|standard|enterprise)$ ]]; then
          log_error "Invalid mode: $mode (must be mvp, standard, or enterprise)"
          exit 1
        fi
        shift
        ;;
      --mode)
        mode="$2"
        if [[ ! "$mode" =~ ^(mvp|standard|enterprise)$ ]]; then
          log_error "Invalid mode: $mode (must be mvp, standard, or enterprise)"
          exit 1
        fi
        shift 2
        ;;
      --timeout=*)
        timeout="${1#--timeout=}"
        if ! [[ "$timeout" =~ ^[0-9]+$ ]]; then
          log_error "Invalid timeout: $timeout (must be a number)"
          exit 1
        fi
        shift
        ;;
      --timeout)
        timeout="$2"
        if ! [[ "$timeout" =~ ^[0-9]+$ ]]; then
          log_error "Invalid timeout: $timeout (must be a number)"
          exit 1
        fi
        shift 2
        ;;
      --parallel)
        PARALLEL_EXECUTION=true
        shift
        ;;
      --no-cache)
        USE_CACHE=false
        shift
        ;;
      --resume=*)
        resume_task_id="${1#--resume=}"
        shift
        ;;
      --resume)
        resume_task_id="$2"
        shift 2
        ;;
      --verbose)
        VERBOSE=true
        shift
        ;;
      --help)
        show_usage
        exit 0
        ;;
      -*)
        log_error "Unknown option: $1"
        show_usage
        exit 1
        ;;
      *)
        if [[ -z "$epic_description" ]]; then
          epic_description="$1"
        else
          log_error "Multiple epic descriptions provided"
          show_usage
          exit 1
        fi
        shift
        ;;
    esac
  done

  # Validate inputs
  if [[ -n "$resume_task_id" ]]; then
    # Resume mode - no epic description needed
    init_directories
    resume_workflow "$resume_task_id"
    exit 0
  fi

  if [[ -z "$epic_description" ]]; then
    log_error "Epic description is required"
    show_usage
    exit 1
  fi

  # Initialize
  init_directories
  TASK_ID=$(generate_task_id)

  log_info "Starting Epic Creator v2 workflow"
  log_info "Task ID: $TASK_ID"
  log_info "Mode: $mode"
  log_info "Timeout: ${timeout}s per persona"
  log_info "Execution: $([ "$PARALLEL_EXECUTION" = true ] && echo "Parallel" || echo "Sequential")"
  log_info "Cache: $([ "$USE_CACHE" = true ] && echo "Enabled" || echo "Disabled")"

  # Check if claude-flow-novice is available
  if ! command -v npx &> /dev/null || ! npx claude-flow-novice --version &> /dev/null; then
    log_error "claude-flow-novice is not installed or not available"
    exit 1
  fi

  # Check persona availability
  log_info "Checking persona availability..."
  local available_count=0
  local total_count=${#PERSONAS[@]}

  for persona in "${!PERSONAS[@]}"; do
    if check_persona_availability "$persona"; then
      ((available_count++))
    fi
  done

  log_info "Available personas: $available_count/$total_count"

  if [[ $available_count -lt 3 ]]; then
    log_error "Too few personas available ($available_count), minimum 3 required"
    exit 1
  fi

  # Execute workflow
  local start_time=$(date +%s)

  if [[ "$PARALLEL_EXECUTION" == "true" ]]; then
    execute_parallel "$epic_description" "$mode" "$timeout" "$TASK_ID"
  else
    execute_sequential "$epic_description" "$mode" "$timeout" "$TASK_ID"
  fi

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  log_info "Workflow completed in ${duration}s"

  # Cleanup old state files (older than 7 days)
  find "$STATE_DIR" -name "*.json" -type f -mtime +7 -delete 2>/dev/null || true
  log_debug "Cleaned up old state files"
}

# Run main function
main "$@"