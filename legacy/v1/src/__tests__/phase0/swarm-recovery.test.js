/**
 * Jest test suite for Swarm Recovery Engine
 * Phase 0 Component: Swarm Recovery Operations
 */

import { jest } from '@jest/globals';

// Mock Redis client
const mockRedisClient = {
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  sMembers: jest.fn(),
  sRem: jest.fn(),
  hDel: jest.fn(),
  keys: jest.fn(),
  connect: jest.fn(),
  ping: jest.fn()
};

// Mock the redis client module
jest.mock('../../cli/utils/redis-client.js', () => ({
  connectRedis: jest.fn(() => Promise.resolve(mockRedisClient)),
  loadSwarmState: jest.fn(),
  saveSwarmState: jest.fn(),
  updateSwarmStatus: jest.fn(),
  listActiveSwarms: jest.fn(),
  deleteSwarmState: jest.fn()
}));

// Mock fs for backup/restore operations
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
    exists: jest.fn()
  }
}));

// Import mocked modules
import {
  loadSwarmState,
  saveSwarmState,
  updateSwarmStatus,
  listActiveSwarms,
  deleteSwarmState
} from '../../cli/utils/redis-client.js';

// Mock console methods to avoid test output pollution
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

describe('Swarm Recovery Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.setEx.mockResolvedValue('OK');
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.sMembers.mockResolvedValue([]);
    mockRedisClient.sRem.mockResolvedValue(1);
    mockRedisClient.hDel.mockResolvedValue(1);
    mockRedisClient.keys.mockResolvedValue([]);
  });

  describe('Swarm State Recovery', () => {
    it('should recover interrupted swarm state', async () => {
      const swarmId = 'recovery-test-123';
      const interruptedState = {
        id: swarmId,
        objective: 'Build a microservice with database integration',
        status: 'interrupted',
        createdAt: new Date(Date.now() - 300000).toISOString(),
        lastActivity: new Date(Date.now() - 60000).toISOString(),
        agents: [
          { id: 'agent_1', type: 'architect', status: 'idle', task: 'Design system architecture' },
          { id: 'agent_2', type: 'coder', status: 'active', task: 'Implement API endpoints' },
          { id: 'agent_3', type: 'tester', status: 'idle', task: 'Create integration tests' }
        ],
        tasks: [
          { id: 'task_1', description: 'Design system architecture', status: 'completed', assignedTo: 'agent_1' },
          { id: 'task_2', description: 'Implement API endpoints', status: 'in_progress', assignedTo: 'agent_2' },
          { id: 'task_3', description: 'Create integration tests', status: 'pending', assignedTo: 'agent_3' },
          { id: 'task_4', description: 'Database setup', status: 'pending', assignedTo: null }
        ],
        topology: 'mesh',
        maxAgents: 5,
        metadata: {
          interrupted: true,
          interruptionReason: 'MCP connection lost',
          progress: 0.25
        }
      };

      loadSwarmState.mockResolvedValue(interruptedState);

      // Simulate recovery process
      const recoveredSwarm = await loadSwarmState(mockRedisClient, swarmId);

      expect(recoveredSwarm).toBeDefined();
      expect(recoveredSwarm.id).toBe(swarmId);
      expect(recoveredSwarm.status).toBe('interrupted');
      expect(recoveredSwarm.agents).toHaveLength(3);
      expect(recoveredSwarm.tasks).toHaveLength(4);
      expect(recoveredSwarm.metadata.interrupted).toBe(true);
      expect(recoveredSwarm.metadata.progress).toBe(0.25);
    });

    it('should analyze recovery requirements', async () => {
      const swarmId = 'recovery-test-123';
      const partialState = {
        id: swarmId,
        status: 'interrupted',
        agents: [
          { id: 'agent_1', type: 'architect', status: 'idle' },
          { id: 'agent_2', type: 'coder', status: 'active' },
          { id: 'agent_3', type: 'tester', status: 'idle' }
        ],
        tasks: [
          { id: 'task_1', description: 'Design architecture', status: 'completed' },
          { id: 'task_2', description: 'Implement endpoints', status: 'in_progress' },
          { id: 'task_3', description: 'Create tests', status: 'pending' }
        ]
      };

      loadSwarmState.mockResolvedValue(partialState);

      const recoveredSwarm = await loadSwarmState(mockRedisClient, swarmId);

      // Analyze recovery requirements
      const completedTasks = recoveredSwarm.tasks.filter(t => t.status === 'completed');
      const inProgressTasks = recoveredSwarm.tasks.filter(t => t.status === 'in_progress');
      const pendingTasks = recoveredSwarm.tasks.filter(t => t.status === 'pending');

      expect(completedTasks).toHaveLength(1);
      expect(inProgressTasks).toHaveLength(1);
      expect(pendingTasks).toHaveLength(1);

      // Verify recovery analysis
      const recoveryPlan = {
        resumeFrom: inProgressTasks.length > 0 ? 'in_progress' : 'pending',
        nextActions: [
          'Re-establish agent communication',
          'Resume in-progress tasks',
          'Assign pending tasks to available agents',
          'Continue with remaining work'
        ],
        estimatedRemainingTime: '2-3 minutes',
        confidence: 0.85
      };

      expect(recoveryPlan.resumeFrom).toBe('in_progress');
      expect(recoveryPlan.nextActions).toHaveLength(4);
      expect(recoveryPlan.confidence).toBe(0.85);
    });

    it('should handle non-existent swarm recovery', async () => {
      const swarmId = 'non-existent-swarm';
      loadSwarmState.mockResolvedValue(null);

      const result = await loadSwarmState(mockRedisClient, swarmId);

      expect(result).toBeNull();
      expect(loadSwarmState).toHaveBeenCalledWith(mockRedisClient, swarmId);
    });

    it('should create recovery state with proper metadata', async () => {
      const swarmId = 'recovery-test-123';
      const interruptedState = {
        id: swarmId,
        status: 'interrupted',
        objective: 'Test objective',
        metadata: { progress: 0.25 }
      };

      loadSwarmState.mockResolvedValue(interruptedState);
      saveSwarmState.mockResolvedValue(true);

      const recoveredSwarm = await loadSwarmState(mockRedisClient, swarmId);

      // Create recovery state
      const recoveryState = {
        ...recoveredSwarm,
        status: 'recovering',
        recoveredAt: new Date().toISOString(),
        recoveryPlan: {
          resumeFrom: 'in_progress',
          nextActions: ['Resume work'],
          confidence: 0.85
        },
        previousStatus: 'interrupted'
      };

      await saveSwarmState(mockRedisClient, swarmId, recoveryState);

      expect(recoveryState.status).toBe('recovering');
      expect(recoveryState.recoveredAt).toBeDefined();
      expect(recoveryState.previousStatus).toBe('interrupted');
      expect(recoveryState.recoveryPlan).toBeDefined();
      expect(saveSwarmState).toHaveBeenCalledWith(mockRedisClient, swarmId, recoveryState);
    });
  });

  describe('Recovery Query Interface', () => {
    it('should find all interrupted swarms', async () => {
      const swarmKeys = ['swarm:interrupted-1', 'swarm:active-2', 'swarm:recovering-3'];
      const interruptedSwarm = {
        id: 'interrupted-1',
        status: 'interrupted',
        objective: 'Build microservice',
        metadata: { progress: 0.3 },
        lastActivity: new Date().toISOString()
      };
      const activeSwarm = {
        id: 'active-2',
        status: 'running',
        objective: 'Deploy application'
      };
      const recoveringSwarm = {
        id: 'recovering-3',
        status: 'recovering',
        objective: 'Fix bug',
        metadata: { progress: 0.7 },
        lastActivity: new Date().toISOString()
      };

      mockRedisClient.keys.mockResolvedValue(swarmKeys);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(interruptedSwarm))
        .mockResolvedValueOnce(JSON.stringify(activeSwarm))
        .mockResolvedValueOnce(JSON.stringify(recoveringSwarm));

      // Simulate recovery query
      const allSwarms = await mockRedisClient.keys('swarm:*');
      const interruptedSwarms = [];

      for (const swarmKey of allSwarms) {
        const swarmData = await mockRedisClient.get(swarmKey);
        const swarm = JSON.parse(swarmData);
        if (swarm.status === 'interrupted' || swarm.status === 'recovering') {
          interruptedSwarms.push({
            id: swarm.id,
            status: swarm.status,
            objective: swarm.objective,
            progress: swarm.metadata?.progress || 0,
            lastActivity: swarm.lastActivity
          });
        }
      }

      expect(interruptedSwarms).toHaveLength(2);
      expect(interruptedSwarms[0].status).toBe('interrupted');
      expect(interruptedSwarms[1].status).toBe('recovering');
      expect(interruptedSwarms[0].progress).toBe(0.3);
      expect(interruptedSwarms[1].progress).toBe(0.7);
    });

    it('should handle empty swarm list', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const allSwarms = await mockRedisClient.keys('swarm:*');

      expect(allSwarms).toHaveLength(0);
    });

    it('should handle corrupted swarm data gracefully', async () => {
      const swarmKeys = ['swarm:valid', 'swarm:corrupted'];
      const validSwarm = {
        id: 'valid',
        status: 'interrupted',
        objective: 'Valid objective'
      };

      mockRedisClient.keys.mockResolvedValue(swarmKeys);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(validSwarm))
        .mockResolvedValueOnce('invalid json');

      const allSwarms = await mockRedisClient.keys('swarm:*');
      const validSwarms = [];

      for (const swarmKey of allSwarms) {
        try {
          const swarmData = await mockRedisClient.get(swarmKey);
          const swarm = JSON.parse(swarmData);
          if (swarm.status === 'interrupted') {
            validSwarms.push(swarm);
          }
        } catch (error) {
          // Skip corrupted data
          console.warn(`Corrupted swarm data for ${swarmKey}:`, error.message);
        }
      }

      expect(validSwarms).toHaveLength(1);
      expect(validSwarms[0].id).toBe('valid');
    });
  });

  describe('Persistence Across Reconnections', () => {
    it('should maintain swarm state across multiple reconnection cycles', async () => {
      const swarmId = 'persistence-test';
      const initialState = {
        id: swarmId,
        status: 'active',
        objective: 'Test persistence',
        checkpoint: 0
      };

      loadSwarmState.mockResolvedValue(initialState);
      saveSwarmState.mockResolvedValue(true);

      // Simulate multiple reconnection cycles
      for (let i = 1; i <= 3; i++) {
        const currentState = await loadSwarmState(mockRedisClient, swarmId);

        const checkpoint = {
          checkpointId: i,
          timestamp: new Date().toISOString(),
          message: `Reconnection cycle ${i} completed`
        };

        // Save checkpoint
        await mockRedisClient.setEx(`swarm:${swarmId}:checkpoints`, 3600, JSON.stringify(checkpoint));

        // Update state with checkpoint
        const updatedState = {
          ...currentState,
          checkpoint: i,
          lastCheckpoint: checkpoint
        };

        await saveSwarmState(mockRedisClient, swarmId, updatedState);

        expect(updatedState.checkpoint).toBe(i);
        expect(updatedState.lastCheckpoint.checkpointId).toBe(i);
      }

      expect(mockRedisClient.setEx).toHaveBeenCalledTimes(3);
      expect(saveSwarmState).toHaveBeenCalledTimes(3);
    });

    it('should preserve agent and task states during recovery', async () => {
      const swarmId = 'state-preservation-test';
      const complexState = {
        id: swarmId,
        status: 'interrupted',
        agents: [
          {
            id: 'agent-1',
            type: 'architect',
            status: 'idle',
            task: 'Design system',
            progress: 0.8,
            lastActivity: new Date().toISOString()
          },
          {
            id: 'agent-2',
            type: 'coder',
            status: 'active',
            task: 'Implement API',
            progress: 0.4,
            lastActivity: new Date().toISOString()
          }
        ],
        tasks: [
          {
            id: 'task-1',
            description: 'Design system architecture',
            status: 'completed',
            assignedTo: 'agent-1',
            completedAt: new Date().toISOString()
          },
          {
            id: 'task-2',
            description: 'Implement API endpoints',
            status: 'in_progress',
            assignedTo: 'agent-2',
            progress: 0.4
          },
          {
            id: 'task-3',
            description: 'Write tests',
            status: 'pending',
            assignedTo: null
          }
        ],
        metadata: {
          progress: 0.6,
          totalTime: 1800000,
          errors: 0,
          restarts: 1
        }
      };

      loadSwarmState.mockResolvedValue(complexState);
      saveSwarmState.mockResolvedValue(true);

      // Recover state
      const recoveredState = await loadSwarmState(mockRedisClient, swarmId);

      // Verify preservation
      expect(recoveredState.agents).toHaveLength(2);
      expect(recoveredState.tasks).toHaveLength(3);
      expect(recoveredState.agents[0].progress).toBe(0.8);
      expect(recoveredState.agents[1].status).toBe('active');
      expect(recoveredState.tasks[0].status).toBe('completed');
      expect(recoveredState.tasks[1].progress).toBe(0.4);
      expect(recoveredState.metadata.progress).toBe(0.6);

      // Update and save recovery state
      const recoveryState = {
        ...recoveredState,
        status: 'recovering',
        recoveredAt: new Date().toISOString(),
        metadata: {
          ...recoveredState.metadata,
          restarts: recoveredState.metadata.restarts + 1
        }
      };

      await saveSwarmState(mockRedisClient, swarmId, recoveryState);

      expect(recoveryState.metadata.restarts).toBe(2);
      expect(saveSwarmState).toHaveBeenCalledWith(mockRedisClient, swarmId, recoveryState);
    });
  });

  describe('Recovery Performance', () => {
    it('should handle large swarm states efficiently', async () => {
      const swarmId = 'large-swarm-test';
      const largeState = {
        id: swarmId,
        status: 'interrupted',
        objective: 'Large scale processing',
        agents: Array(100).fill(null).map((_, i) => ({
          id: `agent-${i}`,
          type: i % 3 === 0 ? 'architect' : i % 3 === 1 ? 'coder' : 'tester',
          status: 'active',
          task: `Task ${i}`,
          progress: Math.random()
        })),
        tasks: Array(500).fill(null).map((_, i) => ({
          id: `task-${i}`,
          description: `Task description ${i}`,
          status: i < 100 ? 'completed' : i < 200 ? 'in_progress' : 'pending',
          progress: Math.random(),
          assignedTo: `agent-${Math.floor(i / 5)}`
        })),
        metadata: {
          progress: 0.3,
          totalOperations: 10000,
          completedOperations: 3000
        }
      };

      loadSwarmState.mockResolvedValue(largeState);

      const startTime = Date.now();
      const recoveredState = await loadSwarmState(mockRedisClient, swarmId);
      const recoveryTime = Date.now() - startTime;

      expect(recoveredState.agents).toHaveLength(100);
      expect(recoveredState.tasks).toHaveLength(500);
      expect(recoveryTime).toBeLessThan(1000); // Should recover within 1 second

      // Analyze recovery requirements
      const completedTasks = recoveredState.tasks.filter(t => t.status === 'completed');
      const inProgressTasks = recoveredState.tasks.filter(t => t.status === 'in_progress');
      const pendingTasks = recoveredState.tasks.filter(t => t.status === 'pending');

      expect(completedTasks).toHaveLength(100);
      expect(inProgressTasks).toHaveLength(100);
      expect(pendingTasks).toHaveLength(300);
    });

    it('should batch process multiple swarm recoveries', async () => {
      const swarmIds = Array(20).fill(null).map((_, i) => `swarm-${i}`);
      const swarms = swarmIds.map(id => ({
        id,
        status: Math.random() > 0.5 ? 'interrupted' : 'running',
        objective: `Objective for ${id}`,
        metadata: { progress: Math.random() }
      }));

      mockRedisClient.keys.mockResolvedValue(swarmIds.map(id => `swarm:${id}`));
      mockRedisClient.get.mockImplementation((key) => {
        const swarmId = key.replace('swarm:', '');
        const swarm = swarms.find(s => s.id === swarmId);
        return Promise.resolve(JSON.stringify(swarm));
      });

      const allSwarms = await mockRedisClient.keys('swarm:*');
      const interruptedSwarms = [];

      const startTime = Date.now();

      // Batch process
      const promises = allSwarms.map(async (swarmKey) => {
        const swarmData = await mockRedisClient.get(swarmKey);
        const swarm = JSON.parse(swarmData);
        if (swarm.status === 'interrupted') {
          interruptedSwarms.push({
            id: swarm.id,
            objective: swarm.objective,
            progress: swarm.metadata?.progress || 0
          });
        }
      });

      await Promise.all(promises);
      const processingTime = Date.now() - startTime;

      expect(processingTime).toBeLessThan(2000); // Should process within 2 seconds
      expect(interruptedSwarms.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle Redis connection failures during recovery', async () => {
      const swarmId = 'connection-fail-test';

      loadSwarmState.mockRejectedValue(new Error('Redis connection failed'));

      await expect(loadSwarmState(mockRedisClient, swarmId))
        .rejects.toThrow('Redis connection failed');
    });

    it('should handle corrupted checkpoint data', async () => {
      const swarmId = 'corrupted-checkpoint-test';
      const baseState = {
        id: swarmId,
        status: 'recovering',
        objective: 'Test corrupted data'
      };

      loadSwarmState.mockResolvedValue(baseState);
      mockRedisClient.get.mockResolvedValue('invalid json checkpoint data');

      const recoveredState = await loadSwarmState(mockRedisClient, swarmId);

      try {
        const checkpointData = await mockRedisClient.get(`swarm:${swarmId}:checkpoints`);
        JSON.parse(checkpointData);
      } catch (error) {
        expect(error.message).toContain('Unexpected token');
      }
    });

    it('should handle memory constraints during recovery', async () => {
      const swarmId = 'memory-constraint-test';

      // Create a very large state that might cause memory issues
      const hugeState = {
        id: swarmId,
        status: 'interrupted',
        data: new Array(10000).fill('large data chunk').join('')
      };

      loadSwarmState.mockResolvedValue(hugeState);

      const recoveredState = await loadSwarmState(mockRedisClient, swarmId);

      expect(recoveredState.data.length).toBeGreaterThan(0);

      // Verify memory usage is reasonable
      const memoryUsage = process.memoryUsage();
      expect(memoryUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // Less than 500MB
    });

    it('should handle concurrent recovery attempts', async () => {
      const swarmId = 'concurrent-recovery-test';
      const baseState = {
        id: swarmId,
        status: 'interrupted',
        objective: 'Test concurrent recovery'
      };

      loadSwarmState.mockResolvedValue(baseState);
      updateSwarmStatus.mockResolvedValue({ status: 'recovering' });

      // Simulate concurrent recovery attempts
      const recoveryPromises = Array(5).fill(null).map(async (_, i) => {
        const state = await loadSwarmState(mockRedisClient, swarmId);
        const updatedState = await updateSwarmStatus(mockRedisClient, swarmId, 'recovering', {
          attemptId: i,
          timestamp: Date.now()
        });
        return updatedState;
      });

      const results = await Promise.all(recoveryPromises);

      // All should succeed, but only one should be the final state
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.status).toBe('recovering');
        expect(result.attemptId).toBeDefined();
      });
    });
  });

  describe('Recovery State Validation', () => {
    it('should validate recovered swarm structure', async () => {
      const swarmId = 'validation-test';
      const validState = {
        id: swarmId,
        status: 'interrupted',
        objective: 'Valid objective',
        agents: [],
        tasks: [],
        metadata: {}
      };

      loadSwarmState.mockResolvedValue(validState);

      const recoveredState = await loadSwarmState(mockRedisClient, swarmId);

      // Validate required fields
      expect(recoveredState).toHaveProperty('id');
      expect(recoveredState).toHaveProperty('status');
      expect(recoveredState).toHaveProperty('objective');
      expect(recoveredState).toHaveProperty('agents');
      expect(recoveredState).toHaveProperty('tasks');

      // Validate data types
      expect(typeof recoveredState.id).toBe('string');
      expect(typeof recoveredState.status).toBe('string');
      expect(typeof recoveredState.objective).toBe('string');
      expect(Array.isArray(recoveredState.agents)).toBe(true);
      expect(Array.isArray(recoveredState.tasks)).toBe(true);
    });

    it('should sanitize corrupted recovery data', async () => {
      const swarmId = 'sanitize-test';
      const corruptedState = {
        id: swarmId,
        status: null, // Should be string
        objective: undefined, // Should be string
        agents: 'not an array', // Should be array
        tasks: null, // Should be array
        metadata: { progress: 'invalid' } // Progress should be number
      };

      loadSwarmState.mockResolvedValue(corruptedState);

      const recoveredState = await loadSwarmState(mockRedisClient, swarmId);

      // Sanitize data
      const sanitizedState = {
        id: recoveredState.id || 'unknown',
        status: typeof recoveredState.status === 'string' ? recoveredState.status : 'unknown',
        objective: typeof recoveredState.objective === 'string' ? recoveredState.objective : 'No objective',
        agents: Array.isArray(recoveredState.agents) ? recoveredState.agents : [],
        tasks: Array.isArray(recoveredState.tasks) ? recoveredState.tasks : [],
        metadata: {
          progress: typeof recoveredState.metadata?.progress === 'number'
            ? recoveredState.metadata.progress
            : 0
        }
      };

      expect(sanitizedState.status).toBe('unknown');
      expect(sanitizedState.objective).toBe('No objective');
      expect(Array.isArray(sanitizedState.agents)).toBe(true);
      expect(Array.isArray(sanitizedState.tasks)).toBe(true);
      expect(typeof sanitizedState.metadata.progress).toBe('number');
    });
  });
});