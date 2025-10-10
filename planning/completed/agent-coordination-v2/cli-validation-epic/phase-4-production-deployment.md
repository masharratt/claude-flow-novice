# Phase 4: Production Deployment (Weeks 18-24)

**Phase ID**: 4
**Priority**: CRITICAL - Final Production Rollout
**Dependencies**: Phase 1 (Foundation), Phase 2 (Testing), Phase 3 (Optimization)
**Timeline**: 6-8 weeks

## Phase Goal

Execute gradual production rollout of CLI Coordination V2 from 100 agents to 708 agents with staged capacity increases, comprehensive monitoring, and V1 fallback strategy. Achieve stable 500+ agent coordination in production for 2 weeks.

**If Phase 4 fails**: Rollback to V1, extend stabilization timeline, or reduce agent capacity targets

## Phase Overview

Phase 4 implements a three-stage production deployment strategy:

1. **Stage 1** (100 agents, flat topology): 10% production traffic, validate core stability
2. **Stage 2** (300 agents, hybrid topology): 50% production traffic, validate coordinator mesh
3. **Stage 3** (500-708 agents, large hybrid): 100% production traffic, validate full scale

Each stage includes deployment to staging, smoke testing, gradual production rollout, stability monitoring, and decision gates before proceeding to the next stage.

**Success Criteria**: 500-708 agents coordinating in production with <10s coordination time, ≥90% delivery rate, zero critical incidents for 2 weeks.

---

## Stage 1: 100 Agents (Flat Topology) - 2 Weeks

**Objective**: Validate basic V2 coordination in production with minimal risk

### Deployment Strategy

**Configuration**:
```bash
export CFN_COORDINATION_VERSION="v2"
export CFN_TOPOLOGY="flat"
export CFN_MAX_AGENTS="100"
export CFN_TRAFFIC_PERCENTAGE="10"  # 10% of production traffic to V2
export CFN_FALLBACK_ENABLED="true"
export CFN_FALLBACK_THRESHOLD_TIME="30000"  # 30s coordination time triggers fallback
export CFN_FALLBACK_THRESHOLD_DELIVERY="80"  # 80% delivery rate triggers fallback
```

**Architecture**: Simple flat topology with no coordinators, direct peer-to-peer messaging for 100 agents.

### Week 1: Staging Deployment & Validation

**Rollout Steps**:

1. **Deploy V2 subsystem to staging environment**
   - Install coordination scripts: `message-bus.sh`, `agent-wrapper.sh`, `coordination-config.sh`
   - Verify tmpfs availability: `/dev/shm` with 256MB minimum
   - Configure V2 with flat topology
   - Validate file permissions and directory structure

2. **Smoke test with 10 agents**
   - Initialize 10-agent swarm with simple echo tasks
   - Measure coordination time (target: <2s)
   - Verify delivery rate ≥95%
   - Check health status API endpoints
   - Validate metrics emission

3. **Scale to 50 agents**
   - Gradually increase to 50 agents over 2 iterations
   - Measure coordination time (target: <3s)
   - Monitor memory usage, FD count, tmpfs utilization
   - Run for 8 hours continuous coordination
   - Validate graceful shutdown

4. **Scale to 100 agents**
   - Increase to full 100 agent capacity
   - Measure coordination time (target: <5s)
   - Monitor system resource usage (CPU, memory, I/O)
   - Run for 24 hours stability test
   - Validate rate limiting and backpressure mechanisms

5. **Monitor staging for 3 days**
   - Continuous coordination every 5 minutes
   - Track key metrics: coordination time, delivery rate, error rate
   - Validate health checks detect failures within 30s
   - Test graceful shutdown and cleanup
   - Verify no resource leaks (memory, FD, tmpfs)

**Staging Success Criteria**:
- ✅ 100 agents: <5s coordination time
- ✅ Delivery rate: ≥95%
- ✅ Zero crashes or hangs over 3 days
- ✅ Memory usage stable (±10% variance)
- ✅ File descriptor count stable
- ✅ Health checks accurate (false positive <1%)

**Week 1 Decision Gate**: ALL criteria pass → Proceed to Week 2 production rollout

### Week 2: Production Rollout (10% Traffic)

**Rollout Steps**:

1. **Enable V2 for 10% of production traffic**
   - Deploy coordination-router with traffic splitting logic
   - Route 10% of requests to V2, 90% to V1
   - V1 fallback ready for immediate rollback
   - Monitor initial 2 hours closely for anomalies

2. **Monitor for 24 hours with intensive logging**
   - Every coordination event logged with full metrics
   - Track V1 vs V2 comparative performance
   - Alert on any V2 failure or performance degradation
   - Verify fallback mechanism triggers correctly if needed

3. **Gradually increase monitoring intervals**
   - Day 1-2: Check every 2 hours
   - Day 3-4: Check every 6 hours
   - Day 5-7: Check daily with automated alerts

4. **Run for 1 week with V1 fallback ready**
   - Continuous V2 operation with 10% traffic
   - V1 remains primary coordination system
   - Automatic fallback on V2 failure detection
   - Incident response team on standby

**Production Success Criteria**:
- ✅ 100 agents: <5s coordination time
- ✅ Delivery rate: ≥95% (matching or exceeding V1)
- ✅ Zero V2 crashes requiring V1 fallback
- ✅ No production incidents attributed to V2
- ✅ Metrics dashboards show healthy status
- ✅ Error rate ≤1% (similar to V1 baseline)

**Stage 1 Decision Gate**: ALL criteria pass for 1 week → Proceed to Stage 2

### Stage 1 Rollback Procedure

**Trigger Conditions** (ANY triggers immediate rollback):
- Coordination time >15s (3× target)
- Delivery rate <80%
- V2 crashes or becomes unresponsive
- Critical production incident caused by V2
- Memory leak or FD exhaustion detected

**Rollback Steps**:
1. Set `CFN_COORDINATION_VERSION="v1"` globally
2. Restart coordination system to flush V2 state
3. Verify V1 coordination working normally
4. Investigate V2 failure root cause
5. Generate incident report with diagnostic data
6. Fix critical issues before retry

**Rollback Time Target**: <5 minutes from decision to V1 fully operational

---

## Stage 2: 300 Agents (Hybrid Topology) - 2 Weeks

**Objective**: Validate hybrid coordinator-mesh topology at medium scale

### Deployment Strategy

**Configuration**:
```bash
export CFN_COORDINATION_VERSION="v2"
export CFN_TOPOLOGY="hybrid"
export CFN_MAX_AGENTS="300"
export CFN_COORDINATORS="7"
export CFN_WORKERS_PER_COORDINATOR="43"
export CFN_TRAFFIC_PERCENTAGE="50"  # 50% of production traffic to V2
export CFN_MESH_LEVEL_RELIABILITY="100"  # 100% mesh reliability target
export CFN_COORDINATOR_FAILOVER="true"
```

**Architecture**: Hybrid topology with 7 coordinators in mesh, each managing ~43 workers in flat sub-swarms. Coordinator failover enabled.

### Week 3: Staging with Hybrid Topology

**Rollout Steps**:

1. **Test hybrid topology in staging with 150 agents**
   - Initialize 7 coordinators + 143 workers (21 workers/coordinator)
   - Measure coordination time (target: <8s)
   - Verify mesh level delivery rate: 100%
   - Test coordinator-worker communication patterns
   - Validate coordinator load balancing

2. **Scale to 300 agents in staging**
   - Initialize 7 coordinators + 293 workers (43 workers/coordinator)
   - Measure coordination time (target: <12s)
   - Monitor coordinator resource usage (CPU, memory, message queue depth)
   - Validate worker distribution across coordinators
   - Test coordinator failure scenarios

3. **Monitor mesh level reliability**
   - Track coordinator-coordinator communication success rate
   - Should achieve 100% mesh level delivery
   - Measure coordinator response time
   - Verify worker coordination success rate ≥90%

4. **Run for 3 days continuous operation**
   - Coordination every 5 minutes
   - Monitor coordinator stability
   - Test graceful shutdown of individual coordinators
   - Validate worker reassignment on coordinator failure
   - Measure failover time (<30s target)

**Staging Success Criteria**:
- ✅ 300 agents: <12s coordination time
- ✅ Mesh level delivery rate: 100%
- ✅ Worker level delivery rate: ≥90%
- ✅ Coordinator failover: <30s recovery
- ✅ Zero coordinator crashes over 3 days
- ✅ Worker distribution balanced (±10% across coordinators)

**Week 3 Decision Gate**: ALL criteria pass → Proceed to Week 4 production rollout

### Week 4: Production Rollout (50% Traffic)

**Rollout Steps**:

1. **Enable V2 for 50% of production traffic**
   - Update coordination-router to 50/50 traffic split
   - Deploy hybrid topology configuration
   - Initialize 7 coordinators in production
   - Monitor initial 4 hours with intensive logging

2. **Test team-based coordination workflows**
   - Validate coordinator assignment logic for teams
   - Test cross-team communication through coordinator mesh
   - Measure team coordination efficiency
   - Verify load distribution across coordinators

3. **Monitor for 1 week with gradual ramp-up**
   - Day 1: 50% traffic, hourly monitoring
   - Day 2-3: 50% traffic, 4-hour monitoring intervals
   - Day 4-7: 50% traffic, daily monitoring with automated alerts

4. **Test coordinator failover in production**
   - Controlled failover test during low-traffic period
   - Gracefully shutdown one coordinator
   - Verify workers reassigned to other coordinators
   - Measure failover impact on active coordination
   - Validate system recovers within 30s

**Production Success Criteria**:
- ✅ 300 agents: <12s coordination time
- ✅ Mesh level delivery rate: 100%
- ✅ Worker level delivery rate: ≥90%
- ✅ V2 handles 50% traffic without degradation
- ✅ Coordinator failover successful in production test
- ✅ Zero critical incidents for 1 week
- ✅ V2 performance matches or exceeds V1

**Stage 2 Decision Gate**: ALL criteria pass for 1 week → Proceed to Stage 3

### Stage 2 Rollback Procedure

**Trigger Conditions** (ANY triggers rollback):
- Coordination time >25s (2× target)
- Mesh level delivery rate <95%
- Worker level delivery rate <80%
- Coordinator cascade failure (≥2 coordinators down)
- Critical production incident

**Rollback Steps**:
1. Reduce traffic to 10% (Stage 1 level)
2. If issues persist, set `CFN_COORDINATION_VERSION="v1"`
3. Investigate coordinator stability issues
4. Fix critical bugs before retry
5. Retest in staging before re-enabling 50% traffic

---

## Stage 3: 500-708 Agents (Large Hybrid) - 3-4 Weeks

**Objective**: Achieve full-scale production deployment with 500-708 agents

### Deployment Strategy

**Configuration**:
```bash
export CFN_COORDINATION_VERSION="v2"
export CFN_TOPOLOGY="hybrid"
export CFN_MAX_AGENTS="708"
export CFN_COORDINATORS="7"
export CFN_WORKERS_PER_COORDINATOR="100"
export CFN_TRAFFIC_PERCENTAGE="100"  # 100% of production traffic to V2
export CFN_MESH_LEVEL_RELIABILITY="100"
export CFN_COORDINATOR_FAILOVER="true"
export CFN_SHM_SIZE="1024"  # 1GB /dev/shm required
export CFN_MAX_FD="16384"  # High FD limit required
```

**Architecture**: Large hybrid topology with 7 coordinators managing up to 100 workers each. Requires 8GB+ RAM, high FD limits, 1GB /dev/shm.

**Resource Requirements**:
- **Memory**: 8GB+ total system RAM (1GB+ per coordinator, 50MB per worker)
- **File Descriptors**: ulimit -n 16384 minimum
- **tmpfs**: /dev/shm 1GB+ (--shm-size=1g for Docker)
- **CPU**: 8+ cores recommended for large swarms
- **Disk I/O**: SSD recommended for /dev/shm fallback

### Week 5: Staging 500-708 Agent Tests

**Rollout Steps**:

1. **Test 500 agents in staging**
   - Initialize 7 coordinators + 493 workers (71 workers/coordinator)
   - Measure coordination time (target: <10s)
   - Monitor resource utilization (CPU, memory, I/O)
   - Validate delivery rate ≥90%
   - Run for 24 hours continuous operation

2. **Test 708 agents in staging** (MVP validated scale)
   - Initialize 7 coordinators + 701 workers (100 workers/coordinator)
   - Measure coordination time (target: <20s, MVP achieved 20s)
   - Monitor system resource limits (FD, memory, tmpfs)
   - Validate delivery rate ≥90% (MVP achieved 97.8%)
   - Test coordinator failover at max capacity

3. **Resource utilization analysis**
   - Memory usage per coordinator (target: <1.5GB each)
   - Memory usage per worker (target: <100MB each)
   - FD count tracking (should be <10k for 708 agents)
   - tmpfs usage (should be <800MB for full swarm)
   - CPU utilization (should allow headroom for bursts)

4. **Stress testing at scale**
   - Rapid coordination cycles (every 30s for 4 hours)
   - Coordinator cascade failure test (shutdown 2 coordinators)
   - Resource exhaustion simulation (memory pressure, FD limits)
   - Concurrent coordination workloads
   - Message storm scenarios (high throughput bursts)

**Staging Success Criteria**:
- ✅ 500 agents: <10s coordination time, ≥90% delivery
- ✅ 708 agents: <20s coordination time, ≥90% delivery
- ✅ Resource utilization within limits (memory, FD, tmpfs)
- ✅ Coordinator failover working at max capacity
- ✅ Zero system crashes or resource exhaustion
- ✅ Performance matches or exceeds MVP benchmarks

**Week 5 Decision Gate**: ALL criteria pass → Proceed to Week 6 production rollout

### Week 6: Production 75% Traffic

**Rollout Steps**:

1. **Enable V2 for 75% of production traffic**
   - Update coordination-router to 75% V2, 25% V1
   - Initialize full coordinator capacity (7 coordinators)
   - Monitor initial 8 hours with intensive logging
   - Track resource utilization trends

2. **Monitor high-load scenarios**
   - Peak traffic periods (highest agent count)
   - Concurrent coordination workloads
   - Coordinator load distribution
   - Message queue depths at coordinators

3. **Validate failover mechanisms**
   - Test coordinator restart during production load
   - Verify worker reassignment without coordination failures
   - Measure failover impact on active tasks
   - Validate automatic recovery

4. **Run for 1 week at 75% traffic**
   - Continuous monitoring of V2 stability
   - V1 still handling 25% as safety baseline
   - Incident response team on standby
   - Daily performance reviews

**Production Success Criteria**:
- ✅ Coordination time <10s for typical workloads (100-500 agents)
- ✅ Delivery rate ≥90% sustained
- ✅ V2 handles 75% traffic without degradation
- ✅ Resource utilization stable and predictable
- ✅ Zero critical incidents for 1 week

**Week 6 Decision Gate**: ALL criteria pass → Proceed to Week 7 full traffic

### Week 7: Production 100% Traffic

**Rollout Steps**:

1. **Enable V2 for 100% of production traffic**
   - Update coordination-router to 100% V2
   - V1 remains installed but inactive (fallback ready)
   - Monitor initial 24 hours with intensive logging
   - All production coordination on V2

2. **Monitor for 1 week full production load**
   - All agent coordination through V2 system
   - Track all metrics continuously
   - Validate performance under full load
   - Monitor for any stability issues

3. **Performance validation at scale**
   - Measure coordination time distribution (p50, p95, p99)
   - Validate delivery rate consistency
   - Monitor resource utilization trends
   - Verify no degradation from Week 6 metrics

4. **Incident response testing**
   - Verify alert thresholds trigger correctly
   - Test escalation procedures
   - Validate monitoring dashboards
   - Confirm fallback procedures documented and tested

**Production Success Criteria**:
- ✅ 500+ agents: <10s coordination time sustained
- ✅ Delivery rate: ≥90% for 1 week
- ✅ Zero critical incidents
- ✅ V2 performance stable at 100% traffic
- ✅ Resource utilization within acceptable limits

**Week 7 Decision Gate**: ALL criteria pass → Proceed to Week 8 V1 decommissioning

### Week 8: V1 Decommissioning & Final Validation

**Rollout Steps**:

1. **Continue 100% V2 traffic for additional week**
   - Total 2 weeks at 100% V2 traffic
   - Monitor for any long-term stability issues
   - Validate resource usage remains stable
   - Confirm no memory leaks or FD exhaustion

2. **Decommission V1 fallback** (after 2 weeks stable)
   - Archive V1 coordination code for emergency recovery
   - Remove V1 from active deployment
   - Update coordination-router to V2-only mode
   - Document V1 restoration procedure if needed

3. **Final validation and sign-off**
   - Generate comprehensive performance report
   - Compare V2 vs V1 metrics (improvement analysis)
   - Document lessons learned
   - Create operational runbooks

**Final Success Criteria**:
- ✅ 2 weeks of stable 100% V2 traffic
- ✅ 500+ agent capacity proven in production
- ✅ Coordination time <10s for 500 agents sustained
- ✅ Delivery rate ≥90% sustained
- ✅ Zero critical incidents for 2 weeks
- ✅ V1 safely decommissioned with restoration procedure documented

**Stage 3 Decision Gate**: ALL criteria pass → Epic COMPLETE

### Stage 3 Rollback Procedure

**Trigger Conditions** (ANY triggers rollback):
- Coordination time >30s (3× target)
- Delivery rate <80% for ≥4 hours
- System resource exhaustion (memory, FD)
- Coordinator cascade failure causing service disruption
- Critical production incident with V2 root cause

**Rollback Steps**:
1. Reduce traffic to 50% (Stage 2 level) immediately
2. If issues persist, reduce to 10% (Stage 1 level)
3. If still failing, set `CFN_COORDINATION_VERSION="v1"` for full rollback
4. Conduct thorough root cause analysis
5. Fix critical issues and retest in staging
6. Gradual re-ramp following Stage 1 → Stage 2 → Stage 3 progression

**Rollback Time Target**: <15 minutes from decision to stable state

---

## Phase 4 Decision Gate (Epic Completion)

### Epic Completion Criteria

**ALL must pass for epic success**:

1. **Capacity**: 500+ agents coordinating in production
2. **Performance**: Coordination time <10s for 500 agents sustained over 2 weeks
3. **Reliability**: Delivery rate ≥90% sustained over 2 weeks
4. **Stability**: V2 handles 100% production traffic without degradation
5. **Incidents**: Zero critical production incidents attributed to V2 for 2 weeks
6. **Operations**: Comprehensive monitoring, alerting, and runbooks in place
7. **Fallback**: V1 decommissioned with documented restoration procedure

### Decision Outcomes

**COMPLETE** (ALL criteria pass):
- Epic successful, V2 is primary coordination system
- V1 archived for emergency recovery only
- Proceed to Phase 5 evaluation decision (optional WAITING state)
- Celebrate achievement of 500+ agent production scale

**INCOMPLETE** (ANY criterion fails):
- Extend Stage 3 timeline for additional stabilization
- Rollback to previous stage if critical issues
- Analyze failure root causes and implement fixes
- Retest in staging before retry
- Consider reducing agent capacity target if 500+ proves unstable

**PIVOT** (fundamental issues discovered):
- Adjust architecture based on production learnings
- Reduce max agent count to sustainable level
- Implement additional stability mechanisms
- Extend monitoring and alerting coverage

---

## Technical Implementation Details

### Deployment Scripts

**Deployment Automation**: `scripts/deploy-v2.sh`

```bash
#!/bin/bash
# Deploy CLI Coordination V2 to target environment

set -euo pipefail

ENVIRONMENT=${1:-staging}  # staging | production
STAGE=${2:-1}              # 1 | 2 | 3
TRAFFIC_PCT=${3:-10}       # 10 | 50 | 75 | 100

echo "Deploying V2 to $ENVIRONMENT (Stage $STAGE, $TRAFFIC_PCT% traffic)"

# Step 1: Validate environment prerequisites
bash scripts/validate-environment.sh "$ENVIRONMENT"

# Step 2: Deploy coordination scripts
rsync -av src/coordination/v2/ "$DEPLOY_TARGET/coordination/"

# Step 3: Configure topology for stage
case $STAGE in
  1)
    export CFN_TOPOLOGY="flat"
    export CFN_MAX_AGENTS="100"
    ;;
  2)
    export CFN_TOPOLOGY="hybrid"
    export CFN_MAX_AGENTS="300"
    export CFN_COORDINATORS="7"
    ;;
  3)
    export CFN_TOPOLOGY="hybrid"
    export CFN_MAX_AGENTS="708"
    export CFN_COORDINATORS="7"
    ;;
esac

# Step 4: Update coordination-router configuration
sed -i "s/CFN_TRAFFIC_PERCENTAGE=.*/CFN_TRAFFIC_PERCENTAGE=$TRAFFIC_PCT/" \
  "$DEPLOY_TARGET/coordination-router.sh"

# Step 5: Deploy monitoring configuration
bash scripts/deploy-monitoring.sh "$ENVIRONMENT"

# Step 6: Validate deployment
bash scripts/smoke-test-v2.sh "$ENVIRONMENT"

echo "Deployment complete. Monitor metrics at: http://metrics-dashboard/$ENVIRONMENT"
```

**Environment Validation**: `scripts/validate-environment.sh`

```bash
#!/bin/bash
# Validate environment meets V2 requirements

ENVIRONMENT=${1:-staging}

echo "Validating $ENVIRONMENT for V2 deployment..."

# Check tmpfs availability and size
shm_size=$(df -h /dev/shm | awk 'NR==2 {print $2}')
shm_avail=$(df -h /dev/shm | awk 'NR==2 {print $4}')
echo "tmpfs: $shm_size total, $shm_avail available"
[[ "${shm_avail%%[MG]*}" -ge 256 ]] || {
  echo "ERROR: /dev/shm requires 256MB+ available"
  exit 1
}

# Check file descriptor limits
fd_limit=$(ulimit -n)
echo "FD limit: $fd_limit"
[[ "$fd_limit" -ge 4096 ]] || {
  echo "ERROR: ulimit -n requires 4096+ (found $fd_limit)"
  exit 1
}

# Check memory availability
mem_avail=$(free -m | awk 'NR==2 {print $7}')
echo "Memory available: ${mem_avail}MB"
[[ "$mem_avail" -ge 2048 ]] || {
  echo "WARNING: <2GB memory available, may struggle at scale"
}

# Check bash version
bash_version=$(bash --version | head -n1 | grep -oP '\d+\.\d+')
echo "Bash version: $bash_version"
[[ "${bash_version%%.*}" -ge 4 ]] || {
  echo "ERROR: Bash 4.0+ required (found $bash_version)"
  exit 1
}

echo "Environment validation PASSED"
```

**Smoke Test**: `scripts/smoke-test-v2.sh`

```bash
#!/bin/bash
# Quick smoke test for V2 deployment

ENVIRONMENT=${1:-staging}

echo "Running V2 smoke test in $ENVIRONMENT..."

# Initialize 10-agent swarm
bash /coordination/message-bus.sh init 10 || {
  echo "ERROR: Failed to initialize 10-agent swarm"
  exit 1
}

# Send test message to all agents
bash /coordination/message-bus.sh broadcast "test:ping" || {
  echo "ERROR: Failed to broadcast test message"
  exit 1
}

# Wait for responses
sleep 2

# Check delivery rate
received=$(bash /coordination/message-bus.sh status | grep -c "test:ping:ack")
delivery_rate=$((received * 10))  # 10 agents = 100%

echo "Delivery rate: $delivery_rate%"
[[ "$delivery_rate" -ge 90 ]] || {
  echo "ERROR: Delivery rate <90% (found $delivery_rate%)"
  exit 1
}

# Cleanup test swarm
bash /coordination/message-bus.sh shutdown

echo "Smoke test PASSED"
```

### V1/V2 Toggle Implementation

**Coordination Router**: `src/coordination/coordination-router.ts`

```typescript
import { CoordinationV1 } from './v1/swarm-init';
import { execSync } from 'child_process';

export class CoordinationRouter {
  private config = {
    version: process.env.CFN_COORDINATION_VERSION || 'v1',
    trafficPercentage: parseInt(process.env.CFN_TRAFFIC_PERCENTAGE || '0'),
    fallbackEnabled: process.env.CFN_FALLBACK_ENABLED === 'true',
    fallbackThresholds: {
      coordinationTime: parseInt(process.env.CFN_FALLBACK_THRESHOLD_TIME || '30000'),
      deliveryRate: parseInt(process.env.CFN_FALLBACK_THRESHOLD_DELIVERY || '80'),
    },
  };

  async coordinate(taskId: string, agentCount: number): Promise<CoordinationResult> {
    // Traffic splitting logic
    const useV2 = this.shouldUseV2();

    if (useV2 && this.config.version === 'v2') {
      try {
        const result = await this.coordinateV2(taskId, agentCount);

        // Fallback detection
        if (this.config.fallbackEnabled && this.shouldFallback(result)) {
          console.warn('V2 performance degraded, falling back to V1');
          return await this.coordinateV1(taskId, agentCount);
        }

        return result;
      } catch (error) {
        console.error('V2 coordination failed:', error);
        if (this.config.fallbackEnabled) {
          console.warn('Falling back to V1 due to error');
          return await this.coordinateV1(taskId, agentCount);
        }
        throw error;
      }
    } else {
      return await this.coordinateV1(taskId, agentCount);
    }
  }

  private shouldUseV2(): boolean {
    // Random traffic splitting based on percentage
    const rand = Math.random() * 100;
    return rand < this.config.trafficPercentage;
  }

  private shouldFallback(result: CoordinationResult): boolean {
    return (
      result.coordinationTime > this.config.fallbackThresholds.coordinationTime ||
      result.deliveryRate < this.config.fallbackThresholds.deliveryRate
    );
  }

  private async coordinateV1(taskId: string, agentCount: number): Promise<CoordinationResult> {
    // Existing V1 coordination logic
    const v1 = new CoordinationV1();
    return await v1.coordinate(taskId, agentCount);
  }

  private async coordinateV2(taskId: string, agentCount: number): Promise<CoordinationResult> {
    // Call V2 bash coordination system
    const startTime = Date.now();
    const output = execSync(
      `bash /coordination/message-bus.sh coordinate ${agentCount} ${taskId}`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    const metrics = this.parseV2Output(output);
    return {
      taskId,
      coordinationTime: Date.now() - startTime,
      deliveryRate: metrics.deliveryRate,
      agentsCoordinated: metrics.agentsCoordinated,
    };
  }

  private parseV2Output(output: string): { deliveryRate: number; agentsCoordinated: number } {
    // Parse V2 output for metrics
    const deliveryMatch = output.match(/delivery_rate=(\d+(\.\d+)?)/);
    const agentsMatch = output.match(/agents_coordinated=(\d+)/);

    return {
      deliveryRate: deliveryMatch ? parseFloat(deliveryMatch[1]) : 0,
      agentsCoordinated: agentsMatch ? parseInt(agentsMatch[1]) : 0,
    };
  }
}

interface CoordinationResult {
  taskId: string;
  coordinationTime: number;
  deliveryRate: number;
  agentsCoordinated: number;
}
```

### Monitoring Setup

**Metrics Collection**: `scripts/collect-v2-metrics.sh`

```bash
#!/bin/bash
# Collect V2 coordination metrics for monitoring

METRICS_FILE=${METRICS_FILE:-/var/log/cfn/v2-metrics.jsonl}
INTERVAL=${INTERVAL:-60}  # seconds

while true; do
  # Collect system metrics
  timestamp=$(date -u +%s)
  mem_usage=$(ps aux | awk '/message-bus/ {sum+=$6} END {print sum}')
  fd_count=$(lsof | grep -c /dev/shm/cfn)
  tmpfs_usage=$(df /dev/shm | awk 'NR==2 {print $5}' | tr -d '%')

  # Collect coordination metrics from V2
  if [[ -f /dev/shm/cfn/metrics/latest.json ]]; then
    coord_time=$(jq -r '.coordination_time' /dev/shm/cfn/metrics/latest.json)
    delivery_rate=$(jq -r '.delivery_rate' /dev/shm/cfn/metrics/latest.json)
    active_agents=$(jq -r '.active_agents' /dev/shm/cfn/metrics/latest.json)
  else
    coord_time=0
    delivery_rate=0
    active_agents=0
  fi

  # Emit metrics in JSONL format
  echo "{\"timestamp\":$timestamp,\"memory_kb\":$mem_usage,\"fd_count\":$fd_count,\"tmpfs_pct\":$tmpfs_usage,\"coordination_time\":$coord_time,\"delivery_rate\":$delivery_rate,\"active_agents\":$active_agents}" >> "$METRICS_FILE"

  sleep "$INTERVAL"
done
```

**Alert Configuration**: `config/v2-alerts.yaml`

```yaml
alerts:
  - name: V2 Coordination Time High
    condition: coordination_time > 15000
    severity: warning
    message: "V2 coordination time exceeded 15s (3× target)"
    action: notify_oncall

  - name: V2 Coordination Time Critical
    condition: coordination_time > 30000
    severity: critical
    message: "V2 coordination time exceeded 30s - fallback threshold"
    action: trigger_fallback

  - name: V2 Delivery Rate Low
    condition: delivery_rate < 85
    severity: warning
    message: "V2 delivery rate below 85%"
    action: notify_oncall

  - name: V2 Delivery Rate Critical
    condition: delivery_rate < 80
    severity: critical
    message: "V2 delivery rate below 80% - fallback threshold"
    action: trigger_fallback

  - name: V2 Memory Leak
    condition: memory_kb > 8000000 AND memory_growth_rate > 1000
    severity: critical
    message: "V2 memory usage >8GB with growth trend detected"
    action: trigger_investigation

  - name: V2 FD Exhaustion
    condition: fd_count > 12000
    severity: critical
    message: "V2 file descriptor count >12k (approaching limit)"
    action: trigger_investigation

  - name: V2 tmpfs Full
    condition: tmpfs_pct > 90
    severity: critical
    message: "tmpfs usage >90% - coordination may fail"
    action: trigger_cleanup

  - name: V2 Coordinator Down
    condition: coordinator_health < 7
    severity: critical
    message: "Coordinator failure detected (expected 7, found less)"
    action: trigger_failover
```

**Monitoring Dashboard**: `dashboards/v2-production.json`

```json
{
  "dashboard": "CLI Coordination V2 - Production",
  "panels": [
    {
      "title": "Coordination Time (p50, p95, p99)",
      "type": "timeseries",
      "metrics": [
        "coordination_time_p50",
        "coordination_time_p95",
        "coordination_time_p99"
      ],
      "thresholds": [
        { "value": 10000, "color": "green", "label": "Target" },
        { "value": 15000, "color": "yellow", "label": "Warning" },
        { "value": 30000, "color": "red", "label": "Critical" }
      ]
    },
    {
      "title": "Delivery Rate",
      "type": "gauge",
      "metric": "delivery_rate",
      "thresholds": [
        { "value": 90, "color": "green" },
        { "value": 85, "color": "yellow" },
        { "value": 80, "color": "red" }
      ]
    },
    {
      "title": "Active Agents",
      "type": "timeseries",
      "metric": "active_agents",
      "thresholds": [
        { "value": 500, "color": "green", "label": "Target Capacity" },
        { "value": 708, "color": "blue", "label": "Max Capacity" }
      ]
    },
    {
      "title": "Memory Usage",
      "type": "timeseries",
      "metric": "memory_kb",
      "thresholds": [
        { "value": 4000000, "color": "green", "label": "4GB" },
        { "value": 6000000, "color": "yellow", "label": "6GB" },
        { "value": 8000000, "color": "red", "label": "8GB" }
      ]
    },
    {
      "title": "File Descriptors",
      "type": "timeseries",
      "metric": "fd_count",
      "thresholds": [
        { "value": 8000, "color": "green" },
        { "value": 12000, "color": "yellow" },
        { "value": 15000, "color": "red" }
      ]
    },
    {
      "title": "tmpfs Usage",
      "type": "gauge",
      "metric": "tmpfs_pct",
      "thresholds": [
        { "value": 70, "color": "green" },
        { "value": 85, "color": "yellow" },
        { "value": 90, "color": "red" }
      ]
    },
    {
      "title": "Coordinator Health",
      "type": "status",
      "metric": "coordinator_health",
      "expected": 7,
      "alert_threshold": 6
    },
    {
      "title": "V1 vs V2 Traffic Split",
      "type": "pie",
      "metrics": ["v1_traffic_pct", "v2_traffic_pct"]
    }
  ]
}
```

---

## Operational Documentation

### Runbook: V2 Deployment

**Objective**: Deploy CLI Coordination V2 to production following staged rollout plan

**Prerequisites**:
- Phase 1, 2, 3 completed successfully
- Staging environment tested and stable
- V1 fallback mechanism tested
- Monitoring dashboards configured
- On-call team briefed

**Procedure**:

1. **Pre-Deployment Checklist**
   - [ ] Staging tests passed for target stage
   - [ ] Metrics dashboards accessible
   - [ ] Alert configuration validated
   - [ ] Rollback procedure documented and tested
   - [ ] On-call team available for monitoring

2. **Deployment Steps** (per stage)
   - Run `bash scripts/deploy-v2.sh production <stage> <traffic_pct>`
   - Wait for deployment completion confirmation
   - Run smoke test: `bash scripts/smoke-test-v2.sh production`
   - Monitor metrics dashboard for initial 2 hours
   - Verify alert thresholds trigger correctly

3. **Post-Deployment Monitoring**
   - Check metrics dashboard every 2 hours (Day 1-2)
   - Review coordination time, delivery rate, resource usage
   - Investigate any anomalies or performance degradation
   - Confirm fallback mechanism not triggered

4. **Success Criteria Validation**
   - Coordination time within stage targets
   - Delivery rate ≥90%
   - Zero critical incidents
   - Resource utilization stable

5. **Decision Gate**
   - If all criteria pass: Proceed to next stage
   - If any criterion fails: Execute rollback procedure
   - Document any issues and resolutions

### Runbook: V2 Incident Response

**Objective**: Respond to V2 coordination failures or performance degradation

**Severity Levels**:
- **P0 Critical**: Production outage, coordination completely failed
- **P1 High**: Performance degraded (coordination time >30s or delivery <80%)
- **P2 Medium**: Performance warning (coordination time >15s or delivery <85%)
- **P3 Low**: Minor anomaly, no immediate impact

**Procedure**:

**P0 Critical Incident**:
1. **Immediate Action**: Execute rollback to V1
   - Set `CFN_COORDINATION_VERSION="v1"` globally
   - Restart coordination system
   - Verify V1 coordination operational
   - Notify stakeholders of rollback

2. **Investigation** (parallel to rollback):
   - Capture V2 logs and metrics
   - Check system resource exhaustion (memory, FD, tmpfs)
   - Review recent changes or deployments
   - Identify root cause

3. **Resolution**:
   - Fix critical bug or infrastructure issue
   - Test fix in staging environment
   - Retest 24 hours before production retry
   - Document incident and resolution

**P1 High Priority**:
1. **Immediate Action**: Reduce traffic to V2
   - Decrease traffic percentage to previous stage level
   - Monitor if performance stabilizes
   - If not, execute full rollback to V1

2. **Investigation**:
   - Analyze performance metrics for degradation cause
   - Check coordinator health and load distribution
   - Review system resource trends
   - Identify bottleneck or failure mode

3. **Resolution**:
   - Implement performance fix or tuning
   - Test in staging
   - Gradual re-ramp to target traffic level

**P2 Medium Priority**:
1. **Monitoring**: Increase monitoring frequency
   - Check metrics every 30 minutes
   - Watch for degradation trend
   - Escalate to P1 if worsening

2. **Investigation**:
   - Analyze performance variance
   - Check for external factors (system load, network)
   - Review recent coordination patterns

3. **Resolution**:
   - Tune configuration if needed
   - Add additional monitoring if gaps identified
   - Document findings

### Runbook: Coordinator Failover

**Objective**: Handle coordinator failure or planned maintenance

**Trigger Conditions**:
- Coordinator process crashed or unresponsive
- Coordinator health check failing
- Planned coordinator maintenance or upgrade

**Procedure**:

1. **Detect Coordinator Failure**
   - Health check reports coordinator unresponsive
   - Alert triggered: "V2 Coordinator Down"
   - Verify failure (not false positive)

2. **Automatic Failover** (V2 handles automatically):
   - Workers reassigned to healthy coordinators
   - Worker distribution rebalanced
   - Coordination continues with remaining coordinators
   - Target: <30s recovery time

3. **Manual Intervention** (if automatic failover fails):
   - Identify failed coordinator ID
   - Manually reassign workers: `bash /coordination/failover.sh <coordinator_id>`
   - Verify workers successfully reassigned
   - Monitor coordination stability

4. **Coordinator Recovery**:
   - Restart failed coordinator
   - Verify coordinator rejoins mesh
   - Rebalance worker distribution
   - Monitor coordinator health

5. **Post-Incident Review**:
   - Analyze coordinator failure root cause
   - Document failure mode and recovery steps
   - Update failover procedures if needed

### Runbook: Resource Exhaustion

**Objective**: Handle memory, FD, or tmpfs exhaustion

**Trigger Conditions**:
- Memory usage >8GB
- File descriptor count >12k
- tmpfs usage >90%

**Procedure**:

**Memory Exhaustion**:
1. Identify memory leak source:
   - Check process memory usage: `ps aux --sort=-%mem`
   - Look for coordinator or worker memory growth
   - Review recent code changes

2. Immediate mitigation:
   - Reduce agent count to lower capacity stage
   - Restart coordinators with high memory usage
   - Monitor memory stabilization

3. Long-term fix:
   - Implement cleanup hooks for memory leaks
   - Add periodic memory cleanup tasks
   - Tune garbage collection if applicable

**FD Exhaustion**:
1. Identify FD leak source:
   - Check FD usage: `lsof | grep /dev/shm/cfn | wc -l`
   - Look for unclosed file handles
   - Review file operation patterns

2. Immediate mitigation:
   - Reduce agent count
   - Restart coordination system to release FDs
   - Increase FD limit: `ulimit -n 32768`

3. Long-term fix:
   - Implement file handle cleanup on agent termination
   - Add file handle pooling
   - Review file operation error handling

**tmpfs Exhaustion**:
1. Identify tmpfs bloat:
   - Check directory sizes: `du -sh /dev/shm/cfn/*`
   - Look for orphaned message files
   - Review cleanup frequency

2. Immediate mitigation:
   - Clean up old message files: `bash /coordination/cleanup.sh`
   - Reduce message retention period
   - Increase tmpfs size if possible: `--shm-size=2g`

3. Long-term fix:
   - Implement automatic cleanup on message delivery
   - Tune message retention policy
   - Add tmpfs usage monitoring and alerting

---

## Risk Mitigation

### Production Deployment Risks

**Risk**: V2 fails catastrophically in production causing outage

**Probability**: LOW (mitigated by staged rollout)

**Impact**: CRITICAL (production coordination disrupted)

**Mitigation**:
- Staged rollout (10% → 50% → 100% traffic) minimizes blast radius
- V1 fallback mechanism for immediate rollback
- Comprehensive staging testing before production
- On-call team monitoring during rollout
- Automated fallback on performance degradation

**Contingency**:
- Immediate rollback to V1 (target: <5 minutes)
- V1 handles all traffic while V2 issue investigated
- Fix critical bugs and retest in staging
- Gradual re-ramp following staged plan

---

**Risk**: Performance degrades under production load (different from staging)

**Probability**: MEDIUM (production patterns may differ)

**Impact**: HIGH (coordination slower than target)

**Mitigation**:
- Gradual traffic increase to detect degradation early
- Performance monitoring with automated alerts
- Fallback to lower traffic percentage if degraded
- Production load testing in staging before rollout

**Contingency**:
- Reduce traffic percentage to stable level
- Analyze production vs staging differences
- Tune configuration for production workload
- Re-ramp gradually after tuning

---

**Risk**: Resource exhaustion at scale (memory, FD, tmpfs)

**Probability**: MEDIUM (large agent counts stress system)

**Impact**: HIGH (coordination fails or system crashes)

**Mitigation**:
- Resource monitoring with critical thresholds
- Cleanup hooks to prevent leaks
- Resource limits enforced (max agents, message retention)
- Tested at 708 agents in MVP validation

**Contingency**:
- Reduce agent count to sustainable level
- Increase system resources (RAM, FD limits, tmpfs)
- Implement additional cleanup mechanisms
- Add resource usage optimization

---

**Risk**: Coordinator failures cause coordination disruption

**Probability**: MEDIUM (coordinator reliability critical)

**Impact**: MEDIUM (temporary disruption, <30s recovery target)

**Mitigation**:
- Automated coordinator failover mechanism
- Worker reassignment on coordinator failure
- Health checks detect failures within 30s
- Chaos testing validated failover in Phase 2

**Contingency**:
- Manual worker reassignment if automatic failover fails
- Restart failed coordinator
- Rebalance worker distribution
- Reduce coordinator load if stability issues

---

**Risk**: V1 decommissioning leaves no rollback option

**Probability**: LOW (only after 2 weeks stable V2)

**Impact**: HIGH (if V2 fails after V1 removed)

**Mitigation**:
- V1 decommissioned only after 2 weeks stable V2 at 100% traffic
- V1 code archived for emergency restoration
- V1 restoration procedure documented and tested
- V2 must prove absolute stability before V1 removal

**Contingency**:
- Restore V1 from archive (target: <1 hour)
- Redeploy V1 coordination system
- Route all traffic to V1
- Investigate V2 failure root cause

---

**Risk**: Monitoring gaps miss critical failures

**Probability**: LOW (comprehensive monitoring implemented)

**Impact**: HIGH (failures undetected, delayed response)

**Mitigation**:
- Multi-dimensional monitoring (performance, resources, health)
- Automated alerts with appropriate thresholds
- Dashboard visualization for at-a-glance status
- Regular alert threshold review and tuning

**Contingency**:
- Add missing metrics if gaps identified
- Tune alert thresholds if false positives/negatives
- Enhance monitoring coverage based on incidents
- Regular monitoring system health checks

---

## V1 Fallback Strategy

### Fallback Trigger Conditions

**Automatic Fallback** (triggered by coordination-router):
- Coordination time >30s (3× target)
- Delivery rate <80% (below acceptable threshold)
- V2 process crash or unresponsive

**Manual Fallback** (triggered by on-call engineer):
- Critical production incident caused by V2
- Resource exhaustion requiring immediate mitigation
- Multiple coordinator failures
- Any P0 incident attributed to V2

### Fallback Execution Procedure

**Immediate Rollback** (target: <5 minutes):

1. **Set V1 as active version**:
   ```bash
   export CFN_COORDINATION_VERSION="v1"
   # Or: Update global configuration file
   sed -i 's/CFN_COORDINATION_VERSION="v2"/CFN_COORDINATION_VERSION="v1"/' /etc/cfn/config.sh
   ```

2. **Restart coordination system**:
   ```bash
   systemctl restart cfn-coordination
   # Or: For containerized deployments
   kubectl rollout restart deployment/cfn-coordination
   ```

3. **Verify V1 operational**:
   ```bash
   bash scripts/smoke-test-v1.sh production
   # Check coordination working with V1
   ```

4. **Notify stakeholders**:
   - Alert on-call team of fallback
   - Post incident notification
   - Update status page if applicable

**Traffic Reduction** (staged rollback, target: <15 minutes):

1. **Reduce traffic to lower percentage**:
   ```bash
   # If at 100%, reduce to 50%
   export CFN_TRAFFIC_PERCENTAGE="50"

   # If at 50%, reduce to 10%
   export CFN_TRAFFIC_PERCENTAGE="10"

   # If at 10%, fallback to V1 completely
   export CFN_COORDINATION_VERSION="v1"
   ```

2. **Monitor for stabilization**:
   - Watch coordination time and delivery rate
   - If stabilizes at lower traffic: investigate issue, fix, re-ramp
   - If still failing: continue to full V1 fallback

3. **Document rollback reason**:
   - Capture metrics showing degradation
   - Record alert that triggered rollback
   - Note traffic percentage at rollback

### Post-Fallback Actions

1. **Root Cause Analysis**:
   - Collect V2 logs and metrics from failure period
   - Analyze coordination patterns at failure
   - Identify specific trigger (load, edge case, bug)
   - Document findings in incident report

2. **Fix and Validation**:
   - Implement fix for identified root cause
   - Test fix comprehensively in staging
   - Run extended stability test (24+ hours)
   - Validate fix resolves issue

3. **Staged Re-Ramp**:
   - Return to previous stage (if at Stage 3, return to Stage 2)
   - Re-execute stage deployment procedure
   - Monitor closely for recurrence
   - Proceed to next stage only after extended stability

### V1 Restoration Procedure (Post-Decommission)

**If V1 removed and V2 fails critically**:

1. **Retrieve V1 from archive** (target: <30 minutes):
   ```bash
   # Restore V1 coordination code
   tar -xzf /backups/v1-coordination-$(date +%Y%m%d).tar.gz -C /opt/cfn/

   # Restore V1 configuration
   cp /backups/v1-config.sh /etc/cfn/config.sh
   ```

2. **Deploy V1 to production**:
   ```bash
   bash scripts/deploy-v1.sh production
   ```

3. **Validate V1 operational**:
   ```bash
   bash scripts/smoke-test-v1.sh production
   ```

4. **Switch all traffic to V1**:
   ```bash
   export CFN_COORDINATION_VERSION="v1"
   systemctl restart cfn-coordination
   ```

5. **Post-Restoration**:
   - V2 investigation for critical failure root cause
   - Comprehensive testing before re-attempting V2
   - Re-evaluate V2 production readiness
   - Consider extended V1/V2 coexistence period

---

## Phase 4 Metrics

### Target Metrics by Stage

**Stage 1** (100 agents, flat):
- Coordination time: <5s
- Delivery rate: ≥95%
- Traffic percentage: 10%
- Stability: 1 week at 10% traffic
- Incidents: Zero critical

**Stage 2** (300 agents, hybrid):
- Coordination time: <12s
- Delivery rate: ≥90%
- Mesh level delivery: 100%
- Traffic percentage: 50%
- Stability: 1 week at 50% traffic
- Incidents: Zero critical

**Stage 3** (500-708 agents, large hybrid):
- Coordination time: <10s (500 agents), <20s (708 agents)
- Delivery rate: ≥90%
- Mesh level delivery: 100%
- Traffic percentage: 100%
- Stability: 2 weeks at 100% traffic
- Incidents: Zero critical

### Escalation Triggers

**Stage-Level Escalation**:
- Coordination time exceeds 2× target for stage
- Delivery rate <85% sustained for ≥4 hours
- Critical incident caused by V2
- Resource exhaustion (memory, FD, tmpfs)
- Coordinator cascade failure

**Phase-Level Escalation**:
- Unable to achieve stable state at any stage after 2 retry attempts
- Fundamental V2 architecture flaw discovered
- V1 fallback required >3 times in a stage
- Resource requirements exceed available infrastructure

### Success Validation

**Quantitative Metrics**:
- Coordination time p50, p95, p99 within targets
- Delivery rate ≥90% for 2 weeks
- 500+ agents coordinating successfully
- Zero critical incidents for 2 weeks
- Resource utilization stable and predictable

**Qualitative Assessment**:
- V2 operational stability confidence
- Monitoring and alerting effectiveness
- Incident response procedures validated
- Team familiarity with V2 operations
- V1 decommissioning readiness

---

## Document Metadata

**Version**: 1.0
**Created**: 2025-10-06
**Author**: Phase 4 Documentation Agent
**Status**: READY FOR REVIEW
**Dependencies**: Phase 1, Phase 2, Phase 3 completion

**Related Documents**:
- `CLI_COORDINATION_V2_EPIC.md` - Epic overview and full plan
- `COMPREHENSIVE_TIMELINE.md` - Complete epic timeline
- `phase-1-critical-validation.md` - Phase 1 details
- `phase-2-performance-validation.md` - Phase 2 details
- `phase-3-optimization-validation.md` - Phase 3 details

**Next Steps**:
- Review Phase 4 documentation with stakeholders
- Validate deployment procedures in staging
- Test rollback and fallback mechanisms
- Train on-call team on incident response procedures
- Prepare for Phase 4 Stage 1 execution
