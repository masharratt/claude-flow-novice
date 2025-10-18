# Example Test Output Format

This document shows the expected output format for parallelization tests to enable automatic metric extraction by the validation suite.

## Required Output Patterns

Tests should output metrics in these formats for automatic validation:

### Throughput Metrics

```
Redis pub/sub benchmark: 263,157 msg/sec sustained
✅ Throughput: 150,000 msg/sec
```

**Regex**: `/(\d+(?:,\d+)*)\s*msg\/sec/i`

### Conflict Detection

```
Test lock serialization: 0 conflicts in 100 runs
✅ Port conflicts: 0
```

**Regex**: `/(\d+)\s*conflicts?/i`

### Memory Growth

```
Orphan detection: 5.2 MB growth over 10 epics
✅ Memory growth: 8.7 MB
```

**Regex**: `/(\d+(?:\.\d+)?)\s*MB\s*growth/i`

### Efficiency Metrics

```
Productive waiting: 87.5% efficiency measured
✅ Efficiency: 92.3%
```

**Regex**: `/(\d+(?:\.\d+)?)%\s*efficiency/i`

### Timeout Metrics

```
Deadlock prevention: 18s timeout for circular deps
✅ Timeout: 25.3s
```

**Regex**: `/(\d+(?:\.\d+)?)\s*s\s*timeout/i`

### Failure Counts

```
API key rotation: 0 failures with 3 keys @ 3x rate limit
✅ Failures: 0
```

**Regex**: `/(\d+)\s*failures?/i`

## Example Test Output

### Successful Test

```typescript
import { describe, it, expect } from 'vitest';

describe('Redis Pub/Sub Benchmark', () => {
  it('should sustain >10K msg/sec throughput', async () => {
    const result = await runBenchmark();

    console.log(`Redis pub/sub benchmark: ${result.throughput.toLocaleString()} msg/sec sustained`);

    expect(result.throughput).toBeGreaterThan(10000);
  });
});
```

**Output**:
```
Redis pub/sub benchmark: 263,157 msg/sec sustained
✅ Test passed (15234ms)
```

### Failed Test

```typescript
describe('Test Lock Serialization', () => {
  it('should have 0 port conflicts in 100 runs', async () => {
    const result = await runSerializationTest(100);

    console.log(`Test lock serialization: ${result.conflicts} conflicts in 100 runs`);

    expect(result.conflicts).toBe(0);
  });
});
```

**Output**:
```
Test lock serialization: 3 conflicts in 100 runs
❌ Test failed (8521ms)
Expected: 0, Received: 3
```

## Chaos Test Output Format

Chaos tests should output recovery metrics:

```typescript
describe('Random Agent Crashes', () => {
  it('should cleanup within 3min after 30% crashes', async () => {
    const result = await runChaosCrashTest();

    console.log(`Chaos test: 100% cleanup within ${result.cleanupTime} min`);

    expect(result.cleanupTime).toBeLessThan(3);
  });
});
```

**Output**:
```
Chaos test: 100% cleanup within 2.1 min
✅ Test passed (125000ms)
```

## Performance Benchmark Output Format

Performance benchmarks should output timing in minutes:

```typescript
describe('Sprint Performance', () => {
  it('should complete 3 independent sprints in <40min', async () => {
    const result = await runSprintBenchmark(3);

    console.log(`3_independent sprints completed in ${result.duration} min`);

    expect(result.duration).toBeLessThan(40);
  });
});
```

**Output**:
```
3_independent sprints completed in 37.5 min
✅ Test passed (2250000ms)
```

## Validation Suite Integration

The validation suite will:

1. Run each test file
2. Capture stdout/stderr
3. Extract metrics using regex patterns
4. Compare against thresholds
5. Generate comprehensive report

Example validation report entry:

```json
{
  "redis_pubsub": {
    "name": "redis-pubsub",
    "category": "before_production",
    "passed": true,
    "metric": "263,157 msg/sec",
    "threshold": ">10K msg/sec sustained",
    "actual": "263,157 msg/sec",
    "duration": 15234
  }
}
```

## Best Practices

1. **Always output metrics** in the expected format for automatic extraction
2. **Use console.log** for metric output (captured by validation suite)
3. **Include test name** in metric output for clarity
4. **Format numbers** consistently (use commas for thousands)
5. **Include units** in output (msg/sec, MB, %, min, s)
6. **Test both pass and fail** scenarios during development

## Testing Your Output Format

Before running the full validation suite, test your metric extraction:

```typescript
const output = "Redis pub/sub benchmark: 263,157 msg/sec sustained";
const match = output.match(/(\d+(?:,\d+)*)\s*msg\/sec/i);
console.log(match[1]); // "263,157"
```

Ensure your test output matches the expected regex patterns!
