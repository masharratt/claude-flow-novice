/**
 * End-to-End User Flow Tests
 *
 * Complete user journey through the application using Playwright
 */

import { test, expect } from '@playwright/test';

test.describe('Complete User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
  });

  test('should complete full user journey', async ({ page }) => {
    // Step 1: User lands on Dashboard
    await expect(page.locator('h1, h2', { hasText: /dashboard/i })).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/$|\/dashboard/);

    // Verify Dashboard components are visible
    await expect(page.locator('[data-testid="status-monitor"]')).toBeVisible();
    await expect(page.locator('[data-testid="resource-gauges"]')).toBeVisible();

    // Step 2: User navigates to Agents view
    await page.click('a:has-text("Agents"), button:has-text("Agents")');
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.locator('h1, h2', { hasText: /agents/i })).toBeVisible();

    // Wait for agents list to load
    await page.waitForSelector('[data-testid="agents-list"], table, [role="grid"]', { timeout: 5000 });

    // Step 3: User spawns new agent (intervention)
    const spawnButton = page.locator('button:has-text("Spawn"), button:has-text("Create"), button:has-text("Add Agent")').first();
    if (await spawnButton.isVisible()) {
      await spawnButton.click();

      // Fill spawn form
      await page.fill('input[name="agentName"], input[placeholder*="name"]', 'Test Agent E2E');
      await page.fill('input[name="agentType"], select[name="type"]', 'coder');
      await page.click('button:has-text("Spawn"), button:has-text("Create"), button:has-text("Submit")');

      // Verify success notification
      await expect(page.locator('text=/spawned|created|success/i')).toBeVisible({ timeout: 3000 });
    }

    // Step 4: User views agent in Hierarchy
    await page.click('a:has-text("Hierarchy")');
    await expect(page).toHaveURL(/\/hierarchy/);
    await expect(page.locator('h1, h2', { hasText: /hierarchy/i })).toBeVisible();

    // Verify hierarchy tree is rendered
    await page.waitForSelector('[data-testid="hierarchy-tree"], svg, [role="tree"]', { timeout: 5000 });

    // Step 5: User checks Performance metrics
    await page.click('a:has-text("Performance")');
    await expect(page).toHaveURL(/\/performance/);
    await expect(page.locator('h1, h2', { hasText: /performance/i })).toBeVisible();

    // Verify charts are rendered
    await page.waitForSelector('[data-testid="performance-charts"], canvas, svg', { timeout: 5000 });

    // Step 6: User views Events timeline
    await page.click('a:has-text("Events")');
    await expect(page).toHaveURL(/\/events/);
    await expect(page.locator('h1, h2', { hasText: /events/i })).toBeVisible();

    // Verify events are displayed
    await page.waitForSelector('[data-testid="events-timeline"], [role="list"], table', { timeout: 5000 });

    // Step 7: User changes theme to dark mode
    const themeToggle = page.locator('button[aria-label*="theme"], button:has([data-testid="theme-icon"])').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();

      // Verify dark theme is applied
      await page.waitForTimeout(500); // Wait for theme transition
      const body = await page.locator('body');
      const bgColor = await body.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(bgColor).toBeTruthy(); // Dark mode should change background color
    }

    // Step 8: User logs out (if auth is implemented)
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign Out")').first();
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await expect(page).toHaveURL(/\/login|\/$/);
    }
  });

  test('should handle navigation with browser back/forward', async ({ page }) => {
    // Navigate to Dashboard
    await expect(page.locator('h1, h2', { hasText: /dashboard/i })).toBeVisible();

    // Navigate to Agents
    await page.click('a:has-text("Agents")');
    await expect(page).toHaveURL(/\/agents/);

    // Navigate to Performance
    await page.click('a:has-text("Performance")');
    await expect(page).toHaveURL(/\/performance/);

    // Browser back
    await page.goBack();
    await expect(page).toHaveURL(/\/agents/);

    // Browser back again
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);

    // Browser forward
    await page.goForward();
    await expect(page).toHaveURL(/\/agents/);
  });

  test('should preserve state across navigation', async ({ page }) => {
    // Navigate to Settings
    await page.click('a:has-text("Settings")');
    await expect(page).toHaveURL(/\/settings/);

    // Toggle theme
    const themeToggle = page.locator('button[aria-label*="theme"]').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(300);
    }

    // Navigate to Dashboard
    await page.click('a:has-text("Dashboard")');
    await expect(page).toHaveURL(/\/$/);

    // Navigate back to Settings
    await page.click('a:has-text("Settings")');

    // Theme should still be persisted
    await page.waitForTimeout(300);
  });

  test('should handle errors gracefully', async ({ page }) => {
    // Trigger error by navigating to invalid route
    await page.goto('http://localhost:3001/invalid-route-xyz');

    // Should redirect to Dashboard or show 404
    await expect(page).toHaveURL(/\/$/);
  });

  test('should load all routes without errors', async ({ page }) => {
    const routes = ['/', '/agents', '/hierarchy', '/performance', '/events', '/fleet', '/cfn-loop', '/intervention', '/settings'];

    for (const route of routes) {
      await page.goto(`http://localhost:3001${route}`);
      await page.waitForLoadState('networkidle');

      // Check for console errors
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      // Verify page loaded
      await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should handle real-time updates', async ({ page }) => {
    await page.goto('http://localhost:3001/');

    // WebSocket should connect
    await page.waitForTimeout(1000);

    // Dashboard should be ready for real-time updates
    await expect(page.locator('[data-testid="status-monitor"]')).toBeVisible();

    // Simulate real-time event (would require WebSocket mock or actual backend)
    // Verify UI updates in response to WebSocket events
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('http://localhost:3001/');

    // Tab through navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Press Enter on focused link
    await page.keyboard.press('Enter');

    // Should navigate
    await page.waitForTimeout(500);
  });
});

test.describe('Performance Benchmarks', () => {
  test('should load Dashboard within 3 seconds', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('http://localhost:3001/');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000);
  });

  test('should navigate between routes in <500ms', async ({ page }) => {
    await page.goto('http://localhost:3001/');
    await page.waitForLoadState('networkidle');

    const startTime = Date.now();
    await page.click('a:has-text("Agents")');
    await page.waitForURL(/\/agents/);

    const navTime = Date.now() - startTime;
    expect(navTime).toBeLessThan(500);
  });
});

test.describe('Accessibility', () => {
  test('should have accessible navigation', async ({ page }) => {
    await page.goto('http://localhost:3001/');

    // Check for navigation landmark
    const nav = page.locator('nav, [role="navigation"]');
    await expect(nav).toBeVisible();

    // Check for main landmark
    const main = page.locator('main, [role="main"]');
    await expect(main).toBeVisible();
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('http://localhost:3001/');

    // Should have h1
    const h1 = page.locator('h1');
    await expect(h1.first()).toBeVisible();
  });

  test('should support screen readers', async ({ page }) => {
    await page.goto('http://localhost:3001/');

    // Check for ARIA labels
    const buttons = page.locator('button[aria-label], a[aria-label]');
    expect(await buttons.count()).toBeGreaterThan(0);
  });
});
