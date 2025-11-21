# CFN Loop Migration to trigger.dev

This document describes the migration from shell-based CFN Loop orchestration to trigger.dev TypeScript workflow engine.

## Overview

The CFN Loop was originally orchestrated via shell scripts with Redis coordination. This implementation replaces that with trigger.dev's managed workflow platform, providing:

- **Type Safety**: 100% TypeScript with strict mode
- **Native Concurrency**: Built-in parallel job execution
- **Observability**: Structured logging and dashboards
- **Error Handling**: Automatic retry and timeout management
- **Scalability**: Managed execution infrastructure

## Architecture Comparison

### Shell-Based (Previous)
```
CFN CLI orchestrate.sh
  → Loop 3 agents (spawn in serial/parallel via CLI)
  → Redis coordination (blpop/lpush)
  → Gate check (bash arithmetic)
  → Loop 2 agents (spawn in serial/parallel via CLI)
  → Consensus aggregation (bash grep/awk)
  → Product Owner (spawn via CLI)
  → Decision execution
```

### trigger.dev (Current)
```
CFN Loop Workflow (TypeScript)
  → Loop 3 Agent Jobs (parallel via task.trigger)
  → Gate Check Job (aggregate + validate)
  → Loop 2 Validator Jobs (parallel via task.trigger)
  → Consensus Aggregation (TypeScript calculation)
  → Product Owner Job (decision logic)
  → Result return (type-safe output)
```

## Type System Benefits

### Before (Shell)
```bash
# All data as strings
PASS_RATE=$(echo "$output" | grep -oP '\d+(?= passing)')
# No validation until execution
```

### After (TypeScript)
```typescript
// Strong typing with validation
const result: AgentResult = {
  agentId: string;
  testResults: TestResults;
  confidence: number;  // 0.0-1.0 enforced by type
};
// Compile-time errors for type mismatches
```

## Job Mapping

| Component | Shell | trigger.dev | Type |
|-----------|-------|-------------|------|
| Loop 3 Implementation | `agent-spawn.sh` | `loop3AgentJob` | Job |
| Gate Check | `cfn-gate-check.sh` | `gateCheckJob` | Job |
| Loop 2 Validation | `agent-spawn.sh` | `loop2ValidatorJob` | Job |
| Product Owner | `product-owner-decision.sh` | `productOwnerJob` | Job |
| Orchestration | `orchestrate.sh` | `cfnLoopWorkflow` | Workflow |

## Coordination Pattern Changes

### Shell-Based Coordination
```bash
# Blocking wait with Redis
redis-cli BLPOP "agent:${TASK_ID}:${AGENT_ID}:output" 1800

# Manual timeout handling
if [ $? -ne 0 ]; then
  # Agent timed out
fi

# Manual retry logic
for i in {1..3}; do
  # Retry spawn
done
```

### trigger.dev Coordination
```typescript
// Implicit waiting via task.trigger
const result = await loop3AgentJob.trigger(payload);

// Automatic retry (configured in job)
export const loop3AgentJob = task({
  maxAttempts: 1,  // Configurable
  timeout: '30m',   // Auto-enforced
});

// Parallel execution via Promise.all
const results = await Promise.all(
  agents.map(a => loop3AgentJob.trigger(a))
);
```

## Test Results Parsing Evolution

### Shell
```bash
# Extract via regex with loose matching
PASSED=$(echo "$output" | grep -oP '\d+(?= passing)' || echo "0")
FAILED=$(echo "$output" | grep -oP '\d+(?= failing)' || echo "0")

# No validation of extracted values
PASS_RATE=$(awk "BEGIN {print $PASSED / ($PASSED + $FAILED)}")
```

### trigger.dev TypeScript
```typescript
function parseTestResults(output: string): TestResults {
  // Multiple parsing strategies with fallbacks
  const passedMatch = output.match(/(\d+)\s+(?:passed|passing)/i);
  const failedMatch = output.match(/(\d+)\s+(?:failed|failing)/i);

  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
  const total = passed + failed;

  // Strong validation
  if (total === 0) {
    throw new Error('No test results found');
  }

  return {
    total,
    passed,
    failed,
    passRate: passed / total,  // Type: number (0.0-1.0)
  };
}
```

## Threshold Configuration

### Shell (Environment Variables)
```bash
# Scattered across multiple scripts
export LOOP3_THRESHOLD=0.95
export LOOP2_THRESHOLD=0.90
export MAX_ITERATIONS=10
export VALIDATOR_COUNT=3

# Mode not centralized
if [ "$MODE" = "enterprise" ]; then
  LOOP3_THRESHOLD=0.98
  LOOP2_THRESHOLD=0.95
  VALIDATOR_COUNT=5
fi
```

### trigger.dev (Centralized Types)
```typescript
export function getThresholdConfig(mode: CFNMode): ThresholdConfig {
  const configs: Record<CFNMode, ThresholdConfig> = {
    mvp: { loop3PassRateThreshold: 0.70, ... },
    standard: { loop3PassRateThreshold: 0.95, ... },
    enterprise: { loop3PassRateThreshold: 0.98, ... },
  };
  return configs[mode];
}
```

## Decision Logic Evolution

### Shell (Nested Conditions)
```bash
if [ "$GATE_PASSED" = "true" ]; then
  if [ "$CONSENSUS_MET" = "true" ]; then
    if [ "$BLOCKING_ISSUES" = "" ]; then
      DECISION="PROCEED"
    else
      DECISION="ITERATE"
    fi
  else
    DECISION="ITERATE"
  fi
else
  DECISION="ITERATE"
fi
```

### trigger.dev (Discriminated Union)
```typescript
function determineDecision(
  consensus: ConsensusResult,
  gateCheck: GateCheckResult,
  // ...
): DecisionCalc {
  if (iterationNumber >= maxIterations) {
    return {
      decision: 'ABORT' as const,
      abortReason: '...',
    };
  }

  if (!gateCheck.passed) {
    return {
      decision: 'ITERATE' as const,
      iterationFocus: 'implementation',
    };
  }

  // Type-safe: decision must be one of PROCEED | ITERATE | ABORT
  return {
    decision: 'PROCEED' as const,
    validations: [...],
  };
}
```

## Iteration Handling

### Shell (Recursive Spawning)
```bash
# Iteration loop controlled in orchestrate.sh
for ITERATION in {1..$MAX_ITERATIONS}; do
  # Spawn Loop 3
  # Gate check
  if [ "$GATE_PASSED" = "false" ]; then
    continue  # Next iteration
  fi
  # Continue to Loop 2
done
```

### trigger.dev (Native Loop)
```typescript
// Workflow contains iteration logic
while (currentIteration <= payload.maxIterations) {
  const loop3Results = await executeLoop3(...);
  const gateCheckResult = await executeGateCheck(...);

  if (!gateCheckResult.passed) {
    currentIteration++;
    continue;  // Native TypeScript loop
  }

  // Continue to Loop 2
  break;
}
```

## Error Handling

### Shell (Exit Codes)
```bash
agent-spawn.sh
if [ $? -ne 0 ]; then
  echo "Agent failed"
  exit 1
fi
```

### trigger.dev (Exception Handling)
```typescript
try {
  const result = await loop3AgentJob.trigger(payload);
  return result;
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown error';

  logger.error('Agent failed', { error: errorMessage });

  // Return failure result (not exception)
  return {
    agentId,
    confidence: 0,
    testResults: { total: 0, passed: 0, failed: 0, passRate: 0 },
  };
}
```

## Agent Spawning Integration

### Shell (Direct CLI)
```bash
cfn agent-spawn backend-developer \
  --task-description "..."
  --task-id "task-123"
```

### trigger.dev (Utility Class)
```typescript
const spawner = getSpawner();
const response = await spawner.spawn({
  agentType: 'backend-developer',
  taskDescription: '...',
  taskId: 'task-123',
  successCriteria: { ... },
});
```

Benefits:
- Type-safe agent spawning
- Request validation before spawn
- Configurable timeouts and retries
- Response parsing with error handling

## Observability

### Shell (Manual Logging)
```bash
echo "$(date): Starting Loop 3 agents" >> cfn-loop.log
echo "$(date): Agent completed: $AGENT_ID" >> cfn-loop.log
```

### trigger.dev (Structured Logging)
```typescript
logger.log('Starting Loop 3 agents', {
  taskId: payload.taskId,
  iteration: currentIteration,
  agentCount: agentTypes.length,
});

// Automatically:
// - Includes timestamps
// - Forwards to trigger.dev dashboard
// - Integrated with monitoring/alerting
```

## Configuration Management

### Shell (Multiple Files)
```
scripts/
  orchestrate.sh          # Main logic
  spawn-agent.sh          # Agent spawning
  gate-check.sh          # Gate validation
  cfn-loop-validation/   # Validation logic
```

### trigger.dev (Centralized)
```
trigger-dev/
  trigger.config.ts      # All configuration
  src/types/cfn-types.ts # Type definitions
  src/workflows/         # Workflows
  src/jobs/             # Jobs
```

Single source of truth for:
- Timeout values
- Threshold configuration
- Concurrency limits
- Retry policies

## Testing

### Shell (Manual Test Scripts)
```bash
#!/bin/bash
# tests/test-gate-check.sh
# Manual assertion logic
```

### trigger.dev (Vitest + TypeScript)
```typescript
describe('Threshold Configuration', () => {
  it('should return correct Standard thresholds', () => {
    const config = getThresholdConfig('standard');

    expect(config.loop3PassRateThreshold).toBe(0.95);
    expect(config.loop2ConsensusThreshold).toBe(0.9);
  });
});
```

Benefits:
- Type-safe test writing
- Parallel test execution
- Coverage reporting
- IDE support with autocomplete

## Deployment

### Shell-Based
```bash
# Manual setup
./scripts/docker/run-in-worktree.sh up -d
npm start

# Manual orchestration invocation
./scripts/orchestrate.sh --task-id task-123 --mode standard
```

### trigger.dev
```bash
# Development
npm run dev  # Local testing

# Production
npm run deploy  # Deploy to trigger.dev cloud

# Workflow triggering
// From TypeScript or HTTP
await triggerCFNLoop({ taskId, description, ... });
```

## Migration Path

### Phase 1: Parallel Running (Current)
- Deploy trigger.dev workflow alongside shell orchestration
- Compare results for identical tasks
- Validate type system accuracy

### Phase 2: Cutover
- Redirect new tasks to trigger.dev
- Keep shell system for legacy tasks
- Monitor error rates and performance

### Phase 3: Decommission
- Retire shell orchestration scripts
- Consolidate logging to trigger.dev
- Archive shell implementation for reference

## Success Criteria for Migration

- [ ] All CFN Loop test cases pass with ≥95% match to shell version
- [ ] Type system catches 100% of invalid inputs that shell missed
- [ ] Workflow completion time within 10% of shell version
- [ ] Zero data corruption or lost results
- [ ] All threshold configurations match between implementations
- [ ] Error handling at least as robust as shell version
- [ ] Monitoring/alerting integrated with trigger.dev dashboard

## Breaking Changes

None - The CFN Loop workflow behavior is identical. Only implementation changes:

1. **Configuration**: Now centralized in `trigger.config.ts`
2. **Logging**: Now structured JSON to trigger.dev dashboard
3. **Error Handling**: Exceptions caught and returned as failure results
4. **Type Safety**: All previously string-based values now strongly typed

## Runtime Blockers

The following require testing in trigger.dev runtime:

- [ ] Agent spawning via CFN CLI from trigger.dev job
- [ ] Redis coordination signal reception
- [ ] Test output parsing accuracy
- [ ] Concurrent job execution and waiting
- [ ] Workflow iteration when gate fails
- [ ] Complete end-to-end workflow execution

See `TODO: RUNTIME_TEST` comments in source code for specific validation points.

## Next Steps

1. **Setup trigger.dev Account**: Create account and project
2. **Install CLI**: `npm install -g trigger.dev`
3. **Configure Integration**: Add API keys to `.env`
4. **Test Locally**: Run `npm run dev` for local testing
5. **Deploy**: Use `npm run deploy` for production
6. **Monitor**: View workflow executions in trigger.dev dashboard
7. **Validate**: Run comprehensive tests against real agents
8. **Cutover**: Migrate production traffic to trigger.dev

## References

- trigger.dev Documentation: https://trigger.dev/docs
- CFN Loop Architecture: See main project `CLAUDE.md`
- Agent Spawning: See `.claude/skills/cfn-agent-spawning/SKILL.md`
- Coordination Protocols: See `.claude/skills/cfn-coordination/SKILL.md`
