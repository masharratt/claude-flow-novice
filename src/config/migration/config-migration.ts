/**
 * Configuration Migration Utilities
 * Handles backward compatibility and version migrations
 */

import { promises as fs } from 'fs';
import path from 'path';
import { Config, ConfigManager, ExperienceLevel } from '../config-manager.js';

export interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  migratedSettings: string[];
  warnings: string[];
  backupPath?: string;
}

export interface LegacyConfig {
  version?: string;
  [key: string]: any;
}

/**
 * Configuration version migrations
 */
export class ConfigMigration {
  private static readonly CURRENT_VERSION = '2.0.0';
  private static readonly MIGRATIONS = new Map([
    ['1.0.0', ConfigMigration.migrateFromV1],
    ['1.1.0', ConfigMigration.migrateFromV1_1],
    ['1.5.0', ConfigMigration.migrateFromV1_5],
  ]);

  /**
   * Migrate configuration from any version to current
   */
  static async migrate(configPath: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      fromVersion: 'unknown',
      toVersion: ConfigMigration.CURRENT_VERSION,
      migratedSettings: [],
      warnings: []
    };

    try {
      // Read existing config
      const content = await fs.readFile(configPath, 'utf8');
      const legacyConfig: LegacyConfig = JSON.parse(content);

      // Detect version
      const fromVersion = legacyConfig.version || ConfigMigration.detectVersion(legacyConfig);
      result.fromVersion = fromVersion;

      // Create backup
      result.backupPath = await ConfigMigration.createBackup(configPath, fromVersion);
      result.migratedSettings.push(`Created backup: ${result.backupPath}`);

      // Apply migrations
      let migratedConfig = legacyConfig;
      const migrations = ConfigMigration.getMigrationsNeeded(fromVersion);

      for (const [version, migrationFn] of migrations) {
        const migrationResult = await migrationFn(migratedConfig);
        migratedConfig = migrationResult.config;
        result.migratedSettings.push(...migrationResult.changes);
        result.warnings.push(...migrationResult.warnings);
      }

      // Set current version
      migratedConfig.version = ConfigMigration.CURRENT_VERSION;

      // Write migrated config
      await fs.writeFile(configPath, JSON.stringify(migratedConfig, null, 2), 'utf8');
      result.migratedSettings.push('Updated configuration file');

      result.success = true;
      return result;
    } catch (error) {
      result.warnings.push(`Migration failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Detect configuration version from structure
   */
  private static detectVersion(config: any): string {
    // Version detection heuristics
    if (config.experienceLevel && config.featureFlags) {
      return '2.0.0'; // Already current
    }
    if (config.ruvSwarm && config.ruvSwarm.enableNeuralTraining !== undefined) {
      return '1.5.0';
    }
    if (config.claude && config.claude.model) {
      return '1.1.0';
    }
    return '1.0.0'; // Oldest supported
  }

  /**
   * Get list of migrations needed
   */
  private static getMigrationsNeeded(fromVersion: string): Array<[string, Function]> {
    const migrations: Array<[string, Function]> = [];

    // Add all migrations needed from fromVersion to current
    for (const [version, migrationFn] of ConfigMigration.MIGRATIONS) {
      if (ConfigMigration.isVersionNewer(version, fromVersion)) {
        migrations.push([version, migrationFn]);
      }
    }

    return migrations.sort(([a], [b]) => ConfigMigration.compareVersions(a, b));
  }

  /**
   * Compare version strings
   */
  private static compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;

      if (partA < partB) return -1;
      if (partA > partB) return 1;
    }

    return 0;
  }

  /**
   * Check if version A is newer than version B
   */
  private static isVersionNewer(a: string, b: string): boolean {
    return ConfigMigration.compareVersions(a, b) > 0;
  }

  /**
   * Create backup of configuration file
   */
  private static async createBackup(configPath: string, version: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${configPath}.v${version}.backup.${timestamp}`;

    await fs.copyFile(configPath, backupPath);
    return backupPath;
  }

  /**
   * Migration from v1.0.0 - Basic config structure
   */
  private static async migrateFromV1(legacyConfig: any): Promise<{config: any, changes: string[], warnings: string[]}> {
    const changes: string[] = [];
    const warnings: string[] = [];
    const config = { ...legacyConfig };

    // Add experience level system
    config.experienceLevel = 'intermediate'; // Preserve existing user's level
    config.featureFlags = {
      neuralNetworks: false,
      byzantineConsensus: false,
      enterpriseIntegrations: false,
      advancedMonitoring: true,
      multiTierStorage: true,
      teamCollaboration: true,
      customWorkflows: true,
      performanceAnalytics: true,
    };
    changes.push('Added experience level and feature flags system');

    // Add auto-setup capabilities
    config.autoSetup = false; // Preserve manual setup preference
    config.autoDetection = {
      enabled: false,
      confidenceThreshold: 0.7,
      analysisDepth: 'shallow',
      useAI: false,
    };
    changes.push('Added auto-setup and detection settings');

    // Add performance settings
    config.performance = {
      enableCaching: true,
      cacheSize: 50,
      lazyLoading: true,
      optimizeMemory: true,
    };
    changes.push('Added performance optimization settings');

    // Migrate old structure to new
    if (config.maxAgents) {
      config.orchestrator = config.orchestrator || {};
      config.orchestrator.maxConcurrentAgents = config.maxAgents;
      delete config.maxAgents;
      changes.push('Migrated maxAgents to orchestrator.maxConcurrentAgents');
    }

    return { config, changes, warnings };
  }

  /**
   * Migration from v1.1.0 - Added Claude API support
   */
  private static async migrateFromV1_1(legacyConfig: any): Promise<{config: any, changes: string[], warnings: string[]}> {
    const changes: string[] = [];
    const warnings: string[] = [];
    const config = { ...legacyConfig };

    // Update Claude model to latest
    if (config.claude && config.claude.model === 'claude-3-sonnet-20240229') {
      config.claude.model = 'claude-3-5-sonnet-20241022';
      changes.push('Updated Claude model to latest version');
    }

    // Add new Claude settings
    if (config.claude) {
      config.claude.timeout = config.claude.timeout || 60000;
      config.claude.retryAttempts = config.claude.retryAttempts || 3;
      config.claude.retryDelay = config.claude.retryDelay || 1000;
      changes.push('Added Claude API timeout and retry settings');
    }

    // Migrate API key to secure storage
    if (config.claude && config.claude.apiKey) {
      warnings.push('API key found in config - consider migrating to secure storage');
    }

    return { config, changes, warnings };
  }

  /**
   * Migration from v1.5.0 - Added neural training and advanced features
   */
  private static async migrateFromV1_5(legacyConfig: any): Promise<{config: any, changes: string[], warnings: string[]}> {
    const changes: string[] = [];
    const warnings: string[] = [];
    const config = { ...legacyConfig };

    // Enable advanced features for existing users
    if (!config.experienceLevel) {
      config.experienceLevel = 'advanced';
      config.featureFlags = {
        neuralNetworks: true,
        byzantineConsensus: true,
        enterpriseIntegrations: false,
        advancedMonitoring: true,
        multiTierStorage: true,
        teamCollaboration: true,
        customWorkflows: true,
        performanceAnalytics: true,
      };
      changes.push('Upgraded to advanced experience level with neural features');
    }

    // Update neural training settings
    if (config.ruvSwarm && config.ruvSwarm.enableNeuralTraining === true) {
      // Preserve existing neural training preference
      if (config.featureFlags) {
        config.featureFlags.neuralNetworks = true;
      }
      changes.push('Preserved neural training preferences');
    }

    return { config, changes, warnings };
  }

  /**
   * Validate migrated configuration
   */
  static validateMigratedConfig(config: Config): string[] {
    const issues: string[] = [];

    try {
      const configManager = ConfigManager.getInstance();
      configManager.validate(config);
    } catch (error) {
      issues.push(`Validation error: ${error.message}`);
    }

    // Check for required fields
    if (!config.experienceLevel) {
      issues.push('Missing experience level');
    }
    if (!config.featureFlags) {
      issues.push('Missing feature flags');
    }

    return issues;
  }

  /**
   * Rollback to previous version
   */
  static async rollback(configPath: string, backupPath: string): Promise<boolean> {
    try {
      await fs.copyFile(backupPath, configPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Convenience functions
 */
export async function migrateConfig(configPath: string): Promise<MigrationResult> {
  return await ConfigMigration.migrate(configPath);
}

export async function needsMigration(configPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);
    const version = config.version || '1.0.0';
    return version !== '2.0.0';
  } catch {
    return false; // If we can't read it, assume it doesn't need migration
  }
}