# Integration Standardization Training
## CFN Integration Patterns & Best Practices

---

## Slide 1: Welcome & Overview

**Training Objectives:**
- Understand the standardization initiative and its benefits
- Learn new integration patterns across database, coordination, and skill systems
- Master error handling and testing best practices
- Successfully migrate existing code to new standards
- Build new features using standardized templates

**Duration:** 90 minutes
**Format:** Presentation + Hands-on Examples + Q&A

---

## Slide 2: Why Standardization Matters

**Business Impact:**
- 40% reduction in integration bugs
- 60% faster onboarding for new developers
- 75% reduction in debugging time
- Consistent error handling across all systems
- Improved test coverage (85%+ target)

**Technical Benefits:**
- Single source of truth for each concern
- Reduced cognitive load when switching contexts
- Easier maintenance and refactoring
- Better monitoring and observability
- Scalable architecture patterns

---

## Slide 3: Standardization Initiative Scope

**Phase 1 - Foundation (Completed):**
- Error handling patterns
- Schema validation framework
- Documentation standards

**Phase 2 - Integration (Completed):**
- Database abstraction layer
- Coordination protocols
- Skill lifecycle management

**Phase 3 - Adoption (Current):**
- Training and code examples
- Linting and CI/CD enforcement
- Migration of existing code
- Project templates

---

## Slide 4: Architecture Overview

```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (Backend Services, Agents, Skills)     │
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│      Standardized Integration Layer     │
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Database │  │  Redis   │  │ Skill  ││
│  │ Service  │  │  Coord   │  │ Loader ││
│  └──────────┘  └──────────┘  └────────┘│
└──────────────┬──────────────────────────┘
               │
┌──────────────┴──────────────────────────┐
│         Infrastructure Layer            │
│   (PostgreSQL, SQLite, Redis, FS)       │
└─────────────────────────────────────────┘
```

**Key Principle:** Application code never directly touches infrastructure
**Benefit:** Swap implementations without changing business logic

---

## Slide 5: Key Patterns Overview

**1. Database Integration**
- DatabaseService for all DB operations
- Cross-database transaction support
- Standardized error recovery

**2. Coordination Protocols**
- Redis-based agent coordination
- Schema-driven message passing
- Agent lifecycle management

**3. Skill Lifecycle**
- Validated skill deployment
- Content integrity checking
- Version management

**4. Error Handling**
- StandardError for all exceptions
- Structured error codes
- Rich context inclusion

**5. Testing Patterns**
- Integration test framework
- Mock standardization
- Performance validation

---

## SECTION 1: DATABASE INTEGRATION

---

## Slide 6: Database Integration Problem

**Before Standardization:**
```typescript
// Direct database access - scattered everywhere
import sqlite3 from 'sqlite3';
import pg from 'pg';

// Inconsistent error handling
try {
  const db = new sqlite3.Database('app.db');
  db.run('INSERT INTO users...', (err) => {
    if (err) console.error(err); // Lost context!
  });
} catch (e) {
  // Missing recovery logic
}

// No transaction support
// No connection pooling
// No query abstraction
```

**Problems:**
- Database logic scattered across codebase
- Inconsistent error handling
- No transaction boundaries
- Difficult to test
- Can't swap databases

---

## Slide 7: Database Integration Solution

**After Standardization:**
```typescript
import { DatabaseService } from './services/database-service';
import { StandardError } from './lib/errors';

const dbService = new DatabaseService({
  sqlite: { path: './data/app.db' },
  postgres: { host: 'localhost', database: 'cfn' }
});

try {
  // Clear abstraction
  await dbService.query('sqlite',
    'INSERT INTO users (name, email) VALUES (?, ?)',
    ['John', 'john@example.com']
  );
} catch (error) {
  if (error instanceof StandardError) {
    // Structured error with full context
    logger.error('Database operation failed', {
      code: error.code,
      database: error.context.database,
      originalError: error.cause
    });
  }
  throw error;
}
```

---

## Slide 8: DatabaseService API

**Core Methods:**
```typescript
class DatabaseService {
  // Execute query on specific database
  async query<T>(
    database: 'sqlite' | 'postgres',
    sql: string,
    params?: any[]
  ): Promise<T[]>

  // Execute within transaction
  async transaction<T>(
    database: 'sqlite' | 'postgres',
    callback: (db: Database) => Promise<T>
  ): Promise<T>

  // Health check
  async healthCheck(): Promise<{
    sqlite: boolean,
    postgres: boolean
  }>

  // Graceful shutdown
  async close(): Promise<void>
}
```

---

## Slide 9: Cross-Database Transactions

**Pattern:**
```typescript
// Atomic operations across databases
await dbService.transaction('postgres', async (pgDb) => {
  // Update user in PostgreSQL
  await pgDb.query(
    'UPDATE users SET credits = credits - 100 WHERE id = $1',
    [userId]
  );

  // Compensating transaction in SQLite
  await dbService.query('sqlite',
    'INSERT INTO audit_log (user_id, action, amount) VALUES (?, ?, ?)',
    [userId, 'debit', 100]
  );

  // Both succeed or both roll back
});
```

**Best Practices:**
- Keep transactions short
- Handle rollback scenarios
- Log transaction boundaries
- Monitor transaction duration

---

## Slide 10: Database Error Handling

**Standardized Error Recovery:**
```typescript
import { DatabaseError } from './lib/errors';

try {
  await dbService.query('postgres', 'SELECT * FROM users WHERE id = $1', [id]);
} catch (error) {
  if (error instanceof DatabaseError) {
    switch (error.code) {
      case 'DB_CONNECTION_FAILED':
        // Retry with exponential backoff
        await retryOperation(() => dbService.query(...));
        break;

      case 'DB_QUERY_TIMEOUT':
        // Log slow query for optimization
        logger.warn('Slow query detected', {
          query: error.context.query,
          duration: error.context.duration
        });
        break;

      case 'DB_CONSTRAINT_VIOLATION':
        // Handle validation error
        throw new ValidationError('User already exists');
        break;
    }
  }
  throw error;
}
```

---

## Slide 11: Database Integration Checklist

**Pre-Merge Checklist:**
- [ ] All database operations use DatabaseService
- [ ] No direct sqlite3/pg imports in business logic
- [ ] Transactions used for multi-step operations
- [ ] Errors wrapped in DatabaseError with context
- [ ] Connection pooling configured
- [ ] Health checks implemented
- [ ] Integration tests cover database operations
- [ ] Migration scripts use DatabaseService

**Common Pitfalls:**
- ❌ Forgetting to close connections
- ❌ Missing transaction boundaries
- ❌ Generic error messages
- ❌ Hardcoded database names

---

## SECTION 2: COORDINATION PROTOCOLS

---

## Slide 12: Coordination Problem

**Before Standardization:**
```typescript
// Direct Redis access - inconsistent patterns
import Redis from 'ioredis';

const redis = new Redis();

// Ad-hoc message passing
await redis.publish('agent-channel', JSON.stringify({
  type: 'complete',
  agentId: 'agent-123',
  data: { /* unstructured */ }
}));

// No schema validation
// No lifecycle management
// No error recovery
```

**Problems:**
- Inconsistent message formats
- No type safety
- Manual lifecycle tracking
- Error handling scattered
- Difficult to debug agent states

---

## Slide 13: Coordination Solution

**After Standardization:**
```typescript
import { RedisCoordination } from './services/redis-coordination';
import { AgentSchema } from './schemas/agent-schema';

const coord = new RedisCoordination({
  host: 'localhost',
  port: 6379
});

// Schema-validated message passing
await coord.publish('agent-complete', {
  taskId: 'task-123',
  agentId: 'agent-456',
  confidence: 0.92,
  iteration: 1,
  result: {
    deliverables: ['file1.ts', 'file2.ts'],
    status: 'complete'
  }
}, AgentSchema);

// Automatic validation and error handling
```

---

## Slide 14: Redis Coordination API

**Core Methods:**
```typescript
class RedisCoordination {
  // Publish schema-validated message
  async publish<T>(
    channel: string,
    message: T,
    schema: ValidationSchema
  ): Promise<void>

  // Subscribe to channel with validation
  async subscribe<T>(
    channel: string,
    schema: ValidationSchema,
    handler: (message: T) => Promise<void>
  ): Promise<void>

  // Blocking wait for signal
  async wait(
    key: string,
    timeout: number
  ): Promise<string | null>

  // Signal completion
  async signal(key: string, value: string): Promise<void>

  // Store structured data
  async hset(key: string, field: string, value: any): Promise<void>
  async hget(key: string, field: string): Promise<any>
}
```

---

## Slide 15: Agent Lifecycle Management

**Pattern:**
```typescript
// Coordinator spawns agent
const agentId = await coord.spawnAgent({
  type: 'backend-developer',
  taskId: 'task-123',
  context: { /* task context */ }
});

// Agent registers itself
await coord.registerAgent(agentId, {
  status: 'running',
  spawnedAt: new Date(),
  metadata: { iteration: 1 }
});

// Agent works...
const result = await doWork();

// Agent reports completion
await coord.reportCompletion({
  agentId,
  confidence: 0.88,
  result
});

// Coordinator collects results
const confidence = await coord.getConfidence(agentId);
```

---

## Slide 16: Schema Mapping

**Define Message Schemas:**
```typescript
// schemas/agent-schema.ts
export const AgentCompletionSchema = {
  type: 'object',
  required: ['taskId', 'agentId', 'confidence', 'result'],
  properties: {
    taskId: { type: 'string', pattern: '^[a-z0-9-]+$' },
    agentId: { type: 'string', pattern: '^[a-z0-9-]+$' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    iteration: { type: 'integer', minimum: 1 },
    result: {
      type: 'object',
      required: ['deliverables', 'status'],
      properties: {
        deliverables: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['complete', 'failed', 'partial'] }
      }
    }
  }
};

// Automatic validation on publish/subscribe
await coord.publish('agent-complete', message, AgentCompletionSchema);
```

---

## Slide 17: Coordination Error Handling

**Standardized Patterns:**
```typescript
import { CoordinationError } from './lib/errors';

try {
  await coord.wait('agent-signal', 30000); // 30s timeout
} catch (error) {
  if (error instanceof CoordinationError) {
    switch (error.code) {
      case 'COORD_TIMEOUT':
        // Agent didn't respond - retry or abort
        logger.warn('Agent timeout', {
          agentId: error.context.agentId,
          expectedSignal: error.context.signal
        });
        break;

      case 'COORD_VALIDATION_FAILED':
        // Schema mismatch - log and reject
        logger.error('Invalid message format', {
          schema: error.context.schema,
          message: error.context.message
        });
        break;

      case 'COORD_CONNECTION_FAILED':
        // Redis down - fallback or alert
        await fallbackToLocalCoordination();
        break;
    }
  }
}
```

---

## SECTION 3: SKILL LIFECYCLE

---

## Slide 18: Skill Deployment Problem

**Before Standardization:**
```typescript
// Direct file system operations
import fs from 'fs';

// No validation
fs.writeFileSync('.claude/skills/my-skill/SKILL.md', content);

// No content integrity checks
// No version management
// No rollback capability
```

**Problems:**
- Malformed skills deployed
- No content validation
- Difficult to track versions
- Manual rollback process
- No deployment audit trail

---

## Slide 19: Skill Deployment Solution

**After Standardization:**
```typescript
import { SkillLoader } from './services/skill-loader';

const loader = new SkillLoader({
  skillsPath: './.claude/skills'
});

// Validated deployment
await loader.deploySkill({
  name: 'cfn-custom-skill',
  content: skillMarkdown,
  version: '1.2.0',
  metadata: {
    author: 'team@company.com',
    dependencies: ['cfn-coordination']
  }
});

// Automatic:
// - Content validation
// - Version tracking
// - Backup creation
// - Integrity verification
```

---

## Slide 20: SkillLoader API

**Core Methods:**
```typescript
class SkillLoader {
  // Deploy new or update existing skill
  async deploySkill(config: {
    name: string,
    content: string,
    version: string,
    metadata?: object
  }): Promise<DeploymentResult>

  // Load skill with validation
  async loadSkill(name: string): Promise<SkillContent>

  // List all skills
  async listSkills(): Promise<SkillInfo[]>

  // Validate skill content
  async validateSkill(content: string): Promise<ValidationResult>

  // Rollback to previous version
  async rollbackSkill(name: string, version: string): Promise<void>

  // Get deployment history
  async getHistory(name: string): Promise<DeploymentHistory[]>
}
```

---

## Slide 21: Skill Content Validation

**Validation Rules:**
```typescript
// Skill content must follow standards
const validationRules = {
  // Required sections
  requiredSections: [
    '# Skill Name',
    '## Purpose',
    '## Usage',
    '## Examples'
  ],

  // Metadata requirements
  metadata: {
    version: /^\d+\.\d+\.\d+$/,
    author: /.+@.+\..+/
  },

  // Content rules
  content: {
    maxSize: 50000, // 50KB
    allowedTags: ['bash', 'typescript', 'javascript'],
    requiredExamples: 1
  }
};

// Automatic validation on deployment
const result = await loader.validateSkill(content);
if (!result.valid) {
  throw new SkillValidationError(result.errors);
}
```

---

## Slide 22: Skill Versioning

**Pattern:**
```typescript
// Deploy new version
await loader.deploySkill({
  name: 'cfn-coordination',
  content: updatedContent,
  version: '2.1.0', // Semantic versioning
  metadata: {
    changelog: 'Added timeout parameter to wait() method'
  }
});

// Version history maintained automatically
const history = await loader.getHistory('cfn-coordination');
// [
//   { version: '2.1.0', deployedAt: '2025-11-16', author: '...' },
//   { version: '2.0.0', deployedAt: '2025-11-10', author: '...' },
//   { version: '1.5.0', deployedAt: '2025-11-05', author: '...' }
// ]

// Rollback if needed
await loader.rollbackSkill('cfn-coordination', '2.0.0');
```

---

## SECTION 4: ERROR HANDLING

---

## Slide 23: Error Handling Problem

**Before Standardization:**
```typescript
// Inconsistent error handling
throw new Error('Something went wrong'); // No context!

// Mixed error types
try {
  await operation();
} catch (e) {
  // What type of error? Unknown!
  console.error(e.message); // Lost stack trace
}

// No error codes
// No structured context
// Difficult to debug
```

**Problems:**
- Generic error messages
- Lost context and stack traces
- No error categorization
- Inconsistent logging
- Poor debugging experience

---

## Slide 24: StandardError Solution

**After Standardization:**
```typescript
import { StandardError, ErrorCode } from './lib/errors';

// Structured errors with context
throw new StandardError(
  'Failed to update user profile',
  ErrorCode.DATABASE_ERROR,
  {
    userId: 123,
    operation: 'updateProfile',
    database: 'postgres',
    fields: ['email', 'name']
  },
  originalError // Preserve cause chain
);

// Type-safe error handling
try {
  await operation();
} catch (error) {
  if (error instanceof StandardError) {
    // Full context available
    logger.error(error.message, {
      code: error.code,
      context: error.context,
      stack: error.stack
    });
  }
}
```

---

## Slide 25: Error Code System

**Structured Error Codes:**
```typescript
export enum ErrorCode {
  // Database errors (1000-1999)
  DATABASE_CONNECTION_FAILED = 'DB_1001',
  DATABASE_QUERY_FAILED = 'DB_1002',
  DATABASE_TRANSACTION_FAILED = 'DB_1003',
  DATABASE_CONSTRAINT_VIOLATION = 'DB_1004',

  // Coordination errors (2000-2999)
  COORDINATION_TIMEOUT = 'COORD_2001',
  COORDINATION_VALIDATION_FAILED = 'COORD_2002',
  COORDINATION_CONNECTION_FAILED = 'COORD_2003',

  // Skill errors (3000-3999)
  SKILL_NOT_FOUND = 'SKILL_3001',
  SKILL_VALIDATION_FAILED = 'SKILL_3002',
  SKILL_DEPLOYMENT_FAILED = 'SKILL_3003',

  // Validation errors (4000-4999)
  VALIDATION_SCHEMA_FAILED = 'VAL_4001',
  VALIDATION_TYPE_MISMATCH = 'VAL_4002'
}
```

**Benefits:**
- Easy to categorize and filter
- Searchable in logs
- Documentable
- Actionable

---

## Slide 26: Error Context Best Practices

**Rich Context:**
```typescript
// ❌ BAD - No context
throw new Error('Update failed');

// ✅ GOOD - Rich context
throw new StandardError(
  'User profile update failed',
  ErrorCode.DATABASE_ERROR,
  {
    // What entity
    userId: user.id,
    userEmail: user.email,

    // What operation
    operation: 'updateProfile',
    fields: Object.keys(updates),

    // Where
    database: 'postgres',
    table: 'users',

    // When
    timestamp: new Date(),
    requestId: req.id,

    // Why
    validationErrors: errors
  },
  originalError
);
```

**Context Guidelines:**
- Include entity identifiers
- Add operation details
- Preserve original error
- Add debugging hints

---

## Slide 27: Error Recovery Patterns

**Retry with Exponential Backoff:**
```typescript
import { retry } from './lib/retry';

try {
  await retry(
    () => dbService.query('postgres', 'SELECT * FROM users'),
    {
      maxAttempts: 3,
      backoff: 'exponential', // 100ms, 200ms, 400ms
      retryableErrors: [
        ErrorCode.DATABASE_CONNECTION_FAILED,
        ErrorCode.DATABASE_TIMEOUT
      ]
    }
  );
} catch (error) {
  // All retries exhausted
  logger.error('Operation failed after retries', { error });
  throw error;
}
```

**Circuit Breaker:**
```typescript
import { CircuitBreaker } from './lib/circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000
});

await breaker.execute(async () => {
  return await externalApiCall();
});
```

---

## SECTION 5: TESTING PATTERNS

---

## Slide 28: Testing Requirements

**Coverage Targets:**
- Unit tests: 85%+ coverage
- Integration tests: All critical paths
- E2E tests: Core user workflows
- Performance tests: SLA validation

**Test Structure:**
```
tests/
├── unit/              # Fast, isolated tests
│   ├── services/
│   ├── lib/
│   └── utils/
├── integration/       # Cross-component tests
│   ├── database-handoffs.test.ts
│   ├── coordination-protocols.test.ts
│   └── skill-lifecycle.test.ts
└── e2e/               # Full workflow tests
    ├── cfn-loop-workflow.test.ts
    └── agent-spawning.test.ts
```

---

## Slide 29: Integration Test Pattern

**Example:**
```typescript
// tests/integration/database-integration.test.ts
import { DatabaseService } from '../../src/services/database-service';
import { StandardError } from '../../src/lib/errors';

describe('Database Integration', () => {
  let dbService: DatabaseService;

  beforeEach(async () => {
    dbService = new DatabaseService({
      sqlite: { path: ':memory:' },
      postgres: { host: 'localhost', database: 'test_db' }
    });
    await dbService.migrate();
  });

  afterEach(async () => {
    await dbService.close();
  });

  test('cross-database transaction', async () => {
    await dbService.transaction('postgres', async (pgDb) => {
      await pgDb.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);

      const users = await dbService.query('sqlite',
        'SELECT * FROM audit_log WHERE action = ?',
        ['user_created']
      );

      expect(users).toHaveLength(1);
    });
  });

  test('handles connection failures gracefully', async () => {
    await expect(
      dbService.query('invalid_db', 'SELECT 1')
    ).rejects.toThrow(StandardError);
  });
});
```

---

## Slide 30: Mock Standardization

**Pattern:**
```typescript
// tests/mocks/database-service.mock.ts
export class MockDatabaseService implements DatabaseService {
  private queries: Map<string, any[]> = new Map();

  async query<T>(database: string, sql: string, params?: any[]): Promise<T[]> {
    const key = `${database}:${sql}`;
    return this.queries.get(key) || [];
  }

  async transaction<T>(database: string, callback: Function): Promise<T> {
    return await callback(this);
  }

  mockQuery(database: string, sql: string, result: any[]): void {
    this.queries.set(`${database}:${sql}`, result);
  }
}

// Usage in tests
const mockDb = new MockDatabaseService();
mockDb.mockQuery('sqlite', 'SELECT * FROM users', [
  { id: 1, name: 'Alice' }
]);

const users = await mockDb.query('sqlite', 'SELECT * FROM users');
expect(users).toHaveLength(1);
```

---

## Slide 31: Performance Testing

**Pattern:**
```typescript
// tests/performance/database-performance.test.ts
import { measurePerformance } from '../utils/performance';

describe('Database Performance', () => {
  test('queries complete within SLA', async () => {
    const metrics = await measurePerformance(async () => {
      await dbService.query('postgres', 'SELECT * FROM users LIMIT 100');
    });

    expect(metrics.duration).toBeLessThan(100); // 100ms SLA
    expect(metrics.memory).toBeLessThan(50 * 1024 * 1024); // 50MB
  });

  test('handles concurrent operations', async () => {
    const operations = Array.from({ length: 100 }, () =>
      dbService.query('sqlite', 'SELECT 1')
    );

    const start = Date.now();
    await Promise.all(operations);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000); // 1s for 100 ops
  });
});
```

---

## SECTION 6: CODE REVIEW & LINTING

---

## Slide 32: Code Review Checklist

**Database Operations:**
- [ ] Uses DatabaseService (no direct sqlite3/pg imports)
- [ ] Transactions for multi-step operations
- [ ] StandardError with proper error codes
- [ ] Connection cleanup in finally blocks
- [ ] Query parameterization (no SQL injection)

**Coordination:**
- [ ] Schema validation on all messages
- [ ] Proper lifecycle management
- [ ] Timeout handling
- [ ] Error recovery implemented

**Testing:**
- [ ] Unit tests ≥85% coverage
- [ ] Integration tests for critical paths
- [ ] Mocks follow standard patterns
- [ ] Performance tests for SLA validation

---

## Slide 33: Linting Enforcement

**ESLint Rules:**
```javascript
// .eslintrc.integration.js
module.exports = {
  rules: {
    // Enforce StandardError usage
    'no-throw-literal': 'error',
    'prefer-standarderror': 'error',

    // Require schema validation
    'require-schema-validation': 'warn',

    // Enforce error codes
    'standarderror-require-code': 'error',

    // Require JSDoc on public APIs
    'require-jsdoc': ['error', {
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true
      }
    }]
  }
};
```

**CI/CD Integration:**
- Linting runs on every PR
- Blocks merge if errors found
- Warns on style violations

---

## Slide 34: Common Pitfalls

**❌ Forgetting to close connections:**
```typescript
// BAD
const db = new DatabaseService();
await db.query('sqlite', 'SELECT 1');
// Connection leak!

// GOOD
const db = new DatabaseService();
try {
  await db.query('sqlite', 'SELECT 1');
} finally {
  await db.close();
}
```

**❌ Generic errors:**
```typescript
// BAD
throw new Error('Update failed');

// GOOD
throw new StandardError(
  'User update failed',
  ErrorCode.DATABASE_ERROR,
  { userId, fields }
);
```

**❌ Missing schema validation:**
```typescript
// BAD
await redis.publish('channel', JSON.stringify(data));

// GOOD
await coord.publish('channel', data, MessageSchema);
```

---

## SECTION 7: MIGRATION GUIDE

---

## Slide 35: Migration Strategy

**Phase 1: Assessment (Week 1)**
- Run migration script to identify non-compliant code
- Generate migration checklist
- Prioritize high-traffic code paths

**Phase 2: Core Services (Week 2-3)**
- Migrate database operations to DatabaseService
- Update error handling to StandardError
- Add integration tests

**Phase 3: Agent System (Week 4)**
- Migrate coordination to Redis patterns
- Update skill deployment to SkillLoader
- Validate agent lifecycle

**Phase 4: Validation (Week 5)**
- Run full test suite
- Validate 90%+ compliance
- Performance regression testing

---

## Slide 36: Migration Tooling

**Automated Migration:**
```bash
# Scan codebase for violations
npm run migrate:scan

# Output:
# Found 47 violations:
#   - 23 direct database imports
#   - 15 generic Error throws
#   - 9 missing schema validation

# Auto-fix simple violations
npm run migrate:fix

# Fixed 32 violations automatically
# Manual review required for 15 violations

# Generate migration checklist
npm run migrate:checklist > MIGRATION_CHECKLIST.md
```

**Manual Review Required:**
- Complex error handling logic
- Database transaction boundaries
- Schema design decisions

---

## Slide 37: Migration Checklist Example

```markdown
## Database Integration Migration

- [ ] src/services/user-service.ts
  - [ ] Replace sqlite3 import with DatabaseService
  - [ ] Wrap multi-step operations in transactions
  - [ ] Add error handling with StandardError
  - [ ] Add integration tests

- [ ] src/services/agent-service.ts
  - [ ] Replace ioredis import with RedisCoordination
  - [ ] Add schema validation for messages
  - [ ] Update lifecycle management
  - [ ] Add coordination tests

- [ ] src/skills/custom-skill.ts
  - [ ] Replace fs import with SkillLoader
  - [ ] Add content validation
  - [ ] Implement versioning
  - [ ] Add deployment tests
```

---

## SECTION 8: PROJECT TEMPLATES

---

## Slide 38: Integration Starter Template

**Directory Structure:**
```
integration-starter/
├── src/
│   ├── services/          # Service layer
│   │   ├── database-service.ts
│   │   ├── redis-coordination.ts
│   │   └── skill-loader.ts
│   ├── lib/               # Shared libraries
│   │   ├── errors.ts
│   │   ├── validation.ts
│   │   └── retry.ts
│   └── index.ts           # Entry point
├── tests/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── docs/
│   └── README.md          # Documentation
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── .eslintrc.js           # Linting
└── .gitignore             # Git ignore
```

---

## Slide 39: Template Usage

**Create New Integration:**
```bash
# Copy template
cp -r templates/integration-starter my-new-integration

cd my-new-integration

# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env with your settings

# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

**Pre-configured:**
- TypeScript with strict mode
- ESLint with integration rules
- Jest with coverage reporting
- Pre-commit hooks for linting

---

## SECTION 9: BEST PRACTICES

---

## Slide 40: General Best Practices

**1. Single Responsibility:**
- Each service handles one concern
- Clear boundaries between layers
- No direct infrastructure access from business logic

**2. Fail Fast:**
- Validate inputs at boundaries
- Use schema validation
- Throw errors early with context

**3. Observability:**
- Structured logging
- Error tracking with context
- Performance metrics
- Health checks

**4. Testing:**
- Test pyramid: lots of unit, some integration, few E2E
- Test failure scenarios
- Mock external dependencies
- Validate performance

---

## Slide 41: Performance Best Practices

**Connection Pooling:**
```typescript
// Configure pools appropriately
const dbService = new DatabaseService({
  postgres: {
    host: 'localhost',
    database: 'cfn',
    poolSize: 20,        // Adjust based on load
    idleTimeout: 30000   // 30s
  }
});
```

**Caching:**
```typescript
import { CacheService } from './services/cache-service';

const cache = new CacheService();

// Cache expensive queries
const getUser = async (id: number) => {
  const cached = await cache.get(`user:${id}`);
  if (cached) return cached;

  const user = await dbService.query('postgres',
    'SELECT * FROM users WHERE id = $1',
    [id]
  );

  await cache.set(`user:${id}`, user, 300); // 5min TTL
  return user;
};
```

---

## Slide 42: Security Best Practices

**Input Validation:**
```typescript
import { validateInput } from './lib/validation';

// Always validate external input
export async function updateUser(userId: number, data: any) {
  const validated = validateInput(data, UserUpdateSchema);

  return await dbService.query('postgres',
    'UPDATE users SET name = $1, email = $2 WHERE id = $3',
    [validated.name, validated.email, userId]
  );
}
```

**Error Messages:**
```typescript
// ❌ BAD - Exposes internal details
throw new Error(`Database query failed: ${sql}`);

// ✅ GOOD - Generic message, log details
logger.error('Query failed', { sql, params });
throw new StandardError(
  'Failed to update user',
  ErrorCode.DATABASE_ERROR,
  { userId } // Safe context only
);
```

---

## Slide 43: Documentation Standards

**Code Documentation:**
```typescript
/**
 * Updates user profile information.
 *
 * @param userId - The unique identifier of the user
 * @param updates - Partial user data to update
 * @returns The updated user object
 * @throws {StandardError} If update fails or user not found
 *
 * @example
 * ```typescript
 * const user = await updateUserProfile(123, {
 *   name: 'Alice',
 *   email: 'alice@example.com'
 * });
 * ```
 */
export async function updateUserProfile(
  userId: number,
  updates: Partial<User>
): Promise<User> {
  // Implementation
}
```

**Integration Documentation:**
- Purpose and scope
- API reference
- Usage examples
- Error codes
- Performance characteristics

---

## SECTION 10: ADOPTION & SUPPORT

---

## Slide 44: Rollout Timeline

**Week 1: Training & Preparation**
- Team training sessions
- Review documentation
- Set up development environment
- Run migration assessment

**Week 2-3: Core Services Migration**
- Database integration
- Error handling
- Initial testing

**Week 4: Agent System Migration**
- Coordination protocols
- Skill lifecycle
- Agent testing

**Week 5: Validation & Stabilization**
- Full integration testing
- Performance validation
- Bug fixes
- Documentation updates

**Week 6: Monitoring & Optimization**
- Monitor production metrics
- Optimize performance
- Gather team feedback
- Continuous improvement

---

## Slide 45: Team Responsibilities

**Developers:**
- Follow new patterns in all new code
- Migrate assigned legacy code
- Write tests for all changes
- Participate in code reviews

**Tech Leads:**
- Review migration progress
- Approve architectural decisions
- Resolve technical blockers
- Monitor compliance metrics

**QA Team:**
- Validate integration tests
- Perform regression testing
- Monitor error rates
- Report issues

**DevOps:**
- Update CI/CD pipelines
- Monitor performance metrics
- Manage infrastructure
- Support deployment

---

## Slide 46: Support Channels

**Documentation:**
- Integration Standardization Overview
- API Reference Docs
- Migration Guide
- FAQ

**Slack Channels:**
- #integration-standards (questions)
- #integration-migration (migration help)
- #integration-incidents (issues)

**Office Hours:**
- Tuesday/Thursday 2-3 PM
- Drop-in questions
- Pair programming help

**Issue Tracking:**
- GitHub Issues for bugs
- Migration checklist in project board

---

## Slide 47: Success Metrics

**Compliance Metrics:**
- 90%+ database operations use DatabaseService
- 90%+ errors use StandardError
- 85%+ test coverage
- 100% new code follows standards

**Quality Metrics:**
- 40% reduction in integration bugs
- 60% faster debugging
- 75% reduction in error-related incidents

**Team Metrics:**
- Onboarding time reduced by 60%
- Code review time reduced by 40%
- Developer satisfaction score ≥8/10

**Monitoring:**
- Weekly compliance reports
- Monthly quality metrics
- Quarterly team surveys

---

## SECTION 11: Q&A

---

## Slide 48: Common Questions

**Q: Do I need to migrate all code immediately?**
A: No. Prioritize high-traffic paths first. Use migration script to identify priorities. Target 90% compliance within 5 weeks.

**Q: What if I need a feature not in DatabaseService?**
A: Submit a feature request. Use standard patterns for now. We review requests weekly.

**Q: How do I handle errors from third-party libraries?**
A: Wrap them in StandardError at your integration boundary:
```typescript
try {
  await thirdPartyLib.operation();
} catch (error) {
  throw new StandardError(
    'Third-party operation failed',
    ErrorCode.EXTERNAL_ERROR,
    { operation: 'xyz' },
    error
  );
}
```

---

## Slide 49: More Questions

**Q: Can I use direct database access for performance-critical code?**
A: DatabaseService is optimized for performance. If you have specific concerns, let's profile together. Document any exceptions.

**Q: How do I test coordination protocols locally?**
A: Use MockRedisCoordination in tests. Integration tests use real Redis in Docker.

**Q: What about existing error handling in production?**
A: Migrate incrementally. Both old and new patterns work during transition. Monitor error logs for issues.

**Q: How often do schemas change?**
A: Rarely. When they do, we provide migration guides and backward compatibility when possible.

---

## Slide 50: Next Steps

**Immediate Actions:**
1. Review this presentation
2. Complete hands-on exercises (CODE_EXAMPLES/)
3. Run migration assessment on your codebase
4. Schedule 1:1 migration planning with tech lead

**This Week:**
- [ ] Set up development environment with new templates
- [ ] Review code review guidelines
- [ ] Start migrating one service
- [ ] Write integration tests for migrated code

**Resources:**
- Documentation: `/docs/INTEGRATION_STANDARDIZATION_OVERVIEW.md`
- Examples: `/training/CODE_EXAMPLES/`
- Templates: `/templates/integration-starter/`
- Support: #integration-standards on Slack

**Thank you! Questions?**

---

# Training Complete

For hands-on practice, proceed to:
- `training/CODE_EXAMPLES/database-integration-example/`
- `training/CODE_EXAMPLES/coordination-example/`
- `training/CODE_EXAMPLES/skill-deployment-example/`
- `training/CODE_EXAMPLES/testing-example/`

Each example includes a README with step-by-step instructions.
