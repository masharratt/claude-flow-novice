/**
 * Global Setup for Integration Tests
 *
 * Runs once before all integration test suites.
 * Sets up shared resources to avoid per-test overhead.
 */

export default async function globalSetup() {
  console.log('[Global Setup] Starting integration test environment...');

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.CFN_TEST_MODE = 'integration';

  // Validate required services
  const requiredEnvVars = ['REDIS_URL', 'DATABASE_URL'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    const missingList = missing.join(', ');
    console.warn(`[Global Setup] Missing optional env vars: ${missingList}`);
    console.warn('[Global Setup] Some tests may use in-memory alternatives');
  }

  console.log('[Global Setup] Environment ready for integration tests');
}
