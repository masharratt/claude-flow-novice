# Docker 50-Agent Parallel Spawn Test Plan

## Objective

Validate that a Docker coordinator can spawn 50 agent containers in parallel with minimal memory allocation, ensuring:
1. **No work overlap** - Coordinator assigns unique tasks
2. **Post-edit validation** - Each agent triggers the pipeline
3. **Error handling** - Agents respond to validation failures
4. **Coordination integrity** - Redis-based task assignment and completion tracking

## Test Architecture

```
Coordinator Container
    ├── Reads task list (50 hello-world file variations)
    ├── Spawns 50 agent containers in parallel
    │   ├── Agent 1: writes hello-world.js (valid)
    │   ├── Agent 2: writes hello-world.ts (invalid syntax)
    │   ├── Agent 3: writes hello-world.py (security issue)
    │   └── ... (47 more with various scenarios)
    └── Monitors completion via Redis coordination
```

## Phase 1: Memory Profiling

**Objective:** Determine minimal viable memory per agent container

### Baseline Measurements

1. **Idle container memory**
   ```bash
   docker run -d --memory=128m claude-flow-novice:agent sleep 300
   docker stats --no-stream <container_id>
   ```

2. **Agent with post-edit execution**
   ```bash
   # Create simple file edit that triggers post-edit pipeline
   docker run -d --memory=256m \
     -v /tmp/test-workspace:/workspace \
     claude-flow-novice:agent \
     sh -c "echo 'console.log()' > /workspace/test.js && ./.claude/hooks/cfn-invoke-post-edit.sh /workspace/test.js"
   ```

3. **Measure peak memory during validation**
   - Security scanner
   - Bash validators
   - Complexity analysis

**Expected ranges:**
- Idle: 10-50MB
- Node.js runtime: 50-100MB
- Post-edit pipeline: +50-100MB (validators, scanners)
- **Estimated minimum:** 128-256MB per container

### Memory Limit Testing

Test agent execution with decreasing memory limits:
- 512MB (comfortable)
- 256MB (tight but viable?)
- 128MB (minimal - may OOM)
- 64MB (expected failure)

Find the **minimum viable allocation** where agents complete successfully.

## Phase 2: Test File Variations

**50 hello-world variations across multiple scenarios:**

### Valid Files (10 agents)
1. `hello-world-valid-1.js` - Simple console.log
2. `hello-world-valid-2.ts` - TypeScript with types
3. `hello-world-valid-3.py` - Python print
4. `hello-world-valid-4.sh` - Bash echo
5. ... (6 more valid variations)

### Invalid Syntax (10 agents)
11. `hello-world-syntax-1.js` - Missing semicolon
12. `hello-world-syntax-2.ts` - Wrong type annotation
13. `hello-world-syntax-3.py` - Indentation error
14. ... (7 more syntax errors)

### Security Issues (10 agents)
21. `hello-world-security-1.js` - eval() usage
22. `hello-world-security-2.sh` - Command injection pattern
23. `hello-world-security-3.py` - Hardcoded credential
24. ... (7 more security issues)

### Complexity Issues (10 agents)
31. `hello-world-complexity-1.js` - Deeply nested conditions
32. `hello-world-complexity-2.sh` - High cyclomatic complexity
33. ... (8 more complexity issues)

### Mixed Issues (10 agents)
41. `hello-world-mixed-1.js` - Syntax + security
42. `hello-world-mixed-2.ts` - Complexity + security
43. ... (8 more mixed issues)

## Phase 3: Coordinator Design

### Coordinator Container Responsibilities

1. **Initialize Redis task queue**
   ```bash
   for i in {1..50}; do
     redis-cli LPUSH "task:queue" "task-$i"
     redis-cli HSET "task:$i" "file" "hello-world-$i.ext" "content" "..."
   done
   ```

2. **Spawn 50 agents in parallel**
   ```bash
   for i in {1..50}; do
     docker run -d \
       --name "agent-$i" \
       --network cfn-loop-test-network \
       --memory=${MEMORY_LIMIT}m \
       -e REDIS_HOST=redis \
       -e TASK_ID=parallel-test \
       -e AGENT_ID="agent-$i" \
       claude-flow-novice:agent \
       sh -c "$(cat agent-worker.sh)" &
   done
   wait
   ```

3. **Monitor completion**
   ```bash
   while [ $(redis-cli LLEN "task:queue") -gt 0 ]; do
     sleep 1
   done
   ```

4. **Validate no work overlap**
   - Check Redis completion data
   - Ensure each task assigned to exactly one agent
   - Verify all 50 tasks completed

### Agent Worker Script

```bash
#!/bin/bash
set -euo pipefail

# Pop task from queue (atomic operation)
TASK_ID=$(redis-cli RPOP "task:queue")
if [ -z "$TASK_ID" ]; then
  echo "No tasks available"
  exit 0
fi

# Get task details
FILE=$(redis-cli HGET "$TASK_ID" "file")
CONTENT=$(redis-cli HGET "$TASK_ID" "content")

# Write file
mkdir -p /workspace
echo "$CONTENT" > "/workspace/$FILE"

# Trigger post-edit validation
./.claude/hooks/cfn-invoke-post-edit.sh "/workspace/$FILE" --agent-id "$AGENT_ID"
VALIDATION_EXIT=$?

# Report completion to Redis
redis-cli HSET "$TASK_ID:result" \
  "agent_id" "$AGENT_ID" \
  "exit_code" "$VALIDATION_EXIT" \
  "completed_at" "$(date -Iseconds)"

exit 0
```

## Phase 4: Validation Metrics

### Success Criteria

1. ✅ **All 50 agents spawn successfully**
2. ✅ **No task overlap** - Each task assigned to exactly one agent
3. ✅ **Memory limits respected** - No OOM kills
4. ✅ **Post-edit pipeline executes** - All agents trigger validation
5. ✅ **Correct error detection** - Invalid files flagged appropriately
6. ✅ **Coordinator cleanup** - All containers removed after completion

### Metrics to Collect

- **Spawn time:** Time to spawn all 50 containers
- **Peak memory:** Maximum memory usage per agent
- **Completion time:** Total test duration
- **Success rate:** Agents that completed vs OOM/crashed
- **Task distribution:** Verification no agent took >1 task
- **Validation accuracy:** Errors correctly detected

## Phase 5: Test Implementation

### File Structure

```
tests/docker/
├── docker-50-agent-parallel-test.sh       # Main test orchestrator
├── coordinator/
│   ├── coordinator.sh                      # Coordinator logic
│   └── task-definitions.json               # 50 test file definitions
└── agents/
    └── agent-worker.sh                     # Agent task execution script
```

### Execution

```bash
# Run full parallel spawn test
bash tests/docker/docker-50-agent-parallel-test.sh

# With custom memory limit
AGENT_MEMORY_LIMIT=256 bash tests/docker/docker-50-agent-parallel-test.sh
```

## Expected Outcomes

**Hypothesis:**
- Minimal viable memory: **128-256MB per agent**
- Total memory for 50 agents: **6.4-12.8GB**
- Spawn time: **<30 seconds**
- Completion time: **<2 minutes**

**Key Validation:**
- Coordinator prevents work overlap via Redis atomic operations (RPOP)
- Agents handle post-edit validation failures gracefully
- System scales to 50 parallel containers without resource exhaustion

## Next Steps

1. ✅ Complete Tests 3/14 validation
2. 🔄 Phase 1: Memory profiling (measure baseline + post-edit overhead)
3. 🔄 Phase 2: Generate 50 test file variations
4. 🔄 Phase 3: Implement coordinator container
5. 🔄 Phase 4: Run parallel spawn test
6. 🔄 Phase 5: Analyze metrics and tune memory limits
