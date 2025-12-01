/**
 * RuVector MDAP Integration Tests
 *
 * Tests the end-to-end flow from MDAP task execution through RuVector
 * analytics and back to tier selection.
 *
 * Test Flow:
 * 1. Trigger MDAP task with simple prompt
 * 2. Record outcome to RuVector
 * 3. Verify metrics stored correctly
 * 4. Trigger analysis
 * 5. Verify recommendations generated
 * 6. Test tier selection uses RuVector data
 *
 * @module tests/integration/ruvector-mdap-integration.test
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  recordMDAPOutcome,
  analyzeMDAPModelPerformance,
  generatePromptOptimizations,
  queryModelPerformancePatterns,
  selectModelTierWithRuVector,
  captureMDAPFailure,
  getMDAPAnalyticsSummary,
  resetPerformanceStore,
  getPerformanceStore,
  type MDAPOutcomeInput,
} from '../../src/lib/ruvector-mdap-analytics.js';

// =============================================
// Test Setup
// =============================================

describe('RuVector MDAP Integration', () => {
  beforeEach(() => {
    resetPerformanceStore();
  });

  afterEach(() => {
    resetPerformanceStore();
  });

  // =============================================
  // Full Coordinator Flow Test
  // =============================================

  describe('Coordinator to RuVector Flow', () => {
    it('should complete full MDAP execution and analytics cycle', async () => {
      // Step 1: Simulate MDAP task execution
      const microTask = {
        id: 'micro-task-001',
        description: 'Create a hello world function',
        category: 'architecture',
        targetFile: 'hello.ts',
      };

      // Step 2: Record successful outcome
      await recordMDAPOutcome({
        modelName: 'llama3.1-8b',
        tier: 1,
        taskType: 'simple',
        success: true,
        qualityScore: 0.88,
        durationMs: 1200,
        cost: 0.0008,
        taskCategory: microTask.category,
      });

      // Step 3: Verify metrics stored
      const store = getPerformanceStore();
      expect(store.models.has('llama3.1-8b')).toBe(true);

      const modelData = store.models.get('llama3.1-8b');
      expect(modelData!.attempts.length).toBe(1);
      expect(modelData!.attempts[0].success).toBe(true);
      expect(modelData!.attempts[0].qualityScore).toBe(0.88);

      // Step 4: Get analytics summary
      const summary = await getMDAPAnalyticsSummary();
      expect(summary.modelsTracked).toBe(1);
      expect(summary.totalAttempts).toBe(1);
      expect(summary.overallSuccessRate).toBe(1.0);
    });

    it('should track tier escalation through coordinator flow', async () => {
      const microTaskId = 'escalation-test-001';

      // T1 attempt fails
      await recordMDAPOutcome({
        modelName: 'llama3.1-8b',
        tier: 1,
        taskType: 'simple',
        success: false,
        qualityScore: 0.35,
        durationMs: 2500,
        cost: 0.0012,
        errorPatterns: ['Type error: property undefined'],
      });

      await captureMDAPFailure(
        microTaskId,
        'llama3.1-8b',
        1,
        'TYPE_ERROR',
        'Cannot read property of undefined',
        false,
        2
      );

      // T2 attempt succeeds
      await recordMDAPOutcome({
        modelName: 'llama-3.3-70b',
        tier: 2,
        taskType: 'simple',
        success: true,
        qualityScore: 0.92,
        durationMs: 3200,
        cost: 0.0045,
      });

      // Verify both models tracked
      const store = getPerformanceStore();
      expect(store.models.size).toBe(2);

      // T1 should have failure patterns
      const t1Data = store.models.get('llama3.1-8b');
      expect(t1Data!.failurePatterns.size).toBeGreaterThan(0);

      // T2 should have success
      const t2Data = store.models.get('llama-3.3-70b');
      expect(t2Data!.attempts[0].success).toBe(true);
    });
  });

  // =============================================
  // Analysis Integration Tests
  // =============================================

  describe('Analysis and Recommendations', () => {
    it('should generate analysis after sufficient data', async () => {
      // Build up data (need 10+ attempts for meaningful analysis)
      for (let i = 0; i < 15; i++) {
        await recordMDAPOutcome({
          modelName: 'analysis-test-model',
          tier: 1,
          taskType: 'simple',
          success: i < 12, // 80% success
          qualityScore: i < 12 ? 0.85 : 0.40,
          durationMs: 1500,
          cost: 0.001,
          errorPatterns: i >= 12 ? ['Analysis test error'] : undefined,
        });
      }

      // Trigger analysis
      const analysis = await analyzeMDAPModelPerformance('analysis-test-model');

      expect(analysis.metrics).toBeDefined();
      expect(analysis.metrics!.totalAttempts).toBe(15);
      expect(analysis.metrics!.successRate).toBeCloseTo(0.80, 1);
      expect(analysis.confidence).toBeGreaterThan(0.3);

      // Should not be underperforming at 80%
      expect(analysis.isUnderperforming).toBe(false);
      expect(analysis.recommendedAction).toBe('continue');
    });

    it('should generate prompt optimizations for failing model', async () => {
      // Create a failing model
      for (let i = 0; i < 10; i++) {
        await recordMDAPOutcome({
          modelName: 'failing-model',
          tier: 1,
          taskType: 'simple',
          success: false,
          qualityScore: 0.30,
          durationMs: 2000,
          cost: 0.001,
          errorPatterns: ['TypeError: missing type annotation'],
        });
      }

      // Get optimizations
      const optimizations = await generatePromptOptimizations('failing-model', 1);

      expect(optimizations.failurePatterns.length).toBeGreaterThan(0);
      expect(optimizations.recommendations.length).toBeGreaterThan(0);
      expect(optimizations.basedOnAttempts).toBe(10);

      // Should have type-related recommendation
      const hasTypeRec = optimizations.recommendations.some(r =>
        r.addition.toLowerCase().includes('type')
      );
      expect(hasTypeRec).toBe(true);
    });
  });

  // =============================================
  // Tier Selection Integration Tests
  // =============================================

  describe('Tier Selection with RuVector', () => {
    it('should use RuVector data for intelligent tier selection', async () => {
      // Build strong T1 history
      for (let i = 0; i < 25; i++) {
        await recordMDAPOutcome({
          modelName: 'strong-t1-model',
          tier: 1,
          taskType: 'simple',
          success: i < 23, // 92% success
          qualityScore: 0.88,
          durationMs: 1200,
          cost: 0.001,
        });
      }

      // For simple task with no failures, should prefer T1
      const tier = await selectModelTierWithRuVector('simple', 0);
      expect(tier).toBe(1);
    });

    it('should escalate when historical model performance is poor', async () => {
      // Build poor T1 history
      for (let i = 0; i < 25; i++) {
        await recordMDAPOutcome({
          modelName: 'poor-t1-model',
          tier: 1,
          taskType: 'simple',
          success: i < 10, // 40% success (below threshold)
          qualityScore: i < 10 ? 0.75 : 0.25,
          durationMs: 2500,
          cost: 0.001,
          errorPatterns: i >= 10 ? ['Failure'] : undefined,
        });
      }

      // With failure count and poor history, should escalate
      const tier = await selectModelTierWithRuVector('simple', 1);
      expect(tier).toBeGreaterThan(1);
    });

    it('should use T3 for complex tasks regardless of history', async () => {
      // Even with good T1 history
      for (let i = 0; i < 20; i++) {
        await recordMDAPOutcome({
          modelName: 'good-t1-model',
          tier: 1,
          taskType: 'simple',
          success: true,
          qualityScore: 0.90,
          durationMs: 1000,
          cost: 0.0008,
        });
      }

      // Complex tasks should still start at T3
      const tier = await selectModelTierWithRuVector('complex', 0);
      expect(tier).toBe(3);
    });
  });

  // =============================================
  // Performance Pattern Queries
  // =============================================

  describe('Performance Pattern Queries', () => {
    it('should identify best and worst models across tiers', async () => {
      // Create models at different performance levels
      for (let i = 0; i < 10; i++) {
        await recordMDAPOutcome({
          modelName: 'best-model',
          tier: 1,
          taskType: 'simple',
          success: true,
          qualityScore: 0.95,
          durationMs: 1000,
          cost: 0.0008,
        });

        await recordMDAPOutcome({
          modelName: 'worst-model',
          tier: 2,
          taskType: 'simple',
          success: i < 3, // 30% success
          qualityScore: 0.50,
          durationMs: 3000,
          cost: 0.004,
          errorPatterns: i >= 3 ? ['Failed'] : undefined,
        });
      }

      const patterns = await queryModelPerformancePatterns('implementation', 'simple');

      expect(patterns.bestPerformingModel).toBe('best-model');
      expect(patterns.worstPerformingModel).toBe('worst-model');
      expect(patterns.patternsAnalyzed).toBe(2);
      expect(patterns.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate actionable recommendations', async () => {
      // Build model data
      for (let i = 0; i < 15; i++) {
        await recordMDAPOutcome({
          modelName: 'recommendation-model',
          tier: 1,
          taskType: 'simple',
          success: i < 14, // 93% success
          qualityScore: 0.88,
          durationMs: 1100,
          cost: 0.001,
        });
      }

      const patterns = await queryModelPerformancePatterns('implementation', 'simple');

      // Should have recommendations
      expect(patterns.recommendations.length).toBeGreaterThan(0);

      // Historical success should be high
      expect(patterns.historicalSuccessRate).toBeGreaterThan(0.90);
    });
  });

  // =============================================
  // Metrics Consistency Tests
  // =============================================

  describe('Metrics Consistency', () => {
    it('should maintain consistent metrics across operations', async () => {
      const modelName = 'consistency-test';

      // Record 20 outcomes
      for (let i = 0; i < 20; i++) {
        await recordMDAPOutcome({
          modelName,
          tier: 1,
          taskType: 'simple',
          success: i % 2 === 0, // 50% success
          qualityScore: 0.70,
          durationMs: 1500,
          cost: 0.001,
          errorPatterns: i % 2 !== 0 ? ['Error'] : undefined,
        });
      }

      // Get store state
      const store = getPerformanceStore();
      const modelData = store.models.get(modelName);

      // Get analysis
      const analysis = await analyzeMDAPModelPerformance(modelName);

      // Get summary
      const summary = await getMDAPAnalyticsSummary();

      // Verify consistency
      expect(modelData!.attempts.length).toBe(20);
      expect(analysis.metrics!.totalAttempts).toBe(20);
      expect(summary.totalAttempts).toBe(20);

      // Success rates should match
      const storeSuccessRate = modelData!.attempts.filter(a => a.success).length / 20;
      expect(storeSuccessRate).toBeCloseTo(analysis.metrics!.successRate, 2);
      expect(storeSuccessRate).toBeCloseTo(summary.overallSuccessRate, 2);
    });

    it('should handle rapid sequential recordings', async () => {
      const modelName = 'rapid-test';

      // Rapid sequential recordings
      for (let i = 0; i < 50; i++) {
        await recordMDAPOutcome({
          modelName,
          tier: 1,
          taskType: 'simple',
          success: Math.random() > 0.3, // ~70% success
          qualityScore: 0.75 + Math.random() * 0.20,
          durationMs: 1000 + Math.random() * 1000,
          cost: 0.001,
        });
      }

      const store = getPerformanceStore();
      expect(store.models.get(modelName)!.attempts.length).toBe(50);

      const analysis = await analyzeMDAPModelPerformance(modelName);
      expect(analysis.metrics!.totalAttempts).toBe(50);
      expect(analysis.confidence).toBeGreaterThan(0.5);
    });
  });

  // =============================================
  // Error Recovery Flow
  // =============================================

  describe('Error Recovery Flow', () => {
    it('should track error patterns through recovery', async () => {
      const microTaskId = 'recovery-test';
      const modelName = 'recovery-model';

      // Record initial failure with error pattern
      await recordMDAPOutcome({
        modelName,
        tier: 1,
        taskType: 'simple',
        success: false,
        qualityScore: 0.25,
        durationMs: 2000,
        cost: 0.001,
        errorPatterns: ['Syntax error: unexpected token'],
      });

      await captureMDAPFailure(
        microTaskId,
        modelName,
        1,
        'SYNTAX',
        'Unexpected token in output',
        false
      );

      // Record second failure with different error
      await recordMDAPOutcome({
        modelName,
        tier: 1,
        taskType: 'simple',
        success: false,
        qualityScore: 0.30,
        durationMs: 1800,
        cost: 0.001,
        errorPatterns: ['Import error: module not found'],
      });

      // Finally succeed
      await recordMDAPOutcome({
        modelName,
        tier: 1,
        taskType: 'simple',
        success: true,
        qualityScore: 0.85,
        durationMs: 1500,
        cost: 0.001,
      });

      // Verify error patterns tracked
      const store = getPerformanceStore();
      const modelData = store.models.get(modelName);

      expect(modelData!.failurePatterns.size).toBeGreaterThan(0);
      expect(modelData!.attempts.length).toBe(3);

      // Get optimizations based on failure patterns
      const optimizations = await generatePromptOptimizations(modelName, 1);
      expect(optimizations.failurePatterns.length).toBeGreaterThan(0);
    });
  });

  // =============================================
  // Summary Statistics
  // =============================================

  describe('Summary Statistics', () => {
    it('should generate accurate summary across multiple models', async () => {
      // Model A: High performer
      for (let i = 0; i < 10; i++) {
        await recordMDAPOutcome({
          modelName: 'model-a',
          tier: 1,
          taskType: 'simple',
          success: i < 9, // 90%
          qualityScore: 0.88,
          durationMs: 1200,
          cost: 0.001,
        });
      }

      // Model B: Low performer
      for (let i = 0; i < 15; i++) {
        await recordMDAPOutcome({
          modelName: 'model-b',
          tier: 2,
          taskType: 'moderate',
          success: i < 7, // 47%
          qualityScore: 0.55,
          durationMs: 2500,
          cost: 0.003,
          errorPatterns: i >= 7 ? ['Failure'] : undefined,
        });
      }

      const summary = await getMDAPAnalyticsSummary();

      expect(summary.modelsTracked).toBe(2);
      expect(summary.totalAttempts).toBe(25);

      // Overall: (9 + 7) / 25 = 64%
      expect(summary.overallSuccessRate).toBeCloseTo(0.64, 1);

      // Model B should be flagged as underperforming
      expect(summary.underperformingModels.length).toBeGreaterThan(0);
      expect(summary.underperformingModels.some(m => m.includes('model-b'))).toBe(true);
    });
  });
});
