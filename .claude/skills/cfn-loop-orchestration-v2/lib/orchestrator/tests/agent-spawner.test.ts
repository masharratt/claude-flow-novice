/**
 * Unit tests for agent-spawner module
 * Validates agent spawning logic and configuration
 */

import { AgentSpawner } from '../src/agent-spawner/agent-spawner';
import { ExecutionMode, AgentSpec } from '../src/types';

describe('agent-spawner', () => {
  describe('spawnAgents', () => {
    it('should spawn agents with correct IDs for Loop 3', async () => {
      const taskId = 'test-task-123';
      const agents = await AgentSpawner.spawnAgents(taskId, 3, 2, 'mvp');

      expect(agents).toHaveLength(2);
      expect(agents[0].id).toBe('test-task-123-loop3-agent0');
      expect(agents[1].id).toBe('test-task-123-loop3-agent1');
    });

    it('should spawn agents with correct IDs for Loop 2', async () => {
      const taskId = 'test-task-456';
      const agents = await AgentSpawner.spawnAgents(taskId, 2, 3, 'standard');

      expect(agents).toHaveLength(3);
      expect(agents[0].id).toBe('test-task-456-loop2-agent0');
      expect(agents[1].id).toBe('test-task-456-loop2-agent1');
      expect(agents[2].id).toBe('test-task-456-loop2-agent2');
    });

    it('should set correct agent type based on loop number', async () => {
      const loop3Agents = await AgentSpawner.spawnAgents('task-1', 3, 1, 'mvp');
      const loop2Agents = await AgentSpawner.spawnAgents('task-2', 2, 1, 'mvp');

      expect(loop3Agents[0].type).toBe('loop3-agent');
      expect(loop2Agents[0].type).toBe('loop2-agent');
    });

    it('should set default memory configuration', async () => {
      const agents = await AgentSpawner.spawnAgents('task', 3, 1, 'standard');

      expect(agents[0].memoryTier).toBe(2);
      expect(agents[0].memoryLimit).toBe('1g');
    });

    it('should handle zero agent count', async () => {
      const agents = await AgentSpawner.spawnAgents('task', 3, 0, 'mvp');

      expect(agents).toHaveLength(0);
    });

    it('should handle large agent counts', async () => {
      const agents = await AgentSpawner.spawnAgents('task', 3, 10, 'enterprise');

      expect(agents).toHaveLength(10);
      agents.forEach((agent, index) => {
        expect(agent.id).toBe(`task-loop3-agent${index}`);
      });
    });

    it('should work with all execution modes', async () => {
      const modes: ExecutionMode[] = ['mvp', 'standard', 'enterprise'];

      for (const mode of modes) {
        const agents = await AgentSpawner.spawnAgents('task', 3, 1, mode);
        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
          memoryTier: 2,
          memoryLimit: '1g',
        });
      }
    });

    it('should handle special characters in task ID', async () => {
      const specialTaskId = 'task-with-special_chars.123';
      const agents = await AgentSpawner.spawnAgents(specialTaskId, 3, 1, 'mvp');

      expect(agents[0].id).toBe('task-with-special_chars.123-loop3-agent0');
    });

    it('should create unique IDs for each agent in same spawn', async () => {
      const agents = await AgentSpawner.spawnAgents('task', 3, 5, 'standard');
      const ids = new Set(agents.map((a) => a.id));

      expect(ids.size).toBe(5); // All IDs should be unique
    });

    it('should return agents in correct order', async () => {
      const agents = await AgentSpawner.spawnAgents('task', 3, 3, 'mvp');

      expect(agents[0].id).toContain('agent0');
      expect(agents[1].id).toContain('agent1');
      expect(agents[2].id).toContain('agent2');
    });
  });

  describe('edge cases', () => {
    it('should handle negative agent count gracefully', async () => {
      const agents = await AgentSpawner.spawnAgents('task', 3, -1, 'mvp');
      expect(agents).toHaveLength(0);
    });

    it('should handle empty task ID', async () => {
      const agents = await AgentSpawner.spawnAgents('', 3, 1, 'mvp');
      expect(agents[0].id).toBe('-loop3-agent0');
    });

    it('should handle very long task IDs', async () => {
      const longTaskId = 'a'.repeat(1000);
      const agents = await AgentSpawner.spawnAgents(longTaskId, 3, 1, 'mvp');
      expect(agents[0].id).toContain(longTaskId);
    });

    it('should preserve agent spec structure', async () => {
      const agents = await AgentSpawner.spawnAgents('task', 3, 1, 'mvp');

      expect(agents[0]).toEqual<AgentSpec>({
        id: expect.any(String),
        type: expect.any(String),
        memoryTier: expect.any(Number),
        memoryLimit: expect.any(String),
      });
    });
  });
});
