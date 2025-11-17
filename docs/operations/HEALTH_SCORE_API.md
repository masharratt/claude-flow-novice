# Health Score Calculator API Guide

## Overview

The Health Score Calculator provides comprehensive skill quality metrics through five weighted components:

- **Reliability** (35%): Success rate from last 100 executions
- **Performance** (20%): Execution time vs baseline
- **Edge Cases** (20%): Edge case handling effectiveness
- **Documentation** (10%): Documentation completeness
- **Test Coverage** (15%): Test coverage percentage

**Health Levels:**
- Excellent: 90-100
- Good: 75-89
- Fair: 60-74
- Poor: <60

## Quick Start

```python
from src.workflow_codification.health import HealthScoreCalculator

# Initialize calculator
db_config = {
    'host': 'localhost',
    'port': 5432,
    'database': 'cfn_prod',
    'user': 'cfn_user',
    'password': 'secret'
}

calc = HealthScoreCalculator(db_config)

# Calculate health score for a skill
health = calc.calculate_skill_health("cfn-coordination")

print(f"Overall Score: {health.overall_score}")
print(f"Health Level: {health.health_level}")
print(f"Reliability: {health.reliability_score}")
print(f"Performance: {health.performance_score}")
```

## API Reference

### HealthScoreCalculator

#### `calculate_skill_health(skill_name: str, use_cache: bool = True) -> HealthScore`

Calculate complete health score for a skill.

**Parameters:**
- `skill_name` (str): Name of skill to analyze
- `use_cache` (bool): Whether to use cached value (default: True, 5-minute TTL)

**Returns:**
- `HealthScore`: Complete health score with all components

**Example:**
```python
# Use cache (fast)
health = calc.calculate_skill_health("cfn-coordination")

# Bypass cache (fresh calculation)
health = calc.calculate_skill_health("cfn-coordination", use_cache=False)
```

#### `get_health_trend(skill_name: str, days: int = 7) -> list[dict]`

Get historical health score trend.

**Parameters:**
- `skill_name` (str): Name of skill
- `days` (int): Number of days to look back (default: 7)

**Returns:**
- `list[dict]`: List of health records ordered by time

**Example:**
```python
trend = calc.get_health_trend("cfn-coordination", days=30)

for record in trend:
    print(f"{record['calculated_at']}: {record['overall_score']}")
```

#### `invalidate_cache(skill_name: str)`

Force recalculation on next request by invalidating cache.

**Example:**
```python
# After skill deployment
calc.invalidate_cache("cfn-coordination")
health = calc.calculate_skill_health("cfn-coordination")  # Fresh calculation
```

### HealthScore Model

**Attributes:**
- `skill_name` (str): Skill identifier
- `overall_score` (int): Composite health score (0-100)
- `reliability_score` (float): Success rate component
- `performance_score` (float): Execution time component
- `edge_case_score` (float): Edge case handling component
- `documentation_score` (float): Documentation completeness
- `test_coverage_score` (float): Test coverage percentage
- `health_level` (str): Classification (excellent/good/fair/poor)
- `calculated_at` (datetime): Calculation timestamp

**Methods:**
- `to_dict()`: Serialize to JSON-compatible dictionary
- `from_dict(data)`: Deserialize from dictionary

**Example:**
```python
# Serialize for API response
health_data = health.to_dict()
# {
#   "skill_name": "cfn-coordination",
#   "overall_score": 87,
#   "health_level": "good",
#   ...
# }

# Deserialize from cache
health = HealthScore.from_dict(cached_data)
```

### ComponentScoreCalculator

Low-level component calculators (advanced usage).

#### `calculate_reliability_score(skill_name: str) -> float`

Success rate from last 100 executions.

**Formula:** `(successful_executions / total_executions) * 100`

#### `calculate_performance_score(skill_name: str) -> float`

Execution time vs baseline.

**Formula:** `min(100, (baseline / recent_avg) * 100)`
- Baseline: Median of first 20 executions
- Recent: Average of last 10 executions

#### `calculate_edge_case_score(skill_name: str) -> float`

Inverse of edge case rate over 90 days.

**Formula:** `max(0, 100 - (edge_cases / executions * 100))`

#### `calculate_documentation_score(skill_name: str) -> float`

Checks for SKILL.md, README.md, examples/, metadata.json.

**Formula:** `(files_present / 4) * 100`

#### `calculate_test_coverage_score(skill_name: str) -> float`

Reads from metadata.json test_coverage field.

**Example:**
```python
from src.workflow_codification.health import ComponentScoreCalculator

calc = ComponentScoreCalculator(db_config)

# Individual component scores
reliability = calc.calculate_reliability_score("cfn-coordination")
performance = calc.calculate_performance_score("cfn-coordination")
```

### HealthMonitor

Background monitoring service for continuous health tracking.

#### `__init__(db_config: dict, check_interval: int = 300)`

Initialize monitor.

**Parameters:**
- `db_config` (dict): PostgreSQL connection config
- `check_interval` (int): Check interval in seconds (default: 300 = 5 minutes)

#### `start()`

Start background monitoring loop (blocking).

**Runs:**
- Periodic health checks for all active skills
- Alert on >10 point drop in 24 hours
- Continuous until `stop()` called

#### `stop()`

Stop background monitoring.

#### `check_skill_now(skill_name: str) -> dict`

On-demand health check for specific skill.

**Returns:**
```python
{
    "skill_name": "cfn-coordination",
    "overall_score": 87,
    "health_level": "good",
    "components": {
        "reliability": 90.0,
        "performance": 85.0,
        ...
    },
    "calculated_at": "2025-01-15T10:30:00"
}
```

#### `get_system_health_summary() -> dict`

System-wide health summary.

**Returns:**
```python
{
    "total_skills": 43,
    "average_score": 82.5,
    "health_distribution": {
        "excellent": 12,
        "good": 25,
        "fair": 5,
        "poor": 1
    },
    "skills": [
        {"skill_name": "skill-1", "overall_score": 95, "health_level": "excellent"},
        ...
    ]
}
```

**Example:**
```python
from src.workflow_codification.health import HealthMonitor
import threading

# Background monitoring
monitor = HealthMonitor(db_config, check_interval=300)

# Run in separate thread
monitor_thread = threading.Thread(target=monitor.start, daemon=True)
monitor_thread.start()

# On-demand check
health = monitor.check_skill_now("cfn-coordination")

# System summary
summary = monitor.get_system_health_summary()
print(f"System average: {summary['average_score']}")
```

## Integration Patterns

### Post-Execution Hook

Trigger health calculation after skill execution:

```python
# In skill execution hook
from src.workflow_codification.health import HealthScoreCalculator

def post_skill_execution(skill_name: str):
    calc = HealthScoreCalculator(db_config)

    # Invalidate cache and recalculate
    calc.invalidate_cache(skill_name)
    health = calc.calculate_skill_health(skill_name, use_cache=False)

    # Alert if poor health
    if health.health_level == "poor":
        send_alert(f"{skill_name} health is poor: {health.overall_score}")
```

### Dashboard API Endpoint

Serve health data via REST API:

```python
from flask import Flask, jsonify
from src.workflow_codification.health import HealthScoreCalculator

app = Flask(__name__)
calc = HealthScoreCalculator(db_config)

@app.route('/api/health/<skill_name>')
def get_skill_health(skill_name):
    health = calc.calculate_skill_health(skill_name)
    return jsonify(health.to_dict())

@app.route('/api/health/<skill_name>/trend')
def get_skill_trend(skill_name):
    trend = calc.get_health_trend(skill_name, days=30)
    return jsonify(trend)
```

### Continuous Monitoring Service

Run as background service:

```python
from src.workflow_codification.health import HealthMonitor
import signal
import sys

monitor = HealthMonitor(db_config, check_interval=300)

def signal_handler(sig, frame):
    print("Stopping monitor...")
    monitor.stop()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

print("Starting health monitor...")
monitor.start()  # Blocking
```

### Context Manager Pattern

Automatic cleanup:

```python
# Single calculation
with HealthScoreCalculator(db_config) as calc:
    health = calc.calculate_skill_health("cfn-coordination")

# Background monitoring
with HealthMonitor(db_config) as monitor:
    summary = monitor.get_system_health_summary()
```

## Caching

- **Cache Key:** `health_score:{skill_name}`
- **TTL:** 5 minutes (300 seconds)
- **Storage:** Redis
- **Invalidation:** Automatic on expiry, manual via `invalidate_cache()`

**Cache Hit Rate Monitoring:**
```python
from src.workflow_codification.redis import HealthScoreCache

cache = HealthScoreCache()

# Check if cached
cached = cache.get("cfn-coordination")
if cached:
    print("Cache hit!")
else:
    print("Cache miss - will recalculate")

# Check TTL
remaining_ttl = cache.get_ttl("cfn-coordination")
print(f"Cache expires in {remaining_ttl}s")
```

## Database Schema

Health scores are stored in PostgreSQL:

```sql
CREATE TABLE skill_health_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name VARCHAR(255) NOT NULL,
    overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
    reliability_score DECIMAL(5,2) CHECK (reliability_score BETWEEN 0 AND 100),
    performance_score DECIMAL(5,2) CHECK (performance_score BETWEEN 0 AND 100),
    edge_case_score DECIMAL(5,2) CHECK (edge_case_score BETWEEN 0 AND 100),
    documentation_score DECIMAL(5,2) CHECK (documentation_score BETWEEN 0 AND 100),
    test_coverage_score DECIMAL(5,2) CHECK (test_coverage_score BETWEEN 0 AND 100),
    health_level VARCHAR(20) CHECK (health_level IN ('excellent', 'good', 'fair', 'poor')),
    calculated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);
```

## Performance

- **Calculation Time:** <500ms (P95) with cache miss
- **Cache Hit Time:** <10ms
- **Background Check:** 300s interval (configurable)
- **Database Impact:** Read-heavy, 1 write per calculation

## Error Handling

```python
try:
    health = calc.calculate_skill_health("cfn-coordination")
except psycopg2.Error as e:
    print(f"Database error: {e}")
    # Handle gracefully
except Exception as e:
    print(f"Calculation error: {e}")
    # Log and alert
```

## Testing

Run test suite:

```bash
# All tests
python3 -m pytest tests/workflow-codification/health/ -v

# With coverage
python3 -m pytest tests/workflow-codification/health/ \
  --cov=src.workflow_codification.health \
  --cov-report=term-missing

# Specific test
python3 -m pytest tests/workflow-codification/health/test_health_score_calculator.py::test_calculate_reliability_score_perfect -v
```

## Troubleshooting

**Issue: Cache not working**
```python
# Check Redis connection
from src.workflow_codification.redis import HealthScoreCache
cache = HealthScoreCache()
cache.redis.ping()  # Should return True
```

**Issue: Low performance scores**
```python
# Investigate baseline vs recent execution times
calc = ComponentScoreCalculator(db_config)
performance_score = calc.calculate_performance_score("cfn-coordination")

# Check recent executions manually
# SELECT execution_duration_seconds FROM skill_executions
# WHERE skill_id = 'cfn-coordination'
# ORDER BY execution_started_at DESC LIMIT 10;
```

**Issue: Health drops not alerting**
```python
# Check monitoring is running
monitor = HealthMonitor(db_config)
active_skills = monitor._get_active_skills()
print(f"Monitoring {len(active_skills)} skills")

# Check historical data exists
trend = calc.get_health_trend("cfn-coordination", days=1)
print(f"Found {len(trend)} historical records")
```

## References

- **Implementation:** `src/workflow_codification/health/`
- **Tests:** `tests/workflow-codification/health/`
- **Specification:** `planning/workflow-codification/priority-features/SPECIFICATION.md` (FR-1.x)
- **Database Schema:** `src/workflow_codification/migrations/001_skill_health_history.sql`
- **Cache Implementation:** `src/workflow_codification/redis/health_score_cache.py`
