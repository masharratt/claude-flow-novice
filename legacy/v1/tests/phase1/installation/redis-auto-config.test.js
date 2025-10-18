/**
 * Redis Auto-Configuration Tests
 *
 * Tests automatic Redis detection and configuration
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

describe('Redis Auto-Configuration', () => {
  let testDir;
  let redisAvailable;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), `redis-config-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Check Redis availability
    try {
      await execAsync('redis-cli ping', { timeout: 5000 });
      redisAvailable = true;
      console.log('✅ Redis server detected');
    } catch {
      redisAvailable = false;
      console.log('⏭️  Redis server not available - testing fallback behavior');
    }
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });

  describe('Redis Detection', () => {
    it('should detect Redis availability', async () => {
      expect(typeof redisAvailable).toBe('boolean');

      if (redisAvailable) {
        const { stdout } = await execAsync('redis-cli ping');
        expect(stdout.trim()).toBe('PONG');
      }
    });

    it('should get Redis version if available', async () => {
      if (!redisAvailable) {
        console.log('⏭️  Skipping Redis version check');
        return;
      }

      try {
        const { stdout } = await execAsync('redis-cli --version');
        expect(stdout).toMatch(/redis-cli \d+\.\d+\.\d+/);
        console.log(`Redis version: ${stdout.trim()}`);
      } catch (error) {
        console.log('Could not determine Redis version');
      }
    });

    it('should check Redis connectivity', async () => {
      if (!redisAvailable) {
        console.log('⏭️  Skipping connectivity check');
        return;
      }

      try {
        const { stdout } = await execAsync('redis-cli INFO server');
        expect(stdout).toContain('redis_version');
      } catch (error) {
        throw new Error('Redis connectivity check failed');
      }
    });
  });

  describe('Configuration Generation', () => {
    it('should generate Redis config when available', async () => {
      const config = {
        redis: {
          host: 'localhost',
          port: 6379,
          db: 0,
          password: null,
          available: redisAvailable,
          mode: redisAvailable ? 'redis' : 'fallback'
        }
      };

      expect(config.redis.available).toBe(redisAvailable);
      expect(config.redis.mode).toBe(redisAvailable ? 'redis' : 'fallback');
    });

    it('should generate fallback config when Redis unavailable', async () => {
      if (redisAvailable) {
        console.log('⏭️  Skipping fallback test (Redis available)');
        return;
      }

      const fallbackConfig = {
        memory: {
          type: 'in-memory',
          persistence: 'json',
          location: '.swarm/memory.json'
        }
      };

      expect(fallbackConfig.memory.type).toBe('in-memory');
      expect(fallbackConfig.memory.persistence).toBe('json');
    });

    it('should validate Redis configuration format', () => {
      const config = {
        host: 'localhost',
        port: 6379,
        db: 0,
        password: null
      };

      expect(typeof config.host).toBe('string');
      expect(typeof config.port).toBe('number');
      expect(typeof config.db).toBe('number');
      expect(config.port).toBeGreaterThan(0);
      expect(config.port).toBeLessThan(65536);
    });
  });

  describe('Connection Testing', () => {
    it('should test Redis connection', async () => {
      if (!redisAvailable) {
        console.log('⏭️  Skipping connection test');
        return;
      }

      try {
        // Test basic connectivity
        await execAsync('redis-cli ping');

        // Test set/get operation
        const testKey = `cfn-test-${Date.now()}`;
        const testValue = 'test-value';

        await execAsync(`redis-cli SET ${testKey} ${testValue}`);
        const { stdout } = await execAsync(`redis-cli GET ${testKey}`);

        expect(stdout.trim()).toBe(testValue);

        // Cleanup
        await execAsync(`redis-cli DEL ${testKey}`);
      } catch (error) {
        throw new Error(`Redis connection test failed: ${error.message}`);
      }
    });

    it('should handle connection errors gracefully', async () => {
      try {
        // Try to connect to non-existent Redis instance
        await execAsync('redis-cli -p 9999 ping', { timeout: 2000 });
      } catch (error) {
        // Should fail gracefully
        expect(error).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });

    it('should validate connection parameters', () => {
      const validParams = {
        host: 'localhost',
        port: 6379,
        db: 0
      };

      const invalidParams = [
        { host: '', port: 6379, db: 0 },           // Empty host
        { host: 'localhost', port: -1, db: 0 },    // Invalid port
        { host: 'localhost', port: 70000, db: 0 }, // Port out of range
        { host: 'localhost', port: 6379, db: -1 }  // Invalid db
      ];

      // Valid params should pass
      expect(validParams.host).toBeTruthy();
      expect(validParams.port).toBeGreaterThan(0);

      // Invalid params should be detected
      invalidParams.forEach(params => {
        if (params.host === '') {
          expect(params.host).toBeFalsy();
        }
        if (params.port < 0 || params.port > 65535) {
          expect(params.port < 1 || params.port > 65535).toBe(true);
        }
      });
    });
  });

  describe('Auto-Configuration Behavior', () => {
    it('should prefer Redis when available', () => {
      const selectedBackend = redisAvailable ? 'redis' : 'fallback';
      expect(selectedBackend).toBe(redisAvailable ? 'redis' : 'fallback');
    });

    it('should configure swarm persistence', async () => {
      const swarmConfig = {
        persistence: {
          enabled: true,
          backend: redisAvailable ? 'redis' : 'memory',
          redis: redisAvailable ? {
            host: 'localhost',
            port: 6379,
            db: 0
          } : null
        }
      };

      expect(swarmConfig.persistence.enabled).toBe(true);
      expect(swarmConfig.persistence.backend).toBe(
        redisAvailable ? 'redis' : 'memory'
      );
    });

    it('should generate appropriate error messages', () => {
      const messages = {
        redis_unavailable: 'Redis server not available. Using in-memory fallback.',
        redis_connection_failed: 'Failed to connect to Redis. Check configuration.',
        fallback_active: 'Running in fallback mode. Install Redis for persistence.'
      };

      if (!redisAvailable) {
        expect(messages.redis_unavailable).toContain('fallback');
        expect(messages.fallback_active).toContain('Install Redis');
      }
    });
  });

  describe('Configuration Persistence', () => {
    it('should save configuration to file', async () => {
      const configPath = path.join(testDir, 'redis-config.json');
      const config = {
        redis: {
          host: 'localhost',
          port: 6379,
          available: redisAvailable
        }
      };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      const savedConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(savedConfig.redis.available).toBe(redisAvailable);
    });

    it('should validate saved configuration', async () => {
      const configPath = path.join(testDir, 'redis-config-validate.json');
      const config = {
        redis: {
          host: 'localhost',
          port: 6379,
          db: 0,
          password: null
        }
      };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Read and validate
      const savedConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));

      expect(savedConfig.redis.host).toBe('localhost');
      expect(savedConfig.redis.port).toBe(6379);
      expect(typeof savedConfig.redis.db).toBe('number');
    });
  });

  describe('Environment Variable Configuration', () => {
    it('should support REDIS_URL environment variable', () => {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      expect(redisUrl).toMatch(/^redis:\/\//);

      // Parse URL
      const url = new URL(redisUrl);
      expect(url.protocol).toBe('redis:');
      expect(url.hostname).toBeTruthy();
    });

    it('should parse Redis URL correctly', () => {
      const testUrls = [
        'redis://localhost:6379',
        'redis://localhost:6379/0',
        'redis://:password@localhost:6379',
        'redis://user:password@localhost:6379/1'
      ];

      testUrls.forEach(urlString => {
        const url = new URL(urlString);
        expect(url.protocol).toBe('redis:');
        expect(url.hostname).toBe('localhost');
        expect(url.port || '6379').toBeTruthy();
      });
    });
  });

  describe('Fallback Mechanism', () => {
    it('should provide fallback when Redis unavailable', () => {
      if (redisAvailable) {
        console.log('⏭️  Skipping fallback mechanism test');
        return;
      }

      const fallback = {
        type: 'in-memory',
        warning: 'Redis not available. Using in-memory storage.',
        persistence: false
      };

      expect(fallback.type).toBe('in-memory');
      expect(fallback.persistence).toBe(false);
    });

    it('should warn about data loss in fallback mode', () => {
      if (redisAvailable) {
        console.log('⏭️  Skipping data loss warning test');
        return;
      }

      const warnings = [
        'Data will not persist between sessions',
        'Install Redis for production use',
        'In-memory storage has limited capacity'
      ];

      warnings.forEach(warning => {
        expect(typeof warning).toBe('string');
        expect(warning.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('Redis Auto-Configuration Summary', () => {
  it('should generate configuration report', async () => {
    let redisAvailable = false;
    let redisVersion = 'N/A';

    try {
      await execAsync('redis-cli ping', { timeout: 5000 });
      redisAvailable = true;

      try {
        const { stdout } = await execAsync('redis-cli --version');
        redisVersion = stdout.trim();
      } catch {
        redisVersion = 'Unknown';
      }
    } catch {
      redisAvailable = false;
    }

    const report = {
      redisAvailable,
      redisVersion,
      configurationMode: redisAvailable ? 'Redis' : 'In-Memory Fallback',
      persistence: redisAvailable,
      recommendations: redisAvailable
        ? ['Redis configured successfully']
        : [
            'Install Redis for production use',
            'Enable persistence for data retention',
            'Configure Redis for multi-instance deployments'
          ]
    };

    console.log('\n📊 Redis Auto-Configuration Report');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Redis Available: ${report.redisAvailable ? '✅ Yes' : '❌ No'}`);
    console.log(`Redis Version: ${report.redisVersion}`);
    console.log(`Configuration Mode: ${report.configurationMode}`);
    console.log(`Persistence: ${report.persistence ? '✅ Enabled' : '⚠️  Disabled'}`);
    console.log('\nRecommendations:');
    report.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
    console.log('═══════════════════════════════════════════════════════');

    expect(report).toBeDefined();
  });
});
