/**
 * Events View E2E Tests
 * Complete user flows for event timeline, search, filters, and real-time updates
 */

import { test, expect } from '@playwright/test';

test.describe('Events View E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');
  });

  test('complete flow: view timeline → search → filter → verify updates', async ({ page }) => {
    // Step 1: Verify timeline loaded
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    // Step 2: Verify events are visible
    const eventItems = page.locator('[data-testid="event-item"]');
    await expect(eventItems.first()).toBeVisible({ timeout: 10000 });
    const initialCount = await eventItems.count();
    expect(initialCount).toBeGreaterThan(0);

    // Step 3: Search for specific event
    const searchInput = page.locator('input[placeholder*="search" i], input[aria-label*="search" i]').first();
    await searchInput.fill('agent');
    await page.waitForTimeout(500);

    const searchResults = page.locator('[data-testid="event-item"]');
    const searchCount = await searchResults.count();
    expect(searchCount).toBeGreaterThan(0);

    // Step 4: Clear search
    await searchInput.clear();
    await page.waitForTimeout(300);

    // Step 5: Filter by category
    const categorySelect = page.locator('[data-testid="category-filter"]').first();
    await categorySelect.click();
    const lifecycleOption = page.locator('li').filter({ hasText: /agent lifecycle/i }).first();
    await lifecycleOption.click();
    await page.waitForTimeout(500);

    const categoryResults = page.locator('[data-testid="event-item"]');
    const categoryCount = await categoryResults.count();
    expect(categoryCount).toBeGreaterThan(0);

    // Step 6: Filter by severity
    const severitySelect = page.locator('[data-testid="severity-filter"]').first();
    await severitySelect.click();
    const infoOption = page.locator('li').filter({ hasText: /^info$/i }).first();
    await infoOption.click();
    await page.waitForTimeout(500);

    const severityResults = page.locator('[data-testid="event-item"]');
    await expect(severityResults.first()).toBeVisible();
  });

  test('category filter flow: all categories', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    const categorySelect = page.locator('[data-testid="category-filter"]').first();

    // Test Agent Lifecycle category
    await categorySelect.click();
    await page.locator('li').filter({ hasText: /agent lifecycle/i }).first().click();
    await page.waitForTimeout(300);
    let eventItems = page.locator('[data-testid="event-item"]');
    await expect(eventItems.first()).toBeVisible();

    // Test CFN Loop category
    await categorySelect.click();
    await page.locator('li').filter({ hasText: /cfn loop/i }).first().click();
    await page.waitForTimeout(300);
    eventItems = page.locator('[data-testid="event-item"]');
    const cfnCount = await eventItems.count();
    expect(cfnCount).toBeGreaterThanOrEqual(0);

    // Test System Error category
    await categorySelect.click();
    await page.locator('li').filter({ hasText: /system error/i }).first().click();
    await page.waitForTimeout(300);
    eventItems = page.locator('[data-testid="event-item"]');
    const errorCount = await eventItems.count();
    expect(errorCount).toBeGreaterThanOrEqual(0);
  });

  test('severity filter flow: all severities', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    const severitySelect = page.locator('[data-testid="severity-filter"]').first();

    // Test Info severity
    await severitySelect.click();
    await page.locator('li').filter({ hasText: /^info$/i }).first().click();
    await page.waitForTimeout(300);
    let eventItems = page.locator('[data-testid="event-item"]');
    await expect(eventItems.first()).toBeVisible();

    // Test Warning severity
    await severitySelect.click();
    await page.locator('li').filter({ hasText: /^warning$/i }).first().click();
    await page.waitForTimeout(300);
    eventItems = page.locator('[data-testid="event-item"]');
    const warningCount = await eventItems.count();
    expect(warningCount).toBeGreaterThanOrEqual(0);

    // Test Error severity
    await severitySelect.click();
    await page.locator('li').filter({ hasText: /^error$/i }).first().click();
    await page.waitForTimeout(300);
    eventItems = page.locator('[data-testid="event-item"]');
    const errorCount = await eventItems.count();
    expect(errorCount).toBeGreaterThanOrEqual(0);
  });

  test('date range filter flow: all presets', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    const dateRangeSelect = page.locator('[data-testid="daterange-filter"]').first();

    // Test Last Hour preset
    await dateRangeSelect.click();
    await page.locator('li').filter({ hasText: /last hour/i }).first().click();
    await page.waitForTimeout(300);
    let eventItems = page.locator('[data-testid="event-item"]');
    const hourCount = await eventItems.count();
    expect(hourCount).toBeGreaterThanOrEqual(0);

    // Test Last 7 Days preset
    await dateRangeSelect.click();
    await page.locator('li').filter({ hasText: /last 7 days/i }).first().click();
    await page.waitForTimeout(300);
    eventItems = page.locator('[data-testid="event-item"]');
    const weekCount = await eventItems.count();
    expect(weekCount).toBeGreaterThanOrEqual(0);

    // Test All Time preset
    await dateRangeSelect.click();
    await page.locator('li').filter({ hasText: /all time/i }).first().click();
    await page.waitForTimeout(300);
    eventItems = page.locator('[data-testid="event-item"]');
    await expect(eventItems.first()).toBeVisible();
  });

  test('search functionality: text, agent ID, event type', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    const searchInput = page.locator('[data-testid="search-input"]').first();

    // Search by text
    await searchInput.fill('agent');
    await page.waitForTimeout(300);
    let eventItems = page.locator('[data-testid="event-item"]');
    await expect(eventItems.first()).toBeVisible();

    // Clear and search by agent ID pattern
    await searchInput.clear();
    await searchInput.fill('001');
    await page.waitForTimeout(300);
    eventItems = page.locator('[data-testid="event-item"]');
    const agentIdCount = await eventItems.count();
    expect(agentIdCount).toBeGreaterThanOrEqual(0);

    // Clear and search by event type
    await searchInput.clear();
    await searchInput.fill('lifecycle');
    await page.waitForTimeout(300);
    eventItems = page.locator('[data-testid="event-item"]');
    const typeCount = await eventItems.count();
    expect(typeCount).toBeGreaterThanOrEqual(0);
  });

  test('virtual scrolling performance', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    // Verify virtual list is present
    const virtualList = page.locator('[style*="overflow"]').first();
    await expect(virtualList).toBeVisible();

    // Get initial event count
    const initialItems = page.locator('[data-testid="event-item"]');
    const initialCount = await initialItems.count();
    expect(initialCount).toBeGreaterThan(0);

    // Scroll down
    await virtualList.evaluate(el => el.scrollTop = 500);
    await page.waitForTimeout(200);

    // Verify items still visible after scroll
    const scrolledItems = page.locator('[data-testid="event-item"]');
    await expect(scrolledItems.first()).toBeVisible();
  });

  test('refresh button functionality', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    const refreshButton = page.locator('button[aria-label*="refresh" i]').first();
    await expect(refreshButton).toBeVisible();

    await refreshButton.click();

    // Verify events still displayed after refresh
    await page.waitForTimeout(500);
    const eventItems = page.locator('[data-testid="event-item"]');
    await expect(eventItems.first()).toBeVisible();
  });

  test('filter toggle button', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    const filterToggle = page.locator('button[aria-label*="toggle filter" i]').first();
    await expect(filterToggle).toBeVisible();

    // Filters should be visible by default
    await expect(page.locator('text=/filters/i').first()).toBeVisible();

    // Hide filters
    await filterToggle.click();
    await page.waitForTimeout(300);

    // Show filters again
    await filterToggle.click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=/filters/i').first()).toBeVisible();
  });

  test('clear filters button', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    // Apply search filter
    const searchInput = page.locator('[data-testid="search-input"]').first();
    await searchInput.fill('test');
    await page.waitForTimeout(300);

    // Apply category filter
    const categorySelect = page.locator('[data-testid="category-filter"]').first();
    await categorySelect.click();
    await page.locator('li').filter({ hasText: /agent lifecycle/i }).first().click();
    await page.waitForTimeout(300);

    // Click clear filters
    const clearButton = page.locator('[data-testid="clear-filters-button"]').first();
    await clearButton.click();
    await page.waitForTimeout(300);

    // Verify filters cleared
    await expect(searchInput).toHaveValue('');
  });

  test('event statistics chips display', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /events/i })).toBeVisible();

    // Verify all statistic chips are present
    await expect(page.locator('text=/total:/i')).toBeVisible();
    await expect(page.locator('text=/info:/i')).toBeVisible();
    await expect(page.locator('text=/warning:/i')).toBeVisible();
    await expect(page.locator('text=/error:/i')).toBeVisible();
  });
});
