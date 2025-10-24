/**
 * Test to check if MUI imports cause hanging
 */
import { describe, it, expect } from 'vitest';

describe('MUI Import Test', () => {
  it('should import Box without hanging', async () => { try {
    console.log('[Test] Importing Box from @mui/material...');
    const { Box } = await import('@mui/material');
    console.log('[Test] Box imported');
    expect(Box).toBeDefined();
  }, 20000);

  it('should import multiple MUI components', async () => { try {
    console.log('[Test] Importing multiple MUI components...');
    const { Grid, Paper, Typography } = await import('@mui/material');
    console.log('[Test] MUI components imported');
    expect(Grid).toBeDefined();
    expect(Paper).toBeDefined();
    expect(Typography).toBeDefined();
  }, 20000);
});
