# CLI Coordination Topology Patterns

**Purpose**: Architectural patterns for scaling CLI bash coordination to 700+ agents

**Source**: Extracted from archived SDK phases (PHASE_05, PHASE_06) and MVP validation

---

## Overview

CLI coordination uses three proven topology patterns based on agent count and reliability requirements. All patterns use pure bash + file-based IPC (/dev/shm tmpfs).

---

## Pattern 1: Flat Hierarchical (2-300 Agents)

### Architecture

```
Coordinator (master)
  ├─ Worker 1
  ├─ Worker 2
  ├─ Worker 3
  ├─ ...
  └─ Worker N
```

### Characteristics

**Agent Range**: 2-300 agents
**Coordination Time**: 1-11s depending on count
**Delivery Rate**: 85-100%
**Complexity**: Minimal

### Performance by Scale

| Agent Count | Delivery Rate | Coordination Time | Status |
|-------------|---------------|-------------------|--------|
| 2-50        | 90-100%       | 1-2s              | ✓ Optimal |
| 50-100      | 96-100%       | 3-4s              | ✓ Excellent |
| 100-200     | 91-98%        | 5-8s              | ✓ Good |
| 200-300     | 85-91%        | 8-11s             | ✓ Acceptable |
| 300+        | <85%          | >11s              | ✗ Breaking point |

### Use Cases

- Small to medium swarms
- Simple coordination requirements
- Single point of coordination acceptable
- Fast setup needed (<5 min to deploy)

### Strengths

- Simple to implement and debug
- Minimal coordination overhead
- Fast for small swarms (<100 agents: <5s)
- No additional complexity
- Easy to reason about

### Weaknesses

- Single point of coordination bottleneck
- Degraded performance beyond 200 agents
- No fault tolerance (coordinator failure = swarm failure)
- Limited scalability (breaking point at 300 agents)

### Implementation Details

**Coordinator**: Spawns all workers via Task tool, collects responses via file polling
**Workers**: Independent processes, write completion to `/dev/shm/[agent_id]/response.txt`
**IPC**: File-based message passing with flock for atomicity
**Completion**: Coordinator polls for N response files, times out after 30s

---

## Pattern 2: Hybrid Mesh + Hierarchical (300-1000+ Agents)

### Architecture

```
Master Coordinator
  ├─ Mesh Coordinator 1 (manages 50-100 workers)
  │    ├─ Worker 1.1
  │    ├─ Worker 1.2
  │    └─ ...
  ├─ Mesh Coordinator 2 (manages 50-100 workers)
  │    ├─ Worker 2.1
  │    ├─ Worker 2.2
  │    └─ ...
  └─ Mesh Coordinator N (manages 50-100 workers)
       ├─ Worker N.1
       ├─ Worker N.2
       └─ ...
```

### Characteristics

**Agent Range**: 300-1000+ agents
**Coordination Time**: 6-20s depending on count
**Delivery Rate**: 97-100%
**Complexity**: Moderate

### Performance by Scale

| Configuration | Total Agents | Delivery Rate | Coordination Time | Status |
|---------------|--------------|---------------|-------------------|--------|
| 7 × 20        | 148          | 100.0%        | 6s                | ✓ Perfect |
| 7 × 30        | 218          | 99.0%         | 7s                | ✓ Excellent |
| 7 × 50        | 358          | 97.1%         | 11s               | ✓ Very Good |
| 7 × 75        | 533          | 98.1%         | 16s               | ✓ Excellent |
| 7 × 100       | 708          | 97.8%         | 20s               | ✓ Excellent |
| 10-15 × 50    | 500-750      | Projected 97%+ | Projected 15-25s | ✓ Recommended |

### Use Cases

- Large swarms (300+ agents)
- High reliability requirements (>95% delivery)
- Fault tolerance needed
- Production deployments

### Strengths

- **2.4× capacity improvement** over flat (300 → 708 agents)
- **Higher reliability** (85% → 98% delivery)
- **Increasing throughput** with scale (35.4 agents/sec at 708 agents)
- **100% mesh coordinator reliability** (all coordinators respond)
- Fault tolerance (coordinator failure doesn't kill entire swarm)
- Load balancing across coordinators

### Weaknesses

- More complex setup (2-level coordination)
- Longer coordination time (20s for 708 agents)
- Requires coordinator election logic
- More moving parts to debug

### Implementation Details

**Master**: Spawns N mesh coordinators via Task tool
**Mesh Coordinators**: Form peer-to-peer mesh, each spawns 50-100 workers
**Workers**: Report to their coordinator only
**Mesh IPC**: Coordinators share state via `/dev/shm/mesh/[coordinator_id]/status.txt`
**Completion**: Master polls mesh coordinator status, coordinators poll worker responses

### Recommended Configuration

**User Preference** (from risk analysis):
- **10-15 coordinators** (mesh level)
- **Max 50 agents per coordinator** (hierarchical level)
- **Total capacity**: 500-750 agents
- **Expected delivery**: 97%+
- **Expected time**: 15-25s

**Rationale**:
- 50 agents/coordinator proven reliable (90-100% delivery, 1-2s)
- Smaller blast radius on coordinator failure
- Easier recovery than 100-agent teams
- Well within tested limits

---

## Pattern 3: Pure Mesh (Not Recommended)

### Architecture

```
Agent 1 ←→ Agent 2
   ↕          ↕
Agent 3 ←→ Agent 4
```

### Characteristics

**Agent Range**: 2-20 agents
**Coordination Time**: 5-10s
**Delivery Rate**: 90-95%
**Complexity**: High

### Use Cases

- Small peer-to-peer swarms
- No central coordinator desired
- Experimental/research scenarios

### Strengths

- No single point of failure
- True peer-to-peer coordination
- Emergent behavior possible

### Weaknesses

- High complexity for small benefit
- Slower than hierarchical for small swarms
- Limited scalability (mesh explosion beyond 20 agents)
- Harder to debug (no central view)

### Status

**Not validated in MVP** - Hierarchical and hybrid patterns proven superior for all tested scenarios.

---

## Topology Selection Criteria

### Choose Flat Hierarchical When:
- Agent count ≤ 300
- Simplicity preferred over fault tolerance
- Fast setup critical (<5 min)
- Single coordinator failure acceptable

### Choose Hybrid Mesh When:
- Agent count > 300
- High reliability required (>95%)
- Fault tolerance critical
- Production deployment
- Willing to invest in setup (10-15 min)

### Avoid Pure Mesh:
- All production scenarios (unproven at scale)
- Use hierarchical or hybrid instead

---

## Implementation Guidelines

### Flat Hierarchical Setup

```bash
# 1. Coordinator spawns workers
for i in {1..N}; do
  bash agent-wrapper.sh $i &
done

# 2. Coordinator polls for responses
while [[ $(ls /dev/shm/responses/ | wc -l) -lt $N ]]; do
  sleep 0.1
done

# 3. Coordinator aggregates results
cat /dev/shm/responses/*.txt > final_result.txt
```

### Hybrid Setup

```bash
# 1. Master spawns coordinators
for i in {1..7}; do
  bash mvp-coordinator.sh $i 50 &
done

# 2. Each coordinator spawns workers
# (inside mvp-coordinator.sh)
for j in {1..50}; do
  bash agent-wrapper.sh ${i}_${j} &
done

# 3. Coordinators report to mesh
echo "COORDINATOR_$i:COMPLETE" > /dev/shm/mesh/coordinator_$i.status

# 4. Master polls mesh
while [[ $(ls /dev/shm/mesh/*.status | wc -l) -lt 7 ]]; do
  sleep 0.1
done
```

---

## Performance Characteristics

### Latency

| Metric | Flat (50 agents) | Flat (300 agents) | Hybrid (708 agents) |
|--------|------------------|-------------------|---------------------|
| Spawn Time | 1s | 8s | 15s |
| Coordination | 1-2s | 8-11s | 20s |
| Total | 2-3s | 16-19s | 35s |

### Throughput

| Configuration | Agents/Second | Notes |
|---------------|---------------|-------|
| Flat (50) | 25 | Baseline |
| Flat (300) | 16-19 | Degraded |
| Hybrid (358) | 32.5 | Improved |
| Hybrid (708) | 35.4 | **Increasing with scale** |

### Reliability

| Configuration | Delivery Rate | Mesh Reliability | Notes |
|---------------|---------------|------------------|-------|
| Flat (2-50) | 90-100% | N/A | Optimal |
| Flat (300) | 85-91% | N/A | Breaking point |
| Hybrid (358) | 97.1% | 100% | Very good |
| Hybrid (708) | 97.8% | 100% | Excellent |

---

## Future Patterns (Not Implemented)

### Adaptive Topology Switching
- Start flat hierarchical
- Auto-switch to hybrid when agent count exceeds 200
- Requires dynamic coordinator election

### Regional Hybrid
- Geographic distribution of coordinators
- Lower latency for regional workers
- Requires cross-region mesh coordination

### Elastic Scaling
- Add/remove coordinators based on load
- Requires coordinator hot-add/remove
- Worker reassignment on coordinator failure

---

## References

- **MVP Results**: `planning/agent-coordination-v2/MVP_CONCLUSIONS.md`
- **Working Implementation**: `tests/cli-coordination/mvp-coordinator.sh`
- **Message Bus**: `tests/cli-coordination/message-bus.sh`
- **Risk Analysis**: `planning/agent-coordination-v2/CLI_COORDINATION_RISK_ANALYSIS.md`
