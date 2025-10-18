# Test Infrastructure Guide

## Overview

Claude Flow Novice test infrastructure has been refactored to support fast, selective test execution with proper categorization and coverage reporting.

## Test Statistics

- **Total Test Files**: 379
- **Distribution**:
  - Unit Tests: 106 files
  - Integration Tests: 99 files
  - Uncategorized: 140 files
  - Performance: 18 files
  - E2E: 8 files
  - Chaos: 8 files
  - Benchmarks: 6 files
  - Production: 8 files
  - Archived: 3 files

## Quick Start

```bash
# Run quick tests (unit tests only - fastest)
npm run test:quick

# Run all tests
npm test

# Run specific category
npm run test:unit
npm run test:integration
npm run test:e2e

# Run with coverage (slower)
npm run test:ci

# Watch mode for development
npm run test:watch
```

## Test Runner Architecture

The intelligent test runner (`scripts/test-runner.cjs`) provides:

### 1. **Test Categorization**

Tests are automatically categorized by directory:
- `tests/unit/**` → Unit tests (priority 1)
- `tests/integration/**` → Integration tests (priority 2)
- `tests/e2e/**` → E2E tests (priority 3)
- `tests/*.test.{ts,js}` → Uncategorized (priority 4)

### 2. **Automatic Exclusions**

These categories are excluded from standard runs:
- `tests/chaos/**` - Chaos engineering tests (20m timeout)
- `tests/benchmarks/**` - Performance benchmarks
- `tests/archived/**` - Archived/deprecated tests
- `tests/performance/**` - Performance validation

### 3. **Execution Modes**

**Quick Mode** (`--quick`):
- Runs unit tests only
- Fastest feedback (< 10s)
- Ideal for TDD/active development

**Category Mode** (`--category=<name>`):
- Run specific test category
- Examples: `--category=unit`, `--category=integration`

**Full Mode** (default):
- Runs all categories in priority order
- Unit → Integration → E2E → Uncategorized

**Coverage Mode** (`--coverage`):
- Generates coverage reports
- Slower but comprehensive
- Required for CI/CD validation

## Configuration Files

### Jest Configuration (`config/jest/jest.config.js`)

```javascript
module.exports = {
  rootDir: '../../',
  testEnvironment: 'node',
  coverage: {
    lines: 80,
    functions: 80,
    branches: 70,
    statements: 80
  },
  testTimeout: 30000,
  maxWorkers: 2
};
```

### Vitest Configuration (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80
    }
  }
});
```

## Test Execution Results

### Current Status (Task 5 Completion)

**Unit Tests**:
- Test Suites: 7 total (1 passed, 6 failed due to missing deps/logic issues)
- Tests: 34 total (32 passed, 2 failed)
- Runtime: ~6s

**Key Improvements**:
1. ✅ Tests actually execute (previously 0% coverage)
2. ✅ Fast feedback loop with selective execution
3. ✅ Proper test categorization
4. ✅ Coverage configuration enabled
5. ✅ Multiple test runners (Jest + Vitest) working

**Known Issues**:
1. Some tests missing dependencies (`test.utils`)
2. Some test assertions need adjustment
3. Coverage collection times out on full suite (379 files)

## Performance Optimization

### Parallel Execution

```bash
# Default: maxWorkers=2 for stability
npm test

# Faster but less stable (use for powerful machines)
NODE_OPTIONS='--max-old-space-size=8192' jest --maxWorkers=4
```

### Memory Management

Tests use `--max-old-space-size=8192` (8GB) to handle:
- Large TypeScript compilation
- Jest caching
- Coverage data collection

### Test Isolation

- Uses `pool: 'forks'` for better isolation
- Single fork mode for Redis connection stability
- Proper cleanup in `afterEach`/`afterAll` hooks

## Coverage Configuration

### Current Thresholds

```json
{
  "lines": 80,
  "functions": 80,
  "branches": 70,
  "statements": 80
}
```

### Coverage Reports

Generated in `./coverage/`:
- `coverage/lcov-report/index.html` - Visual HTML report
- `coverage/coverage-summary.json` - JSON summary
- `coverage/lcov.info` - LCOV format for CI tools

### Viewing Coverage

```bash
# Generate coverage
npm run test:ci

# Open HTML report
open coverage/lcov-report/index.html

# View JSON summary
cat coverage/coverage-summary.json | jq .
```

## Troubleshooting

### Tests Timeout

**Problem**: Full test suite times out (> 2min)

**Solutions**:
1. Use selective execution: `npm run test:quick`
2. Run specific category: `npm run test:unit`
3. Increase timeout: `--testTimeout=60000`
4. Reduce workers: `--maxWorkers=1`

### Missing Modules

**Problem**: `Cannot find module '../../../test.utils'`

**Solutions**:
1. Create missing test utilities
2. Update import paths to use aliases (`@/...`)
3. Check `moduleNameMapper` in jest.config.js

### Memory Issues

**Problem**: `JavaScript heap out of memory`

**Solutions**:
1. Increase heap: `--max-old-space-size=16384`
2. Reduce maxWorkers: `--maxWorkers=1`
3. Run tests in categories separately

### Redis Connection Issues

**Problem**: Tests fail with Redis connection errors

**Solutions**:
```bash
# Start Redis
npm run redis:start

# Check Redis status
npm run redis:status

# Test Redis connection
npm run redis:test
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Start Redis
        run: |
          sudo apt-get install redis-server
          redis-server --daemonize yes

      - name: Run tests
        run: npm run test:ci

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Pre-commit Hook Example

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running quick tests before commit..."
npm run test:quick

if [ $? -ne 0 ]; then
  echo "❌ Tests failed. Commit aborted."
  exit 1
fi

echo "✅ Tests passed!"
```

## Best Practices

### 1. Write Tests First (TDD)

```bash
# Watch mode for TDD
npm run test:watch

# Quick feedback loop
npm run test:quick
```

### 2. Categorize Tests Properly

Place tests in correct directories:
- `tests/unit/` - Isolated unit tests
- `tests/integration/` - Component integration
- `tests/e2e/` - Full workflow tests

### 3. Use Selective Execution

Don't run full suite for every change:
```bash
# During development
npm run test:quick

# Before commit
npm run test:unit

# Before PR
npm run test:ci
```

### 4. Monitor Performance

Track test execution time:
```bash
# Add --verbose for timing details
npm test -- --verbose

# Profile slow tests
jest --detectOpenHandles --forceExit
```

## Next Steps

### Immediate Priorities

1. **Fix Missing Dependencies**
   - Create `tests/test.utils.ts` with common utilities
   - Update import paths in failing tests

2. **Improve Coverage Collection**
   - Optimize coverage collection performance
   - Add incremental coverage for changed files only

3. **Test Migration**
   - Move uncategorized tests to proper categories
   - Archive obsolete tests

### Long-term Goals

1. **Parallel Execution**
   - Enable safe parallel execution for unit tests
   - Isolate Redis connections per test worker

2. **Test Data Management**
   - Implement test fixtures
   - Create test data factories

3. **Visual Test Reports**
   - Integrate Jest HTML reporter
   - Add trend analysis for test metrics

## Related Documentation

- [CFN Loop Testing Guide](./CFN_LOOP_TESTING.md)
- [Agent Testing Patterns](./AGENT_TESTING.md)
- [Coverage Requirements](./COVERAGE_REQUIREMENTS.md)

## Support

For issues or questions:
1. Check test output logs
2. Review this documentation
3. Run diagnostics: `npm run test:quick -- --verbose`
4. Open GitHub issue with test output
