#!/usr/bin/env node

/**
 * Claude Flow Novice - Redis CLI Wrapper
 *
 * Unified command-line interface for Redis setup, testing, and management
 */

import { program } from 'commander';
import chalk from 'chalk';
import RedisSetup from './redis-setup.js';
import RedisConnectionTest from './redis-test.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load package.json for version
let version = '1.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
  version = pkg.version;
} catch (error) {
  // Use default version
}

program
  .name('redis-cli-wrapper')
  .description('Redis setup and management for Claude Flow Novice')
  .version(version);

// Setup command
program
  .command('setup')
  .description('Install and configure Redis')
  .option('--skip-install', 'Skip automatic installation')
  .option('--port <port>', 'Redis port (default: 6379)', '6379')
  .option('--host <host>', 'Redis host (default: localhost)', 'localhost')
  .option('--password <password>', 'Redis password (optional)')
  .option('--max-memory <size>', 'Maximum memory (default: 256mb)', '256mb')
  .option('--no-persistence', 'Disable persistence')
  .action(async (options) => {
    try {
      const setup = new RedisSetup({
        skipInstallation: options.skipInstall,
        port: parseInt(options.port),
        host: options.host,
        password: options.password,
        maxMemory: options.maxMemory,
        persistence: options.persistence
      });

      const success = await setup.setup();
      process.exit(success ? 0 : 1);
    } catch (error) {
      console.error(chalk.red('Setup failed:'), error.message);
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Test Redis connection and functionality')
  .option('--host <host>', 'Redis host (default: localhost)', 'localhost')
  .option('--port <port>', 'Redis port (default: 6379)', '6379')
  .option('--password <password>', 'Redis password (optional)')
  .action(async (options) => {
    try {
      const tester = new RedisConnectionTest({
        host: options.host,
        port: parseInt(options.port),
        password: options.password
      });

      const results = await tester.runAllTests();
      const exitCode = results.connectivity && results.errors.length === 0 ? 0 : 1;
      process.exit(exitCode);
    } catch (error) {
      console.error(chalk.red('Test failed:'), error.message);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Check Redis server status')
  .action(async () => {
    try {
      const { execSync } = await import('child_process');

      console.log(chalk.blue.bold('🔍 Redis Status\n'));

      // Check if Redis is running
      try {
        const response = execSync('redis-cli ping', { encoding: 'utf8', timeout: 5000 }).trim();

        if (response === 'PONG') {
          console.log(chalk.green('✅ Redis is running\n'));

          // Get server info
          try {
            const info = execSync('redis-cli INFO server', { encoding: 'utf8', timeout: 5000 });

            // Parse version
            const versionMatch = info.match(/redis_version:([^\r\n]+)/);
            const version = versionMatch ? versionMatch[1].trim() : 'unknown';

            // Parse uptime
            const uptimeMatch = info.match(/uptime_in_seconds:([^\r\n]+)/);
            const uptime = uptimeMatch ? parseInt(uptimeMatch[1].trim()) : 0;
            const uptimeHours = Math.floor(uptime / 3600);
            const uptimeMinutes = Math.floor((uptime % 3600) / 60);

            console.log(chalk.cyan('Server Information:'));
            console.log(`  Version: ${version}`);
            console.log(`  Uptime: ${uptimeHours}h ${uptimeMinutes}m\n`);

            // Get memory info
            const memInfo = execSync('redis-cli INFO memory', { encoding: 'utf8', timeout: 5000 });
            const usedMemMatch = memInfo.match(/used_memory_human:([^\r\n]+)/);
            const usedMem = usedMemMatch ? usedMemMatch[1].trim() : 'unknown';

            console.log(chalk.cyan('Memory:'));
            console.log(`  Used: ${usedMem}\n`);

            // Get database stats
            const dbInfo = execSync('redis-cli INFO keyspace', { encoding: 'utf8', timeout: 5000 });
            console.log(chalk.cyan('Databases:'));

            const dbMatches = dbInfo.matchAll(/db(\d+):keys=(\d+),expires=(\d+)/g);
            let hasData = false;
            for (const match of dbMatches) {
              hasData = true;
              console.log(`  db${match[1]}: ${match[2]} keys (${match[3]} with expiration)`);
            }

            if (!hasData) {
              console.log('  (no data stored)');
            }

            process.exit(0);
          } catch (infoError) {
            console.log(chalk.yellow('⚠️  Could not retrieve detailed server information'));
            process.exit(1);
          }
        } else {
          console.log(chalk.red('❌ Redis responded unexpectedly'));
          process.exit(1);
        }
      } catch (error) {
        console.log(chalk.red('❌ Redis is not running'));
        console.log(chalk.yellow('\nTo start Redis:'));
        console.log('  • macOS: brew services start redis');
        console.log('  • Linux: sudo systemctl start redis-server');
        console.log('  • Windows: redis-server or net start redis\n');
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error checking status:'), error.message);
      process.exit(1);
    }
  });

// Start command
program
  .command('start')
  .description('Start Redis server')
  .action(async () => {
    try {
      const { execSync, platform } = await import('child_process');
      const os = await import('os');

      console.log(chalk.blue.bold('🚀 Starting Redis Server\n'));

      const platformType = os.platform();

      if (platformType === 'darwin') {
        execSync('brew services start redis', { stdio: 'inherit' });
        console.log(chalk.green('\n✅ Redis started via Homebrew services'));
      } else if (platformType === 'win32') {
        try {
          execSync('net start redis', { stdio: 'inherit' });
          console.log(chalk.green('\n✅ Redis started as Windows service'));
        } catch (error) {
          console.log(chalk.yellow('Starting Redis directly...'));
          execSync('start redis-server', { stdio: 'inherit' });
          console.log(chalk.green('\n✅ Redis started'));
        }
      } else {
        execSync('sudo systemctl start redis-server', { stdio: 'inherit' });
        console.log(chalk.green('\n✅ Redis started via systemd'));
      }

      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed to start Redis:'), error.message);
      process.exit(1);
    }
  });

// Stop command
program
  .command('stop')
  .description('Stop Redis server')
  .action(async () => {
    try {
      const { execSync, platform } = await import('child_process');
      const os = await import('os');

      console.log(chalk.blue.bold('🛑 Stopping Redis Server\n'));

      const platformType = os.platform();

      if (platformType === 'darwin') {
        execSync('brew services stop redis', { stdio: 'inherit' });
        console.log(chalk.green('\n✅ Redis stopped'));
      } else if (platformType === 'win32') {
        execSync('net stop redis', { stdio: 'inherit' });
        console.log(chalk.green('\n✅ Redis stopped'));
      } else {
        execSync('sudo systemctl stop redis-server', { stdio: 'inherit' });
        console.log(chalk.green('\n✅ Redis stopped'));
      }

      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed to stop Redis:'), error.message);
      process.exit(1);
    }
  });

// Restart command
program
  .command('restart')
  .description('Restart Redis server')
  .action(async () => {
    try {
      const { execSync, platform } = await import('child_process');
      const os = await import('os');

      console.log(chalk.blue.bold('🔄 Restarting Redis Server\n'));

      const platformType = os.platform();

      if (platformType === 'darwin') {
        execSync('brew services restart redis', { stdio: 'inherit' });
        console.log(chalk.green('\n✅ Redis restarted'));
      } else if (platformType === 'win32') {
        try {
          execSync('net stop redis && net start redis', { stdio: 'inherit' });
        } catch (error) {
          console.log(chalk.yellow('Restarting Redis directly...'));
          execSync('taskkill /F /IM redis-server.exe && start redis-server', { stdio: 'inherit' });
        }
        console.log(chalk.green('\n✅ Redis restarted'));
      } else {
        execSync('sudo systemctl restart redis-server', { stdio: 'inherit' });
        console.log(chalk.green('\n✅ Redis restarted'));
      }

      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed to restart Redis:'), error.message);
      process.exit(1);
    }
  });

// Guide command
program
  .command('guide')
  .description('Display installation guide')
  .action(() => {
    try {
      const guidePath = join(__dirname, 'redis-install-guides.md');
      const guide = readFileSync(guidePath, 'utf8');
      console.log(guide);
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Guide not found:'), error.message);
      console.log(chalk.yellow('\nVisit: https://redis.io/docs/getting-started/'));
      process.exit(1);
    }
  });

program.parse();
