# Test Coverage - Quick Reference Guide

## Critical Gaps at a Glance

### Untested Critical Modules

```
CRITICAL (0% Coverage):
├── src/cfn-loop/cfn-loop-orchestrator.ts (2,020 LOC) ⚠️
├── src/agents/lifecycle-manager.ts (456 LOC) ⚠️
├── src/cli/agent-spawn.ts (incomplete)
├── src/cli/agent-executor.ts (463 LOC)
├── src/lib/database-service/postgres-adapter.ts (482 LOC)
├── src/lib/database-service/sqlite-adapter.ts (454 LOC)
└── src/middleware/transparency-middleware.ts (827 LOC)

HIGH RISK (0% Coverage):
├── src/cli/cfn-context.ts (413 LOC)
├── src/cli/memory-cli.ts (367 LOC)
├── src/integration/DatabaseHandoff.ts (658 LOC)
├── src/integration/StandardAdapter.ts (409 LOC)
├── src/cfn-loop/circuit-breaker.ts (361 LOC)
└── 316 shell scripts in .claude/skills/
```

---

## File Paths for Key Modules

### Core Orchestration
```
/home/user/claude-flow-novice/src/cfn-loop/
├── cfn-loop-orchestrator.ts        # 2,020 LOC - MOST CRITICAL
├── circuit-breaker.ts              # 361 LOC  - Timeout handling
├── feedback-injection-system.ts    # Error recovery
├── byzantine-consensus-adapter.ts  # Consensus logic
└── modes/
    ├── mvp-mode.ts
    ├── standard-mode.ts
    └── enterprise-mode.ts
```

### Agent Management
```
/home/user/claude-flow-novice/src/agents/
├── lifecycle-manager.ts               # 456 LOC - State management
├── lifecycle-manager-exported-functions.ts
├── agent-loader.ts                    # 315 LOC - Agent discovery
├── agent-registry.ts                  # 148 LOC - Agent registry
└── agent-validator.ts                 # 261 LOC - Validation

/home/user/claude-flow-novice/src/cli/
├── agent-spawn.ts                     # Process spawning
├── agent-executor.ts                  # 463 LOC - Execution logic
├── agent-command.ts                   # Command handling
└── agent-prompt-builder.ts            # 392 LOC - Prompt generation
```

### Database Layer
```
/home/user/claude-flow-novice/src/lib/database-service/
├── index.ts                           # 6,457 LOC - Main service
├── postgres-adapter.ts                # 482 LOC - PostgreSQL
├── sqlite-adapter.ts                  # 454 LOC - SQLite
├── redis-adapter.ts                   # 280 LOC - Redis
└── transaction-manager.ts             # Transaction handling
```

### Integration & Middleware
```
/home/user/claude-flow-novice/src/middleware/
└── transparency-middleware.ts         # 827 LOC - Event tracking

/home/user/claude-flow-novice/src/integration/
├── DatabaseHandoff.ts                 # 658 LOC
├── StandardAdapter.ts                 # 409 LOC
└── handoff types...
```

### Test Location
```
/home/user/claude-flow-novice/tests/
├── agent-output-validator.test.ts     # 85 tests ✓
├── artifact-registry.test.ts          # 55 tests ✓
├── config-validator.test.ts           # 113 tests ✓
├── database-service.test.ts           # 43 tests ✓
├── postgres-transaction-routing.test.ts # 34 tests ✓
├── cfn-v3/                            # Orchestration tests
│   ├── config-manager.test.ts
│   ├── redis-agent-coordination.test.js
│   └── spawn-workers.test.js
└── integration/
    └── phase-1/                       # Partial coverage
```

---

## Implementation Roadmap (What to Test First)

### Week 1: Foundation Setup
```typescript
// 1. Mock infrastructure (in tests/fixtures/)
- RedisClientMock (use existing redis-mock)
- DatabaseMocks for all adapters
- AgentProcessMock
- FileSystemMock

// 2. Test utilities (in tests/utils/)
- Test data generators
- Assertion helpers
- Cleanup utilities

// 3. Basic happy-path tests
- Orchestrator: basic flow
- Lifecycle: state transitions
- Database: CRUD operations
```

### Week 2-3: Orchestration Coverage
```typescript
// src/cfn-loop/cfn-loop-orchestrator.test.ts
Test suites:
1. Initialize and configure orchestrator
2. executeLoop3Phase() happy path
3. collectConfidenceScores() and gate checking
4. executeLoop2Phase() consensus
5. Feedback injection on failures
6. Error handling and recovery
```

### Week 3-4: Lifecycle & CLI
```typescript
// src/agents/lifecycle-manager.test.ts
Test suites:
1. State transitions (9 states, all transitions)
2. Dependency tracking
3. Event emissions
4. Memory persistence

// src/cli/agent-executor.test.ts
Test suites:
1. Command parsing
2. Context injection
3. Error handling
4. Process cleanup
```

### Week 4-5: Database & Integration
```typescript
// src/lib/database-service/*.test.ts
Test suites:
1. Transaction workflows
2. Connection management
3. Concurrent access
4. Error recovery

// src/integration/*.test.ts
Test suites:
1. Database handoff flows
2. Standard adapter operations
3. Data transformation
```

---

## Code Examples: What Needs Testing

### Example 1: Orchestrator (CRITICAL)
```typescript
// File: src/cfn-loop/cfn-loop-orchestrator.ts

// NO TESTS FOR THIS:
async orchestrateCFNLoop(config: CFNLoopConfig): Promise<PhaseResult> {
  // 1. Initialize swarm
  // 2. Execute Loop 3
  // 3. Collect confidence scores
  // 4. Gate check (≥75%)
  // 5. Execute Loop 2
  // 6. Consensus check
  // 7. Product Owner decision
  // 8. Return result

  // UNTESTED ERROR PATHS:
  - Timeout during Loop 3
  - Low confidence scores
  - Byzantine fault scenarios
  - Circuit breaker activation
  - Memory persistence failures
}
```

### Example 2: Lifecycle Manager (CRITICAL)
```typescript
// File: src/agents/lifecycle-manager.ts

// NO TESTS FOR STATE TRANSITIONS:
export type AgentLifecycleState =
  | 'uninitialized'     // Start
  | 'initializing'      // Setup
  | 'idle'              // Ready
  | 'running'           // Executing
  | 'paused'            // Suspended
  | 'stopping'          // Shutting down
  | 'stopped'           // Done
  | 'error'             // Failed
  | 'cleanup';          // Cleanup

// NO TESTS FOR:
class AgentLifecycleManager {
  async initialize(agentId: string): Promise<void> { }
  async start(agentId: string): Promise<void> { }
  async pause(agentId: string): Promise<void> { }
  async resume(agentId: string): Promise<void> { }
  async stop(agentId: string): Promise<void> { }
  async trackDependency(agentId: string, dependsOn: string[]): Promise<void> { }
  async validateCompletion(agentId: string): Promise<boolean> { }
}
```

### Example 3: Database Transactions (CRITICAL)
```typescript
// File: src/lib/database-service/transaction-manager.ts

// NO TESTS FOR:
async executeTransaction<T>(
  callback: (trx: Transaction) => Promise<T>
): Promise<T> {
  // UNTESTED:
  // - Commit on success
  // - Rollback on error
  // - Nested transaction handling
  // - Concurrent access
  // - Timeout handling
  // - Deadlock recovery
}
```

---

## Quick Win: First Tests to Write (Highest ROI)

### Test 1: Orchestrator Happy Path (4 hours)
```typescript
// tests/unit/cfn-loop/orchestrator.test.ts
import { CFNLoopOrchestrator } from '../../../src/cfn-loop/cfn-loop-orchestrator';

describe('CFNLoopOrchestrator', () => {
  describe('orchestrateCFNLoop', () => {
    test('executes complete flow with success', async () => {
      const orchestrator = new CFNLoopOrchestrator();
      const config = { phaseId: 'test-phase-1' };
      
      // Mock Loop 3 agents
      // Mock confidence scores (all > 0.75)
      // Mock Loop 2 validators
      // Mock Product Owner
      
      const result = await orchestrator.orchestrateCFNLoop(config);
      
      expect(result.success).toBe(true);
      expect(result.totalLoop2Iterations).toBe(1);
    });

    test('handles low confidence scores', async () => {
      // Test gate failure path
    });

    test('handles Byzantine consensus', async () => {
      // Test fault tolerance
    });
  });
});
```

### Test 2: Lifecycle State Transitions (3 hours)
```typescript
// tests/unit/agents/lifecycle-manager.test.ts
describe('AgentLifecycleManager', () => {
  describe('state transitions', () => {
    test('transitions from uninitialized -> initializing -> idle', async () => {
      const manager = new AgentLifecycleManager();
      
      await manager.initialize('agent-1');
      expect(manager.getState('agent-1')).toBe('initializing');
      
      // Simulate init complete
      expect(manager.getState('agent-1')).toBe('idle');
    });

    test('validates dependency before allowing completion', async () => {
      const manager = new AgentLifecycleManager();
      
      await manager.trackDependency('agent-1', ['agent-2']);
      const canComplete = await manager.validateCompletion('agent-1');
      
      expect(canComplete).toBe(false); // agent-2 not complete
    });
  });
});
```

### Test 3: Database Transaction (3 hours)
```typescript
// tests/unit/database/transaction-manager.test.ts
describe('TransactionManager', () => {
  describe('executeTransaction', () => {
    test('commits on successful callback', async () => {
      const tm = new TransactionManager();
      
      const result = await tm.executeTransaction(async (trx) => {
        await trx.insert('users', { name: 'John' });
        return 'success';
      });

      expect(result).toBe('success');
      // Verify data was committed
    });

    test('rolls back on callback error', async () => {
      const tm = new TransactionManager();
      
      await expect(
        tm.executeTransaction(async (trx) => {
          await trx.insert('users', { name: 'John' });
          throw new Error('Something went wrong');
        })
      ).rejects.toThrow();

      // Verify data was rolled back
    });
  });
});
```

---

## Metrics to Track

### Coverage Goals
```
By Module (Tier 1 - CRITICAL):
├── cfn-loop-orchestrator.ts:    85%+ branch coverage
├── lifecycle-manager.ts:         90%+ statement coverage
└── database adapters:            80%+ coverage

By Module (Tier 2 - HIGH):
├── CLI handlers:                 70%+ coverage
├── Middleware:                   75%+ coverage
└── Integration:                  70%+ coverage

Overall Target: 75%+ by end of project
```

### Success Criteria
```
✓ All critical paths have tests
✓ All error conditions tested
✓ All async operations tested
✓ All state transitions tested
✓ Concurrent scenarios tested
✓ Edge cases documented and tested
```

---

## Tools & Dependencies Already Available

```json
{
  "jest": "^30.2.0",
  "ts-jest": "^29.4.5",
  "@types/jest": "^30.0.0",
  "jest-mock-extended": "^4.0.0",
  "redis-mock": "^0.56.3",
  "supertest": "^7.1.4",
  "better-sqlite3": "^12.4.1"
}
```

No additional tools needed - use existing framework!

---

## Next Steps

1. Read full report: `/home/user/claude-flow-novice/docs/TEST_COVERAGE_ANALYSIS.md`
2. Pick Week 1 quick wins above (10-15 hours total)
3. Set up test fixtures and mocks
4. Start with Test 1: Orchestrator happy path
5. Iterate through Tier 1 modules

Estimated effort for Tier 1: 100-120 hours
Estimated ROI: 250+ hours/year in reduced manual testing

