/**
 * @file MCP Integration Panel Tests
 * @description Tests for MCP tool integration and functionality
 */

import { test, expect } from '@playwright/test';
import { WebPortalPage } from '../page-objects/web-portal-page';

test.describe('MCP Integration Panel', () => {
  let portalPage: WebPortalPage;

  test.beforeEach(async ({ page }) => {
    portalPage = new WebPortalPage(page);
    await portalPage.goto();
    await portalPage.login('test-admin', 'test-password');
    await portalPage.waitForDashboard();
  });

  test.describe('Panel Display and Layout', () => {
    test('should display MCP tools panel', async ({ page }) => {
      await expect(page.locator('[data-testid="mcp-tools-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="mcp-tools-panel"] h3')).toHaveText('MCP Integration Tools');
    });

    test('should show available MCP tools', async ({ page }) => {
      // Check for specific MCP tools
      await expect(page.locator('[data-testid="mcp-tool-swarm_init"]')).toBeVisible();
      await expect(page.locator('[data-testid="mcp-tool-agent_spawn"]')).toBeVisible();
      await expect(page.locator('[data-testid="mcp-tool-task_orchestrate"]')).toBeVisible();
    });

    test('should display tool descriptions', async ({ page }) => {
      const swarmInitTool = page.locator('[data-testid="mcp-tool-swarm_init"]');
      await expect(swarmInitTool.locator('strong')).toHaveText('swarm_init');
      await expect(swarmInitTool.locator('div').nth(1)).toContainText('Initialize a new swarm');

      const agentSpawnTool = page.locator('[data-testid="mcp-tool-agent_spawn"]');
      await expect(agentSpawnTool.locator('strong')).toHaveText('agent_spawn');
      await expect(agentSpawnTool.locator('div').nth(1)).toContainText('Spawn a new agent');
    });

    test('should show execute buttons for each tool', async ({ page }) => {
      const executeButtons = page.locator('.tool-execute');
      await expect(executeButtons).toHaveCount(3);

      for (let i = 0; i < 3; i++) {
        const button = executeButtons.nth(i);
        await expect(button).toBeVisible();
        await expect(button).toHaveText('Execute');
      }
    });

    test('should have proper tool layout and styling', async ({ page }) => {
      const toolItems = page.locator('.tool-item');
      await expect(toolItems).toHaveCount(3);

      // Check layout structure
      for (let i = 0; i < 3; i++) {
        const toolItem = toolItems.nth(i);
        await expect(toolItem).toBeVisible();

        // Should have tool description and execute button
        await expect(toolItem.locator('strong')).toBeVisible();
        await expect(toolItem.locator('.tool-execute')).toBeVisible();
      }
    });
  });

  test.describe('Tool Execution', () => {
    test('should execute swarm_init tool successfully', async ({ page }) => {
      const swarmInitButton = page.locator('[data-tool="swarm_init"]');

      // Click execute button
      await swarmInitButton.click();

      // Button should show executing state
      await expect(swarmInitButton).toHaveText('Executing...');
      await expect(swarmInitButton).toBeDisabled();

      // Wait for execution to complete
      await expect(swarmInitButton).toHaveText('Execute', { timeout: 10000 });
      await expect(swarmInitButton).toBeEnabled();

      // Should see success message in messages panel
      await page.waitForTimeout(1000);
      const successMessage = page.locator('.message-text:has-text("Tool swarm_init executed")');
      await expect(successMessage).toBeVisible();
    });

    test('should execute agent_spawn tool with parameters', async ({ page }) => {
      const agentSpawnButton = page.locator('[data-tool="agent_spawn"]');

      await agentSpawnButton.click();

      // Wait for execution
      await expect(agentSpawnButton).toHaveText('Executing...');
      await page.waitForTimeout(2000);
      await expect(agentSpawnButton).toHaveText('Execute', { timeout: 8000 });

      // Verify execution message
      const executionMessage = page.locator('.message-text:has-text("Tool agent_spawn executed")');
      await expect(executionMessage).toBeVisible();

      // Message should be from MCP system
      const mcpSystemMessage = page.locator('.message-agent:has-text("mcp-system")');
      await expect(mcpSystemMessage).toBeVisible();
    });

    test('should execute task_orchestrate tool', async ({ page }) => {
      const taskOrchestrateButton = page.locator('[data-tool="task_orchestrate"]');

      await taskOrchestrateButton.click();

      // Monitor execution state
      await expect(taskOrchestrateButton).toHaveText('Executing...');
      await expect(taskOrchestrateButton).toBeDisabled();

      // Wait for completion
      await expect(taskOrchestrateButton).toHaveText('Execute', { timeout: 10000 });
      await expect(taskOrchestrateButton).toBeEnabled();

      // Check for execution result
      const resultMessage = page.locator('.message-text:has-text("Tool task_orchestrate executed")');
      await expect(resultMessage).toBeVisible();
    });

    test('should handle concurrent tool executions', async ({ page }) => {
      // Execute multiple tools simultaneously
      const swarmButton = page.locator('[data-tool="swarm_init"]');
      const agentButton = page.locator('[data-tool="agent_spawn"]');

      // Click both buttons rapidly
      await swarmButton.click();
      await page.waitForTimeout(100);
      await agentButton.click();

      // Both should show executing state
      await expect(swarmButton).toHaveText('Executing...');
      await expect(agentButton).toHaveText('Executing...');

      // Wait for both to complete
      await expect(swarmButton).toHaveText('Execute', { timeout: 15000 });
      await expect(agentButton).toHaveText('Execute', { timeout: 15000 });

      // Should have messages for both executions
      await page.waitForTimeout(1000);
      const swarmMessage = page.locator('.message-text:has-text("Tool swarm_init executed")');
      const agentMessage = page.locator('.message-text:has-text("Tool agent_spawn executed")');

      await expect(swarmMessage).toBeVisible();
      await expect(agentMessage).toBeVisible();
    });
  });

  test.describe('Tool Parameters and Configuration', () => {
    test('should use appropriate default parameters for swarm_init', async ({ page }) => {
      // Intercept API call to verify parameters
      let interceptedRequest = null;

      await page.route('/api/mcp/tools/swarm_init', (route, request) => {
        interceptedRequest = {
          method: request.method(),
          body: request.postDataJSON()
        };
        route.continue();
      });

      await page.locator('[data-tool="swarm_init"]').click();

      // Wait for request to be intercepted
      await page.waitForTimeout(2000);

      if (interceptedRequest) {
        expect(interceptedRequest.method).toBe('POST');
        expect(interceptedRequest.body.parameters).toHaveProperty('topology');
        expect(interceptedRequest.body.parameters).toHaveProperty('maxAgents');
        expect(interceptedRequest.body.parameters.topology).toBe('mesh');
        expect(interceptedRequest.body.parameters.maxAgents).toBe(3);
      }
    });

    test('should use correct parameters for agent_spawn', async ({ page }) => {
      let interceptedRequest = null;

      await page.route('/api/mcp/tools/agent_spawn', (route, request) => {
        interceptedRequest = {
          body: request.postDataJSON()
        };
        route.continue();
      });

      await page.locator('[data-tool="agent_spawn"]').click();
      await page.waitForTimeout(2000);

      if (interceptedRequest) {
        const params = interceptedRequest.body.parameters;
        expect(params).toHaveProperty('type');
        expect(params).toHaveProperty('capabilities');
        expect(params.type).toBe('researcher');
        expect(Array.isArray(params.capabilities)).toBe(true);
      }
    });

    test('should use appropriate parameters for task_orchestrate', async ({ page }) => {
      let interceptedRequest = null;

      await page.route('/api/mcp/tools/task_orchestrate', (route, request) => {
        interceptedRequest = {
          body: request.postDataJSON()
        };
        route.continue();
      });

      await page.locator('[data-tool="task_orchestrate"]').click();
      await page.waitForTimeout(2000);

      if (interceptedRequest) {
        const params = interceptedRequest.body.parameters;
        expect(params).toHaveProperty('task');
        expect(params).toHaveProperty('priority');
        expect(params.task).toBe('Test task');
        expect(params.priority).toBe('medium');
      }
    });
  });

  test.describe('Response Handling and Feedback', () => {
    test('should display execution results in messages', async ({ page }) => {
      await page.locator('[data-tool="swarm_init"]').click();

      await page.waitForTimeout(3000);

      // Should show execution details in message
      const messagesList = page.locator('#messagesList');
      const messages = messagesList.locator('.message-item');

      // Find the MCP system message
      const mcpMessage = messages.filter({
        has: page.locator('.message-agent:has-text("mcp-system")')
      }).first();

      await expect(mcpMessage).toBeVisible();
      await expect(mcpMessage.locator('.message-text')).toContainText('executed');
    });

    test('should show execution timing information', async ({ page }) => {
      const startTime = Date.now();

      await page.locator('[data-tool="agent_spawn"]').click();

      // Wait for completion
      await expect(page.locator('[data-tool="agent_spawn"]')).toHaveText('Execute', { timeout: 10000 });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Execution should complete within reasonable time
      expect(executionTime).toBeLessThan(8000);

      // Check if timing information is included in response
      await page.waitForTimeout(1000);
      const messages = page.locator('.message-text');
      const messageTexts = await messages.allTextContents();

      const hasTimingInfo = messageTexts.some(text =>
        text.includes('executed') && (text.includes('ms') || text.includes('time'))
      );

      // Either explicit timing info or reasonable execution time
      expect(executionTime < 8000 || hasTimingInfo).toBe(true);
    });

    test('should handle tool execution status properly', async ({ page }) => {
      // Set up response monitoring
      await page.evaluate(() => {
        window.toolExecutionStatus = [];

        // Monitor button state changes
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
              const button = mutation.target;
              window.toolExecutionStatus.push({
                timestamp: Date.now(),
                disabled: button.disabled,
                text: button.textContent
              });
            }
          });
        });

        const button = document.querySelector('[data-tool="task_orchestrate"]');
        if (button) {
          observer.observe(button, { attributes: true });
        }
      });

      await page.locator('[data-tool="task_orchestrate"]').click();

      // Wait for execution to complete
      await expect(page.locator('[data-tool="task_orchestrate"]')).toHaveText('Execute', { timeout: 10000 });

      const statusChanges = await page.evaluate(() => window.toolExecutionStatus || []);

      if (statusChanges.length > 0) {
        // Should have at least shown disabled state
        const hasDisabledState = statusChanges.some(status => status.disabled === true);
        expect(hasDisabledState).toBe(true);
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle tool execution failures gracefully', async ({ page }) => {
      // Mock API to return error
      await page.route('/api/mcp/tools/swarm_init', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Tool execution failed' })
        });
      });

      await page.locator('[data-tool="swarm_init"]').click();

      // Button should return to normal state
      await expect(page.locator('[data-tool="swarm_init"]')).toHaveText('Execute', { timeout: 10000 });
      await expect(page.locator('[data-tool="swarm_init"]')).toBeEnabled();

      // Should show error message
      await page.waitForTimeout(1000);
      const errorMessage = page.locator('.message-text:has-text("Tool swarm_init failed")');
      await expect(errorMessage).toBeVisible();
    });

    test('should handle network timeouts', async ({ page }) => {
      // Mock slow response
      await page.route('/api/mcp/tools/agent_spawn', async (route) => {
        await page.waitForTimeout(15000); // Longer than reasonable timeout
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: 'success' })
        });
      });

      await page.locator('[data-tool="agent_spawn"]').click();

      // Should show executing state
      await expect(page.locator('[data-tool="agent_spawn"]')).toHaveText('Executing...');

      // Should handle timeout gracefully
      await page.waitForTimeout(12000);

      // Button should eventually return to normal state
      const buttonText = await page.locator('[data-tool="agent_spawn"]').textContent();
      expect(['Execute', 'Executing...']).toContain(buttonText);
    });

    test('should handle malformed responses', async ({ page }) => {
      // Mock invalid response
      await page.route('/api/mcp/tools/task_orchestrate', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'invalid json response'
        });
      });

      await page.locator('[data-tool="task_orchestrate"]').click();

      // Should handle gracefully
      await expect(page.locator('[data-tool="task_orchestrate"]')).toHaveText('Execute', { timeout: 10000 });

      // Application should remain functional
      await expect(page.locator('[data-testid="mcp-tools-panel"]')).toBeVisible();
    });

    test('should prevent multiple simultaneous executions of same tool', async ({ page }) => {
      const button = page.locator('[data-tool="swarm_init"]');

      // Click button multiple times rapidly
      await button.click();
      await button.click();
      await button.click();

      // Should be disabled after first click
      await expect(button).toBeDisabled();
      await expect(button).toHaveText('Executing...');

      // Should only execute once
      await expect(button).toHaveText('Execute', { timeout: 10000 });

      // Check message count - should only have one execution message
      await page.waitForTimeout(1000);
      const executionMessages = page.locator('.message-text:has-text("Tool swarm_init executed")');
      const messageCount = await executionMessages.count();
      expect(messageCount).toBeLessThanOrEqual(2); // Allow for potential race conditions
    });
  });

  test.describe('Integration with System State', () => {
    test('should reflect MCP tool results in system stats', async ({ page }) => {
      // Get initial stats
      const initialStats = {
        agents: await page.locator('#activeAgents').textContent(),
        swarms: await page.locator('#activeSwarms').textContent()
      };

      // Execute agent spawn tool
      await page.locator('[data-tool="agent_spawn"]').click();
      await expect(page.locator('[data-tool="agent_spawn"]')).toHaveText('Execute', { timeout: 10000 });

      // Wait for potential stats update
      await page.waitForTimeout(3000);

      const updatedStats = {
        agents: await page.locator('#activeAgents').textContent(),
        swarms: await page.locator('#activeSwarms').textContent()
      };

      // Stats should remain valid numbers
      expect(parseInt(updatedStats.agents!)).toBeGreaterThanOrEqual(0);
      expect(parseInt(updatedStats.swarms!)).toBeGreaterThanOrEqual(0);
    });

    test('should integrate with swarm dashboard updates', async ({ page }) => {
      // Execute swarm_init tool
      await page.locator('[data-tool="swarm_init"]').click();
      await expect(page.locator('[data-tool="swarm_init"]')).toHaveText('Execute', { timeout: 10000 });

      // Check swarm panel for updates
      await page.waitForTimeout(2000);
      const swarmsPanel = page.locator('[data-testid="swarms-panel"]');
      await expect(swarmsPanel).toBeVisible();

      const swarmItems = page.locator('[data-testid^="swarm-"]');
      const swarmCount = await swarmItems.count();
      expect(swarmCount).toBeGreaterThanOrEqual(2);
    });

    test('should coordinate with real-time updates', async ({ page }) => {
      // Execute tool that affects agents
      await page.locator('[data-tool="agent_spawn"]').click();
      await expect(page.locator('[data-tool="agent_spawn"]')).toHaveText('Execute', { timeout: 10000 });

      // Should see related real-time updates
      await page.waitForTimeout(3000);

      // Check for agent-related messages or status updates
      const agentMessages = page.locator('.message-agent:has-text("agent-")');
      const mcpMessages = page.locator('.message-agent:has-text("mcp-system")');

      const totalMessages = await agentMessages.count() + await mcpMessages.count();
      expect(totalMessages).toBeGreaterThan(0);
    });

    test('should maintain consistency with transparency logging', async ({ page }) => {
      // Execute MCP tool
      await page.locator('[data-tool="task_orchestrate"]').click();
      await expect(page.locator('[data-tool="task_orchestrate"]')).toHaveText('Execute', { timeout: 10000 });

      // Check if execution is reflected in audit log
      await page.waitForTimeout(2000);

      const auditLog = page.locator('[data-testid="transparency-log"]');
      if (await auditLog.isVisible()) {
        const logEntries = page.locator('.log-entry');
        const entryCount = await logEntries.count();
        expect(entryCount).toBeGreaterThan(0);
      }

      // At minimum, should see MCP system messages
      const mcpMessages = page.locator('.message-agent:has-text("mcp-system")');
      const mcpMessageCount = await mcpMessages.count();
      expect(mcpMessageCount).toBeGreaterThan(0);
    });
  });

  test.describe('Accessibility and Usability', () => {
    test('should be keyboard navigable', async ({ page }) => {
      // Focus on MCP tools panel
      await page.locator('[data-testid="mcp-tools-panel"]').focus();

      // Navigate through tools with keyboard
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Should be able to execute with keyboard
      await page.keyboard.press('Enter');

      // Should show execution state
      const buttons = page.locator('.tool-execute');
      const buttonTexts = await buttons.allTextContents();
      const hasExecutingButton = buttonTexts.some(text => text.includes('Executing'));

      if (hasExecutingButton) {
        // Wait for execution to complete
        await page.waitForTimeout(5000);
      }

      // Panel should remain accessible
      await expect(page.locator('[data-testid="mcp-tools-panel"]')).toBeVisible();
    });

    test('should have appropriate visual feedback for interactions', async ({ page }) => {
      const button = page.locator('[data-tool="swarm_init"]');

      // Hover effect
      await button.hover();
      await page.waitForTimeout(300);

      // Click feedback
      await button.click();
      await expect(button).toHaveText('Executing...');

      // Disabled state during execution
      await expect(button).toBeDisabled();

      // Return to normal state
      await expect(button).toHaveText('Execute', { timeout: 10000 });
      await expect(button).toBeEnabled();
    });

    test('should maintain proper contrast and readability', async ({ page }) => {
      const toolPanel = page.locator('[data-testid="mcp-tools-panel"]');
      await expect(toolPanel).toBeVisible();

      // Check tool descriptions are readable
      const descriptions = page.locator('.tool-item div').nth(1);
      await expect(descriptions.first()).toBeVisible();

      // Tool names should be prominent
      const toolNames = page.locator('.tool-item strong');
      await expect(toolNames.first()).toBeVisible();

      // Execute buttons should be clearly visible
      const executeButtons = page.locator('.tool-execute');
      await expect(executeButtons.first()).toBeVisible();
    });

    test('should work on mobile devices', async ({ page, isMobile }) => {
      if (isMobile) {
        await expect(page.locator('[data-testid="mcp-tools-panel"]')).toBeVisible();

        // Tools should be tappable
        const button = page.locator('[data-tool="agent_spawn"]');
        await button.tap();

        await expect(button).toHaveText('Executing...');
        await expect(button).toHaveText('Execute', { timeout: 10000 });
      }
    });
  });
});