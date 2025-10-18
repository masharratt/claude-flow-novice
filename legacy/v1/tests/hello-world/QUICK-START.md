# Hello World Coordination Tests - Quick Start

## Two Test Types Available

### Test 1: Coordination Planning Test (Simple)
**File:** `hello-world-test.md`
**Purpose:** Validate coordinator's planning and script generation
**Complexity:** Low
**Duration:** < 10 seconds
**Agents:** 0 spawned (planning only)

```bash
# Run the simple test
Task(coordinator, "Execute hello-world-test.md requirements")
```

**What it validates:**
- Assignment matrix generation
- Zero overlap planning
- Redis script generation
- Validation tool creation

---

### Test 2: Mesh Coordination Test (Advanced)
**File:** `hello-world-mesh-coordination-test.md`
**Purpose:** Validate real coordinator communication and hierarchical spawning
**Complexity:** High (3 layers)
**Duration:** ~15 minutes per layer
**Agents:** 72-83+ spawned

```bash
# Run Layer 1 only
node tests/manual/test-layer1-mesh-coordination.js

# Run all layers sequentially
bash run-all-layers.sh
```

**What it validates:**
- Real coordinator-to-coordinator communication via Redis pub/sub
- Mesh topology (peer coordinators)
- Hierarchical agent spawning (coordinator → sub-agents)
- Dynamic resource management
- Error handling and retry loops
- Complete coordination audit trails

---

## Test Comparison

| Feature | Planning Test | Mesh Coordination Test |
|---------|---------------|------------------------|
| **Coordinators** | 1 | 2-3 (mesh) |
| **Sub-agents** | 0 (planned) | 70-83+ (spawned) |
| **Communication** | None | Redis pub/sub |
| **Files Written** | Scripts only | 70 Hello World programs |
| **Validation** | Script correctness | Real coordination logs |
| **Duration** | < 10 seconds | ~15 min per layer |
| **Complexity** | Low | High |
| **Purpose** | Planning ability | Real coordination |

---

## When to Use Each Test

### Use Planning Test When:
- ✅ Validating coordinator's planning capabilities
- ✅ Testing assignment matrix generation
- ✅ Quick validation needed
- ✅ Testing script generation logic
- ✅ Resource-constrained environment

### Use Mesh Coordination Test When:
- ✅ Validating real agent coordination
- ✅ Testing mesh topology
- ✅ Testing hierarchical spawning
- ✅ Validating communication protocols
- ✅ Testing error handling and retries
- ✅ Full integration test needed
- ✅ Production readiness validation

---

## Layer-by-Layer Guide

### Layer 1: Mesh Coordination (Foundation)

**Goal:** 2 coordinators negotiate and spawn 35 agents each

**Success:**
- 72 agents (2 coordinators + 70 sub-agents)
- Zero overlap via Redis pub/sub claims
- 70 files written to disk
- Full coordination logs

**Run:**
```bash
node tests/manual/test-layer1-mesh-coordination.js
```

**Validate:**
```bash
node validate-layer1-coordination.js
# Check: Claims, spawns, files, coordination logs
```

---

### Layer 2: Review Coordination (Add Complexity)

**Goal:** Add 3rd coordinator managing dynamic reviewer pool

**Success:**
- 73+ agents (3 coordinators + 70 coders + 3-10 reviewers)
- All 70 implementations reviewed
- Dynamic reviewer spawning based on queue
- Resource constraints respected

**Run:**
```bash
node tests/manual/test-layer2-review-coordination.js
```

**Validate:**
```bash
node validate-layer2-reviews.js
# Check: Reviews, reviewer spawning, resource limits
```

---

### Layer 3: Error Handling (Real-World Simulation)

**Goal:** Test error injection, re-coordination, and retry loops

**Success:**
- ~50% initial failures (random errors)
- All error types present
- Re-review loops work
- ALL 70 eventually pass
- Max 10 retries per implementation

**Run:**
```bash
node tests/manual/test-layer3-error-retry.js
```

**Validate:**
```bash
node validate-layer3-retries.js
# Check: Error types, retry counts, final success rate
```

---

## Quick Validation Commands

### Check Coordination Happened
```bash
# View coordinator communication
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning keys "coordination:messages:*" | wc -l
# Expected: > 70

# View claims
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning keys "coordination:claims:*" | wc -l
# Expected: > 70

# View timeline
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning get "coordination:timeline" | jq .
```

### Check Files Written
```bash
# Count Hello World programs
ls output/hello-world/*.{js,py,rs,go,java,ts,rb} 2>/dev/null | wc -l
# Expected: 70

# Check reviews (Layer 2+)
ls output/hello-world/reviews/*.json 2>/dev/null | wc -l
# Expected: 70+
```

### Check Agent Count
```bash
# Count active agents (during test)
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning keys "coordination:agent:*:status" | wc -l

# Count reviewers (Layer 2+)
redis-cli -a "$REDIS_PASSWORD" --no-auth-warning get "coordination:review:reviewers:active" | jq 'length'
# Expected: 3-10
```

---

## Troubleshooting

### Layer 1 Issues

**Problem:** Coordinators claiming same combinations
**Solution:** Check Redis pub/sub connection, verify 100ms conflict window

**Problem:** Unbalanced load (not 35 each)
**Solution:** Verify claim logic, check coordination logs for claim distribution

**Problem:** Files not written
**Solution:** Check agent completion status, verify output directory exists

### Layer 2 Issues

**Problem:** Reviewers not spawning
**Solution:** Check resource constraints, verify queue threshold (>5)

**Problem:** Review queue stuck
**Solution:** Check reviewer availability, verify resource limits not hit

**Problem:** Reviews not completing
**Solution:** Check reviewer agent logs, verify file paths correct

### Layer 3 Issues

**Problem:** No errors injected
**Solution:** Verify error injection logic (50% random), check error type distribution

**Problem:** Retry loops infinite
**Solution:** Check max retry limit (10), verify fresh agent spawning

**Problem:** Files not passing review
**Solution:** Check error injection vs fix logic, verify reviewers checking correctly

---

## Expected Test Output

### Successful Layer 1 Output
```
=== Layer 1: Mesh Coordination ===
✅ Coordinator-A spawned
✅ Coordinator-B spawned
✅ Coordinators established mesh connection
✅ Claims negotiated: 70 (35 each, 0 conflicts)
✅ Sub-agents spawned: 70 (35 each)
✅ Files written: 70
✅ Validation: PASS
Duration: 3m 24s
```

### Successful Layer 2 Output
```
=== Layer 2: Review Coordination ===
✅ Review-Coordinator added to mesh
✅ Reviewers spawned: 7 (dynamic, max 10)
✅ Reviews completed: 70/70
✅ Queue max length: 8
✅ Resource constraints respected
✅ Validation: PASS
Duration: 5m 12s
```

### Successful Layer 3 Output
```
=== Layer 3: Error Handling ===
✅ Initial failures: 36/70 (51%)
✅ Error types: Syntax(12), Logic(11), Translation(10), Mixed(3)
✅ Retries: Total 89, Max per file: 4
✅ Fresh agents: 89 spawned for retries
✅ Final pass rate: 70/70 (100%)
✅ Validation: PASS
Duration: 8m 47s

=== OVERALL TEST: PASS ===
Total agents: 232 (3 coordinators + 140 coders + 89 retries)
Total duration: 17m 23s
```

---

## Next Steps After Passing

### Once All Layers Pass:

1. **Production Readiness**
   - Coordinators proven to communicate effectively
   - Hierarchical spawning validated
   - Error handling robust

2. **Scale Up Tests**
   - Increase to 200 combinations (10x20)
   - Add 4th coordinator
   - Test with 200+ agents

3. **Real Projects**
   - Apply mesh coordination to actual projects
   - Use for CFN Loop implementation
   - Deploy for production multi-agent tasks

4. **Performance Tuning**
   - Optimize claim negotiation speed
   - Reduce reviewer spawn latency
   - Improve retry efficiency
