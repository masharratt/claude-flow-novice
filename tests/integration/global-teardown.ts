/**
 * Global Teardown for Integration Tests
 * 
 * Runs once after all integration test suites.
 * Cleans up shared resources and artifacts.
 */

import { promises as fs } from 'fs';
import path from 'path';

export default async function globalTeardown() {
  console.log('[Global Teardown] Cleaning up integration test artifacts...');
  
  // Clean up test directories
  const testDirs = [
    path.join(process.cwd(), '.test-e2e'),
    path.join(process.cwd(), '.test-integration'),
  ];
  
  for (const dir of testDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      console.log(`[Global Teardown] Removed: ${dir}`);
    } catch (error) {
      // Directory may not exist, which is fine
    }
  }
  
  console.log('[Global Teardown] Cleanup complete');
}
