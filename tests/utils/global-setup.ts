import { chromium, FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Global Setup for Playwright Tests
 *
 * Handles:
 * - Database setup and seeding
 * - Authentication state preparation
 * - Test environment configuration
 * - Multi-agent coordination setup
 */

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global test setup...');

  // Create test results directory
  const testResultsDir = path.join(process.cwd(), 'test-results');
  if (!fs.existsSync(testResultsDir)) {
    fs.mkdirSync(testResultsDir, { recursive: true });
  }

  // Database setup
  await setupDatabase();

  // Authentication setup
  await setupAuthentication();

  // Multi-agent coordination setup
  await setupMultiAgentEnvironment();

  // Performance baseline setup
  await setupPerformanceBaselines();

  console.log('✅ Global test setup completed');
}

async function setupDatabase() {
  console.log('📄 Setting up test database...');

  try {
    // Reset and seed test database
    if (process.env.NODE_ENV === 'test') {
      execSync('npm run db:reset:test', { stdio: 'inherit' });
      execSync('npm run db:seed:test', { stdio: 'inherit' });
    }
  } catch (error) {
    console.warn('⚠️  Database setup skipped (not configured)');
  }
}

async function setupAuthentication() {
  console.log('🔐 Setting up authentication states...');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Admin user authentication
    await setupUserAuth(page, 'admin', {
      username: 'admin@test.com',
      password: 'admin123',
      role: 'admin'
    });

    // Regular user authentication
    await setupUserAuth(page, 'user', {
      username: 'user@test.com',
      password: 'user123',
      role: 'user'
    });

    // Agent coordinator authentication
    await setupUserAuth(page, 'coordinator', {
      username: 'coordinator@test.com',
      password: 'coord123',
      role: 'coordinator'
    });

  } catch (error) {
    console.warn('⚠️  Authentication setup failed:', error);
  } finally {
    await browser.close();
  }
}

async function setupUserAuth(page: any, userType: string, credentials: any) {
  const authFile = `test-results/.auth/${userType}.json`;

  // Create auth directory
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  try {
    // Navigate to login page
    await page.goto('/login');

    // Fill login form
    await page.fill('[data-testid="username"]', credentials.username);
    await page.fill('[data-testid="password"]', credentials.password);
    await page.click('[data-testid="login-button"]');

    // Wait for successful login
    await page.waitForSelector('[data-testid="user-menu"]', { timeout: 10000 });

    // Save authentication state
    await page.context().storageState({ path: authFile });

    console.log(`✅ ${userType} authentication state saved`);
  } catch (error) {
    console.warn(`⚠️  ${userType} authentication setup failed:`, error);
  }
}

async function setupMultiAgentEnvironment() {
  console.log('🤖 Setting up multi-agent test environment...');

  try {
    // Initialize Claude Flow for testing
    execSync('npx claude-flow@alpha init --test-mode', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Create test swarm configurations
    const swarmConfigs = [
      {
        name: 'test-hierarchical',
        topology: 'hierarchical',
        maxAgents: 3,
        strategy: 'balanced'
      },
      {
        name: 'test-mesh',
        topology: 'mesh',
        maxAgents: 4,
        strategy: 'adaptive'
      },
      {
        name: 'test-performance',
        topology: 'star',
        maxAgents: 2,
        strategy: 'specialized'
      }
    ];

    // Save test configurations
    const configPath = path.join(process.cwd(), 'test-results/swarm-configs.json');
    fs.writeFileSync(configPath, JSON.stringify(swarmConfigs, null, 2));

    console.log('✅ Multi-agent environment configured');
  } catch (error) {
    console.warn('⚠️  Multi-agent setup failed:', error);
  }
}

async function setupPerformanceBaselines() {
  console.log('📊 Setting up performance baselines...');

  const baselines = {
    pageLoad: {
      max: 3000, // 3 seconds
      target: 1500 // 1.5 seconds
    },
    apiResponse: {
      max: 1000, // 1 second
      target: 500 // 500ms
    },
    agentSpawn: {
      max: 5000, // 5 seconds
      target: 2000 // 2 seconds
    },
    swarmCoordination: {
      max: 10000, // 10 seconds
      target: 5000 // 5 seconds
    }
  };

  const baselinePath = path.join(process.cwd(), 'test-results/performance-baselines.json');
  fs.writeFileSync(baselinePath, JSON.stringify(baselines, null, 2));

  console.log('✅ Performance baselines configured');
}

export default globalSetup;