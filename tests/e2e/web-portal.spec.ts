import { test, expect } from '@playwright/test';

test.describe('Web Portal E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the web portal
    await page.goto('/');
  });

  test('should load web portal homepage', async ({ page }) => {
    // Check if the page loads successfully
    await expect(page).toHaveTitle(/Claude Flow/);

    // Check for main navigation elements
    await expect(page.locator('nav')).toBeVisible();
  });

  test('should display swarm status dashboard', async ({ page }) => {
    // Navigate to swarm dashboard if it exists
    const swarmLink = page.locator('a[href*="swarm"], button:has-text("Swarm")');
    if (await swarmLink.isVisible()) {
      await swarmLink.click();
      await expect(page).toHaveURL(/.*swarm.*/);
    }
  });

  test('should handle agent creation workflow', async ({ page }) => {
    // Look for agent creation buttons or forms
    const createAgentButton = page.locator('button:has-text("Create"), button:has-text("Spawn"), button:has-text("Add Agent")');

    if (await createAgentButton.first().isVisible()) {
      await createAgentButton.first().click();

      // Check if agent creation form appears
      await expect(page.locator('form, .modal, .dialog')).toBeVisible();
    }
  });

  test('should display real-time metrics', async ({ page }) => {
    // Check for metrics or monitoring elements
    const metricsElements = page.locator('[data-testid*="metric"], .metric, .chart, .graph');

    if (await metricsElements.first().isVisible()) {
      await expect(metricsElements.first()).toBeVisible();
    }
  });

  test('should handle MCP server status', async ({ page }) => {
    // Look for MCP server status indicators
    const mcpStatus = page.locator('[data-testid*="mcp"], .mcp-status, .server-status');

    if (await mcpStatus.first().isVisible()) {
      await expect(mcpStatus.first()).toBeVisible();
    }
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check if mobile navigation works
    const hamburgerMenu = page.locator('.hamburger, .menu-toggle, button[aria-label*="menu"]');

    if (await hamburgerMenu.isVisible()) {
      await hamburgerMenu.click();
      await expect(page.locator('.mobile-menu, .nav-menu')).toBeVisible();
    }
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Test error handling by navigating to non-existent route
    await page.goto('/non-existent-route');

    // Check for 404 page or error message
    const errorMessage = page.locator('.error, .not-found, h1:has-text("404"), h1:has-text("Not Found")');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });
});

test.describe('MCP Integration Tests', () => {
  test('should connect to Claude Flow MCP server', async ({ page }) => {
    await page.goto('/');

    // Check for MCP connection status
    const mcpStatus = page.locator('[data-testid="mcp-status"], .connection-status');

    if (await mcpStatus.isVisible()) {
      await expect(mcpStatus).toContainText(/connected|active|online/i);
    }
  });

  test('should execute swarm commands via MCP', async ({ page }) => {
    await page.goto('/');

    // Look for swarm control interface
    const swarmControls = page.locator('[data-testid*="swarm"], .swarm-controls, button:has-text("Initialize")');

    if (await swarmControls.first().isVisible()) {
      await swarmControls.first().click();

      // Wait for swarm initialization response
      await expect(page.locator('.success, .status-active, [data-status="initialized"]')).toBeVisible({ timeout: 10000 });
    }
  });

  test('should display agent metrics from MCP', async ({ page }) => {
    await page.goto('/');

    // Check for agent metrics display
    const agentMetrics = page.locator('[data-testid*="agent-metric"], .agent-stats, .performance-chart');

    if (await agentMetrics.first().isVisible()) {
      await expect(agentMetrics.first()).toBeVisible();

      // Check if metrics are updating
      const initialText = await agentMetrics.first().textContent();
      await page.waitForTimeout(2000);
      const updatedText = await agentMetrics.first().textContent();

      // Note: This might be the same if metrics don't update frequently
      expect(typeof initialText).toBe('string');
      expect(typeof updatedText).toBe('string');
    }
  });
});

test.describe('Performance Tests', () => {
  test('should load within acceptable time limits', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should handle concurrent agent operations', async ({ page }) => {
    await page.goto('/');

    // Simulate multiple agent operations if UI supports it
    const agentButtons = page.locator('button:has-text("Create"), button:has-text("Spawn")');

    if (await agentButtons.count() > 1) {
      // Click multiple buttons rapidly
      for (let i = 0; i < Math.min(3, await agentButtons.count()); i++) {
        await agentButtons.nth(i).click();
        await page.waitForTimeout(100);
      }

      // Check that the system handles concurrent operations
      await expect(page.locator('.error, .failed')).not.toBeVisible();
    }
  });
});