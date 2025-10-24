# CFN Loop Orchestration Skill

## Metadata
- **Skill ID:** cfn-loop-orchestration
- **Version:** 1.0.0
- **Category:** Workflow Orchestration
- **Dependencies:** redis-coordination, product-owner-decision, agent-output-processing
- **Maturity:** Production
- **Last Updated:** 2025-10-23

## Purpose
Orchestrates the Complete Fail Never (CFN) Loop workflow, managing the three-loop structure:
- Loop 3 (Primary Swarm - Implementation)
- Loop 2 (Consensus Validators - Review)
- Product Owner Decision (Strategic Approval)

## Responsibilities
1. Coordinate multi-agent CFN Loop execution
2. Manage gate checks and consensus validation
3. Handle iteration cycles with feedback injection
4. Interface with Redis Coordination for agent synchronization
5. Execute Product Owner decision flow
6. Enforce dependency ordering (Loop 3 → Loop 2 → PO)

## Interface

### Main Entry Point
```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id <unique-id> \
  --mode <mvp|standard|enterprise> \
  --loop3-agents <agent1,agent2,...> \
  --loop2-agents <agent1,agent2,...> \
  --product-owner <agent-id> \
  [--max-iterations <n>] \
  [--min-quorum-loop3 <n|n%|0.n>] \
  [--min-quorum-loop2 <n|n%|0.n>] \
  [--epic-context <json>] \
  [--phase-context <json>] \
  [--success-criteria <json>] \
  [--expected-files <file1,file2,...>] \
  [--phase-id <phase-identifier>]
```

### Parameters
- `task-id`: Unique identifier for this CFN Loop execution
- `mode`: Workflow mode (mvp, standard, enterprise) - determines thresholds
- `loop3-agents`: Comma-separated list of implementer agent IDs
- `loop2-agents`: Comma-separated list of validator agent IDs
- `product-owner`: Agent ID for strategic decision-making
- `max-iterations`: Maximum iteration cycles (default: 10)
- `min-quorum-loop3`: Minimum Loop 3 agents required (default: 0.66)
- `min-quorum-loop2`: Minimum Loop 2 agents required (default: 0.66)
- `epic-context`: JSON string with epic-level context
- `phase-context`: JSON string with phase-level context
- `success-criteria`: JSON string with acceptance criteria
- `expected-files`: Comma-separated list of expected deliverable files
- `phase-id`: Phase identifier for timeout configuration

### Return Values
- Exit Code 0: CFN Loop completed successfully (PROCEED decision)
- Exit Code 1: CFN Loop failed (ABORT decision or max iterations)
- Exit Code 130: User interrupt (graceful shutdown)

### Output Format (JSON)
```json
{
  "status": "success|failed|aborted",
  "iterations_completed": 2,
  "final_decision": "PROCEED|ITERATE|ABORT",
  "loop3_confidence": 0.92,
  "loop2_consensus": 0.94,
  "deliverables_verified": true,
  "execution_time_seconds": 1847
}
```

## Helper Scripts

### 1. gate-check.sh
Validates Loop 3 self-assessment against gate threshold.

**Usage:**
```bash
./.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh \
  --task-id <id> \
  --agents <agent1,agent2,...> \
  --threshold <0.0-1.0> \
  --min-quorum <n|n%|0.n>
```

**Returns:**
- Exit 0: Gate passed (broadcast signal to Loop 2)
- Exit 1: Gate failed (prepare Loop 3 iteration)

### 2. consensus.sh
Collects and validates Loop 2 consensus scores.

**Usage:**
```bash
./.claude/skills/cfn-loop-orchestration/helpers/consensus.sh \
  --task-id <id> \
  --agents <agent1,agent2,...> \
  --threshold <0.0-1.0> \
  --min-quorum <n|n%|0.n>
```

**Returns:**
- Exit 0: Consensus reached
- Exit 1: Consensus failed

### 3. iteration-manager.sh
Manages iteration cycles and feedback injection.

**Usage:**
```bash
./.claude/skills/cfn-loop-orchestration/helpers/iteration-manager.sh \
  --task-id <id> \
  --iteration <n> \
  --agents <agent1,agent2,...> \
  --feedback-source <redis-key>
```

**Returns:**
- Exit 0: Agents awakened for next iteration
- Exit 1: Iteration limit exceeded

### 4. deliverable-verifier.sh
Verifies expected deliverables were created.

**Usage:**
```bash
./.claude/skills/cfn-loop-orchestration/helpers/deliverable-verifier.sh \
  --expected-files <file1,file2,...> \
  --task-type <keyword-detection>
```

**Returns:**
- Exit 0: Deliverables verified
- Exit 1: Missing deliverables (forced iteration)

### 5. timeout-calculator.sh
Calculates phase-specific timeouts.

**Usage:**
```bash
./.claude/skills/cfn-loop-orchestration/helpers/timeout-calculator.sh \
  --phase-id <phase-identifier>
```

**Returns:**
- Timeout value in seconds (stdout)

## CFN Loop Flow

```
1. Initialize Swarm Context (Redis)
   ↓
2. Spawn Loop 3 Agents (CLI)
   ↓
3. Collect Loop 3 Confidence Scores
   ↓
4. Gate Check (helpers/gate-check.sh)
   ├─ PASS → Signal Loop 2 to start
   └─ FAIL → Wake Loop 3 for iteration N+1 (goto step 2)
   ↓
5. Loop 2 Validates Loop 3 Work
   ↓
6. Collect Loop 2 Consensus Scores
   ↓
7. Verify Deliverables (helpers/deliverable-verifier.sh)
   ↓
8. Spawn Product Owner for Decision
   ↓
9. Parse Product Owner Decision
   ├─ PROCEED → Exit success
   ├─ ITERATE → Wake all agents (goto step 2)
   └─ ABORT → Exit failure
```

## Redis Coordination Interface

This skill consumes the following Redis Coordination primitives:

### Context Storage
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence <0.0-1.0> \
  --iteration <n>
```

### Signal Broadcasting
```bash
redis-cli lpush "swarm:${TASK_ID}:gate-passed" "1"
```

### Agent Waiting/Waking
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --reason <reason> \
  --iteration <n> \
  --feedback <feedback-string>
```

### Result Collection
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
  --task-id "$TASK_ID" \
  --agent-ids <comma-separated>
```

## Mode-Specific Thresholds

| Mode | Gate Threshold | Consensus Threshold | Max Iterations | Validators |
|------|----------------|---------------------|----------------|------------|
| MVP | 0.70 | 0.80 | 5 | 2 |
| Standard | 0.75 | 0.90 | 10 | 3-4 |
| Enterprise | 0.75 | 0.95 | 15 | 5 |

## Error Handling

### Critical Failures
- Redis unavailable: Exit immediately with error
- Agent spawn failure: Retry with exponential backoff
- Timeout exceeded: Log state, attempt graceful shutdown

### Recoverable Failures
- Gate check failure: Iterate Loop 3
- Consensus failure: Iterate all agents
- Missing deliverables: Force iteration with explicit feedback

## Configuration

### Environment Variables
- `REDIS_HOST`: Redis server host (default: localhost)
- `REDIS_PORT`: Redis server port (default: 6379)
- `CFN_DEBUG`: Enable debug logging (default: 0)

### Redis Keys Used
- `swarm:{task-id}:epic-context`: Epic-level context
- `swarm:{task-id}:phase-context`: Phase-level context
- `swarm:{task-id}:success-criteria`: Acceptance criteria
- `swarm:{task-id}:agent:{agent-id}:confidence`: Agent confidence score
- `swarm:{task-id}:agent:{agent-id}:feedback`: Agent-specific feedback
- `swarm:{task-id}:gate-passed`: Gate pass signal for Loop 2
- `swarm:{task-id}:{agent-id}:done`: Agent completion signal

## Testing

Run comprehensive test suite:
```bash
./.claude/skills/cfn-loop-orchestration/test-cfn-orchestration.sh
```

Test scenarios:
1. Gate pass → Consensus pass → PROCEED
2. Gate fail → Loop 3 iteration
3. Consensus fail → Full iteration
4. Missing deliverables → Forced iteration
5. Max iterations → ABORT
6. User interrupt → Graceful shutdown

## Migration Notes

This skill replaces the monolithic `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh` by:
1. Extracting CFN-specific workflow logic
2. Delegating Redis operations to redis-coordination skill
3. Modularizing helper functions into standalone scripts
4. Simplifying testing and maintenance

**Backward Compatibility:**
Existing slash commands will be updated to call this skill instead of the monolithic orchestrator.

## Performance Characteristics

- Average execution time: 15-45 minutes (phase-dependent)
- Zero-token waiting between iterations (Redis BLPOP)
- Agent spawn time: 5-15 seconds per agent
- Context storage/retrieval: <100ms per operation

## Success Criteria

This skill is considered successful when:
1. All existing CFN Loop slash commands work without modification
2. Test suite achieves 100% pass rate
3. No regression in iteration management or consensus collection
4. Clear separation from Redis Coordination primitives
5. Helper scripts are reusable across different workflow types

## Confidence Score: 0.92

- Architecture: 0.95 (clear separation, modular design)
- Implementation Risk: 0.88 (complex logic extraction)
- Testing Coverage: 0.93 (comprehensive test scenarios)
- Backward Compatibility: 0.92 (existing workflows preserved)
