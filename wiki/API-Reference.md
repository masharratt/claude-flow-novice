# API Reference

Complete API documentation for CFN Loop components, MCP tools, hook system, and memory namespaces.

---

## CFNLoopOrchestrator / CFNLoopIntegrator

### Overview

The `CFNLoopIntegrator` provides a high-level API for executing the complete CFN loop with automatic retry, circuit breaking, and memory management.

### Constructor

```typescript
import { CFNLoopIntegrator } from '../cfn-loop/cfn-loop-integrator.js';

const orchestrator = new CFNLoopIntegrator({
  phaseId: 'auth-implementation',
  maxLoop2: 5,                    // Max self-validation retries
  maxLoop3: 10,                   // Max consensus rounds
  selfValidationThreshold: 0.75,  // Min confidence for Loop 2
  consensusThreshold: 0.90,       // Min consensus score for Loop 3
  enableCircuitBreaker: true,
  circuitBreakerOptions: {
    timeoutMs: 30 * 60 * 1000,    // 30 minutes
    failureThreshold: 3,          // Failures before circuit opens
    cooldownMs: 5 * 60 * 1000     // 5 minutes cooldown
  }
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `phaseId` | string | (required) | Unique identifier for the CFN phase |
| `maxLoop2` | number | 10 | Maximum self-validation retries (1-100) |
| `maxLoop3` | number | 10 | Maximum consensus rounds (1-100) |
| `selfValidationThreshold` | number | 0.75 | Minimum confidence for Loop 2 (0.0-1.0) |
| `consensusThreshold` | number | 0.90 | Minimum consensus score for Loop 3 (0.0-1.0) |
| `enableCircuitBreaker` | boolean | true | Enable automatic circuit breaking |
| `circuitBreakerOptions` | object | See below | Circuit breaker configuration |

**Circuit Breaker Options:**
- `timeoutMs`: Maximum execution time (default: 30 minutes)
- `failureThreshold`: Failures before circuit opens (default: 3)
- `cooldownMs`: Wait time before retry (default: 5 minutes)
- `successThreshold`: Successes to close circuit (default: 2)

### Methods

#### `executePhase(task)`

Execute a complete CFN loop phase with automatic retry and consensus validation.

```typescript
interface Task {
  description: string;
  agents: Agent[];
  validators: Validator[];
}

interface Agent {
  id: string;
  type: string;
  instructions: string;
}

interface Validator {
  id: string;
  type: string;
}

const result = await orchestrator.executePhase({
  description: 'Implement JWT authentication',
  agents: [
    {
      id: 'backend-dev',
      type: 'backend-dev',
      instructions: 'Implement JWT token generation and validation'
    },
    {
      id: 'security-specialist',
      type: 'security-specialist',
      instructions: 'Audit JWT implementation for security'
    },
    {
      id: 'tester',
      type: 'tester',
      instructions: 'Write comprehensive tests'
    }
  ],
  validators: [
    { id: 'reviewer', type: 'reviewer' },
    { id: 'security-auditor', type: 'security-specialist' }
  ]
});

// Result structure
interface ExecutionResult {
  success: boolean;
  phaseId: string;
  finalState: 'consensus-passed' | 'consensus-failed' | 'circuit-open';
  iterations: {
    loop2: number;
    loop3: number;
  };
  consensusScore: number;
  validationResults: ValidationResult[];
  deliverables: Deliverable[];
  nextSteps: string[];
  error?: string;
}
```

#### `getState()`

Get current execution state.

```typescript
enum CFNLoopState {
  INITIALIZING = 'INITIALIZING',
  EXECUTING_PRIMARY = 'EXECUTING_PRIMARY',
  SELF_VALIDATION = 'SELF_VALIDATION',
  CONSENSUS_VALIDATION = 'CONSENSUS_VALIDATION',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN'
}

const state = orchestrator.getState();
// Returns: CFNLoopState
```

#### `reset()`

Reset orchestrator for new phase execution.

```typescript
orchestrator.reset();
```

### Usage Examples

#### Basic Usage

```typescript
const orchestrator = new CFNLoopIntegrator({
  phaseId: 'user-profile-endpoint',
  maxLoop2: 10,
  maxLoop3: 5
});

const result = await orchestrator.executePhase({
  description: 'Add GET /api/users/:id endpoint',
  agents: [
    { id: 'coder', type: 'coder', instructions: 'Implement endpoint' },
    { id: 'tester', type: 'tester', instructions: 'Write tests' }
  ],
  validators: [
    { id: 'reviewer', type: 'reviewer' }
  ]
});

if (result.success) {
  console.log(`✅ Phase complete: ${result.consensusScore * 100}% consensus`);
} else {
  console.error(`❌ Phase failed: ${result.error}`);
}
```

#### Production-Critical Feature (Higher Thresholds)

```typescript
const orchestrator = new CFNLoopIntegrator({
  phaseId: 'payment-processing',
  maxLoop2: 5,
  maxLoop3: 15,
  selfValidationThreshold: 0.85,  // Stricter
  consensusThreshold: 0.95,       // Stricter
  circuitBreakerOptions: {
    timeoutMs: 60 * 60 * 1000,    // 1 hour (complex task)
    failureThreshold: 5
  }
});
```

---

## MCP Tools Reference

### Swarm Initialization

#### `mcp__claude-flow-novice__swarm_init`

Initialize swarm topology and coordination infrastructure.

```typescript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh" | "hierarchical",
  maxAgents: number,
  strategy: "balanced" | "adaptive"
})
```

**Parameters:**
- `topology`: "mesh" (2-7 agents) or "hierarchical" (8+ agents)
- `maxAgents`: Number of agents (must match actual agent count)
- `strategy`: "balanced" (even distribution) or "adaptive" (dynamic allocation)

**Example:**
```typescript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "balanced"
})
```

### Agent Spawning

#### `mcp__claude-flow-novice__agent_spawn`

Spawn coordination agents (optional - use Task tool for execution).

```typescript
mcp__claude-flow-novice__agent_spawn({
  agentId: string,
  agentType: string,
  instructions: string,
  context?: object
})
```

**Note:** Use Claude Code's `Task` tool for spawning working agents.

### Task Orchestration

#### `mcp__claude-flow-novice__task_orchestrate`

Orchestrate high-level workflows.

```typescript
mcp__claude-flow-novice__task_orchestrate({
  taskId: string,
  workflow: WorkflowDefinition,
  dependencies?: string[]
})
```

### Monitoring Tools

#### `mcp__claude-flow-novice__swarm_status`

Get swarm status and metrics.

```typescript
mcp__claude-flow-novice__swarm_status({
  swarmId: string
})

// Returns:
interface SwarmStatus {
  swarmId: string;
  status: 'initializing' | 'executing' | 'consensus' | 'completed' | 'failed';
  topology: 'mesh' | 'hierarchical';
  agents: AgentStatus[];
  currentRound: number;
  currentLoop: 'loop2' | 'loop3';
  validators?: ValidatorStatus[];
}
```

#### `mcp__claude-flow-novice__agent_metrics`

Get agent-specific metrics.

```typescript
mcp__claude-flow-novice__agent_metrics({
  agentId: string
})

// Returns:
interface AgentMetrics {
  agentId: string;
  status: 'idle' | 'executing' | 'validating' | 'completed';
  confidence: number;
  tasksCompleted: number;
  averageConfidence: number;
  successRate: number;
}
```

#### `mcp__claude-flow-novice__task_results`

Retrieve task execution results.

```typescript
mcp__claude-flow-novice__task_results({
  taskId: string
})

// Returns:
interface TaskResults {
  taskId: string;
  status: 'success' | 'failed' | 'in-progress';
  confidence: number;
  deliverables: Deliverable[];
  validationResults: ValidationResult[];
  consensusScore?: number;
}
```

### Memory Tools

#### `mcp__claude-flow-novice__memory_usage`

Get memory usage statistics.

```typescript
mcp__claude-flow-novice__memory_usage()

// Returns:
interface MemoryUsage {
  totalEntries: number;
  sizeBytes: number;
  phaseCount: number;
  oldestEntry: string;
  newestEntry: string;
}
```

#### `mcp__claude-flow-novice__memory_search`

Search memory with pattern matching.

```typescript
mcp__claude-flow-novice__memory_search({
  pattern: string,
  filter?: (data: any) => boolean
})

// Example:
const highConfidenceTasks = await mcp__claude-flow-novice__memory_search({
  pattern: 'swarm/*/confidence',
  filter: (data) => data.confidence >= 0.90
});
```

---

## Hook System API

### Enhanced Post-Edit Hook

#### Command-Line Interface

```bash
npx enhanced-hooks post-edit <file> [options]

Options:
  --memory-key <key>        Memory key for storing results
  --minimum-coverage <n>    Minimum coverage threshold (default: 80)
  --structured              Output structured JSON
  --tdd-phase <phase>       TDD phase: red, green, refactor
  --framework <name>        Test framework: jest, mocha, vitest
  --language <lang>         Language: javascript, typescript, rust, python
```

#### Programmatic API

```typescript
import { EnhancedPostEditPipeline } from '../hooks/enhanced-post-edit-pipeline.js';

const pipeline = new EnhancedPostEditPipeline({
  file: 'src/auth/jwt-handler.js',
  memoryKey: 'swarm/backend-dev/jwt-auth',
  minimumCoverage: 80,
  structured: true
});

const result = await pipeline.execute();

interface PostEditResult {
  success: boolean;
  file: string;
  validation: {
    passed: boolean;
    issues: string[];
    coverage: 'none' | 'basic' | 'advanced';
  };
  formatting: {
    needed: boolean;
    changes: number;
    formatter: string;
  };
  testing: {
    executed: boolean;
    framework: string;
    passed: number;
    failed: number;
    coverage: number;
  };
  tddCompliance: {
    hasTests: boolean;
    coverage: number;
    phase: 'red' | 'green' | 'refactor';
    recommendations: string[];
  };
  security: {
    vulnerabilities: SecurityIssue[];
    warnings: string[];
  };
  recommendations: Recommendation[];
  memory: {
    stored: boolean;
    enhancedStore: boolean;
    key: string;
  };
}
```

### Hook Configuration

```typescript
// config/hooks-config.js
export const HOOKS_CONFIG = {
  postEdit: {
    enableFormatting: true,
    enableLinting: true,
    enableTesting: true,
    enableSecurity: true,
    minimumCoverage: 80,
    blockOnFailure: true,
    gracefulDegradation: true
  },
  frameworks: {
    javascript: ['jest', 'mocha', 'vitest'],
    typescript: ['jest', 'vitest'],
    rust: ['cargo'],
    python: ['pytest', 'unittest']
  },
  formatters: {
    javascript: 'prettier',
    typescript: 'prettier',
    rust: 'rustfmt',
    python: 'black'
  }
};
```

---

## Memory Namespaces

### Namespace Structure

```
swarm/
├── {swarm-id}/
│   ├── agents/
│   │   └── {agent-id}/
│   │       ├── tasks/
│   │       │   └── {task-id}/
│   │       │       ├── deliverables
│   │       │       ├── confidence
│   │       │       ├── validation
│   │       │       └── feedback
│   │       └── learning/
│   │           ├── patterns
│   │           ├── errors
│   │           └── successes
│   ├── consensus/
│   │   └── {round-id}/
│   │       ├── validators
│   │       ├── votes
│   │       ├── agreement
│   │       └── decision
│   ├── iterations/
│   │   └── round-{n}/
│   │       ├── feedback
│   │       ├── changes
│   │       └── improvements
│   └── results/
│       ├── final-deliverable
│       ├── validation-summary
│       └── next-steps
```

### Memory Operations

#### Store

```typescript
import { SwarmMemory } from '../memory/swarm-memory.js';

const memory = new SwarmMemory({
  swarmId: 'jwt-auth-swarm',
  directory: '.swarm',
  filename: 'swarm-memory.db'
});

await memory.initialize();

await memory.store('swarm/backend-dev/jwt-auth', {
  timestamp: Date.now(),
  confidence: 0.92,
  deliverables: ['jwt-handler.js']
});
```

#### Retrieve

```typescript
// Get specific entry
const data = await memory.retrieve('swarm/backend-dev/jwt-auth');

// Search with pattern
const results = await memory.search('swarm/*/confidence');

// Search with filter
const highConfidence = await memory.search('swarm/*/tasks/*', {
  filter: (data) => data.confidence >= 0.90
});
```

#### Delete

```typescript
// Delete specific entry
await memory.delete('swarm/backend-dev/jwt-auth');

// Clear pattern
await memory.clearPattern('swarm/test-*');

// Clear all (use cautiously)
await memory.clearAll();
```

---

## Circuit Breaker API

### CFNCircuitBreakerManager

```typescript
import { CFNCircuitBreakerManager } from '../cfn-loop/circuit-breaker.js';

const manager = new CFNCircuitBreakerManager();

// Execute with circuit breaker
const result = await manager.execute(
  'my-operation',
  async () => {
    // Your operation
    return await performTask();
  },
  {
    timeoutMs: 10 * 60 * 1000,  // 10 minutes
    failureThreshold: 3,
    cooldownMs: 5 * 60 * 1000   // 5 minutes
  }
);
```

### Circuit States

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Too many failures, rejecting requests
  HALF_OPEN = 'HALF_OPEN' // Testing recovery
}
```

### Methods

#### `getBreakerState(name)`

```typescript
const state = manager.getBreakerState('auth-implementation');

interface BreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  rejectedRequests: number;
  timeoutCount: number;
  nextAttemptTime?: Date;
}
```

#### `getStatistics()`

```typescript
const stats = manager.getStatistics();

interface CircuitStatistics {
  totalBreakers: number;
  openCircuits: number;
  halfOpenCircuits: number;
  closedCircuits: number;
  totalRequests: number;
  totalRejections: number;
  totalTimeouts: number;
}
```

#### `resetBreaker(name)`

```typescript
// Reset specific breaker
manager.resetBreaker('auth-implementation');

// Reset all breakers
manager.resetAll();
```

#### `forceState(name, state)`

```typescript
// Force specific state (for testing/manual intervention)
manager.forceState('auth-implementation', CircuitState.CLOSED);
```

### Events

```typescript
manager.on('breaker:failure', (data) => {
  console.log(`❌ Breaker failure: ${data.name}`);
});

manager.on('breaker:state-change', (data) => {
  console.log(`🔄 State change: ${data.from} → ${data.to}`);
});

manager.on('breaker:rejected', (data) => {
  console.log(`🚫 Request rejected: ${data.name}`);
});
```

---

## Feedback Injection System API

### FeedbackInjectionSystem

```typescript
import { FeedbackInjectionSystem } from '../cfn-loop/feedback-injection-system.js';

const feedbackSystem = new FeedbackInjectionSystem({
  memoryNamespace: 'cfn-loop/feedback',
  deduplicationEnabled: true,
  maxHistorySize: 100
});
```

### Methods

#### `captureFeedback(options)`

```typescript
const feedback = await feedbackSystem.captureFeedback({
  phaseId: 'auth-implementation',
  iteration: 2,
  validatorResults: [
    {
      validatorId: 'security-specialist',
      approve: false,
      confidence: 0.72,
      issues: [
        {
          severity: 'high',
          category: 'security',
          message: 'JWT secret hardcoded in source',
          recommendation: 'Use environment variable'
        }
      ]
    }
  ]
});

interface ConsensusFeedback {
  phaseId: string;
  iteration: number;
  timestamp: number;
  validatorFeedback: ValidatorFeedback[];
  aggregatedIssues: Issue[];
  prioritizedActions: Action[];
}
```

#### `sanitizeFeedback(feedback)`

```typescript
const sanitized = feedbackSystem.sanitizeFeedback(maliciousFeedback);

// Automatically blocks:
// - Prompt injection patterns
// - Excessive length (>5000 chars)
// - Markdown manipulation
```

#### `injectIntoAgentInstructions(feedback, originalInstructions)`

```typescript
const injected = feedbackSystem.injectIntoAgentInstructions(
  validatorFeedback,
  originalAgentInstructions
);

// Returns sanitized feedback prepended to original instructions
```

#### `cleanup()`

```typescript
// Manual cleanup (also runs automatically every hour)
feedbackSystem.cleanup();
```

#### `shutdown()`

```typescript
// Graceful shutdown
feedbackSystem.shutdown();
```

---

## Confidence Score System API

### ConfidenceScoreCollector

```typescript
import { ConfidenceScoreCollector } from '../coordination/confidence-score-system.js';

const collector = new ConfidenceScoreCollector({
  timeout: 30000,  // 30 seconds
  parallelCollection: true
});
```

### Methods

#### `collectConfidenceScores(agents)`

```typescript
const scores = await collector.collectConfidenceScores([
  'backend-dev',
  'security-specialist',
  'tester'
]);

interface ConfidenceScore {
  agentId: string;
  confidence: number;
  timestamp: number;
  details: {
    testsPassed: boolean;
    coverage: number;
    noSyntaxErrors: boolean;
    securityIssues: SecurityIssue[];
    formattingCorrect: boolean;
  };
}
```

#### `calculateSelfConfidence(validationResults)`

```typescript
const confidence = collector.calculateSelfConfidence({
  testsPassed: true,
  coverage: 85,
  noSyntaxErrors: true,
  securityIssues: [],
  formattingCorrect: true
});

// Returns: 0.0 - 1.0
```

#### `calculateConsensusConfidence(validators)`

```typescript
const consensus = collector.calculateConsensusConfidence([
  { approve: true, confidence: 0.95 },
  { approve: true, confidence: 0.93 },
  { approve: false, confidence: 0.72 },
  { approve: true, confidence: 0.90 }
]);

interface ConsensusResult {
  averageConfidence: number;
  agreementRate: number;
  consensusConfidence: number;
  decision: 'PASS' | 'FAIL';
}
```

---

## Type Definitions

### Core Types

```typescript
interface Agent {
  id: string;
  type: string;
  instructions: string;
  context?: object;
}

interface Validator {
  id: string;
  type: string;
  approve: boolean;
  confidence: number;
  criticalIssues: string[];
}

interface ValidationResult {
  agentId: string;
  confidence: number;
  testsPassed: boolean;
  coverage: number;
  securityIssues: SecurityIssue[];
}

interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  message: string;
  recommendation: string;
}

interface Recommendation {
  type: 'security' | 'performance' | 'testing' | 'formatting';
  priority: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  action: string;
}
```

---

## Error Handling

### Error Types

```typescript
class CFNLoopError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

class MaxIterationsError extends CFNLoopError {
  constructor(loop: number, max: number) {
    super(`Max iterations exceeded: Loop ${loop} reached ${max}`, 'MAX_ITERATIONS');
  }
}

class ConsensusFailedError extends CFNLoopError {
  constructor(agreement: number, threshold: number) {
    super(`Consensus failed: ${agreement * 100}% < ${threshold * 100}%`, 'CONSENSUS_FAILED');
  }
}

class CircuitBreakerOpenError extends CFNLoopError {
  constructor(name: string, nextAttempt: Date) {
    super(`Circuit breaker '${name}' is OPEN. Next attempt: ${nextAttempt}`, 'CIRCUIT_OPEN');
  }
}
```

### Error Handling Pattern

```typescript
try {
  const result = await orchestrator.executePhase(task);
} catch (error) {
  if (error instanceof MaxIterationsError) {
    // Handle max iterations
    console.error('Max iterations exceeded:', error.message);
  } else if (error instanceof ConsensusFailedError) {
    // Handle consensus failure
    console.error('Consensus failed:', error.message);
  } else if (error instanceof CircuitBreakerOpenError) {
    // Handle circuit breaker
    console.error('Circuit breaker open:', error.message);
  } else {
    // Generic error
    console.error('Unknown error:', error);
  }
}
```

---

## Next Steps

- **[Getting Started](Getting-Started.md)** - Run your first CFN loop
- **[Troubleshooting](Troubleshooting.md)** - Debug common issues
- **[Security](Security.md)** - Security best practices
- **[Agent Coordination](Agent-Coordination.md)** - Learn swarm patterns

---

**Last Updated:** 2025-10-02
**Version:** 1.5.22
