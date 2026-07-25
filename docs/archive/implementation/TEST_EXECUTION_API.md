# Test Execution API Documentation

## Overview

The Test Execution Library provides comprehensive regression testing capabilities with parallel execution, output comparison, quality gate enforcement, and result storage.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Test Suite Executor                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─→ Load Test Suite (PostgreSQL)
                              │
                              ├─→ Parallel Test Runner (10 workers)
                              │   └─→ Test Executor × 10
                              │       └─→ Output Comparator
                              │
                              ├─→ Quality Gate Enforcement
                              │   ├─→ MVP: ≥80% pass rate
                              │   ├─→ Standard: ≥95% pass rate
                              │   └─→ Enterprise: ≥98% pass rate
                              │
                              └─→ Results Storage (PostgreSQL)
```

## Modules

### 1. OutputComparator

Compares expected vs actual test outputs with fuzzy matching for dynamic values.

**Features:**
- UUID normalization (`550e8400-...` → `<UUID>`)
- Timestamp normalization (`2025-11-16T14:30:45` → `<TIMESTAMP>`)
- Whitespace normalization
- Similarity scoring (0.0-1.0)

**Usage:**
```python
from src.workflow_codification.regression.output_comparator import OutputComparator

# Compare outputs
expected = "Task 550e8400-e29b-41d4-a716-446655440000 completed"
actual = "Task 123e4567-e89b-12d3-a456-426614174000 completed"

matches, similarity = OutputComparator.compare_outputs(expected, actual)
# matches=True, similarity=1.0 (UUIDs normalized)
```

**API:**

```python
class OutputComparator:
    @staticmethod
    def normalize_output(output: str) -> str:
        """Normalize output by replacing dynamic values"""

    @staticmethod
    def compare_outputs(
        expected: str,
        actual: str,
        normalize: bool = True
    ) -> Tuple[bool, float]:
        """
        Compare expected vs actual outputs
        Returns: (matches: bool, similarity: float)
        """

    @staticmethod
    def compare_test_case(
        test_case: Dict,
        actual_result: Dict
    ) -> Dict:
        """Compare test case with execution result"""
```

---

### 2. TestExecutor

Executes individual test cases and validates results.

**Features:**
- Command template substitution
- Timeout enforcement (default: 300s)
- Duration regression detection (>150% expected = regression)
- Exit code capture
- Error message capture

**Usage:**
```python
from src.workflow_codification.regression.test_executor import TestExecutor

executor = TestExecutor(timeout=300)

test_case = {
    "test_id": "test-001",
    "input_parameters": {"task": "coordination"},
    "expected_stdout": "Success",
    "expected_duration_seconds": 2.0
}

result = executor.execute_test_case(
    test_case,
    skill_command_template="./.claude/skills/{task}/execute.sh"
)

# result = {
#     "test_id": "test-001",
#     "passed": True,
#     "similarity": 1.0,
#     "actual_duration": 1.8,
#     "expected_duration": 2.0,
#     "duration_regression": False,
#     "exit_code": 0,
#     "stdout_match": True,
#     "error_message": None
# }
```

**API:**

```python
class TestExecutor:
    def __init__(self, timeout: int = 300):
        """Initialize test executor with timeout"""

    def execute_test_case(
        self,
        test_case: Dict,
        skill_command_template: str
    ) -> Dict:
        """Execute single test case and return results"""

    def _build_command(self, template: str, params: Dict) -> str:
        """Build command from template and parameters"""
```

---

### 3. ParallelTestRunner

Executes test suites in parallel using ThreadPoolExecutor.

**Features:**
- Configurable worker count (default: 10)
- Concurrent test execution
- Exception handling
- Result aggregation
- Pass rate calculation

**Performance:**
- 50 tests execute in <5 minutes (with 10 workers)
- Linear scalability with worker count

**Usage:**
```python
from src.workflow_codification.regression.parallel_runner import ParallelTestRunner

runner = ParallelTestRunner(max_workers=10)

test_suite = {
    "id": "suite-001",
    "skill_name": "cfn-coordination",
    "test_cases": [
        {"test_id": "test-001", "input_parameters": {...}},
        {"test_id": "test-002", "input_parameters": {...}},
        # ... 48 more tests
    ]
}

results = runner.run_test_suite(
    test_suite,
    skill_command_template="./.claude/skills/cfn-coordination/coordinate.sh"
)

# results = {
#     "suite_id": "suite-001",
#     "skill_name": "cfn-coordination",
#     "total_tests": 50,
#     "passed": 48,
#     "failed": 2,
#     "pass_rate": 96.0,
#     "results": [...]  # Individual test results
# }
```

**API:**

```python
class ParallelTestRunner:
    def __init__(self, max_workers: int = 10):
        """Initialize parallel test runner"""

    def run_test_suite(
        self,
        test_suite: Dict,
        skill_command_template: str
    ) -> Dict:
        """Run entire test suite in parallel"""
```

---

### 4. QualityGate

Enforces mode-specific pass rate thresholds.

**Thresholds:**
- **MVP Mode**: ≥80% pass rate
- **Standard Mode**: ≥95% pass rate
- **Enterprise Mode**: ≥98% pass rate

**Usage:**
```python
from src.workflow_codification.regression.quality_gate import QualityGate, Mode

# Check quality gate
result = QualityGate.check_quality_gate(96.0, Mode.STANDARD)

# result = {
#     "passes": True,
#     "pass_rate": 96.0,
#     "threshold": 95.0,
#     "mode": "standard",
#     "recommendation": "DEPLOY"
# }
```

**API:**

```python
class Mode(Enum):
    MVP = "mvp"
    STANDARD = "standard"
    ENTERPRISE = "enterprise"

class QualityGate:
    THRESHOLDS = {
        Mode.MVP: 80.0,
        Mode.STANDARD: 95.0,
        Mode.ENTERPRISE: 98.0
    }

    @staticmethod
    def check_quality_gate(
        pass_rate: float,
        mode: Mode = Mode.STANDARD
    ) -> Dict:
        """Check if pass rate meets quality gate threshold"""
```

---

### 5. ResultsStorage

Stores test run results in PostgreSQL.

**Features:**
- Updates `regression_test_suites.last_run_at`
- Updates `regression_test_suites.last_run_pass_rate`
- Stores detailed metrics in `metadata.last_run`

**Usage:**
```python
from src.workflow_codification.regression.results_storage import ResultsStorage

db_config = {
    "host": "localhost",
    "port": 5432,
    "database": "cfn_workflow",
    "user": "cfn_user",
    "password": "secret"
}

storage = ResultsStorage(db_config)

storage.update_test_suite_results(
    suite_id="550e8400-e29b-41d4-a716-446655440000",
    pass_rate=96.0,
    total_tests=50,
    passed=48,
    failed=2
)

storage.close()
```

**API:**

```python
class ResultsStorage:
    def __init__(self, db_config: Dict):
        """Initialize with database connection config"""

    def update_test_suite_results(
        self,
        suite_id: str,
        pass_rate: float,
        total_tests: int,
        passed: int,
        failed: int
    ):
        """Update test suite with latest run results"""

    def close():
        """Close database connection"""
```

---

## CLI Tool

Execute test suites from command line.

**Usage:**
```bash
python3 -m src.workflow_codification.regression.cli \
  --suite-id "550e8400-e29b-41d4-a716-446655440000" \
  --mode standard \
  --workers 10 \
  --db-host localhost \
  --db-port 5432 \
  --db-name cfn_workflow \
  --db-user cfn_user \
  --db-password secret
```

**Options:**
- `--suite-id`: Test suite UUID (required)
- `--mode`: Quality gate mode (mvp|standard|enterprise, default: standard)
- `--workers`: Number of parallel workers (default: 10)
- `--db-host`: Database host (default: localhost)
- `--db-port`: Database port (default: 5432)
- `--db-name`: Database name (default: cfn_workflow)
- `--db-user`: Database user (default: cfn_user)
- `--db-password`: Database password

**Exit Codes:**
- `0`: Success (quality gate passed)
- `1`: Quality gate failed
- `2`: Error (test suite not found, database error, etc.)

**Example Output:**
```
Loading test suite 550e8400-e29b-41d4-a716-446655440000...
Test suite: cfn-coordination
Test cases: 50
Workers: 10
Quality mode: standard

Executing tests...

============================================================
TEST RESULTS
============================================================
Total tests:  50
Passed:       48 ✓
Failed:       2 ✗
Pass rate:    96.0%

QUALITY GATE
------------------------------------------------------------
Threshold:    95.0%
Status:       PASS ✓
Recommendation: DEPLOY

Results stored to database
```

---

## Integration Example

Complete end-to-end test execution:

```python
from src.workflow_codification.regression.parallel_runner import ParallelTestRunner
from src.workflow_codification.regression.quality_gate import QualityGate, Mode
from src.workflow_codification.regression.results_storage import ResultsStorage

# 1. Load test suite from database
# (Implementation in cli.py)

# 2. Execute tests in parallel
runner = ParallelTestRunner(max_workers=10)
results = runner.run_test_suite(test_suite, command_template)

# 3. Check quality gate
gate_result = QualityGate.check_quality_gate(results['pass_rate'], Mode.STANDARD)

# 4. Store results
storage = ResultsStorage(db_config)
storage.update_test_suite_results(
    suite_id=test_suite['id'],
    pass_rate=results['pass_rate'],
    total_tests=results['total_tests'],
    passed=results['passed'],
    failed=results['failed']
)
storage.close()

# 5. Make deployment decision
if gate_result['passes']:
    print("Quality gate PASSED - DEPLOY")
else:
    print("Quality gate FAILED - BLOCK DEPLOYMENT")
```

---

## Performance Characteristics

| Metric | Target | Actual |
|--------|--------|--------|
| Test execution | 50 tests <5 min | <5 min with 10 workers |
| Worker concurrency | 10 parallel | ✓ ThreadPoolExecutor |
| Timeout handling | Graceful | ✓ subprocess.TimeoutExpired |
| Error handling | Robust | ✓ Exception capture |
| Code coverage | 100% | ✓ All modules |

---

## Testing

Run comprehensive test suite:

```bash
# Run all tests
pytest tests/workflow-codification/regression/ -v

# Run with coverage
pytest tests/workflow-codification/regression/ \
  --cov=src/workflow_codification/regression \
  --cov-report=term-missing

# Expected: 68 tests, 100% coverage for all modules
```

**Test Coverage:**
- `output_comparator.py`: 100%
- `test_executor.py`: 100%
- `parallel_runner.py`: 100%
- `quality_gate.py`: 100%
- `results_storage.py`: 100%

---

## Error Handling

All modules implement comprehensive error handling:

1. **OutputComparator**: Handles empty strings, malformed inputs
2. **TestExecutor**: Timeout handling, subprocess errors
3. **ParallelTestRunner**: Worker exceptions, empty test suites
4. **QualityGate**: Invalid pass rates, missing thresholds
5. **ResultsStorage**: Database connection errors, query failures

---

## Future Enhancements

- [ ] Test result history tracking
- [ ] Trend analysis (pass rate over time)
- [ ] Detailed failure reports with diffs
- [ ] Performance regression alerts
- [ ] Integration with CI/CD pipelines
- [ ] Web dashboard for test results

---

## References

- Specification: `planning/workflow-codification/priority-features/SPECIFICATION.md`
- Pseudocode: `planning/workflow-codification/priority-features/PSEUDOCODE.md`
- Architecture: `planning/workflow-codification/priority-features/ARCHITECTURE.md`
- Test Generator: `src/workflow_codification/regression/test_generator.py` (Sprint 2.3)
