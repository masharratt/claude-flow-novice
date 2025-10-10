#!/usr/bin/env node

/**
 * Claude Flow Novice - Quick Installation Script
 *
 * Target: Complete installation in under 5 minutes
 *
 * Features:
 * - Parallel dependency checking
 * - Automated Redis installation with Docker fallback
 * - Quick-start wizard with smart defaults
 * - Optimized template deployment
 * - Real-time progress tracking
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import chalk from 'chalk';
import ora from 'ora';

class QuickInstaller {
  constructor(options = {}) {
    this.startTime = Date.now();
    this.platform = platform();
    this.quickStart = options.quickStart || false;
    this.skipRedis = options.skipRedis || false;
    this.verbose = options.verbose || false;
    this.targetTimeMs = 5 * 60 * 1000; // 5 minutes
    this.benchmarks = {};
  }

  async install() {
    console.log(chalk.blue.bold('⚡ Claude Flow Novice - Quick Installation\n'));
    console.log(chalk.gray(`Target: Complete setup in under 5 minutes\n`));

    const mainSpinner = ora('Starting installation...').start();

    try {
      // Phase 1: Parallel dependency checks (10 seconds)
      const phase1Start = Date.now();
      mainSpinner.text = 'Phase 1/5: Checking dependencies...';
      const dependencies = await this.checkDependenciesParallel();
      this.benchmarks.dependencies = Date.now() - phase1Start;
      mainSpinner.succeed(`Phase 1 completed in ${this.benchmarks.dependencies}ms`);

      // Phase 2: Automated Redis installation (30-60 seconds)
      const phase2Start = Date.now();
      mainSpinner.text = 'Phase 2/5: Setting up Redis...';
      const redis = await this.setupRedisAutomated(dependencies.redis);
      this.benchmarks.redis = Date.now() - phase2Start;
      mainSpinner.succeed(`Phase 2 completed in ${this.benchmarks.redis}ms`);

      // Phase 3: Quick-start configuration (5 seconds)
      const phase3Start = Date.now();
      mainSpinner.text = 'Phase 3/5: Generating configuration...';
      const config = await this.quickStartConfig();
      this.benchmarks.config = Date.now() - phase3Start;
      mainSpinner.succeed(`Phase 3 completed in ${this.benchmarks.config}ms`);

      // Phase 4: Template deployment (10 seconds)
      const phase4Start = Date.now();
      mainSpinner.text = 'Phase 4/5: Deploying templates...';
      await this.deployTemplatesOptimized();
      this.benchmarks.templates = Date.now() - phase4Start;
      mainSpinner.succeed(`Phase 4 completed in ${this.benchmarks.templates}ms`);

      // Phase 5: Validation and finalization (5 seconds)
      const phase5Start = Date.now();
      mainSpinner.text = 'Phase 5/5: Validating installation...';
      await this.validateInstallation();
      this.benchmarks.validation = Date.now() - phase5Start;
      mainSpinner.succeed(`Phase 5 completed in ${this.benchmarks.validation}ms`);

      // Summary
      const totalTime = Date.now() - this.startTime;
      this.displaySummary(totalTime, dependencies, redis, config);

      return true;
    } catch (error) {
      mainSpinner.fail('Installation failed');
      console.error(chalk.red(`\n❌ Error: ${error.message}`));

      if (this.verbose) {
        console.error(chalk.gray(`\nStack trace:\n${error.stack}`));
      }

      this.displayTroubleshooting(error);
      return false;
    }
  }

  async checkDependenciesParallel() {
    const checks = [
      this.checkNodeVersion(),
      this.checkNpm(),
      this.checkRedis(),
      this.checkDocker(),
      this.checkGit()
    ];

    const results = await Promise.allSettled(checks);

    return {
      node: results[0].status === 'fulfilled' ? results[0].value : null,
      npm: results[1].status === 'fulfilled' ? results[1].value : null,
      redis: results[2].status === 'fulfilled' ? results[2].value : null,
      docker: results[3].status === 'fulfilled' ? results[3].value : null,
      git: results[4].status === 'fulfilled' ? results[4].value : null
    };
  }

  async checkNodeVersion() {
    try {
      const version = execSync('node --version', { encoding: 'utf8' }).trim();
      const majorVersion = parseInt(version.slice(1).split('.')[0]);

      if (majorVersion < 20) {
        throw new Error(`Node.js ${version} found. Minimum required: v20.0.0`);
      }

      return { installed: true, version, compatible: true };
    } catch (error) {
      return { installed: false, error: error.message };
    }
  }

  async checkNpm() {
    try {
      const version = execSync('npm --version', { encoding: 'utf8' }).trim();
      return { installed: true, version };
    } catch (error) {
      return { installed: false, error: error.message };
    }
  }

  async checkRedis() {
    try {
      const version = execSync('redis-cli --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

      // Check if Redis server is running
      try {
        const ping = execSync('redis-cli ping', { encoding: 'utf8', timeout: 2000 }).trim();
        return {
          installed: true,
          version,
          running: ping === 'PONG'
        };
      } catch (pingError) {
        return {
          installed: true,
          version,
          running: false
        };
      }
    } catch (error) {
      return { installed: false, running: false };
    }
  }

  async checkDocker() {
    try {
      const version = execSync('docker --version', { encoding: 'utf8', timeout: 2000 }).trim();

      // Check if Docker daemon is running
      try {
        execSync('docker ps', { stdio: 'ignore', timeout: 2000 });
        return { installed: true, version, running: true };
      } catch (psError) {
        return { installed: true, version, running: false };
      }
    } catch (error) {
      return { installed: false, running: false };
    }
  }

  async checkGit() {
    try {
      const version = execSync('git --version', { encoding: 'utf8' }).trim();
      return { installed: true, version };
    } catch (error) {
      return { installed: false };
    }
  }

  async setupRedisAutomated(redisStatus) {
    if (this.skipRedis) {
      return { method: 'skipped', message: 'Redis setup skipped by user' };
    }

    // If Redis is already running, skip installation
    if (redisStatus.installed && redisStatus.running) {
      return {
        method: 'existing',
        version: redisStatus.version,
        message: 'Using existing Redis installation'
      };
    }

    // If Redis is installed but not running, start it
    if (redisStatus.installed && !redisStatus.running) {
      const started = await this.startExistingRedis();
      if (started) {
        return {
          method: 'started',
          version: redisStatus.version,
          message: 'Started existing Redis server'
        };
      }
    }

    // Try Docker fallback first (fastest method - 30 seconds)
    const docker = await this.checkDocker();
    if (docker.installed && docker.running) {
      const dockerRedis = await this.setupRedisDocker();
      if (dockerRedis) {
        return {
          method: 'docker',
          message: 'Redis running in Docker container',
          container: dockerRedis.container
        };
      }
    }

    // Platform-specific installation
    return await this.installRedisPlatformSpecific();
  }

  async startExistingRedis() {
    try {
      if (this.platform === 'win32') {
        // Windows: Try service first, then direct
        try {
          execSync('net start redis', { stdio: 'ignore', timeout: 10000 });
          return true;
        } catch (serviceError) {
          spawn('redis-server', [], {
            detached: true,
            stdio: 'ignore'
          }).unref();
          await this.waitForRedis(10);
          return true;
        }
      } else if (this.platform === 'darwin') {
        // macOS: Homebrew services
        try {
          execSync('brew services start redis', { stdio: 'ignore', timeout: 10000 });
          await this.waitForRedis(10);
          return true;
        } catch (brewError) {
          spawn('redis-server', [], {
            detached: true,
            stdio: 'ignore'
          }).unref();
          await this.waitForRedis(10);
          return true;
        }
      } else {
        // Linux: systemd
        try {
          execSync('sudo systemctl start redis-server', { stdio: 'ignore', timeout: 10000 });
          await this.waitForRedis(10);
          return true;
        } catch (systemdError) {
          spawn('redis-server', [], {
            detached: true,
            stdio: 'ignore'
          }).unref();
          await this.waitForRedis(10);
          return true;
        }
      }
    } catch (error) {
      return false;
    }
  }

  async setupRedisDocker() {
    try {
      // Check if Redis container already exists
      try {
        const existing = execSync('docker ps -a --filter name=claude-flow-redis --format "{{.Names}}"', {
          encoding: 'utf8'
        }).trim();

        if (existing === 'claude-flow-redis') {
          // Container exists, start it
          execSync('docker start claude-flow-redis', { stdio: 'ignore' });
          await this.waitForRedis(15);
          return { container: 'claude-flow-redis', status: 'started' };
        }
      } catch (checkError) {
        // Container doesn't exist, create it
      }

      // Pull Redis image (if not cached)
      execSync('docker pull redis:alpine', { stdio: 'ignore', timeout: 60000 });

      // Run Redis container
      const containerId = execSync(
        'docker run -d --name claude-flow-redis -p 6379:6379 redis:alpine redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru',
        { encoding: 'utf8', timeout: 10000 }
      ).trim();

      // Wait for Redis to be ready
      await this.waitForRedis(15);

      return {
        container: 'claude-flow-redis',
        containerId,
        status: 'created'
      };
    } catch (error) {
      return null;
    }
  }

  async installRedisPlatformSpecific() {
    const spinner = ora('Installing Redis...').start();

    try {
      if (this.platform === 'win32') {
        return await this.installRedisWindows(spinner);
      } else if (this.platform === 'darwin') {
        return await this.installRedisMacOS(spinner);
      } else {
        return await this.installRedisLinux(spinner);
      }
    } catch (error) {
      spinner.fail('Redis installation failed');
      throw new Error(`Redis installation failed: ${error.message}`);
    }
  }

  async installRedisWindows(spinner) {
    // Check for Chocolatey
    try {
      execSync('choco --version', { stdio: 'ignore' });
      spinner.text = 'Installing Redis via Chocolatey...';
      execSync('choco install redis-64 -y', { stdio: 'ignore', timeout: 120000 });
      await this.waitForRedis(20);
      return { method: 'chocolatey', message: 'Redis installed via Chocolatey' };
    } catch (chocoError) {
      // Check for Scoop
      try {
        execSync('scoop --version', { stdio: 'ignore' });
        spinner.text = 'Installing Redis via Scoop...';
        execSync('scoop install redis', { stdio: 'ignore', timeout: 120000 });
        await this.waitForRedis(20);
        return { method: 'scoop', message: 'Redis installed via Scoop' };
      } catch (scoopError) {
        throw new Error('No package manager found. Please install Chocolatey or Scoop.');
      }
    }
  }

  async installRedisMacOS(spinner) {
    try {
      execSync('brew --version', { stdio: 'ignore' });
      spinner.text = 'Installing Redis via Homebrew...';
      execSync('brew install redis', { stdio: 'ignore', timeout: 180000 });
      execSync('brew services start redis', { stdio: 'ignore' });
      await this.waitForRedis(20);
      return { method: 'homebrew', message: 'Redis installed via Homebrew' };
    } catch (error) {
      throw new Error('Homebrew not found. Please install Homebrew first.');
    }
  }

  async installRedisLinux(spinner) {
    // Detect distribution
    let installCmd = '';

    try {
      const releaseInfo = execSync('cat /etc/os-release', { encoding: 'utf8' });

      if (releaseInfo.includes('ubuntu') || releaseInfo.includes('debian')) {
        installCmd = 'sudo apt-get update && sudo apt-get install redis-server -y';
      } else if (releaseInfo.includes('centos') || releaseInfo.includes('rhel') || releaseInfo.includes('fedora')) {
        installCmd = 'sudo yum install redis -y';
      } else if (releaseInfo.includes('arch')) {
        installCmd = 'sudo pacman -S redis --noconfirm';
      } else {
        throw new Error('Unsupported Linux distribution');
      }

      spinner.text = 'Installing Redis...';
      execSync(installCmd, { stdio: 'ignore', timeout: 180000 });

      // Start Redis
      try {
        execSync('sudo systemctl start redis-server', { stdio: 'ignore' });
        execSync('sudo systemctl enable redis-server', { stdio: 'ignore' });
      } catch (systemdError) {
        spawn('redis-server', [], { detached: true, stdio: 'ignore' }).unref();
      }

      await this.waitForRedis(20);
      return { method: 'native', message: 'Redis installed via native package manager' };
    } catch (error) {
      throw new Error(`Linux installation failed: ${error.message}`);
    }
  }

  async waitForRedis(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = execSync('redis-cli ping', {
          encoding: 'utf8',
          timeout: 2000,
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();

        if (response === 'PONG') {
          return true;
        }
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Redis failed to start within expected time');
  }

  async quickStartConfig() {
    const workingDir = process.cwd();
    const configDir = join(workingDir, '.claude');

    // Create directory structure
    const dirs = [
      '.claude',
      '.claude/commands',
      '.claude/agents',
      'memory',
      'coordination'
    ];

    for (const dir of dirs) {
      const fullPath = join(workingDir, dir);
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
      }
    }

    // Generate minimal configuration with sensible defaults
    const config = {
      version: '1.6.6',
      quickStart: true,
      installedAt: new Date().toISOString(),
      platform: this.platform,
      features: {
        swarmOrchestration: true,
        redisCoordination: true,
        autoSpawn: true,
        memoryPersistence: true
      },
      redis: {
        host: 'localhost',
        port: 6379,
        connectionString: 'redis://localhost:6379'
      }
    };

    // Write configuration
    writeFileSync(
      join(configDir, 'quick-start.json'),
      JSON.stringify(config, null, 2)
    );

    return config;
  }

  async deployTemplatesOptimized() {
    const workingDir = process.cwd();

    // Use bundled templates for instant deployment
    const templates = {
      'CLAUDE.md': this.getMinimalClaudeMd(),
      '.claude/settings.json': this.getMinimalSettings(),
      'memory/README.md': this.getMemoryReadme(),
      'coordination/README.md': this.getCoordinationReadme()
    };

    // Write all templates in parallel
    const writePromises = Object.entries(templates).map(([path, content]) => {
      const fullPath = join(workingDir, path);
      const dir = dirname(fullPath);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      return new Promise((resolve) => {
        writeFileSync(fullPath, content);
        resolve();
      });
    });

    await Promise.all(writePromises);
  }

  getMinimalClaudeMd() {
    return `# Claude Flow Novice - Quick Start Configuration

## Overview
AI agent orchestration framework with Redis-based coordination.

## Quick Commands
- Start swarm: \`npx claude-flow-novice swarm "your objective"\`
- Check status: \`npx claude-flow-novice status\`
- View agents: \`npx claude-flow-novice agents list\`

## Redis Connection
- Host: localhost
- Port: 6379

## Features Enabled
- Swarm orchestration
- Redis coordination
- Auto-spawn agents
- Memory persistence

---
*Generated by Quick Install - ${new Date().toISOString()}*
`;
  }

  getMinimalSettings() {
    return JSON.stringify({
      version: '1.6.6',
      hooks: {
        enabled: true,
        'post-edit': {
          command: 'npx claude-flow-novice hooks post-edit --file "{{file}}"'
        }
      },
      redis: {
        host: 'localhost',
        port: 6379
      },
      swarm: {
        autoSpawn: true,
        maxAgents: 10
      }
    }, null, 2);
  }

  getMemoryReadme() {
    return `# Memory System

Agent memory and coordination data stored here.

## Structure
- \`agents/\` - Agent-specific memory
- \`sessions/\` - Session data
- \`claude-flow-data.json\` - Persistence database
`;
  }

  getCoordinationReadme() {
    return `# Coordination System

Agent coordination and orchestration data.

## Structure
- \`memory_bank/\` - Shared memory
- \`subtasks/\` - Task breakdown
- \`orchestration/\` - Swarm orchestration
`;
  }

  async validateInstallation() {
    const checks = [
      this.validateRedis(),
      this.validateFiles(),
      this.validateConfiguration()
    ];

    const results = await Promise.allSettled(checks);

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      throw new Error(`Validation failed: ${failed.map(f => f.reason).join(', ')}`);
    }

    return true;
  }

  async validateRedis() {
    try {
      const response = execSync('redis-cli ping', {
        encoding: 'utf8',
        timeout: 2000
      }).trim();

      if (response !== 'PONG') {
        throw new Error('Redis not responding');
      }

      return true;
    } catch (error) {
      throw new Error(`Redis validation failed: ${error.message}`);
    }
  }

  async validateFiles() {
    const workingDir = process.cwd();
    const requiredFiles = [
      'CLAUDE.md',
      '.claude/settings.json',
      '.claude/quick-start.json'
    ];

    for (const file of requiredFiles) {
      if (!existsSync(join(workingDir, file))) {
        throw new Error(`Missing required file: ${file}`);
      }
    }

    return true;
  }

  async validateConfiguration() {
    const workingDir = process.cwd();
    const configPath = join(workingDir, '.claude', 'quick-start.json');

    if (!existsSync(configPath)) {
      throw new Error('Configuration file not found');
    }

    return true;
  }

  displaySummary(totalTime, dependencies, redis, config) {
    const totalSeconds = (totalTime / 1000).toFixed(1);
    const targetSeconds = (this.targetTimeMs / 1000).toFixed(0);
    const targetMet = totalTime < this.targetTimeMs;

    console.log('\n' + chalk.blue.bold('📊 Installation Summary\n'));

    // Time metrics
    console.log(chalk.cyan('⏱️  Time Metrics:'));
    console.log(`   Total time: ${chalk.bold(totalSeconds + 's')} ${targetMet ? chalk.green('✓') : chalk.yellow('⚠')}`);
    console.log(`   Target: ${targetSeconds}s ${targetMet ? chalk.gray('(met)') : chalk.yellow('(exceeded)')}`);
    console.log(`   Dependencies: ${(this.benchmarks.dependencies / 1000).toFixed(1)}s`);
    console.log(`   Redis: ${(this.benchmarks.redis / 1000).toFixed(1)}s`);
    console.log(`   Configuration: ${(this.benchmarks.config / 1000).toFixed(1)}s`);
    console.log(`   Templates: ${(this.benchmarks.templates / 1000).toFixed(1)}s`);
    console.log(`   Validation: ${(this.benchmarks.validation / 1000).toFixed(1)}s\n`);

    // Dependencies status
    console.log(chalk.cyan('📦 Dependencies:'));
    console.log(`   Node.js: ${dependencies.node.version} ${chalk.green('✓')}`);
    console.log(`   npm: ${dependencies.npm.version} ${chalk.green('✓')}`);
    console.log(`   Redis: ${redis.method} ${chalk.green('✓')}`);
    if (dependencies.docker.installed) {
      console.log(`   Docker: ${dependencies.docker.version} ${chalk.gray('(optional)')}`);
    }
    if (dependencies.git.installed) {
      console.log(`   Git: ${dependencies.git.version} ${chalk.gray('(optional)')}`);
    }
    console.log();

    // Next steps
    console.log(chalk.green.bold('✅ Installation Complete!\n'));
    console.log(chalk.cyan('🚀 Quick Start Commands:'));
    console.log(`   ${chalk.bold('npx claude-flow-novice status')} - Check system health`);
    console.log(`   ${chalk.bold('npx claude-flow-novice swarm "task"')} - Start a swarm`);
    console.log(`   ${chalk.bold('npx claude-flow-novice agents list')} - View agents\n`);

    // Performance feedback
    if (!targetMet) {
      console.log(chalk.yellow('💡 Installation took longer than target:'));
      console.log(`   Consider using Docker for Redis (faster startup)`);
      console.log(`   Run with --verbose to see detailed logs\n`);
    }
  }

  displayTroubleshooting(error) {
    console.log('\n' + chalk.yellow.bold('🔧 Troubleshooting\n'));

    if (error.message.includes('Redis')) {
      console.log(chalk.cyan('Redis Issues:'));
      console.log('   1. Install Docker: https://docs.docker.com/get-docker/');
      console.log('   2. Run: docker run -d -p 6379:6379 redis:alpine');
      console.log('   3. Or install Redis manually for your platform\n');
    }

    if (error.message.includes('Node')) {
      console.log(chalk.cyan('Node.js Issues:'));
      console.log('   1. Install Node.js v20+: https://nodejs.org/');
      console.log('   2. Verify: node --version\n');
    }

    console.log(chalk.cyan('Need Help?'));
    console.log('   GitHub Issues: https://github.com/masharratt/claude-flow-novice/issues');
    console.log('   Documentation: https://github.com/masharratt/claude-flow-novice#readme\n');
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    quickStart: args.includes('--quick-start'),
    skipRedis: args.includes('--skip-redis'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  const installer = new QuickInstaller(options);
  installer.install().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
    process.exit(1);
  });
}

export default QuickInstaller;
