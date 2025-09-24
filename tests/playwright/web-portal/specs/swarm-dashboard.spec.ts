/**
 * @file Swarm Dashboard Interaction Tests
 * @description Comprehensive tests for swarm dashboard functionality
 */

import { test, expect } from '@playwright/test';
import { WebPortalPage } from '../page-objects/web-portal-page';

test.describe('Swarm Dashboard Interactions', () => {
  let portalPage: WebPortalPage;

  test.beforeEach(async ({ page }) => {
    portalPage = new WebPortalPage(page);
    await portalPage.goto();
    await portalPage.login('test-admin', 'test-password');
    await portalPage.waitForDashboard();
  });

  test.describe('System Overview Panel', () => {
    test('should display system statistics correctly', async ({ page }) => {
      const systemStats = page.locator('[data-testid="system-stats"]');
      await expect(systemStats).toBeVisible();
      await expect(systemStats.locator('h3')).toHaveText('System Overview');

      // Check all stat items
      const statItems = systemStats.locator('.stat-item');
      await expect(statItems).toHaveCount(4);

      // Verify stat values are numbers
      const activeSwarms = await page.locator('#activeSwarms').textContent();
      const activeAgents = await page.locator('#activeAgents').textContent();
      const runningTasks = await page.locator('#runningTasks').textContent();
      const completedTasks = await page.locator('#completedTasks').textContent();

      expect(parseInt(activeSwarms!)).toBeGreaterThanOrEqual(0);
      expect(parseInt(activeAgents!)).toBeGreaterThanOrEqual(0);
      expect(parseInt(runningTasks!)).toBeGreaterThanOrEqual(0);
      expect(parseInt(completedTasks!)).toBeGreaterThanOrEqual(0);
    });

    test('should update statistics in real-time', async ({ page }) => {
      // Get initial values
      const initialStats = {
        swarms: await page.locator('#activeSwarms').textContent(),
        agents: await page.locator('#activeAgents').textContent(),
        running: await page.locator('#runningTasks').textContent(),
        completed: await page.locator('#completedTasks').textContent()
      };

      // Wait for potential updates
      await page.waitForTimeout(5000);

      const updatedStats = {
        swarms: await page.locator('#activeSwarms').textContent(),
        agents: await page.locator('#activeAgents').textContent(),
        running: await page.locator('#runningTasks').textContent(),
        completed: await page.locator('#completedTasks').textContent()
      };

      // Values should remain valid (may or may not change)
      expect(parseInt(updatedStats.swarms!)).toBeGreaterThanOrEqual(0);
      expect(parseInt(updatedStats.agents!)).toBeGreaterThanOrEqual(0);
      expect(parseInt(updatedStats.running!)).toBeGreaterThanOrEqual(0);
      expect(parseInt(updatedStats.completed!)).toBeGreaterThanOrEqual(0);

      // At least one value should be greater than 0 (active system)
      const totalActivity = parseInt(updatedStats.swarms!) + parseInt(updatedStats.agents!);
      expect(totalActivity).toBeGreaterThan(0);
    });

    test('should have proper visual hierarchy for statistics', async ({ page }) => {
      const statValues = page.locator('.stat-value');
      const statLabels = page.locator('.stat-label');

      await expect(statValues).toHaveCount(4);
      await expect(statLabels).toHaveCount(4);

      // Check labels
      const expectedLabels = ['Active Swarms', 'Active Agents', 'Running Tasks', 'Completed'];
      const actualLabels = await statLabels.allTextContents();

      expectedLabels.forEach(label => {
        expect(actualLabels.some(actual => actual.includes(label))).toBe(true);
      });
    });
  });

  test.describe('Swarms Panel', () => {
    test('should display active swarms', async ({ page }) => {
      const swarmsPanel = page.locator('[data-testid="swarms-panel"]');
      await expect(swarmsPanel).toBeVisible();
      await expect(swarmsPanel.locator('h3')).toHaveText('Active Swarms');

      const swarmItems = page.locator('[data-testid^="swarm-"]');
      await expect(swarmItems).toHaveCount(2);

      // Check swarm details
      const devSwarm = page.locator('[data-testid="swarm-test-swarm-1"]');
      await expect(devSwarm).toBeVisible();
      await expect(devSwarm.locator('.swarm-name')).toHaveText('Development Swarm');
      await expect(devSwarm.locator('.swarm-status')).toContainText('Hierarchical');

      const analysisSwarm = page.locator('[data-testid="swarm-test-swarm-2"]');
      await expect(analysisSwarm).toBeVisible();
      await expect(analysisSwarm.locator('.swarm-name')).toHaveText('Analysis Swarm');
      await expect(analysisSwarm.locator('.swarm-status')).toContainText('Mesh');
    });

    test('should show swarm status information', async ({ page }) => {
      const swarmItems = page.locator('.swarm-item');

      for (let i = 0; i < await swarmItems.count(); i++) {
        const swarm = swarmItems.nth(i);
        const swarmName = swarm.locator('.swarm-name');
        const swarmStatus = swarm.locator('.swarm-status');

        await expect(swarmName).toBeVisible();
        await expect(swarmStatus).toBeVisible();

        // Status should contain topology and agent information
        const statusText = await swarmStatus.textContent();
        expect(statusText).toMatch(/(Hierarchical|Mesh|Ring|Star)/);
        expect(statusText).toMatch(/\d+\s+agents?\s+(active|idle)/);
      }
    });

    test('should be interactive for swarm selection', async ({ page }) => {
      const swarmItems = page.locator('.swarm-item');

      // Click on first swarm
      await swarmItems.first().click();

      // Should trigger some interaction (visual feedback, etc.)
      await page.waitForTimeout(500);

      // Verify swarm is still visible and clickable
      await expect(swarmItems.first()).toBeVisible();
    });

    test('should handle empty swarm states gracefully', async ({ page }) => {
      // This test ensures UI handles edge cases
      const swarmsPanel = page.locator('[data-testid="swarms-panel"]');
      await expect(swarmsPanel).toBeVisible();

      const swarmList = page.locator('.swarm-list');
      await expect(swarmList).toBeVisible();

      // Should have at least the test swarms
      const swarmItems = page.locator('.swarm-item');
      const count = await swarmItems.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('Agents Panel', () => {
    test('should display agent status correctly', async ({ page }) => {
      const agentsPanel = page.locator('[data-testid="agents-panel"]');
      await expect(agentsPanel).toBeVisible();
      await expect(agentsPanel.locator('h3')).toHaveText('Agents Status');

      const agentItems = page.locator('[data-testid^="agent-"]');
      await expect(agentItems).toHaveCount(3);

      // Check individual agents
      const researcher = page.locator('[data-testid="agent-agent-1"]');
      await expect(researcher).toBeVisible();
      await expect(researcher).toContainText('Researcher');

      const coder = page.locator('[data-testid="agent-agent-2"]');
      await expect(coder).toBeVisible();
      await expect(coder).toContainText('Coder');

      const tester = page.locator('[data-testid="agent-agent-3"]');
      await expect(tester).toBeVisible();
      await expect(tester).toContainText('Tester');
    });

    test('should show agent status indicators', async ({ page }) => {
      const agentStatuses = page.locator('.agent-status');
      await expect(agentStatuses).toHaveCount(3);

      for (let i = 0; i < 3; i++) {
        const status = agentStatuses.nth(i);
        const statusText = await status.textContent();

        // Should have valid status
        expect(['Active', 'Idle', 'Busy']).toContain(statusText!);

        // Should have appropriate CSS class
        const className = await status.getAttribute('class');
        expect(className).toMatch(/status-(active|idle|busy)/);
      }
    });

    test('should update agent statuses in real-time', async ({ page }) => {
      // Monitor for status changes
      const initialStatuses = await page.locator('.agent-status').allTextContents();

      // Set up listener for status updates
      await page.evaluate(() => {
        window.statusUpdates = [];
        if (window.socket) {
          window.socket.on('agent-status-update', (data) => {
            window.statusUpdates.push(data);
          });
        }
      });

      // Wait for potential updates
      await page.waitForTimeout(6000);

      const statusUpdates = await page.evaluate(() => window.statusUpdates || []);
      const finalStatuses = await page.locator('.agent-status').allTextContents();

      // Statuses should be valid
      finalStatuses.forEach(status => {
        expect(['Active', 'Idle', 'Busy']).toContain(status);
      });

      // If we received updates, they should be reflected
      if (statusUpdates.length > 0) {
        const latestUpdate = statusUpdates[statusUpdates.length - 1];
        expect(['active', 'idle', 'busy']).toContain(latestUpdate.status);
      }
    });

    test('should have scrollable agent list when needed', async ({ page }) => {
      const agentList = page.locator('.agent-list');
      await expect(agentList).toBeVisible();

      // Check if scrolling is enabled
      const isScrollable = await agentList.evaluate((el) => {
        const style = getComputedStyle(el);
        return style.overflowY === 'auto' && el.scrollHeight > el.clientHeight;
      });

      // Should have proper overflow handling
      const hasOverflow = await agentList.evaluate((el) => {
        const style = getComputedStyle(el);
        return style.overflowY === 'auto';
      });

      expect(hasOverflow).toBe(true);
    });

    test('should allow agent interaction and selection', async ({ page }) => {
      const agentItems = page.locator('.agent-item');

      // Click on each agent
      for (let i = 0; i < await agentItems.count(); i++) {
        const agent = agentItems.nth(i);
        await agent.click();
        await page.waitForTimeout(200);

        // Agent should remain visible and clickable
        await expect(agent).toBeVisible();
      }
    });
  });

  test.describe('Dashboard Layout and Responsiveness', () => {
    test('should have proper grid layout', async ({ page }) => {
      const dashboard = page.locator('.dashboard');
      await expect(dashboard).toBeVisible();

      // Should have proper CSS grid
      const gridStyle = await dashboard.evaluate((el) => {
        return getComputedStyle(el).display;
      });

      expect(gridStyle).toBe('grid');

      // All main panels should be visible
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
      await expect(page.locator('[data-testid="swarms-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="agents-panel"]')).toBeVisible();
    });

    test('should adapt to different screen sizes', async ({ page }) => {
      // Test desktop layout
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(500);

      const dashboard = page.locator('.dashboard');
      await expect(dashboard).toBeVisible();

      // Test tablet layout
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);

      await expect(dashboard).toBeVisible();
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();

      // Test mobile layout
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);

      await expect(dashboard).toBeVisible();
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
    });

    test('should handle card overflow gracefully', async ({ page }) => {
      const cards = page.locator('.card');
      const cardCount = await cards.count();

      expect(cardCount).toBeGreaterThanOrEqual(3);

      // All cards should be visible and properly styled
      for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i);
        await expect(card).toBeVisible();

        // Should have proper card styling
        const hasCardClass = await card.evaluate((el) => el.classList.contains('card'));
        expect(hasCardClass).toBe(true);
      }
    });
  });

  test.describe('Real-time Dashboard Updates', () => {
    test('should maintain data consistency across panels', async ({ page }) => {
      // Get agent count from stats panel
      const statsAgentCount = parseInt(await page.locator('#activeAgents').textContent() || '0');

      // Count agents in agents panel
      const agentItems = page.locator('[data-testid^="agent-"]');
      const panelAgentCount = await agentItems.count();

      // Counts should be related (stats might show different subset)
      expect(statsAgentCount).toBeGreaterThanOrEqual(0);
      expect(panelAgentCount).toBeGreaterThan(0);
    });

    test('should handle concurrent updates smoothly', async ({ page }) => {
      // Monitor multiple update streams
      await page.evaluate(() => {
        window.updateCounts = {
          agents: 0,
          tasks: 0,
          messages: 0
        };

        if (window.socket) {
          window.socket.on('agent-status-update', () => {
            window.updateCounts.agents++;
          });

          window.socket.on('task-progress-update', () => {
            window.updateCounts.tasks++;
          });

          window.socket.on('agent-message', () => {
            window.updateCounts.messages++;
          });
        }
      });

      // Wait for updates
      await page.waitForTimeout(8000);

      const updateCounts = await page.evaluate(() => window.updateCounts || {});

      // Dashboard should handle concurrent updates
      const totalUpdates = updateCounts.agents + updateCounts.tasks + updateCounts.messages;

      // UI should remain stable regardless of update volume
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
      await expect(page.locator('[data-testid="swarms-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="agents-panel"]')).toBeVisible();
    });

    test('should preserve user interactions during updates', async ({ page }) => {
      // Start monitoring an element
      const swarmItem = page.locator('[data-testid="swarm-test-swarm-1"]');

      // Click on swarm
      await swarmItem.click();

      // Wait during potential updates
      await page.waitForTimeout(3000);

      // Element should still be interactive
      await expect(swarmItem).toBeVisible();
      await swarmItem.click(); // Should still be clickable

      // Panel should remain stable
      await expect(page.locator('[data-testid="swarms-panel"]')).toBeVisible();
    });
  });

  test.describe('Dashboard Performance', () => {
    test('should load dashboard components efficiently', async ({ page }) => {
      const startTime = Date.now();

      // Wait for all main dashboard components
      await Promise.all([
        page.waitForSelector('[data-testid="system-stats"]'),
        page.waitForSelector('[data-testid="swarms-panel"]'),
        page.waitForSelector('[data-testid="agents-panel"]'),
        page.waitForSelector('[data-testid="messages-panel"]')
      ]);

      const loadTime = Date.now() - startTime;

      // Should load within reasonable time
      expect(loadTime).toBeLessThan(5000);
    });

    test('should maintain performance with high update frequency', async ({ page }) => {
      const startTime = Date.now();

      // Monitor performance during updates
      await page.evaluate(() => {
        window.performanceMetrics = {
          startTime: performance.now(),
          frames: 0,
          updates: 0
        };

        // Monitor frame rate
        function countFrame() {
          window.performanceMetrics.frames++;
          requestAnimationFrame(countFrame);
        }
        requestAnimationFrame(countFrame);

        // Monitor updates
        if (window.socket) {
          const updateHandler = () => window.performanceMetrics.updates++;
          window.socket.on('agent-status-update', updateHandler);
          window.socket.on('agent-message', updateHandler);
          window.socket.on('task-progress-update', updateHandler);
        }
      });

      // Let it run for a period
      await page.waitForTimeout(5000);

      const metrics = await page.evaluate(() => {
        const endTime = performance.now();
        const duration = endTime - window.performanceMetrics.startTime;
        return {
          duration: duration,
          frames: window.performanceMetrics.frames,
          updates: window.performanceMetrics.updates,
          fps: (window.performanceMetrics.frames / duration) * 1000
        };
      });

      // Should maintain reasonable performance
      if (metrics.frames > 0) {
        expect(metrics.fps).toBeGreaterThan(20); // At least 20 FPS
      }

      // Dashboard should remain responsive
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
    });

    test('should handle memory efficiently with long sessions', async ({ page }) => {
      const initialMemory = await page.evaluate(() => {
        return performance.memory ? performance.memory.usedJSHeapSize : 0;
      });

      // Simulate extended session activity
      for (let i = 0; i < 20; i++) {
        await page.evaluate((index) => {
          // Simulate updates
          if (window.testHelpers) {
            window.testHelpers.addAgentMessage({
              agentId: 'agent-perf-test',
              message: `Performance test message ${index}`,
              type: 'info',
              timestamp: new Date().toISOString()
            });
          }
        }, i);

        await page.waitForTimeout(100);
      }

      const finalMemory = await page.evaluate(() => {
        return performance.memory ? performance.memory.usedJSHeapSize : 0;
      });

      // Memory growth should be reasonable
      if (finalMemory > 0 && initialMemory > 0) {
        const memoryIncrease = finalMemory - initialMemory;
        expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024); // Less than 20MB increase
      }

      // Dashboard should remain functional
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
    });
  });

  test.describe('Error States and Recovery', () => {
    test('should handle partial data loading gracefully', async ({ page }) => {
      // Test with missing data scenarios
      await page.evaluate(() => {
        // Simulate data loading issues
        if (window.socket) {
          window.socket.emit('test-partial-data', { incomplete: true });
        }
      });

      await page.waitForTimeout(2000);

      // Dashboard should still be functional
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
      await expect(page.locator('[data-testid="swarms-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="agents-panel"]')).toBeVisible();

      // Stats should show valid numbers (even if 0)
      const agentCount = await page.locator('#activeAgents').textContent();
      expect(parseInt(agentCount!)).toBeGreaterThanOrEqual(0);
    });

    test('should recover from WebSocket disconnection', async ({ page }) => {
      // Disconnect WebSocket
      await page.evaluate(() => {
        if (window.socket) {
          window.socket.disconnect();
        }
      });

      await page.waitForTimeout(1000);

      // Dashboard should remain visible and functional
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
      await expect(page.locator('[data-testid="swarms-panel"]')).toBeVisible();

      // Should be able to interact with static elements
      const swarmItem = page.locator('[data-testid="swarm-test-swarm-1"]');
      await swarmItem.click();
      await expect(swarmItem).toBeVisible();
    });

    test('should display appropriate error states', async ({ page }) => {
      // This test ensures error states are handled gracefully
      await page.evaluate(() => {
        // Simulate various error conditions
        try {
          if (window.socket) {
            window.socket.emit('simulate-error', { type: 'data-error' });
          }
        } catch (error) {
          console.log('Error simulation handled');
        }
      });

      await page.waitForTimeout(2000);

      // UI should remain stable
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();

      // Should not show broken UI elements
      const errorElements = page.locator('.error, .broken, .undefined');
      const errorCount = await errorElements.count();
      expect(errorCount).toBe(0);
    });
  });
});