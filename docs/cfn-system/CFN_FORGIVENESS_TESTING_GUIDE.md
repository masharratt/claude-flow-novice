# CFN Loop Forgiveness Testing Guide

## Overview

This document explains how to use and understand the comprehensive CLI hello world test suite for CFN Loop forgiveness features.

## Test Suite Location

**Primary Test Script:** `/tests/test-cfn-forgiveness-cli-hello-world.sh`

## What the Tests Validate

The test suite validates all 8 forgiveness mechanisms in CFN Loop:

1. **Multi-tier Agent Spawning Fallback** (4 strategies)
2. **Pre-flight Validation** for dependencies and resources
3. **Adaptive Timeout Calculation** based on system state
4. **Race Condition Prevention** with collision-resistant IDs
5. **Graceful Shutdown** and cleanup mechanisms
6. **Checkpoint/Restart System**
7. **Fallback Mode Operation** for Redis failures
8. **Self-healing Error Recovery**

## Running the Tests

### Basic Usage

```bash
# Run all forgiveness tests
./tests/test-cfn-forgiveness-cli-hello-world.sh

# View results after completion
cat /tmp/cfn-forgiveness-test-*/forgiveness-report.md
```

### Prerequisites

- **npx** command available (for CFN Loop execution)
- **stress** command (recommended for resource testing)
- **Redis** (optional, will be started if not available)
- **sudo** access (for network simulation commands)
- **Node.js** and **claude-flow-novice** installed

### System Requirements

- **Memory:** At least 2GB free for stress testing
- **Disk:** 1GB free for test artifacts
- **Network:** Internet access for npx operations
- **Permissions:** Ability to modify system settings temporarily

## Test Scenarios Explained

### 1. Multi-tier Agent Spawning Fallback

Tests 4 different spawning strategies when primary methods fail:

- **Strategy 1:** npx command failure → fallback to alternative executors
- **Strategy 2:** Memory constraints → resource-aware spawning
- **Strategy 3:** Network constraints → offline mode activation
- **Strategy 4:** Resource exhaustion → minimal resource allocation

**Failure Injection:** Temporarily breaks npx, limits memory, simulates network issues

### 2. Pre-flight Validation

Validates system readiness before task execution:

- **Missing Dependencies:** Detects and handles missing Node.js/npm
- **Disk Space:** Validates minimum storage requirements
- **Port Availability:** Checks for port conflicts

**Failure Injection:** Moves binaries, fills disk space, occupies ports

### 3. Adaptive Timeout Calculation

Tests timeout adjustment based on system conditions:

- **High CPU Load:** Extends timeouts under heavy processing
- **Low Memory:** Adjusts timeouts for memory-constrained environments
- **Network Latency:** Compensates for slow network conditions

**Failure Injection:** Generates CPU load, consumes memory, adds network delay

### 4. Race Condition Prevention

Ensures safe concurrent operation:

- **Concurrent Tasks:** Multiple simultaneous task execution
- **ID Collision:** Collision-resistant unique ID generation

**Failure Injection:** Runs multiple tasks with overlapping IDs

### 5. Graceful Shutdown and Cleanup

Validates proper resource management:

- **SIGTERM Handling:** Clean process termination
- **Resource Cleanup:** Automatic cleanup of temp files/processes

**Failure Injection:** Sends termination signals, creates orphaned resources

### 6. Checkpoint/Restart System

Tests state persistence and recovery:

- **Process Interruption:** Recovery from unexpected termination
- **State Persistence:** Maintaining state across restarts

**Failure Injection:** Kills running processes, validates checkpoint creation

### 7. Redis Fallback Mode

Tests Redis connectivity resilience:

- **Connection Failure:** Fallback when Redis unavailable
- **Memory Overflow:** Handling Redis memory limits
- **Network Latency:** Coping with slow Redis responses

**Failure Injection:** Stops Redis, fills memory, adds latency

### 8. Self-healing Error Recovery

Validates automatic recovery capabilities:

- **Process Crashes:** Automatic restart of failed processes
- **Resource Exhaustion:** Recovery from resource depletion
- **Network Disruption:** Recovery from connectivity issues

**Failure Injection:** Simulates crashes, consumes resources, blocks network

## Combined Scenarios

Tests multiple forgiveness mechanisms working together:

- **Simultaneous Failures:** Multiple failure conditions at once
- **Cascading Failures:** One failure triggering others

## Understanding Test Results

### Success Criteria

Each test passes if:
1. **Graceful Handling:** Failure is detected and handled without complete system failure
2. **Recovery:** System recovers to operational state
3. **Task Completion:** Hello world task completes (or degrades gracefully)
4. **Resource Cleanup:** No orphaned processes or resources remain

### Metrics Collected

- **Recovery Time:** Time to recover from failure condition
- **Success Rate:** Percentage of tests that handle failures gracefully
- **Resource Usage:** Memory/CPU consumption during recovery
- **Task Duration:** Total time for hello world completion

### Report Structure

The generated report includes:
- **Executive Summary:** Overall success rate and key metrics
- **Mechanism Results:** Individual forgiveness mechanism performance
- **Recovery Time Analysis:** Performance under different failure conditions
- **Recommendations:** Specific improvements needed
- **Test Artifacts:** Locations of detailed logs and outputs

## Test Output Directory

```
/tmp/cfn-forgiveness-test-{timestamp}/
├── forgiveness-report.md          # Main test report
├── telemetry/                     # CFN Loop telemetry data
├── task_output_*.log             # Individual task outputs
├── task_error_*.log              # Error logs from failed tasks
├── failures/                     # Active failure condition markers
├── checkpoints/                  # Checkpoint data (if any)
└── temp_fill                     # Temporary test files
```

## Interpreting Failures

### Common Failure Types

1. **Timeout Exceeded:** Recovery took too long
2. **Resource Exhaustion:** System couldn't handle load
3. **Permission Denied:** Insufficient privileges for system modifications
4. **Dependency Missing:** Required tools not available

### Troubleshooting Steps

1. **Check Logs:** Review individual task error logs
2. **Verify Environment:** Ensure all prerequisites are met
3. **Check Permissions:** Verify sudo access for network simulation
4. **System Resources:** Ensure adequate memory/disk space

### Expected vs. Unexpected Failures

**Expected Failures:**
- Tests that verify proper failure handling may show "failed" tasks but still pass if recovery works
- Some system limitations may prevent certain failure injections

**Unexpected Failures:**
- Complete system crashes or hangs
- Permission errors preventing test setup
- Missing core dependencies

## Running Individual Test Categories

You can modify the script to run specific test categories:

```bash
# Edit the main() function in the test script
# Comment out tests you don't want to run

main() {
    setup_test_environment

    # Run only specific tests
    test_multi_tier_spawning
    test_self_healing

    # Skip other tests...

    generate_forgiveness_report
}
```

## Continuous Integration

### CI Integration

The test suite is designed for CI environments:

```bash
# In CI pipeline
./tests/test-cfn-forgiveness-cli-hello-world.sh
EXIT_CODE=$?

# Upload results
cp /tmp/cfn-forgiveness-test-*/forgiveness-report.md ./artifacts/
exit $EXIT_CODE
```

### Environment Variables for CI

```bash
export CFN_FORGIVENESS_TEST_MODE="true"
export CFN_CI_MODE="true"
export CFN_SKIP_NETWORK_TESTS="true"  # Skip tests requiring sudo
```

## Performance Baselines

### Expected Recovery Times

- **Simple Failures:** < 30 seconds
- **Resource Failures:** < 60 seconds
- **Network Failures:** < 90 seconds
- **Combined Failures:** < 180 seconds

### Resource Limits

- **Memory Usage:** < 1GB during testing
- **CPU Usage:** < 80% sustained
- **Disk Usage:** < 500MB for artifacts

## Contributing to Tests

### Adding New Test Scenarios

1. **Define Failure Condition:** What specific failure to test
2. **Create Test Function:** Follow existing naming pattern
3. **Implement Failure Injection:** Safe, reversible failure simulation
4. **Add Validation:** Check recovery and task completion
5. **Update Documentation:** Add to this guide

### Test Function Template

```bash
test_new_mechanism() {
    log_test_start "New Mechanism Test"
    local test_name="new_mechanism"
    local start_time=$(date +%s)

    # 1. Create failure condition
    create_test_failure "new_failure"

    # 2. Run test
    local result=$(run_hello_world_task "${test_name}_scenario" 60)

    # 3. Validate and cleanup
    if [[ "$result" == "SUCCESS:"* ]]; then
        log_success "New mechanism: Working correctly"
        measure_recovery_time "${test_name}_scenario" "$start_time" "$(date +%s)"
    else
        log_error "New mechanism: Not working"
    fi

    cleanup_test_failure "new_failure"
}
```

## Safety Considerations

### Risk Mitigation

- **Non-destructive:** Tests don't modify production data
- **Isolated Environment:** Uses temporary directories
- **Cleanup:** Automatic resource cleanup after tests
- **Rollback:** All failure conditions are reversible

### System Impact

- **Temporary Changes:** All system modifications are reversed
- **Resource Limits:** Tests use bounded resources
- **Network Safety:** Network changes are local and temporary

## Support and Troubleshooting

### Getting Help

1. **Review Logs:** Check individual test logs in the results directory
2. **Check Environment:** Verify all prerequisites are met
3. **Consult Report:** Review the generated forgiveness report
4. **Check System Resources:** Ensure adequate memory/disk/CPU

### Common Issues

| Issue | Solution |
|-------|----------|
| Permission denied | Run with sudo or skip network tests |
| npx not found | Install Node.js and npm |
| Redis tests fail | Install Redis or set CFN_SKIP_REDIS_TESTS=true |
| stress command missing | Install stress package or skip resource tests |

### Test Environment Variables

```bash
# Override defaults
CFN_TEST_TIMEOUT=120        # Individual test timeout
CFN_TEST_RESULTS_DIR="/tmp/my-tests"  # Custom results directory
CFN_SKIP_SUDO_TESTS=true    # Skip tests requiring sudo
CFN_VERBOSE_LOGGING=true    # Enable detailed logging
```

---

**Note:** This test suite is designed to validate forgiveness mechanisms, not to test CFN Loop functionality itself. The focus is on graceful failure handling and recovery.