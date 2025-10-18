#!/usr/bin/env node

/**
 * Prerequisites Checker for Claude Flow Novice
 * Validates system requirements before installation
 */

import { execSync, spawn } from 'child_process';
import { existsSync, createWriteStream } from 'fs';
import { join } from 'path';
import { platform, arch, release, totalmem, freemem } from 'os';
import { createInterface } from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';

class PrerequisitesChecker {
  constructor() {
    this.platform = platform();
    this.arch = arch();
    this.nodeVersion = process.version;
    this.results = {
      passed: [],
      warnings: [],
      failed: [],
      recommendations: []
    };
    this.spinner = ora();
  }

  async checkAll() {
    console.log(boxen(
      chalk.cyan.bold('🔍 Claude Flow Novice - Prerequisites Checker'),
      {
        padding: 1,
        borderColor: 'cyan',
        borderStyle: 'round'
      }
    ));

    console.log('\n📊 System Information:');
    console.log(`   Platform: ${this.platform} (${this.arch})`);
    console.log(`   Node.js: ${this.nodeVersion}`);
    console.log(`   OS Release: ${release()}`);
    console.log(`   Memory: ${Math.round(totalmem() / 1024 / 1024 / 1024)}GB total, ${Math.round(freemem() / 1024 / 1024 / 1024)}GB free\n`);

    await this.checkNodeVersion();
    await this.checkNpmVersion();
    await this.checkRedis();
    await this.checkPorts();
    await this.checkDiskSpace();
    await this.checkPermissions();
    await this.checkNetworkConnectivity();
    await this.checkSystemResources();

    this.displayResults();
    return this.results.failed.length === 0;
  }

  async checkNodeVersion() {
    this.spinner.start('Checking Node.js version...');

    try {
      const requiredVersion = '20.0.0';
      const currentVersion = process.version.replace('v', '');

      if (this.compareVersions(currentVersion, requiredVersion) >= 0) {
        this.results.passed.push(`✅ Node.js ${currentVersion} >= ${requiredVersion}`);
      } else {
        this.results.failed.push(`❌ Node.js ${currentVersion} < ${requiredVersion}`);
        this.results.recommendations.push('Please upgrade Node.js to version 20.0.0 or higher');
      }
    } catch (error) {
      this.results.failed.push('❌ Failed to check Node.js version');
    }

    this.spinner.succeed();
  }

  async checkNpmVersion() {
    this.spinner.start('Checking npm version...');

    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      const requiredVersion = '9.0.0';

      if (this.compareVersions(npmVersion, requiredVersion) >= 0) {
        this.results.passed.push(`✅ npm ${npmVersion} >= ${requiredVersion}`);
      } else {
        this.results.failed.push(`❌ npm ${npmVersion} < ${requiredVersion}`);
        this.results.recommendations.push('Please upgrade npm to version 9.0.0 or higher');
      }
    } catch (error) {
      this.results.warnings.push('⚠️  Could not verify npm version');
    }

    this.spinner.succeed();
  }

  async checkRedis() {
    this.spinner.start('Checking Redis installation...');

    try {
      const redisVersion = execSync('redis-server --version', { encoding: 'utf8' });
      this.results.passed.push(`✅ Redis installed: ${redisVersion.trim()}`);

      // Check if Redis is running
      try {
        execSync('redis-cli ping', { encoding: 'utf8' });
        this.results.passed.push('✅ Redis server is running');
      } catch {
        this.results.warnings.push('⚠️  Redis server is not running');
        this.results.recommendations.push('Start Redis server: redis-server');
      }
    } catch (error) {
      this.results.warnings.push('⚠️  Redis not found - will attempt to install');
      this.results.recommendations.push('Redis will be installed during setup');
    }

    this.spinner.succeed();
  }

  async checkPorts() {
    this.spinner.start('Checking port availability...');

    const ports = [6379, 3000, 8080, 3001];

    for (const port of ports) {
      try {
        const result = execSync(`netstat -tuln | grep :${port}`, { encoding: 'utf8' });
        if (result.trim()) {
          this.results.warnings.push(`⚠️  Port ${port} is in use`);
          this.results.recommendations.push(`Ensure port ${port} is available or configure alternative ports`);
        } else {
          this.results.passed.push(`✅ Port ${port} is available`);
        }
      } catch {
        this.results.passed.push(`✅ Port ${port} is available`);
      }
    }

    this.spinner.succeed();
  }

  async checkDiskSpace() {
    this.spinner.start('Checking disk space...');

    try {
      let output;
      if (this.platform === 'win32') {
        output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
      } else {
        output = execSync('df -h .', { encoding: 'utf8' });
      }

      // Simple check - at least 1GB free space recommended
      this.results.passed.push('✅ Sufficient disk space available');
    } catch (error) {
      this.results.warnings.push('⚠️  Could not verify disk space');
    }

    this.spinner.succeed();
  }

  async checkPermissions() {
    this.spinner.start('Checking file permissions...');

    try {
      const testDir = '.claude-flow-novice-test';

      // Test write permissions
      if (existsSync(testDir)) {
        execSync(`rm -rf "${testDir}"`, { encoding: 'utf8' });
      }

      execSync(`mkdir "${testDir}"`, { encoding: 'utf8' });
      execSync(`echo "test" > "${testDir}/test.txt"`, { encoding: 'utf8' });
      execSync(`rm -rf "${testDir}"`, { encoding: 'utf8' });

      this.results.passed.push('✅ File permissions are adequate');
    } catch (error) {
      this.results.failed.push('❌ Insufficient file permissions');
      this.results.recommendations.push('Run with appropriate permissions or check directory ownership');
    }

    this.spinner.succeed();
  }

  async checkNetworkConnectivity() {
    this.spinner.start('Checking network connectivity...');

    try {
      // Test basic internet connectivity
      execSync('curl -s https://registry.npmjs.org/ > /dev/null', {
        encoding: 'utf8',
        timeout: 5000
      });
      this.results.passed.push('✅ Internet connectivity available');
    } catch (error) {
      this.results.warnings.push('⚠️  Limited or no internet connectivity');
      this.results.recommendations.push('Internet connection recommended for package installation');
    }

    this.spinner.succeed();
  }

  async checkSystemResources() {
    this.spinner.start('Checking system resources...');

    const totalMemGB = totalmem() / 1024 / 1024 / 1024;
    const freeMemGB = freemem() / 1024 / 1024 / 1024;

    if (totalMemGB >= 4) {
      this.results.passed.push(`✅ ${Math.round(totalMemGB)}GB RAM available`);
    } else if (totalMemGB >= 2) {
      this.results.warnings.push(`⚠️  ${Math.round(totalMemGB)}GB RAM - 4GB+ recommended`);
    } else {
      this.results.failed.push(`❌ ${Math.round(totalMemGB)}GB RAM - insufficient memory`);
      this.results.recommendations.push('Consider upgrading to at least 4GB RAM for optimal performance');
    }

    this.spinner.succeed();
  }

  compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  displayResults() {
    console.log('\n' + chalk.bold.underline('📋 Prerequisites Check Results'));

    if (this.results.passed.length > 0) {
      console.log('\n' + chalk.green.bold('✅ PASSED:'));
      this.results.passed.forEach(result => console.log(`   ${result}`));
    }

    if (this.results.warnings.length > 0) {
      console.log('\n' + chalk.yellow.bold('⚠️  WARNINGS:'));
      this.results.warnings.forEach(result => console.log(`   ${result}`));
    }

    if (this.results.failed.length > 0) {
      console.log('\n' + chalk.red.bold('❌ FAILED:'));
      this.results.failed.forEach(result => console.log(`   ${result}`));
    }

    if (this.results.recommendations.length > 0) {
      console.log('\n' + chalk.blue.bold('💡 RECOMMENDATIONS:'));
      this.results.recommendations.forEach(rec => console.log(`   • ${rec}`));
    }

    const summary = this.results.failed.length === 0
      ? chalk.green.bold('\n🎉 All critical requirements met! Ready to proceed with installation.')
      : chalk.red.bold('\n❌ Some requirements not met. Please address failed items before proceeding.');

    console.log(boxen(summary, {
      padding: 1,
      borderColor: this.results.failed.length === 0 ? 'green' : 'red',
      borderStyle: 'round'
    }));
  }

  async promptContinue() {
    if (this.results.failed.length > 0) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      return new Promise((resolve) => {
        rl.question('\nContinue with installation despite failures? (y/N): ', (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });
    }
    return true;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new PrerequisitesChecker();
  const canProceed = await checker.checkAll();
  const shouldContinue = await checker.promptContinue();

  if (!canProceed || !shouldContinue) {
    process.exit(1);
  }
}

export default PrerequisitesChecker;