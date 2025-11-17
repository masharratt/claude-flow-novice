/**
 * Configuration Manager Test Suite
 * Tests YAML-based configuration management with migration support
 *
 * @version 1.0.0
 * @description Comprehensive tests for ConfigManager v2 with YAML support
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigManager } from '../src/lib/config-manager';
import { ConfigMigrator } from '../src/lib/config-migrator';

describe('ConfigManager', () => {
  const testDir = path.join('/tmp', 'config-manager-tests');
  const configPath = path.join(testDir, 'config', 'default.yml');
  const schemaPath = path.join(testDir, 'schemas', 'config-v1.schema.json');

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(path.join(testDir, 'config'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'schemas'), { recursive: true });

    // Create test schema
    const testSchema = {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "version": { "type": "string" },
        "database": {
          "type": "object",
          "properties": {
            "type": { "type": "string", "enum": ["sqlite", "postgres"] },
            "path": { "type": "string" },
            "pool": {
              "type": "object",
              "properties": {
                "min": { "type": "number" },
                "max": { "type": "number" }
              }
            }
          },
          "required": ["type"]
        },
        "redis": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean" },
            "host": { "type": "string" },
            "port": { "type": "number" },
            "ttl": { "type": "number" }
          }
        },
        "agents": {
          "type": "object",
          "properties": {
            "maxConcurrent": { "type": "number" },
            "timeout": { "type": "number" },
            "retryAttempts": { "type": "number" }
          }
        }
      },
      "required": ["version", "database"]
    };

    await fs.writeFile(schemaPath, JSON.stringify(testSchema, null, 2));

    // Create default test config
    const defaultConfig = `version: '1.0'

database:
  type: sqlite
  path: ./data/cfn.db
  pool:
    min: 2
    max: 10

redis:
  enabled: true
  host: localhost
  port: 6379
  ttl: 86400

agents:
  maxConcurrent: 10
  timeout: 300
  retryAttempts: 3
`;

    await fs.writeFile(configPath, defaultConfig);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('YAML Parsing and Validation', () => {
    it('should load and parse YAML configuration', async () => {
      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load();

      const config = manager.getAll();
      expect(config.version).toBe('1.0');
      expect(config.database.type).toBe('sqlite');
      expect(config.redis.enabled).toBe(true);
    });

    it('should validate configuration against JSON schema', async () => {
      const invalidConfig = `version: '1.0'
# Missing required 'database' field
redis:
  enabled: true
`;

      await fs.writeFile(configPath, invalidConfig);

      const manager = new ConfigManager(configPath, schemaPath);
      await expect(manager.load()).rejects.toThrow(/schema validation/i);
    });

    it('should handle YAML syntax errors gracefully', async () => {
      const invalidYaml = `version: '1.0'
database:
  type: sqlite
  - invalid syntax here
`;

      await fs.writeFile(configPath, invalidYaml);

      const manager = new ConfigManager(configPath, schemaPath);
      await expect(manager.load()).rejects.toThrow(/yaml parsing/i);
    });
  });

  describe('Type Coercion and Validation', () => {
    it('should coerce string "true" to boolean true', async () => {
      const config = `version: '1.0'
database:
  type: sqlite
redis:
  enabled: 'true'
  port: '6379'
`;

      await fs.writeFile(configPath, config);

      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load();

      expect(manager.get('redis.enabled')).toBe(true);
      expect(typeof manager.get('redis.enabled')).toBe('boolean');
    });

    it('should coerce numeric strings to numbers', async () => {
      const config = `version: '1.0'
database:
  type: sqlite
redis:
  port: '6379'
  ttl: '86400'
`;

      await fs.writeFile(configPath, config);

      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load();

      expect(manager.get('redis.port')).toBe(6379);
      expect(typeof manager.get('redis.port')).toBe('number');
    });

    it('should validate types and reject invalid coercions', async () => {
      const config = `version: '1.0'
database:
  type: sqlite
redis:
  enabled: 'not-a-boolean'
`;

      await fs.writeFile(configPath, config);

      const manager = new ConfigManager(configPath, schemaPath);
      await expect(manager.load()).rejects.toThrow(/schema validation|must be boolean/i);
    });
  });

  describe('Environment Overrides', () => {
    it('should merge environment-specific configuration', async () => {
      const prodConfigPath = path.join(testDir, 'config', 'production.yml');
      const prodConfig = `database:
  type: postgres
  host: db.production.local

redis:
  host: redis.production.local
  port: 6380

agents:
  maxConcurrent: 50
`;

      await fs.writeFile(prodConfigPath, prodConfig);

      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load('production');

      expect(manager.get('database.type')).toBe('postgres');
      expect(manager.get('database.host')).toBe('db.production.local');
      expect(manager.get('redis.port')).toBe(6380);
      expect(manager.get('agents.maxConcurrent')).toBe(50);
      // Should preserve non-overridden values from default
      expect(manager.get('database.path')).toBe('./data/cfn.db');
    });

    it('should handle missing environment override gracefully', async () => {
      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load('staging'); // staging.yml doesn't exist

      // Should load default config without errors
      expect(manager.get('database.type')).toBe('sqlite');
    });
  });

  describe('Hot Reload Support', () => {
    it('should detect configuration file changes', async () => {
      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load();
      await manager.enableHotReload();

      expect(manager.get('redis.port')).toBe(6379);

      // Modify configuration
      const updatedConfig = `version: '1.0'
database:
  type: sqlite
redis:
  enabled: true
  port: 7000
`;

      await fs.writeFile(configPath, updatedConfig);

      // Wait for file watcher to trigger
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(manager.get('redis.port')).toBe(7000);

      await manager.disableHotReload();
    });

    it('should emit reload events on configuration change', async () => {
      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load();
      await manager.enableHotReload();

      const reloadCallback = jest.fn();
      manager.on('reload', reloadCallback);

      const updatedConfig = `version: '1.0'
database:
  type: postgres
`;

      await fs.writeFile(configPath, updatedConfig);
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(reloadCallback).toHaveBeenCalled();

      await manager.disableHotReload();
    });
  });

  describe('Typed Retrieval', () => {
    it('should retrieve nested configuration values', async () => {
      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load();

      expect(manager.get('database.pool.min')).toBe(2);
      expect(manager.get('database.pool.max')).toBe(10);
    });

    it('should return default value when key does not exist', async () => {
      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load();

      expect(manager.get('nonexistent.key', 'default')).toBe('default');
      expect(manager.get('nonexistent.key')).toBeUndefined();
    });

    it('should return all configuration as object', async () => {
      const manager = new ConfigManager(configPath, schemaPath);
      await manager.load();

      const all = manager.getAll();
      expect(all).toHaveProperty('version');
      expect(all).toHaveProperty('database');
      expect(all).toHaveProperty('redis');
      expect(all).toHaveProperty('agents');
    });
  });

  describe('Backward Compatibility', () => {
    it('should read legacy JSON format with deprecation warning', async () => {
      const jsonConfigPath = path.join(testDir, 'config', 'legacy.json');
      const jsonConfig = {
        version: '1.0',
        database: {
          type: 'sqlite',
          path: './data/legacy.db'
        },
        redis: {
          enabled: true,
          host: 'localhost',
          port: 6379
        }
      };

      await fs.writeFile(jsonConfigPath, JSON.stringify(jsonConfig, null, 2));

      const manager = new ConfigManager(jsonConfigPath, schemaPath);
      const warnings: string[] = [];
      manager.on('warning', (msg: string) => warnings.push(msg));

      await manager.load();

      expect(manager.get('database.type')).toBe('sqlite');
      expect(warnings.some(w => w.includes('deprecated'))).toBe(true);
    });
  });
});

describe('ConfigMigrator', () => {
  const testDir = path.join('/tmp', 'config-migrator-tests');

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('JSON to YAML Migration', () => {
    it('should migrate JSON configuration to YAML', async () => {
      const jsonPath = path.join(testDir, 'config.json');
      const yamlPath = path.join(testDir, 'config.yml');

      const jsonConfig = {
        version: '1.0',
        database: {
          type: 'sqlite',
          path: './data/cfn.db',
          pool: {
            min: 2,
            max: 10
          }
        },
        redis: {
          enabled: true,
          host: 'localhost',
          port: 6379
        }
      };

      await fs.writeFile(jsonPath, JSON.stringify(jsonConfig, null, 2));

      const migrator = new ConfigMigrator();
      await migrator.migrateJsonToYaml(jsonPath, yamlPath);

      const yamlContent = await fs.readFile(yamlPath, 'utf-8');
      expect(yamlContent).toContain('version: \'1.0\'');
      expect(yamlContent).toContain('type: sqlite');
      expect(yamlContent).toContain('enabled: true');
    });

    it('should preserve data types during JSON to YAML migration', async () => {
      const jsonPath = path.join(testDir, 'types.json');
      const yamlPath = path.join(testDir, 'types.yml');

      const jsonConfig = {
        string: 'hello',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        object: { nested: 'value' },
        null_value: null
      };

      await fs.writeFile(jsonPath, JSON.stringify(jsonConfig, null, 2));

      const migrator = new ConfigMigrator();
      await migrator.migrateJsonToYaml(jsonPath, yamlPath);

      const yaml = require('js-yaml');
      const yamlContent = await fs.readFile(yamlPath, 'utf-8');
      const parsed = yaml.load(yamlContent);

      expect(parsed.string).toBe('hello');
      expect(parsed.number).toBe(42);
      expect(parsed.boolean).toBe(true);
      expect(parsed.array).toEqual([1, 2, 3]);
      expect(parsed.object.nested).toBe('value');
      expect(parsed.null_value).toBeNull();
    });
  });

  describe('ENV to YAML Migration', () => {
    it('should migrate .env file to YAML', async () => {
      const envPath = path.join(testDir, '.env');
      const yamlPath = path.join(testDir, 'config.yml');

      const envContent = `DATABASE_TYPE=sqlite
DATABASE_PATH=./data/cfn.db
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=true
AGENTS_MAX_CONCURRENT=10
`;

      await fs.writeFile(envPath, envContent);

      const migrator = new ConfigMigrator();
      await migrator.migrateEnvToYaml(envPath, yamlPath);

      const yamlContent = await fs.readFile(yamlPath, 'utf-8');
      expect(yamlContent).toContain('database:');
      expect(yamlContent).toContain('type: sqlite');
      expect(yamlContent).toContain('pool:');
      expect(yamlContent).toContain('min: 2');
      expect(yamlContent).toContain('redis:');
      expect(yamlContent).toContain('host: localhost');
    });

    it('should infer types from ENV values', async () => {
      const envPath = path.join(testDir, '.env');
      const yamlPath = path.join(testDir, 'config.yml');

      const envContent = `APP_NAME=TestApp
PORT=42
DEBUG=true
ENABLED=false
RATE_LIMIT=3.14
`;

      await fs.writeFile(envPath, envContent);

      const migrator = new ConfigMigrator();
      await migrator.migrateEnvToYaml(envPath, yamlPath);

      const yaml = require('js-yaml');
      const yamlContent = await fs.readFile(yamlPath, 'utf-8');
      const parsed = yaml.load(yamlContent);

      // Two-word keys get nested: APP_NAME → app.name
      expect(parsed.app.name).toBe('TestApp');
      // Single-word keys stay flat
      expect(parsed.port).toBe(42);
      expect(parsed.debug).toBe(true);
      expect(parsed.enabled).toBe(false);
      // Two-word with underscore
      expect(parsed.rate.limit).toBe(3.14);
    });
  });

  describe('Bash Variables to YAML Migration', () => {
    it('should migrate bash variable file to YAML', async () => {
      const bashPath = path.join(testDir, 'config.sh');
      const yamlPath = path.join(testDir, 'config.yml');

      const bashContent = `#!/bin/bash
DB_TYPE="sqlite"
DB_PATH="./data/cfn.db"
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_ENABLED=true
`;

      await fs.writeFile(bashPath, bashContent);

      const migrator = new ConfigMigrator();
      await migrator.migrateBashToYaml(bashPath, yamlPath);

      const yaml = require('js-yaml');
      const yamlContent = await fs.readFile(yamlPath, 'utf-8');
      const parsed = yaml.load(yamlContent);

      // Verify nested structure
      expect(parsed.db.type).toBe('sqlite');
      expect(parsed.db.path).toBe('./data/cfn.db');
      expect(parsed.redis.host).toBe('localhost');
      expect(parsed.redis.port).toBe(6379);
      expect(parsed.redis.enabled).toBe(true);
    });
  });

  describe('Migration Validation', () => {
    it('should validate migrated configuration before writing', async () => {
      const jsonPath = path.join(testDir, 'invalid.json');
      const yamlPath = path.join(testDir, 'output.yml');
      const schemaPath = path.join(testDir, 'schema.json');

      const schema = {
        type: 'object',
        properties: {
          required_field: { type: 'string' }
        },
        required: ['required_field']
      };

      await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));

      const invalidConfig = {
        optional_field: 'value'
        // missing required_field
      };

      await fs.writeFile(jsonPath, JSON.stringify(invalidConfig, null, 2));

      const migrator = new ConfigMigrator(schemaPath);
      await expect(migrator.migrateJsonToYaml(jsonPath, yamlPath))
        .rejects.toThrow(/validation/i);
    });

    it('should create backup before migration', async () => {
      const jsonPath = path.join(testDir, 'config.json');
      const yamlPath = path.join(testDir, 'config.yml');

      const jsonConfig = { version: '1.0', database: { type: 'sqlite' } };
      await fs.writeFile(jsonPath, JSON.stringify(jsonConfig, null, 2));

      const migrator = new ConfigMigrator();
      await migrator.migrateJsonToYaml(jsonPath, yamlPath);

      const backupFiles = await fs.readdir(testDir);
      const hasBackup = backupFiles.some(f => f.includes('.backup'));
      expect(hasBackup).toBe(true);
    });
  });

  describe('Dry Run Mode', () => {
    it('should preview migration without writing files', async () => {
      const jsonPath = path.join(testDir, 'config.json');
      const yamlPath = path.join(testDir, 'config.yml');

      const jsonConfig = { version: '1.0', database: { type: 'sqlite' } };
      await fs.writeFile(jsonPath, JSON.stringify(jsonConfig, null, 2));

      const migrator = new ConfigMigrator();
      const preview = await migrator.migrateJsonToYaml(jsonPath, yamlPath, { dryRun: true });

      expect(preview).toContain('version:');

      // Verify file was not created
      await expect(fs.access(yamlPath)).rejects.toThrow();
    });
  });
});
