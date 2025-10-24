import { describe, it, expect } from '@jest/globals';

describe('Simple Example', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});