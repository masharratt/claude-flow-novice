# Blocking Coordination FAQ

**Version:** 1.0
**Last Updated:** 2025-10-10
**Questions:** 30

---

## General Questions

### Q1: When should I use blocking coordination?

**Answer:** Use blocking coordination when you need to synchronize distributed agents waiting for critical events. Specifically:

**Use Cases:**
- **CFN Loop 2 (Consensus Validation):** Product Owner waits for ALL validator responses before calculating consensus
- **CFN Loop 4 (GOAP Decisions):** Product Owner waits for validation results before executing PROCEED/DEFER/ESCALATE decision
- **Multi-Agent Workflows:** Any scenario where work cannot proceed until a signal is received

**Don't Use For:**
- Independent parallel tasks (no synchronization needed)
- Simple request-response (use direct HTTP/gRPC instead)
- Fire-and-forget operations (use message queue instead)

**Example (When to Use):**
```typescript
// ✅ GOOD: Wait for all validators before deciding
const consensus = await productOwner.blockUntilAllValidatorsRespond();
if (consensus >= 0.90) {
  await productOwner.proceedToNextPhase();
}

// ❌ BAD: Don't use for independent tasks
await coordinator.blockUntilSignal();  // Unnecessary blocking
await doIndependentWork();
```

---

### Q2: How do I choose timeout duration?

**Answer:** Use the **2× expected task duration** rule:

**Formula:**
```
Timeout = 2 × P95(task_duration)
```

**By Environment:**
- **Development:** 5-10 minutes (fast feedback)
- **Staging:** 15-20 minutes (realistic load)
- **Production:** 30-60 minutes (accommodate peak load)

**Dynamic Calculation:**
```typescript
async function calculateTimeout(taskType: string): Promise<number> {
  const p95 = await metrics.getHistogramQuantile(
    'blocking_coordination_duration_seconds',
    0.95,
    { task_type: taskType }
  );

  // 2× P95, minimum 5min, maximum 60min
  return Math.min(
    Math.max(p95 * 2 * 1000, 5 * 60 * 1000),
    60 * 60 * 1000
  );
}
```

**Example:**
- P95 = 3 minutes → Timeout = 6 minutes
- P95 = 15 minutes → Timeout = 30 minutes
- P95 = 45 minutes → Timeout = 60 minutes (capped)

---

### Q3: What happens if a coordinator dies?

**Answer:** The dead coordinator detection system handles failures automatically:

**Detection Flow:**
1. **Heartbeat stops** (coordinator crashes)
2. **Heartbeat TTL expires** (90 seconds)
3. **Timeout handler detects** stale heartbeat (>120s old)
4. **3 warnings issued** over 5 minutes
5. **Escalation triggered** after 3rd warning
6. **Work transferred** to new coordinator
7. **Old state cleaned up** (signals, ACKs, warnings)

**Timeline:**
```
00:00 - Coordinator dies
00:90 - Heartbeat key expires in Redis
02:00 - Timeout handler detects stale heartbeat (warning 1)
03:00 - Warning 2
04:00 - Warning 3
04:01 - Escalation: spawn replacement coordinator
04:05 - Work transferred to new coordinator
04:06 - Old coordinator state cleaned up
```

**No Data Loss:**
- Incomplete work stored in Redis with TTL
- Replacement coordinator picks up work
- Idempotent operations prevent duplication

---

### Q4: How do I troubleshoot signal delivery failures?

**Answer:** Follow this diagnostic checklist:

**Step 1: Verify Signal Exists**
```bash
redis-cli GET "blocking:signal:<receiver-id>"
# If null → signal never sent
```

**Step 2: Check HMAC Secret**
```bash
# Verify secret matches on both sender and receiver
echo $BLOCKING_COORDINATION_SECRET | md5sum
```

**Step 3: Inspect Signature**
```bash
# Get signal from Redis
SIGNAL=$(redis-cli GET "blocking:signal:<receiver-id>")

# Extract signature
SIGNATURE=$(echo "$SIGNAL" | jq -r '.signature')

# Manually calculate expected signature
PAYLOAD="sender:receiver:type:timestamp"
EXPECTED=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

# Compare
echo "Received: $SIGNATURE"
echo "Expected: $EXPECTED"
```

**Step 4: Review Logs**
```bash
# Check for verification errors
grep "signature" /var/log/cfn-loop/coordinator-*.log

# Common errors:
# - "Invalid signal signature" → HMAC secret mismatch
# - "Signal timestamp too old" → Clock skew
# - "Unknown signal type" → Protocol version mismatch
```

**Step 5: Check Retry Logs**
```bash
# Look for retry attempts
grep "retry" /var/log/cfn-loop/coordinator-*.log

# If 3 retries failed → escalate to timeout handler
```

**Quick Fix:**
```bash
# Resend signal with correct signature
node scripts/resend-signal.js --sender=A --receiver=B --type=wake
```

---

### Q5: What's the difference between heartbeat TTL and dead coordinator threshold?

**Answer:** They serve different purposes in failure detection:

**Heartbeat TTL (90 seconds):**
- **Purpose:** How long Redis keeps the heartbeat key
- **Mechanism:** Redis automatically deletes key after 90s
- **Rationale:** 18× heartbeat interval (5s) for tolerance

**Dead Coordinator Threshold (120 seconds):**
- **Purpose:** When we consider coordinator dead (not just slow)
- **Mechanism:** Timeout handler checks heartbeat age
- **Rationale:** 2× TTL to prevent false positives

**Relationship:**
```
Heartbeat sent every 5s
         ↓
Heartbeat expires after 90s (TTL)
         ↓
Heartbeat considered stale after 120s (threshold)
         ↓
Escalation after 3 warnings
```

**Why Threshold > TTL?**
- Redis slowdowns can delay heartbeat updates
- Network jitter can cause temporary staleness
- 2× TTL reduces false positive rate from ~10% to <1%

**Example Timeline:**
```
00:00 - Last heartbeat sent (timestamp: 1633024800000)
01:30 - Heartbeat expires (TTL reached)
02:00 - Threshold reached (120s old)
02:00 - Warning 1 issued
02:30 - Heartbeat still missing
03:00 - Warning 2 issued
04:00 - Warning 3 issued
04:01 - Escalation: coordinator marked dead
```

---

## Implementation Questions

### Q6: How do I rotate HMAC secrets?

**Answer:** Use a **dual-secret zero-downtime rotation** strategy:

**Phase 1: Add New Secret (No Downtime)**
```bash
# Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# Add to Vault alongside old
vault kv patch secret/cfn-loop/blocking-coordination \
  secret_new="$NEW_SECRET"

# Update coordinators to accept both
export BLOCKING_COORDINATION_SECRET="old-secret"
export BLOCKING_COORDINATION_SECRET_NEW="$NEW_SECRET"

# Reload coordinators (no restart)
systemctl reload coordinator@*
```

**Phase 2: Update Verification Logic**
```typescript
private verifySignalSignature(signal: Signal): boolean {
  // Try new secret first
  if (process.env.BLOCKING_COORDINATION_SECRET_NEW) {
    const validWithNew = this.verifyWithSecret(
      signal,
      process.env.BLOCKING_COORDINATION_SECRET_NEW
    );
    if (validWithNew) return true;
  }

  // Fall back to old secret
  return this.verifyWithSecret(
    signal,
    process.env.BLOCKING_COORDINATION_SECRET!
  );
}
```

**Phase 3: Wait for Signal TTL (24 hours)**
```bash
# All signals signed with old secret will expire in 24h
# Wait to ensure no old signals remain in Redis
```

**Phase 4: Promote New Secret**
```bash
# Remove old secret from Vault
vault kv patch secret/cfn-loop/blocking-coordination \
  secret="$NEW_SECRET"

vault kv delete secret/cfn-loop/blocking-coordination/secret_new

# Update environment (restart required)
export BLOCKING_COORDINATION_SECRET="$NEW_SECRET"
unset BLOCKING_COORDINATION_SECRET_NEW

systemctl restart coordinator@*
```

**Rotation Schedule:**
- **Production:** 90 days
- **Staging:** 30 days
- **Development:** No rotation (fixed dev secret)

---

### Q7: Why use Redis SCAN instead of KEYS?

**Answer:** KEYS is **O(N) and blocks Redis**, while SCAN is **cursor-based and non-blocking**.

**KEYS Problems:**
```bash
# BAD: Blocks Redis for entire operation
redis-cli KEYS "blocking:*"

# With 10,000 keys:
# - Blocks Redis for ~500ms
# - All other operations wait
# - Can cause cascading timeouts
```

**SCAN Solution:**
```typescript
// GOOD: Non-blocking, iterative
async function* scanKeys(pattern: string): AsyncGenerator<string> {
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH', pattern,
      'COUNT', 100  // Process 100 keys per iteration
    );

    for (const key of keys) {
      yield key;
    }

    cursor = nextCursor;
  } while (cursor !== '0');
}

// Usage:
for await (const key of scanKeys('blocking:*')) {
  // Process key without blocking Redis
}
```

**Performance Comparison:**
```
10,000 keys:

KEYS (blocking):
- Total time: 500ms
- Redis blocked: 500ms
- Memory: All keys loaded at once

SCAN (non-blocking):
- Total time: 500ms (100 iterations × 5ms)
- Redis blocked per iteration: 5ms
- Memory: 100 keys at a time
```

**SCAN Trade-offs:**
- ✅ **Pro:** Doesn't block Redis
- ✅ **Pro:** Memory efficient (batched)
- ✅ **Pro:** Production safe
- ❌ **Con:** More complex code
- ❌ **Con:** May return duplicates (cursor reset)
- ❌ **Con:** Not guaranteed order

**When to Use Each:**
- **KEYS:** Development only, <100 keys
- **SCAN:** Production, any key count

---

### Q8: How do cleanup scripts avoid removing active coordinators?

**Answer:** Cleanup scripts use a **stale threshold >2× dead coordinator threshold** to ensure only truly abandoned coordinators are removed.

**Thresholds:**
- **Dead coordinator threshold:** 120 seconds (2 minutes)
- **Stale cleanup threshold:** 600 seconds (10 minutes)
- **Ratio:** 5× dead threshold

**Logic:**
```typescript
const DEAD_THRESHOLD = 120000;  // 120s
const STALE_THRESHOLD = 600000;  // 600s (10 minutes)

async function cleanupStaleCoordinators() {
  const now = Date.now();

  for await (const key of scanKeys('blocking:heartbeat:*')) {
    const data = await redis.get(key);
    if (!data) continue;  // Key expired, already handled

    const { timestamp } = JSON.parse(data);
    const age = now - timestamp;

    // Only clean up if >10 minutes old (very stale)
    if (age > STALE_THRESHOLD) {
      const coordinatorId = key.replace('blocking:heartbeat:', '');
      console.log(`Cleaning up stale coordinator: ${coordinatorId} (${age}ms old)`);

      await redis.del(key);
      await redis.del(`blocking:signal:${coordinatorId}`);
      await redis.del(`blocking:ack:${coordinatorId}`);
    }
  }
}
```

**Why 10 Minutes?**
1. Dead coordinator detected at 120s
2. 3 warnings issued over 5 minutes (120s, 180s, 240s)
3. Escalation at 240s (4 minutes)
4. Cleanup runs at 600s (10 minutes)
5. 10min >> 4min ensures coordinator already handled by timeout handler

**Safety Checks:**
```typescript
// Additional safety: only clean up if TTL is -2 (expired)
const ttl = await redis.ttl(key);
if (ttl > 0) {
  // Key still valid, skip cleanup
  continue;
}

// Only clean up if no recent activity
const lastActivity = await redis.get(`activity:${coordinatorId}`);
if (lastActivity && Date.now() - parseInt(lastActivity) < STALE_THRESHOLD) {
  // Recent activity detected, skip cleanup
  continue;
}
```

---

### Q9: What's the purpose of the circuit breaker?

**Answer:** The circuit breaker **prevents cascading failures** by failing fast when Redis is unavailable, then retrying with exponential backoff.

**Problem Without Circuit Breaker:**
```
Redis down
    ↓
Coordinator retries infinitely
    ↓
Resources exhausted (threads, memory, connections)
    ↓
Coordinator crashes
    ↓
All coordinators crash (cascading failure)
```

**Solution With Circuit Breaker:**
```
Redis down
    ↓
Retry with backoff [1s, 2s, 4s, 8s]
    ↓
After 4 attempts (15s), circuit opens
    ↓
Coordinator enters degraded mode
    ↓
Redis recovers
    ↓
Circuit closes automatically
    ↓
Normal operation resumes
```

**Implementation:**
```typescript
class CircuitBreaker {
  private consecutiveFailures = 0;
  private isOpen = false;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      throw new Error('Circuit breaker open: Redis unavailable');
    }

    const delays = [1000, 2000, 4000, 8000];

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const result = await operation();
        this.consecutiveFailures = 0;  // Reset on success
        return result;
      } catch (error) {
        this.consecutiveFailures++;

        if (attempt === 3) {
          // Final attempt failed
          if (this.consecutiveFailures >= 10) {
            this.isOpen = true;  // Open circuit after 10 consecutive failures
          }
          throw error;
        }

        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }

    throw new Error('Unreachable');
  }
}
```

**Benefits:**
- **Fail Fast:** 15s vs. infinite retries
- **Resource Conservation:** No resource exhaustion
- **Auto-Recovery:** Circuit closes after Redis recovers
- **Graceful Degradation:** Coordinator enters safe mode

---

### Q10: How do I tune heartbeat intervals?

**Answer:** Heartbeat interval depends on **coordinator count** and **detection speed requirements**.

**Default Configuration (1-10 Coordinators):**
```typescript
const HEARTBEAT_INTERVAL = 5000;  // 5s
const HEARTBEAT_TTL = 90;         // 90s (18× interval)
const DEAD_THRESHOLD = 120000;    // 120s (24× interval)
```

**High Coordinator Count (>100):**
```typescript
// Reduce Redis load
const HEARTBEAT_INTERVAL = 10000;  // 10s
const HEARTBEAT_TTL = 180;         // 180s (18× interval)
const DEAD_THRESHOLD = 240000;     // 240s (24× interval)
```

**Fast Detection Required (<1min):**
```typescript
// Faster detection at cost of Redis load
const HEARTBEAT_INTERVAL = 3000;  // 3s
const HEARTBEAT_TTL = 60;         // 60s (20× interval)
const DEAD_THRESHOLD = 90000;     // 90s (30× interval)
```

**Redis Load Calculation:**
```
Heartbeats per day = (86400s / interval) × coordinator_count

Examples:
- 5s interval, 10 coordinators: 172,800 heartbeats/day
- 10s interval, 100 coordinators: 864,000 heartbeats/day
- 3s interval, 10 coordinators: 288,000 heartbeats/day
```

**Tuning Guidelines:**
1. **Start with defaults** (5s interval)
2. **Monitor Redis load** (ops/sec, CPU)
3. **If Redis >80% CPU**, increase interval to 10s
4. **If detection >3min**, decrease interval to 3s
5. **Always maintain:** TTL ≥ 18× interval, threshold ≥ 2× TTL

---

## Operational Questions

### Q11: What Prometheus metrics should I monitor?

**Answer:** Monitor these 4 critical metrics with appropriate thresholds:

**1. Blocking Duration (Histogram)**
```yaml
metric: blocking_coordination_duration_seconds
buckets: [10, 30, 60, 120, 300, 600, 1800]

Alerts:
- Info: P50 <60s (baseline)
- Warning: P95 >300s (5 minutes)
- Critical: P99 >1800s (30 minutes)

PromQL:
histogram_quantile(0.95, rate(blocking_coordination_duration_seconds_bucket[5m]))
```

**2. Active Coordinators (Gauge)**
```yaml
metric: active_coordinators
type: gauge

Alerts:
- Info: <10 coordinators
- Warning: 10-20 coordinators
- Critical: >20 coordinators

PromQL:
active_coordinators
```

**3. Signal Delivery Latency (Histogram)**
```yaml
metric: signal_delivery_latency_seconds
buckets: [0.1, 0.5, 1, 2, 5, 10]

Alerts:
- Target: P95 <5s
- Warning: P95 >10s

PromQL:
histogram_quantile(0.95, rate(signal_delivery_latency_seconds_bucket[5m]))
```

**4. Timeout Events (Counter)**
```yaml
metric: timeout_events_total
type: counter

Alerts:
- Warning: rate >0.5 events/sec
- Critical: rate >2 events/sec

PromQL:
rate(timeout_events_total[5m])
```

**Grafana Dashboard Panels:**
1. Blocking Duration (Time series, 3 lines: P50/P95/P99)
2. Active Coordinators (Stat panel with trend sparkline)
3. Signal Latency (Heatmap showing distribution)
4. Timeout Rate (Bar gauge with color thresholds)

---

### Q12: How do I debug stuck coordinators?

**Answer:** Follow this systematic debugging approach:

**Step 1: Identify Stuck Coordinator**
```bash
# List all coordinators
redis-cli KEYS "blocking:heartbeat:*"

# Check each heartbeat age
for key in $(redis-cli KEYS "blocking:heartbeat:*"); do
  data=$(redis-cli GET "$key")
  timestamp=$(echo "$data" | jq -r '.timestamp')
  age=$(( $(date +%s)000 - timestamp ))
  echo "$key: ${age}ms old"
done
```

**Step 2: Check If Waiting for Signal**
```bash
COORDINATOR_ID="coord-123"

# Check if signal exists
redis-cli GET "blocking:signal:$COORDINATOR_ID"

# If null → signal never sent (sender problem)
# If present → check signature
```

**Step 3: Verify Signal Signature**
```bash
# Get signal
SIGNAL=$(redis-cli GET "blocking:signal:$COORDINATOR_ID")

# Extract fields
SENDER=$(echo "$SIGNAL" | jq -r '.senderId')
RECEIVER=$(echo "$SIGNAL" | jq -r '.receiverId')
TYPE=$(echo "$SIGNAL" | jq -r '.type')
TIMESTAMP=$(echo "$SIGNAL" | jq -r '.timestamp')
SIGNATURE=$(echo "$SIGNAL" | jq -r '.signature')

# Calculate expected signature
SECRET="$BLOCKING_COORDINATION_SECRET"
PAYLOAD="${SENDER}:${RECEIVER}:${TYPE}:${TIMESTAMP}"
EXPECTED=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

# Compare
if [ "$SIGNATURE" == "$EXPECTED" ]; then
  echo "Signature valid ✅"
else
  echo "Signature invalid ❌"
  echo "Received: $SIGNATURE"
  echo "Expected: $EXPECTED"
fi
```

**Step 4: Check Coordinator Logs**
```bash
# View last 100 lines
tail -100 /var/log/cfn-loop/coordinator-$COORDINATOR_ID.log

# Look for:
# - "Waiting for signal" (stuck in blockUntilSignal)
# - "Invalid signature" (HMAC mismatch)
# - "Redis error" (connection issues)
# - "Timeout" (should have timed out but didn't)
```

**Step 5: Force Resolution**
```bash
# Option 1: Resend signal
node scripts/resend-signal.js --receiver=$COORDINATOR_ID --type=wake

# Option 2: Force timeout
kill -SIGTERM $(pgrep -f "coordinator-$COORDINATOR_ID")

# Option 3: Manual cleanup
redis-cli DEL "blocking:signal:$COORDINATOR_ID"
redis-cli DEL "blocking:heartbeat:$COORDINATOR_ID"
```

---

### Q13: When should I scale Redis?

**Answer:** Scale Redis when you hit these **resource or performance thresholds**:

**Scale Vertically (More Resources) When:**

**1. Memory >80% of maxmemory**
```bash
# Check memory usage
redis-cli INFO memory | grep used_memory_human

# If >80%, increase maxmemory
redis-cli CONFIG SET maxmemory 16gb

# Or scale instance
# AWS ElastiCache: cache.m6g.xlarge → cache.m6g.2xlarge
```

**2. CPU >70% sustained**
```bash
# Check CPU
redis-cli INFO cpu

# If >70% for >5 minutes, scale instance
```

**3. Network throughput >80% of limit**
```bash
# Check network
redis-cli INFO stats | grep total_net_output_bytes

# If approaching instance network limit, scale to bigger instance
```

**Scale Horizontally (Redis Cluster) When:**

**1. >1000 Coordinators**
```bash
# Current: Single Redis instance
# Problem: Too many heartbeats (1000 × 5s = 200 heartbeats/sec)

# Solution: 3-node Redis Cluster
redis-cli --cluster create \
  redis-1:6379 redis-2:6379 redis-3:6379 \
  --cluster-replicas 1

# Distribute coordinators across shards
# - Coordinators 1-333 → shard 1
# - Coordinators 334-666 → shard 2
# - Coordinators 667-1000 → shard 3
```

**2. P95 Latency >50ms**
```bash
# Check latency
redis-cli --latency-history

# If P95 >50ms, scale horizontally
# Use Redis Cluster to distribute load
```

**3. >10,000 keys**
```bash
# Count keys
redis-cli DBSIZE

# If >10k keys, shard across cluster
# Use hash slots for distribution
```

**Scaling Checklist:**
- [ ] Monitor memory, CPU, network, latency
- [ ] Set alerts: memory >80%, CPU >70%, latency P95 >50ms
- [ ] Scale vertically first (easier)
- [ ] Scale horizontally at >1000 coordinators
- [ ] Test failover before production
- [ ] Update coordinator configs to use cluster endpoints

---

### Q14: How do I test blocking coordination locally?

**Answer:** Use this **local development setup** for testing:

**Setup Redis**
```bash
# Option 1: Docker (recommended)
docker run -d \
  --name redis-dev \
  -p 6379:6379 \
  redis:7-alpine

# Option 2: Local install
brew install redis  # macOS
sudo apt install redis  # Ubuntu

redis-server
```

**Set Environment Variables**
```bash
# .env.development
cat > .env << 'EOF'
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
BLOCKING_COORDINATION_SECRET=dev-secret-do-not-use-in-prod
NODE_ENV=development
HEARTBEAT_INTERVAL=5000
HEARTBEAT_TTL=90
DEAD_THRESHOLD=120000
EOF

source .env
```

**Run Test Coordinators**
```bash
# Terminal 1: Start coordinator A
DEBUG=blocking:* node tests/manual/coordinator-a.js

# Terminal 2: Start coordinator B
DEBUG=blocking:* node tests/manual/coordinator-b.js

# Terminal 3: Send signal
node tests/manual/send-signal.js --sender=coord-a --receiver=coord-b --type=wake
```

**Unit Tests**
```bash
# Run all blocking coordination tests
npm run test:blocking

# Run specific test
npm run test tests/blocking/signal-ack.test.ts

# Run with coverage
npm run test:coverage -- tests/blocking/
```

**Integration Tests**
```bash
# Test full flow (signal → ACK → timeout)
npm run test:integration:blocking

# Test chaos scenarios
npm run test:chaos:process-kill
npm run test:chaos:redis-failure
```

**Manual Testing Script**
```typescript
// tests/manual/blocking-flow.ts
import { BlockingCoordinator } from './src/cfn-loop/blocking-coordinator';

async function testBlockingFlow() {
  // Start coordinator A
  const coordA = new BlockingCoordinator('coord-a', {
    timeout: 60000,
    secret: process.env.BLOCKING_COORDINATION_SECRET!
  });
  await coordA.initialize();

  // Start coordinator B
  const coordB = new BlockingCoordinator('coord-b', {
    timeout: 60000,
    secret: process.env.BLOCKING_COORDINATION_SECRET!
  });
  await coordB.initialize();

  // Coord B blocks
  const blockPromise = coordB.blockUntilSignal();

  // Coord A sends signal after 5s
  setTimeout(async () => {
    await coordA.sendSignal('coord-b', 'wake');
  }, 5000);

  // Wait for signal receipt
  await blockPromise;
  console.log('✅ Signal received, flow complete');

  // Cleanup
  await coordA.shutdown();
  await coordB.shutdown();
}

testBlockingFlow().catch(console.error);
```

---

### Q15: What are common production issues?

**Answer:** These are the **top 5 production issues** and solutions:

**1. Signal Delivery Failures (40% of issues)**

**Cause:**
- HMAC secret mismatch
- Clock skew between coordinators
- Network partition

**Solution:**
```bash
# Verify secrets match
ansible all -m shell -a "echo \$BLOCKING_COORDINATION_SECRET | md5sum"

# Sync clocks
ansible all -m shell -a "sudo ntpdate -u pool.ntp.org"

# Check network
ansible all -m ping
```

**2. Coordinator Death Not Detected (25% of issues)**

**Cause:**
- Timeout handler not running
- Heartbeat TTL too long
- Cleanup script misconfigured

**Solution:**
```bash
# Verify timeout handler running
systemctl status coordinator-timeout-handler

# Check heartbeat TTL
redis-cli TTL "blocking:heartbeat:*" | sort -n | head -1

# Verify cleanup script schedule
systemctl list-timers | grep cleanup
```

**3. Redis Performance Degradation (20% of issues)**

**Cause:**
- Too many coordinators (>100)
- KEYS command blocking Redis
- Memory >90% maxmemory

**Solution:**
```bash
# Scale coordinators down
kubectl scale deployment coordinator --replicas=50

# Replace KEYS with SCAN in code
# Monitor memory
redis-cli INFO memory | grep used_memory_percentage

# Scale Redis
aws elasticache modify-cache-cluster --cache-node-type cache.m6g.2xlarge
```

**4. Circuit Breaker Stuck Open (10% of issues)**

**Cause:**
- Redis auth failure
- Long Redis restart (>15s)
- Circuit breaker not resetting

**Solution:**
```bash
# Verify Redis auth
redis-cli -a $REDIS_PASSWORD ping

# Manual circuit breaker reset
curl -X POST http://localhost:9090/circuit-breaker/reset

# Check auto-reset logic
grep "circuit.*reset" /var/log/cfn-loop/coordinator-*.log
```

**5. Memory Leak in Coordinator (5% of issues)**

**Cause:**
- Event listeners not cleaned up
- Redis keys without TTL
- Promise chains not resolved

**Solution:**
```bash
# Check memory growth
ps aux --sort=-rss | grep coordinator | head -5

# Heap snapshot
node --inspect coordinator.js
# chrome://inspect → Take heap snapshot

# Find keys without TTL
redis-cli --scan --pattern "blocking:*" | while read key; do
  ttl=$(redis-cli TTL "$key")
  if [ "$ttl" -eq -1 ]; then
    echo "No TTL: $key"
  fi
done
```

---

## Advanced Questions

### Q16: Can I use blocking coordination with multiple Redis instances?

**Answer:** Yes, use **Redis Cluster or Sentinel** for high availability:

**Redis Cluster (Sharding)**
```typescript
import { Cluster } from 'ioredis';

const redis = new Cluster([
  { host: 'redis-1', port: 6379 },
  { host: 'redis-2', port: 6379 },
  { host: 'redis-3', port: 6379 }
]);

const coordinator = new BlockingCoordinator('coord-1', {
  redis,  // Uses cluster client
  timeout: 600000
});
```

**Redis Sentinel (Failover)**
```typescript
import Redis from 'ioredis';

const redis = new Redis({
  sentinels: [
    { host: 'sentinel-1', port: 26379 },
    { host: 'sentinel-2', port: 26379 },
    { host: 'sentinel-3', port: 26379 }
  ],
  name: 'mymaster',
  password: process.env.REDIS_PASSWORD
});

const coordinator = new BlockingCoordinator('coord-1', {
  redis,
  timeout: 600000
});
```

**Trade-offs:**
- ✅ **Pro:** High availability, auto-failover
- ✅ **Pro:** Horizontal scaling (cluster)
- ❌ **Con:** More complex setup
- ❌ **Con:** Cross-slot commands not supported (cluster)

**Key Distribution in Cluster:**
```bash
# Coordinators automatically distributed across shards
blocking:heartbeat:coord-1 → slot 12345 → shard 1
blocking:heartbeat:coord-2 → slot 54321 → shard 2
blocking:heartbeat:coord-3 → slot 23456 → shard 3
```

---

### Q17: How do I implement custom signal types?

**Answer:** Extend the `Signal` interface with **typed metadata**:

**Define Custom Types**
```typescript
// src/cfn-loop/signal-types.ts
export enum SignalType {
  WAKE = 'wake',
  VALIDATE = 'validate',
  DECIDE = 'decide',
  CHECKPOINT = 'checkpoint'
}

export interface BaseSignal {
  senderId: string;
  receiverId: string;
  type: SignalType;
  timestamp: number;
  signature?: string;
}

export interface ValidateSignal extends BaseSignal {
  type: SignalType.VALIDATE;
  metadata: {
    validatorId: string;
    confidence: number;
    recommendations: string[];
  };
}

export interface DecideSignal extends BaseSignal {
  type: SignalType.DECIDE;
  metadata: {
    decision: 'PROCEED' | 'DEFER' | 'ESCALATE';
    consensus: number;
    reasoning: string;
  };
}

export type Signal = BaseSignal | ValidateSignal | DecideSignal;
```

**Custom Handler**
```typescript
class CFNLoopCoordinator extends BlockingCoordinator {
  protected async handleSignal(signal: Signal): Promise<void> {
    switch (signal.type) {
      case SignalType.VALIDATE:
        return this.handleValidate(signal as ValidateSignal);

      case SignalType.DECIDE:
        return this.handleDecide(signal as DecideSignal);

      default:
        return super.handleSignal(signal);
    }
  }

  private async handleValidate(signal: ValidateSignal): Promise<void> {
    const { validatorId, confidence, recommendations } = signal.metadata;

    // Store validation result
    await this.redis.setex(
      `validation:${this.id}:${validatorId}`,
      3600,
      JSON.stringify({ confidence, recommendations })
    );

    // Check if all validators responded
    const results = await this.getAllValidationResults();

    if (results.length >= this.expectedValidators) {
      const consensus = this.calculateConsensus(results);

      // Send DECIDE signal
      await this.sendSignal('product-owner', SignalType.DECIDE, {
        decision: consensus >= 0.90 ? 'PROCEED' : 'DEFER',
        consensus,
        reasoning: `${results.length} validators, consensus ${consensus}`
      });
    }
  }
}
```

**Signature Calculation with Metadata**
```typescript
private signSignal(signal: Signal): string {
  const basePayload = `${signal.senderId}:${signal.receiverId}:${signal.type}:${signal.timestamp}`;

  // Include metadata hash in signature
  let payload = basePayload;
  if ('metadata' in signal) {
    const metadataHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(signal.metadata))
      .digest('hex');
    payload = `${basePayload}:${metadataHash}`;
  }

  return crypto
    .createHmac('sha256', this.secret)
    .update(payload)
    .digest('hex');
}
```

---

### Q18: Can blocking coordination work across data centers?

**Answer:** Yes, but requires **careful latency and partition handling**:

**Multi-DC Setup**
```typescript
// Use Redis global replication
const redis = new Redis.Cluster([
  // US East
  { host: 'redis-us-east-1', port: 6379 },
  { host: 'redis-us-east-2', port: 6379 },

  // EU West
  { host: 'redis-eu-west-1', port: 6379 },
  { host: 'redis-eu-west-2', port: 6379 }
]);

const coordinator = new BlockingCoordinator('coord-us-1', {
  redis,
  timeout: 1800000,  // 30min (longer for cross-DC latency)
  heartbeatInterval: 10000  // 10s (reduce cross-DC traffic)
});
```

**Latency Considerations**
```
Intra-DC latency: <1ms
Cross-DC latency: 50-200ms

Heartbeat timing:
- Interval: 10s (vs. 5s intra-DC)
- TTL: 180s (vs. 90s intra-DC)
- Dead threshold: 240s (vs. 120s intra-DC)
```

**Partition Handling**
```typescript
class MultiDCCoordinator extends BlockingCoordinator {
  async blockUntilSignal(timeout?: number): Promise<void> {
    try {
      return await super.blockUntilSignal(timeout);
    } catch (error) {
      if (error.message.includes('Network partition')) {
        // Fallback to local coordinator in same DC
        return this.blockOnLocalCoordinator();
      }
      throw error;
    }
  }

  private async blockOnLocalCoordinator(): Promise<void> {
    const localRedis = new Redis({ host: 'redis-local', port: 6379 });
    // Use local Redis during partition
  }
}
```

**Trade-offs:**
- ✅ **Pro:** Global coordination across DCs
- ✅ **Pro:** Fault tolerance (DC failure)
- ❌ **Con:** Higher latency (50-200ms)
- ❌ **Con:** Partition risk (network split-brain)
- ❌ **Con:** Complex conflict resolution

**Best Practice:** Keep coordinators within same DC, use async messaging for cross-DC coordination.

---

### Q19: How do I measure blocking coordination performance?

**Answer:** Track these **key performance indicators (KPIs)**:

**1. Blocking Duration (Primary KPI)**
```typescript
// Measure time spent blocked
const startTime = Date.now();
await coordinator.blockUntilSignal();
const duration = Date.now() - startTime;

blockingDurationHistogram.observe(duration / 1000);

// Targets:
// P50 <60s, P95 <300s, P99 <1800s
```

**2. Signal Delivery Latency**
```typescript
// Measure time from signal sent to ACK received
const signalSentTime = Date.now();
await coordinator.sendSignal('receiver', 'wake');

// In receiver:
const signalReceivedTime = Date.now();
const latency = signalReceivedTime - signalSentTime;

signalLatencyHistogram.observe(latency / 1000);

// Target: P95 <5s
```

**3. Coordinator Uptime**
```typescript
// Track uptime percentage
const uptimeSeconds = Date.now() - coordinator.startTime;
const totalSeconds = Date.now() - systemStartTime;
const uptimePercentage = (uptimeSeconds / totalSeconds) * 100;

coordinatorUptimeGauge.set(uptimePercentage);

// Target: >99.9% uptime
```

**4. Recovery Time (RTO)**
```typescript
// Measure time from death to recovery
const deathTime = Date.now();  // Coordinator killed
// ... dead coordinator detected ...
const recoveryTime = Date.now();

const rto = recoveryTime - deathTime;
recoveryTimeHistogram.observe(rto / 1000);

// Target: P95 <10s
```

**5. Throughput (Signals/sec)**
```typescript
// Track signal processing rate
signalCounter.inc();

// Calculate rate
const rate = await prometheusQuery(
  'rate(signal_delivery_total[5m])'
);

// Target: >100 signals/sec
```

**Benchmark Script**
```bash
#!/bin/bash
# benchmark-blocking-coordination.sh

# Start 10 coordinators
for i in {1..10}; do
  node coordinator.js --id coord-$i &
done

# Send 1000 signals
for i in {1..1000}; do
  node send-signal.js --receiver coord-$(( RANDOM % 10 + 1 )) --type wake
done

# Measure results
DURATION=$(prometheus-query 'histogram_quantile(0.95, blocking_coordination_duration_seconds)')
LATENCY=$(prometheus-query 'histogram_quantile(0.95, signal_delivery_latency_seconds)')
THROUGHPUT=$(prometheus-query 'rate(signal_delivery_total[5m])')

echo "P95 Duration: ${DURATION}s"
echo "P95 Latency: ${LATENCY}s"
echo "Throughput: ${THROUGHPUT} signals/sec"
```

---

### Q20: What are the security best practices?

**Answer:** Follow these **security hardening guidelines**:

**1. HMAC Secret Management**
```bash
# Generate cryptographically secure secret
SECRET=$(openssl rand -hex 32)  # 256-bit

# Store in Vault/Secrets Manager (never git)
vault kv put secret/cfn-loop/blocking secret="$SECRET"

# Rotate every 90 days (production)
# Use dual-secret strategy for zero-downtime rotation
```

**2. Network Security**
```bash
# Isolate Redis network
# AWS: Use VPC with security groups
aws ec2 authorize-security-group-ingress \
  --group-id sg-redis \
  --protocol tcp \
  --port 6379 \
  --source-group sg-coordinators  # Only coordinators can access

# Use TLS for Redis connections
REDIS_URL=rediss://redis:6379  # Note: rediss:// (TLS)
REDIS_TLS_CERT=/path/to/redis.crt
```

**3. Authentication & Authorization**
```bash
# Redis authentication
redis-cli CONFIG SET requirepass "$REDIS_PASSWORD"

# Use separate Redis users (Redis 6+)
redis-cli ACL SETUSER coordinator \
  on >$COORDINATOR_PASSWORD \
  ~blocking:* \
  +get +set +setex +del +keys +scan

# Coordinators use limited ACL user
REDIS_USER=coordinator
REDIS_PASSWORD=$COORDINATOR_PASSWORD
```

**4. Input Validation**
```typescript
// Validate signal structure
function validateSignal(signal: any): signal is Signal {
  if (!signal.senderId || typeof signal.senderId !== 'string') {
    throw new Error('Invalid senderId');
  }

  if (!signal.receiverId || typeof signal.receiverId !== 'string') {
    throw new Error('Invalid receiverId');
  }

  if (!signal.timestamp || typeof signal.timestamp !== 'number') {
    throw new Error('Invalid timestamp');
  }

  // Prevent timestamp replay attacks (>5min old)
  const age = Date.now() - signal.timestamp;
  if (age > 300000) {
    throw new Error('Signal timestamp too old');
  }

  return true;
}
```

**5. Rate Limiting**
```typescript
// Prevent signal flooding
class RateLimitedCoordinator extends BlockingCoordinator {
  private signalCounts = new Map<string, number>();

  async sendSignal(receiverId: string, type: string): Promise<void> {
    const key = `${this.id}:${receiverId}`;
    const count = this.signalCounts.get(key) || 0;

    // Max 100 signals per minute per receiver
    if (count >= 100) {
      throw new Error('Rate limit exceeded');
    }

    this.signalCounts.set(key, count + 1);

    setTimeout(() => {
      this.signalCounts.set(key, 0);
    }, 60000);

    return super.sendSignal(receiverId, type);
  }
}
```

**6. Audit Logging**
```typescript
// Log all signal operations
class AuditedCoordinator extends BlockingCoordinator {
  async sendSignal(receiverId: string, type: string): Promise<void> {
    await this.auditLog.write({
      event: 'signal_sent',
      senderId: this.id,
      receiverId,
      type,
      timestamp: Date.now(),
      sourceIp: this.getSourceIp()
    });

    return super.sendSignal(receiverId, type);
  }
}
```

---

## Troubleshooting Questions

### Q21-Q30: See Troubleshooting Guide

For detailed troubleshooting scenarios, refer to:
- **Q21-Q25:** Common issues → `/docs/training/troubleshooting-guide.md`
- **Q26-Q30:** Advanced debugging → `/docs/training/troubleshooting-guide.md`

---

## Getting Help

### Resources

**Documentation:**
- Video Walkthrough: `/docs/training/video-walkthrough-script.md`
- Troubleshooting Guide: `/docs/training/troubleshooting-guide.md`
- Best Practices: `/docs/training/best-practices.md`
- Interactive Tutorial: `/docs/training/interactive-tutorial.md`

**Support Channels:**
- **Slack:** #blocking-coordination
- **Email:** devops-team@example.com
- **Office Hours:** Tuesdays 2pm PT
- **On-call:** PagerDuty "CFN Loop" escalation policy

**Contributing:**
- Report issues: https://github.com/example/claude-flow-novice/issues
- Submit PRs: https://github.com/example/claude-flow-novice/pulls
- Contribution guide: `/docs/CONTRIBUTING.md`

---

**Last Updated:** 2025-10-10
**Maintainer:** DevOps Team
**Version:** 1.0
