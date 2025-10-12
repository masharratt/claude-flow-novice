/**
 * MSW Server Setup for Node.js (Testing)
 *
 * Sets up Mock Service Worker for Node.js environment (Vitest tests)
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Create MSW server with handlers
export const server = setupServer(...handlers);

// Start server before all tests
export function setupMockServer(): void {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
  });

  // Reset handlers after each test
  afterEach(() => {
    server.resetHandlers();
  });

  // Clean up after all tests
  afterAll(() => {
    server.close();
  });
}
