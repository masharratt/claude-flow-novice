# CFN Loop Trigger.dev Workflow

Complete TypeScript implementation of CFN Loop orchestration using trigger.dev as the workflow engine.

## Project Structure

```
trigger-dev/
├── src/
│   ├── workflows/
│   │   └── cfn-loop.workflow.ts        # Main CFN Loop orchestration
│   ├── jobs/
│   │   ├── loop3-agent.job.ts         # Loop 3: Implementation agents
│   │   ├── loop2-validator.job.ts     # Loop 2: Validation agents
│   │   ├── gate-check.job.ts          # Gate check: Test validation
│   │   └── product-owner.job.ts       # Product Owner: Final decision
│   ├── types/
│   │   └── cfn-types.ts               # Type definitions (100+ types)
│   └── utils/
│       └── agent-spawner.ts           # CFN CLI agent spawning utility
├── tests/
│   ├── unit/
│   │   └── *.test.ts                  # Unit tests
│   └── integration/
│       └── *.test.ts                  # Integration tests
├── trigger.config.ts                   # trigger.dev configuration
├── tsconfig.json                      # TypeScript configuration (strict mode)
├── package.json                       # Dependencies and scripts
└── README.md                          # This file
```

## Type Safety Architecture

### Core Type System

**CFN Loop Payload** (`CFNLoopPayload`)
```typescript
{
  taskId: string;
  description: string;
  successCriteria: SuccessCriteria;
  mode: 'mvp' | 'standard' | 'enterprise';
  currentIteration: number;
  maxIterations: number;
}
```

**Success Criteria** (`SuccessCriteria`)
```typescript
{
  testCommand: string;
  passRateThreshold: number;  // 0.0-1.0
  coverageThreshold?: number;
  testSuites?: string[];
  description?: string;
}
```

**Agent Result** (`AgentResult`)
```typescript
{
  agentId: string;
  agentType: string;
  confidence: number;         // 0.0-1.0
  deliverables: { files: string[]; summary: string };
  testResults: TestResults;
  completedAt: string;
}
```

**Gate Check Result** (`GateCheckResult`)
```typescript
{
  passed: boolean;
  passRate: number;
  threshold: number;
  agentResults: AgentResult[];
  reason: string;
  checkedAt: string;
}
```

**Consensus Result** (`ConsensusResult`)
```typescript
{
  averageScore: number;
  validatorResults: ValidatorResult[];
  consensusMet: boolean;
  threshold: number;
  summary: string;
  blockingIssues?: string[];
  consensusAt: string;
}
```

**Product Owner Decision** (`ProductOwnerDecision`)
```typescript
{
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';
  reasoning: string;
  iterationFocus?: string;
  abortReason?: string;
  validations?: string[];
  decidedAt: string;
}
```

### Type Safety Features

- **Strict Mode Enabled**: All TypeScript strict flags enabled
- **No `any` Types**: 100% type coverage with explicit types
- **Discriminated Unions**: `decision: 'PROCEED' | 'ITERATE' | 'ABORT'` for type-safe branching
- **Generic Constraints**: Job payloads use proper generic types
- **Branded Types**: Test results include calculated metrics
- **Utility Functions**: `getThresholdConfig()` for mode-specific thresholds

## Workflow Execution Flow

### 1. CFN Loop Initialization
```typescript
const payload: CFNLoopPayload = {
  taskId: 'task-123',
  description: 'Implement authentication module',
  successCriteria: {
    testCommand: 'npm test',
    passRateThreshold: 0.95,
    coverageThreshold: 0.80,
  },
  mode: 'standard',
  currentIteration: 1,
  maxIterations: 10,
};

await triggerCFNLoop(payload);
```

### 2. Loop 3: Implementation (Fan-out)
- Spawn N implementer agents in parallel
- Each agent receives task description + success criteria
- Agents execute work via CFN CLI spawning system
- Collect test results from each agent

### 3. Gate Check
- Aggregate test pass rates from all agents
- Compare against threshold (mode-specific)
- **PASS**: Continue to Loop 2
- **FAIL**: Iterate Loop 3 (up to maxIterations)

### 4. Loop 2: Validation (Fan-out)
- Spawn M validators in parallel (mode-specific count)
- Validators review Loop 3 deliverables
- Collect consensus scores and feedback

### 5. Consensus Aggregation
- Calculate average consensus score
- Identify blocking issues
- Summarize validator feedback

### 6. Product Owner Decision
- Review consensus + gate results
- **PROCEED**: Task completed, all gates passed
- **ITERATE**: Specific aspect needs refinement
- **ABORT**: Max iterations or critical issues

### 7. Loop Iteration (if needed)
- ITERATE: Return to Loop 3 with context
- PROCEED/ABORT: Return final result

## Job Specifications

### Loop 3 Agent Job
```typescript
/**
 * Loop 3 Agent Job
 * - Spawns single implementer agent
 * - Collects test results
 * - Returns AgentResult with confidence score
 */
export const loop3AgentJob = task({
  id: 'cfn-loop3-agent',
  timeout: '30m',
  run: async (payload: Loop3JobPayload): Promise<AgentResult>
});
```

**Responsibilities:**
- Spawn agent via CFN CLI
- Monitor agent execution (Redis polling)
- Parse test output
- Calculate confidence score
- Return standardized AgentResult

### Loop 2 Validator Job
```typescript
/**
 * Loop 2 Validator Job
 * - Spawns single validator agent
 * - Reviews Loop 3 work
 * - Returns ValidatorResult
 */
export const loop2ValidatorJob = task({
  id: 'cfn-loop2-validator',
  timeout: '20m',
  run: async (payload: Loop2JobPayload): Promise<ValidatorResult>
});
```

**Responsibilities:**
- Spawn validator agent
- Provide Loop 3 deliverables for review
- Parse validator feedback
- Extract consensus score
- Return standardized ValidatorResult

### Gate Check Job
```typescript
/**
 * Gate Check Job
 * - Validates test pass rates
 * - Determines Loop 2 progression
 */
export const gateCheckJob = task({
  id: 'cfn-gate-check',
  timeout: '5m',
  run: async (payload: GateCheckJobPayload): Promise<GateCheckResult>
});
```

**Responsibilities:**
- Aggregate agent test results
- Calculate weighted pass rate
- Check against mode threshold
- Return gate decision with reasoning

### Product Owner Job
```typescript
/**
 * Product Owner Decision Job
 * - Reviews consensus + gate results
 * - Makes final decision
 */
export const productOwnerJob = task({
  id: 'cfn-product-owner',
  timeout: '5m',
  run: async (payload: ProductOwnerJobPayload): Promise<ProductOwnerDecision>
});
```

**Responsibilities:**
- Check gate pass + consensus threshold
- Determine decision (PROCEED/ITERATE/ABORT)
- Identify iteration focus if needed
- Return typed decision with reasoning

## Mode-Specific Thresholds

### MVP Mode
- Loop 3 pass rate threshold: **70%**
- Loop 2 consensus threshold: **80%**
- Validator count: **2**
- Max iterations: **5**

### Standard Mode (Default)
- Loop 3 pass rate threshold: **95%**
- Loop 2 consensus threshold: **90%**
- Validator count: **3**
- Max iterations: **10**

### Enterprise Mode
- Loop 3 pass rate threshold: **98%**
- Loop 2 consensus threshold: **95%**
- Validator count: **5**
- Max iterations: **15**

## Agent Spawning

The `AgentSpawner` utility handles spawning CFN Loop agents via CLI:

```typescript
const spawner = getSpawner();

const response = await spawner.spawn({
  agentType: 'backend-developer',
  taskDescription: 'Implement authentication',
  successCriteria: { testCommand: 'npm test', passRateThreshold: 0.95 },
  taskId: 'task-123',
});

// Response includes jobId for tracking
```

**Spawning Features:**
- Validates input (agentType, taskDescription, successCriteria)
- Generates unique agent IDs
- Injects context into spawn command
- Handles spawn timeouts (30s default)
- Returns job ID for result polling

## Development

### Setup
```bash
cd trigger-dev
npm install
npm run type-check
```

### Development Server
```bash
npm run dev
```

Starts trigger.dev local development server on port 3000.

### Testing
```bash
# Run all tests
npm test

# Watch mode
npm test:watch

# Coverage report
npm test:coverage
```

### Type Checking
```bash
npm run type-check
```

Validates all TypeScript with strict mode enabled.

### Linting
```bash
npm run lint
npm run lint:fix
```

## Deployment

### Deploy to trigger.dev
```bash
npm run deploy
```

### Environment Variables
Required:
- `TRIGGER_API_KEY` - trigger.dev API key
- `TRIGGER_API_URL` - trigger.dev API endpoint

Optional:
- `REDIS_HOST` - Redis coordination host (default: localhost)
- `REDIS_PORT` - Redis coordination port (default: 6379)
- `SLACK_WEBHOOK_URL` - For notifications
- `DEBUG_CFN_LOOP` - Enable debug logging

## Runtime Blockers

The following items require testing in trigger.dev runtime environment:

### Agent Spawning
- [ ] Verify spawn command syntax matches CFN CLI
- [ ] Verify Redis coordination signals received
- [ ] Verify agent-id uniqueness across concurrent spawns
- [ ] Verify timeout handling for long-running agents

### Job Execution
- [ ] Verify job execution in trigger.dev runtime
- [ ] Verify all job triggering and waiting
- [ ] Verify error propagation
- [ ] Verify batchTrigger or Promise.all for parallel execution

### Workflow Orchestration
- [ ] Verify complete workflow execution end-to-end
- [ ] Verify iteration looping when gate fails
- [ ] Verify agent result aggregation accuracy
- [ ] Verify consensus calculation correctness
- [ ] Verify all timeout and error cases

### Output Parsing
- [ ] Verify response parsing matches actual CLI output
- [ ] Verify test results parsing from agent output
- [ ] Verify Redis BLPOP blocking works
- [ ] Verify output parsing from Redis

### Integration
- [ ] Verify parallel spawning of N agents
- [ ] Verify all agents complete before proceeding
- [ ] Verify parallel spawning of M validators
- [ ] Verify all validators complete before aggregating

## Configuration

See `trigger.config.ts` for complete configuration:

- **Runtime**: Node.js v20, 2GB disk/memory
- **Logging**: Dashboard + stdout with context
- **Concurrency**: 5 concurrent agents/validators, 10 max tasks
- **Timeouts**: Agent 30m, Validator 20m, Gate/Decision 5m, Workflow 1h
- **Redis**: Coordination with 1h TTL
- **CFN**: CLI integration, parallel spawning

## API Reference

### Workflow Trigger
```typescript
export async function triggerCFNLoop(
  payload: CFNLoopPayload
): Promise<CFNLoopResult>
```

### Job Triggers
```typescript
export async function triggerLoop3Agent(payload: Loop3JobPayload): Promise<AgentResult>
export async function triggerLoop2Validator(payload: Loop2JobPayload): Promise<ValidatorResult>
export async function triggerGateCheck(payload: GateCheckJobPayload): Promise<GateCheckResult>
export async function triggerProductOwnerDecision(payload: ProductOwnerJobPayload): Promise<ProductOwnerDecision>
```

### Utilities
```typescript
function getThresholdConfig(mode: CFNMode): ThresholdConfig
function getSpawner(config?: Partial<SpawnerConfig>): AgentSpawner
function resetSpawner(): void
```

## Documentation

- **Types**: [src/types/cfn-types.ts](/src/types/cfn-types.ts) (100+ type definitions with JSDoc)
- **Workflow**: [src/workflows/cfn-loop.workflow.ts](/src/workflows/cfn-loop.workflow.ts) (Complete orchestration)
- **Jobs**: [src/jobs/](/src/jobs/) (4 specialized jobs)
- **Configuration**: [trigger.config.ts](/trigger.config.ts) (Complete config with comments)

## Migration Status

This is a **trigger.dev implementation** of CFN Loop, replacing the previous shell-based orchestration system.

### Key Differences
- **Type Safe**: 100% TypeScript with strict mode
- **Async/Await**: All async operations with proper error handling
- **Fan-out Pattern**: Native parallel job triggering via trigger.dev
- **Structured Logging**: Built-in observability
- **Configuration**: Centralized trigger.config.ts

### Integration Points
- CFN CLI agent spawning (via AgentSpawner utility)
- Redis coordination for agent result polling
- Workflow result storage in trigger.dev

## Related Documentation

- CFN Loop Architecture: See main project `CLAUDE.md`
- Agent Spawning: See `.claude/skills/cfn-agent-spawning/SKILL.md`
- Coordination Protocols: See `.claude/skills/cfn-coordination/SKILL.md`
