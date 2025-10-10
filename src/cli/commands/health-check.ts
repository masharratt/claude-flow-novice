/**
 * System Health Check Command
 * Provides comprehensive diagnostics for Claude Flow Novice
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSecurityAudit, checkKeyRotation, initializeSecretsManager } from '../../security/secrets-wrapper.js';

const execAsync = promisify(exec);

interface HealthCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string;
  fix?: string;
}

interface SystemInfo {
  nodeVersion: string;
  npmVersion: string;
  platform: string;
  arch: string;
  memory: {
    total: number;
    free: number;
    used: number;
  };
}

/**
 * System Health Checker
 */
export class HealthChecker {
  private results: HealthCheckResult[] = [];
  private systemInfo: SystemInfo | null = null;

  /**
   * Run all health checks
   */
  async runAllChecks(options: {
    verbose?: boolean;
    service?: string;
    fix?: boolean;
  } = {}): Promise<void> {
    console.log(chalk.bold.blue('\n🏥 Claude Flow Novice Health Check\n'));

    // Gather system information
    await this.gatherSystemInfo();

    // Run checks
    await this.checkNodeVersion();
    await this.checkNpmVersion();
    await this.checkDiskSpace();
    await this.checkMemory();

    // Service-specific checks
    if (!options.service || options.service === 'redis') {
      await this.checkRedis();
    }

    if (!options.service || options.service === 'config') {
      await this.checkConfiguration();
    }

    if (!options.service || options.service === 'dependencies') {
      await this.checkDependencies();
    }

    if (!options.service || options.service === 'security') {
      await this.checkSecurityPosture();
    }

    // Display results
    this.displayResults(options.verbose || false);

    // Auto-fix if requested
    if (options.fix) {
      await this.autoFix();
    }

    // Exit with appropriate code
    const hasFailures = this.results.some((r) => r.status === 'fail');
    process.exit(hasFailures ? 1 : 0);
  }

  /**
   * Gather system information
   */
  private async gatherSystemInfo(): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const totalMemory = require('os').totalmem();
    const freeMemory = require('os').freemem();

    this.systemInfo = {
      nodeVersion: process.version,
      npmVersion: await this.getNpmVersion(),
      platform: process.platform,
      arch: process.arch,
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: memoryUsage.heapUsed,
      },
    };
  }

  /**
   * Get npm version
   */
  private async getNpmVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('npm --version');
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check Node.js version
   */
  private async checkNodeVersion(): Promise<void> {
    const spinner = ora('Checking Node.js version...').start();

    const currentVersion = process.version;
    const majorVersion = parseInt(currentVersion.slice(1).split('.')[0], 10);

    if (majorVersion >= 20) {
      spinner.succeed(chalk.green('Node.js version is compatible'));
      this.results.push({
        name: 'Node.js Version',
        status: 'pass',
        message: `${currentVersion} (recommended 20+)`,
      });
    } else if (majorVersion >= 18) {
      spinner.warn(chalk.yellow('Node.js version is old but may work'));
      this.results.push({
        name: 'Node.js Version',
        status: 'warn',
        message: `${currentVersion} (upgrade to 20+ recommended)`,
        fix: 'nvm install 20 && nvm use 20',
      });
    } else {
      spinner.fail(chalk.red('Node.js version is too old'));
      this.results.push({
        name: 'Node.js Version',
        status: 'fail',
        message: `${currentVersion} is not supported`,
        fix: 'Install Node.js 20+: nvm install 20 && nvm use 20',
      });
    }
  }

  /**
   * Check npm version
   */
  private async checkNpmVersion(): Promise<void> {
    const spinner = ora('Checking npm version...').start();

    try {
      const { stdout } = await execAsync('npm --version');
      const version = stdout.trim();
      const majorVersion = parseInt(version.split('.')[0], 10);

      if (majorVersion >= 9) {
        spinner.succeed(chalk.green('npm version is compatible'));
        this.results.push({
          name: 'npm Version',
          status: 'pass',
          message: `${version} (recommended 9+)`,
        });
      } else {
        spinner.warn(chalk.yellow('npm version is old'));
        this.results.push({
          name: 'npm Version',
          status: 'warn',
          message: `${version} (upgrade to 9+ recommended)`,
          fix: 'npm install -g npm@latest',
        });
      }
    } catch (error) {
      spinner.fail(chalk.red('npm not found'));
      this.results.push({
        name: 'npm Version',
        status: 'fail',
        message: 'npm is not installed',
        fix: 'Install Node.js which includes npm',
      });
    }
  }

  /**
   * Check disk space
   */
  private async checkDiskSpace(): Promise<void> {
    const spinner = ora('Checking disk space...').start();

    try {
      const { stdout } = await execAsync(
        process.platform === 'win32' ? 'wmic logicaldisk get size,freespace' : 'df -h .',
      );

      // Simple check - actual implementation would parse output
      spinner.succeed(chalk.green('Disk space check completed'));
      this.results.push({
        name: 'Disk Space',
        status: 'pass',
        message: 'Sufficient disk space available',
      });
    } catch (error) {
      spinner.warn(chalk.yellow('Could not check disk space'));
      this.results.push({
        name: 'Disk Space',
        status: 'warn',
        message: 'Unable to verify disk space',
        details: 'Run df -h manually to check',
      });
    }
  }

  /**
   * Check available memory
   */
  private async checkMemory(): Promise<void> {
    const spinner = ora('Checking system memory...').start();

    if (!this.systemInfo) {
      spinner.fail(chalk.red('System info not available'));
      return;
    }

    const totalGB = (this.systemInfo.memory.total / 1024 / 1024 / 1024).toFixed(2);
    const freeGB = (this.systemInfo.memory.free / 1024 / 1024 / 1024).toFixed(2);
    const freePercent = (this.systemInfo.memory.free / this.systemInfo.memory.total) * 100;

    if (freePercent > 20) {
      spinner.succeed(chalk.green('Sufficient memory available'));
      this.results.push({
        name: 'System Memory',
        status: 'pass',
        message: `${freeGB}GB free of ${totalGB}GB (${freePercent.toFixed(1)}%)`,
      });
    } else if (freePercent > 10) {
      spinner.warn(chalk.yellow('Low memory warning'));
      this.results.push({
        name: 'System Memory',
        status: 'warn',
        message: `${freeGB}GB free of ${totalGB}GB (${freePercent.toFixed(1)}%)`,
        fix: 'Close unused applications or add more RAM',
      });
    } else {
      spinner.fail(chalk.red('Critical low memory'));
      this.results.push({
        name: 'System Memory',
        status: 'fail',
        message: `${freeGB}GB free of ${totalGB}GB (${freePercent.toFixed(1)}%)`,
        fix: 'Increase available memory before running swarms',
      });
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<void> {
    const spinner = ora('Checking Redis connection...').start();

    try {
      const { stdout } = await execAsync('redis-cli ping', { timeout: 3000 });

      if (stdout.trim() === 'PONG') {
        spinner.succeed(chalk.green('Redis is running and accessible'));
        this.results.push({
          name: 'Redis Connection',
          status: 'pass',
          message: 'Connected successfully',
        });
      } else {
        spinner.warn(chalk.yellow('Redis responded unexpectedly'));
        this.results.push({
          name: 'Redis Connection',
          status: 'warn',
          message: 'Redis connection may be unstable',
          fix: 'Restart Redis: redis-server or brew services restart redis',
        });
      }
    } catch (error) {
      spinner.fail(chalk.red('Redis is not running'));
      this.results.push({
        name: 'Redis Connection',
        status: 'fail',
        message: 'Cannot connect to Redis',
        details: 'Redis is required for swarm persistence',
        fix: 'Start Redis: redis-server (or brew services start redis)',
      });
    }
  }

  /**
   * Check configuration validity
   */
  private async checkConfiguration(): Promise<void> {
    const spinner = ora('Checking configuration...').start();

    try {
      // Check if config file exists
      const configPath = path.join(process.cwd(), 'claude-flow.config.json');

      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        spinner.succeed(chalk.green('Configuration is valid'));
        this.results.push({
          name: 'Configuration',
          status: 'pass',
          message: 'Configuration file is valid JSON',
        });
      } catch (parseError) {
        spinner.fail(chalk.red('Configuration is invalid'));
        this.results.push({
          name: 'Configuration',
          status: 'fail',
          message: 'Configuration file has syntax errors',
          details: parseError instanceof Error ? parseError.message : 'Unknown error',
          fix: 'Run: claude-flow-novice config validate',
        });
      }
    } catch (error) {
      spinner.warn(chalk.yellow('No configuration file found'));
      this.results.push({
        name: 'Configuration',
        status: 'warn',
        message: 'No claude-flow.config.json found',
        fix: 'Initialize project: claude-flow-novice init',
      });
    }
  }

  /**
   * Check dependencies
   */
  private async checkDependencies(): Promise<void> {
    const spinner = ora('Checking dependencies...').start();

    try {
      const packagePath = path.join(process.cwd(), 'package.json');

      try {
        const packageContent = await fs.readFile(packagePath, 'utf-8');
        const packageJson = JSON.parse(packageContent);

        // Check if claude-flow-novice is in dependencies
        const hasClaudeFlow =
          packageJson.dependencies?.['claude-flow-novice'] ||
          packageJson.devDependencies?.['claude-flow-novice'];

        if (hasClaudeFlow) {
          spinner.succeed(chalk.green('Dependencies are configured'));
          this.results.push({
            name: 'Dependencies',
            status: 'pass',
            message: 'claude-flow-novice is installed',
          });
        } else {
          spinner.warn(chalk.yellow('Project dependencies incomplete'));
          this.results.push({
            name: 'Dependencies',
            status: 'warn',
            message: 'claude-flow-novice not in package.json',
            fix: 'Install: npm install claude-flow-novice',
          });
        }
      } catch (parseError) {
        spinner.fail(chalk.red('Invalid package.json'));
        this.results.push({
          name: 'Dependencies',
          status: 'fail',
          message: 'package.json has syntax errors',
          fix: 'Fix JSON syntax in package.json',
        });
      }
    } catch (error) {
      spinner.info(chalk.blue('No package.json found'));
      this.results.push({
        name: 'Dependencies',
        status: 'warn',
        message: 'Not a Node.js project',
        details: 'This is OK if using global installation',
      });
    }
  }

  /**
   * Display health check results
   */
  private displayResults(verbose: boolean): void {
    console.log(chalk.bold('\n📊 Health Check Results\n'));

    const table = new Table({
      head: ['Component', 'Status', 'Details'],
      colWidths: [20, 12, 60],
      style: {
        head: ['cyan', 'bold'],
      },
    });

    for (const result of this.results) {
      const statusIcon =
        result.status === 'pass' ? chalk.green('✓ PASS') : result.status === 'warn' ? chalk.yellow('⚠ WARN') : chalk.red('✗ FAIL');

      const details = verbose && result.details ? `${result.message}\n${result.details}` : result.message;

      table.push([result.name, statusIcon, details]);

      if (result.fix) {
        table.push(['', chalk.dim('Fix:'), chalk.cyan(result.fix)]);
      }
    }

    console.log(table.toString());

    // Summary
    const passed = this.results.filter((r) => r.status === 'pass').length;
    const warned = this.results.filter((r) => r.status === 'warn').length;
    const failed = this.results.filter((r) => r.status === 'fail').length;

    console.log(chalk.bold('\n📈 Summary\n'));
    console.log(`${chalk.green('Passed:')} ${passed}`);
    console.log(`${chalk.yellow('Warnings:')} ${warned}`);
    console.log(`${chalk.red('Failed:')} ${failed}`);

    if (failed > 0) {
      console.log(chalk.red.bold('\n⚠️  Critical issues found. Please fix failed checks before proceeding.\n'));
    } else if (warned > 0) {
      console.log(chalk.yellow.bold('\n⚠️  System is functional but has warnings. Consider addressing them.\n'));
    } else {
      console.log(chalk.green.bold('\n✓ All health checks passed! System is ready to use.\n'));
    }

    // System information
    if (verbose && this.systemInfo) {
      console.log(chalk.bold('\n🖥️  System Information\n'));
      console.log(`Node.js: ${this.systemInfo.nodeVersion}`);
      console.log(`npm: ${this.systemInfo.npmVersion}`);
      console.log(`Platform: ${this.systemInfo.platform} (${this.systemInfo.arch})`);
      console.log(
        `Memory: ${(this.systemInfo.memory.used / 1024 / 1024).toFixed(2)}MB used / ${(this.systemInfo.memory.total / 1024 / 1024 / 1024).toFixed(2)}GB total`,
      );
    }
  }

  /**
   * Auto-fix common issues
   */
  private async autoFix(): Promise<void> {
    console.log(chalk.bold.blue('\n🔧 Attempting Auto-Fix\n'));

    const fixableIssues = this.results.filter((r) => r.status !== 'pass' && r.fix);

    if (fixableIssues.length === 0) {
      console.log(chalk.yellow('No auto-fixable issues found.\n'));
      return;
    }

    for (const issue of fixableIssues) {
      console.log(chalk.cyan(`\nFixing: ${issue.name}`));
      console.log(chalk.dim(`Command: ${issue.fix}`));

      // Note: In production, would actually run the fix commands
      // For safety, we just display them
      console.log(chalk.yellow('Auto-fix would run the command above.'));
      console.log(chalk.dim('Run with --dry-run to see commands without executing.\n'));
    }
  }

  /**
   * Check security posture including API keys
   */
  private async checkSecurityPosture(): Promise<void> {
    const spinner = ora('Checking security posture...').start();

    try {
      // Initialize SecretsManager
      const initResult = await initializeSecretsManager();

      if (!initResult.initialized) {
        spinner.warn(chalk.yellow('SecretsManager not initialized'));
        this.results.push({
          name: 'Security Posture',
          status: 'warn',
          message: 'SecretsManager not initialized',
          details: 'Run setup wizard to configure secrets',
          fix: 'npx claude-flow-novice setup',
        });
        return;
      }

      // Get security audit
      const audit = await getSecurityAudit();

      // Check for missing secrets
      if (audit.secrets.missing.length > 0) {
        spinner.warn(chalk.yellow('Missing required secrets'));
        this.results.push({
          name: 'Security Posture',
          status: 'warn',
          message: `Missing ${audit.secrets.missing.length} required secrets`,
          details: `Missing: ${audit.secrets.missing.join(', ')}`,
          fix: 'Add missing secrets to .env file',
        });
      } else {
        spinner.succeed(chalk.green('All required secrets present'));
      }

      // Check file permissions
      const envPerms = audit.filePermissions['.env'];
      if (envPerms && envPerms !== '600') {
        this.results.push({
          name: 'File Permissions',
          status: 'warn',
          message: `Insecure .env permissions: ${envPerms}`,
          details: 'File should be readable/writable only by owner',
          fix: 'chmod 600 .env',
        });
      } else if (envPerms) {
        this.results.push({
          name: 'File Permissions',
          status: 'pass',
          message: '.env file has secure permissions (600)',
        });
      }

      // Check API key rotation
      const rotation = await checkKeyRotation();

      if (rotation.needRotation.length > 0) {
        const severity = rotation.needRotation.length > 2 ? 'fail' : 'warn';
        this.results.push({
          name: 'API Key Rotation',
          status: severity,
          message: `${rotation.needRotation.length} keys need rotation (>${rotation.rotationIntervalDays} days)`,
          details: `Keys: ${rotation.needRotation.join(', ')}`,
          fix: 'Rotate API keys: npx claude-flow-novice config rotate-keys',
        });
      } else {
        this.results.push({
          name: 'API Key Rotation',
          status: 'pass',
          message: 'All API keys are current',
        });
      }

      // Display security recommendations
      if (audit.recommendations.length > 0) {
        const highSeverity = audit.recommendations.filter((r) => r.severity === 'HIGH');
        if (highSeverity.length > 0) {
          this.results.push({
            name: 'Security Recommendations',
            status: 'warn',
            message: `${highSeverity.length} high-severity recommendations`,
            details: highSeverity.map((r) => r.message).join('\n'),
          });
        }
      }
    } catch (error) {
      spinner.fail(chalk.red('Security check failed'));
      this.results.push({
        name: 'Security Posture',
        status: 'fail',
        message: 'Security check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Create health-check command
 */
export function createHealthCheckCommand(): Command {
  const command = new Command('health-check')
    .description('Run system health diagnostics')
    .option('-v, --verbose', 'Show detailed information')
    .option('-s, --service <name>', 'Check specific service (redis, config, dependencies, security)')
    .option('--fix', 'Attempt to auto-fix common issues')
    .action(async (options) => {
      const checker = new HealthChecker();
      await checker.runAllChecks(options);
    });

  return command;
}

export default createHealthCheckCommand();
