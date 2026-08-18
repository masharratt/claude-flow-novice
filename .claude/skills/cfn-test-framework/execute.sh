#!/usr/bin/env bash
# Main entry point for cfn-test-framework skill
# Unified CLI interface for test execution, benchmarking, and webapp testing

set -euo pipefail

# Source shared utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_LIB="$SCRIPT_DIR/../shared/lib"

# shellcheck source=../shared/lib/path-utils.sh
if [[ -f "$SHARED_LIB/path-utils.sh" ]]; then
    source "$SHARED_LIB/path-utils.sh"
fi

# Skill metadata
SKILL_NAME="cfn-test-framework"
SKILL_VERSION="1.0.0"
SKILL_DIR="$SCRIPT_DIR"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print usage information
show_help() {
    cat << 'EOF'
cfn-test-framework v1.0.0

Unified CLI interface for CFN test framework providing test execution, benchmarking, and webapp testing capabilities.

USAGE:
    execute.sh <command> [options]

COMMANDS:
    test [component]       Run tests
        component: execution, runner, webapp, or all (default: all)
        
    benchmark [component]  Run benchmarks
        component: execution, runner, or all (default: all)
        
    report                 Generate test reports
    webapp                 Run webapp tests
    health                 Check framework health
    init                   Initialize framework components

OPTIONS:
    -h, --help          Show this help message
    -v, --version       Show version information
    -d, --debug         Enable debug output
    --parallel          Run tests in parallel (where supported)
    --output FORMAT     Output format: text, json, html (default: text)
    --threshold NUM     Regression threshold percentage (default: 0.10)

EXAMPLES:
    # Run all tests
    ./execute.sh test
    
    # Run only execution tests
    ./execute.sh test execution
    
    # Run all benchmarks with JSON output
    ./execute.sh benchmark --output json
    
    # Generate HTML report
    ./execute.sh report --output html
    
    # Run webapp visual tests
    ./execute.sh webapp
    
    # Initialize framework
    ./execute.sh init

For more information, see: SKILL.md
EOF
}

# Show version
show_version() {
    echo "$SKILL_NAME version $SKILL_VERSION"
}

# Enable debug mode
enable_debug() {
    set -x
    export DEBUG=true
    echo "Debug mode enabled"
}

# Validate dependencies
check_dependencies() {
    local component="${1:-all}"
    local missing=()

    # Check for basic commands
    for cmd in npm sqlite3 jq; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done

    # Check for Redis (optional but recommended)
    if ! command -v redis-cli &> /dev/null; then
        echo -e "${YELLOW}Warning: redis-cli not found. Some features may not work properly.${NC}" >&2
    fi

    # Check for Playwright (webapp testing)
    if [[ "$component" == "webapp" ]] || [[ "$component" == "all" ]]; then
        if ! npm list playwright &> /dev/null; then
            echo -e "${YELLOW}Warning: Playwright not installed. Webapp testing requires 'npm install playwright'${NC}" >&2
        fi
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${RED}Error: Missing required dependencies:${NC}" >&2
        for dep in "${missing[@]}"; do
            echo "  - $dep" >&2
        done
        return 1
    fi
}

# Initialize framework
initialize() {
    echo -e "${GREEN}Initializing CFN Test Framework...${NC}"

    # Initialize benchmark database
    if [[ -f "$SKILL_DIR/lib/runner/init-benchmark-db.sh" ]]; then
        echo "Initializing benchmark database..."
        "$SKILL_DIR/lib/runner/init-benchmark-db.sh"
    fi

    # Initialize webapp storage
    if [[ -f "$SKILL_DIR/lib/webapp/init-storage.sh" ]]; then
        echo "Initializing webapp testing storage..."
        "$SKILL_DIR/lib/webapp/init-storage.sh"
    fi

    echo -e "${GREEN}Framework initialized successfully${NC}"
}

# Command handlers
handle_test() {
    local component="${1:-all}"
    echo -e "${GREEN}Running tests for: $component${NC}"

    case "$component" in
        "execution"|"all")
            if [[ -f "$SKILL_DIR/lib/execution/test-coordinator-pattern.sh" ]]; then
                echo "Running execution tests..."
                "$SKILL_DIR/lib/execution/test-coordinator-pattern.sh" "test-$(date +%s)"
            fi
            ;;
    esac

    case "$component" in
        "runner"|"all")
            if [[ -f "$SKILL_DIR/lib/runner/run-all-tests.sh" ]]; then
                echo "Running test suite..."
                "$SKILL_DIR/lib/runner/run-all-tests.sh" --suite all --benchmark --detect-regressions
            fi
            ;;
    esac

    case "$component" in
        "webapp"|"all")
            if [[ -f "$SKILL_DIR/lib/webapp/test-webapp-testing.sh" ]]; then
                echo "Running webapp tests..."
                "$SKILL_DIR/lib/webapp/test-webapp-testing.sh"
            fi
            ;;
    esac

    if [[ ! "$component" =~ ^(execution|runner|webapp|all)$ ]]; then
        echo -e "${RED}Error: Unknown component '$component'${NC}" >&2
        echo "Valid components: execution, runner, webapp, all" >&2
        return 1
    fi
}

handle_benchmark() {
    local component="${1:-all}"
    echo -e "${GREEN}Running benchmarks for: $component${NC}"

    case "$component" in
        "execution"|"all")
            if [[ -f "$SKILL_DIR/lib/execution/test-coordinator-pattern.sh" ]]; then
                echo "Benchmarking execution performance..."
                # Run with timing
                time "$SKILL_DIR/lib/execution/test-coordinator-pattern.sh" "benchmark-$(date +%s)"
            fi
            ;;
    esac

    case "$component" in
        "runner"|"all")
            if [[ -f "$SKILL_DIR/lib/runner/run-all-tests.sh" ]]; then
                echo "Running suite benchmarks..."
                "$SKILL_DIR/lib/runner/run-all-tests.sh" --suite all --benchmark --output "${OUTPUT_FORMAT:-text}"
            fi
            ;;
    esac

    if [[ ! "$component" =~ ^(execution|runner|all)$ ]]; then
        echo -e "${RED}Error: Unknown component '$component' for benchmarking${NC}" >&2
        echo "Valid components: execution, runner, all" >&2
        return 1
    fi
}

handle_report() {
    echo -e "${GREEN}Generating test reports...${NC}"

    # Generate benchmark report if database exists
    if [[ -f ".artifacts/test-benchmarks.db" ]]; then
        echo "Generating benchmark report..."
        sqlite3 ".artifacts/test-benchmarks.db" << 'EOF'
.headers on
.mode table
SELECT 
    suite_name,
    COUNT(*) as total_runs,
    AVG(duration_ms) as avg_duration,
    MIN(duration_ms) as min_duration,
    MAX(duration_ms) as max_duration
FROM test_runs
WHERE created_at > datetime('now', '-7 days')
GROUP BY suite_name
ORDER BY avg_duration DESC;
EOF
    fi

    # Check for test results
    if [[ -f ".artifacts/test-results/latest.json" ]]; then
        echo "Latest test results:"
        jq -r '.suites | to_entries[] | "\(.key): \(.value.passed)/\(.value.total) passed (\(.value.success_rate * 100 | floor)%)"' \
            ".artifacts/test-results/latest.json" 2>/dev/null || echo "No recent test results found"
    fi

    # Generate HTML report if requested
    if [[ "${OUTPUT_FORMAT}" == "html" ]]; then
        echo "HTML report generation not yet implemented"
    fi
}

handle_webapp() {
    echo -e "${GREEN}Running webapp testing suite...${NC}"

    # Initialize storage if needed
    if [[ ! -d ".screenshots" ]]; then
        "$SKILL_DIR/lib/webapp/init-storage.sh"
    fi

    # Run webapp test validation
    if [[ -f "$SKILL_DIR/lib/webapp/test-webapp-testing.sh" ]]; then
        "$SKILL_DIR/lib/webapp/test-webapp-testing.sh"
    else
        echo -e "${RED}Error: Webapp testing not properly installed${NC}" >&2
        return 1
    fi
}

handle_health() {
    echo -e "${GREEN}Checking CFN Test Framework health...${NC}"

    local issues=0

    # Check dependencies
    echo -n "Checking dependencies... "
    if check_dependencies "all" &>/dev/null; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAIL${NC}"
        ((issues++))
    fi

    # Check skill components
    for component in execution runner webapp; do
        echo -n "Checking $component component... "
        if [[ -d "$SKILL_DIR/lib/$component" ]]; then
            echo -e "${GREEN}OK${NC}"
        else
            echo -e "${RED}MISSING${NC}"
            ((issues++))
        fi
    done

    # Check Redis connection
    echo -n "Checking Redis connection... "
    if command -v redis-cli &> /dev/null && redis-cli ping &>/dev/null; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${YELLOW}WARNING${NC}"
    fi

    # Summary
    if [[ $issues -eq 0 ]]; then
        echo -e "\n${GREEN}Framework health: Excellent${NC}"
    else
        echo -e "\n${RED}Framework health: $issues issue(s) found${NC}"
    fi
}

# Main execution
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--version)
                show_version
                exit 0
                ;;
            -d|--debug)
                enable_debug
                shift
                ;;
            --parallel)
                export PARALLEL=true
                shift
                ;;
            --output)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            --threshold)
                THRESHOLD="$2"
                export THRESHOLD
                shift 2
                ;;
            *)
                COMMAND="$1"
                shift
                break
                ;;
        esac
    done

    # Initialize skill
    # Check dependencies
    if ! check_dependencies "${COMMAND:-all}"; then
        echo -e "${RED}Dependency check failed. Use --debug for more details.${NC}" >&2
        exit 1
    fi

    # Execute command
    if [[ -z "${COMMAND:-}" ]]; then
        echo -e "${RED}Error: No command specified${NC}" >&2
        echo "Use '$0 --help' for usage information" >&2
        exit 1
    fi

    case "$COMMAND" in
        test)
            handle_test "$@"
            ;;
        benchmark)
            handle_benchmark "$@"
            ;;
        report)
            handle_report
            ;;
        webapp)
            handle_webapp
            ;;
        health)
            handle_health
            ;;
        init)
            initialize
            ;;
        *)
            echo -e "${RED}Error: Unknown command: $COMMAND${NC}" >&2
            echo "Use '$0 --help' for available commands" >&2
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"