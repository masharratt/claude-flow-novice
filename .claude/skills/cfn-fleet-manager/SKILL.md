# Fleet Manager Skill

## Version
**Version:** 1.0.0
**Status:** OPERATIONAL

## Overview
Fleet Manager provides comprehensive resource allocation, tier-based resource management, performance monitoring, and load balancing for distributed agent swarms.

## Features
- Agent Registration with Resource Tiers
- Dynamic Resource Allocation
- Real-time Performance Metrics
- Intelligent Load Balancing
- Resource Quota Management
- Health Monitoring

## Resource Tiers

### Shared Tier (Default)
- **CPU:** 0.5 cores
- **Memory:** 512 MB
- **Use Case:** Lightweight tasks, research, documentation
- **Cost:** Minimal

### Dedicated Tier
- **CPU:** 2.0 cores
- **Memory:** 2048 MB
- **Use Case:** Backend development, testing, code analysis
- **Cost:** Standard

### Premium Tier
- **CPU:** 4.0 cores
- **Memory:** 4096 MB
- **Use Case:** CFN Loop validation, compilation, heavy processing
- **Cost:** Maximum

## Agent Integration Examples

### 1. Register Agent with Resource Tier

```bash
# Register agent with shared tier (default)
./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id "researcher-1" \
  --tier shared

# Register agent with dedicated tier
./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id "backend-dev-1" \
  --tier dedicated

# Register agent with premium tier
./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id "cfn-validator-1" \
  --tier premium
```

**Output:**
```json
{
  "status": "registered",
  "agentId": "backend-dev-1",
  "tier": "dedicated",
  "resources": {
    "cpu": 2.0,
    "memory": 2048
  },
  "timestamp": 1729332000
}
```

### 2. Allocate Resources to Agent

```bash
# Allocate custom resources
./.claude/skills/fleet-manager/invoke-fleet-allocate.sh \
  --agent-id "backend-dev-1" \
  --cpu 3.0 \
  --memory 3072

# Allocate with priority flag
./.claude/skills/fleet-manager/invoke-fleet-allocate.sh \
  --agent-id "cfn-validator-1" \
  --cpu 4.0 \
  --memory 4096 \
  --priority high
```

**Output:**
```json
{
  "status": "allocated",
  "agentId": "backend-dev-1",
  "allocated": {
    "cpu": 3.0,
    "memory": 3072
  },
  "availability": {
    "cpuRemaining": 5.0,
    "memoryRemaining": 4096
  },
  "timestamp": 1729332100
}
```

### 3. Get Performance Metrics

```bash
# Get metrics for specific agent
./.claude/skills/fleet-manager/invoke-fleet-metrics.sh \
  --agent-id "backend-dev-1"

# Get metrics with detailed breakdown
./.claude/skills/fleet-manager/invoke-fleet-metrics.sh \
  --agent-id "backend-dev-1" \
  --detailed

# Get fleet-wide metrics
./.claude/skills/fleet-manager/invoke-fleet-metrics.sh \
  --all
```

**Output:**
```json
{
  "agentId": "backend-dev-1",
  "metrics": {
    "cpuUsage": 2.4,
    "cpuUtilization": 0.80,
    "memoryUsage": 1800,
    "memoryUtilization": 0.88,
    "taskCompletionRate": 0.95,
    "averageResponseTime": 120
  },
  "health": "healthy",
  "timestamp": 1729332200
}
```

### 4. Trigger Load Balancing

```bash
# Balance resources across multiple agents
./.claude/skills/fleet-manager/invoke-fleet-balance.sh \
  --agents "backend-dev-1,backend-dev-2,backend-dev-3"

# Balance with strategy
./.claude/skills/fleet-manager/invoke-fleet-balance.sh \
  --agents "cfn-validator-1,cfn-validator-2" \
  --strategy round-robin

# Balance entire fleet
./.claude/skills/fleet-manager/invoke-fleet-balance.sh \
  --all
```

**Output:**
```json
{
  "status": "balanced",
  "strategy": "round-robin",
  "agents": [
    {
      "agentId": "backend-dev-1",
      "beforeLoad": 0.80,
      "afterLoad": 0.65,
      "adjustment": "reduced"
    },
    {
      "agentId": "backend-dev-2",
      "beforeLoad": 0.45,
      "afterLoad": 0.60,
      "adjustment": "increased"
    }
  ],
  "timestamp": 1729332300
}
```

## Integration Patterns

### Pattern 1: CFN Loop with Resource Management

```bash
# Register all CFN Loop agents with appropriate tiers
./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id "coder-1" --tier dedicated

./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id "reviewer-1" --tier dedicated

./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id "product-owner-1" --tier premium

# Monitor performance during loop
metrics=$(
  ./.claude/skills/fleet-manager/invoke-fleet-metrics.sh \
    --agent-id "coder-1"
)

# If CPU utilization high, trigger rebalancing
cpu_util=$(echo "$metrics" | jq '.metrics.cpuUtilization')
if (( $(echo "$cpu_util > 0.85" | bc -l) )); then
  ./.claude/skills/fleet-manager/invoke-fleet-balance.sh \
    --agents "coder-1,coder-2,coder-3"
fi
```

### Pattern 2: Dynamic Resource Scaling

```bash
# Start with shared tier
./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id "researcher-1" --tier shared

# If task complexity increases, allocate more resources
./.claude/skills/fleet-manager/invoke-fleet-allocate.sh \
  --agent-id "researcher-1" \
  --cpu 2.0 \
  --memory 2048

# Monitor and adjust
metrics=$(
  ./.claude/skills/fleet-manager/invoke-fleet-metrics.sh \
    --agent-id "researcher-1"
)

memory_util=$(echo "$metrics" | jq '.metrics.memoryUtilization')
if (( $(echo "$memory_util > 0.90" | bc -l) )); then
  ./.claude/skills/fleet-manager/invoke-fleet-allocate.sh \
    --agent-id "researcher-1" \
    --memory 4096 \
    --priority high
fi
```

### Pattern 3: Health-Based Resource Adjustment

```bash
# Check agent health
metrics=$(
  ./.claude/skills/fleet-manager/invoke-fleet-metrics.sh \
    --agent-id "backend-dev-1"
)

health=$(echo "$metrics" | jq -r '.health')

if [ "$health" = "degraded" ]; then
  # Reduce load on degraded agent
  ./.claude/skills/fleet-manager/invoke-fleet-balance.sh \
    --agents "backend-dev-1,backend-dev-2" \
    --strategy offload
fi
```

## Performance Characteristics

### Resource Allocation Latency
- Registration: <50ms
- Allocation: <100ms
- Metrics Retrieval: <30ms
- Load Balancing: <200ms

### Scalability
- Max Concurrent Agents: 100+
- Max Resource Pool: 400 cores, 400GB RAM
- Metrics Collection Rate: 1Hz per agent
- Balancing Frequency: On-demand or scheduled

### Resource Efficiency
- Shared Tier: 95% resource utilization
- Dedicated Tier: 85% resource utilization
- Premium Tier: 75% resource utilization (reserved headroom)

## Redis Key Structure

```
# Agent Registration
fleet:agent:{agentId}:registration -> {tier, cpu, memory, timestamp}

# Resource Allocation
fleet:agent:{agentId}:allocation -> {cpu, memory, priority, timestamp}

# Performance Metrics
fleet:agent:{agentId}:metrics -> {cpuUsage, memoryUsage, health, timestamp}

# Load Balancing State
fleet:balance:{balanceId}:state -> {agents, strategy, status, timestamp}

# Resource Pool
fleet:pool:available -> {totalCpu, totalMemory, allocated, reserved}
```

## Error Handling

### Common Errors

**Insufficient Resources:**
```json
{
  "error": "RESOURCE_UNAVAILABLE",
  "message": "Requested resources exceed available pool",
  "requested": {"cpu": 4.0, "memory": 4096},
  "available": {"cpu": 2.0, "memory": 2048}
}
```

**Agent Not Found:**
```json
{
  "error": "AGENT_NOT_FOUND",
  "message": "Agent backend-dev-1 not registered",
  "suggestion": "Register agent first using invoke-fleet-register.sh"
}
```

**Invalid Tier:**
```json
{
  "error": "INVALID_TIER",
  "message": "Tier 'ultra' not recognized",
  "validTiers": ["shared", "dedicated", "premium"]
}
```

## Best Practices

1. **Register Before Allocation:** Always register agents before allocating custom resources
2. **Monitor Regularly:** Check metrics at least once per iteration for long-running tasks
3. **Balance Proactively:** Trigger load balancing when fleet-wide utilization >70%
4. **Use Appropriate Tiers:** Match tier to task complexity to optimize cost
5. **Graceful Degradation:** Handle resource scarcity by queuing tasks or reducing quality

## Testing

Run comprehensive test suite:
```bash
./.claude/skills/fleet-manager/test-fleet-manager.sh
```

### Test Coverage
- Agent registration (all tiers)
- Resource allocation (standard and high-priority)
- Metrics collection (individual and fleet-wide)
- Load balancing (multiple strategies)
- Error handling (resource exhaustion, invalid inputs)
- Concurrency (parallel agent operations)

## Coordination with Other Skills

### Redis Coordination Integration
```bash
# Register CFN Loop agents with Fleet Manager
./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id "coder-1" --tier dedicated

# Start CFN Loop with orchestration
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "auth-system" \
  --loop3-agents "coder-1,coder-2" \
  --loop2-agents "reviewer-1" \
  --product-owner "product-owner-1"

# Monitor resource usage during loop
./.claude/skills/fleet-manager/invoke-fleet-metrics.sh \
  --agent-id "coder-1"
```

### Agent Spawning Integration
```bash
# Register agent in spawning script
./.claude/skills/fleet-manager/invoke-fleet-register.sh \
  --agent-id "$AGENT_ID" --tier dedicated

# Spawn agent with Task tool
# ... agent spawning logic ...

# Deallocate resources when agent completes
./.claude/skills/fleet-manager/invoke-fleet-allocate.sh \
  --agent-id "$AGENT_ID" --cpu 0 --memory 0
```

## Maintenance

### Daily Health Checks
```bash
# Check fleet-wide health
./.claude/skills/fleet-manager/invoke-fleet-metrics.sh --all | jq '.agents[] | select(.health != "healthy")'
```

### Weekly Resource Audits
```bash
# Identify underutilized agents
./.claude/skills/fleet-manager/invoke-fleet-metrics.sh --all | jq '.agents[] | select(.metrics.cpuUtilization < 0.20)'
```

### Monthly Capacity Planning
```bash
# Analyze resource trends
# Export metrics to analytics system for trend analysis
```

## Version History

### v1.0.0 (2025-10-19)
- Initial release
- Agent registration with 3-tier resource model
- Dynamic resource allocation
- Real-time performance metrics
- Load balancing with multiple strategies
- Comprehensive test suite
