/**
 * Jest test suite for Redis Client Operations
 * Phase 0 Component: Redis Swarm State Management
 */

import { jest } from '@jest/globals';
import {
  connectRedis,
  saveSwarmState,
  loadSwarmState,
  listActiveSwarms,
  deleteSwarmState,
  updateSwarmStatus,
  getSwarmMetrics,
  cleanupExpiredSwarms,
  backupSwarmStates,
  restoreSwarmStates,
  checkRedisHealth
} from '../../cli/utils/redis-client.js';

// Mock Redis client
const mockRedisClient = {
  on: jest.fn(),
  connect: jest.fn(),
  ping: jest.fn(),
  setEx: jest.fn(),
  sAdd: jest.fn(),
  hSet: jest.fn(),
  get: jest.fn(),
  sMembers: jest.fn(),
  sRem: jest.fn(),
  hDel: jest.fn(),
  del: jest.fn(),
  info: jest.fn(),
  quit: jest.fn()
};

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn()
  }
}));

// Mock redis createClient
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

describe('Redis Client Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.connect.mockResolvedValue();
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedisClient.setEx.mockResolvedValue('OK');
    mockRedisClient.sAdd.mockResolvedValue(1);
    mockRedisClient.hSet.mockResolvedValue(1);
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.sMembers.mockResolvedValue([]);
    mockRedisClient.sRem.mockResolvedValue(1);
    mockRedisClient.hDel.mockResolvedValue(1);
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.info.mockResolvedValue('used_memory_human:1.5M\nconnected_clients:2\nuptime_in_seconds:3600');
  });

  describe('connectRedis', () => {
    it('should connect to Redis with default configuration', async () => {
      const client = await connectRedis();

      expect(client).toBeDefined();
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockRedisClient.ping).toHaveBeenCalled();
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('end', expect.any(Function));
    });

    it('should connect to Redis with custom configuration', async () => {
      const config = {
        host: 'redis.example.com',
        port: 6380,
        password: 'secret123',
        database: 1,
        connectTimeout: 5000
      };

      await connectRedis(config);

      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should throw error on connection failure', async () => {
      mockRedisClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(connectRedis()).rejects.toThrow('Failed to connect to Redis: Connection failed');
    });

    it('should throw error on ping failure', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Ping failed'));

      await expect(connectRedis()).rejects.toThrow('Failed to connect to Redis: Ping failed');
    });
  });

  describe('saveSwarmState', () => {
    it('should save swarm state successfully', async () => {
      const swarmId = 'test-swarm-123';
      const state = {
        id: swarmId,
        objective: 'Test objective',
        status: 'running',
        startTime: Date.now(),
        agents: [],
        tasks: []
      };

      const result = await saveSwarmState(mockRedisClient, swarmId, state);

      expect(result).toBe(true);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        `swarm:${swarmId}`,
        86400,
        expect.stringContaining('"id":"test-swarm-123"')
      );
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('swarms:active', swarmId);
      expect(mockRedisClient.hSet).toHaveBeenCalledWith(
        'swarms:index',
        swarmId,
        expect.stringContaining('"id":"test-swarm-123"')
      );
    });

    it('should include lastUpdated timestamp', async () => {
      const swarmId = 'test-swarm-123';
      const state = {
        id: swarmId,
        objective: 'Test objective',
        status: 'running'
      };

      await saveSwarmState(mockRedisClient, swarmId, state);

      const savedData = JSON.parse(mockRedisClient.setEx.mock.calls[0][1]);
      expect(savedData.lastUpdated).toBeDefined();
      expect(typeof savedData.lastUpdated).toBe('number');
    });

    it('should throw error on save failure', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('Save failed'));

      await expect(saveSwarmState(mockRedisClient, 'test', {}))
        .rejects.toThrow('Failed to save swarm state: Save failed');
    });
  });

  describe('loadSwarmState', () => {
    it('should load existing swarm state', async () => {
      const swarmId = 'test-swarm-123';
      const stateData = {
        id: swarmId,
        objective: 'Test objective',
        status: 'running'
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(stateData));

      const result = await loadSwarmState(mockRedisClient, swarmId);

      expect(result).toEqual(stateData);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`swarm:${swarmId}`);
    });

    it('should return null for non-existent swarm', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await loadSwarmState(mockRedisClient, 'non-existent');

      expect(result).toBeNull();
    });

    it('should throw error on load failure', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Load failed'));

      await expect(loadSwarmState(mockRedisClient, 'test'))
        .rejects.toThrow('Failed to load swarm state: Load failed');
    });

    it('should throw error for invalid JSON', async () => {
      mockRedisClient.get.mockResolvedValue('invalid json');

      await expect(loadSwarmState(mockRedisClient, 'test'))
        .rejects.toThrow('Failed to load swarm state:');
    });
  });

  describe('listActiveSwarms', () => {
    it('should list active swarms', async () => {
      const swarmIds = ['swarm-1', 'swarm-2'];
      const swarmData = {
        id: 'swarm-1',
        status: 'running',
        startTime: Date.now(),
        agents: [{ id: 'agent-1' }],
        tasks: [{ id: 'task-1' }]
      };

      mockRedisClient.sMembers.mockResolvedValue(swarmIds);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(swarmData));

      const result = await listActiveSwarms(mockRedisClient);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(swarmData);
      expect(mockRedisClient.sMembers).toHaveBeenCalledWith('swarms:active');
    });

    it('should filter out completed swarms by default', async () => {
      const swarmIds = ['swarm-1', 'swarm-2'];
      const activeSwarm = {
        id: 'swarm-1',
        status: 'running',
        startTime: Date.now()
      };
      const completedSwarm = {
        id: 'swarm-2',
        status: 'completed',
        startTime: Date.now()
      };

      mockRedisClient.sMembers.mockResolvedValue(swarmIds);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(activeSwarm))
        .mockResolvedValueOnce(JSON.stringify(completedSwarm));

      const result = await listActiveSwarms(mockRedisClient);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('running');
    });

    it('should include all swarms when includeAll is true', async () => {
      const swarmIds = ['swarm-1', 'swarm-2'];
      const completedSwarm = {
        id: 'swarm-1',
        status: 'completed',
        startTime: Date.now()
      };
      const failedSwarm = {
        id: 'swarm-2',
        status: 'failed',
        startTime: Date.now()
      };

      mockRedisClient.sMembers.mockResolvedValue(swarmIds);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(completedSwarm))
        .mockResolvedValueOnce(JSON.stringify(failedSwarm));

      const result = await listActiveSwarms(mockRedisClient, true);

      expect(result).toHaveLength(2);
    });

    it('should clean up stale swarm IDs', async () => {
      const swarmIds = ['swarm-1', 'stale-swarm'];
      const validSwarm = {
        id: 'swarm-1',
        status: 'running',
        startTime: Date.now()
      };

      mockRedisClient.sMembers.mockResolvedValue(swarmIds);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(validSwarm))
        .mockResolvedValueOnce(null);

      await listActiveSwarms(mockRedisClient);

      expect(mockRedisClient.sRem).toHaveBeenCalledWith('swarms:active', 'stale-swarm');
      expect(mockRedisClient.hDel).toHaveBeenCalledWith('swarms:index', 'stale-swarm');
    });

    it('should sort swarms by start time (newest first)', async () => {
      const swarmIds = ['old-swarm', 'new-swarm'];
      const oldSwarm = {
        id: 'old-swarm',
        status: 'running',
        startTime: 1000
      };
      const newSwarm = {
        id: 'new-swarm',
        status: 'running',
        startTime: 2000
      };

      mockRedisClient.sMembers.mockResolvedValue(swarmIds);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(oldSwarm))
        .mockResolvedValueOnce(JSON.stringify(newSwarm));

      const result = await listActiveSwarms(mockRedisClient);

      expect(result[0].id).toBe('new-swarm');
      expect(result[1].id).toBe('old-swarm');
    });
  });

  describe('deleteSwarmState', () => {
    it('should delete swarm state successfully', async () => {
      const swarmId = 'test-swarm-123';

      const result = await deleteSwarmState(mockRedisClient, swarmId);

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`swarm:${swarmId}`);
      expect(mockRedisClient.sRem).toHaveBeenCalledWith('swarms:active', swarmId);
      expect(mockRedisClient.hDel).toHaveBeenCalledWith('swarms:index', swarmId);
    });

    it('should throw error on delete failure', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Delete failed'));

      await expect(deleteSwarmState(mockRedisClient, 'test'))
        .rejects.toThrow('Failed to delete swarm state: Delete failed');
    });
  });

  describe('updateSwarmStatus', () => {
    it('should update swarm status successfully', async () => {
      const swarmId = 'test-swarm-123';
      const currentState = {
        id: swarmId,
        objective: 'Test objective',
        status: 'running',
        startTime: Date.now()
      };
      const additionalData = { progress: 0.5 };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(currentState));

      const result = await updateSwarmStatus(mockRedisClient, swarmId, 'completed', additionalData);

      expect(result.status).toBe('completed');
      expect(result.progress).toBe(0.5);
      expect(result.endTime).toBeDefined();
      expect(mockRedisClient.setEx).toHaveBeenCalled();
      expect(mockRedisClient.sRem).toHaveBeenCalledWith('swarms:active', swarmId);
    });

    it('should add endTime for terminal status', async () => {
      const swarmId = 'test-swarm-123';
      const currentState = {
        id: swarmId,
        status: 'running',
        startTime: Date.now()
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(currentState));

      const result = await updateSwarmStatus(mockRedisClient, swarmId, 'completed');

      expect(result.endTime).toBeDefined();
      expect(result.endTime).toBeGreaterThan(result.startTime);
    });

    it('should not add endTime for non-terminal status', async () => {
      const swarmId = 'test-swarm-123';
      const currentState = {
        id: swarmId,
        status: 'running',
        startTime: Date.now()
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(currentState));

      const result = await updateSwarmStatus(mockRedisClient, swarmId, 'paused');

      expect(result.endTime).toBeUndefined();
    });

    it('should throw error for non-existent swarm', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await expect(updateSwarmStatus(mockRedisClient, 'non-existent', 'completed'))
        .rejects.toThrow('Swarm non-existent not found');
    });
  });

  describe('getSwarmMetrics', () => {
    it('should calculate swarm metrics correctly', async () => {
      const swarms = [
        {
          id: 'swarm-1',
          status: 'running',
          startTime: Date.now() - 100000,
          agents: [{ id: 'agent-1' }, { id: 'agent-2' }],
          tasks: [{ id: 'task-1' }, { id: 'task-2' }, { id: 'task-3' }]
        },
        {
          id: 'swarm-2',
          status: 'completed',
          startTime: Date.now() - 200000,
          endTime: Date.now() - 50000,
          agents: [{ id: 'agent-3' }],
          tasks: [{ id: 'task-4' }]
        },
        {
          id: 'swarm-3',
          status: 'failed',
          startTime: Date.now() - 300000,
          endTime: Date.now() - 100000,
          agents: [],
          tasks: []
        },
        {
          id: 'swarm-4',
          status: 'initializing',
          startTime: Date.now() - 10000,
          agents: [{ id: 'agent-4' }],
          tasks: [{ id: 'task-5' }]
        }
      ];

      mockRedisClient.sMembers.mockResolvedValue(['swarm-1', 'swarm-2', 'swarm-3', 'swarm-4']);
      mockRedisClient.get.mockImplementation((key) => {
        const swarmId = key.replace('swarm:', '');
        const swarm = swarms.find(s => s.id === swarmId);
        return Promise.resolve(JSON.stringify(swarm));
      });

      const metrics = await getSwarmMetrics(mockRedisClient);

      expect(metrics.total).toBe(4);
      expect(metrics.active).toBe(2); // running + initializing
      expect(metrics.completed).toBe(1);
      expect(metrics.failed).toBe(1);
      expect(metrics.initializing).toBe(1);
      expect(metrics.running).toBe(1);
      expect(metrics.totalAgents).toBe(4);
      expect(metrics.totalTasks).toBe(5);
      expect(metrics.averageDuration).toBeGreaterThan(0);
    });

    it('should handle empty swarms list', async () => {
      mockRedisClient.sMembers.mockResolvedValue([]);

      const metrics = await getSwarmMetrics(mockRedisClient);

      expect(metrics.total).toBe(0);
      expect(metrics.active).toBe(0);
      expect(metrics.completed).toBe(0);
      expect(metrics.failed).toBe(0);
      expect(metrics.averageDuration).toBe(0);
    });
  });

  describe('cleanupExpiredSwarms', () => {
    it('should cleanup expired swarms', async () => {
      const now = Date.now();
      const oldSwarm = {
        id: 'old-swarm',
        status: 'running',
        startTime: now - (25 * 60 * 60 * 1000) // 25 hours ago
      };
      const completedSwarm = {
        id: 'completed-swarm',
        status: 'completed',
        startTime: now - (2 * 60 * 60 * 1000) // 2 hours ago
      };
      const activeSwarm = {
        id: 'active-swarm',
        status: 'running',
        startTime: now - (1 * 60 * 60 * 1000) // 1 hour ago
      };

      mockRedisClient.sMembers.mockResolvedValue(['old-swarm', 'completed-swarm', 'active-swarm']);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(oldSwarm))
        .mockResolvedValueOnce(JSON.stringify(completedSwarm))
        .mockResolvedValueOnce(JSON.stringify(activeSwarm));

      const cleanedCount = await cleanupExpiredSwarms(mockRedisClient, 24);

      expect(cleanedCount).toBe(2); // old-swarm and completed-swarm
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
    });

    it('should use default max age of 24 hours', async () => {
      const now = Date.now();
      const oldSwarm = {
        id: 'old-swarm',
        status: 'running',
        startTime: now - (25 * 60 * 60 * 1000)
      };

      mockRedisClient.sMembers.mockResolvedValue(['old-swarm']);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(oldSwarm));

      await cleanupExpiredSwarms(mockRedisClient);

      expect(mockRedisClient.del).toHaveBeenCalledWith('swarm:old-swarm');
    });
  });

  describe('backupSwarmStates', () => {
    const { promises: fsPromises } = require('fs');

    it('should backup swarm states to file', async () => {
      const swarms = [
        {
          id: 'swarm-1',
          status: 'running',
          startTime: Date.now()
        },
        {
          id: 'swarm-2',
          status: 'completed',
          startTime: Date.now()
        }
      ];

      mockRedisClient.sMembers.mockResolvedValue(['swarm-1', 'swarm-2']);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(swarms[0]))
        .mockResolvedValueOnce(JSON.stringify(swarms[1]));

      const filePath = '/backup/test-backup.json';
      const backup = await backupSwarmStates(mockRedisClient, filePath);

      expect(backup.timestamp).toBeDefined();
      expect(backup.swarms).toEqual(swarms);
      expect(backup.count).toBe(2);
      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        filePath,
        expect.stringContaining('"swarms":'),
        'utf8'
      );
    });

    it('should throw error on file write failure', async () => {
      fsPromises.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(backupSwarmStates(mockRedisClient, '/invalid/path'))
        .rejects.toThrow('Failed to backup swarm states: Write failed');
    });
  });

  describe('restoreSwarmStates', () => {
    const { promises: fsPromises } = require('fs');

    it('should restore swarm states from backup file', async () => {
      const backupData = {
        timestamp: Date.now(),
        swarms: [
          {
            id: 'swarm-1',
            status: 'running',
            startTime: Date.now()
          },
          {
            id: 'swarm-2',
            status: 'completed',
            startTime: Date.now()
          }
        ]
      };

      fsPromises.readFile.mockResolvedValue(JSON.stringify(backupData));

      const restoredCount = await restoreSwarmStates(mockRedisClient, '/backup/test-backup.json');

      expect(restoredCount).toBe(2);
      expect(mockRedisClient.setEx).toHaveBeenCalledTimes(2);
    });

    it('should throw error for invalid backup format', async () => {
      const invalidBackup = { invalid: 'format' };
      fsPromises.readFile.mockResolvedValue(JSON.stringify(invalidBackup));

      await expect(restoreSwarmStates(mockRedisClient, '/invalid/backup.json'))
        .rejects.toThrow('Failed to restore swarm states: Invalid backup file format');
    });

    it('should handle partial restore failures gracefully', async () => {
      const backupData = {
        timestamp: Date.now(),
        swarms: [
          { id: 'swarm-1', status: 'running' },
          { id: 'swarm-2', status: 'completed' }
        ]
      };

      fsPromises.readFile.mockResolvedValue(JSON.stringify(backupData));
      mockRedisClient.setEx
        .mockResolvedValueOnce('OK')
        .mockRejectedValueOnce(new Error('Save failed'));

      const restoredCount = await restoreSwarmStates(mockRedisClient, '/backup/test-backup.json');

      expect(restoredCount).toBe(1); // Only swarm-1 restored
    });
  });

  describe('checkRedisHealth', () => {
    it('should return healthy status for working Redis', async () => {
      const health = await checkRedisHealth(mockRedisClient);

      expect(health.status).toBe('healthy');
      expect(health.responseTime).toBeGreaterThanOrEqual(0);
      expect(health.memoryUsage).toBe('1.5M');
      expect(health.connectedClients).toBe('2');
      expect(health.uptime).toBe('3600');
    });

    it('should return unhealthy status on ping failure', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Redis down'));

      const health = await checkRedisHealth(mockRedisClient);

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Redis down');
    });

    it('should return unhealthy status on info failure', async () => {
      mockRedisClient.info.mockRejectedValue(new Error('Info command failed'));

      const health = await checkRedisHealth(mockRedisClient);

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Info command failed');
    });

    it('should measure response time accurately', async () => {
      const startTime = Date.now();
      mockRedisClient.ping.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'PONG';
      });

      const health = await checkRedisHealth(mockRedisClient);

      expect(health.responseTime).toBeGreaterThanOrEqual(100);
      expect(health.responseTime).toBeLessThan(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis client errors gracefully', async () => {
      mockRedisClient.connect.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(connectRedis())
        .rejects.toThrow('Failed to connect to Redis: ECONNREFUSED');
    });

    it('should handle JSON serialization errors', async () => {
      const circularObject = {};
      circularObject.self = circularObject;

      await expect(saveSwarmState(mockRedisClient, 'test', circularObject))
        .rejects.toThrow('Failed to save swarm state:');
    });

    it('should handle network timeouts', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(loadSwarmState(mockRedisClient, 'test'))
        .rejects.toThrow('Failed to load swarm state: ETIMEDOUT');
    });
  });

  describe('Data Validation', () => {
    it('should validate swarm state structure', async () => {
      const invalidState = { id: null, objective: undefined };

      // Should still save, validation is handled at higher level
      await expect(saveSwarmState(mockRedisClient, 'test', invalidState))
        .resolves.toBe(true);
    });

    it('should handle malformed swarm IDs', async () => {
      await expect(saveSwarmState(mockRedisClient, '', {}))
        .resolves.toBe(true);

      await expect(saveSwarmState(mockRedisClient, null, {}))
        .resolves.toBe(true);
    });

    it('should handle large swarm states', async () => {
      const largeState = {
        id: 'large-swarm',
        agents: Array(1000).fill({ id: 'agent' }),
        tasks: Array(1000).fill({ id: 'task' })
      };

      await expect(saveSwarmState(mockRedisClient, 'large-swarm', largeState))
        .resolves.toBe(true);
    });
  });
});