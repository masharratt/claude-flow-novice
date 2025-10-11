# Parallelization Validation Suite

Comprehensive test runner that orchestrates all parallelization tests and validates against production readiness checklist from `ASSUMPTIONS_AND_TESTING.md` (lines 685-705).

## Quick Start

```bash
# Run full validation suite
./tests/parallelization/run-validation-suite.sh

# Run in CI mode (minimal output)
./tests/parallelization/run-validation-suite.sh --ci

# Get JSON report
./tests/parallelization/run-validation-suite.sh --json > validation-report.json

# Run TypeScript directly
tsx tests/parallelization/run-validation-suite.ts
```

## Exit Codes

- `0` - All tests passed, production ready
- `1` - Critical test failures, not production ready
- `2` - Test execution error

## Validation Checklist

### Before Production (6 tests)

- ✅ Redis pub/sub benchmark: >10K msg/sec sustained
- ✅ Test lock serialization: 0 port conflicts in 100 runs
- ✅ Orphan detection: <10MB memory growth over 10 epics
- ✅ Productive waiting: >50% efficiency measured
- ✅ API key rotation: 0 failures with 3 keys @ 3x rate limit
- ✅ Deadlock prevention: <35s timeout for circular deps

### Chaos Tests (4 tests)

- ✅ 30% random agent crashes → 100% cleanup within 3min
- ✅ Redis connection failures → Recovery within 30s
- ✅ Concurrent file edits → 100% conflict detection
- ✅ Test lock crashes → Stale lock release within 15min

### Performance Benchmarks (3 tests)

- ✅ 3 independent sprints: <40min (baseline: 75min)
- ✅ 5 mixed sprints: <60min (baseline: 125min)
- ✅ 10 sprints: <100min (baseline: 250min)

## Report Format

The validation suite generates both console output and a JSON report:

```json
{
  "summary": {
    "total": 12,
    "passed": 10,
    "failed": 2,
    "timestamp": "2025-10-10T20:57:20Z",
    "production_ready": true
  },
  "before_production": {
    "redis_pubsub": {
      "name": "redis-pubsub",
      "category": "before_production",
      "passed": true,
      "metric": "263,157 msg/sec",
      "threshold": ">10K msg/sec sustained",
      "duration": 15234
    },
    ...
  },
  "chaos_tests": { ... },
  "performance_benchmarks": { ... },
  "critical_failures": [],
  "warnings": [],
  "production_ready": true
}
```

## Test Suite Structure

The validation suite runs tests in the following order:

1. **Before Production Tests** - Core functionality validation
2. **Chaos Tests** - Resilience and recovery validation
3. **Performance Benchmarks** - Speed and efficiency validation

Each test category validates against specific thresholds defined in the production checklist.

## Integration with CI/CD

### GitHub Actions

```yaml
name: Parallelization Validation

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run redis:start
      - name: Run validation suite
        run: ./tests/parallelization/run-validation-suite.sh --ci
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: validation-report
          path: tests/parallelization/validation-report.json
```

### Pre-Production Checklist

Before deploying to production:

1. Run validation suite: `./run-validation-suite.sh`
2. Review validation report: `validation-report.json`
3. Ensure `production_ready: true`
4. Fix any critical failures
5. Monitor Grafana dashboard post-deployment

## Troubleshooting

### Test File Not Found

If optional tests (API key rotation, chaos tests, performance benchmarks) are not yet implemented, they will be skipped automatically:

```
⏭️  api_key_rotation (optional - skipped)
```

### Redis Connection Issues

Ensure Redis is running:

```bash
npm run redis:start
redis-cli ping  # Should return PONG
```

### TypeScript Compilation Errors

The validation suite runs with `tsx`, which handles TypeScript on-the-fly. If you see errors, ensure dependencies are installed:

```bash
npm install
npm install -g tsx
```

## Metric Extraction

The validation suite automatically extracts metrics from test output using regex patterns:

- **Throughput**: `263,157 msg/sec`
- **Conflicts**: `0 conflicts`
- **Memory Growth**: `5.2 MB growth`
- **Efficiency**: `87.5% efficiency`
- **Timeouts**: `18s timeout`

Tests should output metrics in these formats for automatic validation.

## Development

To add a new test to the validation suite:

1. Create test file in `tests/parallelization/`
2. Add test configuration to `TEST_SUITES` in `run-validation-suite.ts`
3. Define threshold and metric extractor
4. Mark as optional if not yet implemented

Example:

```typescript
{
  name: 'new_test',
  file: 'new-test.test.ts',
  threshold: '>100 items/sec',
  metricExtractor: (output: string) => extractCustomMetric(output),
  optional: false
}
```

## Support

For issues or questions:

- Review test output in console
- Check `validation-report.json` for detailed results
- Review `ASSUMPTIONS_AND_TESTING.md` for checklist details
- Check Grafana dashboard for runtime metrics
