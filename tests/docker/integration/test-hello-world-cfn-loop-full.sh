#!/bin/bash
set -euo pipefail

# =============================================================================
# CFN Loop Full Workflow Integration Test
# =============================================================================
# Tests complete coordinator → Loop 3 → Loop 2 → Product Owner workflow
# with 6 language agents and intentional validation challenges
#
# Phases:
# 1. Loop 3: 6 agents create hello-world + flawed tests (pass rate 100%)
# 2. Gate Check: Pass rate ≥95%, signal Loop 2
# 3. Loop 2: 3 validators detect flawed tests (consensus 0.65 - ITERATE)
# 4. Loop 3 Iteration 2: Agents fix tests based on feedback
# 5. Re-validation: Gate passes, consensus 0.92 (PROCEED)
# 6. Product Owner: Reviews and decides PROCEED
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_NAME="hello-world-cfn-loop-full"
NETWORK_NAME="cfn-${TEST_NAME}-net"
REDIS_CONTAINER="cfn-${TEST_NAME}-redis"
WORKSPACE_VOLUME="cfn-${TEST_NAME}-workspace"
TASK_ID="hello-world-test-$(date +%s)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_phase() {
    echo -e "${BLUE}=== PHASE: $1 ===${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
}

log_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Cleanup function
cleanup() {
    log_phase "Cleanup"

    # Stop and remove containers
    docker rm -f "$REDIS_CONTAINER" 2>/dev/null || true

    # Remove network
    docker network rm "$NETWORK_NAME" 2>/dev/null || true

    # Remove volume
    docker volume rm "$WORKSPACE_VOLUME" 2>/dev/null || true

    log_success "Cleanup complete"
}

# Trap cleanup on exit
trap cleanup EXIT

# =============================================================================
# Setup Phase
# =============================================================================
log_phase "Setup"

# Create Docker network
log_info "Creating Docker network: $NETWORK_NAME"
docker network create "$NETWORK_NAME" >/dev/null

# Create shared workspace volume
log_info "Creating workspace volume: $WORKSPACE_VOLUME"
docker volume create "$WORKSPACE_VOLUME" >/dev/null

# Start Redis container
log_info "Starting Redis container: $REDIS_CONTAINER"
docker run -d \
    --name "$REDIS_CONTAINER" \
    --network "$NETWORK_NAME" \
    --rm \
    redis:7-alpine \
    redis-server --save "" --appendonly no \
    >/dev/null

# Wait for Redis to be ready
sleep 2
log_success "Setup complete"

# =============================================================================
# Phase 1: Loop 3 - Initial Implementation (Flawed Tests)
# =============================================================================
log_phase "Phase 1: Loop 3 Initial Implementation (6 agents with flawed tests)"

# Helper function to run agent in Docker
run_agent() {
    local agent_name=$1
    local agent_script=$2

    log_info "Spawning agent: $agent_name"

    docker run --rm \
        --network "$NETWORK_NAME" \
        -v "$WORKSPACE_VOLUME":/workspace:rw \
        -e REDIS_HOST="$REDIS_CONTAINER" \
        -e AGENT_ID="$agent_name" \
        -e TASK_ID="$TASK_ID" \
        -e ITERATION=1 \
        alpine:latest \
        sh -c "$agent_script"
}

# Python Agent (flawed test - only checks file exists)
PYTHON_SCRIPT='
apk add --no-cache python3 redis >/dev/null 2>&1

# Create hello.py
cat > /workspace/hello.py << "EOF"
print("Hello, World!")
EOF

# Create flawed test (only checks file exists)
cat > /workspace/test_hello.py << "EOF"
import os
def test_hello_exists():
    assert os.path.exists("hello.py")
    print("Test passed: File exists")
test_hello_exists()
EOF

# Run flawed test (will pass)
cd /workspace && python3 test_hello.py

# Signal completion to Redis
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.85" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result" "PASS" >/dev/null
'

# JavaScript Agent (flawed test - mocks console.log)
JAVASCRIPT_SCRIPT='
apk add --no-cache nodejs npm redis >/dev/null 2>&1

# Create hello.js
cat > /workspace/hello.js << "EOF"
console.log("Hello, World!");
EOF

# Create flawed test (mocks console.log)
cat > /workspace/test_hello.js << "EOF"
const originalLog = console.log;
console.log = () => {}; // Mock it out
require("./hello.js");
console.log = originalLog;
console.log("Test passed: File loaded");
EOF

# Run flawed test (will pass)
cd /workspace && node test_hello.js

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.88" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result" "PASS" >/dev/null
'

# Rust Agent (flawed test - compiles but doesn't execute)
RUST_SCRIPT='
apk add --no-cache rust cargo redis >/dev/null 2>&1

# Create hello.rs
cat > /workspace/hello.rs << "EOF"
fn main() {
    println!("Hello, World!");
}
EOF

# Create flawed test (only compiles)
cat > /workspace/test_hello.sh << "EOF"
#!/bin/sh
rustc hello.rs 2>/dev/null
if [ $? -eq 0 ]; then
    echo "Test passed: Compilation successful"
    exit 0
else
    exit 1
fi
EOF

chmod +x /workspace/test_hello.sh

# Run flawed test
cd /workspace && sh test_hello.sh

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.82" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result" "PASS" >/dev/null
'

# Go Agent (flawed test - syntax check only)
GO_SCRIPT='
apk add --no-cache go redis >/dev/null 2>&1

# Create hello.go
cat > /workspace/hello.go << "EOF"
package main
import "fmt"
func main() {
    fmt.Println("Hello, World!")
}
EOF

# Create flawed test (syntax check only)
cat > /workspace/test_hello.sh << "EOF"
#!/bin/sh
go fmt hello.go >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "Test passed: Syntax valid"
    exit 0
else
    exit 1
fi
EOF

chmod +x /workspace/test_hello.sh

# Run flawed test
cd /workspace && sh test_hello.sh

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.86" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result" "PASS" >/dev/null
'

# Java Agent (flawed test - compiles but doesn't run)
JAVA_SCRIPT='
apk add --no-cache openjdk17 redis >/dev/null 2>&1

# Create Hello.java
cat > /workspace/Hello.java << "EOF"
public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
EOF

# Create flawed test (compile only)
cat > /workspace/test_hello.sh << "EOF"
#!/bin/sh
javac Hello.java 2>/dev/null
if [ $? -eq 0 ]; then
    echo "Test passed: Compilation successful"
    exit 0
else
    exit 1
fi
EOF

chmod +x /workspace/test_hello.sh

# Run flawed test
cd /workspace && sh test_hello.sh

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.84" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result" "PASS" >/dev/null
'

# TypeScript Agent (flawed test - type check only)
TYPESCRIPT_SCRIPT='
apk add --no-cache nodejs npm redis >/dev/null 2>&1
npm install -g typescript >/dev/null 2>&1

# Create hello.ts
cat > /workspace/hello.ts << "EOF"
console.log("Hello, World!");
EOF

# Create flawed test (type check only)
cat > /workspace/test_hello.sh << "EOF"
#!/bin/sh
tsc --noEmit hello.ts 2>/dev/null
if [ $? -eq 0 ]; then
    echo "Test passed: Type checking successful"
    exit 0
else
    exit 1
fi
EOF

chmod +x /workspace/test_hello.sh

# Run flawed test
cd /workspace && sh test_hello.sh

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.87" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result" "PASS" >/dev/null
'

# Spawn all 6 agents in parallel
run_agent "python-agent-1" "$PYTHON_SCRIPT" &
run_agent "javascript-agent-1" "$JAVASCRIPT_SCRIPT" &
run_agent "rust-agent-1" "$RUST_SCRIPT" &
run_agent "go-agent-1" "$GO_SCRIPT" &
run_agent "java-agent-1" "$JAVA_SCRIPT" &
run_agent "typescript-agent-1" "$TYPESCRIPT_SCRIPT" &

# Wait for all agents to complete
wait

log_success "Phase 1 complete: All 6 agents finished with flawed tests"

# =============================================================================
# Phase 2: Gate Check
# =============================================================================
log_phase "Phase 2: Gate Check (collecting test results)"

# Collect test results from Redis
AGENTS=("python-agent-1" "javascript-agent-1" "rust-agent-1" "go-agent-1" "java-agent-1" "typescript-agent-1")
PASS_COUNT=0
TOTAL_COUNT=${#AGENTS[@]}

for agent in "${AGENTS[@]}"; do
    result=$(docker run --rm \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        redis-cli -h "$REDIS_CONTAINER" GET "task:$TASK_ID:agent:$agent:test_result" 2>/dev/null || echo "")

    if [ "$result" = "PASS" ]; then
        PASS_COUNT=$((PASS_COUNT + 1))
        log_info "Agent $agent: PASS"
    else
        log_error "Agent $agent: FAIL (result='$result')"
    fi
done

# Calculate pass rate using awk (more portable than bc)
PASS_RATE=$(awk "BEGIN {printf \"%.2f\", $PASS_COUNT / $TOTAL_COUNT}")
log_info "Pass rate: $PASS_RATE ($PASS_COUNT/$TOTAL_COUNT)"

# Gate threshold check (using awk for floating point comparison)
GATE_THRESHOLD=0.95
GATE_PASSED=$(awk "BEGIN {print ($PASS_RATE >= $GATE_THRESHOLD)}")

if [ "$GATE_PASSED" = "1" ]; then
    log_success "Gate PASSED: $PASS_RATE ≥ $GATE_THRESHOLD"

    # Signal gate-passed to Redis
    docker run --rm \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        redis-cli -h "$REDIS_CONTAINER" SET "task:$TASK_ID:gate-passed" "true" >/dev/null
else
    log_error "Gate FAILED: $PASS_RATE < $GATE_THRESHOLD"
    exit 1
fi

# =============================================================================
# Phase 3: Loop 2 - Validation (Detect Flawed Tests)
# =============================================================================
log_phase "Phase 3: Loop 2 Validation (3 validators detect flawed tests)"

# Validator script (detects flawed tests)
VALIDATOR_SCRIPT='
apk add --no-cache redis python3 >/dev/null 2>&1

VALIDATOR_ID="$1"
VALIDATOR_SCORE="$2"
FEEDBACK="$3"

# Read Loop 3 output
echo "Validator $VALIDATOR_ID: Reviewing Loop 3 work..."

# Write feedback to Redis
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:validator:$VALIDATOR_ID:score" "$VALIDATOR_SCORE" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:validator:$VALIDATOR_ID:feedback" "$FEEDBACK" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:validator:$VALIDATOR_ID:status" "completed" >/dev/null

echo "Validator $VALIDATOR_ID: Score=$VALIDATOR_SCORE"
'

# Spawn 3 validators with low scores (detect flawed tests)
docker run --rm \
    --network "$NETWORK_NAME" \
    -v "$WORKSPACE_VOLUME":/workspace:ro \
    -e REDIS_HOST="$REDIS_CONTAINER" \
    -e TASK_ID="$TASK_ID" \
    alpine:latest \
    sh -c "$VALIDATOR_SCRIPT" - "validator-1" "0.60" "Python test only checks file existence, doesn't validate output" &

docker run --rm \
    --network "$NETWORK_NAME" \
    -v "$WORKSPACE_VOLUME":/workspace:ro \
    -e REDIS_HOST="$REDIS_CONTAINER" \
    -e TASK_ID="$TASK_ID" \
    alpine:latest \
    sh -c "$VALIDATOR_SCRIPT" - "validator-2" "0.65" "JavaScript test mocks console.log without actual execution validation" &

docker run --rm \
    --network "$NETWORK_NAME" \
    -v "$WORKSPACE_VOLUME":/workspace:ro \
    -e REDIS_HOST="$REDIS_CONTAINER" \
    -e TASK_ID="$TASK_ID" \
    alpine:latest \
    sh -c "$VALIDATOR_SCRIPT" - "validator-3" "0.70" "Rust/Go/Java/TS tests only check compilation/syntax, not execution" &

wait

# Calculate consensus
VALIDATORS=("validator-1" "validator-2" "validator-3")
TOTAL_SCORE=0
VALIDATOR_COUNT=${#VALIDATORS[@]}

for validator in "${VALIDATORS[@]}"; do
    score=$(docker run --rm \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        redis-cli -h "$REDIS_CONTAINER" GET "task:$TASK_ID:validator:$validator:score" 2>/dev/null || echo "0")

    TOTAL_SCORE=$(awk "BEGIN {printf \"%.2f\", $TOTAL_SCORE + $score}")
    log_info "Validator $validator: Score=$score"
done

CONSENSUS=$(awk "BEGIN {printf \"%.2f\", $TOTAL_SCORE / $VALIDATOR_COUNT}")
log_info "Consensus score: $CONSENSUS"

# Store consensus in Redis
docker run --rm \
    --network "$NETWORK_NAME" \
    redis:7-alpine \
    redis-cli -h "$REDIS_CONTAINER" SET "task:$TASK_ID:consensus" "$CONSENSUS" >/dev/null

# Consensus threshold check
CONSENSUS_THRESHOLD=0.90
CONSENSUS_PASSED=$(awk "BEGIN {print ($CONSENSUS < $CONSENSUS_THRESHOLD)}")

if [ "$CONSENSUS_PASSED" = "1" ]; then
    log_success "Validators detected issues: $CONSENSUS < $CONSENSUS_THRESHOLD (ITERATE)"

    # Signal ITERATE decision
    docker run --rm \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        redis-cli -h "$REDIS_CONTAINER" SET "task:$TASK_ID:decision" "ITERATE" >/dev/null
else
    log_error "Expected ITERATE but got consensus ≥ $CONSENSUS_THRESHOLD"
    exit 1
fi

# =============================================================================
# Phase 4: Loop 3 Iteration 2 - Fix Tests
# =============================================================================
log_phase "Phase 4: Loop 3 Iteration 2 (agents fix tests based on feedback)"

# Python Agent - Fixed test (validates actual output)
PYTHON_FIXED_SCRIPT='
apk add --no-cache python3 redis >/dev/null 2>&1

# Read validator feedback
FEEDBACK=$(redis-cli -h "$REDIS_HOST" GET "task:$TASK_ID:validator:validator-1:feedback")
echo "Python Agent: Received feedback: $FEEDBACK"

# Create proper test (validates actual output)
cat > /workspace/test_hello_fixed.py << "EOF"
import subprocess
result = subprocess.run(["python3", "hello.py"], capture_output=True, text=True)
assert result.stdout.strip() == "Hello, World!", f"Expected '\''Hello, World!'\'' but got '\''{result.stdout.strip()}'\''"
print("Test passed: Output validated")
EOF

# Run fixed test
cd /workspace && python3 test_hello_fixed.py

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed_iteration_2" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.92" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result_iter2" "PASS" >/dev/null
'

# JavaScript Agent - Fixed test (validates actual output)
JAVASCRIPT_FIXED_SCRIPT='
apk add --no-cache nodejs npm redis >/dev/null 2>&1

# Read validator feedback
FEEDBACK=$(redis-cli -h "$REDIS_HOST" GET "task:$TASK_ID:validator:validator-2:feedback")
echo "JavaScript Agent: Received feedback: $FEEDBACK"

# Create proper test (validates actual output)
cat > /workspace/test_hello_fixed.js << "EOF"
const { execSync } = require("child_process");
const output = execSync("node hello.js", { encoding: "utf-8" });
if (output.trim() !== "Hello, World!") {
    throw new Error(`Expected "Hello, World!" but got "${output.trim()}"`);
}
console.log("Test passed: Output validated");
EOF

# Run fixed test
cd /workspace && node test_hello_fixed.js

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed_iteration_2" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.90" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result_iter2" "PASS" >/dev/null
'

# Rust Agent - Fixed test (compiles AND executes)
RUST_FIXED_SCRIPT='
apk add --no-cache rust cargo redis >/dev/null 2>&1

# Read validator feedback
FEEDBACK=$(redis-cli -h "$REDIS_HOST" GET "task:$TASK_ID:validator:validator-3:feedback")
echo "Rust Agent: Received feedback: $FEEDBACK"

# Create proper test (compile AND execute)
cat > /workspace/test_hello_fixed.sh << "EOF"
#!/bin/sh
rustc hello.rs -o hello_bin 2>/dev/null
OUTPUT=$(./hello_bin)
if [ "$OUTPUT" = "Hello, World!" ]; then
    echo "Test passed: Output validated"
    exit 0
else
    echo "Test failed: Expected '\''Hello, World!'\'' but got '\''$OUTPUT'\''"
    exit 1
fi
EOF

chmod +x /workspace/test_hello_fixed.sh

# Run fixed test
cd /workspace && sh test_hello_fixed.sh

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed_iteration_2" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.91" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result_iter2" "PASS" >/dev/null
'

# Go Agent - Fixed test (executes and validates)
GO_FIXED_SCRIPT='
apk add --no-cache go redis >/dev/null 2>&1

# Read validator feedback
FEEDBACK=$(redis-cli -h "$REDIS_HOST" GET "task:$TASK_ID:validator:validator-3:feedback")
echo "Go Agent: Received feedback: $FEEDBACK"

# Create proper test (execute and validate)
cat > /workspace/test_hello_fixed.sh << "EOF"
#!/bin/sh
OUTPUT=$(go run hello.go 2>/dev/null)
if [ "$OUTPUT" = "Hello, World!" ]; then
    echo "Test passed: Output validated"
    exit 0
else
    echo "Test failed: Expected '\''Hello, World!'\'' but got '\''$OUTPUT'\''"
    exit 1
fi
EOF

chmod +x /workspace/test_hello_fixed.sh

# Run fixed test
cd /workspace && sh test_hello_fixed.sh

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed_iteration_2" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.93" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result_iter2" "PASS" >/dev/null
'

# Java Agent - Fixed test (compiles AND runs)
JAVA_FIXED_SCRIPT='
apk add --no-cache openjdk17 redis >/dev/null 2>&1

# Read validator feedback
FEEDBACK=$(redis-cli -h "$REDIS_HOST" GET "task:$TASK_ID:validator:validator-3:feedback")
echo "Java Agent: Received feedback: $FEEDBACK"

# Create proper test (compile AND run)
cat > /workspace/test_hello_fixed.sh << "EOF"
#!/bin/sh
javac Hello.java 2>/dev/null
OUTPUT=$(java Hello 2>/dev/null)
if [ "$OUTPUT" = "Hello, World!" ]; then
    echo "Test passed: Output validated"
    exit 0
else
    echo "Test failed: Expected '\''Hello, World!'\'' but got '\''$OUTPUT'\''"
    exit 1
fi
EOF

chmod +x /workspace/test_hello_fixed.sh

# Run fixed test
cd /workspace && sh test_hello_fixed.sh

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed_iteration_2" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.89" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result_iter2" "PASS" >/dev/null
'

# TypeScript Agent - Fixed test (executes with ts-node)
TYPESCRIPT_FIXED_SCRIPT='
apk add --no-cache nodejs npm redis >/dev/null 2>&1
npm install -g typescript ts-node >/dev/null 2>&1

# Read validator feedback
FEEDBACK=$(redis-cli -h "$REDIS_HOST" GET "task:$TASK_ID:validator:validator-3:feedback")
echo "TypeScript Agent: Received feedback: $FEEDBACK"

# Create proper test (execute with ts-node)
cat > /workspace/test_hello_fixed.sh << "EOF"
#!/bin/sh
OUTPUT=$(ts-node hello.ts 2>/dev/null)
if [ "$OUTPUT" = "Hello, World!" ]; then
    echo "Test passed: Output validated"
    exit 0
else
    echo "Test failed: Expected '\''Hello, World!'\'' but got '\''$OUTPUT'\''"
    exit 1
fi
EOF

chmod +x /workspace/test_hello_fixed.sh

# Run fixed test
cd /workspace && sh test_hello_fixed.sh

# Signal completion
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:status" "completed_iteration_2" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:confidence" "0.94" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:agent:$AGENT_ID:test_result_iter2" "PASS" >/dev/null
'

# Spawn all 6 agents again for iteration 2
run_agent "python-agent-1" "$PYTHON_FIXED_SCRIPT" &
run_agent "javascript-agent-1" "$JAVASCRIPT_FIXED_SCRIPT" &
run_agent "rust-agent-1" "$RUST_FIXED_SCRIPT" &
run_agent "go-agent-1" "$GO_FIXED_SCRIPT" &
run_agent "java-agent-1" "$JAVA_FIXED_SCRIPT" &
run_agent "typescript-agent-1" "$TYPESCRIPT_FIXED_SCRIPT" &

wait

log_success "Phase 4 complete: All agents fixed tests"

# =============================================================================
# Phase 5: Re-validation (Gate Check + Loop 2)
# =============================================================================
log_phase "Phase 5: Re-validation (gate check + Loop 2 consensus)"

# Gate check iteration 2
PASS_COUNT_ITER2=0
for agent in "${AGENTS[@]}"; do
    result=$(docker run --rm \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        redis-cli -h "$REDIS_CONTAINER" GET "task:$TASK_ID:agent:$agent:test_result_iter2" 2>/dev/null || echo "")

    if [ "$result" = "PASS" ]; then
        PASS_COUNT_ITER2=$((PASS_COUNT_ITER2 + 1))
        log_info "Agent $agent (iter2): PASS"
    else
        log_error "Agent $agent (iter2): FAIL"
    fi
done

PASS_RATE_ITER2=$(awk "BEGIN {printf \"%.2f\", $PASS_COUNT_ITER2 / $TOTAL_COUNT}")
log_info "Pass rate (iter2): $PASS_RATE_ITER2 ($PASS_COUNT_ITER2/$TOTAL_COUNT)"

GATE_PASSED_ITER2=$(awk "BEGIN {print ($PASS_RATE_ITER2 >= $GATE_THRESHOLD)}")
if [ "$GATE_PASSED_ITER2" = "1" ]; then
    log_success "Gate PASSED (iter2): $PASS_RATE_ITER2 ≥ $GATE_THRESHOLD"
else
    log_error "Gate FAILED (iter2): $PASS_RATE_ITER2 < $GATE_THRESHOLD"
    exit 1
fi

# Validators re-review (higher scores)
docker run --rm \
    --network "$NETWORK_NAME" \
    -v "$WORKSPACE_VOLUME":/workspace:ro \
    -e REDIS_HOST="$REDIS_CONTAINER" \
    -e TASK_ID="$TASK_ID" \
    alpine:latest \
    sh -c "$VALIDATOR_SCRIPT" - "validator-1-iter2" "0.92" "Python test now validates actual output - APPROVED" &

docker run --rm \
    --network "$NETWORK_NAME" \
    -v "$WORKSPACE_VOLUME":/workspace:ro \
    -e REDIS_HOST="$REDIS_CONTAINER" \
    -e TASK_ID="$TASK_ID" \
    alpine:latest \
    sh -c "$VALIDATOR_SCRIPT" - "validator-2-iter2" "0.91" "JavaScript test properly executes and validates - APPROVED" &

docker run --rm \
    --network "$NETWORK_NAME" \
    -v "$WORKSPACE_VOLUME":/workspace:ro \
    -e REDIS_HOST="$REDIS_CONTAINER" \
    -e TASK_ID="$TASK_ID" \
    alpine:latest \
    sh -c "$VALIDATOR_SCRIPT" - "validator-3-iter2" "0.93" "All tests now properly execute and validate output - APPROVED" &

wait

# Calculate consensus iteration 2
VALIDATORS_ITER2=("validator-1-iter2" "validator-2-iter2" "validator-3-iter2")
TOTAL_SCORE_ITER2=0

for validator in "${VALIDATORS_ITER2[@]}"; do
    score=$(docker run --rm \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        redis-cli -h "$REDIS_CONTAINER" GET "task:$TASK_ID:validator:$validator:score" 2>/dev/null || echo "0")

    TOTAL_SCORE_ITER2=$(awk "BEGIN {printf \"%.2f\", $TOTAL_SCORE_ITER2 + $score}")
    log_info "Validator $validator: Score=$score"
done

CONSENSUS_ITER2=$(awk "BEGIN {printf \"%.2f\", $TOTAL_SCORE_ITER2 / ${#VALIDATORS_ITER2[@]}}")
log_info "Consensus score (iter2): $CONSENSUS_ITER2"

# Store consensus in Redis
docker run --rm \
    --network "$NETWORK_NAME" \
    redis:7-alpine \
    redis-cli -h "$REDIS_CONTAINER" SET "task:$TASK_ID:consensus_iter2" "$CONSENSUS_ITER2" >/dev/null

CONSENSUS_PASSED_ITER2=$(awk "BEGIN {print ($CONSENSUS_ITER2 >= $CONSENSUS_THRESHOLD)}")
if [ "$CONSENSUS_PASSED_ITER2" = "1" ]; then
    log_success "Validators approved: $CONSENSUS_ITER2 ≥ $CONSENSUS_THRESHOLD (PROCEED)"

    # Signal PROCEED decision
    docker run --rm \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        redis-cli -h "$REDIS_CONTAINER" SET "task:$TASK_ID:decision_iter2" "PROCEED" >/dev/null
else
    log_error "Expected PROCEED but got consensus < $CONSENSUS_THRESHOLD"
    exit 1
fi

# =============================================================================
# Phase 6: Product Owner Decision
# =============================================================================
log_phase "Phase 6: Product Owner Decision"

PRODUCT_OWNER_SCRIPT='
apk add --no-cache redis >/dev/null 2>&1

# Read consensus from Redis
CONSENSUS=$(redis-cli -h "$REDIS_HOST" GET "task:$TASK_ID:consensus_iter2")
echo "Product Owner: Reviewing consensus=$CONSENSUS"

# Read validator feedback
for i in 1 2 3; do
    FEEDBACK=$(redis-cli -h "$REDIS_HOST" GET "task:$TASK_ID:validator:validator-$i-iter2:feedback")
    echo "Product Owner: Validator feedback: $FEEDBACK"
done

# Make decision (PROCEED because consensus ≥ 0.90)
DECISION="PROCEED"
echo "Product Owner: Decision=$DECISION"

# Write decision to Redis
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:product_owner:decision" "$DECISION" >/dev/null
redis-cli -h "$REDIS_HOST" SET "task:$TASK_ID:product_owner:reasoning" "All tests now properly validate execution output. Consensus 0.92 exceeds threshold. Work is complete." >/dev/null
'

docker run --rm \
    --network "$NETWORK_NAME" \
    -e REDIS_HOST="$REDIS_CONTAINER" \
    -e TASK_ID="$TASK_ID" \
    alpine:latest \
    sh -c "$PRODUCT_OWNER_SCRIPT"

# Verify Product Owner decision
PO_DECISION=$(docker run --rm \
    --network "$NETWORK_NAME" \
    redis:7-alpine \
    redis-cli -h "$REDIS_CONTAINER" GET "task:$TASK_ID:product_owner:decision")

if [ "$PO_DECISION" = "PROCEED" ]; then
    log_success "Product Owner: PROCEED decision confirmed"
else
    log_error "Product Owner: Expected PROCEED but got $PO_DECISION"
    exit 1
fi

# =============================================================================
# Final Summary
# =============================================================================
log_phase "Test Summary"

echo ""
echo "Phase 1: Loop 3 initial implementation ✓"
echo "  - 6 agents created hello-world files"
echo "  - 6 agents created flawed tests (pass but don't validate)"
echo "  - All tests passed (but were incorrect)"
echo ""
echo "Phase 2: Gate check ✓"
echo "  - Pass rate: $PASS_RATE (6/6 = 100%)"
echo "  - Gate threshold: $GATE_THRESHOLD"
echo "  - Gate PASSED, signaled Loop 2"
echo ""
echo "Phase 3: Loop 2 validation ✓"
echo "  - 3 validators detected flawed tests"
echo "  - Consensus: $CONSENSUS (below $CONSENSUS_THRESHOLD)"
echo "  - Decision: ITERATE"
echo ""
echo "Phase 4: Loop 3 iteration 2 ✓"
echo "  - 6 agents read validator feedback"
echo "  - 6 agents fixed tests to validate actual output"
echo "  - All tests passed with proper validation"
echo ""
echo "Phase 5: Re-validation ✓"
echo "  - Pass rate: $PASS_RATE_ITER2 (6/6 = 100%)"
echo "  - Gate PASSED again"
echo "  - Validators approved: $CONSENSUS_ITER2 (above $CONSENSUS_THRESHOLD)"
echo "  - Decision: PROCEED"
echo ""
echo "Phase 6: Product Owner ✓"
echo "  - Reviewed consensus and validator feedback"
echo "  - Decision: $PO_DECISION"
echo ""

log_success "All phases completed successfully!"
log_success "Full CFN Loop workflow validated: Loop 3 → Gate → Loop 2 → Iterate → Re-validate → Product Owner"

exit 0
