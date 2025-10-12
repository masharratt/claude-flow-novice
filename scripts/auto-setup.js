#!/usr/bin/env node

/**
 * Automatic Setup Script for Redis & SQLite
 *
 * Runs automatically during npm postinstall
 * - Non-interactive mode with smart defaults
 * - Fails gracefully without breaking installation
 * - Detects existing installations
 * - Platform-specific optimizations
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect if this is CI/npm publish environment
const isCI = process.env.CI === 'true' || process.env.CI === '1';
const isNpmPublish = process.env.npm_lifecycle_event === 'publish' || process.env.npm_lifecycle_event === 'prepublishOnly';
const skipAutoSetup = process.env.SKIP_AUTO_SETUP === 'true' || isCI || isNpmPublish;

// Allow users to opt-out via env var
const userOptOut = process.env.CLAUDE_FLOW_NO_AUTO_SETUP === 'true';

class AutoSetup {
  constructor() {
    this.platform = platform();
    this.homeDir = homedir();
    this.configDir = join(this.homeDir, '.claude-flow-novice', 'config');
    this.logFile = join(this.homeDir, '.claude-flow-novice', 'setup.log');
    this.logs = [];
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    this.logs.push(logEntry);

    if (level === 'error') {
      console.error(`❌ ${message}`);
    } else if (level === 'warn') {
      console.warn(`⚠️  ${message}`);
    } else {
      console.log(`ℹ️  ${message}`);
    }
  }

  async run() {
    // Skip if environment indicates we shouldn't run
    if (skipAutoSetup) {
      this.log('Auto-setup skipped (CI/npm publish environment)', 'info');
      return { success: true, skipped: true, reason: 'ci-environment' };
    }

    if (userOptOut) {
      this.log('Auto-setup disabled by user (CLAUDE_FLOW_NO_AUTO_SETUP=true)', 'info');
      return { success: true, skipped: true, reason: 'user-opt-out' };
    }

    console.log('🚀 Claude Flow Novice - Automatic Setup\n');

    try {
      // Create config directory
      await this.ensureConfigDirectory();

      // Setup SQLite (automatic via better-sqlite3 package)
      const sqliteResult = await this.setupSQLite();

      // Setup Redis (with fallback)
      const redisResult = await this.setupRedis();

      // Sync agent profiles from package
      const agentSyncResult = await this.syncAgentProfiles();

      // Write setup status
      await this.writeSetupStatus({ sqlite: sqliteResult, redis: redisResult, agents: agentSyncResult });

      // Save logs
      await this.saveLogs();

      console.log('\n✅ Automatic setup completed!');
      console.log(`📝 Setup log: ${this.logFile}\n`);

      if (!redisResult.success) {
        console.log('💡 To manually setup Redis later, run:');
        console.log('   npm run redis:setup\n');
      }

      return { success: true, sqlite: sqliteResult, redis: redisResult };

    } catch (error) {
      this.log(`Setup error: ${error.message}`, 'error');
      await this.saveLogs();

      // Don't fail the npm install - just warn
      console.warn('\n⚠️  Automatic setup encountered issues but npm install will continue.');
      console.warn('📝 Run "npm run quick-install" to complete setup manually.\n');

      return { success: false, error: error.message };
    }
  }

  async ensureConfigDirectory() {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
      this.log(`Created config directory: ${this.configDir}`);
    }
  }

  async setupSQLite() {
    this.log('Setting up SQLite...');

    try {
      // SQLite is automatic via better-sqlite3 npm package
      // Just verify it's installed
      const packageJson = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(require('fs').readFileSync(packageJson, 'utf8'));

      if (pkg.dependencies && pkg.dependencies['better-sqlite3']) {
        this.log('SQLite (better-sqlite3) is installed', 'info');

        // Create default database directory
        const dbDir = join(this.homeDir, '.claude-flow-novice', 'data');
        if (!existsSync(dbDir)) {
          mkdirSync(dbDir, { recursive: true });
          this.log(`Created SQLite database directory: ${dbDir}`);
        }

        return {
          success: true,
          version: pkg.dependencies['better-sqlite3'],
          message: 'SQLite ready (better-sqlite3 installed)'
        };
      } else {
        this.log('SQLite package not found', 'warn');
        return { success: false, message: 'better-sqlite3 not in dependencies' };
      }
    } catch (error) {
      this.log(`SQLite setup error: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  async setupRedis() {
    this.log('Checking Redis installation...');

    try {
      // Check if Redis is already installed and running
      try {
        execSync('redis-cli ping', { stdio: 'pipe', timeout: 5000 });
        this.log('Redis is already installed and running!', 'info');

        const version = execSync('redis-server --version', { encoding: 'utf8' }).trim();
        return {
          success: true,
          version,
          status: 'already-installed',
          message: 'Redis detected and running'
        };
      } catch {
        // Redis not running or not installed
      }

      // Check if Redis is installed but not running
      try {
        const version = execSync('redis-server --version', { encoding: 'utf8', timeout: 5000 }).trim();
        this.log('Redis installed but not running', 'info');

        // Try to start it
        try {
          if (this.platform === 'darwin') {
            execSync('brew services start redis', { stdio: 'pipe', timeout: 10000 });
          } else if (this.platform === 'linux') {
            execSync('sudo systemctl start redis', { stdio: 'pipe', timeout: 10000 });
          } else if (this.platform === 'win32') {
            execSync('net start Redis', { stdio: 'pipe', timeout: 10000 });
          }

          this.log('Redis started successfully!', 'info');
          return { success: true, version, status: 'started', message: 'Redis started' };
        } catch (startError) {
          this.log('Could not start Redis automatically', 'warn');
          return {
            success: false,
            version,
            status: 'installed-not-running',
            message: 'Redis installed but failed to start automatically',
            manualStart: true
          };
        }
      } catch {
        // Redis not installed at all
      }

      // Redis not installed - provide installation instructions
      this.log('Redis not found - installation required', 'warn');

      const instructions = this.getRedisInstallInstructions();

      return {
        success: false,
        status: 'not-installed',
        message: 'Redis not installed',
        instructions
      };

    } catch (error) {
      this.log(`Redis check error: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  getRedisInstallInstructions() {
    const instructions = {
      darwin: [
        'Install via Homebrew:',
        '  brew install redis',
        '  brew services start redis'
      ],
      linux: [
        'Install via package manager:',
        '  Ubuntu/Debian: sudo apt-get install redis-server',
        '  CentOS/RHEL: sudo yum install redis',
        '  Start: sudo systemctl start redis'
      ],
      win32: [
        'Install via:',
        '  1. Download Redis from: https://github.com/microsoftarchive/redis/releases',
        '  2. Or use WSL2: wsl --install then install Redis in Ubuntu',
        '  3. Or use Docker: docker run -d -p 6379:6379 redis'
      ]
    };

    return instructions[this.platform] || instructions.linux;
  }

  async writeSetupStatus(results) {
    const statusFile = join(this.configDir, 'setup-status.json');
    const status = {
      timestamp: new Date().toISOString(),
      platform: this.platform,
      autoSetup: true,
      sqlite: results.sqlite,
      redis: results.redis,
      version: this.getPackageVersion()
    };

    writeFileSync(statusFile, JSON.stringify(status, null, 2));
    this.log(`Setup status saved: ${statusFile}`);
  }

  async saveLogs() {
    try {
      const logDir = dirname(this.logFile);
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      writeFileSync(this.logFile, this.logs.join('\n'), 'utf8');
    } catch (error) {
      console.error(`Failed to save logs: ${error.message}`);
    }
  }

  async syncAgentProfiles() {
    this.log('Syncing agent profiles from package...');

    try {
      // Import the agent sync module
      const AgentSync = (await import('./sync-agents.js')).default;

      // Run sync with automatic overwrite
      const syncer = new AgentSync({
        projectRoot: process.cwd(),
        skipBackup: false,  // Create backups of overwritten agents
        verbose: false
      });

      const result = await syncer.sync();

      if (result.success) {
        const { created, overwritten, preserved } = result.stats;
        this.log(`Agent profiles synced: ${created.length} new, ${overwritten.length} updated, ${preserved.length} unchanged`);

        return {
          success: true,
          created: created.length,
          overwritten: overwritten.length,
          preserved: preserved.length,
          backupDir: join(process.cwd(), '.claude', 'agents', '.backup')
        };
      } else {
        this.log(`Agent sync failed: ${result.error}`, 'warn');
        return { success: false, error: result.error };
      }
    } catch (error) {
      this.log(`Agent sync error: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  getPackageVersion() {
    try {
      const packageJson = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(require('fs').readFileSync(packageJson, 'utf8'));
      return pkg.version;
    } catch {
      return 'unknown';
    }
  }
}

// Run auto-setup if called directly
async function main() {
  const setup = new AutoSetup();
  const result = await setup.run();

  // Exit with 0 even on failure to not break npm install
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default AutoSetup;
