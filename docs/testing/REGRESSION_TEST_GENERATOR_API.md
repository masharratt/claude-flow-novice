# Regression Test Suite Generator API

**Version:** 1.0.0
**Date:** 2025-11-16
**Module:** `src.workflow_codification.regression`

---

## Overview

The Regression Test Suite Generator automatically creates comprehensive test suites from historical skill execution data. It analyzes successful executions, identifies unique patterns, and generates test cases with priority assignments.

**Workflow:**
1. Fetch successful executions from PostgreSQL (execution_traces table)
2. Deduplicate by SHA256 hash of input parameters
3. Stratified sampling by team (proportional representation)
4. Build test cases with P0/P1/P2 priorities
5. Store test suite in PostgreSQL (regression_test_suites table)

---

## Quick Start

```python
from src.workflow_codification.regression.test_generator import RegressionTestGenerator

# Database configuration
db_config = {
    'host': 'localhost',
    'port': 5432,
    'database': 'workflow_codification',
    'user': 'postgres',
    'password': 'your_password'
}

# Generate test suite
generator = RegressionTestGenerator(db_config)
try:
    summary = generator.generate_test_suite(
        skill_name="cfn-coordination",
        lookback_days=90,
        sample_size=50
    )

    print(f"Test suite generated: {summary['suite_id']}")
    print(f"Total tests: {summary['total_tests']}")
    print(f"Executions analyzed: {summary['executions_analyzed']}")

finally:
    generator.close()
```

---

## CLI Usage

```bash
python3 -m src.workflow_codification.regression.test_generator \
  --skill cfn-coordination \
  --lookback-days 90 \
  --sample-size 50 \
  --db-host localhost \
  --db-port 5432 \
  --db-name workflow_codification \
  --db-user postgres \
  --db-password your_password
```

**Output:**
```
✅ Regression Test Suite Generated
   Skill: cfn-coordination
   Suite ID: a3f5b2c1-4d6e-4f9a-8b2c-1e3f4a5b6c7d
   Total Tests: 50
   Executions Analyzed: 150
   Unique Patterns: 75
```

---

## API Reference

### RegressionTestGenerator

**Main orchestrator class combining all components**

#### Constructor

```python
RegressionTestGenerator(db_config: Dict)
```

**Parameters:**
- `db_config` (Dict): PostgreSQL connection configuration
  - `host` (str): Database host
  - `port` (int): Database port (default: 5432)
  - `database` (str): Database name
  - `user` (str): Database user
  - `password` (str): Database password

**Example:**
```python
db_config = {
    'host': 'localhost',
    'port': 5432,
    'database': 'workflow_codification',
    'user': 'postgres',
    'password': 'secret'
}
generator = RegressionTestGenerator(db_config)
```

---

#### generate_test_suite()

```python
generate_test_suite(
    skill_name: str,
    lookback_days: int = 90,
    sample_size: int = 50
) -> Dict
```

**Generate complete regression test suite**

**Parameters:**
- `skill_name` (str): Name of skill to generate tests for
- `lookback_days` (int, optional): Days of execution history to analyze (default: 90)
- `sample_size` (int, optional): Target number of test cases (default: 50)

**Returns:**
- `Dict`: Test suite summary with the following structure:
  ```python
  {
      "suite_id": "UUID",           # Test suite ID (UUID)
      "skill_name": "str",          # Skill name
      "total_tests": int,           # Number of test cases generated
      "sample_size": int,           # Target sample size
      "executions_analyzed": int,   # Total executions found
      "unique_patterns": int,       # Unique parameter combinations
      "test_cases_generated": int   # Actual test cases created
  }
  ```

**Error Response:**
  ```python
  {
      "skill_name": "str",
      "total_tests": 0,
      "error": "No successful executions found"
  }
  ```

**Example:**
```python
summary = generator.generate_test_suite(
    skill_name="cfn-coordination",
    lookback_days=30,  # Last 30 days only
    sample_size=25     # Generate 25 test cases
)

if 'error' in summary:
    print(f"Error: {summary['error']}")
else:
    print(f"Generated {summary['total_tests']} tests")
```

---

#### close()

```python
close() -> None
```

**Close all database connections**

Always call this method when done to properly release resources.

**Example:**
```python
try:
    summary = generator.generate_test_suite("skill-name")
finally:
    generator.close()  # Always cleanup
```

---

### ExecutionHistory

**Query and retrieve execution history from PostgreSQL**

#### Constructor

```python
ExecutionHistory(db_config: Dict)
```

#### fetch_successful_executions()

```python
fetch_successful_executions(
    skill_name: str,
    lookback_days: int = 90
) -> List[Dict]
```

**Fetch successful skill executions from history**

**Parameters:**
- `skill_name` (str): Skill to query
- `lookback_days` (int, optional): Days to look back (default: 90)

**Returns:**
- `List[Dict]`: Execution records with structure:
  ```python
  {
      "execution_id": "str",                     # Execution ID
      "input_parameters": Dict,                  # Input parameters
      "stdout": "str",                           # Execution output
      "execution_duration_seconds": float,       # Duration in seconds
      "team_invoked_by": "str",                  # Team name
      "execution_started_at": "ISO8601 string"   # Timestamp
  }
  ```

**Example:**
```python
history = ExecutionHistory(db_config)
executions = history.fetch_successful_executions(
    skill_name="cfn-coordination",
    lookback_days=7  # Last week only
)

for exec in executions:
    print(f"{exec['execution_id']}: {exec['input_parameters']}")

history.close()
```

---

### ExecutionDeduplicator

**SHA256-based parameter deduplication**

#### hash_parameters()

```python
@staticmethod
hash_parameters(parameters: Dict) -> str
```

**Generate SHA256 hash of input parameters**

**Parameters:**
- `parameters` (Dict): Input parameters dictionary

**Returns:**
- `str`: SHA256 hash (64 hex characters)

**Example:**
```python
params = {"mode": "standard", "count": 10}
hash1 = ExecutionDeduplicator.hash_parameters(params)
# Returns: "a3f5b2c1d4e6f7a8b9c0d1e2f3a4b5c6..."

# Order doesn't matter (uses sort_keys=True)
params_reversed = {"count": 10, "mode": "standard"}
hash2 = ExecutionDeduplicator.hash_parameters(params_reversed)
assert hash1 == hash2  # True
```

---

#### deduplicate_by_input()

```python
@staticmethod
deduplicate_by_input(executions: List[Dict]) -> List[Dict]
```

**Deduplicate executions by input parameters**

Keeps only the first occurrence (most recent, since executions are DESC ordered)

**Parameters:**
- `executions` (List[Dict]): Execution records

**Returns:**
- `List[Dict]`: Deduplicated execution records

**Example:**
```python
# 100 executions with some duplicates
executions = fetch_executions()

# Deduplicate
unique = ExecutionDeduplicator.deduplicate_by_input(executions)

print(f"Original: {len(executions)}")  # 100
print(f"Unique: {len(unique)}")        # 75 (25 duplicates removed)
```

---

### ExecutionSampler

**Stratified sampling for diverse test coverage**

#### stratified_sample()

```python
@staticmethod
stratified_sample(
    executions: List[Dict],
    sample_size: int,
    strata_key: str = 'team_invoked_by'
) -> List[Dict]
```

**Perform stratified sampling to ensure diversity**

Samples proportionally from each stratum (team) to match real usage patterns

**Parameters:**
- `executions` (List[Dict]): Execution records
- `sample_size` (int): Target number of samples
- `strata_key` (str, optional): Field to stratify by (default: 'team_invoked_by')

**Returns:**
- `List[Dict]`: Sampled executions with proportional representation

**Algorithm:**
- Proportional allocation: `(stratum_size / total_size) * sample_size`
- Minimum 1 sample per stratum
- Trim to exact sample_size if over-allocated

**Example:**
```python
# 100 executions: 70 from team-a, 30 from team-b
executions = unique_executions

ExecutionSampler.set_seed(42)  # Reproducible results
sampled = ExecutionSampler.stratified_sample(
    executions=executions,
    sample_size=50
)

# Result: ~35 from team-a, ~15 from team-b (70/30 split maintained)
```

---

#### set_seed()

```python
@staticmethod
set_seed(seed: int) -> None
```

**Set random seed for reproducible sampling**

**Parameters:**
- `seed` (int): Random seed value

**Example:**
```python
ExecutionSampler.set_seed(42)
sample1 = ExecutionSampler.stratified_sample(executions, 50)

ExecutionSampler.set_seed(42)
sample2 = ExecutionSampler.stratified_sample(executions, 50)

assert sample1 == sample2  # Same seed = same sample
```

---

### TestCaseBuilder

**Build test cases from execution records**

#### create_test_case()

```python
@staticmethod
create_test_case(
    test_id: str,
    execution: Dict,
    skill_name: str,
    priority: str = "P1"
) -> Dict
```

**Create single test case from execution record**

**Parameters:**
- `test_id` (str): Test case ID (format: `{skill}-reg-{number:03d}`)
- `execution` (Dict): Execution record
- `skill_name` (str): Skill being tested
- `priority` (str, optional): P0/P1/P2 (default: "P1")

**Returns:**
- `Dict`: Test case with structure:
  ```python
  {
      "test_id": "str",
      "skill_name": "str",
      "input_parameters": Dict,
      "expected_stdout": "str",
      "expected_duration_seconds": float,
      "priority": "P0|P1|P2",
      "created_at": "ISO8601 string",
      "metadata": {
          "source_execution_id": "str",
          "team": "str"
      }
  }
  ```

**Example:**
```python
execution = {
    "execution_id": "trace-001",
    "input_parameters": {"mode": "standard"},
    "stdout": "success",
    "execution_duration_seconds": 1.5,
    "team_invoked_by": "team-a"
}

test_case = TestCaseBuilder.create_test_case(
    test_id="cfn-test-reg-001",
    execution=execution,
    skill_name="cfn-test",
    priority="P0"
)
```

---

#### assign_priority()

```python
@staticmethod
assign_priority(execution: Dict, frequency: int) -> str
```

**Assign priority based on execution frequency**

**Priority Rules:**
- **P0**: Frequency ≥10 (critical - frequent patterns, breaking changes are costly)
- **P1**: 3 ≤ Frequency < 10 (high priority - common cases)
- **P2**: Frequency < 3 (medium priority - rare cases, performance tests)

**Parameters:**
- `execution` (Dict): Execution record (currently unused, for future enhancements)
- `frequency` (int): Number of times this pattern occurred

**Returns:**
- `str`: Priority ('P0', 'P1', or 'P2')

**Example:**
```python
# Frequent pattern
priority1 = TestCaseBuilder.assign_priority({}, frequency=15)
assert priority1 == "P0"

# Common case
priority2 = TestCaseBuilder.assign_priority({}, frequency=5)
assert priority2 == "P1"

# Rare case
priority3 = TestCaseBuilder.assign_priority({}, frequency=1)
assert priority3 == "P2"
```

---

#### build_test_suite()

```python
@staticmethod
build_test_suite(
    skill_name: str,
    executions: List[Dict],
    frequency_map: Dict[str, int] = None
) -> List[Dict]
```

**Build complete test suite from executions**

**Parameters:**
- `skill_name` (str): Skill name
- `executions` (List[Dict]): Sampled execution records
- `frequency_map` (Dict[str, int], optional): Parameter hash → frequency mapping

**Returns:**
- `List[Dict]`: Test cases

**Example:**
```python
test_suite = TestCaseBuilder.build_test_suite(
    skill_name="cfn-coordination",
    executions=sampled_executions,
    frequency_map={
        "hash1": 15,  # P0
        "hash2": 5,   # P1
        "hash3": 1    # P2
    }
)

print(f"Generated {len(test_suite)} test cases")
```

---

### TestStorage

**PostgreSQL storage for regression test suites**

#### store_test_suite()

```python
store_test_suite(
    skill_name: str,
    test_cases: List[Dict],
    priority: str = "P1"
) -> str
```

**Store regression test suite in PostgreSQL**

**Parameters:**
- `skill_name` (str): Skill name
- `test_cases` (List[Dict]): Test case list
- `priority` (str, optional): Overall suite priority (default: "P1")

**Returns:**
- `str`: Suite ID (UUID)

**Raises:**
- `Exception`: If test_cases is empty (violates `total_tests > 0` constraint)

**Example:**
```python
storage = TestStorage(db_config)

suite_id = storage.store_test_suite(
    skill_name="cfn-coordination",
    test_cases=test_cases,
    priority="P0"
)

print(f"Stored suite: {suite_id}")
storage.close()
```

---

#### get_test_suite()

```python
get_test_suite(skill_name: str) -> Dict
```

**Retrieve latest test suite for skill**

**Parameters:**
- `skill_name` (str): Skill name

**Returns:**
- `Dict`: Test suite or `None` if not found
  ```python
  {
      "id": "UUID",
      "skill_name": "str",
      "total_tests": int,
      "test_cases": List[Dict],  # JSONB
      "priority": "str",
      "generated_at": "ISO8601 string"
  }
  ```

**Example:**
```python
storage = TestStorage(db_config)

suite = storage.get_test_suite("cfn-coordination")
if suite:
    print(f"Latest suite has {suite['total_tests']} tests")
    print(f"Generated at: {suite['generated_at']}")
else:
    print("No test suite found")

storage.close()
```

---

## Database Schema

### execution_traces (Source)

```sql
CREATE TABLE execution_traces (
    trace_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    skill_name VARCHAR(255) NOT NULL,
    completed_at TIMESTAMP,
    total_duration_ms INTEGER,
    status VARCHAR(50) CHECK (status IN ('running', 'success', 'failed', 'timeout')),
    steps JSONB DEFAULT '[]',
    error_message TEXT,
    metadata JSONB DEFAULT '{}'
);
```

**Metadata Structure:**
```json
{
  "team": "team-a",
  "input_parameters": {
    "mode": "standard",
    "count": 10
  }
}
```

---

### regression_test_suites (Target)

```sql
CREATE TABLE regression_test_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name VARCHAR(255) NOT NULL,
    total_tests INTEGER NOT NULL CHECK (total_tests > 0),
    test_cases JSONB NOT NULL DEFAULT '[]',
    priority VARCHAR(10) CHECK (priority IN ('P0', 'P1', 'P2')),
    generated_at TIMESTAMP DEFAULT NOW(),
    last_run_at TIMESTAMP,
    last_run_pass_rate DECIMAL(5,2),
    metadata JSONB DEFAULT '{}'
);
```

**test_cases JSONB Structure:**
```json
[
  {
    "test_id": "cfn-coordination-reg-001",
    "skill_name": "cfn-coordination",
    "input_parameters": {"mode": "standard"},
    "expected_stdout": "success",
    "expected_duration_seconds": 1.5,
    "priority": "P0",
    "created_at": "2025-11-16T07:00:00Z",
    "metadata": {
      "source_execution_id": "trace-001",
      "team": "team-a"
    }
  }
]
```

---

## Error Handling

### Common Errors

**1. No Executions Found**
```python
summary = generator.generate_test_suite("nonexistent-skill")
# Returns: {"skill_name": "...", "total_tests": 0, "error": "No successful executions found"}
```

**2. Database Connection Failure**
```python
try:
    generator = RegressionTestGenerator(invalid_config)
except Exception as e:
    print(f"Connection error: {e}")
```

**3. Empty Test Suite**
```python
try:
    storage.store_test_suite("skill", [], "P1")
except Exception as e:
    print(f"Error: {e}")  # "CHECK constraint failed: total_tests > 0"
```

---

## Best Practices

### 1. Resource Management

Always use try/finally for proper cleanup:

```python
generator = RegressionTestGenerator(db_config)
try:
    summary = generator.generate_test_suite("skill-name")
finally:
    generator.close()
```

### 2. Reproducible Sampling

Set seed for consistent test suite generation:

```python
ExecutionSampler.set_seed(42)
sample = ExecutionSampler.stratified_sample(executions, 50)
```

### 3. Frequency Map

Build frequency map for accurate priority assignment:

```python
frequency_map = {}
for execution in all_executions:
    param_hash = ExecutionDeduplicator.hash_parameters(execution['input_parameters'])
    frequency_map[param_hash] = frequency_map.get(param_hash, 0) + 1

test_suite = TestCaseBuilder.build_test_suite(skill_name, sampled_executions, frequency_map)
```

### 4. Configuration Management

Use environment variables for database credentials:

```python
import os

db_config = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', '5432')),
    'database': os.getenv('DB_NAME', 'workflow_codification'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', '')
}
```

---

## Performance Considerations

### Lookback Period

Shorter lookback = faster queries, fewer test cases:

```python
# Fast: Last 7 days only
summary = generator.generate_test_suite("skill", lookback_days=7)

# Comprehensive: Last 90 days (default)
summary = generator.generate_test_suite("skill", lookback_days=90)
```

### Sample Size

Larger sample size = more comprehensive but slower generation:

```python
# Quick: 25 test cases
summary = generator.generate_test_suite("skill", sample_size=25)

# Thorough: 100 test cases
summary = generator.generate_test_suite("skill", sample_size=100)
```

**Benchmark:** 50-test suite generated in <0.2s (with database latency)

---

## Testing

### Unit Tests

```bash
# Run all tests
pytest tests/workflow_codification/regression/ -v

# Run specific module
pytest tests/workflow_codification/regression/test_deduplicator.py -v

# With coverage
pytest tests/workflow_codification/regression/ --cov=src.workflow_codification.regression --cov-report=term-missing
```

### Integration Test

```bash
# End-to-end test
pytest tests/workflow_codification/regression/test_test_generator.py::test_end_to_end_generation -v
```

---

## License

This module is part of the Workflow Codification feature set.

---

## Changelog

**v1.0.0 (2025-11-16)**
- Initial release
- Execution history retrieval
- SHA256-based deduplication
- Stratified sampling
- Test case generation with priorities
- PostgreSQL storage
- CLI interface
- 61 comprehensive tests
- 85% code coverage
