# Blocking Coordination Best Practices

**Version:** 1.0
**Last Updated:** 2025-10-10
**Audience:** DevOps Engineers, SREs, Backend Developers

---

## 1. Timeout Selection

### Principle
**Timeouts should be 2× the expected task duration** to account for variance while preventing indefinite blocking.

### Guidelines by Environment

**Development (Fast Feedback)**
```typescript
const TIMEOUT_DEVELOPMENT = 5 * 60 * 1000;  // 5 minutes
```
- **Use Case:** Local development, unit tests
- **Rationale:** Fast feedback loop for developers
- **Trade-off:** May timeout on slower machines

**Staging (Realistic Scenarios)**
```typescript
const TIMEOUT_STAGING = 15 * 60 * 1000;  // 15 minutes
```
- **Use Case:** Integration tests, QA validation
- **Rationale:** Matches production load patterns
- **Trade-off:** Longer test runs

**Production (Accommodate Load)**
```typescript
const TIMEOUT_PRODUCTION = 30 * 60 * 1000;  // 30 minutes
```
- **Use Case:** CFN Loop 2 consensus validation, Loop 4 GOAP decisions
- **Rationale:** Handles peak load, slow validators, network jitter
- **Trade-off:** Slower failure detection

### Dynamic Timeout Calculation

**Based on Historical Data**
```typescript
class CoordinatorWithAdaptiveTimeout extends BlockingCoordinator {
  private async calculateTimeout(taskType: string): Promise<number> {
    // Get P95 duration from metrics
    const p95Duration = await this.metrics.getHistogramQuantile(
      'blocking_coordination_duration_seconds',
      0.95,
      { task_type: taskType }
    );

    // 2× P95 with 5min minimum, 60min maximum
    const timeout = Math.min(
      Math.max(p95Duration * 2 * 1000, 5 * 60 * 1000),
      60 * 60 * 1000
    );

    return timeout;
  }

  async blockUntilSignal(): Promise<void> {
    const timeout = await this.calculateTimeout('consensus_validation');
    return super.blockUntilSignal(timeout);
  }
}
```

### Environment-Specific Configuration

**Using Environment Variables**
```bash
# .env.development
BLOCKING_TIMEOUT=300000  # 5 minutes

# .env.staging
BLOCKING_TIMEOUT=900000  # 15 minutes

# .env.production
BLOCKING_TIMEOUT=1800000  # 30 minutes
```

**Loading in Code**
```typescript
const timeout = process.env.BLOCKING_TIMEOUT
  ? parseInt(process.env.BLOCKING_TIMEOUT)
  : 600000;  // Default 10 minutes
```

### Anti-Patterns

**❌ Timeout Too Short (False Positives)**
```typescript
// BAD: 1 minute timeout for 5-minute task
const timeout = 60000;
await this.blockUntilSignal(timeout);
// Result: Frequent timeouts, wasted work
```

**❌ Timeout Too Long (Slow Failure Detection)**
```typescript
// BAD: 24 hour timeout for 10-minute task
const timeout = 24 * 60 * 60 * 1000;
await this.blockUntilSignal(timeout);
// Result: Dead coordinators not detected for 24 hours
```

**❌ No Timeout (Infinite Wait)**
```typescript
// BAD: Blocks forever if signal never arrives
await this.blockUntilSignal(Infinity);
```

---

## 2. Heartbeat Configuration

### Principle
**Heartbeat interval, TTL, and dead threshold form a triad that balances detection speed with false positive prevention.**

### Recommended Values

**Heartbeat Interval: 5 seconds**
```typescript
const HEARTBEAT_INTERVAL = 5000;  // 5s
```
- **Rationale:** Frequent enough for <2min detection, low enough Redis load
- **Trade-off:** 5s = 17,280 heartbeats/day per coordinator (acceptable for <100 coordinators)

**Heartbeat TTL: 90 seconds (18× interval)**
```typescript
const HEARTBEAT_TTL = 90;  // 90s
```
- **Rationale:** 3× detection threshold for network jitter tolerance
- **Trade-off:** Coordinator appears alive for 90s after death

**Dead Coordinator Threshold: 120 seconds (24× interval)**
```typescript
const DEAD_COORDINATOR_THRESHOLD = 120000;  // 120s
```
- **Rationale:** 2× TTL prevents false positives from Redis slowdowns
- **Trade-off:** 2-minute delay before escalation

### Relationship Diagram
```
Heartbeat sent every 5s
↓
Heartbeat expires after 90s (TTL)
↓
Heartbeat considered stale after 120s (threshold)
↓
Escalation after 3 warnings over 5 minutes
```

### Scaling Considerations

**Low Coordinator Count (<10)**
```typescript
// Can afford more frequent heartbeats
const HEARTBEAT_INTERVAL = 3000;  // 3s
const HEARTBEAT_TTL = 60;         // 60s
const DEAD_THRESHOLD = 90000;     // 90s
```

**High Coordinator Count (>100)**
```typescript
// Reduce Redis load
const HEARTBEAT_INTERVAL = 10000;  // 10s
const HEARTBEAT_TTL = 180;         // 180s
const DEAD_THRESHOLD = 240000;     // 240s
```

### Implementation

**Heartbeat Sender**
```typescript
class BlockingCoordinator {
  private startHeartbeat(): void {
    // Send initial heartbeat immediately
    this.sendHeartbeat();

    // Then every HEARTBEAT_INTERVAL
    this.heartbeatInterval = setInterval(
      () => this.sendHeartbeat(),
      HEARTBEAT_INTERVAL
    );
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      await this.redis.setex(
        `blocking:heartbeat:${this.id}`,
        HEARTBEAT_TTL,
        JSON.stringify({
          coordinatorId: this.id,
          timestamp: Date.now(),
          status: 'alive',
          pid: process.pid,
          hostname: os.hostname()
        })
      );
    } catch (error) {
      console.error(`Heartbeat failed: ${error.message}`);
      // Don't throw - coordinator continues running
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
```

**Heartbeat Monitor**
```typescript
class TimeoutHandler {
  async checkCoordinatorActivity(): Promise<void> {
    const keys = await this.scanKeys('blocking:heartbeat:*');

    for (const key of keys) {
      const data = await this.redis.get(key);

      if (!data) {
        // Key expired = coordinator dead
        const coordinatorId = key.replace('blocking:heartbeat:', '');
        await this.handleDeadCoordinator(coordinatorId);
        continue;
      }

      const heartbeat = JSON.parse(data);
      const age = Date.now() - heartbeat.timestamp;

      if (age > DEAD_COORDINATOR_THRESHOLD) {
        await this.escalateStaleCoordinator(heartbeat.coordinatorId, age);
      }
    }
  }
}
```

### Anti-Patterns

**❌ Heartbeat Interval Too Long (Slow Detection)**
```typescript
// BAD: 60s interval = 5+ minute detection time
const HEARTBEAT_INTERVAL = 60000;
```

**❌ TTL < Interval (Heartbeat Expires Between Sends)**
```typescript
// BAD: TTL shorter than interval
const HEARTBEAT_INTERVAL = 10000;  // 10s
const HEARTBEAT_TTL = 5;           // 5s
// Result: Heartbeat expires before next send
```

**❌ Threshold < TTL (False Positives)**
```typescript
// BAD: Threshold shorter than TTL
const HEARTBEAT_TTL = 90;
const DEAD_THRESHOLD = 60000;  // 60s
// Result: Coordinators marked dead while heartbeat still valid
```

---

## 3. Signal Retry Strategy

### Principle
**Retry with exponential backoff balances persistence with resource conservation.**

### Recommended Configuration

**Max Retry Attempts: 3**
```typescript
const MAX_SIGNAL_RETRIES = 3;
```
- **Rationale:** 3 attempts = 7s total delay (1s + 2s + 4s), catches transient failures
- **Trade-off:** More retries = longer latency before escalation

**Exponential Backoff: [1s, 2s, 4s]**
```typescript
const RETRY_DELAYS = [1000, 2000, 4000];
```
- **Rationale:** Matches circuit breaker delays, doubles each attempt
- **Trade-off:** Fixed delays don't adapt to actual failure cause

### Implementation

**Signal Sending with Retry**
```typescript
class BlockingCoordinator {
  async sendSignalWithRetry(
    receiverId: string,
    type: string,
    maxRetries = MAX_SIGNAL_RETRIES
  ): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.sendSignal(receiverId, type);

        // Wait for ACK with timeout
        const ackReceived = await this.waitForAck(receiverId, 5000);

        if (ackReceived) {
          return;  // Success
        }

        throw new Error('ACK timeout');
      } catch (error) {
        if (attempt === maxRetries - 1) {
          // Final attempt failed
          throw new Error(
            `Failed to send signal after ${maxRetries} attempts: ${error.message}`
          );
        }

        const delay = RETRY_DELAYS[attempt];
        console.warn(
          `Signal send failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private async waitForAck(
    senderId: string,
    timeout: number
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const ack = await this.redis.get(`blocking:ack:${this.id}`);

      if (ack) {
        const ackData = JSON.parse(ack);
        if (ackData.receiverId === this.id) {
          await this.redis.del(`blocking:ack:${this.id}`);
          return true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));  // Poll every 100ms
    }

    return false;
  }
}
```

### Give-Up Condition

**Escalate After Max Retries**
```typescript
try {
  await coordinator.sendSignalWithRetry(receiverId, 'wake');
} catch (error) {
  // All retries failed, escalate to timeout handler
  console.error(`Signal delivery failed, escalating: ${error.message}`);

  await timeoutHandler.handleUnreachableCoordinator(receiverId, {
    reason: 'signal_delivery_failure',
    attempts: MAX_SIGNAL_RETRIES,
    error: error.message
  });
}
```

### Advanced: Jittered Backoff

**Prevent Thundering Herd**
```typescript
function getRetryDelay(attempt: number, baseDelay = 1000): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * exponentialDelay * 0.1;  // ±10% jitter
  return exponentialDelay + jitter;
}

// Example: attempt 2 with 1000ms base
// exponentialDelay = 1000 * 2^2 = 4000ms
// jitter = random(0, 400)
// total = 4000-4400ms
```

### Anti-Patterns

**❌ No Retry (Fragile)**
```typescript
// BAD: Single attempt, no retry
await this.sendSignal(receiverId, 'wake');
// Result: Transient failures cause immediate escalation
```

**❌ Infinite Retry (Resource Exhaustion)**
```typescript
// BAD: Retry forever
while (true) {
  try {
    await this.sendSignal(receiverId, 'wake');
    break;
  } catch (error) {
    await sleep(1000);  // Infinite loop
  }
}
```

**❌ Fixed Delay (Thundering Herd)**
```typescript
// BAD: All coordinators retry at same time
for (let i = 0; i < 3; i++) {
  await sleep(5000);  // Always 5s
  await this.sendSignal(receiverId, 'wake');
}
// Result: All coordinators hit Redis simultaneously
```

---

## 4. HMAC Secret Management

### Principle
**HMAC secrets must be cryptographically secure, shared across all coordinators, rotated regularly, and never stored in version control.**

### Secret Generation

**Generate with OpenSSL (256-bit)**
```bash
# Generate new secret
openssl rand -hex 32

# Output: 64-character hex string (256 bits)
# Example: a1b2c3d4e5f6...
```

**Store in Secret Manager**
```bash
# HashiCorp Vault
vault kv put secret/cfn-loop/blocking-coordination \
  secret="$(openssl rand -hex 32)"

# AWS Secrets Manager
aws secretsmanager create-secret \
  --name cfn-loop/blocking-coordination \
  --secret-string "$(openssl rand -hex 32)"

# Kubernetes Secret
kubectl create secret generic blocking-coordination \
  --from-literal=secret="$(openssl rand -hex 32)"
```

### Secret Distribution

**Pull from Vault at Startup**
```typescript
import { VaultClient } from 'vault-client';

class BlockingCoordinator {
  private async loadSecret(): Promise<string> {
    const vault = new VaultClient({
      endpoint: process.env.VAULT_ADDR,
      token: process.env.VAULT_TOKEN
    });

    const { data } = await vault.read('secret/cfn-loop/blocking-coordination');
    return data.secret;
  }

  async initialize() {
    this.secret = await this.loadSecret();
    // Use this.secret for HMAC signing
  }
}
```

**Environment Variable (Least Secure)**
```bash
# Only for development
export BLOCKING_COORDINATION_SECRET="dev-secret-do-not-use-in-prod"

# For production, use secret injection
# Kubernetes: Use secret as env var
# Docker: Use secrets file
# Systemd: Use EnvironmentFile with restricted permissions
```

### Secret Rotation Strategy

**Dual-Secret Zero-Downtime Rotation**

**Phase 1: Add New Secret**
```bash
# Add new secret alongside old
vault kv patch secret/cfn-loop/blocking-coordination \
  secret_new="$(openssl rand -hex 32)"

# Update coordinator to accept both secrets
export BLOCKING_COORDINATION_SECRET="old-secret"
export BLOCKING_COORDINATION_SECRET_NEW="new-secret"
```

**Phase 2: Update Verification Logic**
```typescript
class BlockingCoordinator {
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

  private verifyWithSecret(signal: Signal, secret: string): boolean {
    const payload = `${signal.senderId}:${signal.receiverId}:${signal.type}:${signal.timestamp}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signal.signature!, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }
}
```

**Phase 3: Wait for In-Flight Signals to Clear**
```bash
# Signal TTL is 24 hours
# Wait 24 hours to ensure no signals signed with old secret remain
```

**Phase 4: Promote New Secret**
```bash
# Remove old secret from Vault
vault kv patch secret/cfn-loop/blocking-coordination \
  secret="$BLOCKING_COORDINATION_SECRET_NEW"

vault kv delete secret/cfn-loop/blocking-coordination/secret_new

# Update environment variables
export BLOCKING_COORDINATION_SECRET="$BLOCKING_COORDINATION_SECRET_NEW"
unset BLOCKING_COORDINATION_SECRET_NEW

# Restart coordinators
systemctl restart coordinator@*
```

### Rotation Schedule

**Production: 90 days**
- Aligns with common compliance requirements (PCI DSS, SOC 2)
- Balances security with operational overhead

**Staging: 30 days**
- Tests rotation procedure more frequently
- Catches automation issues before production

**Development: No rotation**
- Use fixed dev secret for simplicity
- Never use dev secret in staging/production

### Anti-Patterns

**❌ Secret in Git**
```bash
# BAD: Secret committed to repository
# .env
BLOCKING_COORDINATION_SECRET=a1b2c3d4e5f6...

# Result: Secret leaked in git history forever
```

**❌ Weak Secret**
```bash
# BAD: Short or predictable secret
export BLOCKING_COORDINATION_SECRET="password123"

# Result: Vulnerable to brute force
```

**❌ Same Secret Across Environments**
```bash
# BAD: Dev, staging, prod use same secret
export BLOCKING_COORDINATION_SECRET="shared-secret"

# Result: Dev compromise affects production
```

**❌ No Rotation**
```bash
# BAD: Secret never rotated
# Created: 2020-01-01
# Current: 2025-10-10
# Last rotated: Never

# Result: Increased risk of compromise over time
```

---

## 5. Redis Key Management

### Principle
**All Redis keys must have TTL, use SCAN instead of KEYS, and follow consistent namespacing to prevent memory leaks and DoS.**

### Always Use TTL

**Set TTL on Every Key**
```typescript
// ❌ BAD: No TTL
await redis.set('blocking:signal:coord-123', JSON.stringify(signal));

// ✅ GOOD: 24h TTL
await redis.setex(
  'blocking:signal:coord-123',
  86400,  // 24 hours
  JSON.stringify(signal)
);
```

**TTL Guidelines**
- **Signals:** 24 hours (24 × 3600 = 86400s)
- **Heartbeats:** 90 seconds
- **ACKs:** 1 hour (3600s)
- **State:** 1 hour (3600s)
- **Warnings:** 5 minutes (300s)

**Verify TTL in Tests**
```typescript
it('should set TTL on signal keys', async () => {
  await coordinator.sendSignal('receiver-1', 'wake');

  const ttl = await redis.ttl('blocking:signal:receiver-1');
  expect(ttl).toBeGreaterThan(86000);  // ~24 hours
  expect(ttl).toBeLessThanOrEqual(86400);
});
```

### Use SCAN Instead of KEYS

**Why KEYS is Dangerous**
```typescript
// ❌ BAD: KEYS blocks Redis (O(N) complexity)
const keys = await redis.keys('blocking:heartbeat:*');

// With 10,000 keys:
// - Blocks Redis for ~500ms
// - All other operations wait
// - Can cause cascading timeouts
```

**SCAN is Non-Blocking**
```typescript
// ✅ GOOD: SCAN is cursor-based (doesn't block)
async function* scanKeys(pattern: string): AsyncGenerator<string> {
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH', pattern,
      'COUNT', 100  // Scan 100 keys per iteration
    );

    for (const key of keys) {
      yield key;
    }

    cursor = nextCursor;
  } while (cursor !== '0');
}

// Usage:
for await (const key of scanKeys('blocking:heartbeat:*')) {
  const data = await redis.get(key);
  // Process key
}
```

**Performance Comparison**
```
10,000 keys in Redis:

KEYS blocking:heartbeat:*
- Time: 500ms
- Blocks: All operations
- Memory: Full result set

SCAN 0 MATCH blocking:heartbeat:* COUNT 100
- Time: 100 iterations × 5ms = 500ms
- Blocks: None (5ms per iteration)
- Memory: 100 keys at a time
```

### Namespace Properly

**Key Naming Convention**
```
blocking:<type>:<identifier>

Examples:
blocking:signal:coord-123
blocking:heartbeat:coord-456
blocking:ack:coord-789
blocking:warning:coord-abc
blocking:state:coord-def
```

**Benefits:**
- Easy to find all blocking-related keys: `blocking:*`
- Group by type: `blocking:signal:*`
- Avoid collisions with other systems

**Implementation**
```typescript
class BlockingCoordinator {
  private keyName(type: string, identifier?: string): string {
    const base = `blocking:${type}`;
    return identifier ? `${base}:${identifier}` : base;
  }

  async sendSignal(receiverId: string, type: string): Promise<void> {
    const key = this.keyName('signal', receiverId);
    await this.redis.setex(key, 86400, JSON.stringify({...}));
  }

  async sendHeartbeat(): Promise<void> {
    const key = this.keyName('heartbeat', this.id);
    await this.redis.setex(key, 90, JSON.stringify({...}));
  }
}
```

### Memory Management

**Monitor Key Count**
```bash
# Count blocking keys
redis-cli --scan --pattern "blocking:*" | wc -l

# Set alert: >10,000 keys
```

**Monitor Memory Usage**
```bash
# Check total memory
redis-cli INFO memory | grep used_memory_human

# Check memory per key type
redis-cli --bigkeys

# Set alert: >80% maxmemory
```

**Eviction Policy**
```bash
# Configure eviction for memory pressure
redis-cli CONFIG SET maxmemory-policy volatile-lru

# Evicts keys with TTL set, least recently used first
# Protects keys without TTL from eviction
```

### Anti-Patterns

**❌ No TTL (Memory Leak)**
```typescript
// BAD: Key lives forever
await redis.set('blocking:signal:coord-123', data);

// Result: Redis memory grows unbounded
```

**❌ Using KEYS in Production (DoS)**
```typescript
// BAD: Blocks Redis
const keys = await redis.keys('blocking:*');

// Result: 500ms+ blocking time with 10k keys
```

**❌ Inconsistent Namespacing**
```typescript
// BAD: Multiple naming schemes
await redis.set('signal:coord-123', data);
await redis.set('coordinator:signal:456', data);
await redis.set('coord_signal_789', data);

// Result: Can't find all related keys
```

---

## 6. Monitoring Thresholds

### Principle
**Thresholds should be set based on percentiles (P50/P95/P99) to capture both typical and tail behavior.**

### Blocking Duration Thresholds

**Info: P50 <60s (Baseline)**
```yaml
# Prometheus alert
- alert: BaselineBlockingDuration
  expr: histogram_quantile(0.50, blocking_coordination_duration_seconds) < 60
  labels:
    severity: info
  annotations:
    summary: "Blocking duration baseline: {{ $value }}s"
```
- **Meaning:** Half of blocking operations complete in <60s
- **Action:** No action, informational only

**Warning: P95 >300s (5 minutes)**
```yaml
- alert: HighBlockingDuration
  expr: histogram_quantile(0.95, blocking_coordination_duration_seconds) > 300
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High P95 blocking duration: {{ $value }}s"
    description: "Check validator performance and network"
```
- **Meaning:** 5% of operations take >5 minutes
- **Action:** Investigate slow validators, network issues

**Critical: P99 >1800s (30 minutes)**
```yaml
- alert: CriticalBlockingDuration
  expr: histogram_quantile(0.99, blocking_coordination_duration_seconds) > 1800
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Critical P99 blocking duration: {{ $value }}s"
    description: "Immediate investigation required"
```
- **Meaning:** 1% of operations take >30 minutes
- **Action:** Page on-call, investigate immediately

### Active Coordinator Thresholds

**Info: <10 Coordinators**
```yaml
- alert: NormalCoordinatorCount
  expr: active_coordinators < 10
  labels:
    severity: info
  annotations:
    summary: "{{ $value }} active coordinators"
```
- **Meaning:** Typical workload
- **Action:** None

**Warning: 10-20 Coordinators**
```yaml
- alert: ElevatedCoordinatorCount
  expr: active_coordinators >= 10 and active_coordinators < 20
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "{{ $value }} active coordinators (elevated)"
    description: "Consider scaling Redis or batching work"
```
- **Meaning:** Heavy workload
- **Action:** Monitor Redis performance, consider batching

**Critical: >20 Coordinators**
```yaml
- alert: HighCoordinatorCount
  expr: active_coordinators >= 20
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "{{ $value }} active coordinators (critical)"
    description: "Scale Redis cluster or reduce coordinator spawning"
```
- **Meaning:** Very heavy workload, Redis may be overloaded
- **Action:** Scale Redis, batch work, reduce coordinator count

### Signal Delivery Latency Thresholds

**Target: P95 <5s**
```yaml
- alert: NormalSignalLatency
  expr: histogram_quantile(0.95, signal_delivery_latency_seconds) < 5
  labels:
    severity: info
```

**Warning: P95 >10s**
```yaml
- alert: HighSignalLatency
  expr: histogram_quantile(0.95, signal_delivery_latency_seconds) > 10
  for: 3m
  labels:
    severity: warning
  annotations:
    summary: "High P95 signal latency: {{ $value }}s"
```

### Timeout Event Rate Thresholds

**Warning: >0.5 events/sec**
```yaml
- alert: HighTimeoutRate
  expr: rate(timeout_events_total[5m]) > 0.5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High timeout rate: {{ $value }}/s"
```

**Critical: >2 events/sec**
```yaml
- alert: CriticalTimeoutRate
  expr: rate(timeout_events_total[5m]) > 2
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Critical timeout rate: {{ $value }}/s"
```

---

## 7. Cleanup Script Scheduling

### Principle
**Cleanup must run frequently enough to prevent accumulation but not so often that it overloads Redis.**

### Recommended Frequency: Every 5 Minutes

**Cron Configuration**
```bash
# Edit crontab
crontab -e

# Add cleanup job
*/5 * * * * /usr/bin/node /opt/cfn-loop/config/hooks/cleanup-stale-coordinators.js >> /var/log/cfn-loop/cleanup.log 2>&1
```

**Systemd Timer (Preferred)**
```ini
# /etc/systemd/system/cleanup-coordinators.timer
[Unit]
Description=Cleanup stale coordinator state
Requires=cleanup-coordinators.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
AccuracySec=1s

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/cleanup-coordinators.service
[Unit]
Description=Cleanup stale coordinator state

[Service]
Type=oneshot
ExecStart=/usr/bin/node /opt/cfn-loop/config/hooks/cleanup-stale-coordinators.js
StandardOutput=journal
StandardError=journal
```

```bash
# Enable timer
sudo systemctl enable cleanup-coordinators.timer
sudo systemctl start cleanup-coordinators.timer

# Check status
sudo systemctl list-timers | grep cleanup
```

### Stale Threshold: 10 Minutes

**Definition**
```typescript
const STALE_THRESHOLD = 10 * 60 * 1000;  // 10 minutes
```

**Rationale:**
- 2× dead coordinator threshold (120s)
- Prevents accidental cleanup of slow but alive coordinators
- Allows time for 3 warnings + escalation

**Implementation**
```typescript
async function cleanupStaleCoordinators() {
  const now = Date.now();

  for await (const key of scanKeys('blocking:heartbeat:*')) {
    const data = await redis.get(key);
    if (!data) continue;

    const { timestamp } = JSON.parse(data);
    const age = now - timestamp;

    if (age > STALE_THRESHOLD) {
      const coordinatorId = key.replace('blocking:heartbeat:', '');
      console.log(`Cleaning up stale coordinator: ${coordinatorId} (${age}ms old)`);

      await redis.del(key);
      await redis.del(`blocking:signal:${coordinatorId}`);
      await redis.del(`blocking:ack:${coordinatorId}`);
      await redis.del(`blocking:warning:${coordinatorId}`);
    }
  }
}
```

### Execution Time Target: <60s

**Why 60s?**
- Cleanup runs every 5 minutes
- <60s ensures no overlap between runs
- Allows time for other Redis operations

**Optimization: Use SCAN**
```typescript
// Use SCAN with COUNT to limit per-iteration work
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

// With 10,000 keys:
// - 100 iterations × 5ms = 500ms total
// - Well under 60s target
```

**Monitoring**
```yaml
# Prometheus metric
cleanup_duration_seconds:
  type: histogram
  buckets: [1, 5, 10, 30, 60]

# Alert if cleanup takes >60s
- alert: SlowCleanup
  expr: histogram_quantile(0.95, cleanup_duration_seconds) > 60
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Cleanup taking >60s: {{ $value }}s"
```

---

## 8. Circuit Breaker Tuning

### Principle
**Circuit breaker prevents cascading failures by failing fast when Redis is unavailable, then retrying with exponential backoff.**

### Max Attempts: 4

**Why 4?**
- Total delay: 1s + 2s + 4s + 8s = 15 seconds
- Catches transient failures (network blip, Redis restart)
- Fails fast enough to avoid blocking coordinators for too long

**Implementation**
```typescript
private async redisOperationWithCircuitBreaker<T>(
  operation: () => Promise<T>
): Promise<T> {
  const maxAttempts = 4;
  const delays = [1000, 2000, 4000, 8000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw new Error(`Circuit breaker open: Redis unavailable after ${maxAttempts} attempts`);
      }

      const delay = delays[attempt];
      console.warn(`Redis operation failed (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}
```

### Delays: [1s, 2s, 4s, 8s] (Exponential Backoff)

**Why Exponential?**
- Doubles each attempt (2^n pattern)
- Gives Redis time to recover from temporary overload
- Prevents thundering herd (all coordinators retry at once)

**Backoff Comparison**
```
Fixed (1s each):     1s → 2s → 3s → 4s (too fast, hammers Redis)
Linear (n seconds):  1s → 3s → 6s → 10s (slower start)
Exponential (2^n):   1s → 3s → 7s → 15s (balanced)
```

### Open Threshold: 10 Consecutive Failures

**Why 10?**
- High enough to tolerate intermittent failures
- Low enough to fail fast when Redis is truly down
- 10 failures × 15s = 2.5 minutes before permanent open

**Implementation**
```typescript
class CircuitBreaker {
  private consecutiveFailures = 0;
  private isOpen = false;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await this.retryWithBackoff(operation);
      this.consecutiveFailures = 0;  // Reset on success
      return result;
    } catch (error) {
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= 10) {
        this.isOpen = true;
        console.error('Circuit breaker opened after 10 consecutive failures');
      }

      throw error;
    }
  }

  reset() {
    this.isOpen = false;
    this.consecutiveFailures = 0;
  }
}
```

**Auto-Reset After Cooldown**
```typescript
class CircuitBreaker {
  private openTimestamp: number | null = null;
  private readonly cooldownPeriod = 60000;  // 60 seconds

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Try to close circuit after cooldown
    if (this.isOpen && this.openTimestamp) {
      const elapsed = Date.now() - this.openTimestamp;
      if (elapsed > this.cooldownPeriod) {
        console.log('Circuit breaker cooldown complete, trying half-open state');
        this.isOpen = false;
        this.consecutiveFailures = 0;
      }
    }

    if (this.isOpen) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await this.retryWithBackoff(operation);
      this.consecutiveFailures = 0;
      this.openTimestamp = null;
      return result;
    } catch (error) {
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= 10) {
        this.isOpen = true;
        this.openTimestamp = Date.now();
        console.error('Circuit breaker opened after 10 consecutive failures');
      }

      throw error;
    }
  }
}
```

---

## Summary Checklist

Before deploying blocking coordination to production, verify:

- [ ] Timeout set to 2× expected duration (30min for production)
- [ ] Heartbeat interval 5s, TTL 90s, dead threshold 120s
- [ ] Signal retry: max 3 attempts, exponential backoff [1s, 2s, 4s]
- [ ] HMAC secret 256-bit, stored in Vault/Secrets Manager
- [ ] Secret rotation schedule: 90 days production, 30 days staging
- [ ] All Redis keys have TTL (signals 24h, heartbeats 90s, ACKs 1h)
- [ ] Use SCAN instead of KEYS for all bulk operations
- [ ] Key namespacing: `blocking:<type>:<identifier>`
- [ ] Prometheus alerts configured for all 4 metrics
- [ ] Cleanup script runs every 5 minutes (cron/systemd timer)
- [ ] Cleanup stale threshold 10 minutes, execution <60s
- [ ] Circuit breaker: 4 attempts, [1s, 2s, 4s, 8s] delays, 10 failure threshold
- [ ] Integration tests cover timeout, retry, and cleanup scenarios
- [ ] Grafana dashboard deployed and accessible
- [ ] On-call runbook updated with troubleshooting procedures
