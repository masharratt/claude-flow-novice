/**
 * Test to isolate which view component import causes hanging
 */
import { describe, it, expect } from 'vitest';

describe('View Component Imports', () => {
  it('should import Dashboard', async () => { try {
    console.log('[Test] Importing Dashboard...');
    const { Dashboard } = await import('../client/views/Dashboard');
    console.log('[Test] Dashboard imported');
    expect(Dashboard).toBeDefined();
  }, 20000);

  it('should import Agents', async () => { try {
    console.log('[Test] Importing Agents...');
    const { Agents } = await import('../client/views/Agents');
    console.log('[Test] Agents imported');
    expect(Agents).toBeDefined();
  }, 20000);

  it('should import Settings', async () => { try {
    console.log('[Test] Importing Settings...');
    const { Settings } = await import('../client/views/Settings');
    console.log('[Test] Settings imported');
    expect(Settings).toBeDefined();
  }, 20000);
});
