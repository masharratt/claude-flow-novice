import { chromium, FullConfig } from '@playwright/test';

/**
 * Global test setup for Playwright tests
 * Prepares the environment before test execution
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global test setup...');

  // Launch browser for setup tasks
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Wait for web portal to be available
    const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000';
    console.log(`⏳ Waiting for web portal at ${baseURL}...`);

    // Try to connect to the web portal with retries
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout

    while (attempts < maxAttempts) {
      try {
        await page.goto(baseURL, { timeout: 2000 });
        const title = await page.title();
        if (title.includes('Claude Flow') || title.length > 0) {
          console.log('✅ Web portal is ready!');
          break;
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to connect to web portal after ${maxAttempts} attempts`);
        }
        await page.waitForTimeout(1000);
      }
    }

    // Prepare test data if needed
    console.log('📝 Preparing test data...');

    // Store authentication state for authenticated tests
    await context.storageState({ path: 'tests/auth/user.json' });

    console.log('✅ Global setup completed successfully!');

  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;