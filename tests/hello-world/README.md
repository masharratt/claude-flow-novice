# 3-Layer Mesh Coordination Test Suite

Complete distributed coordination test architecture using Redis pub/sub for real-time agent coordination.

## Quick Start

```bash
# 1. Ensure Redis is running
redis-cli ping  # Should return "PONG"

# 2. Install dependencies (if needed)
npm install ioredis

# 3. Run all layers (when implementation files are created)
./run-all-layers.sh

# 4. View results
cat output/layer1-results.json
cat output/layer2-results.json
cat output/layer3-results.json
cat output/combined-metrics.json
```

## Architecture Documents

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete technical architecture with Redis pub/sub protocol, message flows, state machines, and validation approaches
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Implementation status, design decisions, and component overview

## Components

### Core Infrastructure (`lib/`)

| File | Purpose | Status |
|------|---------|--------|
| `redis-client.js` | Redis connection and pub/sub helpers | ✅ Complete |
| `message-protocol.js` | Standardized message formats and loggers | ✅ Complete |
| `coordinator-base.js` | Base coordinator with claim negotiation | ✅ Complete |
| `error-injector.js` | Error injection and retry coordination | ✅ Complete |
| `metrics-collector.js` | Metrics aggregation and validation | ✅ Complete |

### Test Layers (Implementation Pending)

| Layer | File | Description | Status |
|-------|------|-------------|--------|
| 1 | `layer1-mesh-coordination.js` | 2 peer coordinators, 70 combos, claim negotiation | 📋 TODO |
| 2 | `layer2-review-coordination.js` | Add dynamic reviewer pool (3-10 reviewers) | 📋 TODO |
| 3 | `layer3-error-retry.js` | 50% error injection, retry coordination | 📋 TODO |

### Validation Scripts

| File | Purpose | Status |
|------|---------|--------|
| `validate-layer1.js` | Validate Layer 1 success criteria | 📋 TODO |
| `validate-layer2.js` | Validate Layer 2 success criteria | 📋 TODO |
| `validate-layer3.js` | Validate Layer 3 success criteria | 📋 TODO |
| `run-all-layers.sh` | Execute complete test suite | 📋 TODO |

## Layer Overview

### Layer 1: Mesh Coordination

**Objective**: Validate peer-to-peer claim negotiation without conflicts

**Architecture**:
- 2 implementer coordinators (coord-a, coord-b)
- 35 combos assigned to each
- 70 total translation combinations (7 languages × 10 translations)
- Redis pub/sub coordination with 100ms conflict window
- Timestamp-based conflict resolution

**Success Criteria**:
- ✅ 72 total agents (70 implementers + 2 coordinators)
- ✅ 70 unique files (no overlaps)
- ✅ 0 duplicate claims
- ✅ ≥70 coordination messages
- ✅ Balanced distribution (±5 claims variance)

### Layer 2: Review Coordination

**Objective**: Add dynamic reviewer pool that scales with queue depth

**Architecture**:
- Layer 1 foundation (2 implementer coordinators)
- 1 review coordinator
- Dynamic reviewer pool (3-10 reviewers)
- Queue-driven spawning/despawning
- All 70 implementations reviewed

**Success Criteria**:
- ✅ 73-82 total agents (Layer 1 + 3-10 reviewers)
- ✅ 70 reviews completed
- ✅ 3-10 reviewers active
- ✅ Queue depth ≤15
- ✅ Dynamic spawning/despawning observed

### Layer 3: Error Handling

**Objective**: Validate retry coordination with error injection

**Architecture**:
- Layer 2 foundation
- 50% random error injection
- 4 error types (Syntax, Logic, Translation, Mixed)
- Fresh agent spawning for retries
- Exponential backoff (100ms, 200ms, 400ms, ...)
- Max 10 retries per file

**Success Criteria**:
- ✅ 50% initial failures (±10% tolerance)
- ✅ Error distribution matches probabilities (±15% tolerance)
- ✅ Max ≤10 retries per file
- ✅ Avg ≤4 retries per file
- ✅ 100% final pass rate

## Redis Pub/Sub Protocol

### Channels

```javascript
"coordination:claims:channel"          // Main claim negotiation
"coordination:messages:{coordinatorId}" // Private messages
"coordination:heartbeat"               // Heartbeat monitoring
```

### Key Patterns

```javascript
"coordination:claims:claimed:{combo}"       // Active claims (TTL: 5min)
"coordination:timeline"                     // Audit trail (list)
"coordination:conflicts:log"                // Conflict log (list)
"coordination:coordinator:{id}"             // Coordinator state (hash)
"coordination:coordinator:{id}:claimed"     // Claimed combos (set)
"coordination:coordinator:{id}:completed"   // Completed combos (set)
"coordination:review:queue"                 // Review queue (list)
"coordination:reviewers:pool"               // Reviewer pool (hash)
"coordination:review:result:{combo}"        // Review results (TTL: 5min)
"coordination:errors:injected"              // Injected errors (hash)
"coordination:retries:count"                // Retry counters (hash)
"coordination:retries:log"                  // Retry log (list)
"coordination:agents:active"                // Active agents (hash)
```

## Message Types

**Claim Coordination**:
- `claim_attempt` - Coordinator attempts to claim work
- `claim_success` - Claim successful
- `claim_conflict` - Conflict detected, resolution in progress
- `claim_release` - Claim released for retry

**Work Lifecycle**:
- `work_start` - Work execution started
- `work_complete` - Work completed successfully
- `work_failed` - Work failed with error

**Review Coordination**:
- `review_submitted` - Work submitted for review
- `review_assigned` - Reviewer assigned to work
- `review_complete` - Review completed

**Retry Coordination**:
- `retry_required` - Retry needed due to error
- `retry_started` - Retry attempt started
- `fresh_agent_spawned` - Fresh agent spawned for retry

**Coordinator Lifecycle**:
- `coordinator_startup` - Coordinator started
- `coordinator_idle` - Coordinator idle (all work complete)
- `coordinator_shutdown` - Coordinator shutting down
- `heartbeat` - Periodic heartbeat

## Claim Negotiation Flow

```
1. Coordinator publishes claim_attempt(combo)
   ↓
2. All coordinators receive message
   ↓
3. Wait 100ms conflict window
   ↓
4. Check Redis for existing claim
   ↓
5a. No claim exists:              5b. Claim exists:
    - Set claim in Redis              - Compare timestamps
    - Publish claim_success           - Earlier timestamp wins
    - Spawn agent                     - Loser publishes claim_conflict
    - Execute work                    - Winner keeps claim
    ↓
6. Publish work_complete
```

## Conflict Resolution

```
Timeline:
T=0ms:   coord-a publishes claim_attempt(en-es, timestamp=1000)
T=1ms:   coord-b publishes claim_attempt(en-es, timestamp=1001)
T=100ms: coord-a checks Redis, no claim exists
T=100ms: coord-a sets claim (timestamp=1000)
T=101ms: coord-b checks Redis, claim exists (timestamp=1000)
T=101ms: coord-b compares: 1000 < 1001 → coord-a wins
T=102ms: coord-b publishes claim_conflict(withdraw)
T=102ms: coord-b logs conflict to conflicts:log
T=103ms: coord-a spawns agent and executes work
```

## Validation Example

```javascript
import { MetricsCollector } from './lib/metrics-collector.js';
import { createRedisClient } from './lib/redis-client.js';

const redis = await createRedisClient();
const metrics = new MetricsCollector(redis);

// Validate Layer 1
const layer1Results = await metrics.validateLayer1(70);
console.log('Layer 1 Passed:', layer1Results.passed);
console.log('Checks:', layer1Results.checks);

// Validate Layer 2
const layer2Results = await metrics.validateLayer2(70);
console.log('Layer 2 Passed:', layer2Results.passed);

// Validate Layer 3
const layer3Results = await metrics.validateLayer3(70);
console.log('Layer 3 Passed:', layer3Results.passed);

// Export metrics
await metrics.exportMetrics('./output/combined-metrics.json');

await redis.disconnect();
```

## Design Highlights

### Why Redis Pub/Sub?
- Sub-100ms real-time coordination
- Scalable to 1000+ messages/sec
- Decoupled peer-to-peer communication
- Full audit trail

### Why 100ms Conflict Window?
- Ensures Redis write propagation
- Allows deterministic conflict resolution
- Prevents race conditions
- Fast enough for responsive coordination

### Why Timestamp-Based Resolution?
- Deterministic (no randomness)
- Fair (first-come-first-served)
- No central arbiter needed
- Works across distributed systems

### Why Dynamic Reviewer Pool?
- Demonstrates auto-scaling patterns
- Tests resource constraint handling
- Validates queue-based work distribution
- Simulates production scenarios

### Why Fresh Agents for Retries?
- Prevents state pollution
- Tests full lifecycle
- Validates reclaim logic
- Simulates real failure recovery

## Next Steps

1. **Implement Layer 1 Test** (`layer1-mesh-coordination.js`)
   - Create 2 ImplementerCoordinators
   - Assign 35 combos to each
   - Execute parallel coordination
   - Collect metrics

2. **Implement Layer 2 Test** (`layer2-review-coordination.js`)
   - Add ReviewCoordinator to Layer 1
   - Submit all work for review
   - Monitor dynamic reviewer pool
   - Validate review completion

3. **Implement Layer 3 Test** (`layer3-error-retry.js`)
   - Add ErrorInjector to Layer 2
   - Inject 50% errors
   - Trigger retry coordination
   - Validate 100% final pass rate

4. **Create Validation Scripts**
   - Automated success criteria checking
   - JSON metrics export
   - Pass/fail reporting

5. **Build Execution Script**
   - Sequential layer execution
   - Automated cleanup between layers
   - Comprehensive final report

## References

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Full technical specification
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Implementation details
- [Redis Pub/Sub Documentation](https://redis.io/docs/manual/pubsub/)
- [Redis Data Structures](https://redis.io/docs/data-types/)

## License

MIT
