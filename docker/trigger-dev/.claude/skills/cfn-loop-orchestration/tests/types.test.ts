/**
 * Tests for core type definitions and utilities
 */

import {
  isValidExecutionMode,
  isValidProductOwnerDecision,
  getModeConfig,
  calculatePassRate,
  MODE_CONFIG,
} from '../src/types';

describe('Type Guards and Validators', (): void => {
  describe('isValidExecutionMode', (): void => {
    it('should validate standard execution mode', (): void => {
      expect(isValidExecutionMode('standard')).toBe(true);
    });

    it('should validate mvp execution mode', (): void => {
      expect(isValidExecutionMode('mvp')).toBe(true);
    });

    it('should validate enterprise execution mode', (): void => {
      expect(isValidExecutionMode('enterprise')).toBe(true);
    });

    it('should reject invalid execution mode', (): void => {
      expect(isValidExecutionMode('invalid')).toBe(false);
    });

    it('should reject non-string values', (): void => {
      expect(isValidExecutionMode(123)).toBe(false);
      expect(isValidExecutionMode(null)).toBe(false);
      expect(isValidExecutionMode(undefined)).toBe(false);
    });
  });

  describe('isValidProductOwnerDecision', (): void => {
    it('should validate PROCEED decision', (): void => {
      expect(isValidProductOwnerDecision('PROCEED')).toBe(true);
    });

    it('should validate ITERATE decision', (): void => {
      expect(isValidProductOwnerDecision('ITERATE')).toBe(true);
    });

    it('should validate ABORT decision', (): void => {
      expect(isValidProductOwnerDecision('ABORT')).toBe(true);
    });

    it('should reject invalid decision', (): void => {
      expect(isValidProductOwnerDecision('SKIP')).toBe(false);
    });

    it('should be case-sensitive', (): void => {
      expect(isValidProductOwnerDecision('proceed')).toBe(false);
    });
  });
});

describe('Mode Configuration', (): void => {
  describe('getModeConfig', (): void => {
    it('should return MVP config', (): void => {
      const config = getModeConfig('mvp');
      expect(config.testPassRateGate).toBe(0.7);
      expect(config.consensusThreshold).toBe(0.8);
      expect(config.maxIterations).toBe(5);
      expect(config.validatorCount).toBe(2);
    });

    it('should return Standard config', (): void => {
      const config = getModeConfig('standard');
      expect(config.testPassRateGate).toBe(0.95);
      expect(config.consensusThreshold).toBe(0.9);
      expect(config.maxIterations).toBe(10);
      expect(config.validatorCount).toBe(3);
    });

    it('should return Enterprise config', (): void => {
      const config = getModeConfig('enterprise');
      expect(config.testPassRateGate).toBe(0.98);
      expect(config.consensusThreshold).toBe(0.95);
      expect(config.maxIterations).toBe(15);
      expect(config.validatorCount).toBe(5);
    });
  });

  describe('MODE_CONFIG constant', (): void => {
    it('should contain all execution modes', (): void => {
      expect(MODE_CONFIG).toHaveProperty('mvp');
      expect(MODE_CONFIG).toHaveProperty('standard');
      expect(MODE_CONFIG).toHaveProperty('enterprise');
    });

    it('should have valid thresholds', (): void => {
      Object.values(MODE_CONFIG).forEach((config): void => {
        expect(config.testPassRateGate).toBeGreaterThanOrEqual(0);
        expect(config.testPassRateGate).toBeLessThanOrEqual(1);
        expect(config.consensusThreshold).toBeGreaterThanOrEqual(0);
        expect(config.consensusThreshold).toBeLessThanOrEqual(1);
      });
    });
  });
});

describe('Pass Rate Calculation', (): void => {
  it('should calculate pass rate correctly', (): void => {
    const result = { pass: 80, fail: 20 };
    expect(calculatePassRate(result)).toBe(0.8);
  });

  it('should handle zero total with skip', (): void => {
    const result = { pass: 95, fail: 5, skip: 10 };
    // 95 / (95 + 5 + 10) = 95 / 110 = 0.8636...
    expect(calculatePassRate(result)).toBeCloseTo(0.8636, 2);
  });

  it('should return 0 for zero total', (): void => {
    const result = { pass: 0, fail: 0 };
    expect(calculatePassRate(result)).toBe(0);
  });

  it('should handle all passing', (): void => {
    const result = { pass: 100, fail: 0 };
    expect(calculatePassRate(result)).toBe(1);
  });

  it('should handle all failing', (): void => {
    const result = { pass: 0, fail: 100 };
    expect(calculatePassRate(result)).toBe(0);
  });
});
