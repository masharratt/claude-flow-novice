/**
 * Unit tests for spawn-workers.js Socket.IO portal event publishing
 *
 * Tests:
 * 1. Socket.IO client connection initialization
 * 2. agent:spawned event emission
 * 3. agent:update event emission during tool use
 * 4. agent:completed event emission with metrics
 * 5. agent:failed event emission on error
 * 6. swarm:completed event with aggregated metrics
 * 7. Graceful degradation when portal unavailable
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridWorkerSpawner } from '../../src/cli/hybrid-routing/spawn-workers.js';

// Mock Socket.IO client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket)
}));

// Mock Redis
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined)
  }))
}));

// Mock SQLite adapter
vi.mock('../../src/sqlite/MemoryStoreAdapter.cjs', () => ({
  default: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn()
  }))
}));

// Mock Anthropic API
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Task completed. CONFIDENCE: 0.85' }],
    usage: { input_tokens: 1000, output_tokens: 500 }
  })
});

describe('spawn-workers.js - Socket.IO Portal Events', () => {
  let spawner;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set required environment variables
    process.env.Z_AI_API_KEY = 'test-key';
    process.env.PORTAL_URL = 'http://localhost:3000';

    spawner = new HybridWorkerSpawner({
      task: 'Test task',
      maxAgents: 2,
      provider: 'zai',
      portalUrl: 'http://localhost:3000'
    });

    // Initialize connections
    await spawner.initialize();

    // Simulate successful connection
    mockSocket.connected = true;
    spawner.socketAvailable = true;
  });

  afterEach(async () => {
    if (spawner) {
      await spawner.cleanup();
    }
  });

  describe('Socket.IO Connection', () => {
    it('should initialize Socket.IO client with correct config', async () => {
      const { io } = await import('socket.io-client');

      expect(io).toHaveBeenCalledWith('http://localhost:3000', expect.objectContaining({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 3,
        timeout: 5000
      }));
    });

    it('should register connection event handlers', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should set socketAvailable to true on connect', async () => {
      const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
      connectHandler();

      expect(spawner.socketAvailable).toBe(true);
    });

    it('should set socketAvailable to false on connect_error', async () => {
      const errorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect_error')[1];
      errorHandler(new Error('Connection failed'));

      expect(spawner.socketAvailable).toBe(false);
    });
  });

  describe('agent:spawned Event', () => {
    it('should emit agent:spawned with correct payload', async () => {
      spawner.emitPortalEvent('agent:spawned', {
        agentId: 'hybrid-worker-1',
        workerId: 1,
        agentType: 'coder',
        subtask: 'Implement authentication',
        provider: 'zai',
        model: 'claude-3-5-sonnet-20241022',
        timestamp: Date.now()
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:spawned', expect.objectContaining({
        agentId: 'hybrid-worker-1',
        workerId: 1,
        agentType: 'coder',
        subtask: 'Implement authentication',
        provider: 'zai',
        model: 'claude-3-5-sonnet-20241022'
      }));
    });

    it('should not throw when portal unavailable', () => {
      spawner.socketAvailable = false;

      expect(() => {
        spawner.emitPortalEvent('agent:spawned', { workerId: 1 });
      }).not.toThrow();

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('agent:update Event', () => {
    it('should emit agent:update during tool use', () => {
      spawner.emitPortalEvent('agent:update', {
        agentId: 'hybrid-worker-1',
        workerId: 1,
        progress: 0.4,
        tool: 'bash_execute',
        toolInput: { command: 'npm install' },
        timestamp: Date.now()
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:update', expect.objectContaining({
        agentId: 'hybrid-worker-1',
        progress: 0.4,
        tool: 'bash_execute'
      }));
    });
  });

  describe('agent:completed Event', () => {
    it('should emit agent:completed with metrics', () => {
      spawner.emitPortalEvent('agent:completed', {
        agentId: 'hybrid-worker-1',
        workerId: 1,
        confidence: 0.85,
        tokens: { input: 1000, output: 500, total: 1500 },
        cost: 0.00075,
        duration: 15000,
        filesModified: ['auth.js', 'auth.test.js'],
        success: true,
        timestamp: Date.now()
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:completed', expect.objectContaining({
        agentId: 'hybrid-worker-1',
        confidence: 0.85,
        tokens: expect.objectContaining({
          input: 1000,
          output: 500,
          total: 1500
        }),
        cost: 0.00075,
        success: true
      }));
    });
  });

  describe('agent:failed Event', () => {
    it('should emit agent:failed on error', () => {
      spawner.emitPortalEvent('agent:failed', {
        agentId: 'hybrid-worker-1',
        workerId: 1,
        error: 'API timeout',
        duration: 30000,
        timestamp: Date.now()
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('agent:failed', expect.objectContaining({
        agentId: 'hybrid-worker-1',
        error: 'API timeout',
        duration: 30000
      }));
    });
  });

  describe('swarm:completed Event', () => {
    it('should emit swarm:completed with aggregated metrics', () => {
      // Simulate completed workers
      spawner.results = [
        {
          workerId: 1,
          confidence: 0.85,
          tokens: { input: 1000, output: 500, total: 1500 },
          cost: 0.00075,
          duration: 15000,
          success: true
        },
        {
          workerId: 2,
          confidence: 0.92,
          tokens: { input: 1200, output: 600, total: 1800 },
          cost: 0.00090,
          duration: 18000,
          success: true
        }
      ];

      spawner.totalTokens = { input: 2200, output: 1100, total: 3300 };
      spawner.totalCost = 0.00165;

      spawner.printSummary();

      expect(mockSocket.emit).toHaveBeenCalledWith('swarm:completed', expect.objectContaining({
        avgConfidence: expect.any(Number),
        totalTokens: expect.objectContaining({
          input: 2200,
          output: 1100,
          total: 3300
        }),
        totalCost: 0.00165,
        workerCount: 2,
        successfulWorkers: 2,
        gateResult: expect.stringMatching(/PASS|FAIL/),
        gateThreshold: 0.75,
        costSavingsPercent: expect.any(Number),
        workers: expect.arrayContaining([
          expect.objectContaining({
            agentId: 'hybrid-worker-1',
            confidence: 0.85
          })
        ])
      }));
    });

    it('should calculate cost savings correctly', () => {
      spawner.results = [
        {
          workerId: 1,
          confidence: 0.80,
          tokens: { input: 1000, output: 500 },
          cost: 0.0005, // z.ai cost
          success: true
        }
      ];

      spawner.totalTokens = { input: 1000, output: 500, total: 1500 };
      spawner.totalCost = 0.0005;

      spawner.printSummary();

      const emittedPayload = mockSocket.emit.mock.calls.find(
        call => call[0] === 'swarm:completed'
      )[1];

      // Pure Claude cost: (1000/1M × $3) + (500/1M × $15) = $0.0105
      // z.ai cost: $0.0005
      // Savings: 95.2%
      expect(emittedPayload.costSavingsPercent).toBeGreaterThan(90);
      expect(emittedPayload.pureClaudeCost).toBeGreaterThan(emittedPayload.totalCost);
    });

    it('should emit PASS gate result when confidence ≥0.75', () => {
      spawner.results = [
        { workerId: 1, confidence: 0.85, success: true },
        { workerId: 2, confidence: 0.80, success: true }
      ];

      spawner.printSummary();

      const emittedPayload = mockSocket.emit.mock.calls.find(
        call => call[0] === 'swarm:completed'
      )[1];

      expect(emittedPayload.gateResult).toBe('PASS');
      expect(emittedPayload.avgConfidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should emit FAIL gate result when confidence <0.75', () => {
      spawner.results = [
        { workerId: 1, confidence: 0.65, success: true },
        { workerId: 2, confidence: 0.70, success: true }
      ];

      spawner.totalTokens = { input: 0, output: 0, total: 0 };
      spawner.totalCost = 0;

      spawner.printSummary();

      const emittedPayload = mockSocket.emit.mock.calls.find(
        call => call[0] === 'swarm:completed'
      )[1];

      expect(emittedPayload.gateResult).toBe('FAIL');
      expect(emittedPayload.avgConfidence).toBeLessThan(0.75);
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue when Socket.IO unavailable', async () => {
      const spawnerNoPortal = new HybridWorkerSpawner({
        task: 'Test task',
        maxAgents: 1,
        provider: 'zai',
        portalUrl: 'http://invalid-portal:9999'
      });

      spawnerNoPortal.socketClient = null;
      spawnerNoPortal.socketAvailable = false;

      expect(() => {
        spawnerNoPortal.emitPortalEvent('agent:spawned', { workerId: 1 });
      }).not.toThrow();

      await spawnerNoPortal.cleanup();
    });

    it('should silently handle emit errors', () => {
      mockSocket.emit.mockImplementationOnce(() => {
        throw new Error('Socket error');
      });

      expect(() => {
        spawner.emitPortalEvent('agent:spawned', { workerId: 1 });
      }).not.toThrow();
    });

    it('should cleanup Socket.IO on spawner cleanup', async () => {
      await spawner.cleanup();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Event Payload Validation', () => {
    it('should include timestamp in all events', () => {
      const before = Date.now();

      spawner.emitPortalEvent('agent:spawned', {
        agentId: 'hybrid-worker-1',
        timestamp: Date.now()
      });

      const after = Date.now();

      const emittedPayload = mockSocket.emit.mock.calls[mockSocket.emit.mock.calls.length - 1][1];
      expect(emittedPayload.timestamp).toBeGreaterThanOrEqual(before);
      expect(emittedPayload.timestamp).toBeLessThanOrEqual(after);
    });

    it('should use agentId format: hybrid-worker-{workerId}', () => {
      spawner.emitPortalEvent('agent:spawned', {
        agentId: 'hybrid-worker-5',
        workerId: 5
      });

      const emittedPayload = mockSocket.emit.mock.calls[mockSocket.emit.mock.calls.length - 1][1];
      expect(emittedPayload.agentId).toBe('hybrid-worker-5');
      expect(emittedPayload.workerId).toBe(5);
    });
  });
});
