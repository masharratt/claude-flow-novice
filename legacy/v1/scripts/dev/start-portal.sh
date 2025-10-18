#!/bin/bash

# Claude Flow Personal Web Portal Startup Script
# Environment setup, MCP server connections, and process management

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORTAL_HOST="${WEB_PORTAL_HOST:-localhost}"
PORTAL_PORT="${WEB_PORTAL_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_DEV_PORT:-3001}"
LOG_DIR="$PROJECT_ROOT/logs"
PID_FILE="$PROJECT_ROOT/.portal.pid"
FRONTEND_BUILD_DIR="$PROJECT_ROOT/src/web/frontend/build"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

# Function to check if a port is available
is_port_available() {
    local port=$1
    ! nc -z localhost "$port" >/dev/null 2>&1
}

# Function to wait for port to be ready
wait_for_port() {
    local port=$1
    local timeout=${2:-30}
    local count=0

    while ! nc -z localhost "$port" >/dev/null 2>&1; do
        if [ $count -ge $timeout ]; then
            error "Timeout waiting for port $port to be ready"
            return 1
        fi
        sleep 1
        ((count++))
    done

    log "Port $port is ready"
    return 0
}

# Function to setup environment
setup_environment() {
    log "🔧 Setting up environment..."

    # Create necessary directories
    mkdir -p "$LOG_DIR" "$PROJECT_ROOT/.swarm" "$PROJECT_ROOT/src/web/frontend"

    # Setup Node.js environment if needed
    if [[ -f "$PROJECT_ROOT/package.json" ]] && [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
        log "Installing project dependencies..."
        cd "$PROJECT_ROOT"
        npm install
    fi

    # Check required commands
    local required_commands=("node" "npm" "npx")
    for cmd in "${required_commands[@]}"; do
        if ! command_exists "$cmd"; then
            error "Required command not found: $cmd"
            exit 1
        fi
    done

    # Check Node.js version
    local node_version
    node_version=$(node --version | cut -d'v' -f2)
    local min_version="16.0.0"

    if ! printf '%s\n%s\n' "$min_version" "$node_version" | sort -C -V; then
        error "Node.js version $node_version is below minimum required version $min_version"
        exit 1
    fi

    log "✅ Environment setup complete"
}

# Function to check port availability
check_ports() {
    log "🔍 Checking port availability..."

    if ! is_port_available "$PORTAL_PORT"; then
        error "Port $PORTAL_PORT is already in use"
        error "Please stop the existing service or change WEB_PORTAL_PORT"
        exit 1
    fi

    if ! is_port_available "$FRONTEND_PORT"; then
        warn "Port $FRONTEND_PORT is already in use, frontend development server may not start"
    fi

    log "✅ Ports are available"
}

# Function to setup MCP server connections
setup_mcp_connections() {
    log "🔗 Setting up MCP server connections..."

    # Check if Claude Flow MCP is available
    if command_exists claude; then
        info "Configuring Claude Flow MCP server..."

        # Add Claude Flow MCP server if not already configured
        if ! claude mcp list 2>/dev/null | grep -q "claude-flow"; then
            log "Adding Claude Flow MCP server..."
            claude mcp add claude-flow npx claude-flow@alpha mcp start || warn "Failed to add Claude Flow MCP server"
        else
            info "Claude Flow MCP server already configured"
        fi

        # Add Ruv-Swarm MCP server if available
        if command_exists npx && npx ruv-swarm --version >/dev/null 2>&1; then
            if ! claude mcp list 2>/dev/null | grep -q "ruv-swarm"; then
                log "Adding Ruv-Swarm MCP server..."
                claude mcp add ruv-swarm npx ruv-swarm mcp start || warn "Failed to add Ruv-Swarm MCP server"
            else
                info "Ruv-Swarm MCP server already configured"
            fi
        else
            info "Ruv-Swarm not available, skipping MCP configuration"
        fi

        # Add Flow-Nexus MCP server if enabled
        if [[ "${FLOW_NEXUS_ENABLED:-false}" == "true" ]] && command_exists npx; then
            if ! claude mcp list 2>/dev/null | grep -q "flow-nexus"; then
                log "Adding Flow-Nexus MCP server..."
                claude mcp add flow-nexus npx flow-nexus@latest mcp start || warn "Failed to add Flow-Nexus MCP server"
            else
                info "Flow-Nexus MCP server already configured"
            fi
        fi
    else
        warn "Claude CLI not found, MCP servers cannot be automatically configured"
        info "Please install Claude CLI: https://claude.ai/cli"
    fi

    log "✅ MCP connections setup complete"
}

# Function to build frontend if needed
build_frontend() {
    log "🏗️ Building frontend..."

    cd "$PROJECT_ROOT/src/web/frontend"

    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        log "Frontend package.json not found, skipping frontend build"
        return 0
    fi

    # Install frontend dependencies
    if [[ ! -d "node_modules" ]]; then
        log "Installing frontend dependencies..."
        npm install
    fi

    # Build for production if not in development mode
    if [[ "${NODE_ENV:-development}" != "development" ]]; then
        log "Building frontend for production..."
        npm run build

        if [[ ! -d "$FRONTEND_BUILD_DIR" ]]; then
            error "Frontend build failed - build directory not found"
            exit 1
        fi
    else
        info "Development mode - skipping production build"
    fi

    cd "$PROJECT_ROOT"
    log "✅ Frontend build complete"
}

# Function to execute coordination hooks
execute_pre_hooks() {
    log "🪝 Executing pre-startup coordination hooks..."

    # Pre-task hook for portal startup
    if command_exists npx && npx claude-flow@alpha --version >/dev/null 2>&1; then
        info "Executing Claude Flow pre-task hook..."
        npx claude-flow@alpha hooks pre-task \
            --description "Start Claude Flow Personal Web Portal" \
            --task-type "web-portal-startup" \
            --priority "high" || warn "Pre-task hook failed"

        # Session restore hook
        info "Executing session restore hook..."
        npx claude-flow@alpha hooks session-restore \
            --session-id "web-portal-$(date +%s)" || warn "Session restore hook failed"
    else
        warn "Claude Flow not available, skipping coordination hooks"
    fi

    log "✅ Pre-startup hooks complete"
}

# Function to start the portal server
start_portal_server() {
    log "🚀 Starting Claude Flow Personal Web Portal..."

    cd "$PROJECT_ROOT"

    # Set environment variables
    export NODE_ENV="${NODE_ENV:-development}"
    export WEB_PORTAL_HOST="$PORTAL_HOST"
    export WEB_PORTAL_PORT="$PORTAL_PORT"
    export FRONTEND_DEV_PORT="$FRONTEND_PORT"

    # Start the server
    if [[ "${NODE_ENV}" == "development" ]]; then
        # Development mode with hot reload
        log "Starting in development mode with hot reload..."

        # Start frontend development server in background if in development
        if [[ -f "src/web/frontend/package.json" ]]; then
            info "Starting frontend development server on port $FRONTEND_PORT..."
            cd src/web/frontend
            npm start &
            FRONTEND_PID=$!
            echo $FRONTEND_PID > "$PROJECT_ROOT/.frontend.pid"
            cd "$PROJECT_ROOT"

            # Wait for frontend server to be ready
            sleep 3
        fi

        # Start backend server with nodemon if available
        if command_exists nodemon; then
            nodemon --exec "node --loader=ts-node/esm" src/web/portal-server.ts
        elif command_exists ts-node; then
            ts-node --esm src/web/portal-server.ts
        else
            # Fallback to compiled JavaScript
            if [[ -f "dist/web/portal-server.js" ]]; then
                node dist/web/portal-server.js
            else
                error "TypeScript compilation required. Run 'npm run build' first."
                exit 1
            fi
        fi
    else
        # Production mode
        log "Starting in production mode..."

        # Ensure production build exists
        if [[ ! -f "dist/web/portal-server.js" ]]; then
            error "Production build not found. Run 'npm run build' first."
            exit 1
        fi

        # Start with PM2 if available, otherwise use node
        if command_exists pm2; then
            pm2 start dist/web/portal-server.js \
                --name "claude-flow-portal" \
                --instances "${WEB_PORTAL_WORKERS:-max}" \
                --merge-logs \
                --log-file "$LOG_DIR/portal.log" \
                --error-file "$LOG_DIR/portal-error.log"
        else
            node dist/web/portal-server.js &
            echo $! > "$PID_FILE"
        fi
    fi
}

# Function to execute post-startup hooks
execute_post_hooks() {
    log "🪝 Executing post-startup coordination hooks..."

    # Wait for server to be ready
    if wait_for_port "$PORTAL_PORT" 30; then
        # Post-task hook for successful startup
        if command_exists npx && npx claude-flow@alpha --version >/dev/null 2>&1; then
            info "Executing Claude Flow post-task hook..."
            npx claude-flow@alpha hooks post-task \
                --task-id "web-portal-startup-$(date +%s)" \
                --status "completed" \
                --result "Portal started successfully on $PORTAL_HOST:$PORTAL_PORT" || warn "Post-task hook failed"
        fi

        log "✅ Portal startup complete!"
        info "🌐 Web Portal: http://$PORTAL_HOST:$PORTAL_PORT"
        info "📡 WebSocket: ws://$PORTAL_HOST:$PORTAL_PORT"
        if [[ "${NODE_ENV:-development}" == "development" ]]; then
            info "🔧 Frontend Dev: http://localhost:$FRONTEND_PORT"
        fi
        info "📋 Health Check: http://$PORTAL_HOST:$PORTAL_PORT/api/health"
        info "🔗 MCP Status: http://$PORTAL_HOST:$PORTAL_PORT/api/mcp/status"

        # Display next steps
        echo ""
        log "🎉 Claude Flow Personal Web Portal is now running!"
        echo ""
        info "Next steps:"
        info "  • Open your browser to http://$PORTAL_HOST:$PORTAL_PORT"
        info "  • Check MCP connections at http://$PORTAL_HOST:$PORTAL_PORT/api/mcp/status"
        info "  • Monitor swarm metrics at http://$PORTAL_HOST:$PORTAL_PORT/api/swarm/metrics"
        echo ""
        info "To stop the portal:"
        info "  • Press Ctrl+C in this terminal"
        info "  • Or run: $SCRIPT_DIR/stop-portal.sh"
        echo ""

    else
        error "Portal failed to start - port $PORTAL_PORT is not responding"
        exit 1
    fi
}

# Function to handle graceful shutdown
cleanup() {
    log "🛑 Shutting down gracefully..."

    # Execute session-end hook
    if command_exists npx && npx claude-flow@alpha --version >/dev/null 2>&1; then
        info "Executing session-end hook..."
        npx claude-flow@alpha hooks session-end \
            --export-metrics true \
            --save-state true || warn "Session-end hook failed"
    fi

    # Stop frontend development server if running
    if [[ -f "$PROJECT_ROOT/.frontend.pid" ]]; then
        local frontend_pid
        frontend_pid=$(cat "$PROJECT_ROOT/.frontend.pid")
        if kill -0 "$frontend_pid" 2>/dev/null; then
            log "Stopping frontend development server..."
            kill "$frontend_pid" 2>/dev/null || true
        fi
        rm -f "$PROJECT_ROOT/.frontend.pid"
    fi

    # Stop main portal server if running
    if [[ -f "$PID_FILE" ]]; then
        local portal_pid
        portal_pid=$(cat "$PID_FILE")
        if kill -0 "$portal_pid" 2>/dev/null; then
            log "Stopping portal server..."
            kill "$portal_pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi

    # Stop PM2 processes if running
    if command_exists pm2; then
        pm2 stop claude-flow-portal 2>/dev/null || true
        pm2 delete claude-flow-portal 2>/dev/null || true
    fi

    log "✅ Cleanup complete"
    exit 0
}

# Function to show help
show_help() {
    cat << EOF
Claude Flow Personal Web Portal Startup Script

Usage: $0 [OPTIONS]

Options:
    -h, --help          Show this help message
    -p, --port PORT     Set portal port (default: 3000)
    -H, --host HOST     Set portal host (default: localhost)
    --dev               Force development mode
    --prod              Force production mode
    --skip-mcp          Skip MCP server setup
    --skip-frontend     Skip frontend build/start
    --verbose           Enable verbose logging

Environment Variables:
    WEB_PORTAL_HOST     Portal host (default: localhost)
    WEB_PORTAL_PORT     Portal port (default: 3000)
    FRONTEND_DEV_PORT   Frontend dev server port (default: 3001)
    NODE_ENV            Environment mode (development|production|test)
    FLOW_NEXUS_ENABLED  Enable Flow-Nexus MCP server (default: false)

Examples:
    $0                  # Start with default settings
    $0 --port 8080      # Start on port 8080
    $0 --prod           # Start in production mode
    $0 --skip-mcp       # Start without MCP setup

For more information, visit:
    https://github.com/ruvnet/claude-flow
EOF
}

# Parse command line arguments
SKIP_MCP=false
SKIP_FRONTEND=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -p|--port)
            PORTAL_PORT="$2"
            shift 2
            ;;
        -H|--host)
            PORTAL_HOST="$2"
            shift 2
            ;;
        --dev)
            NODE_ENV="development"
            shift
            ;;
        --prod)
            NODE_ENV="production"
            shift
            ;;
        --skip-mcp)
            SKIP_MCP=true
            shift
            ;;
        --skip-frontend)
            SKIP_FRONTEND=true
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
    # Setup signal handlers
    trap cleanup SIGINT SIGTERM EXIT

    log "🚀 Claude Flow Personal Web Portal Startup"
    log "   Host: $PORTAL_HOST"
    log "   Port: $PORTAL_PORT"
    log "   Environment: ${NODE_ENV:-development}"
    echo ""

    # Execute startup sequence
    setup_environment
    check_ports

    if [[ "$SKIP_MCP" != true ]]; then
        setup_mcp_connections
    else
        warn "Skipping MCP setup as requested"
    fi

    if [[ "$SKIP_FRONTEND" != true ]]; then
        build_frontend
    else
        warn "Skipping frontend build as requested"
    fi

    execute_pre_hooks
    start_portal_server
    execute_post_hooks

    # Keep script running
    wait
}

# Run main function
main "$@"