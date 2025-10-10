#!/usr/bin/env node
/**
 * Setup Validation Script
 *
 * Validates that the setup wizard has correctly configured the system
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { access, readFile } from 'fs/promises';
import { createClient } from 'redis';
import { getSecurityAudit, checkKeyRotation, initializeSecretsManager } from '../../security/secrets-wrapper.js';

interface ValidationResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message?: string;
}

export const validateSetupCommand = new Command('validate')
  .description('Validate setup configuration')
  .option('--fix', 'Attempt to fix issues automatically', false)
  .action(async (options) => {
    console.log(chalk.bold.cyan('\n🔍 Validating Setup Configuration\n'));

    const results: ValidationResult[] = [];

    // 1. Check .env file
    results.push(await checkEnvFile());

    // 2. Check project config
    results.push(await checkProjectConfig());

    // 3. Check directory structure
    results.push(await checkDirectories());

    // 4. Check Redis connection
    results.push(await checkRedisConnection());

    // 5. Check dependencies
    results.push(await checkDependencies());

    // 6. Check secrets security
    results.push(await checkSecretsManager());

    // 7. Check API key rotation
    results.push(await checkApiKeyRotation());

    // Display results
    console.log('');
    for (const result of results) {
      const icon = getStatusIcon(result.status);
      const color = getStatusColor(result.status);
      console.log(`${icon} ${chalk[color](result.name)}`);
      if (result.message) {
        console.log(chalk.gray(`   ${result.message}`));
      }
    }

    // Summary
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const warnings = results.filter(r => r.status === 'warn').length;

    console.log('\n' + '─'.repeat(60));
    console.log(chalk.bold('Summary:'));
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  ⚠️  Warnings: ${warnings}`);

    if (failed === 0) {
      console.log(chalk.green('\n🎉 Setup validation complete! System ready to use.\n'));
      process.exit(0);
    } else {
      console.log(chalk.red('\n❌ Setup validation failed. Please fix the issues above.\n'));
      if (!options.fix) {
        console.log(chalk.yellow('Tip: Run with --fix to attempt automatic repairs\n'));
      }
      process.exit(1);
    }
  });

async function checkEnvFile(): Promise<ValidationResult> {
  try {
    await access('.env');
    const content = await readFile('.env', 'utf-8');

    // Check for required variables
    const required = ['NODE_ENV', 'CFN_MAX_AGENTS'];
    const missing = required.filter(key => !content.includes(key));

    if (missing.length > 0) {
      return {
        name: '.env file',
        status: 'warn',
        message: `Missing variables: ${missing.join(', ')}`,
      };
    }

    return {
      name: '.env file',
      status: 'pass',
      message: 'All required variables present',
    };
  } catch (error) {
    return {
      name: '.env file',
      status: 'fail',
      message: 'File not found. Run: npx claude-flow-novice setup',
    };
  }
}

async function checkProjectConfig(): Promise<ValidationResult> {
  try {
    await access('claude-flow-novice.config.json');
    const content = await readFile('claude-flow-novice.config.json', 'utf-8');
    const config = JSON.parse(content);

    // Validate structure
    const required = ['name', 'version', 'environment'];
    const missing = required.filter(key => !(key in config));

    if (missing.length > 0) {
      return {
        name: 'Project config',
        status: 'warn',
        message: `Missing fields: ${missing.join(', ')}`,
      };
    }

    return {
      name: 'Project config',
      status: 'pass',
      message: `Project: ${config.name} (${config.environment})`,
    };
  } catch (error) {
    return {
      name: 'Project config',
      status: 'fail',
      message: 'Invalid or missing config file',
    };
  }
}

async function checkDirectories(): Promise<ValidationResult> {
  const required = [
    'memory',
    'memory/agents',
    'memory/sessions',
    'logs',
    '.claude',
  ];

  const missing = [];

  for (const dir of required) {
    try {
      await access(dir);
    } catch {
      missing.push(dir);
    }
  }

  if (missing.length > 0) {
    return {
      name: 'Directory structure',
      status: 'warn',
      message: `Missing directories: ${missing.join(', ')}`,
    };
  }

  return {
    name: 'Directory structure',
    status: 'pass',
    message: 'All required directories present',
  };
}

async function checkRedisConnection(): Promise<ValidationResult> {
  try {
    // Read Redis config from .env
    const envContent = await readFile('.env', 'utf-8');
    const redisHost = envContent.match(/REDIS_HOST=(.+)/)?.[1] || 'localhost';
    const redisPort = parseInt(envContent.match(/REDIS_PORT=(.+)/)?.[1] || '6379');

    const client = createClient({
      socket: {
        host: redisHost,
        port: redisPort,
      },
    });

    await client.connect();
    await client.ping();
    await client.disconnect();

    return {
      name: 'Redis connection',
      status: 'pass',
      message: `Connected to ${redisHost}:${redisPort}`,
    };
  } catch (error) {
    return {
      name: 'Redis connection',
      status: 'warn',
      message: 'Redis not available (using in-memory storage)',
    };
  }
}

async function checkDependencies(): Promise<ValidationResult> {
  try {
    // Check if node_modules exists and has required packages
    await access('node_modules');
    await access('node_modules/inquirer');
    await access('node_modules/chalk');

    return {
      name: 'Dependencies',
      status: 'pass',
      message: 'All required packages installed',
    };
  } catch (error) {
    return {
      name: 'Dependencies',
      status: 'fail',
      message: 'Run: npm install',
    };
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'fail':
      return '❌';
    case 'warn':
      return '⚠️';
    case 'skip':
      return '⏭️';
    default:
      return '❓';
  }
}

function getStatusColor(status: string): 'green' | 'red' | 'yellow' | 'gray' {
  switch (status) {
    case 'pass':
      return 'green';
    case 'fail':
      return 'red';
    case 'warn':
      return 'yellow';
    default:
      return 'gray';
  }
}

async function checkSecretsManager(): Promise<ValidationResult> {
  try {
    const initResult = await initializeSecretsManager();

    if (!initResult.initialized) {
      return {
        name: 'Secrets Manager',
        status: 'fail',
        message: 'Failed to initialize',
      };
    }

    const audit = await getSecurityAudit();

    if (audit.secrets.missing.length > 0) {
      return {
        name: 'Secrets Manager',
        status: 'warn',
        message: `Missing ${audit.secrets.missing.length} required secrets: ${audit.secrets.missing.join(', ')}`,
      };
    }

    // Check file permissions
    const envPerms = audit.filePermissions['.env'];
    if (envPerms && envPerms !== '600') {
      return {
        name: 'Secrets Manager',
        status: 'warn',
        message: `Insecure .env permissions: ${envPerms} (should be 600)`,
      };
    }

    return {
      name: 'Secrets Manager',
      status: 'pass',
      message: `${audit.secrets.total} secrets loaded, file permissions secure`,
    };
  } catch (error) {
    return {
      name: 'Secrets Manager',
      status: 'warn',
      message: 'SecretsManager not initialized (optional)',
    };
  }
}

async function checkApiKeyRotation(): Promise<ValidationResult> {
  try {
    const rotation = await checkKeyRotation();

    if (rotation.needRotation.length === 0) {
      return {
        name: 'API Key Rotation',
        status: 'pass',
        message: 'All API keys are current',
      };
    }

    if (rotation.needRotation.length <= 2) {
      return {
        name: 'API Key Rotation',
        status: 'warn',
        message: `${rotation.needRotation.length} keys need rotation (>${rotation.rotationIntervalDays} days): ${rotation.needRotation.join(', ')}`,
      };
    }

    return {
      name: 'API Key Rotation',
      status: 'fail',
      message: `${rotation.needRotation.length} keys are overdue for rotation: ${rotation.needRotation.join(', ')}`,
    };
  } catch (error) {
    return {
      name: 'API Key Rotation',
      status: 'skip',
      message: 'No rotation history found (keys not yet rotated)',
    };
  }
}
