/**
 * Timeout Calculator Tests
 * Tests for calculating mode and phase-specific timeouts
 */

import { calculateTimeout, Mode } from '../src/helpers/timeout-calculator';

describe('timeout-calculator', () => {
  describe('mode-based timeouts', () => {
    it('should calculate timeout for mvp mode', () => {
      const timeout = calculateTimeout({ mode: 'mvp' });
      expect(timeout).toBe(1800); // 30 min
    });

    it('should calculate timeout for standard mode', () => {
      const timeout = calculateTimeout({ mode: 'standard' });
      expect(timeout).toBe(3600); // 60 min
    });

    it('should calculate timeout for enterprise mode', () => {
      const timeout = calculateTimeout({ mode: 'enterprise' });
      expect(timeout).toBe(7200); // 120 min
    });
  });

  describe('phase multipliers', () => {
    it('should apply phase-1 multiplier (1x)', () => {
      const timeout = calculateTimeout({ mode: 'standard', phase: 'phase-1' });
      expect(timeout).toBe(3600); // 60 min * 1.0
    });

    it('should apply phase-2 multiplier (1.5x)', () => {
      const timeout = calculateTimeout({ mode: 'standard', phase: 'phase-2' });
      expect(timeout).toBe(5400); // 60 min * 1.5
    });

    it('should apply phase-3 multiplier (2x)', () => {
      const timeout = calculateTimeout({ mode: 'standard', phase: 'phase-3' });
      expect(timeout).toBe(7200); // 60 min * 2.0
    });

    it('should apply phase-4 multiplier (1.0x)', () => {
      const timeout = calculateTimeout({ mode: 'standard', phase: 'phase-4' });
      expect(timeout).toBe(3600); // 60 min * 1.0
    });
  });

  describe('combined mode and phase calculations', () => {
    it('should calculate mvp mode with phase-2', () => {
      const timeout = calculateTimeout({ mode: 'mvp', phase: 'phase-2' });
      expect(timeout).toBe(2700); // 30 min * 1.5
    });

    it('should calculate mvp mode with phase-3', () => {
      const timeout = calculateTimeout({ mode: 'mvp', phase: 'phase-3' });
      expect(timeout).toBe(3600); // 30 min * 2.0
    });

    it('should calculate enterprise mode with phase-2', () => {
      const timeout = calculateTimeout({ mode: 'enterprise', phase: 'phase-2' });
      expect(timeout).toBe(10800); // 120 min * 1.5
    });

    it('should calculate enterprise mode with phase-3', () => {
      const timeout = calculateTimeout({ mode: 'enterprise', phase: 'phase-3' });
      expect(timeout).toBe(14400); // 120 min * 2.0
    });
  });

  describe('edge cases', () => {
    it('should use base timeout when no phase specified', () => {
      const timeout = calculateTimeout({ mode: 'standard' });
      expect(timeout).toBe(3600); // No multiplier
    });

    it('should use base timeout for unknown phase', () => {
      const timeout = calculateTimeout({ mode: 'standard', phase: 'unknown-phase' });
      expect(timeout).toBe(3600); // Default multiplier = 1.0
    });

    it('should handle phase with different casing', () => {
      const timeout = calculateTimeout({ mode: 'standard', phase: 'PHASE-2' });
      expect(timeout).toBe(5400); // Case-insensitive
    });
  });

  describe('timeout consistency', () => {
    it('should return same timeout for same inputs', () => {
      const timeout1 = calculateTimeout({ mode: 'standard', phase: 'phase-2' });
      const timeout2 = calculateTimeout({ mode: 'standard', phase: 'phase-2' });
      expect(timeout1).toBe(timeout2);
    });

    it('should return integer values', () => {
      const modes: Mode[] = ['mvp', 'standard', 'enterprise'];
      const phases = ['phase-1', 'phase-2', 'phase-3', 'phase-4'];

      modes.forEach(mode => {
        phases.forEach(phase => {
          const timeout = calculateTimeout({ mode, phase });
          expect(Number.isInteger(timeout)).toBe(true);
        });
      });
    });
  });

  describe('timeout ranges', () => {
    it('should have minimum timeout of 1800 seconds (30 min)', () => {
      const timeout = calculateTimeout({ mode: 'mvp' });
      expect(timeout).toBeGreaterThanOrEqual(1800);
    });

    it('should have maximum timeout of 14400 seconds (240 min)', () => {
      const timeout = calculateTimeout({ mode: 'enterprise', phase: 'phase-3' });
      expect(timeout).toBeLessThanOrEqual(14400);
    });
  });
});
