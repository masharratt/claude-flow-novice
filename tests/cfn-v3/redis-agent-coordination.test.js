const redis = require('redis');
const { selectAgents } = require('../src/agent-registry');

describe('Redis Agent Coordination', () => {
  let redisClient;
  let subscribedChannels = [];

  beforeAll(async () => {
    try {
      redisClient = redis.createClient();
      await redisClient.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  });

  afterEach(async () => {
    // Unsubscribe from all channels after each test
    try {
      if (subscribedChannels.length > 0) {
        for (const channel of subscribedChannels) {
          await redisClient.unsubscribe(channel);
        }
        subscribedChannels = [];
      }
    } catch (error) {
      // Ignore unsubscribe errors
    }
  });

  afterAll(async () => {
    try {
      // Force disconnect to prevent hanging
      if (redisClient && redisClient.isOpen) {
        await redisClient.disconnect();
      }
    } catch (error) {
      // Ignore disconnect errors
    }
  });

  test('Agent selection should broadcast via Redis', async () => {
    try {
      const taskDescription = 'Complex system design task';

      // Publish agent selection event
      const agentSelectionChannel = 'agent-selection';
      subscribedChannels.push(agentSelectionChannel);
      const selectedAgents = selectAgents(taskDescription);

      // Subscribe first, then publish
      const messagePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for Redis message'));
        }, 5000);

        redisClient.subscribe(agentSelectionChannel, (message) => {
          clearTimeout(timeout);
          resolve(JSON.parse(message));
        });
      });

      // Wait a bit for subscription to establish
      await new Promise((resolve) => setTimeout(resolve, 100));

      await redisClient.publish(agentSelectionChannel, JSON.stringify({
        taskId: Date.now().toString(),
        agents: selectedAgents,
        timestamp: new Date().toISOString()
      }));

      const publishedMessage = await messagePromise;

      expect(publishedMessage.agents).toBeDefined();
      expect(publishedMessage.agents.length).toBeGreaterThan(0);
    } catch (error) {
      console.error(`Test failed: ${error.message}`);
      throw error;
    }
  }, 10000);

  test('Multiple agents can subscribe to task channel', async () => {
    try {
      const taskId = `task-${Date.now()}`;
      const channel = `task:${taskId}:agents`;
      subscribedChannels.push(channel);
      const subscribedAgents = [];

      // Subscribe first
      const messagesPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for Redis messages'));
        }, 5000);

        let receivedCount = 0;
        redisClient.subscribe(channel, (agentData) => {
          subscribedAgents.push(JSON.parse(agentData));
          receivedCount++;
          if (receivedCount >= 2) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      // Wait for subscription to establish
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Publish messages
      await redisClient.publish(channel, JSON.stringify({
        agentType: 'backend-dev',
        confidence: 0.85
      }));

      await redisClient.publish(channel, JSON.stringify({
        agentType: 'security-specialist',
        confidence: 0.75
      }));

      await messagesPromise;

      expect(subscribedAgents.length).toBe(2);
      expect(subscribedAgents.some(a => a.agentType === 'backend-dev')).toBe(true);
      expect(subscribedAgents.some(a => a.agentType === 'security-specialist')).toBe(true);
    } catch (error) {
      console.error(`Test failed: ${error.message}`);
      throw error;
    }
  }, 10000);
});