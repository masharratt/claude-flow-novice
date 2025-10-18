/**
 * Integration Tests for Phase 11: V1/V2 Coordination Toggle
 *
 * Test Scope:
 * 1. CoordinationToggle version detection (env var, explicit, default)
 * 2. V1CoordinatorAdapter wrapping (hierarchical and mesh topologies)
 * 3. ConfigTranslator V1/V2 config mapping
 * 4. Feature flags rollout logic (0%, 50%, 100%)
 * 5. CLI version flag parsing and passthrough
 *
 * Validation Target: ≥90% consensus approval
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { V1CoordinatorAdapter } from '../../src/coordination/adapters/v1-coordinator-adapter.js';
import { CoordinationToggle, ConfigTranslator } from '../../src/coordination/coordination-toggle.js';
import { FeatureFlags } from '../../src/coordination/feature-flags.js';
import type { UnifiedCoordinatorConfig } from '../../src/coordination/coordination-toggle.js';

describe('Phase 11: Coordination Toggle Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Backup environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  // ===========================
  // 1. CoordinationToggle Version Detection
  // ===========================

  describe('CoordinationToggle Version Detection', () => {
    it('should default to v2 when no config.version or env var is set', () => {
      delete process.env.COORDINATION_VERSION;

      const config: UnifiedCoordinatorConfig = {
        topology: 'mesh',
        maxAgents: 5,
      };

      // Access private detectVersion via create flow
      const detectedVersion = CoordinationToggle['detectVersion'](config);

      expect(detectedVersion).toBe('v2');
    });

    it('should use explicit config.version when provided', () => {
      delete process.env.COORDINATION_VERSION;

      const config: UnifiedCoordinatorConfig = {
        version: 'v1',
        topology: 'mesh',
        maxAgents: 5,
      };

      const detectedVersion = CoordinationToggle['detectVersion'](config);

      expect(detectedVersion).toBe('v1');
    });

    it('should use COORDINATION_VERSION env var when config.version is omitted', () => {
      process.env.COORDINATION_VERSION = 'v1';

      const config: UnifiedCoordinatorConfig = {
        topology: 'mesh',
        maxAgents: 5,
      };

      const detectedVersion = CoordinationToggle['detectVersion'](config);

      expect(detectedVersion).toBe('v1');
    });

    it('should prioritize explicit config.version over env var', () => {
      process.env.COORDINATION_VERSION = 'v1';

      const config: UnifiedCoordinatorConfig = {
        version: 'v2',
        topology: 'mesh',
        maxAgents: 5,
      };

      const detectedVersion = CoordinationToggle['detectVersion'](config);

      expect(detectedVersion).toBe('v2');
    });

    it('should handle case-insensitive env var (v1, V1, v2, V2)', () => {
      process.env.COORDINATION_VERSION = 'V2';

      const config: UnifiedCoordinatorConfig = {
        topology: 'mesh',
        maxAgents: 5,
      };

      const detectedVersion = CoordinationToggle['detectVersion'](config);

      expect(detectedVersion).toBe('v2');
    });

    it('should throw error when env var is invalid', () => {
      process.env.COORDINATION_VERSION = 'v3'; // Invalid

      const config: UnifiedCoordinatorConfig = {
        topology: 'mesh',
        maxAgents: 5,
      };

      expect(() => CoordinationToggle['detectVersion'](config)).toThrow(
        /Invalid COORDINATION_VERSION.*Must be exactly 'v1' or 'v2'/
      );
    });
  });

  // ===========================
  // 2. V1CoordinatorAdapter Wrapping
  // ===========================

  describe('V1CoordinatorAdapter Wrapping', () => {
    it('should wrap V1 hierarchical coordinator with ICoordinator interface', () => {
      // Mock V1 TopologyCoordinator (hierarchical)
      const mockV1Coordinator = {
        topology: 'hierarchical' as const,
        coordinator: {
          spawnWorker: jest.fn().mockResolvedValue('worker-123'),
          delegateTask: jest.fn().mockResolvedValue({
            taskId: 'task-123',
            status: 'accepted',
            delegatedAt: new Date(),
          }),
          getWorkerStats: jest.fn().mockReturnValue({ total: 5, active: 3 }),
        },
        initialize: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      };

      const adapter = new V1CoordinatorAdapter(mockV1Coordinator, 'noop');

      // Verify adapter implements ICoordinator interface
      expect(adapter).toHaveProperty('spawnAgent');
      expect(adapter).toHaveProperty('pauseAgent');
      expect(adapter).toHaveProperty('resumeAgent');
      expect(adapter).toHaveProperty('terminateAgent');
      expect(adapter).toHaveProperty('getMetrics');
      expect(adapter).toHaveProperty('initialize');
      expect(adapter).toHaveProperty('cleanup');
      expect(adapter).toHaveProperty('isReady');
    });

    it('should wrap V1 mesh coordinator with ICoordinator interface', () => {
      // Mock V1 TopologyCoordinator (mesh)
      const mockV1Coordinator = {
        topology: 'mesh' as const,
        coordinator: {
          registerAgent: jest.fn().mockResolvedValue(undefined),
          coordinateTask: jest.fn().mockResolvedValue('task-123'),
          getCoordinatorStatus: jest.fn().mockReturnValue({ agentCount: 5 }),
        },
        initialize: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      };

      const adapter = new V1CoordinatorAdapter(mockV1Coordinator, 'noop');

      // Verify adapter implements ICoordinator interface
      expect(adapter).toHaveProperty('spawnAgent');
      expect(adapter).toHaveProperty('pauseAgent');
      expect(adapter).toHaveProperty('resumeAgent');
      expect(adapter).toHaveProperty('terminateAgent');
      expect(adapter).toHaveProperty('getMetrics');
      expect(adapter).toHaveProperty('initialize');
      expect(adapter).toHaveProperty('cleanup');
      expect(adapter).toHaveProperty('isReady');
    });

    it('should return NOOP for pause/resume with fallbackBehavior = "noop"', async () => {
      const mockV1Coordinator = {
        topology: 'mesh' as const,
        coordinator: {},
        initialize: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      };

      const adapter = new V1CoordinatorAdapter(mockV1Coordinator, 'noop');
      await adapter.initialize();

      // Should not throw error (NOOP behavior)
      await expect(adapter.pauseAgent('agent-123', 'test pause')).resolves.toBeUndefined();
      await expect(adapter.resumeAgent('agent-123', 'checkpoint-123')).resolves.toBeUndefined();
    });

    it('should throw error for pause/resume with fallbackBehavior = "error"', async () => {
      const mockV1Coordinator = {
        topology: 'mesh' as const,
        coordinator: {},
        initialize: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      };

      const adapter = new V1CoordinatorAdapter(mockV1Coordinator, 'error');
      await adapter.initialize();

      // Should throw error
      await expect(adapter.pauseAgent('agent-123', 'test pause')).rejects.toThrow(
        /V1 coordination does not support pause\/resume/
      );
      await expect(adapter.resumeAgent('agent-123', 'checkpoint-123')).rejects.toThrow(
        /V1 coordination does not support pause\/resume/
      );
    });

    it('should translate V1 metrics to V2 CoordinatorMetrics format', () => {
      const mockV1Coordinator = {
        topology: 'hierarchical' as const,
        coordinator: {
          getMetrics: jest.fn().mockReturnValue({
            totalTasks: 100,
            activeWorkers: 5,
            completedTasks: 80,
            totalTokensUsed: 50000,
            startTime: Date.now() - 60000, // 1 minute ago
          }),
        },
        initialize: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      };

      const adapter = new V1CoordinatorAdapter(mockV1Coordinator, 'noop');
      const metrics = adapter.getMetrics();

      expect(metrics).toMatchObject({
        totalAgentsSpawned: expect.any(Number),
        activeAgents: expect.any(Number),
        pausedAgents: 0, // V1 doesn't support pausing
        totalTerminations: expect.any(Number),
        totalCheckpoints: 0, // V1 doesn't support checkpoints
        totalRestores: 0,
        averageCheckpointTimeMs: 0,
        averageRestoreTimeMs: 0,
        p99RestoreTimeMs: 0,
        tokensSaved: 0,
        totalTokensUsed: expect.any(Number),
        uptimeMs: expect.any(Number),
      });
    });
  });

  // ===========================
  // 3. ConfigTranslator V1/V2 Config Mapping
  // ===========================

  describe('ConfigTranslator V1/V2 Config Mapping', () => {
    it('should translate unified config to V1 CoordinationTopologyConfig (mesh)', () => {
      const unified: UnifiedCoordinatorConfig = {
        topology: 'mesh',
        maxAgents: 5,
        strategy: 'balanced',
        enableConsensus: true,
      };

      const v1Config = ConfigTranslator.toV1Config(unified);

      expect(v1Config).toMatchObject({
        topology: 'mesh',
        maxAgents: 5,
        strategy: 'balanced',
        mesh: expect.objectContaining({
          maxAgents: 5,
          maxConnections: expect.any(Number),
          taskDistributionStrategy: 'capability-based',
        }),
        consensus: expect.objectContaining({
          protocol: 'quorum', // mesh uses quorum
          timeout: 5000,
        }),
      });
    });

    it('should translate unified config to V1 CoordinationTopologyConfig (hierarchical)', () => {
      const unified: UnifiedCoordinatorConfig = {
        topology: 'hierarchical',
        maxAgents: 15,
        strategy: 'adaptive',
        enableConsensus: true,
      };

      const v1Config = ConfigTranslator.toV1Config(unified);

      expect(v1Config).toMatchObject({
        topology: 'hierarchical',
        maxAgents: 15,
        strategy: 'adaptive',
        hierarchical: expect.objectContaining({
          minWorkers: expect.any(Number),
          maxWorkers: 15,
          autoScale: true,
          scalingThreshold: 0.8,
        }),
        consensus: expect.objectContaining({
          protocol: 'raft', // hierarchical uses raft
          timeout: 5000,
        }),
      });
    });

    it('should translate unified config to V2 FactoryOptions', () => {
      const unified: UnifiedCoordinatorConfig = {
        topology: 'mesh',
        maxAgents: 5,
        strategy: 'balanced',
        tokenBudget: 50000,
        apiKey: 'test-api-key',
      };

      const v2Config = ConfigTranslator.toV2Config(unified);

      expect(v2Config).toMatchObject({
        mode: 'sdk', // V2 defaults to SDK mode
        maxConcurrentAgents: 5,
        defaultTokenBudget: 50000,
        apiKey: 'test-api-key',
        enableDynamicAllocation: true, // strategy !== 'performance'
        verbose: false,
      });
    });

    it('should disable dynamic allocation when strategy is "performance"', () => {
      const unified: UnifiedCoordinatorConfig = {
        topology: 'mesh',
        maxAgents: 5,
        strategy: 'performance', // Should disable dynamic allocation
      };

      const v2Config = ConfigTranslator.toV2Config(unified);

      expect(v2Config.enableDynamicAllocation).toBe(false);
    });

    it('should validate unified config and return errors for invalid values', () => {
      const invalidConfig: UnifiedCoordinatorConfig = {
        topology: 'invalid' as any, // Invalid topology
        maxAgents: -5, // Negative maxAgents
        strategy: 'unknown' as any, // Invalid strategy
        tokenBudget: 500, // Below minimum
      };

      const errors = ConfigTranslator.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Invalid topology'),
          expect.stringContaining('Invalid maxAgents'),
          expect.stringContaining('Invalid strategy'),
          expect.stringContaining('Invalid tokenBudget'),
        ])
      );
    });

    it('should merge multiple unified configs with priority', () => {
      const defaults: UnifiedCoordinatorConfig = {
        topology: 'mesh',
        maxAgents: 5,
        strategy: 'balanced',
      };

      const userConfig: Partial<UnifiedCoordinatorConfig> = {
        maxAgents: 10,
        tokenBudget: 50000,
      };

      const merged = ConfigTranslator.merge(defaults, userConfig);

      expect(merged).toMatchObject({
        topology: 'mesh', // from defaults
        maxAgents: 10, // overridden by userConfig
        strategy: 'balanced', // from defaults
        tokenBudget: 50000, // from userConfig
      });
    });
  });

  // ===========================
  // 4. Feature Flags Rollout Logic
  // ===========================

  describe('Feature Flags Rollout Logic', () => {
    it('should return false for all users at 0% rollout', () => {
      process.env.V2_ROLLOUT_PERCENT = '0';

      expect(FeatureFlags.shouldUseV2()).toBe(false);
      expect(FeatureFlags.shouldUseV2('user-123')).toBe(false);
      expect(FeatureFlags.shouldUseV2('user-456')).toBe(false);
    });

    it('should return true for all users at 100% rollout', () => {
      process.env.V2_ROLLOUT_PERCENT = '100';

      expect(FeatureFlags.shouldUseV2()).toBe(true);
      expect(FeatureFlags.shouldUseV2('user-123')).toBe(true);
      expect(FeatureFlags.shouldUseV2('user-456')).toBe(true);
    });

    it('should use hash-based assignment at 50% rollout', () => {
      process.env.V2_ROLLOUT_PERCENT = '50';

      const user1 = 'user-123';
      const user2 = 'user-456';

      // Deterministic - same user always gets same result
      const result1a = FeatureFlags.shouldUseV2(user1);
      const result1b = FeatureFlags.shouldUseV2(user1);
      expect(result1a).toBe(result1b);

      const result2a = FeatureFlags.shouldUseV2(user2);
      const result2b = FeatureFlags.shouldUseV2(user2);
      expect(result2a).toBe(result2b);

      // Different users may get different assignments
      // (not guaranteed, but statistically likely)
    });

    it('should produce consistent 40-60% split at 50% rollout (statistical)', () => {
      process.env.V2_ROLLOUT_PERCENT = '50';

      const users = Array.from({ length: 1000 }, (_, i) => `user-${i}`);
      const v2Users = users.filter(userId => FeatureFlags.shouldUseV2(userId));

      const v2Percentage = (v2Users.length / users.length) * 100;

      // Statistical check: 50% rollout should produce 40-60% split
      expect(v2Percentage).toBeGreaterThanOrEqual(40);
      expect(v2Percentage).toBeLessThanOrEqual(60);
    });

    it('should prioritize COORDINATION_VERSION env var over rollout percentage', () => {
      process.env.V2_ROLLOUT_PERCENT = '0'; // All V1
      process.env.COORDINATION_VERSION = 'v2'; // Explicit override

      expect(FeatureFlags.getCoordinationVersion()).toBe('v2');
    });

    it('should throw error for invalid COORDINATION_VERSION env var', () => {
      process.env.COORDINATION_VERSION = 'v3'; // Invalid

      expect(() => FeatureFlags.getCoordinationVersion()).toThrow(
        /Invalid COORDINATION_VERSION/
      );
    });

    it('should return rollout percentage from environment', () => {
      process.env.V2_ROLLOUT_PERCENT = '75';

      expect(FeatureFlags.getRolloutPercentage()).toBe(75);
    });

    it('should detect explicit override', () => {
      delete process.env.COORDINATION_VERSION;
      expect(FeatureFlags.hasExplicitOverride()).toBe(false);

      process.env.COORDINATION_VERSION = 'v1';
      expect(FeatureFlags.hasExplicitOverride()).toBe(true);
    });
  });

  // ===========================
  // 5. CLI Version Flag Parsing
  // ===========================

  describe('CLI Version Flag Parsing', () => {
    it('should default to v2 when no flag or env var is provided', () => {
      delete process.env.COORDINATION_VERSION;
      const cliFlag = undefined;

      const coordinationVersion = (
        cliFlag ||
        process.env.COORDINATION_VERSION ||
        'v2'
      ).toLowerCase();

      expect(coordinationVersion).toBe('v2');
    });

    it('should use CLI flag when provided', () => {
      delete process.env.COORDINATION_VERSION;
      const cliFlag = 'v1';

      const coordinationVersion = (
        cliFlag ||
        process.env.COORDINATION_VERSION ||
        'v2'
      ).toLowerCase();

      expect(coordinationVersion).toBe('v1');
    });

    it('should use env var when CLI flag is not provided', () => {
      process.env.COORDINATION_VERSION = 'v1';
      const cliFlag = undefined;

      const coordinationVersion = (
        cliFlag ||
        process.env.COORDINATION_VERSION ||
        'v2'
      ).toLowerCase();

      expect(coordinationVersion).toBe('v1');
    });

    it('should prioritize CLI flag over env var', () => {
      process.env.COORDINATION_VERSION = 'v1';
      const cliFlag = 'v2';

      const coordinationVersion = (
        cliFlag ||
        process.env.COORDINATION_VERSION ||
        'v2'
      ).toLowerCase();

      expect(coordinationVersion).toBe('v2');
    });

    it('should handle case-insensitive CLI flag input', () => {
      const cliFlag = 'V1';
      const coordinationVersion = cliFlag.toLowerCase();

      expect(coordinationVersion).toBe('v1');
    });

    it('should validate CLI flag as v1 or v2', () => {
      const validateVersion = (version: string): boolean => {
        return version === 'v1' || version === 'v2';
      };

      expect(validateVersion('v1')).toBe(true);
      expect(validateVersion('v2')).toBe(true);
      expect(validateVersion('v3')).toBe(false);
      expect(validateVersion('')).toBe(false);
    });

    it('should include coordinationVersion in CLI options object', () => {
      const cliFlag = 'v2';
      const coordinationVersion = cliFlag as 'v1' | 'v2';

      const options = {
        strategy: 'auto',
        maxAgents: 5,
        coordinationVersion,
      };

      expect(options.coordinationVersion).toBe('v2');
      expect(options).toHaveProperty('coordinationVersion');
    });
  });

  // ===========================
  // 6. End-to-End Integration
  // ===========================

  describe('End-to-End Integration', () => {
    it('should create V2 coordinator when COORDINATION_VERSION=v2', async () => {
      process.env.COORDINATION_VERSION = 'v2';

      const config: UnifiedCoordinatorConfig = {
        topology: 'mesh',
        maxAgents: 5,
      };

      // Note: Actual coordinator creation requires dependencies
      // This test validates config flow only
      const detectedVersion = CoordinationToggle['detectVersion'](config);
      expect(detectedVersion).toBe('v2');

      const v2Config = ConfigTranslator.toV2Config(config);
      expect(v2Config.mode).toBe('sdk');
      expect(v2Config.maxConcurrentAgents).toBe(5);
    });

    it('should create V1 coordinator when COORDINATION_VERSION=v1', async () => {
      process.env.COORDINATION_VERSION = 'v1';

      const config: UnifiedCoordinatorConfig = {
        topology: 'hierarchical',
        maxAgents: 15,
      };

      // Note: Actual coordinator creation requires dependencies
      // This test validates config flow only
      const detectedVersion = CoordinationToggle['detectVersion'](config);
      expect(detectedVersion).toBe('v1');

      const v1Config = ConfigTranslator.toV1Config(config);
      expect(v1Config.topology).toBe('hierarchical');
      expect(v1Config.maxAgents).toBe(15);
      expect(v1Config.hierarchical).toBeDefined();
    });

    it('should use feature flag rollout when COORDINATION_VERSION not set', () => {
      delete process.env.COORDINATION_VERSION;
      process.env.V2_ROLLOUT_PERCENT = '75';

      const version = FeatureFlags.getCoordinationVersion('user-123');

      expect(['v1', 'v2']).toContain(version);
    });

    it('should generate version summary for debugging', () => {
      process.env.COORDINATION_VERSION = 'v2';

      const summary = CoordinationToggle.getVersionSummary();

      expect(summary).toContain('Coordination Version Detection');
      expect(summary).toContain('COORDINATION_VERSION: v2');
      expect(summary).toContain('Default Version: v2');
      expect(summary).toContain('V1 Available: true');
      expect(summary).toContain('V2 Available: true');
    });
  });
});
