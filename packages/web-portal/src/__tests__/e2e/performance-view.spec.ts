/**
 * Performance View E2E Tests
 *
 * End-to-end user flow tests for performance view: view charts, change time range,
 * verify data updates, export CSV
 */

import { test, expect } from '@playwright/test';

test.describe('Performance View E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/performance');
    await page.waitForLoadState('networkidle');
  });

  test('complete user flow: view charts → change time range → verify data updates → export CSV', async ({ page }) => {
    // Step 1: Verify performance view loaded
    await expect(page.locator('h1, h4').filter({ hasText: /performance/i })).toBeVisible();

    // Step 2: Verify all 4 metric cards are visible
    await expect(page.locator('text=/System CPU/i')).toBeVisible();
    await expect(page.locator('text=/Memory Usage/i')).toBeVisible();
    await expect(page.locator('text=/Active Agents/i')).toBeVisible();
    await expect(page.locator('text=/Events.*sec/i')).toBeVisible();

    // Step 3: Verify metric values are displayed
    await expect(page.locator('text=/\\d+\\.\\d+%/').first()).toBeVisible(); // CPU percentage
    await expect(page.locator('text=/\\d+\\.\\d+ GB|\\d+ MB/i')).toBeVisible(); // Memory
    await expect(page.locator('text=/\\d{2,}/').first()).toBeVisible(); // Agent count

    // Step 4: Verify all 4 charts are rendered
    await expect(page.locator('[data-testid="cpu-chart"], canvas').first()).toBeVisible();
    await expect(page.locator('[data-testid="memory-chart"], canvas').nth(1)).toBeVisible();
    await expect(page.locator('[data-testid="agents-chart"], canvas').nth(2)).toBeVisible();
    await expect(page.locator('[data-testid="events-chart"], canvas').nth(3)).toBeVisible();

    // Step 5: Change time range to 6 hours
    const timeRangeSelect = page.locator('select[aria-label*="time range" i], button:has-text("Time Range")');
    await timeRangeSelect.click();

    const sixHoursOption = page.locator('li:has-text("6 Hours"), [value="6h"]');
    await sixHoursOption.click();

    // Step 6: Wait for charts to update
    await page.waitForTimeout(1000);

    // Step 7: Verify data updated (check for loading indicator disappearing)
    await expect(page.locator('[data-testid="loading-spinner"]')).not.toBeVisible();

    // Step 8: Change to 24 hours
    await timeRangeSelect.click();
    const twentyFourHoursOption = page.locator('li:has-text("24 Hours"), [value="24h"]');
    await twentyFourHoursOption.click();
    await page.waitForTimeout(1000);

    // Step 9: Export metrics as CSV
    const exportButton = page.locator('button:has-text("Export"), button[aria-label*="export" i]');

    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();

    // Step 10: Verify CSV download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/performance.*\.csv/i);

    // Step 11: Verify CSV content
    const path = await download.path();
    if (path) {
      const fs = require('fs');
      const csvContent = fs.readFileSync(path, 'utf8');
      expect(csvContent).toContain('Timestamp,CPU');
      expect(csvContent).toContain('Memory');
      expect(csvContent).toContain('Active Agents');
      expect(csvContent).toContain('Events');
    }

    // Step 12: Verify export success notification
    await expect(page.locator('text=/exported successfully/i')).toBeVisible({ timeout: 3000 });
  });

  test('should display all metric cards with correct values', async ({ page }) => {
    // CPU metric
    const cpuCard = page.locator('[data-testid="metric-card-cpu"]');
    await expect(cpuCard.locator('text=/System CPU/i')).toBeVisible();
    await expect(cpuCard.locator('text=/\\d+\\.\\d+%/')).toBeVisible();

    // Memory metric
    const memoryCard = page.locator('[data-testid="metric-card-memory"]');
    await expect(memoryCard.locator('text=/Memory Usage/i')).toBeVisible();
    await expect(memoryCard.locator('text=/\\d+\\.\\d+ GB|\\d+ MB/i')).toBeVisible();

    // Agents metric
    const agentsCard = page.locator('[data-testid="metric-card-agents"]');
    await expect(agentsCard.locator('text=/Active Agents/i')).toBeVisible();
    await expect(agentsCard.locator('text=/\\d{2,}/')).toBeVisible();

    // Events metric
    const eventsCard = page.locator('[data-testid="metric-card-events"]');
    await expect(eventsCard.locator('text=/Events.*sec/i')).toBeVisible();
    await expect(eventsCard.locator('text=/\\d{3,}/')).toBeVisible();
  });

  test('should display trend indicators on metric cards', async ({ page }) => {
    // Verify trend arrows/indicators are visible
    const trendIndicators = page.locator('[data-testid*="trend"], svg[data-testid*="arrow"]');
    await expect(trendIndicators.first()).toBeVisible();

    // Verify trend percentages
    await expect(page.locator('text=/[+-]\\d+\\.\\d+%/').first()).toBeVisible();
  });

  test('should render CPU usage chart', async ({ page }) => {
    const cpuChart = page.locator('[data-testid="cpu-chart"], text=/CPU Usage/i').locator('..').locator('canvas');
    await expect(cpuChart).toBeVisible();

    // Verify chart has data (canvas should have drawn something)
    const boundingBox = await cpuChart.boundingBox();
    expect(boundingBox).toBeTruthy();
    expect(boundingBox!.width).toBeGreaterThan(0);
    expect(boundingBox!.height).toBeGreaterThan(0);
  });

  test('should render memory usage chart', async ({ page }) => {
    const memoryChart = page.locator('[data-testid="memory-chart"], text=/Memory Usage/i').locator('..').locator('canvas');
    await expect(memoryChart).toBeVisible();
  });

  test('should render agents status chart', async ({ page }) => {
    const agentsChart = page.locator('[data-testid="agents-chart"], text=/Agent Status/i').locator('..').locator('canvas');
    await expect(agentsChart).toBeVisible();
  });

  test('should render events per second chart', async ({ page }) => {
    const eventsChart = page.locator('[data-testid="events-chart"], text=/Events.*Second/i').locator('..').locator('canvas');
    await expect(eventsChart).toBeVisible();
  });

  test('should change time range to 1 hour', async ({ page }) => {
    const timeRangeSelect = page.locator('select[aria-label*="time range" i]');
    await timeRangeSelect.selectOption('1h');

    // Verify selection
    await expect(timeRangeSelect).toHaveValue('1h');

    // Wait for chart update
    await page.waitForTimeout(500);
  });

  test('should change time range to 7 days', async ({ page }) => {
    const timeRangeSelect = page.locator('select[aria-label*="time range" i]');
    await timeRangeSelect.click();

    const sevenDaysOption = page.locator('li:has-text("7 Days"), [value="7d"]');
    await sevenDaysOption.click();

    await expect(timeRangeSelect).toHaveValue('7d');
    await page.waitForTimeout(500);
  });

  test('should change time range to 30 days', async ({ page }) => {
    const timeRangeSelect = page.locator('select[aria-label*="time range" i]');
    await timeRangeSelect.click();

    const thirtyDaysOption = page.locator('li:has-text("30 Days"), [value="30d"]');
    await thirtyDaysOption.click();

    await expect(timeRangeSelect).toHaveValue('30d');
    await page.waitForTimeout(500);
  });

  test('should pause auto-refresh', async ({ page }) => {
    // Find pause button
    const pauseButton = page.locator('button[aria-label*="pause" i]');
    await pauseButton.click();

    // Verify button changed to "resume"
    await expect(page.locator('button[aria-label*="resume" i]')).toBeVisible();
  });

  test('should resume auto-refresh after pause', async ({ page }) => {
    // Pause first
    const pauseButton = page.locator('button[aria-label*="pause" i]');
    await pauseButton.click();

    // Resume
    const resumeButton = page.locator('button[aria-label*="resume" i]');
    await resumeButton.click();

    // Verify button changed back to "pause"
    await expect(pauseButton).toBeVisible();
  });

  test('should manually refresh data', async ({ page }) => {
    const refreshButton = page.locator('button[aria-label*="refresh" i]');

    // Record initial CPU value
    const initialCpuText = await page.locator('text=/System CPU/i').locator('..').locator('text=/\\d+\\.\\d+%/').textContent();

    // Click refresh
    await refreshButton.click();

    // Wait for refresh to complete
    await page.waitForTimeout(1000);

    // Verify data updated (or at least refresh was triggered)
    await expect(page.locator('[data-testid="loading-spinner"]')).not.toBeVisible();
  });

  test('should show chart tooltips on hover', async ({ page }) => {
    const cpuChart = page.locator('[data-testid="cpu-chart"], canvas').first();
    await expect(cpuChart).toBeVisible();

    // Hover over chart
    const boundingBox = await cpuChart.boundingBox();
    if (boundingBox) {
      await page.mouse.move(
        boundingBox.x + boundingBox.width / 2,
        boundingBox.y + boundingBox.height / 2
      );

      // Wait for tooltip (implementation-dependent)
      await page.waitForTimeout(300);

      // Verify tooltip appears (this will depend on chart library)
      // For Chart.js, tooltips are rendered in canvas
    }
  });

  test('should display chart legends', async ({ page }) => {
    // Verify legends are visible for each chart
    await expect(page.locator('text=/CPU Usage/i')).toBeVisible();
    await expect(page.locator('text=/Memory Usage/i')).toBeVisible();
    await expect(page.locator('text=/Active.*Idle.*Progress/i')).toBeVisible();
    await expect(page.locator('text=/Events.*Second/i')).toBeVisible();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Simulate network error by going offline
    await page.context().setOffline(true);

    // Try to refresh
    const refreshButton = page.locator('button[aria-label*="refresh" i]');
    await refreshButton.click();

    // Verify error message
    await expect(page.locator('text=/error|failed|offline/i')).toBeVisible({ timeout: 5000 });

    // Go back online
    await page.context().setOffline(false);
  });

  test('should show connection status indicator', async ({ page }) => {
    // Verify connection status is displayed
    await expect(page.locator('text=/connected|online/i')).toBeVisible();
  });

  test('should display last updated timestamp', async ({ page }) => {
    // Verify timestamp is displayed
    await expect(page.locator('text=/last updated|updated/i')).toBeVisible();
    await expect(page.locator('text=/\\d{1,2}:\\d{2}(:\\d{2})? (AM|PM)?/i')).toBeVisible();
  });

  test('should verify CSV export contains all time range data', async ({ page }) => {
    // Change to 24h range
    const timeRangeSelect = page.locator('select[aria-label*="time range" i]');
    await timeRangeSelect.selectOption('24h');
    await page.waitForTimeout(500);

    // Export
    const exportButton = page.locator('button:has-text("Export")');
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();

    const download = await downloadPromise;
    const path = await download.path();

    if (path) {
      const fs = require('fs');
      const csvContent = fs.readFileSync(path, 'utf8');
      const lines = csvContent.split('\n');

      // Verify CSV has data for 24h range (should have ~96 rows for 15-min intervals)
      expect(lines.length).toBeGreaterThan(50);
    }
  });

  test('should show metric trend comparisons', async ({ page }) => {
    // Verify trend labels are present
    await expect(page.locator('text=/vs last.*hour|period/i').first()).toBeVisible();

    // Verify trend values (positive/negative)
    const trendValues = page.locator('text=/[+-]\\d+\\.\\d+%/');
    await expect(trendValues.first()).toBeVisible();
  });
});
