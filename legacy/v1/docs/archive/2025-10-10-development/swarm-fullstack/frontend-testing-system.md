# Frontend Testing System for Fullstack Swarm

## Overview

The Frontend Testing System provides comprehensive testing infrastructure for the fullstack swarm orchestrator, integrating unit tests, integration tests, E2E tests, visual regression, and accessibility testing into a unified testing workflow.

## Architecture

### Core Components

1. **Frontend Test Orchestrator** (`src/swarm-fullstack/testing/frontend-test-orchestrator.ts`)
   - Central coordinator for all frontend testing activities
   - Manages test execution, prioritization, and parallelization
   - Integrates with fullstack orchestrator for seamless swarm coordination

2. **Visual Regression System** (`src/swarm-fullstack/testing/visual-regression.ts`)
   - Screenshot capture and comparison
   - Baseline management
   - Cross-browser and responsive testing

3. **Integration Test Suite** (`tests/swarm-fullstack/frontend-integration.test.ts`)
   - Comprehensive test coverage for orchestrator functionality
   - Real-world testing scenarios
   - Performance and quality validation

## Testing Frameworks

### Unit Testing: Jest + React Testing Library

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button Component', () => {
  it('should render with correct text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);

    fireEvent.click(screen.getByText('Click Me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Click Me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Integration Testing

```typescript
import { FrontendTestOrchestrator } from './frontend-test-orchestrator';

describe('Component Integration', () => {
  it('should integrate form with validation', async () => {
    const { getByLabelText, getByText } = render(<LoginForm />);

    // Fill out form
    fireEvent.change(getByLabelText('Email'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.change(getByLabelText('Password'), {
      target: { value: 'password123' }
    });

    // Submit form
    fireEvent.click(getByText('Login'));

    // Verify API call
    await waitFor(() => {
      expect(mockApiClient.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    });
  });
});
```

### E2E Testing: Playwright

```typescript
import { test, expect } from '@playwright/test';

test.describe('User Journey', () => {
  test('complete registration and login flow', async ({ page }) => {
    // Navigate to registration
    await page.goto('/register');

    // Fill registration form
    await page.fill('[data-testid="email"]', 'newuser@example.com');
    await page.fill('[data-testid="password"]', 'SecurePass123!');
    await page.fill('[data-testid="confirm-password"]', 'SecurePass123!');

    // Submit registration
    await page.click('[data-testid="register-button"]');

    // Verify success
    await expect(page.locator('[data-testid="success-message"]'))
      .toContainText('Registration successful');

    // Navigate to login
    await page.goto('/login');

    // Login with new credentials
    await page.fill('[data-testid="email"]', 'newuser@example.com');
    await page.fill('[data-testid="password"]', 'SecurePass123!');
    await page.click('[data-testid="login-button"]');

    // Verify dashboard redirect
    await expect(page).toHaveURL('/dashboard');
  });
});
```

### Visual Regression Testing

```typescript
import { VisualRegressionSystem } from './visual-regression';

const visualTester = new VisualRegressionSystem({
  threshold: 0.99,
  browsers: ['chromium', 'firefox', 'webkit'],
  viewports: [
    { width: 1920, height: 1080, name: 'desktop' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 375, height: 667, name: 'mobile' }
  ]
}, logger);

// Test component across all configurations
const results = await visualTester.testComponent('Button', '/components/button');

// Check for visual differences
const failures = results.filter(r => !r.passed);
if (failures.length > 0) {
  console.error('Visual regressions detected:', failures);
}
```

### Accessibility Testing

```typescript
import { executeAccessibilityTests } from './frontend-test-orchestrator';

const suite: TestSuite = {
  id: 'a11y-homepage',
  name: 'Homepage Accessibility',
  type: 'accessibility',
  files: ['/'],
  dependencies: [],
  priority: 4,
  estimatedDuration: 60000,
  tags: ['accessibility', 'wcag2aa']
};

const result = await orchestrator.executeAccessibilityTests(suite);

if (result.accessibility.violations.length > 0) {
  console.log('Accessibility violations:', result.accessibility.violations);
}
```

## Usage

### Basic Setup

```typescript
import { FrontendTestOrchestrator } from './testing/frontend-test-orchestrator';
import { createLogger } from '../core/logger';

const logger = createLogger({ level: 'info' });

const orchestrator = new FrontendTestOrchestrator({
  unit: {
    enabled: true,
    framework: 'jest',
    timeout: 30000,
    coverage: {
      enabled: true,
      threshold: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
      }
    }
  },
  e2e: {
    enabled: true,
    framework: 'playwright',
    browsers: ['chromium'],
    headless: true,
    timeout: 120000,
    retries: 2
  },
  visualRegression: {
    enabled: true,
    threshold: 0.99,
    updateBaselines: false
  },
  accessibility: {
    enabled: true,
    standards: ['wcag2aa'],
    autoFix: false
  }
}, logger);
```

### Executing Test Plans

```typescript
const plan: TestExecutionPlan = {
  swarmId: 'swarm-123',
  feature: 'User Authentication',
  suites: [
    {
      id: 'unit-auth',
      name: 'Auth Unit Tests',
      type: 'unit',
      files: ['src/auth/*.test.ts'],
      dependencies: [],
      priority: 1,
      estimatedDuration: 30000,
      tags: ['unit', 'auth']
    },
    {
      id: 'e2e-auth',
      name: 'Auth E2E Tests',
      type: 'e2e',
      files: ['tests/e2e/auth.spec.ts'],
      dependencies: ['unit-auth'],
      priority: 3,
      estimatedDuration: 120000,
      tags: ['e2e', 'auth']
    }
  ],
  parallelization: {
    enabled: true,
    maxConcurrent: 4
  },
  retryPolicy: {
    enabled: true,
    maxRetries: 2,
    retryDelay: 1000
  },
  reportingChannels: ['console', 'swarm-bus']
};

const results = await orchestrator.executeTestPlan(plan);
console.log('Test Summary:', orchestrator.getTestSummary());
```

### Integration with Fullstack Orchestrator

```typescript
import { FullStackOrchestrator } from './fullstack-orchestrator';
import { FrontendTestOrchestrator } from './testing/frontend-test-orchestrator';

const fullstackOrchestrator = new FullStackOrchestrator(config, logger);
const testOrchestrator = new FrontendTestOrchestrator(testConfig, logger);

// Listen for development phase completion
fullstackOrchestrator.on('phase-completed', async (event) => {
  if (event.phase === 'development') {
    // Trigger frontend tests
    const testPlan = generateTestPlan(event.swarmId, event.feature);
    const results = await testOrchestrator.executeTestPlan(testPlan);

    // Report results back to orchestrator
    if (results.some(r => r.status === 'failed')) {
      fullstackOrchestrator.emit('test-failures-detected', {
        swarmId: event.swarmId,
        results
      });
    }
  }
});

// Listen for test results
testOrchestrator.on('test-results-ready', (message) => {
  // Broadcast to swarm agents
  fullstackOrchestrator.broadcastMessage(message);
});
```

## Performance Requirements

### Execution Times

- **Unit Tests**: < 30 seconds for complete suite
- **Integration Tests**: < 2 minutes for complete suite
- **E2E Tests**: < 5 minutes per critical user path
- **Visual Regression**: < 3 minutes for full component library
- **Accessibility Scans**: < 90 seconds per page

### Parallelization

The orchestrator supports parallel test execution:

```typescript
const plan: TestExecutionPlan = {
  // ... other config
  parallelization: {
    enabled: true,
    maxConcurrent: 8 // Run up to 8 test suites simultaneously
  }
};
```

Optimal concurrency is typically:
- **Local Development**: 2-4 concurrent suites
- **CI/CD Pipeline**: 8-16 concurrent suites
- **Dedicated Test Infrastructure**: 16-32 concurrent suites

## Coverage Requirements

### Code Coverage Thresholds

```typescript
coverage: {
  threshold: {
    statements: 80,  // 80% statement coverage
    branches: 75,    // 75% branch coverage
    functions: 80,   // 80% function coverage
    lines: 80        // 80% line coverage
  }
}
```

### Coverage Reporting

```typescript
const summary = orchestrator.getTestSummary();
console.log(`Coverage: ${summary.coverage?.lines}% lines covered`);

// Detailed coverage by file
const results = Array.from(testResults.values());
results.forEach(result => {
  if (result.coverage) {
    console.log(`${result.suiteName}:`, result.coverage);
  }
});
```

## Test Prioritization

The orchestrator automatically prioritizes tests based on:

1. **Priority Level**: High priority tests run first
2. **Test Type**: Unit → Integration → E2E → Visual → Accessibility
3. **Dependencies**: Tests with fewer dependencies run earlier
4. **Estimated Duration**: Faster tests run first (when priorities are equal)

```typescript
const suite: TestSuite = {
  id: 'critical-path',
  name: 'Critical User Path Tests',
  type: 'e2e',
  files: ['tests/e2e/critical-path.spec.ts'],
  dependencies: ['unit-auth', 'unit-checkout'],
  priority: 10, // High priority (0-10 scale)
  estimatedDuration: 180000,
  tags: ['critical', 'smoke']
};
```

## Event System

### Available Events

```typescript
// Test Plan Events
orchestrator.on('test-plan-started', (event) => {
  console.log('Test plan started:', event.plan.feature);
});

orchestrator.on('test-plan-completed', (event) => {
  console.log('Test plan completed:', event.summary);
});

// Test Suite Events
orchestrator.on('unit-tests-completed', (event) => {
  console.log('Unit tests completed:', event.result);
});

orchestrator.on('integration-tests-completed', (event) => {
  console.log('Integration tests completed:', event.result);
});

orchestrator.on('e2e-tests-completed', (event) => {
  console.log('E2E tests completed:', event.result);
});

orchestrator.on('visual-regression-tests-completed', (event) => {
  console.log('Visual tests completed:', event.result);
});

orchestrator.on('accessibility-tests-completed', (event) => {
  console.log('Accessibility tests completed:', event.result);
});

// Results Events
orchestrator.on('test-results-ready', (message) => {
  // Message formatted for swarm communication bus
  console.log('Results ready for broadcast:', message);
});
```

## Retry Strategy

### Automatic Retries

```typescript
const plan: TestExecutionPlan = {
  // ... other config
  retryPolicy: {
    enabled: true,
    maxRetries: 3,      // Retry up to 3 times
    retryDelay: 1000    // Wait 1 second between retries
  }
};
```

Tests are automatically retried on:
- Network failures
- Timeout errors
- Flaky test failures
- Infrastructure issues

Tests are NOT retried on:
- Assertion failures
- Syntax errors
- Configuration errors

## Best Practices

### 1. Test Organization

```
tests/
├── unit/
│   ├── components/
│   ├── hooks/
│   └── utils/
├── integration/
│   ├── features/
│   └── api/
├── e2e/
│   ├── user-journeys/
│   └── critical-paths/
├── visual/
│   ├── baselines/
│   ├── current/
│   └── diffs/
└── accessibility/
    └── wcag-compliance/
```

### 2. Test Naming Conventions

```typescript
// Unit tests: describe what it does
describe('Button', () => {
  it('should render with correct text', () => {});
  it('should call onClick when clicked', () => {});
  it('should be disabled when disabled prop is true', () => {});
});

// Integration tests: describe the integration
describe('Login Form Integration', () => {
  it('should authenticate user with valid credentials', () => {});
  it('should display error for invalid credentials', () => {});
});

// E2E tests: describe user journey
test('user can register and complete first purchase', () => {});
test('user can recover password and log in', () => {});
```

### 3. Test Data Management

```typescript
// Use factories for test data
const createUser = (overrides = {}) => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  ...overrides
});

// Use fixtures for complex data
import { userFixtures } from './fixtures/users';

describe('User Management', () => {
  it('should handle admin user', () => {
    const admin = userFixtures.admin();
    // test with admin
  });
});
```

### 4. Mocking Strategy

```typescript
// Partial mocking for integration tests
jest.mock('./api/client', () => ({
  ...jest.requireActual('./api/client'),
  fetchUser: jest.fn()
}));

// Full mocking for unit tests
jest.mock('./api/client');
```

## Troubleshooting

### Common Issues

#### Tests Timing Out

```typescript
// Increase timeout for slow tests
const config: TestConfiguration = {
  unit: {
    timeout: 60000 // Increase to 60 seconds
  }
};
```

#### Flaky Tests

```typescript
// Enable retries for flaky tests
const plan: TestExecutionPlan = {
  retryPolicy: {
    enabled: true,
    maxRetries: 3,
    retryDelay: 2000 // Longer delay for flaky tests
  }
};
```

#### Visual Test Failures

```typescript
// Adjust similarity threshold
const visualConfig: VisualTestConfig = {
  threshold: 0.98 // Allow 2% difference
};

// Update baselines after intentional changes
const visualSystem = new VisualRegressionSystem({
  updateBaselines: true
}, logger);
```

#### Coverage Below Threshold

```typescript
// Add more test cases
// Check for untested branches
// Review coverage report
const summary = orchestrator.getTestSummary();
if (summary.coverage.lines < 80) {
  console.log('Coverage below threshold, review:');
  console.log('- Untested components');
  console.log('- Edge cases');
  console.log('- Error paths');
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Frontend Tests

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

      - name: Run Unit Tests
        run: npm run test:unit

      - name: Run Integration Tests
        run: npm run test:integration

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E Tests
        run: npm run test:e2e

      - name: Run Visual Regression Tests
        run: npm run test:visual

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## Performance Monitoring

The orchestrator tracks and reports performance metrics:

```typescript
const progress = orchestrator.getTestProgress();
console.log(`Tests: ${progress.completed}/${progress.total}`);
console.log(`Status: ${progress.status}`);

const summary = orchestrator.getTestSummary();
console.log(`Duration: ${summary.duration}ms`);
console.log(`Pass Rate: ${(summary.passed / summary.totalSuites * 100).toFixed(2)}%`);
```

## Future Enhancements

1. **AI-Powered Test Generation**: Automatically generate test cases based on component analysis
2. **Smart Test Selection**: Run only tests affected by code changes
3. **Performance Budgets**: Fail tests if performance metrics degrade
4. **Cross-Device Testing**: Expand testing to real mobile devices
5. **Mutation Testing**: Validate test quality by introducing code mutations
6. **Test Analytics**: Advanced reporting and trend analysis

## Related Documentation

- [Fullstack Orchestrator](./fullstack-orchestrator.md)
- [Chrome MCP Integration](./chrome-mcp-integration.md)
- [Agent Communication System](../architecture/ultra-fast-communication-bus-design.md)
- [Testing Best Practices](../../docs/testing-guidelines.md)

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review test logs in `orchestrator.getTestSummary()`
- Enable debug logging: `logger.setLevel('debug')`
- Contact the frontend testing team