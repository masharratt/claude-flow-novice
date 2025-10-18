# Test Scripts

This directory contains all testing and validation scripts for the Claude Flow project.

## Scripts

### Core Test Infrastructure

#### `test-runner.ts` - Universal Test Runner
Primary test orchestration with multiple test strategies.

#### `test-comprehensive.js` - Comprehensive Test Suite
Full system testing including unit, integration, and e2e tests.

#### `test-coordination-features.ts` - Coordination Testing
Tests for Claude Flow's coordination and swarm features.

### Performance & Load Testing

#### `check-performance-regression.ts` - Performance Regression Detection
Monitors and detects performance regressions between builds.

#### `load-test-swarm.js` - Swarm Load Testing
High-load testing for swarm coordination and agent management.

#### `coverage-report.ts` - Test Coverage Analysis
Generates comprehensive test coverage reports and analysis.

### Specialized Testing

#### `test-swarm.ts` - Swarm Functionality Testing
Core swarm behavior and coordination testing.

#### `test-swarm-integration.sh` - Swarm Integration Tests
Integration testing for swarm components with external systems.

#### `test-byzantine-resolution.js` - Byzantine Fault Tolerance Testing
Tests Byzantine fault tolerance and consensus mechanisms.

#### `test-fallback-systems.js` - Fallback System Testing
Tests failover and recovery mechanisms.

#### `test-mcp.ts` - MCP Protocol Testing
Model Context Protocol implementation testing.

#### `test-cli-wizard.js` - CLI Interface Testing
Command-line interface and wizard functionality testing.

#### `test-init-command.ts` - Initialization Testing
Tests project initialization and setup commands.

#### `test-claude-spawn-options.sh` - Claude Spawn Testing
Tests Claude agent spawning with various configuration options.

#### `test-batch-tasks.ts` - Batch Task Testing
Tests batch processing and parallel task execution.

### Validation & Compliance

#### `validation-summary.ts` - Test Validation Summary
Generates comprehensive validation reports across all test categories.

#### `integration-test-validation.cjs` - Integration Validation
Validates integration test results and system compatibility.

#### `run-phase3-compliance-tests.js` - Phase 3 Compliance Testing
Specific compliance testing for Phase 3 project requirements.

#### `check-links.ts` - Link Validation
Validates internal and external links in documentation and code.

### Test Generation

#### `generate-swarm-tests.js` - Automated Test Generation
Automatically generates test cases for swarm functionality.

## Package.json Integration

Test scripts are integrated into package.json:

```json
{
  "scripts": {
    "test": "NODE_OPTIONS='--experimental-vm-modules' jest --config=config/jest/jest.config.js --bail --maxWorkers=1 --forceExit",
    "test:unit": "NODE_OPTIONS='--experimental-vm-modules' jest src/__tests__/unit",
    "test:integration": "NODE_OPTIONS='--experimental-vm-modules' jest src/__tests__/integration",
    "test:e2e": "NODE_OPTIONS='--experimental-vm-modules' jest src/__tests__/e2e",
    "test:performance": "NODE_OPTIONS='--experimental-vm-modules' jest src/__tests__/performance",
    "test:coverage": "NODE_OPTIONS='--experimental-vm-modules' jest --config=config/jest/jest.config.js --coverage",
    "test:ci": "NODE_OPTIONS='--experimental-vm-modules' jest --config=config/jest/jest.config.js --ci --coverage --maxWorkers=2"
  }
}
```

## Test Categories

### 1. Unit Tests
- Individual component testing
- Isolated functionality verification
- Mock-based testing

### 2. Integration Tests
- Component interaction testing
- API integration verification
- Database connectivity testing

### 3. End-to-End Tests
- Full workflow testing
- User journey verification
- Complete system testing

### 4. Performance Tests
- Load testing
- Stress testing
- Performance regression detection
- Resource usage monitoring

### 5. Swarm Tests
- Agent coordination testing
- Consensus mechanism testing
- Fault tolerance testing
- Byzantine failure handling

### 6. Compliance Tests
- Phase requirements verification
- Security compliance testing
- Protocol compliance verification

## Running Tests

### Basic Test Execution
```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:performance

# Generate coverage reports
npm run test:coverage
```

### Specialized Testing
```bash
# Performance regression testing
node scripts/test/check-performance-regression.ts

# Swarm load testing
node scripts/test/load-test-swarm.js

# Comprehensive testing
node scripts/test/test-comprehensive.js

# Generate test reports
node scripts/test/validation-summary.ts
```

## Test Configuration

### Jest Configuration
Tests use Jest with custom configuration located in `config/jest/jest.config.js`.

### Node.js Options
Tests require experimental VM modules:
```bash
NODE_OPTIONS='--experimental-vm-modules'
```

### Test Environment
- Isolated test execution (maxWorkers=1)
- Fail-fast mode (--bail)
- Forced exit (--forceExit)
- CI-optimized settings

## Test Data & Fixtures

Test data and fixtures should be placed in appropriate test directories:
- `src/__tests__/fixtures/` - Test data files
- `src/__tests__/mocks/` - Mock implementations
- `src/__tests__/helpers/` - Test helper functions

## Continuous Integration

CI-specific test configuration:
```bash
npm run test:ci
```

Features:
- Parallel execution (maxWorkers=2)
- Coverage reporting
- CI-optimized timeouts
- Artifact generation

## Troubleshooting

### Common Issues

**Test Failures:**
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- --testPathPattern=specific-test.test.js
```

**Performance Test Issues:**
```bash
# Check system resources
node scripts/test/check-performance-regression.ts

# Run isolated performance tests
npm run test:performance
```

**Swarm Test Failures:**
```bash
# Test swarm coordination
node scripts/test/test-swarm.ts

# Check Byzantine fault tolerance
node scripts/test/test-byzantine-resolution.js
```

### Memory Issues
If tests fail due to memory issues:
```bash
# Increase Node.js memory limit
NODE_OPTIONS='--experimental-vm-modules --max-old-space-size=4096' npm test
```

For legacy test scripts, see `../legacy/` directory.