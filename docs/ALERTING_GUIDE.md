# Alerting Guide

**Version:** 1.0
**Last Updated:** 2025-11-24
**Maintainer:** SRE Team

---

## Table of Contents

1. [Overview](#overview)
2. [Alert Severity Definitions](#alert-severity-definitions)
3. [Alert Rules Reference](#alert-rules-reference)
4. [Integration Setup](#integration-setup)
5. [Runbook Index](#runbook-index)
6. [Testing Procedures](#testing-procedures)
7. [Silencing Procedures](#silencing-procedures)
8. [Alert Tuning](#alert-tuning)
9. [Notification Routing](#notification-routing)
10. [Alert Fatigue Prevention](#alert-fatigue-prevention)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The CFN platform alerting system uses Prometheus for metric collection and alerting, Alertmanager for alert routing and grouping, and integrations with PagerDuty and Slack for notifications.

**Alert Flow:**
```
Prometheus → Alert Rules → Alertmanager → Routing → PagerDuty/Slack
```

**Key Files:**
- **Alert Rules:** `/mnt/wsl/.../monitoring/prometheus-rules.yml`
- **Alertmanager Config:** `/mnt/wsl/.../monitoring/alertmanager-config.yml`
- **Integration Scripts:**
  - PagerDuty: `/mnt/wsl/.../scripts/alerting/pagerduty-integration.sh`
  - Slack: `/mnt/wsl/.../scripts/alerting/slack-integration.sh`

**Dashboards:**
- Prometheus Alerts: http://localhost:9090/alerts
- Alertmanager: http://localhost:9093
- Grafana: http://localhost:3000

---

## Alert Severity Definitions

### Severity Levels

| Severity | Impact | Response | Escalation | Notification |
|----------|--------|----------|------------|--------------|
| **P0** | Total outage, data loss | 5 min | 30 min | PagerDuty + Slack |
| **P1** | Major degradation | 15 min | 2 hours | PagerDuty + Slack |
| **P2** | Minor issue | 30 min | 4 hours | Slack only |
| **P3** | Informational | 24 hours | N/A | Slack only |

### P0 - Critical (Page Immediately)

**Characteristics:**
- Complete system unavailability
- Data loss in progress or imminent
- Security breach
- All users affected

**Examples:**
- Docker daemon completely unavailable
- Redis connection loss (all coordination blocked)
- PostgreSQL connection loss (all persistence blocked)
- Security breach detected

**Notification:**
- PagerDuty: High urgency page
- Slack: #cfn-alerts + #cfn-incidents
- Escalation: Automatic after 30 minutes

### P1 - High (Page During Business Hours)

**Characteristics:**
- Major functionality impaired
- Significant user impact
- Degraded performance
- Partial system failure

**Examples:**
- High agent spawn failure rate (>10%)
- CFN Loop stuck (>1 hour)
- High cost per team (>$10/hour)
- Disk space critical (>90%)
- High memory usage causing issues

**Notification:**
- PagerDuty: High urgency (business hours) or Low urgency (off-hours)
- Slack: #cfn-alerts
- Escalation: After 2 hours

### P2 - Medium (Notify, No Page)

**Characteristics:**
- Minor functionality degraded
- Limited user impact
- Can wait for business hours
- Warning threshold reached

**Examples:**
- Certificate expiring soon (<7 days)
- Disk space warning (>80%)
- Performance degradation
- Single component failure (redundancy available)

**Notification:**
- Slack: #cfn-alerts only
- Escalation: After 4 hours if unresolved

### P3 - Low (Informational)

**Characteristics:**
- No immediate impact
- Informational alerts
- Trend warnings
- Maintenance reminders

**Examples:**
- Backup completed successfully
- Certificate renewed
- System metrics (informational)
- Capacity planning warnings

**Notification:**
- Slack: #cfn-monitoring (optional)
- No escalation

---

## Alert Rules Reference

### Complete Alert Rules Table

All 24 alert rules defined in `monitoring/prometheus-rules.yml`:

| Alert Name | Severity | Threshold | Duration | Runbook |
|------------|----------|-----------|----------|---------|
| **DockerDaemonUnavailable** | P0 | Docker down | 1 min | [docker-daemon-unavailable.md](runbooks/docker-daemon-unavailable.md) |
| **RedisConnectionLoss** | P0 | Redis unavailable | 30 sec | [redis-connection-loss.md](runbooks/redis-connection-loss.md) |
| **PostgresConnectionLoss** | P0 | PostgreSQL unavailable | 30 sec | [postgres-connection-loss.md](runbooks/postgres-connection-loss.md) |
| **HighAgentSpawnFailureRate** | P1 | >10% failures | 5 min | [agent-spawn-failure.md](runbooks/agent-spawn-failure.md) |
| **CFNLoopStuck** | P1 | Stuck >1 hour | 1 hour | [cfn-loop-stuck.md](runbooks/cfn-loop-stuck.md) |
| **HighDiskUsage** | P1 | >90% full | 5 min | [disk-space-exhaustion.md](runbooks/disk-space-exhaustion.md) |
| **HighMemoryUsagePerAgent** | P1 | Agent >2GB | 5 min | [memory-exhaustion.md](runbooks/memory-exhaustion.md) |
| **BackupFailure** | P1 | No backup in 24h | 30 min | [backup-failure.md](runbooks/backup-failure.md) |
| **HighCostPerTeam** | P2 | >$10/hour | 1 hour | [high-cost-per-team.md](runbooks/high-cost-per-team.md) |
| **CertificateExpiringSoon** | P2 | <7 days | 1 hour | [certificate-expiration.md](runbooks/certificate-expiration.md) |
| **HighCPUUsage** | P2 | >80% CPU | 10 min | N/A |
| **HighSwapUsage** | P2 | >50% swap | 10 min | N/A |
| **ContainerRestartLoop** | P1 | >5 restarts in 10min | 10 min | N/A |
| **HighNetworkErrors** | P2 | >1% error rate | 5 min | N/A |
| **SlowQueryDetected** | P2 | Query >10s | 5 min | N/A |
| **RedisMemoryHigh** | P2 | >80% maxmemory | 5 min | N/A |
| **PostgresConnectionPoolFull** | P1 | >90% pool used | 5 min | N/A |
| **HighLatency** | P2 | P95 >1s | 10 min | N/A |
| **LowAgentSuccessRate** | P2 | <80% success | 15 min | N/A |
| **OrchestatorDeadlock** | P1 | No progress 30min | 30 min | N/A |
| **CoordinationTimeout** | P1 | Timeout rate >5% | 5 min | N/A |
| **HighErrorRate** | P1 | >5% errors | 5 min | N/A |
| **DiskWriteSlow** | P2 | Write latency >100ms | 10 min | N/A |
| **NetworkPartition** | P0 | Network unreachable | 1 min | N/A |

### Alert Rule Details

Each alert rule in `prometheus-rules.yml` follows this structure:

```yaml
- alert: AlertName
  expr: prometheus_query
  for: duration
  labels:
    severity: P0|P1|P2
    component: system_component
  annotations:
    summary: "Brief description"
    description: "Detailed description with {{ $labels }} and {{ $value }}"
    runbook_url: "https://docs/runbooks/alert-name.md"
```

**Example - HighAgentSpawnFailureRate:**

```yaml
- alert: HighAgentSpawnFailureRate
  expr: rate(agent_spawn_failures_total[5m]) > 0.10
  for: 5m
  labels:
    severity: P1
    component: agent-spawner
  annotations:
    summary: "High agent spawn failure rate"
    description: "Agent spawn failure rate is {{ $value | humanizePercentage }} (threshold: 10%)"
    runbook_url: "https://docs/runbooks/agent-spawn-failure.md"
```

---

## Integration Setup

### PagerDuty Integration

**Setup Steps:**

1. **Create PagerDuty Service:**
   - Log in to PagerDuty
   - Services → Service Directory → New Service
   - Name: "CFN Platform Alerts"
   - Escalation Policy: Select existing or create new
   - Integration Type: "Events API v2"
   - Copy Integration Key

2. **Configure Alertmanager:**

Edit `monitoring/alertmanager-config.yml`:

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    - match:
        severity: P0
      receiver: 'pagerduty-critical'
      repeat_interval: 30m

    - match:
        severity: P1
      receiver: 'pagerduty-high'
      repeat_interval: 2h

    - match:
        severity: P2
      receiver: 'slack-alerts'
      repeat_interval: 12h

receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '[YOUR_INTEGRATION_KEY]'
        severity: 'critical'
        description: '{{ .CommonAnnotations.summary }}'
        details:
          firing: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'pagerduty-high'
    pagerduty_configs:
      - service_key: '[YOUR_INTEGRATION_KEY]'
        severity: 'error'

  - name: 'slack-alerts'
    slack_configs:
      - api_url: '[SLACK_WEBHOOK_URL]'
        channel: '#cfn-alerts'

  - name: 'default'
    slack_configs:
      - api_url: '[SLACK_WEBHOOK_URL]'
        channel: '#cfn-monitoring'
```

3. **Test Integration:**

```bash
# Send test alert
curl -X POST http://localhost:9093/api/v1/alerts -d '[
  {
    "labels": {
      "alertname": "TestAlert",
      "severity": "P1"
    },
    "annotations": {
      "summary": "Test alert from configuration"
    }
  }
]'

# Verify in PagerDuty
# Check: Incidents → Recent incidents
```

**Integration Script:**

Located at `scripts/alerting/pagerduty-integration.sh`:

```bash
#!/bin/bash
# Sends alert to PagerDuty Events API v2

INTEGRATION_KEY="[YOUR_KEY]"
EVENT_ACTION="trigger"  # trigger, acknowledge, resolve
SEVERITY="error"        # critical, error, warning, info

curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H 'Content-Type: application/json' \
  -d '{
    "routing_key": "'"$INTEGRATION_KEY"'",
    "event_action": "'"$EVENT_ACTION"'",
    "payload": {
      "summary": "'"$ALERT_SUMMARY"'",
      "severity": "'"$SEVERITY"'",
      "source": "CFN Platform",
      "custom_details": {
        "description": "'"$ALERT_DESCRIPTION"'",
        "runbook": "'"$RUNBOOK_URL"'"
      }
    }
  }'
```

### Slack Integration

**Setup Steps:**

1. **Create Slack App:**
   - Go to https://api.slack.com/apps
   - Create New App → From scratch
   - Name: "CFN Alerts"
   - Workspace: Select your workspace

2. **Enable Incoming Webhooks:**
   - Incoming Webhooks → Activate
   - Add New Webhook to Workspace
   - Select channel: #cfn-alerts
   - Copy Webhook URL

3. **Configure Alertmanager:**

Already configured in `alertmanager-config.yml` (see above).

4. **Customize Slack Messages:**

Edit Alertmanager config for rich formatting:

```yaml
receivers:
  - name: 'slack-alerts'
    slack_configs:
      - api_url: '[SLACK_WEBHOOK_URL]'
        channel: '#cfn-alerts'
        username: 'CFN Alertmanager'
        icon_emoji: ':rotating_light:'
        title: '{{ .CommonAnnotations.summary }}'
        text: |-
          {{ range .Alerts }}
          *Alert:* {{ .Labels.alertname }}
          *Severity:* {{ .Labels.severity }}
          *Description:* {{ .Annotations.description }}
          *Runbook:* {{ .Annotations.runbook_url }}
          {{ end }}
        send_resolved: true
```

**Integration Script:**

Located at `scripts/alerting/slack-integration.sh`:

```bash
#!/bin/bash
# Sends formatted alert to Slack

SLACK_WEBHOOK="[YOUR_WEBHOOK_URL]"
SEVERITY="$1"
ALERT_NAME="$2"
DESCRIPTION="$3"
RUNBOOK_URL="$4"

# Color based on severity
case $SEVERITY in
  P0) COLOR="danger" EMOJI=":red_circle:" ;;
  P1) COLOR="warning" EMOJI=":large_orange_circle:" ;;
  P2) COLOR="good" EMOJI=":large_yellow_circle:" ;;
  *) COLOR="#808080" EMOJI=":white_circle:" ;;
esac

curl -X POST "$SLACK_WEBHOOK" \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "CFN Alerts",
    "icon_emoji": ":rotating_light:",
    "attachments": [{
      "color": "'"$COLOR"'",
      "title": "'"$EMOJI $SEVERITY: $ALERT_NAME"'",
      "text": "'"$DESCRIPTION"'",
      "fields": [{
        "title": "Runbook",
        "value": "'"$RUNBOOK_URL"'",
        "short": false
      }],
      "footer": "CFN Platform",
      "ts": '$(date +%s)'
    }]
  }'
```

---

## Runbook Index

Quick reference linking alerts to runbooks:

| Alert | Severity | Runbook |
|-------|----------|---------|
| Agent Spawn Failures | P1 | [agent-spawn-failure.md](runbooks/agent-spawn-failure.md) |
| Redis Connection Loss | P0 | [redis-connection-loss.md](runbooks/redis-connection-loss.md) |
| PostgreSQL Connection Loss | P0 | [postgres-connection-loss.md](runbooks/postgres-connection-loss.md) |
| Docker Daemon Unavailable | P0 | [docker-daemon-unavailable.md](runbooks/docker-daemon-unavailable.md) |
| Disk Space Exhaustion | P1 | [disk-space-exhaustion.md](runbooks/disk-space-exhaustion.md) |
| High Cost Per Team | P2 | [high-cost-per-team.md](runbooks/high-cost-per-team.md) |
| CFN Loop Stuck | P1 | [cfn-loop-stuck.md](runbooks/cfn-loop-stuck.md) |
| Certificate Expiration | P2 | [certificate-expiration.md](runbooks/certificate-expiration.md) |
| Memory Exhaustion | P1 | [memory-exhaustion.md](runbooks/memory-exhaustion.md) |
| Backup Failure | P1 | [backup-failure.md](runbooks/backup-failure.md) |

**All runbooks located at:** `/mnt/wsl/.../docs/runbooks/`

---

## Testing Procedures

### How to Fire Test Alerts

**Method 1: Send Alert to Alertmanager API**

```bash
# Test P2 alert (Slack only)
curl -X POST http://localhost:9093/api/v1/alerts -H 'Content-Type: application/json' -d '[
  {
    "labels": {
      "alertname": "TestAlert",
      "severity": "P2",
      "component": "test"
    },
    "annotations": {
      "summary": "Test alert - please ignore",
      "description": "This is a test alert for validation"
    },
    "startsAt": "'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'",
    "endsAt": "'"$(date -u -d '+5 minutes' +%Y-%m-%dT%H:%M:%S.000Z)"'"
  }
]'

# Verify alert appears in Slack #cfn-alerts channel
```

**Method 2: Trigger Alert via Metrics**

```bash
# Artificially trigger HighDiskUsage alert
# Fill disk to >90% (use caution!)

dd if=/dev/zero of=/tmp/test-file bs=1M count=10000
# Wait 5 minutes for alert to fire
# Clean up: rm /tmp/test-file
```

**Method 3: Simulate Component Failure**

```bash
# Test RedisConnectionLoss alert
docker stop cfn-redis

# Wait 30 seconds for alert to fire
# Check: http://localhost:9090/alerts

# Resolve alert
docker start cfn-redis

# Verify resolved notification sent
```

### Test Checklist

Before going on-call, verify all integrations:

- [ ] PagerDuty receives P0/P1 test alerts
- [ ] Slack #cfn-alerts receives all severity levels
- [ ] PagerDuty mobile app notifications work
- [ ] Slack mobile app notifications work
- [ ] Email notifications (if configured)
- [ ] Resolve notifications sent correctly
- [ ] Alert grouping works (multiple similar alerts)
- [ ] Escalation policies trigger after timeout

### Scheduled Alert Testing

**Weekly:** Automated test alert (P3 severity)
```bash
# Add to crontab
0 10 * * 1 /usr/local/bin/send-test-alert.sh
```

**Monthly:** Full integration test (all severity levels)
- First Monday of month
- Send P3, P2, P1 test alerts (not P0)
- Verify all channels receive alerts
- Document any issues

**Quarterly:** Escalation policy test
- Test escalation to secondary on-call
- Test manager escalation
- Verify escalation timing (30 min for P0, 2 hours for P1)

---

## Silencing Procedures

### When to Silence Alerts

**Appropriate use cases:**
- Planned maintenance windows
- Known issues with active fixes in progress
- Temporary test environments
- Decommissioning systems

**Inappropriate use cases:**
- ❌ Recurring alerts you don't want to fix
- ❌ Alerts that are "too noisy"
- ❌ Production issues without incident tickets

### How to Silence Alerts

**Via Alertmanager Web UI:**

1. Navigate to http://localhost:9093
2. Click on alert you want to silence
3. Click "Silence" button
4. Fill in form:
   - **Duration:** How long to silence (e.g., 2h, 1d)
   - **Creator:** Your name
   - **Comment:** Why silencing (required: ticket number)
5. Click "Create"

**Via CLI:**

```bash
# Silence specific alert for 2 hours
amtool silence add \
  alertname="HighDiskUsage" \
  --duration=2h \
  --author="ops-team" \
  --comment="Maintenance: JIRA-123 - Cleaning up old logs" \
  --alertmanager.url=http://localhost:9093

# Silence all alerts for a component
amtool silence add \
  component="redis" \
  --duration=30m \
  --author="ops-team" \
  --comment="Redis upgrade: JIRA-456" \
  --alertmanager.url=http://localhost:9093

# List active silences
amtool silence query \
  --alertmanager.url=http://localhost:9093

# Remove silence by ID
amtool silence expire <silence-id> \
  --alertmanager.url=http://localhost:9093
```

**Via API:**

```bash
# Create silence
curl -X POST http://localhost:9093/api/v2/silences \
  -H 'Content-Type: application/json' \
  -d '{
    "matchers": [
      {
        "name": "alertname",
        "value": "HighDiskUsage",
        "isRegex": false
      }
    ],
    "startsAt": "'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'",
    "endsAt": "'"$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%S.000Z)"'",
    "createdBy": "ops-team",
    "comment": "Maintenance window: JIRA-123"
  }'
```

### Silence Best Practices

1. **Always add comment with ticket number**
2. **Use shortest necessary duration** (prefer 1-2 hours over 1 day)
3. **Review silences weekly** and remove expired/unnecessary ones
4. **Document in #cfn-alerts** when silencing P0/P1 alerts
5. **Never silence P0 alerts** without manager approval

### Maintenance Windows

For planned maintenance:

```bash
# Create silence before maintenance starts
# Include all affected alerts

amtool silence add \
  component="cfn-platform" \
  --duration=4h \
  --author="ops-team" \
  --comment="Scheduled maintenance: MAINT-789 - PostgreSQL upgrade" \
  --alertmanager.url=http://localhost:9093

# Post in Slack
# Message: "Maintenance window: 10:00-14:00 UTC. Alerts silenced for PostgreSQL upgrade. MAINT-789"

# Remove silence after maintenance completes (or let expire)
```

---

## Alert Tuning

### When to Tune Alerts

**Tune alert if:**
- False positive rate >10%
- Alert fires but no action needed
- Threshold too sensitive (flapping)
- Threshold too lenient (misses real issues)

**Don't tune if:**
- You're just tired of the alert (fix root cause instead)
- Alert is accurate but inconvenient
- Issue is real but you disagree with severity

### How to Tune Alert Thresholds

**1. Analyze Alert History:**

```bash
# Query Prometheus for alert frequency
curl -s 'http://localhost:9090/api/v1/query?query=ALERTS{alertname="HighDiskUsage"}[7d]' | jq

# Check false positive rate
# Review resolved alerts that required no action
```

**2. Adjust Threshold:**

Edit `monitoring/prometheus-rules.yml`:

```yaml
# Before (too sensitive)
- alert: HighDiskUsage
  expr: disk_usage_percent > 80
  for: 5m

# After (more lenient)
- alert: HighDiskUsage
  expr: disk_usage_percent > 90
  for: 5m

# Or adjust duration (reduce flapping)
- alert: HighDiskUsage
  expr: disk_usage_percent > 85
  for: 15m  # Was 5m
```

**3. Reload Prometheus Configuration:**

```bash
# Reload Prometheus to apply changes
curl -X POST http://localhost:9090/-/reload

# Or restart container
docker restart prometheus
```

**4. Monitor for 1 Week:**

- Track new alert frequency
- Verify false positives reduced
- Ensure real issues still trigger alerts
- Document changes in git commit message

### Common Tuning Scenarios

**Scenario 1: Alert Flapping**

Problem: Alert fires and resolves repeatedly within minutes

Solution: Increase `for:` duration

```yaml
# Before
for: 1m

# After
for: 10m
```

**Scenario 2: Alert Too Sensitive**

Problem: Alert fires for normal variance

Solution: Adjust threshold or add rate/increase functions

```yaml
# Before (absolute threshold)
expr: metric_value > 100

# After (rate-based threshold)
expr: rate(metric_value[5m]) > 20
```

**Scenario 3: Alert Misses Real Issues**

Problem: Alert doesn't fire when it should

Solution: Lower threshold or reduce duration

```yaml
# Before (too lenient)
expr: error_rate > 0.10  # 10%
for: 30m

# After (more sensitive)
expr: error_rate > 0.05  # 5%
for: 10m
```

### Tuning Approval Process

1. **Create JIRA ticket:** Document proposed change
2. **Discuss in team meeting:** Get team input
3. **Test in staging:** Validate new threshold
4. **Create PR:** Update `prometheus-rules.yml`
5. **Get review:** Require manager approval for P0/P1 alerts
6. **Merge and monitor:** Watch for 1 week

---

## Notification Routing

### Routing Configuration

Alertmanager routes alerts based on labels:

```yaml
route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 10s        # Wait before sending first notification
  group_interval: 5m     # Wait before sending batch of new alerts
  repeat_interval: 4h    # Wait before re-sending unresolved alert

  routes:
    # P0 alerts → PagerDuty (critical)
    - match:
        severity: P0
      receiver: 'pagerduty-critical'
      repeat_interval: 30m
      continue: true      # Also send to Slack

    # P1 alerts → PagerDuty (high)
    - match:
        severity: P1
      receiver: 'pagerduty-high'
      repeat_interval: 2h
      continue: true

    # P2 alerts → Slack only
    - match:
        severity: P2
      receiver: 'slack-alerts'
      repeat_interval: 12h

    # Security alerts → Security team
    - match:
        component: security
      receiver: 'security-team'
      repeat_interval: 1h
```

### Grouping Behavior

**Example:** Multiple disk space alerts firing

Without grouping:
- 5 separate alerts → 5 separate pages

With grouping:
- 1 notification: "5 HighDiskUsage alerts firing"

**Configure grouping:**

```yaml
group_by: ['alertname', 'cluster', 'severity']
group_wait: 30s       # Wait 30s to collect similar alerts
group_interval: 5m    # Check for new alerts every 5m
```

### Inhibition Rules

Prevent redundant alerts when higher-level alert fires:

```yaml
inhibit_rules:
  # If Docker daemon down, don't alert on Redis/PostgreSQL
  - source_match:
      alertname: 'DockerDaemonUnavailable'
    target_match_re:
      alertname: '(RedisConnectionLoss|PostgresConnectionLoss)'
    equal: ['instance']

  # If disk full, don't alert on backup failure
  - source_match:
      alertname: 'HighDiskUsage'
    target_match:
      alertname: 'BackupFailure'
    equal: ['instance']
```

---

## Alert Fatigue Prevention

### Identifying Alert Fatigue

**Warning signs:**
- Ignoring or dismissing alerts without investigation
- Silencing alerts permanently
- Multiple alerts firing simultaneously
- False positive rate >10%
- No action taken on most alerts

### Strategies to Reduce Alert Fatigue

**1. Implement Alert Hierarchy**

Only alert on symptoms, not causes:

```yaml
# Good: Alert on user impact
- alert: APIHighLatency
  expr: http_request_duration_seconds{quantile="0.95"} > 1

# Bad: Alert on component metrics
- alert: CPUHigh
  expr: cpu_usage > 80
```

**2. Use Appropriate Severity**

Most alerts should be P2 or P3:
- **P0:** <5% of alerts
- **P1:** <20% of alerts
- **P2:** ~60% of alerts
- **P3:** ~15% of alerts

**3. Fix Root Causes**

Don't just acknowledge alerts—fix the underlying issues:
- Track recurring alerts
- Create tickets for frequent issues
- Prioritize fixes for top 5 noisy alerts

**4. Tune Alert Thresholds**

Regularly review and adjust:
- Weekly: Review new alert frequency
- Monthly: Tune noisy alerts (>10/day)
- Quarterly: Audit all alert rules

**5. Implement SLOs Instead of Arbitrary Thresholds**

```yaml
# Better: Alert on SLO violation
- alert: SLOViolation
  expr: (sum(rate(http_requests_total{status!~"5.."}[30d])) / sum(rate(http_requests_total[30d]))) < 0.999

# Worse: Alert on arbitrary threshold
- alert: HighErrorRate
  expr: rate(http_requests_total{status="500"}[5m]) > 0.01
```

### Alert Fatigue Metrics

Track these metrics to identify fatigue:

```promql
# Alerts per day
count(ALERTS) by (alertname)

# Time to acknowledge
avg(alert_ack_time_seconds) by (alertname)

# False positive rate
(count(ALERTS{action="no_action"}) / count(ALERTS)) by (alertname)
```

---

## Troubleshooting

### Common Issues

**Issue 1: Alerts Not Firing**

**Symptoms:**
- Expected alert doesn't fire
- Prometheus shows no alerts in /alerts

**Diagnosis:**
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health != "up")'

# Check alert rule syntax
promtool check rules monitoring/prometheus-rules.yml

# Check if metric exists
curl 'http://localhost:9090/api/v1/query?query=metric_name' | jq
```

**Resolution:**
1. Verify targets are UP in Prometheus
2. Fix syntax errors in alert rules
3. Reload Prometheus configuration
4. Check if metric name correct

**Issue 2: Alerts Not Reaching PagerDuty**

**Symptoms:**
- Alert fires in Prometheus
- No page received

**Diagnosis:**
```bash
# Check Alertmanager status
curl http://localhost:9093/api/v2/status | jq

# Check alert received by Alertmanager
curl http://localhost:9093/api/v2/alerts | jq

# Check PagerDuty integration
curl http://localhost:9093/api/v2/silences | jq
```

**Resolution:**
1. Verify Alertmanager receiving alerts from Prometheus
2. Check Alertmanager configuration (receiver defined)
3. Verify PagerDuty integration key correct
4. Test with manual alert (see Testing section)

**Issue 3: Alerts Not Reaching Slack**

**Symptoms:**
- Alert fires in Prometheus
- No Slack notification

**Diagnosis:**
```bash
# Test Slack webhook directly
curl -X POST '[SLACK_WEBHOOK]' \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message"}'

# Check Alertmanager logs
docker logs alertmanager 2>&1 | grep -i slack
```

**Resolution:**
1. Verify Slack webhook URL valid
2. Check Alertmanager routing (severity matches route)
3. Verify Slack channel exists
4. Check for rate limiting (max 1 message/second)

**Issue 4: Alert Flapping**

**Symptoms:**
- Alert fires and resolves repeatedly
- Multiple notifications within minutes

**Diagnosis:**
```bash
# Check metric values over time
curl 'http://localhost:9090/api/v1/query_range?query=metric_name&start=...' | jq

# Look for threshold bouncing
# Example: disk usage 89% → 91% → 89% → 91%
```

**Resolution:**
1. Increase `for:` duration (e.g., 5m → 15m)
2. Add hysteresis (different thresholds for firing/resolving)
3. Use rate/increase functions to smooth metric

**Issue 5: Too Many Alerts**

**Symptoms:**
- Alert storm (dozens of alerts simultaneously)
- Unable to respond to all alerts

**Diagnosis:**
```bash
# Count firing alerts
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts | length'

# Group by alertname
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts | group_by(.labels.alertname) | map({name: .[0].labels.alertname, count: length})'
```

**Resolution:**
1. Identify root cause alert (highest severity)
2. Silence derivative alerts
3. Configure inhibition rules
4. Fix underlying infrastructure issue

---

## Appendix

### Alert Configuration Files

**Location:** `/mnt/wsl/.../monitoring/`

- `prometheus-rules.yml` - All alert definitions
- `alertmanager-config.yml` - Routing and receivers
- `prometheus.yml` - Scrape configs and alerting endpoint

### Useful Commands

```bash
# Reload Prometheus configuration
curl -X POST http://localhost:9090/-/reload

# Reload Alertmanager configuration
curl -X POST http://localhost:9093/-/reload

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Query active alerts
curl http://localhost:9090/api/v1/alerts

# Send test alert
curl -X POST http://localhost:9093/api/v1/alerts -d '[{"labels":{"alertname":"test"}}]'

# List silences
amtool silence query --alertmanager.url=http://localhost:9093
```

### Related Documentation

- [MONITORING_GUIDE.md](MONITORING_GUIDE.md) - Complete monitoring setup
- [ON_CALL_PROCEDURES.md](ON_CALL_PROCEDURES.md) - On-call responsibilities
- [Runbooks](runbooks/) - Incident response procedures
- [Prometheus Docs](https://prometheus.io/docs/alerting/latest/overview/)
- [Alertmanager Docs](https://prometheus.io/docs/alerting/latest/alertmanager/)

---

**Questions or Feedback:**
Contact SRE team or post in #cfn-monitoring

**Document Updates:**
Submit PR to update this guide
