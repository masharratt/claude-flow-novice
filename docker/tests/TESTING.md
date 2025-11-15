# Phase 4 Workflow Codification System - Test Documentation

**Comprehensive test suite for validating the Phase 4 Workflow Codification System**

---

## Overview

This test suite provides comprehensive coverage of the Phase 4 Workflow Codification System, which automates the detection of workflow patterns, generation of reusable skills, approval workflows, cost tracking, and continuous improvement through edge case detection.

**Total Test Suites:** 8
**Total Test Scenarios:** 73
**Test Approach:** TDD (Test-Driven Development) - No Docker required

---

## Quick Start

### Run All Tests

```bash
# Run all test suites
cd docker/tests
./run-all-tests.sh
```

### Run Individual Test Suites

```bash
# Pattern Detection (10 tests)
./test-pattern-detection.sh

# Skill Generation (11 tests)
./test-skill-generation.sh

# Approval Workflow (16 tests)
./test-approval-workflow.sh

# Edge Case Tracking (11 tests)
./test-edge-case-tracking.sh

# Cost Tracking (11 tests)
./test-cost-tracking.sh

# E2E Workflow (10 tests)
./test-workflow-codification-e2e.sh

# Security (10 tests)
./test-workflow-codification-security.sh

# Performance (10 tests)
./test-workflow-codification-performance.sh
```

---

## Test Suite Details

### 1. Pattern Detection (`test-pattern-detection.sh`)

**Purpose:** Validate pattern detection algorithm with ≥5 occurrences and 85% similarity threshold

**Test Count:** 10 tests

**Coverage:**
- ✅ Detect patterns with ≥5 occurrences
- ✅ Validate 85% similarity threshold
- ✅ Test deterministic classification
- ✅ Verify confidence scoring
- ✅ Test priority assignment
- ✅ Edge Case: No patterns found
- ✅ Edge Case: Patterns below threshold
- ✅ Edge Case: Non-deterministic workflows filtered
- ✅ Pattern metadata extraction
- ✅ Similarity matrix calculation

**Key Assertions:**
- Pattern count matches threshold
- Similarity calculation accurate
- Confidence scores ≥0.75
- Priority assignment logic correct

**Mock Data:** `mocks/generate-workflow-reflections.sh`

---

### 2. Skill Generation (`test-skill-generation.sh`)

**Purpose:** Validate skill generation from patterns with complete package structure and validation

**Test Count:** 11 tests

**Coverage:**
- ✅ Generate valid bash scripts (syntax check)
- ✅ Complete skill package (6 files: skill.sh, SKILL.md, README.md, CHANGELOG.md, tests/, examples/)
- ✅ Parameter validation logic
- ✅ Error handling verification
- ✅ Test coverage ≥80%
- ✅ Edge Case: Invalid pattern input
- ✅ Edge Case: Generation timeout
- ✅ Edge Case: Missing reflections
- ✅ Shellcheck validation
- ✅ Skill metadata completeness
- ✅ Executable permissions

**Key Assertions:**
- All generated scripts pass `bash -n` syntax check
- All required files present
- Error handling includes `set -euo pipefail`
- Shellcheck passes (if available)

**Tools Used:** `shellcheck`, `bash -n`, `jq`

---

### 3. Approval Workflow (`test-approval-workflow.sh`)

**Purpose:** Validate 8-state approval workflow with notifications, SLA tracking, and audit trail

**Test Count:** 16 tests

**Coverage:**
- ✅ State Transition: Draft → Pending Expert Review
- ✅ State Transition: Pending → Expert Reviewing
- ✅ State Transition: Expert Reviewing → Approved
- ✅ State Transition: Expert Reviewing → Rejected
- ✅ State Transition: Expert Reviewing → Needs Correction
- ✅ State Transition: Approved → Pending Deployment → Deployed → Active
- ✅ State Transition: Needs Correction → Draft (loop)
- ✅ Expert notification generation
- ✅ Approval actions (approve/reject/correct)
- ✅ Audit trail logging
- ✅ SLA tracking and escalation
- ✅ Edge Case: Expert timeout
- ✅ Edge Case: Concurrent approvals
- ✅ Edge Case: Deployment failure rollback
- ✅ Edge Case: Invalid state transition
- ✅ Edge Case: Missing audit data recovery

**State Machine:**
```
draft → pending_expert_review → expert_reviewing → approved/rejected/needs_correction
approved → pending_deployment → deployed → active
needs_correction → draft (loop)
deployment_failed → pending_deployment (retry)
```

**Key Assertions:**
- All state transitions valid
- Invalid transitions rejected
- Audit trail complete
- SLA expiration detected

---

### 4. Edge Case Tracking (`test-edge-case-tracking.sh`)

**Purpose:** Validate edge case capture, recurring detection (≥3), and resolution workflow

**Test Count:** 11 tests

**Coverage:**
- ✅ Capture execution failures
- ✅ Recurring detection (≥3 occurrences)
- ✅ Update proposal generation
- ✅ Resolution workflow
- ✅ Severity classification (critical/high/medium/low)
- ✅ Edge Case: Deduplication
- ✅ Edge Case: Resolved handling
- ✅ Edge Case: High-frequency failures (>10)
- ✅ Edge case metadata completeness
- ✅ Recurring detection threshold tuning
- ✅ Timeline tracking (first_seen/last_seen)

**Severity Levels:**
- **Critical:** Security issues
- **High:** Frequent failures (≥5) or critical errors
- **Medium:** Recurring failures (≥3)
- **Low:** Occasional failures (<3)

**Key Assertions:**
- Deduplication works (same error = same case_id)
- Recurring detection threshold configurable
- Resolved cases excluded from active tracking

---

### 5. Cost Tracking (`test-cost-tracking.sh`)

**Purpose:** Validate cost avoided calculation, ROI metrics, and dashboard reporting

**Test Count:** 11 tests

**Coverage:**
- ✅ Cost avoided calculation
- ✅ Monthly ROI calculation
- ✅ Annual ROI calculation
- ✅ Dashboard metrics (total skills, executions, cost avoided)
- ✅ Execution logging
- ✅ Savings accuracy validation (5% tolerance)
- ✅ Edge Case: Zero executions
- ✅ Edge Case: Negative cost validation
- ✅ Edge Case: Missing pricing data
- ✅ Success rate calculation
- ✅ Time series tracking (first/last execution)

**Cost Calculation:**
```
cost_avoided_per_execution = (manual_minutes / 60) * hourly_rate
total_cost_avoided = executions * cost_avoided_per_execution
monthly_roi = total_cost_avoided (current month)
annual_roi = monthly_roi * 12
```

**Default Pricing:**
- Manual hour rate: $50/hour
- Average workflow minutes: 30 minutes
- Cost avoided per execution: $25

**Key Assertions:**
- Cost calculations within 5% tolerance
- Success rate = successful_executions / total_executions
- Failed executions don't add to cost avoided

---

### 6. End-to-End Workflow (`test-workflow-codification-e2e.sh`)

**Purpose:** Validate complete pipeline from pattern detection through deployment and cost tracking

**Test Count:** 10 tests

**Coverage:**
- ✅ Full pipeline E2E (all 5 stages)
- ✅ Multi-team deployment
- ✅ Cross-component data flow
- ✅ Skill versioning and rollback
- ✅ Notification delivery
- ✅ Edge Case: Pipeline failure recovery
- ✅ Edge Case: Partial deployment
- ✅ Edge Case: Data inconsistency detection
- ✅ Pipeline metrics collection
- ✅ Idempotency check

**Pipeline Stages:**
1. Pattern Detection → Identify patterns
2. Skill Generation → Create skill packages
3. Approval Workflow → Expert review
4. Deployment → Deploy to teams
5. Cost Tracking → Log executions and ROI

**Key Assertions:**
- All stages complete successfully
- Data flows correctly between components
- Pipeline is idempotent (same input = same output)
- Failures trigger recovery mechanisms

---

### 7. Security (`test-workflow-codification-security.sh`)

**Purpose:** Validate input validation, secrets management, access control, and audit logging

**Test Count:** 10 tests

**Coverage:**
- ✅ SQL injection prevention
- ✅ Command injection prevention
- ✅ Secrets management (store/retrieve)
- ✅ Access control (RBAC)
- ✅ Audit logging
- ✅ Edge Case: Malicious skill generation attempt
- ✅ Edge Case: Unauthorized approval attempt
- ✅ Input length validation
- ✅ Secret deletion
- ✅ XSS prevention

**RBAC Roles:**
- **Admin:** read, write, approve, deploy
- **Expert:** read, write, approve
- **Developer:** read, write
- **Viewer:** read

**Security Patterns Blocked:**
- SQL injection: `DROP`, `DELETE`, `'; --`, etc.
- Command injection: `$(`, `` ` ``, `&&`, `||`, `;`
- XSS: `<script>`, HTML tags
- Path traversal: `../`, `..\\`

**Key Assertions:**
- All injection attempts blocked
- Secrets encrypted in storage
- Access control enforced
- Audit log complete and immutable

---

### 8. Performance (`test-workflow-codification-performance.sh`)

**Purpose:** Validate performance benchmarks for all components

**Test Count:** 10 tests

**Coverage:**
- ✅ Skill generation < 120s
- ✅ Skill execution < 30s
- ✅ Pattern query < 5s
- ✅ Tracking overhead < 100ms
- ✅ Edge Case: Large dataset performance
- ✅ Edge Case: Concurrent execution stress test
- ✅ Memory usage validation
- ✅ Caching performance improvement
- ✅ Database query optimization
- ✅ Batch processing vs sequential

**Performance Targets:**
| Component | Target | Critical Threshold |
|-----------|--------|--------------------|
| Skill Generation | < 60s | < 120s |
| Skill Execution | < 10s | < 30s |
| Pattern Query | < 2s | < 5s |
| Tracking Overhead | < 50ms | < 100ms |
| Large Dataset Query | < 5s | < 10s |

**Key Assertions:**
- All operations meet performance targets
- Concurrent execution efficient
- Memory usage reasonable (<100MB increase)
- Caching improves performance

---

## Test Framework

### Helper Functions (`test-helpers.sh`)

**Assertion Functions:**
- `assert_equals` - Compare expected vs actual
- `assert_not_equals` - Verify values differ
- `assert_exit_code` - Check command exit code
- `assert_contains` - String contains substring
- `assert_not_contains` - String doesn't contain substring
- `assert_file_exists` - File exists
- `assert_file_not_exists` - File doesn't exist
- `assert_dir_exists` - Directory exists
- `assert_greater_than` - Numeric comparison
- `assert_less_than` - Numeric comparison
- `assert_matches_pattern` - Regex match
- `assert_json_valid` - JSON validation

**Test Utilities:**
- `create_test_dir` - Create temporary test directory
- `cleanup_test_dir` - Remove test directory
- `random_string` - Generate random string
- `timestamp` - Unix timestamp
- `iso_timestamp` - ISO8601 timestamp

**Performance Utilities:**
- `start_timer` - Start named timer
- `end_timer` - End timer and return elapsed ms
- `measure_time` - Measure command execution time

**Mock Generators:**
- `generate_mock_workflow_pattern` - Pattern data
- `generate_mock_approval_request` - Approval data
- `generate_mock_edge_case` - Edge case data
- `generate_mock_cost_data` - Cost tracking data

**Reporting:**
- `print_test_summary` - Summary with pass/fail counts
- `reset_test_counters` - Reset for new test suite

---

## Mock Data

### Workflow Reflections (`mocks/generate-workflow-reflections.sh`)

Generates realistic workflow reflection data with:
- **5 occurrences** of `deploy_frontend` (detectable pattern)
- **3 occurrences** of `database_migration` (below threshold)
- **2 occurrences** of `provision_team` (non-deterministic)
- **1 occurrence** of ad-hoc workflows (filtered out)

### Skill Metadata (`mocks/generate-skill-metadata.sh`)

Generates skill metadata with:
- Active skills with execution history
- Pending skills awaiting approval
- Cost tracking data
- Success rates

---

## Running Tests

### Prerequisites

```bash
# Required tools
bash >= 4.0
jq >= 1.5
bc (for floating-point math)

# Optional (for enhanced validation)
shellcheck (for bash linting)
postgresql (for database tests, or use file-based mocks)
```

### Test Execution Modes

**1. Run All Tests:**
```bash
./docker/tests/run-all-tests.sh
```

**2. Run Single Suite:**
```bash
./docker/tests/test-pattern-detection.sh
```

**3. Run with Verbose Output:**
```bash
bash -x ./docker/tests/test-pattern-detection.sh
```

**4. Run Specific Test (modify script):**
```bash
# Comment out all tests except the one you want
vim test-pattern-detection.sh
./test-pattern-detection.sh
```

---

## Test Output

### Success Output

```
========================================
Pattern Detection Test Suite
========================================

[TEST] Pattern Detection - Minimum Occurrences Threshold (≥5)
[PASS] Detected correct patterns with ≥5 occurrences

[TEST] Pattern Detection - 85% Similarity Threshold
[PASS] Similarity calculation meets 85% threshold

...

========================================
Test Summary: Pattern Detection Test Suite
========================================

Total Tests Run:    10
Tests Passed:       10
Tests Failed:       0

Pass Rate:          100.00%

✅ All tests passed!
```

### Failure Output

```
[TEST] Pattern Detection - Minimum Occurrences Threshold (≥5)
[FAIL] Pattern Detection - Minimum Occurrences Threshold (≥5) - Expected: '1', Got: '0'

...

========================================
Test Summary: Pattern Detection Test Suite
========================================

Total Tests Run:    10
Tests Passed:       9
Tests Failed:       1

Failed Tests:
  ✗ Pattern Detection - Minimum Occurrences Threshold (≥5) - Expected: '1', Got: '0'

Pass Rate:          90.00%

❌ Some tests failed
```

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Phase 4 Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y jq bc shellcheck

      - name: Run test suite
        run: |
          cd docker/tests
          chmod +x *.sh
          ./run-all-tests.sh

      - name: Upload test results
        uses: actions/upload-artifact@v2
        with:
          name: test-results
          path: docker/tests/test-results.json
```

---

## Troubleshooting

### Common Issues

**Issue:** `jq: command not found`
```bash
# Install jq
sudo apt-get install jq  # Ubuntu/Debian
brew install jq          # macOS
```

**Issue:** `bc: command not found`
```bash
# Install bc
sudo apt-get install bc  # Ubuntu/Debian
brew install bc          # macOS
```

**Issue:** Tests fail with "Permission denied"
```bash
# Make all test scripts executable
chmod +x docker/tests/*.sh
```

**Issue:** Mock data not found
```bash
# Generate mock data
cd docker/tests/mocks
./generate-workflow-reflections.sh ./data
./generate-skill-metadata.sh ./data
```

---

## Test Coverage Summary

| Test Suite | Tests | Focus Areas |
|------------|-------|-------------|
| Pattern Detection | 10 | Algorithm accuracy, thresholds, classification |
| Skill Generation | 11 | Package completeness, validation, error handling |
| Approval Workflow | 16 | State machine, notifications, SLA, audit |
| Edge Case Tracking | 11 | Failure capture, recurring detection, resolution |
| Cost Tracking | 11 | ROI calculation, metrics, accuracy |
| E2E Workflow | 10 | Full pipeline, data flow, recovery |
| Security | 10 | Injection prevention, access control, secrets |
| Performance | 10 | Speed benchmarks, scalability, optimization |
| **Total** | **73** | **Comprehensive system validation** |

---

## Next Steps

1. **Run baseline tests:** Execute all test suites to establish baseline
2. **Implement components:** Use TDD approach - write tests first, then implement
3. **Continuous testing:** Run tests after each change
4. **Expand coverage:** Add tests for new features
5. **Performance monitoring:** Track performance metrics over time

---

## Contributing

When adding new tests:

1. Follow existing naming conventions (`test-*.sh`)
2. Use test helpers from `test-helpers.sh`
3. Include comprehensive edge case coverage
4. Document expected behavior
5. Update this TESTING.md file

---

## Version History

- **v1.0.0** (2025-11-15): Initial comprehensive test suite
  - 8 test suites
  - 73 test scenarios
  - TDD approach (no Docker required)
  - Mock data generators
  - Comprehensive documentation

---

**For questions or issues:** See main project README or create an issue in the repository.
