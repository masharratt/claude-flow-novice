# Backend Testing System Documentation

## Overview

Comprehensive backend testing infrastructure for the Claude Flow Novice fullstack swarm orchestrator. This system provides enterprise-grade testing capabilities for API endpoints, database operations, business logic, and performance benchmarking.

## Architecture

### Core Components

1. **Backend Test Orchestrator** (`src/swarm-fullstack/testing/backend-test-orchestrator.ts`)
   - Coordinates all backend testing activities
   - Manages test execution workflows
   - Handles database test isolation
   - Provides performance benchmarking
   - Generates comprehensive test reports

2. **API Contract Validator** (`src/swarm-fullstack/testing/api-contract-validator.ts`)
   - Validates API contracts using OpenAPI specifications
   - Detects breaking changes between contract versions
   - Validates request/response schemas
   - Generates OpenAPI 3.0 specifications
   - Tracks validation history and statistics

3. **Backend Integration Tests** (`tests/swarm-fullstack/backend-integration.test.ts`)
   - Comprehensive test suite for backend components
   - API endpoint validation tests
   - Database operation tests
   - Authentication/authorization tests
   - Performance benchmarking tests
   - Coverage analysis tests

## Features

### 1. Test Orchestration

```typescript
import { BackendTestOrchestrator } from './backend-test-orchestrator';
import { ConsoleLogger } from '../../core/logger';

const config = {
  database: {
    isolationMode: 'transaction', // 'transaction' | 'truncate' | 'recreate'
    connectionPoolSize: 10,
    testDbPrefix: 'test_',
    cleanupStrategy: 'immediate',
  },
  api: {
    baseUrl: 'http://localhost:3000',
    timeout: 5000,
    retries: 3,
    validateSchemas: true,
  },
  performance: {
    enabled: true,
    thresholds: {
      p50: 100,  // ms
      p95: 500,  // ms
      p99: 1000, // ms
      throughput: 100, // requests/sec
    },
    duration: 60,
    concurrency: 10,
  },
  coverage: {
    enabled: true,
    threshold: 80,
    includeIntegration: true,
  },
};

const logger = new ConsoleLogger('BackendTests');
const orchestrator = new BackendTestOrchestrator(config, logger);

// Execute complete test workflow
const plan = {
  swarmId: 'swarm-123',
  feature: 'user-management',
  testTypes: ['unit', 'integration', 'api', 'performance'],
  browsers: ['chromium'],
  devices: ['desktop'],
  priority: 1,
  parallel: true,
};

const results = await orchestrator.executeTestWorkflow('swarm-123', plan);
```

### 2. API Contract Validation

```typescript
import { APIContractValidator } from './api-contract-validator';

const validator = new APIContractValidator(logger);

// Register API contract
validator.registerContract('user-api', {
  version: '1.0.0',
  basePath: '/api/v1',
  endpoints: [
    {
      path: '/users',
      method: 'POST',
      operationId: 'createUser',
      parameters: [],
      requestBody: {
        required: true,
        content: new Map([
          ['application/json', {
            schema: {
              type: 'object',
              properties: new Map([
                ['email', { type: 'string', format: 'email' }],
                ['name', { type: 'string' }],
                ['password', { type: 'string' }],
              ]),
              required: ['email', 'name', 'password'],
            },
          }],
        ]),
      },
      responses: new Map([
        [201, { description: 'User created' }],
        [400, { description: 'Bad request' }],
      ]),
    },
  ],
  schemas: new Map(),
});

// Validate request
const validation = await validator.validateRequest(
  'user-api',
  '/users',
  'POST',
  {
    body: {
      email: 'test@example.com',
      name: 'Test User',
      password: 'securepass123',
    },
  }
);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}

// Compare contracts for breaking changes
const diff = validator.compareContracts(oldContract, newContract);
console.log('Breaking changes:', diff.breaking);
console.log('Additions:', diff.additions);
```

### 3. Database Test Isolation

The system supports three isolation modes:

#### Transaction Isolation (Recommended)
```typescript
{
  database: {
    isolationMode: 'transaction',
  }
}
```
- Wraps tests in database transactions
- Automatically rolls back after tests
- Fastest cleanup method
- Ensures complete isolation

#### Truncate Isolation
```typescript
{
  database: {
    isolationMode: 'truncate',
  }
}
```
- Truncates tables before/after tests
- Good for integration tests
- Preserves schema and triggers

#### Recreate Isolation
```typescript
{
  database: {
    isolationMode: 'recreate',
  }
}
```
- Creates fresh database for each test
- Complete isolation
- Slower but most thorough

### 4. Performance Benchmarking

```typescript
// Configure performance thresholds
const config = {
  performance: {
    enabled: true,
    thresholds: {
      p50: 100,   // 50th percentile latency (ms)
      p95: 500,   // 95th percentile latency (ms)
      p99: 1000,  // 99th percentile latency (ms)
      throughput: 100, // requests per second
    },
    duration: 60,     // test duration in seconds
    concurrency: 10,  // concurrent requests
  },
};

// Execute performance tests
const result = await orchestrator.executePerformanceTests('swarm-123');

if (result.performance) {
  console.log('P50 latency:', result.performance.p50, 'ms');
  console.log('P95 latency:', result.performance.p95, 'ms');
  console.log('P99 latency:', result.performance.p99, 'ms');
  console.log('Throughput:', result.performance.throughput, 'req/s');
}
```

## Test Execution Workflow

### Phase 1: Unit Tests (Fast Feedback)
```typescript
const unitResult = await orchestrator.executeUnitTests(swarmId);
// Expected duration: <10 seconds
// Coverage threshold: 80%
```

### Phase 2: Integration Tests
```typescript
const integrationResult = await orchestrator.executeIntegrationTests(swarmId);
// Expected duration: <30 seconds
// Includes database operations
// Full transaction isolation
```

### Phase 3: API Tests
```typescript
const apiResult = await orchestrator.executeAPITests(swarmId);
// Expected duration: <20 seconds
// Validates all endpoints
// Contract validation
```

### Phase 4: Performance Tests
```typescript
const perfResult = await orchestrator.executePerformanceTests(swarmId);
// Expected duration: 1-5 minutes
// Validates latency thresholds
// Measures throughput
```

## Integration with Fullstack Orchestrator

The backend testing system integrates seamlessly with the fullstack orchestrator:

```typescript
// In fullstack-orchestrator.ts
private async executeTestingPhase(status: SwarmExecutionStatus): Promise<void> {
  const testOrchestrator = new BackendTestOrchestrator(config, this.logger);

  const plan: TestExecutionPlan = {
    swarmId: status.swarmId,
    feature: status.feature.name,
    testTypes: ['unit', 'integration', 'api', 'performance'],
    browsers: ['chromium'],
    devices: ['desktop'],
    priority: 1,
    parallel: true,
  };

  const results = await testOrchestrator.executeTestWorkflow(status.swarmId, plan);

  // Update swarm status with test results
  status.performance.testResults = results;
  status.performance.qualityScore = this.calculateQualityScore(results);
}
```

## Test Results and Reporting

### Test Result Structure
```typescript
interface TestResult {
  suiteId: string;
  success: boolean;
  duration: number;
  tests: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  coverage?: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
  performance?: {
    p50: number;
    p95: number;
    p99: number;
    throughput: number;
    errors: number;
  };
  errors: TestError[];
  warnings: string[];
}
```

### Accessing Results
```typescript
// Get all results for a swarm
const results = orchestrator.getTestResults(swarmId);

// Get orchestrator status
const status = orchestrator.getStatus();
console.log('Running tests:', status.runningTests);
console.log('Total results:', status.totalResults);
console.log('Active DB contexts:', status.activeContexts);
```

## Event Handling

The orchestrator emits events for real-time monitoring:

```typescript
orchestrator.on('test-started', ({ swarmId, type }) => {
  console.log(`Test ${type} started for ${swarmId}`);
});

orchestrator.on('test-completed', ({ swarmId, type, result }) => {
  console.log(`Test ${type} completed: ${result.success ? 'PASS' : 'FAIL'}`);
});

orchestrator.on('test-failed', ({ swarmId, type, error }) => {
  console.error(`Test ${type} failed:`, error);
});

orchestrator.on('report-generated', ({ swarmId, report }) => {
  console.log('Test report:', report);
});
```

## Best Practices

### 1. Test Data Management
```typescript
// Use fixtures for consistent test data
const fixtures = {
  users: [
    { id: 1, email: 'test@example.com', name: 'Test User' },
    { id: 2, email: 'admin@example.com', name: 'Admin User' },
  ],
  posts: [
    { id: 1, userId: 1, title: 'Test Post', content: 'Content' },
  ],
};

// Load fixtures in beforeEach
beforeEach(async () => {
  await testDb.loadFixtures(fixtures);
});
```

### 2. Test Isolation
```typescript
// Each test should be independent
describe('User API', () => {
  let testContext: DatabaseTestContext;

  beforeEach(async () => {
    testContext = await orchestrator.createDatabaseTestContext('test-swarm');
  });

  afterEach(async () => {
    await orchestrator.cleanupDatabaseContext(testContext);
  });

  it('should create user', async () => {
    // Test runs in isolated context
  });
});
```

### 3. Performance Testing
```typescript
// Set realistic thresholds
const config = {
  performance: {
    thresholds: {
      p50: 50,   // Most requests should be fast
      p95: 200,  // 95% should be under 200ms
      p99: 500,  // Even slow requests should be reasonable
      throughput: 100, // Minimum acceptable throughput
    },
  },
};
```

### 4. Contract Testing
```typescript
// Version your contracts
const v1Contract = { version: '1.0.0', ... };
const v2Contract = { version: '2.0.0', ... };

// Detect breaking changes
const diff = validator.compareContracts(v1Contract, v2Contract);

if (diff.breaking.length > 0) {
  console.error('Breaking changes detected!');
  diff.breaking.forEach(change => {
    console.error(`- ${change.type}: ${change.endpoint}`);
  });
}
```

## Performance Targets

### Unit Tests
- Execution time: <10 seconds
- Coverage threshold: 80%
- Success rate: >95%

### Integration Tests
- Execution time: <30 seconds
- Database operations: isolated
- Success rate: >90%

### API Tests
- Execution time: <20 seconds
- Contract validation: 100%
- Success rate: >95%

### Performance Tests
- Duration: 30-120 seconds
- P50 latency: <100ms
- P95 latency: <500ms
- P99 latency: <1000ms
- Throughput: >100 req/s

## Configuration Options

### Database Configuration
```typescript
{
  database: {
    isolationMode: 'transaction' | 'truncate' | 'recreate',
    connectionPoolSize: number,
    testDbPrefix: string,
    cleanupStrategy: 'immediate' | 'deferred' | 'manual',
  }
}
```

### API Configuration
```typescript
{
  api: {
    baseUrl: string,
    timeout: number,
    retries: number,
    validateSchemas: boolean,
    captureRequests: boolean,
  }
}
```

### Performance Configuration
```typescript
{
  performance: {
    enabled: boolean,
    thresholds: {
      p50: number,
      p95: number,
      p99: number,
      throughput: number,
    },
    duration: number,
    concurrency: number,
  }
}
```

### Coverage Configuration
```typescript
{
  coverage: {
    enabled: boolean,
    threshold: number,
    includeIntegration: boolean,
    collectFrom: string[],
  }
}
```

## Troubleshooting

### Tests Timing Out
```typescript
// Increase timeouts for slow tests
{
  timeouts: {
    unit: 15000,      // 15 seconds
    integration: 45000, // 45 seconds
    e2e: 180000,      // 3 minutes
    performance: 600000, // 10 minutes
  }
}
```

### Database Connection Issues
```typescript
// Increase connection pool size
{
  database: {
    connectionPoolSize: 20,
  }
}
```

### Performance Threshold Failures
```typescript
// Adjust thresholds based on your infrastructure
{
  performance: {
    thresholds: {
      p50: 150,   // Increased from 100ms
      p95: 750,   // Increased from 500ms
      p99: 1500,  // Increased from 1000ms
    },
  }
}
```

## Running Tests

### Via npm scripts (to be added to package.json)
```json
{
  "scripts": {
    "test:backend": "jest tests/swarm-fullstack/backend-integration.test.ts",
    "test:backend:unit": "jest tests/swarm-fullstack/backend-integration.test.ts -t 'Unit'",
    "test:backend:api": "jest tests/swarm-fullstack/backend-integration.test.ts -t 'API'",
    "test:backend:perf": "jest tests/swarm-fullstack/backend-integration.test.ts -t 'Performance'"
  }
}
```

### Via fullstack CLI
```bash
# Run complete backend test workflow
npx claude-flow-novice fullstack:test --backend

# Run specific test types
npx claude-flow-novice fullstack:test --backend --type=unit
npx claude-flow-novice fullstack:test --backend --type=integration
npx claude-flow-novice fullstack:test --backend --type=performance
```

### Programmatically
```typescript
import { BackendTestOrchestrator } from './backend-test-orchestrator';

const orchestrator = new BackendTestOrchestrator(config, logger);

// Execute specific test type
const unitResult = await orchestrator.executeUnitTests('swarm-123');

// Execute complete workflow
const results = await orchestrator.executeTestWorkflow('swarm-123', plan);
```

## Examples

See the comprehensive test suite in `tests/swarm-fullstack/backend-integration.test.ts` for complete examples of:

- Test orchestrator usage
- API contract validation
- Database test isolation
- Performance benchmarking
- Coverage analysis
- Error handling

## Future Enhancements

1. **Load Testing Integration**
   - Artillery integration
   - K6 support
   - Custom load scenarios

2. **Advanced Contract Testing**
   - Pact integration
   - Consumer-driven contracts
   - Contract versioning

3. **Database Migrations**
   - Migration testing
   - Rollback testing
   - Schema validation

4. **Security Testing**
   - OWASP ZAP integration
   - SQL injection testing
   - XSS validation

5. **Chaos Engineering**
   - Network failure simulation
   - Database failover testing
   - Timeout scenarios

## Support and Contributing

For issues or questions about the backend testing system:
1. Check the test suite for examples
2. Review the API documentation
3. Open an issue on GitHub
4. Consult the fullstack orchestrator documentation

## License

MIT - See LICENSE file for details