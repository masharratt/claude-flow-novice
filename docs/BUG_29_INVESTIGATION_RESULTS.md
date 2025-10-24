# BUG #29 Investigation Results

## Execution Summary
**Task ID:** bug-29-fix-1761317534
**Date:** 2025-10-24
**Status:** Root Cause Identified

## Observed Behavior

### What Happened
1. CFN Loop orchestrator started successfully
2. Loop 3 agents spawned: backend-dev-1-1, devops-engineer-1-1, researcher-1-1
3. All three agents completed successfully with 0.85 confidence
4. Orchestrator exited silently - no Loop 2, no Product Owner, no final result
5. No error messages logged

### What Should Have Happened
1. Loop 3 agents complete
2. Gate check validates Loop 3 confidence >= 0.75
3. Loop 2 validators spawn (reviewer, architect, interaction-tester)
4. Loop 2 consensus check
5. Product Owner makes PROCEED/ITERATE/ABORT decision
6. Final result returned

## Root Cause Analysis

### Primary Issue: Agent ID vs Agent Type Mismatch

**Problem:**
The orchestrator passes agent TYPES to helper scripts, but Redis stores confidence scores under agent IDS.

**Example:**
```bash
# Orchestrator calls gate-check with agent types:
gate-check.sh --agents "backend-dev,devops-engineer,researcher"

# But Redis has confidence scores under agent IDs:
swarm:bug-29-fix-1761317534:backend-dev-1-1:result
swarm:bug-29-fix-1761317534:devops-engineer-1-1:result
swarm:bug-29-fix-1761317534:researcher-1-1:result
```

**Result:**
- gate-check.sh looks for `swarm:...:backend-dev:result` (doesn't exist)
- Finds no confidence scores
- Fails quorum check
- Exits with code 1

### Secondary Issue: Silent Failure Due to `set -euo pipefail`

**Configuration:**
```bash
# Line 22 of orchestrate.sh:
set -euo pipefail
```

**Behavior:**
- `set -e`: Exit immediately if any command returns non-zero
- `set -u`: Treat unset variables as errors
- `set -o pipefail`: Return error from failed pipe commands

**Result:**
When gate-check.sh fails (exit code 1), the orchestrator immediately exits without:
- Logging the error
- Continuing to Loop 2
- Providing debug information
- Returning a result to Main Chat

## Evidence

### Redis Keys Confirm Agent IDs
```bash
$ redis-cli --scan --pattern "*bug-29-fix-1761317534*result"
swarm:bug-29-fix-1761317534:researcher-1-1:result
swarm:bug-29-fix-1761317534:devops-engineer-1-1:result
swarm:bug-29-fix-1761317534:backend-dev-1-1:result
```

### Agent IDs Stored Correctly
```bash
$ redis-cli GET "swarm:bug-29-fix-1761317534:loop3:agent_ids:iteration1"
"backend-dev-1-1,devops-engineer-1-1,researcher-1-1"
```

### Gate Check Fails with Agent Types
```bash
$ gate-check.sh --task-id "bug-29-fix-1761317534" \
                --agents "backend-dev,devops-engineer,researcher" \
                --threshold 0.75 --min-quorum 0.66
[Coordinator] Collecting results from agents...
  [backend-dev] ⚠️  No result found
  [devops-engineer] ⚠️  No result found
  [researcher] ⚠️  No result found
[Coordinator] ❌ Quorum not met
  Required: 1 agents
  Responding: 0 agents
Error: Failed to collect Loop 3 confidence scores
Exit code: 1
```

### Orchestrator Log Confirms Silent Exit
```bash
$ tail -20 /tmp/orchestrator_output.log
=== Agent Execution Complete ===
Input tokens: 126400
Output tokens: 564
Stop reason: max_tokens
[agent-executor] Stored messages for iteration 1

[CFN Protocol] Starting for agent researcher-1-1
[CFN Protocol] Task ID: bug-29-fix-1761317534, Iteration: 1
[CFN Protocol] Step 1: Signaling completion...
[CFN Protocol] ✓ Completion signaled
[CFN Protocol] Step 2: Reporting confidence (0.85)...
[CFN Protocol] ✓ Confidence reported
[CFN Protocol] Step 3: Exiting cleanly (iteration complete)
[CFN Protocol] Protocol complete

=== Execution Result ===
Agent ID: researcher-1-1
Status: ✓ Success
Exit Code: 0
# <-- Orchestrator stopped here, no gate check logged
```

## Fix Implementation

### Change 1: Retrieve Agent IDs from Redis
**Location:** orchestrate.sh, after line 724 (wait_for_agents call)

```bash
# Step 2: Wait for Loop 3 completion
wait_for_agents "$TASK_ID" "$LOOP3_AGENTS" "$TIMEOUT" "$ITERATION"

# NEW: Retrieve actual agent IDs from Redis
LOOP3_AGENT_IDS=$(redis-cli GET "swarm:${TASK_ID}:loop3:agent_ids:iteration${ITERATION}" 2>/dev/null || echo "")
if [ -z "$LOOP3_AGENT_IDS" ] || [ "$LOOP3_AGENT_IDS" = "(nil)" ]; then
  echo "❌ Error: Failed to retrieve Loop 3 agent IDs from Redis"
  echo "   Key: swarm:${TASK_ID}:loop3:agent_ids:iteration${ITERATION}"
  echo "   This indicates agent spawn tracking failed"
  exit 1
fi
echo "Retrieved Loop 3 agent IDs: $LOOP3_AGENT_IDS"
```

### Change 2: Pass Agent IDs to gate-check
**Location:** orchestrate.sh, line 751-755

```bash
# Step 4: Gate check (Loop 3 self-validation)
if "$HELPERS_DIR/gate-check.sh" \
     --task-id "$TASK_ID" \
     --agents "$LOOP3_AGENT_IDS" \        # Changed from $LOOP3_AGENTS
     --threshold "$GATE" \
     --min-quorum "$MIN_QUORUM_LOOP3"; then
```

### Change 3: Pass Agent IDs to confidence collection
**Location:** orchestrate.sh, line 756-759

```bash
# Gate passed - store confidence
LOOP3_FINAL_CONFIDENCE=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
  --task-id "$TASK_ID" \
  --agent-ids "$LOOP3_AGENT_IDS" \       # Changed from $LOOP3_AGENTS
  --min-quorum "$MIN_QUORUM_LOOP3")
```

### Change 4: Same Pattern for Loop 2
**Location:** orchestrate.sh, after wait_for_loop2_agents (line 778)

```bash
# Step 6: Wait for Loop 2 completion
wait_for_loop2_agents "$TASK_ID" "$LOOP2_AGENTS" "$TIMEOUT" "$ITERATION"

# NEW: Retrieve actual Loop 2 agent IDs
LOOP2_AGENT_IDS=$(redis-cli GET "swarm:${TASK_ID}:loop2:agent_ids:iteration${ITERATION}" 2>/dev/null || echo "")
if [ -z "$LOOP2_AGENT_IDS" ] || [ "$LOOP2_AGENT_IDS" = "(nil)" ]; then
  echo "❌ Error: Failed to retrieve Loop 2 agent IDs from Redis"
  exit 1
fi
echo "Retrieved Loop 2 agent IDs: $LOOP2_AGENT_IDS"
```

### Change 5: Pass Loop 2 Agent IDs to consensus
**Location:** orchestrate.sh, consensus.sh call (around line 782)

```bash
# Step 7: Consensus check (Loop 2 validation)
if "$HELPERS_DIR/consensus.sh" \
     --task-id "$TASK_ID" \
     --agents "$LOOP2_AGENT_IDS" \       # Changed from $LOOP2_AGENTS
     --threshold "$CONSENSUS_THRESHOLD" \
     --min-quorum "$MIN_QUORUM_LOOP2"; then
```

### Change 6: Enhanced Error Logging (Optional)
**Location:** orchestrate.sh, top of main while loop (around line 710)

```bash
# Main CFN Loop
while (( ITERATION <= MAX_ITERATIONS )); do
  echo "=== CFN Loop: Iteration $ITERATION ==="
  echo ""

  # Add error trap for better debugging
  set +e  # Temporarily disable exit-on-error for error capture
  trap 'handle_orchestrator_error $? $LINENO "$BASH_COMMAND"' ERR

  handle_orchestrator_error() {
    local exit_code=$1
    local line_number=$2
    local command="$3"
    echo ""
    echo "❌ ORCHESTRATOR ERROR DETECTED"
    echo "   Exit Code: $exit_code"
    echo "   Line: $line_number"
    echo "   Command: $command"
    echo "   Task ID: $TASK_ID"
    echo "   Iteration: $ITERATION"
    echo ""
    echo "Debug information:"
    echo "   Loop 3 Agents (types): $LOOP3_AGENTS"
    echo "   Loop 3 Agent IDs: ${LOOP3_AGENT_IDS:-not set}"
    echo "   Loop 2 Agents (types): $LOOP2_AGENTS"
    echo "   Loop 2 Agent IDs: ${LOOP2_AGENT_IDS:-not set}"
    echo ""
    redis-cli --scan --pattern "swarm:${TASK_ID}:*" | head -20
    exit $exit_code
  }

  set -e  # Re-enable exit-on-error
```

## Testing Plan

### Test 1: Verify Agent ID Retrieval
```bash
TASK_ID="test-$(date +%s)"
ITERATION=1

# Simulate agent spawn (manually set Redis key)
redis-cli SET "swarm:${TASK_ID}:loop3:agent_ids:iteration${ITERATION}" \
  "backend-dev-1-1,researcher-1-1"

# Test retrieval
LOOP3_AGENT_IDS=$(redis-cli GET "swarm:${TASK_ID}:loop3:agent_ids:iteration${ITERATION}")
echo "Retrieved: $LOOP3_AGENT_IDS"
# Expected: "backend-dev-1-1,researcher-1-1"
```

### Test 2: Verify Gate Check with Agent IDs
```bash
# Ensure confidence scores exist in Redis
redis-cli LPUSH "swarm:test-123:backend-dev-1-1:result" \
  '{"confidence":0.85,"iteration":1}'
redis-cli LPUSH "swarm:test-123:researcher-1-1:result" \
  '{"confidence":0.90,"iteration":1}'

# Run gate check with correct agent IDs
gate-check.sh --task-id "test-123" \
              --agents "backend-dev-1-1,researcher-1-1" \
              --threshold 0.75 \
              --min-quorum 0.66

# Expected: ✅ Gate PASSED
```

### Test 3: Full CFN Loop with Fix
```bash
# Re-run BUG #29 fix task
TASK_ID="bug-29-fix-$(date +%s)"

./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "backend-dev,researcher" \
  --loop2-agents "reviewer,tester" \
  --product-owner "product-owner" \
  --max-iterations 3

# Expected:
# 1. Loop 3 agents spawn and complete
# 2. Gate check PASSES (uses agent IDs)
# 3. Loop 2 agents spawn and complete
# 4. Consensus check runs (uses agent IDs)
# 5. Product Owner makes decision
# 6. Final result returned (no silent exit)
```

## Validation Criteria

### Must Pass
- [ ] Gate check finds confidence scores in Redis
- [ ] Loop 2 consensus check finds validation scores
- [ ] Orchestrator completes full loop (Loop 3 → Gate → Loop 2 → PO → Result)
- [ ] No silent exits on helper script failures
- [ ] Error messages logged when commands fail

### Success Metrics
- Gate check success rate: 100% (when confidence exists in Redis)
- Orchestrator completion rate: 100% (when agents complete)
- Error visibility: All failures logged with context
- Architecture confidence: >= 0.85

## Impact Assessment

### Before Fix
- Silent orchestrator failures
- No visibility into gate check/consensus failures
- Incomplete CFN Loop execution
- Manual debugging required for every failure

### After Fix
- All errors logged with context
- Helper scripts receive correct agent IDs
- Full CFN Loop execution (Loop 3 → Loop 2 → Product Owner)
- Clear error messages guide debugging

## Related Issues
- BUG #18: Agent lifecycle and waiting mode (resolved - agents now exit cleanly)
- BUG #20: Deliverable verification (resolved - mandatory file checks)
- BUG #11: Product Owner decision parsing (resolved - skill-based extraction)

## Next Steps
1. Implement fixes in orchestrate.sh
2. Run Test 1-3 validation
3. Execute full CFN Loop for BUG #29 fix validation
4. Achieve 0.85+ architecture confidence
5. Document lessons learned in adaptive context
