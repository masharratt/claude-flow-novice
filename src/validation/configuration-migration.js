/**
 * Configuration Migration Utilities
 * Phase 2 Implementation - Configuration Migration and Persistence
 *
 * Handles migration of configurations across versions and environments
 * Provides backup, restore, and upgrade capabilities
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../core/logger.js';
import { TruthConfigManager } from './truth-config-manager.js';
import { CustomFrameworkRegistry } from './custom-framework-registry.js';

const MIGRATION_VERSION = '2.0.0';
const BACKUP_RETENTION_DAYS = 30;

export class ConfigurationMigration {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.configDir = path.join(this.basePath, '.swarm');
    this.backupDir = path.join(this.configDir, 'backups');
    this.migrationLogPath = path.join(this.configDir, 'migration.log');
    this.logger = logger.child({ component: 'ConfigurationMigration' });

    this.migrationHandlers = new Map([
      ['1.0.0', this.migrateFromV1_0_0.bind(this)],
      ['1.1.0', this.migrateFromV1_1_0.bind(this)],
      ['1.2.0', this.migrateFromV1_2_0.bind(this)]
    ]);
  }

  /**
   * Main migration entry point
   */
  async migrate(options = {}) {
    try {
      await this.ensureDirectories();

      // Create backup before migration
      const backupId = await this.createBackup();

      // Detect current configuration version
      const currentVersion = await this.detectConfigurationVersion();

      this.logger.info('Starting configuration migration', {
        currentVersion,
        targetVersion: MIGRATION_VERSION,
        backupId
      });

      // Perform migration if needed
      if (currentVersion !== MIGRATION_VERSION) {
        await this.performMigration(currentVersion, MIGRATION_VERSION);
      }

      // Verify migration
      const verificationResult = await this.verifyMigration();

      if (!verificationResult.success) {
        // Rollback on failure
        if (options.autoRollback !== false) {
          await this.restoreFromBackup(backupId);
          throw new Error(`Migration failed: ${verificationResult.errors.join(', ')}`);
        }
      }

      // Log successful migration
      await this.logMigration({
        fromVersion: currentVersion,
        toVersion: MIGRATION_VERSION,
        backupId,
        timestamp: new Date().toISOString(),
        success: true
      });

      // Cleanup old backups
      await this.cleanupOldBackups();

      this.logger.info('Configuration migration completed successfully');

      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: MIGRATION_VERSION,
        backupId
      };

    } catch (error) {
      this.logger.error('Configuration migration failed', error);

      await this.logMigration({
        fromVersion: await this.detectConfigurationVersion(),
        toVersion: MIGRATION_VERSION,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Create complete backup of current configuration
   */
  async createBackup() {
    const backupId = `backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const backupPath = path.join(this.backupDir, backupId);

    await fs.mkdir(backupPath, { recursive: true });

    try {
      // Backup configuration files
      const configFiles = await this.getConfigurationFiles();

      for (const file of configFiles) {
        const relativePath = path.relative(this.configDir, file);
        const backupFile = path.join(backupPath, relativePath);

        await fs.mkdir(path.dirname(backupFile), { recursive: true });
        await fs.copyFile(file, backupFile);
      }

      // Create backup manifest
      const manifest = {
        backupId,
        timestamp: new Date().toISOString(),
        version: await this.detectConfigurationVersion(),
        files: configFiles.map(f => path.relative(this.configDir, f)),
        checksums: {}
      };

      // Calculate checksums for integrity verification
      for (const file of configFiles) {
        const content = await fs.readFile(file);
        const checksum = crypto.createHash('sha256').update(content).digest('hex');
        manifest.checksums[path.relative(this.configDir, file)] = checksum;
      }

      await fs.writeFile(
        path.join(backupPath, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      this.logger.info('Configuration backup created', {
        backupId,
        fileCount: configFiles.length,
        backupPath
      });

      return backupId;

    } catch (error) {
      // Cleanup failed backup
      await fs.rm(backupPath, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * Restore configuration from backup
   */
  async restoreFromBackup(backupId) {
    const backupPath = path.join(this.backupDir, backupId);
    const manifestPath = path.join(backupPath, 'manifest.json');

    try {
      // Load backup manifest
      const manifestData = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestData);

      this.logger.info('Restoring configuration from backup', {
        backupId,
        version: manifest.version,
        fileCount: manifest.files.length
      });

      // Restore files
      for (const relativePath of manifest.files) {
        const backupFile = path.join(backupPath, relativePath);
        const targetFile = path.join(this.configDir, relativePath);

        await fs.mkdir(path.dirname(targetFile), { recursive: true });
        await fs.copyFile(backupFile, targetFile);

        // Verify checksum
        const content = await fs.readFile(targetFile);
        const checksum = crypto.createHash('sha256').update(content).digest('hex');

        if (manifest.checksums[relativePath] !== checksum) {
          throw new Error(`Checksum mismatch for ${relativePath}`);
        }
      }

      this.logger.info('Configuration restored from backup successfully');

      return {
        success: true,
        backupId,
        restoredVersion: manifest.version,
        fileCount: manifest.files.length
      };

    } catch (error) {
      this.logger.error('Failed to restore from backup', error);
      throw error;
    }
  }

  /**
   * Detect current configuration version
   */
  async detectConfigurationVersion() {
    try {
      // Check for version file
      const versionFile = path.join(this.configDir, 'version.json');
      if (await this.fileExists(versionFile)) {
        const versionData = JSON.parse(await fs.readFile(versionFile, 'utf8'));
        return versionData.version;
      }

      // Check for user preferences file (indicates version 2.0+)
      const preferencesFile = path.join(this.configDir, 'user-preferences.json');
      if (await this.fileExists(preferencesFile)) {
        const preferences = JSON.parse(await fs.readFile(preferencesFile, 'utf8'));
        return preferences.version || '2.0.0';
      }

      // Check for legacy config structure
      const configsDir = path.join(this.configDir, 'configs');
      if (await this.dirExists(configsDir)) {
        return '1.2.0';
      }

      // Check for even older structure
      const oldConfigFile = path.join(this.configDir, 'config.json');
      if (await this.fileExists(oldConfigFile)) {
        return '1.0.0';
      }

      // No configuration found
      return '0.0.0';

    } catch (error) {
      this.logger.warn('Could not detect configuration version', error);
      return '0.0.0';
    }
  }

  /**
   * Perform migration between versions
   */
  async performMigration(fromVersion, toVersion) {
    const migrationPath = this.findMigrationPath(fromVersion, toVersion);

    this.logger.info('Performing migration', {
      fromVersion,
      toVersion,
      migrationPath
    });

    for (const version of migrationPath) {
      const handler = this.migrationHandlers.get(version);
      if (handler) {
        await handler();
        this.logger.debug(`Migration step completed: ${version}`);
      }
    }

    // Update version file
    await this.updateVersionFile(toVersion);
  }

  /**
   * Find migration path between versions
   */
  findMigrationPath(fromVersion, toVersion) {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];
    const fromIndex = versions.indexOf(fromVersion);
    const toIndex = versions.indexOf(toVersion);

    if (fromIndex === -1 || toIndex === -1) {
      throw new Error(`Unsupported version migration: ${fromVersion} -> ${toVersion}`);
    }

    return versions.slice(fromIndex + 1, toIndex + 1);
  }

  /**
   * Migration handler for v1.0.0
   */
  async migrateFromV1_0_0() {
    this.logger.info('Migrating from v1.0.0');

    // Migrate old config.json to new structure
    const oldConfigPath = path.join(this.configDir, 'config.json');
    if (await this.fileExists(oldConfigPath)) {
      const oldConfig = JSON.parse(await fs.readFile(oldConfigPath, 'utf8'));

      // Create new configs directory
      const configsDir = path.join(this.configDir, 'configs');
      await fs.mkdir(configsDir, { recursive: true });

      // Migrate to TruthConfigManager format
      const configManager = new TruthConfigManager({ configDir: configsDir });
      await configManager.initialize();

      const newConfig = await configManager.createFromFramework('CUSTOM', {
        name: 'Migrated Configuration',
        description: 'Migrated from v1.0.0',
        threshold: oldConfig.threshold || 0.75,
        tags: ['migrated', 'v1.0.0']
      });

      await configManager.saveConfiguration(newConfig, 'migrated_v1_0_0');
      await configManager.cleanup();

      // Archive old config
      await fs.rename(oldConfigPath, path.join(this.configDir, 'config.json.v1.0.0.bak'));
    }
  }

  /**
   * Migration handler for v1.1.0
   */
  async migrateFromV1_1_0() {
    this.logger.info('Migrating from v1.1.0');

    // Add Byzantine fault tolerance checks to existing configurations
    const configsDir = path.join(this.configDir, 'configs');
    if (await this.dirExists(configsDir)) {
      const configManager = new TruthConfigManager({ configDir: configsDir });
      await configManager.initialize();

      const configs = await configManager.listConfigurations();

      for (const configInfo of configs) {
        const config = await configManager.loadConfiguration(configInfo.filepath);

        // Add Byzantine checks if missing
        if (!config.checks.historicalValidation) {
          config.checks.historicalValidation = true;
          config.checks.crossAgentValidation = true;

          // Update metadata
          config.metadata.modified = new Date().toISOString();
          config.metadata.version = '1.1.0';

          await configManager.saveConfiguration(config, `${configInfo.name}_v1_1_0`);
        }
      }

      await configManager.cleanup();
    }
  }

  /**
   * Migration handler for v1.2.0
   */
  async migrateFromV1_2_0() {
    this.logger.info('Migrating from v1.2.0');

    // Create user preferences file
    const preferencesPath = path.join(this.configDir, 'user-preferences.json');

    if (!await this.fileExists(preferencesPath)) {
      const defaultPreferences = {
        version: '2.0.0',
        experienceLevel: 'intermediate',
        setupDate: new Date().toISOString(),
        hooksEnabled: false,
        qualityGates: {
          truthScore: 0.80,
          testCoverage: 85,
          codeQuality: 'B',
          documentationCoverage: 75
        },
        migrationHistory: [
          {
            fromVersion: '1.2.0',
            toVersion: '2.0.0',
            date: new Date().toISOString(),
            type: 'automatic'
          }
        ]
      };

      await fs.writeFile(preferencesPath, JSON.stringify(defaultPreferences, null, 2));
    }

    // Initialize custom framework registry
    const registry = new CustomFrameworkRegistry({ basePath: this.basePath });
    await registry.initialize();
    await registry.cleanup();
  }

  /**
   * Verify migration was successful
   */
  async verifyMigration() {
    const errors = [];
    const warnings = [];

    try {
      // Verify version file
      const versionFile = path.join(this.configDir, 'version.json');
      if (!await this.fileExists(versionFile)) {
        errors.push('Version file not found after migration');
      }

      // Verify user preferences
      const preferencesFile = path.join(this.configDir, 'user-preferences.json');
      if (!await this.fileExists(preferencesFile)) {
        errors.push('User preferences file not found after migration');
      } else {
        const preferences = JSON.parse(await fs.readFile(preferencesFile, 'utf8'));
        if (!preferences.version || !preferences.qualityGates) {
          errors.push('User preferences file is incomplete');
        }
      }

      // Verify configuration directory
      const configsDir = path.join(this.configDir, 'configs');
      if (!await this.dirExists(configsDir)) {
        warnings.push('Configuration directory not found');
      }

      // Verify truth configuration manager
      try {
        const configManager = new TruthConfigManager({
          configDir: configsDir
        });
        await configManager.initialize();

        const configs = await configManager.listConfigurations();
        if (configs.length === 0) {
          warnings.push('No configurations found after migration');
        }

        await configManager.cleanup();

      } catch (error) {
        errors.push(`Truth configuration manager verification failed: ${error.message}`);
      }

      // Verify custom framework registry
      try {
        const registry = new CustomFrameworkRegistry({ basePath: this.basePath });
        await registry.initialize();
        await registry.cleanup();

      } catch (error) {
        errors.push(`Custom framework registry verification failed: ${error.message}`);
      }

      return {
        success: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      return {
        success: false,
        errors: [error.message],
        warnings
      };
    }
  }

  /**
   * Update version file
   */
  async updateVersionFile(version) {
    const versionData = {
      version,
      updatedDate: new Date().toISOString(),
      migrationTool: 'ConfigurationMigration'
    };

    const versionFile = path.join(this.configDir, 'version.json');
    await fs.writeFile(versionFile, JSON.stringify(versionData, null, 2));

    this.logger.debug('Version file updated', { version });
  }

  /**
   * Get all configuration files
   */
  async getConfigurationFiles() {
    const files = [];

    // Scan configuration directory
    await this.scanDirectory(this.configDir, files, ['.git', 'node_modules', 'backups']);

    return files;
  }

  /**
   * Recursively scan directory for configuration files
   */
  async scanDirectory(dir, files, excludes = []) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (excludes.includes(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, files, excludes);
        } else if (entry.isFile()) {
          // Only include configuration-related files
          const ext = path.extname(entry.name).toLowerCase();
          if (['.json', '.js', '.ts', '.yaml', '.yml'].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Log migration activity
   */
  async logMigration(logEntry) {
    const logLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...logEntry
    }) + '\n';

    await fs.appendFile(this.migrationLogPath, logLine);
  }

  /**
   * Cleanup old backups based on retention policy
   */
  async cleanupOldBackups() {
    try {
      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - BACKUP_RETENTION_DAYS);

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('backup_')) {
          const manifestPath = path.join(this.backupDir, entry.name, 'manifest.json');

          try {
            const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
            const backupDate = new Date(manifest.timestamp);

            if (backupDate < cutoffDate) {
              await fs.rm(path.join(this.backupDir, entry.name), { recursive: true });
              this.logger.debug('Removed old backup', { backupId: entry.name });
            }
          } catch (error) {
            // Skip invalid backups
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to cleanup old backups', error);
    }
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  /**
   * Utility methods
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async dirExists(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

export default ConfigurationMigration;