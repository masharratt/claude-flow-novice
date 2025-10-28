# CFN Testing Epic - Execution Guide

**Epic:** CFN Loop Testing Suite - Complete Validation
**File:** `planning/cfn-testing/cfn-testing-epic.json`
**Total Tests:** 22 (10 synthetic + 7 stress + 3 real + 2 hybrid)
**Duration:** 8-12 hours

---

## Quick Start

### Prerequisites

```bash
# 1. Ensure Redis is running
redis-cli ping  # Should return "PONG"

# 2. Clean Redis keys from previous runs
redis-cli --scan --pattern "swarm:test-*" | xargs -r redis-cli del

# 3. Verify environment
cat .env | grep Z_AI_API_KEY  # For real agent tests

# 4. Install dependencies
npm install

# 5. Build test harness (first time only)
npm run build:test-harness
```

---

## Execution Options

### Option 1: Run Full Epic (Recommended First Time)

```bash
/cfn-loop-epic planning/cfn-testing/cfn-testing-epic.json
```

**What This Does:**
- Runs all 4 phases sequentially
- Phase 1: 10 synthetic scenarios (~1-2 hours)
- Phase 2: 7 stress tests (~3-4 hours)
- Phase 3: 3 real agent tests (~2-3 hours)
- Phase 4: 2 hybrid tests (~1-2 hours)
- Generates comprehensive metrics report
- Documents infrastructure limits

**When to Stop:**
- After Phase 1: If any synthetic tests fail (fix infrastructure first)
- After Phase 2: If >2 stress tests fail (tune performance)
- After Phase 3: If >1 real test fails (improve agent prompts)

---

### Option 2: Run Individual Phases

```bash
# Phase 1 only (synthetic scenarios)
/cfn-loop-epic planning/cfn-testing/cfn-testing-epic.json --phase=phase-1-synthetic

# Phase 2 only (stress tests)
/cfn-loop-epic planning/cfn-testing/cfn-testing-epic.json --phase=phase-2-stress

# Phase 3 only (real agents)
/cfn-loop-epic planning/cfn-testing/cfn-testing-epic.json --phase=phase-3-real-agents

# Phase 4 only (hybrid)
/cfn-loop-epic planning/cfn-testing/cfn-testing-epic.json --phase=phase-4-hybrid
```

**Recommended Progression:**
1. Run Phase 1 first → validate infrastructure
2. Fix any failures → re-run Phase 1 until 100% pass
3. Run Phase 2 → find limits
4. Run Phase 3 → validate agent quality
5. Run Phase 4 → validate mixed scenarios

---

### Option 3: Run Individual Tests

```bash
# Single synthetic test
node planning/cfn-testing/test-harness/scenarios/01-perfect-storm.js

# Single stress test
node planning/cfn-testing/test-harness/stress-tests/microservices-blast.js

# Single real agent test
node planning/cfn-testing/test-harness/real-agents/01-bug-fix.js

# Single hybrid test
node planning/cfn-testing/test-harness/hybrid/01-synthetic-loop3-real-loop2.js
```

**When to Use:**
- Debugging specific test failures
- Testing infrastructure changes
- Iterating on test implementations

---

## Phase Breakdown

### Phase 1: Synthetic Scenarios (1-2 hours)

**10 tests validating core infrastructure:**

| Test | Focus | Duration | Critical |
|------|-------|----------|----------|
| 01-perfect-storm | Happy path | 2 min | ✅ |
| 02-gate-guardian | Gate enforcement | 5 min | ✅ |
| 03-consensus-gridlock | Consensus enforcement | 5 min | ✅ |
| 04-marathon | Slow convergence | 10 min | ✅ |
| 05-sprint | Rapid iteration | 1 min | ✅ |
| 06-rebel | Product Owner veto | 3 min | ✅ |
| 07-apocalypse | Agent failures | 5 min | ✅ |
| 08-scalability | Many agents | 5 min | ✅ |
| 09-context-memory | Multi-phase | 20 min | ✅ |
| 10-simulator | Real workflow | 10 min | ✅ |

**Success Criteria:**
- ✅ All 10 pass (100%)
- ✅ Total time < 2 hours
- ✅ No infrastructure crashes
- ✅ Redis latency < 100ms

**If Any Fail:**
1. Check Redis is running
2. Check orchestrator logs
3. Verify BLPOP blocking
4. Fix infrastructure issues
5. Re-run Phase 1

---

### Phase 2: Stress Tests (3-4 hours)

**7 tests finding infrastructure limits:**

| Test | Limit Tested | Duration | Critical |
|------|--------------|----------|----------|
| stress-01-microservices | Scale (11 agents) | 10 min | ✅ |
| stress-02-emergency | Speed (< 5 min) | 3 min | ✅ |
| stress-03-migration | Duration (2 hours) | 2 hours | ⚪ |
| stress-04-distributed | BLPOP (20 min) | 45 min | ⚪ |
| stress-05-chaos | Failures (30%) | 10 min | ✅ |
| stress-06-context | Memory (550 bullets) | 30 min | ✅ |
| stress-07-gauntlet | All limits | 2 hours | ⚪ |

**Success Criteria:**
- ✅ At least 5/7 pass (71%)
- ✅ Limits documented
- ✅ Breaking points identified

**Expected Discoveries:**
- Max parallel agents: 25+
- Min iteration time: < 2 min
- Max BLPOP duration: 4+ hours
- Max context bullets: 500+
- Max failure rate: < 50%

---

### Phase 3: Real Agent Tests (2-3 hours)

**3 tests validating agent decision quality:**

| Test | Task | Duration | Critical |
|------|------|----------|----------|
| real-01-bug-fix | Fix auth token bug | 20-40 min | ✅ |
| real-02-feature | WebSocket heartbeat | 30-60 min | ✅ |
| real-03-distributed | Notification system | 45-90 min | ⚪ |

**Success Criteria:**
- ✅ At least 2/3 pass (67%)
- ✅ Real decisions validated
- ✅ Gate/consensus natural
- ✅ Iteration demonstrates improvement

**Important:**
- These use REAL LLM calls (costs $$$)
- Confidence NOT predetermined
- Iterations NOT predetermined
- Tests can fail if agent quality low

**If Tests Fail:**
- Check agent prompts
- Verify task clarity
- Review scope definitions
- Improve agent instructions

---

### Phase 4: Hybrid Tests (1-2 hours)

**2 tests validating mixed agent scenarios:**

| Test | Mix | Duration | Critical |
|------|-----|----------|----------|
| hybrid-01 | Synthetic Loop 3 + Real Loop 2 | 15-30 min | ⚪ |
| hybrid-02 | Real Loop 3 + Synthetic Loop 2 | 20-40 min | ⚪ |

**Success Criteria:**
- ✅ At least 1/2 pass (50%)
- ✅ Mixed coordination works

**Purpose:**
- Validate synthetic feedback is useful to real agents
- Validate real agents can work with synthetic implementation
- Test infrastructure with mixed scenarios

---

## Results & Metrics

### Result Files

```bash
# Epic-level results
cat planning/cfn-testing/results/epic-results.json

# Phase results
cat planning/cfn-testing/results/phase-1-synthetic-results.json
cat planning/cfn-testing/results/phase-2-stress-results.json
cat planning/cfn-testing/results/phase-3-real-agents-results.json
cat planning/cfn-testing/results/phase-4-hybrid-results.json

# Metrics report
cat planning/cfn-testing/results/metrics-report.json

# Infrastructure limits
cat planning/cfn-testing/results/infrastructure-limits.md
```

### Validation

```bash
# Validate all results
node planning/cfn-testing/test-harness/validate-results.js --epic cfn-testing-epic-v1

# Validate specific phase
node planning/cfn-testing/test-harness/validate-results.js --phase phase-1-synthetic

# Generate summary
node planning/cfn-testing/test-harness/generate-summary.js --epic cfn-testing-epic-v1
```

---

## Monitoring During Execution

### Real-Time Monitoring

```bash
# Watch Redis operations
redis-cli MONITOR

# Watch orchestrator logs
tail -f /tmp/orchestrator-*.log

# Watch agent logs
tail -f /tmp/agent-*.log

# Watch test progress
watch -n 1 'redis-cli keys "swarm:test-*" | wc -l'
```

### Health Checks

```bash
# Check Redis memory
redis-cli INFO memory | grep used_memory_human

# Check Redis latency
redis-cli --latency

# Check active agents
redis-cli keys "swarm:test-*:*:done" | wc -l

# Check failed tests
grep "❌" planning/cfn-testing/results/*.log
```

---

## Troubleshooting

### Common Issues

**1. Tests Timeout**
```bash
# Symptom: Agents hang in waiting mode
# Cause: No wake signals sent
# Fix: Check orchestrator is running
redis-cli keys "swarm:test-*:wake:*"
```

**2. Gate Never Passes**
```bash
# Symptom: Loop 2 blocked indefinitely
# Cause: Loop 3 confidence < 0.75
# Fix: Check confidence scores
redis-cli hgetall "swarm:test-123:confidence"
```

**3. Consensus Never Reached**
```bash
# Symptom: Iterations continue forever
# Cause: Loop 2 consensus < 0.90
# Fix: Check validator scores
redis-cli hgetall "swarm:test-123:confidence"
```

**4. Redis Connection Errors**
```bash
# Symptom: ECONNREFUSED
# Cause: Redis not running
# Fix: Start Redis
redis-server
```

**5. Real Agent Tests Fail**
```bash
# Symptom: Tests pass < 2/3
# Cause: Agent quality issues
# Fix: Review agent prompts, improve task descriptions
cat planning/cfn-testing/test-harness/real-agents/*.js
```

---

## Epic Success Definition

### Critical Success (Minimum Viable)

- ✅ **Phase 1:** All 10 synthetic tests pass (100%)
- ✅ **Phase 2:** At least 5/7 stress tests pass (71%)
- ✅ **Phase 3:** At least 2/3 real tests pass (67%)
- ✅ Infrastructure limits documented
- ✅ Zero critical bugs

**If This Passes:** Infrastructure is production-ready

---

### Desired Success (Ideal)

- ✅ **Phase 1:** All 10 synthetic tests pass (100%)
- ✅ **Phase 2:** All 7 stress tests pass (100%)
- ✅ **Phase 3:** All 3 real tests pass (100%)
- ✅ **Phase 4:** All 2 hybrid tests pass (100%)
- ✅ Infrastructure limits exceed targets
- ✅ No bugs found

**If This Passes:** Infrastructure is enterprise-ready

---

## Post-Epic Actions

### 1. Document Limits

```bash
# Generate limits report
node planning/cfn-testing/test-harness/generate-limits-report.js

# Output: planning/cfn-testing/results/infrastructure-limits.md
```

**Expected Limits:**
- Max parallel agents: 25-50
- Min iteration time: 1-2 minutes
- Max BLPOP duration: 4-8 hours
- Max context bullets: 500-1000
- Max failure rate: 30-50%
- Max iterations: 20-30

---

### 2. Fix Critical Issues

```bash
# Review failures
cat planning/cfn-testing/results/epic-results.json | jq '.failures'

# Fix infrastructure
vim .claude/skills/redis-coordination/orchestrate-cfn-loop.sh

# Re-run failed tests
/cfn-loop-epic planning/cfn-testing/cfn-testing-epic.json --rerun-failures
```

---

### 3. Integrate with CI/CD

```bash
# Add to GitHub Actions
cp planning/cfn-testing/.github/workflows/cfn-testing.yml .github/workflows/

# Run on PRs (Phase 1 only - fast)
# Run nightly (All phases - comprehensive)
```

**CI Configuration:**
- Phase 1: On every PR (< 2 hours)
- Phase 2: Nightly (find regressions)
- Phase 3: Weekly (validate agent quality)
- Phase 4: As needed (validate changes)

---

### 4. Publish Results

```bash
# Generate public report
node planning/cfn-testing/test-harness/generate-public-report.js

# Output: planning/cfn-testing/results/PUBLIC_REPORT.md

# Share:
# - Infrastructure limits
# - Test coverage
# - Production readiness status
```

---

## Timeline & Milestones

### Week 1: Build Test Harness
- [ ] Implement synthetic agent library
- [ ] Implement orchestrator wrapper
- [ ] Implement Redis validators
- [ ] Implement metrics collector

### Week 2: Phase 1 Implementation
- [ ] Implement scenarios 1-5
- [ ] Implement scenarios 6-10
- [ ] Run Phase 1
- [ ] Fix failures, achieve 100% pass

### Week 3: Phase 2 Implementation
- [ ] Implement stress tests 1-4
- [ ] Implement stress tests 5-7
- [ ] Run Phase 2
- [ ] Document limits

### Week 4: Phase 3 Implementation
- [ ] Implement real agent tests 1-3
- [ ] Run Phase 3
- [ ] Validate agent quality

### Week 5: Phase 4 & Integration
- [ ] Implement hybrid tests 1-2
- [ ] Run full epic
- [ ] Fix critical issues
- [ ] Publish results

### Week 6: Production Readiness
- [ ] CI/CD integration
- [ ] Documentation complete
- [ ] Public report published
- [ ] Infrastructure certified

---

## Cost Estimates

### Synthetic Tests (Phase 1)
- **API Calls:** 0 (no LLM calls)
- **Cost:** $0
- **Duration:** 1-2 hours

### Stress Tests (Phase 2)
- **API Calls:** 0 (no LLM calls)
- **Cost:** $0
- **Duration:** 3-4 hours

### Real Agent Tests (Phase 3)
- **API Calls:** 50-100 (depends on iterations)
- **Tokens:** ~500K-1M total
- **Cost:** ~$2-10 (Z.ai pricing)
- **Duration:** 2-3 hours

### Hybrid Tests (Phase 4)
- **API Calls:** 10-20
- **Tokens:** ~100K-200K
- **Cost:** ~$0.50-2
- **Duration:** 1-2 hours

**Total Cost:** ~$2.50-12 per full epic run

**CI/CD Costs:**
- Daily Phase 1: $0/day
- Weekly Phase 3: ~$10/week
- Monthly full epic: ~$50/month

---

## Next Steps

1. **Review Epic Configuration**
   ```bash
   cat planning/cfn-testing/cfn-testing-epic.json | jq .
   ```

2. **Build Test Harness** (see IMPLEMENTATION_GUIDE.md)
   ```bash
   cd planning/cfn-testing/test-harness
   npm install
   npm run build
   ```

3. **Run Phase 1** (validate infrastructure)
   ```bash
   /cfn-loop-epic planning/cfn-testing/cfn-testing-epic.json --phase=phase-1-synthetic
   ```

4. **Review Results**
   ```bash
   cat planning/cfn-testing/results/phase-1-synthetic-results.json | jq .
   ```

5. **Iterate Until 100% Pass**

6. **Move to Phase 2** (find limits)

7. **Complete All Phases**

8. **Publish Results**

---

## Questions?

**See:**
- `README.md` - Complete overview
- `TEST_SCENARIOS.md` - Synthetic scenarios details
- `REALISTIC_STRESS_TESTS.md` - Stress tests details
- `IMPLEMENTATION_GUIDE.md` - How to build tests
- `QUICK_REFERENCE.md` - Cheat sheet

**Or run:**
```bash
/help cfn-testing
```
