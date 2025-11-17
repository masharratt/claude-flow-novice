# Refactoring Action Plan - P0 Test Suite
**Step-by-Step Implementation Guide for Code Quality Improvements**

---

## Overview

This document provides **specific, implementable refactoring steps** to improve the P0 test suite from **0.88/1.0 to 0.93/1.0** score.

**Total Implementation Time:** 9 hours
**Breaking Down Into:** 5 concrete refactoring tasks
**Complexity:** Low-Medium (all changes are mechanical)
**Risk Level:** Low (no behavioral changes)

---

## Prerequisite Checklist

Before starting refactoring:

- [ ] Current test suite passes 100% (214/214 tests passing)
- [ ] No uncommitted changes in test files
- [ ] Backup created or branch protection enabled
- [ ] Development environment fully configured
- [ ] Terminal access to project root available

---

## Refactoring #1: Extract Mock Redis Factory
**Priority:** P1 (Highest Impact)
**Time Estimate:** 100 minutes
**Complexity:** Low

### Step 1.1: Create Utility File Structure

```bash
mkdir -p /mnt/c/Users/masha/Documents/claude-flow-novice/tests/test-utils
touch /mnt/c/Users/masha/Documents/claude-flow-novice/tests/test-utils/mock-redis-client.ts
```

### Step 1.2: Create Mock Redis Factory

**File:** `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/test-utils/mock-redis-client.ts`

```typescript
import { jest } from '@jest/globals';

/**
 * Redis Client Mock Interface
 * Represents the Redis client methods used in CFN Loop orchestration
 */
export interface RedisClientMock {
  get: jest.Mock;
  set: jest.Mock;
  lpush: jest.Mock;
  blpop: jest.Mock;
  smembers: jest.Mock;
  sadd: jest.Mock;
  del: jest.Mock;
  eval: jest.Mock;
  quit: jest.Mock;
}

/**
 * Creates a basic Redis client mock with all methods stubbed
 * @param overrides - Optional overrides for specific mock methods
 * @returns Mock Redis client ready for testing
 */
export const createMockRedis = (
  overrides?: Partial<RedisClientMock>
): RedisClientMock => ({
  get: jest.fn(),
  set: jest.fn(),
  lpush: jest.fn(),
  blpop: jest.fn(),
  smembers: jest.fn(),
  sadd: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
  quit: jest.fn(),
  ...overrides,
});

/**
 * Creates a Redis mock with predefined response behavior
 * Useful for testing different scenarios without per-test setup
 *
 * @param behavior - 'success' | 'timeout' | 'error'
 * @returns Configured mock Redis client
 *
 * @example
 * // For timeout scenario tests
 * const mockRedis = createMockRedisWithBehavior('timeout');
 * const result = await mockRedis.blpop('key', 5);
 * expect(result).toBeNull(); // timeout returns null
 */
export const createMockRedisWithBehavior = (
  behavior: 'success' | 'timeout' | 'error'
): RedisClientMock => {
  const base = createMockRedis();

  switch (behavior) {
    case 'success':
      // Standard success responses
      base.get.mockResolvedValue(JSON.stringify({ status: 'ok' }));
      base.set.mockResolvedValue('OK');
      base.lpush.mockResolvedValue(1);
      base.blpop.mockResolvedValue(['key', JSON.stringify({ data: 'test' })]);
      base.smembers.mockResolvedValue(['item1', 'item2']);
      base.sadd.mockResolvedValue(1);
      base.del.mockResolvedValue(1);
      base.eval.mockResolvedValue('OK');
      base.quit.mockResolvedValue('OK');
      break;

    case 'timeout':
      // Timeout scenario - BLPOP returns null after timeout
      base.get.mockResolvedValue(null);
      base.set.mockResolvedValue('OK');
      base.lpush.mockResolvedValue(0);
      base.blpop.mockResolvedValue(null); // Timeout returns null
      base.smembers.mockResolvedValue([]);
      base.sadd.mockResolvedValue(0);
      base.del.mockResolvedValue(0);
      break;

    case 'error':
      // Error scenario - all operations fail
      const error = new Error('Redis connection lost');
      base.get.mockRejectedValue(error);
      base.set.mockRejectedValue(error);
      base.lpush.mockRejectedValue(error);
      base.blpop.mockRejectedValue(error);
      base.smembers.mockRejectedValue(error);
      base.sadd.mockRejectedValue(error);
      base.del.mockRejectedValue(error);
      base.eval.mockRejectedValue(error);
      break;
  }

  return base;
};

/**
 * Creates a Redis mock with partial success
 * Useful for testing recovery scenarios
 *
 * @param failingMethods - Array of method names that should fail
 * @returns Mock Redis client with specified failures
 *
 * @example
 * const mockRedis = createMockRedisPartialFailure(['get', 'set']);
 * // get() and set() will fail, other methods succeed
 */
export const createMockRedisPartialFailure = (
  failingMethods: Array<keyof RedisClientMock>
): RedisClientMock => {
  const base = createMockRedisWithBehavior('success');
  const error = new Error('Method failed');

  failingMethods.forEach((method) => {
    base[method].mockRejectedValue(error);
  });

  return base;
};
```

### Step 1.3: Update cfn-loop-orchestration.test.ts

**File:** `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/cfn-loop-orchestration.test.ts`

Find these lines (around line 85-99):
```typescript
mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  lpush: jest.fn(),
  blpop: jest.fn(),
  smembers: jest.fn(),
  sadd: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
  quit: jest.fn(),
};
```

Replace with:
```typescript
import { createMockRedis, createMockRedisWithBehavior } from './test-utils/mock-redis-client';

// In beforeEach:
mockRedis = createMockRedis();
```

For tests that need specific behavior:
```typescript
test('times out agents that do not complete within timeout', async () => {
  mockRedis = createMockRedisWithBehavior('timeout');
  // ... rest of test
});

test('handles Redis connection failure gracefully', async () => {
  mockRedis = createMockRedisWithBehavior('error');
  // ... rest of test
});
```

### Step 1.4: Verify Implementation

```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice
npm test -- tests/cfn-loop-orchestration.test.ts
```

**Expected Result:** All 62 tests pass
**Check:** No TypeScript errors in mock-redis-client.ts

### Step 1.5: Update Remaining Test Files

Apply same pattern to:
- `tests/coordination/redis-coordination.test.ts` (40 tests)
- Any other Redis-using tests

**Time for Step 1:** 100 minutes
**Quality Improvement:** -0.04 (reduced brittleness)

---

## Refactoring #2: Create Test Constants File
**Priority:** P1 (High Impact)
**Time Estimate:** 105 minutes
**Complexity:** Low

### Step 2.1: Create Constants File

**File:** `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/test-constants.ts`

```typescript
/**
 * Test Configuration Constants
 *
 * These values align with the CFN Loop v3.0 orchestration thresholds
 * defined in src/cli/orchestrate.ts and documented in CLAUDE_FLOW_PARAMETERS.md
 *
 * Changes to these values require coordination with orchestration layer
 */

/**
 * Orchestration Thresholds by Mode
 *
 * GATE_THRESHOLD: Minimum test pass rate for Loop 3 gate check
 * - Gate passes → Loop 2 spawns (validators review)
 * - Gate fails → Loop 3 iterates
 *
 * CONSENSUS_THRESHOLD: Minimum validator consensus score for Loop 2
 * - Consensus passes → Product Owner decides
 * - Consensus fails → Loop iteration
 *
 * MAX_ITERATIONS: Maximum loop iterations before abort
 * - Prevents infinite loops
 * - Must be <= orchestration max iterations
 *
 * Reference: .claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md
 */
export const ORCHESTRATION_THRESHOLDS = {
  // MVP Mode: Fast iteration, lower barriers
  GATE_THRESHOLD_MVP: 0.70,
  CONSENSUS_THRESHOLD_MVP: 0.80,
  MAX_ITERATIONS_MVP: 5,

  // Standard Mode: Balance of quality and speed (default)
  GATE_THRESHOLD_STANDARD: 0.75,
  CONSENSUS_THRESHOLD_STANDARD: 0.90,
  MAX_ITERATIONS_STANDARD: 10,

  // Enterprise Mode: Highest quality standards
  GATE_THRESHOLD_ENTERPRISE: 0.75,
  CONSENSUS_THRESHOLD_ENTERPRISE: 0.95,
  MAX_ITERATIONS_ENTERPRISE: 15,

  // Timeout configurations (seconds)
  AGENT_TIMEOUT_SEC: 300,          // 5 minutes per agent
  REDIS_BLPOP_TIMEOUT_SEC: 60,     // 1 minute for blocking operations
  SMOKE_TEST_TIMEOUT_MS: 5000,     // 5 seconds for CLI smoke tests
};

/**
 * Mode-specific configurations bundled for convenience
 * Use to quickly get all thresholds for a specific mode
 */
export const MODE_CONFIGS = {
  mvp: {
    mode: 'mvp' as const,
    gateThreshold: ORCHESTRATION_THRESHOLDS.GATE_THRESHOLD_MVP,
    consensusThreshold: ORCHESTRATION_THRESHOLDS.CONSENSUS_THRESHOLD_MVP,
    maxIterations: ORCHESTRATION_THRESHOLDS.MAX_ITERATIONS_MVP,
  },
  standard: {
    mode: 'standard' as const,
    gateThreshold: ORCHESTRATION_THRESHOLDS.GATE_THRESHOLD_STANDARD,
    consensusThreshold: ORCHESTRATION_THRESHOLDS.CONSENSUS_THRESHOLD_STANDARD,
    maxIterations: ORCHESTRATION_THRESHOLDS.MAX_ITERATIONS_STANDARD,
  },
  enterprise: {
    mode: 'enterprise' as const,
    gateThreshold: ORCHESTRATION_THRESHOLDS.GATE_THRESHOLD_ENTERPRISE,
    consensusThreshold: ORCHESTRATION_THRESHOLDS.CONSENSUS_THRESHOLD_ENTERPRISE,
    maxIterations: ORCHESTRATION_THRESHOLDS.MAX_ITERATIONS_ENTERPRISE,
  },
};

/**
 * Common Test Data
 * Reusable test data structures for consistency across tests
 */
export const TEST_DATA = {
  // Valid API key formats (clearly marked as test data)
  VALID_API_KEY: 'sk-test-key-1234567890123456',
  VALID_API_KEY_ANTHROPIC: 'sk-ant-v1-test1234567890abcdefghijklmnop',

  // Sample IDs and identifiers
  SAMPLE_TASK_ID: 'test-task-123',
  SAMPLE_AGENT_ID: 'backend-developer-1-1',
  SAMPLE_VALIDATOR_ID: 'code-reviewer-1-1',
  SAMPLE_PARENT_TASK_ID: 'parent-epic-456',

  // Common agent types
  SAMPLE_AGENT_TYPES: {
    loop3: ['backend-developer', 'frontend-developer', 'tester'],
    loop2: ['code-reviewer', 'security-specialist', 'architect'],
    all: ['backend-developer', 'frontend-developer', 'tester',
          'code-reviewer', 'security-specialist', 'architect'],
  },

  // Success criteria fixture
  SAMPLE_SUCCESS_CRITERIA: {
    test_suites: [
      {
        name: 'unit-tests',
        command: 'npm test',
        threshold: 0.95,
      },
      {
        name: 'integration-tests',
        command: 'npm run test:integration',
        threshold: 0.90,
      },
    ],
  },

  // Epic context fixture
  SAMPLE_EPIC_CONTEXT: {
    epicGoal: 'Implement JWT authentication',
    deliverables: ['auth module', 'middleware', 'tests'],
    acceptanceCriteria: [
      'tokens expire after 1 hour',
      'refresh tokens supported',
      'token rotation implemented',
    ],
  },

  // Phase context fixture
  SAMPLE_PHASE_CONTEXT: {
    phase: 'implementation',
    requirements: [
      'backend API',
      'token generation',
      'validation middleware',
    ],
  },
};

/**
 * Test Result Fixtures
 * Pre-built test result scenarios for various testing cases
 */
export const TEST_RESULTS = {
  // Passing scenario - all tests pass well above threshold
  passing: {
    testSuite: 'unit-tests',
    testsPassed: 95,
    testsFailed: 5,
    passRate: 0.95,
  },

  // Marginal pass - just above threshold
  marginalPass: {
    testSuite: 'integration-tests',
    testsPassed: 75,
    testsFailed: 25,
    passRate: 0.75,
  },

  // Failing - below threshold
  failing: {
    testSuite: 'unit-tests',
    testsPassed: 60,
    testsFailed: 40,
    passRate: 0.60,
  },

  // Timeout scenario - no results
  timeout: null,
};

/**
 * Decision Fixtures
 * Pre-built Product Owner decision outputs
 */
export const PO_DECISIONS = {
  proceed: `Decision: PROCEED
Rationale: All deliverables complete and tested, consensus achieved
Confidence: 0.95
Deliverables validated: yes`,

  iterate: `Decision: ITERATE
Rationale: Security issues found, test coverage below threshold
Confidence: 0.75
Iteration feedback: Address SQL injection vulnerabilities`,

  abort: `Decision: ABORT
Rationale: Critical security vulnerability discovered, cannot proceed
Confidence: 0.95
Abort reason: Code injection in auth layer`,
};

/**
 * Helper function to get mode config
 * @param mode - 'mvp' | 'standard' | 'enterprise'
 * @returns Configuration object for specified mode
 */
export function getModeConfig(mode: 'mvp' | 'standard' | 'enterprise') {
  return MODE_CONFIGS[mode];
}

/**
 * Helper to validate threshold is met
 * @param value - Value to check
 * @param threshold - Threshold to compare against
 * @returns True if value >= threshold
 */
export function meetsThreshold(value: number, threshold: number): boolean {
  return value >= threshold;
}
```

### Step 2.2: Update cfn-loop-orchestration.test.ts

Add import at top:
```typescript
import {
  ORCHESTRATION_THRESHOLDS,
  MODE_CONFIGS,
  TEST_DATA,
  SAMPLE_SUCCESS_CRITERIA,
} from '../test-constants';
```

Replace magic numbers:
```typescript
// Before
testConfig = {
  taskId: 'test-task-123',
  mode: 'standard',
  loop3Agents: ['backend-developer', 'frontend-developer', 'tester'],
  loop2Agents: ['code-reviewer', 'security-specialist', 'architect'],
  gateThreshold: 0.75,
  consensusThreshold: 0.90,
  maxIterations: 10,
};

// After
testConfig = {
  taskId: TEST_DATA.SAMPLE_TASK_ID,
  mode: 'standard',
  loop3Agents: TEST_DATA.SAMPLE_AGENT_TYPES.loop3,
  loop2Agents: TEST_DATA.SAMPLE_AGENT_TYPES.loop2,
  ...MODE_CONFIGS.standard,
};
```

### Step 2.3: Update agent-spawn.test.ts

```typescript
// Add import
import { TEST_DATA, ORCHESTRATION_THRESHOLDS } from '../test-constants';

// Replace hardcoded values
const testKey = TEST_DATA.VALID_API_KEY;
// ... other replacements
```

### Step 2.4: Update provider-factory.test.ts

```typescript
// Add import
import { TEST_DATA } from '../test-constants';

// Replace hardcoded credentials
const testKey = TEST_DATA.VALID_API_KEY_ANTHROPIC;
```

### Step 2.5: Verify All Tests Pass

```bash
npm test -- tests/cfn-loop-orchestration.test.ts tests/cli/agent-spawn.test.ts tests/providers/provider-factory.test.ts
```

**Expected Result:** All tests pass
**Check:** No unused imports or undefined constants

**Time for Step 2:** 105 minutes
**Quality Improvement:** -0.03 (better maintainability)

---

## Refactoring #3: Parametrize Duplicate Tests
**Priority:** P2 (Medium Impact)
**Time Estimate:** 120 minutes
**Complexity:** Low-Medium

### Step 3.1: Identify Duplicates in agent-spawn.test.ts

Locate lines 51-175 with parameter parsing tests

### Step 3.2: Create Parametrized Test Suite

Replace the duplicate tests with:

```typescript
describe('parseAgentArgs - Argument Parsing', () => {
  describe('agent type parsing', () => {
    test.each([
      {
        name: 'parses agent type from "agent <type>" pattern',
        input: ['agent', 'researcher', '--task-id', 'task-test'],
        expected: { agentType: 'researcher', taskId: 'task-test' },
      },
      {
        name: 'parses agent type from "<type>" pattern (implied)',
        input: ['researcher', '--task-id', 'task-123'],
        expected: { agentType: 'researcher', taskId: 'task-123' },
      },
      {
        name: 'parses all optional parameters correctly',
        input: [
          'backend-developer',
          '--agent-id', 'agent-001',
          '--task-id', 'task-123',
          '--iteration', '5',
          '--context', 'Implement JWT auth',
          '--mode', 'cli',
          '--priority', '8',
          '--parent-task-id', 'parent-456',
        ],
        expected: {
          agentType: 'backend-developer',
          agentId: 'agent-001',
          taskId: 'task-123',
          iteration: 5,
          context: 'Implement JWT auth',
          mode: 'cli',
          priority: 8,
          parentTaskId: 'parent-456',
        },
      },
    ])('$name', ({ input, expected }) => {
      const result = parseAgentArgs(input);

      expect(result).not.toBeNull();
      expect(result?.agentType).toBe(expected.agentType);

      Object.entries(expected).forEach(([key, value]) => {
        if (key !== 'agentType') {
          expect((result as any)?.[key]).toBe(value);
        }
      });
    });
  });
});
```

### Step 3.3: Parametrize Decision Tests in cfn-loop-orchestration.test.ts

Find lines 356-378:
```typescript
test('parses PROCEED decision from Product Owner output', ...)
test('parses ITERATE decision from Product Owner output', ...)
test('parses ABORT decision from Product Owner output', ...)
```

Replace with:
```typescript
describe('Product Owner Decision Execution', () => {
  test.each([
    {
      decision: 'PROCEED',
      output: `Decision: PROCEED\nRationale: Complete\nConfidence: 0.95`,
    },
    {
      decision: 'ITERATE',
      output: `Decision: ITERATE\nRationale: Issues found\nConfidence: 0.75`,
    },
    {
      decision: 'ABORT',
      output: `Decision: ABORT\nRationale: Critical issue\nConfidence: 0.95`,
    },
  ])('parses $decision decision from Product Owner output', ({ decision, output }) => {
    const parsed = output.match(/Decision:\s*(PROCEED|ITERATE|ABORT)/)?.[1];
    expect(parsed).toBe(decision);
  });
});
```

### Step 3.4: Parametrize Mode Threshold Tests

Find lines 455-470:
```typescript
test('applies MVP mode thresholds', ...)
test('applies Standard mode thresholds', ...)
test('applies Enterprise mode thresholds', ...)
```

Replace with:
```typescript
test.each([
  {
    mode: 'mvp',
    gateThreshold: 0.70,
    consensusThreshold: 0.80,
    maxIterations: 5,
  },
  {
    mode: 'standard',
    gateThreshold: 0.75,
    consensusThreshold: 0.90,
    maxIterations: 10,
  },
  {
    mode: 'enterprise',
    gateThreshold: 0.75,
    consensusThreshold: 0.95,
    maxIterations: 15,
  },
])('applies $mode mode thresholds', ({ mode, gateThreshold, consensusThreshold, maxIterations }) => {
  const config = { mode, gateThreshold, consensusThreshold, maxIterations };

  expect(config.gateThreshold).toBe(gateThreshold);
  expect(config.consensusThreshold).toBe(consensusThreshold);
  expect(config.maxIterations).toBe(maxIterations);
});
```

### Step 3.5: Run Tests and Verify

```bash
npm test -- tests/cfn-loop-orchestration.test.ts tests/cli/agent-spawn.test.ts
```

**Expected Result:** Same number of tests pass, reduced lines of code
**Verification:** `npm test --verbose` shows all parameter combinations tested

**Time for Step 3:** 120 minutes
**Quality Improvement:** -0.04 (better code organization, DRY compliance)

---

## Refactoring #4: Extract Complex Mock Implementations
**Priority:** P3 (Lower Impact)
**Time Estimate:** 80 minutes
**Complexity:** Medium

### Step 4.1: Create Extended Mock File

**File:** `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/test-utils/mock-redis-extended.ts`

```typescript
import { jest } from '@jest/globals';

/**
 * Extended Redis Mock Client
 *
 * Provides realistic Redis behavior simulation for integration testing
 * Used when tests need to verify complex state transitions and interactions
 *
 * Features:
 * - Full in-memory state tracking
 * - Pub/Sub message handling
 * - Blocking list operations with timeout simulation
 * - Metrics tracking for debugging
 */

interface RedisMetrics {
  callCount: number;
  messagesReceived: number;
  successfulOperations: number;
  failedOperations: number;
}

export class MockRedisClient {
  private store = new Map<string, any>();
  private subscriptions = new Map<string, Set<(msg: any) => void>>();
  private metrics: RedisMetrics = {
    callCount: 0,
    messagesReceived: 0,
    successfulOperations: 0,
    failedOperations: 0,
  };

  // Public Jest mock methods
  get = jest.fn(async (key: string) => {
    this.metrics.callCount++;
    const value = this.store.get(key);
    if (value !== undefined) {
      this.metrics.successfulOperations++;
      return value;
    }
    return null;
  });

  set = jest.fn(async (key: string, value: any) => {
    this.metrics.callCount++;
    this.store.set(key, value);
    this.metrics.successfulOperations++;
    return 'OK';
  });

  lpush = jest.fn(async (key: string, ...values: any[]) => {
    this.metrics.callCount++;
    let list = this.store.get(key) || [];
    list = [...values, ...list];
    this.store.set(key, list);
    this.metrics.successfulOperations++;
    return list.length;
  });

  blpop = jest.fn(async (key: string, timeout: number) => {
    this.metrics.callCount++;
    const list = this.store.get(key) || [];
    if (list.length > 0) {
      const value = list.shift();
      this.store.set(key, list);
      this.metrics.successfulOperations++;
      return [key, value];
    }
    // Timeout - return null
    return null;
  });

  smembers = jest.fn(async (key: string) => {
    this.metrics.callCount++;
    return Array.from(this.store.get(key) || new Set());
  });

  sadd = jest.fn(async (key: string, ...members: any[]) => {
    this.metrics.callCount++;
    let set = this.store.get(key) || new Set();
    const initialSize = set.size;
    members.forEach((m) => set.add(m));
    this.store.set(key, set);
    const added = set.size - initialSize;
    this.metrics.successfulOperations++;
    return added;
  });

  del = jest.fn(async (key: string) => {
    this.metrics.callCount++;
    const existed = this.store.has(key);
    if (existed) {
      this.store.delete(key);
      this.metrics.successfulOperations++;
    }
    return existed ? 1 : 0;
  });

  eval = jest.fn(async (script: string, numKeys: number, ...args: any[]) => {
    this.metrics.callCount++;
    this.metrics.successfulOperations++;
    return 'OK';
  });

  publish = jest.fn(async (channel: string, message: any) => {
    this.metrics.callCount++;
    if (this.subscriptions.has(channel)) {
      const callbacks = this.subscriptions.get(channel)!;
      callbacks.forEach((cb) => cb(message));
    }
    this.metrics.successfulOperations++;
    return this.subscriptions.get(channel)?.size || 0;
  });

  subscribe = jest.fn((channel: string, callback: (msg: any) => void) => {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(callback);
    return callback;
  });

  unsubscribe = jest.fn((channel: string, callback: (msg: any) => void) => {
    if (this.subscriptions.has(channel)) {
      this.subscriptions.get(channel)!.delete(callback);
    }
  });

  quit = jest.fn(async () => {
    this.store.clear();
    this.subscriptions.clear();
    return 'OK';
  });

  // Debugging helpers
  getMetrics(): RedisMetrics {
    return { ...this.metrics };
  }

  getStore(): Map<string, any> {
    return new Map(this.store);
  }

  reset(): void {
    this.store.clear();
    this.subscriptions.clear();
    this.metrics = {
      callCount: 0,
      messagesReceived: 0,
      successfulOperations: 0,
      failedOperations: 0,
    };
  }
}
```

### Step 4.2: Update redis-coordination.test.ts

Find the embedded MockRedisClient class and replace with:

```typescript
import { MockRedisClient } from './test-utils/mock-redis-extended';

// Remove the embedded class definition
// Use directly: const mockRedis = new MockRedisClient();
```

### Step 4.3: Verify Tests Still Pass

```bash
npm test -- tests/coordination/redis-coordination.test.ts
```

**Expected Result:** All 40 tests pass
**Check:** No undefined MockRedisClient errors

**Time for Step 4:** 80 minutes
**Quality Improvement:** -0.03 (improved code organization)

---

## Refactoring #5: Add Test Fixtures (Optional, Low Priority)
**Priority:** P4 (Nice-to-Have)
**Time Estimate:** 75 minutes
**Complexity:** Low

### Step 5.1: Create Fixtures Directory

```bash
mkdir -p /mnt/c/Users/masha/Documents/claude-flow-novice/tests/fixtures
touch /mnt/c/Users/masha/Documents/claude-flow-novice/tests/fixtures/test-data.ts
```

### Step 5.2: Create Test Data Fixtures

**File:** `tests/fixtures/test-data.ts`

```typescript
/**
 * Test Data Fixtures
 * Centralized test data for consistency across test suites
 * Reduces duplication and ensures data consistency
 */

export const FIXTURES = {
  successCriteria: {
    standard: {
      test_suites: [
        {
          name: 'unit-tests',
          command: 'npm test',
          threshold: 0.95,
        },
      ],
    },
    comprehensive: {
      test_suites: [
        {
          name: 'unit-tests',
          command: 'npm test',
          threshold: 0.95,
        },
        {
          name: 'integration-tests',
          command: 'npm run test:integration',
          threshold: 0.90,
        },
        {
          name: 'security-tests',
          command: 'npm run test:security',
          threshold: 0.98,
        },
      ],
    },
  },

  epicContexts: {
    authentication: {
      epicGoal: 'Implement JWT authentication',
      deliverables: ['auth module', 'middleware', 'tests'],
      acceptanceCriteria: [
        'tokens expire after 1 hour',
        'refresh tokens supported',
        'token rotation implemented',
      ],
    },
    apiGateway: {
      epicGoal: 'Build API Gateway',
      deliverables: ['gateway core', 'routing logic', 'tests', 'documentation'],
      acceptanceCriteria: [
        'route matching <100ms',
        '99.9% uptime SLA',
        'rate limiting enforced',
      ],
    },
  },

  agentConfigurations: {
    standard: {
      loop3Agents: ['backend-developer', 'frontend-developer', 'tester'],
      loop2Agents: ['code-reviewer', 'security-specialist', 'architect'],
      productOwner: 'product-owner',
    },
    extended: {
      loop3Agents: [
        'backend-developer',
        'frontend-developer',
        'tester',
        'database-specialist',
      ],
      loop2Agents: [
        'code-reviewer',
        'security-specialist',
        'architect',
        'performance-engineer',
      ],
      productOwner: 'product-owner',
    },
  },

  testResults: {
    scenarios: {
      allPass: {
        unitTests: { passed: 95, failed: 5, passRate: 0.95 },
        integrationTests: { passed: 80, failed: 20, passRate: 0.80 },
        overallPassRate: 0.875,
      },
      partialPass: {
        unitTests: { passed: 85, failed: 15, passRate: 0.85 },
        integrationTests: { passed: 70, failed: 30, passRate: 0.70 },
        overallPassRate: 0.775,
      },
      fail: {
        unitTests: { passed: 60, failed: 40, passRate: 0.60 },
        integrationTests: { passed: 50, failed: 50, passRate: 0.50 },
        overallPassRate: 0.55,
      },
    },
  },
};
```

### Step 5.3: Use Fixtures in Tests

```typescript
// Add import
import { FIXTURES } from '../fixtures/test-data';

// Replace hardcoded data
const successCriteria = FIXTURES.successCriteria.standard;
const epicContext = FIXTURES.epicContexts.authentication;
const testResults = FIXTURES.testResults.scenarios.allPass;
```

**Time for Step 5:** 75 minutes (optional)
**Quality Improvement:** -0.01 (minimal, optional improvement)

---

## Validation Checklist

After each refactoring step, verify:

- [ ] No syntax errors in TypeScript files
- [ ] All tests still pass (npm test)
- [ ] Test coverage remains ≥85%
- [ ] No console errors or warnings
- [ ] Git diff shows expected changes
- [ ] No unused imports or variables

---

## Complete Implementation Checklist

### Phase 1: High Impact (4-5 hours)
- [ ] Step 1: Extract Mock Redis Factory (100 min)
  - [ ] Create mock-redis-client.ts
  - [ ] Update cfn-loop-orchestration.test.ts
  - [ ] Update redis-coordination.test.ts
  - [ ] Run and verify all tests pass

- [ ] Step 2: Create Test Constants (105 min)
  - [ ] Create test-constants.ts
  - [ ] Update all test files with imports
  - [ ] Replace hardcoded values
  - [ ] Run and verify all tests pass

### Phase 2: Code Quality (3-4 hours)
- [ ] Step 3: Parametrize Duplicate Tests (120 min)
  - [ ] Update agent-spawn.test.ts
  - [ ] Update cfn-loop-orchestration.test.ts
  - [ ] Verify test count unchanged
  - [ ] Run and verify all tests pass

- [ ] Step 4: Extract Complex Mocks (80 min)
  - [ ] Create mock-redis-extended.ts
  - [ ] Update redis-coordination.test.ts
  - [ ] Clean up embedded mock class
  - [ ] Run and verify all tests pass

### Phase 3: Polish (Optional, 1-2 hours)
- [ ] Step 5: Add Test Fixtures (75 min)
  - [ ] Create fixtures directory
  - [ ] Create test-data.ts
  - [ ] Update tests to use fixtures
  - [ ] Run and verify all tests pass

### Final Validation
- [ ] Run full test suite: `npm test`
- [ ] Verify coverage: `npm run coverage`
- [ ] Review git diff for completeness
- [ ] Create pull request with changes
- [ ] Request code review
- [ ] Merge to main branch

---

## Success Metrics

**Before Refactoring:**
```
Code Quality Score: 0.88/1.0
- Complexity: 0.87
- Code Smells: 0.82
- Technical Debt: 0.90
- Architecture: 0.95
```

**Expected After Refactoring:**
```
Code Quality Score: 0.93/1.0 (target)
- Complexity: 0.88 (+ mock extraction)
- Code Smells: 0.89 (- duplication, - magic numbers)
- Technical Debt: 0.95 (- extracted utilities, - centralized config)
- Architecture: 0.96 (unchanged, already excellent)
```

---

## Rollback Procedures

If any step causes test failures:

```bash
# View what changed
git diff tests/

# Revert specific file
git checkout -- tests/cfn-loop-orchestration.test.ts

# Revert entire refactoring
git reset --hard HEAD

# Re-run tests
npm test
```

---

## Notes for Implementation

1. **Review Before Each Commit**
   - Run tests after each step
   - Commit changes before moving to next step
   - Keep commits atomic and focused

2. **Documentation**
   - Update test comments as needed
   - Keep mock documentation current
   - Add examples in constant files

3. **Team Communication**
   - Share refactoring plan with team
   - Update this document with actual times
   - Document any learnings or changes

4. **Quality Assurance**
   - Test on clean environment
   - Verify no hidden dependencies
   - Check for any flaky tests

---

## Estimated Timeline

- **Phase 1 (4-5h):** 1 day of focused work
- **Phase 2 (3-4h):** 1 day of focused work
- **Phase 3 (1-2h):** ½ day (optional)
- **Total:** 2-2.5 days full-time effort

Or spread across 2 weeks at 4-5 hours/week.

---

**Implementation Guide Complete**
Generated: 2025-11-17
Quality Improvement Target: 0.88 → 0.93 (+0.05)
