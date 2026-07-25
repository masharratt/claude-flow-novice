/**
 * Test to isolate App import issues
 */
import { describe, it, expect } from 'vitest';

describe('App Import Test', () => {
  it('should import App without hanging', async () => { try {
    console.log('[Test] Attempting to import App...');
    const { App } = await import('../client/App');
    console.log('[Test] App imported successfully');
    expect(App).toBeDefined();
  });
});
