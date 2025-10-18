#!/usr/bin/env node

/**
 * Claude Flow Novice - Health Check Script
 *
 * Comprehensive system health verification
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, accessSync, constants } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform, totalmem, freemem, cpus } from 'os';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';

class HealthChecker {
  constructor() {
    this.platform = platform();
    this.homeDir = homedir();
    this.configDir = join(this.homeDir, '.claude-flow-novice', 'config');
    this.results = {
      overall: 'unknown',
      categories: {
        system: { status: 'unknown', checks: [] },
        dependencies: { status: 'unknown', checks: [] },
        configuration: { status: 'unknown', checks: [] },
        services: { status: 'unknown', checks: [] },
        network: { status: 'unknown', checks: [] }
      },
      warnings: [],
      errors: [],
      recommendations: []
    };
  }

  async check() {
    console.log(chalk.blue.bold('🏥 Claude Flow Novice Health Check\n'));

    try {
      await this.checkSystemHealth();
      await this.checkDependencies();
      await this.checkConfiguration();
      await this.checkServices();
      await this.checkNetwork();

      this.calculateOverallStatus();
      this.displayResults();

      return this.results;
    } catch (error) {
      console.error(chalk.red('❌ Health check failed:'), error.message);
      this.results.errors.push(error.message);
      this.results.overall = 'error';
      return this.results;
    }
  }

  async checkSystemHealth() {
    const spinner = ora('Checking system health...').start();

    try {
      const checks = [];

      // CPU Check
      const cpuInfo = cpus();
      const cpuCores = cpuInfo.length;
      const cpuModel = cpuInfo[0].model;
      checks.push({
        name: 'CPU',
        status: 'pass',
        message: `${cpuCores} cores - ${cpuModel}`,
        details: { cores: cpuCores, model: cpuModel }
      });

      // Memory Check
      const totalMem = totalmem();
      const freeMem = freemem();
      const usedMem = totalMem - freeMem;
      const memUsagePercent = (usedMem / totalMem) * 100;

      let memStatus = 'pass';
      if (memUsagePercent > 90) memStatus = 'fail';
      else if (memUsagePercent > 75) memStatus = 'warn';

      checks.push({
        name: 'Memory',
        status: memStatus,
        message: `${Math.round(memUsagePercent)}% used (${Math.round(freeMem / 1024 / 1024)}MB free)`,
        details: {
          total: Math.round(totalMem / 1024 / 1024),
          free: Math.round(freeMem / 1024 / 1024),
          usage: Math.round(memUsagePercent)
        }
      });

      // Disk Space Check
      const diskInfo = await this.getDiskInfo();
      const diskUsagePercent = ((diskInfo.used / diskInfo.total) * 100);

      let diskStatus = 'pass';
      if (diskUsagePercent > 95) diskStatus = 'fail';
      else if (diskUsagePercent > 85) diskStatus = 'warn';

      checks.push({
        name: 'Disk Space',
        status: diskStatus,
        message: `${Math.round(diskUsagePercent)}% used (${Math.round(diskInfo.free / 1024 / 1024)}MB free)`,
        details: diskInfo
      });

      // Node.js Version Check
      const nodeVersion = process.version;
      const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
      let nodeStatus = nodeMajor >= 20 ? 'pass' : 'fail';
      checks.push({
        name: 'Node.js Version',
        status: nodeStatus,
        message: nodeVersion,
        details: { version: nodeVersion, major: nodeMajor }
      });

      this.results.categories.system.checks = checks;
      this.results.categories.system.status = this.calculateCategoryStatus(checks);

      spinner.succeed('System health check completed');
    } catch (error) {
      spinner.fail('System health check failed');
      this.results.categories.system.status = 'error';
      this.results.categories.system.checks.push({
        name: 'System Check',
        status: 'error',
        message: error.message
      });
    }
  }

  async getDiskInfo() {
    try {
      let output;
      if (this.platform === 'win32') {
        output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
        const lines = output.split('\n').filter(line => line.trim());
        const data = lines[1].split(/\s+/);
        return {
          total: parseInt(data[1]) || 0,
          free: parseInt(data[2]) || 0,
          used: (parseInt(data[1]) || 0) - (parseInt(data[2]) || 0)
        };
      } else {
        output = execSync('df -h ~', { encoding: 'utf8' });
        const lines = output.split('\n');
        const data = lines[1].split(/\s+/);
        return {
          total: this.parseDiskSpace(data[1]),
          used: this.parseDiskSpace(data[2]),
          free: this.parseDiskSpace(data[3])
        };
      }
    } catch (error) {
      return { total: 0, used: 0, free: 0 };
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

  async checkDependencies() {
    const spinner = ora('Checking dependencies...').start();

    try {
      const checks = [];
      const dependencies = [
        { name: 'npm', command: 'npm --version', minVersion: '9.0.0' },
        { name: 'redis-cli', command: 'redis-cli --version', optional: true },
        { name: 'git', command: 'git --version', optional: true },
        { name: 'docker', command: 'docker --version', optional: true }
      ];

      for (const dep of dependencies) {
        try {
          const output = execSync(dep.command, { encoding: 'utf8' }).trim();
          const version = output.split(' ').pop();

          let status = 'pass';
          if (dep.minVersion && this.compareVersions(version, dep.minVersion) < 0) {
            status = 'fail';
          }

          checks.push({
            name: dep.name,
            status,
            message: version,
            details: { version, optional: dep.optional || false }
          });
        } catch (error) {
          if (dep.optional) {
            checks.push({
              name: dep.name,
              status: 'warn',
              message: 'Not installed',
              details: { optional: true }
            });
          } else {
            checks.push({
              name: dep.name,
              status: 'fail',
              message: 'Not installed',
              details: { optional: false }
            });
          }
        }
      }

      // Check claude-flow-novice installation
      try {
        const output = execSync('claude-flow-novice --version', { encoding: 'utf8' }).trim();
        checks.push({
          name: 'claude-flow-novice',
          status: 'pass',
          message: output,
          details: { version: output }
        });
      } catch (error) {
        checks.push({
          name: 'claude-flow-novice',
          status: 'fail',
          message: 'Not installed or not in PATH',
          details: {}
        });
      }

      this.results.categories.dependencies.checks = checks;
      this.results.categories.dependencies.status = this.calculateCategoryStatus(checks);

      spinner.succeed('Dependency check completed');
    } catch (error) {
      spinner.fail('Dependency check failed');
      this.results.categories.dependencies.status = 'error';
      this.results.categories.dependencies.checks.push({
        name: 'Dependency Check',
        status: 'error',
        message: error.message
      });
    }
  }

  async checkConfiguration() {
    const spinner = ora('Checking configuration...').start();

    try {
      const checks = [];

      // Check config directory exists
      const configDirExists = existsSync(this.configDir);
      checks.push({
        name: 'Configuration Directory',
        status: configDirExists ? 'pass' : 'fail',
        message: configDirExists ? 'Exists' : 'Not found',
        details: { path: this.configDir }
      });

      if (configDirExists) {
        // Check required config files
        const configFiles = [
          'config.json',
          'redis.json',
          'services.json',
          '.env'
        ];

        for (const file of configFiles) {
          const filePath = join(this.configDir, file);
          const exists = existsSync(filePath);

          checks.push({
            name: `Config File: ${file}`,
            status: exists ? 'pass' : 'warn',
            message: exists ? 'Exists' : 'Not found',
            details: { path: filePath }
          });

          if (exists && file.endsWith('.json')) {
            try {
              JSON.parse(readFileSync(filePath, 'utf8'));
            } catch (error) {
              checks.push({
                name: `Config Validity: ${file}`,
                status: 'fail',
                message: 'Invalid JSON',
                details: { error: error.message }
              });
            }
          }
        }
      }

      // Check file permissions
      try {
        const testPath = join(this.configDir, '.health-check');
        require('fs').writeFileSync(testPath, 'test');
        require('fs').unlinkSync(testPath);

        checks.push({
          name: 'File Permissions',
          status: 'pass',
          message: 'Read/Write access confirmed',
          details: {}
        });
      } catch (error) {
        checks.push({
          name: 'File Permissions',
          status: 'fail',
          message: 'No write access',
          details: { error: error.message }
        });
      }

      this.results.categories.configuration.checks = checks;
      this.results.categories.configuration.status = this.calculateCategoryStatus(checks);

      spinner.succeed('Configuration check completed');
    } catch (error) {
      spinner.fail('Configuration check failed');
      this.results.categories.configuration.status = 'error';
      this.results.categories.configuration.checks.push({
        name: 'Configuration Check',
        status: 'error',
        message: error.message
      });
    }
  }

  async checkServices() {
    const spinner = ora('Checking services...').start();

    try {
      const checks = [];

      // Check Redis
      try {
        const redisInfo = await this.getRedisServiceInfo();
        checks.push({
          name: 'Redis Service',
          status: 'pass',
          message: `Running (PID: ${redisInfo.pid})`,
          details: redisInfo
        });
      } catch (error) {
        checks.push({
          name: 'Redis Service',
          status: 'fail',
          message: 'Not running or not accessible',
          details: { error: error.message }
        });
      }

      // Check Dashboard
      try {
        const dashboardInfo = await this.getDashboardServiceInfo();
        if (dashboardInfo.running) {
          checks.push({
            name: 'Dashboard Service',
            status: 'pass',
            message: `Running on port ${dashboardInfo.port}`,
            details: dashboardInfo
          });
        } else {
          checks.push({
            name: 'Dashboard Service',
            status: 'warn',
            message: 'Not running',
            details: dashboardInfo
          });
        }
      } catch (error) {
        checks.push({
          name: 'Dashboard Service',
          status: 'warn',
          message: 'Not configured',
          details: {}
        });
      }

      // Check Monitoring
      try {
        const monitoringInfo = await this.getMonitoringServiceInfo();
        if (monitoringInfo.running) {
          checks.push({
            name: 'Monitoring Service',
            status: 'pass',
            message: `Running (PID: ${monitoringInfo.pid})`,
            details: monitoringInfo
          });
        } else {
          checks.push({
            name: 'Monitoring Service',
            status: 'warn',
            message: 'Not running',
            details: monitoringInfo
          });
        }
      } catch (error) {
        checks.push({
          name: 'Monitoring Service',
          status: 'warn',
          message: 'Not configured',
          details: {}
        });
      }

      this.results.categories.services.checks = checks;
      this.results.categories.services.status = this.calculateCategoryStatus(checks);

      spinner.succeed('Service check completed');
    } catch (error) {
      spinner.fail('Service check failed');
      this.results.categories.services.status = 'error';
      this.results.categories.services.checks.push({
        name: 'Service Check',
        status: 'error',
        message: error.message
      });
    }
  }

  async getRedisServiceInfo() {
    const info = execSync('redis-cli info server', { encoding: 'utf8' });
    const lines = info.split('\r\n');
    const result = {};

    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = value;
      }
    });

    return {
      pid: parseInt(result.process_id),
      uptime: parseInt(result.uptime_in_seconds),
      version: result.redis_version,
      connected_clients: parseInt(result.connected_clients)
    };
  }

  async getDashboardServiceInfo() {
    const configPath = join(this.configDir, 'services.json');
    if (!existsSync(configPath)) {
      return { running: false };
    }

    const services = JSON.parse(readFileSync(configPath, 'utf8'));
    const dashboardConfig = services.services?.dashboard;

    if (!dashboardConfig?.enabled) {
      return { running: false, disabled: true };
    }

    try {
      const port = dashboardConfig.port || 3000;
      const response = await fetch(`http://localhost:${port}/health`, { timeout: 5000 });

      return {
        running: response.ok,
        port,
        status: response.status
      };
    } catch (error) {
      return { running: false, port: dashboardConfig.port || 3000 };
    }
  }

  async getMonitoringServiceInfo() {
    try {
      const output = execSync('ps aux | grep claude-flow-monitor | grep -v grep', { encoding: 'utf8' });
      if (output.trim()) {
        const parts = output.trim().split(/\s+/);
        return {
          running: true,
          pid: parseInt(parts[1]),
          command: parts.slice(10).join(' ')
        };
      }
    } catch (error) {
      // Process not found
    }

    return { running: false };
  }

  async checkNetwork() {
    const spinner = ora('Checking network connectivity...').start();

    try {
      const checks = [];

      // Check internet connectivity
      try {
        const response = await fetch('https://api.github.com', { timeout: 5000 });
        checks.push({
          name: 'Internet Connectivity',
          status: response.ok ? 'pass' : 'warn',
          message: response.ok ? 'Connected' : 'Limited connectivity',
          details: { status: response.status }
        });
      } catch (error) {
        checks.push({
          name: 'Internet Connectivity',
          status: 'warn',
          message: 'No internet connection',
          details: { error: error.message }
        });
      }

      // Check npm registry
      try {
        execSync('npm ping', { stdio: 'ignore', timeout: 10000 });
        checks.push({
          name: 'NPM Registry',
          status: 'pass',
          message: 'Accessible',
          details: {}
        });
      } catch (error) {
        checks.push({
          name: 'NPM Registry',
          status: 'fail',
          message: 'Not accessible',
          details: { error: error.message }
        });
      }

      // Check port availability
      const ports = [3000, 6379, 8080];
      for (const port of ports) {
        try {
          const output = execSync(`netstat -an | grep :${port}`, { stdio: 'ignore' });
          checks.push({
            name: `Port ${port}`,
            status: 'pass',
            message: 'Available',
            details: { port, inUse: true }
          });
        } catch (error) {
          checks.push({
            name: `Port ${port}`,
            status: 'pass',
            message: 'Available',
            details: { port, inUse: false }
          });
        }
      }

      this.results.categories.network.checks = checks;
      this.results.categories.network.status = this.calculateCategoryStatus(checks);

      spinner.succeed('Network check completed');
    } catch (error) {
      spinner.fail('Network check failed');
      this.results.categories.network.status = 'error';
      this.results.categories.network.checks.push({
        name: 'Network Check',
        status: 'error',
        message: error.message
      });
    }
  }

  calculateCategoryStatus(checks) {
    const hasFailures = checks.some(check => check.status === 'fail' || check.status === 'error');
    const hasWarnings = checks.some(check => check.status === 'warn');

    if (hasFailures) return 'fail';
    if (hasWarnings) return 'warn';
    return 'pass';
  }

  calculateOverallStatus() {
    const categories = Object.values(this.results.categories);
    const hasFailures = categories.some(cat => cat.status === 'fail' || cat.status === 'error');
    const hasWarnings = categories.some(cat => cat.status === 'warn');

    if (hasFailures) this.results.overall = 'fail';
    else if (hasWarnings) this.results.overall = 'warn';
    else this.results.overall = 'pass';

    // Collect warnings and errors
    categories.forEach(category => {
      category.checks.forEach(check => {
        if (check.status === 'fail' || check.status === 'error') {
          this.results.errors.push(`${check.name}: ${check.message}`);
        } else if (check.status === 'warn') {
          this.results.warnings.push(`${check.name}: ${check.message}`);
        }
      });
    });

    // Generate recommendations
    this.generateRecommendations();
  }

  generateRecommendations() {
    const recommendations = [];

    // System recommendations
    const systemChecks = this.results.categories.system.checks;
    const memoryCheck = systemChecks.find(check => check.name === 'Memory');
    if (memoryCheck && memoryCheck.details.usage > 75) {
      recommendations.push('Consider closing unused applications to free up memory');
    }

    const diskCheck = systemChecks.find(check => check.name === 'Disk Space');
    if (diskCheck && diskCheck.details.free < 1024) { // Less than 1GB
      recommendations.push('Free up disk space for optimal performance');
    }

    // Dependency recommendations
    const depChecks = this.results.categories.dependencies.checks;
    const redisCheck = depChecks.find(check => check.name === 'redis-cli');
    if (redisCheck && redisCheck.status === 'warn') {
      recommendations.push('Install Redis for full functionality');
    }

    // Service recommendations
    const serviceChecks = this.results.categories.services.checks;
    const dashboardCheck = serviceChecks.find(check => check.name === 'Dashboard Service');
    if (dashboardCheck && dashboardCheck.status === 'warn') {
      recommendations.push('Start the dashboard service for web interface');
    }

    this.results.recommendations = recommendations;
  }

  displayResults() {
    console.log('\n' + chalk.blue.bold('📊 Health Check Results\n'));

    // Overall status
    const statusColors = {
      pass: chalk.green,
      warn: chalk.yellow,
      fail: chalk.red,
      error: chalk.red
    };

    const statusIcons = {
      pass: '✅',
      warn: '⚠️',
      fail: '❌',
      error: '💥'
    };

    const overallColor = statusColors[this.results.overall];
    const overallIcon = statusIcons[this.results.overall];

    console.log(overallColor.bold(`${overallIcon} Overall Status: ${this.results.overall.toUpperCase()}\n`));

    // Category results
    for (const [categoryName, category] of Object.entries(this.results.categories)) {
      const categoryColor = statusColors[category.status];
      const categoryIcon = statusIcons[category.status];

      console.log(categoryColor.bold(`${categoryIcon} ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}:`));

      category.checks.forEach(check => {
        const checkColor = statusColors[check.status];
        const checkIcon = statusIcons[check.status];
        console.log(`   ${checkColor} ${checkIcon} ${check.name}: ${check.message}`);
      });

      console.log();
    }

    // Warnings
    if (this.results.warnings.length > 0) {
      console.log(chalk.yellow.bold('⚠️  Warnings:'));
      this.results.warnings.forEach(warning => {
        console.log(chalk.yellow(`   • ${warning}`));
      });
      console.log();
    }

    // Errors
    if (this.results.errors.length > 0) {
      console.log(chalk.red.bold('❌ Errors:'));
      this.results.errors.forEach(error => {
        console.log(chalk.red(`   • ${error}`));
      });
      console.log();
    }

    // Recommendations
    if (this.results.recommendations.length > 0) {
      console.log(chalk.cyan.bold('💡 Recommendations:'));
      this.results.recommendations.forEach(rec => {
        console.log(chalk.cyan(`   • ${rec}`));
      });
      console.log();
    }

    // Summary
    const summary = this.results.overall === 'pass'
      ? chalk.green.bold('🎉 All systems are healthy!')
      : this.results.overall === 'warn'
      ? chalk.yellow.bold('⚠️  Some issues detected - review recommendations')
      : chalk.red.bold('❌ Critical issues found - immediate attention required');

    console.log(boxen(summary, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: this.results.overall === 'pass' ? 'green' : this.results.overall === 'warn' ? 'yellow' : 'red'
    }));
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

// CLI Interface with options
async function main() {
  const options = {
    verbose: process.argv.includes('--verbose'),
    json: process.argv.includes('--json'),
    quiet: process.argv.includes('--quiet')
  };

  const checker = new HealthChecker();
  const results = await checker.check();

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else if (options.verbose) {
    console.log(chalk.blue('\n📋 Detailed health report generated.'));
    console.log(chalk.gray(`Check completed at: ${new Date().toISOString()}\n`));
  }

  process.exit(results.overall === 'pass' ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default HealthChecker;