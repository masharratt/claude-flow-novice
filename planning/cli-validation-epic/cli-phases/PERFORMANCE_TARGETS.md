# CLI Coordination Performance Targets

**Purpose**: Performance benchmarks and targets for production CLI coordination

**Source**: Extracted from MVP validation data and archived SDK phase success criteria

---

## Overview

Performance targets derived from MVP testing with 2-708 agents. Targets based on proven results, not theoretical estimates.

---

## Agent Spawning Performance

### Flat Hierarchical Topology

| Agent Count | Target Spawn Time | MVP Achieved | Status |
|-------------|-------------------|--------------|--------|
| 10 agents   | <1s               | ~0.5s        | ✓ Exceeded |
| 50 agents   | <2s               | ~1s          | ✓ Exceeded |
| 100 agents  | <5s               | ~3s          | ✓ Exceeded |
| 300 agents  | <10s              | ~8s          | ✓ Exceeded |

**Production Target**: <2s for 50 agents (parallel spawning via Task tool)

### Hybrid Mesh + Hierarchical Topology

| Configuration | Target Spawn Time | MVP Achieved | Status |
|---------------|-------------------|--------------|--------|
| 7 × 50        | <15s              | ~10s         | ✓ Exceeded |
| 7 × 100       | <20s              | ~15s         | ✓ Exceeded |

**Production Target**: <15s for 500 agents (10 coordinators × 50 workers)

---

## Coordination Latency

### Message Delivery

| Metric | Target | MVP Achieved | Notes |
|--------|--------|--------------|-------|
| Single message write | <10ms | ~5ms | flock + sync overhead |
| Message read | <5ms | ~2ms | /dev/shm read |
| Batch write (10 msgs) | <50ms | ~30ms | Atomic multi-message |

**Production Target**: <10ms (p95) for single message delivery

### Agent Resume Latency

| Scenario | Target | SDK Comparison | Notes |
|----------|--------|----------------|-------|
| Poll interval | 100ms | 50ms (SDK) | File polling frequency |
| Response detection | <200ms | <50ms (SDK) | Time from write to read |

**Production Target**: <200ms (p95) for agent response detection

**Note**: CLI uses polling (simpler) vs SDK event-driven (faster but more complex)

---

## Throughput Targets

### Message Bus Throughput

| Configuration | Target | MVP Achieved | Status |
|---------------|--------|--------------|--------|
| Flat (50 agents) | 3000 msg/sec | ~4000 msg/sec | ✓ Exceeded |
| Flat (300 agents) | 5000 msg/sec | ~6000 msg/sec | ✓ Exceeded |
| Hybrid (708 agents) | 8000 msg/sec | ~10,000 msg/sec | ✓ Exceeded |

**Production Target**: >5000 msg/sec sustained across all channels

### Agent Processing Throughput

| Configuration | Target | MVP Achieved | Notes |
|---------------|--------|--------------|-------|
| Flat (50) | 20 agents/sec | 25 agents/sec | Spawn + coordinate + collect |
| Flat (300) | 15 agents/sec | 16-19 agents/sec | Degraded at scale |
| Hybrid (358) | 25 agents/sec | 32.5 agents/sec | Improved with mesh |
| Hybrid (708) | 30 agents/sec | **35.4 agents/sec** | **Increasing with scale** |

**Production Target**: >30 agents/sec for hybrid topology (500+ agents)

---

## Reliability Targets

### Delivery Rate

| Configuration | Target | MVP Achieved | Status |
|---------------|--------|--------------|--------|
| Flat (2-50) | ≥90% | 90-100% | ✓ Met |
| Flat (50-100) | ≥90% | 96-100% | ✓ Exceeded |
| Flat (100-300) | ≥85% | 85-91% | ✓ Met |
| Hybrid (any) | ≥95% | 97-100% | ✓ Exceeded |

**Production Target**: ≥95% delivery rate for all deployments

**Critical**: Use hybrid topology for production (flat breaks at 300 agents)

### Mesh Coordinator Reliability

| Metric | Target | MVP Achieved | Status |
|--------|--------|--------------|--------|
| Coordinator response rate | ≥95% | 100% | ✓ Exceeded |
| Worker delivery rate | ≥90% | 97-100% | ✓ Exceeded |

**Production Target**: 100% mesh coordinator reliability (all coordinators respond)

---

## Completion Detection

### Time to Detect Completion

| Configuration | Target | MVP Method | Notes |
|---------------|--------|------------|-------|
| Flat (50) | <5s | File polling | 100ms poll interval |
| Flat (300) | <15s | File polling | Includes spawn time |
| Hybrid (708) | <25s | 2-level polling | Coordinators + master |

**Production Target**: <30s total time from start to completion detection

### False Positive Rate

| Metric | Target | MVP Achieved | Notes |
|--------|--------|--------------|-------|
| Premature completion | 0% | 0% | Wait for all N responses |
| Missed completions | 0% | 0% | 30s timeout safety |

**Production Target**: 0% false completion detection (wait for all agents or timeout)

---

## Resource Usage

### Memory per Agent

| Component | Target | Typical Usage | Notes |
|-----------|--------|---------------|-------|
| Agent process | <50MB | ~20MB | Bash process |
| Message file | <1KB | ~500 bytes | Response data |
| /dev/shm usage | <100MB total | ~50MB for 708 agents | Temporary files |

**Production Target**: <100MB total /dev/shm usage for 500 agents

### File Descriptor Limits

| Metric | Target | Notes |
|--------|--------|-------|
| Open FDs per coordinator | <1000 | Workers + message files |
| System FD limit | >10,000 | ulimit -n |

**Production Target**: <1000 FDs per coordinator process

### CPU Usage

| Phase | Target | Notes |
|-------|--------|-------|
| Spawn | <50% per core | Parallel spawning burst |
| Coordination | <20% per core | File polling + message processing |
| Idle | <5% per core | Waiting for responses |

**Production Target**: <50% CPU during spawn burst, <20% during coordination

---

## Scalability Targets

### Flat Hierarchical Limits

| Metric | Target | Breaking Point | Notes |
|--------|--------|----------------|-------|
| Max agents | 300 | 300-400 agents | <85% delivery beyond 300 |
| Max coordination time | 15s | 13s at 300 agents | Acceptable for production |
| Min delivery rate | 85% | 84% at 400 agents | Unacceptable |

**Production Limit**: 300 agents max for flat topology

### Hybrid Topology Limits

| Metric | Target | Tested Max | Notes |
|--------|--------|------------|-------|
| Max agents | 1000+ | 708 proven | Extrapolated to 1000+ |
| Coordinators | 10-15 | 7 tested | User preference: max 50/coordinator |
| Workers per coordinator | 50-100 | 100 tested | Recommend 50 for stability |
| Total coordination time | <30s | 20s at 708 agents | Linear scaling observed |

**Production Target**: 500-750 agents (10-15 coordinators × 50 workers)

---

## Failure Recovery Targets

### Coordinator Failure Detection

| Metric | Target | Method | Notes |
|--------|--------|--------|-------|
| Detection time | <5s | Health check timeout | Poll coordinator status |
| Failover time | <10s | Backup election | Not implemented (future) |

**Production Target**: <5s to detect coordinator failure

### Worker Failure Handling

| Metric | Target | Method | Notes |
|--------|--------|--------|-------|
| Detection time | <30s | Response timeout | Worker doesn't report |
| Retry strategy | 0 retries | Fail fast | Don't block other agents |
| Impact on swarm | <1% delivery drop | Isolated failure | Other workers unaffected |

**Production Target**: <30s to detect and report worker failure

---

## Long-Running Stability

### 24-Hour Continuous Operation (Risk #2 Validation)

| Metric | Target | Notes |
|--------|--------|-------|
| Memory growth | <20% over 24h | No leaks |
| FD leaks | 0 | Close all handles |
| Delivery rate drift | <5% | Consistent performance |
| Crash rate | 0 | Stable for 24h |

**Production Target**: Stable 24h operation with <20% memory growth

**Validation Required**: 24h test with 150-250 agents before production

---

## Production Environment Targets (Risk #1 Validation)

### Docker Environment

| Metric | Target | Baseline | Notes |
|--------|--------|----------|-------|
| Coordination time | <2× WSL | WSL baseline | Expect slower due to overlay FS |
| Delivery rate | ≥90% | WSL: 97%+ | Some degradation acceptable |
| /dev/shm availability | Required | Check mount | Critical dependency |

**Production Target**: ≤2× WSL performance in Docker

### Kubernetes Environment

| Metric | Target | Notes |
|--------|--------|-------|
| Pod scheduling time | <10s | Coordinator pods |
| Inter-pod latency | <50ms | Network coordination |
| /dev/shm mode | hostPath or emptyDir | Volume mount required |

**Production Target**: K8s coordination overhead <20%

### Cloud VM (AWS/GCP/Azure)

| Metric | Target | Notes |
|--------|--------|-------|
| /dev/shm size | ≥256MB | Enough for 500+ agents |
| Disk I/O | Low impact | tmpfs is RAM-backed |
| Network overhead | <10ms | Single VM: local IPC |

**Production Target**: Cloud VM performance within 10% of bare metal

**Validation Required**: Test in 3+ environments (Docker, K8s, cloud VM) before production

---

## Real Workload Performance (Risk #3 Validation)

### Overhead with Real Tasks

| Task Type | Target Overhead | Notes |
|-----------|-----------------|-------|
| Code generation | <10% | Actual Claude Code work |
| Test execution | <10% | npm test, pytest, cargo test |
| Build operations | <10% | npm run build, cargo build |

**Production Target**: <10% coordination overhead vs Task tool alone

**Validation Required**: 50 agents running real Claude Code tasks (code gen, tests, builds)

---

## Comparison: CLI vs SDK Approach

### Performance Tradeoffs

| Metric | CLI (Bash) | SDK (TypeScript) | Winner |
|--------|------------|------------------|--------|
| Spawn time | 1-2s | <2s (session fork) | Tie |
| Message latency | ~10ms | ~5ms (event-driven) | SDK |
| Throughput | 5000-10,000 msg/sec | 8000+ msg/sec | CLI |
| Complexity | Minimal | High | CLI |
| Dependencies | Zero | SDK + TypeScript | CLI |
| Proven scale | 708 agents | Unvalidated | CLI |
| Reliability | 97-100% | Unknown | CLI |

**Decision**: CLI approach preferred despite slightly slower message latency due to simplicity, proven scale, and zero dependencies.

---

## Monitoring Recommendations

### Key Metrics to Track

1. **Delivery Rate**: % of agents that respond (target: ≥95%)
2. **Coordination Time**: Start to completion (target: <30s for 500 agents)
3. **Throughput**: Agents/second (target: >30 agents/sec)
4. **Memory Usage**: /dev/shm utilization (target: <100MB)
5. **FD Leaks**: Open file descriptors (target: <1000/coordinator)
6. **Error Rate**: Failed spawns or timeouts (target: <5%)

### Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Delivery rate | <90% | <85% | Reduce agent count or switch to hybrid |
| Coordination time | >30s | >45s | Investigate bottlenecks |
| Memory growth | >50MB/h | >100MB/h | Check for leaks |
| FD count | >800 | >1000 | Close unused handles |

---

## References

- **MVP Results**: `planning/agent-coordination-v2/MVP_CONCLUSIONS.md`
- **Risk Analysis**: `planning/agent-coordination-v2/CLI_COORDINATION_RISK_ANALYSIS.md`
- **Production Plan**: `planning/agent-coordination-v2/CLI_COORDINATION_PRODUCTION_PLAN.md`
- **Working Implementation**: `tests/cli-coordination/mvp-coordinator.sh`
