#!/bin/bash

##############################################################################
# Run All Layers - 3-Layer Mesh Coordination Test Suite
##############################################################################
#
# Orchestrates sequential execution of all 3 layers with validation:
# - Layer 1: Mesh Coordination (2 implementer coordinators)
# - Layer 2: Review Coordination (adds dynamic reviewer pool)
# - Layer 3: Error Handling & Retry (50% error injection + retries)
#
# Each layer includes:
# 1. Test execution
# 2. Validation
# 3. Results export
# 4. Pass/fail reporting
#
# Usage:
#   ./run-all-layers.sh [options]
#
# Options:
#   --skip-layer1      Skip Layer 1 execution (use existing results)
#   --skip-layer2      Skip Layer 2 execution (use existing results)
#   --skip-layer3      Skip Layer 3 execution (use existing results)
#   --validate-only    Only run validation (skip test execution)
#   --clean            Clean Redis before starting
#   --help             Show this help message
#
##############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/test-results/hello-world"

# Options
SKIP_LAYER1=false
SKIP_LAYER2=false
SKIP_LAYER3=false
VALIDATE_ONLY=false
CLEAN_REDIS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-layer1)
      SKIP_LAYER1=true
      shift
      ;;
    --skip-layer2)
      SKIP_LAYER2=true
      shift
      ;;
    --skip-layer3)
      SKIP_LAYER3=true
      shift
      ;;
    --validate-only)
      VALIDATE_ONLY=true
      shift
      ;;
    --clean)
      CLEAN_REDIS=true
      shift
      ;;
    --help)
      grep "^#" "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Run with --help for usage information"
      exit 1
      ;;
  esac
done

##############################################################################
# Helper Functions
##############################################################################

print_header() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

print_section() {
  echo ""
  echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

check_redis() {
  print_section "Checking Redis Connection"

  if ! redis-cli ping > /dev/null 2>&1; then
    print_error "Redis is not running"
    print_info "Start Redis with: redis-server"
    exit 1
  fi

  print_success "Redis is running"
}

clean_redis() {
  print_section "Cleaning Redis"

  local count=$(redis-cli keys "coordination:*" | wc -l)

  if [ "$count" -gt 0 ]; then
    print_info "Found $count coordination keys"
    redis-cli --scan --pattern "coordination:*" | xargs -r redis-cli del > /dev/null
    print_success "Cleared $count coordination keys"
  else
    print_info "No coordination keys found"
  fi
}

check_dependencies() {
  print_section "Checking Dependencies"

  # Check Node.js
  if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    exit 1
  fi
  print_success "Node.js: $(node --version)"

  # Check Redis CLI
  if ! command -v redis-cli &> /dev/null; then
    print_error "Redis CLI is not installed"
    exit 1
  fi
  print_success "Redis CLI: $(redis-cli --version | cut -d ' ' -f 2)"

  # Check .env file
  if [ ! -f "$PROJECT_ROOT/.env" ]; then
    print_error ".env file not found"
    print_info "Create .env with Z_AI_API_KEY"
    exit 1
  fi
  print_success ".env file exists"

  # Check Z.ai API key
  if ! grep -q "Z_AI_API_KEY" "$PROJECT_ROOT/.env"; then
    print_error "Z_AI_API_KEY not found in .env"
    exit 1
  fi
  print_success "Z_AI_API_KEY configured"
}

create_output_dir() {
  mkdir -p "$OUTPUT_DIR"
  print_info "Output directory: $OUTPUT_DIR"
}

run_layer() {
  local layer_num=$1
  local script_name=$2
  local skip_flag=$3

  print_header "LAYER $layer_num"

  if [ "$VALIDATE_ONLY" = true ]; then
    print_warning "Skipping execution (validate-only mode)"
    return 0
  fi

  if [ "$skip_flag" = true ]; then
    print_warning "Skipping Layer $layer_num (--skip-layer$layer_num)"
    return 0
  fi

  print_section "Running Layer $layer_num Test"

  local start_time=$(date +%s)

  if node "$SCRIPT_DIR/$script_name"; then
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    print_success "Layer $layer_num test passed in ${duration}s"
    return 0
  else
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    print_error "Layer $layer_num test failed after ${duration}s"
    return 1
  fi
}

validate_layer() {
  local layer_num=$1
  local validation_script=$2

  print_section "Validating Layer $layer_num Results"

  if node "$SCRIPT_DIR/$validation_script"; then
    print_success "Layer $layer_num validation passed"
    return 0
  else
    print_error "Layer $layer_num validation failed"
    return 1
  fi
}

generate_summary() {
  print_header "TEST SUITE SUMMARY"

  local layer1_result="NOT RUN"
  local layer2_result="NOT RUN"
  local layer3_result="NOT RUN"

  # Check Layer 1 results
  if [ -f "$OUTPUT_DIR/validation-layer1-mesh.json" ]; then
    if grep -q '"success": true' "$OUTPUT_DIR/validation-layer1-mesh.json"; then
      layer1_result="${GREEN}✅ PASSED${NC}"
    else
      layer1_result="${RED}❌ FAILED${NC}"
    fi
  fi

  # Check Layer 2 results
  if [ -f "$OUTPUT_DIR/layer2-validation-report.json" ]; then
    if grep -q '"passed": true' "$OUTPUT_DIR/layer2-validation-report.json"; then
      layer2_result="${GREEN}✅ PASSED${NC}"
    else
      layer2_result="${RED}❌ FAILED${NC}"
    fi
  fi

  # Check Layer 3 results
  if [ -f "$OUTPUT_DIR/layer3-validation-report.json" ]; then
    if grep -q '"passed": true' "$OUTPUT_DIR/layer3-validation-report.json"; then
      layer3_result="${GREEN}✅ PASSED${NC}"
    else
      layer3_result="${RED}❌ FAILED${NC}"
    fi
  fi

  echo ""
  echo -e "${CYAN}Layer 1 (Mesh Coordination):${NC}        $layer1_result"
  echo -e "${CYAN}Layer 2 (Review Coordination):${NC}      $layer2_result"
  echo -e "${CYAN}Layer 3 (Error Handling):${NC}           $layer3_result"
  echo ""

  # Print file locations
  print_section "Result Files"
  echo "  Layer 1: $OUTPUT_DIR/validation-layer1-mesh.json"
  echo "  Layer 2: $OUTPUT_DIR/layer2-results.json"
  echo "  Layer 2 Validation: $OUTPUT_DIR/layer2-validation-report.json"
  echo "  Layer 3: $OUTPUT_DIR/layer3-results.json"
  echo "  Layer 3 Validation: $OUTPUT_DIR/layer3-validation-report.json"
  echo ""
}

##############################################################################
# Main Execution
##############################################################################

print_header "3-LAYER MESH COORDINATION TEST SUITE"

echo "Configuration:"
echo "  Skip Layer 1: $SKIP_LAYER1"
echo "  Skip Layer 2: $SKIP_LAYER2"
echo "  Skip Layer 3: $SKIP_LAYER3"
echo "  Validate Only: $VALIDATE_ONLY"
echo "  Clean Redis: $CLEAN_REDIS"
echo ""

# Pre-flight checks
check_dependencies
check_redis
create_output_dir

# Clean Redis if requested
if [ "$CLEAN_REDIS" = true ]; then
  clean_redis
fi

# Track overall success
OVERALL_SUCCESS=true

# Layer 1: Mesh Coordination
if ! run_layer 1 "layer1-mesh-coordination.js" "$SKIP_LAYER1"; then
  OVERALL_SUCCESS=false
  print_error "Layer 1 execution failed"

  if [ "$SKIP_LAYER2" = false ] || [ "$SKIP_LAYER3" = false ]; then
    print_warning "Stopping execution (Layer 1 failed)"
    generate_summary
    exit 1
  fi
fi

# Validate Layer 1 (if validate-layer1.js exists)
if [ -f "$SCRIPT_DIR/validate-layer1.js" ] && [ "$SKIP_LAYER1" = false ]; then
  if ! validate_layer 1 "validate-layer1.js"; then
    print_warning "Layer 1 validation failed (continuing anyway)"
  fi
fi

# Layer 2: Review Coordination
if ! run_layer 2 "layer2-review-coordination.js" "$SKIP_LAYER2"; then
  OVERALL_SUCCESS=false
  print_error "Layer 2 execution failed"

  if [ "$SKIP_LAYER3" = false ]; then
    print_warning "Stopping execution (Layer 2 failed)"
    generate_summary
    exit 1
  fi
fi

# Validate Layer 2
if [ "$SKIP_LAYER2" = false ] || [ "$VALIDATE_ONLY" = true ]; then
  if ! validate_layer 2 "validate-layer2.js"; then
    OVERALL_SUCCESS=false
    print_error "Layer 2 validation failed"
  fi
fi

# Layer 3: Error Handling & Retry
if ! run_layer 3 "layer3-error-retry.js" "$SKIP_LAYER3"; then
  OVERALL_SUCCESS=false
  print_error "Layer 3 execution failed"
fi

# Validate Layer 3
if [ "$SKIP_LAYER3" = false ] || [ "$VALIDATE_ONLY" = true ]; then
  if ! validate_layer 3 "validate-layer3.js"; then
    OVERALL_SUCCESS=false
    print_error "Layer 3 validation failed"
  fi
fi

# Generate summary
generate_summary

# Final result
print_header "FINAL RESULT"

if [ "$OVERALL_SUCCESS" = true ]; then
  echo -e "${GREEN}🎉 ALL LAYERS PASSED!${NC}"
  echo ""
  echo "The 3-layer mesh coordination test suite completed successfully:"
  echo "  ✅ Layer 1: Mesh coordination with claim negotiation"
  echo "  ✅ Layer 2: Dynamic reviewer pool management"
  echo "  ✅ Layer 3: Error injection and retry coordination"
  echo ""
  exit 0
else
  echo -e "${RED}❌ SOME LAYERS FAILED${NC}"
  echo ""
  echo "Review the logs above for details on failures."
  echo "Result files are available in: $OUTPUT_DIR"
  echo ""
  exit 1
fi
