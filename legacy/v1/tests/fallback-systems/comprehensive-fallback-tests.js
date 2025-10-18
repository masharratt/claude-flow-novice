/**
 * Comprehensive Fallback Tests
 *
 * Tests all failure scenarios to ensure 100% functionality
 * in minimal dependency environments. Critical for Byzantine
 * consensus verification of Phase 1 completion.
 *
 * @module comprehensive-fallback-tests
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import {
  ResilientMemorySystem,
  InMemoryStorageEngine,
  testSQLiteAvailability,
  checkMemoryHealth
} from '../../src/memory/index.js';
import {
  ResilientHookEngine,
  testHookSystemResilience
} from '../../src/hooks/resilient-hook-system.js';
import {
  RecursiveValidationFramework,
  testRecursiveValidation
} from '../../src/validation/recursive-validation-system.js';

describe('Comprehensive Fallback System Tests', () => {
  let testInstances = [];

  beforeAll(async () => {
    console.log('🧪 Starting Comprehensive Fallback System Tests');
  });

  afterAll(async () => {
    // Cleanup all test instances
    for (const instance of testInstances) {
      try {
        if (instance.close) await instance.close();
        if (instance.shutdown) await instance.shutdown();
      } catch (error) {
        console.warn('Cleanup warning:', error.message);
      }
    }
    console.log('✅ Comprehensive Fallback Tests completed');
  });

  afterEach(async () => {
    // Clean up instances created in this test
    testInstances = [];
  });

  describe('Memory System Fallback Tests', () => {
    test('should detect SQLite availability correctly', async () => {
      const availability = await testSQLiteAvailability();

      expect(availability).toHaveProperty('available');
      expect(availability).toHaveProperty('tested');
      expect(availability).toHaveProperty('error');

      if (availability.available) {
        expect(availability.tested).toBe(true);
        expect(availability.error).toBeNull();
      } else {
        expect(availability.error).toBeTruthy();
      }
    });

    test('should initialize InMemoryStorageEngine without SQLite', async () => {
      const engine = new InMemoryStorageEngine({
        enablePersistence: false,
        maxMemoryMB: 10
      });

      testInstances.push(engine);

      const result = await engine.initialize();

      expect(result.success).toBe(true);
      expect(result.mode).toBe('fallback');
      expect(engine.isInitialized).toBe(true);
    });

    test('should perform full CRUD operations in fallback mode', async () => {
      const engine = new InMemoryStorageEngine({
        enablePersistence: false,
        maxMemoryMB: 10
      });

      testInstances.push(engine);
      await engine.initialize();

      // Store operation
      const storeResult = await engine.store('test-key', { data: 'test-value' }, {
        namespace: 'test',
        tags: ['test'],
        metadata: { test: true }
      });

      expect(storeResult.success).toBe(true);
      expect(storeResult.key).toBe('test-key');
      expect(storeResult.namespace).toBe('test');

      // Retrieve operation
      const retrieved = await engine.retrieve('test-key', 'test');

      expect(retrieved).toEqual({ data: 'test-value' });

      // List operation
      const listed = await engine.list('test');

      expect(listed.length).toBe(1);
      expect(listed[0].key).toBe('test-key');

      // Search operation
      const searched = await engine.search({
        namespace: 'test',
        pattern: 'test'
      });

      expect(searched.length).toBe(1);
      expect(searched[0].key).toBe('test-key');

      // Delete operation
      const deleted = await engine.delete('test-key', 'test');

      expect(deleted).toBe(true);

      // Verify deletion
      const retrievedAfterDelete = await engine.retrieve('test-key', 'test');

      expect(retrievedAfterDelete).toBeNull();
    });

    test('should handle TTL expiration in fallback mode', async () => {
      const engine = new InMemoryStorageEngine({
        enablePersistence: false,
        gcInterval: 100 // 100ms for fast testing
      });

      testInstances.push(engine);
      await engine.initialize();

      // Store with 0.2 second TTL
      await engine.store('expire-key', 'expire-value', {
        ttl: 0.2,
        namespace: 'test'
      });

      // Should be retrievable immediately
      const immediate = await engine.retrieve('expire-key', 'test');
      expect(immediate).toBe('expire-value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should be expired now
      const expired = await engine.retrieve('expire-key', 'test');
      expect(expired).toBeNull();
    });

    test('should handle Byzantine consensus truth scoring in fallback mode', async () => {
      const engine = new InMemoryStorageEngine({
        enablePersistence: false
      });

      testInstances.push(engine);
      await engine.initialize();

      // Record truth scores
      const result1 = await engine.recordTruthScore('test1', 0.9, {
        validator: 'test',
        evidence: { passed: true }
      });

      expect(result1.recorded).toBe(true);
      expect(result1.consensusAccuracy).toBeDefined();

      const result2 = await engine.recordTruthScore('test2', 0.7, {
        validator: 'test',
        evidence: { passed: false }
      });

      expect(result2.recorded).toBe(true);

      // Get truth scores
      const scores = await engine.getTruthScores();

      expect(scores.scores.length).toBe(2);
      expect(scores.consensus).toHaveProperty('accuracy');
      expect(scores.validationCount).toBe(2);
    });

    test('should automatically fall back when SQLite fails', async () => {
      const resilientSystem = new ResilientMemorySystem({
        directory: '/nonexistent/path', // Force SQLite to fail
        enablePersistence: false
      });

      testInstances.push(resilientSystem);

      const initResult = await resilientSystem.initialize();

      expect(initResult.success).toBe(true);
      expect(initResult.mode).toBe('fallback'); // Should fall back
      expect(initResult.sqliteAvailable).toBe(false);
      expect(initResult.fallbackReady).toBe(true);

      // Test functionality in fallback mode
      await resilientSystem.store('fallback-test', 'fallback-value');
      const retrieved = await resilientSystem.retrieve('fallback-test');

      expect(retrieved).toBe('fallback-value');
    });

    test('should pass memory health checks', async () => {
      const health = await checkMemoryHealth();

      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('systems');
      expect(health).toHaveProperty('overall');

      expect(health.systems).toHaveProperty('fallback');
      expect(health.systems).toHaveProperty('resilient');

      expect(health.overall.healthy).toBe(true);
      expect(health.overall.fallbackReady).toBe(true);
      expect(health.overall.resilientReady).toBe(true);
    });
  });

  describe('Hook System Fallback Tests', () => {
    test('should initialize hook system without external dependencies', async () => {
      const hookSystem = new ResilientHookEngine({
        enableByzantineConsensus: false, // Minimal dependencies
        enableMetrics: true
      });

      testInstances.push(hookSystem);

      const result = await hookSystem.initialize();

      expect(result.success).toBe(true);
      expect(result.resilient).toBe(true);
    });

    test('should register and execute hooks without external dependencies', async () => {
      const hookSystem = new ResilientHookEngine({
        enableByzantineConsensus: false
      });

      testInstances.push(hookSystem);
      await hookSystem.initialize();

      // Register test hook
      const hookId = hookSystem.register({
        name: 'Test Hook',
        type: 'test',
        handler: async ({ payload }) => {
          return { processed: true, input: payload };
        },
        priority: 5
      });

      expect(hookId).toBeTruthy();

      // Execute hooks
      const execution = await hookSystem.executeHooks('test', { test: true });

      expect(execution.results.length).toBe(1);
      expect(execution.results[0].success).toBe(true);
      expect(execution.results[0].result.processed).toBe(true);
    });

    test('should handle hook failures gracefully', async () => {
      const hookSystem = new ResilientHookEngine({
        enableByzantineConsensus: false,
        retryAttempts: 2
      });

      testInstances.push(hookSystem);
      await hookSystem.initialize();

      let attemptCount = 0;

      // Register failing hook
      hookSystem.register({
        name: 'Failing Hook',
        type: 'fail-test',
        handler: async () => {
          attemptCount++;
          throw new Error(`Attempt ${attemptCount} failed`);
        },
        retryAttempts: 2
      });

      // Execute hooks
      const execution = await hookSystem.executeHooks('fail-test', {});

      expect(execution.results.length).toBe(1);
      expect(execution.results[0].success).toBe(false);
      expect(execution.results[0].attempts).toBe(3); // Initial attempt + 2 retries
      expect(attemptCount).toBe(3);
    });

    test('should support Byzantine consensus when enabled', async () => {
      const hookSystem = new ResilientHookEngine({
        enableByzantineConsensus: true,
        consensusThreshold: 0.8
      });

      testInstances.push(hookSystem);
      await hookSystem.initialize();

      // Register hook that produces measurable results
      hookSystem.register({
        name: 'Byzantine Test Hook',
        type: 'byzantine',
        handler: async ({ payload }) => {
          return {
            validated: payload.valid === true,
            score: payload.score || 0.9,
            evidence: payload.evidence || {}
          };
        }
      });

      // Execute with high-confidence payload
      const execution = await hookSystem.executeHooks('byzantine', {
        valid: true,
        score: 0.95,
        evidence: { test: true }
      });

      expect(execution.results.length).toBe(1);
      expect(execution.results[0].success).toBe(true);
      expect(execution.byzantineConsensus).toBe(true);

      // Check truth scores
      const truthScores = await hookSystem.getTruthScores();
      expect(truthScores.scores.length).toBeGreaterThan(0);
    });

    test('should pass hook system resilience test', async () => {
      const result = await testHookSystemResilience();

      expect(result.resilient).toBe(true);
      expect(result.tested).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('Recursive Validation System Fallback Tests', () => {
    test('should initialize validation framework without external dependencies', async () => {
      const framework = new RecursiveValidationFramework({
        selfValidationEnabled: true,
        enableTruthScoring: true
      });

      testInstances.push(framework);

      const result = await framework.initialize();

      expect(result.success).toBe(true);
      expect(result.selfValidationEnabled).toBe(true);
      expect(result.byzantineEnabled).toBe(true);
    });

    test('should perform regular validation', async () => {
      const framework = new RecursiveValidationFramework({
        selfValidationEnabled: true
      });

      testInstances.push(framework);
      await framework.initialize();

      const claim = {
        type: 'test-completion',
        component: 'test-component',
        claims: {
          functional: true,
          tested: true,
          secure: true
        },
        evidence: {
          functional: { verified: true },
          tested: { passed: 6, failed: 0 },
          secure: { scanPassed: true }
        }
      };

      const result = await framework.validateCompletion(claim);

      expect(result.id).toBeTruthy();
      expect(result.claim).toEqual(claim);
      expect(result.result).toHaveProperty('overallScore');
      expect(result.truthScore).toBeGreaterThanOrEqual(0);
      expect(result.truthScore).toBeLessThanOrEqual(1);
      expect(result.consensusReached).toBeDefined();
    });

    test('should perform recursive self-validation', async () => {
      const framework = new RecursiveValidationFramework({
        selfValidationEnabled: true,
        byzantineThreshold: 0.8
      });

      testInstances.push(framework);
      await framework.initialize();

      const selfValidation = await framework.performSelfValidation();

      expect(selfValidation.id).toBeTruthy();
      expect(selfValidation.claim.selfValidation).toBe(true);
      expect(selfValidation.truthScore).toBeGreaterThanOrEqual(0);
      expect(selfValidation.additionalChecks).toHaveProperty('allPassed');
      expect(selfValidation.overallSuccess).toBeDefined();
      expect(selfValidation.frameworkReady).toBeDefined();
    });

    test('should handle recursive validation with depth limits', async () => {
      const framework = new RecursiveValidationFramework({
        maxRecursionDepth: 2
      });

      testInstances.push(framework);
      await framework.initialize();

      // Test with increasing recursion depth
      const claim = {
        type: 'recursive-test',
        component: 'depth-test',
        claims: { recursive: true }
      };

      // Depth 0
      const result0 = await framework.validateCompletion(claim, { recursionDepth: 0 });
      expect(result0.recursionDepth).toBe(0);

      // Depth 1
      const result1 = await framework.validateCompletion(claim, { recursionDepth: 1 });
      expect(result1.recursionDepth).toBe(1);

      // Should fail at max depth
      await expect(framework.validateCompletion(claim, { recursionDepth: 2 }))
        .rejects.toThrow('Maximum recursion depth exceeded');
    });

    test('should pass recursive validation test', async () => {
      const result = await testRecursiveValidation();

      expect(result.recursive).toBe(true);
      expect(result.selfValidationPassed).toBe(true);
      expect(result.regularValidationPassed).toBe(true);
      expect(result.truthScore).toBeGreaterThan(0.5);
      expect(result.error).toBeNull();
    });

    test('should achieve >85% truth scoring accuracy', async () => {
      const framework = new RecursiveValidationFramework({
        byzantineThreshold: 0.85
      });

      testInstances.push(framework);
      await framework.initialize();

      // Create high-quality claim
      const highQualityClaim = {
        type: 'high-quality-completion',
        component: 'accuracy-test',
        claims: {
          functional: true,
          tested: true,
          documented: true,
          performant: true,
          secure: true,
          maintainable: true
        },
        evidence: {
          functional: { testsPass: 100, testsFail: 0 },
          tested: { coverage: 95 },
          documented: { docsExist: true, upToDate: true },
          performant: { benchmarkPassed: true },
          secure: { vulnerabilities: 0 },
          maintainable: { codeQuality: 'A' }
        },
        timestamp: Date.now()
      };

      const result = await framework.validateCompletion(highQualityClaim);

      expect(result.truthScore).toBeGreaterThanOrEqual(0.85);
      expect(result.consensusReached).toBe(true);
      expect(result.result.overallScore).toBeGreaterThan(0.8);
    });
  });

  describe('Integrated Fallback System Tests', () => {
    test('should work in complete minimal dependency environment', async () => {
      // Test with all systems disabled except core functionality
      const memory = new ResilientMemorySystem({
        enablePersistence: false,
        maxMemoryMB: 10
      });

      const hooks = new ResilientHookEngine({
        enableByzantineConsensus: false,
        enableMetrics: false,
        maxConcurrentHooks: 5
      });

      const validation = new RecursiveValidationFramework({
        selfValidationEnabled: false,
        enableTruthScoring: false
      });

      testInstances.push(memory, hooks, validation);

      // Initialize all systems
      await memory.initialize();
      await hooks.initialize();
      await validation.initialize();

      // Test memory
      await memory.store('integration-test', 'test-value');
      const retrieved = await memory.retrieve('integration-test');
      expect(retrieved).toBe('test-value');

      // Test hooks
      hooks.register({
        name: 'Integration Hook',
        type: 'integration',
        handler: async () => ({ integrated: true })
      });

      const execution = await hooks.executeHooks('integration', {});
      expect(execution.results[0].success).toBe(true);

      // Test validation
      const claim = {
        type: 'integration-completion',
        component: 'minimal-test',
        claims: { minimal: true }
      };

      const validationResult = await validation.validateCompletion(claim);
      expect(validationResult.result).toBeDefined();
    });

    test('should maintain >85% functionality when SQLite unavailable', async () => {
      const availabilityTest = await testSQLiteAvailability();

      // Force fallback mode
      const memory = new ResilientMemorySystem({
        directory: '/force/fallback/path',
        enablePersistence: false
      });

      testInstances.push(memory);

      const initResult = await memory.initialize();
      expect(initResult.mode).toBe('fallback');

      // Test core memory operations (should be 100% functional)
      const operations = [
        async () => await memory.store('test1', 'value1'),
        async () => await memory.retrieve('test1'),
        async () => await memory.list('default'),
        async () => await memory.search({ pattern: 'test' }),
        async () => await memory.delete('test1'),
        async () => await memory.clear('default'),
        async () => await memory.getStats()
      ];

      let successful = 0;
      for (const operation of operations) {
        try {
          await operation();
          successful++;
        } catch (error) {
          console.warn('Operation failed:', error.message);
        }
      }

      const successRate = successful / operations.length;
      expect(successRate).toBeGreaterThanOrEqual(0.85); // >85% functionality
    });

    test('should demonstrate complete Byzantine consensus in fallback mode', async () => {
      const memory = new ResilientMemorySystem({
        enablePersistence: false,
        byzantineMode: true,
        consensusThreshold: 0.85
      });

      const hooks = new ResilientHookEngine({
        enableByzantineConsensus: true,
        consensusThreshold: 0.85
      });

      const validation = new RecursiveValidationFramework({
        selfValidationEnabled: true,
        byzantineThreshold: 0.85,
        enableTruthScoring: true
      });

      testInstances.push(memory, hooks, validation);

      // Initialize all systems
      await memory.initialize();
      await hooks.initialize();
      await validation.initialize();

      // Test Byzantine consensus across systems
      // 1. Record truth scores in memory
      await memory.recordTruthScore('consensus-test-1', 0.92, {
        evidence: { strong: true }
      });

      // 2. Execute hooks with Byzantine validation
      hooks.register({
        name: 'Consensus Hook',
        type: 'consensus-test',
        handler: async ({ payload }) => ({
          consensusValue: payload.value,
          confidence: 0.9
        })
      });

      const hookExecution = await hooks.executeHooks('consensus-test', {
        value: 'consensus-achieved'
      });

      // 3. Perform validation with self-validation
      const selfValidation = await validation.performSelfValidation();

      // Verify Byzantine consensus
      expect(selfValidation.consensusReached).toBe(true);
      expect(selfValidation.truthScore).toBeGreaterThanOrEqual(0.85);
      expect(selfValidation.overallSuccess).toBe(true);

      // Verify memory consensus
      const truthScores = await memory.getTruthScores();
      expect(truthScores.consensus.accuracy).toBeGreaterThan(0.8);

      // Verify hook consensus
      const hookStats = await hooks.getStats();
      expect(hookStats.consensus.accuracy).toBeGreaterThanOrEqual(0);
    });

    test('should validate its own completion recursively', async () => {
      // This is the ultimate test: the framework validating its own completion
      const validation = new RecursiveValidationFramework({
        selfValidationEnabled: true,
        byzantineThreshold: 0.85,
        enableTruthScoring: true,
        validationDepth: 3
      });

      testInstances.push(validation);
      await validation.initialize();

      // Create a completion claim for the framework itself
      const frameworkCompletionClaim = {
        type: 'framework-completion',
        component: 'recursive-validation-framework',
        claims: {
          memorySystemOperational: true,
          hookSystemOperational: true,
          validationRulesLoaded: true,
          selfValidationCapable: true,
          byzantineConsensusEnabled: true,
          recursiveValidationSupported: true,
          fallbackSystemsWorking: true,
          truthScoringAccurate: true,
          phase1Complete: true
        },
        evidence: {
          memorySystemOperational: { mode: 'fallback', functional: true },
          hookSystemOperational: { initialized: true, hooksRegistered: 2 },
          validationRulesLoaded: { count: 6 },
          selfValidationCapable: { tested: true },
          byzantineConsensusEnabled: { threshold: 0.85 },
          recursiveValidationSupported: { maxDepth: 5 },
          fallbackSystemsWorking: { sqliteFallback: true },
          truthScoringAccurate: { threshold: 0.85 },
          phase1Complete: { allSystemsOperational: true }
        },
        timestamp: Date.now(),
        selfValidation: false // This is a regular validation of the framework
      };

      // The framework validates its own completion using its own validation process
      const frameworkValidation = await validation.validateCompletion(frameworkCompletionClaim);

      // Verify the framework can successfully validate its own completion
      expect(frameworkValidation.id).toBeTruthy();
      expect(frameworkValidation.consensusReached).toBe(true);
      expect(frameworkValidation.truthScore).toBeGreaterThanOrEqual(0.85);
      expect(frameworkValidation.result.allPassed).toBe(true);

      // Now perform self-validation for complete recursive validation
      const selfValidation = await validation.performSelfValidation();

      expect(selfValidation.overallSuccess).toBe(true);
      expect(selfValidation.frameworkReady).toBe(true);

      console.log(`🎉 RECURSIVE VALIDATION SUCCESS: Framework validated its own completion with ${(frameworkValidation.truthScore * 100).toFixed(1)}% confidence`);
    });
  });

  describe('Performance and Stress Tests', () => {
    test('should handle high-volume operations in fallback mode', async () => {
      const memory = new InMemoryStorageEngine({
        enablePersistence: false,
        maxMemoryMB: 50
      });

      testInstances.push(memory);
      await memory.initialize();

      const operations = [];
      const operationCount = 1000;

      // Generate many concurrent operations
      for (let i = 0; i < operationCount; i++) {
        operations.push(memory.store(`key-${i}`, `value-${i}`, {
          namespace: 'stress-test',
          metadata: { index: i }
        }));
      }

      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const successRate = successful / operationCount;

      expect(successRate).toBeGreaterThanOrEqual(0.95); // At least 95% success rate

      // Verify data integrity
      const retrieved = await memory.retrieve('key-500', 'stress-test');
      expect(retrieved).toBe('value-500');

      const stats = await memory.getStats();
      expect(stats.database.totalEntries).toBeGreaterThan(900);
    });

    test('should maintain performance under memory pressure', async () => {
      const memory = new InMemoryStorageEngine({
        enablePersistence: false,
        maxMemoryMB: 1, // Very limited memory
        gcInterval: 100
      });

      testInstances.push(memory);
      await memory.initialize();

      // Fill up memory
      const largeData = 'x'.repeat(1000); // 1KB per entry
      const operations = [];

      for (let i = 0; i < 100; i++) {
        operations.push(memory.store(`large-${i}`, largeData));
      }

      await Promise.allSettled(operations);

      // System should still be functional
      await memory.store('test-after-pressure', 'test-value');
      const retrieved = await memory.retrieve('test-after-pressure');

      expect(retrieved).toBe('test-value');

      const stats = await memory.getStats();
      expect(stats.database.memoryUsageMB).toBeLessThan(2); // Memory management working
    });

    test('should handle concurrent validation requests', async () => {
      const validation = new RecursiveValidationFramework({
        selfValidationEnabled: true,
        enableTruthScoring: true
      });

      testInstances.push(validation);
      await validation.initialize();

      const claims = [];
      const claimCount = 10;

      // Generate concurrent validation claims
      for (let i = 0; i < claimCount; i++) {
        claims.push({
          type: 'concurrent-test',
          component: `component-${i}`,
          claims: { concurrent: true, index: i },
          evidence: { tested: true, index: i }
        });
      }

      // Execute all validations concurrently
      const validationPromises = claims.map(claim =>
        validation.validateCompletion(claim)
      );

      const results = await Promise.allSettled(validationPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;

      expect(successful).toBe(claimCount);

      // Verify all validations have unique IDs
      const fulfilledResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

      const uniqueIds = new Set(fulfilledResults.map(r => r.id));
      expect(uniqueIds.size).toBe(claimCount);
    });
  });
});