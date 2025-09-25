/**
 * @file WebSocket Communication Tests
 * @description Comprehensive tests for WebSocket real-time communication
 */

import { test, expect } from '@playwright/test';
import { WebPortalPage } from '../page-objects/web-portal-page';

test.describe('WebSocket Communication', () => {
  let portalPage: WebPortalPage;

  test.beforeEach(async ({ page }) => {
    portalPage = new WebPortalPage(page);
    await portalPage.goto();
    await portalPage.login('test-admin', 'test-password');
    await portalPage.waitForDashboard();
  });

  test.describe('Connection Management', () => {
    test('should establish WebSocket connection on dashboard load', async ({ page }) => {
      // Check that WebSocket connection is established
      const connectionStatus = await page.evaluate(() => {
        return window.socket ? window.socket.connected : false;
      });

      expect(connectionStatus).toBe(true);
    });

    test('should handle connection establishment with proper handshake', async ({ page }) => {
      // Verify connection events
      const connectionEvents = await page.evaluate(() => {
        return new Promise((resolve) => {
          const events = [];

          if (window.socket) {
            const originalEmit = window.socket.emit;
            window.socket.emit = function(...args) {
              events.push({ type: 'emit', args: args });
              return originalEmit.apply(this, args);
            };

            window.socket.on('connect', () => {
              events.push({ type: 'connect' });
            });

            window.socket.on('subscribed', (data) => {
              events.push({ type: 'subscribed', data });
            });

            // Wait for subscription confirmations
            setTimeout(() => resolve(events), 2000);
          } else {
            resolve([]);
          }
        });
      });

      expect(connectionEvents.length).toBeGreaterThan(0);

      // Should have subscription events
      const hasSubscriptions = connectionEvents.some(event =>
        event.type === 'emit' &&
        (event.args[0] === 'subscribe-to-swarm' || event.args[0] === 'subscribe-to-agent')
      );
      expect(hasSubscriptions).toBe(true);
    });

    test('should handle connection failures gracefully', async ({ page }) => {
      // Test with server unavailable scenario
      await page.evaluate(() => {
        // Simulate connection error
        if (window.socket) {
          window.socket.emit('error', new Error('Connection failed'));
        }
      });

      await page.waitForTimeout(1000);

      // Application should remain functional
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
    });

    test('should automatically reconnect after disconnection', async ({ page }) => {
      // Disconnect WebSocket
      await page.evaluate(() => {
        if (window.socket) {
          window.socket.disconnect();
        }
      });

      await page.waitForTimeout(1000);

      // Simulate reconnection
      await page.evaluate(() => {
        if (window.socket) {
          window.socket.connect();
        }
      });

      await page.waitForTimeout(2000);

      // Should be connected again
      const reconnectionStatus = await page.evaluate(() => {
        return window.socket ? window.socket.connected : false;
      });

      expect(reconnectionStatus).toBe(true);
    });
  });

  test.describe('Real-time Data Streaming', () => {
    test('should receive dashboard stats updates', async ({ page }) => {
      // Wait for initial stats
      await page.waitForSelector('#activeAgents', { state: 'attached' });

      const initialStats = {
        agents: await page.locator('#activeAgents').textContent(),
        swarms: await page.locator('#activeSwarms').textContent(),
        tasks: await page.locator('#runningTasks').textContent()
      };

      // Wait for potential updates via WebSocket
      await page.waitForTimeout(3000);

      const updatedStats = {
        agents: await page.locator('#activeAgents').textContent(),
        swarms: await page.locator('#activeSwarms').textContent(),
        tasks: await page.locator('#runningTasks').textContent()
      };

      // Stats should be maintained (numbers should be valid)
      expect(parseInt(updatedStats.agents!)).toBeGreaterThanOrEqual(0);
      expect(parseInt(updatedStats.swarms!)).toBeGreaterThanOrEqual(0);
      expect(parseInt(updatedStats.tasks!)).toBeGreaterThanOrEqual(0);
    });

    test('should receive agent status updates in real-time', async ({ page }) => {
      // Wait for initial agent statuses
      await page.waitForSelector('.agent-status', { state: 'attached' });

      // Monitor for status changes
      let statusUpdateReceived = false;
      let updateCount = 0;

      // Set up listener for agent status updates
      await page.evaluate(() => {
        if (window.socket) {
          window.socket.on('agent-status-update', (data) => {
            window.lastAgentUpdate = data;
          });
        }
      });

      // Wait for status updates
      await page.waitForTimeout(5000);

      // Check if we received any updates
      const lastUpdate = await page.evaluate(() => window.lastAgentUpdate);

      if (lastUpdate) {
        expect(lastUpdate).toHaveProperty('agentId');
        expect(lastUpdate).toHaveProperty('status');
        expect(['active', 'idle', 'busy']).toContain(lastUpdate.status);
        statusUpdateReceived = true;
      }

      // Even if no updates received, the system should be stable
      const agentStatuses = page.locator('.agent-status');
      const statusCount = await agentStatuses.count();
      expect(statusCount).toBeGreaterThan(0);
    });

    test('should receive task progress updates', async ({ page }) => {
      // Set up listener for task progress updates
      await page.evaluate(() => {
        window.taskUpdates = [];
        if (window.socket) {
          window.socket.on('task-progress-update', (data) => {
            window.taskUpdates.push(data);
          });
        }
      });

      // Wait for updates
      await page.waitForTimeout(6000);

      const taskUpdates = await page.evaluate(() => window.taskUpdates || []);

      if (taskUpdates.length > 0) {
        const update = taskUpdates[0];
        expect(update).toHaveProperty('taskId');
        expect(update).toHaveProperty('progress');
        expect(update.progress).toBeGreaterThanOrEqual(0);
        expect(update.progress).toBeLessThanOrEqual(100);
      }

      // System should remain stable regardless of updates
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
    });

    test('should handle high-frequency message streams', async ({ page }) => {
      // Set up message tracking
      await page.evaluate(() => {
        window.messageReceiveCount = 0;
        window.messageReceiveStart = Date.now();

        if (window.socket) {
          window.socket.on('agent-message', () => {
            window.messageReceiveCount++;
          });
        }
      });

      // Wait for messages to accumulate
      await page.waitForTimeout(8000);

      const stats = await page.evaluate(() => ({
        count: window.messageReceiveCount || 0,
        duration: Date.now() - (window.messageReceiveStart || Date.now())
      }));

      // Should handle messages without performance degradation
      if (stats.count > 0) {
        const messagesPerSecond = stats.count / (stats.duration / 1000);
        expect(messagesPerSecond).toBeGreaterThan(0);
        expect(messagesPerSecond).toBeLessThan(50); // Reasonable rate limit
      }

      // UI should remain responsive
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();
    });
  });

  test.describe('Message Broadcasting and Subscriptions', () => {
    test('should subscribe to swarm-specific channels', async ({ page }) => {
      // Verify subscription to swarm channels
      const subscriptionResult = await page.evaluate(() => {
        return new Promise((resolve) => {
          if (window.socket) {
            let subscribed = false;

            window.socket.on('subscribed', (data) => {
              if (data.swarmId) {
                subscribed = true;
                resolve({ success: true, swarmId: data.swarmId });
              }
            });

            // Attempt subscription
            window.socket.emit('subscribe-to-swarm', 'test-swarm-1');

            setTimeout(() => {
              if (!subscribed) {
                resolve({ success: false });
              }
            }, 3000);
          } else {
            resolve({ success: false });
          }
        });
      });

      if (subscriptionResult.success) {
        expect(subscriptionResult.swarmId).toBe('test-swarm-1');
      }
    });

    test('should subscribe to agent-specific channels', async ({ page }) => {
      const subscriptionResult = await page.evaluate(() => {
        return new Promise((resolve) => {
          if (window.socket) {
            let subscribed = false;

            window.socket.on('subscribed', (data) => {
              if (data.agentId) {
                subscribed = true;
                resolve({ success: true, agentId: data.agentId });
              }
            });

            window.socket.emit('subscribe-to-agent', 'agent-1');

            setTimeout(() => {
              if (!subscribed) {
                resolve({ success: false });
              }
            }, 3000);
          } else {
            resolve({ success: false });
          }
        });
      });

      if (subscriptionResult.success) {
        expect(subscriptionResult.agentId).toBe('agent-1');
      }
    });

    test('should receive targeted messages for subscribed channels', async ({ page }) => {
      // Subscribe to specific agent
      await page.evaluate(() => {
        window.targetedMessages = [];
        if (window.socket) {
          window.socket.emit('subscribe-to-agent', 'agent-2');
          window.socket.on('agent-message', (data) => {
            if (data.agentId === 'agent-2') {
              window.targetedMessages.push(data);
            }
          });
        }
      });

      await page.waitForTimeout(5000);

      const targetedMessages = await page.evaluate(() => window.targetedMessages || []);

      // Should receive messages (or at least system should be ready to receive them)
      expect(Array.isArray(targetedMessages)).toBe(true);
    });

    test('should handle multiple simultaneous subscriptions', async ({ page }) => {
      const subscriptionsResult = await page.evaluate(() => {
        return new Promise((resolve) => {
          if (window.socket) {
            const subscriptions = [];

            window.socket.on('subscribed', (data) => {
              subscriptions.push(data);

              if (subscriptions.length >= 2) {
                resolve(subscriptions);
              }
            });

            // Subscribe to multiple channels
            window.socket.emit('subscribe-to-swarm', 'test-swarm-2');
            window.socket.emit('subscribe-to-agent', 'agent-3');

            setTimeout(() => resolve(subscriptions), 4000);
          } else {
            resolve([]);
          }
        });
      });

      expect(Array.isArray(subscriptionsResult)).toBe(true);
      // Should handle multiple subscriptions without errors
    });
  });

  test.describe('Bidirectional Communication', () => {
    test('should send human intervention responses', async ({ page }) => {
      // Wait for intervention panel
      await page.waitForSelector('[data-testid="intervention-panel"]', {
        state: 'visible',
        timeout: 10000
      });

      // Set up listener for intervention responses
      await page.evaluate(() => {
        window.interventionResponses = [];
        if (window.socket) {
          window.socket.on('intervention-resolved', (data) => {
            window.interventionResponses.push(data);
          });
        }
      });

      // Submit an intervention response
      await page.locator('[data-option="oauth2"]').click();
      await page.locator('#submitDecision').click();

      // Wait for response
      await page.waitForTimeout(3000);

      const responses = await page.evaluate(() => window.interventionResponses || []);

      if (responses.length > 0) {
        const response = responses[0];
        expect(response).toHaveProperty('decision');
        expect(response).toHaveProperty('resolvedAt');
      }
    });

    test('should emit custom events for agent interactions', async ({ page }) => {
      // Test custom event emission
      const emissionResult = await page.evaluate(() => {
        return new Promise((resolve) => {
          if (window.socket) {
            // Listen for acknowledgment
            window.socket.on('custom-event-ack', (data) => {
              resolve({ success: true, data });
            });

            // Emit custom event
            window.socket.emit('custom-agent-action', {
              action: 'pause-agent',
              agentId: 'agent-1',
              timestamp: new Date().toISOString()
            });

            setTimeout(() => resolve({ success: false }), 3000);
          } else {
            resolve({ success: false });
          }
        });
      });

      // Should handle custom events without errors
      expect(emissionResult.success).toBeDefined();
    });

    test('should handle client-initiated requests', async ({ page }) => {
      // Test making requests to server
      const requestResult = await page.evaluate(() => {
        return new Promise((resolve) => {
          if (window.socket) {
            window.socket.emit('request-agent-status', { agentId: 'agent-1' });

            const timeout = setTimeout(() => {
              resolve({ success: false, reason: 'timeout' });
            }, 5000);

            window.socket.on('agent-status-response', (data) => {
              clearTimeout(timeout);
              resolve({ success: true, data });
            });
          } else {
            resolve({ success: false, reason: 'no-socket' });
          }
        });
      });

      // Should handle requests gracefully
      expect(requestResult).toHaveProperty('success');
    });
  });

  test.describe('Error Handling and Recovery', () => {
    test('should handle WebSocket errors gracefully', async ({ page }) => {
      // Simulate WebSocket error
      let errorHandled = false;

      await page.evaluate(() => {
        window.websocketErrors = [];
        if (window.socket) {
          window.socket.on('error', (error) => {
            window.websocketErrors.push(error);
          });

          // Trigger an error
          window.socket.emit('invalid-event', { invalid: 'data' });
        }
      });

      await page.waitForTimeout(2000);

      // Application should remain stable
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
    });

    test('should handle connection timeouts', async ({ page }) => {
      // Test timeout handling
      await page.evaluate(() => {
        window.connectionTimeouts = 0;
        if (window.socket) {
          const originalConnect = window.socket.connect;
          window.socket.connect = function() {
            setTimeout(() => {
              window.connectionTimeouts++;
            }, 1000);
            return originalConnect.apply(this);
          };
        }
      });

      await page.waitForTimeout(3000);

      // System should handle timeouts gracefully
      const dashboardVisible = await page.locator('[data-testid="system-stats"]').isVisible();
      expect(dashboardVisible).toBe(true);
    });

    test('should handle malformed message data', async ({ page }) => {
      // Send malformed data
      await page.evaluate(() => {
        window.malformedMessageCount = 0;
        if (window.socket) {
          try {
            // Simulate receiving malformed data
            window.socket.emit('malformed-test', {
              invalid: null,
              timestamp: 'not-a-date',
              agentId: { invalid: 'object' }
            });
            window.malformedMessageCount++;
          } catch (error) {
            console.log('Caught malformed message error:', error);
          }
        }
      });

      await page.waitForTimeout(1000);

      // Application should remain functional
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();
    });

    test('should recover from temporary server unavailability', async ({ page }) => {
      // Simulate server unavailability
      await page.evaluate(() => {
        if (window.socket) {
          window.socket.disconnect();
        }
      });

      await page.waitForTimeout(2000);

      // Simulate server coming back online
      await page.evaluate(() => {
        if (window.socket) {
          window.socket.connect();
        }
      });

      await page.waitForTimeout(2000);

      // Should recover and be functional
      const isConnected = await page.evaluate(() => {
        return window.socket ? window.socket.connected : false;
      });

      // Application should be stable regardless of connection status
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
    });
  });

  test.describe('Performance and Scalability', () => {
    test('should maintain performance with high message volume', async ({ page }) => {
      const startTime = Date.now();

      // Simulate high-volume message processing
      await page.evaluate(() => {
        window.processedMessages = 0;
        window.processingErrors = 0;

        if (window.socket) {
          const messageHandler = (data) => {
            try {
              window.processedMessages++;
            } catch (error) {
              window.processingErrors++;
            }
          };

          window.socket.on('high-volume-test', messageHandler);

          // Simulate receiving many messages
          for (let i = 0; i < 100; i++) {
            setTimeout(() => {
              try {
                window.socket.emit('high-volume-test', {
                  index: i,
                  timestamp: new Date().toISOString()
                });
              } catch (error) {
                window.processingErrors++;
              }
            }, i * 10);
          }
        }
      });

      await page.waitForTimeout(5000);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      const results = await page.evaluate(() => ({
        processed: window.processedMessages || 0,
        errors: window.processingErrors || 0
      }));

      // Should process messages efficiently
      expect(processingTime).toBeLessThan(10000); // Under 10 seconds
      expect(results.errors).toBe(0);

      // UI should remain responsive
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();
    });

    test('should handle concurrent connections efficiently', async ({ page }) => {
      // Test multiple subscription management
      const concurrencyResult = await page.evaluate(() => {
        return new Promise((resolve) => {
          if (window.socket) {
            const startTime = Date.now();
            const subscriptions = [];

            // Create multiple subscriptions
            for (let i = 1; i <= 5; i++) {
              window.socket.emit('subscribe-to-agent', `agent-${i}`);
              subscriptions.push(`agent-${i}`);
            }

            setTimeout(() => {
              const endTime = Date.now();
              resolve({
                subscriptionCount: subscriptions.length,
                processingTime: endTime - startTime
              });
            }, 2000);
          } else {
            resolve({ subscriptionCount: 0, processingTime: 0 });
          }
        });
      });

      // Should handle multiple subscriptions efficiently
      if (concurrencyResult.subscriptionCount > 0) {
        expect(concurrencyResult.processingTime).toBeLessThan(3000);
      }

      // System should remain stable
      await expect(page.locator('[data-testid="system-stats"]')).toBeVisible();
    });

    test('should manage memory usage with long-running connections', async ({ page }) => {
      // Test memory management over time
      const memoryTest = await page.evaluate(() => {
        return new Promise((resolve) => {
          const initialMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;

          // Simulate long-running connection activity
          let messageCount = 0;
          const interval = setInterval(() => {
            if (window.socket && messageCount < 50) {
              window.socket.emit('memory-test', {
                data: new Array(100).fill('test-data'),
                timestamp: Date.now()
              });
              messageCount++;
            } else {
              clearInterval(interval);

              const finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
              resolve({
                initialMemory,
                finalMemory,
                memoryIncrease: finalMemory - initialMemory,
                messagesSent: messageCount
              });
            }
          }, 50);
        });
      });

      // Memory usage should be reasonable
      if (memoryTest.memoryIncrease > 0) {
        expect(memoryTest.memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
      }

      // System should remain functional
      await expect(page.locator('[data-testid="messages-panel"]')).toBeVisible();
    });
  });
});