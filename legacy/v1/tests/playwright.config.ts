import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright Configuration for Claude Flow Testing
 *
 * Comprehensive test configuration supporting:
 * - Multi-browser testing
 * - Visual regression testing
 * - Performance monitoring
 * - Multi-agent coordination testing
 * - CI/CD integration
 */

export default defineConfig({
  testDir: './tests',

  // Global test configuration
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['line'],
    process.env.CI ? ['github'] : ['list']
  ],

  // Global test settings
  use: {
    // Base URL for tests
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Browser context options
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Network settings
    ignoreHTTPSErrors: true,

    // Viewport settings
    viewport: { width: 1280, height: 720 },

    // Action timeout
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // Test timeout settings
  timeout: 30000,
  expect: {
    timeout: 5000,
    // Visual comparison threshold
    threshold: 0.2,
    // Screenshot comparison mode
    mode: 'default',
  },

  // Project configurations for different test types
  projects: [
    // Setup project for authentication and database seeding
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      teardown: 'cleanup',
    },

    // Cleanup project
    {
      name: 'cleanup',
      testMatch: /.*\.cleanup\.ts/,
    },

    // Desktop browsers
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        contextOptions: {
          // Permissions for testing
          permissions: ['clipboard-read', 'clipboard-write', 'notifications'],
        }
      },
      dependencies: ['setup'],
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },

    // Mobile testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },

    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
      dependencies: ['setup'],
    },

    // API testing project
    {
      name: 'api',
      testDir: './tests/integration/api',
      use: {
        baseURL: process.env.API_URL || 'http://localhost:8000',
      },
    },

    // Performance testing project
    {
      name: 'performance',
      testDir: './tests/performance',
      use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
      },
      timeout: 60000,
    },

    // Visual regression testing
    {
      name: 'visual',
      testDir: './tests/visual',
      use: {
        ...devices['Desktop Chrome'],
        // Consistent viewport for visual tests
        viewport: { width: 1280, height: 720 },
      },
      dependencies: ['setup'],
    },

    // Multi-agent coordination testing
    {
      name: 'multi-agent',
      testDir: './tests/e2e/multi-agent',
      use: {
        ...devices['Desktop Chrome'],
        // Extended timeout for complex coordination scenarios
        actionTimeout: 30000,
        navigationTimeout: 60000,
      },
      timeout: 120000,
      dependencies: ['setup'],
    },
  ],

  // Web server configuration for local testing
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    port: 3000,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },

  // Test output directories
  outputDir: 'test-results/artifacts',

  // Global setup and teardown
  globalSetup: require.resolve('./tests/utils/global-setup.ts'),
  globalTeardown: require.resolve('./tests/utils/global-teardown.ts'),
});