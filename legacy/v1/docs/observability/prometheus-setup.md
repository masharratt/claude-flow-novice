# Prometheus Integration Setup Guide

**Sprint 3.3: Prometheus Integration**
**Epic:** production-blocking-coordination

This guide explains how to set up Prometheus monitoring for blocking coordination in Claude Flow Novice.

## Table of Contents

1. [Overview](#overview)
2. [Metrics Exposed](#metrics-exposed)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Grafana Dashboard](#grafana-dashboard)
6. [Alert Rules](#alert-rules)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The Prometheus integration provides real-time monitoring and alerting for blocking coordination operations. It exposes 5 core metrics via the `/prometheus/metrics` endpoint.

**Key Benefits:**
- Real-time visibility into coordinator health
- Historical trend analysis
- Automated alerting for timeout events
- Integration with Grafana for visualization

---

## Metrics Exposed

### 1. `blocking_coordinators_total` (Gauge)

Total number of active blocking coordinators.

**Labels:**
- `swarm_id` - Swarm identifier
- `phase` - Current phase (e.g., "auth", "validation")
- `status` - Coordinator status (e.g., "active", "blocked")

**Example:**
```promql
blocking_coordinators_total{swarm_id="swarm-123", phase="auth", status="active"} 3
```

---

### 2. `blocking_duration_seconds` (Histogram)

Duration of blocking coordination operations in seconds.

**Labels:**
- `swarm_id` - Swarm identifier
- `coordinator_id` - Coordinator identifier
- `status` - Operation status ("completed", "timeout", "error")

**Buckets:** `[1, 5, 10, 30, 60, 120, 300, 600, 1800]` seconds

**Example Queries:**
```promql
# P95 blocking duration
histogram_quantile(0.95, sum(rate(blocking_duration_seconds_bucket[5m])) by (le))

# Average blocking duration by status
avg(rate(blocking_duration_seconds_sum[5m])) by (status)
```

---

### 3. `signal_delivery_latency_seconds` (Histogram)

Latency of signal delivery from send to ACK in seconds.

**Labels:**
- `sender_id` - Sender coordinator ID
- `receiver_id` - Receiver coordinator ID
- `signal_type` - Signal type ("completion", "retry", "validation")

**Buckets:** `[0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]` seconds

**Example Queries:**
```promql
# P99 signal latency by type
histogram_quantile(0.99, sum(rate(signal_delivery_latency_seconds_bucket[5m])) by (le, signal_type))

# Max signal latency
max(signal_delivery_latency_seconds)
```

---

### 4. `heartbeat_failures_total` (Counter)

Total number of heartbeat failures detected.

**Labels:**
- `coordinator_id` - Coordinator identifier
- `failure_type` - Failure type ("stale", "missing", "timeout")

**Example Queries:**
```promql
# Heartbeat failure rate
rate(heartbeat_failures_total[5m])

# Total failures by type
sum(heartbeat_failures_total) by (failure_type)
```

---

### 5. `timeout_events_total` (Counter)

Total number of timeout events triggered.

**Labels:**
- `coordinator_id` - Coordinator identifier
- `timeout_type` - Timeout type ("blocking", "signal_ack", "heartbeat")

**Example Queries:**
```promql
# Timeout event rate
rate(timeout_events_total[5m])

# Total timeouts by coordinator
sum(timeout_events_total) by (coordinator_id)
```

---

## Installation

### Step 1: Install Prometheus

**macOS (Homebrew):**
```bash
brew install prometheus
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install prometheus
```

**Docker:**
```bash
docker run -d -p 9090:9090 \
  -v $(pwd)/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

---

### Step 2: Configure Prometheus

Copy the configuration file:

```bash
cp prometheus/prometheus.yml /etc/prometheus/prometheus.yml
# Or for Docker: use the volume mount above
```

**Configuration highlights:**
- Scrapes `/prometheus/metrics` endpoint every 15 seconds
- Loads alert rules from `prometheus/alerts/blocking-coordination-alerts.yml`
- Includes self-monitoring for Prometheus

---

### Step 3: Start Prometheus

**System service:**
```bash
sudo systemctl start prometheus
sudo systemctl enable prometheus  # Auto-start on boot
```

**Docker:**
```bash
docker start prometheus
```

**Verify Prometheus is running:**
```bash
curl http://localhost:9090/-/healthy
# Expected: Prometheus is Healthy.
```

---

### Step 4: Verify Metrics Endpoint

Start the API server:
```bash
node api-project/server.js
```

Check metrics endpoint:
```bash
curl http://localhost:3000/prometheus/metrics
```

**Expected output:**
```
# HELP blocking_coordinators_total Total number of active blocking coordinators
# TYPE blocking_coordinators_total gauge
blocking_coordinators_total{swarm_id="swarm-123",phase="auth",status="active"} 2

# HELP blocking_duration_seconds Duration of blocking coordination in seconds
# TYPE blocking_duration_seconds histogram
blocking_duration_seconds_bucket{swarm_id="swarm-123",coordinator_id="coord-1",status="completed",le="1"} 0
...
```

---

## Grafana Dashboard

### Step 1: Install Grafana

**macOS (Homebrew):**
```bash
brew install grafana
```

**Ubuntu/Debian:**
```bash
sudo apt-get install grafana
```

**Docker:**
```bash
docker run -d -p 3001:3000 grafana/grafana
```

---

### Step 2: Add Prometheus Data Source

1. Open Grafana: http://localhost:3001 (default login: admin/admin)
2. Go to **Configuration** → **Data Sources**
3. Click **Add data source** → Select **Prometheus**
4. Set URL: `http://localhost:9090`
5. Click **Save & Test**

---

### Step 3: Import Dashboard

1. Go to **Dashboards** → **Import**
2. Upload `grafana/blocking-coordination-dashboard.json`
3. Select Prometheus data source
4. Click **Import**

**Dashboard includes 6 panels:**
1. **Active Coordinators** - Gauge showing total active coordinators
2. **Blocking Duration (P95/P99)** - Histogram quantiles over time
3. **Signal Latency (P50/P95/P99)** - Signal delivery performance
4. **Heartbeat Failures** - Failure rate by type
5. **Timeout Events** - Timeout event rate by type
6. **Coordinators by Status** - Pie chart distribution

---

## Alert Rules

Alert rules are defined in `prometheus/alerts/blocking-coordination-alerts.yml`.

### Alert: HighBlockingCoordinators
- **Trigger:** More than 10 active coordinators for 5 minutes
- **Severity:** Warning
- **Action:** Investigate coordinator spawning logic

### Alert: HighBlockingDuration
- **Trigger:** P95 blocking duration > 5 minutes for 5 minutes
- **Severity:** Warning
- **Action:** Check signal ACK timeouts, investigate slow coordinators

### Alert: HighSignalLatency
- **Trigger:** P95 signal latency > 5 seconds for 5 minutes
- **Severity:** Warning
- **Action:** Check network latency, Redis performance

### Alert: HeartbeatFailures
- **Trigger:** Heartbeat failure rate > 0.1/s for 2 minutes
- **Severity:** Critical
- **Action:** Check coordinator health, investigate timeouts

### Alert: TimeoutEvents
- **Trigger:** Timeout event rate > 0.1/s for 2 minutes
- **Severity:** Critical
- **Action:** Escalate dead coordinators, check auto-recovery

### Alert: StuckCoordinator
- **Trigger:** P99 blocking duration > 30 minutes for 10 minutes
- **Severity:** Critical
- **Action:** Force coordinator termination, investigate deadlock

---

## Troubleshooting

### Metrics Not Appearing

**Problem:** Prometheus shows "No data" for blocking coordination metrics.

**Solutions:**
1. Verify API server is running:
   ```bash
   curl http://localhost:3000/prometheus/metrics
   ```

2. Check Prometheus scrape targets:
   ```
   http://localhost:9090/targets
   ```
   - Status should be "UP" for `blocking-coordination` job

3. Verify Prometheus config:
   ```bash
   promtool check config prometheus/prometheus.yml
   ```

---

### High Latency in Metrics Collection

**Problem:** Metrics collection takes >1 second.

**Solutions:**
1. **Reduce scrape interval** in `prometheus.yml`:
   ```yaml
   scrape_interval: 30s  # Increase from 15s
   ```

2. **Optimize Redis queries:**
   - Ensure Redis SCAN operations use cursor-based iteration
   - Limit SCAN batch size to 100 keys

3. **Enable Prometheus query caching:**
   ```yaml
   global:
     query_log_file: /var/log/prometheus/queries.log
   ```

---

### Alert Rules Not Firing

**Problem:** Alerts defined but not triggering.

**Solutions:**
1. Verify alert rules syntax:
   ```bash
   promtool check rules prometheus/alerts/blocking-coordination-alerts.yml
   ```

2. Check Prometheus logs:
   ```bash
   sudo journalctl -u prometheus -f
   ```

3. Manually evaluate alert expression in Prometheus UI:
   ```
   http://localhost:9090/graph
   ```
   - Paste alert `expr` and verify results

---

### Redis Connection Errors

**Problem:** Metrics endpoint returns "Metrics collection failed".

**Solutions:**
1. Verify Redis is running:
   ```bash
   redis-cli ping
   # Expected: PONG
   ```

2. Check API server logs for Redis errors:
   ```bash
   node api-project/server.js
   # Look for: "Redis connection failed"
   ```

3. Update Redis client configuration in `api-project/server.js`:
   ```javascript
   const Redis = require('ioredis');
   const redis = new Redis({
     host: 'localhost',
     port: 6379,
     retryStrategy: (times) => Math.min(times * 50, 2000)
   });
   ```

---

## Advanced Configuration

### Custom Metric Labels

Add custom labels to metrics for better filtering:

```javascript
// In src/observability/prometheus-metrics.js
blockingCoordinatorsTotal
  .labels(coord.swarmId, coord.phase, coord.status, coord.environment || 'prod')
  .set(1);
```

---

### Recording Rules

Create recording rules for frequently used queries:

```yaml
# prometheus/recording-rules.yml
groups:
  - name: blocking_coordination_recording
    interval: 30s
    rules:
      - record: blocking:duration:p95
        expr: histogram_quantile(0.95, sum(rate(blocking_duration_seconds_bucket[5m])) by (le))

      - record: signal:latency:p99
        expr: histogram_quantile(0.99, sum(rate(signal_delivery_latency_seconds_bucket[5m])) by (le))
```

Then query the pre-aggregated metric:
```promql
blocking:duration:p95
```

---

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/)
- [Blocking Coordination Architecture](../blocking-coordination/architecture.md)
- [CFN Loop Documentation](../../CLAUDE.md#cfn-loop)

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review Prometheus logs: `sudo journalctl -u prometheus -f`
3. Open an issue: [GitHub Issues](https://github.com/masharratt/claude-flow-novice/issues)
