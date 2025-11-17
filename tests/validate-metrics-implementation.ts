/**
 * Validation Script for Task 2.3: Unified Metrics and Execution Logging
 *
 * Validates:
 * - TypeScript compilation
 * - Idempotency key generation
 * - Cost accuracy validation
 * - Schema consistency
 */

import {
  createIdempotentKey,
  validateCostAccuracy,
  roundCost,
  ExecutionMetrics,
} from '../src/lib/idempotent-write';

/**
 * Test idempotency key generation
 */
function testIdempotencyKey(): boolean {
  console.log('\n=== Testing Idempotency Key Generation ===');

  const metrics: ExecutionMetrics = {
    timestamp: new Date('2025-01-16T12:00:00Z'),
    agent_id: 'test-agent',
    task_id: 'task-001',
    duration_ms: 1500,
    tokens_used: 1000,
    cost_usd: 0.015,
    status: 'success',
  };

  const key1 = createIdempotentKey(metrics);
  const key2 = createIdempotentKey(metrics);

  console.log(`Key 1: ${key1.substring(0, 16)}...`);
  console.log(`Key 2: ${key2.substring(0, 16)}...`);
  console.log(`Keys match: ${key1 === key2}`);
  console.log(`Key format valid (SHA256): ${/^[0-9a-f]{64}$/.test(key1)}`);

  // Keys should be identical for same metrics
  if (key1 !== key2) {
    console.error('❌ FAILED: Idempotency keys should match for identical metrics');
    return false;
  }

  // Key should be 64 character hex (SHA256)
  if (!/^[0-9a-f]{64}$/.test(key1)) {
    console.error('❌ FAILED: Idempotency key is not valid SHA256 hash');
    return false;
  }

  // Different metrics should produce different keys
  const differentMetrics: ExecutionMetrics = {
    ...metrics,
    task_id: 'task-002', // Different task
  };

  const key3 = createIdempotentKey(differentMetrics);
  console.log(`Key 3 (different): ${key3.substring(0, 16)}...`);

  if (key1 === key3) {
    console.error('❌ FAILED: Different metrics should produce different keys');
    return false;
  }

  console.log('✅ PASSED: Idempotency key generation');
  return true;
}

/**
 * Test cost accuracy validation
 */
function testCostAccuracy(): boolean {
  console.log('\n=== Testing Cost Accuracy Validation ===');

  const validCosts = [0.001, 0.123, 1.234, 0.100];
  const invalidCosts = [0.123456, 1.23456789];

  console.log('Valid costs (within $0.001 precision):');
  for (const cost of validCosts) {
    const isValid = validateCostAccuracy(cost);
    console.log(`  ${cost}: ${isValid ? '✓' : '✗'}`);

    if (!isValid) {
      console.error(`❌ FAILED: Cost ${cost} should be valid`);
      return false;
    }
  }

  console.log('Invalid costs (exceeds $0.001 precision):');
  for (const cost of invalidCosts) {
    const isValid = validateCostAccuracy(cost);
    const rounded = roundCost(cost);
    console.log(`  ${cost} → ${rounded}: ${!isValid ? '✓' : '✗'}`);

    if (isValid) {
      console.error(`❌ FAILED: Cost ${cost} should be invalid`);
      return false;
    }
  }

  console.log('✅ PASSED: Cost accuracy validation');
  return true;
}

/**
 * Test cost rounding
 */
function testCostRounding(): boolean {
  console.log('\n=== Testing Cost Rounding ===');

  const testCases = [
    { input: 0.1234, expected: 0.123 },
    { input: 0.1235, expected: 0.124 },
    { input: 0.1, expected: 0.100 },
    { input: 1.2345, expected: 1.235 },
    { input: 0.0005, expected: 0.001 },
  ];

  for (const { input, expected } of testCases) {
    const rounded = roundCost(input);
    console.log(`  ${input} → ${rounded} (expected: ${expected})`);

    if (Math.abs(rounded - expected) > 0.0001) {
      console.error(`❌ FAILED: Rounding ${input} should produce ${expected}, got ${rounded}`);
      return false;
    }
  }

  console.log('✅ PASSED: Cost rounding');
  return true;
}

/**
 * Test schema consistency
 */
function testSchemaConsistency(): boolean {
  console.log('\n=== Testing Schema Consistency ===');

  const metrics: ExecutionMetrics = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    timestamp: new Date(),
    agent_id: 'backend-developer',
    skill_id: 'database-optimization',
    task_id: 'task-12345',
    duration_ms: 2500,
    tokens_used: 1500,
    cost_usd: 0.015,
    status: 'success',
    error_message: undefined,
    metadata: {
      provider: 'zai',
      model: 'glm-4.6',
    },
  };

  // Validate required fields
  const requiredFields = [
    'timestamp',
    'agent_id',
    'task_id',
    'duration_ms',
    'tokens_used',
    'cost_usd',
    'status',
  ];

  for (const field of requiredFields) {
    if (!(field in metrics)) {
      console.error(`❌ FAILED: Missing required field: ${field}`);
      return false;
    }
  }

  console.log('  Required fields: ✓');

  // Validate status enum
  const validStatuses = ['success', 'failure', 'timeout', 'cancelled'];
  if (!validStatuses.includes(metrics.status)) {
    console.error(`❌ FAILED: Invalid status: ${metrics.status}`);
    return false;
  }

  console.log('  Status enum: ✓');

  // Validate types
  if (typeof metrics.duration_ms !== 'number') {
    console.error('❌ FAILED: duration_ms must be number');
    return false;
  }

  if (typeof metrics.tokens_used !== 'number') {
    console.error('❌ FAILED: tokens_used must be number');
    return false;
  }

  if (typeof metrics.cost_usd !== 'number') {
    console.error('❌ FAILED: cost_usd must be number');
    return false;
  }

  console.log('  Field types: ✓');
  console.log('✅ PASSED: Schema consistency');
  return true;
}

/**
 * Main validation function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Task 2.3: Unified Metrics and Execution Logging');
  console.log('Implementation Validation');
  console.log('='.repeat(60));

  const results = [
    testIdempotencyKey(),
    testCostAccuracy(),
    testCostRounding(),
    testSchemaConsistency(),
  ];

  const allPassed = results.every(r => r);

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ ALL VALIDATION TESTS PASSED');
    console.log('='.repeat(60));
    process.exit(0);
  } else {
    console.log('❌ SOME VALIDATION TESTS FAILED');
    console.log('='.repeat(60));
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Validation error:', error);
  process.exit(1);
});
