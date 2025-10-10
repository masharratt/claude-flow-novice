#!/usr/bin/env node
/**
 * Interactive Setup Wizard for Claude Flow Novice
 *
 * Simplifies installation and configuration for novice users with:
 * - Redis connection auto-detection
 * - Interactive prompts with examples
 * - Dependency validation
 * - .env file generation
 * - Project initialization
 *
 * Target: Complete setup in <5 minutes
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, access, mkdir } from 'fs/promises';
import { join } from 'path';
import { validateApiKey, saveApiKey, initializeSecretsManager } from '../../security/secrets-wrapper.js';

const execAsync = promisify(exec);

interface SetupConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    autoDetected: boolean;
  };
  apiKeys?: {
    anthropic?: string;
    npm?: string;
    zai?: string;
  };
  projectName: string;
  environment: 'development' | 'staging' | 'production';
  features: string[];
  maxAgents: number;
}

export const setupWizardCommand = new Command('setup')
  .description('Interactive setup wizard for novice users')
  .option('--skip-dependencies', 'Skip dependency validation', false)
  .option('--skip-redis', 'Skip Redis configuration', false)
  .option('--non-interactive', 'Run in non-interactive mode with defaults', false)
  .action(async (options) => {
    try {
      console.clear();
      await showWelcome();

      if (options.nonInteractive) {
        await runNonInteractive();
        return;
      }

      // Step 1: Dependency Validation
      if (!options.skipDependencies) {
        await validateDependencies();
      }

      // Step 2: Redis Configuration
      let redisConfig = null;
      if (!options.skipRedis) {
        redisConfig = await configureRedis();
      }

      // Step 3: Project Configuration
      const projectConfig = await configureProject();

      // Step 4: Optional Configuration
      const optionalConfig = await configureOptional();

      // Step 5: Generate Configuration
      const setupConfig: SetupConfig = {
        redis: redisConfig || {
          host: 'localhost',
          port: 6379,
          autoDetected: false,
        },
        ...projectConfig,
        ...optionalConfig,
      };

      // Step 6: Create Configuration Files
      await generateConfigFiles(setupConfig);

      // Step 7: Initialize Project Structure
      await initializeProject(setupConfig);

      // Step 8: Validation
      await validateSetup(setupConfig);

      // Step 9: Show Next Steps
      await showNextSteps(setupConfig);

    } catch (error) {
      console.error(chalk.red('\n❌ Setup failed:'), (error as Error).message);
      console.log(chalk.yellow('\n💡 Tip: Run with --help for troubleshooting options'));
      process.exit(1);
    }
  });

async function showWelcome() {
  const banner = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀  Claude Flow Novice - Interactive Setup Wizard  🚀   ║
║                                                           ║
║   Complete your setup in less than 5 minutes!            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;

  console.log(chalk.cyan(banner));
  console.log(chalk.gray('  AI Agent Orchestration Made Simple\n'));

  const { ready } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'ready',
      message: 'Ready to begin setup?',
      default: true,
    },
  ]);

  if (!ready) {
    console.log(chalk.yellow('\n👋 Setup cancelled. Run again when ready!'));
    process.exit(0);
  }
}

async function validateDependencies() {
  console.log(chalk.bold('\n📦 Step 1: Validating Dependencies\n'));

  const spinner = ora('Checking system requirements...').start();

  const checks = [
    {
      name: 'Node.js',
      command: 'node --version',
      minVersion: '20.0.0',
      required: true,
    },
    {
      name: 'npm',
      command: 'npm --version',
      minVersion: '9.0.0',
      required: true,
    },
    {
      name: 'Redis',
      command: 'redis-cli --version',
      minVersion: '6.0.0',
      required: false,
    },
  ];

  const results = [];

  for (const check of checks) {
    try {
      const { stdout } = await execAsync(check.command);
      const version = stdout.trim().match(/\d+\.\d+\.\d+/)?.[0] || 'unknown';

      const versionOk = compareVersions(version, check.minVersion) >= 0;

      results.push({
        ...check,
        installed: true,
        version,
        versionOk,
      });
    } catch (error) {
      results.push({
        ...check,
        installed: false,
        version: 'not found',
        versionOk: false,
      });
    }
  }

  spinner.stop();

  // Display results
  console.log('');
  for (const result of results) {
    const icon = result.installed && result.versionOk ? '✅' : result.required ? '❌' : '⚠️';
    const status = result.installed
      ? `v${result.version} ${result.versionOk ? '' : chalk.yellow(`(min: v${result.minVersion})`)}`
      : chalk.red('not found');

    console.log(`${icon} ${result.name.padEnd(15)} ${status}`);
  }

  // Check for critical failures
  const criticalFailure = results.find(r => r.required && (!r.installed || !r.versionOk));

  if (criticalFailure) {
    console.log(chalk.red('\n❌ Missing required dependencies!'));
    console.log(chalk.yellow('\nInstallation instructions:'));
    console.log(chalk.gray('  Node.js v20+: https://nodejs.org/'));
    console.log(chalk.gray('  npm v9+: npm install -g npm@latest'));
    throw new Error('Please install required dependencies and try again');
  }

  // Warning for optional dependencies
  const redisInstalled = results.find(r => r.name === 'Redis')?.installed;
  if (!redisInstalled) {
    console.log(chalk.yellow('\n⚠️  Redis not detected (optional for basic usage)'));
    console.log(chalk.gray('   Advanced features require Redis. Install instructions:'));
    console.log(chalk.gray('   - macOS: brew install redis'));
    console.log(chalk.gray('   - Ubuntu: sudo apt-get install redis-server'));
    console.log(chalk.gray('   - Windows: https://redis.io/docs/getting-started/installation/install-redis-on-windows/'));

    const { continueWithout } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueWithout',
        message: 'Continue without Redis? (Limited functionality)',
        default: false,
      },
    ]);

    if (!continueWithout) {
      throw new Error('Setup cancelled - Redis required');
    }
  }

  console.log(chalk.green('\n✅ Dependency validation complete!'));
}

async function configureRedis() {
  console.log(chalk.bold('\n🔧 Step 2: Redis Configuration\n'));

  const spinner = ora('Auto-detecting Redis...').start();

  // Try to auto-detect Redis
  let autoDetected = false;
  let defaultHost = 'localhost';
  let defaultPort = 6379;

  try {
    const { stdout } = await execAsync('redis-cli ping', { timeout: 2000 });
    if (stdout.trim() === 'PONG') {
      autoDetected = true;
      spinner.succeed('Redis detected at localhost:6379');
    } else {
      spinner.warn('Redis running but not responding correctly');
    }
  } catch (error) {
    spinner.warn('Redis not detected - manual configuration needed');
  }

  console.log('');

  const { setupType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'setupType',
      message: 'How would you like to configure Redis?',
      choices: [
        {
          name: autoDetected
            ? '✨ Use auto-detected settings (localhost:6379)'
            : '📝 Manual configuration',
          value: autoDetected ? 'auto' : 'manual',
        },
        {
          name: '🔧 Custom settings',
          value: 'custom',
        },
        {
          name: '⏭️  Skip Redis (use in-memory storage)',
          value: 'skip',
        },
      ],
    },
  ]);

  if (setupType === 'skip') {
    console.log(chalk.yellow('\n⚠️  Skipping Redis - using in-memory storage (data not persisted)'));
    return null;
  }

  let host = defaultHost;
  let port = defaultPort;
  let password: string | undefined;

  if (setupType === 'custom') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: 'Redis host:',
        default: defaultHost,
        validate: (input) => input.length > 0 || 'Host is required',
      },
      {
        type: 'number',
        name: 'port',
        message: 'Redis port:',
        default: defaultPort,
        validate: (input) => (input > 0 && input < 65536) || 'Invalid port',
      },
      {
        type: 'confirm',
        name: 'requiresAuth',
        message: 'Does Redis require authentication?',
        default: false,
      },
    ]);

    host = answers.host;
    port = answers.port;

    if (answers.requiresAuth) {
      const { redisPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'redisPassword',
          message: 'Redis password:',
          mask: '*',
        },
      ]);
      password = redisPassword;
    }
  }

  // Test connection
  const testSpinner = ora('Testing Redis connection...').start();

  try {
    // Import Redis client
    const { createClient } = await import('redis');
    const client = createClient({
      socket: { host, port },
      password,
    });

    await client.connect();
    await client.ping();
    await client.disconnect();

    testSpinner.succeed('Redis connection successful!');

    return {
      host,
      port,
      password,
      autoDetected: setupType === 'auto',
    };
  } catch (error) {
    testSpinner.fail('Redis connection failed');

    const { retry } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: 'Retry Redis configuration?',
        default: true,
      },
    ]);

    if (retry) {
      return configureRedis();
    }

    throw new Error(`Redis connection failed: ${(error as Error).message}`);
  }
}

async function configureProject() {
  console.log(chalk.bold('\n⚙️  Step 3: Project Configuration\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: 'my-ai-project',
      validate: (input) => {
        if (!/^[a-z0-9-_]+$/.test(input)) {
          return 'Project name must be lowercase alphanumeric with hyphens/underscores';
        }
        return true;
      },
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Target environment:',
      choices: [
        { name: '🧪 Development (verbose logging, 10 agents)', value: 'development' },
        { name: '🔬 Staging (moderate logging, 100 agents)', value: 'staging' },
        { name: '🚀 Production (minimal logging, 500 agents)', value: 'production' },
      ],
      default: 'development',
    },
    {
      type: 'checkbox',
      name: 'features',
      message: 'Select features to enable:',
      choices: [
        { name: 'Agent Coordination', value: 'coordination', checked: true },
        { name: 'Memory Management', value: 'memory', checked: true },
        { name: 'Task Orchestration', value: 'tasks', checked: true },
        { name: 'Performance Monitoring', value: 'monitoring', checked: true },
        { name: 'MCP Server Integration', value: 'mcp', checked: true },
        { name: 'Neural Learning (Experimental)', value: 'neural', checked: false },
      ],
    },
  ]);

  // Agent count based on environment
  const agentLimits = {
    development: 10,
    staging: 100,
    production: 500,
  };

  return {
    projectName: answers.projectName,
    environment: answers.environment,
    features: answers.features,
    maxAgents: agentLimits[answers.environment as keyof typeof agentLimits],
  };
}

async function configureOptional() {
  console.log(chalk.bold('\n🎨 Step 4: Optional Configuration\n'));

  const { configureOptional } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'configureOptional',
      message: 'Configure optional settings? (API keys, advanced features)',
      default: false,
    },
  ]);

  if (!configureOptional) {
    console.log(chalk.gray('  Skipping optional configuration (can be set later)'));
    return {};
  }

  const apiKeys: Record<string, string> = {};

  // Anthropic API Key
  const { addAnthropicKey } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addAnthropicKey',
      message: 'Add Anthropic API key? (for Claude integration)',
      default: false,
    },
  ]);

  if (addAnthropicKey) {
    let anthropicKey = '';
    let validAnthropicKey = false;

    while (!validAnthropicKey) {
      const { key } = await inquirer.prompt([
        {
          type: 'password',
          name: 'key',
          message: 'Anthropic API Key (sk-ant-api03-...):',
          mask: '*',
        },
      ]);

      const validation = await validateApiKey('ANTHROPIC_API_KEY', key);

      if (validation.valid) {
        anthropicKey = key;
        validAnthropicKey = true;
        console.log(chalk.green('✓ Anthropic API key format is valid'));
      } else {
        console.log(chalk.red(`✗ ${validation.message}`));
        const { retry } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'retry',
            message: 'Try again?',
            default: true,
          },
        ]);
        if (!retry) break;
      }
    }

    if (validAnthropicKey) {
      apiKeys.anthropic = anthropicKey;
    }
  }

  // NPM API Key
  const { addNpmKey } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addNpmKey',
      message: 'Add NPM API token? (for package publishing)',
      default: false,
    },
  ]);

  if (addNpmKey) {
    let npmKey = '';
    let validNpmKey = false;

    while (!validNpmKey) {
      const { key } = await inquirer.prompt([
        {
          type: 'password',
          name: 'key',
          message: 'NPM API Token (npm_...):',
          mask: '*',
        },
      ]);

      const validation = await validateApiKey('NPM_API_KEY', key);

      if (validation.valid) {
        npmKey = key;
        validNpmKey = true;
        console.log(chalk.green('✓ NPM API token format is valid'));
      } else {
        console.log(chalk.red(`✗ ${validation.message}`));
        const { retry } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'retry',
            message: 'Try again?',
            default: true,
          },
        ]);
        if (!retry) break;
      }
    }

    if (validNpmKey) {
      apiKeys.npm = npmKey;
    }
  }

  // Z.AI API Key
  const { addZaiKey } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addZaiKey',
      message: 'Add Z.AI API key? (for neural features)',
      default: false,
    },
  ]);

  if (addZaiKey) {
    let zaiKey = '';
    let validZaiKey = false;

    while (!validZaiKey) {
      const { key } = await inquirer.prompt([
        {
          type: 'password',
          name: 'key',
          message: 'Z.AI API Key (hex.alphanumeric):',
          mask: '*',
        },
      ]);

      const validation = await validateApiKey('Z_AI_API_KEY', key);

      if (validation.valid) {
        zaiKey = key;
        validZaiKey = true;
        console.log(chalk.green('✓ Z.AI API key format is valid'));
      } else {
        console.log(chalk.red(`✗ ${validation.message}`));
        const { retry } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'retry',
            message: 'Try again?',
            default: true,
          },
        ]);
        if (!retry) break;
      }
    }

    if (validZaiKey) {
      apiKeys.zai = zaiKey;
    }
  }

  return { apiKeys: Object.keys(apiKeys).length > 0 ? apiKeys : undefined };
}

async function generateConfigFiles(config: SetupConfig) {
  console.log(chalk.bold('\n📝 Step 5: Generating Configuration Files\n'));

  const spinner = ora('Creating configuration files...').start();

  try {
    // Generate .env file
    const envContent = generateEnvContent(config);
    await writeFile('.env', envContent);
    spinner.text = 'Created .env file';

    // Set file permissions for .env (read/write for owner only)
    try {
      const fs = await import('fs');
      fs.chmodSync('.env', 0o600);
      spinner.text = 'Secured .env file permissions';
    } catch (error) {
      // Permissions may not work on Windows
      spinner.warn('Could not set .env permissions (may not be supported on this platform)');
    }

    // Generate .env.example (without secrets)
    const envExampleContent = generateEnvContent(config, true);
    await writeFile('.env.example', envExampleContent);
    spinner.text = 'Created .env.example file';

    // Initialize SecretsManager for persistence
    if (config.apiKeys && Object.keys(config.apiKeys).length > 0) {
      spinner.text = 'Initializing secrets manager...';

      const initResult = await initializeSecretsManager();

      if (!initResult.initialized) {
        spinner.warn('SecretsManager initialization had warnings');
        console.log(chalk.yellow('\n⚠️  Warnings:'));
        initResult.warnings.forEach(w => console.log(chalk.gray(`   - ${w}`)));
      } else {
        spinner.text = 'Secrets manager initialized';
      }
    }

    // Generate project config file
    const projectConfig = {
      name: config.projectName,
      version: '1.0.0',
      environment: config.environment,
      features: config.features,
      createdAt: new Date().toISOString(),
    };

    await writeFile(
      'claude-flow-novice.config.json',
      JSON.stringify(projectConfig, null, 2)
    );

    spinner.succeed('Configuration files created successfully!');

    console.log(chalk.green('\n✅ Generated files:'));
    console.log(chalk.gray('   - .env (environment variables, secured)'));
    console.log(chalk.gray('   - .env.example (template for team)'));
    console.log(chalk.gray('   - claude-flow-novice.config.json (project config)'));

  } catch (error) {
    spinner.fail('Failed to create configuration files');
    throw error;
  }
}

async function initializeProject(config: SetupConfig) {
  console.log(chalk.bold('\n🏗️  Step 6: Initializing Project Structure\n'));

  const spinner = ora('Creating project directories...').start();

  const directories = [
    'memory',
    'memory/agents',
    'memory/sessions',
    'memory/security',
    'logs',
    'config',
    '.claude',
    '.claude/agents',
  ];

  try {
    for (const dir of directories) {
      await mkdir(dir, { recursive: true });
    }

    spinner.succeed('Project structure created!');

    // Create README if it doesn't exist
    try {
      await access('README.md');
    } catch {
      const readme = generateReadme(config);
      await writeFile('README.md', readme);
      console.log(chalk.gray('   - Created README.md'));
    }

  } catch (error) {
    spinner.fail('Failed to create project structure');
    throw error;
  }
}

async function validateSetup(config: SetupConfig) {
  console.log(chalk.bold('\n✅ Step 7: Validating Setup\n'));

  const checks = [
    {
      name: 'Configuration files',
      check: async () => {
        await access('.env');
        await access('claude-flow-novice.config.json');
      },
    },
    {
      name: 'Project structure',
      check: async () => {
        await access('memory');
        await access('.claude');
      },
    },
    {
      name: 'Redis connection',
      check: async () => {
        if (config.redis) {
          const { createClient } = await import('redis');
          const client = createClient({
            socket: {
              host: config.redis.host,
              port: config.redis.port,
            },
            password: config.redis.password,
          });
          await client.connect();
          await client.ping();
          await client.disconnect();
        }
      },
      optional: !config.redis,
    },
  ];

  for (const check of checks) {
    const spinner = ora(check.name).start();

    try {
      await check.check();
      spinner.succeed();
    } catch (error) {
      if (check.optional) {
        spinner.warn(`${check.name} (skipped)`);
      } else {
        spinner.fail();
        throw new Error(`Validation failed: ${check.name}`);
      }
    }
  }

  console.log(chalk.green('\n🎉 Setup validation complete!'));
}

async function showNextSteps(config: SetupConfig) {
  console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║                                                   ║'));
  console.log(chalk.bold.cyan('║       🎉  Setup Complete! Ready to Go! 🎉        ║'));
  console.log(chalk.bold.cyan('║                                                   ║'));
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════════╝\n'));

  console.log(chalk.bold('📚 Next Steps:\n'));

  console.log(chalk.cyan('1. Start the orchestration system:'));
  console.log(chalk.gray('   $ npx claude-flow-novice start\n'));

  console.log(chalk.cyan('2. Spawn your first agent:'));
  console.log(chalk.gray('   $ npx claude-flow-novice agent spawn researcher --name "my-agent"\n'));

  console.log(chalk.cyan('3. Create a task:'));
  console.log(chalk.gray('   $ npx claude-flow-novice task create research "Analyze market trends"\n'));

  console.log(chalk.cyan('4. Monitor your system:'));
  console.log(chalk.gray('   $ npx claude-flow-novice monitor\n'));

  console.log(chalk.bold('📖 Documentation:'));
  console.log(chalk.gray('   - Quick Start: https://github.com/masharratt/claude-flow-novice#quick-start'));
  console.log(chalk.gray('   - API Reference: https://github.com/masharratt/claude-flow-novice/docs/API.md'));
  console.log(chalk.gray('   - Examples: https://github.com/masharratt/claude-flow-novice/examples\n'));

  console.log(chalk.bold('🆘 Need Help?'));
  console.log(chalk.gray('   - Run: npx claude-flow-novice --help'));
  console.log(chalk.gray('   - Issues: https://github.com/masharratt/claude-flow-novice/issues'));
  console.log(chalk.gray('   - Troubleshooting: See docs/TROUBLESHOOTING.md\n'));

  console.log(chalk.yellow('⏱️  Setup completed in ~3 minutes!\n'));
}

async function runNonInteractive() {
  console.log(chalk.yellow('Running in non-interactive mode with defaults...\n'));

  const config: SetupConfig = {
    redis: {
      host: 'localhost',
      port: 6379,
      autoDetected: false,
    },
    projectName: 'my-ai-project',
    environment: 'development',
    features: ['coordination', 'memory', 'tasks', 'monitoring', 'mcp'],
    maxAgents: 10,
  };

  await generateConfigFiles(config);
  await initializeProject(config);
  await showNextSteps(config);
}

// Helper Functions

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

function generateEnvContent(config: SetupConfig, isExample: boolean = false): string {
  const lines = [
    '# Claude Flow Novice - Environment Configuration',
    `# Generated: ${new Date().toISOString()}`,
    '',
    '# =============================================================================',
    '# DEPLOYMENT ENVIRONMENT',
    '# =============================================================================',
    `NODE_ENV=${config.environment}`,
    '',
  ];

  // Environment-specific settings
  const envSettings = {
    development: {
      maxAgents: 10,
      shardCount: 4,
      logLevel: 'debug',
      metricsEnabled: 'true',
      alertingEnabled: 'false',
    },
    staging: {
      maxAgents: 100,
      shardCount: 16,
      logLevel: 'info',
      metricsEnabled: 'true',
      alertingEnabled: 'true',
    },
    production: {
      maxAgents: 500,
      shardCount: 32,
      logLevel: 'warn',
      metricsEnabled: 'true',
      alertingEnabled: 'true',
    },
  };

  const settings = envSettings[config.environment];

  lines.push(
    '# =============================================================================',
    '# AGENT COORDINATION',
    '# =============================================================================',
    `CFN_MAX_AGENTS=${settings.maxAgents}`,
    `CFN_SHARD_COUNT=${settings.shardCount}`,
    `CFN_METRICS_ENABLED=${settings.metricsEnabled}`,
    `CFN_ALERTING_ENABLED=${settings.alertingEnabled}`,
    `CFN_LOG_LEVEL=${settings.logLevel}`,
    'CFN_CONSENSUS_THRESHOLD=0.90',
    '',
  );

  // Redis configuration
  if (config.redis) {
    lines.push(
      '# =============================================================================',
      '# REDIS CONFIGURATION',
      '# =============================================================================',
      `REDIS_HOST=${config.redis.host}`,
      `REDIS_PORT=${config.redis.port}`,
    );

    if (config.redis.password && !isExample) {
      lines.push(`REDIS_PASSWORD=${config.redis.password}`);
    } else if (isExample) {
      lines.push('# REDIS_PASSWORD=your-password-here');
    }

    lines.push('');
  }

  // API Keys
  if (config.apiKeys && Object.keys(config.apiKeys).length > 0 && !isExample) {
    lines.push(
      '# =============================================================================',
      '# API CONFIGURATION',
      '# =============================================================================',
    );

    if (config.apiKeys.anthropic) {
      lines.push(`ANTHROPIC_API_KEY=${config.apiKeys.anthropic}`);
    }
    if (config.apiKeys.npm) {
      lines.push(`NPM_API_KEY=${config.apiKeys.npm}`);
    }
    if (config.apiKeys.zai) {
      lines.push(`Z_AI_API_KEY=${config.apiKeys.zai}`);
      lines.push(`ZAI_API_KEY=${config.apiKeys.zai}`); // Alias
    }

    lines.push('');
  } else if (isExample) {
    lines.push(
      '# =============================================================================',
      '# API CONFIGURATION',
      '# =============================================================================',
      '# ANTHROPIC_API_KEY=sk-ant-api03-your-key-here',
      '# NPM_API_KEY=npm_your-token-here',
      '# Z_AI_API_KEY=your-zai-key-here',
      '# ZAI_API_KEY=your-zai-key-here',
      '',
    );
  }

  // Features
  lines.push(
    '# =============================================================================',
    '# FEATURES',
    '# =============================================================================',
    `CFN_FEATURES=${config.features.join(',')}`,
    '',
  );

  // Memory configuration
  lines.push(
    '# =============================================================================',
    '# MEMORY AND STORAGE',
    '# =============================================================================',
    'CFN_BASE_DIR=/tmp/cfn',
    'CFN_AGENT_MEMORY_LIMIT_MB=100',
    'CFN_TOTAL_MEMORY_LIMIT_MB=2048',
    '',
  );

  // MCP Server
  if (config.features.includes('mcp')) {
    lines.push(
      '# =============================================================================',
      '# MCP SERVER',
      '# =============================================================================',
      'CFN_MCP_SERVER_ENABLED=true',
      'CFN_MCP_SERVER_PORT=3000',
      '',
    );
  }

  return lines.join('\n');
}

function generateReadme(config: SetupConfig): string {
  return `# ${config.projectName}

AI Agent Orchestration powered by Claude Flow Novice

## Setup Complete! 🎉

Your project has been configured with the following:

- **Environment:** ${config.environment}
- **Max Agents:** ${config.maxAgents}
- **Features:** ${config.features.join(', ')}
${config.redis ? `- **Redis:** ${config.redis.host}:${config.redis.port}` : '- **Storage:** In-memory'}

## Quick Start

\`\`\`bash
# Start the orchestration system
npx claude-flow-novice start

# Spawn an agent
npx claude-flow-novice agent spawn researcher --name "my-agent"

# Create a task
npx claude-flow-novice task create research "Your task description"

# Monitor the system
npx claude-flow-novice monitor
\`\`\`

## Documentation

- [Full Documentation](https://github.com/masharratt/claude-flow-novice)
- [API Reference](https://github.com/masharratt/claude-flow-novice/docs/API.md)
- [Examples](https://github.com/masharratt/claude-flow-novice/examples)

## Configuration

Your configuration is stored in:
- \`.env\` - Environment variables (DO NOT commit to git)
- \`claude-flow-novice.config.json\` - Project configuration

## Troubleshooting

See [TROUBLESHOOTING.md](https://github.com/masharratt/claude-flow-novice/docs/TROUBLESHOOTING.md) for common issues.

---

Generated with Claude Flow Novice Setup Wizard
`;
}
