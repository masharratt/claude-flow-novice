/**
 * @file Playwright Configuration for Web Portal E2E Testing
 * @description Comprehensive test configuration for web portal system
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  // Test directory
  testDir: '../specs',

  // Global test settings
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 1,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/playwright-results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['line'],
    ...(process.env.CI ? [['github']] : [])
  ],

  // Global setup and teardown
  globalSetup: require.resolve('../utils/global-setup.ts'),
  globalTeardown: require.resolve('../utils/global-teardown.ts'),

  // Output directory for artifacts
  outputDir: 'test-results/',

  // Configure test fixtures and utilities
  use: {
    // Base URL for tests
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Browser context options
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    // Test artifacts
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    // Network behavior
    offline: false,

    // Locale settings
    locale: 'en-US',
    timezoneId: 'America/New_York',

    // Custom test context
    contextOptions: {
      recordVideo: {
        dir: 'test-results/videos/',
        size: { width: 1280, height: 720 }
      }
    },

    // Test metadata
    extraHTTPHeaders: {
      'X-Test-Environment': 'playwright',
      'X-Test-Session': process.env.TEST_SESSION_ID || 'default'
    }
  },

  // Test project configurations
  projects: [
    // Setup project for authentication and initial state
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] }
    },

    // Desktop browsers
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'test-results/auth-state.json'
      },
      dependencies: ['setup'],
      testIgnore: /.*\.mobile\.spec\.ts/
    },
    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'test-results/auth-state.json'
      },
      dependencies: ['setup'],
      testIgnore: /.*\.mobile\.spec\.ts/
    },
    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'test-results/auth-state.json'
      },
      dependencies: ['setup'],
      testIgnore: /.*\.mobile\.spec\.ts/
    },

    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: 'test-results/auth-state.json'
      },
      dependencies: ['setup'],
      testMatch: /.*\.mobile\.spec\.ts/
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
        storageState: 'test-results/auth-state.json'
      },
      dependencies: ['setup'],
      testMatch: /.*\.mobile\.spec\.ts/
    },

    // Specialized test configurations
    {
      name: 'real-time-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'test-results/auth-state.json',
        video: 'on' // Always record for real-time tests
      },
      dependencies: ['setup'],
      testMatch: /.*\.realtime\.spec\.ts/
    },
    {
      name: 'performance-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'test-results/auth-state.json'
      },
      dependencies: ['setup'],
      testMatch: /.*\.performance\.spec\.ts/,
      timeout: 120000 // Longer timeout for performance tests
    },
    {
      name: 'api-integration',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'test-results/auth-state.json'
      },
      dependencies: ['setup'],
      testMatch: /.*\.api\.spec\.ts/
    }
  ],

  // Web server configuration for local development
  webServer: process.env.CI ? undefined : {
    command: 'npm run start:test',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      TEST_MODE: 'playwright'
    }
  },

  // Test metadata and reporting
  metadata: {
    testType: 'e2e',
    framework: 'playwright',
    target: 'web-portal',
    version: '1.0.0'
  }
});