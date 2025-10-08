# Phase 2: Testing & Validation (3-4 Weeks)

**Phase ID**: 2
**Priority**: CRITICAL - Production Reliability Foundation
**Dependencies**: Phase 1 must complete (100-agent foundation validated)
**Timeline**: 3-4 weeks

## Phase Goal

Establish comprehensive testing coverage to ensure production reliability through unit tests, integration tests, load tests, and chaos engineering. Validate system behavior under 300-agent load with ≥90% delivery rate.

**Success Criteria**: 80%+ test coverage, load tested to 300 agents, stress tested with chaos scenarios

## Phase Overview

Phase 2 builds upon the validated Phase 1 foundation by creating a robust testing framework that covers:
1. **Unit Testing**: Function-level validation of all bash components
2. **Integration Testing**: End-to-end coordination flow verification
3. **Load Testing**: Scalability validation from 100 to 300 agents
4. **Stress Testing**: Chaos engineering and failure recovery validation

**Phase Dependencies**:
- Phase 1 deliverables: message-bus.sh, agent-wrapper.sh, coordination-config.sh
- Monitoring and metrics system operational
- Health check system functional
- Graceful shutdown mechanisms working

## Deliverables

- Unit test suite with 80%+ function coverage
- Integration test harness for coordinator-worker flows
- Load test scripts for 100/200/300 agent scenarios
- Chaos engineering test suite with failure injection
- Performance benchmark baselines and regression tracking
- CI/CD pipeline integration for automated testing
- Test documentation and runbooks

## Sprints

### Sprint 2.1: Unit Testing Framework (1 Week)

**Timeline**: 5 days
**Priority**: HIGH
**Estimated Agents**: 5

**Deliverables**:
- Bash unit testing framework setup (bats-core or shunit2)
- Unit test suite: `tests/unit/message-bus.test.sh`
- Unit test suite: `tests/unit/agent-wrapper.test.sh`
- Unit test suite: `tests/unit/coordination-config.test.sh`
- Mock/stub utilities for file I/O operations
- Test coverage reporting tool
- CI integration (GitHub Actions or Jenkins)

**Test Coverage Requirements**:
```bash
# message-bus.sh functions to test
- send_message() - delivery success, failure handling, timeouts
- receive_messages() - inbox reading, message parsing, empty inbox
- broadcast() - all agents receive, partial delivery handling
- cleanup_inbox() - file removal, permission handling
- emit_metric() - metric format, file writing, error handling

# agent-wrapper.sh functions to test
- initialize_agent() - state setup, inbox creation, registration
- execute_task() - task execution, error handling, timeout
- report_health() - health status, state reporting
- shutdown_agent() - cleanup, message draining, termination

# coordination-config.sh functions to test
- load_config() - file parsing, env var overrides, defaults
- validate_config() - invalid values, required fields, ranges
- get_config_value() - key lookup, type conversion
```

**Mock Utilities**:
- `mock_tmpfs()` - Simulate /dev/shm operations
- `stub_file_write()` - Intercept file write operations
- `fake_agent_process()` - Simulate agent processes without spawning
- `mock_system_resources()` - Simulate memory/FD limits

**CI Integration**:
```yaml
# .github/workflows/unit-tests.yml
- Run unit tests on every PR
- Generate coverage report (target: 80%+)
- Fail build if coverage drops below threshold
- Archive test results and coverage data
```

**Success Criteria**:
- ✅ 80%+ function coverage across all bash modules
- ✅ All critical code paths tested (send, receive, broadcast, cleanup)
- ✅ Mock utilities enable isolated testing without /dev/shm
- ✅ Tests run in <60 seconds
- ✅ CI pipeline executes tests automatically on commits
- ✅ Coverage report generated and tracked over time

**Failure Response**:
- Extend sprint by 2 days if coverage <70%
- Identify untestable code and refactor for testability
- Add integration tests for complex functions that resist unit testing

**Risk**: MEDIUM - Bash testing frameworks less mature than other languages

**Agent Team**:
- **tester**: Design test cases and write unit tests
- **coder**: Implement bash test framework and utilities
- **devops-engineer**: CI/CD pipeline integration and automation
- **backend-dev**: Create mock/stub utilities for file operations
- **reviewer**: Test review, coverage analysis, quality validation

**Validation Checkpoints**:
- Day 2: Test framework setup complete, 20% coverage
- Day 3: Core functions tested, 50% coverage
- Day 5: All functions tested, 80%+ coverage, CI integrated

**Decision Gate**: Unit tests achieve 80%+ coverage → Proceed to Sprint 2.2

---

### Sprint 2.2: Integration Testing (1 Week)

**Timeline**: 5 days
**Priority**: HIGH
**Estimated Agents**: 5

**Deliverables**:
- Integration test harness: `tests/integration/coordination-flows.test.sh`
- End-to-end test scenarios for coordinator-worker flows
- Multi-agent coordination test suite
- Error injection framework for failure simulation
- Message delivery verification tools
- Integration test documentation

**Test Scenarios**:

**1. Basic Coordination Flow**:
```bash
# Test: Coordinator spawns 10 workers, broadcasts task, collects results
- Initialize coordinator with 10 workers
- Broadcast task message to all workers
- Verify all workers receive task within 1s
- Workers execute and send results
- Coordinator collects all 10 results
- Validate delivery rate = 100%
```

**2. Multi-Agent Communication**:
```bash
# Test: Peer-to-peer agent communication in flat topology
- Spawn 20 agents in flat topology
- Agent A sends directed message to Agent B
- Agent B processes and responds to Agent A
- Verify bidirectional communication works
- Test with 50 agent pairs (100 agents total)
```

**3. Hybrid Topology Flow**:
```bash
# Test: 7 coordinators + 70 workers (hybrid mesh)
- Initialize 7 coordinators
- Each coordinator spawns 10 workers
- Coordinators broadcast to coordinator mesh
- Each coordinator forwards to their workers
- Validate 100% mesh delivery, 95%+ worker delivery
```

**4. Graceful Shutdown Under Load**:
```bash
# Test: Shutdown while messages in flight
- Spawn 50 agents coordinating
- Send 100 messages to various agents
- Trigger shutdown signal (SIGTERM)
- Verify all agents drain inboxes before exit
- Validate no message loss during shutdown
- Confirm all processes terminated cleanly
```

**Error Injection Scenarios**:
- **Slow agent simulation**: Delay message processing to test timeouts
- **Failed agent simulation**: Kill random agents to test fault tolerance
- **Full inbox simulation**: Block inbox writes to test backpressure
- **Corrupted message injection**: Send malformed messages to test parsing
- **Network delay simulation**: Add latency to message delivery

**Error Injection Framework**:
```bash
# inject_failure.sh - Utility for chaos testing
inject_agent_failure() {
  agent_id=$1
  failure_type=$2  # kill, delay, corrupt, block

  case $failure_type in
    kill) kill -9 $agent_pid ;;
    delay) touch /dev/shm/cfn/agents/$agent_id/DELAY_5s ;;
    corrupt) echo "CORRUPT" > /dev/shm/cfn/agents/$agent_id/inbox/msg ;;
    block) chmod 000 /dev/shm/cfn/agents/$agent_id/inbox ;;
  esac
}
```

**Success Criteria**:
- ✅ All basic coordination flows pass (100% delivery in happy path)
- ✅ Multi-agent communication works in flat and hybrid topologies
- ✅ Graceful shutdown drains all messages (0% loss)
- ✅ Error scenarios handled correctly (no crashes, degraded delivery expected)
- ✅ Integration tests complete in <5 minutes
- ✅ Test coverage includes all coordination patterns

**Failure Response**:
- Fix coordination bugs discovered in testing
- Add retry logic for transient failures
- Improve error handling in message delivery
- Document failure modes and recovery behavior

**Risk**: MEDIUM - Integration bugs may reveal architectural issues

**Agent Team**:
- **tester**: Design integration test scenarios
- **backend-dev**: Implement test harness and coordination flow tests
- **coder**: Error injection framework and utilities
- **system-architect**: Test scenario design for topology patterns
- **reviewer**: Validate test coverage and edge case handling

**Validation Checkpoints**:
- Day 2: Test harness setup, basic flows tested
- Day 3: Multi-agent tests implemented, 60% scenarios covered
- Day 5: All scenarios tested, error injection working, tests pass

**Decision Gate**: Integration tests passing for all topologies → Proceed to Sprint 2.3

---

### Sprint 2.3: Load Testing (1 Week)

**Timeline**: 5 days
**Priority**: HIGH
**Estimated Agents**: 6

**Deliverables**:
- Load test suite: `tests/load/agent-scale-test.sh`
- Performance benchmarks for 100/200/300 agent scenarios
- Scalability analysis report with bottleneck identification
- Resource utilization profiling (CPU, memory, FD, tmpfs)
- Performance regression tracking system
- Load test documentation and runbooks

**Load Test Scenarios**:

**Test 1: 100 Agent Baseline**:
```bash
# Establish performance baseline from Phase 1
- Spawn 100 agents in flat topology
- Execute 1000 coordination cycles
- Measure: coordination time (p50, p95, p99)
- Measure: delivery rate (%)
- Measure: resource usage (memory, FD, tmpfs)
- Target: <5s coordination, ≥95% delivery
```

**Test 2: 200 Agent Scale**:
```bash
# Test 2× scale with hybrid topology
- Initialize 5 coordinators + 40 workers each (200 total)
- Execute 500 coordination cycles
- Measure: coordination time, delivery rate, resources
- Compare to 100-agent baseline (expect 1.5-2× time)
- Target: <8s coordination, ≥92% delivery
```

**Test 3: 300 Agent Maximum**:
```bash
# Test Phase 2 maximum capacity
- Initialize 7 coordinators + 42 workers each (294 total)
- Execute 200 coordination cycles
- Measure: coordination time, delivery rate, resources
- Identify performance bottlenecks (profiling)
- Target: <12s coordination, ≥90% delivery
```

**Performance Metrics Collected**:
- **Coordination time**: p50, p95, p99 percentiles (histogram)
- **Delivery rate**: % messages delivered successfully (gauge)
- **Message throughput**: messages/second (counter)
- **Resource usage**:
  - Memory: RSS per process, total heap usage
  - File descriptors: lsof count, limit proximity
  - tmpfs usage: /dev/shm space consumed, fragmentation
  - CPU: load average, per-process CPU time

**Bottleneck Identification**:
```bash
# Profiling script to identify bottlenecks
profile_coordination() {
  # 1. Time each coordination phase
  time_spawn=$(time spawn_agents 300)
  time_broadcast=$(time broadcast_message "task")
  time_collect=$(time collect_results)

  # 2. Identify slowest operations
  flamegraph.pl --title "300 Agent Coordination" perf.out

  # 3. Resource contention analysis
  iostat -x 1 10 | grep /dev/shm  # tmpfs I/O
  pidstat -p $coordinator_pid 1 10  # CPU usage

  # 4. Lock contention (flock wait times)
  strace -c -p $coordinator_pid 2>&1 | grep flock
}
```

**Scalability Analysis**:
- Linear scaling expectation: 300 agents = 3× time of 100 agents
- Sublinear scaling (good): 300 agents = 2-2.5× time (batching, parallelism)
- Superlinear scaling (bad): 300 agents = 4× time (contention, quadratic behavior)

**Performance Regression Tracking**:
```bash
# Store baseline metrics
echo "100-agent,5.2s,96%,1.2GB,450FD" >> benchmarks/baseline.csv

# Compare new runs against baseline
if [[ $coordination_time > $baseline_time * 1.2 ]]; then
  echo "REGRESSION: 20% slower than baseline" >&2
  exit 1
fi
```

**Success Criteria**:
- ✅ 100 agents: <5s coordination, ≥95% delivery (Phase 1 validated)
- ✅ 200 agents: <8s coordination, ≥92% delivery
- ✅ 300 agents: <12s coordination, ≥90% delivery
- ✅ Resource usage within limits (memory <4GB, FD <1024 per agent)
- ✅ Bottlenecks identified and documented
- ✅ Performance regression tracking implemented

**Failure Response**:
- If 300-agent target missed:
  - Reduce target to 250 agents
  - Implement emergency optimizations (batching, pooling)
  - Escalate to Phase 3 optimization planning
- If resource exhaustion occurs:
  - Tune configuration limits (inbox size, timeout)
  - Add resource monitoring alerts
  - Implement backpressure mechanisms

**Risk**: MEDIUM-HIGH - Performance targets may require Phase 3 optimizations earlier

**Agent Team**:
- **perf-analyzer**: Design load tests and analyze performance data
- **tester**: Implement load test scripts and scenarios
- **backend-dev**: Performance instrumentation and profiling
- **system-architect**: Scalability analysis and bottleneck identification
- **devops-engineer**: Load test infrastructure and monitoring
- **reviewer**: Results validation and performance report review

**Validation Checkpoints**:
- Day 2: 100-agent baseline established, profiling tools setup
- Day 3: 200-agent tests complete, initial bottlenecks identified
- Day 5: 300-agent tests complete, scalability report finalized

**Decision Gate**: Load targets met (≥90% delivery at 300 agents) → Proceed to Sprint 2.4

---

### Sprint 2.4: Stress Testing & Chaos Engineering (1 Week)

**Timeline**: 5 days
**Priority**: HIGH
**Estimated Agents**: 5

**Deliverables**:
- Chaos engineering test suite: `tests/chaos/failure-scenarios.sh`
- Coordinator failure and recovery tests
- Resource exhaustion simulation tests
- Network partition simulation (if applicable)
- Recovery validation and alerting tests
- Chaos test runbook and documentation

**Chaos Test Scenarios**:

**1. Single Coordinator Failure**:
```bash
# Test: Kill coordinator during active coordination
- Initialize 7 coordinators + 70 workers (hybrid topology)
- Start coordination (broadcast in progress)
- Kill coordinator #3 (SIGKILL - no graceful shutdown)
- Measure: detection time, failover time, message loss
- Verify: remaining 6 coordinators continue
- Target: <30s recovery, <5% message loss
```

**2. Multiple Coordinator Failures**:
```bash
# Test: Kill 3/7 coordinators simultaneously
- Initialize 7 coordinators + 70 workers
- Kill coordinators #2, #4, #6 simultaneously
- Verify: 4 remaining coordinators continue
- Measure: delivery rate degradation (expect ~40% drop)
- Validate: system stable with reduced capacity
```

**3. Worker Agent Cascading Failures**:
```bash
# Test: 20% of workers fail randomly
- Initialize 100 workers
- Randomly kill 20 workers over 30 seconds
- Coordinator detects failures via health checks
- Measure: detection time (<30s per failure)
- Verify: remaining 80 workers continue operating
```

**4. Resource Exhaustion - Memory**:
```bash
# Test: Simulate memory pressure
- Set memory limit: ulimit -m 2GB
- Spawn 200 agents (expect ~3GB usage)
- Trigger OOM condition
- Verify: graceful degradation (reduce agents, not crash)
- Measure: recovery time, data loss
```

**5. Resource Exhaustion - File Descriptors**:
```bash
# Test: FD limit exhaustion
- Set FD limit: ulimit -n 512
- Spawn 100 agents (~600 FD needed with inboxes)
- Hit FD limit during spawn
- Verify: spawn fails gracefully with error
- Validate: no zombie processes or leaked FDs
```

**6. tmpfs Full Disk**:
```bash
# Test: /dev/shm exhaustion
- Allocate 90% of /dev/shm with dummy files
- Attempt coordination with 50 agents
- Hit disk full during message writes
- Verify: backpressure mechanism activates
- Validate: no corruption, messages queued or dropped cleanly
```

**7. Network Partition (if network IPC fallback exists)**:
```bash
# Test: Simulate network split between coordinators
- Use iptables to block traffic between coordinator groups
- Group A: coordinators 1-3
- Group B: coordinators 4-7
- Measure: split-brain detection, partition healing
- Verify: system detects partition within 60s
```

**8. Message Storm (Overload)**:
```bash
# Test: 10× normal message volume
- Spawn 100 agents
- Each agent sends 100 messages (10,000 total)
- Measure: inbox overflow, backpressure activation
- Verify: rate limiting prevents deadlock
- Validate: delivery rate degrades gracefully (≥70%)
```

**Recovery Validation**:
- **Detection time**: How quickly failures are detected (<30s target)
- **Failover time**: Time to restore coordination (<30s target)
- **Data loss**: % messages lost during failure (<5% target)
- **System stability**: No crashes or deadlocks post-recovery
- **Alert accuracy**: Monitoring alerts trigger correctly

**Chaos Injection Framework**:
```bash
# chaos-inject.sh - Orchestrate chaos scenarios
run_chaos_scenario() {
  scenario=$1

  case $scenario in
    coordinator_failure)
      # Kill random coordinator
      coordinator_id=$(shuf -i 1-7 -n 1)
      kill -9 $(cat /dev/shm/cfn/coordinators/$coordinator_id/pid)
      ;;

    memory_pressure)
      # Consume memory to trigger OOM
      stress-ng --vm 1 --vm-bytes 1G --timeout 30s
      ;;

    fd_exhaustion)
      # Open files until limit hit
      for i in {1..600}; do
        exec {fd}<> /tmp/fd-$i
      done
      ;;

    tmpfs_full)
      # Fill /dev/shm to 95%
      dd if=/dev/zero of=/dev/shm/filler bs=1M count=500
      ;;
  esac
}
```

**Success Criteria**:
- ✅ Single coordinator failure: <30s recovery, <5% message loss
- ✅ Multiple coordinator failures: system continues with degraded capacity
- ✅ Worker failures: detected within 30s, no impact on other workers
- ✅ Memory exhaustion: graceful degradation, no crash
- ✅ FD exhaustion: spawn fails gracefully, no leaks
- ✅ tmpfs full: backpressure activates, no corruption
- ✅ Message storm: rate limiting prevents deadlock, ≥70% delivery
- ✅ All chaos scenarios: coordination completes after recovery

**Failure Response**:
- Improve failure detection mechanisms (faster health checks)
- Add automatic failover for coordinator failures
- Implement circuit breakers for resource exhaustion
- Add monitoring alerts for approaching resource limits
- Document runbooks for manual recovery procedures

**Risk**: MEDIUM - Chaos testing may reveal critical stability issues requiring Phase 1 rework

**Agent Team**:
- **tester**: Design chaos scenarios and implement tests
- **backend-dev**: Failure injection utilities and recovery logic
- **devops-engineer**: Monitoring during chaos, alert validation
- **system-architect**: Recovery mechanism validation and design
- **reviewer**: Chaos test results analysis and documentation

**Validation Checkpoints**:
- Day 2: Chaos framework setup, coordinator failure tests implemented
- Day 3: Resource exhaustion tests complete, 50% scenarios covered
- Day 5: All scenarios tested, recovery validated, documentation complete

**Decision Gate**: Chaos tests passing (recovery <30s, system stable) → Proceed to Phase 2 Gate

---

## Phase 2 Decision Gate

**Success Criteria** (ALL must pass):
- ✅ Unit test coverage ≥80% across all bash modules
- ✅ Integration tests passing for all coordination topologies
- ✅ Load tested to 300 agents: <12s coordination, ≥90% delivery
- ✅ Chaos tests: <30s recovery, system stable after failures
- ✅ CI/CD pipeline integrated and running automatically
- ✅ Performance baselines established and tracked

**GO Decision**: Proceed to Phase 3 (Performance Optimization)
- All test criteria met
- No critical bugs or stability issues
- Performance bottlenecks identified and documented

**PIVOT Decision**: Fix critical test failures before proceeding
- Unit coverage <70%: Extend Sprint 2.1 by 1 week
- Integration failures: Refactor coordination logic
- Load test failures at 300 agents: Reduce target to 250, proceed to Phase 3 optimizations
- Chaos test failures: Improve failure handling, re-test

**NO-GO Decision**: Re-evaluate approach if fundamental issues found
- Coordination model fundamentally flawed
- Performance targets unachievable even with optimizations
- Critical stability issues require architecture redesign

**Decision Authority**: Product Owner with GOAP algorithm
- Analyze test results and failure patterns
- Calculate cost of fixes vs. pivot to alternative approach
- Make autonomous GO/PIVOT/NO-GO decision

## Phase 2 Metrics

**Target Metrics**:
- Unit test coverage: ≥80%
- Integration test pass rate: 100%
- Load test coordination time: <12s (300 agents)
- Load test delivery rate: ≥90% (300 agents)
- Chaos test recovery time: <30s
- Chaos test message loss: <5%
- CI test execution time: <10 minutes total

**Escalation Triggers**:
- Unit coverage <70% after Sprint 2.1
- Integration tests fail >20% of scenarios
- Load test delivery <85% at 300 agents
- Chaos test recovery >60s or >10% message loss
- Critical bugs found in coordination logic

## Technical Implementation Details

### Test Framework Architecture

```
tests/
├── unit/                          # Unit tests (Sprint 2.1)
│   ├── message-bus.test.sh        # Message bus functions
│   ├── agent-wrapper.test.sh      # Agent wrapper functions
│   ├── coordination-config.test.sh # Config functions
│   └── mocks/                      # Mock utilities
│       ├── mock-tmpfs.sh
│       ├── stub-file-ops.sh
│       └── fake-agent.sh
│
├── integration/                    # Integration tests (Sprint 2.2)
│   ├── coordination-flows.test.sh  # End-to-end flows
│   ├── multi-agent-comm.test.sh    # Agent communication
│   ├── hybrid-topology.test.sh     # Hybrid mesh tests
│   └── error-injection/            # Failure simulation
│       ├── inject-failure.sh
│       └── scenarios/
│
├── load/                           # Load tests (Sprint 2.3)
│   ├── agent-scale-test.sh         # 100/200/300 agent tests
│   ├── performance-profile.sh      # Profiling utilities
│   ├── bottleneck-analysis.sh      # Bottleneck identification
│   └── benchmarks/                 # Baseline data
│       ├── baseline.csv
│       └── regression-tracking.sh
│
└── chaos/                          # Chaos tests (Sprint 2.4)
    ├── failure-scenarios.sh        # Chaos orchestration
    ├── coordinator-failure.sh      # Coordinator chaos
    ├── resource-exhaustion.sh      # Resource limits
    └── recovery-validation.sh      # Recovery verification
```

### CI/CD Integration

```yaml
# .github/workflows/phase2-tests.yml
name: Phase 2 Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Run Unit Tests
        run: bash tests/unit/run-all.sh
      - name: Coverage Report
        run: bash tests/unit/coverage-report.sh
      - name: Fail if coverage <80%
        run: |
          coverage=$(cat coverage.txt)
          if [[ $coverage -lt 80 ]]; then exit 1; fi

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Setup /dev/shm
        run: sudo mount -o remount,size=1G /dev/shm
      - name: Run Integration Tests
        run: bash tests/integration/run-all.sh

  load-tests:
    runs-on: ubuntu-latest
    steps:
      - name: 100 Agent Test
        run: bash tests/load/agent-scale-test.sh 100
      - name: 200 Agent Test
        run: bash tests/load/agent-scale-test.sh 200
      - name: 300 Agent Test
        run: bash tests/load/agent-scale-test.sh 300
      - name: Regression Check
        run: bash tests/load/benchmarks/regression-tracking.sh

  chaos-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Coordinator Failure Test
        run: bash tests/chaos/coordinator-failure.sh
      - name: Resource Exhaustion Test
        run: bash tests/chaos/resource-exhaustion.sh
      - name: Recovery Validation
        run: bash tests/chaos/recovery-validation.sh
```

### Performance Profiling Tools

```bash
# performance-profile.sh - Detailed profiling utilities

# 1. Time breakdown analysis
profile_time_breakdown() {
  local agent_count=$1

  # Instrument each phase
  spawn_time=$(measure_time spawn_agents $agent_count)
  broadcast_time=$(measure_time broadcast_task)
  collect_time=$(measure_time collect_results)

  echo "Spawn: ${spawn_time}s, Broadcast: ${broadcast_time}s, Collect: ${collect_time}s"
}

# 2. Resource utilization profiling
profile_resources() {
  local agent_count=$1

  # Memory profiling
  ps aux | awk '{sum+=$6} END {print "Total Memory: " sum/1024 " MB"}'

  # FD profiling
  lsof | grep /dev/shm | wc -l

  # tmpfs usage
  df -h /dev/shm | tail -1
}

# 3. Lock contention analysis
profile_lock_contention() {
  # Measure flock wait times
  strace -c -e flock bash coordination.sh 2>&1 | grep flock
}

# 4. Flamegraph generation (requires perf)
generate_flamegraph() {
  perf record -F 99 -p $coordinator_pid -g -- sleep 10
  perf script | stackcollapse-perf.pl | flamegraph.pl > flamegraph.svg
}
```

## Testing Strategy

### Test Pyramid Approach

```
         /\
        /  \        Unit Tests (80% coverage)
       /____\       - Fast (<60s total)
      /      \      - Isolated (mocks/stubs)
     /________\     - Focus: Function correctness
    /          \
   /____________\   Integration Tests (all flows)
  /              \  - Medium speed (<5min)
 /________________\ - End-to-end scenarios
/                  \ - Focus: System behavior
/____________________\
                      Load Tests (100/200/300 agents)
                      - Slow (10-30min)
                      - Real system load
                      - Focus: Performance & scale
```

### Coverage Targets by Test Type

- **Unit Tests**: 80%+ line coverage, 100% critical path coverage
- **Integration Tests**: 100% coordination topology coverage
- **Load Tests**: 3 scale points (100, 200, 300 agents)
- **Chaos Tests**: 8 failure scenarios (coordinator, worker, resource, network)

### Test Execution Strategy

**Development Phase**:
- Run unit tests on every code change (pre-commit hook)
- Run integration tests daily
- Run load tests weekly
- Run chaos tests before each release

**CI/CD Pipeline**:
- Unit tests: Every commit (required to pass)
- Integration tests: Every PR (required to pass)
- Load tests: Nightly builds (baseline tracking)
- Chaos tests: Weekly scheduled runs (stability monitoring)

## Risk Mitigation

### High-Risk Items

**Risk**: Unit test coverage falls below 80%
**Mitigation**: Daily coverage tracking, refactor untestable code
**Fallback**: Accept 70% coverage, document untested code paths

**Risk**: Load test fails at 300 agents (performance targets missed)
**Mitigation**: Identify bottlenecks via profiling, implement emergency optimizations
**Fallback**: Reduce Phase 2 target to 250 agents, proceed to Phase 3 for optimizations

**Risk**: Chaos tests reveal critical stability issues
**Mitigation**: Fix coordinator failover logic, improve error handling
**Fallback**: Extend Phase 2 by 1 week for stability fixes, re-test

### Medium-Risk Items

**Risk**: Integration tests uncover coordination bugs
**Mitigation**: Fix bugs immediately, add regression tests
**Fallback**: Refactor coordination logic if bugs indicate design flaw

**Risk**: CI pipeline takes too long (>15 minutes)
**Mitigation**: Parallelize test execution, optimize slow tests
**Fallback**: Run full suite nightly, fast subset on commits

**Risk**: Bash testing framework limitations
**Mitigation**: Use mature frameworks (bats-core), add custom utilities
**Fallback**: Supplement with Python/TypeScript test wrappers

## Success Indicators

**Phase 2 Complete When**:
- ✅ Unit test suite: 80%+ coverage, <60s execution
- ✅ Integration tests: 100% pass rate, all topologies covered
- ✅ Load tests: 300 agents <12s coordination, ≥90% delivery
- ✅ Chaos tests: <30s recovery, <5% message loss
- ✅ CI/CD pipeline: Automated, <10min total execution
- ✅ Performance baselines: Established and tracked
- ✅ Documentation: Test runbooks and coverage reports complete

**Handoff to Phase 3**:
- Provide bottleneck analysis from load tests
- Share performance profiling data and flamegraphs
- Document optimization opportunities identified during testing
- Transfer CI/CD pipeline for regression tracking during optimizations
