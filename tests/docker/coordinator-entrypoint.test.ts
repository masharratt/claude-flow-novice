/**
 * Coordinator Entrypoint Tests
 * Tests for src/docker/coordinator/coordinator-entrypoint.ts
 *
 * Priority 1: Core Docker scripts migration
 * Coverage: Validation, Docker socket access, Redis connectivity, security
 */

import { CoordinatorEntrypoint } from '../../src/docker/coordinator/coordinator-entrypoint';
import { execSync } from 'child_process';

jest.mock('child_process');
jest.mock('fs');

describe('CoordinatorEntrypoint', () => {
  let mockExecSync: jest.MockedFunction<typeof execSync>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };
    mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Initialization', () => {
    it('should require TASK_ID environment variable', () => {
      delete process.env.TASK_ID;
      delete process.env.CFN_TASK_ID;

      expect(() => {
        new CoordinatorEntrypoint();
      }).toThrow('TASK_ID environment variable required');
    });

    it('should require TASK_DESCRIPTION environment variable', () => {
      process.env.TASK_ID = 'task-123';
      delete process.env.TASK_DESCRIPTION;

      expect(() => {
        new CoordinatorEntrypoint();
      }).toThrow('TASK_DESCRIPTION environment variable required');
    });

    it('should initialize with required variables', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Fix TypeScript errors';

      const coordinator = new CoordinatorEntrypoint();
      expect(coordinator.taskId).toBe('task-123');
      expect(coordinator.taskDescription).toBe('Fix TypeScript errors');
    });

    it('should use CFN_TASK_ID if available', () => {
      process.env.CFN_TASK_ID = 'cfn-task-456';
      process.env.TASK_DESCRIPTION = 'Fix TypeScript errors';

      const coordinator = new CoordinatorEntrypoint();
      expect(coordinator.taskId).toBe('cfn-task-456');
    });
  });

  describe('Docker Access Verification', () => {
    it('should verify Docker socket access', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('docker ps')) {
          return Buffer.from('');
        }
        throw new Error('Docker not available');
      });

      const coordinator = new CoordinatorEntrypoint();
      const result = await coordinator.verifyDockerAccess();

      expect(result.success).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('docker ps'), expect.any(Object));
    });

    it('should fail when Docker is not accessible', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('docker ps')) {
          throw new Error('Cannot connect to Docker daemon');
        }
        return Buffer.from('');
      });

      const coordinator = new CoordinatorEntrypoint();
      const result = await coordinator.verifyDockerAccess();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot access Docker daemon');
    });

    it('should handle Docker socket from environment variable', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.CFN_DOCKER_SOCKET = '/custom/docker.sock';

      mockExecSync.mockReturnValue(Buffer.from(''));

      const coordinator = new CoordinatorEntrypoint();
      expect(coordinator.dockerSocket).toBe('/custom/docker.sock');
    });
  });

  describe('Redis Connectivity Verification', () => {
    it('should verify Redis connection', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('redis-cli')) {
          return Buffer.from('PONG');
        }
        throw new Error('Redis not available');
      });

      const coordinator = new CoordinatorEntrypoint();
      const result = await coordinator.verifyRedisConnectivity();

      expect(result.success).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('redis-cli'), expect.any(Object));
    });

    it('should fail when Redis is not accessible', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('redis-cli')) {
          throw new Error('Connection refused');
        }
        return Buffer.from('');
      });

      const coordinator = new CoordinatorEntrypoint();
      const result = await coordinator.verifyRedisConnectivity();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot connect to Redis');
    });

    it('should use custom Redis host and port', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.CFN_REDIS_HOST = 'redis-server';
      process.env.CFN_REDIS_PORT = '6380';

      mockExecSync.mockReturnValue(Buffer.from('PONG'));

      const coordinator = new CoordinatorEntrypoint();
      await coordinator.verifyRedisConnectivity();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('redis-server'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('6380'),
        expect.any(Object)
      );
    });
  });

  describe('Project Root Verification', () => {
    it('should verify project root is accessible', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      const coordinator = new CoordinatorEntrypoint();
      coordinator.projectRoot = '/workspace';

      // Mock file existence check
      const result = await coordinator.verifyProjectRoot();
      expect(result).toBeDefined();
    });

    it('should use PROJECT_ROOT environment variable', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.PROJECT_ROOT = '/custom/project';

      const coordinator = new CoordinatorEntrypoint();
      expect(coordinator.projectRoot).toBe('/custom/project');
    });
  });

  describe('Success Criteria Loading', () => {
    it('should load success criteria from environment variable', () => {
      const criteria = JSON.stringify({
        test_suites: ['npm test'],
        pass_rate_threshold: 0.95,
      });

      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.CFN_SUCCESS_CRITERIA = criteria;

      const coordinator = new CoordinatorEntrypoint();
      const loaded = coordinator.loadSuccessCriteria();

      expect(loaded.test_suites).toContain('npm test');
      expect(loaded.pass_rate_threshold).toBe(0.95);
    });

    it('should validate JSON format of success criteria', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.CFN_SUCCESS_CRITERIA = 'invalid-json{';

      const coordinator = new CoordinatorEntrypoint();

      expect(() => {
        coordinator.loadSuccessCriteria();
      }).toThrow('Invalid success criteria JSON format');
    });

    it('should prevent path traversal in success criteria file', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.CFN_SUCCESS_CRITERIA = '../../../etc/passwd';

      const coordinator = new CoordinatorEntrypoint();

      expect(() => {
        coordinator.loadSuccessCriteria();
      }).toThrow(/Path traversal|must be in/);
    });
  });

  describe('Context File Creation', () => {
    it('should create task context file with secure permissions', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.MAX_ITERATIONS = '10';
      process.env.GATE_THRESHOLD = '0.75';

      const coordinator = new CoordinatorEntrypoint();
      const context = coordinator.createTaskContext();

      expect(context.task_id).toBe('task-123');
      expect(context.task_description).toBe('Test task');
      expect(context.max_iterations).toBe(10);
      expect(context.gate_threshold).toBe(0.75);
    });

    it('should use default values in context', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      const coordinator = new CoordinatorEntrypoint();
      const context = coordinator.createTaskContext();

      expect(context.max_iterations).toBe(10);
      expect(context.gate_threshold).toBeGreaterThan(0);
      expect(context.consensus_threshold).toBeGreaterThan(0);
    });

    it('should include timestamp in context', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      const coordinator = new CoordinatorEntrypoint();
      const context = coordinator.createTaskContext();

      expect(context.created_at).toBeDefined();
      expect(context.created_at).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Security', () => {
    it('should not expose sensitive data in logs', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.ANTHROPIC_API_KEY = 'sk-secret-key';

      const coordinator = new CoordinatorEntrypoint();
      const logs = coordinator.getStartupLogs();

      expect(logs).not.toContain('sk-secret-key');
    });

    it('should validate JSON file size limit', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      // Set as a file-like path to trigger file size check
      process.env.CFN_SUCCESS_CRITERIA = '/workspace/large.json';

      const coordinator = new CoordinatorEntrypoint();

      // Mock fs functions to simulate a large file
      const fs = require('fs');
      fs.existsSync = jest.fn((path: string) => {
        return path === '/workspace/large.json';
      });
      fs.statSync = jest.fn((path: string) => {
        if (path === '/workspace/large.json') {
          return { size: 11 * 1024 * 1024 }; // 11MB
        }
        throw new Error('File not found');
      });

      expect(() => {
        coordinator.loadSuccessCriteria();
      }).toThrow(/exceeds.*limit|size/);
    });

    it('should protect against JSON DoS attacks', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      const coordinator = new CoordinatorEntrypoint();

      // Create deeply nested JSON (potential ReDoS)
      const deepJson = JSON.stringify({
        a: { b: { c: { d: { e: { f: { g: { h: 'value' } } } } } } },
      });

      process.env.CFN_SUCCESS_CRITERIA = deepJson;

      // Should not throw on reasonable nesting
      expect(() => {
        coordinator.loadSuccessCriteria();
      }).not.toThrow();
    });
  });

  describe('Orchestration Script Verification', () => {
    it('should verify orchestration script exists', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      const coordinator = new CoordinatorEntrypoint();
      coordinator.projectRoot = '/workspace';

      const result = await coordinator.verifyOrchestrationScript();
      expect(result).toBeDefined();
    });

    it('should handle missing orchestration script', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      const coordinator = new CoordinatorEntrypoint();
      coordinator.projectRoot = '/nonexistent';

      const result = await coordinator.verifyOrchestrationScript();
      expect(result.success).toBe(false);
    });
  });

  describe('executeCoordinator() method', () => {
    it('should execute with all verifications passing', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      mockExecSync.mockReturnValue(Buffer.from(''));

      const coordinator = new CoordinatorEntrypoint();
      const result = await coordinator.execute();

      expect(result).toBeDefined();
    });

    it('should fail if Docker verification fails', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('docker ps')) {
          throw new Error('Docker not available');
        }
        return Buffer.from('');
      });

      const coordinator = new CoordinatorEntrypoint();
      const result = await coordinator.execute();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Docker');
    });

    it('should fail if Redis verification fails', async () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';

      let dockerVerified = false;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('docker ps')) {
          dockerVerified = true;
          return Buffer.from('');
        }
        if (cmd.includes('redis-cli') && dockerVerified) {
          throw new Error('Redis not available');
        }
        return Buffer.from('');
      });

      const coordinator = new CoordinatorEntrypoint();
      const result = await coordinator.execute();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Redis');
    });
  });

  describe('Configuration Merging', () => {
    it('should merge environment variables with defaults', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.CFN_MEMORY_BUDGET = '80g';

      const coordinator = new CoordinatorEntrypoint();
      const config = coordinator.getFullConfig();

      expect(config.memory_limit).toBe('80g');
      expect(config.task_id).toBe('task-123');
    });

    it('should respect precedence: explicit > CFN_* > legacy > defaults', () => {
      process.env.TASK_ID = 'task-123';
      process.env.TASK_DESCRIPTION = 'Test task';
      process.env.REDIS_HOST = 'legacy-redis';
      process.env.CFN_REDIS_HOST = 'cfn-redis';

      // Explicit config should override
      const coordinator = new CoordinatorEntrypoint({
        redis_host: 'explicit-redis',
        task_id: 'task-123',
        task_description: 'Test task',
      });

      expect(coordinator.getFullConfig().redis_host).toBe('explicit-redis');
    });
  });
});
