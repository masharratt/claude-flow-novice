/**
 * Minimal test to isolate hanging issue
 */
import { describe, it, expect } from 'vitest';

describe('Minimal Test Suite', () => {
  it('should pass basic assertion', () => {
    expect(true).toBe(true);
  });

  it('should perform arithmetic', () => {
    expect(2 + 2).toBe(4);
  });
});
