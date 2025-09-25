import { FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Global test teardown for Playwright tests
 * Cleans up after test execution
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global test teardown...');

  try {
    // Clean up test artifacts if needed
    const testResultsDir = path.join(process.cwd(), 'test-results');
    const authDir = path.join(process.cwd(), 'tests', 'auth');

    // Clean up auth files
    const authFile = path.join(authDir, 'user.json');
    if (fs.existsSync(authFile)) {
      fs.unlinkSync(authFile);
      console.log('🗑️ Cleaned up authentication files');
    }

    // Ensure auth directory exists for next run
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    // Generate test summary if results exist
    const resultsFile = path.join(testResultsDir, 'results.json');
    if (fs.existsSync(resultsFile)) {
      try {
        const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        console.log('📊 Test Summary:');
        console.log(`   Total: ${results.stats?.total || 0}`);
        console.log(`   Passed: ${results.stats?.passed || 0}`);
        console.log(`   Failed: ${results.stats?.failed || 0}`);
        console.log(`   Skipped: ${results.stats?.skipped || 0}`);
      } catch (error) {
        console.log('⚠️ Could not parse test results');
      }
    }

    console.log('✅ Global teardown completed successfully!');

  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error to avoid masking test failures
  }
}

export default globalTeardown;