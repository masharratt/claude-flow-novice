#!/usr/bin/env bash
# CFN Loop Hello-World End-to-End Integration Test
# Tests complete workflow: Loop 3 (implementers + tests) → Loop 2 (validators) → corrections
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_NAME="cfn-loop-hello-world-e2e"
WORKSPACE_DIR="/tmp/${TEST_NAME}-workspace"
NETWORK_NAME="${TEST_NAME}-network"
REDIS_CONTAINER="${TEST_NAME}-redis"
REDIS_PORT="6380"
TASK_ID="hello-world-$(date +%s)"

# Language configurations
declare -A LANGUAGES=(
    ["python"]="python:3.11-alpine"
    ["javascript"]="node:20-alpine"
    ["typescript"]="node:20-alpine"
    ["bash"]="bash:5.2-alpine"
    ["go"]="golang:1.21-alpine"
    ["rust"]="rust:1.75-alpine"
)

# Cleanup function
cleanup() {
    echo -e "${YELLOW}[CLEANUP] Stopping containers and removing network${NC}"
    docker ps -a --filter "name=${TEST_NAME}" -q | xargs -r docker rm -f 2>/dev/null || true
    docker network rm "${NETWORK_NAME}" 2>/dev/null || true
    # Keep workspace for inspection: rm -rf "${WORKSPACE_DIR}" 2>/dev/null || true
    echo -e "${GREEN}[CLEANUP] Workspace preserved at: ${WORKSPACE_DIR}${NC}"
}

trap cleanup EXIT

# Logging functions
log_test() { echo -e "${BLUE}[TEST] $1${NC}"; }
log_pass() { echo -e "${GREEN}[PASS] $1${NC}"; }
log_fail() { echo -e "${RED}[FAIL] $1${NC}"; exit 1; }
log_info() { echo -e "${YELLOW}[INFO] $1${NC}"; }

# Setup function
setup_environment() {
    log_test "Setting up test environment"

    # Create workspace directories
    mkdir -p "${WORKSPACE_DIR}"/{phase1,phase2,validation,iteration2}

    # Create Docker network
    docker network create "${NETWORK_NAME}" 2>/dev/null || true

    # Start Redis container
    docker run -d \
        --name "${REDIS_CONTAINER}" \
        --network "${NETWORK_NAME}" \
        -p "${REDIS_PORT}:6379" \
        redis:7-alpine \
        redis-server --appendonly yes

    # Wait for Redis to be ready
    sleep 2
    docker exec "${REDIS_CONTAINER}" redis-cli ping | grep -q PONG || log_fail "Redis not ready"

    log_pass "Environment setup complete"
    log_info "Workspace: ${WORKSPACE_DIR}"
    log_info "Network: ${NETWORK_NAME}"
    log_info "Redis: ${REDIS_CONTAINER}:6379"
}

# Phase 1: Spawn implementer agents
phase1_spawn_implementers() {
    log_test "Phase 1: Spawning 6 language implementer agents"

    local agents_spawned=0

    for lang in "${!LANGUAGES[@]}"; do
        local image="${LANGUAGES[$lang]}"
        local container_name="${TEST_NAME}-${lang}-impl"

        log_info "Spawning ${lang} implementer (${image})"

        # Create agent script inline
        local agent_script="/tmp/${lang}-impl.sh"
        cat > "${agent_script}" << 'AGENT_EOF'
#!/bin/bash
set -euo pipefail

LANG="$1"
WORKSPACE="$2"
REDIS_HOST="$3"
TASK_ID="$4"

# Create hello-world program
case "$LANG" in
    python)
        cat > "${WORKSPACE}/phase1/hello.py" << 'EOF'
#!/usr/bin/env python3
print("Hello, World!")
EOF
        chmod +x "${WORKSPACE}/phase1/hello.py"
        ;;
    javascript)
        cat > "${WORKSPACE}/phase1/hello.js" << 'EOF'
#!/usr/bin/env node
console.log("Hello, World!");
EOF
        chmod +x "${WORKSPACE}/phase1/hello.js"
        ;;
    typescript)
        cat > "${WORKSPACE}/phase1/hello.ts" << 'EOF'
#!/usr/bin/env ts-node
console.log("Hello, World!");
EOF
        ;;
    bash)
        cat > "${WORKSPACE}/phase1/hello.sh" << 'EOF'
#!/bin/bash
echo "Hello, World!"
EOF
        chmod +x "${WORKSPACE}/phase1/hello.sh"
        ;;
    go)
        cat > "${WORKSPACE}/phase1/hello.go" << 'EOF'
package main
import "fmt"
func main() { fmt.Println("Hello, World!") }
EOF
        ;;
    rust)
        cat > "${WORKSPACE}/phase1/hello.rs" << 'EOF'
fn main() { println!("Hello, World!"); }
EOF
        ;;
esac

# Signal completion via Redis
apk add --no-cache redis 2>/dev/null || apt-get update && apt-get install -y redis-tools 2>/dev/null || true
redis-cli -h "$REDIS_HOST" SET "agent:${LANG}:iteration:1:done" "true"
redis-cli -h "$REDIS_HOST" SET "agent:${LANG}:iteration:1:confidence" "0.85"

echo "[${LANG}] Implementation complete: ${WORKSPACE}/phase1/hello.${LANG}"
AGENT_EOF

        # Run agent container
        docker run --rm -d \
            --name "${container_name}" \
            --network "${NETWORK_NAME}" \
            -v "${WORKSPACE_DIR}:/workspace" \
            -v "${agent_script}:/agent.sh" \
            "${image}" \
            sh /agent.sh "${lang}" "/workspace" "${REDIS_CONTAINER}" "${TASK_ID}"

        agents_spawned=$((agents_spawned + 1))
    done

    log_pass "${agents_spawned} implementer agents spawned"

    # Wait for all agents to complete
    log_info "Waiting for implementer agents to complete..."
    local timeout=30
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        local completed=$(docker exec "${REDIS_CONTAINER}" redis-cli KEYS "agent:*:iteration:1:done" | wc -l)
        if [ "$completed" -eq 6 ]; then
            log_pass "All 6 implementer agents completed"
            break
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    if [ $elapsed -ge $timeout ]; then
        log_fail "Timeout waiting for implementer agents"
    fi

    # Verify all hello-world files created
    local files_created=0
    for lang in python javascript typescript bash go rust; do
        local ext=""
        case "$lang" in
            python) ext="py" ;;
            javascript) ext="js" ;;
            typescript) ext="ts" ;;
            bash) ext="sh" ;;
            go) ext="go" ;;
            rust) ext="rs" ;;
        esac

        if [ -f "${WORKSPACE_DIR}/phase1/hello.${ext}" ]; then
            files_created=$((files_created + 1))
            log_info "✓ hello.${ext} created"
        else
            log_fail "Missing hello.${ext}"
        fi
    done

    log_pass "Phase 1 complete: ${files_created}/6 hello-world files created"
}

# Phase 2: Agents write intentionally weak tests
phase2_weak_tests() {
    log_test "Phase 2: Agents write intentionally weak tests"

    for lang in "${!LANGUAGES[@]}"; do
        local image="${LANGUAGES[$lang]}"
        local container_name="${TEST_NAME}-${lang}-test"

        log_info "Spawning ${lang} test writer"

        # Create test writer script
        local test_script="/tmp/${lang}-test.sh"
        cat > "${test_script}" << 'TEST_EOF'
#!/bin/bash
set -euo pipefail

LANG="$1"
WORKSPACE="$2"
REDIS_HOST="$3"

# Create intentionally weak tests (pass but test wrong thing)
case "$LANG" in
    python)
        cat > "${WORKSPACE}/phase2/hello_test.py" << 'EOF'
#!/usr/bin/env python3
import subprocess
import sys

def test_hello():
    """WEAK TEST: Only checks string length, not content"""
    result = subprocess.run([sys.executable, "phase1/hello.py"],
                          capture_output=True, text=True, cwd="/workspace")
    output = result.stdout.strip()
    assert len(output) > 0, "Output should not be empty"
    print(f"TEST PASS: Output has {len(output)} characters")

if __name__ == "__main__":
    test_hello()
    print("All tests passed!")
EOF
        chmod +x "${WORKSPACE}/phase2/hello_test.py"
        # Run the weak test
        python3 "${WORKSPACE}/phase2/hello_test.py" && echo "exit_code:0" || echo "exit_code:$?"
        ;;
    javascript)
        cat > "${WORKSPACE}/phase2/hello.test.js" << 'EOF'
#!/usr/bin/env node
const { execSync } = require('child_process');

// WEAK TEST: Only checks if output is defined
function testHello() {
    const output = execSync('node /workspace/phase1/hello.js', { encoding: 'utf8' });
    if (output !== undefined && output !== null) {
        console.log('TEST PASS: Output is defined');
        return true;
    }
    throw new Error('Output is undefined');
}

try {
    testHello();
    console.log('All tests passed!');
    process.exit(0);
} catch (err) {
    console.error('TEST FAIL:', err.message);
    process.exit(1);
}
EOF
        chmod +x "${WORKSPACE}/phase2/hello.test.js"
        node "${WORKSPACE}/phase2/hello.test.js" && echo "exit_code:0" || echo "exit_code:$?"
        ;;
    typescript)
        cat > "${WORKSPACE}/phase2/hello.test.ts" << 'EOF'
// WEAK TEST: Only checks type, not value
const output: string = "anything";
if (typeof output === 'string') {
    console.log('TEST PASS: Output is a string');
    process.exit(0);
} else {
    console.log('TEST FAIL: Output is not a string');
    process.exit(1);
}
EOF
        echo "exit_code:0"  # TypeScript test is trivial
        ;;
    bash)
        cat > "${WORKSPACE}/phase2/hello_test.sh" << 'EOF'
#!/bin/bash
# WEAK TEST: Only checks exit code, not output
set -e
bash /workspace/phase1/hello.sh > /dev/null
echo "TEST PASS: Script executed without errors"
echo "All tests passed!"
exit 0
EOF
        chmod +x "${WORKSPACE}/phase2/hello_test.sh"
        bash "${WORKSPACE}/phase2/hello_test.sh" && echo "exit_code:0" || echo "exit_code:$?"
        ;;
    go)
        cat > "${WORKSPACE}/phase2/hello_test.go" << 'EOF'
package main
import (
    "fmt"
    "os/exec"
)
// WEAK TEST: Only checks if command runs, not output
func main() {
    cmd := exec.Command("go", "run", "/workspace/phase1/hello.go")
    err := cmd.Run()
    if err == nil {
        fmt.Println("TEST PASS: Command executed successfully")
        fmt.Println("All tests passed!")
    } else {
        fmt.Println("TEST FAIL:", err)
    }
}
EOF
        echo "exit_code:0"  # Go test is weak by design
        ;;
    rust)
        cat > "${WORKSPACE}/phase2/hello_test.rs" << 'EOF'
// WEAK TEST: Only checks compilation, not runtime output
fn main() {
    println!("TEST PASS: Rust file exists");
    println!("All tests passed!");
}
EOF
        echo "exit_code:0"  # Rust test is weak by design
        ;;
esac

# Signal completion
apk add --no-cache redis 2>/dev/null || apt-get update && apt-get install -y redis-tools 2>/dev/null || true
redis-cli -h "$REDIS_HOST" SET "test:${LANG}:iteration:1:done" "true"
redis-cli -h "$REDIS_HOST" SET "test:${LANG}:iteration:1:pass_rate" "1.0"

echo "[${LANG}] Weak test created and passed"
TEST_EOF

        docker run --rm \
            --name "${container_name}" \
            --network "${NETWORK_NAME}" \
            -v "${WORKSPACE_DIR}:/workspace" \
            -v "${test_script}:/test.sh" \
            "${image}" \
            sh /test.sh "${lang}" "/workspace" "${REDIS_CONTAINER}"
    done

    # Verify all tests created and passed
    local tests_passed=0
    local completed=$(docker exec "${REDIS_CONTAINER}" redis-cli KEYS "test:*:iteration:1:done" | wc -l)

    if [ "$completed" -eq 6 ]; then
        tests_passed=6
        log_pass "All 6 weak tests created and passed"
    else
        log_fail "Only ${completed}/6 tests completed"
    fi

    # Calculate gate check (100% pass rate)
    docker exec "${REDIS_CONTAINER}" redis-cli SET "gate:iteration:1:pass_rate" "1.0"
    log_pass "Gate check: PASS (100% test pass rate)"
}

# Phase 3: Validators detect weak tests
phase3_validators() {
    log_test "Phase 3: Validators detect weak tests"

    local validator_count=3

    for i in $(seq 1 $validator_count); do
        local container_name="${TEST_NAME}-validator-${i}"

        log_info "Spawning validator ${i}"

        # Create validator script
        local validator_script="/tmp/validator-${i}.sh"
        cat > "${validator_script}" << 'VAL_EOF'
#!/bin/bash
set -euo pipefail

VALIDATOR_ID="$1"
WORKSPACE="$2"
REDIS_HOST="$3"

# Install tools
apk add --no-cache jq redis bash 2>/dev/null || true

# Analyze implementations and tests
analyze_tests() {
    local issues=0
    local feedback="{"

    # Check Python test
    if grep -q "len(output) > 0" "${WORKSPACE}/phase2/hello_test.py" 2>/dev/null; then
        issues=$((issues + 1))
        feedback="${feedback}\"python\": {\"issue\": \"Test only checks string length, not content\", \"expected\": \"assert output == 'Hello, World!'\", \"severity\": \"high\"},"
    fi

    # Check JavaScript test
    if grep -q "output !== undefined" "${WORKSPACE}/phase2/hello.test.js" 2>/dev/null; then
        issues=$((issues + 1))
        feedback="${feedback}\"javascript\": {\"issue\": \"Test only checks if output is defined\", \"expected\": \"expect(output.trim()).toBe('Hello, World!')\", \"severity\": \"high\"},"
    fi

    # Check Bash test
    if grep -q "> /dev/null" "${WORKSPACE}/phase2/hello_test.sh" 2>/dev/null; then
        issues=$((issues + 1))
        feedback="${feedback}\"bash\": {\"issue\": \"Test only checks exit code, not output\", \"expected\": \"test \\\"\\$(bash hello.sh)\\\" = 'Hello, World!'\", \"severity\": \"high\"},"
    fi

    # Remove trailing comma and close JSON
    feedback="${feedback%,}}"

    # Calculate confidence (lower = more issues detected)
    local confidence=$(echo "scale=2; 1 - ($issues * 0.15)" | bc)

    echo "$feedback" > "${WORKSPACE}/validation/validator-${VALIDATOR_ID}.json"
    echo "$confidence"
}

confidence=$(analyze_tests)

# Report findings
redis-cli -h "$REDIS_HOST" SET "validator:${VALIDATOR_ID}:iteration:1:consensus" "$confidence"
redis-cli -h "$REDIS_HOST" SET "validator:${VALIDATOR_ID}:iteration:1:done" "true"

echo "[Validator ${VALIDATOR_ID}] Analysis complete. Confidence: ${confidence}"
VAL_EOF

        docker run --rm \
            --name "${container_name}" \
            --network "${NETWORK_NAME}" \
            -v "${WORKSPACE_DIR}:/workspace" \
            -v "${validator_script}:/validator.sh" \
            alpine:3.19 \
            sh /validator.sh "${i}" "/workspace" "${REDIS_CONTAINER}"
    done

    # Calculate average consensus
    local total_consensus=0
    for i in $(seq 1 $validator_count); do
        local consensus=$(docker exec "${REDIS_CONTAINER}" redis-cli GET "validator:${i}:iteration:1:consensus")
        total_consensus=$(echo "$total_consensus + $consensus" | bc)
        log_info "Validator ${i} consensus: ${consensus}"
    done

    local avg_consensus=$(echo "scale=2; $total_consensus / $validator_count" | bc)
    log_info "Average consensus: ${avg_consensus}"

    if (( $(echo "$avg_consensus < 0.90" | bc -l) )); then
        log_pass "Validators detected weak tests (consensus: ${avg_consensus} < 0.90) → ITERATE"
        docker exec "${REDIS_CONTAINER}" redis-cli SET "decision:iteration:1" "ITERATE"
    else
        log_fail "Validators should have detected issues (consensus too high: ${avg_consensus})"
    fi
}

# Phase 4: Agents correct tests based on feedback
phase4_corrections() {
    log_test "Phase 4: Agents correct tests based on validator feedback (iteration 2)"

    for lang in python javascript bash; do  # Focus on main languages
        local image="${LANGUAGES[$lang]}"
        local container_name="${TEST_NAME}-${lang}-correct"

        log_info "Spawning ${lang} corrector"

        # Create correction script
        local correct_script="/tmp/${lang}-correct.sh"
        cat > "${correct_script}" << 'CORRECT_EOF'
#!/bin/bash
set -euo pipefail

LANG="$1"
WORKSPACE="$2"
REDIS_HOST="$3"

# Read validator feedback and correct tests
case "$LANG" in
    python)
        cat > "${WORKSPACE}/iteration2/hello_test.py" << 'EOF'
#!/usr/bin/env python3
import subprocess
import sys

def test_hello():
    """CORRECTED TEST: Validates actual output content"""
    result = subprocess.run([sys.executable, "/workspace/phase1/hello.py"],
                          capture_output=True, text=True)
    output = result.stdout.strip()
    expected = "Hello, World!"
    assert output == expected, f"Expected '{expected}', got '{output}'"
    print(f"TEST PASS: Output matches '{expected}'")

if __name__ == "__main__":
    test_hello()
    print("All tests passed!")
EOF
        chmod +x "${WORKSPACE}/iteration2/hello_test.py"
        python3 "${WORKSPACE}/iteration2/hello_test.py"
        ;;
    javascript)
        cat > "${WORKSPACE}/iteration2/hello.test.js" << 'EOF'
#!/usr/bin/env node
const { execSync } = require('child_process');

// CORRECTED TEST: Validates actual output content
function testHello() {
    const output = execSync('node /workspace/phase1/hello.js', { encoding: 'utf8' }).trim();
    const expected = 'Hello, World!';
    if (output === expected) {
        console.log(`TEST PASS: Output matches '${expected}'`);
        return true;
    }
    throw new Error(`Expected '${expected}', got '${output}'`);
}

try {
    testHello();
    console.log('All tests passed!');
    process.exit(0);
} catch (err) {
    console.error('TEST FAIL:', err.message);
    process.exit(1);
}
EOF
        chmod +x "${WORKSPACE}/iteration2/hello.test.js"
        node "${WORKSPACE}/iteration2/hello.test.js"
        ;;
    bash)
        cat > "${WORKSPACE}/iteration2/hello_test.sh" << 'EOF'
#!/bin/bash
# CORRECTED TEST: Validates actual output content
set -e

output=$(bash /workspace/phase1/hello.sh)
expected="Hello, World!"

if [ "$output" = "$expected" ]; then
    echo "TEST PASS: Output matches '$expected'"
    echo "All tests passed!"
    exit 0
else
    echo "TEST FAIL: Expected '$expected', got '$output'"
    exit 1
fi
EOF
        chmod +x "${WORKSPACE}/iteration2/hello_test.sh"
        bash "${WORKSPACE}/iteration2/hello_test.sh"
        ;;
esac

# Signal completion
apk add --no-cache redis 2>/dev/null || apt-get update && apt-get install -y redis-tools 2>/dev/null || true
redis-cli -h "$REDIS_HOST" SET "corrected:${LANG}:iteration:2:done" "true"
redis-cli -h "$REDIS_HOST" SET "corrected:${LANG}:iteration:2:pass_rate" "1.0"

echo "[${LANG}] Corrected test created and passed"
CORRECT_EOF

        docker run --rm \
            --name "${container_name}" \
            --network "${NETWORK_NAME}" \
            -v "${WORKSPACE_DIR}:/workspace" \
            -v "${correct_script}:/correct.sh" \
            "${image}" \
            sh /correct.sh "${lang}" "/workspace" "${REDIS_CONTAINER}"
    done

    # Re-run validators on corrected tests
    log_info "Re-validating corrected tests..."

    local validator_script="/tmp/validator-final.sh"
    cat > "${validator_script}" << 'FINAL_VAL_EOF'
#!/bin/bash
set -euo pipefail

WORKSPACE="$1"
REDIS_HOST="$2"

apk add --no-cache redis bash 2>/dev/null || true

# Check corrected tests
issues=0

# Verify Python test checks actual content
if grep -q 'output == expected' "${WORKSPACE}/iteration2/hello_test.py" 2>/dev/null; then
    echo "✓ Python test validates content"
else
    issues=$((issues + 1))
fi

# Verify JavaScript test checks actual content
if grep -q "output === expected" "${WORKSPACE}/iteration2/hello.test.js" 2>/dev/null; then
    echo "✓ JavaScript test validates content"
else
    issues=$((issues + 1))
fi

# Verify Bash test checks actual content
if grep -q 'if \[ "$output" = "$expected" \]' "${WORKSPACE}/iteration2/hello_test.sh" 2>/dev/null; then
    echo "✓ Bash test validates content"
else
    issues=$((issues + 1))
fi

# High confidence if all tests are properly corrected
if [ $issues -eq 0 ]; then
    consensus="0.95"
else
    consensus="0.75"
fi

redis-cli -h "$REDIS_HOST" SET "validator:final:iteration:2:consensus" "$consensus"
echo "Final validation consensus: $consensus"
FINAL_VAL_EOF

    docker run --rm \
        --name "${TEST_NAME}-validator-final" \
        --network "${NETWORK_NAME}" \
        -v "${WORKSPACE_DIR}:/workspace" \
        -v "${validator_script}:/validator.sh" \
        alpine:3.19 \
        sh /validator.sh "/workspace" "${REDIS_CONTAINER}"

    local final_consensus=$(docker exec "${REDIS_CONTAINER}" redis-cli GET "validator:final:iteration:2:consensus")
    log_info "Final consensus: ${final_consensus}"

    if (( $(echo "$final_consensus >= 0.90" | bc -l) )); then
        log_pass "Corrected tests validated (consensus: ${final_consensus} >= 0.90) → PROCEED"
        docker exec "${REDIS_CONTAINER}" redis-cli SET "decision:iteration:2" "PROCEED"
    else
        log_fail "Corrected tests still have issues (consensus: ${final_consensus})"
    fi
}

# Main test execution
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}CFN Loop Hello-World E2E Test${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    setup_environment
    echo ""

    phase1_spawn_implementers
    echo ""

    phase2_weak_tests
    echo ""

    phase3_validators
    echo ""

    phase4_corrections
    echo ""

    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}[FINAL] CFN Loop Hello-World E2E: PASS ✅${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Summary:${NC}"
    echo "  - Phase 1: 6 hello-world implementations created"
    echo "  - Phase 2: 6 weak tests created (100% pass rate but wrong validations)"
    echo "  - Phase 3: Validators detected issues (consensus < 0.90) → ITERATE"
    echo "  - Phase 4: Tests corrected, re-validated (consensus >= 0.90) → PROCEED"
    echo ""
    echo -e "${YELLOW}Workspace preserved at: ${WORKSPACE_DIR}${NC}"
}

main "$@"
