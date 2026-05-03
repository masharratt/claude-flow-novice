import { estimateCost, TOKENS_PER_DOLLAR, PROHIBITIVE_COST } from '../../../src/planning/goap/cost.js';

describe('TOKENS_PER_DOLLAR', () => {
  it('equals 2_000_000', () => {
    expect(TOKENS_PER_DOLLAR).toBe(2_000_000);
  });
});

describe('PROHIBITIVE_COST', () => {
  it('is exported and greater than 100', () => {
    expect(PROHIBITIVE_COST).toBeGreaterThan(100);
  });
});

describe('estimateCost', () => {
  it('1_000_000 tokens with no time = $0.50', () => {
    const result = estimateCost(1_000_000, 0);
    expect(result).toBeCloseTo(0.5, 5);
  });

  it('2_000_000 tokens = $1.00', () => {
    expect(estimateCost(2_000_000, 0)).toBeCloseTo(1.0, 5);
  });

  it('zero tokens with 60_000ms time applies time penalty', () => {
    const result = estimateCost(0, 60_000);
    expect(result).toBeGreaterThan(0);
  });

  it('risk multiplier scales total cost', () => {
    const base = estimateCost(0, 60_000, 1.0);
    const scaled = estimateCost(0, 60_000, 2.0);
    expect(scaled).toBeCloseTo(base * 2, 5);
  });

  it('risk multiplier defaults to 1.0 (no scaling)', () => {
    const explicit = estimateCost(1_000_000, 0, 1.0);
    const implicit = estimateCost(1_000_000, 0);
    expect(explicit).toBeCloseTo(implicit, 10);
  });
});
