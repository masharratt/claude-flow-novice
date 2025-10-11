# Swarm Validation Loop Pattern

## Overview
Automated quality assurance through iterative swarm execution with consensus-based verification. Ensures task completion meets quality standards before proceeding.

## Core Pattern (Detailed)

```
Execute → Verify → Decision → Action
```

**Expanded Flow:**

1. **Execute** - Launch primary swarm with specialized agents for task
   - Spawn 3-8 agents based on complexity (coder, tester, reviewer, etc.)
   - Agents collaborate and produce deliverables (code, tests, docs)
   - Primary swarm self-reports completion with confidence score

2. **Verify** - Launch consensus swarm for independent validation
   - Deploy 2-4 validator agents (byzantine-coordinator, production-validator, code-review-swarm)
   - Run comprehensive checks: functionality, security, performance, quality gates
   - Validators independently assess and vote (Byzantine consensus)
   - Generate structured feedback with pass/fail criteria

3. **Decision** - Consensus determines outcome
   - **PASS**: ≥67% validator agreement + all critical criteria met
   - **FAIL**: <67% agreement OR any critical criteria failed
   - Record decision with detailed reasoning and metrics

4. **Action** - Execute based on decision
   - **If PASS**:
     * Mark task as complete
     * Store results in persistent memory
     * Generate success metrics
     * **→ Move to Next Task**

   - **If FAIL**:
     * Increment round counter (current_round++)
     * Extract actionable feedback from validators
     * **If current_round < 10**:
       - Inject feedback into context for next iteration
       - Update agent instructions with specific fixes needed
       - Store round state in memory
       - **→ Relaunch primary swarm** (return to Execute step)
     * **If current_round >= 10**:
       - Log comprehensive failure diagnostics
       - Store all iteration history
       - Generate human-readable summary
       - **→ Escalate to human** with full context

5. **Repeat** - Loop continues until PASS or max rounds reached
   - Each iteration builds on previous feedback
   - Context accumulates: round N has feedback from rounds 1..N-1
   - Agents learn from validator criticism
   - Quality improves iteratively

6. **Escalate** - Human intervention after 10 failed rounds
   - Present all 10 iterations with decisions
   - Show validator feedback progression
   - Highlight blocking issues
   - Provide recommendations for manual intervention
   - Preserve all work for human analysis

## Pattern Flow

```
┌─────────────────────────────────────────────────────────┐
│  Task Execution Loop (Max 10 Iterations)                │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  1. Launch Primary Swarm      │
        │  - Execute task with agents   │
        │  - Generate deliverables      │
        │  - Self-report completion     │
        └───────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  2. Launch Consensus Swarm    │
        │  - Byzantine verification     │
        │  - Multi-agent validation     │
        │  - Quality gate checks        │
        └───────────────────────────────┘
                        │
                ┌───────┴────────┐
                ▼                ▼
        ┌───────────┐    ┌──────────────┐
        │ VERIFIED  │    │  REJECTED    │
        │ Complete  │    │  Insufficient│
        └───────────┘    └──────────────┘
                │                │
                ▼                ▼
        ┌───────────┐    ┌──────────────┐
        │  Move to  │    │  Relaunch    │
        │ Next Task │    │  Swarm       │
        └───────────┘    │ (Round N+1)  │
                         └──────────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │ Max 10 rounds        │
                    │ If not verified:     │
                    │ - Log failure        │
                    │ - Escalate to human  │
                    └──────────────────────┘
```

## Implementation

### Step 1: Execute Primary Swarm

```javascript
// Initialize swarm with task
mcp__claude-flow-novice__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "adaptive"
});

// Spawn specialized agents for task
Task("Coder", "Implement feature X with tests", "coder")
Task("Tester", "Validate implementation", "tester")
Task("Code Analyzer", "Check quality standards", "code-analyzer")

// Agents execute and self-report completion
```

### Step 2: Launch Consensus Swarm for Verification

```javascript
// Launch consensus validators
Task("Byzantine Coordinator", "Verify implementation integrity", "byzantine-coordinator")
Task("Production Validator", "Ensure production-readiness", "production-validator")
Task("Code Review Swarm", "Multi-agent review", "code-review-swarm")

// Consensus decision: VERIFIED or REJECTED
```

### Step 3: Decision Logic

**If VERIFIED:**
- Mark task complete
- Store results in memory
- Proceed to next task
- Log success metrics

**If REJECTED:**
- Increment round counter (current_round++)
- If current_round < 10:
  - Collect feedback from consensus swarm
  - Inject feedback into primary swarm context
  - Relaunch primary swarm with improvements
- If current_round >= 10:
  - Log failure with detailed diagnostics
  - Escalate to human intervention
  - Store partial results for analysis

## Example Usage

### Simple Feature Implementation

```bash
# Round 1: Initial implementation
ROUND=1
mcp__claude-flow-novice__swarm_init --topology hierarchical
Task("Coder", "Build login API endpoint", "coder")
Task("Tester", "Create auth tests", "tester")

# Consensus verification
Task("Production Validator", "Verify implementation", "production-validator")
# Result: REJECTED - missing rate limiting

# Round 2: Fix issues
ROUND=2
Task("Coder", "Add rate limiting to login API", "coder")
Task("Security Specialist", "Audit security controls", "security-specialist")

# Consensus verification
Task("Byzantine Coordinator", "Final verification", "byzantine-coordinator")
# Result: VERIFIED - all checks passed

# Move to next task
```

### Complex System Design

```bash
# Round 1-3: Architecture iterations
for ROUND in {1..3}; do
  Task("Architect", "Design distributed cache system", "system-architect")
  Task("Performance Analyzer", "Validate performance targets", "perf-analyzer")

  # Consensus verification
  Task("Consensus Builder", "Verify design completeness", "consensus-builder")

  # Result: REJECTED rounds 1-2, VERIFIED round 3
done
```

## Consensus Validation Criteria

### Must Pass All:
1. **Functional Requirements** - All specified features implemented
2. **Quality Gates** - Code coverage ≥ 80%, no critical issues
3. **Security Checks** - No vulnerabilities, secure coding practices
4. **Performance Standards** - Meets latency/throughput requirements
5. **Production Readiness** - Deployment-ready, no mocks, real integrations
6. **Documentation** - Complete API docs, README, comments

### Byzantine Verification:
- Multiple agents independently validate
- Quorum required (e.g., 2/3 agreement)
- Cryptographic integrity checks
- Anomaly detection for malicious changes

## Benefits

✅ **Automated Quality Assurance** - No manual verification needed
✅ **Iterative Improvement** - Up to 10 chances to fix issues
✅ **Byzantine Fault Tolerance** - Resistant to single-agent failures
✅ **Production Confidence** - Consensus ensures real quality
✅ **Audit Trail** - Full history of iterations and decisions
✅ **Fail-Safe** - Human escalation after max rounds

## Configuration

```javascript
const ValidationLoopConfig = {
  maxRounds: 10,
  consensusQuorum: 0.67, // 67% agreement required
  validators: [
    "production-validator",
    "byzantine-coordinator",
    "code-review-swarm"
  ],
  failureActions: {
    escalateToHuman: true,
    storePartialResults: true,
    logDetailedDiagnostics: true
  },
  successActions: {
    storeInMemory: true,
    updateMetrics: true,
    notifyStakeholders: false
  }
};
```

## Memory Integration

Store validation state across rounds:

```javascript
// Store round state
mcp__claude-flow-novice__memory_usage({
  action: "store",
  key: `validation/task-${taskId}/round-${round}`,
  value: JSON.stringify({
    round,
    status: "rejected|verified",
    feedback: consensusFeedback,
    timestamp: Date.now()
  })
});

// Retrieve for next round
mcp__claude-flow-novice__memory_usage({
  action: "retrieve",
  key: `validation/task-${taskId}/round-${round-1}`
});
```

## Anti-Patterns to Avoid

❌ **Infinite loops** - Always enforce max rounds
❌ **Ignoring feedback** - Feed consensus results back to primary swarm
❌ **Single validator** - Use multiple agents for consensus
❌ **No escalation** - Must have human fallback after max rounds
❌ **Lost context** - Store state in memory between rounds

## Use Cases

1. **Feature Development** - Implement → Validate → Deploy
2. **Bug Fixes** - Fix → Verify no regression → Merge
3. **Refactoring** - Refactor → Validate behavior unchanged → Commit
4. **Security Patches** - Patch → Audit → Verify → Release
5. **Performance Optimization** - Optimize → Benchmark → Validate → Deploy

## Metrics to Track

- Average rounds to verification
- Verification success rate
- Common rejection reasons
- Time per validation round
- Human escalation frequency
- Consensus agreement levels