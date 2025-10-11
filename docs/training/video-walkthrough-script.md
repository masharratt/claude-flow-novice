# Blocking Coordination Video Walkthrough Script

**Duration:** 30 minutes
**Target Audience:** Engineering team onboarding
**Presenter:** Senior DevOps Engineer
**Materials:** Screen recording, code editor, terminal, Grafana dashboard

---

## Part 1: Introduction (5 minutes)

### Slide 1: Title Screen
**Narrator:** "Welcome to Blocking Coordination in CFN Loop. I'm [Name], and today we'll explore how our multi-agent orchestration system ensures reliable coordination across distributed agents."

**Screen:** Title slide with architecture diagram

### Slide 2: What is Blocking Coordination?
**Narrator:** "Blocking coordination is a synchronization mechanism that allows coordinators to wait for critical events before proceeding. Think of it as a distributed semaphore system."

**Screen:** Animation showing coordinator waiting for signal

**Key Points:**
- Coordinators block execution until receiving specific signals
- Prevents race conditions in multi-agent workflows
- Ensures ordered execution of dependent tasks

### Slide 3: Use Cases in CFN Loop
**Narrator:** "We use blocking coordination in two critical CFN Loop phases."

**Screen:** CFN Loop diagram highlighting Loop 2 and Loop 4

**Use Case 1: Loop 2 Consensus Validation**
- 2-4 validator agents review implementation
- Product Owner waits for ALL validator responses
- Blocking ensures complete consensus before decision

**Use Case 2: Loop 4 Product Owner Decisions**
- Product Owner executes GOAP decision logic
- Waits for validation results from Loop 2
- Blocking prevents premature PROCEED/DEFER/ESCALATE

### Slide 4: Architecture Overview
**Narrator:** "Our architecture has three core components: coordinators, signals, and Redis."

**Screen:** Component diagram

**Components:**
1. **Coordinators**: Node.js processes managing agent workflows
2. **Signals**: Redis pub/sub messages with HMAC signatures
3. **Redis**: Distributed coordination and state persistence

**Data Flow:**
```
Coordinator A → Send Signal → Redis pub/sub → Coordinator B → ACK Signal → Coordinator A resumes
```

---

## Part 2: Signal ACK Protocol (8 minutes)

### Demo Setup
**Narrator:** "Let's see the signal protocol in action. I'll start two coordinators and send a signal between them."

**Terminal 1:**
```bash
# Start coordinator A
node tests/chaos/fixtures/coordinator-runner.js --id coord-a --timeout 600000
```

**Terminal 2:**
```bash
# Start coordinator B
node tests/chaos/fixtures/coordinator-runner.js --id coord-b --timeout 600000
```

**Screen:** Split terminals showing both coordinators starting

### Signal Structure
**Narrator:** "Each signal has four required fields for secure delivery."

**Code Editor:** Show signal structure
```typescript
interface Signal {
  senderId: string;      // Coordinator sending signal
  receiverId: string;    // Target coordinator
  type: string;          // Signal type (wake, validate, decide)
  timestamp: number;     // Unix timestamp for replay prevention
  signature?: string;    // HMAC-SHA256 signature
}
```

### Sending a Signal
**Narrator:** "When coordinator A needs to wake coordinator B, it creates a signed signal and publishes to Redis."

**Code Editor:** Show `sendSignal` function
```typescript
async sendSignal(receiverId: string, type: string): Promise<void> {
  const signal: Signal = {
    senderId: this.id,
    receiverId,
    type,
    timestamp: Date.now()
  };

  // Sign with HMAC-SHA256
  signal.signature = this.signSignal(signal);

  // Publish to Redis with 24h TTL
  await this.redis.setex(
    `blocking:signal:${receiverId}`,
    86400,
    JSON.stringify(signal)
  );
}
```

**Terminal 3:** Send signal manually
```bash
# Construct signal
TIMESTAMP=$(date +%s)
SIGNAL='{"senderId":"coord-a","receiverId":"coord-b","type":"wake","timestamp":'$TIMESTAMP'}'

# Store in Redis
redis-cli SETEX blocking:signal:coord-b 86400 "$SIGNAL"
```

**Screen:** Terminal 2 shows "Signal received: wake"

### HMAC Signature Verification
**Narrator:** "Security is critical. We use HMAC-SHA256 to prevent signal forgery."

**Code Editor:** Show signature verification
```typescript
private signSignal(signal: Signal): string {
  const payload = `${signal.senderId}:${signal.receiverId}:${signal.type}:${signal.timestamp}`;
  return crypto
    .createHmac('sha256', process.env.BLOCKING_COORDINATION_SECRET!)
    .update(payload)
    .digest('hex');
}

private verifySignalSignature(signal: Signal): boolean {
  if (!signal.signature) return false;
  const expectedSignature = this.signSignal(signal);
  return crypto.timingSafeEqual(
    Buffer.from(signal.signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

**Narrator:** "Notice we use `timingSafeEqual` to prevent timing attacks."

### Signal ACK Process
**Narrator:** "After receiving a signal, the coordinator sends an acknowledgment to confirm receipt."

**Code Editor:** Show ACK flow
```typescript
private async handleSignal(signal: Signal): Promise<void> {
  // Verify signature
  if (!this.verifySignalSignature(signal)) {
    throw new Error('Invalid signal signature');
  }

  // Send ACK
  await this.sendAck(signal.senderId);

  // Resume blocked operation
  this.resolveBlockingOperation(signal);
}

private async sendAck(senderId: string): Promise<void> {
  const ack = {
    receiverId: senderId,
    timestamp: Date.now()
  };

  await this.redis.setex(
    `blocking:ack:${senderId}`,
    3600,
    JSON.stringify(ack)
  );
}
```

### Timeout Handling
**Narrator:** "If no ACK arrives within the timeout period, the coordinator escalates to the timeout handler."

**Screen:** Show timeout flow diagram

**Code Editor:** Show timeout logic
```typescript
async blockUntilSignal(timeout: number = 600000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for signal after ${timeout}ms`));
    }, timeout);

    this.blockingResolve = () => {
      clearTimeout(timeoutId);
      resolve();
    };
  });
}
```

**Demo:** Show timeout in action
```bash
# Start coordinator with 10s timeout
node tests/chaos/fixtures/coordinator-runner.js --id coord-timeout --timeout 10000

# Wait 10 seconds without sending signal
# Screen shows: "Error: Timeout waiting for signal after 10000ms"
```

---

## Part 3: Dead Coordinator Detection (7 minutes)

### Heartbeat Monitoring
**Narrator:** "To detect crashed coordinators, we use a heartbeat mechanism with 5-second intervals."

**Code Editor:** Show heartbeat implementation
```typescript
private startHeartbeat(): void {
  this.heartbeatInterval = setInterval(async () => {
    await this.redis.setex(
      `blocking:heartbeat:${this.id}`,
      90,  // 90s TTL = 18x heartbeat interval
      JSON.stringify({
        coordinatorId: this.id,
        timestamp: Date.now(),
        status: 'alive'
      })
    );
  }, 5000);  // Every 5 seconds
}
```

**Narrator:** "The 90-second TTL gives us tolerance for network jitter and temporary Redis slowdowns."

### Heartbeat Validation
**Narrator:** "The timeout handler periodically checks all coordinator heartbeats."

**Code Editor:** Show validation logic
```typescript
async checkCoordinatorActivity(): Promise<void> {
  const coordinatorKeys = await this.redis.keys('blocking:heartbeat:*');

  for (const key of coordinatorKeys) {
    const heartbeatData = await this.redis.get(key);
    if (!heartbeatData) {
      // Key expired = coordinator dead
      const coordinatorId = key.replace('blocking:heartbeat:', '');
      await this.handleDeadCoordinator(coordinatorId);
      continue;
    }

    const heartbeat = JSON.parse(heartbeatData);
    const age = Date.now() - heartbeat.timestamp;

    // Warn if heartbeat >120s old (2x TTL)
    if (age > 120000) {
      console.warn(`Stale heartbeat for ${heartbeat.coordinatorId}: ${age}ms old`);
      await this.escalateStaleCoordinator(heartbeat.coordinatorId, age);
    }
  }
}
```

### Demo: Coordinator Crash Detection
**Narrator:** "Let's simulate a coordinator crash and watch the detection system respond."

**Terminal 1:** Start coordinator
```bash
node tests/chaos/fixtures/coordinator-runner.js --id coord-crash --timeout 600000 &
COORD_PID=$!
echo "Coordinator PID: $COORD_PID"
```

**Terminal 2:** Monitor heartbeat
```bash
# Watch heartbeat updates
watch -n 1 'redis-cli GET blocking:heartbeat:coord-crash'
```

**Screen:** Show heartbeat updating every 5 seconds

**Terminal 1:** Kill coordinator
```bash
# Wait 30 seconds, then crash
sleep 30
kill -9 $COORD_PID
echo "Coordinator killed at $(date +%s)"
```

**Terminal 2:** Watch heartbeat expire
```bash
# Screen shows heartbeat value for 90 seconds
# Then key disappears (TTL expired)
```

**Terminal 3:** Run timeout handler
```bash
# Wait 120 seconds after crash
sleep 150

# Run detection
node -e "
const handler = require('./src/cfn-loop/coordinator-timeout-handler');
handler.checkCoordinatorActivity();
"

# Output: "Dead coordinator detected: coord-crash"
```

### Escalation After Warnings
**Narrator:** "We don't immediately escalate on first detection. We issue 3 warnings over 5 minutes before escalating."

**Code Editor:** Show escalation logic
```typescript
private async escalateStaleCoordinator(
  coordinatorId: string,
  age: number
): Promise<void> {
  const warningKey = `blocking:warning:${coordinatorId}`;
  const warningCount = await this.redis.incr(warningKey);
  await this.redis.expire(warningKey, 300);  // 5 minute window

  if (warningCount >= 3) {
    // Escalate after 3 warnings
    await this.handleDeadCoordinator(coordinatorId);
  } else {
    console.warn(
      `Warning ${warningCount}/3 for ${coordinatorId}: heartbeat ${age}ms old`
    );
  }
}
```

**Narrator:** "This prevents false positives from temporary network issues or Redis slowdowns."

---

## Part 4: Failure Recovery (5 minutes)

### Circuit Breaker for Redis
**Narrator:** "When Redis becomes unavailable, our circuit breaker prevents cascading failures."

**Code Editor:** Show circuit breaker
```typescript
private async redisOperationWithCircuitBreaker<T>(
  operation: () => Promise<T>
): Promise<T> {
  const maxAttempts = 4;
  const delays = [1000, 2000, 4000, 8000];  // Exponential backoff

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw new Error('Circuit breaker open: Redis unavailable');
      }

      const delay = delays[attempt];
      console.warn(`Redis failure, retrying in ${delay}ms (attempt ${attempt + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}
```

### Demo: Redis Restart Recovery
**Narrator:** "Let's restart Redis while a coordinator is running and watch the automatic recovery."

**Terminal 1:** Start coordinator
```bash
node tests/chaos/fixtures/coordinator-runner.js --id coord-reconnect --timeout 600000
```

**Terminal 2:** Restart Redis
```bash
# Restart Redis service
sudo systemctl restart redis

# Or with Docker
docker restart redis-container
```

**Screen:** Terminal 1 shows recovery sequence
```
[15:23:45] Redis failure, retrying in 1000ms (attempt 1)
[15:23:46] Redis failure, retrying in 2000ms (attempt 2)
[15:23:48] Redis connection restored
[15:23:48] Heartbeat resumed
```

### Work Transfer on Coordinator Death
**Narrator:** "When a coordinator dies, its incomplete work transfers to a new coordinator."

**Code Editor:** Show work transfer
```typescript
private async handleDeadCoordinator(coordinatorId: string): Promise<void> {
  // Retrieve incomplete work
  const workKeys = await this.redis.keys(`work:${coordinatorId}:*`);

  for (const key of workKeys) {
    const work = await this.redis.get(key);
    if (!work) continue;

    // Spawn new coordinator for work
    const newCoordinatorId = `${coordinatorId}-recovery-${Date.now()}`;
    await this.spawnCoordinator(newCoordinatorId, JSON.parse(work));

    // Clean up old work
    await this.redis.del(key);
  }

  // Clean up dead coordinator state
  await this.cleanupCoordinator(coordinatorId);
}
```

**Narrator:** "This ensures no work is lost, even when coordinators crash unexpectedly."

---

## Part 5: Monitoring & Alerts (5 minutes)

### Prometheus Metrics Overview
**Narrator:** "We expose 4 critical metrics for monitoring blocking coordination health."

**Code Editor:** Show metrics definitions
```typescript
// Metric 1: Blocking duration
const blockingDuration = new Histogram({
  name: 'blocking_coordination_duration_seconds',
  help: 'Time spent blocked waiting for signals',
  buckets: [10, 30, 60, 120, 300, 600, 1800]
});

// Metric 2: Active coordinators
const activeCoordinators = new Gauge({
  name: 'active_coordinators',
  help: 'Number of coordinators with active heartbeats'
});

// Metric 3: Signal delivery latency
const signalLatency = new Histogram({
  name: 'signal_delivery_latency_seconds',
  help: 'Time from signal sent to ACK received',
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Metric 4: Timeout events
const timeoutEvents = new Counter({
  name: 'timeout_events_total',
  help: 'Total number of blocking timeout events'
});
```

### Grafana Dashboard Walkthrough
**Narrator:** "Our Grafana dashboard provides real-time visibility into coordination health."

**Screen:** Open Grafana dashboard at `http://localhost:3000/d/blocking-coordination`

**Panel 1: Blocking Duration (P50/P95/P99)**
- P50: Median blocking time (target: <60s)
- P95: 95th percentile (warning: >300s)
- P99: 99th percentile (critical: >1800s)

**Panel 2: Active Coordinators**
- Current count (info: >10 coordinators)
- Trend over time
- Color-coded: Green (<10), Yellow (10-20), Red (>20)

**Panel 3: Signal Delivery Latency**
- P95 latency (target: <5s)
- Heatmap showing distribution
- Alerts on P95 >10s

**Panel 4: Timeout Events Rate**
- Events per minute (warning: >0.5/s)
- Stacked by coordinator ID
- Annotations for deployments

### Alert Rules and Response
**Narrator:** "We have 3 alert rules with defined response procedures."

**Screen:** Show Prometheus alert rules

**Alert 1: HighBlockingDuration**
```yaml
- alert: HighBlockingDuration
  expr: histogram_quantile(0.95, blocking_coordination_duration_seconds) > 300
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High P95 blocking duration: {{ $value }}s"
    description: "Check for slow validators or network issues"
```

**Response Procedure:**
1. Check validator agent logs for errors
2. Verify Redis performance metrics
3. Review recent deployment changes
4. Scale validator count if needed

**Alert 2: CoordinatorDeathSpike**
```yaml
- alert: CoordinatorDeathSpike
  expr: rate(dead_coordinator_escalations_total[5m]) > 0.5
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Multiple coordinators dying: {{ $value }}/s"
    description: "Possible infrastructure issue or memory leak"
```

**Response Procedure:**
1. Check system resources (CPU/memory/disk)
2. Review coordinator process logs
3. Verify Redis cluster health
4. Roll back recent code changes if needed

**Alert 3: SignalDeliveryFailure**
```yaml
- alert: SignalDeliveryFailure
  expr: rate(signal_delivery_failures_total[5m]) > 0.1
  for: 3m
  labels:
    severity: warning
  annotations:
    summary: "Signal delivery failing: {{ $value }}/s"
    description: "HMAC verification or Redis pub/sub issues"
```

**Response Procedure:**
1. Verify BLOCKING_COORDINATION_SECRET consistency
2. Check Redis pub/sub channel health
3. Review network connectivity
4. Inspect signal signature logs

### Demo: Trigger Alert
**Narrator:** "Let's trigger the HighBlockingDuration alert and see the response."

**Terminal 1:** Start coordinator with long timeout
```bash
# Start coordinator that will timeout
node tests/chaos/fixtures/coordinator-runner.js --id coord-slow --timeout 600000

# Don't send signal (let it timeout)
```

**Screen:** Grafana dashboard after 5 minutes
- P95 blocking duration climbs to 600s
- Alert fires: "HighBlockingDuration: 600s"
- PagerDuty notification sent

**Terminal 2:** Investigate
```bash
# Check coordinator logs
tail -f logs/coord-slow.log

# Check Redis performance
redis-cli --latency-history

# Output shows no Redis issues → validator problem
```

---

## Conclusion (2 minutes)

### Key Takeaways
**Narrator:** "Let's recap the critical concepts."

**Screen:** Summary slide

1. **Blocking coordination synchronizes distributed agents**
   - Signal ACK protocol ensures reliable delivery
   - HMAC signatures prevent forgery
   - 24h TTL prevents signal replay

2. **Dead coordinator detection prevents silent failures**
   - 5s heartbeat interval, 90s TTL
   - 120s stale threshold with 3-warning escalation
   - Automatic work transfer to new coordinators

3. **Failure recovery maintains system resilience**
   - Circuit breaker for Redis failures
   - Exponential backoff [1s, 2s, 4s, 8s]
   - Auto-reconnection after infrastructure recovery

4. **Monitoring provides operational visibility**
   - 4 Prometheus metrics (duration, count, latency, failures)
   - 3 alert rules with response procedures
   - Grafana dashboard for real-time insights

### Next Steps
**Narrator:** "To learn more, explore these resources:"

**Screen:** Resources slide
- Troubleshooting Guide: `docs/training/troubleshooting-guide.md`
- Best Practices: `docs/training/best-practices.md`
- Interactive Tutorial: `docs/training/interactive-tutorial.md`
- FAQ: `docs/training/faq.md`

**Narrator:** "Thank you for watching. Happy coordinating!"

**Screen:** End screen with contact information

---

## Presentation Notes

### Recording Setup
- **Screen Resolution:** 1920x1080 (1080p)
- **Recording Software:** OBS Studio
- **Audio:** Rode NT-USB microphone
- **Editor:** DaVinci Resolve for post-production

### Code Snippets to Prepare
1. `src/cfn-loop/blocking-coordinator.ts` (full file)
2. `src/cfn-loop/coordinator-timeout-handler.ts` (full file)
3. `tests/chaos/fixtures/coordinator-runner.js` (demo script)
4. `prometheus/alert-rules.yml` (alert definitions)

### Terminal Commands to Rehearse
```bash
# Coordinator startup
node tests/chaos/fixtures/coordinator-runner.js --id coord-demo --timeout 600000

# Signal sending
redis-cli SETEX blocking:signal:coord-demo 86400 '{"senderId":"coord-a","receiverId":"coord-demo","type":"wake","timestamp":'$(date +%s)'}'

# Process kill
kill -9 $COORD_PID

# Redis restart
sudo systemctl restart redis

# Timeout handler
node -e "const handler = require('./src/cfn-loop/coordinator-timeout-handler'); handler.checkCoordinatorActivity();"
```

### Grafana Dashboard Configuration
**Import dashboard JSON:** `grafana/blocking-coordination-dashboard.json`

**Panels:**
1. Blocking Duration (Time series, 3 series: P50/P95/P99)
2. Active Coordinators (Stat panel with trend)
3. Signal Delivery Latency (Heatmap)
4. Timeout Events Rate (Bar gauge)

### Troubleshooting Tips
- If Redis connection fails: Check `REDIS_URL` and `REDIS_PASSWORD` env vars
- If Grafana dashboard is empty: Verify Prometheus scrape targets
- If coordinator won't start: Check Node.js version (≥18.0.0)
- If HMAC verification fails: Ensure `BLOCKING_COORDINATION_SECRET` set

### Time Allocations
- Part 1 (Intro): 5:00 (strict limit)
- Part 2 (Signal ACK): 8:00 (detailed demo)
- Part 3 (Dead Detection): 7:00 (crash simulation)
- Part 4 (Recovery): 5:00 (Redis restart)
- Part 5 (Monitoring): 5:00 (Grafana walkthrough)
- Conclusion: 2:00

**Total:** 32 minutes (2 minutes buffer for Q&A)
