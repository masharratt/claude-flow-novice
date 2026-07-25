# Layer 5: Coordinator Spawning via Task Tool

**Test Pattern**: Main Chat → Task(coordinator) → Coordinator spawns CLI agents

## Test Setup

```bash
# Create test directory
mkdir -p /tmp/cfn-layer5-test-task
rm -f /tmp/cfn-layer5-test-task/*

# Store context in Redis
TASK_ID="layer5-task-$(date +%s)"
redis-cli HMSET "layer5:${TASK_ID}:context" \
  agents "backend-dev,code-analyzer,reviewer" \
  testDir "/tmp/cfn-layer5-test-task" \
  filesPerAgent "1"
```

## Main Chat Execution

Main Chat executes this Task tool call:

```javascript
Task("cfn-v3-coordinator", `
Task ID: ${TASK_ID}

You are coordinating a simple tool validation test.

ITERATION 1: Retrieve context
redis-cli HGETALL "layer5:${TASK_ID}:context"

ITERATION 2: Spawn 3 agents via CLI in background
for agent in backend-dev code-analyzer reviewer; do
  (npx claude-flow-novice agent $agent --context "Create /tmp/cfn-layer5-test-task/$agent-test.txt='Test'. Report success." > /tmp/layer5-$agent.log 2>&1) &
done
sleep 45

ITERATION 3: Store results
FILE_COUNT=$(ls /tmp/cfn-layer5-test-task/*.txt 2>/dev/null | wc -l)
redis-cli HMSET "layer5:${TASK_ID}:results" \
  agents_spawned "3" \
  files_created "$FILE_COUNT" \
  test_status "COMPLETE"

SUCCESS CRITERIA: 3 agents spawned, 3 files created.
`)
```

## Validation

```bash
# Check results
redis-cli HGETALL "layer5:${TASK_ID}:results"

# Expected output:
# agents_spawned: 3
# files_created: 3
# test_status: COMPLETE

# Verify files exist
ls -la /tmp/cfn-layer5-test-task/
# Should show: backend-dev-test.txt, code-analyzer-test.txt, reviewer-test.txt
```

## Success Criteria

- ✅ Main Chat spawns coordinator via Task tool
- ✅ Coordinator spawns 3 agents via CLI
- ✅ All 3 agents create files
- ✅ Results stored in Redis
- ✅ Coordinator completes in ≤5 iterations
