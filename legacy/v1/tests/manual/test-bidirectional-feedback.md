# Test: Bidirectional Feedback Loop (Coder ↔ Reviewer)

**Test ID**: redis-coord-test-bidirectional
**Date**: 2025-10-16 (Initial), 2025-10-17 (Retest)
**Objective**: Validate bidirectional feedback pattern where same agents iterate back-and-forth
**Status**: ✅ **PASS** (After Retest)

---

## Test Results Summary

### Initial Test (2025-10-16)
- **Status**: ⚠️ PARTIAL SUCCESS
- **Issue**: Agents simulated bash commands, leftover messages in queues
- **Finding**: Pattern mechanically valid but execution fidelity low

### Retest (2025-10-17)
- **Status**: ✅ **FULL SUCCESS**
- **Change**: Provided explicit step-by-step bash command examples in agent prompts
- **Results**:
  - ✅ Final confidence: 0.85
  - ✅ Reviewer decision: approved
  - ✅ Iterations: 2
  - ✅ Status: complete
  - ✅ Coder done queue: 0 (all consumed)
  - ✅ Feedback queue: 0 (all consumed)

**Key Discovery**: Task-spawned agents execute bash correctly when given explicit command examples, not just pattern descriptions.

---

## Test Scenario

**Pattern**: Coder and Reviewer stay alive, pass messages back and forth until work is approved

```
Iteration 1:
Coder → Reviewer: "Here's my code" (confidence 0.65)
Reviewer → Coder: "Needs fixes: missing error handling"

Iteration 2:
Coder → Reviewer: "Fixed code" (confidence 0.85)
Reviewer → Coder: "Approved!"

Both agents exit together
```

---

## Architecture

```
Coder Agent (loops)
  ↓
  Sends: redis-cli lpush "swarm:bidirectional:coder:done" (work result)
  ↓
  Waits: redis-cli blpop "swarm:bidirectional:coder:feedback" (reviewer decision)
  ↓
  If approved: exit
  If needs_fixes: loop again (max 3 iterations)

Reviewer Agent (loops)
  ↓
  Waits: redis-cli blpop "swarm:bidirectional:coder:done" (coder work)
  ↓
  Reviews work
  ↓
  Sends: redis-cli lpush "swarm:bidirectional:coder:feedback" (decision + feedback)
  ↓
  If approved: exit
  If needs_fixes: loop again (max 3 iterations)
```

---

## Expected Results

### Success Criteria
- ✅ Coder produces low-quality work (iteration 1)
- ✅ Reviewer sends feedback via Redis
- ✅ Coder receives feedback and improves work (iteration 2)
- ✅ Reviewer approves improved work
- ✅ Both agents exit successfully
- ✅ Total iterations ≤ 3

### Redis State Verification
```bash
# After test completes
redis-cli get "swarm:bidirectional:coder:final_confidence"  # Expect: 0.85+
redis-cli get "swarm:bidirectional:reviewer:decision"       # Expect: "approved"
redis-cli get "swarm:bidirectional:iterations"              # Expect: 2
redis-cli get "swarm:bidirectional:status"                  # Expect: "complete"
```

---

## Test Implementation

### Coder Agent (Bidirectional Mode)

```javascript
const coderBidirectional = async () => {
  const maxIterations = 3;
  let iteration = 1;
  let approved = false;

  console.log('🔵 Coder: Starting bidirectional mode');

  while (iteration <= maxIterations && !approved) {
    console.log(`\n--- Iteration ${iteration} ---`);

    // Simulate work (intentionally low quality on iteration 1)
    const confidence = iteration === 1 ? 0.65 : 0.85;
    const work = {
      code: `function authenticate() { ${iteration === 1 ? '// TODO: add error handling' : 'try { /* proper error handling */ } catch(e) { /* handle */ }'} }`,
      confidence,
      iteration,
      timestamp: Date.now()
    };

    console.log(`Coder: Completed work with confidence ${confidence}`);

    // Send work to reviewer
    await bash(`redis-cli lpush "swarm:bidirectional:coder:done" '${JSON.stringify(work)}'`);
    console.log('Coder: Sent work to reviewer');

    // Wait for reviewer feedback (30 second timeout)
    console.log('Coder: Waiting for reviewer feedback...');
    const feedbackRaw = await bash(`timeout 30 redis-cli --csv blpop "swarm:bidirectional:coder:feedback" 0`);

    if (!feedbackRaw || feedbackRaw.includes('(nil)')) {
      console.log('❌ Coder: Timeout waiting for feedback');
      await bash(`redis-cli set "swarm:bidirectional:status" "timeout"`);
      return;
    }

    // Parse feedback (CSV format: "channel","json_data")
    const feedbackJson = feedbackRaw.split(',')[1].replace(/^"|"$/g, '');
    const feedback = JSON.parse(feedbackJson);

    console.log(`Coder: Received feedback:`, feedback);

    if (feedback.status === 'approved') {
      console.log('✅ Coder: Work approved!');
      approved = true;
      await bash(`redis-cli set "swarm:bidirectional:coder:final_confidence" "${confidence}"`);
      await bash(`redis-cli set "swarm:bidirectional:status" "complete"`);
    } else {
      console.log(`⚠️ Coder: Needs fixes - ${feedback.feedback}`);
      iteration++;
    }
  }

  if (!approved) {
    console.log('❌ Coder: Max iterations reached without approval');
    await bash(`redis-cli set "swarm:bidirectional:status" "max_iterations"`);
  }

  await bash(`redis-cli set "swarm:bidirectional:iterations" "${iteration}"`);
  console.log('🔵 Coder: Exiting bidirectional mode');
};
```

### Reviewer Agent (Bidirectional Mode)

```javascript
const reviewerBidirectional = async () => {
  const maxIterations = 3;
  let iteration = 1;
  let approved = false;

  console.log('🟢 Reviewer: Starting bidirectional mode');

  while (iteration <= maxIterations && !approved) {
    console.log(`\n--- Reviewer Iteration ${iteration} ---`);

    // Wait for coder work (30 second timeout)
    console.log('Reviewer: Waiting for coder work...');
    const workRaw = await bash(`timeout 30 redis-cli --csv blpop "swarm:bidirectional:coder:done" 0`);

    if (!workRaw || workRaw.includes('(nil)')) {
      console.log('❌ Reviewer: Timeout waiting for work');
      await bash(`redis-cli set "swarm:bidirectional:status" "timeout"`);
      return;
    }

    // Parse work (CSV format: "channel","json_data")
    const workJson = workRaw.split(',')[1].replace(/^"|"$/g, '');
    const work = JSON.parse(workJson);

    console.log(`Reviewer: Received work with confidence ${work.confidence}`);

    // Review work
    const review = {
      status: work.confidence >= 0.75 ? 'approved' : 'needs_fixes',
      feedback: work.confidence >= 0.75
        ? 'Code looks good - error handling present'
        : 'Missing error handling in authenticate function',
      confidence: work.confidence,
      iteration,
      timestamp: Date.now()
    };

    console.log(`Reviewer: Review decision - ${review.status}`);

    // Send feedback to coder
    await bash(`redis-cli lpush "swarm:bidirectional:coder:feedback" '${JSON.stringify(review)}'`);
    console.log('Reviewer: Sent feedback to coder');

    if (review.status === 'approved') {
      console.log('✅ Reviewer: Approved work');
      approved = true;
      await bash(`redis-cli set "swarm:bidirectional:reviewer:decision" "approved"`);
    } else {
      console.log('⚠️ Reviewer: Requesting fixes');
      iteration++;
    }
  }

  if (!approved) {
    console.log('❌ Reviewer: Max iterations reached without approval');
    await bash(`redis-cli set "swarm:bidirectional:reviewer:decision" "max_iterations"`);
  }

  console.log('🟢 Reviewer: Exiting bidirectional mode');
};
```

---

## Execution Steps

### 1. Clear Redis State

```bash
redis-cli del "swarm:bidirectional:coder:done"
redis-cli del "swarm:bidirectional:coder:feedback"
redis-cli del "swarm:bidirectional:coder:final_confidence"
redis-cli del "swarm:bidirectional:reviewer:decision"
redis-cli del "swarm:bidirectional:iterations"
redis-cli del "swarm:bidirectional:status"
```

### 2. Spawn Agents in Parallel

```javascript
// Spawn both agents simultaneously (they coordinate via Redis)
await Promise.all([
  Task('coder', coderBidirectionalPrompt, 'coder'),
  Task('reviewer', reviewerBidirectionalPrompt, 'reviewer')
]);
```

### 3. Verify Results

```bash
echo "=== Bidirectional Feedback Test Results ==="
echo "Final confidence: $(redis-cli get "swarm:bidirectional:coder:final_confidence")"
echo "Reviewer decision: $(redis-cli get "swarm:bidirectional:reviewer:decision")"
echo "Iterations: $(redis-cli get "swarm:bidirectional:iterations")"
echo "Status: $(redis-cli get "swarm:bidirectional:status")"

# Verify channels empty (all messages consumed)
echo "Coder done queue: $(redis-cli llen "swarm:bidirectional:coder:done")"
echo "Coder feedback queue: $(redis-cli llen "swarm:bidirectional:coder:feedback")"
```

---

## Risk Assessment

### Potential Issues

**1. Deadlock Risk**
- **Scenario**: Coder sends work, exits before reviewer can respond
- **Mitigation**: Both agents use timeouts (30s), write error states

**2. Message Ordering**
- **Scenario**: Messages arrive out of order
- **Mitigation**: Include iteration numbers in messages

**3. Timeout Tuning**
- **Scenario**: 30s too short for agent processing
- **Mitigation**: Monitor actual timing, adjust if needed

**4. Silent Execution**
- **Scenario**: Can't see agent console output
- **Mitigation**: Verify via Redis state markers

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Iterations** | 2 | `redis-cli get "swarm:bidirectional:iterations"` |
| **Final Confidence** | ≥0.85 | `redis-cli get "swarm:bidirectional:coder:final_confidence"` |
| **Approval** | "approved" | `redis-cli get "swarm:bidirectional:reviewer:decision"` |
| **Status** | "complete" | `redis-cli get "swarm:bidirectional:status"` |
| **Message Consumption** | 0 remaining | `redis-cli llen` on both channels |

---

## Next Steps

If test PASSES:
- ✅ Bidirectional pattern validated
- ✅ Can implement in coordinators for cost savings
- ✅ Document pattern in `.claude/templates/redis-coordination.md`

If test FAILS:
- ❌ Current "spawn new agent" approach is correct
- ❌ Bidirectional too complex for marginal benefit
- ❌ Stick with stateless agent spawning
