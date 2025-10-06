# CLI Coordination MVP - Test Suite Documentation

## Overview

Comprehensive test harness for the CLI Coordination MVP (Sprint 1.1-1.4). Validates all 5 core requirements through ~50 automated tests across 3 test suites.

## Test Harness Architecture

### Master Orchestrator: `mvp-test.sh`

**Purpose**: Orchestrates all test suites with TAP-compatible output, timing metrics, and diagnostic reporting.

**Features**:
- TAP (Test Anything Protocol) output for CI/CD integration
- Parallel test suite execution with isolated environments
- Comprehensive timing measurements (per-suite and total)
- Failure diagnostics with file/line context
- Aggregate pass/fail counts
- Structured logging to `/tmp/cfn-mvp-test-logs/`

**Execution**:
```bash
cd tests/cli-coordination
./mvp-test.sh
```

**Exit Codes**:
- `0` - All test suites passed
- `1` - One or more test suites failed

---

## Test Suites

### Suite 1: Basic Smoke Tests (`mvp-test-basic.sh`)

**Coverage**: Sprint 1.1 - Core CLI Framework

**Tests** (~25):
1. **Coordinator Init** (5 tests)
   - Directory structure creation (`/.cfn/runtime`, `/agents`, `/logs`, `/messages`)
   - Config file generation (`coordinator.json`)

2. **Agent Spawn** (4 tests)
   - Background process spawning
   - Agent runtime directory creation
   - Message bus inbox/outbox setup
   - Process verification

3. **Status Files** (4 tests)
   - Status file creation
   - Valid JSON format
   - Required fields (agentId, type, status)
   - Timestamp updates

4. **Pause/Resume** (1 test)
   - Signal-based pause (SIGSTOP)
   - Signal-based resume (SIGCONT)
   - Process state validation

5. **Checkpoint Command** (1 test)
   - Control file trigger
   - Checkpoint directory creation
   - Checkpoint file generation

6. **Multi-Agent** (3 tests)
   - Concurrent agent spawning (3 agents)
   - Message bus isolation verification
   - Independent process management

7. **Control Dispatch** (1 test)
   - PAUSE/RESUME via control files
   - Status reflection in status.json

8. **Status Updates** (1 test)
   - Periodic timestamp updates during execution

9. **Input Validation** (1 test)
   - Path traversal prevention
   - Malicious input rejection

10. **Cleanup** (4 tests)
    - Message bus state before shutdown
    - Process termination
    - Message bus cleanup (optional)

---

### Suite 2: State Management & Checkpointing (`mvp-test-state.sh`)

**Coverage**: Sprint 1.2 - State Persistence & Recovery

**Tests** (~16):
1. **Checkpoint Versioning** (1 test)
   - Version field in checkpoint files
   - Schema hash validation

2. **Checkpoint Validation** (1 test)
   - Corrupt checkpoint detection
   - Graceful error handling

3. **Checkpoint Cleanup** (1 test)
   - Old checkpoint deletion
   - Retention policy (keep last 5)

4. **Restore from Checkpoint** (3 tests)
   - Kill agent → restore → state verification
   - Message queue state preservation
   - Phase restoration accuracy

5. **Pause/Resume State** (2 tests)
   - No progress during pause
   - Message bus survival across pause/resume

6. **Multi-Pause/Resume** (1 test)
   - Multiple pause/resume cycles (3 iterations)
   - State consistency validation

7. **Checkpoint During Pause** (1 test)
   - Checkpoint creation while paused
   - File system integrity

8. **Schema Migration** (1 test)
   - Incompatible version detection
   - Graceful degradation

---

### Suite 3: Agent Coordination (`mvp-test-coordination.sh`)

**Coverage**: Sprint 1.3 - Agent-to-Agent Messaging

**Tests** (~9):
1. **Bidirectional Messaging** (4 tests)
   - Agent-1 → Agent-2 task delegation
   - Agent-2 → Agent-1 result delivery
   - Inbox verification
   - Message type validation

2. **Coordinator Status Updates** (3 tests)
   - Periodic status messages (5 updates)
   - Message format validation
   - Payload structure (progress, confidence fields)

3. **Message Delivery Reliability** (3 tests)
   - 10 sequential messages
   - Order preservation (sequence numbers)
   - Outbox verification

4. **Concurrent Messaging** (3 tests)
   - 3 agents sending to each other (6 messages total)
   - Inbox isolation verification
   - Message ID uniqueness

5. **Message Bus Cleanup** (2 tests)
   - Agent directory cleanup
   - Filesystem cleanup verification

6. **High-Frequency Stress Test** (1 test)
   - 50 rapid messages
   - Performance metrics (messages/sec)
   - No message loss validation

---

## MVP Requirements Coverage

| Requirement | Suite 1 | Suite 2 | Suite 3 | Status |
|-------------|---------|---------|---------|--------|
| **Background process management** | ✓ (Tests 2, 6, 10) | ✓ (Test 4) | - | **COVERED** |
| **File-based IPC (message bus)** | ✓ (Tests 2, 10) | ✓ (Test 5) | ✓ (All tests) | **COVERED** |
| **Checkpoint/restore** | ✓ (Test 5) | ✓ (Tests 1-4, 7-8) | - | **COVERED** |
| **Signal-based pause/resume** | ✓ (Tests 4, 7) | ✓ (Tests 5-7) | - | **COVERED** |
| **2-agent coordination** | ✓ (Test 6) | - | ✓ (Tests 1-4) | **COVERED** |

---

## Output Formats

### TAP Output (`mvp-test-tap-TIMESTAMP.tap`)

```tap
TAP version 13
ok 1 - Basic Smoke Tests # time=15s tests=25 passed=25
ok 2 - State Management & Checkpointing # time=18s tests=16 passed=16
ok 3 - Agent Coordination # time=8s tests=9 passed=9
1..3
```

**Failure Example**:
```tap
TAP version 13
ok 1 - Basic Smoke Tests # time=15s tests=25 passed=25
not ok 2 - State Management & Checkpointing # time=12s tests=16 failed=2
  ---
  message: 'Suite failures detected'
  severity: fail
  data:
    exit_code: 1
    duration: 12s
    log_file: /tmp/cfn-mvp-test-logs/suite-2-20251006_123456.log
  ...
ok 3 - Agent Coordination # time=8s tests=9 passed=9
1..3
```

### Console Output

**Success**:
```
========================================
   CFN MVP Test Harness - Sprint 1.4
========================================
Timestamp:     20251006_123456
Log Directory: /tmp/cfn-mvp-test-logs
========================================

┌────────────────────────────────────────┐
│ Suite 1: Basic Smoke Tests            │
└────────────────────────────────────────┘

✓ SUITE PASSED - Basic Smoke Tests (15s)
  Tests: 25 passed, 0 failed, 25 total

...

========================================
         TEST HARNESS SUMMARY
========================================
Test Suites:
  Total:   3
  Passed:  3

Individual Tests:
  Total:   50
  Passed:  50

Execution Time: 41s

MVP Requirements Coverage:
  ✓ Background process management (spawn, status, shutdown)
  ✓ File-based IPC (message bus delivery)
  ✓ Checkpoint/restore (versioning, validation, live restore)
  ✓ Signal-based pause/resume (SIGSTOP/SIGCONT handling)
  ✓ 2-agent coordination (bidirectional messaging)

Log Files:
  Harness log: /tmp/cfn-mvp-test-logs/mvp-test-harness-20251006_123456.log
  TAP output:  /tmp/cfn-mvp-test-logs/mvp-test-tap-20251006_123456.tap
  Suite logs:  /tmp/cfn-mvp-test-logs/suite-*-20251006_123456.log
========================================

========================================
  ✓ ALL TEST SUITES PASSED
========================================
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: CLI Coordination MVP Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run MVP Test Harness
        run: |
          cd tests/cli-coordination
          ./mvp-test.sh

      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: /tmp/cfn-mvp-test-logs/
```

### Jenkins

```groovy
pipeline {
    agent any
    stages {
        stage('Test') {
            steps {
                sh '''
                    cd tests/cli-coordination
                    ./mvp-test.sh
                '''
            }
        }
    }
    post {
        always {
            publishTAP testResults: '/tmp/cfn-mvp-test-logs/*.tap'
            archiveArtifacts artifacts: '/tmp/cfn-mvp-test-logs/**'
        }
    }
}
```

---

## Troubleshooting

### Test Failures

1. **Check suite logs**: `/tmp/cfn-mvp-test-logs/suite-N-TIMESTAMP.log`
2. **Review TAP output**: `/tmp/cfn-mvp-test-logs/mvp-test-tap-TIMESTAMP.tap`
3. **Examine harness log**: `/tmp/cfn-mvp-test-logs/mvp-test-harness-TIMESTAMP.log`

### Common Issues

**Issue**: `Script not found` error
- **Cause**: Test suite script missing or incorrect path
- **Fix**: Verify all 3 test scripts exist in `tests/cli-coordination/`

**Issue**: Permission denied
- **Cause**: Scripts not executable
- **Fix**: `chmod +x tests/cli-coordination/*.sh`

**Issue**: Test hangs indefinitely
- **Cause**: Agent process not terminating
- **Fix**: Kill orphaned processes: `pkill -f "cfn-agent-"`

**Issue**: Message bus not cleared
- **Cause**: `/dev/shm/cfn-mvp/messages` persistence
- **Fix**: Manual cleanup: `rm -rf /dev/shm/cfn-mvp/messages`

---

## Performance Benchmarks

**Expected Execution Times** (2023 hardware):
- Suite 1 (Basic): 12-18s
- Suite 2 (State): 15-22s
- Suite 3 (Coordination): 6-10s
- **Total**: 30-50s (average: ~41s)

**Test Counts**:
- Total tests: ~50
- Expected pass rate: 100%
- Acceptable pass rate: ≥95%

---

## Development Workflow

### Adding New Tests

1. **Choose appropriate suite**:
   - Basic functionality → `mvp-test-basic.sh`
   - State persistence → `mvp-test-state.sh`
   - Agent messaging → `mvp-test-coordination.sh`

2. **Follow existing patterns**:
   - Use `assert_*` helper functions
   - Update test counters (`TESTS_RUN`, `TESTS_PASSED`, `TESTS_FAILED`)
   - Add descriptive test names

3. **Validate locally**:
   ```bash
   ./mvp-test.sh
   ```

4. **Update documentation**:
   - Add test to this README
   - Update expected test counts

---

## Maintenance

**Log Rotation**:
- Logs stored in `/tmp/cfn-mvp-test-logs/` (automatically cleaned on reboot)
- For persistent logs, change `TEST_LOG_DIR` in `mvp-test.sh`

**Test Suite Versioning**:
- Each suite includes Sprint number in header comment
- Version alignment: Suite 1 (Sprint 1.1), Suite 2 (Sprint 1.2), Suite 3 (Sprint 1.3)

---

## Support

**Contact**: Sprint 1.4 Team
**Documentation**: `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/cli-coordination/README.md`
**Log Location**: `/tmp/cfn-mvp-test-logs/`
