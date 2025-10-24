/**
 * Enhanced Progress Tracker Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EnhancedProgressTracker } from '../enhanced-progress-tracker.js';

// Mock Redis client
const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  setex: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  publish: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  subscribe: jest.fn().mockResolvedValue(undefined)
};

// Mock the redis module
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis)
}));

describe('EnhancedProgressTracker', () => {
  let tracker: EnhancedProgressTracker;

  beforeEach(async () => { try {
    // Reset all mocks
    jest.clearAllMocks();
    
    tracker = new EnhancedProgressTracker('redis://localhost:6379', {
      level: 'error',
      format: 'json',
      destination: 'console'
    }, 'test-secret');
    
    await tracker.initialize();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    await tracker.cleanup();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Task Progress Management', () => {
    it('should create task progress with steps', async () => { try {
      const steps = [
        { name: 'Step 1', description: 'First step' },
        { name: 'Step 2', description: 'Second step' }
      ];

      await tracker.createTaskProgress(
        'task-1',
        'agent-1',
        'swarm-1',
        'test-task',
        'Test task description',
        steps
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'task:progress:task-1',
        86400,
        expect.stringContaining('"taskId":"task-1"')
      );

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'progress:updates',
        expect.stringContaining('"type":"progress_update"')
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should update task progress', async () => { try {
      const steps = [
        { name: 'Step 1', description: 'First step' },
        { name: 'Step 2', description: 'Second step' }
      ];

      await tracker.createTaskProgress(
        'task-1',
        'agent-1',
        'swarm-1',
        'test-task',
        'Test task description',
        steps
      );

      await tracker.updateTaskProgress('task-1', {
        stepId: 'step-1',
        status: 'in_progress',
        progressPercentage: 25,
        confidence: 0.7
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'task:progress:task-1',
        86400,
        expect.stringMatching(/"status":"in_progress"/)
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle task completion', async () => { try {
      const steps = [
        { name: 'Step 1', description: 'First step' }
      ];

      await tracker.createTaskProgress(
        'task-1',
        'agent-1',
        'swarm-1',
        'test-task',
        'Test task description',
        steps
      );

      await tracker.completeTask('task-1', ['output.js']);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'task:progress:task-1',
        86400,
        expect.stringContaining('"overallStatus":"completed"')
      );

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'progress:updates',
        expect.stringContaining('"type":"task_complete"')
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle task failure', async () => { try {
      const steps = [
        { name: 'Step 1', description: 'First step' }
      ];

      await tracker.createTaskProgress(
        'task-1',
        'agent-1',
        'swarm-1',
        'test-task',
        'Test task description',
        steps
      );

      await tracker.failTask('task-1', 'Test error');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'task:progress:task-1',
        86400,
        expect.stringContaining('"overallStatus":"failed"')
      );

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'progress:updates',
        expect.stringContaining('"type":"task_failed"')
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should add sub-steps to existing steps', async () => { try {
      const steps = [
        { name: 'Step 1', description: 'First step' }
      ];

      await tracker.createTaskProgress(
        'task-1',
        'agent-1',
        'swarm-1',
        'test-task',
        'Test task description',
        steps
      );

      const subSteps = [
        { name: 'Sub-step 1', description: 'First sub-step' },
        { name: 'Sub-step 2', description: 'Second sub-step' }
      ];

      await tracker.addSubSteps('task-1', 'step-1', subSteps);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'task:progress:task-1',
        86400,
        expect.stringMatching(/"subSteps":\[.*"step-1-sub-1".*"step-1-sub-2"/s)
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Agent Visibility', () => {
    it('should update agent visibility', async () => { try {
      await tracker.updateAgentVisibility('agent-1', {
        agentType: 'coder',
        status: 'active',
        capabilities: ['typescript', 'nodejs']
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'agent:visibility:agent-1',
        3600,
        expect.stringContaining('"agentType":"coder"')
      );

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'agent:visibility',
        expect.stringContaining('"type":"visibility_update"')
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Swarm Overview', () => {
    it('should calculate swarm overview', async () => { try {
      // Create multiple tasks for different agents
      await tracker.createTaskProgress(
        'task-1',
        'agent-1',
        'swarm-1',
        'test-task',
        'Test task 1',
        [{ name: 'Step 1', description: 'First step' }]
      );

      await tracker.createTaskProgress(
        'task-2',
        'agent-2',
        'swarm-1',
        'test-task',
        'Test task 2',
        [{ name: 'Step 1', description: 'First step' }]
      );

      await tracker.updateAgentVisibility('agent-1', {
        agentType: 'coder',
        status: 'active'
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await tracker.updateAgentVisibility('agent-2', {
        agentType: 'researcher',
        status: 'active'
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const overview = await tracker.getSwarmOverview('swarm-1');
      expect(overview).toBeDefined();
      expect(overview?.swarmId).toBe('swarm-1');
      expect(overview?.totalAgents).toBe(2);
      expect(overview?.activeAgents).toBe(2);
      expect(overview?.totalTasks).toBe(2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Progress Subscriptions', () => {
    it('should subscribe to progress updates', async () => { try {
      const updates: any[] = [];
      
      await tracker.subscribeToProgress(
        { agentIds: ['agent-1'] },
        (message) => updates.push(message)
      );

      expect(mockRedis.subscribe).toHaveBeenCalledWith(
        'progress:updates',
        expect.any(Function)
      );

      await tracker.createTaskProgress(
        'task-1',
        'agent-1',
        'swarm-1',
        'test-task',
        'Test task description',
        [{ name: 'Step 1', description: 'First step' }]
      );

      // Verify publish was called
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'progress:updates',
        expect.stringContaining('"agentId":"agent-1"')
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Error Handling', () => {
    it('should handle updates to non-existent tasks', async () => { try {
      await expect(
        tracker.updateTaskProgress('non-existent', { progressPercentage: 50 })
      ).rejects.toThrow('Task progress not found: non-existent');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle Redis connection errors gracefully', async () => { try {
      mockRedis.connect.mockRejectedValue(new Error('Connection failed'));

      const faultyTracker = new EnhancedProgressTracker('redis://localhost:6379', {
        level: 'error',
        format: 'json',
        destination: 'console'
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await expect(faultyTracker.initialize()).rejects.toThrow('Connection failed');
      
      await faultyTracker.cleanup();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Message Authentication', () => {
    it('should generate HMAC signatures for messages', async () => { try {
      await tracker.createTaskProgress(
        'task-1',
        'agent-1',
        'swarm-1',
        'test-task',
        'Test task description',
        [{ name: 'Step 1', description: 'First step' }]
      );

      // Verify that publish was called with a signed message
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'progress:updates',
        expect.stringMatching(/"signature":"[a-f0-9]+"/)
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Active Tasks Management', () => {
    it('should get active tasks for agent', async () => { try {
      await tracker.createTaskProgress(
        'task-1',
        'agent-1',
        'swarm-1',
        'test-task',
        'Test task description',
        [{ name: 'Step 1', description: 'First step' }]
      );

      await tracker.updateTaskProgress('task-1', {
        status: 'in_progress'
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const activeTasks = await tracker.getActiveTasks('agent-1');
      expect(activeTasks).toHaveLength(1);
      expect(activeTasks[0].taskId).toBe('task-1');
      expect(activeTasks[0].overallStatus).toBe('in_progress');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});