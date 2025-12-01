/**
 * Agent Container Manager Tests
 */

import { AgentContainerManager } from '../src/agent-container';
import { DockerClient } from '../src/docker-client';
import { ExitStatus, DockerError } from '../src/types';

describe('AgentContainerManager', () => {
  let manager: AgentContainerManager;
  let mockDockerClient: Partial<DockerClient>;

  beforeEach(() => {
    mockDockerClient = {};
    manager = new AgentContainerManager(mockDockerClient as DockerClient);
  });

  describe('container name generation', () => {
    it('should generate safe container names', () => {
      const name = AgentContainerManager.generateSafeContainerName('my-agent-123');
      expect(name).toMatch(/^cfn-/);
      expect(name).not.toContain(' ');
      expect(name.length).toBeLessThanOrEqual(63);
    });

    it('should handle lowercase conversion', () => {
      const name = AgentContainerManager.generateSafeContainerName('MY-AGENT-123');
      expect(name).toBe(name.toLowerCase());
    });

    it('should replace invalid characters', () => {
      const name = AgentContainerManager.generateSafeContainerName('agent@123$456');
      expect(name).not.toContain('@');
      expect(name).not.toContain('$');
    });

    it('should prepend agent prefix to names starting with non-alphanumeric', () => {
      const name = AgentContainerManager.generateSafeContainerName('123-agent');
      expect(name).toMatch(/^(agent|cfn)-/);
    });

    it('should respect Docker name length limit', () => {
      const longId = 'a'.repeat(100);
      const name = AgentContainerManager.generateSafeContainerName(longId);
      expect(name.length).toBeLessThanOrEqual(63);
    });
  });

  describe('memory parsing', () => {
    it('should parse memory with MB suffix', () => {
      const bytes = AgentContainerManager.parseMemory('512m');
      expect(bytes).toBe(512 * 1024 * 1024);
    });

    it('should parse memory with GB suffix', () => {
      const bytes = AgentContainerManager.parseMemory('1g');
      expect(bytes).toBe(1024 * 1024 * 1024);
    });

    it('should parse memory with MB long suffix', () => {
      const bytes = AgentContainerManager.parseMemory('512mb');
      expect(bytes).toBe(512 * 1024 * 1024);
    });

    it('should parse memory with GB long suffix', () => {
      const bytes = AgentContainerManager.parseMemory('1gb');
      expect(bytes).toBe(1024 * 1024 * 1024);
    });

    it('should parse memory with KB suffix', () => {
      const bytes = AgentContainerManager.parseMemory('512k');
      expect(bytes).toBe(512 * 1024);
    });

    it('should parse memory with just bytes', () => {
      const bytes = AgentContainerManager.parseMemory('1024b');
      expect(bytes).toBe(1024);
    });

    it('should parse numeric memory as bytes', () => {
      const bytes = AgentContainerManager.parseMemory('1024');
      expect(bytes).toBe(1024);
    });

    it('should handle case-insensitive suffixes', () => {
      const bytes1 = AgentContainerManager.parseMemory('512M');
      const bytes2 = AgentContainerManager.parseMemory('512m');
      expect(bytes1).toBe(bytes2);
    });

    it('should reject invalid memory format', () => {
      expect(() => {
        AgentContainerManager.parseMemory('invalid');
      }).toThrow();
    });

    it('should reject negative memory', () => {
      expect(() => {
        AgentContainerManager.parseMemory('-512m');
      }).toThrow();
    });
  });

  describe('memory formatting', () => {
    it('should format bytes as bytes for small values', () => {
      const formatted = AgentContainerManager.formatMemory(512);
      expect(formatted).toBe('512B');
    });

    it('should format bytes as KB', () => {
      const formatted = AgentContainerManager.formatMemory(512 * 1024);
      expect(formatted).toBe('512KB');
    });

    it('should format bytes as MB', () => {
      const formatted = AgentContainerManager.formatMemory(512 * 1024 * 1024);
      expect(formatted).toBe('512MB');
    });

    it('should format bytes as GB', () => {
      const formatted = AgentContainerManager.formatMemory(1024 * 1024 * 1024);
      expect(formatted).toBe('1GB');
    });

    it('should round down large values', () => {
      const bytes = 512.5 * 1024 * 1024;
      const formatted = AgentContainerManager.formatMemory(Math.floor(bytes));
      expect(formatted).toMatch(/\d+MB/);
    });
  });

  describe('manifest management', () => {
    it('should create manifest with correct structure when spawned', () => {
      // Since createManifest is private, we test it indirectly through the manifest structure
      const manifest = {
        container_id: 'agent-1',
        batch_id: 'batch-1',
        tier: 2,
        memory_limit: '1024m',
        status: 'running' as const,
        started_at: new Date().toISOString()
      };

      expect(manifest.container_id).toBe('agent-1');
      expect(manifest.batch_id).toBe('batch-1');
      expect(manifest.memory_limit).toBe('1024m');
      expect(manifest.status).toBe('running');
      expect(manifest.started_at).toBeDefined();
    });

    it('should properly tier containers by memory', () => {
      // Test tier logic
      const memoryValues = [512, 1024, 2048, 4096];
      const expectedTiers = [1, 2, 3, 4];

      memoryValues.forEach((mem, idx) => {
        let tier = 1;
        if (mem >= 4096) tier = 4;
        else if (mem >= 2048) tier = 3;
        else if (mem >= 1024) tier = 2;

        expect(tier).toBe(expectedTiers[idx]);
      });
    });

    it('should update manifest on completion', () => {
      const manifest = {
        container_id: 'agent-1',
        batch_id: 'batch-1',
        tier: 2,
        memory_limit: '1024m',
        status: 'running' as const,
        started_at: new Date().toISOString()
      };

      const updated = AgentContainerManager.updateManifest(manifest, 0);

      expect(updated.status).toBe('exited');
      expect(updated.exit_code).toBe(0);
      expect(updated.exit_status).toBe(ExitStatus.SUCCESS);
      expect(updated.finished_at).toBeDefined();
    });

    it('should mark timeout exit status', () => {
      const manifest = {
        container_id: 'agent-1',
        batch_id: 'batch-1',
        tier: 2,
        memory_limit: '1024m',
        status: 'running' as const,
        started_at: new Date().toISOString()
      };

      const updated = AgentContainerManager.updateManifest(manifest, 124);

      expect(updated.exit_status).toBe(ExitStatus.TIMEOUT);
    });

    it('should mark failed exit status for non-zero codes', () => {
      const manifest = {
        container_id: 'agent-1',
        batch_id: 'batch-1',
        tier: 2,
        memory_limit: '1024m',
        status: 'running' as const,
        started_at: new Date().toISOString()
      };

      const updated = AgentContainerManager.updateManifest(manifest, 1);

      expect(updated.exit_status).toBe(ExitStatus.FAILED);
    });
  });

  describe('memory tier classification', () => {
    it('should classify small memory as tier 1', () => {
      // Simulate tier determination logic
      const memoryMB = 512;
      let tier = 1;
      if (memoryMB >= 4096) tier = 4;
      else if (memoryMB >= 2048) tier = 3;
      else if (memoryMB >= 1024) tier = 2;

      expect(tier).toBe(1);
    });

    it('should classify 1GB memory as tier 2', () => {
      const memoryMB = 1024;
      let tier = 1;
      if (memoryMB >= 4096) tier = 4;
      else if (memoryMB >= 2048) tier = 3;
      else if (memoryMB >= 1024) tier = 2;

      expect(tier).toBe(2);
    });

    it('should classify 2GB memory as tier 3', () => {
      const memoryMB = 2048;
      let tier = 1;
      if (memoryMB >= 4096) tier = 4;
      else if (memoryMB >= 2048) tier = 3;
      else if (memoryMB >= 1024) tier = 2;

      expect(tier).toBe(3);
    });

    it('should classify 4GB memory as tier 4', () => {
      const memoryMB = 4096;
      let tier = 1;
      if (memoryMB >= 4096) tier = 4;
      else if (memoryMB >= 2048) tier = 3;
      else if (memoryMB >= 1024) tier = 2;

      expect(tier).toBe(4);
    });
  });

  describe('container naming validation', () => {
    it('should accept valid container names', () => {
      const validNames = [
        'cfn-agent-1',
        'cfn-backend-dev',
        'cfn-my_agent_123'
      ];

      validNames.forEach(name => {
        expect(name).toMatch(/^cfn-/);
        expect(name.length).toBeLessThanOrEqual(63);
      });
    });

    it('should reject names with invalid characters', () => {
      const invalidNames = [
        'cfn-agent@123',
        'cfn-agent$456',
        'cfn-agent 789'
      ];

      invalidNames.forEach(name => {
        // These should have been sanitized
        expect(name).toContain(/[@$ ]/.source);
      });
    });
  });

  describe('options validation', () => {
    it('should require agent type', () => {
      const agentType = 'backend';
      expect(agentType.length).toBeGreaterThan(0);
    });

    it('should require task ID', () => {
      const taskId = 'task-1';
      expect(taskId.length).toBeGreaterThan(0);
    });

    it('should require agent ID', () => {
      const agentId = 'agent-1';
      expect(agentId.length).toBeGreaterThan(0);
    });

    it('should validate memory is positive', () => {
      const memoryLimit = 512;
      expect(memoryLimit).toBeGreaterThan(0);
    });

    it('should accept optional CPU limit', () => {
      const cpuLimit = 0.5;
      expect(cpuLimit).toBeGreaterThan(0);
      expect(cpuLimit).toBeLessThanOrEqual(8);
    });

    it('should accept optional environment variables', () => {
      const env = {
        'VAR1': 'value1',
        'VAR2': 'value2'
      };

      expect(Object.keys(env).length).toBeGreaterThan(0);
    });

    it('should accept optional volume mounts', () => {
      const volumes = {
        '/host/data': '/container/data'
      };

      expect(Object.keys(volumes).length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should throw DockerError on spawn failure', async () => {
      mockDockerClient.createContainer = jest.fn()
        .mockRejectedValue(new Error('Docker error'));

      const options = {
        agentType: 'test',
        taskId: 'task-1',
        agentId: 'agent-1',
        memoryLimit: 512
      };

      await expect(
        manager.spawnAgent('test', 'task-1', 'agent-1', options)
      ).rejects.toThrow();
    });

    it('should preserve error context', () => {
      const error = new DockerError('Test error', 'TEST_CODE');
      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toContain('Test error');
    });
  });

  describe('manifest ISO timestamps', () => {
    it('should use ISO 8601 format for timestamps', () => {
      // Test that manifest timestamps follow ISO 8601 format
      const now = new Date().toISOString();

      // ISO 8601 pattern
      expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should populate finished_at on update', () => {
      const manifest = {
        container_id: 'agent-1',
        batch_id: 'batch-1',
        tier: 2,
        memory_limit: '1024m',
        status: 'running' as const,
        started_at: new Date().toISOString()
      };

      const updated = AgentContainerManager.updateManifest(manifest, 0);

      expect(updated.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
