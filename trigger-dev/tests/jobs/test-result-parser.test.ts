/**
 * Test Result Parser Tests
 * Validates real test framework output parsing (Jest/Vitest format)
 * Tests fail initially with simulation, pass after implementing real parser
 */

import { describe, it, expect } from 'vitest';
import { parseTestResults, TestParseResult } from '../../src/lib/test-result-parser';

describe('Test Result Parser - TDD Protocol', () => {
  describe('Jest Format Parsing', () => {
    it('should parse real Jest test output with passed and failed tests', () => {
      const mockJestOutput = `
        PASS  src/auth.test.ts
        PASS  src/user.test.ts

        Test Suites: 2 passed, 2 total
        Tests: 15 passed, 3 failed, 18 total
        Snapshots: 0 total
        Time: 2.345 s
      `;

      const result = parseTestResults(mockJestOutput);

      expect(result.passedTests).toBe(15);
      expect(result.totalTests).toBe(18);
      expect(result.failedTests).toBe(3);
      expect(result.testPassRate).toBeCloseTo(15 / 18, 3);
      expect(result).not.toHaveProperty('simulated');
    });

    it('should parse Jest output with all tests passing', () => {
      const mockJestOutput = `
        PASS  src/auth.test.ts

        Test Suites: 1 passed, 1 total
        Tests: 45 passed, 45 total
        Snapshots: 0 total
        Time: 1.234 s
      `;

      const result = parseTestResults(mockJestOutput);

      expect(result.passedTests).toBe(45);
      expect(result.totalTests).toBe(45);
      expect(result.failedTests).toBe(0);
      expect(result.testPassRate).toBe(1.0);
    });

    it('should parse Jest output with multiple suites', () => {
      const mockJestOutput = `
        PASS  src/__tests__/unit/auth.test.ts
        PASS  src/__tests__/integration/api.test.ts

        Test Suites: 2 passed, 2 total
        Tests: 52 passed, 8 failed, 60 total
        Time: 3.456 s
      `;

      const result = parseTestResults(mockJestOutput);

      expect(result.passedTests).toBe(52);
      expect(result.totalTests).toBe(60);
      expect(result.failedTests).toBe(8);
      expect(result.testPassRate).toBeCloseTo(52 / 60, 3);
    });

    it('should parse Jest output with coverage data', () => {
      const mockJestOutput = `
        Test Suites: 3 passed, 3 total
        Tests: 89 passed, 11 failed, 100 total
        Coverage: 85% statements, 82% branches, 88% functions
        Time: 5.123 s
      `;

      const result = parseTestResults(mockJestOutput);

      expect(result.passedTests).toBe(89);
      expect(result.totalTests).toBe(100);
      expect(result.testPassRate).toBeCloseTo(0.89, 3);
    });
  });

  describe('Vitest Format Parsing', () => {
    it('should parse Vitest test output format', () => {
      const mockVitestOutput = `
        ✓ src/auth.test.ts (10)
        ✓ src/user.test.ts (15)
        ✗ src/error.test.ts (3)

        Test Files: 3 passed, 1 failed, 4 total
        Tests: 22 passed, 3 failed, 25 total
        Duration: 1.234s
      `;

      const result = parseTestResults(mockVitestOutput);

      expect(result.passedTests).toBe(22);
      expect(result.totalTests).toBe(25);
      expect(result.failedTests).toBe(3);
      expect(result.testPassRate).toBeCloseTo(22 / 25, 3);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero total tests', () => {
      const mockOutput = `
        Test Suites: 0 total
        Tests: 0 total
        Time: 0.001 s
      `;

      const result = parseTestResults(mockOutput);

      expect(result.totalTests).toBe(0);
      expect(result.testPassRate).toBe(0);
    });

    it('should handle malformed output gracefully', () => {
      const mockOutput = 'Some random output without test data';

      expect(() => {
        parseTestResults(mockOutput);
      }).toThrow(/Could not parse test output/i);
    });

    it('should extract individual test failure count', () => {
      const mockOutput = `
        Tests: 48 passed, 7 failed, 55 total
      `;

      const result = parseTestResults(mockOutput);

      expect(result.passedTests).toBe(48);
      expect(result.failedTests).toBe(7);
      expect(result.totalTests).toBe(55);
    });

    it('should handle percentage format in output', () => {
      const mockOutput = `
        Overall Pass Rate: 92%
        Tests: 92 passed, 8 failed, 100 total
      `;

      const result = parseTestResults(mockOutput);

      expect(result.testPassRate).toBeCloseTo(0.92, 5);
    });
  });

  describe('Real World Scenarios', () => {
    it('should parse complex multi-suite Jest output', () => {
      const realJestOutput = `
        PASS  tests/unit/services/auth.test.ts (2.345 s)
        PASS  tests/unit/services/user.test.ts (1.234 s)
        PASS  tests/integration/api/auth-endpoints.test.ts (3.456 s)
        FAIL  tests/integration/database/migration.test.ts (0.789 s)

        FAILED tests/integration/database/migration.test.ts
          ● Test suite failed to compile

        Test Suites: 3 passed, 1 failed, 4 total
        Tests: 47 passed, 2 failed, 49 total
        Snapshots: 0 total
        Time: 8.456 s
        Ran all test suites.
      `;

      const result = parseTestResults(realJestOutput);

      expect(result.passedTests).toBe(47);
      expect(result.failedTests).toBe(2);
      expect(result.totalTests).toBe(49);
      expect(result.testPassRate).toBeCloseTo(47 / 49, 3);
    });

    it('should validate test pass rate matches passed/total', () => {
      const output = `Tests: 156 passed, 44 failed, 200 total`;

      const result = parseTestResults(output);

      const expectedRate = 156 / 200;
      expect(result.testPassRate).toBeCloseTo(expectedRate, 5);
      expect(result.passedTests + result.failedTests).toBe(result.totalTests);
    });
  });

  describe('Simulation Detection', () => {
    it('should NOT contain simulated flag after parsing real data', () => {
      const output = `Tests: 15 passed, 3 failed, 18 total`;

      const result = parseTestResults(output);

      expect('simulated' in result).toBe(false);
      expect('simulationMetadata' in result).toBe(false);
    });

    it('should have correct data types', () => {
      const output = `Tests: 42 passed, 8 failed, 50 total`;

      const result = parseTestResults(output);

      expect(typeof result.passedTests).toBe('number');
      expect(typeof result.totalTests).toBe('number');
      expect(typeof result.failedTests).toBe('number');
      expect(typeof result.testPassRate).toBe('number');
    });
  });
});
