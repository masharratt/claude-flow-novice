# Cost Tracking and Resource Management Guide

**Purpose:** Enterprise multi-team cost tracking, resource allocation, and billing for Trigger.dev per-agent container architecture.

**Version:** 1.0.0
**Status:** Phase 5 - Enterprise Multi-Team Architecture
**Last Updated:** 2025-11-24

---

## Table of Contents

1. [Overview](#overview)
2. [Label Schema](#label-schema)
3. [Cost Tracking System](#cost-tracking-system)
4. [Resource Quotas](#resource-quotas)
5. [Cost Query Examples](#cost-query-examples)
6. [Resource Monitoring](#resource-monitoring)
7. [Billing Integration](#billing-integration)
8. [Cost Optimization](#cost-optimization)

---

## Overview

### Cost Tracking Architecture

The cost tracking system uses Docker container labels to tag all spawned agent containers with cost metadata, enabling:

- **Per-team cost allocation** - Track spending by engineering, marketing, data teams
- **Per-agent-type costs** - Backend, frontend, tester, validator costs separately
- **Per-project attribution** - Bill individual projects within teams
- **Resource utilization tracking** - CPU, memory, disk, GPU usage per container
- **Automated billing reports** - Generate cost summaries for finance/chargeback

### Multi-Team Deployment Model

```
Company Infrastructure (Shared or Dedicated)
├── Engineering Team (Cost Center: ENG-001)
│   ├── trigger-eng.company.com
│   │   └── Spawns: cfn-agent-eng:backend, cfn-agent-eng:frontend
│   ├── Resource Pool: 32 CPU, 128GB RAM
│   └── Monthly Budget: $50,000
│
├── Marketing Team (Cost Center: MKT-002)
│   ├── trigger-mkt.company.com
│   │   └── Spawns: cfn-agent-mkt:content, cfn-agent-mkt:seo
│   ├── Resource Pool: 16 CPU, 64GB RAM
│   └── Monthly Budget: $20,000
│
└── Data Team (Cost Center: DATA-003)
    ├── trigger-data.company.com
    │   └── Spawns: cfn-agent-data:etl, cfn-agent-data:ml
    ├── Resource Pool: 64 CPU, 256GB RAM
    └── Monthly Budget: $100,000
```

### Cost Tracking Flow

```
Agent Container Spawning
  ↓
Docker Labels Applied (team, cost-center, project, agent-type)
  ↓
Container Runs (CPU, memory, disk usage tracked by Docker)
  ↓
Cost Collection Script Queries Docker Stats
  ↓
Cost Allocation Algorithm Calculates Per-Team/Per-Project Costs
  ↓
Billing Integration Exports to Finance System
  ↓
Finance Dashboard Shows Monthly Costs by Team/Project
```

---

## Label Schema

### Required Labels

All agent containers MUST be tagged with these labels:

```bash
docker run \
  --label team=<team-name> \
  --label cost-center=<cost-center-id> \
  --label project=<project-name> \
  --label agent-type=<backend|frontend|tester|validator|product-owner> \
  --label environment=<dev|staging|prod> \
  --label spawn-time=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  cfn-agent:<team>:<agent-type>
```

### Label Reference

| Label | Required | Format | Example | Purpose |
|-------|----------|--------|---------|---------|
| `team` | ✅ | alphanumeric, lowercase | `engineering`, `marketing`, `data` | Team ownership for cost allocation |
| `cost-center` | ✅ | ABBR-NNN format | `ENG-001`, `MKT-002`, `DATA-003` | Finance cost center code |
| `project` | ✅ | kebab-case | `auth-service`, `homepage-redesign`, `ml-pipeline` | Project within team |
| `agent-type` | ✅ | lowercase, hyphenated | `backend-developer`, `frontend-engineer`, `code-reviewer` | Agent specialization |
| `environment` | ✅ | dev\|staging\|prod | `prod` | Deployment environment |
| `spawn-time` | ✅ | ISO 8601 UTC | `2025-11-24T14:30:00Z` | Container creation time |
| `iteration` | ❌ | numeric | `1`, `2`, `3` | CFN Loop iteration number |
| `task-id` | ❌ | UUID | `550e8400-e29b-41d4-a716-446655440000` | Unique task identifier |
| `provider` | ❌ | provider name | `zai`, `kimi`, `openrouter`, `max` | AI provider used |

### Label Examples

**Backend Developer (Engineering Team, Production)**
```bash
docker run \
  --label team=engineering \
  --label cost-center=ENG-001 \
  --label project=auth-service \
  --label agent-type=backend-developer \
  --label environment=prod \
  --label spawn-time=2025-11-24T14:30:00Z \
  --label task-id=550e8400-e29b-41d4-a716-446655440000 \
  --label iteration=1 \
  cfn-agent-eng:backend-developer
```

**Frontend Engineer (Engineering Team, Development)**
```bash
docker run \
  --label team=engineering \
  --label cost-center=ENG-001 \
  --label project=homepage-redesign \
  --label agent-type=frontend-engineer \
  --label environment=dev \
  --label spawn-time=2025-11-24T15:00:00Z \
  --label task-id=660e8400-e29b-41d4-a716-446655440001 \
  cfn-agent-eng:frontend-engineer
```

**Content Creator (Marketing Team, Production)**
```bash
docker run \
  --label team=marketing \
  --label cost-center=MKT-002 \
  --label project=campaign-2025 \
  --label agent-type=content-creator \
  --label environment=prod \
  --label spawn-time=2025-11-24T16:00:00Z \
  cfn-agent-mkt:content-creator
```

**ML Engineer (Data Team, Staging)**
```bash
docker run \
  --label team=data \
  --label cost-center=DATA-003 \
  --label project=ml-pipeline \
  --label agent-type=ml-engineer \
  --label environment=staging \
  --label spawn-time=2025-11-24T17:00:00Z \
  --label task-id=770e8400-e29b-41d4-a716-446655440002 \
  --label provider=zai \
  cfn-agent-data:ml-engineer
```

---

## Cost Tracking System

### Container Lifecycle Tracking

Each container's lifecycle generates cost data:

1. **Container Created**: Label applied with team, project, cost-center
2. **Container Running**: Docker tracks CPU%, memory usage in real-time
3. **Container Stopped**: Exit time and total duration recorded
4. **Cost Calculated**: CPU-minutes, memory-GB-hours computed from metrics

### Resource Metrics Tracked

```
Per Container:
├── CPU Usage (%)
│   └── cpu-time (milliseconds) - billable metric
├── Memory Usage (%)
│   └── memory-peak (MB) - billable metric
├── Disk Usage (MB)
│   └── disk-written (MB) - billable metric
├── Network (MB)
│   └── network-io (MB) - billable metric
├── Runtime Duration
│   └── execution-time (seconds) - billable metric
└── AI Provider API Calls
    └── api-tokens (count) - from stderr/logs - billable metric
```

### Cost Calculation Formula

**Base Container Cost:**
```
container_cost = (cpu_minutes * $0.05) + (memory_gb_hours * $0.10) + (disk_gb * $0.01)

Example:
- Agent runs for 10 minutes using 2 CPU, 4GB RAM, 100MB disk
- CPU cost: 20 CPU-minutes * $0.05 = $1.00
- Memory cost: (4GB * 10min / 60) * $0.10 = $0.067
- Disk cost: 0.1GB * $0.01 = $0.001
- Total: ~$1.07
```

**AI Provider API Cost:**
```
api_cost = tokens_used * provider_rate

Providers:
- Z.ai (glm-4.6): $0.50 per 1M tokens
- Kimi: $2.00 per 1M tokens
- OpenRouter (varies): $0.30-$15.00 per 1M tokens
- Anthropic (Claude): $15.00 per 1M tokens
```

**Total Agent Cost:**
```
total_agent_cost = container_cost + api_cost
```

---

## Resource Quotas

### Team Resource Limits

Resource quotas prevent any team from monopolizing infrastructure:

**Engineering Team** (32 CPU, 128GB RAM limit)
```yaml
team: engineering
cost_center: ENG-001
quotas:
  max_concurrent_agents: 16
  max_cpu_per_agent: 4
  max_memory_per_agent: 16Gi
  max_disk_per_agent: 100Gi
  max_daily_api_tokens: 100_000_000
  max_daily_cost: $500
```

**Marketing Team** (16 CPU, 64GB RAM limit)
```yaml
team: marketing
cost_center: MKT-002
quotas:
  max_concurrent_agents: 8
  max_cpu_per_agent: 2
  max_memory_per_agent: 8Gi
  max_disk_per_agent: 50Gi
  max_daily_api_tokens: 50_000_000
  max_daily_cost: $200
```

**Data Team** (64 CPU, 256GB RAM limit)
```yaml
team: data
cost_center: DATA-003
quotas:
  max_concurrent_agents: 32
  max_cpu_per_agent: 8
  max_memory_per_agent: 32Gi
  max_disk_per_agent: 200Gi
  max_daily_api_tokens: 500_000_000
  max_daily_cost: $1000
```

### Resource Limit Enforcement

**Docker Run with Quotas:**
```bash
docker run \
  --cpus=2 \                            # Max 2 CPU cores
  --memory=4g \                         # Max 4GB RAM
  --memory-swap=4g \                    # Prevent swap usage
  --disk-quota=50g \                    # Max 50GB disk (if supported)
  --ulimit nofile=1024:2048 \           # File descriptor limits
  --ulimit nproc=512:1024 \             # Process count limits
  cfn-agent-eng:backend
```

### Quota Monitoring

Monitor quota usage via cost tracking scripts (see below).

---

## Cost Query Examples

### Query 1: Total Cost by Team (Last 24 Hours)

```bash
#!/bin/bash
# Cost by team (running + stopped containers)

teams=("engineering" "marketing" "data")

for team in "${teams[@]}"; do
  total_cost=$(docker stats --no-stream \
    --format "{{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
    --filter "label=team=$team" | awk '{
      gsub(/%/, "", $2)
      gsub(/MiB/, "", $3)
      gsub(/GiB/, "", $3)
      # Assume running 1 hour per container
      cpu_cost = $2 * 60 * 0.05 / 100
      mem_mb = $3 * 1024
      mem_cost = (mem_mb / 1024 / 1024) * 0.10
      cost = cpu_cost + mem_cost
      print cost
    }' | awk '{sum+=$1} END {print sum}')

  echo "$team: \$$total_cost"
done
```

### Query 2: Cost Breakdown by Agent Type (Engineering Team)

```bash
#!/bin/bash
# Cost by agent type within team

docker stats --no-stream \
  --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.Label \"agent-type\"}}" \
  --filter "label=team=engineering" | \
  awk '
    NR > 1 {
      gsub(/%/, "", $2)
      agent_type = $4
      cpu_cost = $2 * 60 * 0.05 / 100
      costs[agent_type] += cpu_cost
    }
    END {
      for (agent in costs) {
        printf "%s: $%.2f\n", agent, costs[agent]
      }
    }'
```

### Query 3: Cost by Project (Marketing Team)

```bash
#!/bin/bash
# Cost breakdown by project

docker stats --no-stream \
  --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.Label \"project\"}}" \
  --filter "label=team=marketing" | \
  awk '
    NR > 1 {
      gsub(/%/, "", $2)
      project = $4
      cpu_cost = $2 * 60 * 0.05 / 100
      costs[project] += cpu_cost
    }
    END {
      for (project in costs) {
        printf "%s: $%.2f\n", project, costs[project]
      }
    }'
```

### Query 4: High-Cost Containers (Cost Anomaly Detection)

```bash
#!/bin/bash
# Identify expensive running containers (sorted by cost)

docker stats --no-stream \
  --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.Label \"team\"}}\t{{.Label \"project\"}}" | \
  awk '
    NR > 1 {
      gsub(/%/, "", $2)
      gsub(/MiB/, "", $3)
      container = $1
      team = $4
      project = $5

      # Assume 1 hour runtime
      cpu_cost = $2 * 60 * 0.05 / 100
      mem_mb = $3
      mem_cost = (mem_mb / 1024) * 0.10
      total = cpu_cost + mem_cost

      printf "$%.2f\t%s\t%s\t%s\n", total, container, team, project
    }' | \
  sort -rn | head -20
```

### Query 5: Cost Trend (Daily for Last 7 Days)

```bash
#!/bin/bash
# Cost trend analysis (requires historical data in logs)

# This requires Docker events logging or external metrics
# See "Resource Monitoring" section for implementation

echo "Date,Team,Cost"
for day in {0..6}; do
  date_str=$(date -u -d "$day days ago" +%Y-%m-%d)
  # Query from logs or metrics database
  # Example: SELECT SUM(cost) FROM container_costs WHERE date = '$date_str'
done
```

### Query 6: Over-Budget Alerts

```bash
#!/bin/bash
# Alert if team exceeds daily budget

teams_budgets=(
  "engineering:500"
  "marketing:200"
  "data:1000"
)

for item in "${teams_budgets[@]}"; do
  team="${item%:*}"
  budget="${item##*:}"

  daily_cost=$(calculate_daily_cost "$team")

  if (( $(echo "$daily_cost > $budget" | bc -l) )); then
    echo "ALERT: $team exceeded budget! Cost: \$$daily_cost, Budget: \$$budget"
    # Send to Slack, PagerDuty, etc.
  fi
done
```

---

## Resource Monitoring

### Real-Time Resource Monitoring

**Monitor All Containers (Per Team):**
```bash
#!/bin/bash
# monitor-resources.sh - Real-time resource usage dashboard

team=$1
interval=${2:-5}  # 5 second refresh

while true; do
  clear
  echo "=== Resource Usage for Team: $team ==="
  echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo

  docker stats --no-stream \
    --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.Label \"project\"}}" \
    --filter "label=team=$team" | \
    column -t

  sleep $interval
done
```

**Usage:**
```bash
./monitor-resources.sh engineering 5
./monitor-resources.sh marketing 10
./monitor-resources.sh data 5
```

### Metrics Collection (Prometheus Integration)

**Export Docker metrics for Prometheus:**
```bash
#!/bin/bash
# collect-metrics.sh - Export Docker metrics to Prometheus

# This example uses cAdvisor (container metrics collector)
# For production, use: https://github.com/prometheus/cAdvisor

docker run -d \
  --name cadvisor \
  --volume /:/rootfs:ro \
  --volume /var/run:/var/run:ro \
  --volume /sys:/sys:ro \
  --volume /var/lib/docker/:/var/lib/docker:ro \
  --publish 8080:8080 \
  gcr.io/cadvisor/cadvisor:latest

# Metrics available at: http://localhost:8080/metrics
```

### Historical Cost Data Storage

**Store cost snapshots in a database:**

```sql
-- Table: container_costs
CREATE TABLE container_costs (
  id UUID PRIMARY KEY,
  container_id VARCHAR(64),
  team VARCHAR(50),
  cost_center VARCHAR(20),
  project VARCHAR(100),
  agent_type VARCHAR(50),
  cpu_percent FLOAT,
  memory_mb FLOAT,
  duration_seconds INT,
  cpu_cost FLOAT,
  memory_cost FLOAT,
  total_cost FLOAT,
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient querying
CREATE INDEX idx_team_date ON container_costs(team, timestamp);
CREATE INDEX idx_project_date ON container_costs(project, timestamp);
CREATE INDEX idx_costcenter_date ON container_costs(cost_center, timestamp);
```

**Sample queries:**
```sql
-- Daily cost by team
SELECT
  team,
  DATE(timestamp) as date,
  SUM(total_cost) as daily_cost
FROM container_costs
WHERE DATE(timestamp) >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY team, DATE(timestamp)
ORDER BY date DESC;

-- Monthly cost by project
SELECT
  project,
  YEAR_MONTH(timestamp) as month,
  SUM(total_cost) as monthly_cost
FROM container_costs
WHERE YEAR_MONTH(timestamp) = DATE_FORMAT(NOW(), '%Y%m')
GROUP BY project
ORDER BY monthly_cost DESC;

-- Cost anomalies (containers > $10)
SELECT
  container_id,
  team,
  project,
  total_cost,
  timestamp
FROM container_costs
WHERE total_cost > 10.00
ORDER BY total_cost DESC;
```

---

## Billing Integration

### Export Cost Data to Finance System

**Integration with billing systems:**

```bash
#!/bin/bash
# export-costs.sh - Export to billing system

date_from=${1:-$(date -u -d '1 day ago' +%Y-%m-%d)}
date_to=${2:-$(date -u +%Y-%m-%d)}

# Query database or metrics
costs=$(psql -h localhost -U billing -d costs_db -t -c "
  SELECT
    team,
    cost_center,
    project,
    SUM(total_cost) as total_cost,
    COUNT(*) as container_count
  FROM container_costs
  WHERE DATE(timestamp) >= '$date_from'
    AND DATE(timestamp) < '$date_to'
  GROUP BY team, cost_center, project
")

# Format as CSV
echo "Team,CostCenter,Project,TotalCost,ContainerCount"
echo "$costs" | awk -F'|' '{
  gsub(/^ +| +$/, "")
  printf "%s,%s,%s,%.2f,%d\n", $1, $2, $3, $4, $5
}' > costs-$date_from-to-$date_to.csv

# Upload to finance system
curl -X POST https://finance-api.company.com/costs \
  -H "Authorization: Bearer $FINANCE_API_KEY" \
  -F "file=@costs-$date_from-to-$date_to.csv"

echo "Costs exported: costs-$date_from-to-$date_to.csv"
```

### Billing Report Generation

**Monthly team billing report:**

```bash
#!/bin/bash
# generate-billing-report.sh

month=${1:-$(date -u +%Y-%m)}

teams=("engineering" "marketing" "data")

report_file="billing-report-$month.html"

cat > "$report_file" <<'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>Monthly Billing Report - $month</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
    th { background-color: #4CAF50; color: white; }
    .total { font-weight: bold; }
    .project-cost { text-align: left; color: #333; }
  </style>
</head>
<body>
  <h1>Monthly Billing Report - $month</h1>
EOF

total_company_cost=0

for team in "${teams[@]}"; do
  echo "<h2>$team</h2>" >> "$report_file"
  echo "<table>" >> "$report_file"
  echo "<tr><th>Project</th><th>Cost</th></tr>" >> "$report_file"

  # Query costs for team
  team_cost=$(psql -h localhost -U billing -d costs_db -t -c "
    SELECT SUM(total_cost)
    FROM container_costs
    WHERE team = '$team'
      AND YEAR_MONTH(timestamp) = '$month'
  ")

  total_company_cost=$(echo "$total_company_cost + $team_cost" | bc)

  echo "<tr class=\"total\"><td>TOTAL</td><td>\$$team_cost</td></tr>" >> "$report_file"
  echo "</table>" >> "$report_file"
done

echo "<h2>Company Total</h2>" >> "$report_file"
echo "<p><strong>\$$total_company_cost</strong></p>" >> "$report_file"
echo "</body></html>" >> "$report_file"

echo "Report generated: $report_file"
```

---

## Cost Optimization

### Recommendations for Cost Reduction

**1. Agent Resource Optimization**

Analyze which agents use excessive resources:

```bash
#!/bin/bash
# Find inefficient agents

docker stats --no-stream \
  --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.Label \"agent-type\"}}" | \
  awk '
    NR > 1 {
      gsub(/%/, "", $2)
      gsub(/MiB/, "", $3)
      gsub(/GiB/, "", $3)

      agent = $4
      cpu = $2
      mem = $3

      # Identify high-resource agents
      if (cpu > 50 || mem > 2048) {
        printf "OPTIMIZE: %s uses CPU=%.1f%% MEM=%.0fMB\n", agent, cpu, mem
      }
    }'
```

**2. Reduce API Token Consumption**

- Use cheaper providers (Z.ai @ $0.50/1M vs Anthropic @ $15.00/1M)
- Implement token caching for repeated queries
- Use smaller models for validation agents
- Batch API calls to reduce overhead

**3. Time-Based Cost Optimization**

- Schedule heavy workloads during off-peak hours (if available)
- Use cheaper instances for dev/staging (vs production)
- Implement container timeout policies for runaway jobs

**4. Resource Right-Sizing**

Default allocations are conservative. Monitor actual usage and adjust:

```bash
# Current allocations (in Phase 5 plan)
backend-developer:   4 CPU, 16GB   # Likely over-provisioned
frontend-engineer:   4 CPU, 16GB   # May use < 50%
tester:             2 CPU, 8GB    # Reasonable
product-owner:      1 CPU, 2GB    # Conservative

# Optimized allocations (based on monitoring)
backend-developer:   2 CPU, 8GB    # 50% reduction, likely adequate
frontend-engineer:   2 CPU, 8GB    # Match backend
tester:             1 CPU, 4GB    # 50% reduction
product-owner:      1 CPU, 2GB    # Already optimal
```

**5. Container Image Optimization**

- Use Alpine Linux base images (< 10MB vs Ubuntu 80MB+)
- Remove unused dependencies
- Multi-stage Docker builds to reduce final size
- Cache heavily-used layers

Example optimization:

```dockerfile
# Before (400MB)
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    build-essential python3 nodejs npm git curl
COPY . /workspace
RUN npm install

# After (45MB)
FROM node:20-alpine
RUN apk add --no-cache bash python3 git
COPY . /workspace
RUN npm ci --only=production
```

**6. Quota-Based Cost Control**

Set aggressive quotas to prevent runaway spending:

```yaml
# Conservative quotas for MVP
engineering:
  daily_budget: $100    # Enforce halt at budget
  monthly_budget: $2000

marketing:
  daily_budget: $50
  monthly_budget: $1000

data:
  daily_budget: $300
  monthly_budget: $5000
```

---

## Troubleshooting

### Common Cost Issues

**Q: Container costs seem too high for its runtime**

A: Check for:
- Multiple containers with same label (verify docker ps)
- High CPU utilization (CPU-bound vs I/O-bound agent)
- Memory pressure (swapping, high memory-percent)
- Inefficient AI provider (use cheaper provider)

**Q: Cost tracking numbers don't match billing statement**

A: Verify:
- All containers labeled correctly (docker inspect)
- Cost calculation formula is consistent
- Historical data not lost (check database)
- Sync between Docker logs and billing system

**Q: Team quota exceeded unexpectedly**

A: Investigate:
- Concurrent container count (docker ps | wc -l)
- Long-running containers (ps aux | grep docker)
- Runaway process consuming CPU/memory (docker stats)
- Set alert threshold at 80% quota

---

## Appendix: Cost Calculation Reference

### Pricing Assumptions (Configurable)

```bash
# Infrastructure costs (per container per hour)
COST_CPU_PER_HOUR=0.05          # $0.05 per CPU-core per hour
COST_MEMORY_PER_GB_HOUR=0.10    # $0.10 per GB RAM per hour
COST_DISK_PER_GB=0.01          # $0.01 per GB disk (one-time)

# AI Provider costs (per 1M tokens)
COST_ZAI=0.50                  # Z.ai glm-4.6
COST_KIMI=2.00                 # Kimi
COST_OPENROUTER=1.00           # OpenRouter average
COST_ANTHROPIC=15.00           # Anthropic Claude
```

### Example Cost Calculations

**Scenario 1: Backend Developer (10 min, 2 CPU, 4GB)**
```
CPU cost:     2 × (10/60) × $0.05 = $0.0167
Memory cost:  4 × (10/60) × $0.10 = $0.0667
Total:        $0.0834

With 1M tokens (Z.ai): $0.0834 + $0.50 = $0.5834
```

**Scenario 2: Daily Data Team Job (1 hour, 8 CPU, 32GB, 500M tokens)**
```
CPU cost:     8 × 1 × $0.05 = $0.40
Memory cost:  32 × 1 × $0.10 = $3.20
API cost:     500M tokens × ($0.50/1M) = $0.25
Total daily:  $3.85
```

**Scenario 3: Monthly Engineering Team (2000 containers, avg $0.50 each)**
```
Monthly cost: 2000 × $0.50 = $1000
Budget:       $2000
Utilization:  50%
```

---

## Related Documentation

- **Trigger.dev Per-Agent Container Plan**: `planning/trigger/TRIGGER_DEV_PER_AGENT_CONTAINER_PLAN.md`
- **Team Deployment Playbook**: `docs/TEAM_DEPLOYMENT_PLAYBOOK.md` (see next section)
- **Resource Quota Configuration**: `docs/RESOURCE_QUOTA_CONFIG.md`
- **CFN Loop Architecture**: `docs/CFN_LOOP_ARCHITECTURE.md`

---

**Last Updated:** 2025-11-24
**Status:** Phase 5 Complete - Ready for Enterprise Deployment
