# Resource Quota Configuration Guide

**Purpose:** Enterprise resource quota management for per-team Trigger.dev deployments.

**Version:** 1.0.0
**Status:** Phase 5 - Enterprise Multi-Team Architecture
**Last Updated:** 2025-11-24

---

## Table of Contents

1. [Quota Architecture](#quota-architecture)
2. [Team Quota Profiles](#team-quota-profiles)
3. [Per-Container Limits](#per-container-limits)
4. [Enforcement Mechanisms](#enforcement-mechanisms)
5. [Quota Monitoring](#quota-monitoring)
6. [Configuration Examples](#configuration-examples)
7. [Troubleshooting](#troubleshooting)

---

## Quota Architecture

### Three-Level Quota System

```
Level 1: Team Quotas (aggregate limits)
├── Max concurrent containers
├── Max total CPU allocation
├── Max total memory allocation
├── Max daily API token budget
└── Max daily cost budget

Level 2: Per-Container Limits (enforcement at spawn)
├── Max CPU per container
├── Max memory per container
├── Max disk per container
├── CPU shares (fair scheduling)
└── Memory reservation (guaranteed)

Level 3: Dynamic Scaling (runtime adjustments)
├── Horizontal scaling policies
├── Vertical scaling (cpu/memory adjustment)
├── Auto-termination on quota exceed
└── Cost-based throttling
```

### Quota Enforcement Flow

```
Agent spawn request
  ↓
Check team concurrent quota (current < max)
  ↓
Check team CPU quota (current + container_cpu < max)
  ↓
Check team memory quota (current + container_mem < max)
  ↓
Check daily cost budget (projected_cost < daily_budget)
  ↓
Apply per-container limits (--cpus, --memory flags)
  ↓
Container starts with quotas enforced
  ↓
Monitor runtime usage
  ↓
Stop container if quota exceeded
```

---

## Team Quota Profiles

### Profile Definition

Each team has a quota profile that defines:

```yaml
team:
  name: "<team-name>"
  cost_center: "<CC-NNN>"
  budget:
    monthly_budget: <dollars>
    daily_budget: <dollars>
    alert_threshold: 0.80  # Alert at 80% of budget

  concurrency:
    max_concurrent_agents: <number>
    max_concurrent_per_type: <number>
    queue_policy: "FIFO|priority|fair"

  resources:
    total_cpu: <cores>
    total_memory: <GB>
    total_disk: <GB>
    total_gpu: <count>

  per_container:
    max_cpu: <cores>
    max_memory: <GB>
    max_disk: <GB>
    min_cpu: <cores>
    min_memory: <MB>

  api_tokens:
    daily_limit: <number>
    alert_threshold: 0.80

  auto_scaling:
    enabled: true|false
    scale_up_threshold: 0.80     # CPU/memory utilization
    scale_down_threshold: 0.20
    scale_cooldown: 60            # seconds

  auto_termination:
    enabled: true|false
    idle_timeout: 3600            # seconds
    cost_limit_timeout: 300       # stop if cost spike detected
```

---

## Team Quota Profiles (Examples)

### Engineering Team (Recommended)

**Use case:** High-performance development, parallel agents, diverse workloads

```yaml
team:
  name: engineering
  cost_center: ENG-001

  budget:
    monthly_budget: 2000
    daily_budget: 100
    alert_threshold: 0.80

  concurrency:
    max_concurrent_agents: 16
    max_concurrent_per_type: 4
    queue_policy: priority

  resources:
    total_cpu: 32
    total_memory: 128
    total_disk: 1000
    total_gpu: 2

  per_container:
    max_cpu: 4
    max_memory: 16
    max_disk: 100
    min_cpu: 0.5
    min_memory: 256

  api_tokens:
    daily_limit: 100_000_000  # 100M tokens/day
    alert_threshold: 0.80

  auto_scaling:
    enabled: true
    scale_up_threshold: 0.80
    scale_down_threshold: 0.20
    scale_cooldown: 60

  auto_termination:
    enabled: true
    idle_timeout: 3600
    cost_limit_timeout: 300

  agent_allocations:
    backend-developer: { max: 4, cpu: 2, memory: 8 }
    frontend-engineer: { max: 4, cpu: 2, memory: 8 }
    tester:           { max: 2, cpu: 1, memory: 4 }
    code-reviewer:    { max: 2, cpu: 1, memory: 4 }
    product-owner:    { max: 1, cpu: 1, memory: 2 }
```

### Marketing Team (Cost-Conscious)

**Use case:** Content generation, lower computational demands, cost-optimized

```yaml
team:
  name: marketing
  cost_center: MKT-002

  budget:
    monthly_budget: 500
    daily_budget: 25
    alert_threshold: 0.75

  concurrency:
    max_concurrent_agents: 4
    max_concurrent_per_type: 2
    queue_policy: FIFO

  resources:
    total_cpu: 8
    total_memory: 32
    total_disk: 200
    total_gpu: 0

  per_container:
    max_cpu: 2
    max_memory: 8
    max_disk: 50
    min_cpu: 0.25
    min_memory: 128

  api_tokens:
    daily_limit: 50_000_000  # 50M tokens/day
    alert_threshold: 0.75

  auto_scaling:
    enabled: true
    scale_up_threshold: 0.75
    scale_down_threshold: 0.30
    scale_cooldown: 120

  auto_termination:
    enabled: true
    idle_timeout: 1800
    cost_limit_timeout: 180

  agent_allocations:
    content-creator:  { max: 2, cpu: 1, memory: 4 }
    seo-optimizer:    { max: 1, cpu: 1, memory: 4 }
    social-manager:   { max: 1, cpu: 0.5, memory: 2 }
```

### Data Team (High-Performance)

**Use case:** ML training, ETL pipelines, GPU-accelerated workloads

```yaml
team:
  name: data
  cost_center: DATA-003

  budget:
    monthly_budget: 5000
    daily_budget: 200
    alert_threshold: 0.85

  concurrency:
    max_concurrent_agents: 24
    max_concurrent_per_type: 6
    queue_policy: priority

  resources:
    total_cpu: 64
    total_memory: 256
    total_disk: 2000
    total_gpu: 8

  per_container:
    max_cpu: 8
    max_memory: 32
    max_disk: 200
    min_cpu: 1
    min_memory: 512

  api_tokens:
    daily_limit: 500_000_000  # 500M tokens/day
    alert_threshold: 0.85

  auto_scaling:
    enabled: true
    scale_up_threshold: 0.85
    scale_down_threshold: 0.25
    scale_cooldown: 30

  auto_termination:
    enabled: true
    idle_timeout: 7200
    cost_limit_timeout: 600

  agent_allocations:
    ml-engineer:      { max: 4, cpu: 4, memory: 16 }
    etl-engineer:     { max: 4, cpu: 4, memory: 16 }
    data-analyst:     { max: 2, cpu: 2, memory: 8 }
    ml-validator:     { max: 2, cpu: 2, memory: 8 }
    product-owner:    { max: 1, cpu: 1, memory: 2 }

  gpu_allocation:
    ml-engineer:      2  # 2 GPUs max per container
    etl-engineer:     0  # CPU-only
    data-analyst:     0
```

---

## Per-Container Limits

### Docker Run with Resource Limits

**Standard container spawn:**
```bash
docker run --rm \
  --name "cfn-agent-<team>-<agent-type>-<id>" \
  --network "trigger-<team>" \
  \
  # CPU and Memory Limits
  --cpus=<max_cpu> \
  --cpuset-cpus=<cpu-cores> \
  --memory=<max_memory> \
  --memory-swap=<max_memory> \
  --memory-reservation=<min_memory> \
  \
  # Storage Limits
  --storage-opt size=<max_disk> \
  \
  # Process Limits
  --ulimit nofile=1024:2048 \
  --ulimit nproc=512:1024 \
  --ulimit msgqueue=819200 \
  \
  # Network Limits (optional)
  --rate=<bandwidth-limit> \
  \
  # Labels for cost tracking
  --label team=<team> \
  --label cost-center=<cost-center> \
  --label project=<project> \
  --label agent-type=<agent-type> \
  \
  cfn-agent-<team>:<agent-type>
```

### Example: Engineering Backend Developer

```bash
docker run --rm \
  --name "cfn-agent-engineering-backend-dev-uuid" \
  --network "trigger-engineering" \
  \
  # Limits from ENG-001 profile
  --cpus=2 \
  --cpuset-cpus=0-1 \
  --memory=8g \
  --memory-swap=8g \
  --memory-reservation=4g \
  \
  --storage-opt size=100g \
  --ulimit nofile=1024:2048 \
  --ulimit nproc=512:1024 \
  \
  --label team=engineering \
  --label cost-center=ENG-001 \
  --label project=auth-service \
  --label agent-type=backend-developer \
  --label environment=prod \
  --label spawn-time="2025-11-24T14:30:00Z" \
  \
  cfn-agent-engineering:backend-developer
```

### Resource Limits Reference

**CPU Allocation:**
```
--cpus=2            # Max 2 CPU cores
--cpuset-cpus=0-1   # Pin to specific cores (avoid context switching)
--cpu-shares=1024   # Fair scheduling weight (default)
```

**Memory Allocation:**
```
--memory=8g         # Hard limit (out-of-memory kill)
--memory-swap=8g    # No swap (same as --memory prevents swap)
--memory-reservation=4g  # Soft limit (guaranteed minimum)
--oom-kill-disable  # Prevent OOM kill (use with caution)
```

**Storage Limits:**
```
--storage-opt size=100g  # Device mapper limit (requires driver)
-v /workspace:/workspace:ro  # Read-only for safety
```

**Process Limits:**
```
--ulimit nofile=1024:2048   # File descriptor limit
--ulimit nproc=512:1024     # Process count limit
--ulimit msgqueue=819200    # Message queue size
--pids-limit=256            # Container PID limit
```

---

## Enforcement Mechanisms

### 1. Pre-Spawn Validation

**Check quotas before spawning:**

```bash
#!/bin/bash
# validate-quotas.sh

TEAM=$1
AGENT_TYPE=$2
CPU=$3
MEMORY=$4

# Load team quota profile
source "config/quota-profiles/$TEAM.yaml"

# Get current team usage
current_containers=$(docker ps --filter "label=team=$TEAM" --quiet | wc -l)
current_cpu=$(docker stats --no-stream --filter "label=team=$TEAM" \
  --format "{{.CPUPerc}}" | sed 's/%//' | awk '{s+=$1} END {print s}')
current_memory=$(docker stats --no-stream --filter "label=team=$TEAM" \
  --format "{{.MemUsage}}" | awk '{s+=$1} END {print s}')

# Check concurrent limit
if [ "$current_containers" -ge "$max_concurrent" ]; then
  echo "ERROR: Team $TEAM at concurrent limit ($current_containers/$max_concurrent)"
  return 1
fi

# Check CPU quota
if (( $(echo "$current_cpu + $CPU > $total_cpu" | bc -l) )); then
  echo "ERROR: Team $TEAM exceeds CPU quota (have: $current_cpu, need: $CPU, max: $total_cpu)"
  return 1
fi

# Check memory quota
if (( $(echo "$current_memory + $MEMORY > $total_memory" | bc -l) )); then
  echo "ERROR: Team $TEAM exceeds memory quota"
  return 1
fi

echo "SUCCESS: Quotas validated for $TEAM agent spawn"
return 0
```

### 2. Runtime Quota Enforcement

**Monitor and enforce during execution:**

```bash
#!/bin/bash
# enforce-quotas.sh - Run in background monitoring agent containers

TEAM=$1
CHECK_INTERVAL=10
TERMINATION_THRESHOLD=120  # seconds over limit

while true; do
  docker stats --no-stream --filter "label=team=$TEAM" | while read line; do
    [ -z "$line" ] && continue

    container=$(echo "$line" | awk '{print $1}')
    cpu_usage=$(echo "$line" | awk '{print $2}' | sed 's/%//')
    mem_usage=$(echo "$line" | awk '{print $3}' | sed 's/[GMK]iB//')

    # Get container limits
    limits=$(docker inspect "$container" --format '{{json .HostConfig}}')
    max_cpu=$(echo "$limits" | jq '.CpuPeriod / .CpuQuota')
    max_mem=$(echo "$limits" | jq '.Memory / 1048576')

    # Check if exceeding limit
    if (( $(echo "$cpu_usage > $max_cpu * 1.1" | bc -l) )); then
      echo "WARN: Container $container exceeding CPU limit by 10%"
      # Could implement throttling here
    fi

    if (( $(echo "$mem_usage > $max_mem" | bc -l) )); then
      echo "ERROR: Container $container exceeds memory limit - terminating"
      docker stop "$container"
    fi
  done

  sleep "$CHECK_INTERVAL"
done
```

### 3. Cost-Based Quota

**Halt container if daily cost budget exceeded:**

```bash
#!/bin/bash
# enforce-cost-quota.sh

TEAM=$1
DAILY_BUDGET=$2

while true; do
  # Calculate today's total cost
  daily_cost=$(.../cost-allocation-tracker.sh daily-report today | grep "Total cost:" | awk '{print $NF}' | sed 's/\$//')

  if (( $(echo "$daily_cost > $DAILY_BUDGET" | bc -l) )); then
    echo "ALERT: Team $TEAM exceeded daily budget (\$$daily_cost > \$$DAILY_BUDGET)"

    # Stop all new containers for this team
    docker ps --filter "label=team=$TEAM" --filter "status=created" -q | xargs -r docker stop

    # Send alert
    send_slack_alert "Team $TEAM has exceeded daily budget: \$$daily_cost"
    send_email_alert "Team Lead" "Daily budget exceeded for $TEAM"

    # Don't check again for 1 hour (prevent spam)
    sleep 3600
  fi

  sleep 60
done
```

---

## Quota Monitoring

### Real-Time Dashboard

**Monitor team quotas in real-time:**

```bash
#!/bin/bash
# quota-monitor.sh - Real-time quota dashboard

TEAM=$1
REFRESH=5

while true; do
  clear
  echo "=== Quota Monitor: $TEAM ==="
  echo "Time: $(date)"
  echo ""

  # Load quota profile
  source "config/quota-profiles/$TEAM.yaml"

  # Current usage
  container_count=$(docker ps --filter "label=team=$TEAM" -q | wc -l)
  total_cpu=$(docker stats --no-stream --filter "label=team=$TEAM" \
    --format "{{.CPUPerc}}" | sed 's/%//' | awk '{s+=$1} END {print s}')
  total_mem=$(docker stats --no-stream --filter "label=team=$TEAM" \
    --format "{{.MemUsage}}" | awk '{gsub(/[GMK]iB/,""); s+=$1} END {print s}')

  # Daily cost
  daily_cost=$(.../cost-allocation-tracker.sh daily-report today | grep "Total cost:" | awk '{print $NF}')

  echo "CONCURRENCY:"
  printf "  Containers: %d / %d (%.1f%%)\n" \
    "$container_count" "$max_concurrent" \
    "$(echo "scale=1; $container_count / $max_concurrent * 100" | bc)"

  echo ""
  echo "CPU:"
  printf "  Used: %.1f / %d cores (%.1f%%)\n" \
    "$total_cpu" "$total_cpu_cores" \
    "$(echo "scale=1; $total_cpu / $total_cpu_cores * 100" | bc)"

  echo ""
  echo "MEMORY:"
  printf "  Used: %.1f / %d GB (%.1f%%)\n" \
    "$total_mem" "$total_memory" \
    "$(echo "scale=1; $total_mem / $total_memory * 100" | bc)"

  echo ""
  echo "BUDGET:"
  printf "  Daily: %s / \$%d (%.1f%%)\n" \
    "$daily_cost" "$daily_budget" \
    "$(echo "$daily_cost" | sed 's/\$//' | awk -v b="$daily_budget" '{print $0 / b * 100}')"

  echo ""
  echo "Container Details:"
  docker ps --filter "label=team=$TEAM" \
    --format "table {{.Names}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.Label \"agent-type\"}}"

  sleep "$REFRESH"
done
```

### Daily Quota Report

**Generate daily quota utilization report:**

```bash
#!/bin/bash
# daily-quota-report.sh

TEAM=$1
DATE=${2:-$(date +%Y-%m-%d)}

source "config/quota-profiles/$TEAM.yaml"

echo "Daily Quota Report: $TEAM - $DATE"
echo "====================================="
echo ""

# Query from database (requires historical tracking)
psql -h postgres.company.com -U analytics -d metrics <<SQL
SELECT
  team,
  DATE(timestamp) as date,
  MAX(container_count) as peak_containers,
  ROUND(MAX(total_cpu)::numeric, 2) as peak_cpu,
  ROUND(MAX(total_memory)::numeric, 2) as peak_memory,
  ROUND(SUM(daily_cost)::numeric, 2) as total_cost,
  ROUND(100.0 * MAX(total_cpu) / $total_cpu_cores, 1) as peak_cpu_percent,
  ROUND(100.0 * MAX(total_memory) / $total_memory, 1) as peak_mem_percent
FROM team_quotas
WHERE team = '$TEAM'
  AND DATE(timestamp) = '$DATE'
GROUP BY team, DATE(timestamp)
SQL

echo ""
echo "Budget Status:"
echo "Daily budget: \$$daily_budget"
echo "Alert threshold: $(echo "scale=0; $daily_budget * 0.80" | bc)%"
```

---

## Configuration Examples

### Applying Quota Profile to Team

**Template for new team deployment:**

```bash
#!/bin/bash
# deploy-team-with-quotas.sh

TEAM_NAME=$1
PROFILE=$2  # engineering, marketing, data

# Load profile
source "config/quota-profiles/$PROFILE.yaml"

# Create quota configuration file
cat > "config/teams/$TEAM_NAME-quotas.json" <<EOF
{
  "team": "$TEAM_NAME",
  "budget": {
    "monthly": $monthly_budget,
    "daily": $daily_budget,
    "alert_threshold": $alert_threshold
  },
  "resources": {
    "total_cpu": $total_cpu,
    "total_memory": $total_memory,
    "total_disk": $total_disk
  },
  "per_container": {
    "max_cpu": $max_cpu,
    "max_memory": $max_memory,
    "max_disk": $max_disk
  },
  "auto_scaling": {
    "enabled": true,
    "scale_up_threshold": 0.8,
    "scale_down_threshold": 0.2
  }
}
EOF

# Create monitoring job
docker-compose -p "trigger-$TEAM_NAME" exec -T trigger-worker \
  /scripts/enforce-quotas.sh "$TEAM_NAME" "$daily_budget"

echo "Team quotas configured: $TEAM_NAME (profile: $PROFILE)"
```

### Dynamic Quota Adjustment

**Adjust quotas for team based on usage patterns:**

```bash
#!/bin/bash
# adjust-quotas.sh - Dynamic quota management

TEAM=$1
adjustment=${2:-10}  # Percentage increase

source "config/quota-profiles/$TEAM.yaml"

# Read current quota config
config_file="config/teams/$TEAM-quotas.json"
current_budget=$(jq '.budget.daily' "$config_file")
current_cpu=$(jq '.resources.total_cpu' "$config_file")

# Calculate new values
new_budget=$(echo "scale=2; $current_budget * (1 + $adjustment / 100)" | bc)
new_cpu=$(echo "scale=0; $current_cpu * (1 + $adjustment / 100)" | bc)

# Validate increase doesn't exceed infrastructure limits
if [ "$new_budget" -gt "$infrastructure_daily_budget" ]; then
  echo "ERROR: Requested budget exceeds infrastructure limit"
  exit 1
fi

# Update quota configuration
jq ".budget.daily = $new_budget" "$config_file" > "$config_file.tmp"
mv "$config_file.tmp" "$config_file"

jq ".resources.total_cpu = $new_cpu" "$config_file" > "$config_file.tmp"
mv "$config_file.tmp" "$config_file"

# Log change
echo "Quota adjusted for $TEAM: budget $current_budget -> $new_budget, CPU $current_cpu -> $new_cpu" >> /var/log/quota-adjustments.log

echo "Quotas updated: $TEAM"
echo "Daily budget: \$$current_budget -> \$$new_budget"
echo "Total CPU: $current_cpu -> $new_cpu cores"
```

---

## Troubleshooting

### Containers Immediately Killed (OOM)

**Symptom:** Container exits with code 137 (SIGKILL)

**Diagnosis:**
```bash
docker logs <container-id> | tail -20
docker inspect <container-id> --format '{{.State}}'
dmesg | grep "Out of memory"
```

**Resolution:**
1. Increase memory limit:
   ```bash
   docker update --memory 16g <container-id>
   ```
2. Check if agent code has memory leak
3. Reduce concurrent containers

### Quota Check Blocking Spawns

**Symptom:** Agent spawns rejected even with available resources

**Diagnosis:**
```bash
./quota-monitor.sh <team> | head -20
```

**Resolution:**
1. Check for "ghost" containers (exited but not cleaned):
   ```bash
   docker ps -a --filter "label=team=<team>" --filter "status=exited"
   ```
2. Clean up exited containers:
   ```bash
   docker container prune --filter "label=team=<team>"
   ```

### Cost Quota Consistently Exceeded

**Symptom:** Team regularly hits daily budget limit

**Resolution:**
1. Analyze cost breakdown:
   ```bash
   ./cost-allocation-tracker.sh by-agent <team>
   ```
2. Identify expensive agent types and optimize
3. Request budget increase with usage data
4. Consider off-peak scheduling

---

**Last Updated:** 2025-11-24
**Status:** Phase 5 Complete - Ready for Enterprise Deployment
