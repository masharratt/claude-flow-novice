/**
 * Configuration Migration Manager
 *
 * Handles version detection, automatic migrations, rollback capabilities,
 * and validation for configuration file version transitions.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { Config, ConfigManager } from './config-manager';

export interface ConfigVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export interface MigrationScript {
  fromVersion: string;
  toVersion: string;
  description: string;
  migrate: (config: any) => Promise<any>;
  rollback: (config: any) => Promise<any>;
  validate: (config: any) => Promise<boolean>;
  critical: boolean;
  backupRequired: boolean;
}

export interface MigrationRecord {
  id: string;
  fromVersion: string;
  toVersion: string;
  timestamp: Date;
  success: boolean;
  backupPath?: string;
  error?: string;
  rollbackAvailable: boolean;
}

export interface MigrationPlan {
  currentVersion: string;
  targetVersion: string;
  scripts: MigrationScript[];
  requiresBackup: boolean;
  estimatedDuration: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export class MigrationManager extends EventEmitter {
  private static instance: MigrationManager;
  private migrationHistory: MigrationRecord[] = [];
  private migrationHistoryPath: string;
  private backupDirectory: string;
  private readonly CURRENT_VERSION = '2.0.0';

  private constructor() {
    super();
    this.migrationHistoryPath = path.join(os.homedir(), '.claude-flow', 'migration-history.json');
    this.backupDirectory = path.join(os.homedir(), '.claude-flow', 'backups');
  }

  static getInstance(): MigrationManager {
    if (!MigrationManager.instance) {
      MigrationManager.instance = new MigrationManager();
    }
    return MigrationManager.instance;
  }

  /**
   * Initialize migration manager
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.backupDirectory, { recursive: true });
      await this.loadMigrationHistory();
      this.emit('migrationManagerInitialized', { timestamp: new Date() });
    } catch (error) {
      // No existing migration history, start fresh
      await this.saveMigrationHistory();
    }
  }

  /**
   * Detect configuration file version
   */
  async detectConfigVersion(configPath: string): Promise<string> {
    try {
      const content = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(content);

      // Check for version field in config
      if (config.version) {
        return config.version;
      }

      // Detect version based on structure
      return this.detectVersionByStructure(config);
    } catch (error) {
      throw new Error(`Unable to read or parse config file: ${(error as Error).message}`);
    }
  }

  /**
   * Check if migration is needed
   */
  async needsMigration(configPath: string): Promise<{ needed: boolean; currentVersion: string; targetVersion: string }> {
    const currentVersion = await this.detectConfigVersion(configPath);
    const needed = this.compareVersions(currentVersion, this.CURRENT_VERSION) < 0;

    return {
      needed,
      currentVersion,
      targetVersion: this.CURRENT_VERSION
    };
  }

  /**
   * Create migration plan
   */
  async createMigrationPlan(fromVersion: string, toVersion: string = this.CURRENT_VERSION): Promise<MigrationPlan> {
    const scripts = this.getMigrationScripts(fromVersion, toVersion);
    const requiresBackup = scripts.some(script => script.backupRequired || script.critical);

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (scripts.some(s => s.critical)) {
      riskLevel = 'high';
    } else if (scripts.length > 3 || scripts.some(s => s.backupRequired)) {
      riskLevel = 'medium';
    }

    return {
      currentVersion: fromVersion,
      targetVersion: toVersion,
      scripts,
      requiresBackup,
      estimatedDuration: this.estimateMigrationDuration(scripts),
      riskLevel
    };
  }

  /**
   * Execute migration plan
   */
  async executeMigration(configPath: string, plan?: MigrationPlan): Promise<MigrationRecord[]> {
    const currentVersion = await this.detectConfigVersion(configPath);

    if (!plan) {
      plan = await this.createMigrationPlan(currentVersion);
    }

    const records: MigrationRecord[] = [];
    let backupPath: string | undefined;

    try {
      // Create backup if required
      if (plan.requiresBackup) {
        backupPath = await this.createBackup(configPath);
        this.emit('migrationBackupCreated', { path: backupPath, timestamp: new Date() });
      }

      // Load current configuration
      let config = JSON.parse(await fs.readFile(configPath, 'utf8'));

      // Execute migration scripts in sequence
      for (const script of plan.scripts) {
        const record: MigrationRecord = {
          id: `${script.fromVersion}-${script.toVersion}-${Date.now()}`,
          fromVersion: script.fromVersion,
          toVersion: script.toVersion,
          timestamp: new Date(),
          success: false,
          backupPath,
          rollbackAvailable: true
        };

        try {
          this.emit('migrationScriptStarted', { script: script.description, timestamp: new Date() });

          // Execute migration
          config = await script.migrate(config);

          // Validate result
          const isValid = await script.validate(config);
          if (!isValid) {
            throw new Error('Migration validation failed');
          }

          record.success = true;
          this.emit('migrationScriptCompleted', { script: script.description, timestamp: new Date() });

        } catch (error) {
          record.success = false;
          record.error = (error as Error).message;
          records.push(record);

          this.emit('migrationScriptFailed', {
            script: script.description,
            error: record.error,
            timestamp: new Date()
          });

          throw new Error(`Migration failed at step: ${script.description}. Error: ${record.error}`);
        }

        records.push(record);
      }

      // Add version to migrated config
      config.version = plan.targetVersion;
      config.migrationTimestamp = new Date().toISOString();

      // Save migrated configuration
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

      // Update migration history
      this.migrationHistory.push(...records);
      await this.saveMigrationHistory();

      this.emit('migrationCompleted', {
        fromVersion: plan.currentVersion,
        toVersion: plan.targetVersion,
        stepsCompleted: records.length,
        timestamp: new Date()
      });

      return records;

    } catch (error) {
      this.emit('migrationFailed', {
        error: (error as Error).message,
        backupPath,
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Rollback to previous version
   */
  async rollback(configPath: string, migrationId?: string): Promise<void> {
    let targetRecord: MigrationRecord | undefined;

    if (migrationId) {
      targetRecord = this.migrationHistory.find(record => record.id === migrationId);
    } else {
      // Find the last successful migration
      targetRecord = this.migrationHistory
        .filter(record => record.success)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
    }

    if (!targetRecord) {
      throw new Error('No migration record found for rollback');
    }

    if (!targetRecord.rollbackAvailable) {
      throw new Error('Rollback not available for this migration');
    }

    if (!targetRecord.backupPath || !(await this.fileExists(targetRecord.backupPath))) {
      throw new Error('Backup file not found for rollback');
    }

    try {
      // Restore from backup
      await fs.copyFile(targetRecord.backupPath, configPath);

      this.emit('rollbackCompleted', {
        migrationId: targetRecord.id,
        restoredFrom: targetRecord.backupPath,
        timestamp: new Date()
      });

    } catch (error) {
      this.emit('rollbackFailed', {
        migrationId: targetRecord.id,
        error: (error as Error).message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Validate configuration after migration
   */
  async validateMigratedConfig(configPath: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Load and parse config
      const content = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(content);

      // Basic structure validation
      if (!config.version) {
        warnings.push('Configuration version not specified');
      }

      // Use ConfigManager validation
      const configManager = ConfigManager.getInstance();
      try {
        configManager.validate(config as Config);
      } catch (error) {
        errors.push(`Configuration validation failed: ${(error as Error).message}`);
      }

      // Check for deprecated fields
      const deprecatedFields = this.findDeprecatedFields(config);
      warnings.push(...deprecatedFields.map(field => `Deprecated field found: ${field}`));

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`Failed to validate configuration: ${(error as Error).message}`);
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Get migration history
   */
  getMigrationHistory(): MigrationRecord[] {
    return [...this.migrationHistory];
  }

  /**
   * Get available backups
   */
  async getAvailableBackups(): Promise<Array<{
    path: string;
    timestamp: Date;
    size: string;
    version?: string;
  }>> {
    try {
      const files = await fs.readdir(this.backupDirectory);
      const backups = [];

      for (const file of files) {
        if (file.endsWith('.backup.json')) {
          const filePath = path.join(this.backupDirectory, file);
          const stats = await fs.stat(filePath);

          backups.push({
            path: filePath,
            timestamp: stats.mtime,
            size: `${Math.round(stats.size / 1024 * 100) / 100} KB`
          });
        }
      }

      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    } catch (error) {
      return [];
    }
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const backups = await this.getAvailableBackups();
      let cleanedCount = 0;

      for (const backup of backups) {
        if (backup.timestamp < cutoffDate) {
          await fs.unlink(backup.path);
          cleanedCount++;
        }
      }

      this.emit('backupsCleanedUp', { count: cleanedCount, timestamp: new Date() });
      return cleanedCount;

    } catch (error) {
      this.emit('backupCleanupFailed', { error: (error as Error).message, timestamp: new Date() });
      throw error;
    }
  }

  // Private helper methods

  private async createBackup(configPath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDirectory, `config-${timestamp}.backup.json`);

    await fs.copyFile(configPath, backupPath);
    return backupPath;
  }

  private detectVersionByStructure(config: any): string {
    // Version detection heuristics based on configuration structure

    // Check for v2.0.0 features
    if (config.experienceLevel && config.featureFlags && config.autoDetection) {
      return '2.0.0';
    }

    // Check for v1.x features
    if (config.ruvSwarm && config.performance) {
      if (config.ruvSwarm.enableNeuralTraining !== undefined) {
        return '1.8.0';
      }
      return '1.5.0';
    }

    // Check for v1.0 features
    if (config.orchestrator && config.terminal && config.memory) {
      return '1.0.0';
    }

    // Assume legacy if no recognizable structure
    return '0.9.0';
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }

    return 0;
  }

  private getMigrationScripts(fromVersion: string, toVersion: string): MigrationScript[] {
    const scripts: MigrationScript[] = [];

    // Define migration scripts for different version transitions

    // 0.9.x to 1.0.0 - Basic structure migration
    if (this.versionInRange(fromVersion, toVersion, '0.9.0', '1.0.0')) {
      scripts.push({
        fromVersion: '0.9.0',
        toVersion: '1.0.0',
        description: 'Migrate to structured configuration format',
        migrate: async (config) => {
          // Convert legacy flat structure to hierarchical
          return {
            orchestrator: {
              maxConcurrentAgents: config.maxAgents || 8,
              taskQueueSize: 100,
              healthCheckInterval: 30000,
              shutdownTimeout: 30000
            },
            terminal: {
              type: config.terminalType || 'auto',
              poolSize: 5,
              recycleAfter: 10,
              healthCheckInterval: 60000,
              commandTimeout: 300000
            },
            memory: {
              backend: config.memoryBackend || 'hybrid',
              cacheSizeMB: config.cacheSize || 100,
              syncInterval: 5000,
              conflictResolution: 'crdt',
              retentionDays: 30
            },
            coordination: {
              maxRetries: 3,
              retryDelay: 1000,
              deadlockDetection: true,
              resourceTimeout: 60000,
              messageTimeout: 30000
            },
            mcp: {
              transport: 'stdio',
              port: 3000,
              tlsEnabled: false
            },
            logging: {
              level: config.logLevel || 'info',
              format: 'text',
              destination: 'console'
            },
            ...config // Preserve any other fields
          };
        },
        rollback: async (config) => {
          // Flatten structure back to legacy format
          return {
            maxAgents: config.orchestrator?.maxConcurrentAgents,
            terminalType: config.terminal?.type,
            memoryBackend: config.memory?.backend,
            cacheSize: config.memory?.cacheSizeMB,
            logLevel: config.logging?.level
          };
        },
        validate: async (config) => {
          return !!(config.orchestrator && config.terminal && config.memory);
        },
        critical: true,
        backupRequired: true
      });
    }

    // 1.x to 2.0.0 - Progressive disclosure migration
    if (this.versionInRange(fromVersion, toVersion, '1.0.0', '2.0.0')) {
      scripts.push({
        fromVersion: '1.8.0',
        toVersion: '2.0.0',
        description: 'Add progressive disclosure and experience levels',
        migrate: async (config) => {
          return {
            ...config,
            experienceLevel: 'intermediate', // Existing users get intermediate level
            featureFlags: {
              neuralNetworks: config.ruvSwarm?.enableNeuralTraining || false,
              byzantineConsensus: false,
              enterpriseIntegrations: false,
              advancedMonitoring: true,
              multiTierStorage: true,
              teamCollaboration: true,
              customWorkflows: true,
              performanceAnalytics: true
            },
            autoSetup: false, // Existing users don't want auto-setup
            performance: {
              enableCaching: true,
              cacheSize: 50,
              lazyLoading: true,
              optimizeMemory: true,
              ...config.performance
            },
            autoDetection: {
              enabled: false, // Don't auto-detect for existing configurations
              confidenceThreshold: 0.7,
              analysisDepth: 'shallow',
              useAI: false
            }
          };
        },
        rollback: async (config) => {
          // Remove v2.0.0 specific fields
          const { experienceLevel, featureFlags, autoSetup, autoDetection, ...v1Config } = config;
          return v1Config;
        },
        validate: async (config) => {
          return !!(config.experienceLevel && config.featureFlags);
        },
        critical: false,
        backupRequired: true
      });
    }

    return scripts;
  }

  private versionInRange(currentVersion: string, targetVersion: string, minVersion: string, maxVersion: string): boolean {
    return this.compareVersions(currentVersion, minVersion) >= 0 && this.compareVersions(targetVersion, maxVersion) >= 0;
  }

  private estimateMigrationDuration(scripts: MigrationScript[]): string {
    const baseTime = 30; // seconds
    const timePerScript = 10; // seconds per script
    const criticalPenalty = 20; // extra seconds for critical scripts

    let totalTime = baseTime + (scripts.length * timePerScript);
    totalTime += scripts.filter(s => s.critical).length * criticalPenalty;

    if (totalTime < 60) {
      return `${totalTime} seconds`;
    } else if (totalTime < 3600) {
      return `${Math.ceil(totalTime / 60)} minutes`;
    } else {
      return `${Math.ceil(totalTime / 3600)} hours`;
    }
  }

  private findDeprecatedFields(config: any, prefix = ''): string[] {
    const deprecated: string[] = [];
    const deprecatedFields = [
      'maxAgents', // Use orchestrator.maxConcurrentAgents
      'terminalType', // Use terminal.type
      'memoryBackend', // Use memory.backend
      'cacheSize', // Use memory.cacheSizeMB
      'logLevel' // Use logging.level
    ];

    for (const [key, value] of Object.entries(config)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (deprecatedFields.includes(key)) {
        deprecated.push(fullKey);
      }

      if (typeof value === 'object' && value !== null) {
        deprecated.push(...this.findDeprecatedFields(value, fullKey));
      }
    }

    return deprecated;
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async loadMigrationHistory(): Promise<void> {
    const data = await fs.readFile(this.migrationHistoryPath, 'utf8');
    const parsed = JSON.parse(data);

    this.migrationHistory = (parsed.records || []).map((record: any) => ({
      ...record,
      timestamp: new Date(record.timestamp)
    }));
  }

  private async saveMigrationHistory(): Promise<void> {
    await fs.mkdir(path.dirname(this.migrationHistoryPath), { recursive: true });

    const data = {
      version: '1.0.0',
      records: this.migrationHistory,
      lastModified: new Date()
    };

    await fs.writeFile(this.migrationHistoryPath, JSON.stringify(data, null, 2), 'utf8');
  }
}

export const migrationManager = MigrationManager.getInstance();