# TypeScript Redis E2E Test - Architecture & Flow

## Test Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Test Script (Bash)                               │
│            tests/typescript-redis-e2e-5-iterations.sh               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                  Test Orchestration                         │   │
│  │                                                             │   │
│  │  For each of 5 iterations:                                 │   │
│  │    1. Loop 3 (Implementers)                                │   │
│  │    2. Gate Check (Pass Rate)                               │   │
│  │    3. Loop 2 (Validators) - if gate passes                 │   │
│  │    4. Product Owner Decision                               │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Calls
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Bash Wrapper Scripts                             │
│         .claude/skills/cfn-redis-coordination/*.sh                  │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ report-          │  │ collect-         │  │ store-          │  │
│  │ completion.sh    │  │ results.sh       │  │ context.sh      │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬────────┘  │
│           │                     │                      │            │
└───────────┼─────────────────────┼──────────────────────┼────────────┘
            │ Invokes via         │ Invokes via          │ Invokes via
            │ node dist/...       │ node dist/...        │ node dist/...
            ▼                     ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  TypeScript Modules (Compiled)                      │
│         .claude/skills/cfn-redis-coordination/dist/*.js             │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ completion-      │  │ result-          │  │ context-        │  │
│  │ reporter.js      │  │ collector.js     │  │ manager.js      │  │
│  │                  │  │                  │  │                 │  │
│  │ • reportComplet  │  │ • collectResults │  │ • storeContext  │  │
│  │ • reportTestRes  │  │ • collectConf..  │  │ • getContext    │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬────────┘  │
│           │                     │                      │            │
│           └─────────────────────┼──────────────────────┘            │
│                                 │ Uses                              │
│                                 ▼                                   │
│                   ┌──────────────────────────┐                     │
│                   │   redis-client.js        │                     │
│                   │                          │                     │
│                   │  • Redis connection      │                     │
│                   │  • Mode detection        │                     │
│                   │  • Graceful fallback     │                     │
│                   └─────────────┬────────────┘                     │
└─────────────────────────────────┼──────────────────────────────────┘
                                  │ Connects to
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Redis Server                                │
│                    (Docker Container)                               │
│                                                                      │
│  Storage:                                                           │
│    • swarm:{task-id}:context                    (Task metadata)    │
│    • swarm:{task-id}:{agent-id}:confidence      (Scores)           │
│    • swarm:{task-id}:{agent-id}:result          (Full results)     │
│    • swarm:{task-id}:{agent-id}:test-results    (Pass rates)       │
│    • swarm:{task-id}:{agent-id}:done            (Completion sig)   │
│    • swarm:{task-id}:completed_agents           (Agent list)       │
└─────────────────────────────────────────────────────────────────────┘
```

## CFN Loop Iteration Flow (Single Iteration)

```
START ITERATION N
│
├─ LOOP 3: IMPLEMENTERS
│  │
│  ├─ Agent: backend-dev-1
│  │  ├─ [Store Context] ──────────► context-manager.js ──► Redis
│  │  ├─ [Execute Tests] ──────────► (simulated: pass_rate=0.85)
│  │  └─ [Report Results] ─────────► completion-reporter.js ──► Redis
│  │
│  ├─ Agent: frontend-dev-1
│  │  └─ [Report Results] ─────────► completion-reporter.js ──► Redis
│  │
│  └─ Agent: database-dev-1
│     └─ [Report Results] ─────────► completion-reporter.js ──► Redis
│
├─ GATE CHECK: TEST PASS RATE THRESHOLD
│  │
│  ├─ [Collect Pass Rates] ────────► result-collector.js ◄──── Redis
│  │  └─ Agents: [backend-dev-1, frontend-dev-1, database-dev-1]
│  │
│  ├─ [Calculate Average]
│  │  └─ avg_pass_rate = (0.85 + 0.90 + 0.88) / 3 = 0.88
│  │
│  ├─ [Compare Threshold]
│  │  └─ 0.88 < 0.95 (GATE FAILS)
│  │
│  └─ DECISION: SKIP Loop 2, ITERATE Loop 3
│
└─ ITERATION N COMPLETE → CONTINUE TO ITERATION N+1

─────────────────────────────────────────────────────────────────

START ITERATION 4 (Example: Gate Passes)
│
├─ LOOP 3: IMPLEMENTERS
│  └─ [All agents report pass_rate ≥ 0.96]
│
├─ GATE CHECK
│  ├─ avg_pass_rate = 0.97
│  ├─ 0.97 ≥ 0.95 (GATE PASSES) ✅
│  └─ DECISION: PROCEED TO Loop 2
│
├─ LOOP 2: VALIDATORS
│  │
│  ├─ Validator: code-reviewer-1
│  │  └─ [Report Consensus] ──────► completion-reporter.js ──► Redis
│  │
│  ├─ Validator: security-auditor-1
│  │  └─ [Report Consensus] ──────► completion-reporter.js ──► Redis
│  │
│  └─ Validator: performance-tester-1
│     └─ [Report Consensus] ──────► completion-reporter.js ──► Redis
│
├─ CONSENSUS COLLECTION
│  │
│  ├─ [Collect Scores] ────────────► result-collector.js ◄──── Redis
│  │  └─ Validators: [code-reviewer-1, security-auditor-1, ...]
│  │
│  ├─ [Calculate Average]
│  │  └─ avg_consensus = (0.92 + 0.94 + 0.93) / 3 = 0.93
│  │
│  └─ [Compare Threshold]
│     └─ 0.93 ≥ 0.90 (CONSENSUS MET) ✅
│
├─ PRODUCT OWNER DECISION
│  │
│  ├─ Input: consensus=0.93, iteration=4
│  │
│  └─ DECISION: PROCEED ✅
│
└─ CFN LOOP COMPLETE 🎉
```

## TypeScript Module Call Flow (Detailed)

### Example: Agent Completion Reporting

```
Test Script (bash)
│
├─ simulate_loop3_agent("backend-dev-1", 0.85, 0.85, 1)
│  │
│  └─ bash report-completion.sh \
│        --task-id "test-ts-e2e-12345" \
│        --agent-id "backend-dev-1" \
│        --confidence 0.85 \
│        --iteration 1 \
│        --test-pass-rate 0.85
│
│     Bash Wrapper (report-completion.sh)
│     │
│     ├─ Parse CLI arguments
│     ├─ Validate inputs (task-id, agent-id)
│     └─ node dist/completion-reporter.js \
│           --task-id "$TASK_ID" \
│           --agent-id "$AGENT_ID" \
│           --confidence "$CONFIDENCE" \
│           ...
│
│        TypeScript Module (completion-reporter.js)
│        │
│        ├─ Import RedisClient from redis-client.js
│        ├─ Create CompletionReporter instance
│        │
│        ├─ reportCompletion(taskId, agentId, confidence, options)
│        │  │
│        │  ├─ Validate inputs (isValidTaskId, isValidAgentId, isValidConfidence)
│        │  │
│        │  ├─ Check mode: if (!redis.canUseRedis) → Task Mode fallback
│        │  │
│        │  ├─ CLI Mode: Store in Redis
│        │  │  │
│        │  │  ├─ LPUSH swarm:{task-id}:{agent-id}:done "complete"
│        │  │  ├─ SET swarm:{task-id}:{agent-id}:confidence 0.85 EX 3600
│        │  │  ├─ HSET swarm:{task-id}:{agent-id}:result
│        │  │  │     confidence "0.85"
│        │  │  │     iteration "1"
│        │  │  │     timestamp "2025-01-19T..."
│        │  │  │     testsRun "10"
│        │  │  │     testsPassed "8"
│        │  │  ├─ LPUSH swarm:{task-id}:completed_agents "backend-dev-1"
│        │  │  └─ EXPIRE keys (TTL: 3600s)
│        │  │
│        │  └─ logger.info("✅ Completion reported: Agent backend-dev-1, ...")
│        │
│        └─ exit(0)
│
│     Bash Wrapper (continued)
│     │
│     ├─ Check exit code: $? == 0
│     └─ echo "✅ Completion reported successfully"
│
│  Test Script (continued)
│  │
│  ├─ Check bash exit code: $? == 0
│  ├─ Verify Redis data: redis_get "swarm:test-ts-e2e-12345:backend-dev-1:confidence"
│  └─ assert_success "Loop 3 agent completed"
```

## Redis Data Schema (After 1 Iteration)

```
Redis Keys After Iteration 1:

swarm:test-ts-e2e-12345:context
├─ Type: HASH
└─ Fields:
   ├─ epic: "E2E TypeScript Test"
   ├─ mode: "standard"
   ├─ scope: "{...}"
   ├─ deliverables: "[...]"
   └─ updated_at: "2025-01-19T12:00:00Z"

swarm:test-ts-e2e-12345:backend-dev-1:confidence
├─ Type: STRING
├─ Value: "0.85"
└─ TTL: 3600s

swarm:test-ts-e2e-12345:backend-dev-1:result
├─ Type: HASH
└─ Fields:
   ├─ confidence: "0.85"
   ├─ iteration: "1"
   ├─ timestamp: "2025-01-19T12:00:00Z"
   ├─ status: "complete"
   ├─ testsRun: "10"
   ├─ testsPassed: "8"
   └─ testsFailed: "2"

swarm:test-ts-e2e-12345:backend-dev-1:test-results
├─ Type: HASH
└─ Fields:
   ├─ passRate: "0.85"
   ├─ testsRun: "10"
   ├─ testsPassed: "8"
   └─ testsFailed: "2"

swarm:test-ts-e2e-12345:backend-dev-1:done
├─ Type: LIST
└─ Value: ["complete"]

swarm:test-ts-e2e-12345:completed_agents
├─ Type: LIST
└─ Values: ["backend-dev-1", "frontend-dev-1", "database-dev-1"]

[... similar for frontend-dev-1, database-dev-1 ...]
```

## Test Validation Points

```
┌────────────────────────────────────────────────────────────────┐
│                   Validation Checkpoints                       │
└────────────────────────────────────────────────────────────────┘

1. TypeScript Compilation
   ├─ dist/ directory exists
   ├─ All .js files present
   └─ No runtime errors when loading modules

2. Redis Connectivity
   ├─ Redis container running
   ├─ PING returns PONG
   └─ Authentication works (if password set)

3. Context Storage (context-manager.js)
   ├─ storeContext() succeeds
   ├─ Redis key created: swarm:{task-id}:context
   ├─ TTL set (24h)
   └─ JSON serialization correct

4. Completion Reporting (completion-reporter.js)
   ├─ reportCompletion() succeeds
   ├─ Redis keys created:
   │  ├─ swarm:{task-id}:{agent-id}:confidence
   │  ├─ swarm:{task-id}:{agent-id}:result
   │  └─ swarm:{task-id}:{agent-id}:done
   ├─ TTLs set correctly
   └─ Agent added to completed_agents list

5. Test Result Reporting (completion-reporter.js)
   ├─ reportTestResults() succeeds
   ├─ Redis key created: swarm:{task-id}:{agent-id}:test-results
   ├─ Pass rate calculated correctly
   └─ Test counts accurate (run, passed, failed)

6. Result Collection (result-collector.js)
   ├─ collectResults() retrieves all agents
   ├─ Confidence scores parsed correctly
   ├─ Test pass rates parsed correctly
   └─ Result aggregation accurate

7. Gate Threshold Check
   ├─ Average pass rate calculated correctly
   ├─ Threshold comparison accurate
   ├─ Gate pass → Loop 2 triggered
   └─ Gate fail → Skip Loop 2, iterate Loop 3

8. Consensus Collection (result-collector.js)
   ├─ collectConfidenceScores() retrieves validators
   ├─ Consensus scores parsed correctly
   └─ Average consensus calculated correctly

9. Product Owner Decision Logic
   ├─ PROCEED when consensus ≥ threshold
   ├─ ITERATE when consensus < threshold
   ├─ ABORT when max iterations reached
   └─ Decision propagates correctly

10. Memory Leak Prevention
    ├─ Redis key count reasonable (<100)
    ├─ No orphaned keys after cleanup
    ├─ TTLs prevent indefinite accumulation
    └─ Agent cleanup removes stale data

11. Multi-Iteration Stability
    ├─ All 5 iterations complete successfully
    ├─ No errors accumulate across iterations
    ├─ Redis connection pool remains healthy
    └─ No performance degradation over time
```

## Error Handling Flow

```
TypeScript Module Error
│
├─ CoordinationError thrown
│  ├─ Type: VALIDATION_ERROR | REDIS_UNAVAILABLE | TIMEOUT
│  └─ Message: Descriptive error with context
│
├─ Error propagates to bash wrapper
│  ├─ Exit code: non-zero (1)
│  └─ stderr: Error message logged
│
├─ Bash wrapper detects failure
│  ├─ Check: $? != 0
│  └─ Log error with context
│
└─ Test script assertion fails
   ├─ assert_success returns 1
   ├─ TEST_FAILED counter incremented
   └─ Error logged with agent/task context
```

## Performance Characteristics

```
┌──────────────────────────────────────────────────────────┐
│              Performance Metrics                         │
└──────────────────────────────────────────────────────────┘

TypeScript Module Loading:
  ├─ Time: <50ms per module
  ├─ Memory: ~5MB per module
  └─ Connection pool: 1 Redis client (reused)

Redis Operations (per agent):
  ├─ LPUSH (done signal): ~1ms
  ├─ SET (confidence): ~1ms
  ├─ HSET (result): ~2ms
  ├─ EXPIRE (TTL): ~1ms
  └─ Total per agent: ~5ms

Gate Check (3 agents):
  ├─ HGETALL per agent: ~2ms
  ├─ Parsing JSON: ~1ms
  └─ Total: ~10ms

Consensus Collection (3 validators):
  ├─ GET per validator: ~1ms
  ├─ Aggregation: ~1ms
  └─ Total: ~5ms

Full Iteration (Loop 3 + Gate + Loop 2 + Decision):
  ├─ Loop 3 (3 agents): ~15ms
  ├─ Gate check: ~10ms
  ├─ Loop 2 (3 validators): ~15ms
  ├─ Decision: ~5ms
  └─ Total per iteration: ~45ms

5 Iterations Total:
  ├─ Redis operations: ~225ms
  ├─ Bash overhead: ~5s
  ├─ Test scaffolding: ~10s
  └─ Total test duration: ~15-20s
```

## Related Diagrams

- **CFN Loop Architecture:** `docs/architecture/CFN_LOOP_V3.md`
- **Redis Coordination Patterns:** `.claude/skills/cfn-redis-coordination/PATTERNS.md`
- **Test Suite Overview:** `tests/docker/TEST_SUITE_OVERVIEW.md`
