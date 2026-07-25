const { createClient } = require('redis');

describe('Web Portal Redis Integration', () => {
  let redisClient;
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

  beforeAll(async () => {
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  afterEach(async () => {
    // Clear keys after each test to prevent test pollution
    const keys = await redisClient.keys('swarm:*');
    for (const key of keys) {
      await redisClient.del(key);
    }
  });

  test('connects to Redis successfully', async () => {
    expect(redisClient).toBeTruthy();
    expect(await redisClient.ping()).toBe('PONG');
  });

  test('stores and retrieves complex swarm task data', async () => {
    const taskId = 'swarm-task-complex';
    const taskData = {
      id: taskId,
      description: 'Test complex swarm task',
      agents: JSON.stringify(['coder', 'tester', 'reviewer']),
      'status.current': 'in-progress',
      'status.progress': '0.65',
      'status.startedAt': new Date().toISOString(),
      iterations: '2',
      confidence: '0.85'
    };

    // Store task data using hash set for structured storage
    await redisClient.hSet(`swarm:task:${taskId}`, taskData);

    // Retrieve task data
    const storedData = await redisClient.hGetAll(`swarm:task:${taskId}`);

    // Verify stored data matches original
    expect(storedData).toEqual(taskData);
    expect(JSON.parse(storedData.agents)).toEqual(['coder', 'tester', 'reviewer']);
  });

  test('supports agent coordination with list operations', async () => {
    const taskId = 'coordination-task';
    const agentCompletionKey = `swarm:${taskId}:agents:completed`;
    const waitingAgentsKey = `swarm:${taskId}:agents:waiting`;

    // Push agents to waiting list
    await redisClient.rPush(waitingAgentsKey, ['researcher', 'backend-dev', 'frontend-dev']);

    // Simulate agent completion workflow
    const completedAgent = await redisClient.lPop(waitingAgentsKey);
    await redisClient.rPush(agentCompletionKey, completedAgent);

    // Verify list operations
    const waitingCount = await redisClient.lLen(waitingAgentsKey);
    const completedCount = await redisClient.lLen(agentCompletionKey);

    expect(waitingCount).toBe(2);
    expect(completedCount).toBe(1);
    expect(await redisClient.lIndex(agentCompletionKey, 0)).toBe('researcher');
  });

  test('handles redis pub/sub for agent coordination', async () => {
    const channelName = 'swarm:coordination';

    // Create a promise to handle async pub/sub
    const messageReceived = new Promise((resolve, reject) => {
      const subscriber = redisClient.duplicate();
      const timeout = setTimeout(() => {
        subscriber.unsubscribe(channelName);
        subscriber.quit();
        reject(new Error('Pub/sub message timeout'));
      }, 5000);

      subscriber.connect().then(() => {
        subscriber.subscribe(channelName, (message) => {
          clearTimeout(timeout);
          resolve(message);
          subscriber.unsubscribe(channelName);
          subscriber.quit();
        });

        // Publish message after subscription
        setTimeout(() => {
          redisClient.publish(channelName, JSON.stringify({
            type: 'agent_wake',
            taskId: 'test-task',
            agentId: 'backend-dev',
            iteration: 2
          }));
        }, 100);
      });
    });

    const receivedMessage = await messageReceived;
    const parsedMessage = JSON.parse(receivedMessage);

    expect(parsedMessage).toEqual({
      type: 'agent_wake',
      taskId: 'test-task',
      agentId: 'backend-dev',
      iteration: 2
    });
  });

  test('tracks agent confidence with sorted set', async () => {
    const taskId = 'confidence-tracking';
    const confidenceKey = `swarm:${taskId}:agent:confidence`;

    // Add agents with confidence scores
    await redisClient.zAdd(confidenceKey, [
      { score: 0.92, value: 'backend-dev' },
      { score: 0.85, value: 'frontend-dev' },
      { score: 0.78, value: 'researcher' }
    ]);

    // Get top-performing agents
    const topAgents = await redisClient.zRangeByScore(confidenceKey, 0.80, 1.00, {
      REV: true  // Highest to lowest
    });

    // Note: Order might vary, so use expect.arrayContaining
    expect(topAgents).toEqual(expect.arrayContaining(['backend-dev', 'frontend-dev']));

    // Get total number of agents
    const totalAgents = await redisClient.zCard(confidenceKey);
    expect(totalAgents).toBe(3);
  });

  test('handles connection failures gracefully', async () => {
    jest.setTimeout(10000);  // Increase timeout for this test

    const invalidClient = createClient({
      url: 'redis://nonexistent:6379',
      socket: {
        connectTimeout: 1000,  // 1 second timeout
        disconnectTimeout: 1000
      }
    });

    // Explicitly handle error to prevent unhandled promise rejection
    await expect(invalidClient.connect()).rejects.toThrow();
  });
});