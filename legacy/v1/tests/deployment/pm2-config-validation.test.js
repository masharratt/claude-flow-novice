/**
 * PM2 Ecosystem Configuration Validation Tests
 *
 * Validates PM2 cluster configuration for production high-availability.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

describe('PM2 Ecosystem Configuration', () => {
  let config;

  beforeAll(() => {
    const configPath = path.join(__dirname, '../../ecosystem.config.cjs');
    if (!fs.existsSync(configPath)) {
      throw new Error('ecosystem.config.cjs not found');
    }
    config = require(configPath);
  });

  describe('App Configuration', () => {
    test('should have apps array', () => {
      expect(config.apps).toBeDefined();
      expect(Array.isArray(config.apps)).toBe(true);
      expect(config.apps.length).toBeGreaterThan(0);
    });

    test('should configure queen agent', () => {
      const queenApp = config.apps[0];
      expect(queenApp.name).toBe('claude-flow-queen');
      expect(queenApp.script).toBe('./dist/src/coordination/queen-agent.js');
    });

    test('should enable cluster mode', () => {
      const queenApp = config.apps[0];
      expect(queenApp.exec_mode).toBe('cluster');
      expect(queenApp.instances).toBeDefined();
      expect(['max', 2, 3, 4, 5, 6, 7, 8]).toContain(queenApp.instances);
    });

    test('should configure memory limits', () => {
      const queenApp = config.apps[0];
      expect(queenApp.max_memory_restart).toBeDefined();
      expect(queenApp.max_memory_restart).toMatch(/^\d+[GM]$/);
    });
  });

  describe('Production Environment', () => {
    test('should define production environment variables', () => {
      const queenApp = config.apps[0];
      expect(queenApp.env_production).toBeDefined();
      expect(queenApp.env_production.NODE_ENV).toBe('production');
    });

    test('should configure PORT', () => {
      const queenApp = config.apps[0];
      expect(queenApp.env_production.PORT).toBeDefined();
      expect(typeof queenApp.env_production.PORT).toBe('number');
    });

    test('should enable cluster mode and PM failover', () => {
      const queenApp = config.apps[0];
      expect(queenApp.env_production.CLUSTER_MODE).toBe('true');
      expect(queenApp.env_production.PM_FAILOVER_ENABLED).toBe('true');
    });

    test('should configure logging', () => {
      const queenApp = config.apps[0];
      expect(queenApp.env_production.LOG_LEVEL).toBeDefined();
      expect(queenApp.env_production.LOG_FORMAT).toBe('json');
    });
  });

  describe('Graceful Shutdown', () => {
    test('should configure kill timeout', () => {
      const queenApp = config.apps[0];
      expect(queenApp.kill_timeout).toBeDefined();
      expect(queenApp.kill_timeout).toBeGreaterThanOrEqual(3000);
      expect(queenApp.kill_timeout).toBeLessThanOrEqual(10000);
    });

    test('should enable wait_ready', () => {
      const queenApp = config.apps[0];
      expect(queenApp.wait_ready).toBe(true);
    });

    test('should configure listen timeout', () => {
      const queenApp = config.apps[0];
      expect(queenApp.listen_timeout).toBeDefined();
      expect(queenApp.listen_timeout).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('Auto-Restart Configuration', () => {
    test('should enable auto-restart', () => {
      const queenApp = config.apps[0];
      expect(queenApp.autorestart).toBe(true);
    });

    test('should configure max restarts', () => {
      const queenApp = config.apps[0];
      expect(queenApp.max_restarts).toBeDefined();
      expect(queenApp.max_restarts).toBeGreaterThanOrEqual(5);
      expect(queenApp.max_restarts).toBeLessThanOrEqual(20);
    });

    test('should configure min uptime', () => {
      const queenApp = config.apps[0];
      expect(queenApp.min_uptime).toBeDefined();
      expect(queenApp.min_uptime).toBeGreaterThanOrEqual(30000); // At least 30s
    });

    test('should configure exponential backoff', () => {
      const queenApp = config.apps[0];
      expect(queenApp.exp_backoff_restart_delay).toBeDefined();
      expect(queenApp.exp_backoff_restart_delay).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Logging Configuration', () => {
    test('should configure error log file', () => {
      const queenApp = config.apps[0];
      expect(queenApp.error_file).toBeDefined();
      expect(queenApp.error_file).toMatch(/\.log$/);
    });

    test('should configure output log file', () => {
      const queenApp = config.apps[0];
      expect(queenApp.out_file).toBeDefined();
      expect(queenApp.out_file).toMatch(/\.log$/);
    });

    test('should configure log date format', () => {
      const queenApp = config.apps[0];
      expect(queenApp.log_date_format).toBeDefined();
    });

    test('should enable log merging', () => {
      const queenApp = config.apps[0];
      expect(queenApp.merge_logs).toBe(true);
    });
  });

  describe('Advanced Features', () => {
    test('should disable watch in production', () => {
      const queenApp = config.apps[0];
      expect(queenApp.watch).toBe(false);
    });

    test('should configure instance variable', () => {
      const queenApp = config.apps[0];
      expect(queenApp.instance_var).toBeDefined();
    });

    test('should configure port increment', () => {
      const queenApp = config.apps[0];
      expect(queenApp.increment_var).toBeDefined();
    });
  });

  describe('Deployment Configuration (Optional)', () => {
    test('should optionally define deployment config', () => {
      if (config.deploy) {
        expect(config.deploy.production).toBeDefined();
      }
    });
  });

  describe('Security and Best Practices', () => {
    test('should not use fork mode for cluster', () => {
      const queenApp = config.apps[0];
      expect(queenApp.exec_mode).not.toBe('fork');
    });

    test('should configure reasonable instance count', () => {
      const queenApp = config.apps[0];
      if (typeof queenApp.instances === 'number') {
        expect(queenApp.instances).toBeGreaterThanOrEqual(2);
        expect(queenApp.instances).toBeLessThanOrEqual(20);
      }
    });

    test('should configure reasonable memory limit', () => {
      const queenApp = config.apps[0];
      const memoryStr = queenApp.max_memory_restart;
      const unit = memoryStr.slice(-1); // G or M
      const value = parseInt(memoryStr, 10);

      if (unit === 'G') {
        expect(value).toBeGreaterThanOrEqual(1); // At least 1GB
        expect(value).toBeLessThanOrEqual(8); // Max 8GB
      } else if (unit === 'M') {
        expect(value).toBeGreaterThanOrEqual(512); // At least 512MB
        expect(value).toBeLessThanOrEqual(8192); // Max 8192MB
      }
    });
  });

  describe('Script Path Validation', () => {
    test('should have valid script path format', () => {
      const queenApp = config.apps[0];
      expect(queenApp.script).toMatch(/^\.\/.*\.js$/);
    });

    test('should point to coordination directory', () => {
      const queenApp = config.apps[0];
      expect(queenApp.script).toContain('/coordination/');
    });
  });

  describe('Configuration Completeness', () => {
    test('should have all required fields', () => {
      const queenApp = config.apps[0];
      const requiredFields = [
        'name',
        'script',
        'instances',
        'exec_mode',
        'max_memory_restart',
        'env_production',
        'kill_timeout',
        'autorestart'
      ];

      requiredFields.forEach(field => {
        expect(queenApp[field]).toBeDefined();
      });
    });

    test('should have production environment essentials', () => {
      const queenApp = config.apps[0];
      const requiredEnvVars = [
        'NODE_ENV',
        'PORT',
        'CLUSTER_MODE'
      ];

      requiredEnvVars.forEach(envVar => {
        expect(queenApp.env_production[envVar]).toBeDefined();
      });
    });
  });
});

describe('PM2 Configuration Loading', () => {
  let loadedConfig;

  beforeAll(() => {
    const configPath = path.join(__dirname, '../../ecosystem.config.cjs');
    loadedConfig = require(configPath);
  });

  test('should be loadable as CommonJS module', () => {
    expect(loadedConfig).toBeDefined();
    expect(typeof loadedConfig).toBe('object');
  });

  test('should export valid PM2 configuration structure', () => {
    expect(loadedConfig).toHaveProperty('apps');
    expect(Array.isArray(loadedConfig.apps)).toBe(true);
  });
});
