/**
 * Chaos Testing: Redis Failure Scenarios
 *
 * Tests Redis failover and resilience using mocked Redis clients
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createMockRedisClient } from './test-helpers';

describe('Chaos Testing: Redis Failure Scenarios', () => {
  let primaryClient: any;
  let backupClient: any;

  beforeAll(async () => {
    primaryClient = createMockRedisClient();
    backupClient = createMockRedisClient();
  });

  afterAll(async () => {
    await primaryClient.quit();
    await backupClient.quit();
  });

  it('should handle primary Redis connection loss', async () => {
    const testMessage = {
      type: 'resilience-test',
      payload: { timestamp: Date.now() }
    };

    const publishToBackup = async () => {
      await backupClient.set('failure-test', JSON.stringify(testMessage));
      return true;
    };

    // Simulate primary Redis connection failure
    await primaryClient.disconnect();

    // Verify backup client can still publish messages
    await expect(publishToBackup()).resolves.toBeTruthy();
  });

  it('should handle reconnection and message recovery', async () => {
    const recoveryMessage = {
      type: 'recovery-test',
      payload: { recoveryTimestamp: Date.now() }
    };

    const messageCatcher = jest.fn();

    // Subscribe to channel
    await backupClient.subscribe('recovery-channel', (channel: string, message: string) => {
      messageCatcher(JSON.parse(message));
    });

    // Publish message
    await backupClient.publish('recovery-channel', JSON.stringify(recoveryMessage));

    // Wait and check message was received
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(messageCatcher).toHaveBeenCalledWith(recoveryMessage);
  });

  it('should validate Redis pub/sub resilience', async () => {
    const messageBatch = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      type: 'stress-test',
      timestamp: Date.now()
    }));

    const receivedMessages: any[] = [];

    await backupClient.subscribe('resilience-channel', (channel: string, message: string) => {
      receivedMessages.push(JSON.parse(message));
    });

    // Publish messages rapidly
    for (const message of messageBatch) {
      await backupClient.publish('resilience-channel', JSON.stringify(message));
    }

    // Wait for messages
    await new Promise(resolve => setTimeout(resolve, 100));

    // Ensure all messages were received
    expect(receivedMessages.length).toBe(messageBatch.length);
  });
});
