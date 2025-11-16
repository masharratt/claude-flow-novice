# Test Coverage Dependency Map

## Critical Path Analysis: What Must Be Tested First

### System Dependency Graph

```
┌────────────────────────────────────────────────────────────────┐
│                     User/CLI Interface                          │
│  (src/cli/index.ts, agent-spawn.ts, agent-executor.ts)         │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│               CFN Loop Orchestrator (CRITICAL)                  │
│  /src/cfn-loop/cfn-loop-orchestrator.ts (2,020 LOC)            │
│  ├─ Loop 3 Execution (Primary Swarm)                           │
│  ├─ Confidence Collection & Gating                             │
│  ├─ Loop 2 Validation (Byzantine Consensus)                    │
│  └─ Product Owner Decision                                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     ┌─────────┐   ┌──────────┐   ┌──────────────┐
     │ Loop 3  │   │ Loop 2   │   │Product Owner │
     │Agents   │   │Validators│   │   Decision   │
     └────┬────┘   └────┬─────┘   └──────┬───────┘
          │              │                 │
          └──────────────┼─────────────────┘
                         ▼
        ┌────────────────────────────────┐
        │  Agent Lifecycle Manager       │
        │  (CRITICAL - 456 LOC)          │
        │  ├─ State Transitions          │
        │  ├─ Dependency Tracking        │
        │  ├─ Process Management         │
        │  └─ Memory Persistence         │
        └────────────────┬───────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     ┌─────────┐   ┌──────────┐   ┌──────────────┐
     │ Agent   │   │Database  │   │  Middleware  │
     │Spawning │   │Service   │   │  & Redis     │
     └─────────┘   └──────────┘   └──────────────┘
          │              │              │
          └──────────────┼──────────────┘
                         ▼
        ┌────────────────────────────────┐
        │   Supporting Infrastructure    │
        │ ├─ Config Validation (✓)       │
        │ ├─ Agent Output Validation (✓) │
        │ ├─ Artifact Registry (✓)       │
        │ └─ CLI Commands                │
        └────────────────────────────────┘
```

---

## Testing Priority by Dependency

### Tier 0: MUST TEST FIRST (Foundation)
These modules have zero external dependencies and block everything:

```
1. Agent Lifecycle Manager (456 LOC)
   └─ Required by: Orchestrator, CLI, Agent Spawning
   └─ Testing complexity: MEDIUM
   └─ Estimated effort: 15-20 hours

2. Agent Spawning (CLI) (incomplete)
   └─ Required by: Orchestrator, all agent execution
   └─ Testing complexity: MEDIUM
   └─ Estimated effort: 12-15 hours

3. Database Transaction Manager
   └─ Required by: Middleware, Integration, Handoff
   └─ Testing complexity: MEDIUM
   └─ Estimated effort: 10-12 hours
```

### Tier 1: CRITICAL (Core Logic)
Depends on Tier 0; blocks everything else:

```
1. CFN Loop Orchestrator (2,020 LOC) ⚠️ HIGHEST PRIORITY
   ├─ Depends on: Lifecycle Manager, Agent Spawning
   ├─ Required by: All system functionality
   ├─ Testing complexity: HIGH
   └─ Estimated effort: 40-50 hours
   
   Critical paths to test:
   ├─ orchestrateCFNLoop() - Main orchestration
   ├─ executeLoop3Phase() - Agent execution
   ├─ collectConfidenceScores() - Scoring & gating
   ├─ executeLoop2Phase() - Consensus
   ├─ injectFeedback() - Error recovery
   ├─ handleTimeout() - Timeout management
   └─ Error escalation paths

2. Database Adapters (482 + 454 + 280 LOC)
   ├─ Postgres, SQLite, Redis adapters
   ├─ Depends on: Transaction Manager
   ├─ Required by: Orchestrator, CLI, Middleware
   ├─ Testing complexity: HIGH
   └─ Estimated effort: 25-35 hours
   
   Critical paths to test:
   ├─ Transaction commit/rollback
   ├─ Connection management
   ├─ Query timeout handling
   ├─ Concurrent access
   ├─ Data validation
   └─ Error recovery

3. Circuit Breaker (361 LOC)
   ├─ Depends on: Nothing (utility)
   ├─ Required by: Orchestrator
   ├─ Testing complexity: MEDIUM
   └─ Estimated effort: 10-15 hours
   
   Critical paths to test:
   ├─ Timeout triggering
   ├─ State transitions (closed/open/half-open)
   ├─ Recovery mechanism
   └─ Error propagation
```

### Tier 2: HIGH PRIORITY (Integration)
Depends on Tier 1; affects developer workflow:

```
1. CLI Command Handlers (24 files, ~2,100 LOC)
   ├─ agent-executor.ts (463 LOC)
   ├─ cli-agent-context.ts (479 LOC)
   ├─ cfn-context.ts (413 LOC)
   ├─ memory-cli.ts (367 LOC)
   ├─ Depends on: Orchestrator, Database, Lifecycle
   ├─ Testing complexity: MEDIUM
   └─ Estimated effort: 30-40 hours

2. Middleware & Integration (2,000+ LOC)
   ├─ transparency-middleware.ts (827 LOC)
   ├─ DatabaseHandoff.ts (658 LOC)
   ├─ StandardAdapter.ts (409 LOC)
   ├─ Depends on: Database, Orchestrator
   ├─ Testing complexity: HIGH
   └─ Estimated effort: 35-45 hours

3. Byzantine Consensus Adapter (265 LOC)
   ├─ Depends on: Nothing (utility)
   ├─ Required by: Orchestrator Loop 2
   ├─ Testing complexity: HIGH (math-heavy)
   └─ Estimated effort: 15-20 hours
```

### Tier 3: MEDIUM PRIORITY (Polish)
Depends on Tiers 1-2; optimization and coverage:

```
1. Shell Scripts & Skills (316 files)
   ├─ cfn-agent-spawning/spawn-agent.sh
   ├─ cfn-loop-orchestration/orchestrate.sh
   ├─ cfn-coordination/report-completion.sh
   ├─ cfn-redis-coordination/coordinate.sh
   ├─ Testing complexity: MEDIUM (requires BATS framework)
   └─ Estimated effort: 20-30 hours

2. Docker Containerization
   ├─ Build processes
   ├─ Container lifecycle
   ├─ Network coordination
   ├─ Testing complexity: MEDIUM
   └─ Estimated effort: 15-20 hours

3. Error Scenarios & Edge Cases
   ├─ Distributed across all modules
   ├─ Testing complexity: VARIES
   └─ Estimated effort: 40-50 hours
```

---

## Critical Path Testing Sequence

```
WEEK 1: Foundation (40 hours)
├─ [ ] Set up test fixtures & mocks (8 hours)
│  ├─ RedisClientMock
│  ├─ DatabaseMocks (Postgres, SQLite, Redis)
│  ├─ AgentProcessMock
│  └─ FileSystemMock
│
├─ [ ] Agent Lifecycle Manager tests (12 hours)
│  ├─ State transitions (5 states)
│  ├─ Dependency tracking (4 hours)
│  └─ Event emissions (3 hours)
│
├─ [ ] Agent Spawning tests (10 hours)
│  ├─ Process creation
│  ├─ Argument parsing
│  └─ Error handling
│
└─ [ ] Database Transaction Manager tests (10 hours)
   ├─ Commit/rollback
   ├─ Concurrent access
   └─ Error recovery

WEEK 2-3: Orchestrator (60 hours)
├─ [ ] CFN Loop Orchestrator - Happy Path (15 hours)
│  ├─ Initialize & configure (3 hours)
│  ├─ Loop 3 execution (5 hours)
│  ├─ Confidence scoring & gate (4 hours)
│  └─ Loop 2 consensus (3 hours)
│
├─ [ ] CFN Loop Orchestrator - Error Paths (20 hours)
│  ├─ Timeout handling (6 hours)
│  ├─ Low confidence scenarios (4 hours)
│  ├─ Byzantine faults (5 hours)
│  └─ Circuit breaker activation (5 hours)
│
├─ [ ] Circuit Breaker tests (10 hours)
│  ├─ State transitions
│  ├─ Timeout triggering
│  └─ Recovery mechanism
│
├─ [ ] Byzantine Consensus tests (10 hours)
│  ├─ Voting logic
│  ├─ Fault tolerance
│  └─ Decision making
│
└─ [ ] Feedback Injection tests (5 hours)
   ├─ Error detection
   ├─ Feedback generation
   └─ Iteration restart

WEEK 4: Database & Integration (50 hours)
├─ [ ] Database Adapter tests (25 hours)
│  ├─ Postgres adapter (8 hours)
│  ├─ SQLite adapter (8 hours)
│  ├─ Redis adapter (5 hours)
│  └─ Connection management (4 hours)
│
├─ [ ] Middleware tests (15 hours)
│  ├─ Transparency middleware (8 hours)
│  └─ Event handling (7 hours)
│
└─ [ ] Integration tests (10 hours)
   ├─ DatabaseHandoff workflows (5 hours)
   ├─ StandardAdapter operations (3 hours)
   └─ Data transformation (2 hours)

WEEK 5: CLI & Coverage Expansion (45 hours)
├─ [ ] CLI Command Handler tests (25 hours)
│  ├─ agent-executor.ts (8 hours)
│  ├─ cli-agent-context.ts (8 hours)
│  ├─ cfn-context.ts (5 hours)
│  └─ memory-cli.ts (4 hours)
│
├─ [ ] Error Scenarios & Edge Cases (15 hours)
│  ├─ Input validation (5 hours)
│  ├─ Race conditions (5 hours)
│  └─ Resource exhaustion (5 hours)
│
└─ [ ] E2E Integration tests (5 hours)
   ├─ Full orchestration flow
   └─ Multi-agent coordination

WEEK 6: Shell & Polish (30 hours)
├─ [ ] Shell Script Test Framework (10 hours)
│  ├─ BATS setup
│  └─ Skill validation tests
│
├─ [ ] Docker Build Testing (10 hours)
│  └─ Container lifecycle
│
└─ [ ] Coverage Review & Documentation (10 hours)
   ├─ Coverage report generation
   ├─ Metrics collection
   └─ Documentation updates

TOTAL: ~225 hours
ROI: 250+ hours/year in reduced manual testing
```

---

## Testing Dependency Rules

### Rule 1: Reverse Dependency Order
- Test leaf nodes first (modules with no dependencies)
- Test aggregators last (modules that depend on others)
- Follow: Tier 0 → Tier 1 → Tier 2 → Tier 3

### Rule 2: Mock Everything Below
- When testing Module A, mock all its dependencies
- Use actual implementations only in integration tests
- Mocks ensure isolation and speed

### Rule 3: Critical Path Priority
```
Priority = (Risk × Impact) / (Dependencies × Effort)

HIGHEST PRIORITY:
├─ Orchestrator (Risk:CRITICAL × Impact:CRITICAL) / (Deps:3 × Effort:50) = 0.24
├─ Lifecycle Manager (Risk:CRITICAL × Impact:CRITICAL) / (Deps:1 × Effort:18) = 0.11
└─ Database (Risk:CRITICAL × Impact:HIGH) / (Deps:2 × Effort:30) = 0.10

NEXT PRIORITY:
├─ Circuit Breaker (Risk:HIGH × Impact:HIGH) / (Deps:0 × Effort:12) = 0.17
└─ Byzantine Consensus (Risk:MEDIUM × Impact:HIGH) / (Deps:0 × Effort:18) = 0.08
```

---

## Blocked By / Blocks Relationships

```
Orchestrator (CRITICAL)
├─ Blocked by:
│  ├─ Lifecycle Manager (needed for agent management)
│  ├─ Agent Spawning (needed to create agents)
│  ├─ Circuit Breaker (needed for timeout handling)
│  ├─ Byzantine Consensus (needed for Loop 2)
│  └─ Feedback System (needed for error handling)
│
└─ Blocks:
   ├─ All CLI commands (depend on orchestrator)
   ├─ All E2E tests (depend on orchestrator)
   ├─ All production workflows
   └─ Deployment confidence

Lifecycle Manager (CRITICAL)
├─ Blocked by:
│  └─ Nothing (foundational)
│
└─ Blocks:
   ├─ Orchestrator tests
   ├─ Agent Spawning tests
   ├─ CLI command tests
   └─ All agent-related functionality

Database Adapters (CRITICAL)
├─ Blocked by:
│  └─ Transaction Manager
│
└─ Blocks:
   ├─ Middleware tests
   ├─ Integration tests
   ├─ Orchestrator error paths
   └─ Production data persistence
```

---

## Test Isolation Strategy

### Unit Tests (No Dependencies)
These can be tested completely in isolation with mocks:

```
✓ Lifecycle Manager
✓ Agent Spawning
✓ Circuit Breaker
✓ Byzantine Consensus
✓ Config Validator (already has tests)
✓ Output Validator (already has tests)
```

### Integration Tests (Some Dependencies)
These require minimal real dependencies:

```
→ Orchestrator (mock Lifecycle, Spawning, Database)
→ Database Adapters (can use in-memory SQLite)
→ Middleware (mock Redis, Database)
→ CLI Handlers (mock all services)
```

### E2E Tests (Full Dependencies)
These run the full stack:

```
→ Full orchestration workflow
→ Multi-agent coordination
→ Docker deployment
→ Real database operations
```

---

## Success Metrics by Phase

### Phase 1 Completion (Week 1-3)
```
✓ Tier 0 modules: 100% test coverage
✓ Orchestrator: 85%+ branch coverage
✓ Critical paths: All tested
✓ Error scenarios: Basic coverage

Coverage: 40%
Test count: 200+
```

### Phase 2 Completion (Week 4-5)
```
✓ All critical modules: 80%+ coverage
✓ Integration tests: Functional paths
✓ CLI commands: Basic coverage
✓ Edge cases: Identified and tested

Coverage: 60%
Test count: 500+
```

### Phase 3 Completion (Week 6)
```
✓ All modules: 75%+ coverage
✓ Shell scripts: 50%+ coverage
✓ Docker: Validated
✓ Full documentation

Coverage: 75%
Test count: 1,200+
```

