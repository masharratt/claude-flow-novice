/**
 * @file Global Teardown for Playwright Tests
 * @description Cleanup test environment and services
 */

import { FullConfig } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting Playwright global teardown...');

  try {
    // Cleanup test artifacts
    await cleanupTestArtifacts();

    // Stop mock services
    await stopMockServices();

    // Cleanup test database
    await cleanupTestDatabase();

    // Generate test summary
    await generateTestSummary();

    console.log('✅ Global teardown completed successfully');

  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error to avoid masking test failures
  }
}

/**
 * Cleanup test artifacts and temporary files
 */
async function cleanupTestArtifacts() {
  console.log('Cleaning up test artifacts...');

  const artifactDirs = [
    'test-results/downloads',
    'test-results/temp'
  ];

  for (const dir of artifactDirs) {
    try {
      await fs.rmdir(dir, { recursive: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  }

  // Keep important artifacts (reports, videos, screenshots)
  // but clean up temporary files
  try {
    const tempFiles = await fs.readdir('test-results');
    for (const file of tempFiles) {
      if (file.includes('temp-') || file.includes('.tmp')) {
        await fs.unlink(path.join('test-results', file));
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Stop mock services
 */
async function stopMockServices() {
  console.log('Stopping mock services...');

  // Send shutdown signal to mock services
  try {
    await fetch('http://localhost:4000/api/shutdown', {
      method: 'POST'
    });
  } catch (error) {
    // Service might already be stopped
  }

  // Additional cleanup for any lingering processes
  if (process.env.MOCK_SERVICES_PID) {
    try {
      process.kill(parseInt(process.env.MOCK_SERVICES_PID), 'SIGTERM');
    } catch (error) {
      // Process might already be terminated
    }
  }
}

/**
 * Cleanup test database
 */
async function cleanupTestDatabase() {
  console.log('Cleaning up test database...');

  try {
    // Reset test database to clean state
    await fetch('http://localhost:4000/api/test-db/reset', {
      method: 'POST'
    });
  } catch (error) {
    // Database service might be unavailable
  }
}

/**
 * Generate test summary and metrics
 */
async function generateTestSummary() {
  console.log('Generating test summary...');

  try {
    // Read test results
    const resultFiles = await fs.readdir('test-results');
    const jsonResults = resultFiles.filter(file => file.endsWith('.json'));

    const summary = {
      timestamp: new Date().toISOString(),
      testSession: process.env.TEST_SESSION_ID || 'unknown',
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      },
      artifacts: {
        reports: resultFiles.filter(f => f.includes('report')).length,
        videos: resultFiles.filter(f => f.endsWith('.webm')).length,
        screenshots: resultFiles.filter(f => f.endsWith('.png')).length,
        traces: resultFiles.filter(f => f.endsWith('.zip')).length
      },
      cleanup: {
        completed: true,
        errors: []
      }
    };

    // Save summary
    await fs.writeFile(
      'test-results/test-session-summary.json',
      JSON.stringify(summary, null, 2)
    );

    // Log summary
    console.log('📊 Test session summary:');
    console.log(`  - Session ID: ${summary.testSession}`);
    console.log(`  - Artifacts: ${Object.values(summary.artifacts).reduce((a, b) => a + b, 0)} files`);
    console.log(`  - Reports: ${summary.artifacts.reports}`);
    console.log(`  - Videos: ${summary.artifacts.videos}`);
    console.log(`  - Screenshots: ${summary.artifacts.screenshots}`);

  } catch (error) {
    console.warn('Failed to generate test summary:', error.message);
  }
}

export default globalTeardown;