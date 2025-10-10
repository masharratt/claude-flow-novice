# Installation Test Suite

**Phase 1: User Experience & Installation Simplification**

## Overview

Comprehensive test suite validating installation process across platforms, ensuring <5 minute installation time, and verifying template integrity.

## Test Files

### 1. installation-comprehensive.test.js
**Primary installation validation suite**

Tests:
- Fresh installation (no Redis)
- Existing Redis installation
- Invalid configurations
- Network errors
- Missing dependencies
- Cross-platform compatibility
- Installation time <5 minutes
- Template validation
- Redis auto-configuration
- Error handling and recovery

**Coverage**: 10 major test scenarios, 50+ individual tests

### 2. platform-specific.test.js
**Platform-specific installation scenarios**

Tests:
- Windows-specific behaviors (.cmd executables, PowerShell, WSL)
- macOS-specific behaviors (Homebrew, bash/zsh, file permissions)
- Linux-specific behaviors (package managers, systemd)
- Cross-platform file operations
- Environment detection (CI, Docker)
- Network configuration

**Coverage**: Platform-specific edge cases for Windows/macOS/Linux

### 3. template-validation.test.js
**Template integrity and out-of-box functionality**

Tests:
- CLAUDE.md template structure and content
- Settings.json template validity
- Memory bank template structure
- Coordination template structure
- Template integration
- Content formatting consistency
- Line ending handling
- Special character support

**Coverage**: All templates and configuration files

### 4. redis-auto-config.test.js
**Redis detection and auto-configuration**

Tests:
- Redis availability detection
- Configuration generation (Redis available)
- Fallback configuration (Redis unavailable)
- Connection testing
- Auto-configuration behavior
- Configuration persistence
- Environment variable support
- Fallback mechanisms

**Coverage**: Redis integration and fallback scenarios

## Running Tests

### Run All Tests
```bash
cd tests/phase1/installation
node run-installation-tests.js
```

### Run Individual Test Suite
```bash
# Installation comprehensive
npm test tests/phase1/installation/installation-comprehensive.test.js

# Platform-specific
npm test tests/phase1/installation/platform-specific.test.js

# Template validation
npm test tests/phase1/installation/template-validation.test.js

# Redis auto-config
npm test tests/phase1/installation/redis-auto-config.test.js
```

### Run with Coverage
```bash
npm test tests/phase1/installation/ -- --coverage
```

## Test Metrics

### Target Metrics
- **Installation Time**: <5 minutes
- **Test Coverage**: ≥90%
- **Pass Rate**: 100%
- **Platform Coverage**: Windows, macOS, Linux
- **Confidence Score**: ≥0.75

### Current Metrics
See `installation-test-report.json` after running tests.

## Test Scenarios

### Scenario 1: Fresh Installation (No Redis)
1. Create test directory
2. Install package via npm
3. Run init command
4. Verify file structure
5. Validate template content
6. Check fallback configuration
7. Measure installation time

**Expected**: Complete in <5 minutes, all files created, fallback mode active

### Scenario 2: Installation with Redis
1. Detect Redis availability
2. Install package
3. Run init command
4. Verify Redis configuration
5. Test Redis connectivity
6. Validate swarm persistence

**Expected**: Redis configured, persistence enabled

### Scenario 3: Platform-Specific Validation
1. Detect current platform
2. Run platform-specific tests
3. Validate platform-specific commands
4. Test file permissions
5. Check package manager integration

**Expected**: All platform-specific features work correctly

### Scenario 4: Error Recovery
1. Simulate interrupted installation
2. Create partial files
3. Run init with --force
4. Verify complete recovery
5. Validate final state

**Expected**: Clean recovery, all files present

## Self-Assessment

After test completion, the suite generates:

```json
{
  "agent": "installation-tester",
  "confidence": 0.85,
  "reasoning": "Installation <5min validated, cross-platform confirmed",
  "platforms_tested": ["linux", "win32", "darwin"],
  "avg_install_time_minutes": 3.2,
  "test_coverage": {
    "total": 50,
    "passed": 48,
    "failed": 2,
    "pass_rate": 96.0
  },
  "blockers": []
}
```

## Platform-Specific Notes

### Windows
- Uses `.cmd` executables (npm.cmd, npx.cmd)
- Tests PowerShell execution
- Validates WSL compatibility
- Handles long file paths (>260 chars)

### macOS
- Tests Homebrew integration
- Validates bash/zsh compatibility
- Checks file permissions (chmod 755)
- Tests Unix-style paths

### Linux
- Tests multiple package managers (apt, yum, dnf)
- Validates systemd integration
- Checks file permissions
- Tests various distributions

## Dependencies

### Required
- Node.js ≥20.0.0
- npm ≥9.0.0
- Jest (test runner)

### Optional
- Redis Server (for persistence tests)
- curl/wget (for network tests)
- Docker (for containerized tests)

## Continuous Integration

Tests are designed to run in CI environments:

```yaml
# .github/workflows/installation-tests.yml
name: Installation Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [20.x, 21.x]

    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - run: npm ci
      - run: node tests/phase1/installation/run-installation-tests.js
```

## Troubleshooting

### Tests Timing Out
- Increase timeout in test files: `jest.setTimeout(600000)`
- Check network connectivity
- Verify npm registry access

### Platform-Specific Failures
- Review platform detection logic
- Check platform-specific command availability
- Validate file permission requirements

### Redis Tests Failing
- Verify Redis server is running: `redis-cli ping`
- Check Redis connection parameters
- Review firewall settings

## Validation Checklist

- [ ] Installation completes in <5 minutes
- [ ] All required files created
- [ ] Templates valid and complete
- [ ] Redis auto-configuration works
- [ ] Fallback mode functional
- [ ] Cross-platform compatible
- [ ] Error recovery successful
- [ ] Test coverage ≥90%
- [ ] Confidence score ≥0.75
- [ ] All platforms tested

## Next Steps

After validation:
1. Review `installation-test-report.json`
2. Check `self-assessment.json`
3. Address any blockers
4. Run on additional platforms if needed
5. Update documentation based on findings

## Contributing

When adding new tests:
1. Follow existing test structure
2. Include platform compatibility checks
3. Add timeout handling
4. Update this README
5. Run full suite before committing

## License

MIT - See root LICENSE file
