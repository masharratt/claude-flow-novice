/**
 * Unit tests for spawn-agents.ts
 *
 * Tests agent type validation, CLI command formatting,
 * dry-run mode, and error handling.
 */

import { spawnAgents, spawnLoop3Agents, spawnLoop2Agents, type SpawnAgentsConfig } from '../src/helpers/spawn-agents';

describe('spawn-agents', () => {
  describe('agent type validation', () => {
    test('accepts loop3 agent type', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-1',
        iteration: 1,
        agents: ['loop3'],
        originalContext: '{"task": "test"}',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.totalSpawned).toBe(1);
      expect(summary.successCount).toBe(1);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]!.agentType).toBe('loop3');
    });

    test('accepts loop2 agent type', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-2',
        iteration: 1,
        agents: ['loop2'],
        originalContext: '{"task": "test"}',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.totalSpawned).toBe(1);
      expect(summary.successCount).toBe(1);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]!.agentType).toBe('loop2');
    });

    // Agent types are open-ended (any profile under .claude/agents), so validation
    // is charset-only: reject names with characters outside [a-z0-9_-].
    test('rejects agent type with invalid characters', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-3',
        iteration: 1,
        agents: ['invalid agent!'],
        originalContext: '{"task": "test"}',
        dryRun: true,
      };

      await expect(spawnAgents(config)).rejects.toThrow('Invalid agent type');
    });

    test('validates all agents in array', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-4',
        iteration: 1,
        agents: ['loop3', 'bad type!'],
        originalContext: '{"task": "test"}',
        dryRun: true,
      };

      await expect(spawnAgents(config)).rejects.toThrow('Invalid agent type');
    });
  });

  describe('CLI command formatting', () => {
    test('formats valid spawn command for loop3', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-5',
        iteration: 2,
        agents: ['loop3'],
        originalContext: 'test-context',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]!.success).toBe(true);
      expect(summary.results[0]!.agentType).toBe('loop3');
      expect(summary.results[0]!.agentId).toMatch(/loop3-2-\d+/);
    });

    test('formats valid spawn command for loop2', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-6',
        iteration: 3,
        agents: ['loop2'],
        originalContext: 'test-context',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]!.success).toBe(true);
      expect(summary.results[0]!.agentType).toBe('loop2');
      expect(summary.results[0]!.agentId).toMatch(/loop2-3-\d+/);
    });

    test('sanitizes special characters in input', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-7!@#$',
        iteration: 1,
        agents: ['loop3'],
        originalContext: 'context-with-special!@#$',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.totalSpawned).toBe(1);
      // Command should execute with sanitized inputs
      expect(summary.successCount).toBe(1);
    });
  });

  describe('dry-run mode', () => {
    test('dry-run mode logs command without executing', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-8',
        iteration: 1,
        agents: ['loop3'],
        originalContext: '{"task": "dry-run-test"}',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.totalSpawned).toBe(1);
      expect(summary.successCount).toBe(1);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]!.success).toBe(true);
      expect(summary.results[0]!.pid).toBeUndefined();
    });

    test('dry-run mode succeeds for multiple agents', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-9',
        iteration: 1,
        agents: ['loop3', 'loop2'],
        originalContext: 'context',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.totalSpawned).toBe(2);
      expect(summary.successCount).toBe(2);
      expect(summary.results.every((r) => r.success)).toBe(true);
    });
  });

  describe('error handling', () => {
    test('throws error on missing task ID', async () => {
      const config = {
        taskId: '',
        iteration: 1,
        agents: ['loop3'],
        originalContext: 'context',
        dryRun: true,
      } as SpawnAgentsConfig;

      await expect(spawnAgents(config)).rejects.toThrow('Task ID is required');
    });

    test('throws error on invalid iteration', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task',
        iteration: -1,
        agents: ['loop3'],
        originalContext: 'context',
        dryRun: true,
      };

      await expect(spawnAgents(config)).rejects.toThrow('Iteration must be a non-negative integer');
    });

    test('throws error on empty agents array', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task',
        iteration: 1,
        agents: [],
        originalContext: 'context',
        dryRun: true,
      };

      await expect(spawnAgents(config)).rejects.toThrow('Agents array is required');
    });

    test('throws error on missing context', async () => {
      const config = {
        taskId: 'test-task',
        iteration: 1,
        agents: ['loop3'],
        originalContext: '',
        dryRun: true,
      } as SpawnAgentsConfig;

      await expect(spawnAgents(config)).rejects.toThrow('Original context is required');
    });
  });

  describe('spawn summary', () => {
    test('returns accurate spawn summary', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-10',
        iteration: 1,
        agents: ['loop3', 'loop2'],
        originalContext: 'context',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.totalSpawned).toBe(2);
      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(0);
      expect(summary.results).toHaveLength(2);
      expect(summary.duration).toBeGreaterThan(0);
    });

    test('counts failures correctly', async () => {
      // We can't easily trigger real failures in dry-run mode,
      // but we can verify the structure is correct
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-11',
        iteration: 1,
        agents: ['loop3'],
        originalContext: 'context',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.successCount + summary.failureCount).toBe(summary.totalSpawned);
    });
  });

  describe('convenience functions', () => {
    test('spawnLoop3Agents works correctly', async () => {
      const summary = await spawnLoop3Agents('test-task-12', 1, ['loop3'], 'context', true);
      expect(summary.totalSpawned).toBe(1);
      expect(summary.successCount).toBe(1);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]!.agentType).toBe('loop3');
    });

    test('spawnLoop2Agents works correctly', async () => {
      const summary = await spawnLoop2Agents('test-task-13', 2, ['loop2'], 'context', true);
      expect(summary.totalSpawned).toBe(1);
      expect(summary.successCount).toBe(1);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]!.agentType).toBe('loop2');
    });
  });

  describe('iteration tracking', () => {
    test('tracks iteration numbers in agent IDs', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-14',
        iteration: 5,
        agents: ['loop3'],
        originalContext: 'context',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]!.agentId).toMatch(/loop3-5-/);
    });

    test('tracks instance numbers for duplicate agent types', async () => {
      const config: SpawnAgentsConfig = {
        taskId: 'test-task-15',
        iteration: 1,
        agents: ['loop3', 'loop3'],
        originalContext: 'context',
        dryRun: true,
      };

      const summary = await spawnAgents(config);
      expect(summary.results).toHaveLength(2);
      expect(summary.results[0]!.agentId).toMatch(/loop3-1-1/);
      expect(summary.results[1]!.agentId).toMatch(/loop3-1-2/);
    });
  });
});
