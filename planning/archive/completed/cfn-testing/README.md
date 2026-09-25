# CFN Loop Testing Suite - Complete Documentation

**Created:** 2025-10-20
**Status:** Planning Phase
**Goal:** Comprehensive test suite for CFN Loop orchestration infrastructure

---

## 📚 Documentation Overview

### 1. [TEST_SCENARIOS.md](./TEST_SCENARIOS.md)
**10 synthetic test scenarios covering fundamental CFN Loop patterns**

| Scenario | Focus | Complexity |
|----------|-------|------------|
| 1. Perfect Storm | Happy path (zero iterations) | Low |
| 2. Gate Guardian | Gate enforcement (Loop 2 blocked) | Medium |
| 3. Consensus Gridlock | Consensus enforcement | Medium |
| 4. Marathon | Slow convergence (10+ iterations) | Medium |
| 5. Sprint | Rapid iteration (10 iterations in 60s) | High |
| 6. Rebel | Product Owner veto | Medium |
| 7. Apocalypse | Partial agent failures | High |
| 8. Scalability | Many agents (10+ Loop 3, 5+ Loop 2) | High |
| 9. Context Memory | Multi-phase epic | High |
| 10. Simulator | Real feature implementation | High |

**Purpose:** Validate core orchestration infrastructure with deterministic outcomes

---

### 2. [REALISTIC_STRESS_TESTS.md](./REALISTIC_STRESS_TESTS.md)
**Real-world scenarios that push infrastructure to limits**

| Scenario | Real-World Task | Limits Tested |
|----------|----------------|---------------|
| 1. Microservices Blast | Auth across 5 services | Scale (11 agents), parallelism |
| 2. Emergency Hotfix | Critical security fix | Speed (<5 min), urgency |
| 3. Legacy Migration | Monolith → microservices | Duration (2+ hours), context (500+ bullets) |
| 4. Distributed Team | Human-agent collaboration | Long BLPOP (20+ min), mixed agents |
| 5. Chaos Monkey | Random failures (30% crash rate) | Failure resilience, recovery |
| 6. Context Explosion | Large codebase refactor | Memory (550+ bullets), SQLite performance |
| 7. The Gauntlet | All stresses combined | Everything |

**Purpose:** Find breaking points, validate production-readiness

---

### 3. [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)
**Step-by-step guide for building tests**

**Contents:**
- Synthetic agent design patterns
- Orchestrator integration
- Redis validation utilities
- Test execution workflow
- Metrics collection
- Debugging tips

**Key Components:**
```javascript
// Synthetic agent with configurable confidence
class SyntheticAgent {
  confidencePattern: [0.60, 0.75, 0.90],  // Per iteration
  execute() { /* work → report → wait → repeat */ }
}

// Loop 2 validator waits for gate pass
class SyntheticLoop2Validator extends SyntheticAgent {
  waitForGatePass() { /* BLPOP until gate passes */ }
}

// Product Owner waits for consensus
class SyntheticProductOwner extends SyntheticAgent {
  waitForConsensus() { /* BLPOP until consensus */ }
}
```

**Purpose:** Provide implementation blueprint for test harness

---

### 4. [COMPARISON_TO_HELLO_WORLD.md](./COMPARISON_TO_HELLO_WORLD.md)
**How CFN Loop tests relate to existing hello-world tests**

**Key Differences:**

| Dimension | Hello-World | CFN Loop |
|-----------|-------------|----------|
| Architecture | Mesh (peer-to-peer) | Hierarchical (orchestrated) |
| Coordination | Claim negotiation | Dependency enforcement |
| Quality Control | Post-completion | Real-time gates |
| Iteration | Retry on error | Continuous improvement |
| Scope | Horizontal scaling | Vertical improvement |

**Together:** Comprehensive coverage of all coordination patterns

**Purpose:** Explain how tests complement each other

---

## 🎯 Quick Start

### What to Read First

1. **New to CFN Loops?** → Start with [TEST_SCENARIOS.md](./TEST_SCENARIOS.md) Scenario 1 (Perfect Storm)
2. **Want realistic examples?** → Read [REALISTIC_STRESS_TESTS.md](./REALISTIC_STRESS_TESTS.md) Scenario 1 (Microservices)
3. **Ready to implement?** → Follow [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)
4. **Comparing to hello-world?** → See [COMPARISON_TO_HELLO_WORLD.md](./COMPARISON_TO_HELLO_WORLD.md)

---

## 🏗️ Test Suite Structure

### Proposed Directory Layout

```
planning/cfn-testing/
├── README.md                           # This file
├── TEST_SCENARIOS.md                   # 10 synthetic scenarios
├── REALISTIC_STRESS_TESTS.md           # 7 real-world stress tests
├── IMPLEMENTATION_GUIDE.md             # How to build tests
├── COMPARISON_TO_HELLO_WORLD.md        # Relationship to existing tests
│
├── test-harness/                       # Implementation (to be built)
│   ├── lib/
│   │   ├── synthetic-agent.js          # Base agent class
│   │   ├── loop2-validator.js          # Loop 2 validator
│   │   ├── product-owner.js            # Product Owner agent
│   │   ├── orchestrator-wrapper.js     # Orchestrator integration
│   │   ├── redis-validator.js          # Redis state validation
│   │   └── metrics-collector.js        # Metrics aggregation
│   │
│   ├── scenarios/                      # Synthetic scenarios (1-10)
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
│   │
│   ├── stress-tests/                   # Realistic stress tests
│   │   ├── microservices-blast.js
│   │   ├── emergency-hotfix.js
│   │   ├── legacy-migration.js
│   │   ├── distributed-team.js
│   │   ├── chaos-monkey.js
│   │   ├── context-explosion.js
│   │   └── the-gauntlet.js
│   │
│   ├── run-all-scenarios.sh            # Execute all synthetic tests
│   ├── run-all-stress-tests.sh         # Execute all stress tests
│   └── validate-results.js             # Validate test outcomes
│
└── results/                            # Test results (auto-generated)
    ├── scenario-01.json
    ├── scenario-02.json
    ├── ...
    ├── stress-test-1.json
    └── combined-metrics.json
```

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 1)
**Goal:** Build test harness and validate core scenarios

- [ ] Build `synthetic-agent.js` base class
- [ ] Build `loop2-validator.js` and `product-owner.js`
- [ ] Build `orchestrator-wrapper.js`
- [ ] Implement Scenario 1 (Perfect Storm)
- [ ] Implement Scenario 2 (Gate Guardian)
- [ ] Implement Scenario 3 (Consensus Gridlock)

**Success:** 3 scenarios passing

---

### Phase 2: Iteration Patterns (Week 2)
**Goal:** Test iteration management

- [ ] Implement Scenario 4 (Marathon)
- [ ] Implement Scenario 5 (Sprint)
- [ ] Implement Scenario 6 (Rebel)

**Success:** 6 scenarios passing

---

### Phase 3: Edge Cases (Week 3)
**Goal:** Test limits and failures

- [ ] Implement Scenario 7 (Apocalypse)
- [ ] Implement Scenario 8 (Scalability)
- [ ] Implement Scenario 9 (Context Memory)
- [ ] Implement Scenario 10 (Simulator)

**Success:** All 10 scenarios passing

---

### Phase 4: Stress Tests (Week 4)
**Goal:** Find infrastructure breaking points

- [ ] Implement Stress Test 1 (Microservices Blast)
- [ ] Implement Stress Test 2 (Emergency Hotfix)
- [ ] Find scale limit (max parallel agents)
- [ ] Find speed limit (fastest iteration)

**Success:** Infrastructure limits documented

---

### Phase 5: Advanced Stress (Week 5)
**Goal:** Test realistic workflows and chaos

- [ ] Implement Stress Test 3 (Legacy Migration)
- [ ] Implement Stress Test 4 (Distributed Team)
- [ ] Implement Stress Test 5 (Chaos Monkey)
- [ ] Implement Stress Test 6 (Context Explosion)

**Success:** All stress tests passing

---

### Phase 6: The Gauntlet (Week 6)
**Goal:** Validate production-readiness

- [ ] Implement Stress Test 7 (The Gauntlet)
- [ ] Document all breaking points
- [ ] Fix critical infrastructure issues
- [ ] Re-run all tests
- [ ] Publish limits documentation

**Success:** Production-ready infrastructure

---

## 📊 Success Metrics

### Per-Test Metrics

```javascript
{
  "scenarioId": "01-perfect-storm",
  "success": true,
  "duration": 12500,  // ms
  "iterations": 1,
  "agentCount": 5,
  "confidence": { loop3: 0.935, loop2: 0.94 },
  "checks": {
    "gateEnforced": true,
    "consensusEnforced": true,
    "blpopBlocking": true,
    "zeroTokenWaiting": true
  }
}
```

### Aggregate Metrics

```javascript
{
  "totalScenarios": 10,
  "passed": 10,
  "failed": 0,
  "avgIterations": 2.5,
  "redisPerformance": {
    "avgBlpopLatency": 50,  // ms
    "maxBlpopLatency": 100
  }
}
```

---

## 🔍 Infrastructure Limits to Discover

### Questions to Answer

1. **Scale:** How many parallel agents? (Target: 25+)
2. **Speed:** Fastest iteration cycle? (Target: <2 minutes)
3. **Duration:** Longest BLPOP? (Target: 4+ hours)
4. **Context:** Max context bullets? (Target: 500+)
5. **Failures:** Max tolerable failure rate? (Target: <50%)
6. **Iterations:** Max iterations before instability? (Target: 20+)

### Current Infrastructure

**Known Capabilities:**
- ✅ Redis waiting mode (BLPOP-based)
- ✅ Orchestrator (orchestrate-cfn-loop.sh)
- ✅ Gate enforcement (≥0.75)
- ✅ Consensus enforcement (≥0.90)
- ✅ Product Owner integration
- ✅ Context propagation (SQLite + adaptive bullets)
- ✅ Zero-token waiting

**Unknown Limits:**
- ❓ Maximum parallel agents
- ❓ Maximum BLPOP duration
- ❓ Maximum context size
- ❓ Failure recovery capabilities
- ❓ Performance under stress

**Purpose of Tests:** Find these limits!

---

## 🎓 Key Concepts

### Gate Enforcement (Loop 3 Self-Validation)

**Rule:** Loop 3 agents must achieve avg confidence ≥0.75 before Loop 2 reviews

**Pattern:**
```bash
# Loop 3 agents report confidence
# Orchestrator calculates average
if (( $(echo "$GATE_AVG >= 0.75" | bc -l) )); then
  # Signal Loop 2 to start
  redis-cli lpush "swarm:${TASK_ID}:gate-passed" "pass"
else
  # Wake Loop 3 for iteration N+1
  wake_loop3_agents
fi
```

**Tests:** Scenarios 2, 4, 8

---

### Consensus Enforcement (Loop 2 Validation)

**Rule:** Loop 2 validators must achieve avg confidence ≥0.90 before completion

**Pattern:**
```bash
# Loop 2 validators report confidence
# Orchestrator calculates consensus
if (( $(echo "$CONSENSUS >= 0.90" | bc -l) )); then
  # Task complete (or signal Product Owner)
  redis-cli lpush "swarm:${TASK_ID}:consensus-reached" "complete"
else
  # Wake all agents for iteration N+1
  wake_all_agents
fi
```

**Tests:** Scenarios 3, 5, 10

---

### Zero-Token Waiting (BLPOP Coordination)

**Concept:** Agents block on Redis BLPOP instead of polling, consuming zero API tokens

**Pattern:**
```bash
# Agent enters waiting mode
redis-cli blpop "swarm:${TASK_ID}:wake:${AGENT_ID}" 0  # timeout=0 (infinite)

# Orchestrator wakes agent
redis-cli lpush "swarm:${TASK_ID}:wake:${AGENT_ID}" "wake"
```

**Benefits:**
- 🚀 Zero token cost while waiting
- ⚡ Instant wake-up (<100ms latency)
- 📈 Scalable (10+ agents)

**Tests:** All scenarios

---

### Product Owner Decision Authority

**Concept:** Product Owner has final say, can veto even if consensus passes

**Pattern:**
```bash
# Loop 2 consensus passes → signal Product Owner
redis-cli lpush "swarm:${TASK_ID}:consensus-reached" "complete"

# Product Owner makes decision
DECISION=$(redis-cli hget "swarm:${TASK_ID}:product-owner" "decision")

if [ "$DECISION" = "approve" ]; then
  echo "✅ Task complete"
else
  echo "❌ Product Owner vetoed - iterate"
  wake_all_agents
fi
```

**Tests:** Scenario 6

---

## 🤝 Contributing

### Adding New Scenarios

1. **Document in TEST_SCENARIOS.md or REALISTIC_STRESS_TESTS.md**
   - Define objective
   - Provide synthetic data
   - Specify expected behavior
   - List success criteria

2. **Implement in test-harness/scenarios/ or test-harness/stress-tests/**
   - Use synthetic agent library
   - Integrate with orchestrator
   - Collect metrics
   - Validate results

3. **Add to run script**
   - Update `run-all-scenarios.sh` or `run-all-stress-tests.sh`
   - Add to CI pipeline

---

## 📝 Notes

### Why Synthetic Agents?

**Deterministic:** No LLM calls = reproducible results
**Fast:** No API latency = rapid testing
**Configurable:** Confidence patterns defined upfront
**Affordable:** No API costs

**Trade-off:** Not testing actual agent logic, only orchestration

---

### Why Both Synthetic + Stress Tests?

**Synthetic (TEST_SCENARIOS.md):**
- Validate specific patterns in isolation
- Fast execution (<5 min per scenario)
- Clear pass/fail criteria
- Good for CI/CD

**Stress (REALISTIC_STRESS_TESTS.md):**
- Find infrastructure limits
- Real-world complexity
- Longer execution (minutes to hours)
- Discover edge cases

**Together:** Comprehensive coverage

---

## 📧 Questions?

Open an issue or see:
- `.claude/skills/redis-coordination/SKILL.md` - Redis coordination patterns
- `.claude/skills/cfn-loop-validation/SKILL.md` - CFN Loop validation
- `CLAUDE.md` - Overall project documentation

---

## 🎉 Summary

**17 Total Tests:**
- 10 Synthetic Scenarios (TEST_SCENARIOS.md)
- 7 Realistic Stress Tests (REALISTIC_STRESS_TESTS.md)

**Coverage:**
- ✅ Gate enforcement
- ✅ Consensus enforcement
- ✅ Zero-token waiting
- ✅ Product Owner authority
- ✅ Iteration management
- ✅ Context propagation
- ✅ Failure resilience
- ✅ Scale limits
- ✅ Speed limits
- ✅ Duration limits

**Status:** Planning complete, ready for implementation

**Next Step:** Build test harness (Phase 1, Week 1)

---

## 🎯 Epic Execution

### Epic Configuration File

**File:** `cfn-testing-epic.json`
**Total Tests:** 22 (10 synthetic + 7 stress + 3 real + 2 hybrid)
**Duration:** 8-12 hours

### Quick Start

```bash
# Run full epic (all 4 phases)
/cfn-loop-epic planning/cfn-testing/cfn-testing-epic.json

# Run individual phase
/cfn-loop-epic planning/cfn-testing/cfn-testing-epic.json --phase=phase-1-synthetic

# Validate results
node planning/cfn-testing/test-harness/validate-results.js --epic cfn-testing-epic-v1
```

### Phase Overview

| Phase | Tests | Duration | Pass Criteria |
|-------|-------|----------|---------------|
| 1. Synthetic Scenarios | 10 | 1-2 hours | 100% pass |
| 2. Stress Tests | 7 | 3-4 hours | ≥71% pass |
| 3. Real Agent Tests | 3 | 2-3 hours | ≥67% pass |
| 4. Hybrid Tests | 2 | 1-2 hours | ≥50% pass |

**See:** `EPIC_EXECUTION_GUIDE.md` for complete execution instructions
