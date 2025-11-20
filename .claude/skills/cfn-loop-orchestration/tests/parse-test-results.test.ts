import { parseTestResults } from '../src/helpers/parse-test-results';

describe('parseTestResults', () => {
  describe('Jest parser', () => {
    it('should parse passing Jest output', () => {
      const jestOutput = `
        PASS tests/example.test.ts
        ✓ test case 1 (5 ms)
        ✓ test case 2 (3 ms)

        Test Suites: 1 passed, 1 total
        Tests:       2 passed, 2 total
        Time:        1.234 s
      `;

      const result = parseTestResults('jest', jestOutput);

      expect(result.framework).toBe('jest');
      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.passRate).toBeCloseTo(1.0, 4);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should parse failing Jest output', () => {
      const jestOutput = `
        FAIL tests/example.test.ts
        ✓ test case 1 (5 ms)
        ✕ test case 2 (3 ms)
        ✕ test case 3 (2 ms)

        ● test case 2
        ● test case 3

        Test Suites: 1 failed, 1 total
        Tests:       1 passed, 2 failed, 3 total
        Time:        0.567 s
      `;

      const result = parseTestResults('jest', jestOutput);

      expect(result.framework).toBe('jest');
      expect(result.total).toBe(3);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.passRate).toBeCloseTo(0.3333, 4);
      expect(result.failedTestNames).toEqual(['test case 2', 'test case 3']);
    });

    it('should handle Jest output with skipped tests', () => {
      const jestOutput = `
        Tests:       2 passed, 1 skipped, 3 total
      `;

      const result = parseTestResults('jest', jestOutput);

      expect(result.total).toBe(3);
      expect(result.passed).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.passRate).toBeCloseTo(0.6667, 4);
    });

    it('should handle invalid Jest output', () => {
      const result = parseTestResults('jest', 'invalid output');

      expect(result.total).toBe(0);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.passRate).toBe(0.0);
    });
  });

  describe('Mocha parser', () => {
    it('should parse passing Mocha output', () => {
      const mochaOutput = `
        ✓ test case 1
        ✓ test case 2

        2 passing (150ms)
      `;

      const result = parseTestResults('mocha', mochaOutput);

      expect(result.framework).toBe('mocha');
      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.passRate).toBe(1.0);
      expect(result.durationMs).toBe(150);
    });

    it('should parse failing Mocha output', () => {
      const mochaOutput = `
        ✓ test case 1
        1) test case 2: AssertionError
        2) test case 3: Error

        1 passing (100ms)
        2 failing
      `;

      const result = parseTestResults('mocha', mochaOutput);

      expect(result.total).toBe(3);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.passRate).toBeCloseTo(0.3333, 4);
      expect(result.failedTestNames).toHaveLength(2);
    });

    it('should parse Mocha output with pending tests', () => {
      const mochaOutput = `
        2 passing (50ms)
        1 pending
      `;

      const result = parseTestResults('mocha', mochaOutput);

      expect(result.total).toBe(3);
      expect(result.passed).toBe(2);
      expect(result.skipped).toBe(1);
    });

    it('should handle time in seconds', () => {
      const mochaOutput = `
        5 passing (2.5s)
      `;

      const result = parseTestResults('mocha', mochaOutput);

      expect(result.durationMs).toBe(2500);
    });
  });

  describe('Pytest parser', () => {
    it('should parse passing pytest output', () => {
      const pytestOutput = `
        test_example.py::test_case_1 PASSED
        test_example.py::test_case_2 PASSED

        ====== 2 passed in 0.45s ======
      `;

      const result = parseTestResults('pytest', pytestOutput);

      expect(result.framework).toBe('pytest');
      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.passRate).toBe(1.0);
      expect(result.durationMs).toBe(450);
    });

    it('should parse failing pytest output', () => {
      const pytestOutput = `
        test_example.py::test_case_1 PASSED
        test_example.py::test_case_2 FAILED

        FAILED test_example.py::test_case_2

        1 passed, 1 failed in 1.23s
      `;

      const result = parseTestResults('pytest', pytestOutput);

      expect(result.total).toBe(2);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.passRate).toBe(0.5);
      expect(result.failedTestNames).toContain('test_example.py::test_case_2');
    });

    it('should parse pytest output with skipped tests', () => {
      const pytestOutput = `
        2 passed, 1 skipped in 0.5s
      `;

      const result = parseTestResults('pytest', pytestOutput);

      expect(result.total).toBe(3);
      expect(result.skipped).toBe(1);
    });
  });

  describe('TAP parser', () => {
    it('should parse passing TAP output', () => {
      const tapOutput = `
        1..3
        ok 1 - test case 1
        ok 2 - test case 2
        ok 3 - test case 3
      `;

      const result = parseTestResults('tap', tapOutput);

      expect(result.framework).toBe('tap');
      expect(result.total).toBe(3);
      expect(result.passed).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.passRate).toBe(1.0);
    });

    it('should parse failing TAP output', () => {
      const tapOutput = `
        1..4
        ok 1 - test case 1
        not ok 2 - test case 2
        ok 3 - test case 3
        not ok 4 - test case 4
      `;

      const result = parseTestResults('tap', tapOutput);

      expect(result.total).toBe(4);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(2);
      expect(result.passRate).toBe(0.5);
      expect(result.failedTestNames).toHaveLength(2);
    });

    it('should parse TAP output with skipped tests', () => {
      const tapOutput = `
        1..3
        ok 1 - test case 1
        ok 2 - test case 2 # SKIP not implemented
        ok 3 - test case 3
      `;

      const result = parseTestResults('tap', tapOutput);

      expect(result.total).toBe(3);
      expect(result.passed).toBe(2);
      expect(result.skipped).toBe(1);
    });
  });

  describe('Go test parser', () => {
    it('should parse passing Go test output', () => {
      const goOutput = `
        --- PASS: TestExample1 (0.00s)
        --- PASS: TestExample2 (0.01s)
        PASS
        ok  	example/package	0.123s
      `;

      const result = parseTestResults('go', goOutput);

      expect(result.framework).toBe('go');
      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.passRate).toBe(1.0);
      expect(result.durationMs).toBe(123);
    });

    it('should parse failing Go test output', () => {
      const goOutput = `
        --- PASS: TestExample1 (0.00s)
        --- FAIL: TestExample2 (0.01s)
        --- FAIL: TestExample3 (0.00s)
        FAIL
        ok  	example/package	0.234s
      `;

      const result = parseTestResults('go', goOutput);

      expect(result.total).toBe(3);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.passRate).toBeCloseTo(0.3333, 4);
      expect(result.failedTestNames).toHaveLength(2);
    });

    it('should parse Go output with skipped tests', () => {
      const goOutput = `
        --- PASS: TestExample1 (0.00s)
        --- SKIP: TestExample2 (0.00s)
        ok  	example/package	0.1s
      `;

      const result = parseTestResults('go', goOutput);

      expect(result.total).toBe(2);
      expect(result.passed).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  describe('Auto-detect framework', () => {
    it('should auto-detect Jest output', () => {
      const jestOutput = `
        Test Suites: 1 passed, 1 total
        Tests:       5 passed, 5 total
      `;

      const result = parseTestResults('auto', jestOutput);

      expect(result.framework).toBe('jest');
      expect(result.total).toBe(5);
    });

    it('should auto-detect Mocha output', () => {
      const mochaOutput = `
        3 passing (100ms)
        1 failing
      `;

      const result = parseTestResults('auto', mochaOutput);

      expect(result.framework).toBe('mocha');
      expect(result.total).toBe(4);
    });

    it('should auto-detect pytest output', () => {
      const pytestOutput = `
        ====== 5 passed in 1.2s ======
      `;

      const result = parseTestResults('auto', pytestOutput);

      expect(result.framework).toBe('pytest');
    });

    it('should auto-detect TAP output', () => {
      const tapOutput = `
        1..10
        ok 1 - test
      `;

      const result = parseTestResults('auto', tapOutput);

      expect(result.framework).toBe('tap');
    });

    it('should auto-detect Go test output', () => {
      const goOutput = `
        --- PASS: TestExample (0.00s)
        PASS
      `;

      const result = parseTestResults('auto', goOutput);

      expect(result.framework).toBe('go');
    });

    it('should return unknown for unrecognized output', () => {
      const result = parseTestResults('auto', 'completely random output');

      expect(result.framework).toBe('unknown');
      expect(result.total).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty output', () => {
      const result = parseTestResults('jest', '');

      expect(result.total).toBe(0);
      expect(result.passRate).toBe(0.0);
    });

    it('should handle zero tests', () => {
      const jestOutput = `
        Tests:       0 total
      `;

      const result = parseTestResults('jest', jestOutput);

      expect(result.total).toBe(0);
      expect(result.passRate).toBe(0.0);
    });

    it('should preserve raw output', () => {
      const rawOutput = 'test output here';
      const result = parseTestResults('jest', rawOutput);

      expect(result.raw).toBe(rawOutput);
    });
  });
});
