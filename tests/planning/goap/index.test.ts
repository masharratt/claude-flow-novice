import * as goap from '../../../src/planning/goap/index.js';

describe('goap index re-exports', () => {
  it('exports plan function', () => {
    expect(typeof goap.plan).toBe('function');
  });

  it('exports TOKENS_PER_DOLLAR constant', () => {
    expect(goap.TOKENS_PER_DOLLAR).toBe(2_000_000);
  });

  it('exports PROHIBITIVE_COST constant', () => {
    expect(goap.PROHIBITIVE_COST).toBeGreaterThan(100);
  });

  it('exports estimateCost function', () => {
    expect(typeof goap.estimateCost).toBe('function');
  });

  it('exports applyEffects function', () => {
    expect(typeof goap.applyEffects).toBe('function');
  });

  it('exports hashState function', () => {
    expect(typeof goap.hashState).toBe('function');
  });

  it('exports preconditionsMet function', () => {
    expect(typeof goap.preconditionsMet).toBe('function');
  });
});
