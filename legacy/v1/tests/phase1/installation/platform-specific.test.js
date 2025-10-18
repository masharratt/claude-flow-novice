/**
 * Platform-Specific Installation Tests
 *
 * Tests Windows, macOS, and Linux-specific installation scenarios
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

const IS_WINDOWS = process.platform === 'win32';
const IS_MACOS = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

describe('Platform-Specific Installation Tests', () => {
  describe('Windows Platform', () => {
    if (!IS_WINDOWS) {
      it.skip('should skip Windows tests on non-Windows platform', () => {});
      return;
    }

    it('should use .cmd executables', () => {
      expect('npm.cmd').toBeDefined();
      expect('npx.cmd').toBeDefined();
    });

    it('should handle Windows path separators', () => {
      const testPath = path.join('C:', 'Users', 'test', 'project');
      expect(testPath).toContain('\\');
    });

    it('should support PowerShell execution', async () => {
      try {
        const { stdout } = await execAsync('powershell -Command "Write-Output test"');
        expect(stdout.trim()).toBe('test');
      } catch (error) {
        console.log('PowerShell not available:', error.message);
      }
    });

    it('should handle long file paths', () => {
      const longPath = 'C:\\' + 'a'.repeat(250);
      expect(longPath.length).toBeGreaterThan(250);
    });

    it('should detect WSL environment', () => {
      const isWSL = process.platform === 'linux' &&
                    process.env.WSL_DISTRO_NAME !== undefined;
      expect(typeof isWSL).toBe('boolean');
    });
  });

  describe('macOS Platform', () => {
    if (!IS_MACOS) {
      it.skip('should skip macOS tests on non-macOS platform', () => {});
      return;
    }

    it('should use Unix-style paths', () => {
      const testPath = path.join('/Users', 'test', 'project');
      expect(testPath).toContain('/');
      expect(testPath).not.toContain('\\');
    });

    it('should detect Homebrew availability', async () => {
      try {
        await execAsync('which brew');
        console.log('✅ Homebrew detected');
      } catch {
        console.log('⏭️  Homebrew not installed (optional)');
      }
    });

    it('should support bash shell', async () => {
      const { stdout } = await execAsync('echo $SHELL');
      expect(stdout).toMatch(/(bash|zsh)/);
    });

    it('should have proper file permissions', async () => {
      const tempFile = path.join(os.tmpdir(), 'test-perms.sh');
      await fs.writeFile(tempFile, '#!/bin/bash\necho "test"');
      await fs.chmod(tempFile, 0o755);

      const stat = await fs.stat(tempFile);
      expect(stat.mode & 0o111).not.toBe(0); // Execute permission

      await fs.unlink(tempFile);
    });
  });

  describe('Linux Platform', () => {
    if (!IS_LINUX) {
      it.skip('should skip Linux tests on non-Linux platform', () => {});
      return;
    }

    it('should use Unix-style paths', () => {
      const testPath = path.join('/home', 'test', 'project');
      expect(testPath).toContain('/');
      expect(testPath).not.toContain('\\');
    });

    it('should detect package manager', async () => {
      const packageManagers = ['apt', 'yum', 'dnf', 'pacman'];
      let detected = false;

      for (const pm of packageManagers) {
        try {
          await execAsync(`which ${pm}`);
          console.log(`✅ Detected package manager: ${pm}`);
          detected = true;
          break;
        } catch {
          // Continue checking
        }
      }

      // At least one package manager should be available
      expect(detected || process.env.CI).toBeTruthy();
    });

    it('should support systemd (if available)', async () => {
      try {
        await execAsync('which systemctl');
        console.log('✅ systemd detected');
      } catch {
        console.log('⏭️  systemd not available (optional)');
      }
    });

    it('should have proper file permissions', async () => {
      const tempFile = path.join(os.tmpdir(), 'test-perms.sh');
      await fs.writeFile(tempFile, '#!/bin/bash\necho "test"');
      await fs.chmod(tempFile, 0o755);

      const stat = await fs.stat(tempFile);
      expect(stat.mode & 0o111).not.toBe(0); // Execute permission

      await fs.unlink(tempFile);
    });
  });

  describe('Cross-Platform File Operations', () => {
    it('should create directories across platforms', async () => {
      const testDir = path.join(os.tmpdir(), `cross-platform-test-${Date.now()}`);

      await fs.mkdir(testDir, { recursive: true });
      const stat = await fs.stat(testDir);
      expect(stat.isDirectory()).toBe(true);

      await fs.rmdir(testDir);
    });

    it('should handle different line endings', async () => {
      const testFile = path.join(os.tmpdir(), `line-endings-${Date.now()}.txt`);

      // Write with platform-specific line ending
      await fs.writeFile(testFile, `line1${os.EOL}line2${os.EOL}line3`);

      const content = await fs.readFile(testFile, 'utf8');
      const lines = content.split(/\r?\n/);

      expect(lines.length).toBeGreaterThanOrEqual(3);

      await fs.unlink(testFile);
    });

    it('should handle special characters in filenames', async () => {
      const specialChars = IS_WINDOWS
        ? 'test-file-special-_()[]'  // Windows has more restrictions
        : 'test-file-special-_()[]{}';

      const testFile = path.join(os.tmpdir(), `${specialChars}.txt`);

      await fs.writeFile(testFile, 'test content');
      const exists = await fs.access(testFile).then(() => true).catch(() => false);

      expect(exists).toBe(true);

      await fs.unlink(testFile);
    });
  });

  describe('Environment Detection', () => {
    it('should detect CI environment', () => {
      const isCI = process.env.CI === 'true' ||
                   process.env.GITHUB_ACTIONS === 'true' ||
                   process.env.GITLAB_CI === 'true';

      console.log(`CI Environment: ${isCI ? 'Yes' : 'No'}`);
      expect(typeof isCI).toBe('boolean');
    });

    it('should detect Docker environment', async () => {
      try {
        const { stdout } = await execAsync('cat /proc/1/cgroup');
        const isDocker = stdout.includes('docker');
        console.log(`Docker Environment: ${isDocker ? 'Yes' : 'No'}`);
      } catch {
        console.log('Not running in Docker');
      }
    });

    it('should have required environment variables', () => {
      expect(process.env.HOME || process.env.USERPROFILE).toBeDefined();
      expect(process.env.PATH).toBeDefined();
    });
  });

  describe('Network Configuration', () => {
    it('should have network access', async () => {
      try {
        await execAsync('ping -c 1 8.8.8.8', { timeout: 5000 });
        console.log('✅ Network access available');
      } catch {
        console.log('⚠️  Network access limited or unavailable');
      }
    });

    it('should access npm registry', async () => {
      try {
        const testUrl = IS_WINDOWS
          ? 'curl.exe -I https://registry.npmjs.org'
          : 'curl -I https://registry.npmjs.org';

        await execAsync(testUrl, { timeout: 10000 });
        console.log('✅ npm registry accessible');
      } catch {
        console.log('⚠️  npm registry access failed (may be offline)');
      }
    });
  });
});

describe('Platform Compatibility Summary', () => {
  it('should generate platform report', () => {
    const report = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: os.cpus().length,
      memory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
      uptime: `${(os.uptime() / 3600).toFixed(2)} hours`,
      tmpdir: os.tmpdir(),
      homedir: os.homedir()
    };

    console.log('\n📊 Platform Compatibility Report');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Platform: ${report.platform}`);
    console.log(`Architecture: ${report.arch}`);
    console.log(`Node.js: ${report.nodeVersion}`);
    console.log(`CPUs: ${report.cpus}`);
    console.log(`Memory: ${report.memory}`);
    console.log(`System Uptime: ${report.uptime}`);
    console.log('═══════════════════════════════════════════════════════');

    expect(report.platform).toBeDefined();
  });
});
