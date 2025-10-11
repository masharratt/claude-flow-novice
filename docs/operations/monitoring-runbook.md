# Monitoring Runbook

## Overview

This runbook provides alert response procedures for blocking coordination monitoring in CFN Loop production environments. Each alert includes severity level, trigger conditions, response procedures, and escalation paths.

## Alert Severity Levels

| Level | Response Time | Examples | Paging |
|-------|---------------|----------|--------|
| **P0 - CRITICAL** | <5 minutes | System down, data loss | Immediate page |
| **P1 - HIGH** | <15 minutes | Degraded performance, partial outage | Page during business hours |
| **P2 - WARNING** | <1 hour | Approaching limits, potential issues | Slack notification |
| **P3 - INFO** | <4 hours | Informational, trending | Email notification |

---

## Alert: HighBlockingCoordinators

### Details

- **Severity**: P2 (WARNING)
- **Trigger**: `count(blocking_coordinators_active) > 10 for 5min`
- **Escalation**: If `count(blocking_coordinators_active) > 20 for 10min`, escalate to P1

### Symptoms

- More than 10 coordinators in blocking state simultaneously
- Dashboard shows spike in active blocking coordinators
- May indicate coordinator spawn rate exceeds expected baseline

### Impact

- **Performance**: Increased Redis load from heartbeat/ACK operations
- **Resource Usage**: Higher memory consumption for coordinator state
- **Latency**: Potential signal delivery latency increase

### Response Procedure

**Step 1: Verify Expected Coordinator Count (ETA: 2 minutes)**

```bash
# Check swarm configuration for expected coordinator count
kubectl get configmap swarm-config -n cfn-loop -o jsonpath='{.data.expectedCoordinators}'

# Compare against actual count
ACTUAL=$(redis-cli -h redis.prod.example.com --scan --pattern "blocking:heartbeat:*" | wc -l)
EXPECTED=$(kubectl get configmap swarm-config -n cfn-loop -o jsonpath='{.data.expectedCoordinators}')

if [ $ACTUAL -gt $((EXPECTED * 2)) ]; then
  echo "WARNING: Actual ($ACTUAL) exceeds expected ($EXPECTED) by 2x"
fi
```

**Step 2: Identify Coordinator Spawn Source (ETA: 3 minutes)**

```bash
# Check coordinator spawn requests
redis-cli -h redis.prod.example.com --scan --pattern "coordinator:spawn:*" | \
  head -10 | while read key; do
    redis-cli -h redis.prod.example.com get $key | jq '{newId: .newCoordinatorId, swarmId: .swarmId, priority: .priority}'
  done

# Identify which swarms are spawning coordinators
redis-cli -h redis.prod.example.com --scan --pattern "coordinator:spawn:*" | \
  xargs redis-cli -h redis.prod.example.com mget | \
  jq -r '.swarmId' | sort | uniq -c | sort -rn
```

**Step 3: Check Swarm Status (ETA: 2 minutes)**

```bash
# Verify swarm health
kubectl exec -n cfn-loop swarm-manager -- \
  curl http://localhost:8080/api/swarms/status | jq .

# Look for swarms with excessive coordinator counts
kubectl exec -n cfn-loop swarm-manager -- \
  curl http://localhost:8080/api/swarms/status | \
  jq '.swarms[] | select(.coordinatorCount > 5)'
```

**Step 4: Investigate Spawn Rate (ETA: 3 minutes)**

```bash
# Check coordinator spawn rate over last hour
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=rate(coordinator_spawns_total[1h])" | \
  jq -r '.data.result[0].value[1]'

# Expected: <0.1 spawns/sec (baseline)
# Warning: >0.5 spawns/sec
# Critical: >1.0 spawns/sec

# Check for coordinator crash loop
kubectl get pods -n cfn-loop -l app=coordinator | \
  grep -c CrashLoopBackOff
```

**Step 5: Mitigation (if abnormal)**

```bash
# Option A: Pause coordinator spawning temporarily
kubectl exec -n cfn-loop swarm-manager -- \
  curl -X POST http://localhost:8080/api/spawning/pause

# Option B: Scale down specific swarm
SWARM_ID=$(redis-cli -h redis.prod.example.com --scan --pattern "coordinator:spawn:*" | \
  xargs redis-cli -h redis.prod.example.com mget | jq -r '.swarmId' | head -1)

kubectl exec -n cfn-loop swarm-manager -- \
  curl -X POST http://localhost:8080/api/swarms/${SWARM_ID}/scale \
  -H "Content-Type: application/json" \
  -d '{"targetSize": 5}'

# Option C: Restart swarm manager if spawn logic stuck
kubectl rollout restart deployment/swarm-manager -n cfn-loop
```

### Validation

- [ ] Coordinator count stabilizes within expected range
- [ ] Spawn rate returns to baseline (<0.1/sec)
- [ ] No CrashLoopBackOff coordinators
- [ ] Dashboard shows normal coordinator distribution across swarms

### Escalation Path

If coordinator count continues growing:
1. Page on-call SRE (5 minutes)
2. Investigate for resource leak or infinite spawn loop
3. Consider emergency swarm shutdown to stop spawning

---

## Alert: HighBlockingDuration

### Details

- **Severity**: P2 (WARNING)
- **Trigger**: `histogram_quantile(0.95, blocking_duration_seconds_bucket) > 300 for 5min`
- **Escalation**: If `histogram_quantile(0.99, blocking_duration_seconds_bucket) > 1800`, trigger StuckCoordinator alert (P0)

### Symptoms

- 95th percentile blocking duration exceeds 5 minutes
- Coordinators taking longer than expected to receive ACKs
- May indicate slow validator agents or network latency

### Impact

- **Latency**: Increased end-to-end CFN Loop execution time
- **User Experience**: Slower validation cycles, longer wait for results
- **Resource Usage**: Coordinators hold resources longer while blocking

### Response Procedure

**Step 1: Identify Slow Coordinators (ETA: 2 minutes)**

```bash
# Query Prometheus for slowest coordinators
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=topk(10, blocking_duration_seconds)" | \
  jq -r '.data.result[] | "\(.metric.coordinator_id): \(.value[1])s"'

# Check coordinator activity
redis-cli -h redis.prod.example.com --scan --pattern "coordinator:activity:*" | \
  while read key; do
    ACTIVITY=$(redis-cli -h redis.prod.example.com get $key)
    LAST=$(echo $ACTIVITY | jq -r .lastActivity)
    AGE=$(($(date +%s) - ($LAST / 1000)))
    COORD=$(echo $key | sed 's/coordinator:activity://')
    echo "$COORD: ${AGE}s since last activity"
  done | sort -t: -k2 -rn | head -10
```

**Step 2: Check Blocking Task Complexity (ETA: 3 minutes)**

```bash
# Identify what coordinators are blocked on
kubectl logs -n cfn-loop coordinator-1 | \
  grep "Waiting for ACKs" | tail -10

# Check if validators are slow
kubectl exec -n cfn-loop swarm-manager -- \
  curl http://localhost:8080/api/validators/performance | \
  jq '.validators[] | select(.avgDuration > 300000)'

# Verify validator agent health
kubectl get pods -n cfn-loop -l role=validator | \
  grep -v Running
```

**Step 3: Analyze Signal Delivery Latency (ETA: 2 minutes)**

```bash
# Check signal delivery P95
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=histogram_quantile(0.95, signal_delivery_latency_seconds_bucket)" | \
  jq -r '.data.result[0].value[1]'

# Expected: <1s
# Warning: >5s

# Check Redis latency
redis-cli -h redis.prod.example.com --latency-history
```

**Step 4: Investigate External Dependencies (ETA: 3 minutes)**

```bash
# Check if coordinators waiting on external APIs
kubectl logs -n cfn-loop coordinator-1 | \
  grep "Calling external" | tail -20

# Verify external API health
EXTERNAL_APIS=$(kubectl logs -n cfn-loop coordinator-1 | \
  grep "Calling external" | awk '{print $NF}' | sort -u)

for API in $EXTERNAL_APIS; do
  curl -w "API: $API - %{time_total}s\n" -o /dev/null -s $API
done
```

**Step 5: Mitigation**

```bash
# Option A: Scale up validator agents to handle load
kubectl scale deployment/validator -n cfn-loop --replicas=10

# Option B: Increase timeout threshold temporarily
kubectl patch deployment coordinator -n cfn-loop -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"coordinator","env":[{"name":"BLOCKING_TIMEOUT_MS","value":"900000"}]}]}}}}'

# Option C: Optimize validator agent performance
kubectl apply -f config/validators-optimized.yaml
```

### Validation

- [ ] Blocking duration P95 drops below 300s
- [ ] Signal delivery latency P95 <5s
- [ ] Validator agents all Running
- [ ] External API latency <1s
- [ ] Dashboard shows improved blocking duration trend

### Prevention

```bash
# Add resource limits to prevent validator slowdown
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: validator
    resources:
      limits:
        cpu: "2"
        memory: "4Gi"
      requests:
        cpu: "1"
        memory: "2Gi"
EOF

# Enable validator caching to speed up repeated checks
kubectl set env deployment/validator -n cfn-loop \
  ENABLE_VALIDATION_CACHE=true
```

---

## Alert: HighSignalLatency

### Details

- **Severity**: P2 (WARNING)
- **Trigger**: `histogram_quantile(0.95, signal_delivery_latency_seconds_bucket) > 5 for 5min`
- **Escalation**: If `histogram_quantile(0.99, signal_delivery_latency_seconds_bucket) > 10`, escalate to P1

### Symptoms

- 95th percentile signal delivery latency exceeds 5 seconds
- ACKs taking longer than expected to arrive
- May indicate Redis performance issues or network congestion

### Impact

- **Latency**: Slower coordinator unblocking, increased end-to-end execution time
- **Reliability**: Increased signal retry attempts, potential timeout events
- **User Experience**: Delayed validation results, longer wait times

### Response Procedure

**Step 1: Check Redis Health (ETA: 2 minutes)**

```bash
# Verify Redis latency
redis-cli -h redis.prod.example.com --latency-history
# Expected: <10ms avg, <50ms p99

# Check Redis memory usage
redis-cli -h redis.prod.example.com info memory | grep used_memory_human

# Verify Redis CPU usage
kubectl top pod -n redis redis-0

# Check slow log
redis-cli -h redis.prod.example.com slowlog get 10
```

**Step 2: Analyze Network Latency (ETA: 3 minutes)**

```bash
# Ping Redis from coordinator pods
for i in {1..5}; do
  kubectl exec -n cfn-loop coordinator-$i -- \
    ping -c 5 redis.prod.example.com | tail -1
done

# Check network packet loss
kubectl exec -n cfn-loop coordinator-1 -- \
  mtr -r -c 10 redis.prod.example.com

# Verify DNS resolution time
kubectl exec -n cfn-loop coordinator-1 -- \
  time nslookup redis.prod.example.com
```

**Step 3: Identify Signal Delivery Bottlenecks (ETA: 3 minutes)**

```bash
# Check signal delivery rate
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=rate(signals_sent_total[5m])" | \
  jq -r '.data.result[0].value[1]'

# Check for signal backlog
redis-cli -h redis.prod.example.com --scan --pattern "blocking:signal:*" | wc -l

# Verify coordinator send rate distribution
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=topk(10, rate(signals_sent_total[5m]))" | \
  jq -r '.data.result[] | "\(.metric.coordinator_id): \(.value[1]) signals/sec"'
```

**Step 4: Check Redis Connection Pool (ETA: 2 minutes)**

```bash
# Verify connection pool stats
kubectl exec -n cfn-loop coordinator-1 -- \
  curl http://localhost:8080/api/redis/pool-stats | jq .

# Check for connection pool exhaustion
redis-cli -h redis.prod.example.com info clients | grep connected_clients

# Compare against maxclients
redis-cli -h redis.prod.example.com config get maxclients
```

**Step 5: Mitigation**

```bash
# Option A: Scale Redis for higher throughput
kubectl scale statefulset/redis -n redis --replicas=3

# Option B: Increase Redis connection pool size
kubectl patch deployment coordinator -n cfn-loop -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"coordinator","env":[{"name":"REDIS_POOL_SIZE","value":"20"}]}]}}}}'

# Option C: Enable Redis cluster mode for horizontal scaling
kubectl apply -f config/redis-cluster.yaml

# Option D: Optimize Redis configuration
redis-cli -h redis.prod.example.com config set tcp-backlog 511
redis-cli -h redis.prod.example.com config set maxclients 10000
```

### Validation

- [ ] Signal delivery latency P95 <5s
- [ ] Redis latency <10ms avg
- [ ] Network latency <50ms to Redis
- [ ] Connection pool not exhausted
- [ ] Signal delivery rate stable

### Root Cause Analysis

Common causes of high signal latency:

1. **Redis Memory Pressure**: Used memory >80% of maxmemory triggers evictions
2. **Network Congestion**: Pod network saturated >80% capacity
3. **Connection Pool Exhaustion**: All connections busy, requests queuing
4. **Slow Queries**: KEYS command blocking Redis (use SCAN instead)
5. **DNS Resolution Delays**: DNS timeout >1s causing retry loops

---

## Alert: HeartbeatFailures

### Details

- **Severity**: P0 (CRITICAL)
- **Trigger**: `rate(heartbeat_failures_total[2m]) > 0.1 for 2min`
- **Escalation**: Page on-call immediately if rate >0.5/s

### Symptoms

- Heartbeat failure rate exceeds 0.1 failures/second
- Coordinators unable to update heartbeats in Redis
- May indicate Redis connectivity issues or coordinator crashes

### Impact

- **Availability**: Coordinators marked as dead, triggering unnecessary cleanup
- **Data Loss**: Work items transferred prematurely due to false death detection
- **Cascading Failures**: Multiple coordinators failing simultaneously

### Response Procedure

**Step 1: Verify Redis Connectivity (ETA: 1 minute)**

```bash
# Test Redis from coordinator pods
for i in {1..5}; do
  kubectl exec -n cfn-loop coordinator-$i -- redis-cli -h redis.prod.example.com ping || echo "FAILED: coordinator-$i"
done

# Check Redis server health
kubectl get pods -n redis
kubectl logs -n redis redis-0 --tail=50
```

**Step 2: Check Coordinator Health (ETA: 2 minutes)**

```bash
# Identify failing coordinators
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=heartbeat_failures_total" | \
  jq -r '.data.result[] | "\(.metric.coordinator_id): \(.value[1]) failures"' | \
  sort -t: -k2 -rn | head -10

# Verify coordinator pods running
kubectl get pods -n cfn-loop -l app=coordinator | grep -v Running

# Check coordinator logs
kubectl logs -n cfn-loop coordinator-1 --tail=50 | grep -i "heartbeat"
```

**Step 3: Analyze Failure Reason (ETA: 2 minutes)**

```bash
# Check failure reason labels
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=heartbeat_failures_total" | \
  jq -r '.data.result[] | "\(.metric.reason): \(.value[1])"' | \
  sort | uniq -c | sort -rn

# Reasons:
# - "connection": Redis connection failed
# - "timeout": Redis command timeout
# - "stale": Heartbeat not updated (coordinator hung)
# - "error": Generic error
```

**Step 4: Emergency Mitigation (ETA: 3 minutes)**

```bash
# Option A: Restart Redis if connection failures
kubectl rollout restart statefulset/redis -n redis
kubectl wait --for=condition=ready pod -l app=redis -n redis --timeout=180s

# Option B: Restart coordinators if hung
kubectl rollout restart deployment/coordinator -n cfn-loop
kubectl wait --for=condition=ready pod -l app=coordinator -n cfn-loop --timeout=180s

# Option C: Increase heartbeat interval temporarily
kubectl patch deployment coordinator -n cfn-loop -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"coordinator","env":[{"name":"HEARTBEAT_INTERVAL_MS","value":"60000"}]}]}}}}'

# Option D: Disable heartbeat monitoring temporarily (EMERGENCY ONLY)
kubectl patch deployment timeout-handler -n cfn-loop -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"timeout-handler","env":[{"name":"ENABLE_HEARTBEAT_MONITORING","value":"false"}]}]}}}}'
```

**Step 5: Verify Recovery (ETA: 2 minutes)**

```bash
# Check heartbeat failure rate
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=rate(heartbeat_failures_total[2m])" | \
  jq -r '.data.result[0].value[1]'
# Expected: <0.01/s

# Verify heartbeats updating
redis-cli -h redis.prod.example.com --scan --pattern "blocking:heartbeat:*" | \
  head -5 | while read key; do
    redis-cli -h redis.prod.example.com get $key | jq '{coordinator: .coordinatorId, age: (now - (.timestamp / 1000))}'
  done
```

### Validation

- [ ] Heartbeat failure rate <0.01/s
- [ ] All coordinator pods Running
- [ ] Redis responding to PING
- [ ] Heartbeats updating within interval (30s)
- [ ] No false dead coordinator detections

### Post-Incident Actions

```bash
# Enable detailed heartbeat logging
kubectl set env deployment/coordinator -n cfn-loop \
  HEARTBEAT_DEBUG=true

# Add Prometheus alert for early warning
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: heartbeat-early-warning
spec:
  groups:
  - name: heartbeat
    rules:
    - alert: HeartbeatFailuresEarlyWarning
      expr: rate(heartbeat_failures_total[5m]) > 0.01
      for: 1m
      annotations:
        summary: "Heartbeat failures detected (early warning)"
EOF
```

---

## Alert: TimeoutEvents

### Details

- **Severity**: P0 (CRITICAL)
- **Trigger**: `rate(timeout_events_total[2m]) > 0.1 for 2min`
- **Escalation**: Page on-call immediately if rate >0.5/s

### Symptoms

- Timeout event rate exceeds 0.1 events/second
- Coordinators exceeding blocking timeout threshold
- May indicate deadlock, external dependency failure, or misconfigured timeouts

### Impact

- **Performance**: Coordinators blocking for extended periods
- **User Experience**: Validation cycles timing out, no results returned
- **Resource Waste**: Coordinators holding resources without progress

### Response Procedure

**Step 1: Identify Timeout Source (ETA: 2 minutes)**

```bash
# Check timeout reason distribution
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=timeout_events_total" | \
  jq -r '.data.result[] | "\(.metric.reason): \(.value[1])"' | \
  sort | uniq -c | sort -rn

# Reasons:
# - "heartbeat": Coordinator heartbeat timeout (dead coordinator)
# - "blocking": Coordinator blocking duration timeout (ACK wait timeout)
# - "external": External API call timeout

# Identify coordinators with most timeouts
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=topk(10, timeout_events_total)" | \
  jq -r '.data.result[] | "\(.metric.coordinator_id): \(.value[1])"'
```

**Step 2: Check for Deadlocks (ETA: 3 minutes)**

```bash
# Look for circular dependencies
redis-cli -h redis.prod.example.com --scan --pattern "coordinator:activity:*" | \
  while read key; do
    ACTIVITY=$(redis-cli -h redis.prod.example.com get $key)
    COORD=$(echo $key | sed 's/coordinator:activity://')
    WAITING_FOR=$(echo $ACTIVITY | jq -r '.waitingFor // "none"')
    echo "$COORD waits for $WAITING_FOR"
  done

# Check if coordinator-A waits for coordinator-B AND coordinator-B waits for coordinator-A
```

**Step 3: Verify External Dependencies (ETA: 3 minutes)**

```bash
# Check external API health
EXTERNAL_APIS=$(kubectl logs -n cfn-loop coordinator-1 | \
  grep "Calling external" | awk '{print $NF}' | sort -u)

for API in $EXTERNAL_APIS; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 $API)
  TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 5 $API)
  echo "API: $API - Status: $STATUS - Time: ${TIME}s"
done

# Check for API timeouts
kubectl logs -n cfn-loop coordinator-1 | grep "external API timeout"
```

**Step 4: Emergency Mitigation (ETA: 2 minutes)**

```bash
# Option A: Increase timeout threshold
kubectl patch deployment coordinator -n cfn-loop -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"coordinator","env":[{"name":"BLOCKING_TIMEOUT_MS","value":"3600000"}]}]}}}}'

# Option B: Force unblock stuck coordinators
kubectl exec -n cfn-loop timeout-handler -- \
  curl -X POST http://localhost:8080/api/timeouts/force-unblock-all

# Option C: Restart stuck coordinators
STUCK_COORDS=$(curl -s "http://prometheus.monitoring:9090/api/v1/query?query=timeout_events_total" | \
  jq -r '.data.result[] | .metric.coordinator_id')

for COORD in $STUCK_COORDS; do
  kubectl delete pod -n cfn-loop -l coordinator-id=$COORD --force
done
```

**Step 5: Verify Resolution (ETA: 2 minutes)**

```bash
# Check timeout event rate
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=rate(timeout_events_total[2m])" | \
  jq -r '.data.result[0].value[1]'
# Expected: 0

# Verify no coordinators stuck
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=histogram_quantile(0.99, blocking_duration_seconds_bucket)" | \
  jq -r '.data.result[0].value[1]'
# Expected: <1800s (30min)
```

### Validation

- [ ] Timeout event rate returns to 0
- [ ] Blocking duration P99 <1800s
- [ ] No deadlocks detected
- [ ] External APIs responding within SLA
- [ ] All coordinators unblocked or progressing

### Root Cause Mitigation

```bash
# Add deadlock detection
kubectl apply -f config/deadlock-detector.yaml

# Implement circuit breaker for external APIs
kubectl set env deployment/coordinator -n cfn-loop \
  ENABLE_CIRCUIT_BREAKER=true

# Add timeout monitoring dashboard
kubectl apply -f monitoring/dashboards/timeout-dashboard.yaml
```

---

## Alert: StuckCoordinator

### Details

- **Severity**: P0 (CRITICAL)
- **Trigger**: `histogram_quantile(0.99, blocking_duration_seconds_bucket) > 1800 for 10min`
- **Escalation**: Page on-call immediately

### Symptoms

- 99th percentile blocking duration exceeds 30 minutes for 10 minutes
- Coordinator stuck in blocking state without progress
- Likely indicates deadlock, hung process, or critical bug

### Impact

- **Availability**: Coordinator unavailable for work
- **Performance**: Swarm execution stalled
- **Resource Waste**: Resources held indefinitely

### Response Procedure

**Step 1: Identify Stuck Coordinator (ETA: 1 minute)**

```bash
# Find coordinator with longest blocking duration
curl -s "http://prometheus.monitoring:9090/api/v1/query?query=topk(1, blocking_duration_seconds)" | \
  jq -r '.data.result[0].metric.coordinator_id'

STUCK_COORD=$(curl -s "http://prometheus.monitoring:9090/api/v1/query?query=topk(1, blocking_duration_seconds)" | \
  jq -r '.data.result[0].metric.coordinator_id')

echo "Stuck coordinator: $STUCK_COORD"
```

**Step 2: Capture Diagnostics (ETA: 3 minutes)**

```bash
# Capture thread dump
kubectl exec -n cfn-loop $STUCK_COORD -- kill -3 1
kubectl logs -n cfn-loop $STUCK_COORD --tail=200 > thread-dump.log

# Capture heap dump
kubectl exec -n cfn-loop $STUCK_COORD -- \
  jmap -dump:format=b,file=/tmp/heap.hprof 1

# Capture coordinator state
kubectl exec -n cfn-loop $STUCK_COORD -- \
  curl http://localhost:8080/api/coordinator/state > coordinator-state.json

# Capture Redis state
redis-cli -h redis.prod.example.com get "coordinator:activity:${STUCK_COORD}"
```

**Step 3: Force Termination (ETA: 1 minute)**

```bash
# Kill stuck coordinator pod
kubectl delete pod -n cfn-loop $STUCK_COORD --force --grace-period=0

# Verify new pod spawned
kubectl get pods -n cfn-loop -l coordinator-id=$STUCK_COORD -w
```

**Step 4: Cleanup Stale State (ETA: 2 minutes)**

```bash
# Run cleanup for dead coordinator
kubectl exec -n cfn-loop timeout-handler -- \
  curl -X POST http://localhost:8080/api/coordinators/$STUCK_COORD/cleanup

# Verify cleanup completed
redis-cli -h redis.prod.example.com --scan --pattern "blocking:*${STUCK_COORD}*"
# Should return no keys
```

**Step 5: Post-Mortem (ETA: 10 minutes)**

```bash
# Analyze thread dump for deadlock
grep -A 50 "deadlock" thread-dump.log

# Analyze heap dump for memory leak
# Download heap dump and analyze with Eclipse MAT or jhat

# Review coordinator logs for errors
grep -i "error\|exception\|timeout" coordinator-state.json
```

### Validation

- [ ] Stuck coordinator terminated
- [ ] New coordinator spawned and READY
- [ ] Stale state cleaned up from Redis
- [ ] Blocking duration P99 returns to normal
- [ ] Work items reassigned or completed

---

## Dashboard Usage

### Grafana Blocking Coordination Dashboard

Access: `https://grafana.monitoring/d/blocking-coordination`

**Key Panels**:

1. **Active Coordinators**: Gauge showing current blocking coordinator count
   - Green: <5 coordinators
   - Yellow: 5-10 coordinators
   - Red: >10 coordinators

2. **Blocking Duration P95/P99**: Line graph showing blocking duration percentiles
   - Alert threshold: P95 >300s, P99 >1800s

3. **Signal Delivery Latency**: Heatmap showing signal latency distribution
   - Alert threshold: P95 >5s

4. **Heartbeat Failures**: Counter showing heartbeat failure rate
   - Alert threshold: >0.1/s

5. **Timeout Events**: Counter showing timeout event rate
   - Alert threshold: >0.1/s

**Template Variables**:

- `swarm_id`: Filter by swarm ID
- `coordinator_id`: Filter by coordinator ID
- `timerange`: Time range (1h, 6h, 24h, 7d)

**Example Queries**:

```promql
# Active blocking coordinators by swarm
sum by (swarm_id) (blocking_coordinators_active)

# Blocking duration P95 by coordinator
histogram_quantile(0.95, sum by (coordinator_id, le) (rate(blocking_duration_seconds_bucket[5m])))

# Signal delivery failure rate
rate(signals_failed_total[5m])

# Heartbeat age distribution
(time() - (blocking_heartbeat_timestamp / 1000))
```

### Alert Manager Configuration

**Severity-Based Routing**:

```yaml
routes:
  - match:
      severity: critical
    receiver: pagerduty
    group_wait: 10s
    group_interval: 5m
    repeat_interval: 4h

  - match:
      severity: warning
    receiver: slack
    group_wait: 5m
    group_interval: 10m
    repeat_interval: 12h

  - match:
      severity: info
    receiver: email
    group_wait: 15m
    group_interval: 1h
    repeat_interval: 24h
```

**Receivers**:

```yaml
receivers:
  - name: pagerduty
    pagerduty_configs:
      - service_key: <PD_SERVICE_KEY>
        severity: critical

  - name: slack
    slack_configs:
      - api_url: <SLACK_WEBHOOK>
        channel: '#cfn-loop-alerts'
        title: 'Blocking Coordination Alert'

  - name: email
    email_configs:
      - to: 'cfn-loop-team@example.com'
        from: 'alerts@example.com'
```

---

## On-Call Rotation

### Escalation Matrix

| Time | Severity | Action |
|------|----------|--------|
| Business hours | P0/P1 | Page primary on-call |
| Business hours | P2/P3 | Slack notification |
| After hours | P0 | Page primary + secondary |
| After hours | P1 | Page primary only |
| After hours | P2/P3 | Defer to next business day |

### Contact Information

- **Primary On-Call**: PagerDuty schedule `cfn-loop-primary`
- **Secondary On-Call**: PagerDuty schedule `cfn-loop-secondary`
- **Engineering Lead**: Slack `@cfn-loop-lead`
- **SRE Team**: Slack `#cfn-loop-sre`

---

**Next Steps**:
- Review [Failure Recovery Playbook](./failure-recovery-playbook.md) for detailed incident response
- See [Blocking Coordination Pattern Guide](../patterns/blocking-coordination-pattern.md) for architectural details
- Check [Integration Examples](../integration/cfn-loop-examples.md) for implementation code
