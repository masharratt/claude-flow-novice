/**
 * Zero-Config Setup Utility
 * Provides true zero-configuration experience for novice users
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ConfigManager, AutoDetectionResult, ExperienceLevel } from '../config-manager.js';

export interface SetupOptions {
  projectPath?: string;
  skipInteractive?: boolean;
  experienceLevel?: ExperienceLevel;
  forceSetup?: boolean;
}

export interface SetupResult {
  success: boolean;
  configPath?: string;
  autoDetection: AutoDetectionResult;
  timeElapsed: number;
  setupSteps: string[];
  warnings: string[];
}

/**
 * Zero-Config Setup - Works completely automatically with no user input
 */
export class ZeroConfigSetup {
  private configManager: ConfigManager;
  private startTime: number = 0;
  private setupSteps: string[] = [];
  private warnings: string[] = [];

  constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  /**
   * Main setup method - achieves <15 second zero-config initialization
   */
  async setup(options: SetupOptions = {}): Promise<SetupResult> {
    this.startTime = Date.now();
    this.setupSteps = [];
    this.warnings = [];

    const projectPath = options.projectPath || process.cwd();

    try {
      this.addStep('Starting intelligent project analysis...');

      // Step 1: Auto-detect project configuration (fast)
      const autoDetection = await this.configManager.autoInit(projectPath);
      this.addStep(`Detected ${autoDetection.projectType} project (confidence: ${Math.round(autoDetection.confidence * 100)}%)`);

      // Step 2: Set experience level (default to novice for zero-config)
      const experienceLevel = options.experienceLevel || 'novice';
      this.configManager.setExperienceLevel(experienceLevel);
      this.addStep(`Experience level set to: ${experienceLevel}`);

      // Step 3: Create configuration directory structure
      const configDir = path.join(projectPath, '.claude-flow');
      await this.ensureConfigDirectory(configDir);
      this.addStep('Created configuration directory structure');

      // Step 4: Generate optimized configuration
      const configPath = path.join(projectPath, 'claude-flow.config.json');
      await this.configManager.createIntelligentConfig(configPath);
      this.addStep('Generated intelligent configuration');

      // Step 5: Setup secure credential storage if possible
      await this.setupCredentialStorage();
      this.addStep('Configured secure credential storage');

      // Step 6: Initialize caching for performance
      this.configManager['performanceCache'].set('setup-completed', {
        timestamp: Date.now(),
        projectType: autoDetection.projectType,
        experienceLevel
      });
      this.addStep('Initialized performance optimizations');

      // Step 7: Setup hooks integration if available
      await this.setupHooksIntegration(projectPath);
      this.addStep('Configured workflow hooks');

      const timeElapsed = Date.now() - this.startTime;

      return {
        success: true,
        configPath,
        autoDetection,
        timeElapsed,
        setupSteps: this.setupSteps,
        warnings: this.warnings
      };
    } catch (error) {
      const timeElapsed = Date.now() - this.startTime;
      this.addStep(`Setup failed: ${error.message}`);

      return {
        success: false,
        autoDetection: {
          projectType: 'generic',
          complexity: 'simple',
          confidence: 0.5,
          recommendations: ['Fallback configuration used due to setup error']
        },
        timeElapsed,
        setupSteps: this.setupSteps,
        warnings: [...this.warnings, error.message]
      };
    }
  }

  /**
   * Check if zero-config setup is needed
   */
  async isSetupNeeded(projectPath?: string): Promise<boolean> {
    const root = projectPath || process.cwd();
    const configFiles = [
      'claude-flow.config.json',
      '.claude-flow/config.json',
      'claude-flow.config.js'
    ];

    for (const configFile of configFiles) {
      try {
        await fs.access(path.join(root, configFile));
        return false; // Config exists
      } catch {
        // Config doesn't exist, continue checking
      }
    }

    return true; // No config found
  }

  /**
   * Migrate from existing configurations
   */
  async migrateExistingConfig(projectPath?: string): Promise<boolean> {
    const root = projectPath || process.cwd();

    // Check for legacy config files
    const legacyConfigs = [
      '.claude/config.json',
      'claude.config.json',
      '.claude-config.json'
    ];

    for (const legacyConfig of legacyConfigs) {
      const legacyPath = path.join(root, legacyConfig);
      try {
        const legacyContent = await fs.readFile(legacyPath, 'utf8');
        const legacyData = JSON.parse(legacyContent);

        // Migrate to new config format
        await this.configManager.load(); // Load defaults

        // Apply legacy settings
        if (legacyData.claude) {
          this.configManager.setClaudeConfig(legacyData.claude);
        }
        if (legacyData.ruvSwarm) {
          this.configManager.setRuvSwarmConfig(legacyData.ruvSwarm);
        }

        // Save migrated config
        await this.configManager.save(path.join(root, 'claude-flow.config.json'));

        // Backup legacy config
        await fs.rename(legacyPath, `${legacyPath}.backup.${Date.now()}`);

        this.addStep(`Migrated configuration from ${legacyConfig}`);
        return true;
      } catch {
        // Legacy config doesn't exist or is invalid
      }
    }

    return false;
  }

  /**
   * Interactive setup for users who want more control
   */
  async interactiveSetup(options: SetupOptions = {}): Promise<SetupResult> {
    // For now, delegate to automatic setup
    // Future enhancement: Add actual interactive prompts
    this.addStep('Interactive setup requested - using intelligent defaults');
    this.warnings.push('Interactive setup not yet implemented - used automatic setup');

    return await this.setup({ ...options, skipInteractive: true });
  }

  /**
   * Validate setup results
   */
  validateSetup(result: SetupResult): boolean {
    if (!result.success) return false;
    if (!result.configPath) return false;
    if (result.timeElapsed > 15000) {
      this.warnings.push('Setup took longer than 15 seconds target');
    }
    return true;
  }

  private addStep(step: string): void {
    this.setupSteps.push(`[${Date.now() - this.startTime}ms] ${step}`);
  }

  private async ensureConfigDirectory(configDir: string): Promise<void> {
    await fs.mkdir(configDir, { recursive: true });

    // Create subdirectories
    const subdirs = ['cache', 'logs', 'backups', 'templates'];
    for (const subdir of subdirs) {
      await fs.mkdir(path.join(configDir, subdir), { recursive: true });
    }
  }

  private async setupCredentialStorage(): Promise<void> {
    try {
      // Test if we can store/retrieve credentials
      const testKey = 'claude-flow-setup-test';
      await this.configManager.storeClaudeAPIKey('test-value');
      const retrieved = await this.configManager.getClaudeAPIKey();

      if (retrieved === 'test-value') {
        // Remove test credential
        await this.configManager['credentialStore'].store(testKey, '');
        this.addStep('Credential storage verified');
      }
    } catch (error) {
      this.warnings.push(`Credential storage setup warning: ${error.message}`);
    }
  }

  private async setupHooksIntegration(projectPath: string): Promise<void> {
    try {
      const { execSync } = require('child_process');

      // Test if claude-flow hooks are available
      execSync('npx claude-flow@alpha hooks --help', {
        stdio: 'ignore',
        cwd: projectPath,
        timeout: 5000
      });

      // Initialize hooks for the project
      execSync('npx claude-flow@alpha hooks init --auto', {
        stdio: 'ignore',
        cwd: projectPath,
        timeout: 5000
      });

    } catch (error) {
      this.warnings.push('Hooks integration not available - continuing without hooks');
    }
  }
}

/**
 * Convenience functions for easy usage
 */
export async function quickSetup(projectPath?: string): Promise<SetupResult> {
  const setup = new ZeroConfigSetup();
  return await setup.setup({ projectPath, skipInteractive: true });
}

export async function isSetupRequired(projectPath?: string): Promise<boolean> {
  const setup = new ZeroConfigSetup();
  return await setup.isSetupNeeded(projectPath);
}

export async function setupWithDefaults(experienceLevel: ExperienceLevel = 'novice'): Promise<SetupResult> {
  const setup = new ZeroConfigSetup();
  return await setup.setup({ experienceLevel, skipInteractive: true });
}