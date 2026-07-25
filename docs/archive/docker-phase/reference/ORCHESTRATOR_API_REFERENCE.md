# CFN Loop Orchestrator - API Reference

## Core Types

### ExecutionMode
```typescript
type ExecutionMode = 'mvp' | 'standard' | 'enterprise';
```

### ProductOwnerDecision
```typescript
type ProductOwnerDecision = 'PROCEED' | 'ITERATE' | 'ABORT' | null;
```

### LoopPhase
```typescript
type LoopPhase = 'loop3' | 'loop2' | 'product-owner' | 'complete';
```

## Configuration

### OrchestrationConfig
```typescript
interface OrchestrationConfig {
  taskId: string;                    // Unique task identifier
  mode: ExecutionMode;               // Execution mode (mvp/standard/enterprise)
  maxIterations: number;             // Maximum iteration cycles (1-100)
  aceReflect?: boolean;              // Optional: Enable ACE reflection
  loop3Agents?: string[];            // Optional: Implementer agent types
  loop2Agents?: string[];            // Optional: Validator agent types
  productOwner?: string;             // Optional: Product owner agent ID
  successCriteriaEnabled?: boolean;  // Optional: Enable success criteria validation
}
```

## Orchestrator Class

### Constructor
```typescript
constructor(config: OrchestrationConfig)
```

Initializes orchestrator with configuration validation.

**Throws:**
- `Error` if task ID is empty
- `Error` if execution mode is invalid
- `Error` if max iterations < 1 or > 100

### Main Execution Method

#### execute()
```typescript
public async execute(): Promise<ProductOwnerDecision>
```

Executes the complete CFN Loop orchestration workflow.

**Returns:** Final decision (PROCEED/ITERATE/ABORT/null)

**Behavior:**
1. Runs iteration loop from 1 to maxIterations
2. For each iteration:
   - Loop 3: Spawns agents, collects tests, checks gate
   - If gate fails: iterates or aborts
   - Loop 2: Spawns validators, collects consensus
   - If consensus fails: iterates or aborts
   - Product Owner: Gets decision (PROCEED/ITERATE/ABORT)
   - Handles decision: continues/breaks based on decision

**Throws:** Any exception during agent spawn/decision parsing

### State Management

#### getState()
```typescript
public getState(): OrchestrationState
```

Returns current orchestration state.

```typescript
interface OrchestrationState {
  taskId: string;
  mode: ExecutionMode;
  iteration: number;
  currentPhase: LoopPhase;
  completedAgents: Set<string>;
  failedAgents: Set<string>;
  startTime: number;          // Milliseconds
  lastUpdateTime: number;     // Milliseconds
}
```

#### incrementIteration()
```typescript
public incrementIteration(): void
```

Increments iteration counter and updates timestamp.

#### resetForIteration()
```typescript
public resetForIteration(): void
```

Clears test results, consensus scores, decision, and errors for next iteration.

### Phase Management

#### transitionPhase()
```typescript
public transitionPhase(newPhase: LoopPhase): void
```

Transitions to new phase and records transition in history.

#### getPhaseHistory()
```typescript
public getPhaseHistory(): PhaseTransition[]
```

Returns array of all phase transitions.

```typescript
interface PhaseTransition {
  fromPhase: LoopPhase;
  toPhase: LoopPhase;
  timestamp: number;
  iteration: number;
}
```

### Agent Management

#### markAgentComplete()
```typescript
public markAgentComplete(agentId: string, loopType: 'loop3' | 'loop2'): void
```

Marks agent as successfully completed.

#### markAgentFailed()
```typescript
public markAgentFailed(agentId: string, loopType: 'loop3' | 'loop2'): void
```

Marks agent as failed.

#### recordExecutionError()
```typescript
public recordExecutionError(agentId: string, error: Error): void
```

Records execution error and marks agent as failed.

#### recordTimeout()
```typescript
public recordTimeout(agentId: string, timeoutSeconds: number): void
```

Records timeout error for agent.

#### getErrors()
```typescript
public getErrors(): Map<string, Error>
```

Returns map of agent IDs to errors.

### Test Result Management

#### recordTestResult()
```typescript
public recordTestResult(agentId: string, result: TestResult): void
```

Records test result from agent.

```typescript
interface TestResult {
  pass: number;     // Number of passed tests
  fail: number;     // Number of failed tests
  skip?: number;    // Number of skipped tests
}
```

#### getTestResult()
```typescript
public getTestResult(agentId: string): TestResult | undefined
```

Retrieves test result for specific agent.

#### aggregateTestResults()
```typescript
public aggregateTestResults(): AggregatedTestResults
```

Aggregates test results across all agents.

```typescript
interface AggregatedTestResults {
  totalPass: number;
  totalFail: number;
  totalSkip: number;
  passRate: number;       // 0.0-1.0
  agentCount: number;
}
```

### Gate Check (Loop 3 → Loop 2)

#### checkGate()
```typescript
public checkGate(passRate: number): GateCheckResult
```

Validates test pass rate against mode threshold.

```typescript
interface GateCheckResult {
  passed: boolean;
  passRate: number;       // Actual pass rate (0.0-1.0)
  threshold: number;      // Mode threshold (0.0-1.0)
  gap: number;            // threshold - passRate (0.0 or positive if failed)
}
```

**Thresholds:**
- MVP: 0.70
- Standard: 0.95
- Enterprise: 0.98

### Consensus (Loop 2)

#### recordConsensusScore()
```typescript
public recordConsensusScore(validatorId: string, score: number): void
```

Records consensus score from validator (0.0-1.0).

**Throws:** If score outside 0.0-1.0 range

#### getConsensusScores()
```typescript
public getConsensusScores(): number[]
```

Returns array of all consensus scores.

#### getConsensusAverage()
```typescript
public getConsensusAverage(): number
```

Calculates average of all consensus scores.

#### validateConsensus()
```typescript
public validateConsensus(): ConsensusValidationResult
```

Validates consensus average against mode threshold.

```typescript
interface ConsensusValidationResult {
  passed: boolean;
  average: number;        // Average score (0.0-1.0)
  threshold: number;      // Mode threshold (0.0-1.0)
  gap: number;            // threshold - average
}
```

**Thresholds:**
- MVP: 0.80
- Standard: 0.90
- Enterprise: 0.95

### Product Owner Decision

#### recordDecision()
```typescript
public recordDecision(decision: ProductOwnerDecision): void
```

Records Product Owner decision.

#### getDecision()
```typescript
public getDecision(): ProductOwnerDecision
```

Returns recorded decision.

#### parseDecisionFromOutput()
```typescript
public parseDecisionFromOutput(output: string): ProductOwnerDecision
```

Extracts decision from agent output string (case-insensitive).

**Recognizes:**
- Contains "PROCEED" → PROCEED
- Contains "ITERATE" → ITERATE
- Contains "ABORT" → ABORT
- Otherwise → null

### Agent Spawning

#### spawnLoop3Agents()
```typescript
public async spawnLoop3Agents(agentTypes: string[]): Promise<AgentExecutionContext[]>
```

Creates execution contexts for Loop 3 agents.

```typescript
interface AgentExecutionContext {
  agentId: string;
  agentType: string;
  loopType: 'loop3' | 'loop2';
  iteration: number;
  taskId: string;
  timestamp: number;
}
```

#### spawnLoop2Validators()
```typescript
public async spawnLoop2Validators(validatorTypes: string[]): Promise<AgentExecutionContext[]>
```

Creates execution contexts for Loop 2 validators.

### Iteration Control

#### canContinueIterating()
```typescript
public canContinueIterating(): boolean
```

Returns true if iteration < maxIterations.

#### shouldTerminate()
```typescript
public shouldTerminate(): boolean
```

Returns true if orchestration should stop (PROCEED, ABORT, or max iterations reached).

### Summary & Reporting

#### getSummary()
```typescript
public getSummary(): {
  taskId: string;
  mode: ExecutionMode;
  iteration: number;
  totalAgentsCompleted: number;
  totalAgentsFailed: number;
  decision: ProductOwnerDecision;
  duration: number;       // Milliseconds
}
```

Returns summary of orchestration execution.

## Configuration Retrieval

### getTaskId()
```typescript
public getTaskId(): string
```

Returns task ID.

### getMode()
```typescript
public getMode(): ExecutionMode
```

Returns execution mode.

### getMaxIterations()
```typescript
public getMaxIterations(): number
```

Returns maximum iterations.

### getGateThreshold()
```typescript
public getGateThreshold(): number
```

Returns gate threshold for current mode.

### getConsensusThreshold()
```typescript
public getConsensusThreshold(): number
```

Returns consensus threshold for current mode.

## Mode-Specific Thresholds

```typescript
const MODE_CONFIG: Record<ExecutionMode, {
  gateThreshold: number;
  consensusThreshold: number;
  maxIterations: number;
}> = {
  mvp: {
    gateThreshold: 0.70,
    consensusThreshold: 0.80,
    maxIterations: 5,
  },
  standard: {
    gateThreshold: 0.95,
    consensusThreshold: 0.90,
    maxIterations: 10,
  },
  enterprise: {
    gateThreshold: 0.98,
    consensusThreshold: 0.95,
    maxIterations: 15,
  },
};
```

## CLI Interface

### orchestrator-cli.js

```bash
node dist/cli/orchestrator-cli.js [OPTIONS]

REQUIRED:
  --task-id <id>           Unique task identifier
  --mode <mode>            Execution mode (mvp|standard|enterprise)
  --max-iterations <n>     Maximum iterations (1-100)

OPTIONAL:
  --loop3-agents <list>    Comma-separated Loop 3 agent types
  --loop2-agents <list>    Comma-separated Loop 2 agent types
  --product-owner <agent>  Product Owner agent ID
  --success-criteria <flag> Enable success criteria (enabled|disabled)

INFORMATIONAL:
  --help, -h               Show help message
  --version, -v            Show version
```

### Exit Codes
- `0`: PROCEED (success)
- `1`: ITERATE/ABORT or error
- `130`: User interrupt (SIGINT/SIGTERM)

## Example Usage

```typescript
import { Orchestrator, OrchestrationConfig } from './orchestrate';

const config: OrchestrationConfig = {
  taskId: 'feature-auth-123',
  mode: 'standard',
  maxIterations: 10,
  loop3Agents: ['backend-dev', 'coder'],
  loop2Agents: ['code-reviewer', 'tester'],
  productOwner: 'cto-agent',
};

const orchestrator = new Orchestrator(config);
const decision = await orchestrator.execute();

console.log(`Decision: ${decision}`);
const summary = orchestrator.getSummary();
console.log(`Completed in ${summary.iteration} iterations`);
```

---

**Version:** 3.0.0
**Last Updated:** 2025-11-20
