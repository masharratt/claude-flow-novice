/**
 * Jest setup for integration tests
 */
import { execSync } from 'child_process';

// Check Docker availability
const checkDocker = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// Set environment flag for Docker availability
if (!checkDocker()) {
  process.env.DOCKER_HOST = 'disabled';
  console.warn('Docker not available - integration tests will be skipped');
}

// Increase Jest timeout for container operations
jest.setTimeout(120000);

// Cleanup handler
afterAll(async () => {
  // Give containers time to stop gracefully
  await new Promise((resolve) => setTimeout(resolve, 1000));
});
