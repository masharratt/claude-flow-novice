#!/bin/bash
# Parallelization Validation Suite CLI Wrapper
#
# Usage:
#   ./run-validation-suite.sh              # Run all tests
#   ./run-validation-suite.sh --json       # Output JSON only
#   ./run-validation-suite.sh --ci         # CI mode (quiet output)
#   ./run-validation-suite.sh --help       # Show help

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

# Show help
show_help() {
    cat << EOF
🧪 Parallelization Validation Suite

Orchestrates all parallelization tests and validates against production
readiness checklist from ASSUMPTIONS_AND_TESTING.md (lines 685-705)

Usage:
  $0 [options]

Options:
  --json          Output JSON report only (no colored output)
  --ci            CI mode (quiet output, exit codes only)
  --help          Show this help message

Exit Codes:
  0 - All tests passed, production ready
  1 - Critical test failures, not production ready
  2 - Test execution error

Examples:
  # Run full validation suite
  $0

  # Run in CI pipeline
  $0 --ci

  # Get JSON report
  $0 --json > validation-report.json

Checklist Validation:
  ✅ Before Production (6 tests)
     - Redis pub/sub benchmark: >10K msg/sec sustained
     - Test lock serialization: 0 port conflicts in 100 runs
     - Orphan detection: <10MB memory growth over 10 epics
     - Productive waiting: >50% efficiency measured
     - API key rotation: 0 failures with 3 keys @ 3x rate limit
     - Deadlock prevention: <35s timeout for circular deps

  ✅ Chaos Tests (4 tests)
     - 30% random agent crashes → 100% cleanup within 3min
     - Redis connection failures → Recovery within 30s
     - Concurrent file edits → 100% conflict detection
     - Test lock crashes → Stale lock release within 15min

  ✅ Performance Benchmarks (3 tests)
     - 3 independent sprints: <40min (baseline: 75min)
     - 5 mixed sprints: <60min (baseline: 125min)
     - 10 sprints: <100min (baseline: 250min)

EOF
}

# Parse arguments
JSON_MODE=false
CI_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --json)
            JSON_MODE=true
            shift
            ;;
        --ci)
            CI_MODE=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 2
            ;;
    esac
done

# Check for tsx
if ! command -v tsx &> /dev/null; then
    print_error "tsx not found. Installing..."
    cd "$ROOT_DIR"
    npm install -g tsx || {
        print_error "Failed to install tsx"
        exit 2
    }
fi

# Check for Redis
if ! command -v redis-cli &> /dev/null; then
    print_warning "redis-cli not found. Some tests may fail."
    print_info "Install Redis: npm run redis:setup"
fi

# Print banner (unless in JSON mode)
if [ "$JSON_MODE" = false ] && [ "$CI_MODE" = false ]; then
    echo ""
    echo "======================================================================"
    echo "🧪 PARALLELIZATION VALIDATION SUITE"
    echo "======================================================================"
    echo ""
    print_info "Running comprehensive validation against production checklist..."
    echo ""
fi

# Run the TypeScript validation suite
cd "$ROOT_DIR"

if [ "$CI_MODE" = true ]; then
    # CI mode: minimal output
    tsx "$SCRIPT_DIR/run-validation-suite.ts" > /dev/null 2>&1
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        print_success "Production ready"
    else
        print_error "Not production ready"
    fi
    exit $EXIT_CODE
elif [ "$JSON_MODE" = true ]; then
    # JSON mode: run and output JSON report
    tsx "$SCRIPT_DIR/run-validation-suite.ts" > /dev/null 2>&1
    EXIT_CODE=$?
    cat "$SCRIPT_DIR/validation-report.json"
    exit $EXIT_CODE
else
    # Normal mode: full output
    tsx "$SCRIPT_DIR/run-validation-suite.ts"
    EXIT_CODE=$?
fi

# Print final summary
echo ""
if [ $EXIT_CODE -eq 0 ]; then
    print_success "Validation suite passed - Production ready!"
    echo ""
    print_info "Next steps:"
    echo "  1. Review validation report: tests/parallelization/validation-report.json"
    echo "  2. Deploy to production"
    echo "  3. Monitor metrics in Grafana dashboard"
else
    print_error "Validation suite failed - Fix critical issues before production"
    echo ""
    print_info "Next steps:"
    echo "  1. Review failures: tests/parallelization/validation-report.json"
    echo "  2. Fix critical issues"
    echo "  3. Re-run validation: ./run-validation-suite.sh"
fi
echo ""

exit $EXIT_CODE
