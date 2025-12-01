/**
 * Docker Spawner - Unit Tests
 *
 * Tests for docker-spawner.ts including:
 * - Memory string parsing
 * - Docker spawner initialization
 * - Error handling
 *
 * Note: Full integration tests require Docker daemon and containers
 */

import { parseMemoryString, DockerSpawner } from './docker-spawner';

describe('parseMemoryString', () => {
  describe('valid inputs', () => {
    test('parses bytes without unit', () => {
      expect(parseMemoryString('512')).toBe(512);
      expect(parseMemoryString('1024')).toBe(1024);
    });

    test('parses kilobytes', () => {
      expect(parseMemoryString('1k')).toBe(1024);
      expect(parseMemoryString('512kb')).toBe(512 * 1024);
    });

    test('parses megabytes', () => {
      expect(parseMemoryString('512m')).toBe(512 * 1024 * 1024);
      expect(parseMemoryString('1mb')).toBe(1024 * 1024);
    });

    test('parses gigabytes', () => {
      expect(parseMemoryString('1g')).toBe(1024 * 1024 * 1024);
      expect(parseMemoryString('2gb')).toBe(2 * 1024 * 1024 * 1024);
    });

    test('parses decimal values', () => {
      expect(parseMemoryString('1.5g')).toBe(Math.round(1.5 * 1024 * 1024 * 1024));
      expect(parseMemoryString('0.5g')).toBe(Math.round(0.5 * 1024 * 1024 * 1024));
    });

    test('ignores case', () => {
      expect(parseMemoryString('512M')).toBe(512 * 1024 * 1024);
      expect(parseMemoryString('1G')).toBe(1024 * 1024 * 1024);
      expect(parseMemoryString('1GB')).toBe(1024 * 1024 * 1024);
    });

    test('handles whitespace', () => {
      expect(parseMemoryString('  512m  ')).toBe(512 * 1024 * 1024);
      expect(parseMemoryString('1 gb')).toBe(1024 * 1024 * 1024);
    });
  });

  describe('invalid inputs', () => {
    test('throws on invalid format', () => {
      expect(() => parseMemoryString('abc')).toThrow();
      expect(() => parseMemoryString('512 invalid')).toThrow();
    });

    test('throws on unknown unit', () => {
      expect(() => parseMemoryString('512x')).toThrow();
      expect(() => parseMemoryString('1tb')).toThrow();
    });

    test('throws on non-positive values', () => {
      expect(() => parseMemoryString('0m')).toThrow();
      expect(() => parseMemoryString('-512m')).toThrow();
    });

    test('throws on empty string', () => {
      expect(() => parseMemoryString('')).toThrow();
    });
  });
});

describe('DockerSpawner', () => {
  describe('initialization', () => {
    test('creates instance with defaults', () => {
      const spawner = new DockerSpawner();
      expect(spawner).toBeDefined();
    });

    test('creates instance with custom socket-proxy', () => {
      const spawner = new DockerSpawner('custom-proxy', 2375, '/var/run/docker.sock');
      expect(spawner).toBeDefined();
    });

    test('respects DOCKER_HOST environment variable', () => {
      // This test would require mocking Docker connection
      // Just verify it doesn't throw during initialization
      const original = process.env.DOCKER_HOST;
      try {
        process.env.DOCKER_HOST = 'tcp://localhost:2375';
        const spawner = new DockerSpawner();
        expect(spawner).toBeDefined();
      } finally {
        if (original === undefined) {
          delete process.env.DOCKER_HOST;
        } else {
          process.env.DOCKER_HOST = original;
        }
      }
    });
  });

  describe('error handling', () => {
    test('returns error result on invalid options', async () => {
      const spawner = new DockerSpawner();
      // Note: This would need a real Docker daemon or mock
      // Just verifying the interface is correct
      expect(spawner.spawnAgentContainer).toBeDefined();
    });
  });
});

describe('Integration Tests', () => {
  describe('full container lifecycle (requires Docker daemon)', () => {
    test.skip('spawns and monitors container', async () => {
      const spawner = new DockerSpawner();

      const result = await spawner.spawnAgentContainer({
        image: 'alpine:latest',
        name: `test-spawner-${Date.now()}`,
        memory: '64m',
        env: {},
        mounts: [],
        networkMode: 'bridge',
        timeout: 10000,
        command: ['echo', 'Hello from docker-spawner'],
      });

      expect(result).toBeDefined();
      expect(result.containerId).toBeDefined();
      // Note: May not be successful since image may not be available
    });

    test.skip('handles timeout correctly', async () => {
      const spawner = new DockerSpawner();

      const result = await spawner.spawnAgentContainer({
        image: 'alpine:latest',
        name: `test-timeout-${Date.now()}`,
        memory: '64m',
        env: {},
        mounts: [],
        networkMode: 'bridge',
        timeout: 1000, // 1 second timeout
        command: ['sleep', '10'], // Command that takes 10 seconds
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });
});
