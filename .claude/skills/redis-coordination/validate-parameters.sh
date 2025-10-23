#!/usr/bin/env bash

##############################################################################
# Parameter Validation Helper for CFN Loop Orchestration
# Validates and standardizes orchestrator parameters
#
# Usage:
#   ./validate-parameters.sh [options]
#   Returns: 0 if valid, 1 if invalid
#
# Options:
#   --task-id <id>           Required: Unique task identifier
#   --mode <mode>            Required: mvp|standard|enterprise
#   --loop3-agents <list>    Required: Comma-separated agent IDs
#   --loop2-agents <list>    Required: Comma-separated agent IDs
#   --product-owner <id>     Required: Product owner agent ID
#   --max-iterations <n>     Optional: Maximum iterations (1-20)
#   --min-quorum-loop3 <n>   Optional: Minimum Loop 3 quorum
#   --min-quorum-loop2 <n>   Optional: Minimum Loop 2 quorum
#   --epic-context <json>    Optional: Epic context JSON
#   --phase-context <json>   Optional: Phase context JSON
#   --success-criteria <json> Optional: Success criteria JSON
#   --expected-files <list>  Optional: Comma-separated expected files
#   --phase-id <id>          Optional: Phase identifier
#   --verbose                Enable verbose output
##############################################################################

set -euo pipefail

# Variables
TASK_ID=""
MODE=""
LOOP3_AGENTS=""
LOOP2_AGENTS=""
PRODUCT_OWNER=""
MAX_ITERATIONS=""
MIN_QUORUM_LOOP3=""
MIN_QUORUM_LOOP2=""
EPIC_CONTEXT=""
PHASE_CONTEXT=""
SUCCESS_CRITERIA=""
EXPECTED_FILES=""
PHASE_ID=""
VERBOSE=0

# Validation result tracking
VALIDATION_ERRORS=()
VALIDATION_WARNINGS=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

##############################################################################
# Utility Functions
##############################################################################

log_error() {
  VALIDATION_ERRORS+=("$1")
  if [[ $VERBOSE -eq 1 ]]; then
    echo -e "${RED}ERROR: $1${NC}" >&2
  fi
}

log_warning() {
  VALIDATION_WARNINGS+=("$1")
  if [[ $VERBOSE -eq 1 ]]; then
    echo -e "${YELLOW}WARNING: $1${NC}" >&2
  fi
}

log_info() {
  if [[ $VERBOSE -eq 1 ]]; then
    echo -e "${GREEN}INFO: $1${NC}" >&2
  fi
}

# Validate JSON structure
validate_json() {
  local json_string="$1"
  local field_name="$2"
  
  if [[ -z "$json_string" ]]; then
    return 0  # Empty JSON is valid (optional field)
  fi
  
  # Try to parse with jq
  if ! echo "$json_string" | jq . >/dev/null 2>&1; then
    log_error "$field_name: Invalid JSON format"
    return 1
  fi
  
  log_info "$field_name: Valid JSON structure"
  return 0
}

# Validate task ID format
validate_task_id() {
  local task_id="$1"
  
  if [[ -z "$task_id" ]]; then
    log_error "task-id: Required parameter missing"
    return 1
  fi
  
  # Check length (reasonable limits)
  if [[ ${#task_id} -lt 3 ]]; then
    log_error "task-id: Too short (minimum 3 characters)"
    return 1
  fi
  
  if [[ ${#task_id} -gt 100 ]]; then
    log_error "task-id: Too long (maximum 100 characters)"
    return 1
  fi
  
  # Check for valid characters (alphanumeric, hyphens, underscores)
  if [[ ! "$task_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    log_error "task-id: Invalid characters (only letters, numbers, hyphens, underscores allowed)"
    return 1
  fi
  
  log_info "task-id: Valid format"
  return 0
}

# Validate mode
validate_mode() {
  local mode="$1"
  
  if [[ -z "$mode" ]]; then
    log_error "mode: Required parameter missing"
    return 1
  fi
  
  case "$mode" in
    mvp|standard|enterprise)
      log_info "mode: Valid mode ($mode)"
      return 0
      ;;
    *)
      log_error "mode: Invalid mode (must be mvp, standard, or enterprise)"
      return 1
      ;;
  esac
}

# Validate agent list
validate_agent_list() {
  local agent_list="$1"
  local field_name="$2"
  
  if [[ -z "$agent_list" ]]; then
    log_error "$field_name: Required parameter missing"
    return 1
  fi
  
  # Split by comma and validate each agent ID
  IFS=',' read -ra AGENTS <<< "$agent_list"
  for agent in "${AGENTS[@]}"; do
    agent=$(echo "$agent" | xargs)  # Trim whitespace
    if [[ -z "$agent" ]]; then
      log_error "$field_name: Empty agent ID in list"
      return 1
    fi
    
    if [[ ! "$agent" =~ ^[a-zA-Z0-9_-]+$ ]]; then
      log_error "$field_name: Invalid agent ID format: $agent"
      return 1
    fi
  done
  
  log_info "$field_name: Valid agent list (${#AGENTS[@]} agents)"
  return 0
}

# Validate numeric parameters
validate_numeric() {
  local value="$1"
  local field_name="$2"
  local min_val="${3:-1}"
  local max_val="${4:-100}"
  
  if [[ -z "$value" ]]; then
    return 0  # Optional parameter
  fi
  
  # Check if it's a valid number
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    log_error "$field_name: Must be a positive integer"
    return 1
  fi
  
  # Check range
  if [[ $value -lt $min_val || $value -gt $max_val ]]; then
    log_error "$field_name: Must be between $min_val and $max_val"
    return 1
  fi
  
  log_info "$field_name: Valid numeric value ($value)"
  return 0
}

# Validate quorum parameter (supports multiple formats)
validate_quorum() {
  local quorum="$1"
  local field_name="$2"
  
  if [[ -z "$quorum" ]]; then
    return 0  # Optional parameter
  fi
  
  # Check percentage format (e.g., "75%")
  if [[ "$quorum" =~ ^[0-9]+%$ ]]; then
    local percent="${quorum%\%}"
    if [[ $percent -lt 1 || $percent -gt 100 ]]; then
      log_error "$field_name: Percentage must be between 1% and 100%"
      return 1
    fi
    log_info "$field_name: Valid percentage format ($quorum)"
    return 0
  fi
  
  # Check decimal format (e.g., "0.75")
  if [[ "$quorum" =~ ^0\.[0-9]+$ ]]; then
    local decimal=$(echo "$quorum" | bc -l)
    if (( $(echo "$decimal < 0.01 || $decimal > 1.0" | bc -l) )); then
      log_error "$field_name: Decimal must be between 0.01 and 1.0"
      return 1
    fi
    log_info "$field_name: Valid decimal format ($quorum)"
    return 0
  fi
  
  # Check absolute number format (e.g., "3")
  if [[ "$quorum" =~ ^[0-9]+$ ]]; then
    if [[ $quorum -lt 1 || $quorum -gt 20 ]]; then
      log_error "$field_name: Absolute number must be between 1 and 20"
      return 1
    fi
    log_info "$field_name: Valid absolute format ($quorum)"
    return 0
  fi
  
  log_error "$field_name: Invalid format (must be number, percentage, or decimal)"
  return 1
}

# Validate file list
validate_file_list() {
  local file_list="$1"
  local field_name="$2"
  
  if [[ -z "$file_list" ]]; then
    return 0  # Optional parameter
  fi
  
  # Split by comma and validate each file path
  IFS=',' read -ra FILES <<< "$file_list"
  for file in "${FILES[@]}"; do
    file=$(echo "$file" | xargs)  # Trim whitespace
    if [[ -z "$file" ]]; then
      log_error "$field_name: Empty file path in list"
      return 1
    fi
    
    # Basic path validation (no absolute paths, no directory traversal)
    if [[ "$file" =~ ^/ ]] || [[ "$file" =~ \.\. ]]; then
      log_warning "$field_name: Potentially unsafe path: $file"
    fi
  done
  
  log_info "$field_name: Valid file list (${#FILES[@]} files)"
  return 0
}

##############################################################################
# Main Validation Functions
##############################################################################

validate_required_parameters() {
  local errors=0
  
  validate_task_id "$TASK_ID" || ((errors++))
  validate_mode "$MODE" || ((errors++))
  validate_agent_list "$LOOP3_AGENTS" "loop3-agents" || ((errors++))
  validate_agent_list "$LOOP2_AGENTS" "loop2-agents" || ((errors++))
  validate_agent_list "$PRODUCT_OWNER" "product-owner" || ((errors++))
  
  return $errors
}

validate_optional_parameters() {
  local errors=0
  
  validate_numeric "$MAX_ITERATIONS" "max-iterations" 1 20 || ((errors++))
  validate_quorum "$MIN_QUORUM_LOOP3" "min-quorum-loop3" || ((errors++))
  validate_quorum "$MIN_QUORUM_LOOP2" "min-quorum-loop2" || ((errors++))
  validate_json "$EPIC_CONTEXT" "epic-context" || ((errors++))
  validate_json "$PHASE_CONTEXT" "phase-context" || ((errors++))
  validate_json "$SUCCESS_CRITERIA" "success-criteria" || ((errors++))
  validate_file_list "$EXPECTED_FILES" "expected-files" || ((errors++))
  
  # Validate phase ID (similar to task ID)
  if [[ -n "$PHASE_ID" ]]; then
    if [[ ! "$PHASE_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
      log_error "phase-id: Invalid format (only letters, numbers, hyphens, underscores allowed)"
      ((errors++))
    else
      log_info "phase-id: Valid format"
    fi
  fi
  
  return $errors
}

print_validation_summary() {
  local total_errors=${#VALIDATION_ERRORS[@]}
  local total_warnings=${#VALIDATION_WARNINGS[@]}
  
  echo ""
  echo "=== Parameter Validation Summary ==="
  
  if [[ $total_errors -eq 0 ]]; then
    echo -e "${GREEN}✅ All parameters are valid${NC}"
  else
    echo -e "${RED}❌ Validation failed with $total_errors error(s)${NC}"
    if [[ $VERBOSE -eq 0 ]]; then
      echo "Run with --verbose for detailed error messages"
    fi
  fi
  
  if [[ $total_warnings -gt 0 ]]; then
    echo -e "${YELLOW}⚠️  $total_warnings warning(s) found${NC}"
    if [[ $VERBOSE -eq 0 ]]; then
      echo "Run with --verbose for detailed warning messages"
    fi
  fi
  
  echo ""
  
  # Show errors in non-verbose mode
  if [[ $VERBOSE -eq 0 && $total_errors -gt 0 ]]; then
    echo "Errors:"
    for error in "${VALIDATION_ERRORS[@]}"; do
      echo "  - $error"
    done
    echo ""
  fi
  
  # Show warnings in non-verbose mode
  if [[ $VERBOSE -eq 0 && $total_warnings -gt 0 ]]; then
    echo "Warnings:"
    for warning in "${VALIDATION_WARNINGS[@]}"; do
      echo "  - $warning"
    done
    echo ""
  fi
}

##############################################################################
# Parse Arguments
##############################################################################

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --loop3-agents)
      LOOP3_AGENTS="$2"
      shift 2
      ;;
    --loop2-agents)
      LOOP2_AGENTS="$2"
      shift 2
      ;;
    --product-owner)
      PRODUCT_OWNER="$2"
      shift 2
      ;;
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --min-quorum-loop3)
      MIN_QUORUM_LOOP3="$2"
      shift 2
      ;;
    --min-quorum-loop2)
      MIN_QUORUM_LOOP2="$2"
      shift 2
      ;;
    --epic-context)
      EPIC_CONTEXT="$2"
      shift 2
      ;;
    --phase-context)
      PHASE_CONTEXT="$2"
      shift 2
      ;;
    --success-criteria)
      SUCCESS_CRITERIA="$2"
      shift 2
      ;;
    --expected-files)
      EXPECTED_FILES="$2"
      shift 2
      ;;
    --phase-id)
      PHASE_ID="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo "Validates CFN Loop orchestrator parameters"
      echo ""
      echo "Required options:"
      echo "  --task-id <id>           Unique task identifier"
      echo "  --mode <mode>            Execution mode (mvp|standard|enterprise)"
      echo "  --loop3-agents <list>    Comma-separated Loop 3 agent IDs"
      echo "  --loop2-agents <list>    Comma-separated Loop 2 agent IDs"
      echo "  --product-owner <id>     Product owner agent ID"
      echo ""
      echo "Optional options:"
      echo "  --max-iterations <n>     Maximum iterations (1-20)"
      echo "  --min-quorum-loop3 <n>   Loop 3 quorum (number|percentage|decimal)"
      echo "  --min-quorum-loop2 <n>   Loop 2 quorum (number|percentage|decimal)"
      echo "  --epic-context <json>    Epic context JSON"
      echo "  --phase-context <json>   Phase context JSON"
      echo "  --success-criteria <json> Success criteria JSON"
      echo "  --expected-files <list>  Comma-separated expected files"
      echo "  --phase-id <id>          Phase identifier"
      echo "  --verbose                Enable verbose output"
      echo "  --help                   Show this help message"
      echo ""
      echo "Exit codes:"
      echo "  0  All parameters are valid"
      echo "  1  Validation errors found"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Use --help for usage information" >&2
      exit 1
      ;;
  esac
done

##############################################################################
# Main Execution
##############################################################################

# If no parameters provided, show usage
if [[ $# -eq 0 && $VERBOSE -eq 0 ]]; then
  echo "No parameters provided for validation" >&2
  echo "Use --help for usage information" >&2
  exit 1
fi

log_info "Starting parameter validation..."

# Validate required parameters
validate_required_parameters
required_errors=$?

# Validate optional parameters
validate_optional_parameters
optional_errors=$?

total_errors=$((required_errors + optional_errors))

# Print summary
print_validation_summary

# Exit with appropriate code
if [[ $total_errors -eq 0 ]]; then
  exit 0
else
  exit 1
fi