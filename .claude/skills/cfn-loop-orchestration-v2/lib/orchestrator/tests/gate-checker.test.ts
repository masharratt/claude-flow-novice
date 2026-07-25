/**
 * Unit tests for gate-checker module
 * Validates gate threshold logic and test result evaluation
 */

import { GateChecker } from '../src/gate-checker/gate-checker';
import { TestResult, ExecutionMode, GateResult } from '../src/types';

describe('gate-checker', () => {
  describe('checkGate', () => {
    describe('MVP mode (70% threshold)', () => {
      const mode: ExecutionMode = 'mvp';

      it('should pass gate at exactly 70%', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 7, fail: 3, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, mode);

        expect(result.passed).toBe(true);
        expect(result.passRate).toBe(0.7);
        expect(result.threshold).toBe(0.7);
      });

      it('should pass gate above 70%', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 8, fail: 2, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, mode);

        expect(result.passed).toBe(true);
        expect(result.passRate).toBe(0.8);
      });

      it('should fail gate below 70%', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 6, fail: 4, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, mode);

        expect(result.passed).toBe(false);
        expect(result.passRate).toBe(0.6);
      });

      it('should average multiple agent results', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 10, fail: 0, skip: 0 }], // 100%
          ['agent2', { pass: 4, fail: 6, skip: 0 }], // 40%
        ]);

        const result = GateChecker.checkGate(testResults, mode);

        expect(result.passRate).toBe(0.7); // Average of 100% and 40%
        expect(result.passed).toBe(true);
      });
    });

    describe('Standard mode (95% threshold)', () => {
      const mode: ExecutionMode = 'standard';

      it('should pass gate at exactly 95%', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 19, fail: 1, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, mode);

        expect(result.passed).toBe(true);
        expect(result.passRate).toBe(0.95);
        expect(result.threshold).toBe(0.95);
      });

      it('should fail gate at 94.9%', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 949, fail: 51, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, mode);

        expect(result.passed).toBe(false);
        expect(result.passRate).toBe(0.949);
      });

      it('should pass gate at 100%', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 100, fail: 0, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, mode);

        expect(result.passed).toBe(true);
        expect(result.passRate).toBe(1.0);
      });
    });

    describe('Enterprise mode (98% threshold)', () => {
      const mode: ExecutionMode = 'enterprise';

      it('should pass gate at exactly 98%', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 98, fail: 2, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, mode);

        expect(result.passed).toBe(true);
        expect(result.passRate).toBe(0.98);
        expect(result.threshold).toBe(0.98);
      });

      it('should fail gate at 97.9%', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 979, fail: 21, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, mode);

        expect(result.passed).toBe(false);
        expect(result.passRate).toBe(0.979);
      });
    });

    describe('edge cases', () => {
      it('should handle empty test results', () => {
        const testResults = new Map<string, TestResult>();

        const result = GateChecker.checkGate(testResults, 'mvp');

        expect(result.passed).toBe(false);
        expect(result.passRate).toBe(0);
        expect(result.testResults.size).toBe(0);
      });

      it('should handle all tests passing (100%)', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 50, fail: 0, skip: 0 }],
          ['agent2', { pass: 30, fail: 0, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, 'mvp');

        expect(result.passed).toBe(true);
        expect(result.passRate).toBe(1.0);
      });

      it('should handle all tests failing (0%)', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 0, fail: 50, skip: 0 }],
          ['agent2', { pass: 0, fail: 30, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, 'mvp');

        expect(result.passed).toBe(false);
        expect(result.passRate).toBe(0);
      });

      it('should exclude skipped tests from calculation', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 7, fail: 3, skip: 90 }],
        ]);

        const result = GateChecker.checkGate(testResults, 'mvp');

        // 7 pass / (7 pass + 3 fail) = 70%
        expect(result.passRate).toBe(0.7);
      });

      it('should handle single agent with zero total tests', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 0, fail: 0, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, 'mvp');

        expect(result.passRate).toBe(0);
        expect(result.passed).toBe(false);
      });

      it('should handle mixed results across agents', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 10, fail: 0, skip: 0 }], // 100%
          ['agent2', { pass: 0, fail: 10, skip: 0 }], // 0%
          ['agent3', { pass: 5, fail: 5, skip: 0 }], // 50%
        ]);

        const result = GateChecker.checkGate(testResults, 'mvp');

        // Average: (100 + 0 + 50) / 3 = 50%
        expect(result.passRate).toBe(0.5);
        expect(result.passed).toBe(false); // Below 70% threshold
      });

      it('should handle very large test counts', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 10000, fail: 100, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, 'standard');

        expect(result.passRate).toBeCloseTo(0.9901, 4);
        expect(result.passed).toBe(true); // Above 95%
      });

      it('should handle floating point precision', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 2, fail: 1, skip: 0 }], // 66.666...%
        ]);

        const result = GateChecker.checkGate(testResults, 'mvp');

        expect(result.passRate).toBeCloseTo(0.6667, 4);
      });

      it('should preserve test results in gate result', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 5, fail: 5, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, 'mvp');

        expect(result.testResults).toBe(testResults);
        expect(result.testResults.get('agent1')).toEqual({
          pass: 5,
          fail: 5,
          skip: 0,
        });
      });

      it('should handle only skipped tests', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 0, fail: 0, skip: 100 }],
        ]);

        const result = GateChecker.checkGate(testResults, 'mvp');

        expect(result.passRate).toBe(0);
        expect(result.passed).toBe(false);
      });
    });

    describe('result structure', () => {
      it('should return complete GateResult structure', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 8, fail: 2, skip: 0 }],
        ]);

        const result = GateChecker.checkGate(testResults, 'standard');

        expect(result).toEqual<GateResult>({
          passed: expect.any(Boolean),
          passRate: expect.any(Number),
          threshold: expect.any(Number),
          testResults: expect.any(Map),
        });
      });

      it('should include threshold from mode config', () => {
        const testResults = new Map<string, TestResult>([
          ['agent1', { pass: 1, fail: 0, skip: 0 }],
        ]);

        const mvpResult = GateChecker.checkGate(testResults, 'mvp');
        const standardResult = GateChecker.checkGate(testResults, 'standard');
        const enterpriseResult = GateChecker.checkGate(testResults, 'enterprise');

        expect(mvpResult.threshold).toBe(0.7);
        expect(standardResult.threshold).toBe(0.95);
        expect(enterpriseResult.threshold).toBe(0.98);
      });
    });
  });
});
