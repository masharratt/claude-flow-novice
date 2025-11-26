/**
 * Jest Setup File
 * Configures test environment and utilities
 */

// Increase Jest timeout for Docker operations
jest.setTimeout(60_000);

// Mock Docker socket by default
process.env.DOCKER_HOST = '/var/run/docker.sock';

// Suppress console output during tests unless debugging
if (process.env.DEBUG_TESTS !== 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

/**
 * Test helper to create mock Docker response
 */
export function createMockDockerResponse<T>(data: T): T {
  return data;
}

/**
 * Test helper to simulate async delay
 */
export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
