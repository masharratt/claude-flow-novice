#!/bin/bash

# 50-Agent Stability Test Examples
#
# This script provides convenient commands to run different configurations
# of the 50-agent stability test system.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_SCRIPT="$SCRIPT_DIR/50-agent-test.js"

# Results directory
RESULTS_DIR="$SCRIPT_DIR/stability-results"

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Check if main script exists
check_script() {
    if [[ ! -f "$MAIN_SCRIPT" ]]; then
        error "Main script not found: $MAIN_SCRIPT"
    fi

    if [[ ! -x "$MAIN_SCRIPT" ]]; then
        warn "Making main script executable..."
        chmod +x "$MAIN_SCRIPT"
    fi
}

# Create results directory
setup_results() {
    mkdir -p "$RESULTS_DIR"
    log "Results directory: $RESULTS_DIR"
}

# Show system information
show_system_info() {
    log "System Information:"
    echo "  - OS: $(uname -s)"
    echo "  - Kernel: $(uname -r)"
    echo "  - CPU: $(nproc) cores"
    echo "  - Memory: $(free -h | grep '^Mem:' | awk '{print $2}')"
    echo "  - /dev/shm: $(df -h /dev/shm | tail -1 | awk '{print $2 " (" $4 " free)"}' 2>/dev/null || echo "Not available")"
    echo "  - Node.js: $(node --version 2>/dev/null || echo "Not found")"
    echo "  - Available FD limit: $(ulimit -n)"
    echo ""
}

# Quick validation test
run_quick_test() {
    log "Running quick validation test (5 agents, 5 minutes)..."
    node "$MAIN_SCRIPT" --agents 5 --duration 5 --interval 60 --output-dir "$RESULTS_DIR/quick-test"
}

# Medium scale test
run_medium_test() {
    log "Running medium scale test (20 agents, 30 minutes)..."
    node "$MAIN_SCRIPT" --agents 20 --duration 30 --interval 180 --output-dir "$RESULTS_DIR/medium-test"
}

# Full production test
run_full_test() {
    log "Running FULL 8-hour production test (50 agents)..."
    warn "This test will run for 8 hours. Press Ctrl+C to stop."
    read -p "Continue? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        node "$MAIN_SCRIPT" --agents 50 --duration 480 --interval 300 --output-dir "$RESULTS_DIR/full-test"
    else
        log "Test cancelled."
    fi
}

# High frequency test
run_high_frequency_test() {
    log "Running high frequency test (25 agents, 1-minute intervals, 1 hour)..."
    node "$MAIN_SCRIPT" --agents 25 --duration 60 --interval 60 --output-dir "$RESULTS_DIR/high-freq-test"
}

# Stress test
run_stress_test() {
    log "Running stress test (100 agents, 30-second intervals, 30 minutes)..."
    warn "This is a stress test with high resource usage."
    read -p "Continue? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        node "$MAIN_SCRIPT" --agents 100 --duration 30 --interval 30 --output-dir "$RESULTS_DIR/stress-test"
    else
        log "Test cancelled."
    fi
}

# Custom test
run_custom_test() {
    echo "Custom test configuration:"
    read -p "Number of agents (default: 50): " agents
    read -p "Test duration in minutes (default: 60): " duration
    read -p "Coordination interval in seconds (default: 300): " interval

    agents=${agents:-50}
    duration=${duration:-60}
    interval=${interval:-300}

    log "Running custom test: $agents agents, $duration minutes, $interval-second intervals..."
    node "$MAIN_SCRIPT" --agents "$agents" --duration "$duration" --interval "$interval" --output-dir "$RESULTS_DIR/custom-test"
}

# Monitor existing test
monitor_test() {
    if [[ -d "$RESULTS_DIR" ]]; then
        log "Monitoring stability test results..."

        # Find the most recent test
        latest_test=$(find "$RESULTS_DIR" -name "stability-test.log" -type f | xargs ls -t | head -1)

        if [[ -n "$latest_test" ]]; then
            log "Tailing log file: $latest_test"
            tail -f "$latest_test"
        else
            warn "No test logs found. Run a test first."
        fi
    else
        warn "No results directory found. Run a test first."
    fi
}

# Show results summary
show_results() {
    if [[ -d "$RESULTS_DIR" ]]; then
        log "Available test results:"
        find "$RESULTS_DIR" -name "*.json" -type f | while read -r file; do
            echo "  - $file"
        done

        # Show summary if available
        latest_report=$(find "$RESULTS_DIR" -name "stability-test-report.json" -type f | xargs ls -t | head -1)
        if [[ -n "$latest_report" ]]; then
            echo ""
            log "Latest test summary:"
            if command -v jq >/dev/null 2>&1; then
                jq -r '
                    "Test Duration: " + (.execution.totalDurationHours // "N/A") + " hours",
                    "Cycles Completed: " + (.execution.cyclesCompleted // "N/A"),
                    "Memory Growth: " + (.metrics.memory.growthPct // "N/A") + "%",
                    "FD Variance: " + (.metrics.fileDescriptors.variancePct // "N/A") + "%",
                    "Coordination Variance: " + (.metrics.coordination.variancePct // "N/A") + "%",
                    "Total Crashes: " + (.metrics.crashes.totalCrashes // "N/A"),
                    "Overall Result: " + (.success // "N/A")
                ' "$latest_report"
            else
                echo "Install jq for detailed summary formatting"
            fi
        fi
    else
        warn "No results directory found. Run a test first."
    fi
}

# Cleanup test artifacts
cleanup() {
    log "Cleaning up test artifacts..."

    # Clean up coordination directory
    if [[ -d "/dev/shm/agent-coordination" ]]; then
        warn "Cleaning /dev/shm/agent-coordination..."
        rm -rf /dev/shm/agent-coordination/*
    fi

    # Clean up old results (keep last 3 tests)
    if [[ -d "$RESULTS_DIR" ]]; then
        log "Cleaning old results (keeping last 3 tests)..."
        find "$RESULTS_DIR" -maxdepth 1 -type d -name "*-test" | sort -r | tail -n +4 | xargs rm -rf
    fi

    # Kill any orphaned agent processes
    log "Cleaning orphaned agent processes..."
    pkill -f "agent-worker.js" 2>/dev/null || true

    log "Cleanup completed."
}

# Show usage
show_usage() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  quick          Run quick validation test (5 agents, 5 min)"
    echo "  medium         Run medium scale test (20 agents, 30 min)"
    echo "  full           Run full 8-hour production test (50 agents)"
    echo "  high-freq      Run high frequency test (1-min intervals)"
    echo "  stress         Run stress test (100 agents, 30-sec intervals)"
    echo "  custom         Run custom test with interactive configuration"
    echo "  monitor        Monitor running test (tail log file)"
    echo "  results        Show available test results and summary"
    echo "  cleanup        Clean up test artifacts and orphaned processes"
    echo "  info           Show system information"
    echo "  help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 quick                 # Quick validation"
    echo "  $0 medium                # Medium scale test"
    echo "  $0 full                  # Full production test"
    echo "  $0 monitor               # Monitor running test"
    echo "  $0 results               # Show test results"
    echo ""
}

# Main script logic
main() {
    case "${1:-help}" in
        "quick")
            check_script
            setup_results
            show_system_info
            run_quick_test
            ;;
        "medium")
            check_script
            setup_results
            show_system_info
            run_medium_test
            ;;
        "full")
            check_script
            setup_results
            show_system_info
            run_full_test
            ;;
        "high-freq")
            check_script
            setup_results
            show_system_info
            run_high_frequency_test
            ;;
        "stress")
            check_script
            setup_results
            show_system_info
            run_stress_test
            ;;
        "custom")
            check_script
            setup_results
            show_system_info
            run_custom_test
            ;;
        "monitor")
            monitor_test
            ;;
        "results")
            show_results
            ;;
        "cleanup")
            cleanup
            ;;
        "info")
            show_system_info
            ;;
        "help"|*)
            show_usage
            ;;
    esac
}

# Run main function with all arguments
main "$@"