/**
 * Test Framework Helpers for Docker Test Infrastructure
 * Tests assertion functions, mock utilities, and test reporting
 *
 * Migration from: docker/tests/test-helpers.sh
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Types for test framework
interface TestContext {
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  failures: string[];
}

class TestFramework {
  private context: TestContext = {
    testsRun: 0,
    testsPassed: 0,
    testsFailed: 0,
    failures: []
  };

  // Logging functions with colors
  logTest(message: string): void {
    console.log(`[TEST] ${message}`);
  }

  logPass(message: string): void {
    console.log(`[PASS] ${message}`);
    this.context.testsPassed++;
  }

  logFail(message: string): void {
    console.log(`[FAIL] ${message}`);
    this.context.testsFailed++;
    this.context.failures.push(message);
  }

  logInfo(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  logWarn(message: string): void {
    console.log(`[WARN] ${message}`);
  }

  logError(message: string): void {
    console.log(`[ERROR] ${message}`);
  }

  logSection(title: string): void {
    console.log('');
    console.log(`========================================`);
    console.log(`${title}`);
    console.log(`========================================`);
  }

  // Assertion functions
  assertEquals(testName: string, expected: string | number, actual: string | number): boolean {
    this.context.testsRun++;
    this.logTest(testName);

    if (expected === actual) {
      this.logPass(testName);
      return true;
    } else {
      this.logFail(`${testName} - Expected: '${expected}', Got: '${actual}'`);
      return false;
    }
  }

  assertTrue(testName: string, condition: boolean): boolean {
    this.context.testsRun++;
    this.logTest(testName);

    if (condition) {
      this.logPass(testName);
      return true;
    } else {
      this.logFail(`${testName} - Expected true but got false`);
      return false;
    }
  }

  assertFalse(testName: string, condition: boolean): boolean {
    this.context.testsRun++;
    this.logTest(testName);

    if (!condition) {
      this.logPass(testName);
      return true;
    } else {
      this.logFail(`${testName} - Expected false but got true`);
      return false;
    }
  }

  assertFileExists(testName: string, filePath: string): boolean {
    this.context.testsRun++;
    this.logTest(testName);

    try {
      const fs = require('fs');
      if (fs.existsSync(filePath)) {
        this.logPass(testName);
        return true;
      } else {
        this.logFail(`${testName} - File does not exist: ${filePath}`);
        return false;
      }
    } catch (error) {
      this.logFail(`${testName} - Error checking file: ${error}`);
      return false;
    }
  }

  assertDirectoryExists(testName: string, dirPath: string): boolean {
    this.context.testsRun++;
    this.logTest(testName);

    try {
      const fs = require('fs');
      const stats = fs.statSync(dirPath);
      if (stats.isDirectory()) {
        this.logPass(testName);
        return true;
      } else {
        this.logFail(`${testName} - Path is not a directory: ${dirPath}`);
        return false;
      }
    } catch (error) {
      this.logFail(`${testName} - Directory does not exist: ${dirPath}`);
      return false;
    }
  }

  assertContains(testName: string, haystack: string, needle: string): boolean {
    this.context.testsRun++;
    this.logTest(testName);

    if (haystack.includes(needle)) {
      this.logPass(testName);
      return true;
    } else {
      this.logFail(`${testName} - Expected '${haystack}' to contain '${needle}'`);
      return false;
    }
  }

  assertMatches(testName: string, text: string, pattern: RegExp): boolean {
    this.context.testsRun++;
    this.logTest(testName);

    if (pattern.test(text)) {
      this.logPass(testName);
      return true;
    } else {
      this.logFail(`${testName} - Expected '${text}' to match pattern '${pattern}'`);
      return false;
    }
  }

  // Test context getters
  getContext(): TestContext {
    return this.context;
  }

  getSummary(): string {
    const total = this.context.testsRun;
    const passed = this.context.testsPassed;
    const failed = this.context.testsFailed;

    return `
========================================
Test Summary
========================================
Total:   ${total}
Passed:  ${passed}
Failed:  ${failed}
Pass Rate: ${total > 0 ? ((passed / total) * 100).toFixed(2) : 0}%
${failed > 0 ? `\nFailures:\n${this.context.failures.join('\n')}` : ''}
========================================
    `.trim();
  }

  resetContext(): void {
    this.context = {
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      failures: []
    };
  }
}

// Export singleton instance
export const testFramework = new TestFramework();

describe('TestFramework', () => {
  let framework: TestFramework;

  beforeEach(() => {
    framework = new TestFramework();
  });

  describe('assertEquals', () => {
    it('should pass when values are equal', () => {
      const result = framework.assertEquals('test', 'expected', 'expected');
      expect(result).toBe(true);
      expect(framework.getContext().testsPassed).toBe(1);
    });

    it('should fail when values are not equal', () => {
      const result = framework.assertEquals('test', 'expected', 'actual');
      expect(result).toBe(false);
      expect(framework.getContext().testsFailed).toBe(1);
    });

    it('should work with numeric values', () => {
      const result = framework.assertEquals('test', 42, 42);
      expect(result).toBe(true);
    });
  });

  describe('assertTrue', () => {
    it('should pass when condition is true', () => {
      const result = framework.assertTrue('test', true);
      expect(result).toBe(true);
    });

    it('should fail when condition is false', () => {
      const result = framework.assertTrue('test', false);
      expect(result).toBe(false);
    });
  });

  describe('assertFalse', () => {
    it('should pass when condition is false', () => {
      const result = framework.assertFalse('test', false);
      expect(result).toBe(true);
    });

    it('should fail when condition is true', () => {
      const result = framework.assertFalse('test', true);
      expect(result).toBe(false);
    });
  });

  describe('assertMatches', () => {
    it('should pass when text matches pattern', () => {
      const result = framework.assertMatches('test', 'hello123', /\d+/);
      expect(result).toBe(true);
    });

    it('should fail when text does not match pattern', () => {
      const result = framework.assertMatches('test', 'hello', /\d+/);
      expect(result).toBe(false);
    });
  });

  describe('assertContains', () => {
    it('should pass when haystack contains needle', () => {
      const result = framework.assertContains('test', 'hello world', 'world');
      expect(result).toBe(true);
    });

    it('should fail when haystack does not contain needle', () => {
      const result = framework.assertContains('test', 'hello', 'world');
      expect(result).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('should generate correct summary', () => {
      framework.assertEquals('test1', 'a', 'a');
      framework.assertEquals('test2', 'b', 'c');

      const summary = framework.getSummary();
      expect(summary).toContain('Total:   2');
      expect(summary).toContain('Passed:  1');
      expect(summary).toContain('Failed:  1');
      expect(summary).toContain('50.00%');
    });
  });
});
