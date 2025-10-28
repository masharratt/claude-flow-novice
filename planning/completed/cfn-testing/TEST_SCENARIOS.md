# CFN Loop Test Scenarios - Comprehensive Test Suite

**Goal:** Validate CFN Loop orchestration with synthetic data across edge cases, failure modes, and real-world patterns.

**Infrastructure Context:**
- Redis waiting mode (zero-token BLPOP coordination)
- Orchestrator with automatic dependency enforcement
- Gate threshold: ≥0.75 (Loop 3 self-validation)
- Consensus threshold: ≥0.90 (Loop 2 validators)
- Product Owner decision authority
- Max iterations: 10-15 (configurable)

**Test Philosophy:**
- **Deterministic:** Use synthetic confidence scores (no LLM calls)
- **Reproducible:** Fixed scenarios with known outcomes
- **Incremental:** Build from simple to complex
- **Comprehensive:** Cover happy path, edge cases, failures
- **Infrastructure-Focused:** Test orchestration, not agent logic

---

## Scenario 1: Perfect Storm (Zero Iterations)

**Objective:** Validate happy path with no iteration needed.

**Setup:**
- 2 Loop 3 agents (coder, researcher)
- 2 Loop 2 validators (reviewer, tester)
- 1 Product Owner
- All agents configured to return high confidence first try

**Synthetic Data:**
```javascript
{
  iteration: 1,
  loop3Confidence: {
    coder: 0.95,
    researcher: 0.92
  },
  loop2Confidence: {
    reviewer: 0.95,
    tester: 0.93
  },
  productOwnerDecision: "approve"
}
```

**Expected Flow:**
1. Loop 3 agents complete work → report confidence 0.95, 0.92
2. Gate check: avg(0.95, 0.92) = 0.935 ≥ 0.75 ✅
3. Wake Loop 2 validators
4. Loop 2 validators review → report confidence 0.95, 0.93
5. Consensus: avg(0.95, 0.93) = 0.94 ≥ 0.90 ✅
6. Wake Product Owner
7. Product Owner approves → task complete

**Success Criteria:**
- ✅ Total iterations: 1
- ✅ Loop 2 blocked until gate passed (BLPOP verification)
- ✅ Product Owner blocked until consensus passed
- ✅ Zero-token waiting (no polling)
- ✅ Execution time: <2 minutes

**What This Tests:**
- Basic orchestration flow
- BLPOP blocking mechanisms
- Wake-up signal propagation
- Consensus calculation
- Product Owner integration

---

## Scenario 2: Gate Guardian (Loop 3 Iteration)

**Objective:** Test gate failure enforcement (Loop 2 stays dormant).

**Setup:**
- 3 Loop 3 agents
- 2 Loop 2 validators
- 1 Product Owner
- Loop 3 agents fail gate for 3 iterations

**Synthetic Data:**
```javascript
{
  iterations: [
    { loop3: [0.60, 0.65, 0.58], gate: 0.61, pass: false },
    { loop3: [0.70, 0.68, 0.72], gate: 0.70, pass: false },
    { loop3: [0.80, 0.78, 0.82], gate: 0.80, pass: true }
  ],
  loop2: [0.92, 0.90],  // Only called on iteration 3
  productOwner: "approve"
}
```

**Expected Flow:**
1. **Iteration 1:**
   - Loop 3 reports: 0.60, 0.65, 0.58 → avg 0.61 < 0.75 ❌
   - Gate fails → Loop 2 stays in BLPOP
   - Wake Loop 3 for iteration 2

2. **Iteration 2:**
   - Loop 3 reports: 0.70, 0.68, 0.72 → avg 0.70 < 0.75 ❌
   - Gate fails → Loop 2 still blocked
   - Wake Loop 3 for iteration 3

3. **Iteration 3:**
   - Loop 3 reports: 0.80, 0.78, 0.82 → avg 0.80 ≥ 0.75 ✅
   - Gate passes → Signal Loop 2 to start
   - Loop 2 reviews → 0.92, 0.90 → avg 0.91 ≥ 0.90 ✅
   - Product Owner approves

**Success Criteria:**
- ✅ Loop 2 never woke during iterations 1-2
- ✅ Loop 3 woke exactly 2 times (iterations 2, 3)
- ✅ Gate correctly enforced at 0.75 threshold
- ✅ Total iterations: 3
- ✅ Redis keys: Loop 2 wake signals absent until iteration 3

**What This Tests:**
- Gate enforcement (STRAT-004 self-validation pattern)
- Loop 2 BLPOP blocking effectiveness
- Selective wake-up (only Loop 3, not Loop 2)
- Iteration management without consensus

---

## Scenario 3: Consensus Gridlock (Full Iteration Cycle)

**Objective:** Test full iteration when consensus fails.

**Setup:**
- 2 Loop 3 agents
- 3 Loop 2 validators
- 1 Product Owner
- Gate passes, consensus fails for 2 iterations

**Synthetic Data:**
```javascript
{
  iterations: [
    {
      loop3: [0.85, 0.88],  // Gate: 0.865 ✅
      loop2: [0.75, 0.80, 0.78],  // Consensus: 0.777 ❌
    },
    {
      loop3: [0.90, 0.92],  // Gate: 0.91 ✅
      loop2: [0.88, 0.90, 0.91],  // Consensus: 0.897 ❌ (just below!)
    },
    {
      loop3: [0.95, 0.94],  // Gate: 0.945 ✅
      loop2: [0.92, 0.94, 0.93],  // Consensus: 0.93 ✅
    }
  ],
  productOwner: "approve"
}
```

**Expected Flow:**
1. **Iteration 1:**
   - Loop 3 → gate 0.865 ✅ → wake Loop 2
   - Loop 2 → consensus 0.777 < 0.90 ❌
   - Wake all agents for iteration 2

2. **Iteration 2:**
   - Loop 3 → gate 0.91 ✅ → wake Loop 2
   - Loop 2 → consensus 0.897 < 0.90 ❌ (edge case!)
   - Wake all agents for iteration 3

3. **Iteration 3:**
   - Loop 3 → gate 0.945 ✅ → wake Loop 2
   - Loop 2 → consensus 0.93 ✅
   - Wake Product Owner → approve

**Success Criteria:**
- ✅ All agents woke for iterations 2 and 3
- ✅ Loop 2 woke all 3 iterations (gate always passed)
- ✅ Consensus enforced at exactly 0.90 (iteration 2 fails at 0.897)
- ✅ Total iterations: 3
- ✅ Wake signals sent to all agents (broadcast)

**What This Tests:**
- Consensus enforcement precision
- Broadcast wake-up (all agents)
- Edge case consensus (0.897 vs 0.90)
- Full iteration cycle (Loop 3 + Loop 2)

---

## Scenario 4: The Marathon (Slow Convergence)

**Objective:** Test sustained iteration with gradual improvement.

**Setup:**
- 4 Loop 3 agents
- 3 Loop 2 validators
- 1 Product Owner
- Confidence improves by 0.05 per iteration

**Synthetic Data:**
```javascript
{
  iterations: [
    { loop3: [0.55, 0.52, 0.58, 0.50], gate: 0.5375, pass: false },
    { loop3: [0.60, 0.57, 0.63, 0.55], gate: 0.5875, pass: false },
    { loop3: [0.65, 0.62, 0.68, 0.60], gate: 0.6375, pass: false },
    { loop3: [0.70, 0.67, 0.73, 0.65], gate: 0.6875, pass: false },
    { loop3: [0.75, 0.72, 0.78, 0.70], gate: 0.7375, pass: false },
    { loop3: [0.80, 0.77, 0.83, 0.75], gate: 0.7875, pass: true },
  ],
  loop2: [0.90, 0.91, 0.92],  // Only iteration 6
  productOwner: "approve"
}
```

**Expected Flow:**
- Iterations 1-5: Gate fails, Loop 3 iterates
- Iteration 6: Gate passes → Loop 2 wakes
- Loop 2 consensus passes → Product Owner approves

**Success Criteria:**
- ✅ Total iterations: 6
- ✅ Loop 2 blocked for iterations 1-5 (5 BLPOP cycles)
- ✅ Zero-token waiting (no polling during BLPOP)
- ✅ Gradual confidence progression validated
- ✅ Execution time: <5 minutes (with simulated delays)

**What This Tests:**
- Long-duration BLPOP blocking
- Sustained iteration management
- Zero-token efficiency over time
- Patience of orchestrator

---

## Scenario 5: Sprint to Finish (Rapid Iteration)

**Objective:** Stress test rapid iteration speed.

**Setup:**
- 2 Loop 3 agents
- 2 Loop 2 validators
- 10 iterations in <60 seconds

**Synthetic Data:**
```javascript
{
  iterations: Array(10).fill(null).map((_, i) => ({
    loop3: [0.60 + i * 0.025, 0.62 + i * 0.025],
    gate: 0.61 + i * 0.025,
    pass: i >= 6  // Pass on iteration 7
  })),
  loop2: [0.92, 0.93],  // Fast validation
  productOwner: "approve"
}
```

**Expected Flow:**
- 10 rapid iterations (no artificial delays)
- Gate passes on iteration 7
- Loop 2 validates quickly
- Product Owner approves

**Success Criteria:**
- ✅ 10 iterations in <60 seconds
- ✅ Zero-token waiting verified
- ✅ No Redis performance degradation
- ✅ All wake signals delivered correctly
- ✅ Orchestrator handles speed gracefully

**What This Tests:**
- Redis pub/sub performance under speed
- Zero-token efficiency at scale
- Orchestrator responsiveness
- Race condition handling

---

## Scenario 6: The Rebel (Product Owner Veto)

**Objective:** Test Product Owner decision authority and scope enforcement.

**Setup:**
- 2 Loop 3 agents
- 2 Loop 2 validators
- 1 Product Owner
- Loop 2 loves it, Product Owner rejects

**Synthetic Data:**
```javascript
{
  iterations: [
    {
      loop3: [0.90, 0.92],  // Gate: 0.91 ✅
      loop2: [0.95, 0.94],  // Consensus: 0.945 ✅
      productOwner: "reject"  // Scope violation!
    },
    {
      loop3: [0.88, 0.90],  // Revised approach
      loop2: [0.92, 0.91],
      productOwner: "approve"
    }
  ]
}
```

**Expected Flow:**
1. **Iteration 1:**
   - Loop 3 passes gate → Loop 2 validates
   - Loop 2 passes consensus → Product Owner reviews
   - Product Owner rejects (scope violation)
   - Wake all agents for iteration 2

2. **Iteration 2:**
   - Agents adjust approach
   - Product Owner approves

**Success Criteria:**
- ✅ Product Owner decision enforced
- ✅ All agents woke after veto
- ✅ Iteration 2 required despite consensus
- ✅ Scope enforcement validated

**What This Tests:**
- Product Owner authority (PATTERN-008)
- Scope management
- Decision flow beyond consensus
- Strategic boundary enforcement

---

## Scenario 7: Agent Apocalypse (Partial Failure)

**Objective:** Test error handling when agents crash mid-execution.

**Setup:**
- 4 Loop 3 agents (2 succeed, 2 fail)
- 3 Loop 2 validators (1 fails)
- 1 Product Owner

**Synthetic Data:**
```javascript
{
  iterations: [
    {
      loop3: [
        { agent: "coder", status: "success", confidence: 0.85 },
        { agent: "researcher", status: "fail", error: "timeout" },
        { agent: "backend-dev", status: "success", confidence: 0.88 },
        { agent: "devops", status: "fail", error: "crash" }
      ],
      loop2: [
        { agent: "reviewer", status: "success", confidence: 0.90 },
        { agent: "tester", status: "fail", error: "timeout" },
        { agent: "architect", status: "success", confidence: 0.92 }
      ]
    }
  ]
}
```

**Expected Behavior:**
- **Option A (Strict):** Any failure = iteration failed
- **Option B (Graceful):** Use partial results (avg of successes)
- **Option C (Retry):** Spawn fresh agents for failed tasks

**Success Criteria (Option A - Recommended):**
- ✅ Failure detected
- ✅ Iteration marked as failed
- ✅ Error logged to Redis
- ✅ Orchestrator handles gracefully

**What This Tests:**
- Error detection
- Partial results handling
- Graceful degradation
- Orchestrator resilience

---

## Scenario 8: Scalability Stress Test (Many Agents)

**Objective:** Test orchestration with large agent counts.

**Setup:**
- 10 Loop 3 agents
- 5 Loop 2 validators
- 1 Product Owner
- 2 iterations

**Synthetic Data:**
```javascript
{
  iterations: [
    {
      loop3: [0.70, 0.72, 0.68, 0.71, 0.69, 0.73, 0.70, 0.72, 0.71, 0.70],
      gate: 0.706,  // Fails
    },
    {
      loop3: [0.85, 0.87, 0.83, 0.86, 0.84, 0.88, 0.85, 0.87, 0.86, 0.85],
      gate: 0.856,  // Passes ✅
      loop2: [0.92, 0.91, 0.93, 0.90, 0.94],
      consensus: 0.92  // ✅
    }
  ]
}
```

**Expected Flow:**
1. Iteration 1: 10 agents report → gate fails → wake 10 agents
2. Iteration 2: 10 agents report → gate passes → wake 5 validators → consensus → Product Owner approves

**Success Criteria:**
- ✅ All 10 agents wake correctly
- ✅ BLPOP scales to 10+ agents
- ✅ Consensus calculation with 5 validators
- ✅ No race conditions
- ✅ Execution time: <5 minutes

**What This Tests:**
- Scalability (10+ agents)
- BLPOP performance
- Consensus calculation at scale
- Wake signal broadcast to many agents

---

## Scenario 9: Context Memory Test (Multi-Phase Epic)

**Objective:** Test context propagation across phases.

**Setup:**
- Epic with 3 phases
- Each phase uses different agent sets
- Context from previous phases injected into next

**Synthetic Data:**
```javascript
{
  phases: [
    {
      name: "Research",
      agents: ["researcher", "analyst"],
      output: { findings: "Use JWT for auth", libraries: ["jsonwebtoken", "bcrypt"] },
      iterations: 1
    },
    {
      name: "Implementation",
      agents: ["backend-dev", "frontend-dev"],
      context: "phases[0].output",  // Injected
      output: { files: ["auth.js", "login.tsx"], tests: "auth.test.js" },
      iterations: 2
    },
    {
      name: "Testing",
      agents: ["tester", "security-specialist"],
      context: "phases[0,1].output",  // Both injected
      output: { coverage: "95%", vulnerabilities: 0 },
      iterations: 1
    }
  ]
}
```

**Expected Flow:**
1. **Phase 1:** Research completes → context stored in Redis
2. **Phase 2:** Context injected from Phase 1 → implementation uses research findings
3. **Phase 3:** Context from Phases 1+2 → testing validates everything

**Success Criteria:**
- ✅ Context stored in Redis after each phase
- ✅ Context injected correctly in subsequent phases
- ✅ Adaptive context bullets created
- ✅ Phase transitions automatic

**What This Tests:**
- Context propagation (STRAT-006 insights)
- Adaptive context injection
- Multi-phase coordination
- Epic management

---

## Scenario 10: The Simulator (Real Feature Implementation)

**Objective:** Full end-to-end CFN Loop with realistic workflow.

**Setup:**
- Task: "Implement user authentication system"
- Loop 3: Backend dev, frontend dev, DevOps engineer
- Loop 2: Security specialist, code reviewer, tester
- Product Owner: Validates scope (authentication only, not authorization)

**Synthetic Data:**
```javascript
{
  task: "Implement JWT-based user authentication",
  scope: ["login", "logout", "token refresh"],
  outOfScope: ["authorization", "roles", "permissions"],
  iterations: [
    {
      loop3: {
        "backend-dev": { confidence: 0.80, output: "JWT middleware, /login, /logout endpoints" },
        "frontend-dev": { confidence: 0.78, output: "Login form, token storage, axios interceptors" },
        "devops": { confidence: 0.82, output: "Environment variables, secrets management" }
      },
      gate: 0.80,  // ✅
      loop2: {
        "security-specialist": { confidence: 0.75, issues: ["Missing rate limiting", "Weak token expiry"] },
        "code-reviewer": { confidence: 0.80, issues: ["Add input validation"] },
        "tester": { confidence: 0.70, issues: ["Missing edge case tests"] }
      },
      consensus: 0.75,  // ❌ Below 0.90
    },
    {
      loop3: {
        "backend-dev": { confidence: 0.92, output: "Added rate limiting, 15min expiry" },
        "frontend-dev": { confidence: 0.90, output: "Added input validation" },
        "devops": { confidence: 0.91, output: "Production-ready configs" }
      },
      gate: 0.91,  // ✅
      loop2: {
        "security-specialist": { confidence: 0.94, issues: [] },
        "code-reviewer": { confidence: 0.92, issues: [] },
        "tester": { confidence: 0.93, issues: [] }
      },
      consensus: 0.93,  // ✅
      productOwner: {
        decision: "approve",
        notes: "In scope, well-implemented"
      }
    }
  ]
}
```

**Expected Flow:**
1. **Iteration 1:**
   - Loop 3 implements authentication
   - Gate passes → Loop 2 reviews
   - Loop 2 finds issues → consensus fails
   - All agents iterate

2. **Iteration 2:**
   - Loop 3 addresses feedback
   - Gate passes → Loop 2 reviews
   - Loop 2 approves → consensus passes
   - Product Owner validates scope → approves

**Success Criteria:**
- ✅ Realistic workflow validated
- ✅ Feedback incorporation demonstrated
- ✅ Scope enforcement by Product Owner
- ✅ 2 iterations total

**What This Tests:**
- Real-world CFN Loop workflow
- Feedback incorporation
- Multi-role coordination
- Scope management
- End-to-end orchestration

---

## Implementation Recommendations

### Test Harness Structure

```
planning/cfn-testing/
├── TEST_SCENARIOS.md           # This document
├── IMPLEMENTATION_GUIDE.md     # How to build tests
├── test-harness/
│   ├── lib/
│   │   ├── synthetic-agent.js  # Mock agent with configurable confidence
│   │   ├── orchestrator-test.js # Test orchestrator wrapper
│   │   ├── redis-validator.js  # Validate Redis state
│   │   └── metrics-collector.js # Collect test metrics
│   ├── scenarios/
│   │   ├── 01-perfect-storm.js
│   │   ├── 02-gate-guardian.js
│   │   ├── 03-consensus-gridlock.js
│   │   ├── 04-marathon.js
│   │   ├── 05-sprint.js
│   │   ├── 06-rebel.js
│   │   ├── 07-apocalypse.js
│   │   ├── 08-scalability.js
│   │   ├── 09-context-memory.js
│   │   └── 10-simulator.js
│   ├── run-all-scenarios.sh    # Execute all tests
│   └── validate-results.js     # Validate test outcomes
└── results/
    ├── scenario-01.json
    ├── scenario-02.json
    └── ...
```

### Synthetic Agent Design

```javascript
class SyntheticAgent {
  constructor(agentId, confidencePattern) {
    this.agentId = agentId;
    this.confidencePattern = confidencePattern;  // Array of confidence per iteration
    this.currentIteration = 0;
  }

  async execute(taskId, iteration) {
    const confidence = this.confidencePattern[iteration] || 0.95;

    // Report confidence
    await redis.hset(`swarm:${taskId}:confidence`, this.agentId, confidence);

    // Signal completion
    await redis.lpush(`swarm:${taskId}:${this.agentId}:done`, "complete");

    // Enter waiting mode
    await waitingMode.enter(taskId, this.agentId, iteration);
  }
}
```

### Test Execution Pattern

```bash
# Run single scenario
node test-harness/scenarios/01-perfect-storm.js

# Run all scenarios
./test-harness/run-all-scenarios.sh

# Validate results
node test-harness/validate-results.js --scenario 01
```

### Success Metrics

Each scenario should track:
- ✅ **Correctness:** Did it produce expected outcome?
- ✅ **Performance:** Execution time within bounds?
- ✅ **Efficiency:** Zero-token waiting verified?
- ✅ **Reliability:** No race conditions or failures?
- ✅ **Infrastructure:** Redis state correct?

---

## Next Steps

1. **Review Scenarios** - Validate these scenarios match infrastructure capabilities
2. **Prioritize Tests** - Which scenarios are most critical?
3. **Build Test Harness** - Create synthetic agent framework
4. **Implement Scenario 1** - Start with happy path
5. **Iterate Through Scenarios** - Build 2-10 incrementally
6. **Document Lessons** - What did we learn?
7. **Integrate with CI** - Automate scenario execution

---

## Questions to Resolve

1. **Error Handling Strategy:** Scenario 7 - strict, graceful, or retry?
2. **Product Owner Logic:** How should synthetic Product Owner make decisions?
3. **Timeout Values:** What timeouts for different scenarios?
4. **Context Format:** How to structure synthetic context for Scenario 9?
5. **Scalability Limits:** How many agents before performance degrades?
