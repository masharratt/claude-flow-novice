# CFN Loop Tests - Quick Reference Card

One-page overview of all 17 test scenarios.

---

## Synthetic Scenarios (10)

| # | Name | Focus | Agents | Iterations | Duration | Key Validation |
|---|------|-------|--------|------------|----------|----------------|
| 1 | Perfect Storm | Happy path | 5 | 1 | 2 min | Zero iterations |
| 2 | Gate Guardian | Gate enforcement | 6 | 3 | 5 min | Loop 2 blocked until gate |
| 3 | Consensus Gridlock | Consensus enforcement | 6 | 3 | 5 min | Full iteration cycle |
| 4 | Marathon | Slow convergence | 8 | 6 | 10 min | Long BLPOP (5 cycles) |
| 5 | Sprint | Rapid iteration | 5 | 10 | 1 min | Speed stress test |
| 6 | Rebel | Product Owner veto | 5 | 2 | 3 min | Decision authority |
| 7 | Apocalypse | Partial failures | 8 | 2 | 5 min | Error handling |
| 8 | Scalability | Many agents | 16 | 2 | 5 min | Scale (10+ agents) |
| 9 | Context Memory | Multi-phase epic | 12 | 4 | 20 min | Context propagation |
| 10 | Simulator | Real feature | 7 | 2 | 10 min | End-to-end workflow |

---

## Realistic Stress Tests (7)

| # | Name | Real-World Task | Stress Factor | Limit Tested | Duration |
|---|------|----------------|---------------|--------------|----------|
| 1 | Microservices Blast | Auth across 5 services | Scale + Parallelism | 11 agents, 5 parallel | 10 min |
| 2 | Emergency Hotfix | Critical security fix | Speed + Pressure | <5 min total | 3 min |
| 3 | Legacy Migration | Monolith → microservices | Duration + Context | 2+ hours, 550 bullets | 2 hours |
| 4 | Distributed Team | Human-agent collaboration | Long BLPOP | 20+ min delays | 45 min |
| 5 | Chaos Monkey | Random failures | Failure Resilience | 30% crash rate | 10 min |
| 6 | Context Explosion | Large refactor | Memory + SQLite | 550+ bullets | 30 min |
| 7 | The Gauntlet | Everything combined | ALL LIMITS | Everything | 2 hours |

---

## Test Execution Commands

```bash
# Single synthetic scenario
node planning/cfn-testing/test-harness/scenarios/01-perfect-storm.js

# All synthetic scenarios
./planning/cfn-testing/test-harness/run-all-scenarios.sh

# Single stress test
node planning/cfn-testing/test-harness/stress-tests/microservices-blast.js

# All stress tests
./planning/cfn-testing/test-harness/run-all-stress-tests.sh

# Validate results
node planning/cfn-testing/test-harness/validate-results.js --all
```

---

## Success Criteria Quick Reference

### Synthetic Scenarios

| Scenario | Iterations | Gate Passes | Consensus | PO Decision | Special Check |
|----------|------------|-------------|-----------|-------------|---------------|
| 1 | 1 | 1 | ✅ | Approve | Loop 2 blocked once |
| 2 | 3 | 1 | ✅ | Approve | Loop 2 blocked 3 cycles |
| 3 | 3 | 3 | ✅ | Approve | All agents wake 2x |
| 4 | 6 | 1 | ✅ | Approve | Loop 2 blocked 5 cycles |
| 5 | 10 | 1 | ✅ | Approve | <60s total time |
| 6 | 2 | 2 | ✅ (iter 2) | Approve (iter 2) | Veto in iter 1 |
| 7 | 2 | 2 | ✅ | Approve | 4 failed agents detected |
| 8 | 2 | 2 | ✅ | Approve | 10+ agents coordinated |
| 9 | 4 | 4 | ✅ | Approve | 50+ context bullets |
| 10 | 2 | 2 | ✅ | Approve | Realistic feedback |

### Stress Tests

| Test | Max Agents | Max Iterations | Max Duration | Max Context | Failure Rate | Breaking Point |
|------|------------|----------------|--------------|-------------|--------------|----------------|
| 1 | 11 | 2 | 10 min | 50 | 0% | Find max parallel agents |
| 2 | 6 | 2 | 3 min | 20 | 0% | Find min iteration time |
| 3 | 20 | 13 | 2 hours | 550 | 0% | Find max duration/context |
| 4 | 7 | 2 | 45 min | 30 | 0% | Find max BLPOP duration |
| 5 | 6 | 2 | 10 min | 20 | 30% | Find max tolerable failure |
| 6 | 10 | 4 | 30 min | 550 | 0% | Find max context size |
| 7 | 25 | 15 | 2 hours | 350 | 30% | Find overall limit |

---

## Infrastructure Checklist

### Before Running Tests

- [ ] Redis running (`redis-cli ping`)
- [ ] Redis keys cleaned (`redis-cli flushall` or pattern delete)
- [ ] Z.ai API key configured (`.env`)
- [ ] Node.js installed (`node --version`)
- [ ] NPM packages installed (`npm install`)

### After Running Tests

- [ ] Check Redis keys: `redis-cli keys "swarm:test-*"`
- [ ] Inspect results: `cat planning/cfn-testing/results/*.json`
- [ ] Validate metrics: `node planning/cfn-testing/test-harness/validate-results.js --all`
- [ ] Clean up: `redis-cli --scan --pattern "swarm:test-*" | xargs redis-cli del`

---

## Common Validation Checks

```bash
# Check confidence scores
redis-cli hgetall "swarm:test-123:confidence"

# Check wake signals
redis-cli lrange "swarm:test-123:wake:coder" 0 -1

# Check gate pass signal
redis-cli llen "swarm:test-123:gate-passed"

# Check Product Owner decision
redis-cli hget "swarm:test-123:product-owner" "decision"

# Check timeline
redis-cli lrange "swarm:test-123:timeline" 0 -1
```

---

## Expected Metrics Ranges

### Performance

| Metric | Good | Acceptable | Needs Investigation |
|--------|------|------------|---------------------|
| BLPOP latency | <50ms | <100ms | >100ms |
| Wake signal latency | <50ms | <100ms | >100ms |
| Iteration duration | <2 min | <5 min | >5 min |
| SQLite query time | <0.5s | <1s | >1s |
| Redis memory | <100MB | <500MB | >500MB |

### Reliability

| Metric | Target | Minimum | Failure Threshold |
|--------|--------|---------|-------------------|
| Test pass rate | 100% | 90% | <80% |
| Agent completion rate | 100% | 95% | <90% |
| Gate enforcement accuracy | 100% | 100% | <100% |
| Consensus accuracy | 100% | 100% | <100% |
| Context retrieval accuracy | 100% | 98% | <95% |

---

## Troubleshooting Quick Guide

### Agents Timeout

**Symptom:** Agents hang in waiting mode
**Cause:** No coordinator or wake signals not sent
**Fix:** Verify orchestrator is running, check Redis keys

### Gate Never Passes

**Symptom:** Loop 2 blocked indefinitely
**Cause:** Loop 3 confidence < 0.75
**Fix:** Check Loop 3 confidence scores, adjust pattern

### Consensus Never Reaches

**Symptom:** Iterations continue indefinitely
**Cause:** Loop 2 consensus < 0.90
**Fix:** Check Loop 2 confidence scores, increase values

### Redis Connection Errors

**Symptom:** "ECONNREFUSED" errors
**Cause:** Redis not running or wrong host
**Fix:** Start Redis, verify connection string

### Context Not Propagating

**Symptom:** Agents missing previous phase context
**Cause:** SQLite not storing or retrieving correctly
**Fix:** Check SQLite database, verify context injection

---

## Test Progression Strategy

### Week 1 (Foundation)
- Run scenarios 1-3
- Validate core orchestration
- Fix critical bugs

### Week 2 (Iteration Management)
- Run scenarios 4-6
- Validate iteration patterns
- Tune performance

### Week 3 (Edge Cases)
- Run scenarios 7-10
- Validate error handling
- Document limits

### Week 4 (Stress Testing)
- Run stress tests 1-2
- Find scale/speed limits
- Optimize infrastructure

### Week 5 (Advanced Stress)
- Run stress tests 3-6
- Find context/duration limits
- Fix performance issues

### Week 6 (Validation)
- Run stress test 7 (Gauntlet)
- Document all limits
- Publish results

---

## Key Metrics to Track

### Per-Scenario Metrics

```javascript
{
  scenarioId: "01-perfect-storm",
  passed: true,
  duration: 12500,
  iterations: 1,
  agentCount: 5,
  loop3Confidence: 0.935,
  loop2Confidence: 0.94,
  gateEnforced: true,
  consensusEnforced: true,
  blpopBlocking: true,
  zeroTokenWaiting: true
}
```

### Aggregate Metrics

```javascript
{
  totalTests: 17,
  syntheticPassed: 10,
  stressPassed: 7,
  avgDuration: 15000,
  avgIterations: 3.2,
  maxAgents: 25,
  maxContext: 550,
  redisAvgLatency: 45,
  sqliteAvgQueryTime: 650
}
```

---

## Infrastructure Limits (To Be Discovered)

| Limit | Target | Actual | Status |
|-------|--------|--------|--------|
| Max parallel agents | 25+ | ??? | 🔍 Testing |
| Min iteration time | <2 min | ??? | 🔍 Testing |
| Max BLPOP duration | 4+ hours | ??? | 🔍 Testing |
| Max context bullets | 500+ | ??? | 🔍 Testing |
| Max tolerable failure rate | <50% | ??? | 🔍 Testing |
| Max iterations | 20+ | ??? | 🔍 Testing |

**Purpose of tests:** Fill in the "???" with actual numbers!

---

## Quick Decision Tree

**Need to test basic orchestration?**
→ Run Scenarios 1-3 (Perfect Storm, Gate Guardian, Consensus)

**Need to test iteration management?**
→ Run Scenarios 4-6 (Marathon, Sprint, Rebel)

**Need to test error handling?**
→ Run Scenario 7 (Apocalypse) + Stress Test 5 (Chaos Monkey)

**Need to find scale limits?**
→ Run Scenario 8 (Scalability) + Stress Test 1 (Microservices)

**Need to test context propagation?**
→ Run Scenario 9 (Context Memory) + Stress Test 6 (Context Explosion)

**Need to validate production-readiness?**
→ Run Scenario 10 (Simulator) + Stress Test 7 (Gauntlet)

**Need to find infrastructure breaking points?**
→ Run ALL stress tests

---

## Success Definition

### Scenario Success
- ✅ Expected iterations achieved
- ✅ Gate/consensus enforced correctly
- ✅ BLPOP blocking verified
- ✅ Zero-token waiting confirmed
- ✅ Product Owner decision enforced (if applicable)
- ✅ Duration within acceptable range

### Stress Test Success
- ✅ Completes without crashes
- ✅ Breaking point identified (if limit test)
- ✅ Metrics collected
- ✅ Infrastructure stable
- ✅ Performance within acceptable range

### Overall Suite Success
- ✅ All 10 synthetic scenarios passing
- ✅ All 7 stress tests passing
- ✅ Infrastructure limits documented
- ✅ No critical bugs
- ✅ Production-ready

---

## Files Reference

| File | Purpose |
|------|---------|
| TEST_SCENARIOS.md | 10 synthetic scenarios |
| REALISTIC_STRESS_TESTS.md | 7 stress tests |
| IMPLEMENTATION_GUIDE.md | How to build tests |
| COMPARISON_TO_HELLO_WORLD.md | Relationship to existing tests |
| README.md | Complete overview |
| QUICK_REFERENCE.md | This file |

**Total:** 6 planning documents, 17 test scenarios, comprehensive coverage
