# Hybrid Architecture Troubleshooting Guide

## Common Issues & Resolution

### 1. Redis Coordination Failures
- **Symptoms**:
  - Agents not synchronizing
  - Coordination timeouts
  - Missing context injection

- **Diagnostics**:
  ```bash
  ./.claude/skills/cfn-redis-coordination/diagnostic.sh \
    --mode=comprehensive
  ```

- **Resolution Steps**:
  1. Verify Redis endpoint connectivity
  2. Check Redis authentication
  3. Restart Redis service
  4. Validate network configurations

### 2. Z.ai Provider Routing Issues
- **Symptoms**:
  - High latency
  - Failed agent spawning
  - Inconsistent routing

- **Diagnostics**:
  ```bash
  /switch-api status \
    --detailed \
    --providers=z.ai
  ```

- **Resolution Steps**:
  1. Verify Z.ai API credentials
  2. Check network connectivity
  3. Validate API quota
  4. Fallback to Anthropic routing if persistent

### 3. Cost Optimization Failures
- **Symptoms**:
  - Unexpected high costs
  - Resource allocation problems
  - Scaling mechanism failures

- **Diagnostics**:
  ```bash
  ./.claude/skills/cost-tracking/analyze.sh \
    --period=last-week \
    --teams=5
  ```

- **Resolution Steps**:
  1. Review resource allocation
  2. Adjust auto-scaling thresholds
  3. Validate cost optimization rules
  4. Manually intervene if auto-scaling fails

### 4. Agent Spawning & Coordination
- **Symptoms**:
  - Agents not starting
  - Missing context
  - Coordination loop failures

- **Diagnostics**:
  ```bash
  ./.claude/skills/cfn-loop-orchestration/validate-agents.sh \
    --task-id="$CURRENT_TASK" \
    --mode=debug
  ```

- **Resolution Steps**:
  1. Check agent configuration
  2. Validate Redis context
  3. Restart orchestration
  4. Manually spawn agents if automated spawn fails

### 5. Performance Degradation
- **Symptoms**:
  - Slow iterations
  - High resource consumption
  - Decreased throughput

- **Diagnostics**:
  ```bash
  ./.claude/skills/p1-monitoring/performance-check.sh \
    --teams=5 \
    --metrics=comprehensive
  ```

- **Resolution Steps**:
  1. Analyze resource utilization
  2. Adjust team-level configurations
  3. Optimize agent specialization
  4. Consider vertical/horizontal scaling

## Emergency Procedures

### Complete System Reset
```bash
npx cfn-reset \
  --mode=full \
  --confirm \
  --teams=5
```

### Rollback Mechanism
```bash
npx cfn-rollback \
  --version="last-known-stable" \
  --teams=5 \
  --force-recovery
```

## Escalation Matrix
- L1: Automated Diagnostics
- L2: Team-Level Troubleshooting
- L3: Coordination Agent Intervention
- L4: Manual CTO-Level Resolution

**Recommended Action**: Always start with automated diagnostics and progressively escalate.