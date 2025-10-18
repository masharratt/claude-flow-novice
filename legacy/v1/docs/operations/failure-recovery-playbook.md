# Failure Recovery Playbook

## Overview

This playbook provides step-by-step incident response procedures for blocking coordination failures in CFN Loop production environments. Each section includes symptoms, detection methods, root cause analysis, and recovery procedures.

## Incident Response Workflow

```
Detection → Triage → Diagnosis → Recovery → Validation → Post-Mortem
    ↓          ↓          ↓          ↓          ↓            ↓
  Alerts   Severity   Root Cause  Execute   Verify    Document
           Assessment  Analysis    Playbook  Success   Learnings
```

---

## 1. Redis Connection Loss

### Symptoms

- Circuit breaker transitions to OPEN state
- Coordinators stuck in blocking state unable to send/receive signals
- Heartbeat failures spike across all coordinators
- Prometheus alert: `heartbeat_failures_total` rate >0.5/s

### Detection

**Automated Alerts**:
```
Alert: RedisConnectionLoss
Severity: CRITICAL
Trigger: heartbeat_failures_total{reason="connection"} > 0.5/s for 2min
```

**Manual Verification**:
```bash
# Check Redis connectivity from coordinator hosts
redis-cli -h redis.prod.example.com ping
# Expected: PONG

# Check coordinator logs for connection errors
kubectl logs -n cfn-loop -l app=coordinator | grep "Redis connection failed"

# Monitor circuit breaker state
curl http://coordinator-1.cfn-loop:8080/metrics | grep circuit_breaker_state
# circuit_breaker_state{state="open"} 1
```

### Root Cause Analysis

Common causes:

1. **Redis Server Crash**: Redis process terminated or OOM killed
2. **Network Partition**: Network connectivity lost between coordinators and Redis
3. **Resource Exhaustion**: Redis max connections exceeded
4. **DNS Resolution Failure**: Redis hostname unresolvable
5. **Firewall Rules**: Security group or firewall blocking Redis port (6379)

**Diagnosis Steps**:

```bash
# 1. Check Redis server health
kubectl get pods -n redis
# Look for CrashLoopBackOff or Pending status

# 2. Verify Redis logs
kubectl logs -n redis redis-0 --tail=100
# Look for OOM, connection errors, slowlog warnings

# 3. Check network connectivity
kubectl exec -n cfn-loop coordinator-1 -- ping redis.prod.example.com

# 4. Verify Redis connections
redis-cli -h redis.prod.example.com info clients
# Check connected_clients vs maxclients

# 5. Check DNS resolution
kubectl exec -n cfn-loop coordinator-1 -- nslookup redis.prod.example.com
```

### Recovery Procedure

**Step 1: Immediate Mitigation (ETA: 2 minutes)**

```bash
# Option A: Restart Redis (if crashed)
kubectl rollout restart statefulset/redis -n redis

# Option B: Scale Redis replicas (if resource exhaustion)
kubectl scale statefulset/redis -n redis --replicas=3

# Option C: Clear Redis connections (if max connections exceeded)
redis-cli -h redis.prod.example.com CLIENT KILL TYPE normal SKIPME yes
```

**Step 2: Verify Redis Health (ETA: 1 minute)**

```bash
# Check Redis is accepting connections
redis-cli -h redis.prod.example.com ping
# Expected: PONG

# Verify replication status
redis-cli -h redis.prod.example.com info replication
# role:master
# connected_slaves:2

# Check memory usage
redis-cli -h redis.prod.example.com info memory
# used_memory_human should be <80% of maxmemory
```

**Step 3: Restart Coordinators (ETA: 3 minutes)**

```bash
# Gracefully restart coordinators to reconnect to Redis
kubectl rollout restart deployment/coordinator -n cfn-loop

# Monitor rollout status
kubectl rollout status deployment/coordinator -n cfn-loop

# Wait for all coordinators to become ready
kubectl wait --for=condition=ready pod -l app=coordinator -n cfn-loop --timeout=180s
```

**Step 4: Verify Circuit Breaker Recovery (ETA: 2 minutes)**

```bash
# Check circuit breaker state transitions to CLOSED
for i in {1..10}; do
  curl -s http://coordinator-$i.cfn-loop:8080/metrics | grep circuit_breaker_state
  sleep 1
done
# Expected: circuit_breaker_state{state="closed"} 1

# Verify heartbeats resuming
redis-cli -h redis.prod.example.com --scan --pattern "blocking:heartbeat:*" | wc -l
# Should match number of active coordinators
```

**Step 5: Resume Blocking Operations (ETA: 1 minute)**

```bash
# Trigger signal retry for stuck coordinators
kubectl exec -n cfn-loop coordinator-1 -- \
  curl -X POST http://localhost:8080/api/signals/retry-failed

# Monitor ACK delivery latency
curl -s http://coordinator-1.cfn-loop:8080/metrics | \
  grep signal_delivery_latency_seconds_bucket
```

### Validation

Confirm recovery with these checks:

- [ ] Redis responds to PING commands
- [ ] Circuit breaker state is CLOSED across all coordinators
- [ ] Heartbeat failures rate returns to baseline (<0.01/s)
- [ ] All coordinators report READY status
- [ ] Signal delivery latency P95 <5s
- [ ] No stale heartbeat warnings in last 5 minutes

### Rollback Procedure

If recovery fails, rollback to previous stable state:

```bash
# Revert to previous Redis version
kubectl rollout undo statefulset/redis -n redis

# Restore Redis data from backup (last good backup)
kubectl exec -n redis redis-0 -- redis-cli --rdb /data/dump.rdb

# Scale coordinators to 0 to prevent further failures
kubectl scale deployment/coordinator -n cfn-loop --replicas=0
```

---

## 2. Dead Coordinator Detection

### Symptoms

- Coordinator heartbeat not updated >120s (2 minutes)
- No ACK received from coordinator for multiple signals
- Timeout handler logs show coordinator flagged as dead
- Prometheus metric: `timeout_events_total{reason="heartbeat"}` increments

### Detection

**Automated Alerts**:
```
Alert: DeadCoordinatorDetected
Severity: WARNING
Trigger: timeout_events_total{reason="heartbeat"} > 0 for 1min
```

**Manual Verification**:
```bash
# Check coordinator heartbeat age
redis-cli -h redis.prod.example.com get blocking:heartbeat:coordinator-1 | jq .timestamp
# Calculate age: Date.now() - timestamp

# Verify coordinator process status
kubectl get pods -n cfn-loop -l coordinator-id=coordinator-1

# Check coordinator logs for errors
kubectl logs -n cfn-loop coordinator-1 --tail=100
```

### Root Cause Analysis

Common causes:

1. **Process Crash**: Coordinator process terminated unexpectedly
2. **Hung Process**: Coordinator process alive but unresponsive (deadlock, infinite loop)
3. **Resource Starvation**: CPU/memory exhaustion preventing heartbeat updates
4. **Network Partition**: Coordinator isolated from Redis
5. **Kubernetes Eviction**: Node pressure caused pod eviction

**Diagnosis Steps**:

```bash
# 1. Check pod status
kubectl describe pod coordinator-1 -n cfn-loop
# Look for OOMKilled, Evicted, CrashLoopBackOff

# 2. Verify process is running
kubectl exec -n cfn-loop coordinator-1 -- ps aux | grep node
# Check if coordinator process exists

# 3. Check resource usage
kubectl top pod coordinator-1 -n cfn-loop
# Compare against pod limits

# 4. Verify network connectivity to Redis
kubectl exec -n cfn-loop coordinator-1 -- ping redis.prod.example.com

# 5. Check coordinator metrics
curl http://coordinator-1.cfn-loop:8080/metrics
# If no response, coordinator is hung or crashed
```

### Recovery Procedure

**Step 1: Confirm Coordinator Death (ETA: 30 seconds)**

```bash
# Check heartbeat age
HEARTBEAT=$(redis-cli -h redis.prod.example.com get blocking:heartbeat:coordinator-1)
TIMESTAMP=$(echo $HEARTBEAT | jq -r .timestamp)
AGE=$(($(date +%s) - ($TIMESTAMP / 1000)))

if [ $AGE -gt 120 ]; then
  echo "Coordinator confirmed dead: heartbeat age ${AGE}s"
fi
```

**Step 2: Trigger Automatic Cleanup (ETA: 1 minute)**

The timeout handler automatically cleans up dead coordinator state:

```bash
# Monitor cleanup progress
kubectl logs -n cfn-loop timeout-handler -f | grep "Dead coordinator escalation"

# Verify cleanup completed
redis-cli -h redis.prod.example.com --scan --pattern "blocking:heartbeat:coordinator-1"
# Should return no keys

redis-cli -h redis.prod.example.com --scan --pattern "blocking:ack:coordinator-1:*"
# Should return no keys
```

**Step 3: Spawn Replacement Coordinator (ETA: 2 minutes)**

```bash
# Automatic spawn is triggered by timeout handler
# Verify spawn request created
redis-cli -h redis.prod.example.com --scan --pattern "coordinator:spawn:*" | head -1
# coordinator:spawn:coordinator-1234567890-abc123

# Monitor new coordinator startup
kubectl get pods -n cfn-loop -l coordinator-id=coordinator-1234567890-abc123 -w

# Wait for new coordinator to become ready
kubectl wait --for=condition=ready pod -l coordinator-id=coordinator-1234567890-abc123 -n cfn-loop --timeout=120s
```

**Step 4: Verify Work Transfer (ETA: 30 seconds)**

```bash
# Check work items transferred to new coordinator
NEW_COORD_ID=$(redis-cli -h redis.prod.example.com --scan --pattern "coordinator:spawn:*" | \
  xargs redis-cli -h redis.prod.example.com get | jq -r .newCoordinatorId)

redis-cli -h redis.prod.example.com --scan --pattern "coordinator:work:*:${NEW_COORD_ID}:*"
# Should show transferred work items

# Verify transfer metadata
redis-cli -h redis.prod.example.com get "coordinator:work:swarm-123:${NEW_COORD_ID}:task-1" | \
  jq '.transferredFrom, .transferredAt'
```

**Step 5: Resume Blocked Operations (ETA: 1 minute)**

```bash
# Notify parent coordinator of replacement
SWARM_ID=$(redis-cli -h redis.prod.example.com get "coordinator:escalation:coordinator-1" | jq -r .swarmId)
redis-cli -h redis.prod.example.com publish "swarm:${SWARM_ID}:coordinator:replacement" \
  "{\"oldCoordinatorId\":\"coordinator-1\",\"newCoordinatorId\":\"${NEW_COORD_ID}\"}"

# Monitor parent coordinator acknowledgment
kubectl logs -n cfn-loop parent-coordinator -f | grep "Replacement coordinator acknowledged"
```

### Validation

Confirm recovery with these checks:

- [ ] Dead coordinator heartbeat key removed from Redis
- [ ] Dead coordinator ACK keys removed from Redis
- [ ] New coordinator spawned and READY
- [ ] Work items transferred to new coordinator
- [ ] Parent coordinator acknowledged replacement
- [ ] New coordinator sending heartbeats
- [ ] Escalation record created in Redis

### Manual Intervention

If automatic recovery fails:

```bash
# 1. Manually kill dead coordinator pod
kubectl delete pod coordinator-1 -n cfn-loop --force --grace-period=0

# 2. Manually spawn replacement
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: coordinator-replacement
  namespace: cfn-loop
  labels:
    app: coordinator
spec:
  containers:
  - name: coordinator
    image: coordinator:v1.2.3
    env:
    - name: COORDINATOR_ID
      value: "coordinator-replacement"
    - name: SWARM_ID
      value: "swarm-123"
EOF

# 3. Manually transfer work
# See docs/operations/manual-work-transfer.md
```

---

## 3. Signal Delivery Failure

### Symptoms

- ACK not received within 5s timeout
- Signal retry attempts exhausted (3 attempts)
- Prometheus metric: `signal_delivery_latency_seconds` P99 >5s
- Logs show "Signal retry exhausted all attempts"

### Detection

**Automated Alerts**:
```
Alert: HighSignalLatency
Severity: WARNING
Trigger: histogram_quantile(0.99, signal_delivery_latency_seconds_bucket) > 5 for 5min
```

**Manual Verification**:
```bash
# Check signal delivery latency P99
curl -s http://coordinator-1.cfn-loop:8080/metrics | \
  grep signal_delivery_latency_seconds_bucket | \
  ./calculate-quantile.sh 0.99

# Verify signal exists in Redis
redis-cli -h redis.prod.example.com get blocking:signal:coordinator-2

# Check for failed signal records
redis-cli -h redis.prod.example.com --scan --pattern "blocking:retry:failed:*"
```

### Root Cause Analysis

Common causes:

1. **Receiver Coordinator Down**: Target coordinator crashed before ACK sent
2. **Redis Pub/Sub Latency**: High Redis load causing pub/sub delays
3. **Network Congestion**: Packet loss between coordinators and Redis
4. **ACK Signature Verification Failure**: HMAC secret mismatch
5. **Signal Overwrite**: Duplicate signal overwrote previous signal before ACK

**Diagnosis Steps**:

```bash
# 1. Check receiver coordinator health
kubectl get pods -n cfn-loop -l coordinator-id=coordinator-2

# 2. Verify Redis latency
redis-cli -h redis.prod.example.com --latency-history

# 3. Check network latency
kubectl exec -n cfn-loop coordinator-1 -- \
  ping -c 10 redis.prod.example.com | tail -1

# 4. Verify HMAC secret consistency
kubectl get secret blocking-coordination-secret -n cfn-loop -o jsonpath='{.data.secret}' | \
  base64 -d | sha256sum
# Compare across all coordinators

# 5. Check for signal overwrites
redis-cli -h redis.prod.example.com get blocking:signal:coordinator-2 | jq .messageId
# Verify messageId matches expected signal
```

### Recovery Procedure

**Step 1: Verify Signal Delivery (ETA: 30 seconds)**

```bash
# Check if signal exists in Redis
SIGNAL=$(redis-cli -h redis.prod.example.com get blocking:signal:coordinator-2)

if [ -z "$SIGNAL" ]; then
  echo "Signal missing - likely overwritten or expired"
else
  echo "Signal exists: $(echo $SIGNAL | jq .messageId)"
fi
```

**Step 2: Retry Signal Delivery (ETA: 1 minute)**

```bash
# Trigger manual signal retry
kubectl exec -n cfn-loop coordinator-1 -- \
  curl -X POST http://localhost:8080/api/signals/retry \
  -H "Content-Type: application/json" \
  -d '{
    "receiverId": "coordinator-2",
    "signalType": "completion",
    "iteration": 3,
    "maxRetries": 3
  }'

# Monitor retry progress
kubectl logs -n cfn-loop coordinator-1 -f | grep "Signal retry"
```

**Step 3: Verify ACK Reception (ETA: 30 seconds)**

```bash
# Check if ACK received after retry
SIGNAL_ID="coordinator-1:coordinator-2:completion:3:1234567890"
ACK=$(redis-cli -h redis.prod.example.com get "blocking:ack:coordinator-2:${SIGNAL_ID}")

if [ -n "$ACK" ]; then
  echo "ACK received: $(echo $ACK | jq .timestamp)"
else
  echo "ACK still missing - escalate to dead coordinator handling"
fi
```

**Step 4: Verify HMAC Signature (ETA: 15 seconds)**

```bash
# If ACK received but verification failing, check HMAC secret
kubectl get secret blocking-coordination-secret -n cfn-loop -o jsonpath='{.data.secret}' | \
  base64 -d | wc -c
# Should be 32 bytes (256 bits)

# Verify all coordinators use same secret
for i in {1..10}; do
  kubectl exec -n cfn-loop coordinator-$i -- \
    printenv BLOCKING_COORDINATION_SECRET | sha256sum
done
# All should output same hash
```

**Step 5: Fallback to Direct Communication (ETA: 1 minute)**

If signal delivery continues failing, bypass Redis:

```bash
# Use HTTP direct communication as fallback
kubectl exec -n cfn-loop coordinator-1 -- \
  curl -X POST http://coordinator-2.cfn-loop:8080/api/signals/receive \
  -H "Content-Type: application/json" \
  -d '{
    "signalType": "completion",
    "senderId": "coordinator-1",
    "iteration": 3,
    "payload": {}
  }'
```

### Validation

Confirm recovery with these checks:

- [ ] Signal exists in Redis at expected key
- [ ] ACK received within 5s timeout
- [ ] ACK signature verification passes
- [ ] Signal delivery latency P99 <5s
- [ ] No failed signal records in Redis
- [ ] Retry attempts succeeded within 3 attempts

### Escalation

If signal delivery fails after all retries:

```bash
# 1. Log failed signal for manual escalation
redis-cli -h redis.prod.example.com setex \
  "blocking:retry:failed:${SIGNAL_ID}" 3600 \
  "{\"signalId\":\"${SIGNAL_ID}\",\"receiver\":\"coordinator-2\",\"attempts\":3,\"timestamp\":$(date +%s)000}"

# 2. Emit escalation event
kubectl exec -n cfn-loop coordinator-1 -- \
  curl -X POST http://event-bus.cfn-loop:8080/publish \
  -H "Content-Type: application/json" \
  -d '{
    "type": "signal.delivery.failed",
    "data": {
      "signalId": "'${SIGNAL_ID}'",
      "receiver": "coordinator-2",
      "attempts": 3
    },
    "priority": 9
  }'

# 3. Page on-call engineer
curl -X POST https://pagerduty.com/api/incidents \
  -H "Authorization: Token ${PD_TOKEN}" \
  -d '{
    "incident": {
      "title": "Signal Delivery Failure - coordinator-2",
      "urgency": "high",
      "service": "cfn-loop-coordinators"
    }
  }'
```

---

## 4. Timeout Events

### Symptoms

- Coordinator blocking duration exceeds configured timeout (default: 30 minutes)
- Prometheus metric: `blocking_duration_seconds` P99 >1800s
- Logs show "ACK wait timeout" with missing coordinators
- on_blocking_timeout lifecycle hook executed

### Detection

**Automated Alerts**:
```
Alert: StuckCoordinator
Severity: CRITICAL
Trigger: histogram_quantile(0.99, blocking_duration_seconds_bucket) > 1800 for 10min
```

**Manual Verification**:
```bash
# Check blocking duration P99
curl -s http://coordinator-1.cfn-loop:8080/metrics | \
  grep blocking_duration_seconds_bucket | \
  ./calculate-quantile.sh 0.99

# Identify stuck coordinators
redis-cli -h redis.prod.example.com --scan --pattern "coordinator:activity:*" | while read key; do
  ACTIVITY=$(redis-cli -h redis.prod.example.com get $key)
  LAST_ACTIVITY=$(echo $ACTIVITY | jq -r .lastActivity)
  AGE=$(($(date +%s) - ($LAST_ACTIVITY / 1000)))
  if [ $AGE -gt 1800 ]; then
    echo "Stuck: $key (age: ${AGE}s)"
  fi
done
```

### Root Cause Analysis

Common causes:

1. **External Dependency Timeout**: Blocking task waiting for external API that never responds
2. **Deadlock**: Circular dependency between coordinators waiting for each other
3. **Resource Contention**: Blocking task waiting for shared resource (database lock, file lock)
4. **Infinite Loop**: Bug in blocking task causing infinite loop without timeout
5. **Missed Signal**: Signal sent but never received due to Redis failure

**Diagnosis Steps**:

```bash
# 1. Check what coordinator is blocked on
kubectl logs -n cfn-loop coordinator-1 | grep "Waiting for ACKs"
# Look for list of coordinators being waited on

# 2. Verify those coordinators are alive
for coord in coordinator-2 coordinator-3; do
  kubectl get pod -n cfn-loop -l coordinator-id=$coord
done

# 3. Check for deadlock (circular wait)
# Coordinator-1 waits for Coordinator-2
# Coordinator-2 waits for Coordinator-1
redis-cli -h redis.prod.example.com get "coordinator:activity:coordinator-1" | jq .waitingFor
redis-cli -h redis.prod.example.com get "coordinator:activity:coordinator-2" | jq .waitingFor

# 4. Check external dependencies
kubectl logs -n cfn-loop coordinator-1 | grep "Calling external API"
# Verify API endpoint is responsive

# 5. Check resource locks
kubectl exec -n cfn-loop coordinator-1 -- \
  curl http://localhost:8080/api/locks/status
```

### Recovery Procedure

**Step 1: Identify Blocking Root Cause (ETA: 2 minutes)**

```bash
# Get blocking state
ACTIVITY=$(redis-cli -h redis.prod.example.com get "coordinator:activity:coordinator-1")
echo $ACTIVITY | jq .

# Check what signal is being waited for
SIGNAL_ID=$(echo $ACTIVITY | jq -r .waitingForSignal)
redis-cli -h redis.prod.example.com get "blocking:signal:${SIGNAL_ID}"
```

**Step 2: Attempt Graceful Unblock (ETA: 1 minute)**

```bash
# Option A: Send missing signal manually
kubectl exec -n cfn-loop coordinator-2 -- \
  curl -X POST http://localhost:8080/api/signals/send \
  -H "Content-Type: application/json" \
  -d '{
    "receiverId": "coordinator-1",
    "signalType": "completion",
    "iteration": 3
  }'

# Option B: Trigger timeout handler to force cleanup
kubectl exec -n cfn-loop timeout-handler -- \
  curl -X POST http://localhost:8080/api/timeouts/force-check \
  -H "Content-Type: application/json" \
  -d '{"coordinatorId": "coordinator-1"}'
```

**Step 3: Force Unblock (ETA: 30 seconds)**

If graceful unblock fails, force termination:

```bash
# Kill stuck coordinator pod
kubectl delete pod coordinator-1 -n cfn-loop --force --grace-period=0

# Verify pod restarted
kubectl get pod -n cfn-loop -l coordinator-id=coordinator-1 -w
```

**Step 4: Investigate External Dependencies (ETA: 3 minutes)**

```bash
# Check external API health
EXTERNAL_API=$(kubectl logs -n cfn-loop coordinator-1 | \
  grep "Calling external API" | tail -1 | awk '{print $NF}')

curl -I $EXTERNAL_API
# Expected: HTTP 200 OK

# Check database lock status
kubectl exec -n cfn-loop postgres-0 -- \
  psql -U admin -d cfn_loop -c \
  "SELECT * FROM pg_locks WHERE granted = false;"

# Check file locks
kubectl exec -n cfn-loop coordinator-1 -- \
  lsof /data/locks/
```

**Step 5: Adjust Timeout Configuration (ETA: 2 minutes)**

If timeouts are too aggressive, increase threshold:

```bash
# Update coordinator deployment with higher timeout
kubectl patch deployment coordinator -n cfn-loop -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"coordinator","env":[{"name":"BLOCKING_TIMEOUT_MS","value":"3600000"}]}]}}}}'

# Verify rollout
kubectl rollout status deployment/coordinator -n cfn-loop
```

### Validation

Confirm recovery with these checks:

- [ ] Stuck coordinator unblocked or terminated
- [ ] New coordinator pod running if terminated
- [ ] Blocking duration P99 returns to normal (<300s)
- [ ] No timeout events in last 10 minutes
- [ ] External dependencies responding within SLA
- [ ] No database locks held >30s

### Prevention

Implement these measures to prevent future timeout events:

```bash
# 1. Add timeout monitoring dashboard
kubectl apply -f monitoring/dashboards/blocking-timeout-dashboard.yaml

# 2. Configure timeout alerts with graduated severity
kubectl apply -f monitoring/alerts/timeout-alerts.yaml

# 3. Enable timeout hook for automatic recovery
kubectl set env deployment/coordinator -n cfn-loop \
  ENABLE_TIMEOUT_HOOKS=true
```

---

## 5. Cleanup Script Failures

### Symptoms

- Stale coordinator state not removed from Redis
- Heartbeat keys remain after coordinator death
- ACK keys accumulate without TTL expiration
- Manual inspection shows orphaned keys

### Detection

**Manual Verification**:
```bash
# Check for stale heartbeat keys (>10 minutes old)
redis-cli -h redis.prod.example.com --scan --pattern "blocking:heartbeat:*" | while read key; do
  HEARTBEAT=$(redis-cli -h redis.prod.example.com get $key)
  TIMESTAMP=$(echo $HEARTBEAT | jq -r .timestamp)
  AGE=$(($(date +%s) - ($TIMESTAMP / 1000)))
  if [ $AGE -gt 600 ]; then
    echo "Stale: $key (age: ${AGE}s)"
  fi
done

# Check cleanup script logs
kubectl logs -n cfn-loop cleanup-cron --tail=100 | grep "ERROR"
```

### Recovery Procedure

**Step 1: Run Cleanup Script with Dry-Run (ETA: 1 minute)**

```bash
# Verify cleanup logic without deleting keys
kubectl exec -n cfn-loop cleanup-cron -- \
  /scripts/cleanup-blocking-state.sh --dry-run

# Review keys that would be deleted
kubectl logs -n cfn-loop cleanup-cron | grep "Would delete"
```

**Step 2: Execute Cleanup (ETA: 2 minutes)**

```bash
# Run cleanup script
kubectl exec -n cfn-loop cleanup-cron -- \
  /scripts/cleanup-blocking-state.sh --execute

# Monitor progress
kubectl logs -n cfn-loop cleanup-cron -f
```

**Step 3: Manual Cleanup (if script fails) (ETA: 5 minutes)**

```bash
# Delete stale heartbeat keys
redis-cli -h redis.prod.example.com --scan --pattern "blocking:heartbeat:*" | \
  xargs redis-cli -h redis.prod.example.com del

# Delete expired ACK keys
redis-cli -h redis.prod.example.com --scan --pattern "blocking:ack:*" | \
  while read key; do
    TTL=$(redis-cli -h redis.prod.example.com ttl $key)
    if [ $TTL -eq -1 ]; then
      redis-cli -h redis.prod.example.com del $key
    fi
  done

# Delete orphaned idempotency keys
redis-cli -h redis.prod.example.com --scan --pattern "blocking:idempotency:*" | \
  xargs redis-cli -h redis.prod.example.com del
```

### Validation

Confirm cleanup with these checks:

- [ ] No stale heartbeat keys (all <5 minutes old)
- [ ] All ACK keys have TTL set
- [ ] No orphaned idempotency keys
- [ ] Cleanup script logs show success
- [ ] Redis memory usage decreased

---

## Post-Incident Review Template

After resolving any incident, complete this post-mortem:

```markdown
# Incident Post-Mortem: [Incident Name]

**Date**: YYYY-MM-DD
**Duration**: X hours Y minutes
**Severity**: P0 / P1 / P2
**Responders**: [Names]

## Timeline

- HH:MM - Detection: [How was it detected?]
- HH:MM - Triage: [Initial assessment]
- HH:MM - Mitigation: [What was done?]
- HH:MM - Resolution: [When was service restored?]

## Root Cause

[Technical explanation of what caused the incident]

## Impact

- **Coordinators Affected**: X
- **Signals Lost**: Y
- **Data Loss**: None / Minimal / Moderate / Severe
- **Customer Impact**: None / Low / Medium / High

## What Went Well

- [Positive aspects of the response]

## What Went Wrong

- [Areas for improvement]

## Action Items

- [ ] [Action item 1] - Owner: [Name] - Due: [Date]
- [ ] [Action item 2] - Owner: [Name] - Due: [Date]

## Preventive Measures

- [How to prevent this in the future]
```

---

**Next Steps**:
- Review [Monitoring Runbook](./monitoring-runbook.md) for alert response procedures
- See [Blocking Coordination Pattern Guide](../patterns/blocking-coordination-pattern.md) for architectural details
- Check [Integration Examples](../integration/cfn-loop-examples.md) for implementation code
