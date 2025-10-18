# Blocking Coordination Interactive Tutorial

**Duration:** 60 minutes (hands-on)
**Prerequisites:** Node.js ≥18, Redis ≥6.0, docker/docker-compose
**Difficulty:** Intermediate

---

## Setup

### 1. Install Dependencies

```bash
# Clone repository
git clone https://github.com/example/claude-flow-novice.git
cd claude-flow-novice

# Install packages
npm install

# Start Redis (Docker)
docker run -d \
  --name redis-tutorial \
  -p 6379:6379 \
  redis:7-alpine

# Verify Redis running
redis-cli ping  # Should return "PONG"
```

### 2. Set Environment Variables

```bash
# Create .env file
cat > .env << 'EOF'
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
BLOCKING_COORDINATION_SECRET=$(openssl rand -hex 32)
NODE_ENV=development
EOF

# Source environment
source .env
```

### 3. Verify Setup

```bash
# Run setup verification script
npm run verify:blocking-setup

# Expected output:
# ✅ Redis connection successful
# ✅ BLOCKING_COORDINATION_SECRET set
# ✅ Node.js version 18.0.0+
# ✅ All dependencies installed
```

---

## Exercise 1: Send Your First Signal

**Objective:** Learn how to send a signal from one coordinator to another and verify acknowledgment.

**Duration:** 10 minutes

### Step 1: Start Coordinator A

```bash
# Terminal 1
node tests/chaos/fixtures/coordinator-runner.js \
  --id coord-a \
  --timeout 600000

# Expected output:
# [00:00:00] Coordinator coord-a started
# [00:00:00] Heartbeat started (5s interval)
# [00:00:00] Waiting for signal...
```

### Step 2: Start Coordinator B

```bash
# Terminal 2
node tests/chaos/fixtures/coordinator-runner.js \
  --id coord-b \
  --timeout 600000

# Expected output:
# [00:00:00] Coordinator coord-b started
# [00:00:00] Heartbeat started (5s interval)
# [00:00:00] Waiting for signal...
```

### Step 3: Send Signal from A to B

```bash
# Terminal 3
# Manually send signal using Redis
TIMESTAMP=$(date +%s)000  # Milliseconds
SENDER_ID="coord-a"
RECEIVER_ID="coord-b"
TYPE="wake"

# Calculate HMAC signature
SECRET="${BLOCKING_COORDINATION_SECRET}"
PAYLOAD="${SENDER_ID}:${RECEIVER_ID}:${TYPE}:${TIMESTAMP}"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

# Create signal JSON
SIGNAL=$(cat <<EOF
{
  "senderId": "$SENDER_ID",
  "receiverId": "$RECEIVER_ID",
  "type": "$TYPE",
  "timestamp": $TIMESTAMP,
  "signature": "$SIGNATURE"
}
EOF
)

# Send to Redis (24h TTL)
redis-cli SETEX "blocking:signal:${RECEIVER_ID}" 86400 "$SIGNAL"

# Verify signal stored
redis-cli GET "blocking:signal:${RECEIVER_ID}" | jq .
```

### Step 4: Verify Signal Receipt

**Terminal 2 (Coordinator B) should show:**
```
[00:00:05] Signal received: wake
[00:00:05] Signature verified: true
[00:00:05] Sending ACK to coord-a
[00:00:05] Blocking operation resumed
```

**Terminal 1 (Coordinator A) should show:**
```
[00:00:06] ACK received from coord-b
[00:00:06] Signal delivery confirmed
```

### Step 5: Verify ACK in Redis

```bash
# Terminal 3
# Check ACK key
redis-cli GET "blocking:ack:coord-a" | jq .

# Expected output:
# {
#   "receiverId": "coord-a",
#   "timestamp": 1633024800000
# }

# Check TTL
redis-cli TTL "blocking:ack:coord-a"
# Expected: ~3600 (1 hour)
```

### Verification Questions

1. What is the TTL of signal keys? **Answer: 86400s (24 hours)**
2. What fields are included in HMAC signature? **Answer: senderId:receiverId:type:timestamp**
3. What happens if signature is invalid? **Answer: Signal rejected, error logged**

---

## Exercise 2: Simulate Coordinator Crash

**Objective:** Understand dead coordinator detection and automatic cleanup.

**Duration:** 15 minutes

### Step 1: Start Coordinator with Monitoring

```bash
# Terminal 1
node tests/chaos/fixtures/coordinator-runner.js \
  --id coord-crash \
  --timeout 600000 \
  --log-heartbeat  # Enable heartbeat logging

# Expected output:
# [00:00:00] Coordinator coord-crash started
# [00:00:05] Heartbeat sent (TTL: 90s)
# [00:00:10] Heartbeat sent (TTL: 90s)
# ...
```

### Step 2: Monitor Heartbeat in Redis

```bash
# Terminal 2
# Watch heartbeat updates
watch -n 1 'redis-cli GET blocking:heartbeat:coord-crash | jq .'

# Expected output (updating every 5s):
# {
#   "coordinatorId": "coord-crash",
#   "timestamp": 1633024800123,
#   "status": "alive",
#   "pid": 12345,
#   "hostname": "localhost"
# }
```

### Step 3: Kill Coordinator Process

```bash
# Terminal 1
# Get PID
ps aux | grep "coord-crash" | grep -v grep

# Kill process (simulate crash)
kill -9 <PID>

# Or use keyboard shortcut in Terminal 1:
# Ctrl+C to stop gracefully
# Ctrl+Z + kill -9 %% to force kill
```

### Step 4: Observe Heartbeat Expiration

**Terminal 2 (watch command):**
```
# After 90 seconds, heartbeat key disappears:
(null)
```

```bash
# Verify key is gone
redis-cli GET blocking:heartbeat:coord-crash
# Output: (nil)

# Check TTL
redis-cli TTL blocking:heartbeat:coord-crash
# Output: -2 (key doesn't exist)
```

### Step 5: Run Timeout Handler

```bash
# Terminal 3
# Wait 120 seconds after crash (dead coordinator threshold)
sleep 120

# Run timeout handler
node -e "
const handler = require('./src/cfn-loop/coordinator-timeout-handler');
handler.checkCoordinatorActivity();
"

# Expected output:
# [00:02:00] Scanning for stale coordinators...
# [00:02:00] Found heartbeat: coord-crash (expired)
# [00:02:00] Dead coordinator detected: coord-crash
# [00:02:00] Escalating to dead coordinator handler
# [00:02:00] Cleaning up coordinator state
# [00:02:00] Dead coordinator keys removed: 3
```

### Step 6: Verify Cleanup

```bash
# Terminal 3
# Check all coordinator keys removed
redis-cli KEYS "blocking:*coord-crash*"
# Expected: (empty array)

# Verify cleanup metrics
redis-cli GET "cleanup:stats" | jq .
# Expected:
# {
#   "lastRun": 1633024920000,
#   "cleanedCoordinators": ["coord-crash"],
#   "keysRemoved": 3
# }
```

### Verification Questions

1. How long until heartbeat expires? **Answer: 90 seconds (TTL)**
2. When is coordinator marked dead? **Answer: 120 seconds (2× TTL threshold)**
3. How many warnings before escalation? **Answer: 3 warnings over 5 minutes**

---

## Exercise 3: Test Redis Reconnection

**Objective:** Verify circuit breaker and automatic reconnection after Redis failure.

**Duration:** 10 minutes

### Step 1: Start Coordinator with Logging

```bash
# Terminal 1
DEBUG=blocking:* node tests/chaos/fixtures/coordinator-runner.js \
  --id coord-reconnect \
  --timeout 600000

# Expected output:
# [00:00:00] Coordinator coord-reconnect started
# [00:00:00] Redis connection established
# [00:00:05] Heartbeat sent: OK
```

### Step 2: Monitor Redis Operations

```bash
# Terminal 2
# Monitor Redis commands
redis-cli MONITOR

# Expected output (continuous stream):
# 1633024800.123456 [0 172.17.0.1:54321] "SETEX" "blocking:heartbeat:coord-reconnect" "90" "..."
# 1633024805.123456 [0 172.17.0.1:54321] "SETEX" "blocking:heartbeat:coord-reconnect" "90" "..."
```

### Step 3: Restart Redis

```bash
# Terminal 3
# Docker restart (simulates Redis crash)
docker restart redis-tutorial

# Expected downtime: ~2-5 seconds
```

### Step 4: Observe Circuit Breaker

**Terminal 1 (Coordinator) should show:**
```
[00:00:10] Heartbeat sent: OK
[00:00:15] Redis error: Connection closed
[00:00:15] Circuit breaker triggered (attempt 1/4)
[00:00:16] Retrying Redis operation in 1000ms
[00:00:17] Redis error: Connection refused
[00:00:17] Circuit breaker triggered (attempt 2/4)
[00:00:19] Retrying Redis operation in 2000ms
[00:00:21] Redis connection restored
[00:00:21] Circuit breaker reset
[00:00:21] Heartbeat sent: OK
```

**Terminal 2 (Redis monitor) should show:**
```
# Gap during restart
...
1633024815.123 [disconnect]
# Redis restarted
1633024821.456 [connect]
1633024821.789 [0 172.17.0.1:54321] "SETEX" "blocking:heartbeat:coord-reconnect" "90" "..."
```

### Step 5: Verify Reconnection Metrics

```bash
# Terminal 3
# Check circuit breaker stats
curl http://localhost:9090/metrics | grep circuit_breaker

# Expected output:
# circuit_breaker_triggers_total{reason="redis_connection"} 2
# circuit_breaker_open_duration_seconds 6.0
# circuit_breaker_reconnections_total 1
```

### Step 6: Test Prolonged Outage

```bash
# Terminal 3
# Stop Redis for >15 seconds (exceeds 4 retry attempts)
docker stop redis-tutorial
sleep 20
docker start redis-tutorial
```

**Terminal 1 should show:**
```
[00:00:30] Redis error: Connection closed
[00:00:30] Circuit breaker triggered (attempt 1/4)
[00:00:31] Retrying in 1000ms
[00:00:32] Circuit breaker triggered (attempt 2/4)
[00:00:34] Retrying in 2000ms
[00:00:36] Circuit breaker triggered (attempt 3/4)
[00:00:40] Retrying in 4000ms
[00:00:44] Circuit breaker triggered (attempt 4/4)
[00:00:52] Retrying in 8000ms
[00:00:60] Circuit breaker open: Redis unavailable
[00:00:60] Coordinator entering degraded mode
[00:01:00] Redis reconnected after 30s downtime
[00:01:00] Circuit breaker reset
```

### Verification Questions

1. What are circuit breaker retry delays? **Answer: [1s, 2s, 4s, 8s] exponential backoff**
2. How many retry attempts before giving up? **Answer: 4 attempts**
3. What happens after circuit opens? **Answer: Coordinator enters degraded mode, stops heartbeat**

---

## Exercise 4: Monitor with Prometheus

**Objective:** Set up Prometheus monitoring and visualize blocking coordination metrics.

**Duration:** 15 minutes

### Step 1: Start Prometheus

```bash
# Terminal 1
# Start Prometheus with config
docker run -d \
  --name prometheus-tutorial \
  --network host \
  -v $(pwd)/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus:latest

# Verify Prometheus running
curl http://localhost:9090/-/healthy
# Expected: Prometheus is Healthy.
```

### Step 2: Start Coordinator with Metrics

```bash
# Terminal 2
METRICS_PORT=9091 node tests/chaos/fixtures/coordinator-runner.js \
  --id coord-metrics \
  --timeout 600000 \
  --enable-metrics

# Expected output:
# [00:00:00] Coordinator coord-metrics started
# [00:00:00] Metrics server listening on :9091
# [00:00:00] Exposing 4 metrics: duration, latency, count, timeouts
```

### Step 3: Verify Metrics Endpoint

```bash
# Terminal 3
# Check metrics exposed
curl http://localhost:9091/metrics

# Expected output:
# # HELP blocking_coordination_duration_seconds Time spent blocked
# # TYPE blocking_coordination_duration_seconds histogram
# blocking_coordination_duration_seconds_bucket{le="10"} 0
# blocking_coordination_duration_seconds_bucket{le="30"} 0
# blocking_coordination_duration_seconds_bucket{le="+Inf"} 0
# blocking_coordination_duration_seconds_sum 0
# blocking_coordination_duration_seconds_count 0
#
# # HELP signal_delivery_latency_seconds Signal delivery latency
# # TYPE signal_delivery_latency_seconds histogram
# ...
#
# # HELP active_coordinators Number of active coordinators
# # TYPE active_coordinators gauge
# active_coordinators 1
#
# # HELP timeout_events_total Total timeout events
# # TYPE timeout_events_total counter
# timeout_events_total 0
```

### Step 4: Generate Metrics Data

```bash
# Terminal 4
# Send 10 signals to generate metrics
for i in {1..10}; do
  TIMESTAMP=$(date +%s)000
  SIGNAL='{"senderId":"test-sender","receiverId":"coord-metrics","type":"wake","timestamp":'$TIMESTAMP'}'
  redis-cli SETEX "blocking:signal:coord-metrics" 86400 "$SIGNAL"
  sleep 2
done
```

**Terminal 2 (Coordinator) should show:**
```
[00:00:02] Signal received: wake (latency: 0.123s)
[00:00:04] Signal received: wake (latency: 0.098s)
[00:00:06] Signal received: wake (latency: 0.145s)
...
[00:00:20] Signal received: wake (latency: 0.112s)
```

### Step 5: Query Metrics in Prometheus

```bash
# Open Prometheus UI
open http://localhost:9090

# Run PromQL queries:

# 1. P95 blocking duration
histogram_quantile(0.95, rate(blocking_coordination_duration_seconds_bucket[5m]))

# 2. Active coordinators
active_coordinators

# 3. P95 signal latency
histogram_quantile(0.95, rate(signal_delivery_latency_seconds_bucket[5m]))

# 4. Timeout event rate
rate(timeout_events_total[5m])
```

### Step 6: Import Grafana Dashboard

```bash
# Terminal 3
# Start Grafana
docker run -d \
  --name grafana-tutorial \
  --network host \
  grafana/grafana:latest

# Open Grafana
open http://localhost:3000
# Default credentials: admin/admin

# Import dashboard
# 1. Click "+" → Import
# 2. Upload grafana/blocking-coordination-dashboard.json
# 3. Select Prometheus data source
# 4. Click "Import"
```

**Dashboard panels should show:**
- Panel 1: Blocking Duration (P50/P95/P99) - 3 lines on time series
- Panel 2: Active Coordinators - gauge showing "1"
- Panel 3: Signal Delivery Latency - heatmap with 10 data points
- Panel 4: Timeout Events Rate - bar gauge showing "0"

### Verification Questions

1. How many Prometheus metrics are exposed? **Answer: 4 (duration, latency, count, timeouts)**
2. What is P95 blocking duration target? **Answer: <300 seconds (5 minutes)**
3. What triggers HighBlockingDuration alert? **Answer: P95 >300s for 5 minutes**

---

## Exercise 5: Run Chaos Test

**Objective:** Validate system resilience under chaos conditions (random coordinator kills).

**Duration:** 10 minutes

### Step 1: Understand Chaos Test

```bash
# View chaos test script
cat tests/chaos/process-kill.test.ts

# Key parameters:
# - Coordinators: 10
# - Test duration: 5 minutes
# - Kill interval: 30 seconds (random)
# - Expected uptime: ≥90%
```

### Step 2: Run Chaos Test

```bash
# Terminal 1
npm run test:chaos:process-kill

# Expected output:
# [00:00:00] Spawning 10 coordinators...
# [00:00:01] coord-0 started (PID 12345)
# [00:00:01] coord-1 started (PID 12346)
# ...
# [00:00:10] coord-9 started (PID 12354)
# [00:00:15] All coordinators healthy
# [00:00:30] Killing random coordinator...
# [00:00:30] coord-3 killed (PID 12348)
# [00:00:35] Dead coordinator detected: coord-3
# [00:00:36] Spawning replacement: coord-3-recovery
# [00:00:45] coord-3-recovery started (PID 12355)
# [00:01:00] Killing random coordinator...
# ...
# [00:05:00] Chaos test complete
# [00:05:00] Results:
#   - Total coordinators spawned: 10
#   - Total kills: 10
#   - Total recoveries: 10
#   - Uptime: 94.2% (target: ≥90%) ✅
#   - Max recovery time: 8.3s
#   - P95 recovery time: 6.1s
```

### Step 3: Monitor During Chaos

```bash
# Terminal 2
# Watch active coordinator count
watch -n 1 'redis-cli KEYS "blocking:heartbeat:*" | wc -l'

# Expected output (fluctuating):
# 10
# 10
# 9  (coordinator killed)
# 9
# 10 (replacement spawned)
# 10
# ...
```

```bash
# Terminal 3
# Monitor timeout handler logs
tail -f /var/log/cfn-loop/timeout-handler.log

# Expected output:
# [00:00:30] Dead coordinator detected: coord-3 (heartbeat expired)
# [00:00:35] Escalating dead coordinator: coord-3
# [00:00:35] Spawning replacement: coord-3-recovery
# [00:00:36] Cleanup complete: coord-3
# [00:01:00] Dead coordinator detected: coord-7 (heartbeat expired)
# ...
```

### Step 4: Analyze Results

```bash
# View detailed metrics
cat tests/chaos/results.json | jq .

# Expected output:
# {
#   "test": "process-kill",
#   "duration_seconds": 300,
#   "coordinators_spawned": 10,
#   "kills": 10,
#   "recoveries": 10,
#   "uptime_percentage": 94.2,
#   "max_recovery_time_ms": 8300,
#   "p95_recovery_time_ms": 6100,
#   "p50_recovery_time_ms": 5200,
#   "failures": [],
#   "status": "PASS"
# }
```

### Step 5: View Recovery Timeline

```bash
# Generate timeline visualization
node tests/chaos/visualize-timeline.js

# Open timeline.html in browser
open tests/chaos/timeline.html
```

**Timeline should show:**
- 10 horizontal bars (coordinators)
- Green segments: coordinator alive
- Red segments: coordinator dead
- Gaps: recovery time
- Annotations: kill events

### Step 6: Verify No Data Loss

```bash
# Check work continuity
node tests/chaos/verify-work-continuity.js

# Expected output:
# [00:05:01] Verifying work continuity...
# [00:05:01] Work items before chaos: 100
# [00:05:01] Work items after chaos: 100
# [00:05:01] Work item integrity: 100% ✅
# [00:05:01] No duplicate work: ✅
# [00:05:01] No lost work: ✅
```

### Verification Questions

1. What is target uptime during chaos? **Answer: ≥90%**
2. How often are coordinators killed? **Answer: Every 30 seconds (random)**
3. What is P95 recovery time? **Answer: <10 seconds**

---

## Advanced Exercise: Custom Signal Types

**Objective:** Extend blocking coordination with custom signal types for specific CFN Loop phases.

**Duration:** 15 minutes (bonus)

### Step 1: Define Custom Signal Type

```typescript
// src/cfn-loop/signal-types.ts
export enum SignalType {
  WAKE = 'wake',                    // Generic wake signal
  VALIDATE = 'validate',            // Loop 2 consensus validation
  DECIDE = 'decide',                // Loop 4 GOAP decision
  ESCALATE = 'escalate',            // Error escalation
  CHECKPOINT = 'checkpoint'         // Work checkpoint
}

export interface ValidateSignal extends Signal {
  type: SignalType.VALIDATE;
  metadata: {
    validatorId: string;
    confidence: number;
    recommendations: string[];
  };
}

export interface DecideSignal extends Signal {
  type: SignalType.DECIDE;
  metadata: {
    decision: 'PROCEED' | 'DEFER' | 'ESCALATE';
    consensus: number;
    reasoning: string;
  };
}
```

### Step 2: Implement Custom Handler

```typescript
// src/cfn-loop/custom-coordinator.ts
import { BlockingCoordinator } from './blocking-coordinator';
import { SignalType, ValidateSignal, DecideSignal } from './signal-types';

export class CFNLoopCoordinator extends BlockingCoordinator {
  async handleSignal(signal: Signal): Promise<void> {
    switch (signal.type) {
      case SignalType.VALIDATE:
        return this.handleValidateSignal(signal as ValidateSignal);

      case SignalType.DECIDE:
        return this.handleDecideSignal(signal as DecideSignal);

      default:
        return super.handleSignal(signal);
    }
  }

  private async handleValidateSignal(signal: ValidateSignal): Promise<void> {
    console.log(`Validation signal from ${signal.metadata.validatorId}`);
    console.log(`Confidence: ${signal.metadata.confidence}`);

    // Store validation result
    await this.redis.setex(
      `validation:${this.id}:${signal.senderId}`,
      3600,
      JSON.stringify(signal.metadata)
    );

    // Check if all validators responded
    const validatorKeys = await this.redis.keys(`validation:${this.id}:*`);

    if (validatorKeys.length >= this.expectedValidators) {
      // Calculate consensus
      const consensus = await this.calculateConsensus(validatorKeys);

      // Send DECIDE signal to Product Owner
      await this.sendSignal('product-owner', SignalType.DECIDE, {
        decision: consensus >= 0.90 ? 'PROCEED' : 'DEFER',
        consensus,
        reasoning: `Consensus ${consensus} from ${validatorKeys.length} validators`
      });
    }
  }

  private async handleDecideSignal(signal: DecideSignal): Promise<void> {
    console.log(`Decision signal: ${signal.metadata.decision}`);
    console.log(`Reasoning: ${signal.metadata.reasoning}`);

    // Execute decision
    switch (signal.metadata.decision) {
      case 'PROCEED':
        await this.proceedToNextPhase();
        break;

      case 'DEFER':
        await this.deferToBacklog(signal.metadata.recommendations);
        break;

      case 'ESCALATE':
        await this.escalateToHuman(signal.metadata.reasoning);
        break;
    }
  }
}
```

### Step 3: Test Custom Signal Flow

```bash
# Terminal 1: Start Product Owner coordinator
node tests/custom/product-owner-coordinator.js

# Terminal 2: Start Validator 1
node tests/custom/validator-coordinator.js --id validator-1 --confidence 0.92

# Terminal 3: Start Validator 2
node tests/custom/validator-coordinator.js --id validator-2 --confidence 0.88

# Terminal 4: Trigger validation
curl -X POST http://localhost:3000/trigger-validation \
  -H "Content-Type: application/json" \
  -d '{"phase": "authentication", "validators": ["validator-1", "validator-2"]}'
```

**Expected flow:**
1. Product Owner sends VALIDATE signal to validators
2. Validators respond with confidence scores
3. Product Owner calculates consensus (0.92 + 0.88) / 2 = 0.90
4. Product Owner sends DECIDE signal to itself
5. Decision: PROCEED (consensus ≥0.90)

### Step 4: Verify Signal Metadata

```bash
# Check stored validation results
redis-cli KEYS "validation:product-owner:*" | while read key; do
  echo "$key:"
  redis-cli GET "$key" | jq .
done

# Expected output:
# validation:product-owner:validator-1:
# {
#   "validatorId": "validator-1",
#   "confidence": 0.92,
#   "recommendations": ["Add rate limiting"]
# }
#
# validation:product-owner:validator-2:
# {
#   "validatorId": "validator-2",
#   "confidence": 0.88,
#   "recommendations": ["Improve error handling"]
# }
```

---

## Troubleshooting Tips

### Issue: Signal Not Received

**Symptoms:**
- Coordinator waiting indefinitely
- No "Signal received" log

**Diagnosis:**
```bash
# Check if signal exists
redis-cli GET "blocking:signal:coord-id"

# Check signature
redis-cli GET "blocking:signal:coord-id" | jq -r '.signature'

# Verify secret matches
echo $BLOCKING_COORDINATION_SECRET
```

**Solution:**
```bash
# Regenerate signal with correct signature
TIMESTAMP=$(date +%s)000
SECRET="$BLOCKING_COORDINATION_SECRET"
PAYLOAD="sender:receiver:wake:$TIMESTAMP"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

# Send signal
redis-cli SETEX "blocking:signal:receiver" 86400 '{"senderId":"sender","receiverId":"receiver","type":"wake","timestamp":'$TIMESTAMP',"signature":"'$SIGNATURE'"}'
```

### Issue: Heartbeat Not Updating

**Symptoms:**
- Heartbeat timestamp not changing
- Coordinator marked as dead

**Diagnosis:**
```bash
# Check heartbeat interval
ps aux | grep coordinator | grep -o 'heartbeat-interval=[0-9]*'

# Watch heartbeat updates
watch -n 1 'redis-cli GET blocking:heartbeat:coord-id | jq -r .timestamp'
```

**Solution:**
```bash
# Restart coordinator with correct interval
HEARTBEAT_INTERVAL=5000 node coordinator.js
```

### Issue: Redis Connection Refused

**Symptoms:**
- "Circuit breaker open" errors
- Cannot connect to Redis

**Diagnosis:**
```bash
# Check Redis running
docker ps | grep redis

# Check Redis logs
docker logs redis-tutorial

# Test connection
redis-cli -h localhost -p 6379 ping
```

**Solution:**
```bash
# Restart Redis
docker restart redis-tutorial

# Or start if stopped
docker start redis-tutorial
```

---

## Next Steps

### Continue Learning

1. **Read Troubleshooting Guide:** `/docs/training/troubleshooting-guide.md`
2. **Study Best Practices:** `/docs/training/best-practices.md`
3. **Watch Video Walkthrough:** `/docs/training/video-walkthrough-script.md`
4. **Review FAQ:** `/docs/training/faq.md`

### Practice Projects

1. **Build Multi-Validator System:** 5 validators, Byzantine consensus
2. **Implement Timeout Handler:** Dead coordinator detection, work transfer
3. **Create Monitoring Dashboard:** Grafana dashboard with 10 panels
4. **Chaos Engineering:** Network partition, Redis failure scenarios

### Certification

Complete all 5 exercises and pass assessment to earn:
**Blocking Coordination Certified Engineer (BCCE)**

Assessment covers:
- Signal ACK protocol (25%)
- Dead coordinator detection (25%)
- Circuit breaker implementation (20%)
- Monitoring and alerting (20%)
- Troubleshooting scenarios (10%)

### Community

- **Slack:** #blocking-coordination
- **Weekly Office Hours:** Tuesdays 2pm PT
- **Contribution Guide:** `/docs/CONTRIBUTING.md`
