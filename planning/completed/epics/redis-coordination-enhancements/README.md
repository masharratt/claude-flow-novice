# Redis Coordination Enhancements Epic

**Epic ID:** `redis-coordination-enhancements`
**Version:** 2.0.0
**Priority:** High
**Estimated Duration:** 5-7 days

## Overview

Production-grade enhancements to the Redis Coordination skill, focusing on resilience, observability, and operational excellence for large-scale agent orchestration.

## Business Value

- **Reliability**: Quorum-based consensus prevents single agent failures from blocking entire swarms
- **Observability**: Comprehensive metrics enable production monitoring and debugging
- **User Experience**: Graceful shutdown and health checks improve control and responsiveness
- **Performance**: Priority wake-ups and dynamic timeouts optimize resource utilization
- **Operations**: Error recovery and DLQ reduce manual intervention requirements

## Enhancements Summary

| # | Feature | Priority | Impact | Complexity |
|---|---------|----------|--------|------------|
| 1 | Error Recovery & Resilience | Critical | High | Medium |
| 3 | Partial Consensus & Quorum | Critical | High | High |
| 4 | Dynamic Timeout Adjustment | High | Medium | Medium |
| 5 | Priority Wake-Up Queue | Medium | Medium | Medium |
| 7 | Agent Health Checks | High | High | Medium |
| 8 | Graceful Shutdown | High | Medium | Low |
| 2 | Metrics Export & Observability | Medium | High | High |

## Phase Execution Order

```
Phase 1: Error Recovery (Foundation)
    ├─> Phase 2: Partial Consensus (Critical Path)
    │   └─> Phase 5: Health Checks (Builds on Quorum)
    │       └─> Phase 7: Metrics Export (Final Integration)
    │
    ├─> Phase 3: Dynamic Timeouts (Parallel Track)
    ├─> Phase 4: Priority Wake-Ups (Parallel Track)
    └─> Phase 6: Graceful Shutdown (Parallel Track)
```

**Recommended Execution:**
1. Phase 1 (Day 1) - Foundation for all other phases
2. Phase 2 + Phase 6 (Day 2) - Critical resilience features
3. Phase 3 + Phase 4 (Day 3) - Performance optimizations
4. Phase 5 (Day 4) - Health monitoring
5. Phase 7 (Days 5-6) - Observability and metrics

## Key Features

### 1. Error Recovery & Resilience (Phase 1)
- Automatic retry with exponential backoff
- Dead letter queue for permanently failed signals
- Configurable retry policies

**Use Case:** Agent crashes mid-execution → Automatic retry 3 times before DLQ

### 2. Partial Consensus & Quorum (Phase 2)
- Continue with 6/7 agents instead of failing entire swarm
- Percentage or absolute quorum configuration
- Per-loop quorum thresholds

**Use Case:** One agent times out → Swarm continues if 85% quorum met

### 3. Dynamic Timeout Adjustment (Phase 3)
- Per-agent timeout based on role
- Researcher agents: 2 hours, Coders: 1 hour, Reviewers: 30 minutes
- Swarm-level timeout overrides

**Use Case:** Long-running research doesn't timeout while reviewers complete quickly

### 4. Priority Wake-Up Queue (Phase 4)
- Critical agents wake first during iterations
- Priority levels: 0-100 (lower = higher priority)
- Product Owner → Validators → Implementers ordering

**Use Case:** Validators wake immediately while implementers wait for feedback

### 5. Agent Health Checks (Phase 5)
- Heartbeat every 30 seconds during long tasks
- Detect hung agents before timeout expires
- Fail-fast for unresponsive agents

**Use Case:** Agent hangs on infinite loop → Detected in 60s vs waiting 1 hour timeout

### 6. Graceful Shutdown (Phase 6)
- User-initiated cancellation with `cancel-swarm.sh`
- Clean shutdown signal to all agents
- Proper resource cleanup

**Use Case:** User realizes task specification is wrong → Cancel mid-execution

### 7. Metrics Export & Observability (Phase 7)
- Prometheus/OpenTelemetry compatible metrics
- Grafana dashboard for visualization
- Iteration duration, consensus trends, agent latency

**Use Case:** Debug why consensus isn't converging → View metrics dashboard

## Deliverables

### New Scripts (7)
- `query-dlq.sh` - Inspect dead letter queue
- `get-agent-timeout.sh` - Resolve agent-specific timeout
- `heartbeat.sh` - Send/check agent heartbeats
- `cancel-swarm.sh` - Gracefully shutdown swarm
- `metrics-export.sh` - Export metrics in multiple formats
- `test-quorum.sh` - Quorum validation tests
- Enhanced `orchestrate-cfn-loop.sh` and `invoke-waiting-mode.sh`

### Configuration
- `config.json` v2.0.0 with feature flags
- `metrics-schema.json` - Metric definitions
- `grafana-dashboard.json` - Example dashboard

### Documentation
- Updated `SKILL.md` with all enhancement examples
- Migration guide for v1.4.0 → v2.0.0
- Metrics documentation

## Backward Compatibility

All enhancements use **feature flags** in `config.json`:

```json
{
  "version": "2.0.0",
  "features": {
    "enableRetry": true,
    "enableQuorum": false,      // Opt-in (breaking change if enabled)
    "enablePriorityWake": false,
    "enableHeartbeat": true,
    "enableMetrics": true
  }
}
```

**Default behavior:** v1.4.0 compatible (only retry and metrics enabled)

## Testing Strategy

### Unit Tests (15+)
- Retry exponential backoff calculation
- Quorum threshold validation (absolute/percentage)
- Priority queue ordering
- Heartbeat TTL expiry
- DLQ entry structure

### Integration Tests (6)
- Full CFN Loop with quorum fallback
- Retry + quorum combined
- Graceful shutdown during iteration
- End-to-end metrics collection
- Priority wake-up ordering
- Heartbeat monitoring during long task

### Performance Tests (3)
- 10-agent swarm latency overhead
- Metrics collection impact
- Priority queue wake-up speed

## Success Criteria

- [ ] All 7 phases complete with passing tests
- [ ] Zero breaking changes without explicit opt-in
- [ ] Documentation includes examples for each feature
- [ ] Performance overhead <5% vs baseline v1.4.0
- [ ] Grafana dashboard successfully visualizes metrics

## Execution Command

```bash
# Parse epic and execute with CFN Loop
/parse-epic planning/epics/redis-coordination-enhancements --output /tmp/parsed-epic.json
/cfn-loop-epic "Redis Coordination Production Enhancements" --config /tmp/parsed-epic.json --mode enterprise
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes for existing users | Feature flags + default backward compatible |
| Performance degradation | Benchmark tests + <5% overhead requirement |
| Complexity increases maintenance burden | Comprehensive test suite + modular design |
| Redis dependency version conflicts | Document minimum Redis 5.0+ requirement |

## Related Documentation

- `.claude/skills/redis-coordination/SKILL.md` - Current skill documentation
- `CLAUDE.md` - CFN Loop coordination rules
- `planning/skills/MAINTENANCE_SCHEDULE.md` - Ongoing maintenance plan

---

**Created:** 2025-10-19
**Last Updated:** 2025-10-19
**Status:** Ready for Execution
