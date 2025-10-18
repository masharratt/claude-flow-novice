# Hook Feedback Integration - Manual Test Suite

**Phase 4.5 Testing**
**Date:** 2025-10-17
**Status:** Ready for Execution

---

## Prerequisites

### 1. Redis Server Running
```bash
redis-cli ping
# Expected: PONG
```

### 2. Test Environment Setup
```bash
# Create test artifacts directory
mkdir -p .artifacts/hooks
mkdir -p .artifacts/agents/coder-1
mkdir -p .artifacts/coordinator

# Clean previous test data
rm -f .artifacts/hooks/agent-coder-1-feedback.json
rm -f .artifacts/agents/coder-1/pending-feedback.json
redis-cli del "agent:coder-1:feedback"
redis-cli del "coordinator:coordinator-hybrid:feedback"
```

---

## Test 1: ROOT_WARNING - CLI Mode

### Objective
Verify that creating a file in root triggers ROOT_WARNING feedback via Redis pub/sub to CLI agent.

### Setup
```bash
export AGENT_ID="coder-1"
export SPAWN_MODE="cli"
export MEMORY_KEY="swarm/coder-1/test-root-warning"
```

### Test Steps

**Step 1: Start CLI Agent Subscriber**
```bash
# Terminal 1: Start Redis subscriber
node src/cli/hybrid-routing/agent-feedback-subscriber.js coder-1 &
SUBSCRIBER_PID=$!
echo "Subscriber PID: $SUBSCRIBER_PID"
```

**Expected Output:**
```
✅ Agent coder-1 subscribed to agent:coder-1:feedback
```

**Step 2: Trigger ROOT_WARNING**
```bash
# Terminal 2: Create file in root (trigger hook)
echo "// Test file" > test-root-warning.txt

# Run post-edit hook manually
node config/hooks/post-edit-pipeline.js test-root-warning.txt \
  --memory-key "swarm/coder-1/test-root-warning"
```

**Expected Hook Output:**
```
⚠️  ROOT WARNING: File in root directory
   File: test-root-warning.txt

💡 SUGGESTED LOCATIONS:
   1. src/test-root-warning.txt (Source code directory)
   2. docs/test-root-warning.txt (Documentation directory)

✅ Feedback sent to agent coder-1 via Redis
✅ Feedback logged to .artifacts/hooks/agent-coder-1-feedback.json
```

**Step 3: Verify Redis Delivery**
```bash
# Check subscriber output (Terminal 1)
# Should show:
📬 HOOK FEEDBACK for coder-1:
{
  "timestamp": "2025-10-17T...",
  "source": "post-edit-pipeline",
  "agentId": "coder-1",
  "spawnMode": "cli",
  "type": "ROOT_WARNING",
  "file": "/path/to/test-root-warning.txt",
  "fileName": "test-root-warning.txt",
  "severity": "warning",
  "suggestions": [...]
}

✅ Feedback written to .artifacts/agents/coder-1/pending-feedback.json
```

**Step 4: Verify Persistent Log**
```bash
cat .artifacts/hooks/agent-coder-1-feedback.json
```

**Expected:**
```json
{
  "agentId": "coder-1",
  "feedback": [
    {
      "timestamp": "2025-10-17T...",
      "source": "post-edit-pipeline",
      "agentId": "coder-1",
      "spawnMode": "cli",
      "type": "ROOT_WARNING",
      "file": "/path/to/test-root-warning.txt",
      "fileName": "test-root-warning.txt",
      "severity": "warning",
      "suggestions": [...],
      "delivered": false,
      "deliveredAt": null
    }
  ],
  "lastUpdate": "2025-10-17T..."
}
```

**Step 5: Cleanup**
```bash
kill $SUBSCRIBER_PID
rm test-root-warning.txt
```

### Success Criteria
- ✅ Redis subscriber received feedback within 100ms
- ✅ Feedback written to both Redis channel and log file
- ✅ Spawn mode correctly detected as "cli"
- ✅ Suggestions provided with proper locations

---

## Test 2: ROOT_WARNING - Task Mode

### Objective
Verify coordinator-mediated feedback delivery for Task-spawned agents.

### Setup
```bash
export AGENT_ID="task_abc123"
export SPAWN_MODE="task"
export COORDINATOR_ID="coordinator-hybrid"
export MEMORY_KEY="swarm/task_abc123/test-task-mode"
```

### Test Steps

**Step 1: Start Coordinator Feedback Monitor**
```bash
# Terminal 1: Monitor coordinator feedback queue
echo "Starting coordinator monitor..."
while true; do
  feedback=$(redis-cli brpop "coordinator:coordinator-hybrid:feedback" 5 2>/dev/null)
  if [ -n "$feedback" ]; then
    echo "📬 Coordinator received feedback:"
    echo "$feedback" | jq '.'
    echo "$feedback" >> .artifacts/coordinator/pending-feedback.log
  fi
  sleep 1
done &
MONITOR_PID=$!
```

**Step 2: Trigger ROOT_WARNING as Task Agent**
```bash
# Terminal 2: Create file and trigger hook
echo "// Task agent test" > test-task-mode.txt

node config/hooks/post-edit-pipeline.js test-task-mode.txt \
  --memory-key "swarm/task_abc123/test-task-mode"
```

**Expected Hook Output:**
```
⚠️  ROOT WARNING: File in root directory
   File: test-task-mode.txt

✅ Coordinator coordinator-hybrid notified for Task agent task_abc123
✅ Feedback logged to .artifacts/hooks/agent-task_abc123-feedback.json
```

**Step 3: Verify Coordinator Queue**
```bash
# Check coordinator monitor (Terminal 1)
# Should show:
📬 Coordinator received feedback:
{
  "timestamp": "2025-10-17T...",
  "source": "post-edit-pipeline",
  "agentId": "task_abc123",
  "spawnMode": "task",
  "type": "ROOT_WARNING",
  ...
}
```

**Step 4: Verify Log File**
```bash
cat .artifacts/hooks/agent-task_abc123-feedback.json
```

**Expected:**
```json
{
  "agentId": "task_abc123",
  "feedback": [
    {
      "timestamp": "...",
      "spawnMode": "task",
      "type": "ROOT_WARNING",
      ...
    }
  ]
}
```

**Step 5: Cleanup**
```bash
kill $MONITOR_PID
rm test-task-mode.txt
redis-cli del "coordinator:coordinator-hybrid:feedback"
```

### Success Criteria
- ✅ Feedback sent to coordinator queue (LPUSH)
- ✅ Coordinator received feedback via BRPOP within 5s
- ✅ Spawn mode correctly detected as "task"
- ✅ Log file created with Task agent ID

---

## Test 3: LOW_COVERAGE Feedback

### Objective
Verify LOW_COVERAGE feedback when test coverage below threshold.

### Setup
```bash
export AGENT_ID="coder-1"
export MEMORY_KEY="swarm/coder-1/test-coverage"
```

### Test Steps

**Step 1: Create JavaScript file with low coverage**
```bash
cat > test-low-coverage.js << 'EOF'
export function add(a, b) {
  return a + b;
}

export function multiply(a, b) {
  return a * b;
}

export function divide(a, b) {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}

export function subtract(a, b) {
  return a - b;
}
EOF
```

**Step 2: Create incomplete test file (low coverage)**
```bash
cat > test-low-coverage.test.js << 'EOF'
import { add } from './test-low-coverage.js';

test('add function', () => {
  expect(add(1, 2)).toBe(3);
});
// Missing tests for multiply, divide, subtract = low coverage
EOF
```

**Step 3: Run hook with TDD mode**
```bash
node config/hooks/post-edit-pipeline.js test-low-coverage.js \
  --tdd-mode \
  --minimum-coverage 80 \
  --memory-key "swarm/coder-1/test-coverage"
```

**Expected Output:**
```
⚠️  Coverage below minimum (80%)
✅ Feedback sent to agent coder-1 via Redis
```

**Step 4: Verify Feedback**
```bash
cat .artifacts/hooks/agent-coder-1-feedback.json | jq '.feedback[] | select(.type == "LOW_COVERAGE")'
```

**Expected:**
```json
{
  "type": "LOW_COVERAGE",
  "file": "/path/to/test-low-coverage.js",
  "severity": "warning",
  "current": 45.2,
  "required": 80,
  "gap": 34.8,
  "message": "Test coverage 45.2% below threshold 80%"
}
```

**Step 5: Cleanup**
```bash
rm test-low-coverage.js test-low-coverage.test.js
```

### Success Criteria
- ✅ LOW_COVERAGE feedback triggered when coverage < 80%
- ✅ Gap calculated correctly
- ✅ Severity set to "warning"

---

## Test 4: RUST_QUALITY Feedback

### Objective
Verify RUST_QUALITY feedback for Rust code quality issues.

### Setup
```bash
export AGENT_ID="coder-1"
export MEMORY_KEY="swarm/coder-1/test-rust"
```

### Test Steps

**Step 1: Create Rust file with quality issues**
```bash
cat > test-rust-quality.rs << 'EOF'
fn main() {
    let x = Some(5);
    let y = x.unwrap();  // Quality issue: unwrap()

    let z = Some(10);
    let a = z.expect("failed");  // Quality issue: expect()

    panic!("test panic");  // Quality issue: panic!
}
EOF
```

**Step 2: Run hook with Rust strict mode**
```bash
node config/hooks/post-edit-pipeline.js test-rust-quality.rs \
  --rust-strict \
  --memory-key "swarm/coder-1/test-rust"
```

**Expected Output:**
```
🦀 RUST QUALITY ENFORCEMENT...
  ❌ Rust quality issues found
     [WARNING] Use of .unwrap() detected at line 3
     [WARNING] Use of .expect() detected at line 6
     [ERROR] Use of panic!() detected at line 8

✅ Feedback sent to agent coder-1 via Redis
```

**Step 3: Verify Feedback**
```bash
cat .artifacts/hooks/agent-coder-1-feedback.json | jq '.feedback[] | select(.type == "RUST_QUALITY")'
```

**Expected:**
```json
{
  "type": "RUST_QUALITY",
  "file": "/path/to/test-rust-quality.rs",
  "severity": "error",
  "issues": [
    { "severity": "warning", "message": "Use of .unwrap()..." },
    { "severity": "warning", "message": "Use of .expect()..." },
    { "severity": "error", "message": "Use of panic!()..." }
  ],
  "message": "3 Rust quality issue(s) found"
}
```

**Step 4: Cleanup**
```bash
rm test-rust-quality.rs
```

### Success Criteria
- ✅ RUST_QUALITY feedback triggered for quality issues
- ✅ Severity "error" when any issue is error-level
- ✅ All issues included in feedback

---

## Test 5: TDD_VIOLATION Feedback

### Objective
Verify TDD_VIOLATION feedback when tests are missing.

### Setup
```bash
export AGENT_ID="coder-1"
export MEMORY_KEY="swarm/coder-1/test-tdd"
```

### Test Steps

**Step 1: Create implementation without tests**
```bash
cat > test-tdd-violation.js << 'EOF'
export class Calculator {
  add(a, b) {
    return a + b;
  }

  multiply(a, b) {
    return a * b;
  }
}
EOF
```

**Step 2: Run hook with TDD mode (no test file exists)**
```bash
node config/hooks/post-edit-pipeline.js test-tdd-violation.js \
  --tdd-mode \
  --memory-key "swarm/coder-1/test-tdd"
```

**Expected Output:**
```
🧪 TDD TESTING...
⚠️  Tests not executed: Test file not found: test-tdd-violation.test.js

✅ Feedback sent to agent coder-1 via Redis
```

**Step 3: Verify Feedback**
```bash
cat .artifacts/hooks/agent-coder-1-feedback.json | jq '.feedback[] | select(.type == "TDD_VIOLATION")'
```

**Expected:**
```json
{
  "type": "TDD_VIOLATION",
  "file": "/path/to/test-tdd-violation.js",
  "severity": "warning",
  "hasTests": false,
  "violations": [
    {
      "type": "tdd_violation",
      "priority": "high",
      "message": "No test file found - TDD requires tests first",
      "action": "Create test file: test-tdd-violation.test.js"
    }
  ],
  "suggestedTestFile": "test-tdd-violation.test.js"
}
```

**Step 4: Cleanup**
```bash
rm test-tdd-violation.js
```

### Success Criteria
- ✅ TDD_VIOLATION feedback triggered when no test file
- ✅ Suggested test filename provided
- ✅ Severity "warning"

---

## Test 6: LINT_ISSUES Feedback

### Objective
Verify LINT_ISSUES feedback for linting failures.

### Setup
```bash
export AGENT_ID="coder-1"
export MEMORY_KEY="swarm/coder-1/test-lint"
```

### Test Steps

**Step 1: Create JavaScript file with lint issues**
```bash
cat > test-lint-issues.js << 'EOF'
const unused = 5;  // Lint issue: unused variable

function badFunction( ) {  // Lint issue: extra space
    var x = 10;  // Lint issue: var instead of const/let
    return x
}  // Lint issue: missing semicolon

export default badFunction;
EOF
```

**Step 2: Run hook (linting enabled)**
```bash
node config/hooks/post-edit-pipeline.js test-lint-issues.js \
  --memory-key "swarm/coder-1/test-lint"
```

**Expected Output:**
```
🔍 LINTING...
  ❌ Lint failed

✅ Feedback sent to agent coder-1 via Redis
```

**Step 3: Verify Feedback**
```bash
cat .artifacts/hooks/agent-coder-1-feedback.json | jq '.feedback[] | select(.type == "LINT_ISSUES")'
```

**Expected:**
```json
{
  "type": "LINT_ISSUES",
  "file": "/path/to/test-lint-issues.js",
  "severity": "info",
  "linter": "eslint",
  "issues": "...(linter output)...",
  "message": "Linting issues detected in test-lint-issues.js"
}
```

**Step 4: Cleanup**
```bash
rm test-lint-issues.js
```

### Success Criteria
- ✅ LINT_ISSUES feedback triggered
- ✅ Severity "info" (lowest priority)
- ✅ Linter name included

---

## Test 7: Hybrid Fallback (Redis Unavailable)

### Objective
Verify feedback still works when Redis is down (log file fallback).

### Test Steps

**Step 1: Stop Redis**
```bash
# Note: Don't actually stop Redis server in production
# Instead, use invalid Redis config
export REDIS_HOST="invalid-host"
export REDIS_PORT="9999"
```

**Step 2: Trigger ROOT_WARNING**
```bash
echo "// Test fallback" > test-redis-fallback.txt

node config/hooks/post-edit-pipeline.js test-redis-fallback.txt \
  --memory-key "swarm/coder-1/test-fallback"
```

**Expected Output:**
```
⚠️  ROOT WARNING: File in root directory
⚠️  Redis feedback failed (non-blocking): connect ECONNREFUSED
✅ Feedback logged to .artifacts/hooks/agent-coder-1-feedback.json
```

**Step 3: Verify Log File Still Works**
```bash
cat .artifacts/hooks/agent-coder-1-feedback.json | jq '.feedback[] | select(.fileName == "test-redis-fallback.txt")'
```

**Expected:**
```json
{
  "type": "ROOT_WARNING",
  "file": "/path/to/test-redis-fallback.txt",
  "fileName": "test-redis-fallback.txt",
  ...
}
```

**Step 4: Cleanup**
```bash
unset REDIS_HOST
unset REDIS_PORT
rm test-redis-fallback.txt
```

### Success Criteria
- ✅ Hook continues working when Redis unavailable
- ✅ Warning logged but non-blocking
- ✅ Feedback still written to log file

---

## Test 8: Performance - Feedback Latency

### Objective
Measure feedback delivery latency for CLI mode.

### Test Steps

**Step 1: Setup**
```bash
node src/cli/hybrid-routing/agent-feedback-subscriber.js coder-1 &
SUBSCRIBER_PID=$!
sleep 2  # Allow subscriber to connect
```

**Step 2: Measure Latency**
```bash
# Create test file and measure time
echo "// Performance test" > test-perf.txt

START=$(date +%s%3N)
node config/hooks/post-edit-pipeline.js test-perf.txt \
  --memory-key "swarm/coder-1/test-perf"
END=$(date +%s%3N)

LATENCY=$((END - START))
echo "Feedback latency: ${LATENCY}ms"
```

**Expected:**
- Latency < 100ms for CLI mode

**Step 3: Cleanup**
```bash
kill $SUBSCRIBER_PID
rm test-perf.txt
```

### Success Criteria
- ✅ Feedback delivered within 100ms
- ✅ No errors or timeouts

---

## Summary Test Report Template

After running all tests, create summary:

```markdown
## Phase 4.5 Test Results

**Date:** YYYY-MM-DD
**Tester:** [Name]

| Test | Status | Latency | Notes |
|------|--------|---------|-------|
| T1: ROOT_WARNING (CLI) | ✅/❌ | XXms | |
| T2: ROOT_WARNING (Task) | ✅/❌ | XXms | |
| T3: LOW_COVERAGE | ✅/❌ | N/A | |
| T4: RUST_QUALITY | ✅/❌ | N/A | |
| T5: TDD_VIOLATION | ✅/❌ | N/A | |
| T6: LINT_ISSUES | ✅/❌ | N/A | |
| T7: Hybrid Fallback | ✅/❌ | N/A | |
| T8: Performance | ✅/❌ | XXms | |

**Overall:** X/8 tests passed

**Issues Found:**
- [List any issues]

**Recommendations:**
- [List recommendations]
```

---

## Troubleshooting

### Issue: Subscriber not receiving feedback
```bash
# Check if Redis is running
redis-cli ping

# Check if channel exists
redis-cli pubsub channels "agent:*"

# Check subscriber process
ps aux | grep agent-feedback-subscriber
```

### Issue: Coordinator not receiving feedback
```bash
# Check coordinator queue
redis-cli llen "coordinator:coordinator-hybrid:feedback"

# Manually pop from queue
redis-cli brpop "coordinator:coordinator-hybrid:feedback" 5
```

### Issue: Log file not created
```bash
# Check directory permissions
ls -la .artifacts/hooks/

# Create directory if missing
mkdir -p .artifacts/hooks
```

---

## Next Steps After Testing

1. **If all tests pass:** Mark Phase 4.5 as production-ready
2. **If issues found:** Create GitHub issues for fixes
3. **Performance tuning:** Optimize based on latency measurements
4. **Documentation:** Update based on test findings

---

**Document Version:** 1.0.0
**Status:** Ready for Execution
