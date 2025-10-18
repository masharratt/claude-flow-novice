/**
 * Redis Messaging Infrastructure Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RedisMessagingInfrastructure } from '../redis-messaging-infrastructure.js';

// Mock Redis clients
const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  setex: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  publish: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  subscribe: jest.fn().mockResolvedValue(undefined),
  on: jest.fn()
};

// Mock the redis module
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis)
}));

// Mock EnhancedProgressTracker
jest.mock('../enhanced-progress-tracker.js', () => ({
  EnhancedProgressTracker: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined),
    updateAgentVisibility: jest.fn().mockResolvedValue(undefined),
    getAgentVisibility: jest.fn().mockResolvedValue(null),
    getSwarmOverview: jest.fn().mockResolvedValue(null),
    getActiveTasks: jest.fn().mockResolvedValue([])
  }))
}));

describe('RedisMessagingInfrastructure', () => {
  let messaging: RedisMessagingInfrastructure;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    messaging = new RedisMessagingInfrastructure(
      'agent-1',
      'swarm-1',
      {
        redisUrl: 'redis://localhost:6379',
        hmacSecret: 'test-secret'
      },
      {
        level: 'error',
        format: 'json',
        destination: 'console'
      }
    );
    
    await messaging.initialize();
  });

  afterEach(async () => {
    await messaging.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize all Redis connections', async () => {
      expect(mockRedis.connect).toHaveBeenCalledTimes(3); // Main, subscriber, publisher
    });

    it('should start heartbeat on initialization', async () => {
      // Wait a bit for heartbeat to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Heartbeat should be publishing periodically
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'swarm:swarm-1:heartbeat',
        expect.any(String)
      );
    });
  });

  describe('Message Sending', () => {
    it('should send message to specific agent', async () => {
      const messageId = await messaging.sendMessage(
        'task_assignment',
        { taskId: 'task-1', taskType: 'test' },
        'agent-2'
      );

      expect(messageId).toBeDefined();
      expect(messageId).toMatch(/^msg-agent-1-\d+-[a-z0-9]+$/);
      
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'agent:agent-2:messages',
        expect.stringContaining('"type":"task_assignment"')
      );
    });

    it('should broadcast message to swarm', async () => {
      const messageId = await messaging.sendMessage(
        'agent_status',
        { status: 'active' }
      );

      expect(messageId).toBeDefined();
      
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'swarm:swarm-1:broadcast',
        expect.stringContaining('"type":"agent_status"')
      );
    });

    it('should send task assignment with priority', async () => {
      const messageId = await messaging.sendTaskAssignment(
        'agent-2',
        'task-1',
        'coding',
        'Write TypeScript code',
        ['typescript', 'nodejs'],
        ['dep-1'],
        Date.now() + 3600000
      );

      expect(messageId).toBeDefined();
      
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'agent:agent-2:messages',
        expect.stringMatching(/"type":"task_assignment".*"priority":"high"/s)
      );
    });

    it('should send coordination request', async () => {
      const messageId = await messaging.sendCoordinationRequest(
        'agent-2',
        'handoff',
        'task-1',
        'Need help with dependency'
      );

      expect(messageId).toBeDefined();
      
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'agent:agent-2:messages',
        expect.stringContaining('"action":"handoff"')
      );
    });

    it('should send coordination response', async () => {
      const messageId = await messaging.sendCoordinationResponse(
        'agent-2',
        'approve',
        'msg-123',
        'Task approved'
      );

      expect(messageId).toBeDefined();
      
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'agent:agent-2:messages',
        expect.stringContaining('"action":"approve"')
      );
    });
  });

  describe('Message Subscriptions', () => {
    it('should subscribe to messages from specific agents', async () => {
      const messages: any[] = [];
      
      await messaging.subscribe(
        { fromAgents: ['agent-2'] },
        (message) => messages.push(message)
      );

      expect(mockRedis.subscribe).toHaveBeenCalledWith(
        'agent:agent-2:messages',
        expect.any(Function)
      );
    });

    it('should subscribe to specific message types', async () => {
      const messages: any[] = [];
      
      await messaging.subscribe(
        { messageTypes: ['task_assignment', 'coordination_request'] },
        (message) => messages.push(message)
      );

      expect(mockRedis.subscribe).toHaveBeenCalledWith(
        'agent:agent-1:messages',
        expect.any(Function)
      );
    });

    it('should filter messages by priority', async () => {
      const messages: any[] = [];
      
      await messaging.subscribe(
        { priority: ['high', 'critical'] },
        (message) => messages.push(message)
      );

      expect(mockRedis.subscribe).toHaveBeenCalled();
    });
  });

  describe('Agent Status Management', () => {
    it('should broadcast agent status', async () => {
      await messaging.broadcastStatus('active', { workingOn: 'task-1' });

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'swarm:swarm-1:broadcast',
        expect.stringContaining('"type":"agent_status"')
      );
    });

    it('should update agent visibility', async () => {
      await messaging.updateAgentVisibility({
        status: 'working',
        currentLoad: 0.7
      });

      // Should call progress tracker update
      const progressTracker = messaging.getProgressTracker();
      expect(progressTracker.updateAgentVisibility).toHaveBeenCalledWith(
        'agent-1',
        {
          status: 'working',
          currentLoad: 0.7
        }
      );
    });
  });

  describe('Message History', () => {
    it('should get message history for agent', async () => {
      // Mock Redis keys and get responses
      mockRedis.keys.mockResolvedValue(['messages:swarm-1:agent-1:msg-1']);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        id: 'msg-1',
        type: 'task_assignment',
        from: 'agent-2',
        timestamp: Date.now(),
        payload: { taskId: 'task-1' }
      }));

      const history = await messaging.getMessageHistory({
        agentId: 'agent-1',
        limit: 10
      });

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('msg-1');
      expect(history[0].type).toBe('task_assignment');
    });

    it('should filter message history by type', async () => {
      mockRedis.keys.mockResolvedValue(['messages:swarm-1:msg-1', 'messages:swarm-1:msg-2']);
      mockRedis.get.mockImplementation((key) => {
        if (key.includes('msg-1')) {
          return Promise.resolve(JSON.stringify({
            id: 'msg-1',
            type: 'task_assignment',
            from: 'agent-2',
            timestamp: Date.now(),
            payload: { taskId: 'task-1' }
          }));
        } else {
          return Promise.resolve(JSON.stringify({
            id: 'msg-2',
            type: 'coordination_request',
            from: 'agent-3',
            timestamp: Date.now(),
            payload: { action: 'handoff' }
          }));
        }
      });

      const history = await messaging.getMessageHistory({
        messageTypes: ['task_assignment'],
        limit: 10
      });

      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('task_assignment');
    });

    it('should filter message history by time range', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      mockRedis.keys.mockResolvedValue(['messages:swarm-1:msg-1']);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        id: 'msg-1',
        type: 'task_assignment',
        from: 'agent-2',
        timestamp: now - 1800000, // 30 minutes ago
        payload: { taskId: 'task-1' }
      }));

      const history = await messaging.getMessageHistory({
        timeRange: { start: oneHourAgo, end: now },
        limit: 10
      });

      expect(history).toHaveLength(1);
    });
  });

  describe('Message Validation', () => {
    it('should validate message size', async () => {
      const largePayload = 'x'.repeat(2000000); // 2MB payload
      
      await expect(
        messaging.sendMessage('test', { data: largePayload })
      ).rejects.toThrow('Message size');
    });

    it('should apply rate limiting', async () => {
      // Send many messages quickly to trigger rate limit
      const promises = [];
      for (let i = 0; i < 150; i++) {
        promises.push(messaging.sendMessage('test', { index: i }));
      }

      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected');
      
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0].status).toBe('rejected');
    });
  });

  describe('Message Authentication', () => {
    it('should sign messages with HMAC', async () => {
      await messaging.sendMessage('test', { data: 'test' });

      const publishCall = mockRedis.publish.mock.calls.find(call => 
        call[1].includes('"type":"test"')
      );

      expect(publishCall[1]).toMatch(/"signature":"[a-f0-9]+"/);
    });
  });

  describe('Cleanup', () => {
    it('should send shutdown message on cleanup', async () => {
      await messaging.cleanup();

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'swarm:swarm-1:broadcast',
        expect.stringContaining('"type":"shutdown"')
      );
    });

    it('should cleanup all resources', async () => {
      await messaging.cleanup();

      expect(mockRedis.quit).toHaveBeenCalledTimes(3); // Main, subscriber, publisher
    });
  });

  describe('Progress Tracker Integration', () => {
    it('should provide access to progress tracker', () => {
      const progressTracker = messaging.getProgressTracker();
      expect(progressTracker).toBeDefined();
    });

    it('should get agent visibility through progress tracker', async () => {
      await messaging.getAgentVisibility('agent-1');
      
      const progressTracker = messaging.getProgressTracker();
      expect(progressTracker.getAgentVisibility).toHaveBeenCalledWith('agent-1');
    });

    it('should get swarm overview through progress tracker', async () => {
      await messaging.getSwarmOverview();
      
      const progressTracker = messaging.getProgressTracker();
      expect(progressTracker.getSwarmOverview).toHaveBeenCalledWith('swarm-1');
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      mockRedis.connect.mockRejectedValue(new Error('Connection failed'));

      const faultyMessaging = new RedisMessagingInfrastructure(
        'agent-1',
        'swarm-1'
      );

      await expect(faultyMessaging.initialize()).rejects.toThrow('Connection failed');
    });

    it('should handle Redis errors during message sending', async () => {
      mockRedis.publish.mockRejectedValue(new Error('Redis error'));

      await expect(
        messaging.sendMessage('test', { data: 'test' })
      ).rejects.toThrow('Redis error');
    });
  });
});