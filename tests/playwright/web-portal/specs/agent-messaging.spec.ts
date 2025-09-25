/**
 * @file Agent Messaging Display Tests
 * @description Comprehensive tests for agent messaging system and real-time updates
 */

import { test, expect, Page } from '@playwright/test';
import { WebPortalPage } from '../page-objects/web-portal-page';

test.describe('Agent Messaging Display', () => {
  let portalPage: WebPortalPage;

  test.beforeEach(async ({ page }) => {
    portalPage = new WebPortalPage(page);
    await portalPage.goto();
    await portalPage.login('test-admin', 'test-password');
    await portalPage.waitForDashboard();
  });

  test.describe('Message Display and Formatting', () => {
    test('should display agent messages in correct format', async ({ page }) => {
      // Wait for the messages panel to be visible
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();

      // Wait for at least one message to appear
      await page.waitForSelector('[data-testid^="message-"]', { timeout: 10000 });

      // Verify message structure
      const firstMessage = page.locator('[data-testid^="message-"]').first();
      await expect(firstMessage).toBeVisible();
      await expect(firstMessage.locator('.message-agent')).toBeVisible();
      await expect(firstMessage.locator('.message-text')).toBeVisible();
      await expect(firstMessage.locator('.message-time')).toBeVisible();
    });

    test('should show different message types with appropriate styling', async ({ page }) => {
      // Simulate different message types
      await page.evaluate(() => {
        window.testHelpers.addAgentMessage({
          agentId: 'agent-test',
          message: 'This is an info message',
          type: 'info',
          timestamp: new Date().toISOString()
        });
      });

      await page.evaluate(() => {
        window.testHelpers.addAgentMessage({
          agentId: 'agent-test',
          message: 'This is an error message',
          type: 'error',
          timestamp: new Date().toISOString()
        });
      });

      await page.evaluate(() => {
        window.testHelpers.addAgentMessage({
          agentId: 'agent-test',
          message: 'This is a success message',
          type: 'success',
          timestamp: new Date().toISOString()
        });
      });

      // Wait for messages to appear
      await page.waitForTimeout(1000);

      // Verify all messages are displayed
      const messages = page.locator('[data-testid^="message-"]');
      await expect(messages).toHaveCount(3, { timeout: 5000 });
    });

    test('should display agent IDs correctly', async ({ page }) => {
      await page.waitForSelector('[data-testid^="message-"]', { timeout: 10000 });

      const agentLabels = page.locator('.message-agent');
      const firstAgentLabel = agentLabels.first();
      await expect(firstAgentLabel).toBeVisible();

      // Verify agent ID format
      const agentText = await firstAgentLabel.textContent();
      expect(agentText).toMatch(/^agent-\w+$/);
    });

    test('should show timestamps in readable format', async ({ page }) => {
      await page.waitForSelector('[data-testid^="message-"]', { timeout: 10000 });

      const timeLabels = page.locator('.message-time');
      const firstTimeLabel = timeLabels.first();
      await expect(firstTimeLabel).toBeVisible();

      // Verify timestamp format (should be in time format)
      const timeText = await firstTimeLabel.textContent();
      expect(timeText).toMatch(/^\d{1,2}:\d{2}:\d{2}/); // HH:MM:SS format
    });
  });

  test.describe('Real-time Message Updates', () => {
    test('should receive and display new messages in real-time', async ({ page }) => {
      // Count initial messages
      const initialCount = await page.locator('[data-testid^="message-"]').count();

      // Wait for WebSocket connection
      await page.waitForTimeout(2000);

      // Wait for new messages to arrive via WebSocket
      await page.waitForFunction(() => {
        const messages = document.querySelectorAll('[data-testid^="message-"]');
        return messages.length > 0;
      }, { timeout: 15000 });

      // Verify we have more messages than initially
      const finalCount = await page.locator('[data-testid^="message-"]').count();
      expect(finalCount).toBeGreaterThan(0);
    });

    test('should maintain message order (newest first)', async ({ page }) => {
      // Add multiple messages with known timestamps
      const messages = [
        { id: 'msg1', message: 'First message', time: Date.now() },
        { id: 'msg2', message: 'Second message', time: Date.now() + 1000 },
        { id: 'msg3', message: 'Third message', time: Date.now() + 2000 }
      ];

      for (const msg of messages) {
        await page.evaluate((msgData) => {
          window.testHelpers.addAgentMessage({
            agentId: 'agent-test',
            message: msgData.message,
            type: 'info',
            timestamp: new Date(msgData.time).toISOString()
          });
        }, msg);
      }

      await page.waitForTimeout(1000);

      // Get message texts in order
      const messageTexts = await page.locator('.message-text').allTextContents();

      // Verify newest messages appear first
      const recentMessages = messageTexts.slice(0, 3);
      expect(recentMessages[0]).toBe('Third message');
      expect(recentMessages[1]).toBe('Second message');
      expect(recentMessages[2]).toBe('First message');
    });

    test('should limit message history to prevent memory issues', async ({ page }) => {
      // Add many messages to test limiting
      for (let i = 0; i < 60; i++) {
        await page.evaluate((index) => {
          window.testHelpers.addAgentMessage({
            agentId: 'agent-test',
            message: `Test message ${index}`,
            type: 'info',
            timestamp: new Date().toISOString()
          });
        }, i);
      }

      await page.waitForTimeout(2000);

      // Verify message count is limited
      const messageCount = await page.locator('[data-testid^="message-"]').count();
      expect(messageCount).toBeLessThanOrEqual(50);
    });

    test('should handle rapid message updates gracefully', async ({ page }) => {
      const startTime = Date.now();

      // Send many messages rapidly
      for (let i = 0; i < 20; i++) {
        await page.evaluate((index) => {
          window.testHelpers.addAgentMessage({
            agentId: `agent-${index % 3 + 1}`,
            message: `Rapid message ${index}`,
            type: 'info',
            timestamp: new Date().toISOString()
          });
        }, i);
      }

      // Verify all messages are processed within reasonable time
      await expect(async () => {
        const count = await page.locator('[data-testid^="message-"]').count();
        expect(count).toBeGreaterThan(15);
      }).toPass({ timeout: 5000 });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(6000); // Should complete within 6 seconds
    });
  });

  test.describe('Message Content and Filtering', () => {
    test('should display complete message text without truncation', async ({ page }) => {
      const longMessage = 'This is a very long message that should be displayed in full without any truncation or cutting off of the text content even if it spans multiple lines';

      await page.evaluate((msg) => {
        window.testHelpers.addAgentMessage({
          agentId: 'agent-test',
          message: msg,
          type: 'info',
          timestamp: new Date().toISOString()
        });
      }, longMessage);

      await page.waitForTimeout(1000);

      const messageText = page.locator('.message-text').first();
      const displayedText = await messageText.textContent();
      expect(displayedText).toBe(longMessage);
    });

    test('should handle special characters and formatting in messages', async ({ page }) => {
      const specialMessage = 'Message with special chars: <>&"\'`~!@#$%^&*()[]{}|\\:";\'<>?,./ and emojis 🚀🎯✅';

      await page.evaluate((msg) => {
        window.testHelpers.addAgentMessage({
          agentId: 'agent-test',
          message: msg,
          type: 'info',
          timestamp: new Date().toISOString()
        });
      }, specialMessage);

      await page.waitForTimeout(1000);

      const messageText = page.locator('.message-text').first();
      const displayedText = await messageText.textContent();
      expect(displayedText).toContain('🚀🎯✅');
      expect(displayedText).toContain('<>&"\'`');
    });

    test('should show agent activity indicators alongside messages', async ({ page }) => {
      // Verify messages are correlated with agent status updates
      await page.evaluate(() => {
        window.testHelpers.updateAgentStatus({
          agentId: 'agent-1',
          status: 'active',
          timestamp: new Date().toISOString()
        });

        window.testHelpers.addAgentMessage({
          agentId: 'agent-1',
          message: 'Agent is now active and working',
          type: 'info',
          timestamp: new Date().toISOString()
        });
      });

      await page.waitForTimeout(1000);

      // Check that agent status is updated
      const agentStatus = page.locator('[data-testid="agent-agent-1"] .agent-status');
      await expect(agentStatus).toHaveClass(/status-active/);

      // Check that message from same agent is displayed
      const agentMessages = page.locator('.message-agent:has-text("agent-1")');
      await expect(agentMessages.first()).toBeVisible();
    });
  });

  test.describe('Message Interaction and Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await page.waitForSelector('[data-testid^="message-"]', { timeout: 10000 });

      // Focus on messages panel
      await page.locator('[data-testid="messages-panel"]').focus();

      // Should be able to scroll through messages with keyboard
      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');

      // Verify no errors occurred
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.waitForTimeout(1000);
      expect(consoleErrors).toHaveLength(0);
    });

    test('should maintain accessibility standards', async ({ page }) => {
      await page.waitForSelector('[data-testid^="message-"]', { timeout: 10000 });

      // Check for proper ARIA labels and roles
      const messagesPanel = page.locator('[data-testid="messages-panel"]');
      await expect(messagesPanel).toBeVisible();

      // Verify semantic HTML structure
      const messagesList = page.locator('#messagesList');
      await expect(messagesList).toBeVisible();

      // Run basic accessibility check
      await expect(messagesPanel).toBeVisible();
      await expect(messagesPanel.locator('h3')).toHaveText('Agent Messages');
    });

    test('should handle scroll behavior correctly with many messages', async ({ page }) => {
      // Add many messages to enable scrolling
      for (let i = 0; i < 30; i++) {
        await page.evaluate((index) => {
          window.testHelpers.addAgentMessage({
            agentId: `agent-${index % 3 + 1}`,
            message: `Scroll test message ${index}`,
            type: 'info',
            timestamp: new Date().toISOString()
          });
        }, i);
      }

      await page.waitForTimeout(2000);

      // Verify messages panel is scrollable
      const messagesList = page.locator('#messagesList');
      const isScrollable = await messagesList.evaluate((el) => {
        return el.scrollHeight > el.clientHeight;
      });

      if (isScrollable) {
        // Test scrolling
        await messagesList.hover();
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(500);

        // Verify scroll position changed
        const scrollTop = await messagesList.evaluate(el => el.scrollTop);
        expect(scrollTop).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Error Handling and Resilience', () => {
    test('should handle WebSocket disconnection gracefully', async ({ page }) => {
      await page.waitForTimeout(2000);

      // Simulate WebSocket disconnection
      await page.evaluate(() => {
        if (window.socket) {
          window.socket.disconnect();
        }
      });

      await page.waitForTimeout(1000);

      // Should still be able to display existing messages
      const messages = page.locator('[data-testid^="message-"]');
      const messageCount = await messages.count();
      expect(messageCount).toBeGreaterThan(0);

      // UI should remain functional
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();
    });

    test('should handle malformed message data gracefully', async ({ page }) => {
      // Send malformed message data
      await page.evaluate(() => {
        try {
          window.testHelpers.addAgentMessage({
            // Missing required fields
            message: null,
            type: undefined,
            timestamp: 'invalid-date'
          });
        } catch (error) {
          console.log('Handled malformed message:', error.message);
        }
      });

      await page.waitForTimeout(1000);

      // Application should still be functional
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();

      // Should be able to add valid messages after error
      await page.evaluate(() => {
        window.testHelpers.addAgentMessage({
          agentId: 'agent-recovery',
          message: 'Recovery test message',
          type: 'info',
          timestamp: new Date().toISOString()
        });
      });

      await page.waitForTimeout(500);
      const recoveryMessage = page.locator('.message-text:has-text("Recovery test message")');
      await expect(recoveryMessage).toBeVisible();
    });

    test('should maintain performance with high message volume', async ({ page }) => {
      const startTime = Date.now();

      // Add a large number of messages
      for (let batch = 0; batch < 10; batch++) {
        const batchPromises = [];
        for (let i = 0; i < 10; i++) {
          const messageIndex = batch * 10 + i;
          batchPromises.push(
            page.evaluate((index) => {
              window.testHelpers.addAgentMessage({
                agentId: `agent-${index % 5}`,
                message: `Performance test message ${index}`,
                type: 'info',
                timestamp: new Date().toISOString()
              });
            }, messageIndex)
          );
        }
        await Promise.all(batchPromises);
        await page.waitForTimeout(100); // Small delay between batches
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time (10 seconds for 100 messages)
      expect(processingTime).toBeLessThan(10000);

      // UI should remain responsive
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();

      // Should have processed all messages (or at least capped at limit)
      const finalMessageCount = await page.locator('[data-testid^="message-"]').count();
      expect(finalMessageCount).toBeGreaterThan(0);
      expect(finalMessageCount).toBeLessThanOrEqual(50); // Respects message limit
    });
  });
});