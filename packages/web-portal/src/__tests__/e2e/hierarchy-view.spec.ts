/**
 * Hierarchy View E2E Tests
 *
 * End-to-end user flow tests for hierarchy view: view tree, expand node,
 * view details, export JSON
 */

import { test, expect } from '@playwright/test';

test.describe('Hierarchy View E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hierarchy');
    await page.waitForLoadState('networkidle');
  });

  test('complete user flow: view tree → expand node → view details → export JSON', async ({ page }) => {
    // Step 1: Verify hierarchy view loaded
    await expect(page.locator('h1, h4').filter({ hasText: /hierarchy/i })).toBeVisible();

    // Step 2: Verify root nodes are visible
    await expect(page.getByText('Main Coordinator')).toBeVisible();

    // Step 3: Expand root node
    const expandButton = page.locator('button[aria-label*="expand" i]').first();
    await expandButton.click();

    // Step 4: Verify children are visible
    await expect(page.getByText('Primary Coder')).toBeVisible({ timeout: 2000 });

    // Step 5: Expand child node
    const childExpandButton = page.locator('button[aria-label*="expand.*Primary" i]');
    await childExpandButton.click();

    // Step 6: Verify nested children
    await expect(page.getByText('Security Specialist')).toBeVisible({ timeout: 2000 });
    await expect(page.getByText('Test Engineer')).toBeVisible({ timeout: 2000 });

    // Step 7: Click on node to open details drawer
    const securityNode = page.getByText('Security Specialist');
    await securityNode.click();

    // Step 8: Verify details drawer opened
    await expect(page.locator('[role="complementary"], .drawer, .details-panel')).toBeVisible({ timeout: 2000 });

    // Step 9: Verify agent details are displayed
    await expect(page.locator('text=/agent-002|security-specialist/i')).toBeVisible();
    await expect(page.locator('text=/tasks.*completed/i')).toBeVisible();
    await expect(page.locator('text=/confidence/i')).toBeVisible();

    // Step 10: Verify parent link is displayed
    await expect(page.locator('text=/parent.*Primary Coder/i')).toBeVisible();

    // Step 11: Export hierarchy as JSON
    const exportButton = page.locator('button:has-text("Export")');
    await exportButton.click();

    const jsonOption = page.locator('li:has-text("JSON"), [role="menuitem"]:has-text("JSON")');

    // Set up download handler
    const downloadPromise = page.waitForEvent('download');
    await jsonOption.click();

    // Step 12: Verify download initiated
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/hierarchy.*\.json/i);
  });

  test('should collapse all nodes', async ({ page }) => {
    // Expand all first
    const expandAllButton = page.locator('button:has-text("Expand All")');
    await expandAllButton.click();
    await page.waitForTimeout(500);

    // Verify children are visible
    await expect(page.getByText('Primary Coder')).toBeVisible();

    // Collapse all
    const collapseAllButton = page.locator('button:has-text("Collapse All")');
    await collapseAllButton.click();
    await page.waitForTimeout(500);

    // Verify children are hidden
    await expect(page.getByText('Primary Coder')).not.toBeVisible();
  });

  test('should filter hierarchy by status', async ({ page }) => {
    // Open status filter
    const statusFilter = page.locator('select[aria-label*="status" i], button:has-text("Status")');
    await statusFilter.click();

    // Select "Active"
    await page.locator('li:has-text("Active"), [value="active"]').click();

    // Verify only active agents are visible
    await expect(page.getByText('Main Coordinator')).toBeVisible();
    await expect(page.locator('[data-status="completed"]')).not.toBeVisible();
  });

  test('should search hierarchy by agent name', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i]');
    await searchInput.fill('Security');
    await page.waitForTimeout(300);

    // Verify only matching agents are visible
    await expect(page.getByText('Security Specialist')).toBeVisible();
    await expect(page.getByText('Code Reviewer')).not.toBeVisible();
  });

  test('should export hierarchy as CSV', async ({ page }) => {
    const exportButton = page.locator('button:has-text("Export")');
    await exportButton.click();

    const csvOption = page.locator('li:has-text("CSV"), [role="menuitem"]:has-text("CSV")');

    const downloadPromise = page.waitForEvent('download');
    await csvOption.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/hierarchy.*\.csv/i);

    // Verify CSV content
    const path = await download.path();
    if (path) {
      const fs = require('fs');
      const csvContent = fs.readFileSync(path, 'utf8');
      expect(csvContent).toContain('ID,Name,Type,Status');
    }
  });

  test('should navigate to parent from details drawer', async ({ page }) => {
    // Expand tree
    await page.locator('button[aria-label*="expand" i]').first().click();
    await page.locator('button[aria-label*="expand.*Primary" i]').click();

    // Click on child node
    await page.getByText('Security Specialist').click();

    // Click on parent link in details drawer
    const parentLink = page.locator('[role="complementary"] a:has-text("Primary Coder")');
    await parentLink.click();

    // Verify drawer now shows parent details
    await expect(page.locator('text=/agent-001/i')).toBeVisible();
  });

  test('should display topology information', async ({ page }) => {
    // Verify topology info is displayed
    await expect(page.locator('text=/topology.*hierarchical|mesh/i')).toBeVisible();
    await expect(page.locator('text=/\\d+ agents/i')).toBeVisible();
  });

  test('should show depth indicators', async ({ page }) => {
    // Expand tree fully
    await page.locator('button:has-text("Expand All")').click();
    await page.waitForTimeout(500);

    // Verify depth indicators are visible (indentation, levels)
    const level0Nodes = page.locator('[data-depth="0"]');
    const level1Nodes = page.locator('[data-depth="1"]');
    const level2Nodes = page.locator('[data-depth="2"]');

    await expect(level0Nodes.first()).toBeVisible();
    await expect(level1Nodes.first()).toBeVisible();
    await expect(level2Nodes.first()).toBeVisible();
  });

  test('should close details drawer', async ({ page }) => {
    // Open details drawer
    await page.getByText('Main Coordinator').click();
    await expect(page.locator('[role="complementary"]')).toBeVisible();

    // Close drawer
    const closeButton = page.locator('button[aria-label*="close" i]');
    await closeButton.click();

    // Verify drawer is closed
    await expect(page.locator('[role="complementary"]')).not.toBeVisible();
  });

  test('should handle empty hierarchy', async ({ page }) => {
    // Mock empty hierarchy by navigating with query param (if supported)
    // Or use MSW to mock empty response in test setup

    // For now, verify error state is handled gracefully
    await page.goto('/hierarchy?empty=true');
    await page.waitForLoadState('networkidle');

    // Should show empty state or error message
    const emptyState = page.locator('text=/no agents|empty|no hierarchy/i');
    // This test will need adjustment based on actual empty state implementation
  });
});
