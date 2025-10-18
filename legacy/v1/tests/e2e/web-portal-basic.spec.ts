import { test, expect } from '@playwright/test';

/**
 * Basic web portal functionality tests
 * Tests core features of the Claude Flow web portal
 */

test.describe('Web Portal Basic Functionality', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the web portal
    await page.goto('/');
  });

  test('should load the main dashboard', async ({ page }) => {
    // Check that the main components are visible
    await expect(page.locator('h1')).toContainText('Claude Flow Personal');
    await expect(page.locator('[data-testid="swarm-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="view-selector"]')).toBeVisible();
  });

  test('should display connection status', async ({ page }) => {
    // Check connection status indicator
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toBeVisible();

    // Status should be either connected or disconnected
    const statusText = await connectionStatus.textContent();
    expect(statusText).toMatch(/(Connected|Disconnected)/);
  });

  test('should allow switching between views', async ({ page }) => {
    const viewSelector = page.locator('[data-testid="view-selector"]');

    // Test switching to Messages view
    await viewSelector.selectOption('messages');
    await expect(page.locator('[data-testid="messages-view"]')).toBeVisible();

    // Test switching to Agents view
    await viewSelector.selectOption('agents');
    await expect(page.locator('[data-testid="agents-view"]')).toBeVisible();

    // Test switching to Transparency view
    await viewSelector.selectOption('transparency');
    await expect(page.locator('[data-testid="transparency-view"]')).toBeVisible();

    // Test switching to MCP view
    await viewSelector.selectOption('mcp');
    await expect(page.locator('[data-testid="mcp-integration-panel"]')).toBeVisible();
  });

  test('should display MCP integration panel with all three systems', async ({ page }) => {
    // Switch to MCP view
    await page.locator('[data-testid="view-selector"]').selectOption('mcp');

    // Check that all MCP systems are available
    await expect(page.locator('input[value="claude-flow"]')).toBeVisible();
    await expect(page.locator('input[value="ruv-swarm"]')).toBeVisible();
    await expect(page.locator('input[value="playwright"]')).toBeVisible();

    // Check category selector includes testing
    const categorySelect = page.locator('[data-testid="category-selector"]');
    await expect(categorySelect.locator('option[value="testing"]')).toBeVisible();
  });

  test('should show Playwright MCP commands when selected', async ({ page }) => {
    // Navigate to MCP view
    await page.locator('[data-testid="view-selector"]').selectOption('mcp');

    // Select Playwright system
    await page.locator('input[value="playwright"]').click();

    // Select testing category
    await page.locator('[data-testid="category-selector"]').selectOption('testing');

    // Check that Playwright commands are visible
    await expect(page.locator('.command-item')).toContainText('test_run');
    await expect(page.locator('.command-item')).toContainText('test_debug');
    await expect(page.locator('.command-item')).toContainText('test_generate');
  });

  test('should handle WebSocket connection status', async ({ page }) => {
    // Check initial connection attempt
    const connectionDot = page.locator('.status-dot');
    await expect(connectionDot).toBeVisible();

    // Wait for potential connection (or timeout)
    await page.waitForTimeout(2000);

    // Connection status should be determined
    const isConnected = await connectionDot.getAttribute('class');
    expect(isConnected).toMatch(/(connected|disconnected)/);
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check that main components are still visible and functional
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-testid="view-selector"]')).toBeVisible();

    // Test view switching on mobile
    await page.locator('[data-testid="view-selector"]').selectOption('mcp');
    await expect(page.locator('[data-testid="mcp-integration-panel"]')).toBeVisible();
  });
});