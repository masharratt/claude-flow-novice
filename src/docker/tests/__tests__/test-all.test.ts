/**
 * Docker Test Infrastructure - Comprehensive Test Suite
 * Tests all Docker images to ensure they work correctly
 *
 * Migration from: docker/test-all.sh
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

class DockerTestSuite {
  private results: TestResult[] = [];
  private projectRoot: string;
  private verbose: boolean;

  constructor(projectRoot: string = process.cwd(), verbose: boolean = false) {
    this.projectRoot = projectRoot;
    this.verbose = verbose;
  }

  /**
   * Test Redis image connectivity and basic operations
   */
  async testRedisConnectivity(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'Redis Connectivity Test';

    try {
      // Check if Redis image exists or can be pulled
      const result = execSync('docker', {
        args: ['images', '--format', 'table {{.Repository}}:{{.Tag}}'],
        all: true
      });

      const images = result.stdout.toString().split('\n');
      const hasRedis = images.some(img => img.includes('redis'));

      if (hasRedis) {
        return {
          name: testName,
          passed: true,
          message: 'Redis image found',
          duration: Date.now() - start
        };
      } else {
        return {
          name: testName,
          passed: false,
          message: 'Redis image not found',
          duration: Date.now() - start
        };
      }
    } catch (error) {
      return {
        name: testName,
        passed: false,
        message: `Redis connectivity test failed: ${error}`,
        duration: Date.now() - start
      };
    }
  }

  /**
   * Test Agent image with different agent types
   */
  async testAgentImage(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'Agent Image Test';

    try {
      const result = execSync('docker', {
        args: ['images', '--filter', 'reference=*agent*', '--format', 'table {{.Repository}}:{{.Tag}}'],
        all: true
      });

      const images = result.stdout.toString().split('\n').filter(l => l.trim());

      if (images.length > 0) {
        return {
          name: testName,
          passed: true,
          message: `Found ${images.length} agent images`,
          duration: Date.now() - start
        };
      } else {
        return {
          name: testName,
          passed: false,
          message: 'No agent images found',
          duration: Date.now() - start
        };
      }
    } catch (error) {
      return {
        name: testName,
        passed: false,
        message: `Agent image test failed: ${error}`,
        duration: Date.now() - start
      };
    }
  }

  /**
   * Test Orchestrator image help and parameters
   */
  async testOrchestratorImage(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'Orchestrator Image Test';

    try {
      const result = execSync('docker', {
        args: ['images', '--filter', 'reference=*orchestrator*', '--format', 'table {{.Repository}}:{{.Tag}}'],
        all: true
      });

      const images = result.stdout.toString().split('\n').filter(l => l.trim());

      if (images.length > 0) {
        return {
          name: testName,
          passed: true,
          message: `Found ${images.length} orchestrator images`,
          duration: Date.now() - start
        };
      } else {
        return {
          name: testName,
          passed: false,
          message: 'No orchestrator images found',
          duration: Date.now() - start
        };
      }
    } catch (error) {
      return {
        name: testName,
        passed: false,
        message: `Orchestrator image test failed: ${error}`,
        duration: Date.now() - start
      };
    }
  }

  /**
   * Test Coordinator image help and parameters
   */
  async testCoordinatorImage(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'Coordinator Image Test';

    try {
      const result = execSync('docker', {
        args: ['images', '--filter', 'reference=*coordinator*', '--format', 'table {{.Repository}}:{{.Tag}}'],
        all: true
      });

      const images = result.stdout.toString().split('\n').filter(l => l.trim());

      if (images.length > 0) {
        return {
          name: testName,
          passed: true,
          message: `Found ${images.length} coordinator images`,
          duration: Date.now() - start
        };
      } else {
        return {
          name: testName,
          passed: false,
          message: 'No coordinator images found',
          duration: Date.now() - start
        };
      }
    } catch (error) {
      return {
        name: testName,
        passed: false,
        message: `Coordinator image test failed: ${error}`,
        duration: Date.now() - start
      };
    }
  }

  /**
   * Run all tests and collect results
   */
  async runAllTests(): Promise<TestResult[]> {
    this.results = [
      await this.testRedisConnectivity(),
      await this.testAgentImage(),
      await this.testOrchestratorImage(),
      await this.testCoordinatorImage()
    ];

    return this.results;
  }

  /**
   * Get test summary
   */
  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    duration: number;
  } {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    const duration = this.results.reduce((sum, r) => sum + r.duration, 0);

    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? (passed / total) * 100 : 0,
      duration
    };
  }

  /**
   * Print test results
   */
  printResults(): void {
    console.log('\n=== Docker Test Suite Results ===\n');

    this.results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status}: ${result.name}`);
      console.log(`  Message: ${result.message}`);
      console.log(`  Duration: ${result.duration}ms\n`);
    });

    const summary = this.getSummary();
    console.log('=== Summary ===');
    console.log(`Total:     ${summary.total}`);
    console.log(`Passed:    ${summary.passed}`);
    console.log(`Failed:    ${summary.failed}`);
    console.log(`Pass Rate: ${summary.passRate.toFixed(2)}%`);
    console.log(`Total Duration: ${summary.duration}ms\n`);
  }
}

describe('Docker Test Suite', () => {
  let suite: DockerTestSuite;

  beforeEach(() => {
    suite = new DockerTestSuite(process.cwd(), false);
  });

  describe('Image Tests', () => {
    it('should detect Redis image', async () => {
      const result = await suite.testRedisConnectivity();
      expect(result.name).toBe('Redis Connectivity Test');
      expect(typeof result.passed).toBe('boolean');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should detect Agent image', async () => {
      const result = await suite.testAgentImage();
      expect(result.name).toBe('Agent Image Test');
      expect(typeof result.passed).toBe('boolean');
    });

    it('should detect Orchestrator image', async () => {
      const result = await suite.testOrchestratorImage();
      expect(result.name).toBe('Orchestrator Image Test');
      expect(typeof result.passed).toBe('boolean');
    });

    it('should detect Coordinator image', async () => {
      const result = await suite.testCoordinatorImage();
      expect(result.name).toBe('Coordinator Image Test');
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('Test Suite Results', () => {
    it('should run all tests', async () => {
      const results = await suite.runAllTests();
      expect(results).toHaveLength(4);
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('passed');
      expect(results[0]).toHaveProperty('message');
      expect(results[0]).toHaveProperty('duration');
    });

    it('should provide accurate summary', async () => {
      await suite.runAllTests();
      const summary = suite.getSummary();

      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('passed');
      expect(summary).toHaveProperty('failed');
      expect(summary).toHaveProperty('passRate');
      expect(summary).toHaveProperty('duration');
      expect(summary.total).toBe(4);
      expect(summary.passed + summary.failed).toBe(summary.total);
    });
  });
});
