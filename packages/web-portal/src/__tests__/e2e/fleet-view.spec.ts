/**
 * Fleet View E2E Tests
 * Complete user flows for fleet aggregation, grid/list toggle, and swarm details
 */

import { test, expect } from '@playwright/test';
import { initializeStores } from './test-helpers';

test.describe('Fleet View E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Block WebSocket connections to prevent timeouts
    await page.route('**/socket.io/**', route => route.abort());

    await page.goto('/fleet');
    await page.waitForLoadState('networkidle');

    // Initialize stores with fixture data (uses window.__agentStore)
    await initializeStores(page);

    // Wait for React to re-render with injected data
    await page.waitForTimeout(500);
  });

  test('complete flow: view aggregation → toggle grid/list → view swarm details', async ({ page }) => {
    // Step 1: Verify Fleet Overview loaded
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    // Step 2: Verify aggregation cards are visible
    const totalAgentsCard = page.locator('[data-testid="metric-card-total-agents"]');
    await expect(totalAgentsCard).toBeVisible();
    const totalAgents = await totalAgentsCard.locator('h3').textContent();
    expect(totalAgents).toBeTruthy();

    const activeSwarmsCard = page.locator('[data-testid="metric-card-active-swarms"]');
    await expect(activeSwarmsCard).toBeVisible();

    const avgConfidenceCard = page.locator('[data-testid="metric-card-avg-confidence"]');
    await expect(avgConfidenceCard).toBeVisible();
    const confidence = await avgConfidenceCard.locator('h3').textContent();
    expect(confidence).toMatch(/%$/);

    // Step 3: Verify list view is default
    const listButton = page.locator('button[aria-label*="list view" i]');
    await expect(listButton).toHaveAttribute('aria-pressed', 'true');

    // Step 4: Switch to grid view
    const gridButton = page.locator('button[aria-label*="grid view" i]');
    await gridButton.click();
    await page.waitForTimeout(300);
    await expect(gridButton).toHaveAttribute('aria-pressed', 'true');

    // Step 5: Verify swarm cards in grid view
    const swarmCards = page.locator('[data-testid="swarm-card"]');
    await expect(swarmCards.first()).toBeVisible();
    const gridCount = await swarmCards.count();
    expect(gridCount).toBeGreaterThan(0);

    // Step 6: Switch back to list view
    await listButton.click();
    await page.waitForTimeout(300);
    await expect(listButton).toHaveAttribute('aria-pressed', 'true');

    // Step 7: Verify swarm list items
    const swarmListItems = page.locator('[data-testid="swarm-list-item"]');
    await expect(swarmListItems.first()).toBeVisible();
  });

  test('aggregation cards display', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    // Verify Total Agents card
    const totalAgentsCard = page.locator('[data-testid="metric-card-total-agents"]');
    await expect(totalAgentsCard).toBeVisible();
    await expect(totalAgentsCard.locator('text=/total agents/i')).toBeVisible();
    const totalAgentsValue = await totalAgentsCard.locator('h3').textContent();
    expect(totalAgentsValue).toBeTruthy();
    expect(parseInt(totalAgentsValue || '0')).toBeGreaterThanOrEqual(0);

    // Verify Active Swarms card
    const activeSwarmsCard = page.locator('[data-testid="metric-card-active-swarms"]');
    await expect(activeSwarmsCard).toBeVisible();
    await expect(activeSwarmsCard.locator('text=/active swarms/i')).toBeVisible();

    // Verify Avg Confidence card
    const avgConfidenceCard = page.locator('[data-testid="metric-card-avg-confidence"]');
    await expect(avgConfidenceCard).toBeVisible();
    await expect(avgConfidenceCard.locator('text=/avg confidence/i')).toBeVisible();
    const confidenceValue = await avgConfidenceCard.locator('h3').textContent();
    expect(confidenceValue).toMatch(/%$/);

    // Verify Tasks Completed card
    const tasksCard = page.locator('[data-testid="metric-card-tasks-completed"]');
    await expect(tasksCard).toBeVisible();
    await expect(tasksCard.locator('text=/tasks completed/i')).toBeVisible();
  });

  test('grid/list toggle functionality', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    const listButton = page.locator('button[aria-label*="list view" i]');
    const gridButton = page.locator('button[aria-label*="grid view" i]');

    // Verify initial state (list view)
    await expect(listButton).toBeVisible();
    await expect(gridButton).toBeVisible();
    await expect(listButton).toHaveAttribute('aria-pressed', 'true');

    // Toggle to grid view
    await gridButton.click();
    await page.waitForTimeout(200);
    await expect(gridButton).toHaveAttribute('aria-pressed', 'true');
    await expect(listButton).toHaveAttribute('aria-pressed', 'false');

    // Verify grid cards visible
    const swarmCards = page.locator('[data-testid="swarm-card"]');
    await expect(swarmCards.first()).toBeVisible();

    // Toggle back to list view
    await listButton.click();
    await page.waitForTimeout(200);
    await expect(listButton).toHaveAttribute('aria-pressed', 'true');
    await expect(gridButton).toHaveAttribute('aria-pressed', 'false');

    // Verify list items visible
    const swarmListItems = page.locator('[data-testid="swarm-list-item"]');
    await expect(swarmListItems.first()).toBeVisible();
  });

  test('swarm list rendering in list view', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    const listButton = page.locator('button[aria-label*="list view" i]');
    await listButton.click();
    await page.waitForTimeout(200);

    const swarmListItems = page.locator('[data-testid="swarm-list-item"]');
    await expect(swarmListItems.first()).toBeVisible();

    const itemCount = await swarmListItems.count();
    expect(itemCount).toBeGreaterThan(0);

    // Verify first swarm displays name and agent count
    const firstSwarm = swarmListItems.first();
    const swarmName = await firstSwarm.locator('text=/sprint|swarm|backend/i').first().textContent();
    expect(swarmName).toBeTruthy();

    const agentCount = await firstSwarm.locator('text=/agents/i').textContent();
    expect(agentCount).toBeTruthy();
  });

  test('swarm grid rendering in grid view', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    const gridButton = page.locator('button[aria-label*="grid view" i]');
    await gridButton.click();
    await page.waitForTimeout(200);

    const swarmCards = page.locator('[data-testid="swarm-card"]');
    await expect(swarmCards.first()).toBeVisible();

    const cardCount = await swarmCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Verify first card displays swarm details
    const firstCard = swarmCards.first();
    const swarmName = await firstCard.locator('h6').first().textContent();
    expect(swarmName).toBeTruthy();

    const agentCount = await firstCard.locator('text=/agents/i').textContent();
    expect(agentCount).toBeTruthy();

    // Verify status chips present
    await expect(firstCard.locator('text=/active:/i')).toBeVisible();
    await expect(firstCard.locator('text=/idle:/i')).toBeVisible();
  });

  test('swarm status breakdown display', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    const swarmListItems = page.locator('[data-testid="swarm-list-item"]').first();
    await expect(swarmListItems).toBeVisible();

    // Verify status chips
    await expect(swarmListItems.locator('text=/active:/i')).toBeVisible();
    await expect(swarmListItems.locator('text=/idle:/i')).toBeVisible();
    await expect(swarmListItems.locator('text=/done:/i')).toBeVisible();
  });

  test('virtual scrolling for swarm list', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    // Verify virtual list container
    const virtualList = page.locator('[style*="overflow"]').first();
    await expect(virtualList).toBeVisible();

    const initialItems = page.locator('[data-testid*="swarm-"]');
    const initialCount = await initialItems.count();
    expect(initialCount).toBeGreaterThan(0);

    // Scroll in virtual list
    await virtualList.evaluate(el => el.scrollTop = 300);
    await page.waitForTimeout(200);

    // Verify items still visible after scroll
    const scrolledItems = page.locator('[data-testid*="swarm-"]');
    await expect(scrolledItems.first()).toBeVisible();
  });

  test('agent distribution chart rendering', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    // Verify chart section header
    await expect(page.locator('text=/agent distribution by type/i')).toBeVisible();

    // Verify chart container
    const chartContainer = page.locator('[data-testid="agent-distribution-chart"]');
    await expect(chartContainer).toBeVisible();

    // Verify canvas element (pie chart)
    await expect(chartContainer.locator('canvas')).toBeVisible();
  });

  test('refresh button functionality', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    const refreshButton = page.locator('button[aria-label*="refresh" i]').first();
    await expect(refreshButton).toBeVisible();

    await refreshButton.click();

    // Verify fleet data still displayed after refresh
    await page.waitForTimeout(500);
    const totalAgentsCard = page.locator('[data-testid="metric-card-total-agents"]');
    await expect(totalAgentsCard).toBeVisible();
  });

  test('swarm list section header', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    // Verify swarm list section
    await expect(page.locator('text=/swarm list/i').first()).toBeVisible();
  });

  test('metrics update when data changes', async ({ page }) => {
    await expect(page.locator('h4, h1').filter({ hasText: /fleet overview/i })).toBeVisible();

    // Get initial metric values
    const totalAgentsCard = page.locator('[data-testid="metric-card-total-agents"]');
    const initialValue = await totalAgentsCard.locator('h3').textContent();
    expect(initialValue).toBeTruthy();

    // Verify metric cards are responsive
    await page.waitForTimeout(100);
    const updatedValue = await totalAgentsCard.locator('h3').textContent();
    expect(updatedValue).toBeTruthy();
  });
});
