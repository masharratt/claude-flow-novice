---
name: cfn-loop-orchestration
description: "CFN Loop workflow orchestration - three-loop structure management with gate checks and consensus. Use when coordinating Loop 3 implementers and Loop 2 validators, managing iteration cycles, or enforcing quality gates."
version: 3.1.0
tags: [orchestration, cfn-loop, workflow, consensus]
status: production
---

# CFN Loop Orchestration Skill

## Metadata
- **Skill ID:** cfn-loop-orchestration
- **Version:** 3.1.0
- **Category:** Workflow Orchestration
- **Dependencies:** redis-coordination, product-owner-decision, agent-output-processing
- **Maturity:** Production
- **Last Updated:** 2025-11-20
- **Implementation:** TypeScript CLI (unified entry point, v1.0.0)

## Implementation Status
**Active:** TypeScript CLI v1.0.0 - Unified direct entry point
- **Primary Entry:** `dist/cli/orchestrator-cli.js` (TypeScript, Node.js native)
- **Core Engine:** `src/orchestrate.ts` compiled to `dist/orchestrate.js`
- **No Bash Wrappers:** Direct CLI eliminates all bash wrapper overhead
- **Benefits:** 612 lines of bash eliminated, type safety, direct invocation, native Node.js shebang
- **Integration:** Coordinator → Direct CLI invocation (no bash wrapper needed)

**Previous Implementation:** Bash wrappers (deprecated but preserved)
- `orchestrate-wrapper.sh` - Parameter validation wrapper (DEPRECATED)
- `orchestrate.sh` - Bash routing wrapper (DEPRECATED)
- `helpers/orchestrate-ts.sh` - TS invocation wrapper (DEPRECATED)
- Kept for reference, use CLI instead
- Migration: All callers should use `dist/cli/orchestrator-cli.js`

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

### Primary Entry Point (TypeScript CLI)
```bash
# Direct Node.js invocation (recommended)
./dist/cli/orchestrator-cli.js \
  --task-id <id> \
  --mode <mvp|standard|enterprise> \
  --max-iterations <n> \
  [--loop3-agents <agents>] \
  [--loop2-agents <agents>] \
  [--product-owner <agent>] \
  [--success-criteria <enabled|disabled>]

# Or via node directly
node ./dist/cli/orchestrator-cli.js --task-id test --mode standard --max-iterations 10
```

### Parameters (7 arguments)
**Required:**
- `--task-id`: Unique identifier for this CFN Loop execution (alphanumeric, hyphens, underscores, max 256 chars)
- `--mode`: Workflow mode: `mvp`, `standard`, or `enterprise` (determines thresholds)
- `--max-iterations`: Maximum iteration cycles (1-100, required for parameter validation)

**Optional:**
- `--loop3-agents`: Comma-separated implementer agent IDs (e.g., `backend-dev,coder`)
- `--loop2-agents`: Comma-separated validator agent IDs (e.g., `code-reviewer,tester`)
- `--product-owner`: Agent ID for strategic decision (e.g., `cto-agent`)
- `--success-criteria`: Validation flag - `enabled`, `disabled`, `true`, `false`, `yes`, `no`, `1`, `0`

### Informational Parameters
- `--help, -h`: Display usage information
- `--version, -v`: Display version (1.0.0)

### Return Values & Output
- Exit Code 0: Success (orchestrator initialized, parameters validated)
- Exit Code 1: Error (missing required parameters, invalid values, validation failed)
- Exit Code 130: Interrupted (SIGINT/SIGTERM signal received)

### Output Format
Initial orchestrator state (JSON):
```json
{
  "taskId": "auth-feature",
  "mode": "enterprise",
  "iteration": 0,
  "currentPhase": "loop3",
  "completedAgents": {},
  "failedAgents": {},
  "startTime": 1763621594885,
  "lastUpdateTime": 1763621594885
}
```

## Usage Examples

### Basic Invocation
```bash
./dist/cli/orchestrator-cli.js \
  --task-id test-task \
  --mode standard \
  --max-iterations 10
```

### Full Configuration
```bash
./dist/cli/orchestrator-cli.js \
  --task-id auth-feature \
  --mode enterprise \
  --max-iterations 15 \
  --loop3-agents backend-dev,coder \
  --loop2-agents code-reviewer,tester \
  --product-owner cto-agent \
  --success-criteria enabled
```

### With MVP Mode
```bash
./dist/cli/orchestrator-cli.js \
  --task-id quick-task \
  --mode mvp \
  --max-iterations 5 \
  --loop3-agents developer
```

### Help and Version
```bash
# Show help
./dist/cli/orchestrator-cli.js --help

# Show version
./dist/cli/orchestrator-cli.js --version
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

## Migration Guide: Bash Wrappers → TypeScript CLI

### Summary
The orchestration layer has moved from 612 lines of bash wrapper code to a unified TypeScript CLI entry point. All functionality is preserved with improved type safety and direct invocation.

### Files Affected
**Deprecated (still available, do not use for new code):**
- `orchestrate-wrapper.sh` (268 lines) - Parameter validation wrapper
- `orchestrate.sh` (172 lines) - Bash routing wrapper
- `helpers/orchestrate-ts.sh` (172 lines) - TypeScript invocation wrapper

**New (use for all new integrations):**
- `dist/cli/orchestrator-cli.js` - Direct TypeScript CLI entry point
- `src/cli/orchestrator-cli.ts` - TypeScript source

### Migration Steps

**Before (bash wrapper):**
```bash
./orchestrate-wrapper.sh \
  --task-id auth-feature \
  --mode standard \
  --loop3-agents backend-dev,coder \
  --loop2-agents code-reviewer,tester \
  --product-owner cto-agent \
  --max-iterations 10
```

**After (TypeScript CLI):**
```bash
./dist/cli/orchestrator-cli.js \
  --task-id auth-feature \
  --mode standard \
  --loop3-agents backend-dev,coder \
  --loop2-agents code-reviewer,tester \
  --product-owner cto-agent \
  --max-iterations 10
```

### Key Differences
1. **Direct Invocation:** No bash wrappers needed, direct Node.js execution
2. **Parameter Validation:** Happens in TypeScript with proper error messages
3. **Exit Codes:** Consistent exit code handling (0=success, 1=error, 130=interrupt)
4. **Type Safety:** All parameters validated with TypeScript types
5. **Performance:** Eliminates bash subprocess overhead (612 lines eliminated)

### Compatibility Notes
- All 7 parameters supported
- Mode enum validation (mvp, standard, enterprise)
- Max-iterations range validation (1-100)
- Agent ID sanitization (alphanumeric, hyphens, underscores)
- Task ID sanitization (alphanumeric, hyphens, underscores, colons, dots)
- Help and version flags supported

## Legacy Implementation Notes

This skill previously replaced the monolithic `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh` by:
1. Extracting CFN-specific workflow logic
2. Delegating Redis operations to redis-coordination skill
3. Modularizing helper functions into standalone scripts
4. Simplifying testing and maintenance

**Bash Wrapper Deprecation:**
Original bash wrappers are preserved for reference but should not be used for new code. The TypeScript CLI provides the same functionality with better performance and type safety.

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
