# CFN Loop Feedback Injection System

Comprehensive feedback capture, formatting, and injection system for consensus validation failures in the CFN (Claude Flow Novice) loop.

## Overview

This system provides intelligent feedback injection when consensus validation fails, enabling primary swarms to learn from validator criticisms and improve their output in subsequent iterations.

**New in v1.5.23**: Automatic circuit breaker with timeout protection for all CFN loop operations.

## Core Components

### 0. Circuit Breaker (New)

Automatic circuit breaker with timeout protection for CFN loop operations.

**Features:**
- Three-state circuit breaker: CLOSED, OPEN, HALF_OPEN
- Automatic iteration limit enforcement (Loop 2 & Loop 3)
- Global timeout protection (30 minutes default)
- Failure threshold tracking (3 consecutive failures)
- Automatic recovery attempts after cooldown

**Usage:**
```typescript
import { CFNCircuitBreaker, CFNCircuitBreakerManager } from './circuit-breaker.js';

// Create a circuit breaker
const breaker = new CFNCircuitBreaker('primary-swarm', {
  timeoutMs: 1800000,        // 30 minutes
  failureThreshold: 3,        // Open after 3 failures
  cooldownMs: 300000,         // 5 minutes cooldown
  successThreshold: 2,        // Close after 2 successes in half-open
  halfOpenLimit: 3            // Max 3 requests in half-open
});

// Execute with protection
try {
  const result = await breaker.execute(async () => {
    // Primary swarm execution
    return await executePrimarySwarm();
  });
} catch (error) {
  if (error.name === 'CircuitOpenError') {
    console.error('Circuit breaker is OPEN:', error.state);
  } else if (error.name === 'TimeoutError') {
    console.error('Operation timed out:', error.timeoutMs);
  }
}

// Check circuit state
console.log('Circuit state:', breaker.getState().state);

// Manual reset
breaker.reset();
```

**Circuit Breaker Manager:**
```typescript
const manager = new CFNCircuitBreakerManager();

// Execute with named breaker
await manager.execute('cfn-loop-phase1-primary', async () => {
  // Operation
}, { timeoutMs: 1800000 });

// Get all states
const states = manager.getAllStates();
console.log('Primary breaker:', states['cfn-loop-phase1-primary']);

// Get statistics
const stats = manager.getStatistics();
console.log('Open circuits:', stats.openCircuits);
console.log('Total timeouts:', stats.totalTimeouts);
```

**Integration with CFN Loop:**

The `/cfn-loop` command automatically includes circuit breaker protection:

```bash
/cfn-loop "Implement JWT auth" --phase=implementation --max-loop2=5 --max-loop3=10
```

Circuit breakers are automatically created for:
- Primary swarm execution (Loop 3): `cfn-loop-{phase}-primary`
- Consensus validation (Loop 2): `cfn-loop-{phase}-consensus`
- Global loop timeout: `cfn-loop-{phase}-global`

**Error Format:**
```javascript
throw new Error("Loop 3 exceeded max iterations (10)", {
  loop: 3,
  iterations: 10,
  phase: "implementation",
  reason: "max_iterations_exceeded"
});
```

### 1. FeedbackInjectionSystem

Captures and formats consensus validation feedback for re-injection into primary swarm agents.

**Features:**
- Validator feedback extraction (quality, security, performance, testing)
- Actionable step generation with priority ranking
- Issue deduplication across iterations
- Learning from previous iteration failures
- Multi-dimensional feedback categorization

**Usage:**
```typescript
import { FeedbackInjectionSystem } from './feedback-injection-system.js';

const feedbackSystem = new FeedbackInjectionSystem({
  maxIterations: 10,
  deduplicationEnabled: true,
  priorityThresholds: {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.3,
  },
});

// Capture feedback from consensus validation
const feedback = await feedbackSystem.captureFeedback({
  phaseId: 'auth-implementation',
  iteration: 2,
  consensusScore: 0.75,
  requiredScore: 0.9,
  validatorResults: [/* validator results */],
});

// Format for agent injection
const formatted = feedbackSystem.formatForInjection(feedback);

// Inject into agent instructions
const injected = feedbackSystem.injectIntoAgentInstructions(
  originalInstructions,
  feedback,
  'coder'
);
```

### 2. FeedbackMemoryManager

Manages persistence and retrieval of consensus feedback across iterations.

**Features:**
- In-memory feedback storage with TTL
- Phase-based indexing
- Trend analysis (improving/degrading)
- Accumulated issue tracking (recurring, resolved, new)
- Memory usage optimization with automatic eviction

**Usage:**
```typescript
import { FeedbackMemoryManager } from './feedback-memory-manager.js';

const memoryManager = new FeedbackMemoryManager({
  namespace: 'cfn-loop/feedback',
  defaultTTL: 86400 * 7, // 7 days
  maxEntries: 1000,
});

// Store feedback
await memoryManager.storeFeedback(feedback);

// Retrieve latest feedback for a phase
const latest = await memoryManager.getLatestFeedback('auth-implementation');

// Query with filters
const criticalFeedback = await memoryManager.queryFeedback({
  phaseId: 'auth-implementation',
  severityFilter: ['critical', 'high'],
  limit: 10,
});

// Analyze trends
const trends = await memoryManager.getFeedbackTrends('auth-implementation');
console.log('Improving:', trends.improving);
console.log('Consensus scores:', trends.consensusScoretrend);

// Get accumulated issues
const issues = await memoryManager.getAccumulatedIssues('auth-implementation');
console.log('Recurring issues:', issues.recurring.length);
console.log('Resolved issues:', issues.resolved.length);
```

### 3. CFNLoopIntegrator

Integrates feedback injection into the complete CFN loop workflow.

**Features:**
- Complete CFN loop state management
- Self-validation processing (≥75% threshold)
- Consensus validation processing (≥90% threshold)
- Automatic feedback injection on relaunch
- Escalation guidance generation
- Next steps recommendations

**Usage:**
```typescript
import { CFNLoopIntegrator } from './cfn-loop-integrator.js';

const cfnLoop = new CFNLoopIntegrator({
  maxIterations: 10,
  consensusThreshold: 0.9,
  enableFeedbackInjection: true,
  autoRelaunch: true,
  escalationThreshold: 0.5,
});

// Initialize loop for a phase
const state = await cfnLoop.initializeLoop('auth-implementation');

// Process self-validation (Step 3 of CFN loop)
const selfResult = await cfnLoop.processSelfValidation('auth-implementation', 0.85);
if (!selfResult.proceed) {
  // Relaunch or escalate
}

// Process consensus validation (Step 4 of CFN loop)
const consensusResult = await cfnLoop.processConsensusValidation(
  'auth-implementation',
  validationResult
);

if (consensusResult.action === 'relaunch') {
  // Inject feedback into swarm context
  const injectedContext = await cfnLoop.injectFeedbackIntoSwarm(
    'auth-implementation',
    swarmContext
  );

  // Relaunch primary swarm with injected feedback
}

// Generate comprehensive next steps
const nextSteps = await cfnLoop.generateNextSteps('auth-implementation');
console.log('Completed:', nextSteps.completed);
console.log('Issues:', nextSteps.identifiedIssues);
console.log('Next steps:', nextSteps.recommendedNextSteps);
```

## Feedback Structure

### ConsensusFeedback
```typescript
{
  phaseId: string;
  iteration: number;
  consensusFailed: boolean;
  consensusScore: number;              // 0.0 - 1.0
  requiredScore: number;               // 0.9 (90%)
  validatorFeedback: ValidatorFeedback[];
  failedCriteria: string[];
  actionableSteps: ActionableStep[];
  previousIterations: IterationHistory[];
  timestamp: number;
}
```

### ActionableStep
```typescript
{
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;                    // e.g., 'security', 'testing'
  action: string;                      // e.g., 'Fix XSS in auth.js:42'
  targetAgent?: string;                // e.g., 'security-specialist'
  estimatedEffort: 'low' | 'medium' | 'high';
}
```

### ValidatorFeedback
```typescript
{
  validator: string;
  validatorType: 'reviewer' | 'security-specialist' | 'system-architect' | 'tester' | 'perf-analyzer';
  issues: FeedbackIssue[];
  recommendations: string[];
  confidence: number;
  timestamp: number;
}
```

## CFN Loop Integration

### Complete CFN Loop Flow with Feedback Injection

```
1. Initialize Loop
   ↓
2. Execute Primary Swarm (3-20 agents)
   ↓
3. Self-Validation Gate (≥75% confidence)
   ├─ PASS → Continue to Step 4
   └─ FAIL → Relaunch (Step 2) or Escalate
   ↓
4. Consensus Validation Swarm (2-4 validators)
   ↓
5. Decision Gate (≥90% agreement)
   ├─ PASS → Store results, move to next task
   └─ FAIL → Capture feedback
       ↓
   6. Feedback Injection
       ├─ Extract validator criticisms
       ├─ Identify failed criteria
       ├─ Generate actionable steps
       ├─ Deduplicate with previous iterations
       └─ Inject into agent instructions
       ↓
   7. Relaunch Primary Swarm (Step 2)
       └─ Max 10 iterations or Escalate
```

### Feedback Injection Format

When feedback is injected into agent instructions:

```markdown
## Consensus Validation Feedback (Iteration 2)

**Consensus Status**: FAILED (75.0% / 90.0% required)

### CRITICAL ISSUES (Must Fix Immediately)
1. **[testing]** Add integration tests for authentication flow
   - This is your responsibility

### High Priority Issues
1. **[security]** Sanitize user input before rendering

### Validator Feedback
**validator-1** (security-specialist):
  🟠 [security] XSS vulnerability in input handling
     Location: auth.js:42
     Fix: Sanitize user input before rendering

**validator-2** (tester):
  🔴 [testing] No tests for authentication flow
     Fix: Add integration tests for auth

### Learnings from Previous Iterations
- Iteration 1: ✗ Unresolved (Score: 65.0%)
  Notes: Initial implementation lacked tests

---

## Original Task Instructions

[Original agent instructions here]

---

**IMPORTANT**: Address the critical and high priority issues above before proceeding with the original task.
Focus on preventing the same issues from recurring.
```

## Priority Handling

Issues are prioritized using configurable thresholds:

- **Critical** (1.0): Must fix immediately, blocks progress
- **High** (0.8): Important issues requiring attention
- **Medium** (0.5): Should fix but not blocking
- **Low** (0.3): Nice to have improvements

Priority is determined by:
1. Issue severity (critical → high → medium → low)
2. Estimated effort (low effort first for quick wins)
3. Target agent specialization

## Deduplication

The system prevents repeated feedback for the same issues across iterations:

1. Each issue gets a unique key: `{type}:{severity}:{message}:{location}`
2. Registry tracks seen issues per phase
3. Duplicate issues are filtered out
4. New occurrences of recurring issues are flagged

## Memory Persistence

Feedback is stored with:
- **Namespace**: `cfn-loop/feedback/{phaseId}/{iteration}`
- **TTL**: 7 days (configurable)
- **Indexing**: By phase and iteration
- **Max entries**: 1000 (with automatic eviction)
- **Export**: Integration with MCP memory tools

## Escalation Guidance

When max iterations reached or consensus not improving:

```typescript
const nextSteps = await cfnLoop.generateNextSteps(phaseId);

// Example output:
{
  completed: [
    'Executed 10 iteration(s) of CFN loop',
    'Self-validation passed with confidence ≥75%'
  ],
  validationResults: {
    selfValidation: true,
    consensusValidation: false
  },
  identifiedIssues: [
    '2 critical issue(s) identified',
    '3 high priority issue(s) identified',
    'Failed criterion: test_coverage'
  ],
  recommendedNextSteps: [
    'Escalate to human intervention with the following context:',
    '- 2 critical issues require manual resolution',
    '- No improvement detected - fundamental approach may need revision',
    '- 3 recurring issues suggest systematic problems',
    '- Recommendation: Complete redesign or alternative approach needed'
  ]
}
```

## Statistics and Monitoring

### FeedbackInjectionSystem Statistics
```typescript
const stats = feedbackSystem.getStatistics('auth-implementation');
// {
//   totalIterations: 5,
//   totalIssues: 12,
//   issuesByType: { security: 3, testing: 5, quality: 4 },
//   issuesBySeverity: { critical: 2, high: 5, medium: 3, low: 2 },
//   averageConsensusScore: 0.73
// }
```

### FeedbackMemoryManager Statistics
```typescript
const stats = memoryManager.getStatistics();
// {
//   totalEntries: 45,
//   totalPhases: 8,
//   memoryUsage: 234567,  // bytes
//   oldestEntry: 1704067200000,
//   newestEntry: 1704672000000
// }
```

### CFNLoopIntegrator Statistics
```typescript
const stats = cfnLoop.getStatistics();
// {
//   totalPhases: 10,
//   activePhases: 3,
//   completedPhases: 6,
//   escalatedPhases: 1,
//   averageIterations: 3.2,
//   memoryStatistics: { /* memory manager stats */ }
// }
```

## Examples

See `example-usage.ts` for complete examples:
1. Complete CFN loop with feedback injection
2. Direct feedback system usage
3. Memory manager usage
4. Escalation scenario

Run examples:
```bash
npx ts-node src/cfn-loop/example-usage.ts
```

## Integration with Existing Systems

### With Consensus Coordinator
```typescript
import { ConsensusCoordinator } from '../swarm/consensus-coordinator.js';
import { CFNLoopIntegrator } from './cfn-loop-integrator.js';

const consensus = new ConsensusCoordinator({ protocol: 'pbft' });
const cfnLoop = new CFNLoopIntegrator();

// After consensus proposal
const result = await consensus.propose(proposal);

if (result.decision !== 'approved') {
  // Convert to consensus validation result
  const validationResult = {
    consensusAchieved: false,
    consensusScore: result.participationRate,
    // ... map consensus result
  };

  await cfnLoop.processConsensusValidation(phaseId, validationResult);
}
```

### With SwarmMemory
```typescript
// Export feedback to SwarmMemory for cross-agent access
const feedbackKey = await memoryManager.exportToMCP(phaseId);

// Agents can retrieve via MCP memory tools
// mcp__claude-flow-novice__memory_retrieve({ key: feedbackKey })
```

## Configuration Options

### FeedbackInjectionSystem
- `maxIterations`: Maximum CFN loop iterations (default: 10)
- `deduplicationEnabled`: Enable issue deduplication (default: true)
- `priorityThresholds`: Priority scoring thresholds
- `memoryNamespace`: Memory storage namespace

### FeedbackMemoryManager
- `namespace`: Storage namespace (default: 'cfn-loop/feedback')
- `defaultTTL`: Time to live in seconds (default: 604800 = 7 days)
- `maxEntries`: Maximum stored entries (default: 1000)
- `compressionEnabled`: Enable compression (default: false)

### CFNLoopIntegrator
- `maxIterations`: Maximum loop iterations (default: 10)
- `consensusThreshold`: Required consensus score (default: 0.9 = 90%)
- `enableFeedbackInjection`: Enable automatic injection (default: true)
- `autoRelaunch`: Auto-relaunch on failure (default: true)
- `escalationThreshold`: Score below which to escalate (default: 0.5)

## Testing

The system includes comprehensive TypeScript validation and can be tested with:

```bash
# Type checking
npx tsc --noEmit src/cfn-loop/*.ts

# Run examples
npx ts-node src/cfn-loop/example-usage.ts

# Integration tests (if available)
npm test -- src/cfn-loop
```

## License

Part of the Claude Flow Novice project.
