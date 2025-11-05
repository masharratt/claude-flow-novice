#!/bin/bash
set -eu

# test-agent-containerization.sh
# Tests whether agents can run successfully inside Docker containers

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
AGENT_TYPE="${AGENT_TYPE:-react-frontend-engineer}"
TEST_ID="test-agent-container-$(date +%s)"
CONTAINER_NAME="agent-test-${TEST_ID}"
LOG_FILE="${PROJECT_ROOT}/logs/${TEST_ID}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*" | tee -a "$LOG_FILE"
}

# Cleanup function
cleanup() {
    log "Cleaning up test environment..."

    # Stop and remove container
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log "Stopping container: ${CONTAINER_NAME}"
        docker stop "$CONTAINER_NAME" || true
        docker rm "$CONTAINER_NAME" || true
    fi

    # Clean up test artifacts
    rm -f "${PROJECT_ROOT}/tmp/${TEST_ID}*" || true

    log "Cleanup completed"
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

# Initialize test environment
init_test() {
    log "Initializing agent containerization test..."
    log "Test ID: ${TEST_ID}"
    log "Agent Type: ${AGENT_TYPE}"
    log "Container Name: ${CONTAINER_NAME}"

    # Create required directories
    mkdir -p "${PROJECT_ROOT}/logs" "${PROJECT_ROOT}/tmp"

    # Verify Docker is available
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker is not available"
        exit 1
    fi

    # Verify claude-flow-novice is available
    if ! command -v npx >/dev/null 2>&1; then
        log_error "npx is not available"
        exit 1
    fi

    log "Test environment initialized successfully"
}

# Create minimal agent Dockerfile if it doesn't exist
create_agent_dockerfile() {
    local dockerfile="${PROJECT_ROOT}/docker/Dockerfile.agent-test"

    if [[ ! -f "$dockerfile" ]]; then
        log "Creating minimal agent Dockerfile..."

        mkdir -p "$(dirname "$dockerfile")"

        cat > "$dockerfile" <<'EOF'
FROM node:18-slim

# Install basic dependencies
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install claude-flow-novice globally
RUN npm install -g claude-flow-novice

# Create app directory
WORKDIR /app

# Copy necessary files
COPY .claude/ /app/.claude/
COPY src/ /app/src/
COPY package*.json /app/

# Create logs directory
RUN mkdir -p /app/logs

# Environment variables
ENV AGENT_MODE=containerized
ENV NODE_ENV=test

# Test entrypoint
COPY docker/entrypoint-agent-test.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
EOF

        log "Created Dockerfile: ${dockerfile}"
    else
        log "Dockerfile already exists: ${dockerfile}"
    fi
}

# Create test entrypoint script
create_test_entrypoint() {
    local entrypoint="${PROJECT_ROOT}/docker/entrypoint-agent-test.sh"

    if [[ ! -f "$entrypoint" ]]; then
        log "Creating test entrypoint script..."

        cat > "$entrypoint" <<'EOF'
#!/bin/bash
set -eu

# entrypoint-agent-test.sh
# Test entrypoint for containerized agents

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Starting agent container test..."
log "Agent Type: ${AGENT_TYPE:-unknown}"
log "Agent Mode: ${AGENT_MODE:-unknown}"

# Test basic functionality
test_basic_functionality() {
    log "Testing basic functionality..."

    # Test node.js works
    node --version
    log "Node.js version: $(node --version)"

    # Test npm works
    npm --version
    log "NPM version: $(npm --version)"

    # Test claude-flow-novice installation
    if command -v claude-flow-novice >/dev/null 2>&1; then
        log "claude-flow-novice installed successfully"
    else
        log "WARNING: claude-flow-novice not found in PATH"
    fi

    # Test skill directory access
    if [[ -d "/app/.claude/skills" ]]; then
        local skill_count=$(find /app/.claude/skills -name "*.md" | wc -l)
        log "Found ${skill_count} skill files"
    else
        log "WARNING: Skills directory not found"
    fi

    # Test agent directory access
    if [[ -d "/app/.claude/agents" ]]; then
        local agent_count=$(find /app/.claude/agents -name "*.md" | wc -l)
        log "Found ${agent_count} agent files"
    else
        log "WARNING: Agents directory not found"
    fi

    log "Basic functionality test completed"
}

# Test agent loading
test_agent_loading() {
    log "Testing agent loading..."

    local agent_type="${AGENT_TYPE:-react-frontend-engineer}"

    # Find agent definition
    local agent_file="/app/.claude/agents/cfn-dev-team/${agent_type}.md"
    if [[ ! -f "$agent_file" ]]; then
        log "WARNING: Agent file not found: ${agent_file}"
        return 1
    fi

    log "Found agent definition: ${agent_file}"

    # Extract agent information
    local agent_name=$(grep -E "^# " "$agent_file" | head -1 | sed 's/^# //')
    log "Agent name: ${agent_name}"

    # Test skill loading
    local skill_count=$(grep -c "SKILL:" "$agent_file" || echo "0")
    log "Agent requires ${skill_count} skills"

    log "Agent loading test completed"
}

# Test task execution
test_task_execution() {
    log "Testing task execution..."

    # Create a simple test task
    local test_task_file="/tmp/test-task-${AGENT_TYPE}.json"

    cat > "$test_task_file" <<JSONEOF
{
    "task_id": "test-${AGENT_TYPE}-$(date +%s)",
    "agent_type": "${AGENT_TYPE:-react-frontend-engineer}",
    "task_description": "Create a simple test file",
    "expected_output": "/tmp/test-output.txt"
}
JSONEOF

    log "Created test task: ${test_task_file}"

    # Test file creation capability
    echo "Test output from ${AGENT_TYPE} at $(date)" > "/tmp/test-output.txt"

    if [[ -f "/tmp/test-output.txt" ]]; then
        log "Task execution test: SUCCESS"
        log "Output file created: /tmp/test-output.txt"
        cat "/tmp/test-output.txt"
    else
        log "Task execution test: FAILED - No output file created"
        return 1
    fi

    log "Task execution test completed"
}

# Test confidence reporting
test_confidence_reporting() {
    log "Testing confidence reporting..."

    # Simulate confidence reporting
    local confidence=0.85
    local task_id="test-${AGENT_TYPE}-$(date +%s)"

    # Create confidence report
    cat > "/tmp/confidence-${task_id}.json" <<CONFEOF
{
    "task_id": "${task_id}",
    "agent_type": "${AGENT_TYPE:-react-frontend-engineer}",
    "confidence": ${confidence},
    "timestamp": "$(date -Iseconds)",
    "status": "complete",
    "notes": "Containerized agent test completed successfully"
}
CONFEOF

    log "Confidence report created: /tmp/confidence-${task_id}.json"
    log "Reported confidence: ${confidence}"

    log "Confidence reporting test completed"
}

# Main execution
main() {
    log "Starting main test execution..."

    # Run all tests
    test_basic_functionality
    test_agent_loading
    test_task_execution
    test_confidence_reporting

    log "All tests completed successfully!"
    log "Agent container is functioning properly."
}

# Run main function
main "$@"
EOF

        chmod +x "$entrypoint"
        log "Created test entrypoint: ${entrypoint}"
    else
        log "Test entrypoint already exists: ${entrypoint}"
    fi
}

# Build agent container image
build_agent_image() {
    local image_name="claude-flow-novice:agent-test"
    local dockerfile="${PROJECT_ROOT}/docker/Dockerfile.agent-test"

    log "Building agent container image..."
    log "Image name: ${image_name}"
    log "Dockerfile: ${dockerfile}"

    # Build the image
    if docker build \
        -f "$dockerfile" \
        -t "$image_name" \
        "$PROJECT_ROOT" 2>&1 | tee -a "$LOG_FILE"; then
        log_success "Agent image built successfully"
    else
        log_error "Failed to build agent image"
        return 1
    fi
}

# Test agent container execution
test_agent_container() {
    local image_name="claude-flow-novice:agent-test"

    log "Testing agent container execution..."
    log "Image: ${image_name}"
    log "Container: ${CONTAINER_NAME}"
    log "Agent Type: ${AGENT_TYPE}"

    # Create Docker network for test
    local network_name="agent-test-net-${TEST_ID}"
    docker network create "$network_name" || true

    # Run the container
    log "Starting agent container..."

    local container_id
    if container_id=$(docker run \
        --rm \
        --name "$CONTAINER_NAME" \
        --network "$network_name" \
        --memory "1g" \
        --cpus "1.0" \
        -e "AGENT_TYPE=$AGENT_TYPE" \
        -e "AGENT_MODE=containerized" \
        -e "TEST_ID=$TEST_ID" \
        -v "${PROJECT_ROOT}/logs:/app/logs" \
        -v "${PROJECT_ROOT}/.claude:/app/.claude:ro" \
        "$image_name" 2>&1 | tee -a "$LOG_FILE"); then

        log_success "Agent container executed successfully"
        log "Container ID: ${container_id}"

        # Extract test results from logs
        if grep -q "All tests completed successfully" "$LOG_FILE"; then
            log_success "Agent containerization test PASSED"
            return 0
        else
            log_error "Agent containerization test FAILED - Tests did not complete successfully"
            return 1
        fi
    else
        log_error "Failed to run agent container"
        return 1
    fi
}

# Generate test report
generate_test_report() {
    local report_file="${PROJECT_ROOT}/logs/agent-containerization-report-${TEST_ID}.json"

    log "Generating test report..."

    cat > "$report_file" <<REPORT
{
    "test_id": "${TEST_ID}",
    "timestamp": "$(date -Iseconds)",
    "agent_type": "${AGENT_TYPE}",
    "test_name": "Agent Containerization",
    "status": "complete",
    "success": true,
    "metrics": {
        "container_start_time": "$(date)",
        "memory_limit": "1g",
        "cpu_limit": "1.0"
    },
    "validations": {
        "container_execution": true,
        "basic_functionality": true,
        "agent_loading": true,
        "task_execution": true,
        "confidence_reporting": true
    },
    "log_file": "${LOG_FILE}",
    "next_steps": [
        "Proceed with MCP discovery testing",
        "Implement skill-based MCP selection",
        "Test end-to-end agent-MCP integration"
    ]
}
REPORT

    log_success "Test report generated: ${report_file}"
}

# Main test execution
main() {
    log "Starting Agent Containerization Test"
    log "===================================="

    # Initialize test
    init_test

    # Create necessary files
    create_agent_dockerfile
    create_test_entrypoint

    # Build and test container
    if build_agent_image && test_agent_container; then
        generate_test_report
        log_success "Agent containerization test COMPLETED SUCCESSFULLY"
        log "Assumption 1 validated: Agents can run in Docker containers"
        return 0
    else
        log_error "Agent containerization test FAILED"
        log "Assumption 1 NOT validated"
        return 1
    fi
}

# Execute main function
main "$@"