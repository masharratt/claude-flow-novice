# Code Review Guidelines
## Integration Pattern Standards

---

## Purpose

These guidelines ensure all code follows standardized integration patterns for database operations, coordination protocols, skill lifecycle, error handling, and testing.

**Target:** 90%+ compliance across codebase
**Enforcement:** Automated linting + manual review
**Review Time:** Target 40% reduction through automation

---

## Pre-Review Checklist

Before submitting a PR, ensure:

- [ ] Code follows integration patterns
- [ ] Tests pass locally (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Coverage meets threshold (≥85%)
- [ ] Documentation updated
- [ ] No console.log() or debugging code
- [ ] No hardcoded credentials or secrets

---

## Integration Pattern Checklist

### Database Operations

**Required Standards:**
- [ ] Uses `DatabaseService` abstraction (no direct `sqlite3` or `pg` imports in business logic)
- [ ] Transactions used for multi-step operations
- [ ] All queries use parameterized inputs (prevent SQL injection)
- [ ] Proper error handling with `StandardError`
- [ ] Connection cleanup in finally blocks
- [ ] Health checks implemented for new services
- [ ] Connection pooling configured appropriately

**Example - GOOD:**
```typescript
import { DatabaseService } from './services/database-service';
import { StandardError, ErrorCode } from './lib/errors';

const db = new DatabaseService({
  postgres: { host: 'localhost', database: 'cfn' }
});

try {
  await db.transaction('postgres', async (pgDb) => {
    await pgDb.query(
      'INSERT INTO users (name, email) VALUES ($1, $2)',
      [name, email]
    );
    await pgDb.query(
      'INSERT INTO audit_log (action) VALUES ($1)',
      ['user_created']
    );
  });
} catch (error) {
  throw new StandardError(
    'User creation failed',
    ErrorCode.DATABASE_ERROR,
    { name, email },
    error
  );
} finally {
  await db.close();
}
```

**Example - BAD:**
```typescript
import pg from 'pg'; // ❌ Direct import

const client = new pg.Client({ /* config */ });
await client.connect();

// ❌ No transaction
await client.query('INSERT INTO users (name) VALUES ($1)', [name]);
await client.query('INSERT INTO audit_log...');

// ❌ Generic error
try {
  await client.query(sql);
} catch (e) {
  console.error(e); // ❌ Lost context
}
```

**Common Issues:**
- Missing transaction boundaries for multi-step operations
- Direct database client imports
- Generic Error instead of StandardError
- Missing connection cleanup
- SQL injection vulnerabilities (string concatenation)

**Questions to Ask:**
1. Are all multi-step operations in transactions?
2. Is error context comprehensive enough for debugging?
3. Are connections properly cleaned up?
4. Is connection pooling configured correctly?
5. Are there any SQL injection risks?

---

### Error Handling

**Required Standards:**
- [ ] All errors use `StandardError` (not generic `Error`)
- [ ] Proper error codes assigned from `ErrorCode` enum
- [ ] Rich context included (entity IDs, operation details)
- [ ] Original error preserved in cause chain
- [ ] No sensitive data in error messages
- [ ] Errors logged with appropriate severity
- [ ] Error recovery implemented where appropriate

**Example - GOOD:**
```typescript
throw new StandardError(
  'User profile update failed',
  ErrorCode.DATABASE_ERROR,
  {
    userId: user.id,
    operation: 'updateProfile',
    fields: Object.keys(updates),
    database: 'postgres'
  },
  originalError
);
```

**Example - BAD:**
```typescript
throw new Error('Update failed'); // ❌ No context, no error code
```

**Error Code Categories:**
- `DB_1xxx` - Database errors
- `COORD_2xxx` - Coordination errors
- `SKILL_3xxx` - Skill lifecycle errors
- `VAL_4xxx` - Validation errors

**Questions to Ask:**
1. Is `StandardError` used consistently?
2. Is the error code appropriate for the failure type?
3. Is context sufficient for debugging?
4. Is the original error preserved?
5. Are sensitive details excluded from error messages?

---

### Coordination Protocols

**Required Standards:**
- [ ] Uses `RedisCoordination` service (no direct `ioredis` imports)
- [ ] All messages validated against schemas
- [ ] Proper timeout handling
- [ ] Agent lifecycle properly managed
- [ ] Signals and keys use consistent naming
- [ ] Error recovery implemented
- [ ] Connection cleanup in finally blocks

**Example - GOOD:**
```typescript
import { RedisCoordination } from './services/redis-coordination';
import { AgentCompletionSchema } from './schemas/agent-schema';

const coord = new RedisCoordination({ host: 'localhost', port: 6379 });

try {
  await coord.publish('agent-complete', {
    taskId: 'task-123',
    agentId: 'agent-456',
    confidence: 0.92,
    iteration: 1,
    result: { deliverables: [], status: 'complete' }
  }, AgentCompletionSchema);

  const signal = await coord.wait(
    'swarm:task-123:agent-456:done',
    30000
  );

  if (!signal) {
    throw new StandardError(
      'Agent timeout',
      ErrorCode.COORDINATION_TIMEOUT,
      { agentId: 'agent-456', timeout: 30000 }
    );
  }
} finally {
  await coord.close();
}
```

**Example - BAD:**
```typescript
import Redis from 'ioredis'; // ❌ Direct import

const redis = new Redis();

// ❌ No schema validation
await redis.publish('channel', JSON.stringify({ data: 'test' }));

// ❌ No timeout
await redis.blpop('key', 0);
```

**Questions to Ask:**
1. Are all messages schema-validated?
2. Are timeouts set appropriately?
3. Is agent lifecycle tracked properly?
4. Are Redis keys named consistently?
5. Is error recovery implemented?

---

### Skill Lifecycle

**Required Standards:**
- [ ] Uses `SkillLoader` service (no direct `fs` operations for skills)
- [ ] Content validated before deployment
- [ ] Semantic versioning followed
- [ ] Metadata includes author, dependencies, changelog
- [ ] Deployment history maintained
- [ ] Rollback capability tested
- [ ] Integration tests cover deployment

**Example - GOOD:**
```typescript
import { SkillLoader } from './services/skill-loader';

const loader = new SkillLoader({ skillsPath: './.claude/skills' });

await loader.deploySkill({
  name: 'cfn-custom-skill',
  content: skillMarkdown,
  version: '1.2.0',
  metadata: {
    author: 'team@company.com',
    dependencies: ['cfn-coordination'],
    changelog: 'Added timeout parameter'
  }
});
```

**Example - BAD:**
```typescript
import fs from 'fs'; // ❌ Direct fs operations

// ❌ No validation
fs.writeFileSync('.claude/skills/my-skill/SKILL.md', content);
```

**Questions to Ask:**
1. Is content validated before deployment?
2. Does version follow semver?
3. Is metadata comprehensive?
4. Can the skill be rolled back?
5. Are dependencies declared?

---

### Testing

**Required Standards:**
- [ ] Unit tests for all new functions/methods
- [ ] Integration tests for cross-component workflows
- [ ] Test coverage ≥85% for modified files
- [ ] Mocks follow standard patterns
- [ ] Performance tests for SLA-critical paths
- [ ] Error scenarios tested
- [ ] Concurrent operations tested where applicable

**Test Structure:**
```
tests/
├── unit/                    # Fast, isolated tests
│   ├── services/
│   ├── lib/
│   └── utils/
├── integration/             # Cross-component tests
│   ├── database-handoffs.test.ts
│   ├── coordination-protocols.test.ts
│   └── skill-lifecycle.test.ts
└── performance/             # SLA validation
    └── database-performance.test.ts
```

**Example - GOOD:**
```typescript
describe('UserService', () => {
  let dbService: DatabaseService;

  beforeEach(async () => {
    dbService = new DatabaseService({
      sqlite: { path: ':memory:' }
    });
    await dbService.initialize();
  });

  afterEach(async () => {
    await dbService.close();
  });

  test('creates user with audit log', async () => {
    const user = await userService.create({
      name: 'Alice',
      email: 'alice@example.com'
    });

    expect(user.id).toBeDefined();

    const auditLog = await dbService.query('sqlite',
      'SELECT * FROM audit_log WHERE user_id = ?',
      [user.id]
    );

    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].action).toBe('user_created');
  });

  test('handles duplicate email error', async () => {
    await userService.create({
      name: 'Alice',
      email: 'alice@example.com'
    });

    await expect(
      userService.create({
        name: 'Bob',
        email: 'alice@example.com' // Duplicate
      })
    ).rejects.toThrow(StandardError);
  });
});
```

**Coverage Requirements:**
- New files: ≥85%
- Modified files: ≥85%
- Critical paths: 100%
- Error scenarios: All major paths

**Questions to Ask:**
1. Are both happy path and error scenarios tested?
2. Is coverage above threshold?
3. Are integration tests included for cross-component changes?
4. Are mocks appropriate and not over-used?
5. Are concurrent operations tested where relevant?

---

### Performance

**Required Standards:**
- [ ] SLAs documented for new endpoints/operations
- [ ] Performance tests included for SLA-critical code
- [ ] Caching implemented where appropriate
- [ ] Database queries optimized (proper indexes, query plans)
- [ ] Connection pooling configured correctly
- [ ] No N+1 query patterns

**SLA Targets:**
- Database queries: <100ms (simple), <500ms (complex)
- API endpoints: <200ms (p95)
- Coordination operations: <50ms (publish), <1s (wait with timeout)

**Example - GOOD:**
```typescript
// Performance test
test('user query completes within SLA', async () => {
  const metrics = await measurePerformance(async () => {
    await userService.getUser(123);
  });

  expect(metrics.duration).toBeLessThan(100); // 100ms SLA
});

// Caching
const cache = new CacheService();
const getUser = async (id: number) => {
  const cached = await cache.get(`user:${id}`);
  if (cached) return cached;

  const user = await dbService.query('postgres',
    'SELECT * FROM users WHERE id = $1',
    [id]
  );

  await cache.set(`user:${id}`, user, 300);
  return user;
};
```

**Example - BAD:**
```typescript
// ❌ N+1 query pattern
for (const userId of userIds) {
  const user = await dbService.query('postgres',
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  users.push(user);
}

// ✅ GOOD - Single query
const users = await dbService.query('postgres',
  'SELECT * FROM users WHERE id = ANY($1)',
  [userIds]
);
```

**Questions to Ask:**
1. Are SLAs documented?
2. Are performance tests included?
3. Is caching used appropriately?
4. Are there any N+1 query patterns?
5. Are database indexes in place?

---

### Documentation

**Required Standards:**
- [ ] Public APIs have JSDoc comments
- [ ] Complex logic has inline comments
- [ ] Integration points documented
- [ ] Error codes documented
- [ ] Examples provided for new features
- [ ] Migration guide for breaking changes
- [ ] README updated if applicable

**Example - GOOD:**
```typescript
/**
 * Updates user profile information.
 *
 * @param userId - The unique identifier of the user
 * @param updates - Partial user data to update
 * @returns The updated user object
 * @throws {StandardError} DB_1002 if update fails
 * @throws {StandardError} DB_1004 if email already exists
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

**Questions to Ask:**
1. Are public APIs documented?
2. Are error codes listed?
3. Are examples provided?
4. Is complex logic explained?
5. Are integration points clear?

---

### Security

**Required Standards:**
- [ ] No hardcoded credentials or API keys
- [ ] Input validation at boundaries
- [ ] No sensitive data in logs or error messages
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized output)
- [ ] Authentication/authorization checks
- [ ] No eval() or similar dynamic code execution

**Example - GOOD:**
```typescript
import { validateInput } from './lib/validation';

export async function updateUser(userId: number, data: any) {
  // Validate input
  const validated = validateInput(data, UserUpdateSchema);

  // Parameterized query
  return await dbService.query('postgres',
    'UPDATE users SET name = $1, email = $2 WHERE id = $3',
    [validated.name, validated.email, userId]
  );
}
```

**Example - BAD:**
```typescript
// ❌ SQL injection risk
const sql = `UPDATE users SET name = '${name}' WHERE id = ${userId}`;

// ❌ No input validation
await dbService.query('postgres', sql);

// ❌ Sensitive data in error
throw new Error(`Failed to update user: password=${password}`);
```

**Questions to Ask:**
1. Is input validated?
2. Are queries parameterized?
3. Are credentials excluded from logs?
4. Is authentication/authorization present?
5. Are there any eval() calls?

---

## Review Process

### 1. Automated Checks (CI/CD)

**Must pass before review:**
- ESLint (integration rules)
- Tests (unit + integration)
- Coverage (≥85%)
- Type checking (TypeScript)
- Security scan (no secrets)

### 2. Manual Review

**Focus areas:**
1. **Architecture** - Does it follow standardized patterns?
2. **Error handling** - Comprehensive with proper error codes?
3. **Testing** - Adequate coverage and quality?
4. **Performance** - Meets SLAs?
5. **Security** - No vulnerabilities?
6. **Documentation** - Clear and complete?

### 3. Review Checklist

Use this checklist for every PR:

- [ ] Database operations use DatabaseService
- [ ] Errors use StandardError with proper codes
- [ ] Coordination uses RedisCoordination with schemas
- [ ] Skills use SkillLoader
- [ ] Tests cover happy path and error scenarios
- [ ] Coverage ≥85%
- [ ] Performance meets SLAs
- [ ] Documentation complete
- [ ] No security vulnerabilities
- [ ] No hardcoded secrets

### 4. Reviewer Responsibilities

**Required actions:**
1. Run code locally if possible
2. Verify tests pass
3. Check coverage report
4. Review error handling patterns
5. Validate documentation
6. Leave constructive feedback
7. Approve only when all standards met

**Approval criteria:**
- All automated checks pass
- All checklist items satisfied
- No unresolved questions
- Code follows team standards

---

## Common Patterns

### Good Examples Repository

See `training/CODE_EXAMPLES/` for complete working examples:
- Database integration
- Coordination protocols
- Skill deployment
- Integration testing

### Anti-Patterns to Avoid

**1. Direct Infrastructure Access**
```typescript
// ❌ BAD
import sqlite3 from 'sqlite3';
import Redis from 'ioredis';
import fs from 'fs';

// ✅ GOOD
import { DatabaseService } from './services/database-service';
import { RedisCoordination } from './services/redis-coordination';
import { SkillLoader } from './services/skill-loader';
```

**2. Generic Errors**
```typescript
// ❌ BAD
throw new Error('Something went wrong');

// ✅ GOOD
throw new StandardError(
  'User update failed',
  ErrorCode.DATABASE_ERROR,
  { userId, operation: 'update' }
);
```

**3. Missing Tests**
```typescript
// ❌ BAD
// No tests for new function

// ✅ GOOD
describe('newFunction', () => {
  test('handles happy path', async () => { /* ... */ });
  test('handles error case', async () => { /* ... */ });
  test('validates input', async () => { /* ... */ });
});
```

---

## Escalation

### When to Escalate

- Architecture changes affecting multiple services
- New integration patterns not covered here
- Security concerns
- Performance regressions
- Breaking changes

### Who to Contact

- **Architecture questions:** Tech lead or architect
- **Security concerns:** Security team
- **Performance issues:** DevOps team
- **Pattern clarifications:** #integration-standards Slack channel

---

## Continuous Improvement

### Feedback Loop

- Weekly review of common issues
- Monthly pattern updates
- Quarterly guideline review
- Team retrospectives

### Metrics

Track and improve:
- Time to review (target: <2 hours)
- Approval rate (target: >80% first time)
- Bug rate post-merge (target: <5%)
- Pattern compliance (target: >90%)

---

## Resources

- **Documentation:** `/docs/INTEGRATION_STANDARDIZATION_OVERVIEW.md`
- **Examples:** `/training/CODE_EXAMPLES/`
- **Templates:** `/templates/integration-starter/`
- **Support:** #integration-standards on Slack

---

## Version History

- **1.0.0** (2025-11-16): Initial release
- Standards based on Integration Standardization Sprint 6
- Covers database, coordination, skills, errors, testing

**Last Updated:** 2025-11-16
**Maintained By:** Platform Team
