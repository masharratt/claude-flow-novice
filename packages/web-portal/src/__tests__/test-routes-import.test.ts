/**
 * Test to isolate which route import causes hanging
 */
import { describe, it, expect } from 'vitest';

describe('Routes Import Test', () => {
  it('should import ThemeProvider without hanging', async () => { try {
    console.log('[Test] Importing ThemeProvider...');
    const { ThemeProvider } = await import('../client/theme/ThemeProvider');
    console.log('[Test] ThemeProvider imported successfully');
    expect(ThemeProvider).toBeDefined();
  });

  it('should import AppRoutes without hanging', async () => { try {
    console.log('[Test] Importing AppRoutes...');
    const { AppRoutes } = await import('../client/routes');
    console.log('[Test] AppRoutes imported successfully');
    expect(AppRoutes).toBeDefined();
  }, 15000);
});
