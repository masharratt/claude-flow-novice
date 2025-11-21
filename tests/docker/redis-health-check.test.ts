/**
 * Redis Health Check Tests
 * Tests for src/docker/health-check/redis-health-check.ts
 *
 * Priority 1: Core Docker scripts migration
 * Coverage: Password security, Redis connectivity, environment variables
 */

import { execSync, spawnSync } from 'child_process';
import { RedisHealthCheck } from '../../src/docker/health-check/redis-health-check';

jest.mock('child_process');

describe('RedisHealthCheck', () => {
  let mockSpawnSync: jest.MockedFunction<typeof spawnSync>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;
  });

  describe('check()', () => {
    it('should return success when Redis is accessible without password', async () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('PONG'),
        stderr: Buffer.from(''),
        pid: 123,
        output: [null, 'PONG', ''],
        signal: null,
      });

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
      });

      const result = await checker.check();
      expect(result.success).toBe(true);
      expect(result.message).toContain('PONG');
    });

    it('should return success when Redis is accessible with password', async () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('PONG'),
        stderr: Buffer.from(''),
        pid: 123,
        output: [null, 'PONG', ''],
        signal: null,
      });

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
        password: 'secure-password',
      });

      const result = await checker.check();
      expect(result.success).toBe(true);
    });

    it('should return failure when Redis is not accessible', async () => {
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('Could not connect to Redis'),
        pid: 123,
        output: [null, '', 'Could not connect to Redis'],
        signal: null,
      });

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
      });

      const result = await checker.check();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should use custom host and port', async () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('PONG'),
        stderr: Buffer.from(''),
        pid: 123,
        output: [null, 'PONG', ''],
        signal: null,
      });

      const checker = new RedisHealthCheck({
        host: 'redis-server',
        port: 6380,
      });

      await checker.check();

      expect(mockSpawnSync).toHaveBeenCalled();
      const call = mockSpawnSync.mock.calls[0];
      expect(call[1]).toContain('-h');
      expect(call[1]).toContain('redis-server');
      expect(call[1]).toContain('-p');
      expect(call[1]).toContain('6380');
    });

    it('should NOT expose password in command line arguments (security)', async () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('PONG'),
        stderr: Buffer.from(''),
        pid: 123,
        output: [null, 'PONG', ''],
        signal: null,
      });

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
        password: 'ultra-secret-password',
      });

      await checker.check();

      // Verify password is NOT in arguments array
      const call = mockSpawnSync.mock.calls[0];
      const args = call[1] as string[];
      expect(args.join(' ')).not.toContain('ultra-secret-password');
    });

    it('should use environment variable for password (REDIS_PASSWORD)', async () => {
      const originalEnv = process.env.REDIS_PASSWORD;
      process.env.REDIS_PASSWORD = 'env-password';

      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('PONG'),
        stderr: Buffer.from(''),
        pid: 123,
        output: [null, 'PONG', ''],
        signal: null,
      });

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
      });

      await checker.check();

      // Should use environment variable
      expect(mockSpawnSync).toHaveBeenCalled();

      process.env.REDIS_PASSWORD = originalEnv;
    });
  });

  describe('checkWithRetry()', () => {
    it('should retry on failure and succeed on second attempt', async () => {
      mockSpawnSync
        .mockReturnValueOnce({
          status: 1,
          stdout: Buffer.from(''),
          stderr: Buffer.from('Connection refused'),
          pid: 123,
          output: [null, '', 'Connection refused'],
          signal: null,
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: Buffer.from('PONG'),
          stderr: Buffer.from(''),
          pid: 124,
          output: [null, 'PONG', ''],
          signal: null,
        });

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
      });

      const result = await checker.checkWithRetry({
        maxAttempts: 3,
        delayMs: 10, // Short delay for tests
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should fail after max attempts', async () => {
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('Connection refused'),
        pid: 123,
        output: [null, '', 'Connection refused'],
        signal: null,
      });

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
      });

      const result = await checker.checkWithRetry({
        maxAttempts: 3,
        delayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
    });
  });

  describe('environment variable loading', () => {
    it('should load REDIS_PASSWORD from environment', () => {
      const originalEnv = process.env.REDIS_PASSWORD;
      process.env.REDIS_PASSWORD = 'env-secret';

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
      });

      expect(checker.password).toBe('env-secret');

      process.env.REDIS_PASSWORD = originalEnv;
    });

    it('should prefer explicit password over environment variable', () => {
      const originalEnv = process.env.REDIS_PASSWORD;
      process.env.REDIS_PASSWORD = 'env-secret';

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
        password: 'explicit-password',
      });

      expect(checker.password).toBe('explicit-password');

      process.env.REDIS_PASSWORD = originalEnv;
    });

    it('should use CFN_REDIS_* environment variables', () => {
      const originalRedisHost = process.env.CFN_REDIS_HOST;
      const originalRedisPort = process.env.CFN_REDIS_PORT;

      process.env.CFN_REDIS_HOST = 'cfn-redis';
      process.env.CFN_REDIS_PORT = '6380';

      const checker = new RedisHealthCheck();

      expect(checker.host).toBe('cfn-redis');
      expect(checker.port).toBe(6380);

      process.env.CFN_REDIS_HOST = originalRedisHost;
      process.env.CFN_REDIS_PORT = originalRedisPort;
    });
  });

  describe('exit code behavior', () => {
    it('should return exit code 0 on success', async () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from('PONG'),
        stderr: Buffer.from(''),
        pid: 123,
        output: [null, 'PONG', ''],
        signal: null,
      });

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
      });

      const result = await checker.check();
      expect(result.exitCode).toBe(0);
    });

    it('should return exit code 1 on failure', async () => {
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('Connection failed'),
        pid: 123,
        output: [null, '', 'Connection failed'],
        signal: null,
      });

      const checker = new RedisHealthCheck({
        host: 'localhost',
        port: 6379,
      });

      const result = await checker.check();
      expect(result.exitCode).toBe(1);
    });
  });
});
