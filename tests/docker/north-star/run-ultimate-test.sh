#!/usr/bin/env bash
# tests/docker/north-star/run-ultimate-test.sh
# Run the ultimate CFN Loop test that puts it all together

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  log_step "Cleanup: Ultimate test runner artifacts"
  rm -rf /tmp/north-star-runner-ultimate-* || true
}
trap cleanup EXIT

main() {
  annotate "Ultimate CFN Loop Test Runner" \
    "Executes the complete coordinator → loops → agents → iterations workflow"

  log_info "🚀 Running Ultimate CFN Loop Test"
  log_info "This test demonstrates the complete CFN Loop methodology:"
  log_info ""
  log_info "📋 Test Features:"
  log_info "  ✅ Complete CFN Loop workflow orchestration"
  log_info "  ✅ 3 full iterations with progressive improvement"
  log_info "  ✅ 4 Loop 3 agents per iteration (react-frontend-engineer, ui-designer, typescript-specialist, api-documentation)"
  log_info "  ✅ 3 Loop 2 validators per iteration (code-quality-validator, accessibility-advocate-persona, interaction-tester)"
  log_info "  ✅ Product Owner decision making (PROCEED/ITERATE logic)"
  log_info "  ✅ Redis coordination with 29+ coordination keys"
  log_info "  ✅ Quality gate enforcement (95% pass rate, 90% consensus)"
  log_info "  ✅ Final deliverable creation and validation"
  log_info "  ✅ Real HTML, CSS, JavaScript, and documentation files"
  log_info ""
  log_info "🎯 Expected Results:"
  log_info "  - Complete API documentation website"
  log_info "  - Iterative quality improvement (83% → 91% → 99%)"
  log_info "  - Consensus validation (91% → 94% → 97%)"
  log_info "  - Production-ready deliverables"
  log_info ""
  log_info "⏱️  Expected duration: 1-2 minutes"
  log_info ""

  # Run the ultimate test
  local ultimate_test="$PROJECT_ROOT/tests/docker/north-star/06-integration/test-ultimate-practical.sh"

  if [ ! -f "$ultimate_test" ]; then
    log_error "Ultimate CFN Loop test not found: $ultimate_test"
    exit 1
  fi

  log_info "Executing: $(basename "$ultimate_test")"
  echo "================================"

  # Execute with timeout and capture results
  local start_time=$(date +%s)
  timeout 300 "$ultimate_test"
  local exit_code=$?
  local duration=$(($(date +%s) - start_time))

  echo "================================"

  # Evaluate results
  if [ $exit_code -eq 0 ]; then
    log_success "🎉 Ultimate CFN Loop Test PASSED!"
    log_info "✅ Complete workflow executed successfully in ${duration}s"
    log_info ""
    log_info "📊 Test Summary:"
    log_info "  - CFN Loop methodology validated"
    log_info "  - Multi-iteration coordination proven"
    log_info "  - Agent orchestration working"
    log_info "  - Quality gates enforced"
    log_info "  - Deliverables created and verified"
    log_info ""
    log_info "🏆 This demonstrates a fully functional CFN Loop system!"
    exit 0
  elif [ $exit_code -eq 124 ]; then
    log_error "❌ Ultimate CFN Loop Test TIMEOUT (300s)"
    exit 1
  else
    log_error "❌ Ultimate CFN Loop Test FAILED (exit code: $exit_code)"
    exit 1
  fi
}

# Execute ultimate test runner
main "$@"