# CLI Coordination V2 - Production Implementation Epic

## Epic Overview

**Goal**: Implement production-ready CLI-based agent coordination system capable of scaling to 500+ agents with <10s coordination time, deployable to local and cloud environments.

**Strategic Approach**: Lightweight validation (Sprint 0) + iterative implementation with built-in decision gates, replacing the previous validation-heavy multi-week approach.

**Timeline**: 4-6 months
**Delivery Model**: Phased rollout with GO/NO-GO gates at each phase
**Success Metric**: 500+ agents coordinating in <10s with ≥90% delivery rate in production

---

## Strategic Context

### Why CLI Coordination V2 Over SDK V2

**MVP Validation Results** (from `MVP_CONCLUSIONS.md`):
- Hybrid mesh topology: 708 agents with 97.8% delivery rate in 20s
- Proven technology: File-based IPC on `/dev/shm` tmpfs
- Zero external dependencies: Pure bash implementation
- Task tool integration: End-to-end validated

**SDK V2 Limitations**:
- Previous SDK approach proven less effective at scale
- Higher complexity with TypeScript state machines
- External dependencies and integration overhead
- CLI approach demonstrates superior performance

**Decision**: Prioritize CLI coordination V2 for production deployment while keeping SDK V2 as research track.

### Agent Coordination Model (Hybrid Approach)

**Phase 1-4: Dynamic Spawning with Collaboration (4-6 months)**

**Simple 3-State Lifecycle**:
```
SPAWNED → WORKING → COMPLETE (terminate)
```

**Agent Behavior While WORKING**:
- Execute assigned task
- **Collaborate**: Answer dependency questions from other agents
- **Provide data**: Share expertise/data when requested
- **Participate**: Respond to coordination messages

**Coordinator Behavior**:
```bash
# Dynamic spawning based on workload
if pending_tasks > active_agents:
  spawn_agents(needed_count)

# Agents stay alive until task complete
# Can help others while executing their own work
# Terminate after reporting results
```

**Characteristics**:
- ✅ Simple to implement (no state machine)
- ✅ Memory efficient (agents terminate when done)
- ✅ Collaboration enabled (answer questions during work)
- ✅ Proven scalable (708 agents validated)
- ❌ No explicit WAITING state (agents busy or terminated)
- ❌ No active dependency resolution (reactive help only)

**Phase 5: Enhanced Lifecycle with WAITING State (Optional, +1-1.5 months)**

**4-State Lifecycle**:
```
SPAWNED → WORKING → WAITING → COMPLETE (terminate)
```

**WAITING State Features**:
- Accept new task assignments (instant reassignment)
- Actively monitor help request queue
- Provide peer review for completed work
- Participate in dependency resolution matching

**When to Add Phase 5**:
- **After Phase 4 completes** and 500+ agents validated
- **Only if** profiling shows frequent idle time (>30%)
- **Only if** dependency bottlenecks become common
- **Only if** task reassignment latency is problematic

**Decision Criteria**:
```bash
# Evaluate after Phase 4 Stage 2 stable
idle_percentage=$(measure_agent_idle_time)
dependency_blocks=$(count_blocked_agents)
reassignment_latency=$(measure_task_assignment_time)

if [ "$idle_percentage" -gt 30 ] ||
   [ "$dependency_blocks" -gt 10 ] ||
   [ "$reassignment_latency" -gt 2000 ]; then
  echo "PROCEED to Phase 5 - WAITING state valuable"
else
  echo "SKIP Phase 5 - dynamic spawning sufficient"
fi
```

**Phase 5 is entirely optional** - can defer indefinitely if Phase 1-4 proves sufficient.

### V1/V2 Toggle Strategy

**Architecture**: Separate subsystem with catastrophic failure fallback

**Key Principles**:
1. V1 stays in place (zero disruption to existing coordination)
2. V2 implemented as independent bash-based subsystem
3. Toggle mechanism via configuration/environment variable
4. Automatic fallback to V1 on V2 failure detection
5. Gradual rollout: 10% → 50% → 100% traffic migration

**Failure Detection Triggers**:
- Coordination time >30s (2× target)
- Delivery rate <80% (below acceptable threshold)
- System resource exhaustion (memory, FD limits)
- Coordinator crash or unrecoverable error

**Toggle Implementation**:
```bash
# coordination-config.sh
export CFN_COORDINATION_VERSION="${CFN_COORDINATION_VERSION:-v1}"  # v1 (default) | v2

# Fallback logic in coordination wrapper
if [[ "$CFN_COORDINATION_VERSION" == "v2" ]]; then
  bash /path/to/v2/message-bus.sh "$@" || {
    echo "V2 failed, falling back to V1" >&2
    export CFN_COORDINATION_VERSION=v1
    # Call V1 coordination system
  }
fi
```

**Code Structure**:
```
src/coordination/
├── v1/                    # Existing coordination system (untouched)
│   ├── swarm-init.ts
│   └── ...
├── v2/                    # New CLI coordination system
│   ├── message-bus.sh
│   ├── agent-wrapper.sh
│   └── coordination-config.sh
└── coordination-router.ts # Version selection logic
```

---

## Sprint 0: Critical Smoke Tests (3 Days)

**Purpose**: Validate catastrophic failure risks BEFORE committing to 4-6 month implementation

**GO/NO-GO Decision**: End of Sprint 0 determines if epic proceeds

### Day 1: Environment Quick Test

**Objective**: Verify CLI coordination works in 3 production environments

**Test Scenarios**:
1. Docker container (default 64MB /dev/shm)
2. Docker with expanded /dev/shm (--shm-size=1g)
3. Cloud VM (AWS, GCP, or Azure - choose one)

**Test Procedure**:
```bash
# For each environment:
1. Deploy message-bus.sh and agent-wrapper.sh
2. Initialize 100 agents
3. Run simple coordination (echo tasks)
4. Measure: coordination time, delivery rate, errors
5. Check: /dev/shm access, file permissions, FD limits
```

**Success Criteria**:
- Works in ≥2 production environments
- Coordination time <10s for 100 agents
- Delivery rate ≥90%
- Zero critical errors (permission denied, tmpfs unavailable)

**Failure Actions**:
- All environments fail → PIVOT to network IPC (sockets)
- Docker fails → Use /tmp fallback or host /dev/shm mount
- Cloud VM fails → Investigate filesystem restrictions

### Day 2: 8-Hour Stability Test

**Objective**: Detect memory leaks and resource exhaustion early

**Test Scenarios**:
1. 50 agents coordinating every 5 minutes for 8 hours
2. Monitor: memory usage (RSS), FD count, tmpfs usage, coordination time

**Test Procedure**:
```bash
# Run coordination loop
for i in {1..96}; do  # 8 hours × 12 iterations/hour
  bash message-bus.sh coordinate 50 agents

  # Sample metrics every 30 minutes
  if [[ $((i % 6)) -eq 0 ]]; then
    ps aux | grep message-bus  # Memory usage
    lsof | grep /dev/shm | wc -l  # FD count
    df -h /dev/shm  # tmpfs usage
  fi

  sleep 300  # 5 minutes
done
```

**Success Criteria**:
- Memory growth <10% over 8 hours
- FD count stable (no leaks)
- Coordination time variance <20%
- Zero crashes or hangs

**Failure Actions**:
- Memory leak detected → Implement cleanup hooks before Phase 1
- FD exhaustion → Add file handle pooling
- Crashes → Fix critical bugs, rerun test

### Day 3: GO/NO-GO Decision

**Decision Authority**: Product Owner with GOAP algorithm

**GO Criteria** (ALL must pass):
- ✅ Works in ≥2 production environments
- ✅ 8-hour stability with no resource leaks
- ✅ Coordination performance within targets

**NO-GO Criteria** (ANY triggers pivot):
- ❌ Fails in all tested environments
- ❌ Memory leak or FD exhaustion detected
- ❌ Critical stability issues unfixable in 1 day

**Pivot Options**:
1. Network IPC: Replace file-based with socket-based message bus
2. Hybrid Approach: TypeScript coordination + bash execution
3. Scope Reduction: Target only bare metal Linux (no containers)
4. Epic Deferral: Focus on SDK V2 instead

**Decision Output**:
```json
{
  "decision": "GO|NO-GO|PIVOT",
  "confidence": 0.95,
  "blockers": [],
  "next_phase": "Phase 1: Foundation",
  "timeline_adjustment": "+0 weeks"
}
```

---

## Phase 1: Foundation (4-6 Weeks)

**Objective**: Implement core coordination infrastructure with monitoring, health checks, and operational tooling

**Success Criteria**: 100-agent swarms coordinating reliably with ≥95% delivery rate

### Sprint 1.1: Monitoring & Metrics (1 week)

**Deliverables**:
- Metrics emission framework (`emit_metric()` function)
- Metrics collection: coordination time, delivery rate, inbox depth
- JSONL metrics file for analysis
- Basic alerting thresholds

**Agent Team** (5 agents):
- backend-dev: Implement metrics emission in message-bus.sh
- devops-engineer: Set up metrics collection pipeline
- coder: Create metrics analysis scripts
- tester: Validate metrics accuracy
- reviewer: Code review and integration testing

**Validation Checkpoints**:
- All coordination events emit metrics
- Metrics file format correct and parseable
- No performance impact from metrics (<1% overhead)

**Decision Gate**: Metrics proven accurate → Proceed to Sprint 1.2

### Sprint 1.2: Health Checks & Liveness (1 week)

**Deliverables**:
- Health check function (`report_health()`)
- Liveness tracking for coordinators and workers
- Health status API endpoint
- Unhealthy agent detection and alerting

**Agent Team** (5 agents):
- backend-dev: Implement health check system
- system-architect: Design liveness tracking architecture
- devops-engineer: Health check monitoring integration
- tester: Test failure detection accuracy
- reviewer: Validate health check reliability

**Validation Checkpoints**:
- Health checks detect failed agents within 30s
- False positive rate <1%
- Health status accurate for 100-agent swarm

**Decision Gate**: Health checks reliable → Proceed to Sprint 1.3

### Sprint 1.3: Configuration Management (1 week)

**Deliverables**:
- Configuration file (`coordination-config.sh`)
- Environment variable overrides
- Configuration validation on startup
- Documentation for all config options

**Agent Team** (4 agents):
- coder: Implement configuration system
- api-docs: Document configuration options
- tester: Test configuration edge cases
- reviewer: Validate configuration loading

**Validation Checkpoints**:
- All configuration options documented
- Invalid configurations detected on startup
- Defaults work for 100-agent swarm

**Decision Gate**: Configuration system robust → Proceed to Sprint 1.4

### Sprint 1.4: Graceful Shutdown (1 week)

**Deliverables**:
- Shutdown hook (`shutdown_agent()` function)
- Inbox draining logic
- Cleanup on exit
- Signal handler integration (SIGTERM, SIGINT)

**Agent Team** (4 agents):
- backend-dev: Implement shutdown hooks
- coder: Signal handler integration
- tester: Test shutdown scenarios
- reviewer: Validate resource cleanup

**Validation Checkpoints**:
- All messages processed before shutdown
- No orphaned processes or files
- Shutdown time <5s for 100 agents

**Decision Gate**: Shutdown reliable → Proceed to Sprint 1.5

### Sprint 1.5: Rate Limiting & Backpressure (1-2 weeks)

**Deliverables**:
- Inbox size limits (MAX_INBOX_SIZE)
- Backpressure mechanism (sender waits if full)
- Overflow detection and alerting
- Dynamic rate limiting based on system load

**Agent Team** (5 agents):
- backend-dev: Implement rate limiting
- perf-analyzer: Tune rate limit thresholds
- system-architect: Design backpressure mechanism
- tester: Test overflow scenarios
- reviewer: Validate rate limiting logic

**Validation Checkpoints**:
- Inbox overflow prevented (<1000 messages)
- Backpressure maintains stability under load
- No deadlocks from rate limiting

**Decision Gate**: Rate limiting effective → Proceed to Phase 1 Gate

### Phase 1 Decision Gate

**Success Criteria** (ALL must pass):
- ✅ 100-agent swarm: ≥95% delivery rate
- ✅ Coordination time: <5s
- ✅ Metrics accurate and low-overhead
- ✅ Health checks reliable (false positive <1%)
- ✅ Graceful shutdown working
- ✅ Rate limiting prevents overflow

**GO Decision**: Proceed to Phase 2 (Testing & Validation)
**PIVOT Decision**: Adjust architecture or extend Phase 1 timeline
**NO-GO Decision**: Escalate to human for epic re-evaluation

---

## Phase 2: Testing & Validation (3-4 Weeks)

**Objective**: Comprehensive testing coverage to ensure production reliability

**Success Criteria**: 80%+ test coverage, load tested to 300 agents

### Sprint 2.1: Unit Testing (1 week)

**Deliverables**:
- Unit tests for all message-bus.sh functions
- Test framework setup (bash testing library)
- Mocking/stubbing utilities for file operations
- CI integration for automated testing

**Agent Team** (5 agents):
- tester: Write unit tests
- coder: Implement test framework
- devops-engineer: CI/CD integration
- backend-dev: Mock utilities for file I/O
- reviewer: Test review and coverage analysis

**Validation Checkpoints**:
- 80%+ function coverage
- All critical paths tested
- Tests run in <60s

**Decision Gate**: Unit tests comprehensive → Proceed to Sprint 2.2

### Sprint 2.2: Integration Testing (1 week)

**Deliverables**:
- Agent wrapper integration tests
- Coordinator-worker flow tests
- Multi-agent coordination scenarios
- Error injection tests (simulated failures)

**Agent Team** (5 agents):
- tester: Write integration tests
- backend-dev: Test harness for coordination flows
- coder: Error injection utilities
- system-architect: Test scenario design
- reviewer: Validate test coverage

**Validation Checkpoints**:
- End-to-end flows tested
- Error scenarios handled correctly
- Integration tests run in <5 minutes

**Decision Gate**: Integration tests passing → Proceed to Sprint 2.3

### Sprint 2.3: Load Testing (1 week)

**Deliverables**:
- Load test scripts (100, 200, 300 agents)
- Performance benchmark suite
- Scalability analysis report
- Bottleneck identification

**Agent Team** (6 agents):
- perf-analyzer: Design load tests
- tester: Implement load test scripts
- backend-dev: Performance instrumentation
- system-architect: Scalability analysis
- devops-engineer: Load test infrastructure
- reviewer: Results validation

**Validation Checkpoints**:
- 100 agents: <5s, ≥95% delivery
- 200 agents: <8s, ≥92% delivery
- 300 agents: <12s, ≥90% delivery

**Decision Gate**: Load targets met → Proceed to Sprint 2.4

### Sprint 2.4: Stress Testing (1 week)

**Deliverables**:
- Chaos engineering test suite
- Coordinator failure scenarios
- Resource exhaustion tests
- Recovery validation

**Agent Team** (5 agents):
- tester: Chaos test implementation
- backend-dev: Failure injection utilities
- devops-engineer: Monitoring during chaos
- system-architect: Recovery mechanism validation
- reviewer: Chaos test results analysis

**Validation Checkpoints**:
- Single coordinator failure: <30s recovery
- Resource exhaustion: graceful degradation
- All scenarios: coordination completes after recovery

**Decision Gate**: Stress tests passing → Proceed to Phase 2 Gate

### Phase 2 Decision Gate

**Success Criteria** (ALL must pass):
- ✅ Unit test coverage ≥80%
- ✅ Integration tests passing
- ✅ Load tested to 300 agents
- ✅ Chaos tests: <30s recovery

**GO Decision**: Proceed to Phase 3 (Performance Optimization)
**PIVOT Decision**: Fix critical test failures before proceeding
**NO-GO Decision**: Re-evaluate approach if fundamental issues found

---

## Phase 3: Performance Optimization (4-5 Weeks)

**Objective**: Achieve 500-agent coordination in <10s through targeted optimizations

**Success Criteria**: 500 agents coordinating in <10s with ≥90% delivery rate

### Sprint 3.1: Agent Pooling (1 week)

**Deliverables**:
- Agent pool implementation (`agent-pool.sh`)
- Pool initialization and management
- Task assignment to pooled agents
- Pool performance benchmarks

**Agent Team** (5 agents):
- backend-dev: Implement agent pooling
- perf-analyzer: Benchmark pooling performance
- system-architect: Pool lifecycle design
- tester: Test pool edge cases
- reviewer: Validate pooling logic

**Target**: 2-5× spawn time improvement

**Validation Checkpoints**:
- Pool initialization <1s for 50 agents
- Task assignment <10ms per agent
- Pool hit rate ≥70%

**Decision Gate**: Pooling achieves ≥2× improvement → Proceed to Sprint 3.2

### Sprint 3.2: Batch Messaging (1 week)

**Deliverables**:
- Batch send implementation (`send_messages_batch()`)
- Optimal batch size determination
- Latency impact analysis
- Throughput benchmarks

**Agent Team** (5 agents):
- backend-dev: Implement batch messaging
- perf-analyzer: Benchmark throughput gains
- system-architect: Batch size optimization
- tester: Test batch delivery correctness
- reviewer: Validate batching logic

**Target**: 3-10× throughput improvement

**Validation Checkpoints**:
- Batch send ≥3× faster than sequential
- Latency penalty <100ms
- Delivery rate ≥95% with batching

**Decision Gate**: Batching achieves ≥3× improvement → Proceed to Sprint 3.3

### Sprint 3.3: Parallel Agent Spawning (1 week)

**Deliverables**:
- Parallel spawn implementation (`spawn_agents_parallel()`)
- Batch size tuning for system load
- Spawn failure detection and retry
- Initialization benchmarks

**Agent Team** (5 agents):
- backend-dev: Implement parallel spawning
- perf-analyzer: Benchmark spawn performance
- system-architect: Batch size optimization
- tester: Test spawn reliability
- reviewer: Validate spawn logic

**Target**: 5-10× faster initialization

**Validation Checkpoints**:
- 500 agents spawn in <2s
- Spawn failure rate <1%
- System load manageable during spawn

**Decision Gate**: Parallel spawning achieves ≥5× improvement → Proceed to Sprint 3.4

### Sprint 3.4: Message Bus Sharding (1 week)

**Deliverables**:
- Sharding implementation (`get_shard()` function)
- Shard count optimization
- Lock contention analysis
- Performance benchmarks

**Agent Team** (5 agents):
- backend-dev: Implement sharding
- perf-analyzer: Benchmark contention reduction
- system-architect: Shard count tuning
- tester: Test shard distribution
- reviewer: Validate sharding logic

**Target**: 2-3× contention reduction

**Validation Checkpoints**:
- Optimal shard count: 8-16
- Lock wait time reduced ≥2×
- Directory contention <10% of coordination time

**Decision Gate**: Sharding achieves ≥2× improvement → Proceed to Sprint 3.5

### Sprint 3.5: Integration & Benchmarking (1 week)

**Deliverables**:
- Combined optimization integration
- Full 500-agent benchmark
- Performance regression testing
- Optimization impact report

**Agent Team** (6 agents):
- backend-dev: Integrate all optimizations
- perf-analyzer: Comprehensive benchmarking
- system-architect: Performance analysis
- tester: Regression test suite
- devops-engineer: Benchmark infrastructure
- reviewer: Results validation

**Validation Checkpoints**:
- 500 agents: <10s coordination
- Delivery rate: ≥90%
- Combined optimizations additive

**Decision Gate**: 500-agent target met → Proceed to Phase 3 Gate

### Phase 3 Decision Gate

**Success Criteria** (MUST pass):
- ✅ 500 agents: <10s coordination time
- ✅ Delivery rate: ≥90%
- ✅ Combined optimizations: >5× overall improvement

**GO Decision**: Proceed to Phase 4 (Production Deployment)
**PIVOT Decision**: Adjust optimization strategy or targets
**NO-GO Decision**: Re-evaluate epic scope if targets unachievable

---

## Phase 4: Production Deployment (6-8 Weeks)

**Objective**: Gradual rollout to production with staged capacity increases

**Success Criteria**: 500-708 agents stable in production for 1 week

### Stage 1: 100 Agents (Flat Topology) - 2 Weeks

**Deployment Strategy**:
```bash
export CFN_TOPOLOGY="flat"
export CFN_MAX_AGENTS="100"
export CFN_COORDINATION_VERSION="v2"
export CFN_TRAFFIC_PERCENTAGE="10"  # 10% of traffic to V2
```

**Rollout Steps**:
1. Deploy V2 subsystem to staging (Week 1)
2. Smoke test with 10 agents
3. Gradually scale to 50, then 100 agents
4. Monitor for 3 days: delivery rate, errors, performance
5. Enable V2 for 10% of production traffic (Week 2)
6. Monitor for 1 week with V1 fallback ready

**Success Criteria**:
- ✅ 100 agents: <5s, ≥95% delivery
- ✅ Zero V2 crashes requiring V1 fallback
- ✅ Metrics dashboards healthy
- ✅ No production incidents

**Decision Gate**: Stage 1 stable for 1 week → Proceed to Stage 2

### Stage 2: 300 Agents (Hybrid Topology) - 2 Weeks

**Deployment Strategy**:
```bash
export CFN_TOPOLOGY="hybrid"
export CFN_MAX_AGENTS="300"
export CFN_COORDINATORS="7"
export CFN_WORKERS_PER_COORDINATOR="43"
export CFN_TRAFFIC_PERCENTAGE="50"  # 50% of traffic to V2
```

**Rollout Steps**:
1. Test hybrid topology in staging with 150 agents
2. Scale to 300 agents in staging
3. Monitor mesh level reliability (should be 100%)
4. Enable V2 for 50% of production traffic
5. Monitor for 1 week with gradual ramp-up

**Success Criteria**:
- ✅ 300 agents: <12s, ≥90% delivery
- ✅ 100% mesh level reliability
- ✅ Successful team-based coordination
- ✅ V2 handles 50% traffic without issues

**Decision Gate**: Stage 2 stable for 1 week → Proceed to Stage 3

### Stage 3: 500-708 Agents (Large Hybrid) - 3-4 Weeks

**Deployment Strategy**:
```bash
export CFN_TOPOLOGY="hybrid"
export CFN_MAX_AGENTS="708"
export CFN_COORDINATORS="7"
export CFN_WORKERS_PER_COORDINATOR="100"
export CFN_TRAFFIC_PERCENTAGE="100"  # 100% of traffic to V2
```

**Rollout Steps**:
1. Test 500 agents in staging (Week 1)
2. Test 708 agents in staging
3. Monitor resource utilization (8GB+ RAM required)
4. Enable V2 for 75% of production traffic (Week 2)
5. Enable V2 for 100% of production traffic (Week 3)
6. Monitor for 1 week full production load
7. Decommission V1 fallback after 2 weeks stable (Week 4)

**Success Criteria**:
- ✅ 500 agents: <10s, ≥90% delivery
- ✅ 708 agents: <20s, ≥90% delivery
- ✅ Coordinator failover tested and working
- ✅ Resource utilization within limits

**Decision Gate**: Stage 3 stable for 2 weeks → Epic COMPLETE

### Phase 4 Decision Gate (Final)

**Epic Completion Criteria** (ALL must pass):
- ✅ 500+ agents coordinating in production
- ✅ Coordination time <10s for 500 agents
- ✅ Delivery rate ≥90% sustained
- ✅ V2 handles 100% production traffic
- ✅ Zero critical incidents for 2 weeks

**COMPLETE**: Epic successful, V2 is primary coordination system
**INCOMPLETE**: Extend Stage 3 or rollback to V1 if critical issues

---

## Phase 5: Agent Lifecycle Enhancement (OPTIONAL - Evaluate After Phase 4)

**Objective**: Add WAITING state for enhanced agent collaboration and resource utilization

**Decision Point**: End of Phase 4 Stage 2 (300 agents stable)

**Evaluation Criteria**:
```bash
# Measure after Phase 4 Stage 2 runs for 1 week
idle_time_pct=30%        # Agents idle >30% of time?
dependency_blocks=10     # >10 blocked agents frequently?
reassignment_latency=2s  # Task assignment >2s?

# If ANY criterion met → PROCEED to Phase 5
# If ALL below thresholds → SKIP Phase 5
```

**Timeline**: 4-6 weeks (if pursued)

### Sprint 5.1: State Machine Implementation (2 weeks)

**Deliverables**:
- Bash state tracking system (`/dev/shm/cfn/agents/{id}/state`)
- State transition functions (IDLE → WORKING → WAITING → COMPLETE)
- State transition messaging and logging
- State machine integration with message bus

**Agent Team** (6 agents):
- backend-dev (2): Implement state machine in bash
- system-architect: Design state transition logic
- tester: Test state transitions and edge cases
- coder: Integration with existing message bus
- reviewer: Validate state machine correctness

**Validation Checkpoints**:
- State transitions <100ms
- State files correctly written and read
- No race conditions in state updates
- State machine integrates with Phase 1-4 coordination

**Success Criteria**:
- ✅ All 4 states (IDLE, WORKING, WAITING, COMPLETE) implemented
- ✅ State transitions reliable and atomic
- ✅ State tracking <5% overhead

**Decision Gate**: State machine working → Proceed to Sprint 5.2

### Sprint 5.2: Help Request System (2 weeks)

**Deliverables**:
- Help request queue (`/dev/shm/cfn/help-requests/`)
- Agent capability matching algorithm
- Help request/response protocol
- Background help listener for WAITING agents

**Agent Team** (6 agents):
- backend-dev (2): Implement help request system
- system-architect: Design capability matching
- coder: Background help listener script
- tester: Test help request matching
- perf-analyzer: Benchmark help system overhead
- reviewer: Validate help request reliability

**Validation Checkpoints**:
- Help requests matched to capable agents <500ms
- WAITING agents respond to help requests correctly
- No deadlocks from help request cycles
- Help system <10% overhead

**Success Criteria**:
- ✅ Help requests matched accurately (>90% success rate)
- ✅ Response time <500ms for help requests
- ✅ WAITING agents actively participate

**Decision Gate**: Help system working → Proceed to Sprint 5.3

### Sprint 5.3: Dependency Resolution (2 weeks)

**Deliverables**:
- Dependency graph tracking (`/dev/shm/cfn/dependencies/`)
- BLOCKED state handling
- Provider matching for dependencies
- Dependency resolution protocol

**Agent Team** (6 agents):
- backend-dev (2): Implement dependency resolution
- system-architect: Design dependency graph
- coder: Blocked agent detection and handling
- tester: Test dependency resolution scenarios
- reviewer: Validate dependency correctness

**Validation Checkpoints**:
- Dependency resolution <1s average
- BLOCKED agents correctly unblocked
- No circular dependency deadlocks
- Dependency tracking <5% overhead

**Success Criteria**:
- ✅ Dependencies resolved successfully (>95% success rate)
- ✅ Blocked agents resume work after resolution
- ✅ No deadlocks from circular dependencies

**Decision Gate**: Dependency resolution working → Proceed to Sprint 5.4

### Sprint 5.4: Integration Testing & Validation (1 week)

**Deliverables**:
- End-to-end lifecycle testing
- Performance benchmarks (Phase 5 vs Phase 4)
- WAITING state utilization metrics
- Production readiness validation

**Agent Team** (5 agents):
- tester (2): Comprehensive lifecycle testing
- perf-analyzer: Benchmark WAITING state benefits
- system-architect: Analyze utilization improvements
- reviewer: Validate production readiness

**Validation Checkpoints**:
- WAITING agents accept tasks <100ms
- Idle time reduced by ≥20% (if that was the issue)
- Dependency resolution improves blocked agent time
- Overall coordination time maintained or improved

**Success Criteria**:
- ✅ WAITING state provides measurable benefit (≥15% improvement in target metric)
- ✅ No regression in coordination time
- ✅ System remains stable with lifecycle features

**Decision Gate**: Phase 5 benefits proven → Deploy to production OR Phase 5 benefits marginal → Revert to Phase 4 model

### Phase 5 Decision Gate

**Success Criteria**:
- ✅ WAITING state provides ≥15% improvement in idle time, dependency resolution, or reassignment latency
- ✅ No coordination time regression
- ✅ System stable with lifecycle features

**Outcomes**:
- **DEPLOY**: Roll out Phase 5 features to production (gradual rollout like Phase 4)
- **DEFER**: Benefits marginal, keep Phase 4 model, revisit later
- **REVERT**: Lifecycle adds complexity without clear benefit, stay with Phase 4

**Note**: Phase 5 is **entirely optional**. If Phase 4 proves sufficient, this phase can be indefinitely deferred or skipped.

---

## Success Metrics

### Per-Phase Success Criteria

**Sprint 0**: Environment + stability smoke tests pass
**Phase 1**: 100-agent coordination reliable (≥95% delivery, <5s)
**Phase 2**: 300-agent load testing passing (≥90% delivery, <12s)
**Phase 3**: 500-agent optimization target met (<10s coordination)
**Phase 4**: 500+ agents stable in production for 2 weeks
**Phase 5 (Optional)**: WAITING state provides ≥15% measurable improvement

### Overall Epic Success Criteria

**Must Achieve**:
- 500+ agent capacity in production
- <10s coordination time for 500 agents
- ≥90% delivery rate sustained
- Zero critical production incidents
- V1/V2 toggle mechanism working

**Nice to Have**:
- 708 agent capacity proven
- Coordinator failover automated
- Cross-platform support (future consideration)
- Agent lifecycle enhancement (Phase 5 if needed)

### Measurement Approach

**Real-Time Metrics**:
- Coordination time (histogram, p50/p95/p99)
- Delivery rate (gauge, %)
- Active agent count (gauge)
- Message throughput (counter, messages/second)
- Inbox depth (histogram, per agent)
- System resource usage (gauge, memory/FD/CPU)

**Daily Metrics**:
- Average coordination time
- Delivery rate consistency
- Error rate and types
- Resource utilization trends

**Weekly Metrics**:
- Epic progress (% phases complete)
- Decision gate pass rate
- Production stability (uptime %)
- V2 traffic percentage

---

## Agent Team Compositions

### Recommended Agent Counts by Sprint

**Small Sprints** (1 week, focused scope): 4-5 agents
- Example: Configuration Management, Graceful Shutdown

**Medium Sprints** (1-2 weeks, moderate scope): 5-6 agents
- Example: Monitoring & Metrics, Health Checks, Rate Limiting

**Large Sprints** (2+ weeks, complex scope): 6-8 agents
- Example: Integration & Benchmarking, Stage 3 Deployment

### Swarm Coordination Approach

**For ALL multi-agent sprints**:
```javascript
[Single Message]:
  // Step 1: ALWAYS initialize swarm
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",          // mesh for <8 agents, hierarchical for 8+
    maxAgents: 5,              // match sprint agent count
    strategy: "balanced"
  })

  // Step 2: Spawn ALL sprint agents concurrently
  Task("Agent 1", "Specific sprint task + report confidence", "type")
  Task("Agent 2", "Specific sprint task + report confidence", "type")
  // ... all sprint agents
```

**CFN Loop Integration**:
- Loop 3 (Primary Swarm): Sprint implementation agents
- Loop 2 (Consensus): Validation agents (reviewer, tester, security-specialist)
- Product Owner: GOAP-based decision at sprint gates

### Agent Type Selection by Work Stream

**Backend Development**: backend-dev, system-architect
**Performance Work**: perf-analyzer, backend-dev, system-architect
**Testing**: tester, reviewer, security-specialist
**Operations**: devops-engineer, cicd-engineer
**Documentation**: api-docs, researcher

---

## Decision Framework

### GO/NO-GO Criteria for Each Gate

**Sprint 0 Gate** (3 days):
- GO: Smoke tests pass (2+ environments, 8-hour stability)
- NO-GO: Critical failures (all environments fail, memory leaks)

**Phase 1 Gate** (4-6 weeks):
- GO: 100-agent coordination reliable (≥95% delivery, <5s)
- PIVOT: Adjust architecture or timeline
- NO-GO: Fundamental stability issues

**Phase 2 Gate** (3-4 weeks):
- GO: Tests comprehensive (80%+ coverage, 300-agent load tests pass)
- PIVOT: Fix critical test failures before Phase 3
- NO-GO: Fundamental design flaws discovered

**Phase 3 Gate** (4-5 weeks):
- GO: 500-agent target met (<10s, ≥90% delivery)
- PIVOT: Adjust optimization strategy
- NO-GO: Performance targets unachievable

**Phase 4 Gate - Final** (6-8 weeks):
- COMPLETE: 500+ agents stable in production for 2 weeks
- INCOMPLETE: Critical production issues require V1 rollback

### Pivot Options by Phase

**Sprint 0 Pivot**:
- Network IPC (sockets) instead of file-based
- Hybrid approach (TypeScript coordination + bash execution)
- Scope reduction (bare metal Linux only)

**Phase 1 Pivot**:
- Extend timeline for stability fixes
- Simplify architecture (fewer features)
- Add intermediate checkpoints

**Phase 2 Pivot**:
- Reduce agent count targets (300 → 200)
- Add more testing cycles
- Implement missing error handling

**Phase 3 Pivot**:
- Skip low-ROI optimizations
- Adjust performance targets based on empirical data
- Focus on highest-impact optimizations only

**Phase 4 Pivot**:
- Extend rollout timeline
- Reduce traffic percentage to V2
- Keep V1 fallback longer

### Escalation Procedures

**Sprint-Level Escalation** (agent consensus <75%):
- IMMEDIATELY relaunch Loop 3 with different/additional agents
- NO approval needed, self-correcting within iteration limits

**Phase-Level Escalation** (gate criteria not met):
- Product Owner GOAP decision: PROCEED/DEFER/ESCALATE
- PROCEED: Targeted fixes, relaunch implementation swarm
- DEFER: Out-of-scope concerns, move to backlog, approve phase
- ESCALATE: Critical ambiguity, generate options with recommendations

**Epic-Level Escalation** (multiple phases failing):
- Human decision required
- Alternative epic strategies presented
- Timeline and scope re-evaluation

---

## Timeline & Dependencies

### Gantt Chart (Text-Based)

```
Sprint 0 (3 days) - CRITICAL PATH
├─ Day 1: Environment Quick Test
├─ Day 2: 8-Hour Stability Test
└─ Day 3: GO/NO-GO Decision
    ↓
Phase 1 (4-6 weeks) - CRITICAL PATH
├─ Sprint 1.1: Monitoring & Metrics (1w)
├─ Sprint 1.2: Health Checks (1w)
├─ Sprint 1.3: Configuration (1w)
├─ Sprint 1.4: Graceful Shutdown (1w)
└─ Sprint 1.5: Rate Limiting (1-2w)
    ↓
Phase 2 (3-4 weeks) - CRITICAL PATH
├─ Sprint 2.1: Unit Testing (1w)
├─ Sprint 2.2: Integration Testing (1w)
├─ Sprint 2.3: Load Testing (1w)
└─ Sprint 2.4: Stress Testing (1w)
    ↓
Phase 3 (4-5 weeks) - CRITICAL PATH
├─ Sprint 3.1: Agent Pooling (1w)
├─ Sprint 3.2: Batch Messaging (1w)
├─ Sprint 3.3: Parallel Spawning (1w)
├─ Sprint 3.4: Message Bus Sharding (1w)
└─ Sprint 3.5: Integration & Benchmarking (1w)
    ↓
Phase 4 (6-8 weeks) - CRITICAL PATH
├─ Stage 1: 100 Agents (2w)
├─ Stage 2: 300 Agents (2w) [DECISION POINT: Phase 5?]
└─ Stage 3: 500-708 Agents (3-4w)
    ↓
    ↓ [OPTIONAL - EVALUATE BASED ON PHASE 4 METRICS]
    ↓
Phase 5 (4-6 weeks) - OPTIONAL
├─ Sprint 5.1: State Machine (2w)
├─ Sprint 5.2: Help Request System (2w)
├─ Sprint 5.3: Dependency Resolution (2w)
└─ Sprint 5.4: Integration & Validation (1w)

Required Timeline: 17-22 weeks (4-6 months)
Full Timeline (with Phase 5): 21-28 weeks (5-7 months)
```

### Critical Path

**Sequential Dependencies** (blocking):
- Sprint 0 → Phase 1 (MUST pass smoke tests)
- Phase 1 → Phase 2 (MUST have foundation)
- Phase 2 → Phase 3 (MUST have test coverage)
- Phase 3 → Phase 4 (MUST meet performance targets)
- Stage 1 → Stage 2 → Stage 3 (gradual capacity ramp)

**Parallel Work Opportunities**:
- Phase 2 Sprints 2.1 & 2.2 (unit + integration tests)
- Phase 3 Sprints 3.1-3.4 (all optimizations)
- Phase 4 staging + documentation work

### Dependency Graph

```
Sprint 0
  └─> Phase 1 (ALL sprints sequential)
       └─> Phase 2 (Sprints 2.1→2.2→2.3→2.4)
            └─> Phase 3 (Sprints 3.1-3.4 parallel → 3.5)
                 └─> Phase 4 (Stage 1→2→3)
                      └─> [DECISION GATE: Evaluate Phase 5 need]
                           ├─> Phase 5 (OPTIONAL - if metrics show benefit)
                           └─> SKIP Phase 5 (if Phase 4 sufficient)
```

---

## Risk Mitigation

### High-Risk Items

**Risk**: Production environment incompatibility
**Mitigation**: Sprint 0 tests 3 environments before commitment
**Fallback**: Network IPC or /tmp fallback

**Risk**: Memory leaks in long-running coordination
**Mitigation**: Sprint 0 8-hour stability test, Phase 1 graceful shutdown
**Fallback**: Periodic agent pool recycling, cleanup hooks

**Risk**: Performance targets unachievable
**Mitigation**: Phase 3 empirical optimization validation
**Fallback**: Adjust targets or reduce max agent count

**Risk**: V2 critical failure in production
**Mitigation**: V1/V2 toggle with automatic fallback, gradual rollout
**Fallback**: Immediate V1 rollback, extend V2 stabilization

### Medium-Risk Items

**Risk**: Coordinator failure recovery insufficient
**Mitigation**: Phase 2 chaos testing, Phase 3 failover implementation
**Fallback**: Manual recovery procedures, reduce coordinator load

**Risk**: Test coverage gaps
**Mitigation**: Phase 2 comprehensive testing (unit + integration + load + stress)
**Fallback**: Add regression test cycles in Phase 4

**Risk**: Optimization complexity too high
**Mitigation**: Phase 3 prototypes validate ROI before full implementation
**Fallback**: Skip low-ROI optimizations, focus on proven improvements

---

## Document Metadata

**Version**: 1.1
**Created**: 2025-10-06
**Last Updated**: 2025-10-06
**Author**: CLI Coordination V2 Epic Swarm Team
**Status**: READY FOR REVIEW - Hybrid coordination model finalized
**Next Review**: After user approval

**Related Documents**:
- `planning/agent-coordination-v2/MVP_CONCLUSIONS.md` - MVP validation results
- `planning/agent-coordination-v2/CLI_COORDINATION_RISK_ANALYSIS.md` - Risk analysis
- `planning/cli-validation-epic/EPIC_OVERVIEW.md` - Epic summary
- `planning/cli-validation-epic/phase-*.md` - Phase-specific details
- `planning/cli-validation-epic/dependencies.md` - Dependency analysis

**Changelog**:
- v1.1 (2025-10-06): Added hybrid coordination model (Phase 1-4 dynamic spawning + Phase 5 optional WAITING state)
- v1.0 (2025-10-06): Initial epic document created, consolidated from research artifacts
