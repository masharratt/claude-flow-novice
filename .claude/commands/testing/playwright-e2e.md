# Playwright E2E Testing Commands

## Command Overview
End-to-end testing commands using Playwright framework with MCP integration for web portal testing.

## Usage Patterns

### Basic Commands
```bash
# Run all E2E tests
npx claude-flow sparc run playwright-tester "Execute full E2E test suite"

# Run specific test file
npx claude-flow sparc run playwright-tester "Test web portal dashboard functionality"

# Run with specific browser
npx claude-flow sparc run playwright-tester "Test mobile responsiveness on webkit"
```

### Interactive Commands
```bash
# Open Playwright UI for interactive testing
npm run test:e2e:playwright:ui

# Debug specific test
npm run test:e2e:playwright:debug -- --grep "user authentication"

# Generate new test code
npm run playwright:codegen
```

### MCP Integration Commands
```bash
# Test MCP server connectivity via Playwright
npx claude-flow mcp-test playwright-server

# Execute MCP commands through web interface
npx claude-flow sparc batch playwright-tester,mcp-integration "Test command execution flow"

# Monitor real-time MCP responses
npx claude-flow swarm monitor --include-playwright-tests
```

## Command Categories

### 1. **Test Execution**

#### Full Suite Execution
```bash
# All browsers, all tests
npx claude-flow sparc run playwright-tester "Execute comprehensive E2E test suite across all browsers"

# Performance-focused testing
npx claude-flow sparc run playwright-tester "Run performance tests with network monitoring"

# Accessibility validation
npx claude-flow sparc run playwright-tester "Validate web portal accessibility compliance"
```

#### Targeted Testing
```bash
# Authentication flow testing
npx claude-flow sparc run playwright-tester "Test complete user authentication workflow"

# MCP integration testing
npx claude-flow sparc run playwright-tester "Validate MCP server communication and command execution"

# Responsive design testing
npx claude-flow sparc run playwright-tester "Test responsive design across mobile, tablet, and desktop"
```

### 2. **Development & Debugging**

#### Test Development
```bash
# Generate test code interactively
npm run playwright:codegen

# Record new test scenarios
npx playwright codegen --target playwright-test

# Create test from existing user flow
npx playwright codegen --save-storage auth.json http://localhost:3000
```

#### Debugging Commands
```bash
# Debug mode with browser UI
npm run test:e2e:playwright:debug

# Headed mode for visual debugging
npm run test:e2e:playwright:headed

# Step through test execution
npx playwright test --debug --grep "specific test name"
```

#### Trace Analysis
```bash
# Show test traces
npx playwright show-trace trace.zip

# Generate trace for failing tests
npx playwright test --trace on-failure-retry
```

### 3. **Reporting & Analysis**

#### Report Generation
```bash
# Open HTML report
npx playwright show-report

# Generate custom report
npx claude-flow sparc run playwright-tester "Generate comprehensive test report with performance metrics"

# Export test results
npx playwright test --reporter=junit --output-dir=reports
```

#### Performance Analysis
```bash
# Performance-focused test run
npx claude-flow sparc run playwright-tester "Execute performance benchmark tests with detailed timing analysis"

# Network monitoring tests
npx claude-flow sparc run playwright-tester "Monitor network requests and identify bottlenecks"
```

### 4. **CI/CD Integration**

#### Continuous Integration
```bash
# CI-optimized test execution
npm run test:e2e:playwright -- --workers=1 --reporter=github

# Headless execution for CI
CI=true npm run test:e2e:playwright

# With retry for flaky tests
npx playwright test --retries=2
```

#### Docker Integration
```bash
# Run tests in Docker container
docker run --rm -v $(pwd):/app -w /app mcr.microsoft.com/playwright:latest npm run test:e2e:playwright

# With custom Docker setup
npx claude-flow sparc run playwright-tester "Execute E2E tests in containerized environment"
```

## Swarm Coordination Commands

### Multi-Agent Coordination
```bash
# Coordinate with multiple testing agents
npx claude-flow swarm init hierarchical --max-agents 5
npx claude-flow agent spawn playwright-tester
npx claude-flow agent spawn performance-analyzer
npx claude-flow task orchestrate "Execute comprehensive web portal testing with performance analysis"
```

### Memory-Integrated Testing
```bash
# Store test results in swarm memory
npx claude-flow sparc run playwright-tester "Execute tests and store results in coordination memory for team review"

# Load previous test context
npx claude-flow sparc run playwright-tester "Continue testing from previous session state"
```

### Real-Time Coordination
```bash
# Monitor testing progress
npx claude-flow swarm monitor --agent-type playwright-tester

# Stream test results
npx claude-flow swarm status --include-test-metrics
```

## Advanced Usage Patterns

### 1. **Parallel Test Execution**
```bash
# Parallel execution across multiple agents
npx claude-flow sparc batch playwright-tester,playwright-tester,playwright-tester "Split test suite across three parallel agents"

# Browser-specific parallel testing
npx claude-flow sparc concurrent playwright-tester "tests-chromium.txt,tests-firefox.txt,tests-webkit.txt"
```

### 2. **Environment-Specific Testing**
```bash
# Staging environment testing
BASEURL=https://staging.example.com npx claude-flow sparc run playwright-tester "Test staging environment functionality"

# Production smoke tests
ENVIRONMENT=production npx claude-flow sparc run playwright-tester "Execute production smoke test suite"
```

### 3. **API Integration Testing**
```bash
# Combined API and UI testing
npx claude-flow sparc batch api-tester,playwright-tester "Test API endpoints and UI integration"

# Mock API testing
npx claude-flow sparc run playwright-tester "Test UI with mocked API responses"
```

## Configuration Commands

### Setup and Installation
```bash
# Install Playwright browsers
npm run playwright:install

# Install specific browser
npx playwright install chromium

# Update Playwright
npm update @playwright/test playwright
```

### Configuration Management
```bash
# Validate configuration
npx playwright test --list

# Show configuration
npx playwright --version
npx playwright show-report --help
```

## Troubleshooting Commands

### Diagnostic Commands
```bash
# Check Playwright installation
npx playwright --version

# Verify browser installation
npx playwright install --dry-run

# Test connectivity
npx claude-flow health-check --include-playwright
```

### Error Resolution
```bash
# Clear test artifacts
rm -rf test-results/ playwright-report/

# Reset test state
npx claude-flow sparc run playwright-tester "Reset and clean test environment state"

# Debug specific failure
npx playwright test tests/e2e/web-portal.spec.ts --debug --grep "failing test name"
```

## Integration Patterns

### With GitHub Actions
```yaml
# .github/workflows/e2e-tests.yml
- name: Run Playwright tests
  run: |
    npx claude-flow sparc run playwright-tester "Execute E2E tests for CI/CD pipeline"
```

### With MCP Servers
```bash
# Ensure MCP servers are running
npx claude-flow mcp status

# Test MCP integration specifically
npx claude-flow sparc run playwright-tester "Validate all MCP server integrations via web interface"
```

### With Performance Monitoring
```bash
# Combined performance and functional testing
npx claude-flow sparc batch playwright-tester,performance-analyzer "Execute E2E tests with comprehensive performance monitoring"
```

---

**Note**: All commands follow the CLAUDE.md concurrent execution patterns and integrate with the swarm coordination system for optimal performance and result sharing.