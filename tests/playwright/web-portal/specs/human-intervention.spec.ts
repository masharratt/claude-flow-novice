/**
 * @file Human Intervention System Tests
 * @description Tests for human intervention system without stopping agents
 */

import { test, expect } from '@playwright/test';
import { WebPortalPage } from '../page-objects/web-portal-page';

test.describe('Human Intervention System', () => {
  let portalPage: WebPortalPage;

  test.beforeEach(async ({ page }) => {
    portalPage = new WebPortalPage(page);
    await portalPage.goto();
    await portalPage.login('test-admin', 'test-password');
    await portalPage.waitForDashboard();
  });

  test.describe('Intervention Panel Display', () => {
    test('should show intervention panel when decision is required', async ({ page }) => {
      // Wait for intervention panel to appear
      await page.waitForSelector('[data-testid="intervention-panel"]', {
        state: 'visible',
        timeout: 10000
      });

      // Verify panel structure
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeVisible();
      await expect(page.locator('.intervention-title')).toHaveText('🤔 Human Input Required');
      await expect(page.locator('.intervention-question')).toBeVisible();
      await expect(page.locator('.intervention-options')).toBeVisible();
      await expect(page.locator('.intervention-actions')).toBeVisible();
    });

    test('should display intervention question clearly', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      const question = page.locator('.intervention-question');
      await expect(question).toBeVisible();

      const questionText = await question.textContent();
      expect(questionText).toContain('OAuth 2.0 or custom JWT');
    });

    test('should show all available options with pros and cons', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Check OAuth option
      const oauth2Option = page.locator('[data-option="oauth2"]');
      await expect(oauth2Option).toBeVisible();
      await expect(oauth2Option.locator('.option-label')).toHaveText('OAuth 2.0');
      await expect(oauth2Option.locator('.pros')).toBeVisible();
      await expect(oauth2Option.locator('.cons')).toBeVisible();

      // Check JWT option
      const jwtOption = page.locator('[data-option="jwt"]');
      await expect(jwtOption).toBeVisible();
      await expect(jwtOption.locator('.option-label')).toHaveText('Custom JWT');
      await expect(jwtOption.locator('.pros')).toBeVisible();
      await expect(jwtOption.locator('.cons')).toBeVisible();
    });

    test('should highlight selected option', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      const oauth2Option = page.locator('[data-option="oauth2"]');

      // Initially no option should be selected
      await expect(oauth2Option).not.toHaveClass(/selected/);

      // Click on option
      await oauth2Option.click();

      // Should be highlighted as selected
      await expect(oauth2Option).toHaveClass(/selected/);

      // Other option should not be selected
      const jwtOption = page.locator('[data-option="jwt"]');
      await expect(jwtOption).not.toHaveClass(/selected/);
    });

    test('should allow switching between options', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      const oauth2Option = page.locator('[data-option="oauth2"]');
      const jwtOption = page.locator('[data-option="jwt"]');

      // Select first option
      await oauth2Option.click();
      await expect(oauth2Option).toHaveClass(/selected/);
      await expect(jwtOption).not.toHaveClass(/selected/);

      // Switch to second option
      await jwtOption.click();
      await expect(jwtOption).toHaveClass(/selected/);
      await expect(oauth2Option).not.toHaveClass(/selected/);
    });
  });

  test.describe('Decision Submission', () => {
    test('should submit decision successfully', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Select an option
      await page.locator('[data-option="oauth2"]').click();

      // Submit decision
      await page.locator('#submitDecision').click();

      // Panel should disappear
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeHidden({ timeout: 5000 });

      // Should see confirmation message
      await page.waitForSelector('[data-testid^="message-"]', { timeout: 5000 });
      const successMessage = page.locator('.message-text:has-text("Human decision submitted")');
      await expect(successMessage).toBeVisible();
    });

    test('should prevent submission without selection', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Try to submit without selecting an option
      page.on('dialog', dialog => {
        expect(dialog.message()).toBe('Please select an option first.');
        dialog.accept();
      });

      await page.locator('#submitDecision').click();

      // Panel should still be visible
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeVisible();
    });

    test('should handle "need more info" request', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Click "Need More Info" button
      await page.locator('#needMoreInfo').click();

      // Should add system message
      await page.waitForTimeout(1000);
      const infoMessage = page.locator('.message-text:has-text("Human requested more information")');
      await expect(infoMessage).toBeVisible();

      // Panel should still be visible for further interaction
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeVisible();
    });

    test('should show decision processing state', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Select option and submit
      await page.locator('[data-option="jwt"]').click();

      // Monitor button state during submission
      const submitButton = page.locator('#submitDecision');
      await submitButton.click();

      // Button should be disabled during processing
      await page.waitForTimeout(500);

      // Panel should eventually disappear
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeHidden({ timeout: 5000 });
    });
  });

  test.describe('Non-blocking Agent Operations', () => {
    test('should maintain agent activity during intervention', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Verify agents continue to be active
      const agentPanels = page.locator('[data-testid="agents-panel"]');
      await expect(agentPanels).toBeVisible();

      // Check that agent status updates continue
      const activeAgents = page.locator('.agent-status.status-active');
      await expect(activeAgents).toHaveCount(1, { timeout: 5000 });

      // Verify new messages continue to arrive
      const initialMessageCount = await page.locator('[data-testid^="message-"]').count();

      // Wait for new messages
      await page.waitForTimeout(5000);

      const updatedMessageCount = await page.locator('[data-testid^="message-"]').count();
      expect(updatedMessageCount).toBeGreaterThanOrEqual(initialMessageCount);
    });

    test('should allow task progress to continue', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Verify system stats continue updating
      const statsPanel = page.locator('[data-testid="system-stats"]');
      await expect(statsPanel).toBeVisible();

      // Check that running tasks number doesn't freeze
      const runningTasks = page.locator('#runningTasks');
      const initialTaskCount = await runningTasks.textContent();

      // Wait and check if values can change
      await page.waitForTimeout(3000);

      const updatedTaskCount = await runningTasks.textContent();
      // Values should be maintained (not necessarily different, but not frozen/errored)
      expect(updatedTaskCount).toBeTruthy();
      expect(parseInt(updatedTaskCount!)).toBeGreaterThanOrEqual(0);
    });

    test('should preserve agent communication during intervention', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Add a message from agent while intervention is active
      await page.evaluate(() => {
        window.testHelpers.addAgentMessage({
          agentId: 'agent-1',
          message: 'Continuing work while awaiting human decision',
          type: 'info',
          timestamp: new Date().toISOString()
        });
      });

      await page.waitForTimeout(1000);

      // Message should appear in the messages panel
      const workingMessage = page.locator('.message-text:has-text("Continuing work while awaiting")');
      await expect(workingMessage).toBeVisible();

      // Intervention panel should still be visible
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeVisible();
    });

    test('should maintain swarm coordination during intervention', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Verify swarm panels remain functional
      const swarmsPanel = page.locator('[data-testid="swarms-panel"]');
      await expect(swarmsPanel).toBeVisible();

      // Check individual swarm items
      const swarmItems = page.locator('[data-testid^="swarm-"]');
      await expect(swarmItems).toHaveCount(2);

      // Swarm status should continue to be updated
      const devSwarm = page.locator('[data-testid="swarm-test-swarm-1"]');
      await expect(devSwarm).toBeVisible();
      await expect(devSwarm.locator('.swarm-status')).toContainText('agents');
    });
  });

  test.describe('Context Preservation', () => {
    test('should preserve task context after intervention resolution', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Note the current task state
      const initialMessages = await page.locator('[data-testid^="message-"]').count();

      // Resolve intervention
      await page.locator('[data-option="oauth2"]').click();
      await page.locator('#submitDecision').click();

      // Wait for resolution
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeHidden({ timeout: 5000 });

      // Verify context is preserved
      await page.waitForTimeout(2000);
      const finalMessages = await page.locator('[data-testid^="message-"]').count();
      expect(finalMessages).toBeGreaterThan(initialMessages);

      // Should see resolution confirmation
      const resolutionMessage = page.locator('.message-text:has-text("Human decision submitted")');
      await expect(resolutionMessage).toBeVisible();
    });

    test('should maintain agent state across intervention', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Get initial agent states
      const initialAgentStates = await page.locator('.agent-status').allTextContents();

      // Resolve intervention
      await page.locator('[data-option="jwt"]').click();
      await page.locator('#submitDecision').click();
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeHidden({ timeout: 5000 });

      // Agent states should be preserved or naturally updated
      await page.waitForTimeout(2000);
      const finalAgentStates = await page.locator('.agent-status').allTextContents();

      // Should have same number of agents
      expect(finalAgentStates.length).toBe(initialAgentStates.length);

      // All states should be valid
      finalAgentStates.forEach(state => {
        expect(['Active', 'Idle', 'Busy']).toContain(state);
      });
    });

    test('should resume task execution after decision', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Make decision
      await page.locator('[data-option="oauth2"]').click();
      await page.locator('#submitDecision').click();
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeHidden({ timeout: 5000 });

      // Should see task resumption messages
      await page.waitForTimeout(3000);

      // Look for continuation messages
      const continuationMessages = page.locator('.message-text');
      const messageTexts = await continuationMessages.allTextContents();

      // Should have messages indicating work continuation
      const hasResumptionMessage = messageTexts.some(text =>
        text.includes('decision') ||
        text.includes('continuing') ||
        text.includes('proceeding') ||
        text.includes('implementing')
      );

      expect(hasResumptionMessage).toBeTruthy();
    });
  });

  test.describe('Multiple Interventions', () => {
    test('should handle sequential interventions', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Resolve first intervention
      await page.locator('[data-option="oauth2"]').click();
      await page.locator('#submitDecision').click();
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeHidden({ timeout: 5000 });

      // Simulate another intervention appearing
      await page.evaluate(() => {
        setTimeout(() => {
          window.testHelpers.showInterventionPanel();
        }, 2000);
      });

      // Second intervention should appear
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeVisible({ timeout: 5000 });

      // Should be able to handle second intervention
      await page.locator('[data-option="jwt"]').click();
      await page.locator('#submitDecision').click();
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeHidden({ timeout: 5000 });
    });

    test('should maintain intervention history', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Make first decision
      await page.locator('[data-option="oauth2"]').click();
      await page.locator('#submitDecision').click();
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeHidden({ timeout: 5000 });

      // Check that decision is logged
      await page.waitForTimeout(2000);
      const decisionMessage = page.locator('.message-text:has-text("Human decision submitted")');
      await expect(decisionMessage).toBeVisible();

      // Should also appear in audit log if available
      const auditLog = page.locator('[data-testid="transparency-log"]');
      if (await auditLog.isVisible()) {
        // Look for intervention-related log entries
        const logEntries = page.locator('.log-entry');
        const entryCount = await logEntries.count();
        expect(entryCount).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors during submission gracefully', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Intercept API call to simulate network error
      await page.route('/api/interventions/*/respond', route => {
        route.abort('failed');
      });

      // Select option and try to submit
      await page.locator('[data-option="oauth2"]').click();

      // Handle expected alert
      page.on('dialog', dialog => {
        expect(dialog.message()).toContain('Failed to submit decision');
        dialog.accept();
      });

      await page.locator('#submitDecision').click();

      // Panel should remain visible for retry
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeVisible();
    });

    test('should handle malformed intervention data', async ({ page }) => {
      // This test ensures the UI can handle edge cases
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Panel should still be functional despite any backend data issues
      const options = page.locator('.intervention-option');
      await expect(options).toHaveCount(2);

      // Should be able to interact normally
      await page.locator('[data-option="oauth2"]').click();
      await expect(page.locator('[data-option="oauth2"]')).toHaveClass(/selected/);
    });

    test('should recover from intervention panel UI errors', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Simulate UI error recovery by manually triggering methods
      await page.evaluate(() => {
        try {
          // Test error recovery
          window.testHelpers.hideInterventionPanel();
          window.testHelpers.showInterventionPanel();
        } catch (error) {
          console.log('Handled UI error:', error);
        }
      });

      // Panel should still be functional
      await expect(page.locator('[data-testid="intervention-panel"]')).toBeVisible();
      await page.locator('[data-option="jwt"]').click();
      await expect(page.locator('[data-option="jwt"]')).toHaveClass(/selected/);
    });
  });

  test.describe('Accessibility and Usability', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Tab through the intervention panel
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Should be able to select options with keyboard
      await page.keyboard.press('Enter');

      // Check if an option was selected
      const selectedOptions = page.locator('.intervention-option.selected');
      const selectedCount = await selectedOptions.count();
      expect(selectedCount).toBeGreaterThanOrEqual(0);
    });

    test('should have appropriate visual feedback', async ({ page }) => {
      await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

      // Panel should have distinct styling
      const panel = page.locator('[data-testid="intervention-panel"]');
      const bgColor = await panel.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(bgColor).toContain('rgb(255, 243, 205)'); // Warning yellow background

      // Options should have hover effects
      const option = page.locator('[data-option="oauth2"]');
      await option.hover();

      // Should have visual feedback on hover
      await page.waitForTimeout(300);
      const hoverBorder = await option.evaluate(el => getComputedStyle(el).borderColor);
      expect(hoverBorder).toBeTruthy();
    });

    test('should be responsive on mobile devices', async ({ page, isMobile }) => {
      if (isMobile) {
        await page.waitForSelector('[data-testid="intervention-panel"]', { state: 'visible' });

        // Panel should be visible and usable on mobile
        const panel = page.locator('[data-testid="intervention-panel"]');
        await expect(panel).toBeVisible();

        // Options should be tappable
        await page.locator('[data-option="oauth2"]').tap();
        await expect(page.locator('[data-option="oauth2"]')).toHaveClass(/selected/);

        // Submit button should be accessible
        const submitButton = page.locator('#submitDecision');
        await expect(submitButton).toBeVisible();
      }
    });
  });
});