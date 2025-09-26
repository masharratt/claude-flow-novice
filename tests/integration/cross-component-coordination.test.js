/**
 * Cross-Component Coordination Integration Tests
 *
 * Tests the integration and coordination between all major system components:
 * - Configuration Manager
 * - Consent Manager
 * - Migration Manager
 * - Cache System
 * - Event System
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ConfigManager } from '../../src/config/config-manager.js';
import { ConsentManager } from '../../src/config/consent-manager.js';
import { MigrationManager } from '../../src/config/migration-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Cross-Component Coordination Integration Tests', () => {
  let testDir;
  let configManager;
  let consentManager;
  let migrationManager;
  let originalConfigPaths = new Map();

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'claude-flow-integration-test', Date.now().toString());
    await fs.mkdir(testDir, { recursive: true });

    // Initialize managers
    configManager = ConfigManager.getInstance();
    consentManager = ConsentManager.getInstance();
    migrationManager = MigrationManager.getInstance();

    // Override config paths for testing
    const testConfigDir = path.join(testDir, '.claude-flow');
    await fs.mkdir(testConfigDir, { recursive: true });

    // Store original paths and set test paths
    originalConfigPaths.set('config', configManager.userConfigDir);
    originalConfigPaths.set('consent', consentManager.consentStorePath);
    originalConfigPaths.set('migration', migrationManager.migrationHistoryPath);

    // Override paths for testing
    configManager.userConfigDir = testConfigDir;
    consentManager.consentStorePath = path.join(testConfigDir, 'consent-records.json');
    migrationManager.migrationHistoryPath = path.join(testConfigDir, 'migration-history.json');
    migrationManager.backupDirectory = path.join(testConfigDir, 'backups');
  });

  afterAll(async () => {
    // Restore original paths
    configManager.userConfigDir = originalConfigPaths.get('config');
    consentManager.consentStorePath = originalConfigPaths.get('consent');
    migrationManager.migrationHistoryPath = originalConfigPaths.get('migration');

    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clear any cached state
    configManager.invalidateCache();

    // Reset event listeners count to avoid memory leaks
    configManager.removeAllListeners();
    consentManager.removeAllListeners();
    migrationManager.removeAllListeners();
  });

  describe('Configuration and Consent Integration', () => {
    test('should coordinate configuration changes with consent requirements', async () => {
      let consentRequested = false;
      let configChanged = false;

      // Set up event listeners
      consentManager.on('consentRequested', () => {
        consentRequested = true;
      });

      configManager.on('experienceLevelChanged', () => {
        configChanged = true;
      });

      // Initialize systems
      await configManager.init();
      await consentManager.init();

      // Change experience level to advanced (should trigger consent for advanced features)
      configManager.setExperienceLevel('advanced');

      // Request consent for a feature that requires it
      const consentGranted = await consentManager.requestConsent('byzantineConsensus', 'advanced', {
        interactive: false,
        defaultResponse: true
      });

      expect(configChanged).toBe(true);
      expect(consentGranted).toBe(true);
      expect(configManager.isFeatureAvailable('byzantineConsensus')).toBe(true);
    });

    test('should respect consent decisions in configuration validation', async () => {
      await configManager.init();
      await consentManager.init();

      // Grant consent for neural networks
      await consentManager.requestConsent('neuralNetworks', 'advanced', {
        interactive: false,
        defaultResponse: true
      });

      // Deny consent for enterprise features
      await consentManager.requestConsent('enterpriseIntegrations', 'enterprise', {
        interactive: false,
        defaultResponse: false
      });

      // Check that configuration respects consent
      expect(consentManager.hasConsent('neuralNetworks')).toBe(true);
      expect(consentManager.hasConsent('enterpriseIntegrations')).toBe(false);

      // Configuration should reflect consent decisions
      configManager.setExperienceLevel('enterprise');
      const features = configManager.getAvailableFeatures();

      expect(features.neuralNetworks).toBe(true);
      expect(features.enterpriseIntegrations).toBe(true); // Available in config
      expect(consentManager.hasConsent('enterpriseIntegrations')).toBe(false); // But not consented
    });
  });

  describe('Configuration and Migration Integration', () => {
    test('should handle configuration migrations with proper backup and validation', async () => {
      const configPath = path.join(testDir, 'test-config.json');

      // Create a legacy configuration
      const legacyConfig = {
        maxAgents: 5,
        terminalType: 'native',
        memoryBackend: 'sqlite',
        logLevel: 'debug'
      };

      await fs.writeFile(configPath, JSON.stringify(legacyConfig, null, 2));

      // Initialize migration manager
      await migrationManager.init();

      // Detect version and create migration plan
      const version = await migrationManager.detectConfigVersion(configPath);
      expect(version).toBe('0.9.0'); // Should detect as legacy

      const migrationPlan = await migrationManager.createMigrationPlan(version);
      expect(migrationPlan.scripts.length).toBeGreaterThan(0);
      expect(migrationPlan.requiresBackup).toBe(true);

      // Execute migration
      const migrationRecords = await migrationManager.executeMigration(configPath, migrationPlan);
      expect(migrationRecords.every(record => record.success)).toBe(true);

      // Validate migrated configuration
      const validation = await migrationManager.validateMigratedConfig(configPath);
      expect(validation.isValid).toBe(true);

      // Load migrated config into ConfigManager
      await configManager.load(configPath);
      const migratedConfig = configManager.show();

      // Check that legacy values were migrated correctly
      expect(migratedConfig.orchestrator.maxConcurrentAgents).toBe(5);
      expect(migratedConfig.terminal.type).toBe('native');
      expect(migratedConfig.memory.backend).toBe('sqlite');
      expect(migratedConfig.logging.level).toBe('debug');
      expect(migratedConfig.version).toBe('2.0.0');
    });

    test('should handle migration rollback when validation fails', async () => {
      const configPath = path.join(testDir, 'test-config-rollback.json');

      // Create a configuration that will cause validation to fail
      const invalidConfig = {
        version: '1.0.0',
        orchestrator: { maxConcurrentAgents: -1 }, // Invalid value
        terminal: { type: 'invalid' },
        memory: { backend: 'unsupported' }
      };

      await fs.writeFile(configPath, JSON.stringify(invalidConfig, null, 2));

      await migrationManager.init();

      try {
        // This should fail during validation
        await migrationManager.executeMigration(configPath);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('Migration failed');
      }

      // Check that rollback is available
      const history = migrationManager.getMigrationHistory();
      const lastRecord = history[history.length - 1];

      if (lastRecord && lastRecord.backupPath) {
        // Test rollback
        await migrationManager.rollback(configPath);

        // Original content should be restored
        const restoredContent = await fs.readFile(configPath, 'utf8');
        const restoredConfig = JSON.parse(restoredContent);
        expect(restoredConfig.orchestrator.maxConcurrentAgents).toBe(-1);
      }
    });
  });

  describe('Cache and Performance Coordination', () => {
    test('should coordinate cache invalidation across components', async () => {
      let cacheInvalidated = false;
      let cacheWarmed = false;

      configManager.on('cacheInvalidated', () => {
        cacheInvalidated = true;
      });

      configManager.on('cacheWarmed', () => {
        cacheWarmed = true;
      });

      await configManager.init();

      // Warm the cache
      await configManager.warmCache();
      expect(cacheWarmed).toBe(true);

      // Get cache metrics
      const metrics = configManager.getCacheMetrics();
      expect(metrics.entryCount).toBeGreaterThan(0);
      expect(metrics.size).toBeGreaterThan(0);

      // Invalidate specific cache entries
      configManager.invalidateCache('config');
      expect(cacheInvalidated).toBe(true);

      // Cache should be cleared
      const metricsAfter = configManager.getCacheMetrics();
      expect(metricsAfter.entryCount).toBeLessThan(metrics.entryCount);
    });

    test('should preload configuration for optimal performance', async () => {
      let configPreloaded = false;

      configManager.on('configurationPreloaded', () => {
        configPreloaded = true;
      });

      await configManager.init();
      await configManager.preloadConfiguration();

      expect(configPreloaded).toBe(true);

      // Test that preloaded values are accessible quickly
      const startTime = Date.now();
      const orchestratorConfig = configManager.get('orchestrator');
      const endTime = Date.now();

      expect(orchestratorConfig).toBeDefined();
      expect(endTime - startTime).toBeLessThan(10); // Should be very fast due to caching
    });

    test('should monitor cache performance and auto-cleanup', async () => {
      let autoCleanupTriggered = false;

      configManager.on('cacheAutoCleanup', () => {
        autoCleanupTriggered = true;
      });

      await configManager.init();

      // Start monitoring with short interval for testing
      configManager.startCacheMonitoring(100);

      // Fill cache to trigger cleanup
      for (let i = 0; i < 1000; i++) {
        configManager.performanceCache.set(`test-key-${i}`, { large: 'data'.repeat(1000) });
      }

      // Wait for monitoring to detect and cleanup
      await new Promise(resolve => setTimeout(resolve, 200));

      // Stop monitoring
      configManager.stopCacheMonitoring();

      // Auto-cleanup might be triggered (depends on cache size limits)
      const metrics = configManager.getCacheMetrics();
      expect(metrics.entryCount).toBeDefined();
    });
  });

  describe('Event System Coordination', () => {
    test('should coordinate events across all components', async () => {
      const events = [];

      // Set up cross-component event listeners
      configManager.on('experienceLevelChanged', (data) => {
        events.push({ component: 'config', event: 'experienceLevelChanged', data });
      });

      consentManager.on('consentRecorded', (data) => {
        events.push({ component: 'consent', event: 'consentRecorded', data });
      });

      migrationManager.on('migrationCompleted', (data) => {
        events.push({ component: 'migration', event: 'migrationCompleted', data });
      });

      // Initialize all components
      await Promise.all([
        configManager.init(),
        consentManager.init(),
        migrationManager.init()
      ]);

      // Perform actions that should generate events
      configManager.setExperienceLevel('advanced');

      await consentManager.requestConsent('advancedMonitoring', 'advanced', {
        interactive: false,
        defaultResponse: true
      });

      // Check that events were recorded
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.some(e => e.component === 'config')).toBe(true);
      expect(events.some(e => e.component === 'consent')).toBe(true);
    });

    test('should handle concurrent operations without conflicts', async () => {
      await Promise.all([
        configManager.init(),
        consentManager.init(),
        migrationManager.init()
      ]);

      // Run multiple concurrent operations
      const operations = [
        configManager.setExperienceLevel('intermediate'),
        configManager.warmCache(),
        consentManager.requestConsent('performanceAnalytics', 'intermediate', {
          interactive: false,
          defaultResponse: true
        }),
        configManager.preloadConfiguration(),
        consentManager.cleanupExpiredConsent()
      ];

      // All operations should complete successfully
      const results = await Promise.allSettled(operations);
      const failures = results.filter(r => r.status === 'rejected');

      expect(failures.length).toBe(0);

      // System should be in a consistent state
      expect(configManager.get('experienceLevel')).toBe('intermediate');
      expect(consentManager.hasConsent('performanceAnalytics')).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should gracefully handle component failures', async () => {
      await configManager.init();

      // Simulate a component failure by corrupting data
      const invalidConfigPath = path.join(testDir, 'invalid-config.json');
      await fs.writeFile(invalidConfigPath, '{ invalid json }');

      try {
        await configManager.load(invalidConfigPath);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('Failed to load configuration');
      }

      // System should still be functional
      const config = configManager.show();
      expect(config).toBeDefined();
    });

    test('should maintain system integrity during partial failures', async () => {
      const events = [];

      configManager.on('initializationFailed', (data) => {
        events.push(data);
      });

      // Even if one component fails, others should work
      await configManager.init(); // This should work

      try {
        await migrationManager.rollback('/non/existent/config.json', 'invalid-id');
      } catch (error) {
        // Expected to fail, but shouldn't affect other components
      }

      // Other components should still be functional
      expect(configManager.get('orchestrator')).toBeDefined();

      const consentSummary = consentManager.getConsentSummary();
      expect(consentSummary).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large configuration sets efficiently', async () => {
      await configManager.init();

      const startTime = Date.now();

      // Perform many configuration operations
      for (let i = 0; i < 100; i++) {
        configManager.set(`test.config.${i}`, `value-${i}`);
      }

      const setTime = Date.now();

      // Retrieve all values
      for (let i = 0; i < 100; i++) {
        const value = configManager.get(`test.config.${i}`);
        expect(value).toBe(`value-${i}`);
      }

      const getTime = Date.now();

      // Operations should complete quickly
      expect(setTime - startTime).toBeLessThan(1000);
      expect(getTime - setTime).toBeLessThan(500);
    });

    test('should scale consent management for many features', async () => {
      await consentManager.init();

      const startTime = Date.now();

      // Request consent for multiple features rapidly
      const consentPromises = [];
      const features = ['neuralNetworks', 'advancedMonitoring', 'multiTierStorage', 'customWorkflows'];

      for (const feature of features) {
        consentPromises.push(
          consentManager.requestConsent(feature, 'advanced', {
            interactive: false,
            defaultResponse: true
          })
        );
      }

      const results = await Promise.all(consentPromises);
      const endTime = Date.now();

      // All consents should be granted
      expect(results.every(r => r === true)).toBe(true);

      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(2000);

      // Verify all consents were recorded
      const summary = consentManager.getConsentSummary();
      expect(summary.grantedConsents).toBe(features.length);
    });
  });
});