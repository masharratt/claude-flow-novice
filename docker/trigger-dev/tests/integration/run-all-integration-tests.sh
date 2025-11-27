#!/bin/bash
# ============================================================================
# CFN Loop Integration Test Runner
# ============================================================================
# Runs all integration tests for the CFN Loop Trigger.dev infrastructure.
#
# Prerequisites:
# - Docker with cfn-postgres and cfn-redis running
# - Node.js 20+
# - npm dependencies installed
#
# Usage:
#   ./run-all-integration-tests.sh [--skip-prereq] [--verbose]
#
# Options:
#   --skip-prereq   Skip prerequisite checks
#   --verbose       Show detailed output
#   --db-only       Run only database validation tests
#   --mvp-only      Run only simple task MVP tests
#   --standard-only Run only library creation standard tests
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_START_TIME=$(date +%s)

# Flags
SKIP_PREREQ=false
VERBOSE=false
DB_ONLY=false
MVP_ONLY=false
STANDARD_ONLY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-prereq)
            SKIP_PREREQ=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --db-only)
            DB_ONLY=true
            shift
            ;;
        --mvp-only)
            MVP_ONLY=true
            shift
            ;;
        --standard-only)
            STANDARD_ONLY=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_header() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed"
        return 1
    fi
    return 0
}

check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^$1$"; then
        log_error "Container $1 is not running"
        return 1
    fi
    return 0
}

run_test() {
    local test_name=$1
    local test_file=$2
    local start_time=$(date +%s)

    log_info "Running: $test_name"

    if [ "$VERBOSE" = true ]; then
        if npx tsx "$test_file"; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            log_success "$test_name completed in ${duration}s"
            ((TESTS_PASSED++))
            return 0
        else
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            log_error "$test_name failed after ${duration}s"
            ((TESTS_FAILED++))
            return 1
        fi
    else
        if npx tsx "$test_file" > /tmp/test-output-$$.log 2>&1; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            log_success "$test_name completed in ${duration}s"
            ((TESTS_PASSED++))
            return 0
        else
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            log_error "$test_name failed after ${duration}s"
            echo "  Output:"
            tail -20 /tmp/test-output-$$.log | sed 's/^/    /'
            ((TESTS_FAILED++))
            return 1
        fi
    fi
}

# ============================================================================
# Prerequisite Checks
# ============================================================================

check_prerequisites() {
    log_header "Checking Prerequisites"

    local prereq_failed=false

    # Check commands
    log_info "Checking required commands..."
    for cmd in docker node npx; do
        if check_command "$cmd"; then
            log_success "$cmd is available"
        else
            prereq_failed=true
        fi
    done

    # Check Node.js version
    local node_version=$(node --version | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -ge 20 ]; then
        log_success "Node.js version $node_version (>= 20 required)"
    else
        log_error "Node.js version $node_version is too old (>= 20 required)"
        prereq_failed=true
    fi

    # Check Docker containers
    log_info "Checking Docker containers..."
    if check_container "cfn-postgres"; then
        log_success "cfn-postgres is running"
    else
        log_warning "cfn-postgres not running. Start with: docker compose -f docker-compose.cfn.yml up -d"
        prereq_failed=true
    fi

    if check_container "cfn-redis"; then
        log_success "cfn-redis is running"
    else
        log_warning "cfn-redis not running. Start with: docker compose -f docker-compose.cfn.yml up -d"
        prereq_failed=true
    fi

    # Check PostgreSQL connectivity
    log_info "Checking PostgreSQL connectivity..."
    if docker exec cfn-postgres psql -U cfn -d cfn_loop -c "SELECT 1" > /dev/null 2>&1; then
        log_success "PostgreSQL is accessible"
    else
        log_error "Cannot connect to PostgreSQL"
        prereq_failed=true
    fi

    # Check Redis connectivity
    log_info "Checking Redis connectivity..."
    if docker exec cfn-redis redis-cli PING | grep -q "PONG"; then
        log_success "Redis is accessible"
    else
        log_error "Cannot connect to Redis"
        prereq_failed=true
    fi

    # Check database schema
    log_info "Checking database schema..."
    local table_count=$(docker exec cfn-postgres psql -U cfn -d cfn_loop -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d ' ')
    if [ "$table_count" -ge 8 ]; then
        log_success "Database schema exists ($table_count tables)"
    else
        log_warning "Database schema incomplete ($table_count tables). Running init..."
        docker exec -i cfn-postgres psql -U cfn -d cfn_loop < "$PROJECT_DIR/schema/init-db.sql"
    fi

    # Check npm dependencies
    log_info "Checking npm dependencies..."
    if [ -d "$PROJECT_DIR/node_modules" ]; then
        log_success "node_modules exists"
    else
        log_warning "node_modules not found. Running npm install..."
        (cd "$PROJECT_DIR" && npm install)
    fi

    if [ "$prereq_failed" = true ]; then
        log_error "Prerequisites check failed. Fix the issues above and retry."
        exit 1
    fi

    log_success "All prerequisites met"
}

# ============================================================================
# Run Tests
# ============================================================================

run_all_tests() {
    log_header "Starting CFN Integration Tests"

    cd "$PROJECT_DIR"

    # Test 1: Database Validation
    if [ "$MVP_ONLY" = false ] && [ "$STANDARD_ONLY" = false ]; then
        echo ""
        echo -e "${YELLOW}[1/3] Database Validation${NC}"
        echo "-------------------------------------------"
        run_test "Database Validation" "$SCRIPT_DIR/test-database-validation.ts" || true
    fi

    # Test 2: Simple Task MVP
    if [ "$DB_ONLY" = false ] && [ "$STANDARD_ONLY" = false ]; then
        echo ""
        echo -e "${YELLOW}[2/3] Simple Task (MVP Mode)${NC}"
        echo "-------------------------------------------"
        run_test "Simple Task MVP" "$SCRIPT_DIR/test-simple-task-mvp.ts" || true
    fi

    # Test 3: Library Creation Standard
    if [ "$DB_ONLY" = false ] && [ "$MVP_ONLY" = false ]; then
        echo ""
        echo -e "${YELLOW}[3/3] Library Creation (Standard Mode)${NC}"
        echo "-------------------------------------------"
        run_test "Library Creation Standard" "$SCRIPT_DIR/test-library-creation-standard.ts" || true
    fi
}

# ============================================================================
# Summary
# ============================================================================

print_summary() {
    local total_end_time=$(date +%s)
    local total_duration=$((total_end_time - TOTAL_START_TIME))
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))

    log_header "Test Results Summary"

    echo "Total Tests:   $total_tests"
    echo -e "Passed:        ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed:        ${RED}$TESTS_FAILED${NC}"
    echo "Duration:      ${total_duration}s"
    echo ""

    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}============================================${NC}"
        echo -e "${GREEN}  ALL INTEGRATION TESTS PASSED${NC}"
        echo -e "${GREEN}============================================${NC}"
        return 0
    else
        echo -e "${RED}============================================${NC}"
        echo -e "${RED}  SOME TESTS FAILED${NC}"
        echo -e "${RED}============================================${NC}"
        return 1
    fi
}

# ============================================================================
# Main
# ============================================================================

main() {
    echo ""
    echo "CFN Loop Integration Test Suite"
    echo "================================"
    echo ""

    # Check prerequisites unless skipped
    if [ "$SKIP_PREREQ" = false ]; then
        check_prerequisites
    else
        log_warning "Skipping prerequisite checks"
    fi

    # Run tests
    run_all_tests

    # Print summary
    print_summary
    exit_code=$?

    # Clean up temp files
    rm -f /tmp/test-output-$$.log

    exit $exit_code
}

main "$@"
