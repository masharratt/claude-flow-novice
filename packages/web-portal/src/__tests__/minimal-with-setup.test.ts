/**
 * Test with setup.ts to isolate MSW/global mock issues
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// This will trigger setup.ts loading
describe('Test with Setup', () => {
  beforeAll(() => {
    console.log('[Test] beforeAll: Starting test with setup');
  });

  afterAll(() => {
    console.log('[Test] afterAll: Test cleanup');
  });

  it('should pass with setup loaded', () => {
    console.log('[Test] Running test with setup');
    expect(true).toBe(true);
  });

  it('should have global mocks available', () => {
    console.log('[Test] Checking global mocks');
    expect(window.matchMedia).toBeDefined();
    expect(window.localStorage).toBeDefined();
    expect(global.IntersectionObserver).toBeDefined();
    expect(global.ResizeObserver).toBeDefined();
  });
});
