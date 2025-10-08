# Metrics Collection Implementation Roadmap

**Phase**: 1.1 → 1.2 → 1.3
**Duration**: 5-7 days total
**Owner**: System Architect + Implementation Team

## Context

This roadmap guides implementation of the metrics collection architecture designed in Sprint 1.1. The architecture supports 500+ agent coordination with <1% overhead through sharded lock-free collection.

**Prerequisites**:
- ✅ Architecture design complete (Sprint 1.1)
- ✅ Scalability validated (708 agents proven)
- ✅ Integration path defined (bash hooks + TypeScript bridge)

## Phase 1.2: Core Implementation (2-3 days)

### Milestone 1: Sharded Metrics Emission (Day 1)

**Objective**: Implement lock-free sharded metrics collection

**Deliverables**:
1. `emit_metric()` function with sharding logic
2. Automatic shard file initialization
3. Non-blocking lock acquisition with fail-fast
4. JSONL format validation

**Implementation Checklist**:
```bash
# File: src/coordination/cli/metrics-emitter.sh

- [ ] Implement get_metrics_shard() modulo function
- [ ] Create emit_metric() with error handling
- [ ] Add timestamp generation (ISO 8601 UTC)
- [ ] Implement flock non-blocking lock
- [ ] Add JSONL formatting with escaping
- [ ] Create shard file auto-initialization
- [ ] Add metric validation (name, value, agent_id)
- [ ] Implement silent drop on lock failure
```

**Acceptance Criteria**:
- Metrics written to correct shard (agent_id % 16)
- Lock acquisition <0.5ms (99th percentile)
- Write operation <0.5ms (99th percentile)
- JSONL format valid (passes `jq` parsing)
- Silent failure on lock contention (no errors)

**Testing**:
```bash
# Unit test
test_emit_metric_sharding() {
  emit_metric 42 "test_metric" 123
  local shard=$((42 % 16))
  grep -q '"agent":"agent-42"' "/dev/shm/cfn-metrics-${shard}.jsonl"
}

# Concurrency test
test_concurrent_emission() {
  for i in {0..99}; do
    emit_metric $i "concurrent_test" $i &
  done
  wait
  # Verify all 100 metrics written
  [ $(cat /dev/shm/cfn-metrics-*.jsonl | wc -l) -eq 100 ]
}
```

### Milestone 2: Real-Time Analysis Pipeline (Day 2)

**Objective**: Build aggregation and alerting system

**Deliverables**:
1. `analyze_metrics()` streaming aggregation
2. Configurable time-range queries
3. Multi-metric grouping and statistics
4. Threshold-based alerting

**Implementation Checklist**:
```bash
# File: src/coordination/cli/metrics-analyzer.sh

- [ ] Implement analyze_metrics() with jq streaming
- [ ] Add time-range filtering (--since parameter)
- [ ] Calculate count, avg, min, max, p50, p95, p99
- [ ] Group by metric name
- [ ] Group by agent ID (optional)
- [ ] Implement check_alerts() with configurable thresholds
- [ ] Add alert output channels (console, log file)
- [ ] Create alert deduplication (5-minute window)
```

**Acceptance Criteria**:
- Analysis completes <100ms for 30-second window
- Supports 10+ simultaneous metrics
- Calculates statistics correctly (validated against known data)
- Alerts trigger within 30 seconds of threshold breach
- No duplicate alerts within 5-minute window

**Testing**:
```bash
# Analysis test
test_analyze_metrics_performance() {
  # Generate 1000 metrics
  for i in {0..999}; do
    emit_metric $i "test" $((RANDOM % 100))
  done

  # Time analysis
  local start=$(date +%s%3N)
  analyze_metrics --since "1 minute ago"
  local end=$(date +%s%3N)
  local duration=$((end - start))

  # Verify <100ms
  [ $duration -lt 100 ]
}

# Alerting test
test_alert_threshold() {
  emit_metric 1 "coordination_time_ms" 15000  # Above 10s threshold
  sleep 31  # Wait for 30s check interval
  grep -q "Coordination time elevated" /dev/shm/alerts.log
}
```

### Milestone 3: Background Persistence (Day 3)

**Objective**: Implement disk sync and retention policy

**Deliverables**:
1. `sync_metrics_to_disk()` background daemon
2. Atomic sync with rsync
3. Daily rotation and compression
4. 30-day retention policy

**Implementation Checklist**:
```bash
# File: src/coordination/cli/metrics-sync.sh

- [ ] Implement sync_metrics_to_disk() with rsync
- [ ] Add atomic sync (--append-verify flag)
- [ ] Create rotation logic (midnight check)
- [ ] Implement gzip compression for previous day
- [ ] Add 30-day cleanup (delete old files)
- [ ] Implement daemon mode (5-minute loop)
- [ ] Add health checks (disk space, permissions)
- [ ] Create manual sync trigger (SIGUSR1 handler)
```

**Acceptance Criteria**:
- Sync completes <1s for 29 MB data
- No data loss during sync (atomic operation)
- Compression achieves >60% reduction
- Old files deleted after 30 days
- Daemon restarts on failure (systemd/supervisord)

**Testing**:
```bash
# Sync test
test_metrics_sync() {
  # Generate metrics
  for i in {0..1000}; do
    emit_metric $i "test" $i
  done

  # Trigger sync
  sync_metrics_to_disk

  # Verify files copied
  [ -f /metrics/archive/cfn-metrics-0.jsonl ]
  [ $(ls /metrics/archive/cfn-metrics-*.jsonl | wc -l) -eq 16 ]
}

# Rotation test
test_daily_rotation() {
  # Create yesterday's files
  touch -d yesterday /dev/shm/cfn-metrics-{0..15}.jsonl

  # Trigger rotation
  rotate_metrics

  # Verify compression
  [ -f /metrics/archive/cfn-metrics-$(date -d yesterday +%Y%m%d)-0.jsonl.gz ]
}
```

## Phase 1.3: Integration & Validation (1-2 days)

### Milestone 4: Coordinator Integration (Day 4)

**Objective**: Add metrics hooks to coordination system

**Deliverables**:
1. Metrics hooks in `coordinator.sh`
2. Critical metrics tracked (3 per agent)
3. TypeScript SDK bridge implementation
4. End-to-end testing

**Implementation Checklist**:
```bash
# File: src/coordination/cli/coordinator.sh (modifications)

- [ ] Add emit_metric() source in coordinator
- [ ] Hook after_agent_spawn event
- [ ] Hook after_message_sent event
- [ ] Hook after_task_complete event
- [ ] Add coordination_time_ms tracking
- [ ] Add message_delivery_rate calculation
- [ ] Add memory_usage_mb monitoring
- [ ] Implement error handling (silent failures)
```

```typescript
// File: src/coordination/metrics-bridge.ts (new)

- [ ] Create MetricsBridge class
- [ ] Implement recordCoordinationTime()
- [ ] Implement recordMessageDelivery()
- [ ] Implement recordMemoryUsage()
- [ ] Add execSync error handling
- [ ] Create TypeScript type definitions
- [ ] Add unit tests
```

**Acceptance Criteria**:
- All 3 critical metrics emitted for each agent
- TypeScript agents can emit metrics
- No coordination slowdown (overhead <1%)
- Metrics queryable in real-time

**Testing**:
```bash
# End-to-end test
test_full_coordination_with_metrics() {
  # Run 50 agent coordination
  run_coordination --agents 50 --metrics-enabled

  # Verify metrics collected
  local metric_count=$(cat /dev/shm/cfn-metrics-*.jsonl | wc -l)
  [ $metric_count -ge 150 ]  # 50 agents × 3 metrics minimum

  # Verify overhead
  local baseline_time=$(run_coordination --agents 50 --no-metrics)
  local metrics_time=$(run_coordination --agents 50 --metrics-enabled)
  local overhead=$(echo "scale=2; ($metrics_time - $baseline_time) / $baseline_time * 100" | bc)
  [ $(echo "$overhead < 1" | bc) -eq 1 ]
}
```

### Milestone 5: Production Validation (Day 5)

**Objective**: Validate at 500 agent scale in production-like environment

**Deliverables**:
1. 500-agent scalability test
2. 24-hour stability test
3. Docker/Kubernetes deployment
4. Performance benchmarks

**Implementation Checklist**:
```bash
# Scalability validation
- [ ] Run 500-agent coordination with metrics
- [ ] Verify overhead <1%
- [ ] Verify delivery rate >90%
- [ ] Check shard distribution (balanced load)
- [ ] Validate analysis performance (<100ms)

# Stability validation
- [ ] Run 24-hour continuous coordination
- [ ] Monitor for memory leaks
- [ ] Check for file descriptor exhaustion
- [ ] Verify sync daemon uptime
- [ ] Validate disk space usage

# Deployment validation
- [ ] Deploy to Docker container
- [ ] Deploy to Kubernetes pod
- [ ] Verify tmpfs allocation (1GB)
- [ ] Test persistence across restarts
- [ ] Validate Prometheus export
```

**Acceptance Criteria**:
- 500 agents: <0.4% overhead, >90% delivery
- 24-hour run: No errors, no memory leaks
- Docker/K8s: Metrics work identically to bare metal
- Benchmarks: Match architecture predictions

**Testing**:
```bash
# 500-agent scale test
test_500_agent_scale() {
  local start=$(date +%s)
  run_coordination --agents 500 --metrics-enabled --duration 60s
  local end=$(date +%s)

  # Verify metrics volume
  local metric_count=$(cat /dev/shm/cfn-metrics-*.jsonl | wc -l)
  [ $metric_count -ge 1500 ]  # 500 agents × 3 metrics minimum

  # Verify overhead
  local avg_overhead=$(analyze_metrics | jq -r '.overhead_percent')
  [ $(echo "$avg_overhead < 0.5" | bc) -eq 1 ]
}

# 24-hour stability test
test_24_hour_stability() {
  # Start coordination with metrics
  run_coordination --agents 500 --metrics-enabled --duration 86400s &
  local pid=$!

  # Monitor every hour
  for hour in {1..24}; do
    sleep 3600
    check_metrics_health || fail "Health check failed at hour $hour"
    check_memory_usage || fail "Memory leak detected at hour $hour"
  done

  # Verify no crashes
  ps -p $pid > /dev/null || fail "Coordination crashed before 24 hours"
}
```

## Deliverables Summary

### Code Artifacts
```
src/coordination/cli/
├── metrics-emitter.sh        # Core emission function (Milestone 1)
├── metrics-analyzer.sh       # Real-time analysis (Milestone 2)
├── metrics-sync.sh           # Background persistence (Milestone 3)
└── coordinator.sh            # Integration hooks (Milestone 4)

src/coordination/
└── metrics-bridge.ts         # TypeScript SDK bridge (Milestone 4)

tests/
├── unit/metrics-emission.test.sh
├── unit/metrics-analysis.test.sh
├── unit/metrics-sync.test.sh
├── integration/metrics-coordination.test.sh
└── benchmarks/metrics-overhead.bench.sh
```

### Documentation Artifacts
```
planning/agent-coordination-v2/
├── METRICS_COLLECTION_ARCHITECTURE.md     # Sprint 1.1 (completed)
├── METRICS_SCALABILITY_DIAGRAM.txt        # Sprint 1.1 (completed)
├── METRICS_IMPLEMENTATION_ROADMAP.md      # This document
└── METRICS_OPERATIONAL_RUNBOOK.md         # Sprint 1.3 (to be created)
```

### Configuration Artifacts
```
config/
├── metrics-config.sh         # Shard count, retention policy, thresholds
└── docker-compose.yml        # Production deployment config

kubernetes/
└── metrics-deployment.yaml   # K8s deployment manifest
```

## Success Criteria

### Sprint 1.2 Success Criteria
**Core Implementation Complete**:
- ✅ emit_metric() function working with sharding
- ✅ analyze_metrics() aggregation <100ms
- ✅ sync_metrics_to_disk() daemon running
- ✅ All unit tests passing
- ✅ Overhead <1% at 100 agent scale

### Sprint 1.3 Success Criteria
**Production Ready**:
- ✅ Coordinator integration complete
- ✅ TypeScript bridge functional
- ✅ 500-agent scale validated (<0.4% overhead)
- ✅ 24-hour stability test passed
- ✅ Docker/K8s deployment working
- ✅ Operational runbook created

## Risk Mitigation

### Risk 1: Lock Contention at Scale
**Mitigation**: Sharding reduces contention by 94% (16 shards for 500 agents)
**Validation**: Concurrent emission test with 100 agents
**Fallback**: Increase shard count to 32 if needed

### Risk 2: tmpfs Capacity
**Mitigation**: 29 MB/day at 500 agents is negligible for 1GB allocation
**Validation**: Monitor tmpfs usage in 24-hour test
**Fallback**: Increase tmpfs size or reduce retention to 12 hours

### Risk 3: Sync Daemon Failure
**Mitigation**: systemd/supervisord auto-restart
**Validation**: Kill sync daemon and verify restart within 30s
**Fallback**: Manual sync trigger on next coordination cycle

### Risk 4: TypeScript Bridge Overhead
**Mitigation**: execSync is synchronous but fast (<1ms)
**Validation**: Benchmark TypeScript metric emission
**Fallback**: Async queue if synchronous execution too slow

## Timeline & Resource Allocation

```
Week 1: Sprint 1.2 (Core Implementation)
├── Day 1: Milestone 1 - Sharded Metrics Emission
│   └── Owner: Backend Engineer
├── Day 2: Milestone 2 - Real-Time Analysis Pipeline
│   └── Owner: Backend Engineer + Data Engineer
└── Day 3: Milestone 3 - Background Persistence
    └── Owner: DevOps Engineer

Week 2: Sprint 1.3 (Integration & Validation)
├── Day 4: Milestone 4 - Coordinator Integration
│   └── Owner: Backend Engineer + TypeScript Developer
└── Day 5-6: Milestone 5 - Production Validation
    └── Owner: QA Engineer + DevOps Engineer

Week 3: Buffer & Documentation
└── Day 7: Operational runbook, cleanup, final validation
    └── Owner: System Architect + Technical Writer
```

## Next Steps After Completion

### Phase 2: Advanced Features (Optional)
1. **Prometheus Integration** (1 day)
   - Expose metrics at localhost:9090/metrics
   - Implement Prometheus exporter format
   - Add Grafana dashboard

2. **DataDog/New Relic Integration** (1 day)
   - Bridge to existing MetricsCollector class
   - Configure API push endpoints
   - Validate external monitoring

3. **Anomaly Detection** (2 days)
   - Statistical outlier detection
   - Machine learning baseline
   - Automated remediation triggers

4. **Historical Trend Analysis** (2 days)
   - 30-day trend visualization
   - Performance regression detection
   - Capacity planning recommendations

## Confidence Assessment

**Implementation Feasibility**:

| Milestone | Risk | Complexity | Duration | Confidence |
|-----------|------|------------|----------|------------|
| 1. Sharded Emission | Low | Low | 1 day | 95% |
| 2. Analysis Pipeline | Low | Medium | 1 day | 90% |
| 3. Persistence | Low | Low | 1 day | 95% |
| 4. Integration | Medium | Medium | 1 day | 85% |
| 5. Validation | Medium | High | 2 days | 80% |

**Overall Confidence**: 90%

**Reasoning**:
- Architecture proven at 708 agent scale
- Sharding design eliminates known bottlenecks
- Simple bash + jq implementation (no complex dependencies)
- Clear acceptance criteria and testing strategy
- Fallback plans for identified risks

```json
{
  "phase": "1.2-1.3",
  "duration_estimate": "5-7 days",
  "confidence": 0.90,
  "blockers": [],
  "dependencies": [
    "Sprint 1.1 architecture approved",
    "CLI coordination MVP complete",
    "tmpfs available in production"
  ],
  "recommendation": "PROCEED"
}
```

## References

- **Architecture Design**: `METRICS_COLLECTION_ARCHITECTURE.md`
- **Scalability Analysis**: `METRICS_SCALABILITY_DIAGRAM.txt`
- **CLI Coordination MVP**: `MVP_CONCLUSIONS.md`
- **Risk Analysis**: `CLI_COORDINATION_RISK_ANALYSIS.md`
- **Existing Metrics**: `src/coordination/metrics.ts`, `src/monitoring/metrics-collector.ts`
