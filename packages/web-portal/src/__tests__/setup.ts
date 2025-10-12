/**
 * Vitest Setup File
 *
 * Global test setup including MSW, React Query, and testing utilities
 */

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { setupMockServer } from './mocks/server';

// Setup MSW server
setupMockServer();

// Cleanup after each test
afterEach(() => {
  cleanup();
});
