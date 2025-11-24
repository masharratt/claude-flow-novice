# CFN Platform Monitoring Workshop

**Duration:** 1 day (8 hours)
**Target Audience:** SREs, platform engineers, monitoring specialists
**Prerequisites:** Basic Prometheus/Grafana knowledge, PromQL fundamentals
**Last Updated:** 2025-11-24

---

## Workshop Overview

**Morning:** Deep dive into monitoring architecture, metrics, and PromQL
**Afternoon:** Hands-on dashboard creation, alerting, and troubleshooting

**Learning Objectives:**
- Master PromQL for CFN-specific metrics
- Build custom dashboards from scratch
- Configure and tune alerts
- Troubleshoot monitoring issues
- Implement SLIs/SLOs/SLAs

---

## Morning Session (9:00 AM - 12:00 PM)

### Module 1: Monitoring Architecture (60 minutes)

**1.1 Components Overview**

```
┌─────────────────┐
│  CFN Services   │ ← Expose /metrics endpoints
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│   Prometheus     │ ← Scrapes metrics every 15s
└────────┬─────────┘
         │
         ├─→ Alertmanager ← Routes alerts to PagerDuty/Slack
         │
         └─→ Grafana ← Visualizes metrics
```

**Components:**
1. **Metrics Exporters:**
   - Node Exporter: System metrics (CPU, memory, disk)
   - cAdvisor: Container metrics
   - Custom: Application metrics (agent spawn, cost, etc.)

2. **Prometheus:**
   - Pulls metrics from targets every 15 seconds
   - Stores time-series data (15-day retention)
   - Evaluates alert rules
   - Provides PromQL query interface

3. **Alertmanager:**
   - Receives alerts from Prometheus
   - Groups/deduplicates alerts
   - Routes to receivers (PagerDuty, Slack)
   - Manages silences

4. **Grafana:**
   - Queries Prometheus
   - Visualizes metrics
   - Creates dashboards
   - Sends alerts (alternative to Prometheus alerts)

**1.2 Metric Types**

**Counter:** Cumulative value that only increases
```promql
agent_spawn_total
agent_spawn_failures_total
cost_per_team_dollars
```

**Gauge:** Value that can go up or down
```promql
agent_running_count
redis_up
disk_usage_percent
```

**Histogram:** Samples observations (durations, sizes)
```promql
agent_duration_seconds_bucket
agent_duration_seconds_sum
agent_duration_seconds_count
```

**Summary:** Like histogram, pre-calculated quantiles
```promql
http_request_duration_seconds{quantile="0.95"}
```

### Module 2: PromQL Deep Dive (90 minutes)

**2.1 Basic Queries**

```promql
# Instant vector (latest value)
agent_running_count

# Range vector (values over time)
agent_spawn_total[5m]

# Filter by labels
agent_spawn_total{team="platform", agent_type="backend-developer"}

# Regular expression matching
agent_spawn_total{agent_type=~".*developer"}
```

**2.2 Rate and Increase**

```promql
# Rate: Per-second rate
rate(agent_spawn_total[5m])

# Increase: Total increase over time
increase(agent_spawn_total[1h])

# Example: Spawns per minute
rate(agent_spawn_total[5m]) * 60
```

**2.3 Aggregation**

```promql
# Sum across all labels
sum(agent_running_count)

# Sum by specific label
sum(agent_running_count) by (team)

# Average
avg(agent_duration_seconds) by (agent_type)

# Max/Min
max(disk_usage_percent) by (instance)
min(redis_up)

# Count
count(agent_running_count) by (agent_type)
```

**2.4 Histogram Quantiles**

```promql
# P50 (median) latency
histogram_quantile(0.50, rate(agent_duration_seconds_bucket[5m]))

# P95 latency
histogram_quantile(0.95, rate(agent_duration_seconds_bucket[5m]))

# P99 latency
histogram_quantile(0.99, rate(agent_duration_seconds_bucket[5m]))

# By agent type
histogram_quantile(0.95,
  sum(rate(agent_duration_seconds_bucket[5m])) by (agent_type, le)
)
```

**2.5 Complex Queries**

```promql
# Failure rate percentage
(
  rate(agent_spawn_failures_total[5m]) /
  rate(agent_spawn_total[5m])
) * 100

# Cost per successful task
sum(rate(cost_per_team_dollars[1h])) /
sum(rate(agent_spawn_total{status="success"}[1h]))

# Available memory percentage
(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# Disk space remaining (GB)
(node_filesystem_avail_bytes{mountpoint="/"} / 1024 / 1024 / 1024)
```

**Hands-On Exercise (30 min):**

**Tasks:**
1. Query total agent spawns in last hour
2. Calculate spawn failure rate as percentage
3. Find P95 agent duration by agent type
4. Calculate cost per team per hour
5. Identify team with highest spawn rate

**Solutions Review:**
Instructor reviews each query, explains optimizations

---

## Late Morning: Dashboard Building (60 minutes)

### Module 3: Creating Custom Dashboards

**3.1 Dashboard Design Principles (15 min)**

**Best Practices:**
1. **Top-level metrics first:** Key indicators (errors, latency, throughput)
2. **Logical grouping:** Related metrics together
3. **Consistent time ranges:** Sync across panels
4. **Meaningful titles:** Clear, specific panel names
5. **Appropriate visualizations:** Choose right chart type

**Anti-Patterns:**
- ❌ Too many panels (>20 per dashboard)
- ❌ Mixing unrelated metrics
- ❌ No context (what's good vs bad?)
- ❌ Overly complex queries (slow to load)

**3.2 Hands-On: Build Agent Health Dashboard (45 min)**

**Exercise: Create "Agent Health Dashboard" from scratch**

**Panel 1: Currently Running Agents (Stat)**
```promql
agent_running_count
```
- Visualization: Stat
- Thresholds: Green <10, Yellow <30, Red ≥30
- Sparkline: On

**Panel 2: Agent Spawn Rate (Time Series)**
```promql
rate(agent_spawn_total[5m]) * 60
```
- Visualization: Time series
- Unit: spawns/minute
- Y-axis: Min 0

**Panel 3: Spawn Failure Rate (Time Series)**
```promql
(rate(agent_spawn_failures_total[5m]) / rate(agent_spawn_total[5m])) * 100
```
- Visualization: Time series
- Unit: Percent (0-100)
- Thresholds: Red line at 10%

**Panel 4: Agent Duration P95 (Time Series)**
```promql
histogram_quantile(0.95,
  sum(rate(agent_duration_seconds_bucket[5m])) by (agent_type, le)
)
```
- Visualization: Time series
- Legend: {{agent_type}}
- Unit: Seconds

**Panel 5: Agents by Type (Bar Gauge)**
```promql
sum(agent_running_count) by (agent_type)
```
- Visualization: Bar gauge
- Orientation: Horizontal

**Panel 6: Agent Status Distribution (Pie Chart)**
```promql
sum(agent_status_total) by (status)
```
- Visualization: Pie chart
- Legend: Status names

**Panel 7: Recent Spawn Failures (Table)**
```promql
sort_desc(
  sum(increase(agent_spawn_failures_total[1h])) by (agent_type, team)
)
```
- Visualization: Table
- Columns: Agent Type, Team, Failure Count

**Save Dashboard:** "Agent Health Dashboard"

---

## Afternoon Session (1:00 PM - 5:00 PM)

### Module 4: Alert Configuration (75 minutes)

**4.1 Alert Rule Anatomy (15 min)**

```yaml
- alert: AlertName
  expr: promql_query
  for: duration
  labels:
    severity: P0|P1|P2
    component: system_component
  annotations:
    summary: "Brief description"
    description: "Detailed {{ $labels }} {{ $value }}"
    runbook_url: "https://docs/runbooks/alert.md"
```

**Key Fields:**
- **expr:** PromQL query (fires when true)
- **for:** How long condition must be true before alerting
- **labels:** Metadata for routing
- **annotations:** Alert details (supports templating)

**4.2 Writing Effective Alerts (30 min)**

**Good Alert Example:**
```yaml
- alert: HighAgentSpawnFailureRate
  expr: rate(agent_spawn_failures_total[5m]) > 0.10
  for: 5m
  labels:
    severity: P1
    component: agent-spawner
  annotations:
    summary: "High agent spawn failure rate"
    description: "Spawn failure rate is {{ $value | humanizePercentage }} (threshold: 10%)"
    runbook_url: "https://docs/runbooks/agent-spawn-failure.md"
```

**Why This Works:**
- Actionable threshold (>10% failures)
- Appropriate duration (5 min avoids flapping)
- Clear description with actual value
- Runbook link for response

**Bad Alert Example:**
```yaml
- alert: CPUHigh
  expr: cpu_usage > 50
  for: 1m
  labels:
    severity: P0
  annotations:
    summary: "CPU high"
```

**Why This Fails:**
- Too low threshold (50% CPU normal)
- Too short duration (flapping)
- Severity too high (P0 inappropriate)
- No description, no runbook

**4.3 Hands-On: Create Custom Alert (30 min)**

**Exercise: Create "HighTaskDuration" alert**

**Requirements:**
- Alert when P95 task duration >15 minutes
- Evaluate over 10 minutes
- P1 severity
- Include team label in description

**Solution:**
```yaml
- alert: HighTaskDuration
  expr: histogram_quantile(0.95, rate(task_duration_seconds_bucket[10m])) > 900
  for: 10m
  labels:
    severity: P1
    component: cfn-coordinator
  annotations:
    summary: "High task duration detected"
    description: "P95 task duration is {{ $value | humanizeDuration }} for team {{ $labels.team }} (threshold: 15m)"
    runbook_url: "https://docs/runbooks/high-task-duration.md"
```

**Steps:**
1. Add to `monitoring/prometheus-rules.yml`
2. Validate: `promtool check rules monitoring/prometheus-rules.yml`
3. Reload Prometheus: `curl -X POST http://localhost:9090/-/reload`
4. Test: Verify alert appears in Prometheus /alerts

---

### Module 5: Alert Tuning (60 minutes)

**5.1 Identifying Noisy Alerts (20 min)**

**Metrics to Track:**
```promql
# Alert frequency
count(ALERTS) by (alertname)

# Alert fire count (last 7 days)
count_over_time(ALERTS{alertname="HighDiskUsage"}[7d])

# Time in alerting state
avg_over_time(ALERTS{alertname="HighDiskUsage"}[7d])
```

**Noise Indicators:**
- Alert fires >10 times/day
- Average duration <5 minutes (flapping)
- False positive rate >10%

**5.2 Tuning Strategies (20 min)**

**Strategy 1: Adjust Threshold**
```yaml
# Before (too sensitive)
expr: disk_usage_percent > 80

# After (more appropriate)
expr: disk_usage_percent > 90
```

**Strategy 2: Increase Duration**
```yaml
# Before (flapping)
for: 1m

# After (more stable)
for: 10m
```

**Strategy 3: Use Rate Functions**
```yaml
# Before (absolute)
expr: error_count > 100

# After (rate-based)
expr: rate(error_count[5m]) > 20
```

**Strategy 4: Add Context**
```yaml
# Before (alerts on normal variance)
expr: latency_seconds > 1

# After (alerts on sustained high latency)
expr: avg_over_time(latency_seconds[5m]) > 1
```

**5.3 Hands-On: Tune Noisy Alert (20 min)**

**Scenario:** HighDiskUsage alert fires 15 times/day

**Current Configuration:**
```yaml
- alert: HighDiskUsage
  expr: disk_usage_percent > 80
  for: 5m
```

**Analysis:**
- Disk usage fluctuates 78-82% normally
- Alert threshold too sensitive
- Duration too short (flapping)

**Tuning Exercise:**
1. Analyze disk usage patterns (query Prometheus)
2. Determine appropriate threshold
3. Adjust alert configuration
4. Validate with test data

**Improved Configuration:**
```yaml
- alert: HighDiskUsage
  expr: disk_usage_percent > 90
  for: 15m
  labels:
    severity: P1
```

---

### Module 6: SLI/SLO/SLA Implementation (75 minutes)

**6.1 Concepts (15 min)**

**SLI (Service Level Indicator):**
- Quantitative measure of service level
- Examples: Latency, error rate, availability

**SLO (Service Level Objective):**
- Target value for SLI
- Example: 99.9% availability, P95 latency <500ms

**SLA (Service Level Agreement):**
- Business commitment based on SLO
- Includes consequences if not met

**6.2 Defining SLIs for CFN (20 min)**

**Availability SLI:**
```promql
# Uptime percentage
(
  sum(up{job="cfn-services"}) /
  count(up{job="cfn-services"})
) * 100
```
**Target SLO:** 99.9% (43.2 minutes downtime/month)

**Latency SLI:**
```promql
# P95 agent spawn time
histogram_quantile(0.95, rate(agent_spawn_duration_seconds_bucket[5m]))
```
**Target SLO:** P95 <30 seconds

**Success Rate SLI:**
```promql
# Task success rate
(
  sum(rate(task_status_total{status="success"}[5m])) /
  sum(rate(task_status_total[5m]))
) * 100
```
**Target SLO:** 95% success rate

**6.3 Hands-On: Build SLO Dashboard (40 min)**

**Exercise: Create "CFN SLOs" dashboard**

**Panel 1: Availability SLO (Gauge)**
```promql
(sum(up{job="cfn-services"}) / count(up{job="cfn-services"})) * 100
```
- Visualization: Gauge
- Min: 99.9 (SLO threshold)
- Max: 100
- Thresholds: Red <99.9, Green ≥99.9

**Panel 2: Latency SLO (Gauge)**
```promql
histogram_quantile(0.95, rate(agent_spawn_duration_seconds_bucket[5m]))
```
- Visualization: Gauge
- Max: 30 (SLO: <30s)
- Thresholds: Green <30, Red ≥30

**Panel 3: Error Budget (Stat)**
```promql
# Remaining error budget (downtime minutes this month)
43.2 - (
  (1 - (sum(up{job="cfn-services"}) / count(up{job="cfn-services"})))
  * 43200  # Minutes in 30 days
)
```
- Visualization: Stat
- Unit: Minutes
- Show: Remaining error budget

**Panel 4: SLO Compliance Over Time (Time Series)**
```promql
# Availability over 30 days
avg_over_time(
  (sum(up{job="cfn-services"}) / count(up{job="cfn-services"}))
  [30d:5m]
) * 100
```
- Visualization: Time series
- Threshold: 99.9% line

**Save Dashboard:** "CFN SLOs"

---

## Final Module: Troubleshooting (60 minutes)

### Module 7: Common Monitoring Issues

**7.1 Issue: Metrics Not Appearing (15 min)**

**Symptoms:**
- Query returns no data
- Dashboard panels empty

**Diagnosis:**
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq

# Check if metric exists
curl 'http://localhost:9090/api/v1/label/__name__/values' | jq | grep metric_name

# Check scrape errors
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health != "up")'
```

**Resolution:**
1. Verify target is UP in Prometheus
2. Check service is exposing /metrics endpoint
3. Verify metric name spelling
4. Check retention period (>15 days old?)

**7.2 Issue: Alert Not Firing (15 min)**

**Symptoms:**
- Condition met, but no alert
- Prometheus shows no alerts

**Diagnosis:**
```bash
# Test alert query
curl -G http://localhost:9090/api/v1/query \
  --data-urlencode 'query=rate(agent_spawn_failures_total[5m]) > 0.10'

# Check alert rules loaded
curl http://localhost:9090/api/v1/rules | jq

# Check for syntax errors
promtool check rules monitoring/prometheus-rules.yml
```

**Resolution:**
1. Verify query returns data
2. Check "for" duration hasn't been exceeded
3. Reload Prometheus config
4. Check Prometheus logs for errors

**7.3 Issue: Slow Dashboard Loading (15 min)**

**Symptoms:**
- Dashboard takes >10 seconds to load
- Grafana times out

**Diagnosis:**
```bash
# Test query performance
time curl -G http://localhost:9090/api/v1/query \
  --data-urlencode 'query=YOUR_SLOW_QUERY'

# Check Prometheus memory usage
docker stats prometheus --no-stream
```

**Optimization Strategies:**
1. Reduce time range (use variables)
2. Use recording rules for complex queries
3. Aggregate before filtering
4. Avoid regex when possible

**Before (slow):**
```promql
sum(rate(metric_name{label=~".*"}[5m])) by (label)
```

**After (fast):**
```promql
sum(rate(metric_name[5m])) by (label)
```

**7.4 Hands-On: Debug Monitoring Stack (15 min)**

**Scenarios:**
Instructor introduces 3 monitoring issues:
1. Missing metric
2. Alert not firing
3. Slow query

Students diagnose and resolve each issue.

---

## Workshop Wrap-Up (30 minutes)

**Assessment:**
- Build custom dashboard (judged on design + functionality)
- Write alert rule (validated for correctness)
- Debug monitoring issue (timed exercise)

**Certification:**
"CFN Monitoring Specialist" certificate upon completion

**Resources:**
- PromQL Cheat Sheet (handout)
- Dashboard templates (Git repository)
- Alert rule library (examples for common patterns)

**Next Steps:**
- Contribute to monitoring improvements
- Monthly monitoring review meetings
- Mentor new team members on monitoring

---

## Quick Reference

**PromQL Essentials:**
```promql
rate(counter[5m])              # Per-second rate
increase(counter[1h])          # Total increase
histogram_quantile(0.95, ...)  # P95
sum(...) by (label)            # Aggregate
avg_over_time(metric[1h])      # Average over time
```

**Useful Commands:**
```bash
# Reload Prometheus
curl -X POST http://localhost:9090/-/reload

# Validate rules
promtool check rules prometheus-rules.yml

# Query API
curl 'http://localhost:9090/api/v1/query?query=up'

# Test alert
amtool alert add alertname=test
```

**Documentation:**
- Prometheus: https://prometheus.io/docs/
- PromQL: https://prometheus.io/docs/prometheus/latest/querying/basics/
- Grafana: https://grafana.com/docs/

---

**Questions?**
Contact: monitoring-team@company.com
