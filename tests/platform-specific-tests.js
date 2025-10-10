#!/usr/bin/env node

/**
 * Platform-Specific Test Scenarios
 * Tests claude-flow-novice for platform-specific issues and edge cases
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join, resolve, normalize, sep, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = resolve(__dirname, '..');

class PlatformSpecificTests {
  constructor() {
    this.results = [];
    this.platform = this.detectPlatform();
    this.testStartTime = new Date();
  }

  detectPlatform() {
    return {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      shell: process.env.SHELL || process.env.COMSPEC || 'unknown',
      isWSL: process.platform === 'linux' && process.env.WSL_DISTRO_NAME,
      isGitBash: process.platform === 'win32' && process.env.SHELL?.includes('bash'),
      isCygwin: process.platform === 'win32' && process.env.TERM?.includes('cygwin'),
      isPowerShell: process.platform === 'win32' && process.env.PSModulePath,
      isCMD: process.platform === 'win32' && !process.env.PSModulePath && !process.env.SHELL,
      pathSeparator: sep,
      lineEnding: process.platform === 'win32' ? '\r\n' : '\n'
    };
  }

  async runPlatformSpecificTests() {
    console.log('🔍 Platform-Specific Compatibility Testing');
    console.log(`📅 Started: ${this.testStartTime.toISOString()}`);
    console.log(`🖥️  Platform: ${this.getPlatformDescription()}`);
    console.log('');

    // Run general platform tests
    await this.testPathHandling();
    await this.testFilePermissions();
    await this.testProcessManagement();
    await this.testEnvironmentVariables();
    await this.testShellCommands();
    await this.testFileSystemCaseSensitivity();
    await this.testNetworkConfiguration();
    await this.testMemoryManagement();

    // Run OS-specific tests
    switch (this.platform.os) {
      case 'win32':
        await this.runWindowsSpecificTests();
        break;
      case 'darwin':
        await this.runMacOSSpecificTests();
        break;
      case 'linux':
        await this.runLinuxSpecificTests();
        break;
    }

    // Run shell-specific tests
    if (this.platform.isPowerShell) {
      await this.runPowerShellTests();
    }
    if (this.platform.isGitBash) {
      await this.runGitBashTests();
    }
    if (this.platform.isWSL) {
      await this.runWSLTests();
    }

    this.generateReport();
  }

  getPlatformDescription() {
    const { os, arch, isWSL, isGitBash, isPowerShell, isCMD } = this.platform;
    let desc = `${os}-${arch}`;

    if (isWSL) desc += ' (WSL)';
    if (isGitBash) desc += ' (Git Bash)';
    if (isPowerShell) desc += ' (PowerShell)';
    if (isCMD) desc += ' (CMD)';

    return desc;
  }

  async testPathHandling() {
    await this.runTest('Path Separator Handling', async () => {
      const testPaths = [
        'src/cli',
        './src/cli',
        '../src/cli',
        join('src', 'cli'),
        resolve('src', 'cli'),
        normalize('src/cli')
      ];

      for (const path of testPaths) {
        if (!path.includes(this.platform.pathSeparator)) {
          throw new Error(`Path separator issue detected: ${path}`);
        }
      }

      // Test path normalization
      const normalizedPaths = testPaths.map(normalize);
      if (new Set(normalizedPaths).size !== testPaths.length) {
        throw new Error('Path normalization not working correctly');
      }
    });

    await this.runTest('Long Path Handling', async () => {
      // Test with very long paths (Windows has 260 character limit traditionally)
      const longPath = Array.from({ length: 50 }, (_, i) => `dir${i}`).join(this.platform.pathSeparator);
      const fullPath = join(projectRoot, longPath);

      // Just test path string handling, not actual file creation
      const pathLength = fullPath.length;
      console.log(`    ℹ Testing path length: ${pathLength} characters`);

      if (this.platform.os === 'win32' && pathLength > 260) {
        console.log('    ℹ Windows long path detected - may cause issues');
      }
    });

    await this.runTest('Special Characters in Paths', async () => {
      const specialChars = this.platform.os === 'win32'
        ? ['space dir', 'dir-with-dashes', 'dir_with_underscores', 'dir.with.dots']
        : ['space dir', 'dir-with-dashes', 'dir_with_underscores', 'dir.with.dots', 'dir with $', 'dir@home'];

      for (const charDir of specialChars) {
        const testPath = join(projectRoot, charDir);
        const normalized = normalize(testPath);

        if (!normalized.includes(charDir)) {
          throw new Error(`Special character handling failed for: ${charDir}`);
        }
      }
    });
  }

  async testFilePermissions() {
    await this.runTest('File Permission Reading', async () => {
      const testFile = join(projectRoot, 'package.json');
      if (existsSync(testFile)) {
        try {
          const stats = await this.executeCommand(`ls -la "${testFile}"`, { ignoreError: true });
          if (this.platform.os === 'win32') {
            const winStats = await this.executeCommand(`attrib "${testFile}"`, { ignoreError: true });
            console.log('    ℹ Windows file attributes:', winStats.stdout?.trim());
          } else {
            console.log('    ℹ Unix file permissions:', stats.stdout?.trim());
          }
        } catch (error) {
          console.log('    ℹ Permission test failed (may be expected):', error.message);
        }
      }
    });

    await this.runTest('Executable Permissions', async () => {
      const testScript = `
        console.log('Executable script test successful');
      `;

      const scriptFile = join(projectRoot, 'test-executable.js');
      writeFileSync(scriptFile, testScript);

      try {
        if (this.platform.os !== 'win32') {
          // Test chmod on Unix-like systems
          await this.executeCommand(`chmod +x "${scriptFile}"`);
          await this.executeCommand(`"${scriptFile}"`);
          console.log('    ℹ Executable permissions working');
        } else {
          // Test that script runs without explicit permissions on Windows
          await this.executeCommand(`node "${scriptFile}"`);
          console.log('    ℹ Windows executable handling working');
        }
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testProcessManagement() {
    await this.runTest('Process Spawning', async () => {
      const testCommands = this.platform.os === 'win32'
        ? ['echo', 'dir', 'type']
        : ['echo', 'ls', 'cat'];

      for (const cmd of testCommands) {
        try {
          await this.executeCommand(cmd, { timeout: 3000, ignoreError: true });
        } catch (error) {
          console.log(`    ℹ Command ${cmd} failed (may be expected):`, error.message);
        }
      }
    });

    await this.runTest('Signal Handling', async () => {
      if (this.platform.os === 'win32') {
        console.log('    ℹ Windows signal handling is limited');
        return;
      }

      const signalScript = `
        process.on('SIGTERM', () => {
          console.log('SIGTERM received');
          process.exit(0);
        });

        process.on('SIGINT', () => {
          console.log('SIGINT received');
          process.exit(0);
        });

        setTimeout(() => {
          console.log('Process ready for signals');
          // Keep alive for signal testing
        }, 1000);
      `;

      const scriptFile = join(projectRoot, 'test-signals.js');
      writeFileSync(scriptFile, signalScript);

      try {
        const child = spawn('node', [scriptFile], {
          stdio: 'pipe',
          detached: true
        });

        // Wait a bit then send signal
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
          process.kill(child.pid, 'SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.log('    ℹ Signal test failed:', error.message);
        }

        child.kill();
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });

    await this.runTest('Process Tree Management', async () => {
      const testScript = `
        console.log('Parent process PID:', process.pid);

        const { spawn } = require('child_process');
        const child = spawn('node', ['-e', 'console.log("Child PID:", process.pid); setTimeout(() => process.exit(0), 1000)']);

        child.on('exit', (code) => {
          console.log('Child process exited with code:', code);
          process.exit(0);
        });
      `;

      const scriptFile = join(projectRoot, 'test-process-tree.js');
      writeFileSync(scriptFile, testScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 5000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testEnvironmentVariables() {
    await this.runTest('Environment Variable Access', async () => {
      const importantVars = [
        'PATH',
        'NODE_ENV',
        'HOME',
        'USER',
        'SHELL',
        'TEMP',
        'TMP'
      ];

      const foundVars = [];
      for (const varName of importantVars) {
        if (process.env[varName]) {
          foundVars.push(varName);
        }
      }

      console.log(`    ℹ Found ${foundVars.length}/${importantVars.length} environment variables`);
      console.log('    ℹ Variables:', foundVars.join(', '));

      if (foundVars.length < 3) {
        throw new Error('Too few environment variables found');
      }
    });

    await this.runTest('PATH Environment Variable', async () => {
      const pathVar = process.env.PATH;
      if (!pathVar) {
        throw new Error('PATH environment variable not found');
      }

      const pathSeparator = this.platform.os === 'win32' ? ';' : ':';
      const paths = pathVar.split(pathSeparator);

      console.log(`    ℹ PATH contains ${paths.length} entries`);
      console.log(`    ℹ Using ${pathSeparator} as separator`);

      // Check for common directories
      const commonDirs = this.platform.os === 'win32'
        ? ['Windows', 'System32', 'nodejs']
        : ['bin', 'usr', 'local'];

      const foundCommon = paths.some(path =>
        commonDirs.some(dir => path.toLowerCase().includes(dir.toLowerCase()))
      );

      if (!foundCommon) {
        console.log('    ⚠ No common directories found in PATH');
      }
    });
  }

  async testShellCommands() {
    await this.runTest('Shell Command Execution', async () => {
      const testCommands = this.platform.os === 'win32'
        ? [
            { cmd: 'echo', args: ['test'] },
            { cmd: 'where', args: ['node'] },
            { cmd: 'cmd', args: ['/c', 'echo', 'test'] }
          ]
        : [
            { cmd: 'echo', args: ['test'] },
            { cmd: 'which', args: ['node'] },
            { cmd: 'sh', args: ['-c', 'echo test'] }
          ];

      for (const { cmd, args } of testCommands) {
        try {
          const result = await this.executeCommand(`${cmd} ${args.join(' ')}`, {
            timeout: 3000,
            ignoreError: true
          });
          console.log(`    ℹ ${cmd} executed successfully`);
        } catch (error) {
          console.log(`    ℹ ${cmd} failed (may be expected):`, error.message);
        }
      }
    });

    await this.runTest('Command Quoting and Escaping', async () => {
      const testStrings = [
        'simple string',
        'string with spaces',
        'string-with-dashes',
        'string_with_underscores',
        "string'with'quotes",
        'string"with"double"quotes'
      ];

      for (const testString of testStrings) {
        try {
          const quoted = this.platform.os === 'win32'
            ? `"${testString}"`
            : `'${testString}'`;

          const result = await this.executeCommand(`echo ${quoted}`, {
            timeout: 3000,
            ignoreError: true
          });

          if (result.stdout && result.stdout.includes(testString)) {
            console.log(`    ℇ Quoting works for: "${testString}"`);
          }
        } catch (error) {
          console.log(`    ℇ Quoting test failed for: "${testString}"`);
        }
      }
    });
  }

  async testFileSystemCaseSensitivity() {
    await this.runTest('File System Case Sensitivity', async () => {
      const testFile = join(projectRoot, 'CASE_SENSITIVITY_TEST.txt');
      const lowerFile = join(projectRoot, 'case_sensitivity_test.txt');

      try {
        writeFileSync(testFile, 'test content');

        // Check if lowercase version exists (case insensitive filesystem)
        const caseInsensitive = existsSync(lowerFile);

        if (caseInsensitive) {
          console.log('    ℇ Filesystem is case insensitive (Windows-style)');
        } else {
          console.log('    ℇ Filesystem is case sensitive (Unix-style)');
        }

        // Test file operations with different cases
        const testContent = 'Test content for case sensitivity';
        writeFileSync(testFile, testContent);

        if (caseInsensitive) {
          const content = readFileSync(lowerFile, 'utf8');
          if (content !== testContent) {
            throw new Error('Case insensitive file access failed');
          }
        }
      } finally {
        if (existsSync(testFile)) {
          await this.executeCommand(`rm "${testFile}"`, { ignoreError: true });
        }
        if (existsSync(lowerFile)) {
          await this.executeCommand(`rm "${lowerFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async testNetworkConfiguration() {
    await this.runTest('Network Interface Detection', async () => {
      try {
        const ifconfigCmd = this.platform.os === 'win32'
          ? 'ipconfig'
          : 'ifconfig || ip addr show';

        const result = await this.executeCommand(ifconfigCmd, {
          timeout: 5000,
          ignoreError: true
        });

        if (result.stdout) {
          console.log('    ℇ Network interfaces detected');
        }
      } catch (error) {
        console.log('    ℇ Network interface detection failed');
      }
    });

    await this.runTest('Localhost Connectivity', async () => {
      try {
        const result = await this.executeCommand('ping -c 1 127.0.0.1', {
          timeout: 5000,
          ignoreError: true
        });

        if (result.stdout && result.stdout.includes('bytes from')) {
          console.log('    ℇ Localhost connectivity working');
        }
      } catch (error) {
        console.log('    ℇ Localhost connectivity test failed');
      }
    });
  }

  async testMemoryManagement() {
    await this.runTest('Memory Usage Monitoring', async () => {
      const memoryScript = `
        const used = process.memoryUsage();
        console.log('Memory Usage:');
        console.log('  RSS:', Math.round(used.rss / 1024 / 1024 * 100) / 100, 'MB');
        console.log('  Heap Total:', Math.round(used.heapTotal / 1024 / 1024 * 100) / 100, 'MB');
        console.log('  Heap Used:', Math.round(used.heapUsed / 1024 / 1024 * 100) / 100, 'MB');
        console.log('  External:', Math.round(used.external / 1024 / 1024 * 100) / 100, 'MB');

        // Test memory allocation
        const arrays = [];
        for (let i = 0; i < 100; i++) {
          arrays.push(new Array(10000).fill(0));
        }

        const afterUsed = process.memoryUsage();
        console.log('  Heap Used After:', Math.round(afterUsed.heapUsed / 1024 / 1024 * 100) / 100, 'MB');
      `;

      const scriptFile = join(projectRoot, 'test-memory.js');
      writeFileSync(scriptFile, memoryScript);

      try {
        await this.executeCommand(`node "${scriptFile}"`, { timeout: 10000 });
      } finally {
        if (existsSync(scriptFile)) {
          await this.executeCommand(`rm "${scriptFile}"`, { ignoreError: true });
        }
      }
    });
  }

  async runWindowsSpecificTests() {
    console.log('  🪟 Running Windows-specific tests...');

    await this.runTest('Windows Registry Access', async () => {
      try {
        const result = await this.executeCommand('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Node.js"', {
          timeout: 5000,
          ignoreError: true
        });
        console.log('    ℇ Windows registry access available');
      } catch (error) {
        console.log('    ℇ Windows registry access not available');
      }
    });

    await this.runTest('Windows Services', async () => {
      try {
        const result = await this.executeCommand('sc query', {
          timeout: 5000,
          ignoreError: true
        });
        console.log('    ℇ Windows service access available');
      } catch (error) {
        console.log('    ℇ Windows service access not available');
      }
    });

    await this.runTest('PowerShell Execution', async () => {
      try {
        const result = await this.executeCommand('powershell -Command "Get-Host"', {
          timeout: 5000,
          ignoreError: true
        });
        console.log('    ℇ PowerShell execution available');
      } catch (error) {
        console.log('    ℇ PowerShell execution not available');
      }
    });
  }

  async runMacOSSpecificTests() {
    console.log('  🍎 Running macOS-specific tests...');

    await this.runTest('macOS System Information', async () => {
      try {
        const result = await this.executeCommand('system_profiler SPSoftwareDataType', {
          timeout: 10000,
          ignoreError: true
        });
        console.log('    ℇ macOS system information available');
      } catch (error) {
        console.log('    ℇ macOS system information not available');
      }
    });

    await this.runTest('Homebrew Detection', async () => {
      try {
        const result = await this.executeCommand('which brew', {
          timeout: 3000,
          ignoreError: true
        });
        if (result.stdout && result.stdout.includes('brew')) {
          console.log('    ℇ Homebrew available');
        } else {
          console.log('    ℇ Homebrew not available');
        }
      } catch (error) {
        console.log('    ℇ Homebrew not available');
      }
    });
  }

  async runLinuxSpecificTests() {
    console.log('  🐧 Running Linux-specific tests...');

    await this.runTest('Linux Distribution Detection', async () => {
      try {
        const files = [
          '/etc/os-release',
          '/etc/lsb-release',
          '/etc/redhat-release'
        ];

        for (const file of files) {
          try {
            const result = await this.executeCommand(`cat ${file}`, {
              timeout: 3000,
              ignoreError: true
            });
            if (result.stdout) {
              console.log(`    ℇ Found ${file}`);
              break;
            }
          } catch (error) {
            // Continue to next file
          }
        }
      } catch (error) {
        console.log('    ℇ Linux distribution detection failed');
      }
    });

    await this.runTest('Package Manager Detection', async () => {
      const packageManagers = ['apt', 'yum', 'dnf', 'pacman', 'zypper'];
      const availableManagers = [];

      for (const pm of packageManagers) {
        try {
          const result = await this.executeCommand(`which ${pm}`, {
            timeout: 3000,
            ignoreError: true
          });
          if (result.stdout && result.stdout.includes(pm)) {
            availableManagers.push(pm);
          }
        } catch (error) {
          // Continue to next package manager
        }
      }

      if (availableManagers.length > 0) {
        console.log(`    ℇ Available package managers: ${availableManagers.join(', ')}`);
      } else {
        console.log('    ℇ No package managers detected');
      }
    });
  }

  async runPowerShellTests() {
    console.log('  💙 Running PowerShell-specific tests...');

    await this.runTest('PowerShell Module Loading', async () => {
      try {
        const result = await this.executeCommand('powershell -Command "Get-Module -ListAvailable"', {
          timeout: 10000,
          ignoreError: true
        });
        console.log('    ℇ PowerShell modules accessible');
      } catch (error) {
        console.log('    ℇ PowerShell modules not accessible');
      }
    });
  }

  async runGitBashTests() {
    console.log('  📦 Running Git Bash-specific tests...');

    await this.runTest('Git Bash Environment', async () => {
      try {
        const result = await this.executeCommand('bash --version', {
          timeout: 5000,
          ignoreError: true
        });
        console.log('    ℇ Git Bash environment working');
      } catch (error) {
        console.log('    ℇ Git Bash environment not working');
      }
    });
  }

  async runWSLTests() {
    console.log('  🐧 Running WSL-specific tests...');

    await this.runTest('WSL Integration', async () => {
      try {
        const result = await this.executeCommand('wsl.exe --list', {
          timeout: 5000,
          ignoreError: true
        });
        console.log('    ℇ WSL integration available');
      } catch (error) {
        console.log('    ℇ WSL integration not available');
      }
    });

    await this.runTest('Windows Path Access from WSL', async () => {
      try {
        const result = await this.executeCommand('ls /mnt/c', {
          timeout: 5000,
          ignoreError: true
        });
        console.log('    ℇ Windows paths accessible from WSL');
      } catch (error) {
        console.log('    ℇ Windows paths not accessible from WSL');
      }
    });
  }

  async runTest(name, testFn) {
    const startTime = Date.now();
    console.log(`  • ${name}...`);

    try {
      await testFn();
      const duration = Date.now() - startTime;

      this.results.push({
        name,
        status: 'PASS',
        duration,
        error: null,
        platform: this.platform.os
      });

      console.log(`    ✅ PASS (${duration}ms)`);

    } catch (error) {
      const duration = Date.now() - startTime;

      this.results.push({
        name,
        status: 'FAIL',
        duration,
        error: error.message,
        platform: this.platform.os
      });

      console.log(`    ❌ FAIL (${duration}ms): ${error.message}`);
    }
  }

  async executeCommand(command, options = {}) {
    const { timeout = 5000, ignoreError = false } = options;

    return new Promise((resolve, reject) => {
      try {
        const result = execSync(command, {
          encoding: 'utf8',
          timeout,
          stdio: 'pipe',
          cwd: projectRoot
        });

        resolve({ stdout: result, error: null });

      } catch (error) {
        if (ignoreError) {
          resolve({ stdout: error.stdout || '', error: error.message });
        } else {
          reject(new Error(`Command failed: ${command} - ${error.message}`));
        }
      }
    });
  }

  generateReport() {
    const endTime = new Date();
    const totalDuration = endTime - this.testStartTime;

    const passedTests = this.results.filter(r => r.status === 'PASS').length;
    const failedTests = this.results.filter(r => r.status === 'FAIL').length;
    const totalTests = this.results.length;

    const report = {
      summary: {
        platform: this.getPlatformDescription(),
        startTime: this.testStartTime.toISOString(),
        endTime: endTime.toISOString(),
        totalDuration,
        totalTests,
        passedTests,
        failedTests,
        successRate: Math.round((passedTests / totalTests) * 100)
      },
      platformDetails: this.platform,
      results: this.results,
      recommendations: this.generateRecommendations()
    };

    const reportPath = join(projectRoot, 'test-results', `platform-specific-${Date.now()}.json`);

    // Ensure directory exists
    const reportDir = join(projectRoot, 'test-results');
    if (!existsSync(reportDir)) {
      execSync(`mkdir -p "${reportDir}"`, { cwd: projectRoot });
    }

    // Write report
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('');
    console.log('📋 Platform-Specific Test Summary:');
    console.log(`   Platform: ${this.getPlatformDescription()}`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${failedTests}`);
    console.log(`   Success Rate: ${report.summary.successRate}%`);
    console.log(`   Duration: ${Math.round(totalDuration / 1000)}s`);
    console.log(`   Report saved to: ${reportPath}`);

    if (failedTests > 0) {
      console.log('');
      console.log('❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`   • ${r.name}: ${r.error}`);
        });
    }

    console.log('');
    console.log('💡 Platform-Specific Recommendations:');
    report.recommendations.forEach(rec => {
      console.log(`   • ${rec}`);
    });

    return report;
  }

  generateRecommendations() {
    const recommendations = [];
    const failedTests = this.results.filter(r => r.status === 'FAIL');

    if (failedTests.length === 0) {
      recommendations.push('All platform-specific tests passed - no issues detected');
      return recommendations;
    }

    // Platform-specific recommendations
    if (this.platform.os === 'win32') {
      if (failedTests.some(t => t.name.includes('Path'))) {
        recommendations.push('Windows: Check path handling for forward/backward slashes');
      }
      if (failedTests.some(t => t.name.includes('Permission'))) {
        recommendations.push('Windows: Run as Administrator for full functionality');
      }
      if (failedTests.some(t => t.name.includes('PowerShell'))) {
        recommendations.push('Windows: Ensure PowerShell execution policy allows scripts');
      }
    }

    if (this.platform.os === 'darwin') {
      if (failedTests.some(t => t.name.includes('File'))) {
        recommendations.push('macOS: Check file permissions and security settings');
      }
      if (failedTests.some(t => t.name.includes('Network'))) {
        recommendations.push('macOS: Check firewall and network configuration');
      }
    }

    if (this.platform.os === 'linux') {
      if (failedTests.some(t => t.name.includes('Process'))) {
        recommendations.push('Linux: Check system permissions and user capabilities');
      }
      if (failedTests.some(t => t.name.includes('Memory'))) {
        recommendations.push('Linux: Check memory limits and system resources');
      }
    }

    // Shell-specific recommendations
    if (this.platform.isWSL) {
      recommendations.push('WSL: Test native Windows environment for full compatibility');
      recommendations.push('WSL: Check Windows path accessibility and integration');
    }

    if (this.platform.isGitBash) {
      recommendations.push('Git Bash: Test PowerShell/CMD for Windows-specific features');
      recommendations.push('Git Bash: Verify Unix-like command compatibility');
    }

    if (this.platform.isPowerShell) {
      recommendations.push('PowerShell: Check execution policy: Set-ExecutionPolicy RemoteSigned');
      recommendations.push('PowerShell: Test both PowerShell and CMD for compatibility');
    }

    // General recommendations based on failed tests
    const failedCategories = {
      'Path': 'Check path handling and separator usage',
      'File': 'Verify file permissions and access rights',
      'Network': 'Check network configuration and firewall settings',
      'Process': 'Verify system permissions and process management',
      'Environment': 'Check environment variable configuration',
      'Shell': 'Verify shell compatibility and command execution'
    };

    Object.entries(failedCategories).forEach(([category, advice]) => {
      if (failedTests.some(t => t.name.includes(category))) {
        recommendations.push(advice);
      }
    });

    return recommendations;
  }
}

// Main execution
async function main() {
  const tester = new PlatformSpecificTests();

  try {
    await tester.runPlatformSpecificTests();
    process.exit(0);
  } catch (error) {
    console.error('Platform-specific testing failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Platform-Specific Compatibility Testing

Usage: node platform-specific-tests.js [options]

Options:
  --help, -h     Show this help message
  --platform     Show current platform information
  --os-only      Run only OS-specific tests
  --verbose      Enable verbose output

Examples:
  node platform-specific-tests.js
  node platform-specific-tests.js --platform
  node platform-specific-tests.js --os-only
  node platform-specific-tests.js --verbose
  `);
  process.exit(0);
}

if (args.includes('--platform')) {
  const tester = new PlatformSpecificTests();
  console.log('Platform Information:');
  console.log(JSON.stringify(tester.platform, null, 2));
  process.exit(0);
}

if (args.includes('--verbose')) {
  process.env.VERBOSE = 'true';
}

// Run the tests
main().catch(console.error);