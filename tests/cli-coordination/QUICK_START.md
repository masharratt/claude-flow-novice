# Quick Start - CLI Coordination MVP Test Harness

## Run All Tests (Recommended)

```bash
cd tests/cli-coordination
./mvp-test.sh
```

**Expected Output**:
- 3 test suites
- ~50 individual tests
- Execution time: 30-50 seconds
- Exit code: 0 (success) or 1 (failure)

---

## Run Individual Suites

### Suite 1: Basic Smoke Tests
```bash
./mvp-test-basic.sh
```
**Coverage**: Core CLI framework (spawn, status, pause/resume)

### Suite 2: State Management
```bash
./mvp-test-state.sh
```
**Coverage**: Checkpointing, versioning, restore, cleanup

### Suite 3: Agent Coordination
```bash
./mvp-test-coordination.sh
```
**Coverage**: Agent-to-agent messaging, bidirectional communication

---

## Understanding Test Results

### Success Output
```
========================================
  ✓ ALL TEST SUITES PASSED
========================================
```

### Failure Output
```
========================================
  ✗ SOME TEST SUITES FAILED
========================================
```

**Check logs at**: `/tmp/cfn-mvp-test-logs/`

---

## Troubleshooting

**Scripts not executable?**
```bash
chmod +x tests/cli-coordination/*.sh
```

**Orphaned processes?**
```bash
pkill -f "cfn-agent-"
```

**Clean message bus?**
```bash
rm -rf /dev/shm/cfn-mvp/messages
```

---

## View Test Logs

**TAP output (CI/CD parseable)**:
```bash
cat /tmp/cfn-mvp-test-logs/mvp-test-tap-*.tap
```

**Harness log (detailed execution)**:
```bash
cat /tmp/cfn-mvp-test-logs/mvp-test-harness-*.log
```

**Individual suite logs**:
```bash
cat /tmp/cfn-mvp-test-logs/suite-*.log
```

---

## CI/CD Integration

**GitHub Actions**: See `README.md` for full workflow
**Jenkins**: TAP-compatible output ready for `publishTAP`

---

## More Information

See `README.md` for:
- Detailed test coverage
- MVP requirements mapping
- Development workflow
- Performance benchmarks
