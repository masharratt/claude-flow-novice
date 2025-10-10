#!/usr/bin/env node

/**
 * Claude Flow Novice - Redis Setup Script
 *
 * Handles Redis installation, configuration, and optimization
 */

import { execSync, spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import chalk from 'chalk';
import ora from 'ora';

class RedisSetup {
  constructor(options = {}) {
    this.platform = platform();
    this.homeDir = homedir();
    this.configDir = join(this.homeDir, '.claude-flow-novice', 'config');
    this.redisConfig = {
      port: options.port || 6379,
      host: options.host || 'localhost',
      password: options.password || null,
      maxMemory: options.maxMemory || '256mb',
      persistence: options.persistence !== false,
      optimization: {
        tcpKeepAlive: 300,
        timeout: 0,
        databases: 16,
        ...options.optimization
      }
    };
    this.skipInstallation = options.skipInstallation || false;
    this.interactive = options.interactive !== false;
  }

  async setup() {
    console.log(chalk.blue.bold('🔧 Redis Setup\n'));

    try {
      await this.checkRedisInstallation();
      await this.installRedisIfNeeded();
      await this.configureRedis();
      await this.optimizeRedis();
      await this.startRedis();
      await this.testRedisConnection();

      console.log(chalk.green.bold('✅ Redis setup completed successfully!\n'));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Redis setup failed:'), error.message);
      return false;
    }
  }

  async checkRedisInstallation() {
    const spinner = ora('Checking Redis installation...').start();

    try {
      // Check if Redis CLI is available
      const version = execSync('redis-cli --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

      // Check if Redis server is also available
      try {
        execSync('redis-server --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        spinner.succeed(`Redis installed: ${version}`);
        this.redisInstalled = true;
        return true;
      } catch (serverError) {
        spinner.warn(`Redis CLI found (${version}) but Redis server not found`);
        this.redisInstalled = 'partial';
        return false;
      }
    } catch (error) {
      spinner.warn('Redis not found');
      this.redisInstalled = false;
      return false;
    }
  }

  async installRedisIfNeeded() {
    if (this.skipInstallation) {
      console.log(chalk.yellow('⏭️  Skipping Redis installation (manual mode)'));
      return;
    }

    if (this.redisInstalled === true) {
      console.log(chalk.green('✅ Redis already installed, skipping installation'));
      return;
    }

    const spinner = ora('Installing Redis...').start();

    try {
      if (this.platform === 'win32') {
        await this.installRedisWindows(spinner);
      } else if (this.platform === 'darwin') {
        await this.installRedisMacOS(spinner);
      } else {
        await this.installRedisLinux(spinner);
      }

      spinner.succeed('Redis installed successfully');
    } catch (error) {
      spinner.fail('Redis installation failed');
      this.displayInstallationInstructions();
      throw error;
    }
  }

  async installRedisWindows(spinner) {
    // Check if Chocolatey is available
    let hasChoco = false;
    try {
      execSync('choco --version', { stdio: 'ignore' });
      hasChoco = true;
    } catch (error) {
      // Try Scoop as alternative
      try {
        execSync('scoop --version', { stdio: 'ignore' });
        spinner.text = 'Installing Redis via Scoop...';
        await this.executeCommand('scoop install redis', { timeout: 300000 });
        return;
      } catch (scoopError) {
        throw new Error(
          'Package manager not found. Please install Chocolatey (https://chocolatey.org/install) or Scoop (https://scoop.sh/)'
        );
      }
    }

    if (hasChoco) {
      // Install Redis via Chocolatey
      spinner.text = 'Installing Redis via Chocolatey...';
      await this.executeCommand('choco install redis-64 -y', { timeout: 300000 });

      // Add Redis to PATH
      const redisPaths = [
        'C:\\ProgramData\\chocolatey\\bin\\redis-cli.exe',
        'C:\\Program Files\\Redis\\redis-cli.exe'
      ];

      for (const redisPath of redisPaths) {
        if (existsSync(redisPath)) {
          console.log(chalk.cyan(`\n💡 Redis installed at: ${redisPath}`));
          break;
        }
      }
    }
  }

  async installRedisMacOS() {
    // Check if Homebrew is available
    try {
      execSync('brew --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error('Homebrew not found. Please install Homebrew first: https://brew.sh/');
    }

    // Install Redis via Homebrew
    await this.executeCommand('brew install redis', { timeout: 300000 });
  }

  async installRedisLinux() {
    const distro = await this.detectLinuxDistribution();

    switch (distro) {
      case 'ubuntu':
      case 'debian':
        await this.executeCommand('sudo apt-get update && sudo apt-get install redis-server -y', { timeout: 300000 });
        break;
      case 'centos':
      case 'rhel':
      case 'fedora':
        await this.executeCommand('sudo yum install redis -y', { timeout: 300000 });
        break;
      case 'arch':
        await this.executeCommand('sudo pacman -S redis --noconfirm', { timeout: 300000 });
        break;
      default:
        throw new Error(`Unsupported Linux distribution: ${distro}`);
    }
  }

  async detectLinuxDistribution() {
    try {
      const releaseInfo = readFileSync('/etc/os-release', 'utf8');
      if (releaseInfo.includes('ubuntu')) return 'ubuntu';
      if (releaseInfo.includes('debian')) return 'debian';
      if (releaseInfo.includes('centos')) return 'centos';
      if (releaseInfo.includes('rhel')) return 'rhel';
      if (releaseInfo.includes('fedora')) return 'fedora';
      if (releaseInfo.includes('arch')) return 'arch';
    } catch (error) {
      // Fall back to detection via lsb_release
      try {
        const output = execSync('lsb_release -si', { encoding: 'utf8' }).toLowerCase().trim();
        return output;
      } catch (error) {
        return 'unknown';
      }
    }

    return 'unknown';
  }

  async configureRedis() {
    const spinner = ora('Configuring Redis...').start();

    try {
      const configPath = await this.getRedisConfigPath();
      const backupPath = `${configPath}.backup`;

      // Create backup of original config
      if (existsSync(configPath)) {
        await this.executeCommand(`cp "${configPath}" "${backupPath}"`);
      }

      // Generate optimized configuration
      const config = this.generateRedisConfig();
      writeFileSync(configPath, config);

      // Save configuration to claude-flow-novice config directory
      const claudeRedisConfig = {
        ...this.redisConfig,
        configFile: configPath,
        platform: this.platform,
        installedAt: new Date().toISOString()
      };

      writeFileSync(
        join(this.configDir, 'redis.json'),
        JSON.stringify(claudeRedisConfig, null, 2)
      );

      spinner.succeed('Redis configured successfully');
    } catch (error) {
      spinner.fail('Redis configuration failed');
      throw error;
    }
  }

  async getRedisConfigPath() {
    const possiblePaths = [
      '/etc/redis/redis.conf',
      '/usr/local/etc/redis.conf',
      '/etc/redis/redis/redis.conf',
      join(this.homeDir, '.redis/redis.conf'),
      'C:\\ProgramData\\Redis\\redis.conf',
      'C:\\Redis\\redis.conf'
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Create default config location
    const defaultPath = this.platform === 'win32'
      ? 'C:\\Redis\\redis.conf'
      : '/etc/redis/redis.conf';

    // Create directory if it doesn't exist
    const configDir = dirname(defaultPath);
    if (!existsSync(configDir)) {
      await this.executeCommand(`mkdir -p "${configDir}"`);
    }

    return defaultPath;
  }

  generateRedisConfig() {
    return `
# Claude Flow Novice Redis Configuration
# Generated on ${new Date().toISOString()}

# Network
bind 127.0.0.1
port ${this.redisConfig.port}
protected-mode yes

# Security
${this.redisConfig.password ? `requirepass ${this.redisConfig.password}` : '# requirepass your-password-here'}

# Memory Management
maxmemory ${this.redisConfig.maxMemory}
maxmemory-policy allkeys-lru

# Persistence
${this.redisConfig.persistence ? `
save 900 1
save 300 10
save 60 10000
` : `# save 900 1
# save 300 10
# save 60 10000`}

# Optimization
tcp-keepalive ${this.redisConfig.optimization.tcpKeepAlive}
timeout ${this.redisConfig.optimization.timeout}
databases ${this.redisConfig.optimization.databases}

# Performance
tcp-backlog 511
rdbcompression yes
rdbchecksum yes

# Logging
loglevel notice
logfile ""

# Client Configuration
maxclients 10000

# Memory Usage
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
list-compress-depth 0
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64

# Latency Monitoring
latency-monitor-threshold 100

# Slow Log
slowlog-log-slower-than 10000
slowlog-max-len 128

# Event Notification (for Claude Flow Novice)
notify-keyspace-events "Ex"

# Append Only File (additional persistence)
appendonly yes
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
`.trim();
  }

  async optimizeRedis() {
    const spinner = ora('Optimizing Redis settings...').start();

    try {
      if (this.platform === 'linux') {
        // Linux-specific optimizations
        await this.executeCommand('echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf');
        await this.executeCommand('sudo sysctl vm.overcommit_memory=1');

        // Disable transparent huge pages
        try {
          await this.executeCommand('echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled');
        } catch (error) {
          // Not all systems support this
        }
      }

      spinner.succeed('Redis optimized successfully');
    } catch (error) {
      spinner.warn('Redis optimization completed with warnings');
      console.warn(chalk.yellow('Some optimizations could not be applied'));
    }
  }

  async startRedis() {
    const spinner = ora('Starting Redis server...').start();

    try {
      if (this.platform === 'win32') {
        await this.startRedisWindows();
      } else if (this.platform === 'darwin') {
        await this.startRedisMacOS();
      } else {
        await this.startRedisLinux();
      }

      // Wait for Redis to start
      await this.waitForRedis();

      spinner.succeed('Redis server started successfully');
    } catch (error) {
      spinner.fail('Redis server startup failed');
      throw error;
    }
  }

  async startRedisWindows() {
    // Start Redis as a Windows service or directly
    try {
      await this.executeCommand('net start redis', { timeout: 30000 });
    } catch (error) {
      // Fallback to direct execution
      await this.executeCommand('redis-server', { detached: true, stdio: 'ignore' });
    }
  }

  async startRedisMacOS() {
    // Start Redis via Homebrew services
    try {
      await this.executeCommand('brew services start redis', { timeout: 30000 });
    } catch (error) {
      // Fallback to direct execution
      await this.executeCommand('redis-server /usr/local/etc/redis.conf', { detached: true, stdio: 'ignore' });
    }
  }

  async startRedisLinux() {
    // Start Redis via systemd
    try {
      await this.executeCommand('sudo systemctl start redis-server', { timeout: 30000 });
      await this.executeCommand('sudo systemctl enable redis-server');
    } catch (error) {
      // Fallback to direct execution
      await this.executeCommand('redis-server /etc/redis/redis.conf', { detached: true, stdio: 'ignore' });
    }
  }

  async waitForRedis() {
    const maxAttempts = 30;
    const delay = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        execSync('redis-cli ping', { stdio: 'ignore', timeout: 5000 });
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Redis failed to start within the expected time');
  }

  async testRedisConnection() {
    const spinner = ora('Testing Redis connection...').start();

    try {
      // Test basic connectivity
      const response = execSync('redis-cli ping', { encoding: 'utf8' }).trim();

      if (response === 'PONG') {
        // Test memory operations
        execSync('redis-cli set claude-flow-test "connection-test"', { stdio: 'ignore' });
        const value = execSync('redis-cli get claude-flow-test', { encoding: 'utf8' }).trim();
        execSync('redis-cli del claude-flow-test', { stdio: 'ignore' });

        if (value === 'connection-test') {
          spinner.succeed('Redis connection test passed');
        } else {
          throw new Error('Redis memory operations failed');
        }
      } else {
        throw new Error('Redis not responding correctly');
      }
    } catch (error) {
      spinner.fail('Redis connection test failed');
      throw error;
    }
  }

  displayInstallationInstructions() {
    console.log(chalk.yellow('\n📚 Manual Installation Instructions:\n'));

    if (this.platform === 'win32') {
      console.log(chalk.cyan('Windows Installation Options:'));
      console.log('  1. Via Chocolatey (recommended):');
      console.log('     - Install Chocolatey: https://chocolatey.org/install');
      console.log('     - Run: choco install redis-64 -y\n');
      console.log('  2. Via Scoop:');
      console.log('     - Install Scoop: https://scoop.sh/');
      console.log('     - Run: scoop install redis\n');
      console.log('  3. Direct Download:');
      console.log('     - Download: https://github.com/microsoftarchive/redis/releases');
      console.log('     - Extract and add to PATH\n');
    } else if (this.platform === 'darwin') {
      console.log(chalk.cyan('macOS Installation:'));
      console.log('  1. Via Homebrew (recommended):');
      console.log('     - Install Homebrew: https://brew.sh/');
      console.log('     - Run: brew install redis\n');
      console.log('  2. Via MacPorts:');
      console.log('     - Run: sudo port install redis\n');
    } else {
      console.log(chalk.cyan('Linux Installation:'));
      console.log('  Ubuntu/Debian:');
      console.log('     - Run: sudo apt-get update && sudo apt-get install redis-server\n');
      console.log('  CentOS/RHEL/Fedora:');
      console.log('     - Run: sudo yum install redis\n');
      console.log('  Arch Linux:');
      console.log('     - Run: sudo pacman -S redis\n');
    }

    console.log(chalk.yellow('After installation, run this script again to complete setup.\n'));
  }

  async getRedisInfo() {
    try {
      const info = execSync('redis-cli INFO server', { encoding: 'utf8' });
      const lines = info.split('\n');
      const data = {};

      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          data[key.trim()] = value.trim();
        }
      }

      return data;
    } catch (error) {
      return null;
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

// Execute Redis setup
if (import.meta.url === `file://${process.argv[1]}`) {
  const redisSetup = new RedisSetup();
  redisSetup.setup().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(console.error);
}

export default RedisSetup;