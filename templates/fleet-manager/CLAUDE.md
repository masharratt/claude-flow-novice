# Claude Flow Novice — Fleet Manager Template

---

## Fleet Management Configuration

This template is optimized for **enterprise-scale fleet management** with 1000+ agents.

### Fleet Initialization

```bash
# Initialize fleet for large-scale operations
/fleet init --max-agents 1500 --efficiency-target 0.40 --regions us-east-1,eu-west-1

# Auto-scale with efficiency optimization
/fleet scale --fleet-id fleet-123 --target-size 2000 --strategy predictive

# Resource optimization
/fleet optimize --fleet-id fleet-123 --efficiency-target 0.45
```

### Architecture

- **Topology**: Hierarchical (coordinator mesh + worker trees)
- **Scaling**: Predictive autoscaling with efficiency targets
- **Regions**: Multi-region deployment with failover
- **Monitoring**: Real-time dashboard with alerts

### Performance Targets

- Agent efficiency: ≥0.40
- Response time: <100ms P95
- Throughput: 10,000+ tasks/hour
- Availability: 99.9%

### Key Features

1. **Autoscaling**: Automatic agent provisioning based on workload
2. **Load Balancing**: Intelligent task distribution
3. **Health Monitoring**: Continuous health checks with auto-recovery
4. **Cost Optimization**: Resource efficiency tracking

---

## Swarm Configuration

**Fleet-optimized swarm settings:**

```bash
executeSwarm({
  swarmId: "fleet-production",
  objective: "Production workload processing",
  strategy: "development",
  mode: "hierarchical",
  maxAgents: 1500,
  persistence: true,
  autoscale: true,
  efficiencyTarget: 0.40
})
```

---

## Usage Patterns

### 1. Initialize Fleet

```bash
/fleet init --max-agents 1500 --regions us-east-1,eu-west-1
```

### 2. Deploy Swarm

```bash
node test-swarm-direct.js "Process customer data pipeline" --executor --max-agents 500
```

### 3. Monitor Performance

```bash
/fleet metrics --fleet-id fleet-123 --timeframe 24h --detailed
/dashboard monitor --fleet-id fleet-123 --alerts
```

### 4. Optimize Resources

```bash
/fleet optimize --fleet-id fleet-123 --cost-optimization
```

---

## Memory & Coordination

Fleet operations use **Redis pub/sub** for coordination and **SQLite with ACL** for memory:

```bash
# Initialize SQLite memory with ACL
/sqlite-memory init --database-path ./memory.db --acl-enabled

# Store fleet data with appropriate ACL level
/sqlite-memory store --key "fleet-metrics" --level system
```

---

## Monitoring & Alerts

Dashboard provides real-time insights:

```bash
# Fleet health monitoring
/dashboard insights --fleet-id fleet-123 --timeframe 24h

# Configure alerts
/fleet health --fleet-id fleet-123 --deep-check
```

---

## Best Practices

1. **Start Small**: Begin with 100 agents, scale gradually
2. **Monitor Efficiency**: Target ≥0.40 efficiency ratio
3. **Use Regions**: Deploy to multiple regions for resilience
4. **Enable Autoscaling**: Let system handle capacity automatically
5. **Review Metrics**: Check dashboard daily for optimization opportunities

---

For more information, see:
- `/fleet --help`
- `/dashboard --help`
- Main CLAUDE.md in project root
