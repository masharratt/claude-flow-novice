# Heartbeat Warning System - Sprint 1.2

**Epic:** Production Blocking Coordination
**Sprint:** 1.2 - Dead Coordinator Detection
**Target:** Detect dead coordinators within 2 minutes (120 seconds)

## Overview

The Heartbeat Warning System monitors coordinator health by tracking heartbeat signals and detecting stale heartbeats. When a coordinator fails to send heartbeats for >120 seconds, the system issues warnings, escalates to critical status, and ultimately marks the coordinator as DEAD with automatic cleanup of orphan state.

## Features

### Core Capabilities

1. **Heartbeat Monitoring** (Every 10 seconds)
   - Monitor all registered coordinator heartbeats
   - Check heartbeat freshness against 120s threshold
   - Track sequence numbers for continuity validation

2. **Warning Escalation** (3-tier system)
   - **Warning (1st detection)**: First stale heartbeat detected
   - **Critical (2nd consecutive)**: Second consecutive stale heartbeat
   - **Dead (3rd consecutive)**: Third consecutive warning → coordinator marked as DEAD

3. **Critical Exit Path**
   - Emit `DeadCoordinatorError` when coordinator marked as DEAD
   - Event-driven architecture for external handlers
   - Non-blocking error emission for graceful degradation

4. **Automatic Cleanup**
   - Remove heartbeat records (`blocking:heartbeat:*`)
   - Remove signal ACKs (`blocking:ack:coordinatorId:*`)
   - Remove signals (`blocking:signal:coordinatorId`)
   - Remove idempotency records (`blocking:idempotency:*coordinatorId*`)

5. **Heartbeat Continuity Validation**
   - Track sequence numbers for gap detection
   - Emit events for sequence violations
   - Statistics for continuity violations

## Architecture

### Key Components

```typescript
// Core classes
HeartbeatWarningSystem     // Main monitoring system
HeartbeatRecord           // Heartbeat data structure
CoordinatorHealth         // Health status enum

// Events
heartbeat:warning         // Stale heartbeat detected
coordinator:dead          // Coordinator marked as DEAD
coordinator:recovered     // Coordinator recovered from warning state
cleanup:complete          // Cleanup completed successfully
continuity:violation      // Sequence gap detected
error                     // Critical error occurred
```

### Redis Key Structure

```
blocking:heartbeat:{coordinatorId}         → HeartbeatRecord (TTL: 5 min)
blocking:ack:{coordinatorId}:{signalId}    → SignalAck (cleaned on death)
blocking:signal:{coordinatorId}            → Signal (cleaned on death)
blocking:idempotency:{messageId}           → Idempotency (cleaned on death)
```

## Usage

### Basic Setup

```typescript
import Redis from 'ioredis';
import { createHeartbeatWarningSystem } from './heartbeat-warning-system.js';

// Initialize Redis
const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

// Create heartbeat warning system
const warningSystem = createHeartbeatWarningSystem({
  redisClient: redis,
  monitorInterval: 10000,   // Check every 10 seconds
  staleThreshold: 120000,   // Warn if >120 seconds without heartbeat
  maxWarnings: 3,           // Mark as DEAD after 3 consecutive warnings
  autoCleanup: true,        // Automatically cleanup dead coordinator state
});

// Set up event listeners
warningSystem.on('heartbeat:warning', (warning) => {
  console.log(`Warning: ${warning.coordinatorId} stale for ${warning.staleDuration}ms`);
});

warningSystem.on('coordinator:dead', (event) => {
  console.error(`CRITICAL: ${event.coordinatorId} marked as DEAD - ${event.reason}`);
  // Handle dead coordinator (spawn replacement, notify admin, etc.)
});

// Start monitoring
warningSystem.startMonitoring();
```

### Registering Heartbeats

```typescript
// In your coordinator code
const coordinatorId = 'my-coordinator';
let iteration = 0;

// Send heartbeat every 30 seconds
setInterval(async () => {
  iteration++;

  await warningSystem.registerHeartbeat(coordinatorId, iteration, {
    phase: 'current-phase',
    agentCount: 5,
    status: 'running',
  });
}, 30000);
```

### Event Handling

```typescript
// Warning event
warningSystem.on('heartbeat:warning', (warning: HeartbeatWarning) => {
  console.log({
    coordinator: warning.coordinatorId,
    health: warning.health,              // WARNING | CRITICAL | DEAD
    staleDuration: warning.staleDuration, // ms since last heartbeat
    consecutiveWarnings: warning.consecutiveWarnings,
    reason: warning.reason,
  });
});

// Dead coordinator event
warningSystem.on('coordinator:dead', (event) => {
  console.error({
    coordinator: event.coordinatorId,
    reason: event.reason,
    consecutiveWarnings: event.consecutiveWarnings,
  });

  // Handle dead coordinator
  spawnReplacementCoordinator(event.coordinatorId);
});

// Cleanup complete event
warningSystem.on('cleanup:complete', (event) => {
  console.log({
    coordinator: event.coordinatorId,
    keysDeleted: event.keysDeleted,
  });
});

// Continuity violation event
warningSystem.on('continuity:violation', (event) => {
  console.warn({
    coordinator: event.coordinatorId,
    expectedSequence: event.expectedSequence,
    receivedSequence: event.receivedSequence,
    gap: event.gap,
  });
});

// Critical error event
warningSystem.on('error', (error: Error) => {
  if (error.name === 'DeadCoordinatorError') {
    console.error('CRITICAL:', error.message);
    // Escalate to human operator or automated recovery
  }
});
```

### Manual Cleanup

```typescript
// Disable auto-cleanup
const warningSystem = createHeartbeatWarningSystem({
  redisClient: redis,
  autoCleanup: false,
});

// Manually trigger cleanup when needed
await warningSystem.cleanupDeadCoordinator('coordinator-id');
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `redisClient` | `Redis` | **required** | ioredis client instance |
| `monitorInterval` | `number` | `10000` | Monitor interval in ms (10s) |
| `staleThreshold` | `number` | `120000` | Stale threshold in ms (120s) |
| `maxWarnings` | `number` | `3` | Consecutive warnings before DEAD |
| `autoCleanup` | `boolean` | `true` | Auto-cleanup on dead detection |
| `debug` | `boolean` | `false` | Enable debug logging |

## Detection Timeline

```
Time 0s:   Coordinator sends heartbeat
Time 30s:  Coordinator sends heartbeat
Time 60s:  Coordinator sends heartbeat
Time 90s:  Coordinator sends heartbeat
Time 120s: Coordinator STOPS sending heartbeats (FAILURE)

Time 130s: Monitor detects stale (10s after threshold)
           → WARNING #1 → Health: WARNING

Time 140s: Monitor detects still stale
           → WARNING #2 → Health: CRITICAL

Time 150s: Monitor detects still stale
           → WARNING #3 → Health: DEAD
           → Emit coordinator:dead event
           → Emit DeadCoordinatorError
           → Trigger cleanup (if autoCleanup enabled)
```

**Detection Time:** 30 seconds from stale threshold (120s + 10s + 10s + 10s)

## Health Status Levels

```typescript
enum CoordinatorHealth {
  HEALTHY = 'healthy',     // Heartbeat fresh (<120s)
  WARNING = 'warning',     // 1 consecutive stale detection
  CRITICAL = 'critical',   // 2 consecutive stale detections
  DEAD = 'dead',          // 3 consecutive stale detections → cleanup triggered
}
```

## Cleanup Process

When a coordinator is marked as DEAD, the following cleanup occurs:

1. **Find all keys:**
   - `blocking:heartbeat:{coordinatorId}`
   - `blocking:ack:{coordinatorId}:*`
   - `blocking:signal:{coordinatorId}`
   - `blocking:idempotency:*{coordinatorId}*`

2. **Delete in batch:** Single Redis DEL command for all keys

3. **Emit events:**
   - `cleanup:complete` on success
   - `cleanup:failed` on error

4. **Update statistics:**
   - `cleanupsPerformed++`

## Heartbeat Continuity

The system validates heartbeat sequence numbers to detect gaps:

```typescript
// Expected sequence progression
Heartbeat 1: sequence = 1
Heartbeat 2: sequence = 2
Heartbeat 3: sequence = 3
// GAP DETECTED!
Heartbeat 4: sequence = 6  → Emit continuity:violation (gap = 3)
```

Continuity violations are logged but don't trigger warnings (they're informational).

## Statistics

```typescript
const stats = warningSystem.getStatistics();

console.log({
  totalMonitorCycles: stats.totalMonitorCycles,
  warningsIssued: stats.warningsIssued,
  coordinatorsMarkedDead: stats.coordinatorsMarkedDead,
  cleanupsPerformed: stats.cleanupsPerformed,
  continuityViolations: stats.continuityViolations,
  coordinatorsMonitored: stats.coordinatorsMonitored,
  deadCoordinators: stats.deadCoordinators, // Array of coordinator IDs
});
```

## Integration with Blocking Coordination

The Heartbeat Warning System integrates seamlessly with the existing blocking coordination system:

```typescript
import { createBlockingCoordinationSignals } from './blocking-coordination-signals.js';
import { createHeartbeatWarningSystem } from './heartbeat-warning-system.js';

// Initialize both systems
const signalSystem = createBlockingCoordinationSignals({ ... });
const warningSystem = createHeartbeatWarningSystem({ ... });

// Send heartbeat signals
await signalSystem.sendSignal(
  'coordinator-1',
  'coordinator-1',
  SignalType.HEARTBEAT,
  iteration,
  { status: 'healthy' }
);

// Register heartbeat in warning system
await warningSystem.registerHeartbeat('coordinator-1', iteration);
```

## Testing

Run the test suite:

```bash
npm test src/cfn-loop/__tests__/heartbeat-warning-system.test.ts
```

Run the integration example:

```bash
node src/cfn-loop/heartbeat-integration-example.ts
```

## Performance Characteristics

- **Monitor Interval:** 10 seconds (configurable)
- **Stale Threshold:** 120 seconds (configurable)
- **Detection Time:** ~30 seconds after threshold breach
- **Cleanup Time:** <100ms for typical coordinator (4-10 keys)
- **Memory Usage:** ~1KB per monitored coordinator
- **Redis Operations:** 1 GET per coordinator per monitor cycle

## Best Practices

1. **Heartbeat Frequency:** Send heartbeats every 30-60 seconds (well under 120s threshold)

2. **Event Handling:** Always handle `coordinator:dead` event for critical scenarios

3. **Cleanup Strategy:** Enable `autoCleanup` for production, disable for debugging

4. **Monitor Interval:** Don't set <5 seconds (too aggressive) or >30 seconds (too slow)

5. **Statistics:** Monitor `continuityViolations` for network issues or clock skew

6. **Error Handling:** Listen to `error` event for `DeadCoordinatorError` and escalate appropriately

## Troubleshooting

### Issue: False positives (healthy coordinators marked as dead)

**Cause:** Heartbeat frequency > stale threshold
**Solution:** Decrease heartbeat interval or increase `staleThreshold`

### Issue: Detection too slow

**Cause:** Monitor interval too long
**Solution:** Decrease `monitorInterval` (min: 5 seconds recommended)

### Issue: Memory leak

**Cause:** Dead coordinators not being cleaned up
**Solution:** Verify `autoCleanup: true` or manually call `cleanupDeadCoordinator()`

### Issue: Continuity violations

**Cause:** Network issues, clock skew, or coordinator restarts
**Solution:** Investigate network stability and time synchronization (NTP)

## Future Enhancements

- [ ] Configurable cleanup strategies (immediate vs. delayed)
- [ ] Heartbeat history tracking (last N heartbeats)
- [ ] Dynamic threshold adjustment based on network latency
- [ ] Multi-region heartbeat synchronization
- [ ] Coordinator replacement automation
- [ ] Alerting integration (PagerDuty, Slack, etc.)

## Related Documentation

- [Sprint 1.1: Signal ACK Protocol](./SIGNAL_ACK_PROTOCOL.md)
- [Blocking Coordination Architecture](./BLOCKING_COORDINATION.md)
- [CFN Loop Orchestration](./CFN_LOOP_ORCHESTRATOR.md)

## License

Part of Claude Flow Novice - Production Blocking Coordination Epic
