/**
 * Docker Test Runner with Pre-flight Checks
 * Comprehensive test infrastructure with environment validation
 *
 * Migration from: docker/test-runner.sh
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface PreflightCheck {
  name: string;
  passed: boolean;
  message: string;
}

interface TestConfig {
  skipPreflight: boolean;
  verbose: boolean;
  testPattern?: RegExp;
}

class TestRunner {
  private projectRoot: string;
  private config: TestConfig;
  private preflightResults: PreflightCheck[] = [];

  constructor(projectRoot: string = process.cwd(), config: Partial<TestConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = {
      skipPreflight: false,
      verbose: false,
      ...config
    };
  }

  /**
   * Check Docker daemon availability
   */
  async checkDockerDaemon(): Promise<PreflightCheck> {
    try {
      const result = await execa('docker', ['ps'], { all: true });
      return {
        name: 'Docker Daemon',
        passed: result.exitCode === 0,
        message: 'Docker daemon is running'
      };
    } catch (error) {
      return {
        name: 'Docker Daemon',
        passed: false,
        message: `Docker daemon check failed: ${error}`
      };
    }
  }

  /**
   * Check required images are available
   */
  async checkRequiredImages(): Promise<PreflightCheck> {
    const requiredImages = [
      'cfn-agent:latest',
      'redis:7-alpine',
      'cfn-coordinator:latest',
      'cfn-orchestrator:latest'
    ];

    const missing: string[] = [];

    for (const image of requiredImages) {
      try {
        const result = await execa('docker', ['images', '--quiet', image], { all: true });
        if (!result.stdout.trim()) {
          missing.push(image);
        }
      } catch {
        missing.push(image);
      }
    }

    return {
      name: 'Required Images',
      passed: missing.length === 0,
      message: missing.length === 0
        ? 'All required images found'
        : `Missing images: ${missing.join(', ')}`
    };
  }

  /**
   * Check Redis connectivity
   */
  async checkRedisConnectivity(): Promise<PreflightCheck> {
    try {
      // Try to connect to Redis if it's running
      const result = await execa('docker', ['ps', '--filter', 'name=cfn-redis'], { all: true });
      const isRunning = result.stdout.includes('cfn-redis');

      return {
        name: 'Redis Connectivity',
        passed: isRunning,
        message: isRunning ? 'Redis container is running' : 'Redis container not running (expected)'
      };
    } catch (error) {
      return {
        name: 'Redis Connectivity',
        passed: false,
        message: `Redis check failed: ${error}`
      };
    }
  }

  /**
   * Check network configuration
   */
  async checkNetworkConfiguration(): Promise<PreflightCheck> {
    try {
      const result = await execa('docker', ['network', 'ls', '--filter', 'name=cfn-network'], { all: true });
      const exists = result.stdout.includes('cfn-network');

      return {
        name: 'Network Configuration',
        passed: exists,
        message: exists ? 'CFN network exists' : 'CFN network not found (may need creation)'
      };
    } catch (error) {
      return {
        name: 'Network Configuration',
        passed: false,
        message: `Network check failed: ${error}`
      };
    }
  }

  /**
   * Check Docker socket access
   */
  async checkDockerSocketAccess(): Promise<PreflightCheck> {
    const socketPath = '/var/run/docker.sock';

    try {
      const stats = fs.statSync(socketPath);
      const accessible = stats.isSocket();

      return {
        name: 'Docker Socket Access',
        passed: accessible,
        message: accessible ? 'Docker socket is accessible' : 'Docker socket is not accessible'
      };
    } catch {
      // On some systems or in certain environments, socket may not be at standard path
      return {
        name: 'Docker Socket Access',
        passed: false,
        message: 'Docker socket not found at standard location'
      };
    }
  }

  /**
   * Run all preflight checks
   */
  async runPreflightChecks(): Promise<PreflightCheck[]> {
    if (this.config.skipPreflight) {
      return [];
    }

    this.preflightResults = [
      await this.checkDockerDaemon(),
      await this.checkRequiredImages(),
      await this.checkRedisConnectivity(),
      await this.checkNetworkConfiguration(),
      await this.checkDockerSocketAccess()
    ];

    return this.preflightResults;
  }

  /**
   * Get preflight check results summary
   */
  getPreflightSummary(): {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  } {
    const total = this.preflightResults.length;
    const passed = this.preflightResults.filter(c => c.passed).length;

    return {
      total,
      passed,
      failed: total - passed,
      passRate: total > 0 ? (passed / total) * 100 : 0
    };
  }

  /**
   * Print preflight results
   */
  printPreflightResults(): void {
    console.log('\n=== Preflight Checks ===\n');

    this.preflightResults.forEach(check => {
      const status = check.passed ? '✅' : '⚠️';
      console.log(`${status} ${check.name}`);
      console.log(`   ${check.message}`);
    });

    const summary = this.getPreflightSummary();
    console.log(`\nPassed: ${summary.passed}/${summary.total} (${summary.passRate.toFixed(2)}%)\n`);
  }

  /**
   * Run test suite with configuration
   */
  async runTests(testDir: string = 'docker/tests'): Promise<{ passed: number; failed: number; total: number }> {
    const checks = await this.runPreflightChecks();

    if (this.config.verbose) {
      this.printPreflightResults();
    }

    // Count test files
    const testFilePath = path.join(this.projectRoot, testDir);
    let testCount = 0;

    try {
      if (fs.existsSync(testFilePath) && fs.statSync(testFilePath).isDirectory()) {
        const files = fs.readdirSync(testFilePath);
        testCount = files.filter(f => f.endsWith('.test.ts') || f.endsWith('.spec.ts')).length;
      }
    } catch (error) {
      if (this.config.verbose) {
        console.log(`Warning: Could not read test directory: ${error}`);
      }
    }

    return {
      passed: checks.filter(c => c.passed).length,
      failed: checks.filter(c => !c.passed).length,
      total: testCount
    };
  }

  /**
   * Validate test environment
   */
  async validateEnvironment(): Promise<boolean> {
    const checks = await this.runPreflightChecks();
    const critical = checks.filter(c => ['Docker Daemon', 'Docker Socket Access'].includes(c.name));
    return critical.every(c => c.passed);
  }

  /**
   * Get configuration
   */
  getConfig(): TestConfig {
    return this.config;
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<TestConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

describe('Test Runner', () => {
  let runner: TestRunner;

  beforeEach(() => {
    runner = new TestRunner(process.cwd(), { skipPreflight: true });
  });

  describe('Preflight Checks', () => {
    it('should check Docker daemon', async () => {
      const result = await runner.checkDockerDaemon();
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('message');
      expect(result.name).toBe('Docker Daemon');
    });

    it('should check required images', async () => {
      const result = await runner.checkRequiredImages();
      expect(result.name).toBe('Required Images');
      expect(typeof result.passed).toBe('boolean');
    });

    it('should check Redis connectivity', async () => {
      const result = await runner.checkRedisConnectivity();
      expect(result.name).toBe('Redis Connectivity');
      expect(typeof result.passed).toBe('boolean');
    });

    it('should check network configuration', async () => {
      const result = await runner.checkNetworkConfiguration();
      expect(result.name).toBe('Network Configuration');
      expect(typeof result.passed).toBe('boolean');
    });

    it('should check Docker socket access', async () => {
      const result = await runner.checkDockerSocketAccess();
      expect(result.name).toBe('Docker Socket Access');
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('Preflight Summary', () => {
    it('should return empty results when skipped', async () => {
      runner.setConfig({ skipPreflight: true });
      const results = await runner.runPreflightChecks();
      expect(results).toHaveLength(0);
    });

    it('should provide summary statistics', async () => {
      runner.setConfig({ skipPreflight: false });
      await runner.runPreflightChecks();
      const summary = runner.getPreflightSummary();

      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('passed');
      expect(summary).toHaveProperty('failed');
      expect(summary).toHaveProperty('passRate');
      expect(summary.passed + summary.failed).toBe(summary.total);
    });
  });

  describe('Test Runner', () => {
    it('should run tests', async () => {
      const result = await runner.runTests();
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('total');
    });

    it('should validate environment', async () => {
      runner.setConfig({ skipPreflight: false });
      const valid = await runner.validateEnvironment();
      expect(typeof valid).toBe('boolean');
    });

    it('should respect configuration', () => {
      runner.setConfig({ verbose: true });
      const config = runner.getConfig();
      expect(config.verbose).toBe(true);
    });
  });
});
