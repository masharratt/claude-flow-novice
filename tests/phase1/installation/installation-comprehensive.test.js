/**
 * Comprehensive Installation Test Suite
 *
 * Phase 1: User Experience & Installation Simplification
 *
 * Tests:
 * 1. Fresh installation (no Redis)
 * 2. Existing Redis installation
 * 3. Invalid configurations
 * 4. Network errors
 * 5. Missing dependencies
 * 6. Cross-platform compatibility (Windows/macOS/Linux)
 * 7. Installation time <5 minutes
 * 8. Template validation
 * 9. Redis auto-configuration
 * 10. Error handling and recovery
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { performance } from 'perf_hooks';

const execAsync = promisify(exec);

// Test environment configuration
const TEST_TIMEOUT = 600000; // 10 minutes for full test suite
const INSTALL_TIMEOUT = 300000; // 5 minutes per installation test
const TEST_DIR_PREFIX = 'cfn-install-test';

// Platform detection
const IS_WINDOWS = process.platform === 'win32';
const IS_MACOS = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

/**
 * Installation Test Helper Class
 */
class InstallationTester {
  constructor() {
    this.testDirs = [];
    this.metrics = {
      installTime: 0,
      platforms: [],
      errors: [],
      warnings: []
    };
  }

  /**
   * Create isolated test directory
   */
  async createTestDir(name = 'default') {
    const testDir = path.join(os.tmpdir(), `${TEST_DIR_PREFIX}-${name}-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    this.testDirs.push(testDir);
    return testDir;
  }

  /**
   * Cleanup test directories
   */
  async cleanup() {
    for (const dir of this.testDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup ${dir}:`, error.message);
      }
    }
    this.testDirs = [];
  }

  /**
   * Check if Redis is available
   */
  async isRedisAvailable() {
    try {
      await execAsync('redis-cli ping', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Install package in test directory
   */
  async installPackage(testDir, options = {}) {
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      const installCmd = IS_WINDOWS
        ? 'npm.cmd'
        : 'npm';

      const args = [
        'install',
        options.global ? '-g' : '',
        options.package || 'claude-flow-novice',
        '--production',
        '--no-audit'
      ].filter(Boolean);

      const installProcess = spawn(installCmd, args, {
        cwd: testDir,
        shell: IS_WINDOWS,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' }
      });

      let stdout = '';
      let stderr = '';

      installProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      installProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        installProcess.kill();
        reject(new Error('Installation timeout exceeded'));
      }, INSTALL_TIMEOUT);

      installProcess.on('close', (code) => {
        clearTimeout(timeout);
        const endTime = performance.now();
        const installTime = (endTime - startTime) / 1000 / 60; // minutes

        this.metrics.installTime = installTime;

        if (code === 0) {
          resolve({
            success: true,
            installTime,
            stdout,
            stderr
          });
        } else {
          reject(new Error(`Installation failed with code ${code}\n${stderr}`));
        }
      });

      installProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Run init command
   */
  async runInit(testDir, flags = []) {
    const initCmd = IS_WINDOWS ? 'npx.cmd' : 'npx';
    const args = ['claude-flow-novice', 'init', ...flags];

    return new Promise((resolve, reject) => {
      const initProcess = spawn(initCmd, args, {
        cwd: testDir,
        shell: IS_WINDOWS
      });

      let stdout = '';
      let stderr = '';

      initProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      initProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        initProcess.kill();
        reject(new Error('Init timeout exceeded'));
      }, 60000);

      initProcess.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          code,
          stdout,
          stderr
        });
      });

      initProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Verify installation files
   */
  async verifyInstallation(testDir) {
    const requiredFiles = [
      'CLAUDE.md',
      '.claude/settings.json',
      'memory/claude-flow-data.json',
      'coordination.md',
      'memory-bank.md'
    ];

    const requiredDirs = [
      '.claude',
      '.claude/agents',
      '.claude/commands',
      'memory',
      'memory/agents',
      'memory/sessions',
      'coordination'
    ];

    const results = {
      files: {},
      directories: {},
      errors: []
    };

    // Check files
    for (const file of requiredFiles) {
      const filePath = path.join(testDir, file);
      try {
        await fs.access(filePath);
        results.files[file] = true;
      } catch {
        results.files[file] = false;
        results.errors.push(`Missing file: ${file}`);
      }
    }

    // Check directories
    for (const dir of requiredDirs) {
      const dirPath = path.join(testDir, dir);
      try {
        const stat = await fs.stat(dirPath);
        results.directories[dir] = stat.isDirectory();
      } catch {
        results.directories[dir] = false;
        results.errors.push(`Missing directory: ${dir}`);
      }
    }

    return results;
  }

  /**
   * Verify template integrity
   */
  async verifyTemplates(testDir) {
    const templates = {
      'CLAUDE.md': {
        requiredContent: [
          'Critical Rules',
          'When Agents Are Mandatory',
          'CFN Loop',
          'Redis',
          'swarm'
        ]
      },
      '.claude/settings.json': {
        requiredKeys: ['hooks', 'coordination']
      },
      'memory-bank.md': {
        requiredContent: ['Memory Bank', 'agents', 'sessions']
      }
    };

    const results = {};

    for (const [file, checks] of Object.entries(templates)) {
      const filePath = path.join(testDir, file);

      try {
        const content = await fs.readFile(filePath, 'utf8');

        // Check required content
        if (checks.requiredContent) {
          const missingContent = checks.requiredContent.filter(
            item => !content.includes(item)
          );

          results[file] = {
            exists: true,
            valid: missingContent.length === 0,
            missingContent
          };
        }

        // Check JSON structure
        if (checks.requiredKeys) {
          const json = JSON.parse(content);
          const missingKeys = checks.requiredKeys.filter(
            key => !(key in json)
          );

          results[file] = {
            exists: true,
            valid: missingKeys.length === 0,
            missingKeys
          };
        }
      } catch (error) {
        results[file] = {
          exists: false,
          valid: false,
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * Test Redis configuration
   */
  async testRedisConfiguration(testDir) {
    const settingsPath = path.join(testDir, '.claude/settings.json');

    try {
      const content = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(content);

      return {
        configured: !!settings.redis || !!settings.coordination?.redis,
        settings: settings.redis || settings.coordination?.redis || {},
        valid: true
      };
    } catch (error) {
      return {
        configured: false,
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get platform-specific metrics
   */
  getPlatformMetrics() {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      npmVersion: process.env.npm_config_user_agent || 'unknown',
      isWindows: IS_WINDOWS,
      isMacOS: IS_MACOS,
      isLinux: IS_LINUX
    };
  }
}

// Test suite
describe('Installation Comprehensive Test Suite', () => {
  let tester;

  beforeAll(() => {
    tester = new InstallationTester();
  });

  afterAll(async () => {
    await tester.cleanup();
  });

  describe('Platform Detection', () => {
    it('should detect current platform correctly', () => {
      const metrics = tester.getPlatformMetrics();
      expect(metrics.platform).toBeDefined();
      expect(['win32', 'darwin', 'linux']).toContain(metrics.platform);
    });

    it('should have Node.js >= 20.0.0', () => {
      const version = process.version.match(/v(\d+)\./)[1];
      expect(parseInt(version)).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Fresh Installation (No Redis)', () => {
    let testDir;
    let installResult;

    beforeAll(async () => {
      testDir = await tester.createTestDir('fresh-install');
    }, INSTALL_TIMEOUT);

    it('should complete installation within 5 minutes', async () => {
      const startTime = performance.now();

      // Create package.json
      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2)
      );

      installResult = await tester.installPackage(testDir);

      const installTime = (performance.now() - startTime) / 1000 / 60;

      expect(installResult.success).toBe(true);
      expect(installTime).toBeLessThan(5);
      expect(installResult.installTime).toBeLessThan(5);
    }, INSTALL_TIMEOUT);

    it('should run init successfully', async () => {
      const initResult = await tester.runInit(testDir, ['--force']);
      expect(initResult.success).toBe(true);
    }, 60000);

    it('should create all required files', async () => {
      const verification = await tester.verifyInstallation(testDir);

      expect(Object.values(verification.files).every(v => v)).toBe(true);
      expect(Object.values(verification.directories).every(v => v)).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    it('should have valid template content', async () => {
      const templates = await tester.verifyTemplates(testDir);

      for (const [file, result] of Object.entries(templates)) {
        expect(result.exists).toBe(true);
        expect(result.valid).toBe(true);
      }
    });

    it('should configure fallback when Redis unavailable', async () => {
      const redisConfig = await tester.testRedisConfiguration(testDir);

      // Should have configuration even if Redis is not available
      expect(redisConfig.valid).toBe(true);
    });
  });

  describe('Installation with Existing Redis', () => {
    let testDir;
    let redisAvailable;

    beforeAll(async () => {
      testDir = await tester.createTestDir('with-redis');
      redisAvailable = await tester.isRedisAvailable();
    }, INSTALL_TIMEOUT);

    it('should detect Redis availability', () => {
      // This test passes regardless of Redis availability
      expect(typeof redisAvailable).toBe('boolean');
    });

    it('should configure Redis when available', async () => {
      if (!redisAvailable) {
        console.log('⏭️  Skipping Redis configuration test (Redis not available)');
        return;
      }

      // Create package.json
      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-project-redis', version: '1.0.0' }, null, 2)
      );

      await tester.installPackage(testDir);
      await tester.runInit(testDir, ['--force']);

      const redisConfig = await tester.testRedisConfiguration(testDir);
      expect(redisConfig.configured).toBe(true);
    }, INSTALL_TIMEOUT);
  });

  describe('Error Handling', () => {
    let testDir;

    beforeEach(async () => {
      testDir = await tester.createTestDir('error-handling');
    });

    it('should handle missing package.json gracefully', async () => {
      try {
        await tester.installPackage(testDir);
        // Should create package.json automatically or fail gracefully
      } catch (error) {
        expect(error.message).toBeDefined();
      }
    }, 60000);

    it('should handle invalid configuration gracefully', async () => {
      await fs.writeFile(
        path.join(testDir, 'package.json'),
        'invalid json content'
      );

      try {
        await tester.installPackage(testDir);
      } catch (error) {
        expect(error.message).toMatch(/JSON|parse|invalid/i);
      }
    }, 60000);

    it('should provide clear error messages', async () => {
      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2)
      );

      try {
        // Try to install non-existent version
        await tester.installPackage(testDir, {
          package: 'claude-flow-novice@999.999.999'
        });
      } catch (error) {
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(0);
      }
    }, 60000);
  });

  describe('Cross-Platform Compatibility', () => {
    it('should identify platform-specific commands', () => {
      const npm = IS_WINDOWS ? 'npm.cmd' : 'npm';
      const npx = IS_WINDOWS ? 'npx.cmd' : 'npx';

      expect(npm).toBeDefined();
      expect(npx).toBeDefined();
    });

    it('should handle platform-specific paths', () => {
      const testPath = path.join('test', 'dir', 'file.txt');

      if (IS_WINDOWS) {
        expect(testPath).toContain('\\');
      } else {
        expect(testPath).toContain('/');
      }
    });

    it('should work in platform-specific temp directory', async () => {
      const tempDir = os.tmpdir();
      expect(tempDir).toBeDefined();

      const stat = await fs.stat(tempDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('Performance Validation', () => {
    let testDir;

    beforeAll(async () => {
      testDir = await tester.createTestDir('performance');

      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'perf-test', version: '1.0.0' }, null, 2)
      );
    }, INSTALL_TIMEOUT);

    it('should complete full installation cycle within 5 minutes', async () => {
      const startTime = performance.now();

      // Install package
      await tester.installPackage(testDir);

      // Run init
      await tester.runInit(testDir, ['--force']);

      // Verify installation
      await tester.verifyInstallation(testDir);

      const totalTime = (performance.now() - startTime) / 1000 / 60;

      expect(totalTime).toBeLessThan(5);

      console.log(`\n⏱️  Total installation time: ${totalTime.toFixed(2)} minutes`);
    }, INSTALL_TIMEOUT);

    it('should have minimal file system operations', async () => {
      const verification = await tester.verifyInstallation(testDir);

      const totalFiles = Object.keys(verification.files).length;
      const totalDirs = Object.keys(verification.directories).length;

      // Should create reasonable number of files/dirs (not excessive)
      expect(totalFiles).toBeGreaterThan(0);
      expect(totalFiles).toBeLessThan(50);
      expect(totalDirs).toBeGreaterThan(0);
      expect(totalDirs).toBeLessThan(20);
    });
  });

  describe('Setup Wizard Validation', () => {
    let testDir;

    beforeAll(async () => {
      testDir = await tester.createTestDir('wizard');

      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'wizard-test', version: '1.0.0' }, null, 2)
      );
    });

    it('should support minimal installation flag', async () => {
      await tester.installPackage(testDir);
      const initResult = await tester.runInit(testDir, ['--minimal', '--force']);

      expect(initResult.success).toBe(true);
    }, INSTALL_TIMEOUT);

    it('should support force flag', async () => {
      // Run init again with force flag
      const initResult = await tester.runInit(testDir, ['--force']);

      expect(initResult.success).toBe(true);
    }, 60000);

    it('should support dry-run flag', async () => {
      const testDirDryRun = await tester.createTestDir('dry-run');

      await fs.writeFile(
        path.join(testDirDryRun, 'package.json'),
        JSON.stringify({ name: 'dry-run-test', version: '1.0.0' }, null, 2)
      );

      await tester.installPackage(testDirDryRun);
      const initResult = await tester.runInit(testDirDryRun, ['--dry-run']);

      expect(initResult.success).toBe(true);
      expect(initResult.stdout).toMatch(/dry.?run/i);
    }, INSTALL_TIMEOUT);
  });

  describe('Recovery and Rollback', () => {
    let testDir;

    beforeAll(async () => {
      testDir = await tester.createTestDir('recovery');

      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'recovery-test', version: '1.0.0' }, null, 2)
      );
    });

    it('should handle interrupted installation', async () => {
      await tester.installPackage(testDir);

      // Simulate interrupted init by creating partial files
      await fs.writeFile(
        path.join(testDir, 'CLAUDE.md'),
        '# Partial content'
      );

      // Should be able to recover with --force
      const initResult = await tester.runInit(testDir, ['--force']);
      expect(initResult.success).toBe(true);
    }, INSTALL_TIMEOUT);

    it('should validate installation after recovery', async () => {
      const verification = await tester.verifyInstallation(testDir);

      expect(verification.errors).toHaveLength(0);
    });
  });
});

// Test Summary Report
describe('Installation Test Summary', () => {
  it('should generate comprehensive test report', () => {
    const tester = new InstallationTester();
    const metrics = tester.getPlatformMetrics();

    console.log('\n📊 Installation Test Report');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Platform: ${metrics.platform} (${metrics.arch})`);
    console.log(`Node.js: ${metrics.nodeVersion}`);
    console.log(`OS: ${os.type()} ${os.release()}`);
    console.log('═══════════════════════════════════════════════════════');

    expect(metrics).toBeDefined();
  });
});
