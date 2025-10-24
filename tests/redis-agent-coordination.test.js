const redis = require('redis');
const { selectAgents } = require('../src/agent-registry');

describe('Redis Agent Coordination', () => {
  let redisClient;

  beforeAll(async () => { try {
    redisClient = redis.createClient();
    await redisClient.connect();
  });

  afterAll(async () => { try {
    await redisClient.quit();
  });

  jest.setTimeout(10000);
  test('Agent selection should broadcast via Redis', async () => { try {
    const taskDescription = 'Complex system design task';

    // Publish agent selection event
    const agentSelectionChannel = 'agent-selection';
    const selectedAgents = selectAgents(taskDescription);

    await redisClient.publish(agentSelectionChannel, JSON.stringify({
      taskId: Date.now().toString(),
      agents: selectedAgents,
      timestamp: new Date().toISOString()
    }));

    // Verify Redis message was sent
    const publishedMessage = await new Promise((resolve) => {
      redisClient.subscribe(agentSelectionChannel, (message) => {
        resolve(JSON.parse(message));
      });
    });

    expect(publishedMessage.agents).toBeDefined();
    expect(publishedMessage.agents.length).toBeGreaterThan(0);
  });

  jest.setTimeout(10000);
  test('Multiple agents can subscribe to task channel', async () => { try {
    const taskId = `task-${Date.now()}`;
    const subscribedAgents = [];

    // Simulate agent subscriptions
    await Promise.all([
      redisClient.subscribe(`task:${taskId}:agents`, (agentData) => {
        subscribedAgents.push(JSON.parse(agentData));
      }),
      redisClient.publish(`task:${taskId}:agents`, JSON.stringify({
        agentType: 'backend-dev',
        confidence: 0.85
      })),
      redisClient.publish(`task:${taskId}:agents`, JSON.stringify({
        agentType: 'security-specialist',
        confidence: 0.75
      }))
    ]);

    expect(subscribedAgents.length).toBe(2);
    expect(subscribedAgents.some(a => a.agentType === 'backend-dev')).toBe(true);
    expect(subscribedAgents.some(a => a.agentType === 'security-specialist')).toBe(true);
  });
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});