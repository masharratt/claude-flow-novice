#!/usr/bin/env node

/**
 * Claude Flow Novice - Service Manager
 *
 * Cross-platform service management for start/stop/restart operations
 */

import { execSync, spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import chalk from 'chalk';
import ora from 'ora';

class ServiceManager {
  constructor() {
    this.platform = platform();
    this.homeDir = homedir();
    this.configDir = join(this.homeDir, '.claude-flow-novice', 'config');
    this.logDir = join(this.homeDir, '.claude-flow-novice', 'logs');
    this.services = new Map();
    this.loadServiceConfig();
  }

  loadServiceConfig() {
    try {
      const configPath = join(this.configDir, 'services.json');
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        Object.entries(config.services).forEach(([name, config]) => {
          this.services.set(name, config);
        });
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not load service configuration'));
    }
  }

  async start(serviceName) {
    if (serviceName) {
      return this.startService(serviceName);
    } else {
      return this.startAllServices();
    }
  }

  async stop(serviceName) {
    if (serviceName) {
      return this.stopService(serviceName);
    } else {
      return this.stopAllServices();
    }
  }

  async restart(serviceName) {
    if (serviceName) {
      return this.restartService(serviceName);
    } else {
      return this.restartAllServices();
    }
  }

  async status(serviceName) {
    if (serviceName) {
      return this.getServiceStatus(serviceName);
    } else {
      return this.getAllServiceStatus();
    }
  }

  async startService(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    if (!service.enabled) {
      console.log(chalk.yellow(`Service ${serviceName} is disabled`));
      return false;
    }

    const spinner = ora(`Starting ${serviceName}...`).start();

    try {
      const success = await this.executeServiceCommand(serviceName, 'start');

      if (success) {
        spinner.succeed(`${serviceName} started successfully`);
        await this.logServiceEvent(serviceName, 'start', 'success');
        return true;
      } else {
        spinner.fail(`Failed to start ${serviceName}`);
        await this.logServiceEvent(serviceName, 'start', 'failed');
        return false;
      }
    } catch (error) {
      spinner.fail(`Failed to start ${serviceName}: ${error.message}`);
      await this.logServiceEvent(serviceName, 'start', 'error', error.message);
      throw error;
    }
  }

  async stopService(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    const spinner = ora(`Stopping ${serviceName}...`).start();

    try {
      const success = await this.executeServiceCommand(serviceName, 'stop');

      if (success) {
        spinner.succeed(`${serviceName} stopped successfully`);
        await this.logServiceEvent(serviceName, 'stop', 'success');
        return true;
      } else {
        spinner.fail(`Failed to stop ${serviceName}`);
        await this.logServiceEvent(serviceName, 'stop', 'failed');
        return false;
      }
    } catch (error) {
      spinner.fail(`Failed to stop ${serviceName}: ${error.message}`);
      await this.logServiceEvent(serviceName, 'stop', 'error', error.message);
      throw error;
    }
  }

  async restartService(serviceName) {
    const spinner = ora(`Restarting ${serviceName}...`).start();

    try {
      await this.stopService(serviceName);
      await this.startService(serviceName);

      spinner.succeed(`${serviceName} restarted successfully`);
      return true;
    } catch (error) {
      spinner.fail(`Failed to restart ${serviceName}: ${error.message}`);
      throw error;
    }
  }

  async startAllServices() {
    console.log(chalk.blue('Starting all services...\n'));

    const results = [];
    const enabledServices = Array.from(this.services.entries())
      .filter(([_, config]) => config.enabled)
      .map(([name]) => name);

    for (const serviceName of enabledServices) {
      try {
        const result = await this.startService(serviceName);
        results.push({ service: serviceName, success: result });
      } catch (error) {
        results.push({ service: serviceName, success: false, error: error.message });
      }
    }

    this.displayServiceResults(results);
    return results.every(r => r.success);
  }

  async stopAllServices() {
    console.log(chalk.blue('Stopping all services...\n'));

    const results = [];
    const runningServices = await this.getRunningServices();

    for (const serviceName of runningServices) {
      try {
        const result = await this.stopService(serviceName);
        results.push({ service: serviceName, success: result });
      } catch (error) {
        results.push({ service: serviceName, success: false, error: error.message });
      }
    }

    this.displayServiceResults(results);
    return results.every(r => r.success);
  }

  async restartAllServices() {
    console.log(chalk.blue('Restarting all services...\n'));

    const results = [];
    const enabledServices = Array.from(this.services.entries())
      .filter(([_, config]) => config.enabled)
      .map(([name]) => name);

    for (const serviceName of enabledServices) {
      try {
        const result = await this.restartService(serviceName);
        results.push({ service: serviceName, success: result });
      } catch (error) {
        results.push({ service: serviceName, success: false, error: error.message });
      }
    }

    this.displayServiceResults(results);
    return results.every(r => r.success);
  }

  async getServiceStatus(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    try {
      const status = await this.getServiceProcessStatus(serviceName);
      const health = await this.getServiceHealth(serviceName);

      return {
        name: serviceName,
        enabled: service.enabled,
        running: status.running,
        pid: status.pid,
        uptime: status.uptime,
        health: health,
        autoStart: service.autoStart
      };
    } catch (error) {
      return {
        name: serviceName,
        enabled: service.enabled,
        running: false,
        error: error.message
      };
    }
  }

  async getAllServiceStatus() {
    console.log(chalk.blue.bold('Service Status\n'));

    const results = [];

    for (const [serviceName, service] of this.services.entries()) {
      try {
        const status = await this.getServiceStatus(serviceName);
        results.push(status);
      } catch (error) {
        results.push({
          name: serviceName,
          enabled: service.enabled,
          running: false,
          error: error.message
        });
      }
    }

    this.displayServiceStatus(results);
    return results;
  }

  async executeServiceCommand(serviceName, action) {
    const service = this.services.get(serviceName);

    switch (serviceName) {
      case 'redis':
        return this.manageRedis(action);
      case 'dashboard':
        return this.manageDashboard(action);
      case 'monitoring':
        return this.manageMonitoring(action);
      default:
        throw new Error(`Unsupported service: ${serviceName}`);
    }
  }

  async manageRedis(action) {
    try {
      switch (action) {
        case 'start':
          if (this.platform === 'win32') {
            await this.executeCommand('net start redis', { timeout: 30000 });
          } else if (this.platform === 'darwin') {
            await this.executeCommand('brew services start redis', { timeout: 30000 });
          } else {
            await this.executeCommand('sudo systemctl start redis-server', { timeout: 30000 });
          }
          return true;

        case 'stop':
          if (this.platform === 'win32') {
            await this.executeCommand('net stop redis', { timeout: 30000 });
          } else if (this.platform === 'darwin') {
            await this.executeCommand('brew services stop redis', { timeout: 30000 });
          } else {
            await this.executeCommand('sudo systemctl stop redis-server', { timeout: 30000 });
          }
          return true;

        default:
          return false;
      }
    } catch (error) {
      // Fallback to direct Redis commands
      try {
        if (action === 'start') {
          const configPath = join(this.configDir, 'redis.json');
          const redisConfig = JSON.parse(readFileSync(configPath, 'utf8'));

          spawn('redis-server', [redisConfig.configFile], {
            detached: true,
            stdio: 'ignore'
          }).unref();

          return true;
        } else if (action === 'stop') {
          await this.executeCommand('redis-cli shutdown', { timeout: 10000 });
          return true;
        }
      } catch (fallbackError) {
        throw error;
      }
    }
  }

  async manageDashboard(action) {
    const dashboardConfig = this.services.get('dashboard');
    if (!dashboardConfig || !dashboardConfig.enabled) {
      return false;
    }

    try {
      if (action === 'start') {
        const port = dashboardConfig.port || 3000;
        spawn('node', [
          join(this.configDir, '..', '.claude-flow-novice', 'dist', 'src', 'cli', 'main.js'),
          'dashboard',
          '--port', port.toString()
        ], {
          detached: true,
          stdio: 'ignore'
        }).unref();

        return true;
      } else if (action === 'stop') {
        const processInfo = await this.findProcessByPort(dashboardConfig.port || 3000);
        if (processInfo) {
          process.kill(processInfo.pid, 'SIGTERM');
          return true;
        }
      }
    } catch (error) {
      throw new Error(`Dashboard ${action} failed: ${error.message}`);
    }

    return false;
  }

  async manageMonitoring(action) {
    const monitoringConfig = this.services.get('monitoring');
    if (!monitoringConfig || !monitoringConfig.enabled) {
      return false;
    }

    try {
      if (action === 'start') {
        spawn('node', [
          join(this.configDir, '..', '.claude-flow-novice', 'dist', 'src', 'cli', 'main.js'),
          'monitor'
        ], {
          detached: true,
          stdio: 'ignore'
        }).unref();

        return true;
      } else if (action === 'stop') {
        const processInfo = await this.findProcessByName('claude-flow-monitor');
        if (processInfo) {
          process.kill(processInfo.pid, 'SIGTERM');
          return true;
        }
      }
    } catch (error) {
      throw new Error(`Monitoring ${action} failed: ${error.message}`);
    }

    return false;
  }

  async getServiceProcessStatus(serviceName) {
    try {
      let pid = null;
      let uptime = null;

      switch (serviceName) {
        case 'redis':
          const redisInfo = await this.getRedisInfo();
          pid = redisInfo.process_id;
          uptime = redisInfo.uptime_in_seconds;
          break;

        case 'dashboard':
          const dashboardConfig = this.services.get('dashboard');
          const dashboardProcess = await this.findProcessByPort(dashboardConfig?.port || 3000);
          if (dashboardProcess) {
            pid = dashboardProcess.pid;
            uptime = Date.now() - dashboardProcess.startTime;
          }
          break;

        case 'monitoring':
          const monitorProcess = await this.findProcessByName('claude-flow-monitor');
          if (monitorProcess) {
            pid = monitorProcess.pid;
            uptime = Date.now() - monitorProcess.startTime;
          }
          break;
      }

      return {
        running: pid !== null,
        pid,
        uptime
      };
    } catch (error) {
      return { running: false };
    }
  }

  async getRedisInfo() {
    try {
      const info = execSync('redis-cli info server', { encoding: 'utf8' });
      const lines = info.split('\r\n');
      const result = {};

      lines.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          result[key] = value;
        }
      });

      return result;
    } catch (error) {
      return {};
    }
  }

  async getServiceHealth(serviceName) {
    try {
      switch (serviceName) {
        case 'redis':
          const ping = execSync('redis-cli ping', { encoding: 'utf8' }).trim();
          return ping === 'PONG' ? 'healthy' : 'unhealthy';

        case 'dashboard':
          const dashboardConfig = this.services.get('dashboard');
          const port = dashboardConfig?.port || 3000;
          // Simple HTTP check
          try {
            const response = await fetch(`http://localhost:${port}/health`);
            return response.ok ? 'healthy' : 'unhealthy';
          } catch (error) {
            return 'unhealthy';
          }

        default:
          return 'unknown';
      }
    } catch (error) {
      return 'unhealthy';
    }
  }

  async findProcessByPort(port) {
    try {
      let command;
      if (this.platform === 'win32') {
        command = `netstat -ano | findstr :${port}`;
      } else {
        command = `lsof -i :${port} | grep LISTEN`;
      }

      const output = execSync(command, { encoding: 'utf8' });
      const lines = output.trim().split('\n');

      if (lines.length > 0) {
        const parts = lines[0].split(/\s+/);
        const pid = this.platform === 'win32'
          ? parseInt(parts[parts.length - 1])
          : parseInt(parts[1]);

        return { pid, startTime: Date.now() }; // Simplified
      }
    } catch (error) {
      // Process not found
    }

    return null;
  }

  async findProcessByName(name) {
    try {
      let command;
      if (this.platform === 'win32') {
        command = `tasklist | findstr ${name}`;
      } else {
        command = `ps aux | grep ${name} | grep -v grep`;
      }

      const output = execSync(command, { encoding: 'utf8' });
      const lines = output.trim().split('\n');

      if (lines.length > 0) {
        const parts = lines[0].split(/\s+/);
        const pid = parseInt(parts[1]);

        return { pid, startTime: Date.now() }; // Simplified
      }
    } catch (error) {
      // Process not found
    }

    return null;
  }

  async getRunningServices() {
    const running = [];

    for (const [serviceName] of this.services.entries()) {
      const status = await this.getServiceProcessStatus(serviceName);
      if (status.running) {
        running.push(serviceName);
      }
    }

    return running;
  }

  displayServiceResults(results) {
    console.log('\n' + chalk.blue.bold('Operation Results:'));

    results.forEach(result => {
      if (result.success) {
        console.log(chalk.green(`   ✅ ${result.service}: Success`));
      } else {
        console.log(chalk.red(`   ❌ ${result.service}: ${result.error || 'Failed'}`));
      }
    });
    console.log();
  }

  displayServiceStatus(statuses) {
    console.log(chalk.blue.bold('Services Status:\n'));

    statuses.forEach(status => {
      const statusIcon = status.running ? '🟢' : '🔴';
      const enabledIcon = status.enabled ? '✅' : '❌';
      const healthIcon = {
        healthy: '🟢',
        unhealthy: '🔴',
        unknown: '⚪'
      }[status.health] || '⚪';

      console.log(`${statusIcon} ${chalk.bold(status.name)}`);
      console.log(`   Enabled: ${enabledIcon}`);
      console.log(`   Health: ${healthIcon}`);

      if (status.running) {
        console.log(`   PID: ${status.pid}`);
        console.log(`   Uptime: ${Math.round(status.uptime / 1000)}s`);
      } else if (status.error) {
        console.log(`   Error: ${status.error}`);
      }

      console.log();
    });
  }

  async logServiceEvent(serviceName, action, result, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: serviceName,
      action,
      result,
      error
    };

    const logFile = join(this.logDir, 'service-events.log');

    try {
      if (!existsSync(this.logDir)) {
        require('fs').mkdirSync(this.logDir, { recursive: true });
      }

      require('fs').appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      // Log file creation failed - ignore
    }
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

// CLI Interface
async function main() {
  const command = process.argv[2];
  const serviceName = process.argv[3];

  const manager = new ServiceManager();

  try {
    let result;

    switch (command) {
      case 'start':
        result = await manager.start(serviceName);
        break;
      case 'stop':
        result = await manager.stop(serviceName);
        break;
      case 'restart':
        result = await manager.restart(serviceName);
        break;
      case 'status':
        result = await manager.status(serviceName);
        break;
      default:
        console.error(chalk.red('Unknown command. Use: start|stop|restart|status [service-name]'));
        process.exit(1);
    }

    process.exit(result ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default ServiceManager;