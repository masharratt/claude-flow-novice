/**
 * Smoke Test - Verify Test Setup
 *
 * Simple test to verify mocks and setup are working correctly
 */

import { describe, it, expect } from 'vitest';

describe('Smoke Test', () => {
  it('should run a basic test', () => {
    expect(true).toBe(true);
  });

  it('should have access to vitest globals', () => {
    expect(describe).toBeDefined();
    expect(it).toBeDefined();
    expect(expect).toBeDefined();
  });
});
