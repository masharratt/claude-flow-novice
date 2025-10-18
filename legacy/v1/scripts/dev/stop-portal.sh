#!/bin/bash

# Claude Flow Personal Web Portal Stop Script
# Graceful shutdown script for the web portal system

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.portal.pid"
FRONTEND_PID_FILE="$PROJECT_ROOT/.frontend.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to stop portal processes
stop_portal() {
    log "🛑 Stopping Claude Flow Personal Web Portal..."

    local processes_stopped=false

    # Stop PM2 processes first
    if command_exists pm2; then
        if pm2 list 2>/dev/null | grep -q "claude-flow-portal"; then
            info "Stopping PM2 process: claude-flow-portal"
            pm2 stop claude-flow-portal 2>/dev/null || warn "Failed to stop PM2 process"
            pm2 delete claude-flow-portal 2>/dev/null || warn "Failed to delete PM2 process"
            processes_stopped=true
        fi
    fi

    # Stop main portal server process
    if [[ -f "$PID_FILE" ]]; then
        local portal_pid
        portal_pid=$(cat "$PID_FILE")

        if kill -0 "$portal_pid" 2>/dev/null; then
            info "Stopping portal server process (PID: $portal_pid)..."
            kill -TERM "$portal_pid" 2>/dev/null || kill -KILL "$portal_pid" 2>/dev/null || true

            # Wait for graceful shutdown
            for i in {1..10}; do
                if ! kill -0 "$portal_pid" 2>/dev/null; then
                    break
                fi
                sleep 1
            done

            # Force kill if still running
            if kill -0 "$portal_pid" 2>/dev/null; then
                warn "Force killing portal server process..."
                kill -KILL "$portal_pid" 2>/dev/null || true
            fi

            processes_stopped=true
        fi

        rm -f "$PID_FILE"
    fi

    # Stop frontend development server
    if [[ -f "$FRONTEND_PID_FILE" ]]; then
        local frontend_pid
        frontend_pid=$(cat "$FRONTEND_PID_FILE")

        if kill -0 "$frontend_pid" 2>/dev/null; then
            info "Stopping frontend development server (PID: $frontend_pid)..."
            kill -TERM "$frontend_pid" 2>/dev/null || kill -KILL "$frontend_pid" 2>/dev/null || true
            processes_stopped=true
        fi

        rm -f "$FRONTEND_PID_FILE"
    fi

    # Kill any remaining processes by name
    local portal_processes
    portal_processes=$(pgrep -f "portal-server" 2>/dev/null || true)
    if [[ -n "$portal_processes" ]]; then
        info "Stopping remaining portal server processes..."
        echo "$portal_processes" | xargs -r kill -TERM 2>/dev/null || true
        sleep 2
        echo "$portal_processes" | xargs -r kill -KILL 2>/dev/null || true
        processes_stopped=true
    fi

    # Kill any remaining React development servers
    local react_processes
    react_processes=$(pgrep -f "react-scripts" 2>/dev/null || true)
    if [[ -n "$react_processes" ]]; then
        info "Stopping React development servers..."
        echo "$react_processes" | xargs -r kill -TERM 2>/dev/null || true
        sleep 2
        echo "$react_processes" | xargs -r kill -KILL 2>/dev/null || true
        processes_stopped=true
    fi

    if [[ "$processes_stopped" == true ]]; then
        log "✅ Portal processes stopped successfully"
    else
        warn "No running portal processes found"
    fi
}

# Function to execute coordination hooks
execute_shutdown_hooks() {
    log "🪝 Executing shutdown coordination hooks..."

    # Session-end hook for portal shutdown
    if command_exists npx && npx claude-flow@alpha --version >/dev/null 2>&1; then
        info "Executing Claude Flow session-end hook..."
        npx claude-flow@alpha hooks session-end \
            --export-metrics true \
            --save-state true \
            --reason "manual-shutdown" || warn "Session-end hook failed"
    else
        warn "Claude Flow not available, skipping coordination hooks"
    fi

    log "✅ Shutdown hooks complete"
}

# Function to cleanup temporary files
cleanup_files() {
    log "🧹 Cleaning up temporary files..."

    # Remove PID files
    rm -f "$PID_FILE" "$FRONTEND_PID_FILE"

    # Clean up temporary directories if they exist and are empty
    local temp_dirs=("$PROJECT_ROOT/.tmp" "$PROJECT_ROOT/tmp")
    for dir in "${temp_dirs[@]}"; do
        if [[ -d "$dir" ]] && [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
            rmdir "$dir" 2>/dev/null || true
        fi
    done

    log "✅ Cleanup complete"
}

# Function to show status
show_status() {
    log "📊 Portal Status Check"
    echo ""

    # Check for running processes
    local portal_running=false
    local frontend_running=false

    if [[ -f "$PID_FILE" ]]; then
        local portal_pid
        portal_pid=$(cat "$PID_FILE")
        if kill -0 "$portal_pid" 2>/dev/null; then
            info "✅ Portal server running (PID: $portal_pid)"
            portal_running=true
        else
            warn "❌ Portal server not running (stale PID file)"
            rm -f "$PID_FILE"
        fi
    fi

    if [[ -f "$FRONTEND_PID_FILE" ]]; then
        local frontend_pid
        frontend_pid=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$frontend_pid" 2>/dev/null; then
            info "✅ Frontend dev server running (PID: $frontend_pid)"
            frontend_running=true
        else
            warn "❌ Frontend dev server not running (stale PID file)"
            rm -f "$FRONTEND_PID_FILE"
        fi
    fi

    # Check PM2 processes
    if command_exists pm2; then
        if pm2 list 2>/dev/null | grep -q "claude-flow-portal"; then
            info "✅ PM2 process running"
            portal_running=true
        fi
    fi

    # Check by process name
    if pgrep -f "portal-server" >/dev/null 2>&1; then
        info "✅ Portal server process found"
        portal_running=true
    fi

    if pgrep -f "react-scripts" >/dev/null 2>&1; then
        info "✅ React dev server process found"
        frontend_running=true
    fi

    echo ""
    if [[ "$portal_running" == false ]] && [[ "$frontend_running" == false ]]; then
        log "🔴 No portal processes running"
    else
        log "🟢 Portal processes are running"
    fi
}

# Function to show help
show_help() {
    cat << EOF
Claude Flow Personal Web Portal Stop Script

Usage: $0 [OPTIONS]

Options:
    -h, --help      Show this help message
    -s, --status    Show portal status without stopping
    -f, --force     Force kill all processes
    --skip-hooks    Skip coordination hooks
    --verbose       Enable verbose logging

Examples:
    $0              # Stop portal gracefully
    $0 --status     # Check portal status
    $0 --force      # Force stop all processes

For more information, visit:
    https://github.com/ruvnet/claude-flow
EOF
}

# Parse command line arguments
FORCE_STOP=false
SKIP_HOOKS=false
VERBOSE=false
STATUS_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -s|--status)
            STATUS_ONLY=true
            shift
            ;;
        -f|--force)
            FORCE_STOP=true
            shift
            ;;
        --skip-hooks)
            SKIP_HOOKS=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            set -x
            shift
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    if [[ "$STATUS_ONLY" == true ]]; then
        show_status
        exit 0
    fi

    log "🛑 Claude Flow Personal Web Portal Shutdown"
    echo ""

    if [[ "$SKIP_HOOKS" != true ]]; then
        execute_shutdown_hooks
    else
        warn "Skipping coordination hooks as requested"
    fi

    stop_portal
    cleanup_files

    log "✅ Claude Flow Personal Web Portal stopped successfully"
}

# Run main function
main "$@"