import { gateCheck, GateCheckResult, Mode } from '../src/helpers/gate-check';

describe('gateCheck', () => {
  describe('Basic gate logic', () => {
    it('should pass gate when pass rate >= threshold', () => {
      const result = gateCheck({
        passRate: 0.96,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
      expect(result.passRate).toBe(0.96);
      expect(result.threshold).toBe(0.95);
      expect(result.mode).toBe('standard');
      expect(result.reason).toContain('0.96');
      expect(result.reason).toContain('0.95');
    });

    it('should fail gate when pass rate < threshold', () => {
      const result = gateCheck({
        passRate: 0.85,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.passed).toBe(false);
      expect(result.passRate).toBe(0.85);
      expect(result.threshold).toBe(0.95);
      expect(result.gap).toBeCloseTo(0.10, 2);
    });

    it('should pass gate when pass rate equals threshold', () => {
      const result = gateCheck({
        passRate: 0.95,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle perfect pass rate', () => {
      const result = gateCheck({
        passRate: 1.0,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
      expect(result.gap).toBeCloseTo(-0.05, 2);
    });

    it('should handle zero pass rate', () => {
      const result = gateCheck({
        passRate: 0.0,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.passed).toBe(false);
      expect(result.gap).toBeCloseTo(0.95, 2);
    });
  });

  describe('Mode-specific thresholds', () => {
    it('should use MVP threshold (0.70)', () => {
      const result = gateCheck({
        passRate: 0.75,
        mode: 'mvp',
      });

      expect(result.threshold).toBe(0.70);
      expect(result.passed).toBe(true);
    });

    it('should use Standard threshold (0.95)', () => {
      const result = gateCheck({
        passRate: 0.96,
        mode: 'standard',
      });

      expect(result.threshold).toBe(0.95);
      expect(result.passed).toBe(true);
    });

    it('should use Enterprise threshold (0.98)', () => {
      const result = gateCheck({
        passRate: 0.99,
        mode: 'enterprise',
      });

      expect(result.threshold).toBe(0.98);
      expect(result.passed).toBe(true);
    });

    it('should fail MVP mode when below 0.70', () => {
      const result = gateCheck({
        passRate: 0.65,
        mode: 'mvp',
      });

      expect(result.passed).toBe(false);
      expect(result.threshold).toBe(0.70);
    });

    it('should fail Standard mode when below 0.95', () => {
      const result = gateCheck({
        passRate: 0.90,
        mode: 'standard',
      });

      expect(result.passed).toBe(false);
      expect(result.threshold).toBe(0.95);
    });

    it('should fail Enterprise mode when below 0.98', () => {
      const result = gateCheck({
        passRate: 0.97,
        mode: 'enterprise',
      });

      expect(result.passed).toBe(false);
      expect(result.threshold).toBe(0.98);
    });
  });

  describe('Custom threshold override', () => {
    it('should use custom threshold when provided', () => {
      const result = gateCheck({
        passRate: 0.88,
        threshold: 0.85,
        mode: 'standard',
      });

      expect(result.threshold).toBe(0.85);
      expect(result.passed).toBe(true);
    });

    it('should override mode threshold with custom value', () => {
      const result = gateCheck({
        passRate: 0.92,
        threshold: 0.90,
        mode: 'enterprise', // Would be 0.98 without override
      });

      expect(result.threshold).toBe(0.90);
      expect(result.passed).toBe(true);
    });
  });

  describe('Gap calculation', () => {
    it('should calculate gap correctly when failing', () => {
      const result = gateCheck({
        passRate: 0.80,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.gap).toBeCloseTo(0.15, 2);
    });

    it('should have zero gap when passing exactly at threshold', () => {
      const result = gateCheck({
        passRate: 0.95,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.gap).toBeCloseTo(0.0, 2);
    });

    it('should have negative gap when exceeding threshold', () => {
      const result = gateCheck({
        passRate: 1.0,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.gap).toBeCloseTo(-0.05, 2);
    });
  });

  describe('Reason generation', () => {
    it('should provide clear reason for passing', () => {
      const result = gateCheck({
        passRate: 0.98,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.reason).toMatch(/pass/i);
      expect(result.reason).toContain('0.98');
      expect(result.reason).toContain('0.95');
    });

    it('should provide clear reason for failing', () => {
      const result = gateCheck({
        passRate: 0.85,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.reason).toMatch(/fail/i);
      expect(result.reason).toContain('0.85');
      expect(result.reason).toContain('0.95');
    });

    it('should include mode in reason', () => {
      const result = gateCheck({
        passRate: 0.96,
        mode: 'standard',
      });

      expect(result.reason).toMatch(/standard/i);
    });
  });

  describe('Edge cases', () => {
    it('should handle very small differences', () => {
      const result = gateCheck({
        passRate: 0.9501,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.passed).toBe(true);
    });

    it('should handle floating point precision', () => {
      const result = gateCheck({
        passRate: 0.9499999,
        threshold: 0.95,
        mode: 'standard',
      });

      expect(result.passed).toBe(false);
    });

    it('should handle threshold at boundaries', () => {
      const result1 = gateCheck({
        passRate: 1.0,
        threshold: 1.0,
        mode: 'standard',
      });

      const result2 = gateCheck({
        passRate: 0.0,
        threshold: 0.0,
        mode: 'standard',
      });

      expect(result1.passed).toBe(true);
      expect(result2.passed).toBe(true);
    });
  });

  describe('Type safety', () => {
    it('should enforce Mode type', () => {
      const modes: Mode[] = ['mvp', 'standard', 'enterprise'];

      modes.forEach((mode) => {
        const result = gateCheck({
          passRate: 1.0,
          mode,
        });

        expect(result.mode).toBe(mode);
      });
    });

    it('should return properly typed GateCheckResult', () => {
      const result: GateCheckResult = gateCheck({
        passRate: 0.96,
        mode: 'standard',
      });

      // Type assertions
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.passRate).toBe('number');
      expect(typeof result.threshold).toBe('number');
      expect(typeof result.mode).toBe('string');
      expect(typeof result.reason).toBe('string');
      expect(typeof result.gap).toBe('number');
    });
  });

  describe('Default mode', () => {
    it('should default to standard mode when mode not specified', () => {
      const result = gateCheck({
        passRate: 0.96,
        mode: 'standard',
      });

      expect(result.mode).toBe('standard');
      expect(result.threshold).toBe(0.95);
    });
  });

  describe('Boundary testing', () => {
    it('should handle MVP boundary (0.70)', () => {
      const pass = gateCheck({ passRate: 0.70, mode: 'mvp' });
      const fail = gateCheck({ passRate: 0.6999, mode: 'mvp' });

      expect(pass.passed).toBe(true);
      expect(fail.passed).toBe(false);
    });

    it('should handle Standard boundary (0.95)', () => {
      const pass = gateCheck({ passRate: 0.95, mode: 'standard' });
      const fail = gateCheck({ passRate: 0.9499, mode: 'standard' });

      expect(pass.passed).toBe(true);
      expect(fail.passed).toBe(false);
    });

    it('should handle Enterprise boundary (0.98)', () => {
      const pass = gateCheck({ passRate: 0.98, mode: 'enterprise' });
      const fail = gateCheck({ passRate: 0.9799, mode: 'enterprise' });

      expect(pass.passed).toBe(true);
      expect(fail.passed).toBe(false);
    });
  });
});
