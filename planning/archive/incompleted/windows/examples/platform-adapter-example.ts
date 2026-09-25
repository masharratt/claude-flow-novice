/**
 * Platform Adapter Example
 *
 * Demonstrates runtime platform detection and environment-specific execution
 * patterns for Claude Flow Novice cross-platform support.
 */

import * as os from 'os';
import * as fs from 'fs';
import { spawn, spawnSync } from 'child_process';

// ============================================================================
// Platform Detection
// ============================================================================

interface PlatformInfo {
  platform: 'win32' | 'darwin' | 'linux';
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
  isWSL: boolean;
  isCI: boolean;
  isGitHub: boolean;
  nodeVersion: string;
  shellPath: string;
  capabilities: PlatformCapabilities;
}

interface PlatformCapabilities {
  hasWSL: boolean;
  hasPowerShell: boolean;
  hasBash: boolean;
  hasRedis: boolean;
  hasSQLite: boolean;
  supportsJobObjects: boolean;
  supportsPOSIXSignals: boolean;
}

export class PlatformDetector {
  private static cachedInfo: PlatformInfo | null = null;

  /**
   * Detect current platform and capabilities
   * Results are cached for performance
   */
  static detect(): PlatformInfo {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    const platform = process.platform as 'win32' | 'darwin' | 'linux';
    const isWindows = platform === 'win32';
    const isMac = platform === 'darwin';
    const isLinux = platform === 'linux';

    const info: PlatformInfo = {
      platform,
      isWindows,
      isMac,
      isLinux,
      isWSL: this.detectWSL(),
      isCI: this.detectCI(),
      isGitHub: this.detectGitHub(),
      nodeVersion: process.version,
      shellPath: this.detectShell(),
      capabilities: this.detectCapabilities()
    };

    this.cachedInfo = info;
    return info;
  }

  /**
   * Detect if running inside WSL (Windows Subsystem for Linux)
   */
  private static detectWSL(): boolean {
    // Method 1: Check environment variable
    if (process.env.WSL_DISTRO_NAME) {
      return true;
    }

    // Method 2: Check /proc/version for "microsoft" string
    if (process.platform === 'linux') {
      try {
        const version = fs.readFileSync('/proc/version', 'utf8');
        return version.toLowerCase().includes('microsoft');
      } catch {
        // /proc/version not readable
      }
    }

    return false;
  }

  /**
   * Detect if running in CI/CD environment
   */
  private static detectCI(): boolean {
    return (
      process.env.CI === 'true' ||
      process.env.CONTINUOUS_INTEGRATION === 'true' ||
      process.env.GITHUB_ACTIONS === 'true' ||
      process.env.GITLAB_CI === 'true' ||
      process.env.CIRCLECI === 'true' ||
      process.env.TRAVIS === 'true'
    );
  }

  /**
   * Detect if running in GitHub Actions specifically
   */
  private static detectGitHub(): boolean {
    return process.env.GITHUB_ACTIONS === 'true';
  }

  /**
   * Detect available shell
   */
  private static detectShell(): string {
    if (process.platform === 'win32') {
      // Prefer PowerShell on Windows
      if (this.hasCommand('pwsh')) return 'pwsh';
      if (this.hasCommand('powershell')) return 'powershell';

      // Fallback to bash if available (Git Bash, WSL)
      if (this.hasCommand('bash')) return 'bash';

      return 'cmd.exe'; // Last resort
    }

    // Unix-like systems
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Detect platform capabilities
   */
  private static detectCapabilities(): PlatformCapabilities {
    return {
      hasWSL: this.hasCommand('wsl') && process.platform === 'win32',
      hasPowerShell: this.hasCommand('powershell') || this.hasCommand('pwsh'),
      hasBash: this.hasCommand('bash'),
      hasRedis: this.hasCommand('redis-cli') || this.hasCommand('redis-server'),
      hasSQLite: this.hasCommand('sqlite3'),
      supportsJobObjects: process.platform === 'win32' && this.getWindowsVersion() >= 6,
      supportsPOSIXSignals: process.platform !== 'win32'
    };
  }

  /**
   * Check if a command is available in PATH
   */
  private static hasCommand(command: string): boolean {
    try {
      const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
        stdio: 'ignore'
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Get Windows version (major version number)
   */
  private static getWindowsVersion(): number {
    if (process.platform !== 'win32') return 0;

    try {
      const version = os.release();
      return parseInt(version.split('.')[0]);
    } catch {
      return 0;
    }
  }

  /**
   * Validate that the current environment meets minimum requirements
   */
  static validateEnvironment(): ValidationResult {
    const info = this.detect();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check Node.js version
    const nodeMajor = parseInt(process.version.slice(1).split('.')[0]);
    if (nodeMajor < 18) {
      errors.push(`Node.js ${process.version} is not supported. Minimum version: 18.0.0`);
    }

    // Check for required capabilities
    if (!info.capabilities.hasBash && !info.capabilities.hasPowerShell) {
      errors.push('Neither bash nor PowerShell found. At least one shell is required.');
    }

    // Warnings for missing optional capabilities
    if (!info.capabilities.hasRedis) {
      warnings.push('Redis not found. Some coordination features may not work.');
    }

    if (!info.capabilities.hasSQLite) {
      warnings.push('SQLite not found. Some persistence features may not work.');
    }

    // Windows-specific validation
    if (info.isWindows && !info.capabilities.supportsJobObjects) {
      warnings.push('Windows version does not support Job Objects. Process management may be less reliable.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      platformInfo: info
    };
  }
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  platformInfo: PlatformInfo;
}

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Basic platform detection
 */
export function example1_BasicDetection() {
  const platform = PlatformDetector.detect();

  console.log('Platform Detection Results:');
  console.log(`  OS: ${platform.platform}`);
  console.log(`  Windows: ${platform.isWindows}`);
  console.log(`  macOS: ${platform.isMac}`);
  console.log(`  Linux: ${platform.isLinux}`);
  console.log(`  WSL: ${platform.isWSL}`);
  console.log(`  CI: ${platform.isCI}`);
  console.log(`  GitHub Actions: ${platform.isGitHub}`);
  console.log(`  Node.js: ${platform.nodeVersion}`);
  console.log(`  Shell: ${platform.shellPath}`);

  console.log('\nCapabilities:');
  console.log(`  WSL Available: ${platform.capabilities.hasWSL}`);
  console.log(`  PowerShell: ${platform.capabilities.hasPowerShell}`);
  console.log(`  Bash: ${platform.capabilities.hasBash}`);
  console.log(`  Redis: ${platform.capabilities.hasRedis}`);
  console.log(`  SQLite: ${platform.capabilities.hasSQLite}`);
  console.log(`  Job Objects: ${platform.capabilities.supportsJobObjects}`);
  console.log(`  POSIX Signals: ${platform.capabilities.supportsPOSIXSignals}`);
}

/**
 * Example 2: Environment validation
 */
export function example2_EnvironmentValidation() {
  const validation = PlatformDetector.validateEnvironment();

  console.log('Environment Validation:');
  console.log(`  Valid: ${validation.valid ? '✅' : '❌'}`);

  if (validation.errors.length > 0) {
    console.log('\n❌ Errors:');
    validation.errors.forEach(error => console.log(`  - ${error}`));
  }

  if (validation.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    validation.warnings.forEach(warning => console.log(`  - ${warning}`));
  }

  if (validation.valid) {
    console.log('\n✅ Environment meets all requirements');
  } else {
    console.log('\n❌ Environment does not meet requirements');
    process.exit(1);
  }
}

/**
 * Example 3: Platform-specific execution
 */
export function example3_PlatformSpecificExecution() {
  const platform = PlatformDetector.detect();

  if (platform.isWindows && !platform.isWSL) {
    console.log('Running on Windows native');
    console.log('Using Windows Job Objects for process management');
    console.log('Using PowerShell for script execution');
  } else if (platform.isWSL) {
    console.log('Running on WSL2');
    console.log('Using POSIX signals for process management');
    console.log('Using bash for script execution');
  } else if (platform.isMac) {
    console.log('Running on macOS');
    console.log('Using POSIX signals for process management');
    console.log('Using bash for script execution');
  } else if (platform.isLinux) {
    console.log('Running on Linux');
    console.log('Using POSIX signals for process management');
    console.log('Using bash for script execution');
  }
}

/**
 * Example 4: Shell selection
 */
export function example4_ShellSelection() {
  const platform = PlatformDetector.detect();

  let shell: string;
  let shellArgs: string[];

  if (platform.isWindows && !platform.isWSL) {
    if (platform.capabilities.hasPowerShell) {
      shell = 'powershell.exe';
      shellArgs = ['-NoProfile', '-NonInteractive', '-Command'];
      console.log('Selected shell: PowerShell');
    } else {
      shell = 'cmd.exe';
      shellArgs = ['/c'];
      console.log('Selected shell: cmd.exe (fallback)');
    }
  } else {
    shell = '/bin/bash';
    shellArgs = ['-c'];
    console.log('Selected shell: bash');
  }

  console.log(`  Shell path: ${shell}`);
  console.log(`  Shell args: ${shellArgs.join(' ')}`);

  return { shell, shellArgs };
}

/**
 * Example 5: WSL fallback strategy (Windows only)
 */
export function example5_WSLFallback() {
  const platform = PlatformDetector.detect();

  if (!platform.isWindows) {
    console.log('WSL fallback not applicable on non-Windows platforms');
    return;
  }

  if (platform.capabilities.hasWSL) {
    console.log('✅ WSL is available as fallback for bash scripts');
    console.log('   Bash scripts can be executed via: wsl bash /path/to/script.sh');
  } else {
    console.log('⚠️  WSL is not available');
    console.log('   Bash scripts cannot be executed without WSL or Git Bash');
    console.log('   Consider installing WSL2 for full compatibility');
  }
}

/**
 * Example 6: CI/CD specific handling
 */
export function example6_CISpecificHandling() {
  const platform = PlatformDetector.detect();

  if (platform.isCI) {
    console.log('Running in CI/CD environment');

    if (platform.isGitHub) {
      console.log('  Platform: GitHub Actions');
      console.log(`  Runner OS: ${process.env.RUNNER_OS}`);
      console.log(`  Workflow: ${process.env.GITHUB_WORKFLOW}`);
      console.log(`  Job: ${process.env.GITHUB_JOB}`);
    } else {
      console.log('  Platform: Other CI/CD');
    }

    // CI-specific optimizations
    console.log('\nCI Optimizations:');
    console.log('  - Reduced logging verbosity');
    console.log('  - Parallel test execution');
    console.log('  - Artifact caching');
  } else {
    console.log('Running in local development environment');
    console.log('Full logging and debugging enabled');
  }
}

// ============================================================================
// Main Execution (for testing)
// ============================================================================

if (require.main === module) {
  console.log('='.repeat(70));
  console.log('Platform Adapter Examples');
  console.log('='.repeat(70));

  console.log('\n📍 Example 1: Basic Platform Detection');
  console.log('-'.repeat(70));
  example1_BasicDetection();

  console.log('\n\n✅ Example 2: Environment Validation');
  console.log('-'.repeat(70));
  example2_EnvironmentValidation();

  console.log('\n\n🎯 Example 3: Platform-Specific Execution');
  console.log('-'.repeat(70));
  example3_PlatformSpecificExecution();

  console.log('\n\n🐚 Example 4: Shell Selection');
  console.log('-'.repeat(70));
  example4_ShellSelection();

  console.log('\n\n🔄 Example 5: WSL Fallback Strategy');
  console.log('-'.repeat(70));
  example5_WSLFallback();

  console.log('\n\n🤖 Example 6: CI/CD Specific Handling');
  console.log('-'.repeat(70));
  example6_CISpecificHandling();

  console.log('\n' + '='.repeat(70));
  console.log('All examples completed successfully!');
  console.log('='.repeat(70));
}
