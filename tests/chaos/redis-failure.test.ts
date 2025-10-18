import Redis from 'ioredis';
import { TestRedisClient } from '../test-utils';

describe('Chaos Testing: Redis Failure Scenarios', () => {
  let primaryClient: Redis;
  let backupClient: TestRedisClient;

  beforeAll(async () => {
    primaryClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10)
    });

    backupClient = new TestRedisClient();
  });

  afterAll(async () => {
    await primaryClient.quit();
    await backupClient.cleanup();
  });

  test('Handle primary Redis connection loss', async () => {
    const testMessage = {
      type: 'resilience-test',
      payload: { timestamp: Date.now() }
    };

    const publishToBackup = async () => {
      await backupClient.publishMessage('failure-test', testMessage);
      return true;
    };

    // Simulate primary Redis connection failure
    await primaryClient.disconnect();

    // Verify backup client can still publish messages
    await expect(publishToBackup()).resolves.toBeTruthy();
  });

  test('Reconnection and message recovery', async () => {
    const recoveryMessage = {
      type: 'recovery-test',
      payload: { recoveryTimestamp: Date.now() }
    };

    const messageCatcher = jest.fn();

    await backupClient.subscribeToChannel('recovery-channel', messageCatcher);
    await backupClient.publishMessage('recovery-channel', recoveryMessage);

    // Wait and check message was received
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(messageCatcher).toHaveBeenCalledWith(recoveryMessage);
  });

  test('Validate Redis pub/sub resilience', async () => {
    const resilientTest = async () => {
      const messageBatch = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        type: 'stress-test',
        timestamp: Date.now()
      }));

      const receivedMessages: any[] = [];

      await backupClient.subscribeToChannel('resilience-channel', (msg) => {
        receivedMessages.push(msg);
      });

      // Publish messages rapidly
      for (const message of messageBatch) {
        await backupClient.publishMessage('resilience-channel', message);
      }

      // Wait for messages
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Ensure all messages were received
      return receivedMessages.length === messageBatch.length;
    };

    await expect(resilientTest()).resolves.toBeTruthy();
  });
});