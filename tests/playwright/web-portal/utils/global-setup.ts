/**
 * @file Global Setup for Playwright Tests
 * @description Initialize test environment and services
 */

import { chromium, FullConfig } from '@playwright/test';
import { WebPortalTestServer } from './test-server';
import { MockServices } from '../mocks/mock-services';
import { TestDatabase } from './test-database';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting Playwright global setup...');

  try {
    // Initialize test database
    const testDb = new TestDatabase();
    await testDb.initialize();
    console.log('✅ Test database initialized');

    // Start mock services
    const mockServices = new MockServices();
    await mockServices.start();
    console.log('✅ Mock services started');

    // Start test server
    const testServer = new WebPortalTestServer();
    await testServer.start();
    console.log('✅ Test server started on port 3000');

    // Create browser for authentication setup
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to login page and authenticate
    await page.goto('http://localhost:3000/login');

    // Perform authentication
    await page.fill('[data-testid="username"]', 'test-admin');
    await page.fill('[data-testid="password"]', 'test-password');
    await page.click('[data-testid="login-button"]');

    // Wait for successful login
    await page.waitForURL('**/dashboard');
    await page.waitForSelector('[data-testid="user-menu"]');

    // Save authentication state
    await context.storageState({ path: 'test-results/auth-state.json' });

    // Setup test data and initial state
    await setupTestData(page);

    await browser.close();

    console.log('✅ Global setup completed successfully');

    // Store setup metadata for tests
    process.env.PLAYWRIGHT_SETUP_COMPLETE = 'true';
    process.env.TEST_SERVER_URL = 'http://localhost:3000';
    process.env.MOCK_SERVICES_PORT = '4000';

  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}

/**
 * Setup initial test data
 */
async function setupTestData(page: any) {
  console.log('Setting up test data...');

  // Create test swarms
  await page.evaluate(() => {
    return fetch('/api/test-data/swarms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        swarms: [
          {
            id: 'test-swarm-1',
            name: 'Development Swarm',
            topology: 'hierarchical',
            agents: ['researcher', 'coder', 'tester']
          },
          {
            id: 'test-swarm-2',
            name: 'Analysis Swarm',
            topology: 'mesh',
            agents: ['analyzer', 'reviewer']
          }
        ]
      })
    });
  });

  // Create test agents
  await page.evaluate(() => {
    return fetch('/api/test-data/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agents: [
          {
            id: 'agent-1',
            type: 'researcher',
            status: 'active',
            swarmId: 'test-swarm-1',
            capabilities: ['research', 'analysis']
          },
          {
            id: 'agent-2',
            type: 'coder',
            status: 'idle',
            swarmId: 'test-swarm-1',
            capabilities: ['coding', 'implementation']
          }
        ]
      })
    });
  });

  // Create test tasks
  await page.evaluate(() => {
    return fetch('/api/test-data/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasks: [
          {
            id: 'task-1',
            description: 'Research API patterns',
            status: 'in-progress',
            agentId: 'agent-1',
            swarmId: 'test-swarm-1'
          },
          {
            id: 'task-2',
            description: 'Implement authentication',
            status: 'pending',
            agentId: 'agent-2',
            swarmId: 'test-swarm-1'
          }
        ]
      })
    });
  });

  // Setup WebSocket test scenarios
  await setupWebSocketScenarios();

  console.log('✅ Test data setup completed');
}

/**
 * Setup WebSocket test scenarios
 */
async function setupWebSocketScenarios() {
  // This will be handled by our mock services
  // We'll define various WebSocket message patterns for testing
  const scenarios = [
    {
      name: 'agent-status-update',
      pattern: 'continuous-updates',
      frequency: 1000
    },
    {
      name: 'real-time-messaging',
      pattern: 'burst-messages',
      frequency: 500
    },
    {
      name: 'human-intervention',
      pattern: 'event-driven',
      frequency: null
    }
  ];

  // Register scenarios with mock service
  // This will be used by our WebSocket tests
  console.log('WebSocket scenarios configured:', scenarios.length);
}

export default globalSetup;