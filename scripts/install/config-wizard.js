#!/usr/bin/env node

/**
 * Configuration Wizard for Claude Flow Novice
 * Interactive setup for first-time users
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import { v4 as uuidv4 } from 'uuid';

class ConfigWizard {
  constructor() {
    this.config = {
      basic: {},
      redis: {},
      swarm: {},
      security: {},
      development: {},
      monitoring: {}
    };
    this.spinner = ora();
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async run() {
    console.log(boxen(
      chalk.cyan.bold('⚙️  Claude Flow Novice - Configuration Wizard'),
      {
        padding: 1,
        borderColor: 'cyan',
        borderStyle: 'round'
      }
    ));

    console.log(chalk.yellow('\n👋 Welcome! Let\'s configure your Claude Flow Novice setup.\n'));
    console.log('This wizard will help you configure essential settings for optimal performance.\n');

    try {
      await this.configureBasicSettings();
      await this.configureRedis();
      await this.configureSwarmSettings();
      await this.configureSecurity();
      await this.configureDevelopment();
      await this.configureMonitoring();

      const confirmed = await this.confirmConfiguration();
      if (confirmed) {
        await this.saveConfiguration();
        await this.generateEnvironmentFiles();
        this.displaySuccessMessage();
      } else {
        console.log(chalk.yellow('Configuration cancelled. No changes were made.'));
      }
    } catch (error) {
      console.error(chalk.red('Configuration error:'), error.message);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async configureBasicSettings() {
    console.log(chalk.bold.blue('\n📋 Basic Configuration'));
    console.log(chalk.gray('Configure basic settings for your environment.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'environment',
        message: 'Environment type:',
        default: 'development',
        choices: ['development', 'staging', 'production'],
        validate: (input) => ['development', 'staging', 'production'].includes(input) || 'Please enter: development, staging, or production'
      },
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: 'claude-flow-novice-project',
        validate: (input) => input.length > 0 || 'Project name is required'
      },
      {
        type: 'input',
        name: 'projectDescription',
        message: 'Project description:',
        default: 'AI agent orchestration project'
      },
      {
        type: 'input',
        name: 'author',
        message: 'Author name:',
        default: () => {
          try {
            return require('os').userInfo().username;
          } catch {
            return 'Developer';
          }
        }
      },
      {
        type: 'list',
        name: 'logLevel',
        message: 'Logging level:',
        choices: ['error', 'warn', 'info', 'debug'],
        default: 'info'
      }
    ]);

    this.config.basic = answers;
  }

  async configureRedis() {
    console.log(chalk.bold.blue('\n🔴 Redis Configuration'));
    console.log(chalk.gray('Configure Redis connection settings.\n'));

    // Check if Redis is available
    let redisAvailable = false;
    try {
      const { execSync } = await import('child_process');
      execSync('redis-cli ping', { encoding: 'utf8', timeout: 2000 });
      redisAvailable = true;
    } catch {
      console.log(chalk.yellow('⚠️  Redis is not running locally.'));
    }

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useRedis',
        message: 'Use Redis for state persistence?',
        default: true
      },
      {
        type: 'list',
        name: 'redisType',
        message: 'Redis connection type:',
        choices: ['local', 'remote', 'cloud'],
        default: redisAvailable ? 'local' : 'remote',
        when: (answers) => answers.useRedis
      },
      {
        type: 'input',
        name: 'redisHost',
        message: 'Redis host:',
        default: 'localhost',
        when: (answers) => answers.useRedis && answers.redisType !== 'cloud'
      },
      {
        type: 'input',
        name: 'redisPort',
        message: 'Redis port:',
        default: '6379',
        validate: (input) => !isNaN(input) && input > 0 && input < 65536 || 'Please enter a valid port number',
        when: (answers) => answers.useRedis && answers.redisType !== 'cloud'
      },
      {
        type: 'input',
        name: 'redisPassword',
        message: 'Redis password (leave empty for no password):',
        when: (answers) => answers.useRedis
      },
      {
        type: 'input',
        name: 'redisUrl',
        message: 'Redis connection URL:',
        when: (answers) => answers.useRedis && answers.redisType === 'cloud',
        validate: (input) => input.startsWith('redis://') || input.startsWith('rediss://') || 'Please enter a valid Redis URL'
      },
      {
        type: 'confirm',
        name: 'installRedis',
        message: 'Automatically install Redis locally?',
        default: true,
        when: (answers) => answers.useRedis && answers.redisType === 'local' && !redisAvailable
      }
    ]);

    this.config.redis = answers;
  }

  async configureSwarmSettings() {
    console.log(chalk.bold.blue('\n🐝 Swarm Configuration'));
    console.log(chalk.gray('Configure swarm behavior and agent settings.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'maxAgents',
        message: 'Maximum number of agents:',
        default: '10',
        validate: (input) => !isNaN(input) && input > 0 && input <= 100 || 'Please enter a number between 1 and 100'
      },
      {
        type: 'list',
        name: 'swarmStrategy',
        message: 'Default swarm strategy:',
        choices: ['development', 'research', 'production', 'testing'],
        default: 'development'
      },
      {
        type: 'list',
        name: 'swarmMode',
        message: 'Default swarm mode:',
        choices: ['mesh', 'hierarchical', 'centralized'],
        default: 'mesh'
      },
      {
        type: 'confirm',
        name: 'enablePersistence',
        message: 'Enable swarm state persistence?',
        default: true
      },
      {
        type: 'input',
        name: 'consensusThreshold',
        message: 'Consensus threshold (0.0-1.0):',
        default: '0.90',
        validate: (input) => {
          const num = parseFloat(input);
          return !isNaN(num) && num >= 0 && num <= 1 || 'Please enter a number between 0 and 1';
        }
      },
      {
        type: 'confirm',
        name: 'enableRealTime',
        message: 'Enable real-time monitoring?',
        default: true
      }
    ]);

    this.config.swarm = answers;
  }

  async configureSecurity() {
    console.log(chalk.bold.blue('\n🔒 Security Configuration'));
    console.log(chalk.gray('Configure security settings and permissions.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableAuth',
        message: 'Enable authentication?',
        default: false
      },
      {
        type: 'list',
        name: 'authMethod',
        message: 'Authentication method:',
        choices: ['jwt', 'api-key', 'basic', 'oauth'],
        default: 'jwt',
        when: (answers) => answers.enableAuth
      },
      {
        type: 'input',
        name: 'jwtSecret',
        message: 'JWT secret (leave empty to auto-generate):',
        when: (answers) => answers.enableAuth && answers.authMethod === 'jwt'
      },
      {
        type: 'confirm',
        name: 'enableRateLimit',
        message: 'Enable rate limiting?',
        default: true
      },
      {
        type: 'input',
        name: 'rateLimitWindow',
        message: 'Rate limit window (minutes):',
        default: '15',
        validate: (input) => !isNaN(input) && input > 0 || 'Please enter a positive number',
        when: (answers) => answers.enableRateLimit
      },
      {
        type: 'input',
        name: 'rateLimitMax',
        message: 'Maximum requests per window:',
        default: '100',
        validate: (input) => !isNaN(input) && input > 0 || 'Please enter a positive number',
        when: (answers) => answers.enableRateLimit
      },
      {
        type: 'confirm',
        name: 'enableCORS',
        message: 'Enable CORS?',
        default: true
      }
    ]);

    // Generate JWT secret if not provided
    if (answers.enableAuth && answers.authMethod === 'jwt' && !answers.jwtSecret) {
      answers.jwtSecret = uuidv4() + uuidv4();
    }

    this.config.security = answers;
  }

  async configureDevelopment() {
    console.log(chalk.bold.blue('\n🛠️  Development Configuration'));
    console.log(chalk.gray('Configure development-specific settings.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableHotReload',
        message: 'Enable hot reloading?',
        default: true
      },
      {
        type: 'confirm',
        name: 'enableDebugMode',
        message: 'Enable debug mode?',
        default: true
      },
      {
        type: 'confirm',
        name: 'enableTestMode',
        message: 'Enable test mode?',
        default: false
      },
      {
        type: 'input',
        name: 'devServerPort',
        message: 'Development server port:',
        default: '3000',
        validate: (input) => !isNaN(input) && input > 0 && input < 65536 || 'Please enter a valid port number'
      },
      {
        type: 'confirm',
        name: 'enableMockData',
        message: 'Enable mock data for testing?',
        default: false
      },
      {
        type: 'list',
        name: 'databaseType',
        message: 'Database type:',
        choices: ['sqlite', 'postgresql', 'mysql', 'none'],
        default: 'sqlite'
      }
    ]);

    this.config.development = answers;
  }

  async configureMonitoring() {
    console.log(chalk.bold.blue('\n📊 Monitoring Configuration'));
    console.log(chalk.gray('Configure monitoring and alerting settings.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableMetrics',
        message: 'Enable metrics collection?',
        default: true
      },
      {
        type: 'confirm',
        name: 'enableHealthChecks',
        message: 'Enable health checks?',
        default: true
      },
      {
        type: 'confirm',
        name: 'enableAlerts',
        message: 'Enable alerts?',
        default: true
      },
      {
        type: 'input',
        name: 'healthCheckInterval',
        message: 'Health check interval (seconds):',
        default: '30',
        validate: (input) => !isNaN(input) && input > 0 || 'Please enter a positive number',
        when: (answers) => answers.enableHealthChecks
      },
      {
        type: 'list',
        name: 'logFormat',
        message: 'Log format:',
        choices: ['json', 'text', 'combined'],
        default: 'json'
      },
      {
        type: 'confirm',
        name: 'enableDashboard',
        message: 'Enable monitoring dashboard?',
        default: true
      }
    ]);

    this.config.monitoring = answers;
  }

  async confirmConfiguration() {
    console.log(chalk.bold.blue('\n📋 Configuration Summary'));
    console.log(chalk.gray('Please review your configuration before saving.\n'));

    const summary = this.generateSummary();
    console.log(summary);

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Save this configuration?',
        default: true
      }
    ]);

    return confirmed;
  }

  generateSummary() {
    const sections = [];

    sections.push(chalk.cyan.bold('Basic Settings:'));
    sections.push(`  Environment: ${this.config.basic.environment}`);
    sections.push(`  Project: ${this.config.basic.projectName}`);
    sections.push(`  Author: ${this.config.basic.author}`);
    sections.push(`  Log Level: ${this.config.basic.logLevel}`);

    sections.push('\n' + chalk.cyan.bold('Redis Settings:'));
    if (this.config.redis.useRedis) {
      sections.push(`  Type: ${this.config.redis.redisType}`);
      if (this.config.redis.redisType === 'cloud') {
        sections.push(`  URL: ${this.config.redis.redisUrl.replace(/\/\/.*@/, '//***:***@')}`);
      } else {
        sections.push(`  Host: ${this.config.redis.redisHost}:${this.config.redis.redisPort}`);
        sections.push(`  Password: ${this.config.redis.redisPassword ? '***' : 'None'}`);
      }
    } else {
      sections.push('  Redis: Disabled');
    }

    sections.push('\n' + chalk.cyan.bold('Swarm Settings:'));
    sections.push(`  Max Agents: ${this.config.swarm.maxAgents}`);
    sections.push(`  Strategy: ${this.config.swarm.swarmStrategy}`);
    sections.push(`  Mode: ${this.config.swarm.swarmMode}`);
    sections.push(`  Persistence: ${this.config.swarm.enablePersistence ? 'Enabled' : 'Disabled'}`);

    sections.push('\n' + chalk.cyan.bold('Security Settings:'));
    sections.push(`  Authentication: ${this.config.security.enableAuth ? this.config.security.authMethod : 'Disabled'}`);
    sections.push(`  Rate Limiting: ${this.config.security.enableRateLimit ? 'Enabled' : 'Disabled'}`);
    sections.push(`  CORS: ${this.config.security.enableCORS ? 'Enabled' : 'Disabled'}`);

    sections.push('\n' + chalk.cyan.bold('Development Settings:'));
    sections.push(`  Hot Reload: ${this.config.development.enableHotReload ? 'Enabled' : 'Disabled'}`);
    sections.push(`  Debug Mode: ${this.config.development.enableDebugMode ? 'Enabled' : 'Disabled'}`);
    sections.push(`  Dev Server Port: ${this.config.development.devServerPort}`);

    sections.push('\n' + chalk.cyan.bold('Monitoring Settings:'));
    sections.push(`  Metrics: ${this.config.monitoring.enableMetrics ? 'Enabled' : 'Disabled'}`);
    sections.push(`  Health Checks: ${this.config.monitoring.enableHealthChecks ? 'Enabled' : 'Disabled'}`);
    sections.push(`  Dashboard: ${this.config.monitoring.enableDashboard ? 'Enabled' : 'Disabled'}`);

    return sections.join('\n');
  }

  async saveConfiguration() {
    this.spinner.start('Saving configuration...');

    try {
      // Ensure config directory exists
      const configDir = join(process.cwd(), 'config');
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // Save main configuration
      const configPath = join(configDir, 'claude-flow-config.json');
      writeFileSync(configPath, JSON.stringify(this.config, null, 2));

      // Save user configuration
      const userConfigPath = join(homedir(), '.claude-flow-novice', 'config.json');
      const userConfigDir = dirname(userConfigPath);
      if (!existsSync(userConfigDir)) {
        mkdirSync(userConfigDir, { recursive: true });
      }
      writeFileSync(userConfigPath, JSON.stringify(this.config, null, 2));

      this.spinner.succeed('Configuration saved successfully!');
    } catch (error) {
      this.spinner.fail('Failed to save configuration');
      throw error;
    }
  }

  async generateEnvironmentFiles() {
    this.spinner.start('Generating environment files...');

    try {
      // Generate .env file
      const envContent = this.generateEnvContent();
      writeFileSync(join(process.cwd(), '.env'), envContent);

      // Generate .env.example file
      const exampleContent = this.generateEnvExampleContent();
      writeFileSync(join(process.cwd(), '.env.example'), exampleContent);

      this.spinner.succeed('Environment files generated!');
    } catch (error) {
      this.spinner.fail('Failed to generate environment files');
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

    if (this.config.security.enableAuth && this.config.security.jwtSecret) {
      lines.push('# Security Configuration');
      lines.push(`JWT_SECRET=${this.config.security.jwtSecret}`);
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
      .replace(/=.+$/, '=') // Replace values with empty
      .replace(/JWT_SECRET=.+$/, 'JWT_SECRET=your-jwt-secret-here')
      .replace(/REDIS_PASSWORD=.+$/, 'REDIS_PASSWORD=your-redis-password');
  }

  displaySuccessMessage() {
    console.log('\n' + boxen(
      chalk.green.bold('🎉 Configuration completed successfully!'),
      {
        padding: 1,
        borderColor: 'green',
        borderStyle: 'round'
      }
    ));

    console.log(chalk.blue('\n📁 Files created:'));
    console.log('  • config/claude-flow-config.json');
    console.log('  • .env');
    console.log('  • .env.example');
    console.log('  • ~/.claude-flow-novice/config.json');

    console.log(chalk.blue('\n🚀 Next steps:'));
    console.log('  1. Review the generated configuration files');
    console.log('  2. Run: npm run setup:install');
    console.log('  3. Start development: npm run dev');

    if (this.config.redis.installRedis) {
      console.log(chalk.yellow('\n⚠️  Redis will be installed automatically during setup.'));
    }

    console.log(chalk.gray('\n💡 You can re-run this wizard anytime with: npm run config:wizard'));
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const wizard = new ConfigWizard();
  wizard.run().catch(console.error);
}

export default ConfigWizard;