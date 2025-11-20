/**
 * Edge case tests for gate-check helper
 * Comprehensive coverage for gate threshold validation
 */

import { gateCheck, getModeThreshold, GateCheckParams, Mode } from '../src/helpers/gate-check';

describe('gate-check edge cases', () => {
  describe('boundary conditions', () => {
    it('should pass at exactly threshold - MVP (0.70)', () => {
      const result = gateCheck({ passRate: 0.70, mode: 'mvp' });

      expect(result.passed).toBe(true);
      expect(result.passRate).toBe(0.70);
      expect(result.threshold).toBe(0.70);
      expect(result.gap).toBe(0);
    });

    it('should pass at exactly threshold - Standard (0.95)', () => {
      const result = gateCheck({ passRate: 0.95, mode: 'standard' });

      expect(result.passed).toBe(true);
      expect(result.gap).toBe(0);
    });

    it('should pass at exactly threshold - Enterprise (0.98)', () => {
      const result = gateCheck({ passRate: 0.98, mode: 'enterprise' });

      expect(result.passed).toBe(true);
      expect(result.gap).toBe(0);
    });

    it('should fail just below threshold - MVP (0.6999)', () => {
      const result = gateCheck({ passRate: 0.6999, mode: 'mvp' });

      expect(result.passed).toBe(false);
      expect(result.gap).toBeCloseTo(0.0001, 4);
    });

    it('should fail just below threshold - Standard (0.9499)', () => {
      const result = gateCheck({ passRate: 0.9499, mode: 'standard' });

      expect(result.passed).toBe(false);
      expect(result.gap).toBeCloseTo(0.0001, 4);
    });

    it('should fail just below threshold - Enterprise (0.9799)', () => {
      const result = gateCheck({ passRate: 0.9799, mode: 'enterprise' });

      expect(result.passed).toBe(false);
      expect(result.gap).toBeCloseTo(0.0001, 4);
    });

    it('should pass just above threshold - MVP (0.7001)', () => {
      const result = gateCheck({ passRate: 0.7001, mode: 'mvp' });

      expect(result.passed).toBe(true);
      expect(result.gap).toBeCloseTo(-0.0001, 4);
    });
  });

  describe('extreme values', () => {
    it('should handle 0% pass rate', () => {
      const result = gateCheck({ passRate: 0, mode: 'mvp' });

      expect(result.passed).toBe(false);
      expect(result.passRate).toBe(0);
      expect(result.gap).toBe(0.7);
    });

    it('should handle 100% pass rate', () => {
      const result = gateCheck({ passRate: 1.0, mode: 'enterprise' });

      expect(result.passed).toBe(true);
      expect(result.passRate).toBe(1.0);
      expect(result.gap).toBe(-0.02);
    });

    it('should handle negative pass rate', () => {
      const result = gateCheck({ passRate: -0.5, mode: 'mvp' });

      expect(result.passed).toBe(false);
      expect(result.gap).toBeGreaterThan(0);
    });

    it('should handle pass rate > 1.0', () => {
      const result = gateCheck({ passRate: 1.5, mode: 'mvp' });

      expect(result.passed).toBe(true);
      expect(result.gap).toBeLessThan(0);
    });
  });

  describe('custom threshold override', () => {
    it('should use custom threshold instead of mode threshold', () => {
      const result = gateCheck({
        passRate: 0.85,
        threshold: 0.90,
        mode: 'mvp', // Mode is 0.70 but threshold is 0.90
      });

      expect(result.passed).toBe(false);
      expect(result.threshold).toBe(0.90);
      expect(result.gap).toBeCloseTo(0.05, 4);
    });

    it('should accept custom threshold of 0', () => {
      const result = gateCheck({
        passRate: 0.5,
        threshold: 0,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0);
    });

    it('should accept custom threshold of 1.0', () => {
      const result = gateCheck({
        passRate: 0.99,
        threshold: 1.0,
        mode: 'mvp',
      });

      expect(result.passed).toBe(false);
      expect(result.threshold).toBe(1.0);
    });

    it('should accept custom threshold > 1.0', () => {
      const result = gateCheck({
        passRate: 1.5,
        threshold: 2.0,
        mode: 'standard',
      });

      expect(result.passed).toBe(false);
    });

    it('should accept custom negative threshold', () => {
      const result = gateCheck({
        passRate: 0,
        threshold: -0.5,
        mode: 'enterprise',
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('floating point precision', () => {
    it('should handle floating point arithmetic correctly', () => {
      const result = gateCheck({ passRate: 0.1 + 0.2, mode: 'mvp' });

      expect(result.passRate).toBeCloseTo(0.3, 10);
      expect(result.gap).toBeCloseTo(0.4, 4);
    });

    it('should round gap to 4 decimal places', () => {
      const result = gateCheck({ passRate: 0.123456789, mode: 'mvp' });

      expect(result.gap.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(4);
    });

    it('should handle very small differences', () => {
      const result = gateCheck({ passRate: 0.7000001, mode: 'mvp' });

      expect(result.passed).toBe(true);
      expect(result.gap).toBeCloseTo(-0.0000001, 4);
    });

    it('should handle very large numbers', () => {
      const result = gateCheck({ passRate: 1000000, mode: 'mvp' });

      expect(result.passed).toBe(true);
      expect(result.gap).toBeLessThan(0);
    });
  });

  describe('gap calculation', () => {
    it('should calculate positive gap when failing', () => {
      const result = gateCheck({ passRate: 0.5, mode: 'mvp' });

      expect(result.gap).toBe(0.2); // 0.70 - 0.50 = 0.20
      expect(result.gap).toBeGreaterThan(0);
    });

    it('should calculate negative gap when passing above threshold', () => {
      const result = gateCheck({ passRate: 0.9, mode: 'mvp' });

      expect(result.gap).toBe(-0.2); // 0.70 - 0.90 = -0.20
      expect(result.gap).toBeLessThan(0);
    });

    it('should calculate zero gap at exact threshold', () => {
      const result = gateCheck({ passRate: 0.95, mode: 'standard' });

      expect(result.gap).toBe(0);
    });

    it('should calculate gap with custom threshold', () => {
      const result = gateCheck({
        passRate: 0.85,
        threshold: 0.80,
        mode: 'mvp',
      });

      expect(result.gap).toBe(-0.05); // 0.80 - 0.85 = -0.05
    });
  });

  describe('reason generation', () => {
    it('should generate pass reason for MVP mode', () => {
      const result = gateCheck({ passRate: 0.8, mode: 'mvp' });

      expect(result.reason).toContain('Gate PASSED');
      expect(result.reason).toContain('0.8000');
      expect(result.reason).toContain('0.7000');
      expect(result.reason).toContain('mvp mode');
    });

    it('should generate fail reason for Standard mode', () => {
      const result = gateCheck({ passRate: 0.9, mode: 'standard' });

      expect(result.reason).toContain('Gate FAILED');
      expect(result.reason).toContain('0.9000');
      expect(result.reason).toContain('0.9500');
      expect(result.reason).toContain('standard mode');
    });

    it('should generate pass reason for Enterprise mode', () => {
      const result = gateCheck({ passRate: 0.99, mode: 'enterprise' });

      expect(result.reason).toContain('Gate PASSED');
      expect(result.reason).toContain('enterprise mode');
    });

    it('should format numbers to 4 decimal places in reason', () => {
      const result = gateCheck({ passRate: 0.123456789, mode: 'mvp' });

      expect(result.reason).toMatch(/0\.\d{4}/);
    });

    it('should include custom threshold in reason', () => {
      const result = gateCheck({
        passRate: 0.85,
        threshold: 0.90,
        mode: 'mvp',
      });

      expect(result.reason).toContain('0.9000'); // Custom threshold
    });
  });

  describe('getModeThreshold', () => {
    it('should return correct threshold for MVP', () => {
      expect(getModeThreshold('mvp')).toBe(0.70);
    });

    it('should return correct threshold for Standard', () => {
      expect(getModeThreshold('standard')).toBe(0.95);
    });

    it('should return correct threshold for Enterprise', () => {
      expect(getModeThreshold('enterprise')).toBe(0.98);
    });

    it('should return number type', () => {
      const modes: Mode[] = ['mvp', 'standard', 'enterprise'];
      modes.forEach((mode) => {
        expect(typeof getModeThreshold(mode)).toBe('number');
      });
    });

    it('should return values in ascending order', () => {
      const mvp = getModeThreshold('mvp');
      const standard = getModeThreshold('standard');
      const enterprise = getModeThreshold('enterprise');

      expect(mvp).toBeLessThan(standard);
      expect(standard).toBeLessThan(enterprise);
    });
  });

  describe('result structure', () => {
    it('should return all required fields', () => {
      const result = gateCheck({ passRate: 0.8, mode: 'standard' });

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('passRate');
      expect(result).toHaveProperty('threshold');
      expect(result).toHaveProperty('mode');
      expect(result).toHaveProperty('gap');
      expect(result).toHaveProperty('reason');
    });

    it('should have correct types for all fields', () => {
      const result = gateCheck({ passRate: 0.8, mode: 'standard' });

      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.passRate).toBe('number');
      expect(typeof result.threshold).toBe('number');
      expect(typeof result.mode).toBe('string');
      expect(typeof result.gap).toBe('number');
      expect(typeof result.reason).toBe('string');
    });

    it('should preserve input passRate exactly', () => {
      const inputRate = 0.123456789;
      const result = gateCheck({ passRate: inputRate, mode: 'mvp' });

      expect(result.passRate).toBe(inputRate);
    });

    it('should preserve input mode', () => {
      const modes: Mode[] = ['mvp', 'standard', 'enterprise'];
      modes.forEach((mode) => {
        const result = gateCheck({ passRate: 0.8, mode });
        expect(result.mode).toBe(mode);
      });
    });
  });

  describe('mode transitions', () => {
    it('should pass MVP but fail Standard at 0.80', () => {
      const mvpResult = gateCheck({ passRate: 0.80, mode: 'mvp' });
      const standardResult = gateCheck({ passRate: 0.80, mode: 'standard' });

      expect(mvpResult.passed).toBe(true);
      expect(standardResult.passed).toBe(false);
    });

    it('should pass Standard but fail Enterprise at 0.96', () => {
      const standardResult = gateCheck({ passRate: 0.96, mode: 'standard' });
      const enterpriseResult = gateCheck({ passRate: 0.96, mode: 'enterprise' });

      expect(standardResult.passed).toBe(true);
      expect(enterpriseResult.passed).toBe(false);
    });

    it('should fail all modes at 0.50', () => {
      const modes: Mode[] = ['mvp', 'standard', 'enterprise'];
      modes.forEach((mode) => {
        const result = gateCheck({ passRate: 0.50, mode });
        expect(result.passed).toBe(false);
      });
    });

    it('should pass all modes at 1.00', () => {
      const modes: Mode[] = ['mvp', 'standard', 'enterprise'];
      modes.forEach((mode) => {
        const result = gateCheck({ passRate: 1.0, mode });
        expect(result.passed).toBe(true);
      });
    });
  });

  describe('special numeric values', () => {
    it('should handle Infinity', () => {
      const result = gateCheck({ passRate: Infinity, mode: 'mvp' });

      expect(result.passed).toBe(true);
      expect(result.passRate).toBe(Infinity);
    });

    it('should handle -Infinity', () => {
      const result = gateCheck({ passRate: -Infinity, mode: 'mvp' });

      expect(result.passed).toBe(false);
      expect(result.passRate).toBe(-Infinity);
    });

    it('should handle NaN', () => {
      const result = gateCheck({ passRate: NaN, mode: 'mvp' });

      expect(result.passRate).toBeNaN();
      expect(result.passed).toBe(false); // NaN >= threshold is false
    });

    it('should handle very small positive numbers', () => {
      const result = gateCheck({ passRate: Number.MIN_VALUE, mode: 'mvp' });

      expect(result.passed).toBe(false);
      expect(result.passRate).toBeGreaterThan(0);
    });

    it('should handle very large positive numbers', () => {
      const result = gateCheck({ passRate: Number.MAX_VALUE, mode: 'enterprise' });

      expect(result.passed).toBe(true);
    });
  });

  describe('parameter validation', () => {
    it('should handle missing optional threshold', () => {
      const params: GateCheckParams = { passRate: 0.8, mode: 'mvp' };

      expect(() => gateCheck(params)).not.toThrow();
    });

    it('should handle undefined threshold explicitly', () => {
      const params: GateCheckParams = {
        passRate: 0.8,
        threshold: undefined,
        mode: 'mvp',
      };

      const result = gateCheck(params);
      expect(result.threshold).toBe(0.70); // Should use mode threshold
    });

    it('should handle threshold of 0 (falsy but valid)', () => {
      const result = gateCheck({
        passRate: 0.5,
        threshold: 0,
        mode: 'mvp',
      });

      expect(result.threshold).toBe(0);
      expect(result.passed).toBe(true);
    });
  });
});
