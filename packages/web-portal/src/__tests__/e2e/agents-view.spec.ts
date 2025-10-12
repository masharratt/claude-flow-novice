/**
 * Agents View E2E Tests
 *
 * End-to-end user flow tests for agents view: view list, search, filter,
 * spawn agent, verify in list
 */

import { test, expect } from '@playwright/test';

test.describe('Agents View E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
  });

  test('complete user flow: view list → search → filter → spawn agent → verify in list', async ({ page }) => {
    // Step 1: View agent list
    await expect(page.locator('h1, h4').filter({ hasText: /agents/i })).toBeVisible();
    const agentCards = page.locator('[data-testid="agent-card"], [data-testid="agent-row"]');
    await expect(agentCards.first()).toBeVisible();

    // Step 2: Search for specific agent
    const searchInput = page.locator('input[placeholder*="search" i]');
    await searchInput.fill('Security');
    await page.waitForTimeout(300); // Debounce
    await expect(page.getByText('Security Specialist')).toBeVisible();

    // Step 3: Clear search
    const clearButton = page.locator('button[aria-label*="clear" i]');
    await clearButton.click();
    await expect(searchInput).toHaveValue('');

    // Step 4: Apply status filter
    const statusFilter = page.locator('select[aria-label*="status" i], button:has-text("Filter")');
    await statusFilter.click();
    const activeOption = page.locator('li[role="option"]:has-text("Active"), [value="active"]');
    await activeOption.click();

    // Step 5: Verify filtered results
    const activeAgents = page.locator('[data-status="active"]');
    await expect(activeAgents.first()).toBeVisible();

    // Step 6: Reset filters
    const resetButton = page.locator('button[aria-label*="reset" i], button:has-text("Reset")');
    await resetButton.click();

    // Step 7: Open spawn agent modal
    const spawnButton = page.locator('button:has-text("Spawn"), button:has-text("New Agent")');
    await spawnButton.click();
    await expect(page.locator('dialog, [role="dialog"]')).toBeVisible();

    // Step 8: Fill spawn form
    const typeSelect = page.locator('select[aria-label*="type" i], input[name="type"]');
    await typeSelect.click();
    await page.locator('li:has-text("Coder"), [value="coder"]').click();

    const nameInput = page.locator('input[aria-label*="name" i], input[name="name"]');
    await nameInput.fill('E2E Test Agent');

    const capabilitiesSelect = page.locator('input[aria-label*="capabilities" i]');
    await capabilitiesSelect.click();
    await page.locator('li:has-text("Coding")').click();
    await page.locator('li:has-text("Testing")').click();
    await page.keyboard.press('Escape'); // Close dropdown

    // Step 9: Submit spawn request
    const submitButton = page.locator('dialog button:has-text("Spawn"), dialog button:has-text("Create")');
    await submitButton.click();

    // Step 10: Verify success notification
    await expect(page.locator('text=/spawned successfully/i')).toBeVisible({ timeout: 5000 });

    // Step 11: Verify new agent appears in list
    await expect(page.getByText('E2E Test Agent')).toBeVisible({ timeout: 3000 });
  });

  test('should switch between list and grid views', async ({ page }) => {
    // Initial list view
    await expect(page.locator('[data-view="list"], .list-view')).toBeVisible();

    // Toggle to grid view
    const gridButton = page.locator('button[aria-label*="grid" i]');
    await gridButton.click();

    // Verify grid view is active
    await expect(page.locator('[data-view="grid"], .grid-view')).toBeVisible();

    // Toggle back to list view
    const listButton = page.locator('button[aria-label*="list" i]');
    await listButton.click();

    await expect(page.locator('[data-view="list"], .list-view')).toBeVisible();
  });

  test('should filter agents by type', async ({ page }) => {
    // Open type filter
    const typeFilter = page.locator('select[aria-label*="type" i], button:has-text("Type")');
    await typeFilter.click();

    // Select "Tester"
    await page.locator('li:has-text("Tester"), [value="tester"]').click();

    // Verify only tester agents are visible
    await expect(page.getByText('Test Engineer')).toBeVisible();
    await expect(page.getByText('Security Specialist')).not.toBeVisible();
  });

  test('should terminate agent with confirmation', async ({ page }) => {
    // Find first agent's terminate button
    const firstTerminateButton = page.locator('button[aria-label*="terminate" i]').first();
    await firstTerminateButton.click();

    // Verify confirmation dialog
    await expect(page.locator('dialog, [role="dialog"]')).toBeVisible();
    await expect(page.locator('text=/terminate agent|confirm/i')).toBeVisible();

    // Fill reason
    const reasonInput = page.locator('input[aria-label*="reason" i], textarea[aria-label*="reason" i]');
    await reasonInput.fill('E2E test cleanup');

    // Confirm termination
    const confirmButton = page.locator('dialog button:has-text("Terminate"), dialog button:has-text("Confirm")');
    await confirmButton.click();

    // Verify success notification
    await expect(page.locator('text=/terminated successfully/i')).toBeVisible({ timeout: 5000 });
  });

  test('should validate spawn form fields', async ({ page }) => {
    // Open spawn modal
    await page.locator('button:has-text("Spawn")').click();

    // Try to submit without filling required fields
    const submitButton = page.locator('dialog button:has-text("Spawn")');
    await submitButton.click();

    // Verify validation errors
    await expect(page.locator('text=/type is required/i, text=/name is required/i')).toBeVisible();
  });

  test('should search agents by name', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i]');
    await searchInput.fill('Primary Coder');
    await page.waitForTimeout(300);

    await expect(page.getByText('Primary Coder')).toBeVisible();
    await expect(page.getByText('Security Specialist')).not.toBeVisible();
  });

  test('should display agent metadata', async ({ page }) => {
    // Verify tasks completed and confidence are visible
    await expect(page.locator('text=/tasks.*completed/i')).toBeVisible();
    await expect(page.locator('text=/confidence|0\\.\\d+|\\d+%/i')).toBeVisible();
  });

  test('should show current task for in-progress agents', async ({ page }) => {
    // Find in-progress agent
    const inProgressAgent = page.locator('[data-status="in_progress"]').first();
    await expect(inProgressAgent).toBeVisible();

    // Verify current task is displayed
    await expect(inProgressAgent.locator('text=/current task|implementing|writing/i')).toBeVisible();
  });

  test('should handle empty search results', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i]');
    await searchInput.fill('NonexistentAgent12345');
    await page.waitForTimeout(300);

    await expect(page.locator('text=/no agents found/i')).toBeVisible();
  });

  test('should navigate to agent details (if implemented)', async ({ page }) => {
    // Click on first agent card/row
    const firstAgent = page.locator('[data-testid="agent-card"], [data-testid="agent-row"]').first();
    const agentName = await firstAgent.locator('text=/agent|coder|specialist/i').first().textContent();

    await firstAgent.click();

    // If agent details page exists, verify navigation
    // Note: This test will need adjustment based on actual implementation
    await page.waitForLoadState('networkidle');
  });
});
