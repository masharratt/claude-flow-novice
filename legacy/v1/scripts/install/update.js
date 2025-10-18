#!/usr/bin/env node

/**
 * Claude Flow Novice - Update Script
 *
 * Handles seamless updates while preserving user configurations
 */

import { execSync, spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync, copyFileSync, renameSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir, platform } from 'os';
import chalk from 'chalk';
import ora from 'ora';
import semver from 'semver';

class UpdateManager {
  constructor() {
    this.platform = platform();
    this.homeDir = homedir();
    this.configDir = join(this.homeDir, '.claude-flow-novice', 'config');
    this.backupDir = join(this.homeDir, '.claude-flow-novice', 'backups');
    this.currentVersion = null;
    this.latestVersion = null;
  }

  async update() {
    console.log(chalk.blue.bold('🔄 Claude Flow Novice Update\n'));

    try {
      await this.checkCurrentVersion();
      await this.checkForUpdates();
      await this.createBackup();
      await this.downloadUpdate();
      await this.installUpdate();
      await this.migrateConfigurations();
      await this.verifyUpdate();
      await this.cleanup();

      this.showUpdateSuccess();
    } catch (error) {
      console.error(chalk.red('❌ Update failed:'), error.message);
      await this.restoreBackup();
      process.exit(1);
    }
  }

  async checkCurrentVersion() {
    const spinner = ora('Checking current version...').start();

    try {
      const packageJsonPath = join(this.homeDir, '.claude-flow-novice', 'package.json');

      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        this.currentVersion = packageJson.version;
      } else {
        // Try to get version from npm
        const output = execSync('npm list -g claude-flow-novice --depth=0 --json', { encoding: 'utf8' });
        const data = JSON.parse(output);
        this.currentVersion = data.dependencies?.['claude-flow-novice']?.version;
      }

      if (!this.currentVersion) {
        throw new Error('Unable to determine current version');
      }

      spinner.succeed(`Current version: ${this.currentVersion}`);
    } catch (error) {
      spinner.fail('Failed to check current version');
      throw error;
    }
  }

  async checkForUpdates() {
    const spinner = ora('Checking for updates...').start();

    try {
      // Get latest version from npm registry
      const output = execSync('npm view claude-flow-novice version', { encoding: 'utf8' });
      this.latestVersion = output.trim();

      if (semver.gt(this.latestVersion, this.currentVersion)) {
        spinner.succeed(`Update available: ${this.currentVersion} → ${this.latestVersion}`);
      } else {
        spinner.info('You already have the latest version');
        process.exit(0);
      }
    } catch (error) {
      spinner.fail('Failed to check for updates');
      throw error;
    }
  }

  async createBackup() {
    const spinner = ora('Creating backup...').start();

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = join(this.backupDir, `backup-${timestamp}`);

      // Create backup directory
      if (!existsSync(this.backupPath)) {
        require('fs').mkdirSync(this.backupPath, { recursive: true });
      }

      // Backup configuration files
      const configFiles = [
        'config.json',
        'redis.json',
        'services.json',
        '.env'
      ];

      for (const file of configFiles) {
        const sourcePath = join(this.configDir, file);
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, join(backupPath, file));
        }
      }

      // Backup package.json and package-lock.json if they exist
      const projectRoot = process.cwd();
      const packageFiles = ['package.json', 'package-lock.json'];

      for (const file of packageFiles) {
        const sourcePath = join(projectRoot, file);
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, join(backupPath, file));
        }
      }

      // Store backup metadata
      const metadata = {
        timestamp,
        version: this.currentVersion,
        platform: this.platform,
        nodeVersion: process.version,
        backupPath
      };

      writeFileSync(join(backupPath, 'metadata.json'), JSON.stringify(metadata, null, 2));

      spinner.succeed(`Backup created: ${backupPath}`);
      this.backupPath = backupPath;
    } catch (error) {
      spinner.fail('Backup creation failed');
      throw error;
    }
  }

  async downloadUpdate() {
    const spinner = ora('Downloading update...').start();

    try {
      // Update npm package
      await this.executeCommand('npm update -g claude-flow-novice', { timeout: 300000 });

      spinner.succeed('Update downloaded successfully');
    } catch (error) {
      spinner.fail('Download failed');
      throw error;
    }
  }

  async installUpdate() {
    const spinner = ora('Installing update...').start();

    try {
      // Stop services before update
      const serviceManager = new (await import('./service-manager.js')).default();
      await serviceManager.stopAllServices();

      // Install new version
      await this.executeCommand('npm install -g claude-flow-novice@latest', { timeout: 300000 });

      spinner.succeed('Update installed successfully');
    } catch (error) {
      spinner.fail('Installation failed');
      throw error;
    }
  }

  async migrateConfigurations() {
    const spinner = ora('Migrating configurations...').start();

    try {
      const configPath = join(this.configDir, 'config.json');
      const currentConfig = existsSync(configPath)
        ? JSON.parse(readFileSync(configPath, 'utf8'))
        : {};

      // Check if configuration migration is needed
      const needsMigration = this.checkConfigurationMigration(currentConfig);

      if (needsMigration) {
        const migratedConfig = await this.performConfigurationMigration(currentConfig);
        writeFileSync(configPath, JSON.stringify(migratedConfig, null, 2));
      }

      // Update version in configuration
      currentConfig.version = this.latestVersion;
      currentConfig.updatedAt = new Date().toISOString();

      writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));

      spinner.succeed('Configuration migration completed');
    } catch (error) {
      spinner.fail('Configuration migration failed');
      throw error;
    }
  }

  checkConfigurationMigration(config) {
    // Check for old configuration format that needs migration
    if (!config.version || semver.lt(config.version, '1.6.0')) {
      return true;
    }

    // Check for missing new configuration options
    if (!config.features?.mcp && !config.features?.dashboard) {
      return true;
    }

    return false;
  }

  async performConfigurationMigration(oldConfig) {
    const newConfig = { ...oldConfig };

    // Add missing default values
    if (!newConfig.features) {
      newConfig.features = {};
    }

    if (newConfig.features.mcp === undefined) {
      newConfig.features.mcp = true;
    }

    if (newConfig.features.dashboard === undefined) {
      newConfig.features.dashboard = true;
    }

    if (newConfig.features.monitoring === undefined) {
      newConfig.features.monitoring = true;
    }

    if (!newConfig.paths) {
      newConfig.paths = {
        data: join(this.homeDir, '.claude-flow-novice'),
        logs: join(this.homeDir, '.claude-flow-novice', 'logs'),
        config: this.configDir,
        temp: join(this.homeDir, '.claude-flow-novice', 'temp')
      };
    }

    return newConfig;
  }

  async verifyUpdate() {
    const spinner = ora('Verifying update...').start();

    try {
      // Check if the new version is installed
      const output = execSync('npm list -g claude-flow-novice --depth=0 --json', { encoding: 'utf8' });
      const data = JSON.parse(output);
      const installedVersion = data.dependencies?.['claude-flow-novice']?.version;

      if (installedVersion !== this.latestVersion) {
        throw new Error(`Version mismatch. Expected ${this.latestVersion}, got ${installedVersion}`);
      }

      // Test basic functionality
      execSync('claude-flow-novice --version', { stdio: 'ignore' });

      // Start services
      const serviceManager = new (await import('./service-manager.js')).default();
      await serviceManager.startAllServices();

      spinner.succeed('Update verified successfully');
    } catch (error) {
      spinner.fail('Update verification failed');
      throw error;
    }
  }

  async cleanup() {
    const spinner = ora('Cleaning up...').start();

    try {
      // Remove old backup files (keep last 5)
      await this.cleanupOldBackups();

      // Clear temporary files
      const tempDir = join(this.homeDir, '.claude-flow-novice', 'temp');
      if (existsSync(tempDir)) {
        await this.executeCommand(`rm -rf "${tempDir}"/*`, { timeout: 30000 });
      }

      spinner.succeed('Cleanup completed');
    } catch (error) {
      spinner.warn('Cleanup completed with warnings');
      console.warn(chalk.yellow('Some cleanup operations failed'));
    }
  }

  async cleanupOldBackups() {
    try {
      const backups = require('fs').readdirSync(this.backupDir)
        .filter(name => name.startsWith('backup-'))
        .map(name => ({
          name,
          path: join(this.backupDir, name),
          mtime: require('fs').statSync(join(this.backupDir, name)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // Keep only the latest 5 backups
      const backupsToDelete = backups.slice(5);

      for (const backup of backupsToDelete) {
        await this.executeCommand(`rm -rf "${backup.path}"`, { timeout: 30000 });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async restoreBackup() {
    if (!this.backupPath) {
      console.error(chalk.red('No backup available for restoration'));
      return;
    }

    const spinner = ora('Restoring backup...').start();

    try {
      // Stop services
      const serviceManager = new (await import('./service-manager.js')).default();
      await serviceManager.stopAllServices();

      // Restore configuration files
      const configFiles = [
        'config.json',
        'redis.json',
        'services.json',
        '.env'
      ];

      for (const file of configFiles) {
        const backupFilePath = join(this.backupPath, file);
        const configFilePath = join(this.configDir, file);

        if (existsSync(backupFilePath)) {
          copyFileSync(backupFilePath, configFilePath);
        }
      }

      // Restore previous version
      if (this.currentVersion) {
        await this.executeCommand(`npm install -g claude-flow-novice@${this.currentVersion}`, { timeout: 300000 });
      }

      spinner.succeed('Backup restored successfully');
      console.log(chalk.green('\n✅ System has been restored to the previous version'));
    } catch (error) {
      spinner.fail('Backup restoration failed');
      console.error(chalk.red('Critical: Backup restoration failed. Manual intervention required.'));
    }
  }

  showUpdateSuccess() {
    console.log(chalk.green.bold('\n🎉 Update completed successfully!\n'));
    console.log(chalk.cyan(`Updated from version ${this.currentVersion} to ${this.latestVersion}\n`));

    console.log(chalk.blue('What\'s new:'));
    console.log(chalk.white('• Enhanced swarm coordination algorithms'));
    console.log(chalk.white('• Improved performance monitoring'));
    console.log(chalk.white('• New MCP server features'));
    console.log(chalk.white('• Updated security enhancements\n'));

    console.log(chalk.yellow('Next steps:'));
    console.log(chalk.white('1. Review the changelog for new features'));
    console.log(chalk.white('2. Test your existing workflows'));
    console.log(chalk.white('3. Update your custom configurations if needed\n'));

    console.log(chalk.green('All your configurations and data have been preserved.'));
  }

  async executeCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [], {
        shell: true,
        stdio: 'pipe',
        ...options
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => stdout += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', reject);

      if (options.timeout) {
        setTimeout(() => {
          child.kill();
          reject(new Error('Command timeout'));
        }, options.timeout);
      }
    });
  }
}

// Additional command for checking updates without installing
async function checkUpdatesOnly() {
  const manager = new UpdateManager();

  try {
    await manager.checkCurrentVersion();
    await manager.checkForUpdates();

    console.log(chalk.green('\n✅ Your installation is up to date!'));
  } catch (error) {
    console.error(chalk.red('❌ Update check failed:'), error.message);
    process.exit(1);
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'check':
      await checkUpdatesOnly();
      break;
    case 'restore':
      const manager = new UpdateManager();
      await manager.restoreBackup();
      break;
    default:
      const updateManager = new UpdateManager();
      await updateManager.update();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default UpdateManager;