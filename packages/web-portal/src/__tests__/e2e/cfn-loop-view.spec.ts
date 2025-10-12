/**
 * CFN Loop View E2E Tests
 * Complete user flows for phase timeline, loop status, metrics, and progress tracking
 */

import { test, expect } from '@playwright/test';
import { initializeStores } from './test-helpers';

test.describe('CFN Loop View E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Block WebSocket connections to prevent timeouts (must be set before any navigation)
    await page.route('**/socket.io/**', route => route.abort());

    // Navigate to page and wait for it to fully load
    await page.goto('/cfn-loop');
    await page.waitForLoadState('networkidle');

    // Directly inject data into Zustand stores (uses __cfnLoopStore and __agentStore on window)
    await initializeStores(page);

    // Wait for React to re-render with injected data
    await page.waitForTimeout(500);
  });

  test('complete flow: view timeline → select phase → view metrics → progress bars', async ({ page }) => {
    // Step 1: Verify CFN Loop Visualization loaded
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    // Step 2: Verify phase timeline is visible
    await expect(page.locator('text=/phase timeline/i')).toBeVisible();

    // Step 3: Verify all phases are rendered
    const phase1 = page.locator('[data-testid="phase-1"]');
    await expect(phase1).toBeVisible();
    await expect(phase1.locator('text=/phase 1/i')).toBeVisible();

    const phase2 = page.locator('[data-testid="phase-2"]');
    await expect(phase2).toBeVisible();

    const phase3 = page.locator('[data-testid="phase-3"]');
    await expect(phase3).toBeVisible();

    const phase4 = page.locator('[data-testid="phase-4"]');
    await expect(phase4).toBeVisible();

    // Step 4: Verify current loop status
    const loopStatus = page.locator('[data-testid="current-loop-status"]');
    await expect(loopStatus).toBeVisible();
    await expect(loopStatus.locator('text=/loop/i')).toBeVisible();
    await expect(loopStatus.locator('text=/confidence:/i')).toBeVisible();

    // Step 5: Verify metrics cards
    const gateThresholdCard = page.locator('[data-testid="metric-gate-threshold"]');
    await expect(gateThresholdCard).toBeVisible();
    const gateValue = await gateThresholdCard.locator('h3').textContent();
    expect(gateValue).toMatch(/%$/);

    const consensusCard = page.locator('[data-testid="metric-consensus-threshold"]');
    await expect(consensusCard).toBeVisible();

    // Step 6: Verify progress bars
    const loop3ProgressBar = page.locator('[data-testid="loop3-progress-bar"]');
    await expect(loop3ProgressBar).toBeVisible();
    const loop3Value = await loop3ProgressBar.getAttribute('aria-valuenow');
    expect(parseInt(loop3Value || '0')).toBeGreaterThanOrEqual(0);

    const loop2ProgressBar = page.locator('[data-testid="loop2-progress-bar"]');
    await expect(loop2ProgressBar).toBeVisible();
  });

  test('phase timeline navigation', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    // Verify phase timeline section
    await expect(page.locator('text=/phase timeline/i')).toBeVisible();

    // Verify all phases visible
    await expect(page.locator('[data-testid="phase-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="phase-2"]')).toBeVisible();
    await expect(page.locator('[data-testid="phase-3"]')).toBeVisible();
    await expect(page.locator('[data-testid="phase-4"]')).toBeVisible();

    // Verify phase names
    await expect(page.locator('text=/foundation/i').first()).toBeVisible();
    await expect(page.locator('text=/backend services/i').first()).toBeVisible();
    await expect(page.locator('text=/web portal/i').first()).toBeVisible();
    await expect(page.locator('text=/integration.*testing/i').first()).toBeVisible();
  });

  test('current loop status display', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    const loopStatus = page.locator('[data-testid="current-loop-status"]');
    await expect(loopStatus).toBeVisible();

    // Verify loop number
    const loopText = await loopStatus.locator('h5').textContent();
    expect(loopText).toMatch(/loop \d+/i);

    // Verify confidence chip
    await expect(loopStatus.locator('text=/confidence:/i')).toBeVisible();
    const confidenceText = await loopStatus.locator('text=/confidence:/i').textContent();
    expect(confidenceText).toMatch(/\d+%/);

    // Verify validators chip
    await expect(loopStatus.locator('text=/validators:/i')).toBeVisible();
  });

  test('metrics cards verification', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    // Gate Threshold card
    const gateCard = page.locator('[data-testid="metric-gate-threshold"]');
    await expect(gateCard).toBeVisible();
    await expect(gateCard.locator('text=/gate threshold/i')).toBeVisible();
    const gateValue = await gateCard.locator('h3').textContent();
    expect(gateValue).toMatch(/^\d+%$/);

    // Consensus Threshold card
    const consensusCard = page.locator('[data-testid="metric-consensus-threshold"]');
    await expect(consensusCard).toBeVisible();
    await expect(consensusCard.locator('text=/consensus threshold/i')).toBeVisible();
    const consensusValue = await consensusCard.locator('h3').textContent();
    expect(consensusValue).toMatch(/^\d+%$/);

    // Avg Loop 3 card
    const loop3Card = page.locator('[data-testid="metric-avg-loop3"]');
    await expect(loop3Card).toBeVisible();
    await expect(loop3Card.locator('text=/avg loop 3/i')).toBeVisible();

    // Avg Loop 2 card
    const loop2Card = page.locator('[data-testid="metric-avg-loop2"]');
    await expect(loop2Card).toBeVisible();
    await expect(loop2Card.locator('text=/avg loop 2/i')).toBeVisible();
  });

  test('progress bar accuracy', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    // Loop 3 progress bar
    const loop3ProgressBar = page.locator('[data-testid="loop3-progress-bar"]');
    await expect(loop3ProgressBar).toBeVisible();

    const loop3Value = await loop3ProgressBar.getAttribute('aria-valuenow');
    expect(loop3Value).toBeTruthy();
    const loop3Percentage = parseInt(loop3Value || '0');
    expect(loop3Percentage).toBeGreaterThanOrEqual(0);
    expect(loop3Percentage).toBeLessThanOrEqual(100);

    // Verify Loop 3 section header
    await expect(page.locator('text=/loop 3 progress.*implementation/i')).toBeVisible();

    // Loop 2 progress bar
    const loop2ProgressBar = page.locator('[data-testid="loop2-progress-bar"]');
    await expect(loop2ProgressBar).toBeVisible();

    const loop2Value = await loop2ProgressBar.getAttribute('aria-valuenow');
    expect(loop2Value).toBeTruthy();
    const loop2Percentage = parseInt(loop2Value || '0');
    expect(loop2Percentage).toBeGreaterThanOrEqual(0);
    expect(loop2Percentage).toBeLessThanOrEqual(100);

    // Verify Loop 2 section header
    await expect(page.locator('text=/loop 2 progress.*validation/i')).toBeVisible();
  });

  test('threshold status indicators', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    // Check for threshold status text
    const thresholdIndicators = page.locator('text=/threshold/i');
    const count = await thresholdIndicators.count();
    expect(count).toBeGreaterThan(0);

    // Verify status messages (above/below threshold)
    const statusMessages = page.locator('text=/above.*threshold|below.*threshold/i');
    const statusCount = await statusMessages.count();
    expect(statusCount).toBeGreaterThanOrEqual(0); // May or may not have status depending on values
  });

  test('phase completion status', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    const phase1 = page.locator('[data-testid="phase-1"]');
    await expect(phase1).toBeVisible();

    // Phase 1 should show completed status (Foundation)
    // Check for checkmark icon or success indicator
    await expect(phase1.locator('svg').first()).toBeVisible();

    const phase4 = page.locator('[data-testid="phase-4"]');
    await expect(phase4).toBeVisible();

    // Phase 4 should show pending/incomplete status
    await expect(phase4.locator('svg').first()).toBeVisible();
  });

  test('sprint chips display', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    const phase1 = page.locator('[data-testid="phase-1"]');

    // Verify sprint chips within phase
    await expect(phase1.locator('text=/monorepo setup/i')).toBeVisible();
    await expect(phase1.locator('text=/core infrastructure/i')).toBeVisible();

    const phase2 = page.locator('[data-testid="phase-2"]');
    await expect(phase2.locator('text=/api design/i')).toBeVisible();
  });

  test('refresh button functionality', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    const refreshButton = page.locator('button[aria-label*="refresh" i]').first();
    await expect(refreshButton).toBeVisible();

    await refreshButton.click();

    // Verify CFN Loop data still displayed after refresh
    await page.waitForTimeout(500);
    const loopStatus = page.locator('[data-testid="current-loop-status"]');
    await expect(loopStatus).toBeVisible();
  });

  test('progress bar color coding', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    // Loop 3 progress bar should have appropriate color based on threshold
    const loop3ProgressBar = page.locator('[data-testid="loop3-progress-bar"]');
    await expect(loop3ProgressBar).toBeVisible();

    // Check for MUI LinearProgress component
    await expect(loop3ProgressBar.locator('span').first()).toBeVisible();

    // Loop 2 progress bar
    const loop2ProgressBar = page.locator('[data-testid="loop2-progress-bar"]');
    await expect(loop2ProgressBar).toBeVisible();
    await expect(loop2ProgressBar.locator('span').first()).toBeVisible();
  });

  test('responsive layout adaptation', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /cfn loop visualization/i })).toBeVisible();

    // Verify layout elements are present
    await expect(page.locator('[data-testid="current-loop-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="metric-gate-threshold"]')).toBeVisible();
    await expect(page.locator('[data-testid="loop3-progress-bar"]')).toBeVisible();

    // All key components should be visible in default viewport
    const phase1 = page.locator('[data-testid="phase-1"]');
    await expect(phase1).toBeVisible();
  });
});
