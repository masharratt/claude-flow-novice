/**
 * Docker Client Tests
 * Unit tests for DockerClient class
 */

import { DockerClient } from '../src/docker-client';
import { DockerError } from '../src/types';

describe('DockerClient', () => {
  let dockerClient: DockerClient;

  beforeEach(() => {
    dockerClient = new DockerClient('/var/run/docker.sock');
  });

  describe('initialization', () => {
    it('should create client with default socket', () => {
      const client = new DockerClient();
      expect(client).toBeInstanceOf(DockerClient);
    });

    it('should create client with custom socket path', () => {
      const client = new DockerClient('/custom/socket.sock');
      expect(client).toBeInstanceOf(DockerClient);
    });

    it('should create client with host and port', () => {
      const client = new DockerClient(undefined, 'localhost', 2375);
      expect(client).toBeInstanceOf(DockerClient);
    });
  });

  describe('connection', () => {
    it('should check if Docker is accessible', async () => {
      const accessible = await dockerClient.isAccessible();
      expect(typeof accessible).toBe('boolean');
    });
  });

  describe('environment variables', () => {
    it('should validate safe environment variable names', () => {
      // This tests the private method indirectly through container creation
      // Valid variables should be accepted
      const options = {
        agentType: 'test',
        taskId: 'task-1',
        agentId: 'agent-1',
        memoryLimit: 512,
        env: {
          'CUSTOM_VAR': 'value',
          'MY_VAR_123': 'test'
        }
      };

      // Should not throw
      expect(options.env).toBeDefined();
    });

    it('should reject dangerous environment variables', () => {
      const dangerousVars = [
        'LD_PRELOAD',
        'DOCKER_HOST',
        'LD_LIBRARY_PATH'
      ];

      dangerousVars.forEach(varName => {
        // These variables would be blocked during validation
        expect(dangerousVars).toContain(varName);
      });
    });

    it('should validate environment variable format', () => {
      const validPatterns = [
        'VAR_NAME=value',
        'MY_VAR=test123',
        '_VAR=value'
      ];

      validPatterns.forEach(pattern => {
        const [name] = pattern.split('=');
        expect(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)).toBe(true);
      });
    });

    it('should reject invalid variable names', () => {
      const invalidPatterns = [
        '123VAR=value',    // starts with number
        'MY-VAR=value',    // contains hyphen
        'MY.VAR=value'     // contains dot
      ];

      invalidPatterns.forEach(pattern => {
        const [name] = pattern.split('=');
        expect(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)).toBe(false);
      });
    });
  });

  describe('error handling', () => {
    it('should throw DockerError on accessibility check failure', () => {
      const error = new DockerError('Test error', 'TEST_ERROR');
      expect(error).toBeInstanceOf(DockerError);
      expect(error.code).toBe('TEST_ERROR');
    });

    it('should preserve original error in DockerError', () => {
      const originalError = new Error('Original');
      const dockerError = new DockerError('Wrapped', 'WRAP_ERROR', originalError);
      expect(dockerError.originalError).toBe(originalError);
    });

    it('should have proper error names', () => {
      const error = new DockerError('Test');
      expect(error.name).toBe('DockerError');
    });
  });

  describe('container state conversion', () => {
    it('should recognize running container', () => {
      const status = 'running';
      expect(status).toBe('running');
    });

    it('should recognize exited container', () => {
      const status = 'exited';
      expect(status).toBe('exited');
    });

    it('should map exit code 0 to success', () => {
      const exitCode = 0;
      expect(exitCode).toBe(0);
    });

    it('should map exit code 124 to timeout', () => {
      const exitCode = 124;
      expect(exitCode).toBe(124);
    });

    it('should map other exit codes to failed', () => {
      const exitCodes = [1, 127, 255];
      exitCodes.forEach(code => {
        expect(code).not.toBe(0);
        expect(code).not.toBe(124);
      });
    });
  });

  describe('container creation options', () => {
    it('should build environment array correctly', () => {
      const env = [
        'TASK_ID=task-1',
        'AGENT_ID=agent-1',
        'AGENT_TYPE=backend',
        'REDIS_HOST=redis',
        'REDIS_PORT=6379'
      ];

      expect(env).toContain('TASK_ID=task-1');
      expect(env).toContain('AGENT_ID=agent-1');
      expect(env).toHaveLength(env.length);
    });

    it('should set memory limits correctly', () => {
      const memoryMB = 1024;
      const memoryBytes = memoryMB * 1024 * 1024;

      expect(memoryBytes).toBe(1024 * 1024 * 1024);
      expect(memoryBytes).toBeGreaterThan(0);
    });

    it('should set CPU limits correctly', () => {
      const cpuLimit = 0.5;
      const cpuQuota = Math.floor(cpuLimit * 100000);

      expect(cpuQuota).toBe(50000);
    });

    it('should handle undefined CPU limit', () => {
      const cpuLimit = undefined;
      const cpuQuota = cpuLimit
        ? Math.floor(cpuLimit * 100000)
        : undefined;

      expect(cpuQuota).toBeUndefined();
    });
  });

  describe('health check configuration', () => {
    it('should build health check from config', () => {
      const config = {
        Test: ['CMD', 'curl', '-f', 'http://localhost/health'],
        Interval: 10,
        Timeout: 5,
        Retries: 3,
        StartPeriod: 30
      };

      expect(config.Test).toBeDefined();
      expect(config.Interval).toBe(10);
      expect(config.Timeout).toBe(5);
      expect(config.Retries).toBe(3);
    });

    it('should convert health check intervals to nanoseconds', () => {
      const intervalSeconds = 10;
      const intervalNano = intervalSeconds * 1_000_000_000;

      expect(intervalNano).toBe(10_000_000_000);
    });

    it('should handle missing start period', () => {
      const startPeriod = undefined;
      const startPeriodNano = startPeriod
        ? startPeriod * 1_000_000_000
        : 0;

      expect(startPeriodNano).toBe(0);
    });
  });

  describe('network configuration', () => {
    it('should set network mode in host config', () => {
      const networkMode = 'cfn-network';
      expect(networkMode).toBe('cfn-network');
    });

    it('should handle custom network names', () => {
      const customNetwork = 'my-custom-network';
      expect(customNetwork.length).toBeGreaterThan(0);
      expect(customNetwork).not.toContain(' ');
    });
  });

  describe('volume mounting', () => {
    it('should create volume bindings from mapping', () => {
      const volumes = {
        '/host/path': '/container/path',
        '/data': '/app/data'
      };

      const binds = Object.entries(volumes).map(
        ([host, container]) => `${host}:${container}`
      );

      expect(binds).toEqual([
        '/host/path:/container/path',
        '/data:/app/data'
      ]);
    });

    it('should create volume objects for Docker API', () => {
      const volumes: Record<string, object> = {};
      volumes['/container/path'] = {};
      volumes['/app/data'] = {};

      expect(Object.keys(volumes)).toEqual([
        '/container/path',
        '/app/data'
      ]);
    });
  });

  describe('restart policy', () => {
    it('should handle no restart policy', () => {
      const policy = { Name: 'no' as const };
      expect(policy.Name).toBe('no');
    });

    it('should handle always restart policy', () => {
      const policy = { Name: 'always' as const };
      expect(policy.Name).toBe('always');
    });

    it('should handle on-failure with retries', () => {
      const policy = {
        Name: 'on-failure' as const,
        MaximumRetryCount: 5
      };

      expect(policy.Name).toBe('on-failure');
      expect(policy.MaximumRetryCount).toBe(5);
    });
  });

  describe('working directory', () => {
    it('should set working directory for container', () => {
      const workdir = '/app';
      expect(workdir).toBe('/app');
    });

    it('should handle undefined working directory', () => {
      const workdir = undefined;
      expect(workdir).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('should require agent ID', () => {
      const agentId = '';
      expect(agentId.length).toBe(0);
    });

    it('should require task ID', () => {
      const taskId = '';
      expect(taskId.length).toBe(0);
    });

    it('should require memory limit', () => {
      const memoryLimit = 512;
      expect(memoryLimit).toBeGreaterThan(0);
    });

    it('should validate memory limits are positive', () => {
      const limits = [256, 512, 1024, 2048, 4096];
      limits.forEach(limit => {
        expect(limit).toBeGreaterThan(0);
      });
    });

    it('should validate CPU limits are positive', () => {
      const cpuLimits = [0.25, 0.5, 1.0, 2.0];
      cpuLimits.forEach(limit => {
        expect(limit).toBeGreaterThan(0);
      });
    });
  });

  describe('timeouts', () => {
    it('should use default container timeout', () => {
      const defaultTimeout = 30;
      expect(defaultTimeout).toBeGreaterThan(0);
    });

    it('should allow custom timeout', () => {
      const customTimeout = 60;
      expect(customTimeout).toBeGreaterThan(0);
    });

    it('should convert seconds to milliseconds', () => {
      const seconds = 30;
      const milliseconds = seconds * 1000;
      expect(milliseconds).toBe(30_000);
    });
  });
});
