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

  beforeEach(async () => { try {
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
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    await messaging.cleanup();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Initialization', () => {
    it('should initialize all Redis connections', async () => { try {
      expect(mockRedis.connect).toHaveBeenCalledTimes(3); // Main, subscriber, publisher
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should start heartbeat on initialization', async () => { try {
      // Wait a bit for heartbeat to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Heartbeat should be publishing periodically
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'swarm:swarm-1:heartbeat',
        expect.any(String)
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Message Sending', () => {
    it('should send message to specific agent', async () => { try {
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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should broadcast message to swarm', async () => { try {
      const messageId = await messaging.sendMessage(
        'agent_status',
        { status: 'active' }
      );

      expect(messageId).toBeDefined();
      
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'swarm:swarm-1:broadcast',
        expect.stringContaining('"type":"agent_status"')
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should send task assignment with priority', async () => { try {
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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should send coordination request', async () => { try {
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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should send coordination response', async () => { try {
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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Message Subscriptions', () => {
    it('should subscribe to messages from specific agents', async () => { try {
      const messages: any[] = [];
      
      await messaging.subscribe(
        { fromAgents: ['agent-2'] },
        (message) => messages.push(message)
      );

      expect(mockRedis.subscribe).toHaveBeenCalledWith(
        'agent:agent-2:messages',
        expect.any(Function)
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should subscribe to specific message types', async () => { try {
      const messages: any[] = [];
      
      await messaging.subscribe(
        { messageTypes: ['task_assignment', 'coordination_request'] },
        (message) => messages.push(message)
      );

      expect(mockRedis.subscribe).toHaveBeenCalledWith(
        'agent:agent-1:messages',
        expect.any(Function)
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should filter messages by priority', async () => { try {
      const messages: any[] = [];
      
      await messaging.subscribe(
        { priority: ['high', 'critical'] },
        (message) => messages.push(message)
      );

      expect(mockRedis.subscribe).toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Agent Status Management', () => {
    it('should broadcast agent status', async () => { try {
      await messaging.broadcastStatus('active', { workingOn: 'task-1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'swarm:swarm-1:broadcast',
        expect.stringContaining('"type":"agent_status"')
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should update agent visibility', async () => { try {
      await messaging.updateAgentVisibility({
        status: 'working',
        currentLoad: 0.7
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Should call progress tracker update
      const progressTracker = messaging.getProgressTracker();
      expect(progressTracker.updateAgentVisibility).toHaveBeenCalledWith(
        'agent-1',
        {
          status: 'working',
          currentLoad: 0.7
        }
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Message History', () => {
    it('should get message history for agent', async () => { try {
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
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('msg-1');
      expect(history[0].type).toBe('task_assignment');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should filter message history by type', async () => { try {
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
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const history = await messaging.getMessageHistory({
        messageTypes: ['task_assignment'],
        limit: 10
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('task_assignment');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should filter message history by time range', async () => { try {
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
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(history).toHaveLength(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Message Validation', () => {
    it('should validate message size', async () => { try {
      const largePayload = 'x'.repeat(2000000); // 2MB payload
      
      await expect(
        messaging.sendMessage('test', { data: largePayload })
      ).rejects.toThrow('Message size');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should apply rate limiting', async () => { try {
      // Send many messages quickly to trigger rate limit
      const promises = [];
      for (let i = 0; i < 150; i++) {
        promises.push(messaging.sendMessage('test', { index: i }));
      }

      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected');
      
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0].status).toBe('rejected');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Message Authentication', () => {
    it('should sign messages with HMAC', async () => { try {
      await messaging.sendMessage('test', { data: 'test' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const publishCall = mockRedis.publish.mock.calls.find(call => 
        call[1].includes('"type":"test"')
      );

      expect(publishCall[1]).toMatch(/"signature":"[a-f0-9]+"/);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Cleanup', () => {
    it('should send shutdown message on cleanup', async () => { try {
      await messaging.cleanup();

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'swarm:swarm-1:broadcast',
        expect.stringContaining('"type":"shutdown"')
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should cleanup all resources', async () => { try {
      await messaging.cleanup();

      expect(mockRedis.quit).toHaveBeenCalledTimes(3); // Main, subscriber, publisher
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Progress Tracker Integration', () => {
    it('should provide access to progress tracker', () => {
      const progressTracker = messaging.getProgressTracker();
      expect(progressTracker).toBeDefined();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should get agent visibility through progress tracker', async () => { try {
      await messaging.getAgentVisibility('agent-1');
      
      const progressTracker = messaging.getProgressTracker();
      expect(progressTracker.getAgentVisibility).toHaveBeenCalledWith('agent-1');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should get swarm overview through progress tracker', async () => { try {
      await messaging.getSwarmOverview();
      
      const progressTracker = messaging.getProgressTracker();
      expect(progressTracker.getSwarmOverview).toHaveBeenCalledWith('swarm-1');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => { try {
      mockRedis.connect.mockRejectedValue(new Error('Connection failed'));

      const faultyMessaging = new RedisMessagingInfrastructure(
        'agent-1',
        'swarm-1'
      );

      await expect(faultyMessaging.initialize()).rejects.toThrow('Connection failed');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle Redis errors during message sending', async () => { try {
      mockRedis.publish.mockRejectedValue(new Error('Redis error'));

      await expect(
        messaging.sendMessage('test', { data: 'test' })
      ).rejects.toThrow('Redis error');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});