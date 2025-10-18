#!/usr/bin/env node

/**
 * Claude Flow Novice - Dependency Checker
 *
 * Validates system requirements and dependencies before installation
 */

import { execSync, spawn } from 'child_process';
import { existsSync, accessSync, constants } from 'fs';
import { join, resolve } from 'path';
import { homedir, platform, arch, totalmem, freemem, cpus } from 'os';
import chalk from 'chalk';
import ora from 'ora';

class DependencyChecker {
  constructor() {
    this.platform = platform();
    this.arch = arch();
    this.requirements = {
      node: { min: '20.0.0', recommended: '20.10.0' },
      npm: { min: '9.0.0', recommended: '10.0.0' },
      memory: { min: 1024 * 1024 * 1024, recommended: 2 * 1024 * 1024 * 1024 }, // 1GB min, 2GB recommended
      disk: { min: 1024 * 1024 * 1024, recommended: 5 * 1024 * 1024 * 1024 }, // 1GB min, 5GB recommended
      redis: { min: '6.0.0', recommended: '7.0.0' }
    };

    this.results = {
      passed: [],
      warnings: [],
      errors: [],
      recommendations: []
    };
  }

  async check() {
    console.log(chalk.blue.bold('🔍 Claude Flow Novice - System Dependency Check\n'));

    await this.checkNodeVersion();
    await this.checkNpmVersion();
    await this.checkMemoryRequirements();
    await this.checkDiskSpace();
    await this.checkRedisAvailability();
    await this.checkPlatformCompatibility();
    await this.checkNetworkConnectivity();
    await this.checkDevelopmentTools();

    this.displayResults();

    return {
      success: this.results.errors.length === 0,
      passed: this.results.passed,
      warnings: this.results.warnings,
      errors: this.results.errors,
      recommendations: this.results.recommendations
    };
  }

  async checkNodeVersion() {
    const spinner = ora('Checking Node.js version...').start();

    try {
      const version = process.version;
      const versionNum = version.slice(1); // Remove 'v' prefix
      const minVersion = this.requirements.node.min;
      const recommendedVersion = this.requirements.node.recommended;

      if (this.compareVersions(versionNum, minVersion) >= 0) {
        if (this.compareVersions(versionNum, recommendedVersion) >= 0) {
          spinner.succeed(`Node.js ${version} (Recommended)`);
          this.results.passed.push(`Node.js version ${version} meets requirements`);
        } else {
          spinner.succeed(`Node.js ${version} (Supported)`);
          this.results.passed.push(`Node.js version ${version} meets minimum requirements`);
          this.results.recommendations.push(`Consider upgrading to Node.js ${recommendedVersion} for better performance`);
        }
      } else {
        spinner.fail(`Node.js ${version} (Unsupported)`);
        this.results.errors.push(`Node.js version ${version} is too old. Requires ${minVersion} or later`);
      }
    } catch (error) {
      spinner.fail('Node.js version check failed');
      this.results.errors.push('Unable to determine Node.js version');
    }
  }

  async checkNpmVersion() {
    const spinner = ora('Checking npm version...').start();

    try {
      const version = execSync('npm --version', { encoding: 'utf8' }).trim();
      const minVersion = this.requirements.npm.min;
      const recommendedVersion = this.requirements.npm.recommended;

      if (this.compareVersions(version, minVersion) >= 0) {
        if (this.compareVersions(version, recommendedVersion) >= 0) {
          spinner.succeed(`npm ${version} (Recommended)`);
          this.results.passed.push(`npm version ${version} meets requirements`);
        } else {
          spinner.succeed(`npm ${version} (Supported)`);
          this.results.passed.push(`npm version ${version} meets minimum requirements`);
          this.results.recommendations.push(`Consider upgrading to npm ${recommendedVersion} for better performance`);
        }
      } else {
        spinner.fail(`npm ${version} (Unsupported)`);
        this.results.errors.push(`npm version ${version} is too old. Requires ${minVersion} or later`);
      }
    } catch (error) {
      spinner.fail('npm version check failed');
      this.results.errors.push('Unable to determine npm version');
    }
  }

  async checkMemoryRequirements() {
    const spinner = ora('Checking memory requirements...').start();

    try {
      const free = freemem();
      const total = totalmem();
      const required = this.requirements.memory.min;
      const recommended = this.requirements.memory.recommended;

      const freeGB = Math.round(free / 1024 / 1024 / 1024 * 10) / 10;
      const totalGB = Math.round(total / 1024 / 1024 / 1024 * 10) / 10;

      if (free >= recommended) {
        spinner.succeed(`Memory: ${freeGB}GB free (Excellent)`);
        this.results.passed.push(`Memory: ${freeGB}GB free, ${totalGB}GB total`);
      } else if (free >= required) {
        spinner.succeed(`Memory: ${freeGB}GB free (Adequate)`);
        this.results.passed.push(`Memory: ${freeGB}GB free, ${totalGB}GB total`);
        this.results.warnings.push('Limited memory available - consider closing other applications');
      } else {
        spinner.fail(`Memory: ${freeGB}GB free (Insufficient)`);
        this.results.errors.push(`Insufficient memory. Requires at least ${Math.round(required / 1024 / 1024 / 1024)}GB free`);
      }
    } catch (error) {
      spinner.fail('Memory check failed');
      this.results.warnings.push('Unable to determine memory usage');
    }
  }

  async checkDiskSpace() {
    const spinner = ora('Checking disk space...').start();

    try {
      const homeDir = homedir();

      // Simple disk space check (in production, use a proper library like 'diskusage')
      let availableSpace = 10 * 1024 * 1024 * 1024; // Default to 10GB

      try {
        if (this.platform === 'win32') {
          const output = execSync('wmic logicaldisk get freespace', { encoding: 'utf8' });
          const lines = output.split('\n').filter(line => line.trim());
          const freespace = parseInt(lines[1]) * 1024; // Convert to bytes
          availableSpace = freespace;
        } else {
          const output = execSync('df -h ~', { encoding: 'utf8' });
          const lines = output.split('\n');
          const dataLine = lines[1];
          const available = dataLine.split(/\s+/)[3];
          availableSpace = this.parseDiskSpace(available);
        }
      } catch (error) {
        // Fallback if disk space check fails
        spinner.warn('Disk space check failed - assuming sufficient space');
        this.results.warnings.push('Unable to determine available disk space');
        return;
      }

      const required = this.requirements.disk.min;
      const recommended = this.requirements.disk.recommended;
      const availableGB = Math.round(availableSpace / 1024 / 1024 / 1024 * 10) / 10;
      const requiredGB = Math.round(required / 1024 / 1024 / 1024);
      const recommendedGB = Math.round(recommended / 1024 / 1024 / 1024);

      if (availableSpace >= recommended) {
        spinner.succeed(`Disk space: ${availableGB}GB available (Excellent)`);
        this.results.passed.push(`Disk space: ${availableGB}GB available`);
      } else if (availableSpace >= required) {
        spinner.succeed(`Disk space: ${availableGB}GB available (Adequate)`);
        this.results.passed.push(`Disk space: ${availableGB}GB available`);
        this.results.warnings.push('Limited disk space available');
      } else {
        spinner.fail(`Disk space: ${availableGB}GB available (Insufficient)`);
        this.results.errors.push(`Insufficient disk space. Requires at least ${requiredGB}GB`);
      }
    } catch (error) {
      spinner.fail('Disk space check failed');
      this.results.warnings.push('Unable to determine disk space availability');
    }
  }

  parseDiskSpace(spaceStr) {
    const units = { K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024, T: 1024 * 1024 * 1024 * 1024 };
    const match = spaceStr.match(/^(\d+\.?\d*)(K|M|G|T)?$/);
    if (!match) return 0;

    const [, value, unit] = match;
    const multiplier = units[unit] || 1;
    return parseFloat(value) * multiplier;
  }

  async checkRedisAvailability() {
    const spinner = ora('Checking Redis availability...').start();

    try {
      // Check if Redis is installed
      execSync('redis-cli --version', { stdio: 'ignore' });

      // Try to connect to Redis
      const output = execSync('redis-cli ping', { encoding: 'utf8', timeout: 5000 });

      if (output.trim() === 'PONG') {
        spinner.succeed('Redis server is running and responsive');
        this.results.passed.push('Redis server is available');
      } else {
        spinner.warn('Redis is installed but not responding');
        this.results.warnings.push('Redis is installed but may need to be started');
      }
    } catch (error) {
      spinner.warn('Redis not found or not running');
      this.results.warnings.push('Redis not installed - will be installed during setup');
    }
  }

  async checkPlatformCompatibility() {
    const spinner = ora('Checking platform compatibility...').start();

    try {
      const platformInfo = `${this.platform}-${this.arch}`;

      const supportedPlatforms = [
        'darwin-x64', 'darwin-arm64',
        'linux-x64', 'linux-arm64',
        'win32-x64', 'win32-arm64'
      ];

      if (supportedPlatforms.includes(platformInfo)) {
        spinner.succeed(`Platform: ${platformInfo} (Supported)`);
        this.results.passed.push(`Platform ${platformInfo} is supported`);
      } else {
        spinner.warn(`Platform: ${platformInfo} (Unknown)`);
        this.results.warnings.push(`Platform ${platformInfo} may not be fully supported`);
      }

      // Check for WSL on Windows
      if (this.platform === 'linux' && process.env.WSL_DISTRO_NAME) {
        spinner.succeed('WSL environment detected (Optimized)');
        this.results.passed.push('WSL environment detected with optimizations');
      }
    } catch (error) {
      spinner.fail('Platform check failed');
      this.results.warnings.push('Unable to determine platform compatibility');
    }
  }

  async checkNetworkConnectivity() {
    const spinner = ora('Checking network connectivity...').start();

    try {
      // Check npm registry connectivity
      execSync('npm ping', { stdio: 'ignore', timeout: 10000 });

      // Check GitHub connectivity
      execSync('curl -s https://api.github.com > /dev/null', { stdio: 'ignore', timeout: 10000 });

      spinner.succeed('Network connectivity confirmed');
      this.results.passed.push('Network connectivity is available');
    } catch (error) {
      spinner.warn('Network connectivity issues detected');
      this.results.warnings.push('Network connectivity issues - may affect package installation');
    }
  }

  async checkDevelopmentTools() {
    const spinner = ora('Checking development tools...').start();

    const tools = [
      { name: 'Git', command: 'git --version', recommended: true },
      { name: 'Python', command: 'python --version', recommended: false },
      { name: 'Docker', command: 'docker --version', recommended: false },
      { name: 'Make', command: 'make --version', recommended: false }
    ];

    const availableTools = [];
    const missingTools = [];

    for (const tool of tools) {
      try {
        execSync(tool.command, { stdio: 'ignore' });
        availableTools.push(tool.name);
      } catch (error) {
        if (tool.recommended) {
          missingTools.push(tool.name);
        }
      }
    }

    if (availableTools.length > 0) {
      spinner.succeed(`Development tools: ${availableTools.join(', ')}`);
      this.results.passed.push(`Available development tools: ${availableTools.join(', ')}`);
    } else {
      spinner.warn('Limited development tools available');
    }

    if (missingTools.length > 0) {
      this.results.recommendations.push(`Consider installing: ${missingTools.join(', ')}`);
    }
  }

  displayResults() {
    console.log('\n' + chalk.blue.bold('📊 Dependency Check Results\n'));

    // Display passed checks
    if (this.results.passed.length > 0) {
      console.log(chalk.green.bold('✅ Passed:'));
      this.results.passed.forEach(item => {
        console.log(chalk.green(`   • ${item}`));
      });
      console.log();
    }

    // Display warnings
    if (this.results.warnings.length > 0) {
      console.log(chalk.yellow.bold('⚠️  Warnings:'));
      this.results.warnings.forEach(item => {
        console.log(chalk.yellow(`   • ${item}`));
      });
      console.log();
    }

    // Display errors
    if (this.results.errors.length > 0) {
      console.log(chalk.red.bold('❌ Errors:'));
      this.results.errors.forEach(item => {
        console.log(chalk.red(`   • ${item}`));
      });
      console.log();
    }

    // Display recommendations
    if (this.results.recommendations.length > 0) {
      console.log(chalk.cyan.bold('💡 Recommendations:'));
      this.results.recommendations.forEach(item => {
        console.log(chalk.cyan(`   • ${item}`));
      });
      console.log();
    }

    // Overall status
    if (this.results.errors.length === 0) {
      console.log(chalk.green.bold('🎉 All requirements met! You can proceed with installation.\n'));
    } else {
      console.log(chalk.red.bold('⚠️  Please resolve errors before proceeding with installation.\n'));
    }
  }

  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    const maxLength = Math.max(v1parts.length, v2parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;

      if (v1part > v2part) return 1;
      if (v1part < v2part) return -1;
    }

    return 0;
  }
}

// Execute dependency checker
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new DependencyChecker();
  checker.check().then(result => {
    process.exit(result.success ? 0 : 1);
  }).catch(console.error);
}

export default DependencyChecker;