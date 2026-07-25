# CFN Test Framework CLI

The unified command-line interface for the CFN Test Framework, providing simple access to test execution, benchmarking, and webapp testing capabilities.

## Quick Start

```bash
# Access the CLI
./.claude/commands/cfn-test-framework

# Or directly
./.claude/skills/cfn-test-framework/execute.sh
```

## Commands

### Test Execution

```bash
# Run all tests
cfn-test-framework test

# Run specific component tests
cfn-test-framework test execution    # Test execution patterns
cfn-test-framework test runner       # Test runner suite
cfn-test-framework test webapp       # Webapp visual tests
```

### Benchmarking

```bash
# Run all benchmarks
cfn-test-framework benchmark

# Run specific component benchmarks
cfn-test-framework benchmark execution
cfn-test-framework benchmark runner

# Output format options
cfn-test-framework benchmark --output json
cfn-test-framework benchmark --output html
```

### Reporting

```bash
# Generate test report (default: text)
cfn-test-framework report

# Generate HTML report
cfn-test-framework report --output html

# Generate JSON report
cfn-test-framework report --output json
```

### Webapp Testing

```bash
# Run full webapp testing suite
cfn-test-framework webapp
```

### Framework Management

```bash
# Check framework health and dependencies
cfn-test-framework health

# Initialize framework components
cfn-test-framework init

# Show version
cfn-test-framework --version

# Show help
cfn-test-framework --help
```

## Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help message |
| `-v, --version` | Show version information |
| `-d, --debug` | Enable debug output |
| `--parallel` | Run tests in parallel (where supported) |
| `--output FORMAT` | Output format: text, json, html |
| `--threshold NUM` | Regression threshold percentage (default: 0.10) |

## Examples

### Basic Test Run
```bash
cfn-test-framework test
```

### Debug Mode Testing
```bash
cfn-test-framework test --debug
```

### Parallel Benchmarking
```bash
cfn-test-framework benchmark --parallel --output json
```

### Custom Regression Threshold
```bash
cfn-test-framework test --threshold 0.05
```

### Generate HTML Report
```bash
cfn-test-framework report --output html > test-report.html
```

## Integration with CFN Loop

The CLI integrates seamlessly with CFN Loop workflows:

```bash
# In Loop 3 (Implementation)
cfn-test-framework test

# In Loop 2 (Validation)
cfn-test-framework benchmark --threshold 0.05

# Product Owner Decision
cfn-test-framework report --output json
```

## Component Details

### Execution Component
- Test coordinator pattern execution
- Concurrent conflict prevention
- Test result caching

### Runner Component
- Complete test suite execution
- Benchmark tracking in SQLite
- Regression detection and alerting

### Webapp Component
- Playwright-based visual testing
- Screenshot capture and comparison
- Baseline management

## Dependencies

Required:
- `npm` - Node.js package manager
- `sqlite3` - SQLite database CLI
- `jq` - JSON processor

Optional (but recommended):
- `redis-cli` - Redis client for coordination
- `playwright` - For webapp testing (`npm install playwright`)

## File Locations

- CLI Entry Point: `.claude/commands/cfn-test-framework`
- Execute Script: `.claude/skills/cfn-test-framework/execute.sh`
- Component Scripts: `.claude/skills/cfn-test-framework/lib/*/`
- Benchmark Database: `.artifacts/test-benchmarks.db`
- Test Results: `.artifacts/test-results/`
- Webapp Screenshots: `.screenshots/`

## Troubleshooting

### Dependencies Missing
```bash
cfn-test-framework health
# Shows which dependencies are missing
```

### Redis Connection Issues
```bash
# Start Redis server
redis-server --daemonize yes

# Or use Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### Playwright Not Installed
```bash
npm install playwright
npx playwright install chromium
```