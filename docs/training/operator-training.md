# CFN Platform Operator Training

**Course Duration:** 2 days (16 hours)
**Target Audience:** Operations team, SREs, on-call engineers
**Prerequisites:** Basic Docker, Linux command line, monitoring concepts
**Last Updated:** 2025-11-24

---

## Table of Contents

### Day 1: System Architecture & Monitoring
1. [CFN Platform Overview](#day-1-morning-cfn-platform-overview) (2 hours)
2. [Monitoring Stack Deep Dive](#day-1-late-morning-monitoring-stack-deep-dive) (2 hours)
3. [Hands-On: Grafana Dashboards](#day-1-afternoon-hands-on-grafana-dashboards) (2 hours)
4. [Alert Response Basics](#day-1-late-afternoon-alert-response-basics) (2 hours)

### Day 2: Incident Response & Operations
5. [Runbook Walkthrough](#day-2-morning-runbook-walkthrough) (2 hours)
6. [Hands-On: Incident Simulation](#day-2-late-morning-hands-on-incident-simulation) (2 hours)
7. [Operational Procedures](#day-2-afternoon-operational-procedures) (2 hours)
8. [Final Assessment & Q&A](#day-2-late-afternoon-final-assessment--qa) (2 hours)

---

## Day 1: System Architecture & Monitoring

### Day 1 Morning: CFN Platform Overview

**Duration:** 2 hours (9:00 AM - 11:00 AM)

#### Learning Objectives
- Understand CFN Loop architecture and workflow
- Identify key system components and their interactions
- Explain agent lifecycle and coordination patterns
- Describe data flow through the system

#### Module Content

**1.1 - What is CFN? (20 minutes)**

CFN (Claude Flow Novice) is an AI agent orchestration platform that:
- Spawns specialized AI agents for development tasks
- Coordinates multi-agent workflows (CFN Loops)
- Tracks agent performance and costs
- Provides self-validating development loops

**Key Terminology:**
- **Agent:** AI-powered specialist (backend-dev, tester, validator)
- **CFN Loop:** 3-phase workflow (Loop 3 → Loop 2 → Product Owner)
- **Coordinator:** Manages loop progression and iterations
- **Orchestrator:** Spawns and monitors agents
- **Coordination Layer:** Redis-based agent communication

**1.2 - System Architecture (30 minutes)**

```
┌─────────────┐
│  Main Chat  │ ← User interaction
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│   Coordinator   │ ← CFN Loop management
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│  Orchestrator    │ ← Agent lifecycle
└────────┬─────────┘
         │
         ▼
┌─────────────────────────┐
│  Agents (Containers)    │ ← Specialized AI workers
└─────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Coordination Layer      │
│  (Redis)                 │
└──────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Persistence Layer       │
│  (PostgreSQL)            │
└──────────────────────────┘
```

**Core Components:**
1. **Docker Engine:** Container runtime for all services
2. **Redis:** Coordination signals and task queuing
3. **PostgreSQL:** Task metadata and agent lifecycle data
4. **Prometheus:** Metrics collection and alerting
5. **Grafana:** Visualization and dashboards
6. **Alertmanager:** Alert routing to PagerDuty/Slack

**1.3 - CFN Loop Workflow (30 minutes)**

**Phase 1: Loop 3 (Implementation)**
- Coordinator spawns implementer agents (backend-dev, frontend-dev, etc.)
- Agents complete work and execute tests
- Test results determine gate pass/fail
- **Gate Check:** Pass rate ≥95% (Standard mode) → proceed to Loop 2

**Phase 2: Loop 2 (Validation)**
- Coordinator spawns validator agents after gate passes
- Validators review Loop 3 work and score quality
- Consensus calculated from validator scores
- **Consensus:** Average score ≥0.90 (Standard mode) → proceed to Product Owner

**Phase 3: Product Owner Decision**
- Coordinator spawns product-owner agent
- Product Owner reviews all work and makes decision
- **Decision:**
  - PROCEED: Task complete
  - ITERATE: Wake all agents for another iteration
  - ABORT: Task failed, exit

**1.4 - Agent Lifecycle (20 minutes)**

```
Spawn → Running → Complete → Cleanup
  ↓        ↓         ↓          ↓
 DB     Logs      Signal    Container
Record  Write     Redis      Removed
```

**Lifecycle States:**
1. **Spawning:** Container creation, context injection
2. **Running:** Agent executes task, logs output
3. **Signaling:** Agent sends completion signal via Redis
4. **Completed:** Database updated, confidence/test results recorded
5. **Cleanup:** Container stopped and removed

**1.5 - Hands-On Exercise (20 minutes)**

**Task:** Trace a simple CFN Loop workflow

1. Start monitoring:
   ```bash
   watch -n 5 'docker ps | grep cfn'
   ```

2. Execute simple task:
   ```bash
   /cfn-loop-cli "Create hello-world.txt file with greeting"
   ```

3. Observe:
   - Coordinator spawn
   - Loop 3 agent spawns
   - Loop 2 validator spawns
   - Product Owner spawn
   - Container lifecycle

4. Review results:
   ```bash
   # Check task status
   docker exec cfn-postgres psql -U cfn_user -d cfn -c "SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1;"

   # Check agent records
   docker exec cfn-postgres psql -U cfn_user -d cfn -c "SELECT id, agent_type, status, confidence FROM agents ORDER BY spawned_at DESC LIMIT 10;"
   ```

---

### Day 1 Late Morning: Monitoring Stack Deep Dive

**Duration:** 2 hours (11:00 AM - 1:00 PM)

#### Learning Objectives
- Navigate Prometheus and Grafana interfaces
- Understand key metrics and their meanings
- Query metrics using PromQL
- Interpret dashboard visualizations

#### Module Content

**2.1 - Prometheus Fundamentals (30 minutes)**

**What is Prometheus?**
- Time-series database for metrics
- Pull-based metric collection (scraping)
- Powerful query language (PromQL)
- Built-in alerting

**Key Concepts:**
- **Metric:** Named measurement (e.g., `agent_spawn_total`)
- **Labels:** Dimensions (e.g., `{agent_type="backend-dev", status="success"}`)
- **Scrape:** Prometheus pulls metrics from targets
- **Target:** Service exposing metrics (e.g., orchestrator:9090)

**Hands-On: Exploring Prometheus**

1. Open Prometheus UI: http://localhost:9090

2. View targets:
   - Click "Status" → "Targets"
   - Verify all targets UP (green)
   - If DOWN, troubleshoot connectivity

3. Execute basic queries:
   ```promql
   # Total agent spawns
   agent_spawn_total

   # Spawn rate per minute
   rate(agent_spawn_total[5m])

   # Failure rate
   rate(agent_spawn_failures_total[5m]) / rate(agent_spawn_total[5m])

   # Current running agents
   agent_running_count
   ```

**2.2 - PromQL Query Language (30 minutes)**

**Basic Queries:**
```promql
# Instant vector (current value)
agent_spawn_total

# Range vector (values over time)
agent_spawn_total[5m]

# Rate (per-second rate)
rate(agent_spawn_total[5m])

# Aggregation
sum(rate(agent_spawn_total[5m])) by (agent_type)
```

**Advanced Queries:**
```promql
# P95 latency
histogram_quantile(0.95, rate(agent_duration_seconds_bucket[5m]))

# Error rate percentage
(rate(agent_spawn_failures_total[5m]) / rate(agent_spawn_total[5m])) * 100

# Cost per team per hour
rate(cost_per_team_dollars[1h]) * 3600
```

**Hands-On Exercise:**
1. Query total agent spawns in last hour
2. Calculate spawn failure rate
3. Find slowest agent type (P95 duration)
4. Identify most expensive team (cost/hour)

**2.3 - Grafana Dashboards (40 minutes)**

**What is Grafana?**
- Visualization platform for metrics
- Connects to Prometheus as data source
- Pre-built dashboards for CFN platform
- Alerting and annotation capabilities

**CFN Platform Dashboards:**

1. **Agent Performance Dashboard** (http://localhost:3000/d/agent-performance)
   - Agent Lifecycle: Spawn rate, running count, completion time
   - Resource Usage: CPU, memory, network per agent
   - Quality Metrics: Success rate, confidence scores, test pass rates

2. **Team Activity Dashboard** (http://localhost:3000/d/team-activity)
   - Team Utilization: Agents per team, task completion rates
   - Coordination Health: Signal delivery time, stuck task count
   - Sprint Progress: Loop iterations, consensus trends

3. **Cost Allocation Dashboard** (http://localhost:3000/d/cost-allocation)
   - Cost by Team: Hourly/daily/monthly costs
   - Cost by Provider: Z.ai vs Anthropic usage
   - Cost Trends: Forecasting and budget tracking

4. **System Resources Dashboard** (http://localhost:3000/d/system-resources)
   - Compute: CPU, memory, disk, network
   - Docker: Container count, image size, volume usage
   - Database: PostgreSQL/Redis connection count, query time

**Hands-On Exercise:**
1. Navigate each dashboard
2. Identify which panels answer these questions:
   - How many agents are currently running?
   - What's the average agent spawn time?
   - Which team is spending the most?
   - Is disk space running low?
3. Set time range to "Last 24 hours"
4. Refresh dashboards and observe real-time updates

**2.4 - Understanding Metrics (20 minutes)**

**Key Metrics Reference:**

| Metric | Type | Description | Healthy Value |
|--------|------|-------------|---------------|
| `agent_spawn_total` | Counter | Total agent spawns | Increasing |
| `agent_spawn_failures_total` | Counter | Failed spawns | <10% of total |
| `agent_running_count` | Gauge | Currently running agents | <50 |
| `agent_duration_seconds` | Histogram | Agent runtime | P95 <300s |
| `cost_per_team_dollars` | Counter | Team spend | <$10/hour |
| `redis_up` | Gauge | Redis availability | 1 (UP) |
| `postgres_up` | Gauge | PostgreSQL availability | 1 (UP) |
| `disk_usage_percent` | Gauge | Disk utilization | <80% |

---

### Day 1 Afternoon: Hands-On Grafana Dashboards

**Duration:** 2 hours (2:00 PM - 4:00 PM)

#### Learning Objectives
- Create custom Grafana dashboard panels
- Build PromQL queries for visualization
- Configure alerts in Grafana
- Export and share dashboards

#### Module Content

**3.1 - Dashboard Basics (30 minutes)**

**Exercise: Create Your First Dashboard**

1. Create new dashboard:
   - Click "+" → "Dashboard"
   - Click "Add new panel"

2. Configure panel:
   - **Data Source:** Prometheus
   - **Query:** `agent_running_count`
   - **Visualization:** Stat
   - **Title:** "Currently Running Agents"

3. Customize appearance:
   - **Unit:** "short"
   - **Thresholds:** Green <10, Yellow <30, Red ≥30
   - **Options:** Show sparkline

4. Save panel and dashboard

**3.2 - Advanced Visualizations (40 minutes)**

**Exercise: Build Team Cost Dashboard**

Create 4 panels:

**Panel 1: Cost by Team (Time Series)**
```promql
rate(cost_per_team_dollars[1h]) * 3600
```
- Visualization: Time series
- Legend: `{{team}}`
- Unit: currency (USD)

**Panel 2: Total Cost (Stat)**
```promql
sum(rate(cost_per_team_dollars[1h])) * 3600
```
- Visualization: Stat
- Title: "Cost Per Hour (All Teams)"
- Thresholds: Green <$50, Yellow <$100, Red ≥$100

**Panel 3: Cost by Provider (Pie Chart)**
```promql
sum by (provider) (rate(cost_per_team_dollars[24h]))
```
- Visualization: Pie chart
- Legend: Provider names
- Values: Percentage

**Panel 4: Top 5 Expensive Teams (Bar Gauge)**
```promql
topk(5, sum by (team) (rate(cost_per_team_dollars[24h])))
```
- Visualization: Bar gauge
- Orientation: Horizontal
- Show values: Always

**3.3 - Dashboard Variables (30 minutes)**

**Exercise: Add Team Filter**

1. Dashboard Settings → Variables → Add variable
   - **Name:** team
   - **Type:** Query
   - **Data Source:** Prometheus
   - **Query:** `label_values(agent_spawn_total, team)`

2. Use variable in queries:
   ```promql
   agent_spawn_total{team="$team"}
   ```

3. Multi-select enabled: Allow "All" option

4. Test: Filter dashboard by different teams

**3.4 - Dashboard Alerts (20 minutes)**

**Exercise: Create Alert for High Agent Count**

1. Edit "Currently Running Agents" panel
2. Click "Alert" tab
3. Configure alert:
   - **Condition:** WHEN last() OF query(agent_running_count) IS ABOVE 50
   - **Evaluate:** Every 1m for 5m
   - **Send to:** cfn-alerts channel

4. Test alert: Manually trigger by simulating high load

---

### Day 1 Late Afternoon: Alert Response Basics

**Duration:** 2 hours (4:00 PM - 6:00 PM)

#### Learning Objectives
- Understand alert severity levels
- Follow alert response workflow
- Use runbooks effectively
- Practice basic troubleshooting

#### Module Content

**4.1 - Alert Severity & Response Times (20 minutes)**

**Severity Matrix:**

| Severity | Response Time | Escalation | Example |
|----------|---------------|------------|---------|
| P0 | 5 minutes | 30 minutes | Docker daemon down |
| P1 | 15 minutes | 2 hours | High spawn failure rate |
| P2 | 30 minutes | 4 hours | Disk space warning |
| P3 | 24 hours | N/A | Certificate expiring |

**Response SLAs:**
- P0: Acknowledge in 5 min, respond immediately
- P1: Acknowledge in 15 min, investigate within 30 min
- P2: Acknowledge in 30 min, resolve in 4 hours
- P3: Acknowledge in 24 hours

**4.2 - Alert Response Workflow (30 minutes)**

**Step 1: Receive Alert**
- PagerDuty page (P0/P1) or Slack notification (P2/P3)
- Acknowledge in PagerDuty to stop escalation timer

**Step 2: Assess Severity**
- Check Grafana dashboards for context
- Determine user impact (customer-facing?)
- Verify severity classification correct

**Step 3: Initial Communication**
- Post in #cfn-incidents (P0/P1 only)
- Template: "Investigating [Alert Name] - [Brief Description]"

**Step 4: Follow Runbook**
- Locate runbook for alert type
- Execute diagnosis steps
- Apply mitigation procedures
- Document all actions

**Step 5: Resolution**
- Verify fix restores normal operation
- Monitor for 15 minutes to confirm stability
- Update #cfn-incidents with resolution
- Clear alert in PagerDuty

**Step 6: Post-Incident**
- Create incident ticket
- Write post-incident review (P0/P1)
- Update runbook if procedures changed

**Hands-On Exercise:**
- Walk through sample alert response
- Practice using runbook steps
- Document response in mock incident ticket

**4.3 - Runbook Navigation (40 minutes)**

**Available Runbooks:**

1. [agent-spawn-failure.md](../runbooks/agent-spawn-failure.md)
2. [redis-connection-loss.md](../runbooks/redis-connection-loss.md)
3. [postgres-connection-loss.md](../runbooks/postgres-connection-loss.md)
4. [docker-daemon-unavailable.md](../runbooks/docker-daemon-unavailable.md)
5. [disk-space-exhaustion.md](../runbooks/disk-space-exhaustion.md)
6. [high-cost-per-team.md](../runbooks/high-cost-per-team.md)
7. [cfn-loop-stuck.md](../runbooks/cfn-loop-stuck.md)
8. [certificate-expiration.md](../runbooks/certificate-expiration.md)
9. [memory-exhaustion.md](../runbooks/memory-exhaustion.md)
10. [backup-failure.md](../runbooks/backup-failure.md)

**Runbook Structure:**
- **Alert Information:** Severity, threshold, notification channels
- **Symptoms:** What you observe
- **Diagnosis:** Step-by-step investigation
- **Resolution:** Immediate actions + complete fix
- **Verification:** Checklist to confirm fix
- **Prevention:** How to avoid recurrence

**Hands-On Exercise:**

**Scenario 1: Redis Connection Loss Alert**

1. Open runbook: `redis-connection-loss.md`
2. Follow diagnosis steps:
   ```bash
   docker ps -a | grep redis
   docker logs cfn-redis --tail 100
   redis-cli PING
   ```
3. Simulated finding: Redis container stopped
4. Follow resolution:
   ```bash
   docker start cfn-redis
   docker logs cfn-redis --tail 20
   redis-cli PING  # Verify PONG
   ```
5. Complete verification checklist
6. Discuss prevention measures

**Scenario 2: High Disk Usage Alert**

1. Open runbook: `disk-space-exhaustion.md`
2. Follow diagnosis:
   ```bash
   df -h
   docker system df
   du -sh /var/lib/docker/containers/*/*-json.log | sort -rh | head -10
   ```
3. Simulated finding: Container logs consuming 20GB
4. Follow resolution:
   ```bash
   truncate -s 0 /var/lib/docker/containers/*/*-json.log
   docker system prune -af
   df -h  # Verify space freed
   ```
5. Implement prevention (log rotation configuration)

**4.4 - Basic Troubleshooting Commands (30 minutes)**

**Quick Reference Card:**

```bash
# System Health
docker ps                              # Running containers
docker stats --no-stream              # Resource usage
free -h                               # Memory
df -h                                 # Disk space

# Service Health
redis-cli PING                        # Redis connectivity
docker exec cfn-postgres pg_isready  # PostgreSQL connectivity
docker logs <container> --tail 100   # Recent logs

# Monitoring
curl http://localhost:9090/alerts    # Active alerts
curl http://localhost:9090/targets   # Prometheus targets

# Common Fixes
docker restart <container>           # Restart service
docker system prune -af             # Clean Docker resources
redis-cli KEYS "spawn:lock:*" | xargs redis-cli DEL  # Clear locks
```

**Practice Exercise:**
- Instructor simulates 3 common issues
- Students troubleshoot using commands
- Students document findings and resolution steps

---

## Day 2: Incident Response & Operations

### Day 2 Morning: Runbook Walkthrough

**Duration:** 2 hours (9:00 AM - 11:00 AM)

#### Learning Objectives
- Execute runbooks for all P0/P1 alerts
- Practice root cause analysis
- Document incident findings
- Understand escalation procedures

#### Module Content

**5.1 - P0 Alert Walkthroughs (60 minutes)**

**Exercise 1: Docker Daemon Unavailable (20 min)**

**Scenario:** Alert fires - Docker daemon unresponsive

1. **Diagnosis:**
   ```bash
   systemctl status docker
   docker ps  # Times out
   ```
   Finding: Docker daemon crashed

2. **Resolution:**
   ```bash
   sudo systemctl restart docker
   sleep 10
   docker ps  # Verify working
   ```

3. **Verification:**
   - All containers running
   - Prometheus alert cleared
   - Services responding normally

4. **Discussion:**
   - What caused daemon crash? (Check logs)
   - How to prevent? (Resource limits, monitoring)
   - When to escalate? (If restart doesn't work)

**Exercise 2: Redis Connection Loss (20 min)**

[Similar walkthrough structure]

**Exercise 3: PostgreSQL Connection Loss (20 min)**

[Similar walkthrough structure]

**5.2 - P1 Alert Walkthroughs (50 minutes)**

**Exercise 4: High Agent Spawn Failure Rate (15 min)**
**Exercise 5: CFN Loop Stuck (15 min)**
**Exercise 6: Memory Exhaustion (20 min)**

[Each following same walkthrough structure]

**5.3 - Group Discussion (10 minutes)**
- Common patterns across incidents
- Dependencies between components
- Most effective troubleshooting techniques

---

### Day 2 Late Morning: Hands-On Incident Simulation

**Duration:** 2 hours (11:00 AM - 1:00 PM)

#### Learning Objectives
- Respond to simulated incidents independently
- Practice communication protocols
- Work under time pressure
- Demonstrate competency in runbook execution

#### Module Content

**6.1 - Simulation Setup (15 minutes)**

**Simulation Environment:**
- Isolated test environment (not production!)
- Instructor can trigger failures remotely
- Students respond as if real incident
- Time limits enforced per severity

**Communication Channels:**
- #cfn-incidents-training (Slack)
- Mock PagerDuty
- Instructor observes and evaluates

**6.2 - Simulation Scenarios (90 minutes)**

**Scenario 1: Disk Space Crisis (P1 - 30 min)**

**Trigger:** Instructor fills disk to 95%

**Expected Response:**
1. Student receives alert
2. Acknowledges in <15 minutes
3. Posts in #cfn-incidents-training
4. Follows disk-space-exhaustion runbook
5. Frees space using docker prune
6. Verifies resolution
7. Posts resolution message

**Evaluation Criteria:**
- Response time (<15 min)
- Runbook adherence
- Communication frequency
- Verification thoroughness

**Scenario 2: Agent Spawn Failure Storm (P1 - 30 min)**

[Similar structure]

**Scenario 3: Cascading Failure (P0 - 30 min)**

**Trigger:** Docker daemon crash → Redis down → PostgreSQL inaccessible

**Expected Response:**
1. Identify root cause (Docker daemon) from symptoms
2. Restart Docker daemon first
3. Verify Redis and PostgreSQL recover automatically
4. Escalate if needed (30 min threshold)
5. Document cascade in incident report

**6.3 - Debrief & Feedback (15 minutes)**
- Review each scenario
- Discuss what went well
- Identify improvement areas
- Share best practices

---

### Day 2 Afternoon: Operational Procedures

**Duration:** 2 hours (2:00 PM - 4:00 PM)

#### Learning Objectives
- Execute routine operational tasks
- Perform maintenance procedures
- Configure monitoring and alerts
- Manage backups and disaster recovery

#### Module Content

**7.1 - Routine Maintenance (30 minutes)**

**Daily Tasks:**
```bash
# Check system health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Size}}"
df -h
free -h

# Review overnight alerts
curl http://localhost:9090/alerts

# Check backup status
ls -lh /backups/postgres/ | tail -5
ls -lh /backups/redis/ | tail -5
```

**Weekly Tasks:**
```bash
# Clean Docker resources
docker system prune -af

# Review cost trends
# (Open Grafana Cost Allocation dashboard)

# Update documentation
# Review and update runbooks with any new findings
```

**Monthly Tasks:**
- Review and tune alert thresholds
- Capacity planning review
- Security updates (Docker images, packages)
- Test disaster recovery procedures

**7.2 - Backup & Restore (40 minutes)**

**Backup Procedures:**

**PostgreSQL Backup:**
```bash
# Manual backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
docker exec cfn-postgres pg_dump -U cfn_user -d cfn | \
  gzip > /backups/postgres/cfn-${TIMESTAMP}.sql.gz

# Verify backup
ls -lh /backups/postgres/cfn-${TIMESTAMP}.sql.gz
gunzip -t /backups/postgres/cfn-${TIMESTAMP}.sql.gz
```

**Redis Backup:**
```bash
# Trigger background save
docker exec cfn-redis redis-cli BGSAVE

# Wait for completion
docker exec cfn-redis redis-cli LASTSAVE

# Copy RDB file
docker cp cfn-redis:/data/dump.rdb /backups/redis/dump-${TIMESTAMP}.rdb
```

**Restore Procedures:**

**PostgreSQL Restore:**
```bash
# Stop applications using database
docker stop cfn-coordinator cfn-orchestrator

# Drop and recreate database
docker exec cfn-postgres psql -U postgres -c "DROP DATABASE cfn;"
docker exec cfn-postgres psql -U postgres -c "CREATE DATABASE cfn OWNER cfn_user;"

# Restore from backup
gunzip -c /backups/postgres/cfn-latest.sql.gz | \
  docker exec -i cfn-postgres psql -U cfn_user -d cfn

# Restart applications
docker start cfn-coordinator cfn-orchestrator
```

**Hands-On Exercise:**
1. Create manual backup
2. Verify backup integrity
3. Restore to test database
4. Confirm data restored correctly

**7.3 - Alert Configuration (30 minutes)**

**Adding New Alert:**

1. Edit `monitoring/prometheus-rules.yml`:
```yaml
- alert: NewAlert
  expr: metric_name > threshold
  for: duration
  labels:
    severity: P1
  annotations:
    summary: "Brief description"
    description: "Detailed description"
```

2. Validate syntax:
```bash
promtool check rules monitoring/prometheus-rules.yml
```

3. Reload Prometheus:
```bash
curl -X POST http://localhost:9090/-/reload
```

4. Test alert fires:
```bash
# Trigger condition artificially
# Wait for alert to fire
curl http://localhost:9090/alerts | grep NewAlert
```

**Hands-On Exercise:**
- Add alert for container restart loop
- Validate and reload configuration
- Trigger alert condition
- Verify alert in Prometheus and Slack

**7.4 - Maintenance Windows (20 minutes)**

**Procedure for Planned Maintenance:**

1. **Pre-Maintenance (24 hours before):**
   ```bash
   # Announce in Slack
   # Post in #cfn-announcements

   # Create silence in Alertmanager
   amtool silence add component="cfn-platform" \
     --duration=4h \
     --author="ops-team" \
     --comment="Maintenance: PostgreSQL upgrade - MAINT-123"
   ```

2. **During Maintenance:**
   ```bash
   # Follow maintenance plan
   # Document all changes
   # Test thoroughly before restoring service
   ```

3. **Post-Maintenance:**
   ```bash
   # Remove silence
   amtool silence expire <silence-id>

   # Verify all services healthy
   docker ps
   curl http://localhost:9090/targets

   # Announce completion
   # Post in #cfn-announcements
   ```

---

### Day 2 Late Afternoon: Final Assessment & Q&A

**Duration:** 2 hours (4:00 PM - 6:00 PM)

#### Learning Objectives
- Demonstrate operational competency
- Pass certification assessment
- Clarify remaining questions
- Plan for first on-call shift

#### Module Content

**8.1 - Written Assessment (30 minutes)**

**Knowledge Check (20 questions):**

1. What is the response time SLA for P0 incidents?
2. Where are runbooks located?
3. What command checks Redis connectivity?
4. What is the disk usage threshold for P1 alert?
5. How do you acknowledge a PagerDuty alert?
6. What are the 3 phases of a CFN Loop?
7. What severity requires immediate escalation to manager?
8. How do you silence an alert in Alertmanager?
9. What port does Prometheus run on?
10. What command frees Docker disk space?
11. How often should backups run?
12. What's the agent memory limit threshold (P1)?
13. How do you restart Redis container?
14. What channel do incident updates go in?
15. What tool visualizes metrics?
16. How long to monitor after resolving P0?
17. What database stores agent lifecycle data?
18. How do you verify a backup's integrity?
19. When should you escalate to secondary on-call?
20. What command shows currently running agents?

**Passing Score:** 16/20 (80%)

**8.2 - Practical Assessment (60 minutes)**

**Hands-On Scenarios:**

**Scenario 1: Alert Response (20 min)**
- Instructor triggers alert
- Student must respond following procedures
- Evaluated on time, communication, resolution

**Scenario 2: Troubleshooting (20 min)**
- Student given symptoms (no alert)
- Must diagnose and fix issue independently
- Evaluated on methodology and effectiveness

**Scenario 3: Operational Task (20 min)**
- Perform backup and verify
- Configure new alert
- Execute maintenance window procedure

**8.3 - Q&A Session (20 minutes)**

**Open Forum:**
- Students ask clarifying questions
- Review challenging topics
- Share additional resources
- Discuss real-world scenarios

**Common Questions:**
- How to handle multiple simultaneous alerts?
- When to wake up manager at night?
- What if runbook doesn't work?
- How to improve response time?

**8.4 - Certification & Next Steps (10 minutes)**

**Certification Requirements:**
- ✓ Attended full 2-day training
- ✓ Passed written assessment (≥80%)
- ✓ Passed practical assessment
- ✓ Completed all hands-on exercises

**Certificate Issued:** CFN Platform Operator (Level 1)

**Next Steps:**
1. Shadow experienced on-call for 1 week
2. Paired on-call shift (with mentor)
3. First solo on-call shift
4. Continued learning and improvement

**Resources:**
- Bookmark all runbooks
- Join #cfn-oncall Slack channel
- Install PagerDuty mobile app
- Set up monitoring dashboards

---

## Appendix

### Pre-Training Checklist

**Trainee Preparation (1 week before):**
- [ ] Access granted to all systems
- [ ] PagerDuty account created
- [ ] Laptop configured with VPN and SSH keys
- [ ] Read MONITORING_GUIDE.md (overview)
- [ ] Familiarize with Docker and Linux basics

**Instructor Preparation:**
- [ ] Training environment provisioned
- [ ] Simulation scenarios tested
- [ ] Assessment materials ready
- [ ] Certificates prepared

### Training Materials

**Provided to Trainees:**
- Training slides (PDF)
- Quick reference card (laminated)
- Runbook index (printed)
- Assessment study guide

**Online Resources:**
- Full documentation: `/mnt/wsl/.../docs/`
- Runbooks: `/mnt/wsl/.../docs/runbooks/`
- Internal wiki: https://wiki.company.com/cfn

### Post-Training Support

**Mentorship Program:**
- 2-week pairing with senior operator
- Weekly 1:1 with manager
- Monthly training refreshers

**Continuous Learning:**
- Quarterly advanced training
- Weekly on-call retrospectives
- Access to incident reviews

---

**Training Feedback:**
Complete feedback survey: [internal-link]

**Questions:**
Contact training coordinator: training@company.com
