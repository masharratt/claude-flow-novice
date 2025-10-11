# Cleanup Architecture for Blocking Coordination

**Date:** 2025-10-10
**Context:** Task 3.2 Auto-Recovery Mechanisms clarification
**Question:** "How will the cleanup script run? Is this a background process we need to implement with each session?"

---

## Two Cleanup Patterns in Our Architecture

### Pattern 1: Long-Running Background Process (SwarmRegistry Model)

**How it works:**
```javascript
// src/redis/swarm-registry.js pattern
class SwarmRegistry {
  initialize() {
    // Start cleanup timer when service initializes
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpiredSwarms();
      await this.cleanupCache();
    }, this.config.cleanupInterval); // Every 5 minutes
  }

  async shutdown() {
    // Stop cleanup timer when service shuts down
    clearInterval(this.cleanupTimer);
  }
}
```

**Characteristics:**
- ✅ Runs continuously in background
- ✅ Self-contained (no external cron needed)
- ✅ Stops when process exits
- ❌ Requires long-running Node.js process
- ❌ No cleanup if process isn't running

**Examples in our codebase:**
- `src/redis/swarm-registry.js` - Cleanup every 5 minutes
- `src/redis/swarm-coordinator.js` - Leadership election, task distribution
- `src/production/production-monitoring.js` - Metrics collection every 30s

**Use case:** Services that are expected to run continuously (production servers, monitoring daemons)

---

### Pattern 2: On-Demand Script (Cleanup-Idle-Sessions Model)

**How it works:**
```bash
#!/bin/bash
# scripts/cleanup-idle-sessions.sh
# Run manually or via cron/systemd timer

# Find orphaned states
# Clean them up
# Exit
```

**Characteristics:**
- ✅ No background process required
- ✅ Can run via cron/systemd timer
- ✅ Works even if main service is down
- ✅ Stateless - just cleans and exits
- ❌ Requires external scheduling (cron)
- ❌ Not real-time (runs on schedule)

**Examples in our codebase:**
- `scripts/cleanup-idle-sessions.sh` - Kills idle Claude processes
- Manual execution or cron job

**Use case:** Periodic maintenance tasks that don't need to run continuously

---

## Recommended Approach for Blocking Coordination Cleanup

### Hybrid: On-Demand Script + Optional Background Process

**Why hybrid?**
1. **CFN Loop sessions are ephemeral** - Not a long-running service
2. **Cleanup needed even when agents offline** - Orphaned Redis keys persist
3. **Real-time cleanup is nice-to-have** - But not critical (5-minute delay acceptable)

### Implementation Strategy

#### Option A: Standalone Cleanup Script (RECOMMENDED)

**Create:** `scripts/cleanup-blocking-coordination.sh`

```bash
#!/bin/bash
# Cleanup orphaned blocking coordination state
# Safe for automated execution via cron

REDIS_PASS="${REDIS_PASSWORD:-default_password}"
LOGFILE="${HOME}/.claude-flow/logs/blocking-cleanup.log"
mkdir -p "$(dirname "$LOGFILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"
}

log "=== Starting Blocking Coordination Cleanup ==="

# Find coordinators with stale heartbeats (>10 minutes)
STALE_COORDINATORS=$(redis-cli --pass "$REDIS_PASS" --no-auth-warning --scan --pattern "coordination:heartbeat:*" | while read key; do
  HEARTBEAT=$(redis-cli --pass "$REDIS_PASS" --no-auth-warning get "$key")
  if [ -n "$HEARTBEAT" ]; then
    TIMESTAMP=$(echo "$HEARTBEAT" | jq -r '.timestamp // 0')
    NOW=$(date +%s)
    AGE=$((NOW - TIMESTAMP))

    # If heartbeat >600s old (10 minutes), consider it stale
    if [ $AGE -gt 600 ]; then
      COORDINATOR=$(echo "$HEARTBEAT" | jq -r '.coordinator')
      echo "$COORDINATOR:$AGE"
    fi
  fi
done)

if [ -z "$STALE_COORDINATORS" ]; then
  log "No stale coordinators found. All heartbeats fresh."
  exit 0
fi

# Cleanup stale coordinator state
while IFS=: read -r COORDINATOR AGE; do
  log "Cleaning up stale coordinator: $COORDINATOR (heartbeat ${AGE}s old)"

  # Delete heartbeat
  redis-cli --pass "$REDIS_PASS" --no-auth-warning del "coordination:heartbeat:$COORDINATOR" >/dev/null

  # Delete signal
  redis-cli --pass "$REDIS_PASS" --no-auth-warning del "coordination:signal:$COORDINATOR:complete" >/dev/null

  # Delete ACK
  redis-cli --pass "$REDIS_PASS" --no-auth-warning del "coordination:ack:$COORDINATOR:complete" >/dev/null

  # Clear retry queue
  redis-cli --pass "$REDIS_PASS" --no-auth-warning del "coordination:retry:$COORDINATOR" >/dev/null

  # Delete agent state
  redis-cli --pass "$REDIS_PASS" --no-auth-warning del "agent:$COORDINATOR:state" >/dev/null

  log "  ✅ Cleaned up all state for $COORDINATOR"
done <<< "$STALE_COORDINATORS"

# Cleanup orphaned retry queues (no corresponding coordinator)
ORPHANED_QUEUES=$(redis-cli --pass "$REDIS_PASS" --no-auth-warning --scan --pattern "coordination:retry:*" | while read key; do
  COORDINATOR=$(echo "$key" | sed 's/coordination:retry://')

  # Check if coordinator heartbeat exists
  HB_EXISTS=$(redis-cli --pass "$REDIS_PASS" --no-auth-warning exists "coordination:heartbeat:$COORDINATOR")

  if [ "$HB_EXISTS" = "0" ]; then
    echo "$key"
  fi
done)

if [ -n "$ORPHANED_QUEUES" ]; then
  log "Cleaning up orphaned retry queues:"
  while read queue; do
    log "  - $queue"
    redis-cli --pass "$REDIS_PASS" --no-auth-warning del "$queue" >/dev/null
  done <<< "$ORPHANED_QUEUES"
fi

log "=== Cleanup Complete ==="
```

**Scheduling with systemd timer** (production):
```ini
# /etc/systemd/system/blocking-cleanup.timer
[Unit]
Description=Blocking Coordination Cleanup Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/blocking-cleanup.service
[Unit]
Description=Blocking Coordination Cleanup

[Service]
Type=oneshot
ExecStart=/path/to/scripts/cleanup-blocking-coordination.sh
Environment=REDIS_PASSWORD=your_password_here
```

**Scheduling with cron** (simpler):
```cron
# Run every 5 minutes
*/5 * * * * /path/to/scripts/cleanup-blocking-coordination.sh
```

**Manual execution** (development):
```bash
# Run immediately
./scripts/cleanup-blocking-coordination.sh

# Or via npm script
npm run cleanup:blocking
```

---

#### Option B: Background Cleanup Service (OPTIONAL)

**Create:** `src/redis/blocking-coordinator-janitor.js`

```javascript
/**
 * BlockingCoordinatorJanitor - Background cleanup service
 * Only run this if you have a long-running orchestration service
 */

const Redis = require('ioredis');

class BlockingCoordinatorJanitor {
  constructor(redisConfig = {}) {
    this.redis = new Redis(redisConfig);

    this.config = {
      cleanupInterval: 300000, // 5 minutes
      staleThreshold: 600000,  // 10 minutes
      ...redisConfig
    };

    this.cleanupTimer = null;
  }

  /**
   * Start background cleanup
   */
  start() {
    console.log('🧹 BlockingCoordinatorJanitor starting...');

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        console.error('❌ Cleanup failed:', error);
      }
    }, this.config.cleanupInterval);

    // Cleanup on process exit
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  /**
   * Stop background cleanup
   */
  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.redis.disconnect();
    console.log('🧹 BlockingCoordinatorJanitor stopped');
  }

  /**
   * Cleanup stale coordinator state
   */
  async cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    // Find all coordinator heartbeats
    const heartbeatKeys = await this.redis.keys('coordination:heartbeat:*');

    for (const key of heartbeatKeys) {
      try {
        const heartbeat = await this.redis.get(key);
        if (!heartbeat) continue;

        const data = JSON.parse(heartbeat);
        const age = now - (data.timestamp || 0);

        // If heartbeat >10 minutes old, cleanup
        if (age > this.config.staleThreshold) {
          const coordinator = data.coordinator;

          await this.cleanupCoordinator(coordinator);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Failed to process ${key}:`, error);
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} stale coordinators`);
    }
  }

  /**
   * Cleanup all state for a coordinator
   */
  async cleanupCoordinator(coordinatorId) {
    const keys = [
      `coordination:heartbeat:${coordinatorId}`,
      `coordination:signal:${coordinatorId}:complete`,
      `coordination:ack:${coordinatorId}:complete`,
      `coordination:retry:${coordinatorId}`,
      `agent:${coordinatorId}:state`
    ];

    await this.redis.del(...keys);
    console.log(`  ✅ Cleaned up coordinator: ${coordinatorId}`);
  }
}

// If run as standalone service
if (require.main === module) {
  const janitor = new BlockingCoordinatorJanitor({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  });

  janitor.start();
}

module.exports = BlockingCoordinatorJanitor;
```

**When to use this:**
- You have a long-running orchestration service
- You want real-time cleanup (not 5-minute delay)
- You can manage a background Node.js process

**How to run:**
```bash
# As standalone daemon
node src/redis/blocking-coordinator-janitor.js

# Or integrate into existing service
const janitor = new BlockingCoordinatorJanitor(redisConfig);
janitor.start();
```

---

## Recommendation for Production Plan

### Update Task 3.2 with this approach:

```markdown
### Task 3.2: Auto-Recovery Mechanisms

**What Recovery Covers:**
1. **Orphaned State Cleanup** - Remove stale coordinator Redis keys
2. **Failed Signal Retry** - Resend signals with exponential backoff
3. **Dead Coordinator Detection** - Escalate to parent after 2 minutes
4. **Replacement Coordinator Spawning** - Parent spawns NEW coordinator (fresh, no old context)

**What Recovery Does NOT Cover:**
- Cannot revive terminated coordinator in-place
- Cannot restore terminated coordinator's context
- Parent must re-initialize work if coordinator dies mid-execution

**Implementation Approach:**

**Primary: On-Demand Cleanup Script**
- Create `scripts/cleanup-blocking-coordination.sh`
- Finds coordinators with stale heartbeats (>10 minutes)
- Cleans up all associated Redis state
- Logs cleanup actions
- Safe for cron/systemd timer execution

**Scheduling Options:**
1. **Systemd timer** (production): Every 5 minutes
2. **Cron job** (simpler): `*/5 * * * *`
3. **Manual** (development): `npm run cleanup:blocking`

**Optional: Background Cleanup Service**
- Create `src/redis/blocking-coordinator-janitor.js`
- Only if running long-lived orchestration service
- Uses `setInterval()` for continuous cleanup
- Real-time cleanup (no 5-minute delay)

**Success Criteria:**
- Cleanup script removes stale state within 5 minutes
- Zero false positives (doesn't clean active coordinators)
- Logs all cleanup actions for audit
- Works even when main service is down
```

---

## Answer to Your Question

**"Is this a background process we need to implement with each session?"**

**No.** We have two options:

1. **On-demand script** (RECOMMENDED):
   - Runs every 5 minutes via cron/systemd timer
   - No background process per session needed
   - Works even when CFN Loop isn't running
   - Simple, reliable, standard Unix pattern

2. **Background service** (OPTIONAL):
   - Only if you have a long-running orchestration service
   - Uses `setInterval()` in Node.js
   - Real-time cleanup instead of 5-minute delay
   - More complex, requires process management

**For CFN Loop use case:** On-demand script is better because:
- CFN Loop sessions are ephemeral (start/stop frequently)
- Don't want cleanup tied to session lifecycle
- Cron/systemd timer is standard Unix pattern
- Simple to implement and debug
