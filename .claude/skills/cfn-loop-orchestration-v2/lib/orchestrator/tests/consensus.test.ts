/**
 * Consensus Collection and Validation Tests
 * Tests for collecting Loop 2 validator scores and checking thresholds
 */

import { collectConsensus, validateConsensus } from '../src/helpers/consensus';

describe('consensus', () => {
  describe('collectConsensus', () => {
    it('should collect scores from multiple validators', () => {
      const scores = [0.92, 0.95, 0.88];
      const result = collectConsensus(scores);

      expect(result.scores).toEqual(scores);
      expect(result.average).toBeCloseTo(0.917, 2);
      expect(result.count).toBe(3);
      expect(result.min).toBe(0.88);
      expect(result.max).toBe(0.95);
    });

    it('should handle single validator', () => {
      const scores = [0.85];
      const result = collectConsensus(scores);

      expect(result.scores).toEqual([0.85]);
      expect(result.average).toBe(0.85);
      expect(result.count).toBe(1);
      expect(result.min).toBe(0.85);
      expect(result.max).toBe(0.85);
    });

    it('should reject empty scores array', () => {
      expect(() => collectConsensus([])).toThrow('No consensus scores provided');
    });

    it('should reject invalid scores (negative)', () => {
      expect(() => collectConsensus([-0.5, 0.9])).toThrow('Invalid consensus score');
    });

    it('should reject invalid scores (>1.0)', () => {
      expect(() => collectConsensus([0.9, 1.5])).toThrow('Invalid consensus score');
    });

    it('should handle edge case scores (0.0 and 1.0)', () => {
      const scores = [0.0, 1.0, 0.5];
      const result = collectConsensus(scores);

      expect(result.average).toBeCloseTo(0.5, 2);
      expect(result.min).toBe(0.0);
      expect(result.max).toBe(1.0);
    });

    it('should calculate correct average for many validators', () => {
      const scores = [0.90, 0.92, 0.88, 0.95, 0.91];
      const result = collectConsensus(scores);

      expect(result.average).toBeCloseTo(0.912, 2);
      expect(result.count).toBe(5);
    });
  });

  describe('validateConsensus', () => {
    it('should pass when average >= threshold', () => {
      const result = validateConsensus({
        average: 0.92,
        threshold: 0.90,
        mode: 'standard'
      });

      expect(result.passed).toBe(true);
      expect(result.average).toBe(0.92);
      expect(result.threshold).toBe(0.90);
      expect(result.gap).toBeCloseTo(0.02, 2);
    });

    it('should fail when average < threshold', () => {
      const result = validateConsensus({
        average: 0.85,
        threshold: 0.90,
        mode: 'standard'
      });

      expect(result.passed).toBe(false);
      expect(result.gap).toBeCloseTo(-0.05, 2);
    });

    it('should use mvp mode threshold (0.80)', () => {
      const result = validateConsensus({
        average: 0.82,
        mode: 'mvp'
      });

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.80);
      expect(result.mode).toBe('mvp');
    });

    it('should use standard mode threshold (0.90)', () => {
      const result = validateConsensus({
        average: 0.89,
        mode: 'standard'
      });

      expect(result.passed).toBe(false);
      expect(result.threshold).toBe(0.90);
      expect(result.mode).toBe('standard');
    });

    it('should use enterprise mode threshold (0.95)', () => {
      const result = validateConsensus({
        average: 0.94,
        mode: 'enterprise'
      });

      expect(result.passed).toBe(false);
      expect(result.threshold).toBe(0.95);
      expect(result.mode).toBe('enterprise');
    });

    it('should allow explicit threshold override', () => {
      const result = validateConsensus({
        average: 0.88,
        threshold: 0.85,
        mode: 'standard'
      });

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.85); // Uses explicit, not mode default
    });

    it('should handle exact threshold match', () => {
      const result = validateConsensus({
        average: 0.90,
        threshold: 0.90,
        mode: 'standard'
      });

      expect(result.passed).toBe(true);
      expect(result.gap).toBe(0);
    });
  });
});
