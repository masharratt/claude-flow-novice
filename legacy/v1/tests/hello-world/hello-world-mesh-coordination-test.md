# Hello World Mesh Coordination Test - 3 Layers

## Overview

This test validates real coordinator-to-coordinator communication and hierarchical agent spawning through increasingly complex coordination scenarios.

**Test Philosophy:** Coordinators must actually communicate and coordinate, not just generate assignment scripts. All coordination must happen through Redis pub/sub messaging with full audit trails.

---

## Layer 1: Mesh Coordination with Hierarchical Sub-agents

### Objective
Test mesh coordination between 2 peer coordinators, each managing 35 sub-agents hierarchically.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MESH COORDINATION LAYER                      │
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────┐            │
│  │  Coordinator-A   │ ←─────→ │  Coordinator-B   │            │
│  │  (Mesh Peer)     │  Redis  │  (Mesh Peer)     │            │
│  │                  │  Pub/Sub│                  │            │
│  └────────┬─────────┘         └────────┬─────────┘            │
│           │                             │                      │
└───────────┼─────────────────────────────┼──────────────────────┘
            │                             │
┌───────────┼─────────────────────────────┼──────────────────────┐
│           │   HIERARCHICAL AGENT LAYER  │                      │
│           ▼                             ▼                      │
│  ┌─────────────────┐         ┌─────────────────┐              │
│  │  35 Sub-agents  │         │  35 Sub-agents  │              │
│  │  agent-A-001    │         │  agent-B-001    │              │
│  │  agent-A-002    │         │  agent-B-002    │              │
│  │  ...            │         │  ...            │              │
│  │  agent-A-035    │         │  agent-B-035    │              │
│  └─────────────────┘         └─────────────────┘              │
└──────────────────────────────────────────────────────────────┘

Total Agents: 72 (2 coordinators + 70 sub-agents)
```

### Test Specifications

#### 1. Combination Claiming Protocol

**Claim Process via Redis Pub/Sub:**

```bash
# Coordinator-A publishes claim attempt
PUBLISH coordination:claims:channel '{"coordinator":"Coordinator-A","combo":"JavaScript:English","action":"claim","timestamp":123456789}'

# Coordinator-B subscribes and sees claim, avoids that combo
SUBSCRIBE coordination:claims:channel

# Coordinator-A confirms claim after 100ms no-conflict window
PUBLISH coordination:claims:channel '{"coordinator":"Coordinator-A","combo":"JavaScript:English","action":"confirmed","timestamp":123456790}'
```

**Claim Conflict Resolution:**
- If both coordinators claim same combo simultaneously (within 100ms):
  - Coordinator with earlier timestamp wins
  - Loser coordinator re-claims different combo
  - Conflict logged in `coordination:conflicts:*` keys

**Redis Keys for Claims:**
```
coordination:claims:claimed:{combo} = coordinator_id
coordination:claims:history = [list of all claim events]
coordination:claims:confirmed = {combo: coordinator_id}
coordination:conflicts:log = [list of conflict resolutions]
```

#### 2. Sub-agent Assignment

**Direct Assignment from Coordinator:**

When Coordinator-A spawns agent-A-001:
```typescript
Task('coder', `You are agent-A-001.

Your assignment:
- Programming Language: JavaScript
- Written Language: English
- Message: "Hello World"

Create a Hello World program that prints the translated message.
Save to: output/hello-world/javascript-english.js

Report completion to Coordinator-A via Redis:
  SET coordination:agent:agent-A-001:status "complete"
  SET coordination:agent:agent-A-001:file "output/hello-world/javascript-english.js"
`);
```

**No Redis Pre-assignment:** Agent receives assignment directly in spawn prompt, not by reading Redis.

#### 3. Coordination Validation

**Required Redis Logs:**

```
coordination:messages:* = All coordinator-to-coordinator messages
coordination:claims:* = All combination claims and confirmations
coordination:assignments:* = Sub-agent assignment records
coordination:timeline = Ordered list of all coordination events
coordination:stats:Coordinator-A = {claimed: 35, spawned: 35, completed: 35}
coordination:stats:Coordinator-B = {claimed: 35, spawned: 35, completed: 35}
```

**Validation Script Checks:**
1. Parse Redis pub/sub logs showing coordinator communication
2. Verify claims happened before agent spawns (timestamps)
3. Confirm zero duplicate claims (no overlap)
4. Check all 70 combinations claimed (full coverage)
5. Verify 35 agents per coordinator (balanced load)

#### 4. Success Criteria - Layer 1

- ✅ 72 total agents: 2 coordinators + 70 sub-agents
- ✅ Zero combination overlap (validated via Redis claim logs)
- ✅ All 70 combinations covered
- ✅ Coordinators communicated via Redis pub/sub (message logs exist)
- ✅ Each coordinator spawned exactly 35 sub-agents
- ✅ All 70 Hello World files written to disk:
  - `output/hello-world/{language}-{translation}.{ext}`
  - Example: `output/hello-world/javascript-english.js`
- ✅ Redis timeline shows coordination sequence (claim → spawn → complete)
- ✅ Zero conflicts OR all conflicts resolved correctly

#### 5. File Output Structure

```
output/hello-world/
├── javascript-english.js
├── javascript-spanish.js
├── javascript-french.js
...
├── python-english.py
├── python-spanish.py
...
├── ruby-italian.rb
└── validation-layer1.json  (coordination logs)
```

**File Content Example (javascript-english.js):**
```javascript
// Generated by agent-A-001
// Coordinator: Coordinator-A
// Language: JavaScript / English
console.log("Hello World");
```

---

## Layer 2: Code Review Coordination

### Objective
Add 3rd mesh coordinator managing dynamic reviewer pool with load balancing.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 3-WAY MESH COORDINATION LAYER                   │
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐ │
│  │Coordinator-A │ ←───→│Coordinator-B │ ←───→│  Review-     │ │
│  │(Implementor) │      │(Implementor) │      │  Coordinator │ │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘ │
│         │                      │                     │         │
└─────────┼──────────────────────┼─────────────────────┼─────────┘
          │                      │                     │
          ▼                      ▼                     ▼
    ┌──────────┐          ┌──────────┐          ┌──────────┐
    │35 Coders │          │35 Coders │          │X Reviewers│
    └──────────┘          └──────────┘          └──────────┘

Total Agents: 73+ (3 coordinators + 70 coders + X reviewers)
X = dynamic based on load (start with 3, max 10)
```

### Test Specifications

#### 1. Review Coordinator Mesh Integration

**Review-Coordinator subscribes to completion events:**
```bash
SUBSCRIBE coordination:implementations:complete
```

**When Coordinator-A's agent completes:**
```bash
# Agent reports to Coordinator-A
SET coordination:agent:agent-A-001:status "complete"

# Coordinator-A notifies Review-Coordinator
PUBLISH coordination:implementations:complete '{
  "agent":"agent-A-001",
  "file":"output/hello-world/javascript-english.js",
  "coordinator":"Coordinator-A",
  "timestamp":123456789
}'
```

#### 2. Reviewer Pool Management

**Resource Constraint Check:**
```javascript
// Check available resources before spawning
const canSpawnReviewer = await checkResourceAvailability({
  type: 'reviewer',
  currentCount: activeReviewers.length,
  maxAllowed: 10,
  systemResources: getSystemResources()
});

if (canSpawnReviewer && reviewQueue.length > 5) {
  spawnNewReviewer();
} else {
  waitForReviewerAvailable();
}
```

**Load Balancing Logic:**
- Start with 3 reviewers (reviewer-001, reviewer-002, reviewer-003)
- If review queue > 5 AND resources available: spawn new reviewer
- Max 10 concurrent reviewers
- If resources constrained: queue reviews, wait for reviewers to free up

#### 3. Review Assignment Flow

```
1. agent-A-001 completes → reports to Coordinator-A
2. Coordinator-A → Review-Coordinator (via pub/sub)
3. Review-Coordinator checks reviewer availability
4. IF reviewer available:
     Assign to available reviewer
   ELSE IF can spawn (queue > 5 AND resources OK):
     Spawn new reviewer, assign to them
   ELSE:
     Queue review, wait for reviewer to free up
5. Reviewer reviews code
6. Reviewer reports result to Review-Coordinator
7. Review-Coordinator publishes result (success/fail)
```

#### 4. Redis State Tracking

```
coordination:review:queue = [list of files awaiting review]
coordination:review:active = {reviewer-001: "javascript-english.js", ...}
coordination:review:completed = [list of reviewed files]
coordination:review:reviewers:active = [reviewer-001, reviewer-002, ...]
coordination:review:reviewers:available = [reviewer-003, ...]
coordination:review:stats = {total: 70, completed: 0, pending: 70, in_review: 3}
```

#### 5. Success Criteria - Layer 2

- ✅ All Layer 1 criteria met
- ✅ 73+ total agents (3 coordinators + 70 coders + X reviewers)
- ✅ Review-Coordinator in mesh with other 2 coordinators
- ✅ All 70 implementations reviewed
- ✅ Dynamic reviewer spawning based on load
- ✅ Resource constraints respected (max 10 reviewers)
- ✅ Review results logged in Redis
- ✅ All coordination messages logged with timestamps
- ✅ Reviews completed (all pass in Layer 2)

#### 6. Review Output

```
output/hello-world/reviews/
├── javascript-english-review.json
├── javascript-spanish-review.json
...
└── validation-layer2.json
```

**Review File Example (javascript-english-review.json):**
```json
{
  "file": "output/hello-world/javascript-english.js",
  "reviewer": "reviewer-001",
  "coordinator": "Review-Coordinator",
  "status": "pass",
  "timestamp": 123456790,
  "checks": {
    "syntax": "pass",
    "correct_message": "pass",
    "correct_language": "pass"
  }
}
```

---

## Layer 3: Error Injection & Re-review Loop

### Objective
Test error handling, re-coordination, and multi-pass validation with deliberate errors.

### Test Specifications

#### 1. Error Injection Strategy

**Random Error Injection (50% failure rate):**
```javascript
const errorTypes = [
  'syntax',      // Missing semicolon, bracket
  'logic',       // Wrong message printed
  'translation', // Wrong language message
  'mixed'        // Multiple error types
];

// Each implementation has 50% chance of error
const shouldInjectError = Math.random() < 0.5;
if (shouldInjectError) {
  const errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
  injectError(code, errorType);
}
```

**Error Examples:**

**Syntax Error (javascript-english.js):**
```javascript
// Missing semicolon
console.log("Hello World")  // ERROR: Missing semicolon
```

**Logic Error (python-spanish.py):**
```python
# Wrong message
print("Hello World")  # ERROR: Should be "Hola Mundo"
```

**Translation Error (rust-japanese.rs):**
```rust
// Wrong language
println!("Hello World");  // ERROR: Should be "こんにちは世界"
```

#### 2. Review Failure & Re-coordination Flow

```
1. reviewer-001 finds error in javascript-english.js
2. reviewer-001 → Review-Coordinator: {status: "fail", errors: [...]}
3. Review-Coordinator → Coordinator-A: "agent-A-001 needs fix"
4. Coordinator-A spawns NEW agent (agent-A-001-retry-1)
5. New agent fixes code, saves to same file
6. agent-A-001-retry-1 → Coordinator-A: "complete"
7. Coordinator-A → Review-Coordinator: "re-review needed"
8. Review-Coordinator assigns to ANY available reviewer
9. Reviewer validates fix
10. If pass: done. If fail: repeat (max 10 retries)
```

**Important:** Spawn FRESH agent for fixes, don't reuse original agent (release resources).

#### 3. Retry Tracking

```
coordination:retries:javascript-english = {
  attempt: 3,
  history: [
    {attempt: 1, agent: "agent-A-001", status: "fail", error: "syntax"},
    {attempt: 2, agent: "agent-A-001-retry-1", status: "fail", error: "logic"},
    {attempt: 3, agent: "agent-A-001-retry-2", status: "pass"}
  ]
}
```

#### 4. Success Criteria - Layer 3

- ✅ All Layer 2 criteria met
- ✅ ~50% of implementations initially fail (random errors injected)
- ✅ All error types represented (syntax, logic, translation, mixed)
- ✅ Re-review flow works: fail → fix → re-review
- ✅ Fresh agents spawned for fixes (not reused)
- ✅ Any reviewer can validate fixes (not necessarily original reviewer)
- ✅ ALL 70 implementations eventually pass
- ✅ No implementation exceeds 10 retries
- ✅ Complete audit trail in Redis showing all attempts
- ✅ Final files on disk are all correct

#### 5. Final Output

```
output/hello-world/
├── javascript-english.js (final, correct)
├── javascript-spanish.js (final, correct)
...
└── ruby-italian.rb (final, correct)

output/hello-world/reviews/
├── javascript-english-review-attempt-1.json (fail)
├── javascript-english-review-attempt-2.json (fail)
├── javascript-english-review-final.json (pass)
...
└── validation-layer3.json (all pass)

output/hello-world/coordination/
├── claims.json (all coordination claims)
├── assignments.json (all agent assignments)
├── reviews.json (all review assignments)
├── retries.json (all retry attempts)
└── timeline.json (complete coordination timeline)
```

---

## Validation Scripts

### Layer 1 Validation

**File:** `validate-layer1-coordination.js`

```javascript
// Check coordination happened (not just scripts)
const claimLogs = await redis.get('coordination:claims:history');
const messages = await redis.get('coordination:messages:*');

// Verify claims precede spawns (timestamp order)
const timeline = await redis.get('coordination:timeline');
validateTimestampOrder(timeline, ['claim', 'spawn', 'complete']);

// Check zero overlap
const coordinatorAClaims = claimLogs.filter(c => c.coordinator === 'Coordinator-A');
const coordinatorBClaims = claimLogs.filter(c => c.coordinator === 'Coordinator-B');
const overlap = findDuplicates(coordinatorAClaims, coordinatorBClaims);

assert(overlap.length === 0, 'No combination overlap');
assert(coordinatorAClaims.length === 35, 'Coordinator-A claimed 35');
assert(coordinatorBClaims.length === 35, 'Coordinator-B claimed 35');
assert(messages.length > 70, 'Coordinators communicated');

// Verify files on disk
const files = fs.readdirSync('output/hello-world/');
assert(files.length === 70, 'All 70 files created');
```

### Layer 2 Validation

**File:** `validate-layer2-reviews.js`

```javascript
// Check review coordination
const reviewQueue = await redis.get('coordination:review:queue');
const reviewStats = await redis.get('coordination:review:stats');
const reviewerSpawns = await redis.keys('coordination:reviewers:spawn:*');

// Verify dynamic reviewer spawning
assert(reviewerSpawns.length >= 3, 'At least 3 reviewers spawned');
assert(reviewerSpawns.length <= 10, 'Max 10 reviewers respected');

// Check all implementations reviewed
assert(reviewStats.completed === 70, 'All 70 reviewed');

// Verify review files
const reviewFiles = fs.readdirSync('output/hello-world/reviews/');
assert(reviewFiles.length === 70, 'All reviews documented');
```

### Layer 3 Validation

**File:** `validate-layer3-retries.js`

```javascript
// Check error injection and retry loops
const retryLogs = await redis.keys('coordination:retries:*');
const failedInitial = retryLogs.filter(r => r.history[0].status === 'fail');

// Verify ~50% failure rate initially
assert(failedInitial.length > 30 && failedInitial.length < 40,
  '~50% initial failures');

// Check all error types present
const errorTypes = new Set();
retryLogs.forEach(log => {
  log.history.forEach(attempt => {
    if (attempt.error) errorTypes.add(attempt.error);
  });
});
assert(errorTypes.has('syntax'), 'Syntax errors present');
assert(errorTypes.has('logic'), 'Logic errors present');
assert(errorTypes.has('translation'), 'Translation errors present');

// Verify all eventually pass
const allPass = retryLogs.every(log =>
  log.history[log.history.length - 1].status === 'pass'
);
assert(allPass, 'All implementations eventually pass');

// Check max retries respected
const maxRetries = Math.max(...retryLogs.map(log => log.attempt));
assert(maxRetries <= 10, 'No implementation exceeded 10 retries');

// Verify fresh agent spawning
retryLogs.forEach(log => {
  const agents = log.history.map(h => h.agent);
  const uniqueAgents = new Set(agents);
  assert(uniqueAgents.size === agents.length,
    'Fresh agents spawned for each retry');
});
```

---

## Resource Constraints

### Checking Resource Availability

**Implementation:**
```javascript
async function checkResourceAvailability(options) {
  const {
    type,           // 'reviewer' or 'coder'
    currentCount,   // Current active agents of this type
    maxAllowed,     // Max allowed (10 for reviewers)
    systemResources // CPU, memory, etc.
  } = options;

  // Check agent count limit
  if (currentCount >= maxAllowed) {
    return { canSpawn: false, reason: 'max_count_reached' };
  }

  // Check system resources
  const cpuUsage = await getSystemCPUUsage();
  const memoryUsage = await getSystemMemoryUsage();
  const activeAgents = await getTotalActiveAgents();

  // Conservative thresholds
  if (cpuUsage > 80) {
    return { canSpawn: false, reason: 'cpu_constrained' };
  }
  if (memoryUsage > 85) {
    return { canSpawn: false, reason: 'memory_constrained' };
  }
  if (activeAgents > 100) {
    return { canSpawn: false, reason: 'total_agent_limit' };
  }

  return { canSpawn: true };
}
```

**Redis State:**
```
coordination:resources:cpu = 45
coordination:resources:memory = 60
coordination:resources:active_agents = 75
coordination:resources:constraints = {
  max_reviewers: 10,
  max_total_agents: 100,
  cpu_threshold: 80,
  memory_threshold: 85
}
```

---

## Test Execution

### Sequential Layer Execution

```bash
# Layer 1: Mesh Coordination
echo "=== Layer 1: Testing Mesh Coordination ==="
node test-layer1-mesh-coordination.js
if [ $? -eq 0 ]; then
  echo "✅ Layer 1 PASS - Proceeding to Layer 2"
else
  echo "❌ Layer 1 FAIL - Stopping test"
  exit 1
fi

# Layer 2: Code Review Coordination
echo "=== Layer 2: Testing Review Coordination ==="
node test-layer2-review-coordination.js
if [ $? -eq 0 ]; then
  echo "✅ Layer 2 PASS - Proceeding to Layer 3"
else
  echo "❌ Layer 2 FAIL - Stopping test"
  exit 1
fi

# Layer 3: Error Injection & Retry
echo "=== Layer 3: Testing Error Handling ==="
node test-layer3-error-retry.js
if [ $? -eq 0 ]; then
  echo "✅ Layer 3 PASS - All tests complete!"
else
  echo "❌ Layer 3 FAIL"
  exit 1
fi
```

---

## Success Summary

### Complete Test Pass Criteria

**Layer 1:**
- 2 coordinators communicate via Redis pub/sub
- 70 sub-agents spawned (35 per coordinator)
- Zero overlap, full coverage
- 70 files written to disk
- Coordination timeline validates message sequence

**Layer 2:**
- 3rd coordinator added to mesh
- Dynamic reviewer pool (3-10 reviewers)
- All 70 implementations reviewed
- Resource constraints respected
- Review coordination logged

**Layer 3:**
- ~50% initial failures (random errors)
- All error types present
- Re-review loops functional
- Fresh agents for retries
- ALL 70 eventually pass (≤10 retries)
- Complete audit trail

**Final Output:**
- 70 correct Hello World programs on disk
- Complete coordination logs in Redis
- Validation scripts confirm all criteria
- Test duration < 15 minutes per layer

---

## Test Status Template

```markdown
## Test Execution Report

**Date:** YYYY-MM-DD
**Total Duration:** X minutes

### Layer 1: Mesh Coordination
- Status: ✅ PASS / ❌ FAIL
- Coordinators: 2
- Sub-agents: 70 (35 each)
- Overlap: 0
- Coverage: 70/70
- Files: 70
- Duration: X minutes

### Layer 2: Review Coordination
- Status: ✅ PASS / ❌ FAIL
- Review Coordinator: Active
- Reviewers Spawned: X (3-10)
- Reviews Completed: 70/70
- Queue Max Length: X
- Duration: X minutes

### Layer 3: Error Handling
- Status: ✅ PASS / ❌ FAIL
- Initial Failures: X% (~50% expected)
- Error Types: Syntax(X), Logic(X), Translation(X), Mixed(X)
- Max Retries: X (≤10)
- Final Pass Rate: 100%
- Fresh Agents Spawned: X
- Duration: X minutes

**Overall: ✅ PASS / ❌ FAIL**
```
