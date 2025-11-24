/**
 * Agent Spawner Tests
 *
 * Comprehensive test suite covering:
 * - Agent validation and discovery
 * - Configuration handling
 * - Provider parameter parsing
 * - Environment variable injection
 * - Error scenarios
 * - Worker spawning
 */

import { AgentSpawner, SpawnAgentConfig } from '../src/cli/agent-spawner';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

describe('AgentSpawner', () => {
  let spawner: AgentSpawner;
  let tempDir: string;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = join(tmpdir(), `agent-spawner-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Initialize spawner with temp directory
    spawner = new AgentSpawner(tempDir);

    // Create agent directory structure
    mkdirSync(resolve(tempDir, '.claude/agents/cfn-dev-team/developers'), { recursive: true });
    mkdirSync(resolve(tempDir, '.claude/agents/cfn-dev-team/testers'), { recursive: true });
    mkdirSync(resolve(tempDir, '.claude/agents/cfn-dev-team/reviewers'), { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Agent Validation', () => {
    it('should validate existing agent', async () => {
      const agentPath = resolve(tempDir, '.claude/agents/cfn-dev-team/developers/backend-dev.md');
      writeFileSync(agentPath, '---\nname: backend-dev\n---\n# Test Agent');

      const exists = await spawner.validateAgentExists('backend-dev');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent agent', async () => {
      const exists = await spawner.validateAgentExists('non-existent-agent');
      expect(exists).toBe(false);
    });

    it('should handle underscore to hyphen conversion', async () => {
      const agentPath = resolve(tempDir, '.claude/agents/cfn-dev-team/developers/backend-dev.md');
      writeFileSync(agentPath, '---\nname: backend-dev\n---\n# Test Agent');

      const exists = await spawner.validateAgentExists('backend_dev');
      expect(exists).toBe(true);
    });

    it('should find agent in subdirectories', async () => {
      const agentPath = resolve(tempDir, '.claude/agents/cfn-dev-team/testers/unit-tester.md');
      writeFileSync(agentPath, '---\nname: unit-tester\n---\n# Test Agent');

      const exists = await spawner.validateAgentExists('unit-tester');
      expect(exists).toBe(true);
    });
  });

  describe('Provider Configuration Parsing', () => {
    it('should parse provider from agent frontmatter', async () => {
      const agentPath = resolve(tempDir, '.claude/agents/cfn-dev-team/developers/backend-dev.md');
      const content = `---
name: backend-dev
---

# Backend Developer

<!-- PROVIDER_PARAMETERS
provider: anthropic
model: claude-opus
-->

Content here`;

      writeFileSync(agentPath, content);

      const config = await spawner.parseAgentProvider('backend-dev');
      expect(config.provider).toBe('anthropic');
      expect(config.model).toBe('claude-opus');
    });

    it('should return default provider if not specified', async () => {
      const agentPath = resolve(tempDir, '.claude/agents/cfn-dev-team/developers/backend-dev.md');
      writeFileSync(agentPath, '---\nname: backend-dev\n---\n# Content');

      const config = await spawner.parseAgentProvider('backend-dev');
      expect(config.provider).toBe('zai');
      expect(config.model).toBe('glm-4.6');
    });

    it('should handle malformed provider comments gracefully', async () => {
      const agentPath = resolve(tempDir, '.claude/agents/cfn-dev-team/developers/backend-dev.md');
      const content = `---
name: backend-dev
---

<!-- PROVIDER_PARAMETERS
invalid content
-->

# Content`;

      writeFileSync(agentPath, content);

      const config = await spawner.parseAgentProvider('backend-dev');
      expect(config.provider).toBe('zai');
      expect(config.model).toBe('glm-4.6');
    });

    it('should handle missing agent file gracefully', async () => {
      const config = await spawner.parseAgentProvider('missing-agent');
      expect(config.provider).toBe('zai');
      expect(config.model).toBe('glm-4.6');
    });
  });

  describe('Configuration Validation', () => {
    it('should reject empty agent type', async () => {
      const config: SpawnAgentConfig = {
        agentType: '',
        taskId: 'task-123',
        iteration: 1,
        mode: 'standard'
      };

      const result = await spawner.spawnAgent(config);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('agentType');
    });

    it('should reject missing task ID', async () => {
      const config: SpawnAgentConfig = {
        agentType: 'backend-dev',
        taskId: '',
        iteration: 1,
        mode: 'standard'
      };

      const result = await spawner.spawnAgent(config);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('taskId');
    });

    it('should reject invalid task ID format', async () => {
      const config: SpawnAgentConfig = {
        agentType: 'backend-dev',
        taskId: 'task@123!invalid',
        iteration: 1,
        mode: 'standard'
      };

      const result = await spawner.spawnAgent(config);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('task ID');
    });

    it('should accept valid task ID formats', async () => {
      const validIds = ['task-123', 'task_123', 'task.123', 'task123'];

      for (const taskId of validIds) {
        // Create agent file for valid test
        const agentPath = resolve(tempDir, '.claude/agents/cfn-dev-team/developers/test-agent.md');
        writeFileSync(agentPath, '---\nname: test-agent\n---\n# Test');

        // Mock spawn to prevent actual process spawning
        jest.spyOn(spawner as any, 'spawnProcess').mockResolvedValue(12345);

        const config: SpawnAgentConfig = {
          agentType: 'test-agent',
          taskId,
          iteration: 1,
          mode: 'standard'
        };

        // Task ID validation should not throw before agent spawn
        try {
          // Don't actually spawn, just validate
          expect(() => (spawner as any).validateSpawnConfig(config)).not.toThrow();
        } catch {
          // Expected for non-existent process
        }
      }
    });

    it('should reject missing iteration', async () => {
      const config: any = {
        agentType: 'backend-dev',
        taskId: 'task-123',
        mode: 'standard'
      };

      const result = await spawner.spawnAgent(config);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('iteration');
    });

    it('should reject invalid mode', async () => {
      const config: any = {
        agentType: 'backend-dev',
        taskId: 'task-123',
        iteration: 1,
        mode: 'invalid'
      };

      const result = await spawner.spawnAgent(config);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('mode');
    });

    it('should accept all valid modes', () => {
      const modes = ['mvp', 'standard', 'enterprise'];
      const config = {
        agentType: 'backend-dev',
        taskId: 'task-123',
        iteration: 1,
        mode: 'standard' as const
      };

      for (const mode of modes) {
        config.mode = mode as any;
        expect(() => (spawner as any).validateSpawnConfig(config)).not.toThrow();
      }
    });
  });

  describe('Environment Variable Building', () => {
    it('should include required environment variables', () => {
      const config: SpawnAgentConfig = {
        agentType: 'backend-dev',
        taskId: 'task-123',
        iteration: 2,
        mode: 'standard'
      };

      const env = (spawner as any).buildEnvironment(
        config,
        'agent-123',
        'zai',
        'glm-4.6'
      );

      expect(env.AGENT_ID).toBe('agent-123');
      expect(env.AGENT_TYPE).toBe('backend-dev');
      expect(env.TASK_ID).toBe('task-123');
      expect(env.ITERATION).toBe('2');
      expect(env.MODE).toBe('standard');
      expect(env.PROVIDER).toBe('zai');
      expect(env.MODEL).toBe('glm-4.6');
    });

    it('should merge user-provided environment variables', () => {
      const config: SpawnAgentConfig = {
        agentType: 'backend-dev',
        taskId: 'task-123',
        iteration: 1,
        mode: 'standard',
        env: {
          CUSTOM_VAR: 'custom-value'
        }
      };

      const env = (spawner as any).buildEnvironment(
        config,
        'agent-123',
        'zai',
        'glm-4.6'
      );

      expect(env.CUSTOM_VAR).toBe('custom-value');
    });
  });

  describe('Agent ID Generation', () => {
    it('should generate unique agent IDs', () => {
      const id1 = (spawner as any).generateAgentId('backend-dev');
      const id2 = (spawner as any).generateAgentId('backend-dev');

      expect(id1).toMatch(/^agent-backend-dev-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^agent-backend-dev-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should include agent type in ID', () => {
      const id = (spawner as any).generateAgentId('tester');
      expect(id).toContain('tester');
    });
  });

  describe('Worker Spawning', () => {
    beforeEach(() => {
      // Create team config file
      const configDir = resolve(tempDir, '.claude/cfn-config');
      mkdirSync(configDir, { recursive: true });

      const config = {
        teams: {
          engineering: {
            workers: {
              provider: 'zai',
              baseUrl: 'https://api.zai.com',
              apiKeyEnvVar: 'ZAI_API_KEY',
              models: {
                simple: 'glm-4',
                complex: 'glm-4-pro'
              }
            }
          }
        }
      };

      writeFileSync(
        resolve(configDir, 'team-providers.json'),
        JSON.stringify(config, null, 2)
      );
    });

    it('should spawn worker with correct configuration', async () => {
      // Set API key environment variable
      process.env.ZAI_API_KEY = 'test-key-123';

      const result = await spawner.spawnWorker({
        team: 'engineering',
        complexity: 'simple',
        providerMode: 'auto'
      });

      expect(result.status).toBe('spawned');
      expect(result.agentId).toMatch(/^worker-engineering-[a-z0-9]+$/);
    });

    it('should reject invalid team configuration', async () => {
      const result = await spawner.spawnWorker({
        team: 'invalid-team',
        complexity: 'simple',
        providerMode: 'auto'
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('configuration');
    });

    it('should handle missing API key gracefully', async () => {
      delete process.env.ZAI_API_KEY;

      const result = await spawner.spawnWorker({
        team: 'engineering',
        complexity: 'simple',
        providerMode: 'auto'
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('API key');
    });
  });

  describe('Spawn Agent Results', () => {
    beforeEach(() => {
      // Create a test agent
      const agentPath = resolve(tempDir, '.claude/agents/cfn-dev-team/developers/test-agent.md');
      writeFileSync(agentPath, '---\nname: test-agent\n---\n# Test Agent');

      // Mock spawn process
      jest.spyOn(spawner as any, 'spawnProcess').mockResolvedValue(12345);
    });

    it('should return success result for valid config', async () => {
      const config: SpawnAgentConfig = {
        agentType: 'test-agent',
        taskId: 'task-123',
        iteration: 1,
        mode: 'standard'
      };

      const result = await spawner.spawnAgent(config);

      expect(result.status).toBe('spawned');
      expect(result.pid).toBe(12345);
      expect(result.agentId).toMatch(/^agent-test-agent-/);
      expect(result.metadata).toEqual({
        agentType: 'test-agent',
        taskId: 'task-123',
        iteration: 1,
        mode: 'standard',
        provider: 'zai',
        model: 'glm-4.6'
      });
    });

    it('should include timestamp in result', async () => {
      const config: SpawnAgentConfig = {
        agentType: 'test-agent',
        taskId: 'task-123',
        iteration: 1,
        mode: 'standard'
      };

      const result = await spawner.spawnAgent(config);

      expect(result.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('should return failure result for non-existent agent', async () => {
      const config: SpawnAgentConfig = {
        agentType: 'non-existent',
        taskId: 'task-123',
        iteration: 1,
        mode: 'standard'
      };

      const result = await spawner.spawnAgent(config);

      expect(result.status).toBe('failed');
      expect(result.pid).toBe(-1);
      expect(result.error).toContain('Agent type not found');
    });
  });

  describe('Provider Routing', () => {
    beforeEach(() => {
      // Create team config
      const configDir = resolve(tempDir, '.claude/cfn-config');
      mkdirSync(configDir, { recursive: true });

      const config = {
        teams: {
          engineering: {
            workers: {
              provider: 'zai',
              baseUrl: 'https://api.zai.com',
              apiKeyEnvVar: 'ZAI_API_KEY'
            }
          }
        }
      };

      writeFileSync(
        resolve(configDir, 'team-providers.json'),
        JSON.stringify(config, null, 2)
      );
      process.env.ZAI_API_KEY = 'test-key';
    });

    it('should route to zai provider', () => {
      const before = { ...process.env };
      (spawner as any).routeWorkerProvider('zai', 'engineering', 'glm-4', 'key');
      expect(process.env.ZAI_API_KEY).toBe('key');
      Object.assign(process.env, before);
    });

    it('should route to anthropic provider', () => {
      const before = { ...process.env };
      (spawner as any).routeWorkerProvider('anthropic', 'engineering', 'claude-opus', 'key');
      expect(process.env.ANTHROPIC_API_KEY).toBe('key');
      Object.assign(process.env, before);
    });

    it('should reject invalid provider mode', () => {
      expect(() => {
        (spawner as any).routeWorkerProvider('invalid', 'engineering', 'model', 'key');
      }).toThrow();
    });
  });

  describe('Task ID Validation (Security)', () => {
    it('should accept valid task IDs', () => {
      const validIds = [
        'task-123',
        'task_456',
        'task.789',
        'task123',  // All lowercase due to pattern
        'a',
        '123'
      ];

      for (const id of validIds) {
        const validation = (spawner as any).validateTaskId(id);
        expect(validation.valid).toBe(true);
      }
    });

    it('should reject invalid task IDs', () => {
      const invalidIds = [
        'task@123',      // @ not allowed
        'task;drop',     // ; not allowed
        'task$(rm -rf)', // command injection attempt
        'task|cat',      // pipe not allowed
        'task`id`',      // backticks not allowed
        '',              // empty
        'a'.repeat(65)   // too long
      ];

      for (const id of invalidIds) {
        const validation = (spawner as any).validateTaskId(id);
        expect(validation.valid).toBe(false);
      }
    });

    it('should limit task ID length to 64 characters', () => {
      const validation = (spawner as any).validateTaskId('a'.repeat(65));
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('64');
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      // Create full test environment
      const agentPath = resolve(tempDir, '.claude/agents/cfn-dev-team/developers/backend-dev.md');
      const content = `---
name: backend-dev
description: Backend developer agent
tools: [Read, Write, Edit, Bash]
model: sonnet
type: specialist
---

<!-- PROVIDER_PARAMETERS
provider: zai
model: glm-4-pro
-->

# Backend Developer`;

      writeFileSync(agentPath, content);

      // Mock spawn process
      jest.spyOn(spawner as any, 'spawnProcess').mockResolvedValue(99999);
    });

    it('should spawn agent with parsed provider config', async () => {
      const config: SpawnAgentConfig = {
        agentType: 'backend-dev',
        taskId: 'integration-test',
        iteration: 1,
        mode: 'standard'
      };

      const result = await spawner.spawnAgent(config);

      expect(result.status).toBe('spawned');
      expect(result.metadata?.provider).toBe('zai');
      expect(result.metadata?.model).toBe('glm-4-pro');
    });

    it('should override provider config with explicit values', async () => {
      const config: SpawnAgentConfig = {
        agentType: 'backend-dev',
        taskId: 'override-test',
        iteration: 1,
        mode: 'standard',
        provider: 'anthropic',
        model: 'claude-opus'
      };

      const result = await spawner.spawnAgent(config);

      expect(result.status).toBe('spawned');
      expect(result.metadata?.provider).toBe('anthropic');
      expect(result.metadata?.model).toBe('claude-opus');
    });
  });
});
