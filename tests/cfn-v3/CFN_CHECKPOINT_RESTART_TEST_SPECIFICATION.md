# CFN Loop Checkpoint/Restart Test Specification

**Date:** 2025-11-09
**Status:** Test Specification
**Component:** CFN Loop Forgiveness Mechanisms
**Priority:** High

---

## Executive Summary

This document specifies comprehensive tests for the CFN Loop checkpoint/restart forgiveness mechanism. The checkpoint/restart system enables workflows to recover from interruptions (SIGINT, crashes, timeouts, resource exhaustion) by saving workflow state at iteration boundaries and resuming from the last successful checkpoint.

**Current Status:** ❌ NOT IMPLEMENTED
**Expected Impact:** 80-90% reduction in workflow restart overhead from interruptions

---

## Test Categories Overview

| Category | Tests | Priority | Implementation Status |
|----------|-------|----------|----------------------|
| Checkpoint Creation | 7 tests | Critical | Not Started |
| State Persistence | 6 tests | Critical | Not Started |
| Restart/Resume | 8 tests | Critical | Not Started |
| Checkpoint Discovery | 6 tests | High | Not Started |
| Multi-iteration | 5 tests | High | Not Started |
| Failure Recovery | 7 tests | High | Not Started |
| Checkpoint Cleanup | 5 tests | Medium | Not Started |
| Performance Impact | 4 tests | Medium | Not Started |

**Total Tests:** 48 comprehensive test scenarios

---

## Checkpoint Architecture Requirements

### Checkpoint File Structure

```json
{
  "version": "1.0.0",
  "task_id": "task-auth-12345",
  "checkpoint_timestamp": "2025-11-09T15:30:00Z",
  "checkpoint_hash": "sha256:abc123...",
  "workflow_state": {
    "mode": "standard",
    "current_iteration": 3,
    "max_iterations": 10,
    "phase_id": "implementation",
    "gate_threshold": 0.75,
    "consensus_threshold": 0.90
  },
  "agent_state": {
    "loop3_agents": ["backend-developer", "frontend-engineer"],
    "loop2_agents": ["code-reviewer", "security-specialist"],
    "product_owner": "product-owner",
    "loop3_results": {
      "backend-developer-3-1": {
        "confidence": 0.85,
        "deliverables": ["src/auth.ts", "tests/auth.test.ts"],
        "completed_at": "2025-11-09T15:28:00Z"
      }
    },
    "loop2_results": {
      "code-reviewer-3-1": {
        "confidence": 0.90,
        "completed_at": "2025-11-09T15:29:00Z"
      }
    }
  },
  "iteration_history": [
    {
      "iteration": 1,
      "loop3_confidence": 0.70,
      "loop2_consensus": 0.82,
      "decision": "ITERATE",
      "feedback": "Improve test coverage"
    },
    {
      "iteration": 2,
      "loop3_confidence": 0.78,
      "loop2_consensus": 0.88,
      "decision": "ITERATE",
      "feedback": "Add error handling"
    }
  ],
  "deliverables": {
    "expected_files": ["src/auth.ts", "tests/auth.test.ts"],
    "verified": true,
    "verification_timestamp": "2025-11-09T15:29:30Z"
  },
  "context": {
    "epic_context": "{...}",
    "phase_context": "{...}",
    "success_criteria": "{...}"
  },
  "redis_keys": [
    "swarm:task-auth-12345:loop3:agent_ids:iteration3",
    "swarm:task-auth-12345:loop2:agent_ids:iteration3"
  ],
  "recovery_metadata": {
    "interruption_type": "SIGINT",
    "safe_resume_point": "iteration_3_complete",
    "cleanup_required": ["kill_processes", "cleanup_redis"]
  }
}
```

### Checkpoint Storage Location

```
PROJECT_ROOT/
├── .artifacts/
│   └── checkpoints/
│       └── [task-id]/
│           ├── checkpoint-iter1-[timestamp].json
│           ├── checkpoint-iter2-[timestamp].json
│           ├── checkpoint-iter3-[timestamp].json  (latest)
│           └── checkpoint-latest.json → checkpoint-iter3-[timestamp].json
```

---

## Test Suite 1: Checkpoint Creation Tests

### Test 1.1: Basic Checkpoint File Creation

**Objective:** Verify checkpoint file is created at iteration boundaries

**Setup:**
```bash
TASK_ID="test-checkpoint-basic-$$"
MODE="standard"
ITERATION=1
```

**Test Steps:**
1. Execute CFN Loop for 1 iteration
2. Verify checkpoint file exists at `.artifacts/checkpoints/${TASK_ID}/checkpoint-iter1-*.json`
3. Verify symlink `checkpoint-latest.json` points to latest checkpoint

**Expected Results:**
- ✅ Checkpoint file exists
- ✅ File has valid JSON structure
- ✅ Symlink points to correct file
- ✅ File permissions are 0600 (read/write owner only)

**Failure Scenarios:**
- ❌ No checkpoint file created
- ❌ Invalid JSON format
- ❌ Incorrect file permissions (security risk)

---

### Test 1.2: Checkpoint Contains Required State

**Objective:** Verify checkpoint contains all necessary workflow state

**Test Steps:**
1. Execute CFN Loop for 2 iterations
2. Load checkpoint file
3. Validate presence of required fields

**Required Fields Validation:**
```bash
# Required top-level fields
- version
- task_id
- checkpoint_timestamp
- checkpoint_hash
- workflow_state
- agent_state
- iteration_history
- deliverables
- context
- redis_keys
- recovery_metadata

# Required workflow_state fields
- mode
- current_iteration
- max_iterations
- phase_id
- gate_threshold
- consensus_threshold

# Required agent_state fields
- loop3_agents
- loop2_agents
- product_owner
- loop3_results
- loop2_results
```

**Expected Results:**
- ✅ All required fields present
- ✅ Field values have correct types
- ✅ Confidence scores are valid floats (0.0-1.0)
- ✅ Agent IDs match spawn records

---

### Test 1.3: Checkpoint Creation During Normal Operation

**Objective:** Verify checkpoints don't interfere with normal execution

**Test Steps:**
1. Execute CFN Loop for 5 iterations
2. Monitor execution time per iteration
3. Verify checkpoint files created for each iteration
4. Compare execution time with/without checkpoint

**Expected Results:**
- ✅ Checkpoint creation overhead <100ms per iteration
- ✅ No workflow interruption during checkpoint save
- ✅ All 5 checkpoint files exist
- ✅ Redis coordination unaffected

**Performance Benchmarks:**
- Checkpoint creation time: <100ms
- Checkpoint file size: <500KB (typical)
- No agent spawn delays

---

### Test 1.4: Checkpoint File Format Validation

**Objective:** Verify checkpoint JSON schema compliance

**Test Steps:**
1. Create checkpoint from workflow execution
2. Validate against JSON schema
3. Test with schema validation tools

**JSON Schema Validation:**
```bash
# Use jq for structure validation
jq -e '.version and .task_id and .workflow_state' checkpoint.json

# Validate timestamp format (ISO 8601)
jq -e '.checkpoint_timestamp | test("^[0-9]{4}-")' checkpoint.json

# Validate confidence scores range
jq -e '.agent_state.loop3_results | to_entries | all(.value.confidence >= 0 and .value.confidence <= 1)' checkpoint.json
```

**Expected Results:**
- ✅ Valid JSON syntax
- ✅ Conforms to schema
- ✅ All timestamps in ISO 8601 format
- ✅ All confidence scores in [0.0, 1.0] range

---

### Test 1.5: Checkpoint Directory Creation and Permissions

**Objective:** Verify checkpoint directory structure and security

**Test Steps:**
1. Start CFN Loop with new task ID
2. Verify checkpoint directory created automatically
3. Check directory permissions
4. Verify nested structure

**Expected Directory Structure:**
```bash
.artifacts/checkpoints/
├── task-auth-12345/
│   ├── checkpoint-iter1-20251109-153000.json
│   ├── checkpoint-iter2-20251109-153200.json
│   └── checkpoint-latest.json
└── task-search-67890/
    ├── checkpoint-iter1-20251109-154000.json
    └── checkpoint-latest.json
```

**Expected Results:**
- ✅ Directory created automatically
- ✅ Directory permissions: 0700 (owner only)
- ✅ File permissions: 0600 (owner only)
- ✅ Task ID isolation (separate directories)

---

### Test 1.6: Checkpoint Hash Verification

**Objective:** Ensure checkpoint integrity via hash validation

**Test Steps:**
1. Create checkpoint
2. Calculate checkpoint hash
3. Modify checkpoint file
4. Attempt to load modified checkpoint

**Hash Calculation:**
```bash
# Hash excludes checkpoint_hash field itself
CHECKPOINT_HASH=$(jq 'del(.checkpoint_hash)' checkpoint.json | sha256sum | awk '{print $1}')

# Compare with stored hash
STORED_HASH=$(jq -r '.checkpoint_hash' checkpoint.json)
```

**Expected Results:**
- ✅ Hash calculated correctly
- ✅ Hash stored in checkpoint
- ✅ Modified checkpoint rejected on load
- ✅ Tampering detected and reported

---

### Test 1.7: Checkpoint Creation on Error Boundaries

**Objective:** Verify checkpoint saved before critical operations

**Test Steps:**
1. Configure workflow to fail at Loop 2 consensus
2. Verify checkpoint created before failure
3. Verify safe resume point recorded

**Expected Results:**
- ✅ Checkpoint created before failure
- ✅ Recovery metadata includes failure point
- ✅ Safe resume point correctly identified
- ✅ No partial state corruption

---

## Test Suite 2: State Persistence Tests

### Test 2.1: Agent Results Persistence

**Objective:** Verify agent results are correctly saved in checkpoints

**Test Steps:**
1. Execute CFN Loop with 3 Loop 3 agents
2. Wait for all agents to complete
3. Load checkpoint
4. Verify all agent results present

**Validation:**
```bash
# Check Loop 3 results
LOOP3_COUNT=$(jq '.agent_state.loop3_results | length' checkpoint.json)
if [ "$LOOP3_COUNT" -ne 3 ]; then
    echo "ERROR: Expected 3 Loop 3 results, got $LOOP3_COUNT"
    exit 1
fi

# Verify confidence scores
jq -e '.agent_state.loop3_results | to_entries | all(.value.confidence > 0)' checkpoint.json
```

**Expected Results:**
- ✅ All agent results present
- ✅ Confidence scores preserved
- ✅ Deliverables list saved
- ✅ Completion timestamps recorded

---

### Test 2.2: Confidence Scores Preservation

**Objective:** Ensure confidence scores maintain precision through save/load

**Test Steps:**
1. Execute workflow with specific confidence scores
2. Save checkpoint
3. Load checkpoint
4. Compare loaded scores with original

**Test Data:**
```json
{
  "backend-developer-1-1": { "confidence": 0.857142857 },
  "frontend-engineer-1-1": { "confidence": 0.923076923 },
  "security-specialist-1-1": { "confidence": 0.750000000 }
}
```

**Expected Results:**
- ✅ Confidence scores preserved to 6 decimal places
- ✅ No rounding errors
- ✅ Float precision maintained
- ✅ Consensus calculations accurate after reload

---

### Test 2.3: Iteration State Capture

**Objective:** Verify iteration number and state correctly captured

**Test Steps:**
1. Execute workflow for 3 iterations
2. Load latest checkpoint
3. Verify iteration history complete

**Expected Iteration History:**
```json
{
  "iteration_history": [
    {
      "iteration": 1,
      "loop3_confidence": 0.72,
      "loop2_consensus": 0.84,
      "decision": "ITERATE",
      "feedback": "Improve test coverage",
      "timestamp": "2025-11-09T15:00:00Z"
    },
    {
      "iteration": 2,
      "loop3_confidence": 0.79,
      "loop2_consensus": 0.89,
      "decision": "ITERATE",
      "feedback": "Add error handling",
      "timestamp": "2025-11-09T15:02:00Z"
    },
    {
      "iteration": 3,
      "loop3_confidence": 0.86,
      "loop2_consensus": 0.92,
      "decision": "PROCEED",
      "timestamp": "2025-11-09T15:04:00Z"
    }
  ]
}
```

**Expected Results:**
- ✅ All iterations recorded
- ✅ Decisions preserved
- ✅ Feedback messages saved
- ✅ Timestamps accurate

---

### Test 2.4: Task Metadata Preservation

**Objective:** Ensure task context and metadata fully preserved

**Test Steps:**
1. Execute workflow with epic context, phase context, success criteria
2. Save checkpoint
3. Load checkpoint
4. Verify all context preserved

**Context Fields:**
```json
{
  "context": {
    "epic_context": {
      "epicGoal": "Implement authentication system",
      "deliverables": ["login", "registration", "password reset"],
      "acceptanceCriteria": ["secure storage", "session management"]
    },
    "phase_context": {
      "phase": "implementation",
      "sprint": 2,
      "dependencies": ["database setup"]
    },
    "success_criteria": {
      "deliverables": ["src/auth.ts", "tests/auth.test.ts"],
      "acceptanceCriteria": ["95% test coverage", "OWASP compliance"]
    }
  }
}
```

**Expected Results:**
- ✅ Epic context preserved
- ✅ Phase context preserved
- ✅ Success criteria preserved
- ✅ Nested JSON structures intact

---

### Test 2.5: Redis Keys Tracking

**Objective:** Verify Redis coordination keys are tracked for cleanup

**Test Steps:**
1. Execute workflow (creates Redis keys)
2. Load checkpoint
3. Verify redis_keys array contains all coordination keys
4. Test cleanup using tracked keys

**Expected Redis Keys:**
```json
{
  "redis_keys": [
    "swarm:task-auth-12345:epic-context",
    "swarm:task-auth-12345:phase-context",
    "swarm:task-auth-12345:success-criteria",
    "swarm:task-auth-12345:loop3:agent_ids:iteration1",
    "swarm:task-auth-12345:loop3:agent_ids:iteration2",
    "swarm:task-auth-12345:loop2:agent_ids:iteration1",
    "swarm:task-auth-12345:loop2:agent_ids:iteration2",
    "swarm:task-auth-12345:backend-developer-1-1:done",
    "swarm:task-auth-12345:code-reviewer-1-1:done"
  ]
}
```

**Expected Results:**
- ✅ All Redis keys tracked
- ✅ Keys grouped by category
- ✅ Cleanup script can use key list
- ✅ No orphaned keys after cleanup

---

### Test 2.6: Checkpoint File Not Corrupted

**Objective:** Ensure checkpoint files maintain integrity over time

**Test Steps:**
1. Create 10 checkpoints rapidly
2. Wait 1 hour
3. Load each checkpoint
4. Verify all load successfully

**Corruption Detection:**
```bash
# Test JSON validity
for checkpoint in .artifacts/checkpoints/*/checkpoint-*.json; do
    if ! jq empty "$checkpoint" 2>/dev/null; then
        echo "ERROR: Corrupted checkpoint: $checkpoint"
        exit 1
    fi
done

# Verify hash integrity
for checkpoint in .artifacts/checkpoints/*/checkpoint-*.json; do
    STORED_HASH=$(jq -r '.checkpoint_hash' "$checkpoint")
    CALC_HASH=$(jq 'del(.checkpoint_hash)' "$checkpoint" | sha256sum | awk '{print $1}')
    if [ "$STORED_HASH" != "sha256:$CALC_HASH" ]; then
        echo "ERROR: Hash mismatch in $checkpoint"
        exit 1
    fi
done
```

**Expected Results:**
- ✅ All checkpoints load successfully
- ✅ No file corruption
- ✅ Hash validation passes
- ✅ JSON structure intact

---

## Test Suite 3: Restart/Resume Tests

### Test 3.1: Resume from Checkpoint After SIGINT

**Objective:** Verify workflow can resume after SIGINT interruption

**Test Steps:**
1. Start CFN Loop workflow
2. Wait for iteration 2 to complete
3. Send SIGINT to orchestrator
4. Verify checkpoint saved
5. Resume workflow from checkpoint
6. Verify workflow continues from iteration 3

**Resume Command:**
```bash
# Auto-detect latest checkpoint
./orchestrate.sh --task-id "task-auth-12345" --resume

# Or specify checkpoint explicitly
./orchestrate.sh --task-id "task-auth-12345" --resume-from-checkpoint "checkpoint-iter2-20251109-153000.json"
```

**Expected Results:**
- ✅ SIGINT handled gracefully
- ✅ Checkpoint saved before exit
- ✅ Resume detects latest checkpoint
- ✅ Workflow continues from iteration 3
- ✅ No work duplicated
- ✅ Agent results from iterations 1-2 preserved

---

### Test 3.2: Resume from Checkpoint After Process Crash

**Objective:** Verify recovery from unexpected orchestrator crash

**Test Steps:**
1. Start CFN Loop workflow
2. Wait for iteration 1 to complete
3. Kill orchestrator process (SIGKILL)
4. Verify last checkpoint available
5. Resume workflow
6. Verify recovery successful

**Crash Simulation:**
```bash
# Start workflow in background
./orchestrate.sh --task-id "crash-test-$$" --mode standard &
ORCH_PID=$!

# Wait for checkpoint creation
sleep 30

# Simulate crash
kill -9 $ORCH_PID

# Resume
./orchestrate.sh --task-id "crash-test-$$" --resume
```

**Expected Results:**
- ✅ Checkpoint survives crash
- ✅ Resume detects incomplete execution
- ✅ Orphaned processes cleaned up
- ✅ Redis keys cleaned up
- ✅ Workflow continues from last safe point

---

### Test 3.3: Resume from Checkpoint After Timeout

**Objective:** Verify recovery from agent timeout failures

**Test Steps:**
1. Configure agent with short timeout (30s)
2. Execute workflow with slow agent
3. Wait for timeout to trigger
4. Verify checkpoint saved
5. Resume with increased timeout
6. Verify workflow completes

**Expected Results:**
- ✅ Timeout detected and handled
- ✅ Checkpoint saved with timeout metadata
- ✅ Resume allows timeout adjustment
- ✅ Workflow completes on retry
- ✅ No agent results lost

---

### Test 3.4: Verify No Work Duplication on Resume

**Objective:** Ensure resumed workflow doesn't duplicate completed work

**Test Steps:**
1. Execute workflow for 3 iterations
2. Interrupt after iteration 2
3. Resume workflow
4. Monitor Redis for duplicate agent spawns
5. Verify file system for duplicate deliverables

**Duplicate Detection:**
```bash
# Check Redis for duplicate agent IDs
redis-cli SMEMBERS "swarm:${TASK_ID}:loop3:agent_ids:iteration2" | sort > agents-before.txt
# Resume workflow
redis-cli SMEMBERS "swarm:${TASK_ID}:loop3:agent_ids:iteration2" | sort > agents-after.txt
diff agents-before.txt agents-after.txt  # Should be empty

# Check file system for duplicate writes
find . -name "*.ts" -printf "%T@ %p\n" | sort
```

**Expected Results:**
- ✅ No duplicate agent spawns
- ✅ No duplicate file writes
- ✅ Redis state consistent
- ✅ Iteration counter correct

---

### Test 3.5: Resume Preserves Iteration Count

**Objective:** Verify iteration counter accuracy after resume

**Test Steps:**
1. Execute workflow for 3 iterations
2. Interrupt and resume
3. Execute 2 more iterations
4. Verify final iteration count is 5

**Expected Results:**
- ✅ Iteration count preserved across resume
- ✅ Max iteration limit enforced correctly
- ✅ Iteration history shows all 5 iterations
- ✅ No iteration number gaps

---

### Test 3.6: Resume Handles Missing Deliverables

**Objective:** Verify resume detects missing deliverables from interrupted iteration

**Test Steps:**
1. Execute workflow
2. Interrupt during file write operation
3. Verify deliverable incomplete
4. Resume workflow
5. Verify incomplete deliverable re-created

**Expected Results:**
- ✅ Missing deliverables detected
- ✅ Incomplete work re-executed
- ✅ Deliverable verification passes
- ✅ Workflow continues normally

---

### Test 3.7: Resume from Different Resume Points

**Objective:** Verify resume works from multiple safe resume points

**Safe Resume Points:**
1. After Loop 3 completion
2. After Loop 2 validation
3. After Product Owner decision
4. After deliverable verification

**Test Steps:**
1. Create checkpoints at each resume point
2. Test resume from each checkpoint
3. Verify correct workflow continuation

**Expected Results:**
- ✅ Resume from any safe point
- ✅ Workflow continues correctly
- ✅ No state corruption
- ✅ No duplicate work

---

### Test 3.8: Resume Updates Configuration

**Objective:** Verify resume can update workflow parameters

**Test Steps:**
1. Start workflow with mode=mvp, max_iterations=5
2. Interrupt after iteration 2
3. Resume with mode=standard, max_iterations=10
4. Verify updated parameters applied

**Expected Results:**
- ✅ Mode updated to standard
- ✅ Thresholds updated (0.70→0.75, 0.80→0.90)
- ✅ Max iterations extended to 10
- ✅ Previous iteration history preserved
- ✅ Workflow continues with new config

---

## Test Suite 4: Checkpoint Discovery Tests

### Test 4.1: Automatic Latest Checkpoint Detection

**Objective:** Verify system auto-detects latest checkpoint on resume

**Test Steps:**
1. Create 5 checkpoints (iterations 1-5)
2. Resume without specifying checkpoint file
3. Verify latest checkpoint (iteration 5) used

**Expected Results:**
- ✅ Latest checkpoint auto-detected
- ✅ Symlink `checkpoint-latest.json` used
- ✅ Resume starts from iteration 6
- ✅ No manual checkpoint specification needed

---

### Test 4.2: Checkpoint Selection When Multiple Exist

**Objective:** Verify correct checkpoint selected from multiple files

**Test Steps:**
1. Create checkpoints at iterations 1, 2, 3, 5 (skip 4)
2. Resume workflow
3. Verify checkpoint from iteration 5 selected (latest)

**Selection Logic:**
```bash
# Find latest checkpoint by timestamp in filename
LATEST_CHECKPOINT=$(ls -t .artifacts/checkpoints/${TASK_ID}/checkpoint-iter*.json | head -n1)
```

**Expected Results:**
- ✅ Latest checkpoint selected
- ✅ Missing iteration 4 checkpoint doesn't cause error
- ✅ Resume from iteration 5 successful

---

### Test 4.3: Checkpoint Validation Before Resume

**Objective:** Verify checkpoint validated before resume

**Validation Checks:**
1. JSON syntax valid
2. Required fields present
3. Hash integrity verified
4. Version compatibility
5. Task ID matches

**Test Steps:**
1. Create valid checkpoint
2. Corrupt checkpoint (invalid JSON)
3. Attempt resume
4. Verify resume rejected

**Expected Results:**
- ✅ Corrupted checkpoint detected
- ✅ Resume aborted with clear error
- ✅ Fallback to previous checkpoint offered
- ✅ No partial resume attempted

---

### Test 4.4: Handling Corrupted Checkpoints

**Objective:** Verify system handles corrupted checkpoint files

**Corruption Scenarios:**
1. Invalid JSON syntax
2. Hash mismatch
3. Missing required fields
4. Wrong task ID

**Test Steps:**
1. Create 3 checkpoints
2. Corrupt checkpoint 3
3. Resume workflow
4. Verify fallback to checkpoint 2

**Expected Results:**
- ✅ Corruption detected
- ✅ Fallback to previous valid checkpoint
- ✅ Warning logged
- ✅ Workflow continues from checkpoint 2

---

### Test 4.5: Checkpoint Cleanup of Old/Invalid Files

**Objective:** Verify cleanup removes old and invalid checkpoints

**Test Steps:**
1. Create 20 checkpoints over 48 hours
2. Run checkpoint cleanup
3. Verify only recent/valid checkpoints remain

**Cleanup Rules:**
1. Keep checkpoints from last 24 hours
2. Keep every 10th checkpoint for history
3. Keep latest checkpoint always
4. Remove corrupted checkpoints

**Expected Results:**
- ✅ Old checkpoints cleaned up
- ✅ Recent checkpoints preserved
- ✅ Historical snapshots kept
- ✅ Latest checkpoint always kept

---

### Test 4.6: Checkpoint Version Compatibility

**Objective:** Verify checkpoint version migration on resume

**Test Steps:**
1. Create checkpoint with version 1.0.0
2. Upgrade orchestrator to version 1.1.0
3. Resume from old checkpoint
4. Verify migration successful

**Migration Path:**
```bash
# Detect version mismatch
CHECKPOINT_VERSION=$(jq -r '.version' checkpoint.json)
CURRENT_VERSION="1.1.0"

if [ "$CHECKPOINT_VERSION" != "$CURRENT_VERSION" ]; then
    # Migrate checkpoint format
    migrate_checkpoint "$CHECKPOINT_VERSION" "$CURRENT_VERSION"
fi
```

**Expected Results:**
- ✅ Version mismatch detected
- ✅ Migration script executed
- ✅ Checkpoint upgraded to current version
- ✅ Resume successful with migrated checkpoint

---

## Test Suite 5: Multi-iteration Checkpoint Tests

### Test 5.1: Checkpointing Across Multiple Iterations

**Objective:** Verify checkpoint creation across 10 iterations

**Test Steps:**
1. Execute workflow for 10 iterations
2. Verify 10 checkpoint files created
3. Verify each checkpoint has correct iteration number
4. Verify iteration history grows correctly

**Expected Results:**
- ✅ 10 checkpoint files exist
- ✅ Each checkpoint has unique timestamp
- ✅ Iteration numbers sequential (1-10)
- ✅ Iteration history cumulative

---

### Test 5.2: Resume from Different Iteration Checkpoints

**Objective:** Verify resume from any iteration checkpoint

**Test Steps:**
1. Execute workflow for 5 iterations
2. Resume from checkpoint 2 (should continue from iteration 3)
3. Resume from checkpoint 4 (should continue from iteration 5)
4. Resume from checkpoint 5 (should complete immediately if PROCEED)

**Expected Results:**
- ✅ Resume from iteration 2 → starts iteration 3
- ✅ Resume from iteration 4 → starts iteration 5
- ✅ Resume from iteration 5 → completes if decision was PROCEED
- ✅ No iteration gaps or duplicates

---

### Test 5.3: Checkpoint Progression Through Workflow Phases

**Objective:** Verify checkpoints track phase transitions

**Workflow Phases:**
1. Initialization
2. Loop 3 Execution
3. Loop 3 Gate Check
4. Loop 2 Validation
5. Consensus Check
6. Product Owner Decision

**Test Steps:**
1. Execute workflow with detailed phase tracking
2. Verify each checkpoint records current phase
3. Resume and verify phase continuation

**Expected Results:**
- ✅ Each checkpoint records current phase
- ✅ Resume continues from correct phase
- ✅ Phase transitions tracked in history
- ✅ No phase skipping on resume

---

### Test 5.4: Iteration Count Accuracy After Resume

**Objective:** Verify iteration counter accurate across multiple resumes

**Test Steps:**
1. Execute iterations 1-2, interrupt
2. Resume, execute iteration 3, interrupt
3. Resume, execute iterations 4-5, interrupt
4. Resume, execute iterations 6-10
5. Verify final count is 10

**Expected Results:**
- ✅ Iteration count accurate after each resume
- ✅ No iteration number reuse
- ✅ Max iteration limit enforced correctly
- ✅ Final iteration count is 10

---

### Test 5.5: Checkpoint Behavior at Workflow Completion

**Objective:** Verify checkpoint handling when workflow completes

**Test Steps:**
1. Execute workflow to PROCEED decision
2. Verify final checkpoint created
3. Verify final checkpoint marked as "complete"
4. Attempt resume from completed workflow

**Expected Results:**
- ✅ Final checkpoint created
- ✅ Checkpoint marked with completion status
- ✅ Resume from complete checkpoint returns success immediately
- ✅ No additional iterations attempted

---

## Test Suite 6: Failure Recovery Tests

### Test 6.1: Recovery After Agent Spawn Failures

**Objective:** Verify checkpoint enables retry after agent spawn failures

**Test Steps:**
1. Execute workflow with unreliable agent spawning (50% fail rate)
2. Spawn failures trigger checkpoint save
3. Resume workflow with corrected spawn configuration
4. Verify workflow completes

**Expected Results:**
- ✅ Spawn failures detected
- ✅ Checkpoint saved before abort
- ✅ Resume retries failed agent spawns
- ✅ Workflow completes successfully

---

### Test 6.2: Recovery After Timeout Errors

**Objective:** Verify checkpoint enables retry with adjusted timeout

**Test Steps:**
1. Execute workflow with 60s timeout
2. Agent exceeds timeout, workflow fails
3. Checkpoint saved at failure point
4. Resume with 300s timeout
5. Verify workflow completes

**Expected Results:**
- ✅ Timeout failure handled gracefully
- ✅ Checkpoint includes timeout metadata
- ✅ Resume allows timeout adjustment
- ✅ Workflow completes with extended timeout

---

### Test 6.3: Recovery After Resource Exhaustion

**Objective:** Verify checkpoint enables retry after memory/disk exhaustion

**Test Steps:**
1. Execute workflow near memory limit
2. Resource exhaustion triggers failure
3. Checkpoint saved
4. Free resources
5. Resume workflow
6. Verify completion

**Expected Results:**
- ✅ Resource exhaustion detected
- ✅ Checkpoint saved before crash
- ✅ Resume waits for resource availability
- ✅ Workflow completes after resources freed

---

### Test 6.4: Recovery After Redis Failures

**Objective:** Verify checkpoint enables retry after Redis outage

**Test Steps:**
1. Execute workflow
2. Stop Redis during execution
3. Workflow detects Redis failure, saves checkpoint
4. Restart Redis
5. Resume workflow
6. Verify recovery

**Expected Results:**
- ✅ Redis failure detected
- ✅ Checkpoint saved to disk (no Redis dependency)
- ✅ Resume reconnects to Redis
- ✅ Workflow continues from checkpoint

---

### Test 6.5: Checkpoint-based Retry Mechanisms

**Objective:** Verify checkpoint enables automatic retry logic

**Test Steps:**
1. Configure auto-retry on failure (max 3 retries)
2. Execute workflow that fails on iteration 2
3. Verify automatic retry from checkpoint
4. Verify retry limit enforced

**Expected Results:**
- ✅ Auto-retry triggered on failure
- ✅ Retry uses latest checkpoint
- ✅ Retry limit enforced (max 3)
- ✅ Final failure reported after max retries

---

### Test 6.6: Recovery from Deliverable Verification Failures

**Objective:** Verify checkpoint enables retry after deliverable check fails

**Test Steps:**
1. Execute workflow with deliverable verification
2. Delete expected deliverable before verification
3. Verification fails, checkpoint saved
4. Re-create deliverable
5. Resume workflow
6. Verify completion

**Expected Results:**
- ✅ Deliverable failure detected
- ✅ Checkpoint saved with verification metadata
- ✅ Resume re-runs verification
- ✅ Workflow completes after deliverable fixed

---

### Test 6.7: Recovery from Consensus Failures

**Objective:** Verify checkpoint enables retry after consensus failure

**Test Steps:**
1. Execute workflow with high consensus threshold (0.95)
2. Consensus fails at 0.88
3. Checkpoint saved with consensus metadata
4. Resume with lowered threshold (0.85)
5. Verify workflow proceeds

**Expected Results:**
- ✅ Consensus failure handled
- ✅ Checkpoint includes threshold metadata
- ✅ Resume allows threshold adjustment
- ✅ Workflow proceeds with adjusted threshold

---

## Test Suite 7: Checkpoint Cleanup Tests

### Test 7.1: Cleanup of Successful Checkpoint Files

**Objective:** Verify successful workflows trigger checkpoint cleanup

**Test Steps:**
1. Execute workflow to completion
2. Verify checkpoints from iterations 1-N exist
3. Trigger cleanup
4. Verify only final checkpoint retained

**Cleanup Rules for Success:**
- Keep final checkpoint for 7 days
- Archive intermediate checkpoints
- Delete after 7 days if no resume needed

**Expected Results:**
- ✅ Intermediate checkpoints archived
- ✅ Final checkpoint retained
- ✅ Disk space freed
- ✅ Resume still possible from final checkpoint

---

### Test 7.2: Retention of Failed Checkpoint Files

**Objective:** Verify failed workflows retain checkpoints for debugging

**Test Steps:**
1. Execute workflow that fails (max iterations reached)
2. Verify all checkpoints retained
3. Verify checkpoints marked as "debug" or "failed"
4. Verify extended retention period (30 days)

**Expected Results:**
- ✅ All checkpoints retained on failure
- ✅ Checkpoints marked for debugging
- ✅ Extended retention (30 days)
- ✅ Resume still possible

---

### Test 7.3: Checkpoint Directory Management

**Objective:** Verify checkpoint directories cleaned up properly

**Test Steps:**
1. Execute 10 workflows (10 task IDs)
2. Complete 5 workflows
3. Fail 5 workflows
4. Run cleanup after 7 days
5. Verify completed task directories cleaned
6. Verify failed task directories retained

**Expected Results:**
- ✅ Completed task directories cleaned after 7 days
- ✅ Failed task directories retained for 30 days
- ✅ Empty directories removed
- ✅ No orphaned checkpoint files

---

### Test 7.4: No Checkpoint File Leaks

**Objective:** Verify no checkpoint file accumulation over time

**Test Steps:**
1. Execute 100 workflows over 7 days
2. Monitor checkpoint directory size
3. Verify cleanup runs automatically
4. Verify directory size stable

**Monitoring:**
```bash
# Track checkpoint directory growth
INITIAL_SIZE=$(du -s .artifacts/checkpoints | awk '{print $1}')
# Execute 100 workflows
FINAL_SIZE=$(du -s .artifacts/checkpoints | awk '{print $1}')
GROWTH=$((FINAL_SIZE - INITIAL_SIZE))

# Growth should be minimal (<10MB) due to cleanup
if [ $GROWTH -gt 10240 ]; then
    echo "ERROR: Checkpoint leak detected (${GROWTH}KB growth)"
    exit 1
fi
```

**Expected Results:**
- ✅ Directory size stable
- ✅ Automatic cleanup runs
- ✅ No file leaks
- ✅ Disk space under control

---

### Test 7.5: Checkpoint Cleanup on Workflow Completion

**Objective:** Verify cleanup triggered automatically on completion

**Test Steps:**
1. Execute workflow to PROCEED decision
2. Verify cleanup triggered automatically
3. Verify cleanup options configurable

**Cleanup Modes:**
- `immediate`: Delete all intermediate checkpoints
- `archive`: Move checkpoints to archive directory
- `retain`: Keep all checkpoints (debugging)

**Expected Results:**
- ✅ Cleanup triggered on completion
- ✅ Cleanup mode configurable
- ✅ No manual cleanup needed
- ✅ Resume still possible if needed

---

## Test Suite 8: Performance Impact Tests

### Test 8.1: Checkpoint Creation Overhead

**Objective:** Measure performance impact of checkpoint creation

**Benchmarks:**
```bash
# Execute 10 iterations WITHOUT checkpoint
time ./orchestrate.sh --task-id "no-checkpoint-$$" --disable-checkpoint
BASELINE_TIME=$?

# Execute 10 iterations WITH checkpoint
time ./orchestrate.sh --task-id "with-checkpoint-$$"
CHECKPOINT_TIME=$?

# Calculate overhead
OVERHEAD=$((CHECKPOINT_TIME - BASELINE_TIME))
OVERHEAD_PCT=$((OVERHEAD * 100 / BASELINE_TIME))
```

**Expected Results:**
- ✅ Checkpoint overhead <5% of total execution time
- ✅ Checkpoint creation <100ms per iteration
- ✅ No agent spawn delays
- ✅ No Redis performance degradation

**Acceptable Overhead:**
- Total workflow: <5%
- Per-iteration: <100ms
- Per-checkpoint: <50ms

---

### Test 8.2: Checkpoint I/O Impact

**Objective:** Measure I/O impact of checkpoint writes

**Test Steps:**
1. Monitor disk I/O during workflow execution
2. Measure checkpoint write times
3. Verify writes don't block workflow
4. Verify async write capability

**I/O Metrics:**
```bash
# Measure checkpoint write time
START=$(date +%s%N)
jq '.' checkpoint.json > /tmp/checkpoint-test.json
END=$(date +%s%N)
WRITE_TIME=$(((END - START) / 1000000))  # Convert to ms

echo "Checkpoint write time: ${WRITE_TIME}ms"
```

**Expected Results:**
- ✅ Checkpoint write time <50ms
- ✅ Writes don't block agent spawning
- ✅ Async writes possible
- ✅ No I/O bottlenecks

---

### Test 8.3: Workflow Speed Not Significantly Impacted

**Objective:** Verify checkpoint doesn't slow workflow execution

**Test Steps:**
1. Execute 10 workflows without checkpoint (baseline)
2. Execute 10 workflows with checkpoint
3. Compare average execution times
4. Verify difference <5%

**Statistical Analysis:**
```bash
# Calculate average execution time
BASELINE_AVG=$(awk '{sum+=$1} END {print sum/NR}' baseline-times.txt)
CHECKPOINT_AVG=$(awk '{sum+=$1} END {print sum/NR}' checkpoint-times.txt)

# Calculate percentage difference
DIFF=$(echo "scale=2; ($CHECKPOINT_AVG - $BASELINE_AVG) / $BASELINE_AVG * 100" | bc)

echo "Execution time difference: ${DIFF}%"
```

**Expected Results:**
- ✅ Average difference <5%
- ✅ No significant slowdown
- ✅ Performance variance minimal
- ✅ Checkpoint overhead acceptable

---

### Test 8.4: Checkpoint File Size and Growth

**Objective:** Verify checkpoint file size remains reasonable

**Test Steps:**
1. Execute workflow for 1 iteration
2. Measure checkpoint file size
3. Execute workflow for 10 iterations
4. Measure checkpoint file size growth
5. Verify linear growth

**Size Benchmarks:**
- Iteration 1: <100KB
- Iteration 10: <500KB
- Per-iteration growth: <50KB

**Expected Results:**
- ✅ File size growth linear
- ✅ No exponential growth
- ✅ Compression effective
- ✅ Storage requirements acceptable

---

### Test 8.5: Resume Time Measurement

**Objective:** Measure time to resume from checkpoint

**Test Steps:**
1. Create checkpoint from iteration 5
2. Measure time to load checkpoint
3. Measure time to initialize resume
4. Measure total resume overhead

**Resume Time Breakdown:**
```bash
# Checkpoint load time
LOAD_START=$(date +%s%N)
CHECKPOINT=$(cat checkpoint.json | jq '.')
LOAD_END=$(date +%s%N)
LOAD_TIME=$(((LOAD_END - LOAD_START) / 1000000))

# State restoration time
RESTORE_START=$(date +%s%N)
# Restore Redis state, validate deliverables, etc.
RESTORE_END=$(date +%s%N)
RESTORE_TIME=$(((RESTORE_END - RESTORE_START) / 1000000))

echo "Load time: ${LOAD_TIME}ms"
echo "Restore time: ${RESTORE_TIME}ms"
echo "Total resume time: $((LOAD_TIME + RESTORE_TIME))ms"
```

**Expected Results:**
- ✅ Checkpoint load time <100ms
- ✅ State restoration <500ms
- ✅ Total resume overhead <1s
- ✅ Resume faster than full restart

---

## Implementation Checklist

### Phase 1: Checkpoint Creation (Week 1)

- [ ] Implement checkpoint file structure
- [ ] Create checkpoint directory management
- [ ] Implement checkpoint creation at iteration boundaries
- [ ] Add checkpoint hash calculation
- [ ] Implement checkpoint validation
- [ ] Add checkpoint creation tests (Suite 1)

### Phase 2: State Persistence (Week 2)

- [ ] Implement agent results serialization
- [ ] Add iteration history tracking
- [ ] Implement context preservation
- [ ] Add Redis keys tracking
- [ ] Implement deliverables persistence
- [ ] Add state persistence tests (Suite 2)

### Phase 3: Resume Logic (Week 3)

- [ ] Implement checkpoint discovery
- [ ] Add checkpoint validation on resume
- [ ] Implement state restoration
- [ ] Add resume from different points
- [ ] Implement duplicate work prevention
- [ ] Add restart/resume tests (Suite 3)

### Phase 4: Cleanup and Optimization (Week 4)

- [ ] Implement checkpoint cleanup logic
- [ ] Add retention policies
- [ ] Optimize checkpoint I/O
- [ ] Add compression if needed
- [ ] Add performance tests (Suite 8)
- [ ] Add cleanup tests (Suite 7)

### Phase 5: Failure Recovery (Week 5)

- [ ] Implement auto-retry with checkpoint
- [ ] Add graceful shutdown with checkpoint
- [ ] Implement recovery from various failures
- [ ] Add failure recovery tests (Suite 6)

### Phase 6: Integration and Documentation (Week 6)

- [ ] Integrate with orchestrate.sh
- [ ] Add CLI resume commands
- [ ] Document checkpoint architecture
- [ ] Create user guide for resume
- [ ] Add multi-iteration tests (Suite 5)
- [ ] Add discovery tests (Suite 4)

---

## Success Criteria

**Checkpoint System is production-ready when:**

1. ✅ All 48 tests pass
2. ✅ Checkpoint overhead <5% of total execution time
3. ✅ Resume time <1 second
4. ✅ Zero data loss on interruption
5. ✅ Zero work duplication on resume
6. ✅ Checkpoint files <500KB (typical)
7. ✅ Cleanup prevents file accumulation
8. ✅ Recovery from all failure types validated

---

## Test Execution Commands

```bash
# Run all checkpoint tests
./tests/test-cfn-checkpoint-restart.sh --all

# Run specific test suite
./tests/test-cfn-checkpoint-restart.sh --suite checkpoint-creation
./tests/test-cfn-checkpoint-restart.sh --suite state-persistence
./tests/test-cfn-checkpoint-restart.sh --suite restart-resume
./tests/test-cfn-checkpoint-restart.sh --suite checkpoint-discovery
./tests/test-cfn-checkpoint-restart.sh --suite multi-iteration
./tests/test-cfn-checkpoint-restart.sh --suite failure-recovery
./tests/test-cfn-checkpoint-restart.sh --suite checkpoint-cleanup
./tests/test-cfn-checkpoint-restart.sh --suite performance-impact

# Run specific test
./tests/test-cfn-checkpoint-restart.sh --test "Resume from Checkpoint After SIGINT"

# Run with verbose output
./tests/test-cfn-checkpoint-restart.sh --all --verbose

# Generate test report
./tests/test-cfn-checkpoint-restart.sh --all --report
```

---

## Related Documentation

- **Forgiveness Mechanisms:** `docs/CFN_FORGIVENESS_MECHANISMS_COMPLETE.md`
- **Orchestration Guide:** `.claude/skills/cfn-loop-orchestration/README.md`
- **Redis Coordination:** `.claude/skills/cfn-redis-coordination/README.md`
- **Testing Guide:** `docs/CFN_FORGIVENESS_TESTING_GUIDE.md`

---

**End of Test Specification**
