# Blocking Coordination Troubleshooting Guide

**Version:** 1.0
**Last Updated:** 2025-10-10
**Maintainer:** DevOps Team

---

## Quick Diagnostics

### Health Check Commands
```bash
# Check Redis connectivity
redis-cli ping  # Should return "PONG"

# List active coordinators
redis-cli KEYS "blocking:heartbeat:*"

# Check coordinator heartbeat age
redis-cli GET blocking:heartbeat:<coordinator-id> | jq '.timestamp' | xargs -I {} echo $(( $(date +%s) - {} / 1000 ))

# View pending signals
redis-cli KEYS "blocking:signal:*"

# Check circuit breaker status
redis-cli GET "circuit:breaker:status"
```

### Log Locations
- **Coordinator logs:** `/var/log/cfn-loop/coordinator-<id>.log`
- **Timeout handler logs:** `/var/log/cfn-loop/timeout-handler.log`
- **Cleanup script logs:** `/var/log/cfn-loop/cleanup.log`
- **Redis logs:** `/var/log/redis/redis-server.log`

---

## Issue 1: Coordinator Stuck in Blocking State

### Symptoms
- Coordinator process running but not progressing
- Log shows: `"Waiting for signal..."` with no resolution
- Process has been blocked >30 minutes
- No timeout error after expected timeout period

### Diagnosis Steps

**Step 1: Verify Signal Sent**
```bash
# Check if signal exists in Redis
COORDINATOR_ID="coord-123"
redis-cli GET "blocking:signal:$COORDINATOR_ID"

# If empty → signal was never sent
# If present → check signature verification
```

**Step 2: Check Redis Connectivity**
```bash
# Test coordinator can reach Redis
redis-cli -h <coordinator-host> ping

# Check network latency
redis-cli --latency-history

# Expected: <10ms P99 latency
# If >100ms → network issue
```

**Step 3: Verify Signal ACK**
```bash
# Check if ACK was sent back
SENDER_ID="coord-456"
redis-cli GET "blocking:ack:$SENDER_ID"

# If empty → ACK not sent (receiver issue)
# If present but blocking continues → receiver didn't process ACK
```

**Step 4: Inspect Coordinator Logs**
```bash
# Look for verification errors
grep "signature" /var/log/cfn-loop/coordinator-$COORDINATOR_ID.log

# Common errors:
# "Invalid signal signature" → HMAC secret mismatch
# "Signal timestamp too old" → Clock skew
# "Unknown signal type" → Protocol version mismatch
```

### Solutions

**Solution 1: HMAC Secret Mismatch**
```bash
# Verify all coordinators use same secret
for host in coord-1 coord-2 coord-3; do
  ssh $host "echo \$BLOCKING_COORDINATION_SECRET | md5sum"
done

# All MD5 hashes should match

# If mismatch, update secret on affected coordinator
ssh coord-1 "export BLOCKING_COORDINATION_SECRET='<correct-secret>' && systemctl restart coordinator"
```

**Solution 2: Clock Skew**
```bash
# Check time synchronization
timedatectl status

# If "System clock synchronized: no"
sudo systemctl restart systemd-timesyncd
sudo timedatectl set-ntp true

# Verify NTP sync
ntpq -p
```

**Solution 3: Manual Signal Resend**
```bash
# Manually send signal to unstuck coordinator
TIMESTAMP=$(date +%s)
SIGNAL=$(cat <<EOF
{
  "senderId": "manual-override",
  "receiverId": "$COORDINATOR_ID",
  "type": "wake",
  "timestamp": $TIMESTAMP
}
EOF
)

redis-cli SETEX "blocking:signal:$COORDINATOR_ID" 86400 "$SIGNAL"

# Check coordinator logs for "Signal received"
```

**Solution 4: Force Timeout**
```bash
# If coordinator should have timed out but hasn't
# Check timeout handler is running
ps aux | grep coordinator-timeout-handler

# If not running, start it
node src/cfn-loop/coordinator-timeout-handler.js &

# Check logs for timeout processing
tail -f /var/log/cfn-loop/timeout-handler.log
```

### Prevention
- Set up HMAC secret validation in CI/CD (all instances must have same secret)
- Enable NTP on all coordinator hosts
- Monitor blocking duration with Prometheus alert (P95 >5min)
- Add health check endpoint to coordinators (`/health` → returns blocking state)

---

## Issue 2: Signal ACK Verification Fails

### Symptoms
- Log shows: `"ACK verification failed for signal from <sender-id>"`
- Coordinator sends signal but never receives valid ACK
- Retry attempts all fail with same error
- No network or Redis errors

### Diagnosis Steps

**Step 1: Verify HMAC Secret**
```bash
# Check sender secret
ssh sender-host "echo \$BLOCKING_COORDINATION_SECRET"

# Check receiver secret
ssh receiver-host "echo \$BLOCKING_COORDINATION_SECRET"

# Secrets must match exactly (case-sensitive)
```

**Step 2: Check Timestamp Drift**
```bash
# Get Redis server time
REDIS_TIME=$(redis-cli TIME | head -1)

# Get coordinator time
COORDINATOR_TIME=$(date +%s)

# Calculate drift
DRIFT=$(( COORDINATOR_TIME - REDIS_TIME ))
echo "Drift: ${DRIFT}s"

# If |drift| >60s → clock skew issue
```

**Step 3: Inspect Signature Calculation**
```bash
# Manually calculate expected signature
SENDER_ID="coord-sender"
RECEIVER_ID="coord-receiver"
TYPE="wake"
TIMESTAMP=$(date +%s)
SECRET="<your-secret>"

PAYLOAD="${SENDER_ID}:${RECEIVER_ID}:${TYPE}:${TIMESTAMP}"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

echo "Expected signature: $SIGNATURE"

# Compare with actual signature in Redis
redis-cli GET "blocking:signal:$RECEIVER_ID" | jq -r '.signature'
```

**Step 4: Check for Timing Attacks**
```bash
# Enable debug logging for signature verification
export DEBUG_SIGNATURE_VERIFICATION=true

# Restart coordinator with debug logging
systemctl restart coordinator

# Look for timing-safe comparison failures
grep "timingSafeEqual" /var/log/cfn-loop/coordinator-*.log
```

### Solutions

**Solution 1: Synchronize HMAC Secrets**
```bash
# Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# Distribute to all coordinators using dual-secret strategy
# Step 1: Add new secret alongside old (zero-downtime)
for host in coord-1 coord-2 coord-3; do
  ssh $host "echo 'BLOCKING_COORDINATION_SECRET_NEW=$NEW_SECRET' >> /etc/coordinator/env"
  ssh $host "systemctl reload coordinator"  # Reload without restart
done

# Step 2: Wait 24h for all in-flight signals to clear

# Step 3: Promote new secret to primary
for host in coord-1 coord-2 coord-3; do
  ssh $host "sed -i 's/BLOCKING_COORDINATION_SECRET=.*/BLOCKING_COORDINATION_SECRET=$NEW_SECRET/' /etc/coordinator/env"
  ssh $host "sed -i '/BLOCKING_COORDINATION_SECRET_NEW/d' /etc/coordinator/env"
  ssh $host "systemctl restart coordinator"
done
```

**Solution 2: Fix Clock Skew**
```bash
# Force time sync across all coordinators
ansible all -m shell -a "sudo systemctl restart systemd-timesyncd && sudo timedatectl set-ntp true"

# Verify sync status
ansible all -m shell -a "timedatectl status | grep synchronized"

# All should show "System clock synchronized: yes"
```

**Solution 3: Update Signature Algorithm**
```bash
# If using old signature format, migrate to current format
# Old format (insecure): senderId + receiverId
# New format (secure): senderId:receiverId:type:timestamp

# Find coordinators using old format
grep "signalSignature.*Buffer.from" src/cfn-loop/*.ts

# Update to new format in all coordinators
# Ensure payload includes all fields with colons as separators
```

**Solution 4: Verify timingSafeEqual Usage**
```typescript
// Correct implementation (timing-attack resistant)
private verifySignalSignature(signal: Signal): boolean {
  if (!signal.signature) return false;

  const expectedSignature = this.signSignal(signal);

  // Convert to buffers for timing-safe comparison
  const receivedBuffer = Buffer.from(signal.signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  // Lengths must match for timingSafeEqual
  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

// Incorrect implementation (vulnerable to timing attacks)
private verifySignalSignature(signal: Signal): boolean {
  const expectedSignature = this.signSignal(signal);
  return signal.signature === expectedSignature;  // ❌ Timing attack!
}
```

### Prevention
- Store HMAC secret in HashiCorp Vault or AWS Secrets Manager (never git)
- Rotate secrets every 90 days (30 days in staging)
- Add signature verification integration test to CI/CD
- Monitor signature verification failures with alert threshold (>0.1/s)

---

## Issue 3: Dead Coordinator Not Detected

### Symptoms
- Coordinator process has crashed/killed
- Heartbeat key expired in Redis
- Timeout handler logs show no detection
- Work assigned to dead coordinator is not transferred

### Diagnosis Steps

**Step 1: Verify Timeout Handler Running**
```bash
# Check process
ps aux | grep coordinator-timeout-handler

# If not running → timeout handler crashed or not started
```

**Step 2: Check Timeout Handler Logs**
```bash
# Look for errors
tail -50 /var/log/cfn-loop/timeout-handler.log

# Common errors:
# "Redis connection failed" → Can't reach Redis
# "No coordinators found" → No heartbeat keys in Redis
# "Heartbeat parsing error" → Corrupt heartbeat data
```

**Step 3: Verify Heartbeat Expiration**
```bash
# Check if heartbeat key exists
COORDINATOR_ID="coord-dead"
redis-cli GET "blocking:heartbeat:$COORDINATOR_ID"

# If key exists → not yet expired (coordinator may still be alive)
# If null → key expired (should have been detected)

# Check TTL
redis-cli TTL "blocking:heartbeat:$COORDINATOR_ID"
# -2 = key doesn't exist (expired)
# -1 = key exists but no TTL set (bug!)
# >0 = seconds until expiration
```

**Step 4: Check Warning Escalation**
```bash
# Check warning count for coordinator
redis-cli GET "blocking:warning:$COORDINATOR_ID"

# If <3 → not yet escalated (need 3 warnings)
# If ≥3 → should have escalated (handler bug)

# Check warning TTL
redis-cli TTL "blocking:warning:$COORDINATOR_ID"
# Should be 300s (5 minutes)
```

### Solutions

**Solution 1: Start Timeout Handler**
```bash
# If using systemd
sudo systemctl start coordinator-timeout-handler
sudo systemctl enable coordinator-timeout-handler  # Auto-start on boot

# If using cron
crontab -e
# Add line: */5 * * * * /usr/bin/node /opt/cfn-loop/src/cfn-loop/coordinator-timeout-handler.js

# If using Docker
docker run -d --name timeout-handler \
  --network cfn-loop \
  -e REDIS_URL=redis://redis:6379 \
  cfn-loop:latest node src/cfn-loop/coordinator-timeout-handler.js
```

**Solution 2: Fix Heartbeat TTL**
```bash
# Check if heartbeat keys have TTL
redis-cli --scan --pattern "blocking:heartbeat:*" | while read key; do
  ttl=$(redis-cli TTL "$key")
  if [ "$ttl" -eq -1 ]; then
    echo "WARNING: $key has no TTL (will never expire)"
    # Fix by setting TTL
    redis-cli EXPIRE "$key" 90
  fi
done
```

**Solution 3: Adjust Detection Timing**
```typescript
// If coordinators are frequently marked dead incorrectly,
// increase thresholds in coordinator-timeout-handler.ts

// Before (too aggressive):
const HEARTBEAT_TTL = 90;  // 90s
const DEAD_THRESHOLD = 120;  // 120s

// After (more tolerant):
const HEARTBEAT_TTL = 180;  // 3 minutes
const DEAD_THRESHOLD = 240;  // 4 minutes (2× TTL)

// Update heartbeat interval in blocking-coordinator.ts
const HEARTBEAT_INTERVAL = 30000;  // 30s (6x intervals before expiration)
```

**Solution 4: Manual Escalation**
```bash
# Force escalation for dead coordinator
COORDINATOR_ID="coord-dead"

# Set warning count to 3
redis-cli SET "blocking:warning:$COORDINATOR_ID" 3
redis-cli EXPIRE "blocking:warning:$COORDINATOR_ID" 300

# Trigger timeout handler
node -e "
const handler = require('./src/cfn-loop/coordinator-timeout-handler');
handler.checkCoordinatorActivity();
"

# Check logs for "Dead coordinator detected: $COORDINATOR_ID"
```

### Prevention
- Set up systemd service for timeout handler with auto-restart
- Monitor timeout handler process with Prometheus (process_up gauge)
- Add integration test: kill coordinator, verify detection within 3 minutes
- Set up alert for missing heartbeats (no coordinator heartbeats >5 minutes)

---

## Issue 4: Redis Connection Keeps Failing

### Symptoms
- Log shows: `"Circuit breaker open: Redis unavailable"`
- Repeated connection attempts with exponential backoff
- All 4 retry attempts fail
- Other services can connect to Redis successfully

### Diagnosis Steps

**Step 1: Test Basic Connectivity**
```bash
# From coordinator host
redis-cli -h <redis-host> -p 6379 ping

# If "PONG" → Redis is reachable
# If "Connection refused" → Redis not listening or firewall
# If timeout → Network issue
```

**Step 2: Check Authentication**
```bash
# Test with password
redis-cli -h <redis-host> -p 6379 -a <password> ping

# If "PONG" → password is correct
# If "NOAUTH Authentication required" → password missing
# If "ERR invalid password" → wrong password
```

**Step 3: Verify Environment Variables**
```bash
# Check coordinator environment
ps aux | grep coordinator | grep -o 'REDIS_.*'

# Should show:
# REDIS_URL=redis://redis-host:6379
# REDIS_PASSWORD=<password>

# Check if variables are set
echo $REDIS_URL
echo $REDIS_PASSWORD
```

**Step 4: Check Redis Performance**
```bash
# Check slow log
redis-cli SLOWLOG GET 10

# If many entries → Redis is overloaded

# Check memory usage
redis-cli INFO memory | grep used_memory_human

# If >80% maxmemory → Redis is full

# Check client connections
redis-cli INFO clients | grep connected_clients

# If >10000 → too many connections
```

### Solutions

**Solution 1: Fix Authentication**
```bash
# Update coordinator environment variables
# In /etc/coordinator/env or docker-compose.yml

REDIS_URL=redis://:${REDIS_PASSWORD}@redis-host:6379
# Note the `:` before password

# Or use separate password parameter
REDIS_HOST=redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# Restart coordinator
systemctl restart coordinator
```

**Solution 2: Scale Redis**
```bash
# If Redis is overloaded, scale vertically or horizontally

# Vertical scaling (more resources)
# Update Redis configuration
redis-cli CONFIG SET maxmemory 8gb
redis-cli CONFIG SET maxclients 20000

# Horizontal scaling (Redis Cluster)
# Set up 3-node cluster
redis-cli --cluster create \
  redis-1:6379 redis-2:6379 redis-3:6379 \
  --cluster-replicas 1

# Update coordinator to use cluster
REDIS_URL=redis://redis-1:6379,redis-2:6379,redis-3:6379
```

**Solution 3: Fix Network Issues**
```bash
# Check firewall rules
sudo iptables -L | grep 6379

# If no rule, add it
sudo iptables -A INPUT -p tcp --dport 6379 -j ACCEPT

# For AWS Security Groups
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 6379 \
  --source-group sg-yyyyy  # Coordinator security group
```

**Solution 4: Increase Circuit Breaker Tolerance**
```typescript
// If Redis is occasionally slow but not down,
// increase retry attempts and delays

// In blocking-coordinator.ts:
private async redisOperationWithCircuitBreaker<T>(
  operation: () => Promise<T>
): Promise<T> {
  const maxAttempts = 6;  // Increased from 4
  const delays = [1000, 2000, 4000, 8000, 16000, 32000];  // Longer backoff

  // ... rest of implementation
}
```

### Prevention
- Store Redis credentials in secret manager (Vault, AWS Secrets Manager)
- Set up Redis monitoring with alerts (memory >80%, connections >90% max)
- Use Redis Sentinel for automatic failover
- Configure connection pooling in coordinator (max 10 connections per coordinator)

---

## Issue 5: Cleanup Script Not Removing Stale State

### Symptoms
- Old coordinator heartbeat keys remain in Redis
- `redis-cli KEYS "blocking:heartbeat:*"` shows coordinators from >24h ago
- Redis memory usage growing over time
- Cleanup script logs show "0 keys cleaned up"

### Diagnosis Steps

**Step 1: Verify Cleanup Script Running**
```bash
# Check if running as cron job
crontab -l | grep cleanup

# Should show:
# */5 * * * * /usr/bin/node /opt/cfn-loop/config/hooks/cleanup-stale-coordinators.js

# Check if running as systemd timer
systemctl list-timers | grep cleanup

# Should show timer active
```

**Step 2: Check Cleanup Script Logs**
```bash
# View recent logs
tail -50 /var/log/cfn-loop/cleanup.log

# Look for:
# "Cleaned up N keys" (should be >0 if stale keys exist)
# "Error: ..." (script failing)
# "No stale keys found" (threshold too high)
```

**Step 3: Manually Run Cleanup**
```bash
# Run script manually to see output
node config/hooks/cleanup-stale-coordinators.js

# Should output:
# Found 5 heartbeat keys
# Cleaned up 2 stale coordinators
# Cleanup complete
```

**Step 4: Check Timestamp Validation**
```bash
# Check heartbeat timestamps
redis-cli --scan --pattern "blocking:heartbeat:*" | while read key; do
  data=$(redis-cli GET "$key")
  timestamp=$(echo "$data" | jq -r '.timestamp')
  age=$(( $(date +%s) - timestamp / 1000 ))
  echo "$key: ${age}s old"
done

# If ages are <600s (10 minutes) → no stale keys
# If ages are >600s but not cleaned → cleanup script bug
```

### Solutions

**Solution 1: Fix Cron Schedule**
```bash
# Edit crontab
crontab -e

# Correct entry (every 5 minutes):
*/5 * * * * /usr/bin/node /opt/cfn-loop/config/hooks/cleanup-stale-coordinators.js >> /var/log/cfn-loop/cleanup.log 2>&1

# Verify cron is running
sudo systemctl status cron

# Check cron logs
grep CRON /var/log/syslog | tail -20
```

**Solution 2: Adjust Stale Threshold**
```typescript
// In cleanup-stale-coordinators.js:
const STALE_THRESHOLD = 600000;  // 10 minutes (current)

// If cleanup is too aggressive, increase:
const STALE_THRESHOLD = 900000;  // 15 minutes

// If cleanup misses old coordinators, decrease:
const STALE_THRESHOLD = 300000;  // 5 minutes
```

**Solution 3: Fix SCAN Implementation**
```typescript
// Incorrect (uses KEYS - blocks Redis):
const keys = await redis.keys('blocking:heartbeat:*');  // ❌

// Correct (uses SCAN - non-blocking):
const keys: string[] = [];
let cursor = '0';

do {
  const [nextCursor, batch] = await redis.scan(
    cursor,
    'MATCH', 'blocking:heartbeat:*',
    'COUNT', 100
  );
  keys.push(...batch);
  cursor = nextCursor;
} while (cursor !== '0');  // ✅
```

**Solution 4: Add Explicit TTL Cleanup**
```typescript
// In cleanup script, add TTL verification:
async function cleanupStaleKeys() {
  const keys = await scanKeys('blocking:*');

  for (const key of keys) {
    const ttl = await redis.ttl(key);

    // If key has no TTL, set default
    if (ttl === -1) {
      console.warn(`Key ${key} missing TTL, setting to 24h`);
      await redis.expire(key, 86400);
    }

    // If heartbeat key is very old, delete immediately
    if (key.startsWith('blocking:heartbeat:')) {
      const data = await redis.get(key);
      if (data) {
        const { timestamp } = JSON.parse(data);
        const age = Date.now() - timestamp;

        if (age > 3600000) {  // >1 hour old
          console.warn(`Deleting very old heartbeat: ${key}`);
          await redis.del(key);
        }
      }
    }
  }
}
```

### Prevention
- Set up systemd timer instead of cron (more reliable, better logging)
- Monitor cleanup script execution with Prometheus (script_runs_total counter)
- Add integration test: create fake heartbeat, wait 15min, verify cleanup
- Set up alert for old heartbeat keys (any heartbeat >1 hour old)

---

## Issue 6: High Signal Delivery Latency

### Symptoms
- Prometheus metric `signal_delivery_latency_seconds` P95 >5s
- Coordinators report slow signal ACK response
- System overall feels sluggish
- No obvious Redis or network errors

### Diagnosis Steps

**Step 1: Check Redis Performance**
```bash
# Check latency
redis-cli --latency-history

# Target: P99 <10ms
# Warning: P99 >50ms
# Critical: P99 >100ms

# Check slow queries
redis-cli SLOWLOG GET 10
```

**Step 2: Check Network Latency**
```bash
# Ping Redis host from coordinator
ping -c 10 <redis-host>

# Check packet loss and RTT
# Target: 0% loss, <1ms RTT

# Trace route to Redis
traceroute <redis-host>

# Should be direct (1-2 hops)
```

**Step 3: Profile Coordinator Process**
```bash
# Check CPU usage
top -p $(pgrep -f coordinator)

# If >80% CPU → coordinator overloaded

# Check event loop lag (Node.js)
node --inspect coordinator.js
# Open chrome://inspect
# Check "Event Loop Delay" in performance tab

# If >100ms → event loop blocked
```

**Step 4: Count Active Coordinators**
```bash
# Too many coordinators = contention
redis-cli KEYS "blocking:heartbeat:*" | wc -l

# Target: <10 coordinators
# Warning: 10-20 coordinators
# Critical: >20 coordinators
```

### Solutions

**Solution 1: Optimize Redis**
```bash
# Enable pipelining for better throughput
redis-cli CONFIG SET tcp-backlog 511
redis-cli CONFIG SET timeout 300

# Increase connection pool
redis-cli CONFIG SET maxclients 20000

# Enable lazy freeing (async deletion)
redis-cli CONFIG SET lazyfree-lazy-eviction yes
redis-cli CONFIG SET lazyfree-lazy-expire yes
```

**Solution 2: Reduce Coordinator Count**
```typescript
// Batch work to fewer coordinators instead of spawning many

// Before (too many coordinators):
for (const task of tasks) {
  await spawnCoordinator(`coord-${task.id}`, task);  // 100 coordinators
}

// After (batched):
const batchSize = 10;
const batches = chunk(tasks, batchSize);

for (let i = 0; i < batches.length; i++) {
  await spawnCoordinator(`coord-batch-${i}`, batches[i]);  // 10 coordinators
}
```

**Solution 3: Optimize Signal Format**
```typescript
// Reduce signal size by removing unnecessary fields

// Before (384 bytes):
const signal = {
  senderId: "coordinator-with-very-long-uuid-123456789",
  receiverId: "another-coordinator-with-long-uuid-987654321",
  type: "wake",
  timestamp: Date.now(),
  metadata: {
    hostname: "coordinator-host-1.example.com",
    version: "1.2.3",
    environment: "production"
  }
};

// After (128 bytes):
const signal = {
  s: "coord-123",  // Shortened sender ID
  r: "coord-456",  // Shortened receiver ID
  t: "w",          // Signal type (w=wake, v=validate, d=decide)
  ts: Date.now()
};
```

**Solution 4: Use Redis Pub/Sub Instead of Polling**
```typescript
// Before (polling - slow):
async waitForSignal() {
  while (true) {
    const signal = await this.redis.get(`blocking:signal:${this.id}`);
    if (signal) return JSON.parse(signal);
    await new Promise(r => setTimeout(r, 1000));  // Poll every 1s
  }
}

// After (pub/sub - instant):
async waitForSignal() {
  return new Promise((resolve) => {
    const subscriber = this.redis.duplicate();
    subscriber.subscribe(`signal:${this.id}`);
    subscriber.on('message', (channel, message) => {
      resolve(JSON.parse(message));
      subscriber.quit();
    });
  });
}
```

### Prevention
- Set up Redis monitoring with Grafana dashboard
- Use Redis Cluster for horizontal scaling (>1000 coordinators)
- Implement signal batching (send multiple signals in one Redis operation)
- Monitor coordinator count with alert (>20 active coordinators)

---

## Issue 7: Memory Leak in Coordinator Process

### Symptoms
- Coordinator process memory grows unbounded
- `ps aux` shows coordinator using >2GB RSS
- Eventually crashes with `Out of memory` error
- Restart fixes temporarily but leak returns

### Diagnosis Steps

**Step 1: Monitor Memory Growth**
```bash
# Check current memory
ps aux | grep coordinator

# Monitor over time
watch -n 5 'ps aux | grep coordinator'

# If memory grows >100MB per hour → leak
```

**Step 2: Generate Heap Snapshot**
```bash
# Start coordinator with inspector
node --inspect coordinator.js

# In Chrome DevTools (chrome://inspect)
# Memory tab → Take heap snapshot
# Compare snapshots over time

# Look for objects growing:
# - Event listeners
# - Redis keys cache
# - Promise chains
```

**Step 3: Check Event Listener Cleanup**
```bash
# Check listener count
node -e "
const coordinator = require('./coordinator');
setInterval(() => {
  console.log('Listeners:', coordinator.eventEmitter.listenerCount('signal'));
}, 5000);
"

# If count grows → listeners not removed
```

**Step 4: Check Redis Key Accumulation**
```bash
# Count keys owned by coordinator
COORDINATOR_ID="coord-123"
redis-cli --scan --pattern "*${COORDINATOR_ID}*" | wc -l

# If >1000 keys → not cleaning up
```

### Solutions

**Solution 1: Fix Event Listener Cleanup**
```typescript
// Incorrect (leak):
async waitForSignal() {
  this.eventEmitter.on('signal', (signal) => {  // ❌ Never removed
    this.handleSignal(signal);
  });
}

// Correct (cleanup):
async waitForSignal() {
  return new Promise((resolve) => {
    const handler = (signal) => {
      this.handleSignal(signal);
      resolve();
    };

    this.eventEmitter.once('signal', handler);  // ✅ Auto-removed

    // Cleanup on timeout
    setTimeout(() => {
      this.eventEmitter.off('signal', handler);
      resolve();
    }, this.timeout);
  });
}
```

**Solution 2: Set TTL on All Redis Keys**
```typescript
// Incorrect (keys live forever):
await this.redis.set(key, value);  // ❌

// Correct (24h TTL):
await this.redis.setex(key, 86400, value);  // ✅

// Or use default TTL helper:
async setWithTTL(key: string, value: string, ttl: number = 86400) {
  await this.redis.setex(key, ttl, value);
}
```

**Solution 3: Implement Graceful Shutdown**
```typescript
// Add cleanup on SIGTERM/SIGINT
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, cleaning up...');

  // Stop heartbeat
  if (this.heartbeatInterval) {
    clearInterval(this.heartbeatInterval);
  }

  // Remove event listeners
  this.eventEmitter.removeAllListeners();

  // Close Redis connections
  await this.redis.quit();
  await this.subscriber.quit();

  // Delete coordinator state
  await this.redis.del(`blocking:heartbeat:${this.id}`);
  await this.redis.del(`blocking:signal:${this.id}`);

  process.exit(0);
});
```

**Solution 4: Use WeakMap for Caching**
```typescript
// Incorrect (strong references prevent GC):
private signalCache = new Map<string, Signal>();  // ❌

// Correct (weak references allow GC):
private signalCache = new WeakMap<object, Signal>();  // ✅

// Or use LRU cache with max size:
import LRU from 'lru-cache';

private signalCache = new LRU<string, Signal>({
  max: 500,  // Max 500 cached signals
  ttl: 60000  // 1 minute TTL
});
```

### Prevention
- Run coordinator with memory limit (`--max-old-space-size=512`)
- Monitor memory with Prometheus (process_resident_memory_bytes)
- Add memory leak test (run coordinator for 1 hour, verify memory <100MB growth)
- Use `clinic` or `0x` profiling tools in development

---

## Issue 8: Timeout Events Spike Unexpectedly

### Symptoms
- Prometheus metric `timeout_events_total` sudden increase
- Rate goes from 0/min to 5+/min
- No code changes or increased load
- Affects multiple coordinators simultaneously

### Diagnosis Steps

**Step 1: Check Recent Changes**
```bash
# Check recent deployments
git log --oneline --since="1 hour ago"

# Check infrastructure changes
kubectl get events --sort-by='.lastTimestamp' | head -20

# AWS CloudTrail events
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventTime,AttributeValue=$(date -u +%Y-%m-%dT%H:%M:%S)
```

**Step 2: Check External Dependencies**
```bash
# Check validator agent health
curl http://validator-1:3000/health
curl http://validator-2:3000/health

# Check database health
pg_isready -h postgres-host -p 5432

# Check Redis health
redis-cli ping
redis-cli INFO stats | grep total_errors
```

**Step 3: Check Timeout Configuration**
```bash
# Verify timeout values haven't changed
grep -r "timeout.*60000" src/cfn-loop/

# Check environment variables
env | grep TIMEOUT
```

**Step 4: Profile Blocking Tasks**
```bash
# Check what coordinators are blocked on
redis-cli --scan --pattern "blocking:signal:*" | while read key; do
  data=$(redis-cli GET "$key")
  echo "$key: $data"
done

# Look for common patterns (e.g., all waiting for same validator)
```

### Solutions

**Solution 1: Increase Timeout Duration**
```typescript
// If timeouts are legitimate (task takes longer than expected)

// In blocking-coordinator.ts:
const DEFAULT_TIMEOUT = 600000;  // 10 minutes (current)

// Increase for production:
const DEFAULT_TIMEOUT = 1800000;  // 30 minutes

// Or make configurable:
const timeout = process.env.BLOCKING_TIMEOUT
  ? parseInt(process.env.BLOCKING_TIMEOUT)
  : 600000;
```

**Solution 2: Fix Slow External Dependency**
```bash
# If validator agents are slow:

# Check validator logs
kubectl logs -f deployment/validator-agent

# Scale validator agents
kubectl scale deployment/validator-agent --replicas=5

# Add timeout to validator calls
VALIDATOR_TIMEOUT=30000  # 30s max per validator
```

**Solution 3: Add Circuit Breaker for Blocking Operations**
```typescript
// Prevent timeout cascade by failing fast

import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(this.blockUntilSignal.bind(this), {
  timeout: 600000,        // 10 min
  errorThresholdPercentage: 50,  // Open after 50% failures
  resetTimeout: 30000     // Try again after 30s
});

breaker.on('open', () => {
  console.error('Circuit breaker opened for blocking operations');
  // Alert or fallback logic
});

// Use breaker instead of direct call
await breaker.fire();
```

**Solution 4: Implement Retry with Backoff**
```typescript
// If timeouts are transient, retry with backoff

async blockUntilSignalWithRetry(maxRetries = 3): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await this.blockUntilSignal();
      return;  // Success
    } catch (error) {
      if (error.message.includes('Timeout') && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 60000;  // 1min, 2min, 4min
        console.warn(`Timeout attempt ${attempt + 1}, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw error;  // Final failure
      }
    }
  }
}
```

### Prevention
- Set up gradual rollout for configuration changes (canary deployment)
- Monitor external dependency health with synthetic checks
- Add timeout histogram to track distribution (not just count)
- Set up alert for timeout rate increase >2x baseline

---

## Emergency Procedures

### Complete System Reset
```bash
# ⚠️ WARNING: This deletes all coordinator state!

# 1. Stop all coordinators
sudo systemctl stop coordinator@*

# 2. Flush Redis coordinator data
redis-cli --scan --pattern "blocking:*" | xargs redis-cli DEL

# 3. Restart timeout handler
sudo systemctl restart coordinator-timeout-handler

# 4. Start coordinators
sudo systemctl start coordinator@*

# 5. Verify health
redis-cli KEYS "blocking:heartbeat:*" | wc -l  # Should be >0 within 10s
```

### Coordinator Process Stuck (Force Kill)
```bash
# Find coordinator PID
ps aux | grep coordinator

# Try graceful shutdown first
kill -TERM <pid>
sleep 10

# If still running, force kill
kill -9 <pid>

# Verify process gone
ps aux | grep <pid>

# Cleanup state
redis-cli DEL "blocking:heartbeat:<coordinator-id>"
redis-cli DEL "blocking:signal:<coordinator-id>"
```

### Redis Full (Eviction)
```bash
# Check memory
redis-cli INFO memory | grep used_memory_human

# If >90% full, evict old keys
redis-cli --scan --pattern "blocking:*" | while read key; do
  ttl=$(redis-cli TTL "$key")
  if [ "$ttl" -gt 86400 ]; then  # >24h TTL
    redis-cli EXPIRE "$key" 3600  # Reduce to 1h
  fi
done

# Or increase maxmemory
redis-cli CONFIG SET maxmemory 16gb
```

---

## Getting Help

### Log Collection Script
```bash
#!/bin/bash
# collect-logs.sh - Gather diagnostics for support

COORDINATOR_ID="${1:-unknown}"
OUTPUT_DIR="/tmp/coordinator-debug-$(date +%s)"

mkdir -p "$OUTPUT_DIR"

# Coordinator logs
cp /var/log/cfn-loop/coordinator-*.log "$OUTPUT_DIR/"

# Timeout handler logs
cp /var/log/cfn-loop/timeout-handler.log "$OUTPUT_DIR/"

# Redis state
redis-cli --scan --pattern "blocking:*" > "$OUTPUT_DIR/redis-keys.txt"
redis-cli INFO > "$OUTPUT_DIR/redis-info.txt"

# System info
uname -a > "$OUTPUT_DIR/system-info.txt"
ps aux | grep coordinator > "$OUTPUT_DIR/processes.txt"

# Network
ping -c 5 <redis-host> > "$OUTPUT_DIR/network-ping.txt"

# Package
tar -czf "coordinator-debug-$(date +%s).tar.gz" "$OUTPUT_DIR"
echo "Logs collected: coordinator-debug-$(date +%s).tar.gz"
```

### Support Channels
- **Slack:** #cfn-loop-support
- **Email:** devops-team@example.com
- **On-call:** PagerDuty escalation policy "CFN Loop"
- **Documentation:** https://docs.example.com/cfn-loop

### Escalation Criteria
- **P1 (Page immediately):** All coordinators down, production outage
- **P2 (2-hour response):** >50% coordinators failing, degraded performance
- **P3 (Next business day):** Single coordinator issue, non-prod environment
