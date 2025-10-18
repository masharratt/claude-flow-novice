#!/usr/bin/env node

/**
 * Claude Flow Novice - Main Installation Script
 *
 * One-command installation with automatic setup
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import inquirer from 'inquirer';

class Installer {
  constructor() {
    this.projectRoot = resolve(__dirname, '../..');
    this.scriptsDir = join(__dirname);
  }

  async install() {
    this.showWelcome();

    try {
      // Step 1: Check dependencies
      await this.runDependencyChecker();

      // Step 2: Interactive setup
      await this.runSetup();

      // Step 3: Setup Redis
      await this.runRedisSetup();

      // Step 4: Verify installation
      await this.runHealthCheck();

      // Step 5: Show success
      this.showSuccess();

    } catch (error) {
      console.error(chalk.red('❌ Installation failed:'), error.message);
      process.exit(1);
    }
  }

  showWelcome() {
    const welcome = boxen(
      chalk.cyan.bold('🚀 Claude Flow Novice Installation\n\n') +
      chalk.white('AI Agent Orchestration Made Easy\n\n') +
      chalk.gray('This installer will:\n') +
      chalk.gray('• Check system requirements\n') +
      chalk.gray('• Install and configure Redis\n') +
      chalk.gray('• Set up configuration files\n') +
      chalk.gray('• Initialize services\n\n') +
      chalk.yellow('Press Enter to continue...'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan'
      }
    );

    console.log(welcome);
  }

  async runDependencyChecker() {
    console.log(chalk.blue.bold('🔍 Step 1: System Requirements Check\n'));

    const { DependencyChecker } = await import('./dependency-checker.js');
    const checker = new DependencyChecker();
    const result = await checker.check();

    if (!result.success) {
      console.log(chalk.red('\n❌ System requirements not met. Please resolve the issues above and try again.'));
      process.exit(1);
    }

    console.log(chalk.green('\n✅ System requirements check passed\n'));
  }

  async runSetup() {
    console.log(chalk.blue.bold('⚙️ Step 2: Configuration Setup\n'));

    const { SetupWizard } = await import('./setup.js');
    const wizard = new SetupWizard();
    await wizard.run();

    console.log(chalk.green('\n✅ Configuration completed\n'));
  }

  async runRedisSetup() {
    console.log(chalk.blue.bold('🔧 Step 3: Redis Setup\n'));

    const { RedisSetup } = await import('./redis-setup.js');
    const redisSetup = new RedisSetup();
    const success = await redisSetup.setup();

    if (!success) {
      console.log(chalk.yellow('\n⚠️ Redis setup completed with warnings. You may need to configure Redis manually.'));
    } else {
      console.log(chalk.green('\n✅ Redis setup completed\n'));
    }
  }

  async runHealthCheck() {
    console.log(chalk.blue.bold('🏥 Step 4: Installation Verification\n'));

    const { HealthChecker } = await import('./health-check.js');
    const checker = new HealthChecker();
    const result = await checker.check();

    if (result.overall === 'fail') {
      console.log(chalk.yellow('\n⚠️ Installation completed with some issues. Please review the health check results.'));
    } else {
      console.log(chalk.green('\n✅ Installation verification passed\n'));
    }
  }

  showSuccess() {
    const success = boxen(
      chalk.green.bold('🎉 Installation Completed Successfully!\n\n') +
      chalk.white('Claude Flow Novice is now ready to use.\n\n') +
      chalk.cyan('Quick Start:\n') +
      chalk.white('• Initialize a project: claude-flow-novice init\n') +
      chalk.white('• Start a swarm: claude-flow-novice swarm "Your task"\n') +
      chalk.white('• View dashboard: claude-flow-novice dashboard\n') +
      chalk.white('• Check status: claude-flow-novice status\n\n') +
      chalk.yellow('Configuration: ~/.claude-flow-novice/config/\n') +
      chalk.yellow('Documentation: https://github.com/masharratt/claude-flow-novice\n\n') +
      chalk.green('🚀 Happy agent orchestration!'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green'
      }
    );

    console.log(success);
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'check':
      const { DependencyChecker } = await import('./dependency-checker.js');
      const checker = new DependencyChecker();
      const result = await checker.check();
      process.exit(result.success ? 0 : 1);

    case 'setup':
      const { SetupWizard } = await import('./setup.js');
      const wizard = new SetupWizard();
      await wizard.run();
      break;

    case 'redis':
      const { RedisSetup } = await import('./redis-setup.js');
      const redisSetup = new RedisSetup();
      const redisSuccess = await redisSetup.setup();
      process.exit(redisSuccess ? 0 : 1);

    case 'health':
      const { HealthChecker } = await import('./health-check.js');
      const healthChecker = new HealthChecker();
      const healthResult = await healthChecker.check();
      process.exit(healthResult.overall === 'pass' ? 0 : 1);

    case 'update':
      const { UpdateManager } = await import('./update.js');
      const updateManager = new UpdateManager();
      await updateManager.update();
      break;

    case 'uninstall':
      const { UninstallManager } = await import('./uninstall.js');
      const uninstallManager = new UninstallManager();
      await uninstallManager.uninstall();
      break;

    case 'service':
      const { ServiceManager } = await import('./service-manager.js');
      const serviceManager = new ServiceManager();
      const serviceCommand = process.argv[3];
      const serviceName = process.argv[4];

      let serviceResult;
      switch (serviceCommand) {
        case 'start':
          serviceResult = await serviceManager.start(serviceName);
          break;
        case 'stop':
          serviceResult = await serviceManager.stop(serviceName);
          break;
        case 'restart':
          serviceResult = await serviceManager.restart(serviceName);
          break;
        case 'status':
          await serviceManager.status(serviceName);
          serviceResult = true;
          break;
        default:
          console.error(chalk.red('Unknown service command. Use: start|stop|restart|status [service-name]'));
          process.exit(1);
      }
      process.exit(serviceResult ? 0 : 1);

    case 'help':
    case '--help':
    case '-h':
      this.showHelp();
      break;

    default:
      const installer = new Installer();
      await installer.install();
  }
}

function showHelp() {
  console.log(chalk.blue.bold('Claude Flow Novice Installation Toolkit\n'));

  console.log(chalk.cyan('Commands:'));
  console.log(chalk.white('  claude-flow-novice install          Full installation'));
  console.log(chalk.white('  claude-flow-novice install check    Check system requirements'));
  console.log(chalk.white('  claude-flow-novice install setup    Run configuration setup'));
  console.log(chalk.white('  claude-flow-novice install redis    Setup Redis only'));
  console.log(chalk.white('  claude-flow-novice install health   Run health check'));
  console.log(chalk.white('  claude-flow-novice install update   Update installation'));
  console.log(chalk.white('  claude-flow-novice install uninstall Uninstall completely'));
  console.log(chalk.white('  claude-flow-novice install service  Manage services'));
  console.log(chalk.white('  claude-flow-novice install help     Show this help\n'));

  console.log(chalk.cyan('Service Management:'));
  console.log(chalk.white('  claude-flow-novice install service start [name]'));
  console.log(chalk.white('  claude-flow-novice install service stop [name]'));
  console.log(chalk.white('  claude-flow-novice install service restart [name]'));
  console.log(chalk.white('  claude-flow-novice install service status [name]\n'));

  console.log(chalk.cyan('Examples:'));
  console.log(chalk.white('  npx claude-flow-novice install          # Full installation'));
  console.log(chalk.white('  npx claude-flow-novice install check    # Check requirements only'));
  console.log(chalk.white('  npx claude-flow-novice install service start redis  # Start Redis service'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default Installer;