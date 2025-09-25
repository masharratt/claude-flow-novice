/**
 * Phase 4 Feature Flag Integration Tests
 * Validates controlled rollout deployment system
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  Phase4FeatureFlagSystem,
  FeatureFlagManager,
  TruthBasedValidator,
  HookInterceptor,
  RolloutMonitor,
  RolloutController,
  Phase4Environment
} from '../../src/feature-flags/index.js';

describe('Phase 4 Feature Flag Integration', () => {
  let system: Phase4FeatureFlagSystem;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Store original environment
    originalEnv = process.env;

    // Set test environment variables
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      TRUTH_VALIDATION_ENABLED: 'false',
      BYZANTINE_CONSENSUS_ENABLED: 'false',
      HOOK_INTERCEPTION_ENABLED: 'false',
      MONITORING_ENABLED: 'true',
      MONITORING_INTERVAL_MS: '1000'
    };

    system = new Phase4FeatureFlagSystem('test');
  });

  afterEach(async () => {
    await system.shutdown();
    process.env = originalEnv;
  });

  describe('System Initialization', () => {
    test('should initialize all components successfully', async () => {
      await system.initialize();

      expect(system.flagManager).toBeInstanceOf(FeatureFlagManager);
      expect(system.validator).toBeInstanceOf(TruthBasedValidator);
      expect(system.interceptor).toBeInstanceOf(HookInterceptor);
      expect(system.monitor).toBeInstanceOf(RolloutMonitor);
      expect(system.rolloutController).toBeInstanceOf(RolloutController);
      expect(system.environment).toBeInstanceOf(Phase4Environment);
    });

    test('should create Phase 4 feature flags during initialization', async () => {
      await system.initialize();

      const flags = system.flagManager.getAllFlags();
      const flagNames = flags.map(f => f.name);

      expect(flagNames).toContain('truth-based-validation');
      expect(flagNames).toContain('byzantine-consensus');
      expect(flagNames).toContain('hook-interception');
    });

    test('should validate configuration on initialization', async () => {
      const configValidation = system.environment.validateConfiguration();

      expect(configValidation).toHaveProperty('valid');
      expect(configValidation).toHaveProperty('issues');
      expect(Array.isArray(configValidation.issues)).toBe(true);
    });
  });

  describe('Feature Flag Management', () => {
    beforeEach(async () => {
      await system.initialize();
    });

    test('should enable and disable flags without system restart', async () => {
      const flagName = 'truth-based-validation';

      // Initially disabled
      let isEnabled = await system.isFeatureEnabled(flagName);
      expect(isEnabled).toBe(false);

      // Enable flag
      await system.flagManager.enableFlag(flagName);
      isEnabled = await system.isFeatureEnabled(flagName);
      expect(isEnabled).toBe(true);

      // Disable flag
      await system.flagManager.disableFlag(flagName);
      isEnabled = await system.isFeatureEnabled(flagName);
      expect(isEnabled).toBe(false);
    });

    test('should respect rollout percentage for gradual deployment', async () => {
      const flagName = 'truth-based-validation';
      await system.flagManager.enableFlag(flagName);
      await system.flagManager.increaseRollout(flagName, 10);

      let enabledCount = 0;
      const totalTests = 100;

      for (let i = 0; i < totalTests; i++) {
        const isEnabled = await system.isFeatureEnabled(flagName, `user-${i}`);
        if (isEnabled) enabledCount++;
      }

      // Should be approximately 10% (allowing for variance)
      expect(enabledCount).toBeGreaterThan(5);
      expect(enabledCount).toBeLessThan(20);
    });

    test('should handle user-specific feature flag evaluation', async () => {
      const flagName = 'byzantine-consensus';
      await system.flagManager.enableFlag(flagName);
      await system.flagManager.increaseRollout(flagName, 50);

      // Same user should get consistent results
      const userId = 'test-user-123';
      const result1 = await system.isFeatureEnabled(flagName, userId);
      const result2 = await system.isFeatureEnabled(flagName, userId);

      expect(result1).toBe(result2);
    });
  });

  describe('Truth-Based Validation', () => {
    beforeEach(async () => {
      process.env.TRUTH_VALIDATION_ENABLED = 'true';
      await system.initialize();
    });

    test('should validate task completion with truth scoring', async () => {
      const task = {
        id: 'test-task-1',
        description: 'Implement feature flag validation system',
        expectedOutput: { success: true },
        actualOutput: { success: true },
        context: { userId: 'test-user' },
        userId: 'test-user'
      };

      const result = await system.validateTaskCompletion(task);

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('truthScore');
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('consensusNodes');
      expect(result.truthScore).toBeGreaterThan(0);
      expect(result.truthScore).toBeLessThanOrEqual(1);
    });

    test('should handle validation with missing expected output', async () => {
      const task = {
        id: 'test-task-2',
        description: 'Test task without expected output',
        actualOutput: { result: 'completed' },
        context: { timestamp: Date.now() },
        userId: 'test-user'
      };

      const result = await system.validateTaskCompletion(task);

      expect(result).toHaveProperty('isValid');
      expect(result.truthScore).toBeGreaterThan(0);
    });

    test('should maintain validation history', async () => {
      const taskId = 'history-test-task';
      const task = {
        id: taskId,
        description: 'Task for history testing',
        context: {},
        userId: 'test-user'
      };

      await system.validateTaskCompletion(task);
      await system.validateTaskCompletion(task);

      const history = system.validator.getValidationHistory(taskId);
      expect(history.length).toBe(2);
    });
  });

  describe('Hook Interception', () => {
    beforeEach(async () => {
      process.env.HOOK_INTERCEPTION_ENABLED = 'true';
      process.env.AUTO_RELAUNCH_ENABLED = 'true';
      await system.initialize();
    });

    test('should intercept and execute hooks successfully', async () => {
      const execution = {
        hookType: 'pre-task' as const,
        command: 'echo',
        args: ['test hook execution'],
        timestamp: new Date().toISOString(),
        userId: 'test-user'
      };

      const result = await system.executeHook(execution);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('relaunchAttempts');
      expect(result.success).toBe(true);
      expect(result.output).toContain('test hook execution');
    });

    test('should attempt auto-relaunch on failure', async () => {
      const execution = {
        hookType: 'post-task' as const,
        command: 'false', // Command that always fails
        args: [],
        timestamp: new Date().toISOString(),
        userId: 'test-user'
      };

      const result = await system.executeHook(execution);

      expect(result.success).toBe(false);
      expect(result.relaunchAttempts).toBeGreaterThan(0);
    });

    test('should maintain execution history', async () => {
      const sessionId = 'test-session-123';
      const execution = {
        hookType: 'notify' as const,
        command: 'echo',
        args: ['notification'],
        timestamp: new Date().toISOString(),
        sessionId,
        userId: 'test-user'
      };

      await system.executeHook(execution);

      const history = system.interceptor.getExecutionHistory(sessionId);
      expect(history.length).toBe(1);
      expect(history[0].hookType).toBe('notify');
    });
  });

  describe('Rollout Management', () => {
    beforeEach(async () => {
      await system.initialize();
    });

    test('should create Phase 4 rollout plan with proper stages', async () => {
      const flagName = 'truth-based-validation';
      const planId = await system.startGradualRollout(flagName);

      const plan = system.rolloutController.getRolloutStatus(planId);

      expect(plan).toBeDefined();
      expect(plan!.flagName).toBe(flagName);
      expect(plan!.stages).toHaveLength(3);
      expect(plan!.stages[0].targetPercentage).toBe(5);
      expect(plan!.stages[1].targetPercentage).toBe(10);
      expect(plan!.stages[2].targetPercentage).toBe(25);
    });

    test('should enforce Phase 4 rollout limits', async () => {
      const flagName = 'byzantine-consensus';

      await expect(
        system.flagManager.increaseRollout(flagName, 30)
      ).rejects.toThrow(/rollout limited/i);
    });

    test('should handle rollback scenarios', async () => {
      const flagName = 'hook-interception';

      await system.flagManager.enableFlag(flagName);
      await system.flagManager.increaseRollout(flagName, 10);

      await system.flagManager.rollback(flagName, 'Test rollback');

      const flags = system.flagManager.getAllFlags();
      const flag = flags.find(f => f.name === flagName);

      expect(flag!.enabled).toBe(false);
      expect(flag!.rolloutPercentage).toBe(0);
    });
  });

  describe('Monitoring and Alerts', () => {
    beforeEach(async () => {
      await system.initialize();
    });

    test('should generate dashboard data', async () => {
      const dashboardData = await system.monitor.generateDashboardData();

      expect(dashboardData).toHaveProperty('flags');
      expect(dashboardData).toHaveProperty('systemHealth');
      expect(dashboardData).toHaveProperty('alerts');
      expect(dashboardData).toHaveProperty('performance');
      expect(Array.isArray(dashboardData.flags)).toBe(true);
    });

    test('should track system metrics', async () => {
      const validatorMetrics = system.validator.getSystemMetrics();
      const interceptorMetrics = system.interceptor.getSystemMetrics();

      expect(validatorMetrics).toHaveProperty('totalValidations');
      expect(validatorMetrics).toHaveProperty('avgTruthScore');
      expect(validatorMetrics).toHaveProperty('consensusNodes');

      expect(interceptorMetrics).toHaveProperty('totalExecutions');
      expect(interceptorMetrics).toHaveProperty('runningProcesses');
    });

    test('should handle emergency shutdown', async () => {
      await system.flagManager.enableFlag('truth-based-validation');
      await system.flagManager.enableFlag('byzantine-consensus');

      await system.emergencyDisable('Test emergency shutdown');

      const flags = system.flagManager.getAllFlags();
      const enabledFlags = flags.filter(f => f.enabled);

      expect(enabledFlags).toHaveLength(0);
    });
  });

  describe('Environment Configuration', () => {
    test('should load configuration from environment variables', () => {
      process.env.TRUTH_ROLLOUT_PERCENTAGE = '15';
      process.env.CONSENSUS_THRESHOLD = '0.8';

      const env = new Phase4Environment('test');

      expect(env.get('TRUTH_ROLLOUT_PERCENTAGE')).toBe(15);
      expect(env.get('CONSENSUS_THRESHOLD')).toBe(0.8);
    });

    test('should apply environment-specific overrides', () => {
      const devEnv = new Phase4Environment('development');
      const prodEnv = new Phase4Environment('production');

      expect(devEnv.get('ROLLOUT_ERROR_THRESHOLD')).toBeGreaterThan(
        prodEnv.get('ROLLOUT_ERROR_THRESHOLD')
      );
      expect(prodEnv.get('ROLLOUT_AUTO_PROGRESS')).toBe(false);
    });
  });

  describe('Success Criteria Validation', () => {
    beforeEach(async () => {
      await system.initialize();
    });

    test('should validate that feature flags toggle without system restart', async () => {
      const flagName = 'truth-based-validation';

      // This test validates the requirement without actual restart
      await system.flagManager.enableFlag(flagName);
      let isEnabled = await system.isFeatureEnabled(flagName);
      expect(isEnabled).toBe(true);

      await system.flagManager.disableFlag(flagName);
      isEnabled = await system.isFeatureEnabled(flagName);
      expect(isEnabled).toBe(false);
    });

    test('should validate 10% user rollout with <1% critical error rate', async () => {
      const report = await system.generateDeploymentReport();

      expect(report.successCriteria.rolloutErrorRateBelowThreshold).toBe(true);
      expect(report.deployment.totalFlags).toBeGreaterThan(0);
    });

    test('should validate system performance impact <5% during rollout', async () => {
      const report = await system.generateDeploymentReport();

      expect(report.successCriteria.systemPerformanceImpactBelow5Percent).toBe(true);
    });

    test('should validate monitoring coverage 99%+ data reliability', async () => {
      const report = await system.generateDeploymentReport();

      expect(report.successCriteria.monitoringCoverage).toBe(true);
    });

    test('should validate rapid enable/disable functionality', async () => {
      const startTime = Date.now();

      await system.flagManager.enableFlag('byzantine-consensus');
      await system.flagManager.disableFlag('byzantine-consensus');

      const duration = Date.now() - startTime;

      // Should complete in under 1 second for rapid response
      expect(duration).toBeLessThan(1000);

      const report = await system.generateDeploymentReport();
      expect(report.successCriteria.rapidEnableDisableFunctional).toBe(true);
    });
  });

  describe('Integration with Hooks System', () => {
    beforeEach(async () => {
      await system.initialize();
    });

    test('should integrate with hooks pre-task execution', async () => {
      const preTaskResult = await system.executeHook({
        hookType: 'pre-task',
        command: 'npx',
        args: ['claude-flow@alpha', 'hooks', 'pre-task', '--description', 'Phase 4 test'],
        timestamp: new Date().toISOString(),
        userId: 'test-user'
      });

      expect(preTaskResult).toHaveProperty('success');
      expect(preTaskResult).toHaveProperty('duration');
    });

    test('should integrate with hooks post-task execution', async () => {
      const postTaskResult = await system.executeHook({
        hookType: 'post-task',
        command: 'npx',
        args: ['claude-flow@alpha', 'hooks', 'post-task', '--task-id', 'test-task'],
        timestamp: new Date().toISOString(),
        userId: 'test-user'
      });

      expect(postTaskResult).toHaveProperty('success');
    });
  });

  describe('Byzantine Consensus Integration', () => {
    beforeEach(async () => {
      process.env.BYZANTINE_CONSENSUS_ENABLED = 'true';
      process.env.MAX_CONSENSUS_AGENTS = '5';
      await system.initialize();
    });

    test('should validate with Byzantine consensus when enabled', async () => {
      const task = {
        id: 'consensus-test',
        description: 'Test Byzantine consensus validation',
        context: { consensusRequired: true },
        userId: 'test-user'
      };

      const result = await system.validateTaskCompletion(task);

      expect(result.consensusNodes).toBeGreaterThan(0);
      expect(result.metadata.method).toMatch(/consensus|hybrid/);
    });
  });
});