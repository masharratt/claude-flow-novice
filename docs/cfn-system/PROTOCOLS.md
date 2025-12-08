# CFN System Protocols

## Agent Coordination Protocols

### Redis-Based Coordination (CLI Mode)
```typescript
// Agent completion signaling
await redis.incr(`task:${taskId}:completed`);
await redis.lpush(`swarm:${taskId}:${agentId}:done`, 'complete');

// Orchestrator monitoring
while (parseInt(await redis.get(`task:${taskId}:completed`)) < total) {
  await sleep(5000);
}
```

### Task Mode Protocol (SQLite)
```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  type TEXT,
  status TEXT,
  confidence REAL,
  spawned_at DATETIME,
  completed_at DATETIME,
  metadata TEXT
);
```

## Agent Lifecycle Protocol

### Spawning Protocol
1. **Pre-flight validation**: Dependencies, resources, script availability
2. **Agent ID generation**: `type-iteration-instance-timestamp-random`
3. **4-tier fallback**: Instrumented → Raw npx → Global → Placeholder
4. **PID tracking**: Global process registry

### Completion Protocol
1. **Counter increment**: Atomic completion counter
2. **Signal transmission**: Redis BLPOP notification
3. **Confidence reporting**: 0.85-0.95 range
4. **Metadata storage**: Results, file paths, logs

### Error Handling Protocol
1. **Graceful degradation**: Continue with warnings
2. **Automatic recovery**: Dead process cleanup
3. **Checkpoint creation**: Iteration state persistence
4. **Cleanup handlers**: Resource release on exit

## Communication Patterns

### Chain Pattern
Sequential agent execution with handoff:
```
Agent A → Redis Queue → Agent B → Redis Queue → Agent C
```

### Broadcast Pattern
One-to-many communication:
```
Coordinator → Redis Pub/Sub → All Agents
```

### Mesh Pattern
Peer-to-peer coordination:
```
Agent A ⇄ Agent B ⇄ Agent C ⇄ Agent A
```

### Consensus Collection
Validator agreement calculation:
```
Validator 1 (0.9) + Validator 2 (0.8) + Validator 3 (0.85)
→ Consensus = 0.85 (average)
```

## Task Orchestration Protocol

### Task Definition
```typescript
interface TaskDefinition {
  taskId: string;
  description: string;
  deliverables: string[];
  successCriteria: string[];
  mode: 'mvp' | 'standard' | 'enterprise';
  agents: AgentConfig[];
  timeout: number;
}
```

### Agent Configuration
```typescript
interface AgentConfig {
  type: string;
  provider?: string;
  context: Record<string, any>;
  memoryLimit?: number;
  timeout?: number;
  retries?: number;
}
```

### Execution States
- **PENDING**: Task queued, not started
- **SPAWNING**: Agent processes starting
- **RUNNING**: Agents executing tasks
- **VALIDATING**: Loop 2 review in progress
- **DECIDING**: Product Owner evaluation
- **COMPLETED**: Task finished successfully
- **FAILED**: Task failed, retry or abort
- **ABORTED**: Manual cancellation

## Quality Gate Protocol

### Gate Check Process
1. **Test execution**: Run test suite
2. **Pass rate calculation**: tests passed / total tests
3. **Threshold comparison**: Pass rate vs mode threshold
4. **Decision**: PROCEED (pass) or ITERATE (fail)

### Thresholds by Mode
- **MVP**: ≥70% pass rate
- **Standard**: ≥95% pass rate
- **Enterprise**: ≥98% pass rate

### Validator Protocol
1. **Review artifacts**: Code, tests, documentation
2. **Assign confidence**: 0.0-1.0 score
3. **Provide feedback**: Specific issues, improvements
4. **Submit score**: Redis consensus collection

## Docker Container Protocol

### Multi-Worktree Isolation
```bash
export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"
export CFN_REDIS_PORT="${CFN_REDIS_PORT}"
export CFN_POSTGRES_PORT="${CFN_POSTGRES_PORT}"
export WORKTREE_BRANCH="${BRANCH}"
```

### Service Communication
- **Internal**: Use service names (redis, postgres, orchestrator)
- **External**: Use offset ports (6379, 5432, 3001 + offset)
- **Isolation**: Namespace isolation per worktree

### Container Lifecycle
1. **Build**: From Linux storage only
2. **Spawn**: Docker run with environment
3. **Coordinate**: Redis through service name
4. **Cleanup**: Docker stop, network prune

## Performance Measurement Protocol

### daa Metrics Collection
```typescript
interface PerformanceMetrics {
  taskId: string;
  agentId: string;
  startTime: number;
  endTime: number;
  memoryUsed: number;
  cpuTime: number;
  outputSize: number;
  errorCount: number;
}
```

### Confidence Blending
```typescript
const blendedConfidence =
  0.7 * agentSelfAssessment +
  0.3 * performanceScore;
```

## Namespace Protocol

### Redis Namespace Structure
```
cfn:{taskId}:agents:{agentId} - Agent-specific data
cfn:{taskId}:consensus - Validator consensus
cfn:{taskId}:gate - Quality gate results
cfn:{taskId}:metadata - Task metadata
```

### File System Namespace
```
.artifacts/{taskId}/
├── results/ - Test results
├── coverage/ - Coverage reports
├── logs/ - Execution logs
└── runtime/ - Runtime data
```

## Error Recovery Protocol

### Forgiveness Mechanisms
1. **Hard dependency failure**: 4-tier fallback spawning
2. **Missing validation**: Pre-flight dependency checks
3. **Timeout issues**: Adaptive timeout calculation
4. **Resource limits**: Memory/disk pressure detection
5. **Race conditions**: Collision-resistant IDs
6. **Process leaks**: Graceful shutdown handlers
7. **Checkpoint loss**: Iteration-based state persistence

### Recovery Strategies
- **Retry**: Up to 3 attempts with exponential backoff
- **Fallback**: Alternative execution paths
- **Degradation**: Reduced functionality vs complete failure
- **Escalation**: Human intervention triggers

## Security Protocol

### Secret Redaction
- Pattern: `[REDACTED]` for sensitive data
- Context: Never log credentials, tokens, personal data
- Validation: Input sanitization before processing

### Isolation Boundaries
- **Process**: Separate agent processes
- **Network**: Docker network isolation
- **File**: Workspace-specific directories
- **Memory**: Per-agent memory limits

### Audit Trail
```sql
CREATE TABLE audit_log (
  timestamp DATETIME,
  agent_id TEXT,
  action TEXT,
  resource TEXT,
  result TEXT,
  metadata TEXT
);
```