# 3-Layer Mesh Coordination Test Architecture

## Overview

This architecture validates distributed coordination patterns using Redis pub/sub for real-time agent coordination across multiple autonomous coordinators. The system demonstrates escalating complexity from basic mesh coordination through dynamic resource management to fault-tolerant error handling.

---

## Layer 1: Mesh Coordination Foundation

### Objective
Validate that 2 peer coordinators can claim work without conflicts using Redis pub/sub.

### Architecture

```
┌─────────────────┐         Redis Pub/Sub         ┌─────────────────┐
│  Coordinator A  │◄────────────────────────────►│  Coordinator B  │
│   (35 agents)   │    coordination:claims        │   (35 agents)   │
└────────┬────────┘                               └────────┬────────┘
         │                                                 │
         ├─ Agent A1 (en→es)                             ├─ Agent B1 (ja→ko)
         ├─ Agent A2 (en→fr)                             ├─ Agent B2 (zh→ar)
         ├─ Agent A3 (en→de)                             ├─ Agent B3 (hi→pt)
         └─ ... (35 total)                               └─ ... (35 total)
```

### Redis Pub/Sub Protocol

**Channels:**
```javascript
{
  // Main claim negotiation channel (all coordinators subscribe)
  claimChannel: "coordination:claims:channel",

  // Per-coordinator private message channels
  messageChannel: "coordination:messages:{coordinatorId}",

  // Heartbeat monitoring
  heartbeatChannel: "coordination:heartbeat"
}
```

**Redis Keys:**
```javascript
{
  // Active claims (TTL: 5 minutes)
  claim: "coordination:claims:claimed:{combo}",
  claimData: {
    coordinatorId: "coord-a",
    timestamp: 1728737271000,
    agentId: "agent-a1",
    status: "claimed" | "completed" | "failed"
  },

  // Coordination timeline (audit trail)
  timeline: "coordination:timeline",
  timelineEntry: {
    timestamp: 1728737271000,
    coordinator: "coord-a",
    combo: "en-es",
    action: "claim_attempt" | "claim_success" | "claim_conflict" | "completion",
    metadata: {}
  },

  // Conflict log (for validation)
  conflicts: "coordination:conflicts:log",
  conflictEntry: {
    timestamp: 1728737271000,
    combo: "en-es",
    coordinators: ["coord-a", "coord-b"],
    winner: "coord-a",
    resolution: "earlier_timestamp"
  },

  // Coordinator state
  coordinatorState: "coordination:coordinator:{id}",
  state: {
    id: "coord-a",
    status: "active" | "idle" | "terminated",
    agentCount: 35,
    claimed: ["en-es", "en-fr", ...],
    completed: ["en-es", ...],
    lastHeartbeat: 1728737271000
  }
}
```

### Message Format

**Claim Attempt:**
```json
{
  "type": "claim_attempt",
  "coordinator": "coord-a",
  "combo": "en-es",
  "timestamp": 1728737271000,
  "priority": 1
}
```

**Claim Success:**
```json
{
  "type": "claim_success",
  "coordinator": "coord-a",
  "combo": "en-es",
  "timestamp": 1728737271001,
  "agentId": "agent-a1"
}
```

**Claim Conflict:**
```json
{
  "type": "claim_conflict",
  "coordinator": "coord-a",
  "combo": "en-es",
  "timestamp": 1728737271000,
  "conflictWith": "coord-b",
  "resolution": "withdraw"
}
```

**Work Completion:**
```json
{
  "type": "work_complete",
  "coordinator": "coord-a",
  "combo": "en-es",
  "timestamp": 1728737285000,
  "agentId": "agent-a1",
  "success": true
}
```

### Coordinator State Machine

```
┌──────────┐
│   INIT   │
└────┬─────┘
     │
     ▼
┌──────────┐    Subscribe to channels
│ STARTUP  │────► coordination:claims:channel
└────┬─────┘      coordination:messages:{id}
     │
     ▼
┌──────────┐
│  ACTIVE  │◄───┐
└────┬─────┘    │
     │          │
     ├─ Claim attempt ──► Check Redis ──► Success/Conflict
     │          │                              │
     │          └──────────────────────────────┘
     ├─ Spawn agent
     ├─ Monitor completion
     └─ Update state

┌──────────┐
│   IDLE   │ (all work claimed)
└────┬─────┘
     │
     ▼
┌──────────┐
│TERMINATED│ (all work completed)
└──────────┘
```

### Claim Negotiation Protocol

```javascript
// Step 1: Coordinator attempts claim
async function attemptClaim(combo) {
  const timestamp = Date.now();

  // Publish claim attempt
  await redis.publish('coordination:claims:channel', JSON.stringify({
    type: 'claim_attempt',
    coordinator: this.id,
    combo,
    timestamp
  }));

  // Wait 100ms conflict window
  await sleep(100);

  // Check for conflicts
  const existingClaim = await redis.get(`coordination:claims:claimed:${combo}`);

  if (!existingClaim) {
    // No conflict - claim success
    await redis.setex(`coordination:claims:claimed:${combo}`, 300, JSON.stringify({
      coordinatorId: this.id,
      timestamp,
      agentId: `agent-${this.id}-${combo}`,
      status: 'claimed'
    }));

    await redis.publish('coordination:claims:channel', JSON.stringify({
      type: 'claim_success',
      coordinator: this.id,
      combo,
      timestamp: Date.now(),
      agentId: `agent-${this.id}-${combo}`
    }));

    return true;
  }

  const claim = JSON.parse(existingClaim);

  // Conflict resolution: earlier timestamp wins
  if (claim.timestamp < timestamp) {
    // We lose - withdraw
    await redis.publish('coordination:claims:channel', JSON.stringify({
      type: 'claim_conflict',
      coordinator: this.id,
      combo,
      timestamp: Date.now(),
      conflictWith: claim.coordinatorId,
      resolution: 'withdraw'
    }));

    // Log conflict
    await redis.rpush('coordination:conflicts:log', JSON.stringify({
      timestamp: Date.now(),
      combo,
      coordinators: [this.id, claim.coordinatorId],
      winner: claim.coordinatorId,
      resolution: 'earlier_timestamp'
    }));

    return false;
  } else {
    // We win - override (shouldn't happen with 100ms window)
    await redis.setex(`coordination:claims:claimed:${combo}`, 300, JSON.stringify({
      coordinatorId: this.id,
      timestamp,
      agentId: `agent-${this.id}-${combo}`,
      status: 'claimed'
    }));

    return true;
  }
}
```

### Agent Spawning Pattern

```javascript
async function spawnAgentForCombo(combo) {
  const [source, target] = combo.split('-');

  const agent = {
    id: `agent-${this.id}-${combo}`,
    coordinator: this.id,
    task: `Translate "Hello, World!" from ${source} to ${target}`,
    combo,
    spawnedAt: Date.now()
  };

  // Update coordinator state
  await redis.hset(`coordination:coordinator:${this.id}`, 'agentCount',
    (await redis.hget(`coordination:coordinator:${this.id}`, 'agentCount') || 0) + 1
  );

  // Add to claimed list
  await redis.sadd(`coordination:coordinator:${this.id}:claimed`, combo);

  // Log to timeline
  await redis.rpush('coordination:timeline', JSON.stringify({
    timestamp: Date.now(),
    coordinator: this.id,
    combo,
    action: 'agent_spawned',
    metadata: { agentId: agent.id }
  }));

  return agent;
}
```

### Success Criteria

```javascript
const LAYER1_SUCCESS = {
  totalAgents: 72,          // 2 coordinators × 35 agents + 2 coordinators
  uniqueFiles: 70,          // 7 languages × 10 translations
  overlaps: 0,              // No duplicate claims
  coordinationMessages: 70, // Minimum claim messages
  conflicts: 0,             // Ideal case (may have some)
  timeline: {
    minEntries: 140,        // claim + completion per combo
    actions: ['claim_attempt', 'claim_success', 'agent_spawned', 'work_complete']
  },
  coordinators: {
    count: 2,
    claimsPerCoord: 35,     // Balanced distribution
    tolerance: 5            // ±5 claims variance acceptable
  }
};
```

---

## Layer 2: Review Coordination

### Objective
Add dynamic reviewer pool that spawns/despawns based on queue depth.

### Architecture

```
┌─────────────────┐         Redis Pub/Sub         ┌─────────────────┐
│  Coordinator A  │◄────────────────────────────►│  Coordinator B  │
│   (35 agents)   │    coordination:claims        │   (35 agents)   │
└─────────────────┘                               └─────────────────┘
         │                                                 │
         └─────────────────────┬───────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Coordinator R      │
                    │  (Review Manager)   │
                    │  3-10 reviewers     │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │   Review Queue      │
                    │   (Redis List)      │
                    └─────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              ┌─────▼────┐         ┌─────▼────┐
              │Reviewer 1│   ...   │Reviewer N│
              └──────────┘         └──────────┘
```

### Additional Redis Keys

```javascript
{
  // Review queue (list)
  reviewQueue: "coordination:review:queue",
  queueItem: {
    combo: "en-es",
    coordinatorId: "coord-a",
    agentId: "agent-a1",
    completedAt: 1728737285000,
    status: "pending" | "in_review" | "reviewed"
  },

  // Reviewer pool state
  reviewerPool: "coordination:reviewers:pool",
  reviewer: {
    id: "reviewer-1",
    status: "active" | "idle" | "terminated",
    assignedCombo: "en-es" | null,
    reviewCount: 5,
    spawnedAt: 1728737271000
  },

  // Review results
  reviewResult: "coordination:review:result:{combo}",
  result: {
    combo: "en-es",
    reviewerId: "reviewer-1",
    passed: true,
    issues: [],
    reviewedAt: 1728737290000
  }
}
```

### Dynamic Spawning Logic

```javascript
class ReviewCoordinator {
  constructor() {
    this.minReviewers = 3;
    this.maxReviewers = 10;
    this.queueThreshold = 5;  // Spawn new reviewer if queue > 5
    this.activeReviewers = [];
  }

  async monitorQueue() {
    while (true) {
      const queueDepth = await redis.llen('coordination:review:queue');
      const activeCount = this.activeReviewers.filter(r => r.status === 'active').length;

      // Spawn logic
      if (queueDepth > this.queueThreshold && activeCount < this.maxReviewers) {
        await this.spawnReviewer();
      }

      // Despawn logic (idle for 30s)
      if (queueDepth < this.queueThreshold && activeCount > this.minReviewers) {
        await this.despawnIdleReviewer();
      }

      await sleep(1000);  // Check every second
    }
  }

  async spawnReviewer() {
    const reviewerId = `reviewer-${Date.now()}`;
    const reviewer = {
      id: reviewerId,
      status: 'active',
      assignedCombo: null,
      reviewCount: 0,
      spawnedAt: Date.now()
    };

    this.activeReviewers.push(reviewer);

    await redis.hset('coordination:reviewers:pool', reviewerId, JSON.stringify(reviewer));

    // Start review loop
    this.reviewLoop(reviewer);

    return reviewer;
  }

  async reviewLoop(reviewer) {
    while (reviewer.status === 'active') {
      // Fetch from queue
      const item = await redis.lpop('coordination:review:queue');

      if (!item) {
        await sleep(1000);
        continue;
      }

      const work = JSON.parse(item);
      reviewer.assignedCombo = work.combo;

      // Simulate review (1-2 seconds)
      await sleep(1000 + Math.random() * 1000);

      // Store result
      await redis.setex(`coordination:review:result:${work.combo}`, 300, JSON.stringify({
        combo: work.combo,
        reviewerId: reviewer.id,
        passed: true,
        issues: [],
        reviewedAt: Date.now()
      }));

      reviewer.reviewCount++;
      reviewer.assignedCombo = null;

      await redis.hset('coordination:reviewers:pool', reviewer.id, JSON.stringify(reviewer));
    }
  }
}
```

### Review Submission Protocol

```javascript
// Implementer coordinator submits work for review
async function submitForReview(combo, agentId) {
  const queueItem = {
    combo,
    coordinatorId: this.id,
    agentId,
    completedAt: Date.now(),
    status: 'pending'
  };

  await redis.rpush('coordination:review:queue', JSON.stringify(queueItem));

  await redis.publish('coordination:claims:channel', JSON.stringify({
    type: 'review_submitted',
    coordinator: this.id,
    combo,
    timestamp: Date.now()
  }));
}

// Implementer coordinator waits for review
async function waitForReview(combo) {
  const maxWait = 30000;  // 30 seconds
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const result = await redis.get(`coordination:review:result:${combo}`);
    if (result) {
      return JSON.parse(result);
    }
    await sleep(500);
  }

  throw new Error(`Review timeout for ${combo}`);
}
```

### Success Criteria

```javascript
const LAYER2_SUCCESS = {
  totalAgents: 73,           // Layer 1 (72) + min 3 reviewers, max 82
  minReviewers: 3,
  maxReviewers: 10,
  reviewsCompleted: 70,      // All 70 combos reviewed
  queueDiscipline: {
    maxQueueDepth: 15,       // Queue never exceeds 15
    avgQueueDepth: 5,        // Average around threshold
  },
  reviewerUtilization: {
    min: 3,                  // Always at least 3 active
    max: 10,                 // Never more than 10
    avgReviewsPerReviewer: 7 // 70 / ~10 reviewers
  },
  resourceConstraints: {
    spawned: true,           // Reviewers spawned dynamically
    despawned: true,         // Idle reviewers terminated
    respectsLimits: true     // Never exceeds max
  }
};
```

---

## Layer 3: Error Handling & Retry

### Objective
Inject 50% random errors and validate retry coordination with fresh agents.

### Architecture

```
┌─────────────────────────────────────────────────┐
│           Error Injection Layer                 │
│  (50% failure rate, random error types)         │
└──────────────────┬──────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌────────┐    ┌────────┐    ┌────────┐
│Syntax  │    │Logic   │    │Mixed   │
│Errors  │    │Errors  │    │Errors  │
└────────┘    └────────┘    └────────┘
    │              │              │
    └──────────────┼──────────────┘
                   ▼
         ┌──────────────────┐
         │  Retry Coordinator│
         │  (manages retries)│
         └─────────┬─────────┘
                   │
         ┌─────────┴─────────┐
         │   Retry Queue     │
         │   (Redis List)    │
         └─────────┬─────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    ┌────▼────┐         ┌────▼────┐
    │Fresh    │   ...   │Fresh    │
    │Agent 1  │         │Agent N  │
    └─────────┘         └─────────┘
```

### Error Types

```javascript
const ERROR_TYPES = {
  SYNTAX: {
    name: 'SyntaxError',
    probability: 0.35,
    simulate: () => ({ error: 'Missing semicolon at line 42' })
  },
  LOGIC: {
    name: 'LogicError',
    probability: 0.35,
    simulate: () => ({ error: 'Incorrect translation logic' })
  },
  TRANSLATION: {
    name: 'TranslationError',
    probability: 0.20,
    simulate: () => ({ error: 'Invalid Unicode character' })
  },
  MIXED: {
    name: 'MixedError',
    probability: 0.10,
    simulate: () => ({ error: 'Multiple issues detected' })
  }
};
```

### Error Injection

```javascript
class ErrorInjector {
  constructor(failureRate = 0.5) {
    this.failureRate = failureRate;
    this.injectedErrors = new Map();
  }

  shouldInjectError() {
    return Math.random() < this.failureRate;
  }

  selectErrorType() {
    const rand = Math.random();
    let cumulative = 0;

    for (const [type, config] of Object.entries(ERROR_TYPES)) {
      cumulative += config.probability;
      if (rand < cumulative) {
        return config;
      }
    }

    return ERROR_TYPES.SYNTAX;
  }

  async injectError(combo, agentId) {
    if (!this.shouldInjectError()) {
      return null;  // No error
    }

    const errorType = this.selectErrorType();
    const error = {
      combo,
      agentId,
      errorType: errorType.name,
      errorDetails: errorType.simulate(),
      injectedAt: Date.now()
    };

    this.injectedErrors.set(combo, error);

    // Store in Redis
    await redis.hset('coordination:errors:injected', combo, JSON.stringify(error));

    return error;
  }
}
```

### Retry Coordination Protocol

```javascript
class RetryCoordinator {
  constructor() {
    this.maxRetries = 10;
    this.retryAttempts = new Map();
  }

  async handleError(combo, agentId, error) {
    const attempts = this.retryAttempts.get(combo) || 0;

    if (attempts >= this.maxRetries) {
      console.error(`Max retries exceeded for ${combo}`);
      return false;
    }

    // Increment retry count
    this.retryAttempts.set(combo, attempts + 1);
    await redis.hincrby('coordination:retries:count', combo, 1);

    // Log retry
    await redis.rpush('coordination:retries:log', JSON.stringify({
      combo,
      originalAgent: agentId,
      attempt: attempts + 1,
      errorType: error.errorType,
      timestamp: Date.now()
    }));

    // Reclaim work (release original claim)
    await redis.del(`coordination:claims:claimed:${combo}`);

    // Publish retry event
    await redis.publish('coordination:claims:channel', JSON.stringify({
      type: 'retry_required',
      combo,
      originalAgent: agentId,
      attempt: attempts + 1,
      errorType: error.errorType,
      timestamp: Date.now()
    }));

    // Wait before retry (exponential backoff)
    const backoff = Math.min(1000 * Math.pow(2, attempts), 10000);
    await sleep(backoff);

    // Spawn fresh agent
    return await this.spawnFreshAgent(combo, attempts + 1);
  }

  async spawnFreshAgent(combo, attempt) {
    const freshAgentId = `agent-retry-${combo}-${attempt}`;

    const agent = {
      id: freshAgentId,
      combo,
      attempt,
      spawnedAt: Date.now(),
      isRetry: true
    };

    await redis.hset('coordination:agents:active', freshAgentId, JSON.stringify(agent));

    // Log fresh spawn
    await redis.rpush('coordination:timeline', JSON.stringify({
      timestamp: Date.now(),
      combo,
      action: 'fresh_agent_spawned',
      metadata: { agentId: freshAgentId, attempt }
    }));

    return agent;
  }
}
```

### Success Criteria

```javascript
const LAYER3_SUCCESS = {
  initialFailureRate: 0.5,   // 50% errors injected
  errorDistribution: {
    syntax: 0.35,
    logic: 0.35,
    translation: 0.20,
    mixed: 0.10
  },
  retryBehavior: {
    maxRetriesPerFile: 10,
    avgRetriesPerFile: 1.5,  // With 50% error rate, expect ~1-2 retries
    maxRetries: 4            // No file should need >4 retries
  },
  finalPassRate: 1.0,        // 100% success after retries
  coordination: {
    freshAgentsSpawned: true,
    reclaimSuccessful: true,
    noDuplicateWork: true
  },
  timeline: {
    retryEvents: 35,         // ~50% of 70 combos
    freshSpawns: 35,
    errorLogs: 35
  }
};
```

---

## Validation Approaches

### Layer 1 Validation

```javascript
async function validateLayer1() {
  const checks = {
    totalAgents: await validateAgentCount(72),
    uniqueFiles: await validateUniqueFiles(70),
    noOverlaps: await validateNoOverlaps(),
    coordinationMessages: await validateMessages(70),
    balancedDistribution: await validateDistribution(35, 5),
    timelineComplete: await validateTimeline(140)
  };

  return Object.values(checks).every(v => v === true);
}

async function validateNoOverlaps() {
  const claims = await redis.keys('coordination:claims:claimed:*');
  const claimData = await Promise.all(
    claims.map(key => redis.get(key).then(JSON.parse))
  );

  const coordinators = claimData.map(c => c.coordinatorId);
  const unique = new Set(coordinators);

  return unique.size === coordinators.length;  // No duplicates
}

async function validateDistribution(target, tolerance) {
  const coordA = await redis.scard('coordination:coordinator:coord-a:claimed');
  const coordB = await redis.scard('coordination:coordinator:coord-b:claimed');

  const balanced = Math.abs(coordA - coordB) <= tolerance;
  const totals = coordA + coordB === 70;

  return balanced && totals;
}
```

### Layer 2 Validation

```javascript
async function validateLayer2() {
  const checks = {
    allReviewed: await validateAllReviewed(70),
    reviewerCount: await validateReviewerBounds(3, 10),
    queueDiscipline: await validateQueueDepth(15),
    dynamicSpawning: await validateDynamicBehavior(),
    resourceConstraints: await validateResourceLimits()
  };

  return Object.values(checks).every(v => v === true);
}

async function validateDynamicBehavior() {
  const pool = await redis.hgetall('coordination:reviewers:pool');
  const reviewers = Object.values(pool).map(JSON.parse);

  const hasSpawns = reviewers.some(r => r.spawnedAt > Date.now() - 60000);
  const hasDespawns = reviewers.some(r => r.status === 'terminated');

  return hasSpawns && hasDespawns;
}
```

### Layer 3 Validation

```javascript
async function validateLayer3() {
  const checks = {
    errorInjection: await validateErrorRate(0.5, 0.05),
    errorTypes: await validateErrorDistribution(),
    retryCount: await validateRetryCount(10),
    freshAgents: await validateFreshAgents(),
    finalPassRate: await validateFinalPassRate(1.0)
  };

  return Object.values(checks).every(v => v === true);
}

async function validateErrorRate(target, tolerance) {
  const injected = await redis.hlen('coordination:errors:injected');
  const rate = injected / 70;

  return Math.abs(rate - target) <= tolerance;
}

async function validateFreshAgents() {
  const timeline = await redis.lrange('coordination:timeline', 0, -1);
  const events = timeline.map(JSON.parse);

  const freshSpawns = events.filter(e => e.action === 'fresh_agent_spawned');
  const retryEvents = events.filter(e => e.action === 'retry_required');

  return freshSpawns.length === retryEvents.length;
}

async function validateFinalPassRate(target) {
  const results = await redis.keys('coordination:review:result:*');
  const passed = await Promise.all(
    results.map(key => redis.get(key).then(r => JSON.parse(r).passed))
  );

  const passRate = passed.filter(Boolean).length / passed.length;

  return passRate === target;
}
```

---

## Implementation Roadmap

### Phase 1: Layer 1 Foundation
1. Implement Redis pub/sub coordinator base class
2. Build claim negotiation protocol
3. Create agent spawning patterns
4. Implement conflict resolution
5. Build validation suite
6. Test with 2 coordinators, 70 combos

### Phase 2: Layer 2 Complexity
1. Implement review coordinator
2. Build dynamic spawning logic
3. Create queue monitoring
4. Implement reviewer lifecycle
5. Build review submission protocol
6. Test with all 3 coordinators

### Phase 3: Layer 3 Resilience
1. Implement error injector
2. Build retry coordinator
3. Create fresh agent spawning
4. Implement exponential backoff
5. Build comprehensive error tracking
6. Test with 50% error rate

### Phase 4: Integration
1. Build run-all-layers script
2. Create comprehensive validation
3. Implement metrics collection
4. Build visualization dashboard
5. Document patterns and lessons

---

## Key Design Decisions

### Why Redis Pub/Sub over Polling?
- **Real-time**: Sub-100ms latency for coordination
- **Scalable**: Handles 1000+ messages/sec
- **Decoupled**: Coordinators don't need direct references
- **Audit-friendly**: All messages logged to timeline

### Why 100ms Conflict Window?
- Long enough for Redis write propagation
- Short enough for responsive coordination
- Allows timestamp-based conflict resolution
- Prevents race conditions in distributed systems

### Why Dynamic Reviewer Pool?
- Demonstrates resource constraint handling
- Tests spawning/despawning coordination
- Validates queue-based work distribution
- Simulates real-world auto-scaling

### Why Fresh Agents for Retries?
- Prevents agent state pollution
- Tests coordinator reclaim logic
- Validates full lifecycle (spawn → work → terminate)
- Simulates real failure recovery

---

## Success Metrics Summary

| Layer | Metric | Target | Validation |
|-------|--------|--------|------------|
| 1 | Total Agents | 72 | Agent count query |
| 1 | Unique Files | 70 | File system check |
| 1 | Overlaps | 0 | Claim uniqueness |
| 1 | Messages | ≥70 | Timeline entries |
| 2 | Reviewers | 3-10 | Pool size check |
| 2 | Reviews | 70 | Result count |
| 2 | Queue Depth | ≤15 | Max queue check |
| 2 | Dynamic Spawn | Yes | Event log check |
| 3 | Error Rate | 50% | Injection log |
| 3 | Retry Max | ≤10 | Retry counter |
| 3 | Pass Rate | 100% | Final results |
| 3 | Fresh Agents | Yes | Spawn log check |

---

## File Structure

```
tests/hello-world/
├── ARCHITECTURE.md              # This document
├── layer1-mesh-coordination.js  # Foundation implementation
├── layer2-review-coordination.js# Dynamic pool implementation
├── layer3-error-retry.js        # Error handling implementation
├── validate-layer1.js           # Layer 1 validation suite
├── validate-layer2.js           # Layer 2 validation suite
├── validate-layer3.js           # Layer 3 validation suite
├── run-all-layers.sh            # Full test execution
├── lib/
│   ├── coordinator-base.js      # Base coordinator class
│   ├── redis-client.js          # Redis connection helper
│   ├── message-protocol.js      # Message format definitions
│   ├── error-injector.js        # Error injection logic
│   └── metrics-collector.js     # Metrics aggregation
└── output/
    ├── layer1-results.json      # Layer 1 output
    ├── layer2-results.json      # Layer 2 output
    ├── layer3-results.json      # Layer 3 output
    └── combined-metrics.json    # Full metrics
```

---

## Next Steps

1. Review this architecture document
2. Create base coordinator class with Redis pub/sub
3. Implement Layer 1 with validation
4. Build Layer 2 on top of Layer 1
5. Add Layer 3 error handling
6. Create comprehensive test suite
7. Document lessons learned
