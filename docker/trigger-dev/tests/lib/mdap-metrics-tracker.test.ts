/**
 * Tests for MDAP Metrics Tracker
 *
 * Validates metrics recording, deprecation logic, and tier recommendations.
 */

import {
  recordMetric,
  getModelMetrics,
  getAllModelMetrics,
  checkDeprecation,
  checkAllModelsForDeprecation,
  getRecommendedTier,
  clearAllMetrics,
  printMetricsSummary,
  getMetricsSummary,
  DEPRECATION_THRESHOLDS,
  MIN_ATTEMPTS_FOR_DEPRECATION,
} from '../../src/lib/mdap-metrics-tracker.js';

// Clear metrics before each test to ensure isolation
beforeEach(async () => {
  await clearAllMetrics();
});

describe('MDAP Metrics Tracker', () => {
  describe('recordMetric', () => {
    it('should record a successful metric', async () => {
      await recordMetric(
        {
          taskId: 'task-1',
          microTaskId: 'micro-1',
          modelName: 'openai/gpt-oss-20b',
          modelTier: 1,
          success: true,
          durationMs: 1500,
          estimatedCost: 0.001,
        },
        true, // validationPassed
        0.85  // qualityScore
      );

      const metrics = await getModelMetrics('openai/gpt-oss-20b');
      expect(metrics).toBeDefined();
      expect(metrics!.totalAttempts).toBe(1);
      expect(metrics!.successfulAttempts).toBe(1);
      expect(metrics!.failedAttempts).toBe(0);
      expect(metrics!.successRate).toBe(1.0);
      expect(metrics!.avgQualityScore).toBe(0.85);
      expect(metrics!.avgDurationMs).toBe(1500);
    });

    it('should record a failed metric', async () => {
      await recordMetric(
        {
          taskId: 'task-1',
          microTaskId: 'micro-1',
          modelName: 'openai/gpt-oss-20b',
          modelTier: 1,
          success: false,
          durationMs: 500,
          estimatedCost: 0.001,
        },
        false, // validationPassed
        0.3    // qualityScore
      );

      const metrics = await getModelMetrics('openai/gpt-oss-20b');
      expect(metrics).toBeDefined();
      expect(metrics!.totalAttempts).toBe(1);
      expect(metrics!.successfulAttempts).toBe(0);
      expect(metrics!.failedAttempts).toBe(1);
      expect(metrics!.successRate).toBe(0);
    });

    it('should calculate rolling averages correctly', async () => {
      // Record two metrics
      await recordMetric(
        {
          taskId: 'task-1',
          microTaskId: 'micro-1',
          modelName: 'openai/gpt-oss-20b',
          modelTier: 1,
          success: true,
          durationMs: 1000,
          estimatedCost: 0.001,
        },
        true,
        0.80
      );

      await recordMetric(
        {
          taskId: 'task-2',
          microTaskId: 'micro-2',
          modelName: 'openai/gpt-oss-20b',
          modelTier: 1,
          success: true,
          durationMs: 2000,
          estimatedCost: 0.002,
        },
        true,
        0.90
      );

      const metrics = await getModelMetrics('openai/gpt-oss-20b');
      expect(metrics!.totalAttempts).toBe(2);
      expect(metrics!.avgQualityScore).toBeCloseTo(0.85, 2); // (0.80 + 0.90) / 2
      expect(metrics!.avgDurationMs).toBeCloseTo(1500, 0);   // (1000 + 2000) / 2
      expect(metrics!.avgCost).toBeCloseTo(0.0015, 4);       // (0.001 + 0.002) / 2
    });
  });

  describe('checkDeprecation', () => {
    it('should not deprecate a model with insufficient attempts', async () => {
      // Record a few failures (less than MIN_ATTEMPTS_FOR_DEPRECATION)
      for (let i = 0; i < 5; i++) {
        await recordMetric(
          {
            taskId: `task-${i}`,
            microTaskId: `micro-${i}`,
            modelName: 'openai/gpt-oss-20b',
            modelTier: 1,
            success: false,
            durationMs: 500,
            estimatedCost: 0.001,
          },
          false,
          0.2
        );
      }

      const isDeprecated = await checkDeprecation('openai/gpt-oss-20b');
      expect(isDeprecated).toBe(false);
    });

    it('should deprecate a T1 model with low success rate after enough attempts', async () => {
      // Record enough failures to trigger deprecation
      // T1 threshold is 60%
      const threshold = DEPRECATION_THRESHOLDS[1];
      const attempts = MIN_ATTEMPTS_FOR_DEPRECATION;

      // Record 50% success rate (below 60% threshold)
      for (let i = 0; i < attempts / 2; i++) {
        await recordMetric(
          {
            taskId: `task-success-${i}`,
            microTaskId: `micro-success-${i}`,
            modelName: 'openai/gpt-oss-20b',
            modelTier: 1,
            success: true,
            durationMs: 1000,
            estimatedCost: 0.001,
          },
          true,
          0.8
        );
      }

      for (let i = 0; i < attempts / 2; i++) {
        await recordMetric(
          {
            taskId: `task-fail-${i}`,
            microTaskId: `micro-fail-${i}`,
            modelName: 'openai/gpt-oss-20b',
            modelTier: 1,
            success: false,
            durationMs: 500,
            estimatedCost: 0.001,
          },
          false,
          0.2
        );
      }

      const isDeprecated = await checkDeprecation('openai/gpt-oss-20b');
      expect(isDeprecated).toBe(true);

      const metrics = await getModelMetrics('openai/gpt-oss-20b');
      expect(metrics!.isDeprecated).toBe(true);
      expect(metrics!.deprecationReason).toContain('Success rate');
      expect(metrics!.deprecationReason).toContain('below threshold');
    });

    it('should not deprecate a model with good success rate', async () => {
      // Record high success rate (above threshold)
      const attempts = MIN_ATTEMPTS_FOR_DEPRECATION;

      // 90% success rate
      for (let i = 0; i < Math.floor(attempts * 0.9); i++) {
        await recordMetric(
          {
            taskId: `task-success-${i}`,
            microTaskId: `micro-success-${i}`,
            modelName: 'openai/gpt-oss-20b',
            modelTier: 1,
            success: true,
            durationMs: 1000,
            estimatedCost: 0.001,
          },
          true,
          0.85
        );
      }

      for (let i = 0; i < Math.ceil(attempts * 0.1); i++) {
        await recordMetric(
          {
            taskId: `task-fail-${i}`,
            microTaskId: `micro-fail-${i}`,
            modelName: 'openai/gpt-oss-20b',
            modelTier: 1,
            success: false,
            durationMs: 500,
            estimatedCost: 0.001,
          },
          false,
          0.3
        );
      }

      const isDeprecated = await checkDeprecation('openai/gpt-oss-20b');
      expect(isDeprecated).toBe(false);
    });
  });

  describe('getRecommendedTier', () => {
    it('should recommend T1 for simple tasks with no failures', async () => {
      const tier = await getRecommendedTier('simple', 0);
      expect(tier).toBe(1);
    });

    it('should recommend T2 for moderate tasks', async () => {
      const tier = await getRecommendedTier('moderate', 0);
      expect(tier).toBe(2);
    });

    it('should recommend T3 for complex tasks', async () => {
      const tier = await getRecommendedTier('complex', 0);
      expect(tier).toBe(3);
    });

    it('should escalate tier based on failure count', async () => {
      const tier = await getRecommendedTier('simple', 2);
      expect(tier).toBe(3); // 1 (base) + 2 (failures) = 3
    });

    it('should cap tier at 3', async () => {
      const tier = await getRecommendedTier('complex', 5);
      expect(tier).toBe(3); // Max tier is 3
    });
  });

  describe('getAllModelMetrics', () => {
    it('should return all tracked models', async () => {
      // Record metrics for multiple models
      await recordMetric(
        {
          taskId: 'task-1',
          microTaskId: 'micro-1',
          modelName: 'openai/gpt-oss-20b',
          modelTier: 1,
          success: true,
          durationMs: 1000,
          estimatedCost: 0.001,
        },
        true,
        0.8
      );

      await recordMetric(
        {
          taskId: 'task-2',
          microTaskId: 'micro-2',
          modelName: 'openai/gpt-oss-120b',
          modelTier: 3,
          success: true,
          durationMs: 2000,
          estimatedCost: 0.005,
        },
        true,
        0.95
      );

      const allMetrics = await getAllModelMetrics();
      expect(allMetrics.length).toBe(2);

      const t1Model = allMetrics.find(m => m.modelName === 'openai/gpt-oss-20b');
      const t3Model = allMetrics.find(m => m.modelName === 'openai/gpt-oss-120b');

      expect(t1Model).toBeDefined();
      expect(t3Model).toBeDefined();
      expect(t1Model!.tier).toBe(1);
      expect(t3Model!.tier).toBe(3);
    });
  });

  describe('getMetricsSummary', () => {
    it('should return summary with aggregated metrics', async () => {
      // Record metrics for multiple models
      await recordMetric(
        {
          taskId: 'task-1',
          microTaskId: 'micro-1',
          modelName: 'openai/gpt-oss-20b',
          modelTier: 1,
          success: true,
          durationMs: 1000,
          estimatedCost: 0.001,
        },
        true,
        0.8
      );

      await recordMetric(
        {
          taskId: 'task-2',
          microTaskId: 'micro-2',
          modelName: 'openai/gpt-oss-20b',
          modelTier: 1,
          success: false,
          durationMs: 500,
          estimatedCost: 0.001,
        },
        false,
        0.3
      );

      const summary = await getMetricsSummary();

      expect(summary.totalAttempts).toBe(2);
      expect(summary.overallSuccessRate).toBe(0.5); // 1 success / 2 attempts
      expect(summary.deprecatedCount).toBe(0);
      expect(summary.models.length).toBe(1);
    });
  });

  describe('printMetricsSummary', () => {
    it('should not throw when printing summary', async () => {
      // Record some metrics
      await recordMetric(
        {
          taskId: 'task-1',
          microTaskId: 'micro-1',
          modelName: 'openai/gpt-oss-20b',
          modelTier: 1,
          success: true,
          durationMs: 1000,
          estimatedCost: 0.001,
        },
        true,
        0.8
      );

      // Should not throw
      await expect(printMetricsSummary()).resolves.not.toThrow();
    });

    it('should handle empty metrics gracefully', async () => {
      // Should not throw even with no metrics
      await expect(printMetricsSummary()).resolves.not.toThrow();
    });
  });
});
