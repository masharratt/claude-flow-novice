#!/usr/bin/env node

/**
 * Main Setup Script for Claude Flow Novice
 * Automated installation and configuration orchestration
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync, chmodSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir, platform, arch } from 'os';
import { execSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SetupManager {
  constructor() {
    this.rootDir = resolve(__dirname, '../..');
    this.configDir = join(this.rootDir, 'config');
    this.scriptsDir = join(this.rootDir, 'scripts');
    this.nodeModulesDir = join(this.rootDir, 'node_modules');
    this.platform = platform();
    this.arch = arch();
    this.spinner = ora();
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.setupLog = [];
    this.rollbackStack = [];
  }

  async run(options = {}) {
    console.log(boxen(
      chalk.cyan.bold('🚀 Claude Flow Novice - Automated Setup'),
      {
        padding: 1,
        borderColor: 'cyan',
        borderStyle: 'round'
      }
    ));

    console.log(chalk.yellow('\n🎯 Starting automated installation and setup...\n'));

    try {
      // Step 1: Check prerequisites
      await this.checkPrerequisites(options.skipPrerequisites);

      // Step 2: Load or create configuration
      await this.loadOrCreateConfiguration(options.interactive !== false);

      // Step 3: Install dependencies
      await this.installDependencies(options.skipDeps);

      // Step 4: Setup Redis
      await this.setupRedis();

      // Step 5: Create configuration files
      await this.createConfigurationFiles();

      // Step 6: Setup development environment
      await this.setupDevelopmentEnvironment();

      // Step 7: Validate installation
      await this.validateInstallation();

      // Step 8: Create startup scripts
      await this.createStartupScripts();

      this.displaySuccessMessage();
      this.logSetupCompletion();

    } catch (error) {
      console.error(chalk.red('\n❌ Setup failed:'), error.message);
      this.logError(error);

      if (options.autoRollback !== false) {
        const shouldRollback = await this.promptRollback();
        if (shouldRollback) {
          await this.performRollback();
        }
      }

      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async checkPrerequisites(skip = false) {
    if (skip) {
      console.log(chalk.yellow('⚠️  Skipping prerequisites check'));
      return;
    }

    this.spinner.start('Checking system prerequisites...');

    try {
      // Import and run prerequisites checker
      const { default: PrerequisitesChecker } = await import('./check-prerequisites.js');
      const checker = new PrerequisitesChecker();
      const passed = await checker.checkAll();

      if (!passed) {
        this.spinner.fail('Prerequisites check failed');
        throw new Error('System prerequisites not met. Please resolve the issues and try again.');
      }

      this.spinner.succeed('Prerequisites check passed');
      this.addLog('Prerequisites validation completed successfully');
    } catch (error) {
      this.spinner.fail('Prerequisites check failed');
      throw error;
    }
  }

  async loadOrCreateConfiguration(interactive = true) {
    this.spinner.start('Loading configuration...');

    try {
      const configPath = join(this.configDir, 'claude-flow-config.json');

      if (existsSync(configPath) && !interactive) {
        // Load existing configuration
        const configData = readFileSync(configPath, 'utf8');
        this.config = JSON.parse(configData);
        this.spinner.succeed('Configuration loaded from existing file');
      } else {
        this.spinner.stop();

        if (interactive) {
          // Run configuration wizard
          console.log(chalk.blue('\n📝 Running configuration wizard...\n'));
          const { default: ConfigWizard } = await import('./config-wizard.js');
          const wizard = new ConfigWizard();
          await wizard.run();

          // Load the generated configuration
          const configData = readFileSync(configPath, 'utf8');
          this.config = JSON.parse(configData);
        } else {
          // Use default configuration
          this.config = this.getDefaultConfiguration();
          await this.saveConfiguration(this.config);
          console.log(chalk.green('✅ Using default configuration'));
        }
      }

      this.addLog('Configuration loaded successfully');
    } catch (error) {
      this.spinner.fail('Configuration setup failed');
      throw error;
    }
  }

  getDefaultConfiguration() {
    return {
      basic: {
        environment: 'development',
        projectName: 'claude-flow-novice-project',
        projectDescription: 'AI agent orchestration project',
        author: 'Developer',
        logLevel: 'info'
      },
      redis: {
        useRedis: true,
        redisType: 'local',
        redisHost: 'localhost',
        redisPort: '6379',
        redisPassword: '',
        installRedis: true
      },
      swarm: {
        maxAgents: '10',
        swarmStrategy: 'development',
        swarmMode: 'mesh',
        enablePersistence: true,
        consensusThreshold: '0.90',
        enableRealTime: true
      },
      security: {
        enableAuth: false,
        enableRateLimit: true,
        rateLimitWindow: '15',
        rateLimitMax: '100',
        enableCORS: true
      },
      development: {
        enableHotReload: true,
        enableDebugMode: true,
        enableTestMode: false,
        devServerPort: '3000',
        enableMockData: false,
        databaseType: 'sqlite'
      },
      monitoring: {
        enableMetrics: true,
        enableHealthChecks: true,
        enableAlerts: true,
        healthCheckInterval: '30',
        logFormat: 'json',
        enableDashboard: true
      }
    };
  }

  async saveConfiguration(config) {
    const configPath = join(this.configDir, 'claude-flow-config.json');
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    this.config = config;
  }

  async installDependencies(skip = false) {
    if (skip) {
      console.log(chalk.yellow('⚠️  Skipping dependency installation'));
      return;
    }

    this.spinner.start('Installing dependencies...');

    try {
      // Check if node_modules exists
      if (!existsSync(this.nodeModulesDir)) {
        this.addRollbackAction(() => {
          if (existsSync(this.nodeModulesDir)) {
            execSync(`rm -rf "${this.nodeModulesDir}"`, { cwd: this.rootDir });
          }
        });
      }

      // Install npm dependencies
      execSync('npm install', {
        cwd: this.rootDir,
        stdio: 'pipe',
        encoding: 'utf8'
      });

      this.spinner.succeed('Dependencies installed successfully');
      this.addLog('Dependencies installed successfully');
    } catch (error) {
      this.spinner.fail('Dependency installation failed');
      throw new Error(`Failed to install dependencies: ${error.message}`);
    }
  }

  async setupRedis() {
    if (!this.config.redis.useRedis) {
      console.log(chalk.yellow('⚠️  Redis configuration disabled'));
      return;
    }

    this.spinner.start('Setting up Redis...');

    try {
      if (this.config.redis.redisType === 'local' && this.config.redis.installRedis) {
        await this.installRedisLocally();
      }

      // Test Redis connection
      if (this.config.redis.redisType !== 'cloud') {
        await this.testRedisConnection();
      }

      this.spinner.succeed('Redis setup completed');
      this.addLog('Redis setup completed successfully');
    } catch (error) {
      this.spinner.fail('Redis setup failed');
      throw new Error(`Redis setup failed: ${error.message}`);
    }
  }

  async installRedisLocally() {
    try {
      // Check if Redis is already installed
      execSync('redis-server --version', { encoding: 'utf8', stdio: 'pipe' });
      console.log(chalk.green('Redis is already installed'));
      return;
    } catch {
      // Redis not installed, proceed with installation
    }

    console.log(chalk.blue('Installing Redis locally...'));

    if (this.platform === 'win32') {
      await this.installRedisWindows();
    } else if (this.platform === 'darwin') {
      await this.installRedisMacOS();
    } else if (this.platform === 'linux') {
      await this.installRedisLinux();
    } else {
      throw new Error(`Unsupported platform for Redis installation: ${this.platform}`);
    }

    this.addRollbackAction(() => {
      // Add Redis uninstallation logic if needed
      console.log('Note: Redis uninstallation may require manual intervention');
    });
  }

  async installRedisWindows() {
    console.log(chalk.yellow('Windows Redis installation...'));
    console.log('Please download and install Redis from: https://github.com/microsoftarchive/redis/releases');

    const { confirm } = await this.prompt('\nHave you installed Redis manually?', { default: false });
    if (!confirm) {
      throw new Error('Redis installation required for Windows');
    }
  }

  async installRedisMacOS() {
    try {
      // Try Homebrew installation
      execSync('brew install redis', { stdio: 'pipe' });
      console.log(chalk.green('✅ Redis installed via Homebrew'));
    } catch {
      console.log(chalk.yellow('Homebrew not available. Please install Redis manually:'));
      console.log('brew install redis');
      throw new Error('Redis installation failed');
    }
  }

  async installRedisLinux() {
    try {
      // Try apt-get (Ubuntu/Debian)
      execSync('sudo apt-get update && sudo apt-get install -y redis-server', { stdio: 'pipe' });
      console.log(chalk.green('✅ Redis installed via apt-get'));
    } catch {
      try {
        // Try yum (CentOS/RHEL)
        execSync('sudo yum install -y redis', { stdio: 'pipe' });
        console.log(chalk.green('✅ Redis installed via yum'));
      } catch {
        console.log(chalk.yellow('Please install Redis manually:'));
        console.log('Ubuntu/Debian: sudo apt-get install redis-server');
        console.log('CentOS/RHEL: sudo yum install redis');
        throw new Error('Redis installation failed');
      }
    }
  }

  async testRedisConnection() {
    try {
      execSync('redis-cli ping', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      console.log(chalk.green('✅ Redis connection successful'));
    } catch {
      console.log(chalk.yellow('Starting Redis server...'));
      try {
        // Try to start Redis server
        spawn('redis-server', { detached: true });
        // Give it a moment to start
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test connection again
        execSync('redis-cli ping', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
        console.log(chalk.green('✅ Redis server started and connection successful'));
      } catch (error) {
        throw new Error('Failed to start Redis server');
      }
    }
  }

  async createConfigurationFiles() {
    this.spinner.start('Creating configuration files...');

    try {
      // Create .env file
      const envContent = this.generateEnvContent();
      writeFileSync(join(this.rootDir, '.env'), envContent);

      // Create .env.example
      const exampleContent = this.generateEnvExampleContent();
      writeFileSync(join(this.rootDir, '.env.example'), exampleContent);

      // Create additional config files
      await this.createAdditionalConfigFiles();

      this.spinner.succeed('Configuration files created');
      this.addLog('Configuration files created successfully');
    } catch (error) {
      this.spinner.fail('Configuration file creation failed');
      throw error;
    }
  }

  generateEnvContent() {
    const lines = [
      '# Claude Flow Novice Environment Configuration',
      '# Generated on ' + new Date().toISOString(),
      '',
      `NODE_ENV=${this.config.basic.environment}`,
      `PROJECT_NAME=${this.config.basic.projectName}`,
      `LOG_LEVEL=${this.config.basic.logLevel}`,
      ''
    ];

    if (this.config.redis.useRedis) {
      lines.push('# Redis Configuration');
      if (this.config.redis.redisType === 'cloud') {
        lines.push(`REDIS_URL=${this.config.redis.redisUrl}`);
      } else {
        lines.push(`REDIS_HOST=${this.config.redis.redisHost}`);
        lines.push(`REDIS_PORT=${this.config.redis.redisPort}`);
        if (this.config.redis.redisPassword) {
          lines.push(`REDIS_PASSWORD=${this.config.redis.redisPassword}`);
        }
      }
      lines.push('');
    }

    lines.push('# Swarm Configuration');
    lines.push(`MAX_AGENTS=${this.config.swarm.maxAgents}`);
    lines.push(`SWARM_STRATEGY=${this.config.swarm.swarmStrategy}`);
    lines.push(`SWARM_MODE=${this.config.swarm.swarmMode}`);
    lines.push(`CONSENSUS_THRESHOLD=${this.config.swarm.consensusThreshold}`);
    lines.push('');

    lines.push('# Development Configuration');
    lines.push(`DEV_SERVER_PORT=${this.config.development.devServerPort}`);
    lines.push(`HOT_RELOAD=${this.config.development.enableHotReload}`);
    lines.push(`DEBUG_MODE=${this.config.development.enableDebugMode}`);
    lines.push('');

    return lines.join('\n');
  }

  generateEnvExampleContent() {
    return this.generateEnvContent()
      .replace(/=.+$/, '=')
      .replace(/REDIS_PASSWORD=.+$/, 'REDIS_PASSWORD=your-redis-password');
  }

  async createAdditionalConfigFiles() {
    // Create user directory structure
    const userDirs = [
      join(this.rootDir, '.claude-flow-novice'),
      join(this.rootDir, '.claude-flow-novice/logs'),
      join(this.rootDir, '.claude-flow-novice/data'),
      join(this.rootDir, '.claude-flow-novice/cache'),
      join(this.rootDir, '.claude-flow-novice/temp')
    ];

    userDirs.forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });

    // Create default configuration files
    const configs = [
      {
        path: join(this.configDir, 'development.json'),
        content: JSON.stringify({
          server: { port: 3000 },
          redis: { host: 'localhost', port: 6379 },
          logging: { level: 'debug' }
        }, null, 2)
      },
      {
        path: join(this.configDir, 'production.json'),
        content: JSON.stringify({
          server: { port: 8080 },
          redis: { host: 'localhost', port: 6379 },
          logging: { level: 'info' }
        }, null, 2)
      }
    ];

    configs.forEach(config => {
      if (!existsSync(config.path)) {
        writeFileSync(config.path, config.content);
      }
    });
  }

  async setupDevelopmentEnvironment() {
    this.spinner.start('Setting up development environment...');

    try {
      // Create development scripts
      await this.createDevScripts();

      // Setup Git hooks if git repository
      if (existsSync(join(this.rootDir, '.git'))) {
        await this.setupGitHooks();
      }

      // Create IDE configuration files
      await this.createIDEConfigs();

      this.spinner.succeed('Development environment setup completed');
      this.addLog('Development environment setup completed');
    } catch (error) {
      this.spinner.fail('Development environment setup failed');
      throw error;
    }
  }

  async createDevScripts() {
    const scripts = [
      {
        name: 'start-dev',
        content: `#!/bin/bash
echo "🚀 Starting Claude Flow Novice in development mode..."
npm run dev
`,
        executable: true
      },
      {
        name: 'start-prod',
        content: `#!/bin/bash
echo "🚀 Starting Claude Flow Novice in production mode..."
npm run start
`,
        executable: true
      },
      {
        name: 'redis-start',
        content: `#!/bin/bash
echo "🔴 Starting Redis server..."
redis-server --daemonize yes
sleep 2
redis-cli ping
`,
        executable: true
      },
      {
        name: 'redis-stop',
        content: `#!/bin/bash
echo "🔴 Stopping Redis server..."
redis-cli shutdown
`,
        executable: true
      }
    ];

    const scriptsDir = join(this.rootDir, 'scripts', 'dev');
    if (!existsSync(scriptsDir)) {
      mkdirSync(scriptsDir, { recursive: true });
    }

    scripts.forEach(script => {
      const scriptPath = join(scriptsDir, script.name);
      writeFileSync(scriptPath, script.content);
      if (script.executable) {
        chmodSync(scriptPath, '755');
      }
    });
  }

  async setupGitHooks() {
    const hooksDir = join(this.rootDir, '.git', 'hooks');
    const preCommitHook = `#!/bin/bash
echo "🔍 Running pre-commit checks..."
npm run lint
npm run test:unit
`;

    const preCommitPath = join(hooksDir, 'pre-commit');
    if (!existsSync(preCommitPath)) {
      writeFileSync(preCommitPath, preCommitHook);
      chmodSync(preCommitPath, '755');
    }
  }

  async createIDEConfigs() {
    // VS Code settings
    const vscodeDir = join(this.rootDir, '.vscode');
    if (!existsSync(vscodeDir)) {
      mkdirSync(vscodeDir, { recursive: true });
    }

    const vscodeSettings = {
      "editor.formatOnSave": true,
      "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
      },
      "typescript.preferences.importModuleSpecifier": "relative",
      "files.exclude": {
        "**/.claude-flow-novice": true,
        "**/node_modules": true,
        "**/dist": true
      }
    };

    writeFileSync(
      join(vscodeDir, 'settings.json'),
      JSON.stringify(vscodeSettings, null, 2)
    );
  }

  async validateInstallation() {
    this.spinner.start('Validating installation...');

    try {
      // Check if critical files exist
      const criticalFiles = [
        join(this.rootDir, 'package.json'),
        join(this.configDir, 'claude-flow-config.json'),
        join(this.rootDir, '.env')
      ];

      for (const file of criticalFiles) {
        if (!existsSync(file)) {
          throw new Error(`Critical file missing: ${file}`);
        }
      }

      // Validate configuration
      this.validateConfiguration();

      // Test basic functionality
      await this.testBasicFunctionality();

      this.spinner.succeed('Installation validation completed');
      this.addLog('Installation validation passed');
    } catch (error) {
      this.spinner.fail('Installation validation failed');
      throw error;
    }
  }

  validateConfiguration() {
    const requiredFields = [
      'basic.environment',
      'basic.projectName',
      'swarm.maxAgents',
      'swarm.swarmStrategy'
    ];

    for (const field of requiredFields) {
      const value = field.split('.').reduce((obj, key) => obj?.[key], this.config);
      if (!value) {
        throw new Error(`Missing required configuration: ${field}`);
      }
    }
  }

  async testBasicFunctionality() {
    try {
      // Test if the main CLI command works
      const result = execSync('node .claude-flow-novice/dist/src/cli/main.js --help', {
        cwd: this.rootDir,
        encoding: 'utf8',
        timeout: 10000,
        stdio: 'pipe'
      });

      if (!result.includes('claude-flow-novice')) {
        throw new Error('CLI command validation failed');
      }
    } catch (error) {
      console.log(chalk.yellow('Note: CLI validation failed, but installation can continue'));
      console.log('This may be expected if the project hasn\'t been built yet');
    }
  }

  async createStartupScripts() {
    this.spinner.start('Creating startup scripts...');

    try {
      // Create quick start script
      const quickStartScript = this.generateQuickStartScript();
      writeFileSync(join(this.rootDir, 'scripts', 'quick-start.js'), quickStartScript);

      // Make it executable
      chmodSync(join(this.rootDir, 'scripts', 'quick-start.js'), '755');

      this.spinner.succeed('Startup scripts created');
      this.addLog('Startup scripts created successfully');
    } catch (error) {
      this.spinner.fail('Startup script creation failed');
      throw error;
    }
  }

  generateQuickStartScript() {
    return `#!/usr/bin/env node

/**
 * Quick Start Script for Claude Flow Novice
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import chalk from 'chalk';

console.log(chalk.cyan.bold('🚀 Claude Flow Novice - Quick Start'));
console.log('');

async function quickStart() {
  try {
    // Check if Redis is running
    console.log('🔴 Checking Redis...');
    try {
      spawn('redis-cli', ['ping'], { stdio: 'pipe' });
      console.log(chalk.green('✅ Redis is running'));
    } catch {
      console.log(chalk.yellow('⚠️  Starting Redis...'));
      spawn('redis-server', ['--daemonize', 'yes']);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Start the application
    console.log('🚀 Starting Claude Flow Novice...');
    const child = spawn('npm', ['run', 'dev'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      console.log(\`Process exited with code \${code}\`);
    });

  } catch (error) {
    console.error(chalk.red('Failed to start:'), error.message);
    process.exit(1);
  }
}

quickStart();
`;
  }

  async promptRollback() {
    const { confirm } = await this.prompt('\n❌ Setup failed. Would you like to rollback changes?', { default: true });
    return confirm;
  }

  async performRollback() {
    console.log(chalk.yellow('\n🔄 Rolling back changes...'));

    for (const action of this.rollbackStack.reverse()) {
      try {
        await action();
        console.log(chalk.green('✅ Rollback step completed'));
      } catch (error) {
        console.log(chalk.red('❌ Rollback step failed:'), error.message);
      }
    }

    console.log(chalk.yellow('\n⚠️  Rollback completed. Some manual cleanup may be required.'));
  }

  addRollbackAction(action) {
    this.rollbackStack.push(action);
  }

  prompt(question, options = {}) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        if (options.default && typeof options.default === 'boolean') {
          resolve({ confirm: answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes' });
        } else {
          resolve(answer);
        }
      });
    });
  }

  addLog(message) {
    const timestamp = new Date().toISOString();
    this.setupLog.push({ timestamp, message });
  }

  logError(error) {
    this.addLog(`ERROR: ${error.message}`);
    this.addLog(`STACK: ${error.stack}`);
  }

  logSetupCompletion() {
    const logPath = join(this.rootDir, '.claude-flow-novice', 'setup.log');
    writeFileSync(logPath, JSON.stringify(this.setupLog, null, 2));
  }

  displaySuccessMessage() {
    console.log('\n' + boxen(
      chalk.green.bold('🎉 Claude Flow Novice setup completed successfully!'),
      {
        padding: 1,
        borderColor: 'green',
        borderStyle: 'round'
      }
    ));

    console.log(chalk.blue('\n📁 Created files:'));
    console.log('  • .env (environment configuration)');
    console.log('  • config/claude-flow-config.json');
    console.log('  • scripts/dev/ (development scripts)');
    console.log('  • .claude-flow-novice/ (user data directory)');

    console.log(chalk.blue('\n🚀 Quick start commands:'));
    console.log('  npm run dev                    # Start development server');
    console.log('  npm start                      # Start production server');
    console.log('  node scripts/quick-start.js    # Quick start with Redis');
    console.log('  npm run config:wizard          # Reconfigure settings');

    if (this.config.redis.useRedis) {
      console.log(chalk.blue('\n🔴 Redis commands:'));
      console.log('  npm run redis:start            # Start Redis server');
      console.log('  npm run redis:stop             # Stop Redis server');
    }

    console.log(chalk.green('\n✨ Your Claude Flow Novice environment is ready!'));
    console.log(chalk.gray('Check the documentation for more information about available features.'));
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new SetupManager();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    skipPrerequisites: args.includes('--skip-prereqs'),
    skipDeps: args.includes('--skip-deps'),
    interactive: !args.includes('--non-interactive'),
    autoRollback: !args.includes('--no-rollback')
  };

  setup.run(options).catch(console.error);
}

export default SetupManager;