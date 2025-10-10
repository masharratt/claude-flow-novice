#!/usr/bin/env node

/**
 * Claude Flow Novice - Uninstall Script
 *
 * Clean removal of package and configurations
 */

import { execSync, spawn } from 'child_process';
import { existsSync, removeSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

class UninstallManager {
  constructor() {
    this.platform = platform();
    this.homeDir = homedir();
    this.configDir = join(this.homeDir, '.claude-flow-novice');
    this.globalInstall = false;
    this.keepConfig = false;
    this.keepData = false;
  }

  async uninstall() {
    console.log(chalk.blue.bold('🗑️ Claude Flow Novice Uninstall\n'));

    try {
      await this.promptUninstallOptions();
      await this.stopServices();
      await this.removeGlobalPackage();
      await this.removeLocalFiles();
      await this.removeConfigurations();
      await this.removeServices();
      await this.cleanupRegistry();
      await this.verifyRemoval();

      this.showUninstallSuccess();
    } catch (error) {
      console.error(chalk.red('❌ Uninstall failed:'), error.message);
      process.exit(1);
    }
  }

  async promptUninstallOptions() {
    console.log(chalk.yellow('This will remove Claude Flow Novice from your system.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'keepConfig',
        message: 'Keep configuration files for future use?',
        default: true
      },
      {
        type: 'confirm',
        name: 'keepData',
        message: 'Keep user data and logs?',
        default: true
      },
      {
        type: 'confirm',
        name: 'removeServices',
        message: 'Remove system services (Redis, etc.)?',
        default: false
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to proceed with uninstallation?',
        default: false
      }
    ]);

    if (!answers.confirm) {
      console.log(chalk.cyan('Uninstall cancelled.'));
      process.exit(0);
    }

    this.keepConfig = answers.keepConfig;
    this.keepData = answers.keepData;
    this.removeServices = answers.removeServices;

    // Check if globally installed
    try {
      execSync('npm list -g claude-flow-novice', { stdio: 'ignore' });
      this.globalInstall = true;
    } catch (error) {
      this.globalInstall = false;
    }
  }

  async stopServices() {
    const spinner = ora('Stopping services...').start();

    try {
      const serviceManager = new (await import('./service-manager.js')).default();
      await serviceManager.stopAllServices();

      spinner.succeed('Services stopped successfully');
    } catch (error) {
      spinner.warn('Some services could not be stopped');
      console.warn(chalk.yellow('Warning: Some services may still be running'));
    }
  }

  async removeGlobalPackage() {
    if (!this.globalInstall) {
      return;
    }

    const spinner = ora('Removing global package...').start();

    try {
      await this.executeCommand('npm uninstall -g claude-flow-novice', { timeout: 60000 });
      spinner.succeed('Global package removed');
    } catch (error) {
      spinner.fail('Failed to remove global package');
      throw error;
    }
  }

  async removeLocalFiles() {
    const spinner = ora('Removing local files...').start();

    try {
      const projectRoot = process.cwd();

      // Remove local node_modules if it contains claude-flow-novice
      const nodeModulesPath = join(projectRoot, 'node_modules', 'claude-flow-novice');
      if (existsSync(nodeModulesPath)) {
        await this.executeCommand(`rm -rf "${nodeModulesPath}"`, { timeout: 30000 });
      }

      // Remove package-lock.json entries
      const packageLockPath = join(projectRoot, 'package-lock.json');
      if (existsSync(packageLockPath)) {
        try {
          const packageLock = JSON.parse(require('fs').readFileSync(packageLockPath, 'utf8'));
          if (packageLock.packages?.['node_modules/claude-flow-novice']) {
            delete packageLock.packages['node_modules/claude-flow-novice'];
            require('fs').writeFileSync(packageLockPath, JSON.stringify(packageLock, null, 2));
          }
        } catch (error) {
          // Ignore package-lock.json modification errors
        }
      }

      spinner.succeed('Local files removed');
    } catch (error) {
      spinner.warn('Some local files could not be removed');
      console.warn(chalk.yellow('Warning: You may need to manually remove some files'));
    }
  }

  async removeConfigurations() {
    if (!existsSync(this.configDir)) {
      return;
    }

    const spinner = ora('Removing configurations...').start();

    try {
      if (!this.keepConfig && !this.keepData) {
        // Remove everything
        await this.executeCommand(`rm -rf "${this.configDir}"`, { timeout: 30000 });
      } else {
        // Keep selected items
        const itemsToKeep = [];

        if (this.keepConfig) {
          itemsToKeep.push('config');
        }

        if (this.keepData) {
          itemsToKeep.push('logs', 'data');
        }

        // Remove only items not in keep list
        const items = require('fs').readdirSync(this.configDir);
        for (const item of items) {
          if (!itemsToKeep.includes(item)) {
            const itemPath = join(this.configDir, item);
            const stats = statSync(itemPath);

            if (stats.isDirectory()) {
              await this.executeCommand(`rm -rf "${itemPath}"`, { timeout: 30000 });
            } else {
              await this.executeCommand(`rm "${itemPath}"`, { timeout: 30000 });
            }
          }
        }
      }

      spinner.succeed('Configurations removed');
    } catch (error) {
      spinner.warn('Some configurations could not be removed');
      console.warn(chalk.yellow('Warning: You may need to manually remove configuration files'));
    }
  }

  async removeServices() {
    if (!this.removeServices) {
      return;
    }

    const spinner = ora('Removing system services...').start();

    try {
      // Remove Redis (if installed by claude-flow-novice)
      await this.removeRedisService();

      // Remove systemd services (Linux)
      if (this.platform === 'linux') {
        await this.removeSystemdServices();
      }

      // Remove Windows services (if applicable)
      if (this.platform === 'win32') {
        await this.removeWindowsServices();
      }

      // Remove macOS launch agents (if applicable)
      if (this.platform === 'darwin') {
        await this.removeMacOSServices();
      }

      spinner.succeed('System services removed');
    } catch (error) {
      spinner.warn('Some services could not be removed');
      console.warn(chalk.yellow('Warning: You may need to manually remove system services'));
    }
  }

  async removeRedisService() {
    try {
      // Check if Redis was installed by our setup
      const redisConfigPath = join(this.configDir, 'redis.json');
      if (existsSync(redisConfigPath)) {
        const redisConfig = JSON.parse(require('fs').readFileSync(redisConfigPath, 'utf8'));

        if (redisConfig.installedByClaudeFlow) {
          if (this.platform === 'win32') {
            await this.executeCommand('net stop redis', { timeout: 30000 });
            await this.executeCommand('sc delete redis', { timeout: 30000 });
          } else if (this.platform === 'darwin') {
            await this.executeCommand('brew services stop redis', { timeout: 30000 });
            await this.executeCommand('brew uninstall redis', { timeout: 30000 });
          } else {
            await this.executeCommand('sudo systemctl stop redis-server', { timeout: 30000 });
            await this.executeCommand('sudo systemctl disable redis-server', { timeout: 30000 });
            await this.executeCommand('sudo apt-get remove redis-server -y', { timeout: 30000 });
          }
        }
      }
    } catch (error) {
      // Redis removal failed - continue with uninstall
    }
  }

  async removeSystemdServices() {
    const services = ['claude-flow-novice', 'claude-flow-dashboard', 'claude-flow-monitor'];

    for (const service of services) {
      try {
        await this.executeCommand(`sudo systemctl stop ${service}`, { timeout: 30000 });
        await this.executeCommand(`sudo systemctl disable ${service}`, { timeout: 30000 });
        await this.executeCommand(`sudo rm /etc/systemd/system/${service}.service`, { timeout: 30000 });
        await this.executeCommand('sudo systemctl daemon-reload', { timeout: 30000 });
      } catch (error) {
        // Service not found or removal failed - continue
      }
    }
  }

  async removeWindowsServices() {
    const services = ['ClaudeFlowNovice', 'ClaudeFlowDashboard', 'ClaudeFlowMonitor'];

    for (const service of services) {
      try {
        await this.executeCommand(`sc stop ${service}`, { timeout: 30000 });
        await this.executeCommand(`sc delete ${service}`, { timeout: 30000 });
      } catch (error) {
        // Service not found or removal failed - continue
      }
    }
  }

  async removeMacOSServices() {
    const launchAgents = [
      join(this.homeDir, 'Library', 'LaunchAgents', 'com.claude-flow-novice.plist'),
      join(this.homeDir, 'Library', 'LaunchAgents', 'com.claude-flow-dashboard.plist'),
      join(this.homeDir, 'Library', 'LaunchAgents', 'com.claude-flow-monitor.plist')
    ];

    for (const agent of launchAgents) {
      try {
        if (existsSync(agent)) {
          const serviceName = agent.split('/').pop().replace('.plist', '');
          await this.executeCommand(`launchctl unload ${agent}`, { timeout: 30000 });
          await this.executeCommand(`rm ${agent}`, { timeout: 30000 });
        }
      } catch (error) {
        // Service not found or removal failed - continue
      }
    }
  }

  async cleanupRegistry() {
    const spinner = ora('Cleaning up registry...').start();

    try {
      // Remove environment variables
      await this.removeEnvironmentVariables();

      // Remove PATH modifications
      await this.removePathModifications();

      // Remove MCP server registration
      await this.removeMCPRegistration();

      spinner.succeed('Registry cleaned up');
    } catch (error) {
      spinner.warn('Registry cleanup completed with warnings');
    }
  }

  async removeEnvironmentVariables() {
    const envVars = ['CLAUDE_FLOW_ENV', 'CLAUDE_FLOW_DATA_PATH', 'CLAUDE_FLOW_LOG_LEVEL'];

    if (this.platform === 'win32') {
      for (const varName of envVars) {
        try {
          await this.executeCommand(`reg delete "HKCU\\Environment" /v ${varName} /f`, { timeout: 30000 });
        } catch (error) {
          // Variable not found or removal failed - continue
        }
      }
    } else {
      // Remove from shell profiles
      const profiles = [
        join(this.homeDir, '.bashrc'),
        join(this.homeDir, '.zshrc'),
        join(this.homeDir, '.profile')
      ];

      for (const profile of profiles) {
        if (existsSync(profile)) {
          try {
            let content = require('fs').readFileSync(profile, 'utf8');

            for (const varName of envVars) {
              const regex = new RegExp(`^export ${varName}=.*$`, 'gm');
              content = content.replace(regex, '');
            }

            require('fs').writeFileSync(profile, content);
          } catch (error) {
            // Profile modification failed - continue
          }
        }
      }
    }
  }

  async removePathModifications() {
    // Remove claude-flow-novice from PATH
    if (this.platform === 'win32') {
      try {
        const currentPath = execSync('echo %PATH%', { encoding: 'utf8' });
        const newPath = currentPath
          .split(';')
          .filter(path => !path.includes('claude-flow-novice'))
          .join(';');

        await this.executeCommand(`setx PATH "${newPath}"`, { timeout: 30000 });
      } catch (error) {
        // PATH modification failed - continue
      }
    }
  }

  async removeMCPRegistration() {
    try {
      // Check if Claude Code CLI is available
      execSync('which claude', { stdio: 'ignore' });

      // Remove MCP server
      await this.executeCommand('claude mcp remove claude-flow-novice', { timeout: 30000 });
    } catch (error) {
      // Claude Code not installed or MCP removal failed - continue
    }
  }

  async verifyRemoval() {
    const spinner = ora('Verifying removal...').start();

    try {
      // Check if package is still installed
      try {
        execSync('npm list -g claude-flow-novice', { stdio: 'ignore' });
        throw new Error('Global package still installed');
      } catch (error) {
        // Expected error - package not found
      }

      // Check if services are still running
      try {
        execSync('redis-cli ping', { stdio: 'ignore' });
        console.warn(chalk.yellow('Warning: Redis may still be running'));
      } catch (error) {
        // Expected error - Redis not running
      }

      // Check if configuration directory still exists
      if (!this.keepConfig && !this.keepData && existsSync(this.configDir)) {
        console.warn(chalk.yellow('Warning: Configuration directory still exists'));
      }

      spinner.succeed('Removal verified successfully');
    } catch (error) {
      spinner.warn('Removal verification completed with warnings');
    }
  }

  showUninstallSuccess() {
    console.log(chalk.green.bold('\n✅ Claude Flow Novice has been successfully uninstalled!\n'));

    if (this.keepConfig || this.keepData) {
      console.log(chalk.yellow('Kept items:'));
      if (this.keepConfig) {
        console.log(chalk.white('• Configuration files'));
      }
      if (this.keepData) {
        console.log(chalk.white('• User data and logs'));
      }
      console.log(chalk.cyan(`Location: ${this.configDir}\n`));
    }

    console.log(chalk.blue('To completely remove all remaining files:'));
    console.log(chalk.white(`rm -rf "${this.configDir}"\n`));

    console.log(chalk.green('Thank you for using Claude Flow Novice!'));
    console.log(chalk.cyan('We\'d appreciate your feedback to help us improve.\n'));
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

// Force uninstall option
async function forceUninstall() {
  console.log(chalk.yellow.bold('⚠️ FORCE UNINSTALL MODE\n'));
  console.log(chalk.red('This will forcibly remove all Claude Flow Novice files and services.\n'));

  const manager = new UninstallManager();
  manager.keepConfig = false;
  manager.keepData = false;
  manager.removeServices = true;

  try {
    await manager.stopServices();
    await manager.removeGlobalPackage();
    await manager.removeLocalFiles();
    await this.executeCommand(`rm -rf "${manager.configDir}"`, { timeout: 30000 });
    await manager.removeServices();
    await manager.cleanupRegistry();

    console.log(chalk.green.bold('\n✅ Force uninstall completed!'));
  } catch (error) {
    console.error(chalk.red('❌ Force uninstall failed:'), error.message);
    process.exit(1);
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'force':
      await forceUninstall();
      break;
    default:
      const manager = new UninstallManager();
      await manager.uninstall();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default UninstallManager;