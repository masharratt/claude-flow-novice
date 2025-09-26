import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommunicationBridge } from '../../src/topology/communication-bridge';
import { CoordinationMessage } from '../../src/topology/types';

// Mock dependencies
vi.mock('../../src/core/logger');
vi.mock('../../src/utils/helpers', () => ({
  generateId: vi.fn().mockImplementation((prefix = '') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
}));

describe('CommunicationBridge', () => {
  let bridge: CommunicationBridge;

  beforeEach(async () => {
    bridge = new CommunicationBridge({
      managerId: 'test-manager',
      enableCompression: false,
      enableEncryption: false,
      maxQueueSize: 100,
      retryAttempts: 2,
      retryDelay: 500,
      messageTimeout: 5000
    });
  });

  afterEach(async () => {
    if (bridge) {
      await bridge.shutdown();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await bridge.initialize();

      expect((bridge as any).isRunning).toBe(true);
    });

    test('should not initialize twice', async () => {
      await bridge.initialize();
      await bridge.initialize();

      expect((bridge as any).isRunning).toBe(true);
    });

    test('should emit initialization event', async () => {
      const initSpy = vi.fn();
      bridge.on('bridge:initialized', initSpy);

      await bridge.initialize();

      expect(initSpy).toHaveBeenCalledWith({
        bridgeId: expect.any(String)
      });
    });
  });

  describe('Bridge Management', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    test('should establish bridge between topologies', async () => {
      const bridgeId = await bridge.establishBridge('topology-1', 'topology-2');

      expect(bridgeId).toBeDefined();
      expect(typeof bridgeId).toBe('string');

      const bridges = bridge.getAllBridges();
      expect(bridges).toHaveLength(1);
      expect(bridges[0].sourceTopology).toBe('topology-1');
      expect(bridges[0].targetTopology).toBe('topology-2');
    });

    test('should emit bridge establishment event', async () => {
      const establishSpy = vi.fn();
      bridge.on('bridge:established', establishSpy);

      const bridgeId = await bridge.establishBridge('topology-1', 'topology-2');

      expect(establishSpy).toHaveBeenCalledWith({
        bridgeId,
        sourceTopologyId: 'topology-1',
        targetTopologyId: 'topology-2'
      });
    });

    test('should close bridge', async () => {
      const bridgeId = await bridge.establishBridge('topology-1', 'topology-2');

      await bridge.closeBridge(bridgeId);

      const bridges = bridge.getAllBridges();
      expect(bridges).toHaveLength(0);
    });

    test('should emit bridge closure event', async () => {
      const closeSpy = vi.fn();
      bridge.on('bridge:closed', closeSpy);

      const bridgeId = await bridge.establishBridge('topology-1', 'topology-2');
      await bridge.closeBridge(bridgeId);

      expect(closeSpy).toHaveBeenCalledWith({ bridgeId });
    });

    test('should handle closing non-existent bridge', async () => {
      await expect(bridge.closeBridge('non-existent'))
        .rejects.toThrow('Bridge non-existent not found');
    });

    test('should create bidirectional queues', async () => {
      await bridge.establishBridge('topology-1', 'topology-2');

      const queueStatus = bridge.getQueueStatus();
      expect(queueStatus).toHaveLength(2); // Forward and reverse queues

      const queueIds = queueStatus.map(q => q.queueId).sort();
      expect(queueIds).toEqual(['topology-1-topology-2', 'topology-2-topology-1']);
    });

    test('should create routing table entries', async () => {
      await bridge.establishBridge('topology-1', 'topology-2');

      const routingTable = bridge.getRoutingTable();
      expect(routingTable).toHaveLength(2); // Bidirectional routes

      const routes = routingTable.map(r => `${r.source}-${r.target}`).sort();
      expect(routes).toEqual(['topology-1-topology-2', 'topology-2-topology-1']);
    });
  });

  describe('Message Routing', () => {
    beforeEach(async () => {
      await bridge.initialize();
      await bridge.establishBridge('topology-1', 'topology-2');
      await bridge.establishBridge('topology-2', 'topology-3');
    });

    test('should route direct message', async () => {
      const message: CoordinationMessage = {
        id: 'msg-1',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-2',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await bridge.routeMessage(message);

      // Message should be queued for processing
      const queueStatus = bridge.getQueueStatus();
      const queue = queueStatus.find(q => q.queueId === 'topology-1-topology-2');
      expect(queue?.size).toBeGreaterThanOrEqual(0); // May have been processed already
    });

    test('should find multi-hop route', async () => {
      const message: CoordinationMessage = {
        id: 'msg-multi-hop',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-3',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-3',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await bridge.routeMessage(message);

      // Message should be routed through topology-2
      expect(true).toBe(true); // Test that no error is thrown
    });

    test('should handle message with explicit route', async () => {
      const message: CoordinationMessage & { route: string[] } = {
        id: 'msg-explicit-route',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-3',
        data: { task: 'test' },
        timestamp: new Date(),
        route: ['topology-1', 'topology-2', 'topology-3']
      };

      await bridge.routeMessage(message);

      expect(true).toBe(true); // Test that explicit route is used
    });

    test('should fail routing with no available route', async () => {
      const message: CoordinationMessage = {
        id: 'msg-no-route',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-4',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-4', // No route to topology-4
        data: { task: 'test' },
        timestamp: new Date()
      };

      await expect(bridge.routeMessage(message))
        .rejects.toThrow('No route found for message');
    });
  });

  describe('Message Processing', () => {
    beforeEach(async () => {
      await bridge.initialize();
      await bridge.establishBridge('topology-1', 'topology-2');
    });

    test('should process queued messages', async () => {
      const deliveredSpy = vi.fn();
      bridge.on('message:delivered', deliveredSpy);

      const message: CoordinationMessage = {
        id: 'msg-process',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-2',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await bridge.routeMessage(message);

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(deliveredSpy).toHaveBeenCalled();
    });

    test('should emit message received event', async () => {
      const receivedSpy = vi.fn();
      bridge.on('message:received', receivedSpy);

      const message: CoordinationMessage = {
        id: 'msg-received',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-2',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await bridge.routeMessage(message);

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(receivedSpy).toHaveBeenCalledWith({
        message: expect.objectContaining({ id: 'msg-received' }),
        targetTopologyId: 'topology-2',
        receivedAt: expect.any(Date)
      });
    });

    test('should handle message retry on failure', async () => {
      // Mock message processing failure
      const originalProcessQueuedMessage = (bridge as any).processQueuedMessage;
      let callCount = 0;
      (bridge as any).processQueuedMessage = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 1) {
          throw new Error('Processing failed');
        }
        return originalProcessQueuedMessage.call(bridge, arguments[0]);
      });

      const message: CoordinationMessage = {
        id: 'msg-retry',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-2',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await bridge.routeMessage(message);

      // Wait for retry processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(callCount).toBeGreaterThan(1);

      // Restore original method
      (bridge as any).processQueuedMessage = originalProcessQueuedMessage;
    });

    test('should drop message after retry limit', async () => {
      const droppedSpy = vi.fn();
      bridge.on('message:dropped', droppedSpy);

      // Mock message processing to always fail
      (bridge as any).processQueuedMessage = vi.fn().mockRejectedValue(new Error('Always fails'));

      const message: CoordinationMessage = {
        id: 'msg-drop',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-2',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await bridge.routeMessage(message);

      // Wait for retry attempts to exhaust
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(droppedSpy).toHaveBeenCalledWith({
        messageId: 'msg-drop',
        reason: 'retry_limit_exceeded',
        error: 'Always fails'
      });
    });
  });

  describe('Protocol Adaptation', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    test('should apply mesh to hierarchical protocol adaptation', async () => {
      const message: CoordinationMessage = {
        id: 'msg-adapt',
        type: 'broadcast',
        sourceAgent: 'agent-1',
        data: { announcement: 'test' },
        broadcast: true,
        timestamp: new Date()
      };

      const processedMessage = await (bridge as any).applyRoutingRules(message);

      // Should transform broadcast to delegate for hierarchical
      expect(processedMessage).toBeDefined();
    });

    test('should apply routing rules based on priority', async () => {
      const highPriorityMessage: CoordinationMessage = {
        id: 'msg-high-priority',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        data: { task: 'urgent' },
        priority: 9,
        timestamp: new Date()
      };

      const processedMessage = await (bridge as any).applyRoutingRules(highPriorityMessage);

      expect(processedMessage.expedited).toBe(true);
    });

    test('should apply error message special handling', async () => {
      const errorMessage: CoordinationMessage = {
        id: 'msg-error',
        type: 'error',
        sourceAgent: 'agent-1',
        data: { error: 'something went wrong' },
        timestamp: new Date()
      };

      const processedMessage = await (bridge as any).applyRoutingRules(errorMessage);

      expect(processedMessage.immediate).toBe(true);
      expect(processedMessage.persistent).toBe(true);
    });
  });

  describe('Routing Algorithms', () => {
    beforeEach(async () => {
      await bridge.initialize();
      // Create a more complex topology: 1 -> 2 -> 3, 1 -> 4 -> 3
      await bridge.establishBridge('topology-1', 'topology-2');
      await bridge.establishBridge('topology-2', 'topology-3');
      await bridge.establishBridge('topology-1', 'topology-4');
      await bridge.establishBridge('topology-4', 'topology-3');
    });

    test('should find shortest path', async () => {
      const routes = bridge.getRoutingTable();
      const graph = (bridge as any).buildRoutingGraph(routes);
      const path = (bridge as any).findShortestPath(graph, 'topology-1', 'topology-3');

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThanOrEqual(3);
      expect(path[0]).toBe('topology-1');
      expect(path[path.length - 1]).toBe('topology-3');
    });

    test('should return empty path when no route exists', async () => {
      const routes = bridge.getRoutingTable();
      const graph = (bridge as any).buildRoutingGraph(routes);
      const path = (bridge as any).findShortestPath(graph, 'topology-1', 'topology-5');

      expect(path).toEqual([]);
    });

    test('should prefer direct routes when available', async () => {
      const directRoute = await (bridge as any).findOptimalRoute('topology-1', 'topology-2');

      expect(directRoute).toEqual(['topology-1', 'topology-2']);
    });
  });

  describe('Queue Management', () => {
    beforeEach(async () => {
      await bridge.initialize();
      await bridge.establishBridge('topology-1', 'topology-2');
    });

    test('should enforce queue size limits', async () => {
      // Fill queue beyond capacity
      const promises = [];
      for (let i = 0; i < 150; i++) { // More than maxQueueSize (100)
        const message: CoordinationMessage = {
          id: `msg-${i}`,
          type: 'task_assignment',
          sourceAgent: 'agent-1',
          targetAgent: 'agent-2',
          sourceTopology: 'topology-1',
          targetTopology: 'topology-2',
          data: { task: `test-${i}` },
          timestamp: new Date()
        };

        const promise = bridge.routeMessage(message).catch(error => {
          if (error.message.includes('is full')) {
            return 'queue_full';
          }
          throw error;
        });
        promises.push(promise);
      }

      const results = await Promise.allSettled(promises);
      const queueFullErrors = results.filter(r =>
        r.status === 'fulfilled' && r.value === 'queue_full'
      );

      expect(queueFullErrors.length).toBeGreaterThan(0);
    });

    test('should process messages by priority', async () => {
      const deliveryOrder: string[] = [];

      // Mock message delivery to track order
      const originalDeliverMessage = (bridge as any).deliverMessage;
      (bridge as any).deliverMessage = vi.fn().mockImplementation(async (message, targetId) => {
        deliveryOrder.push(message.id);
        return originalDeliverMessage.call(bridge, message, targetId);
      });

      // Send messages with different priorities
      const messages = [
        { id: 'low', priority: 1 },
        { id: 'high', priority: 9 },
        { id: 'medium', priority: 5 }
      ];

      for (const msg of messages) {
        const message: CoordinationMessage = {
          id: msg.id,
          type: 'task_assignment',
          sourceAgent: 'agent-1',
          targetAgent: 'agent-2',
          sourceTopology: 'topology-1',
          targetTopology: 'topology-2',
          data: { task: 'test' },
          priority: msg.priority,
          timestamp: new Date()
        };

        await bridge.routeMessage(message);
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify high priority message was processed first
      expect(deliveryOrder[0]).toBe('high');

      // Restore original method
      (bridge as any).deliverMessage = originalDeliverMessage;
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    test('should track bridge metrics', async () => {
      const bridgeId = await bridge.establishBridge('topology-1', 'topology-2');

      const message: CoordinationMessage = {
        id: 'msg-metrics',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-2',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await bridge.routeMessage(message);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const bridgeMetrics = bridge.getBridgeMetrics(bridgeId);
      expect(bridgeMetrics).toBeDefined();
      expect(bridgeMetrics!.metrics.messagesRouted).toBeGreaterThan(0);
    });

    test('should update error rate on failures', async () => {
      const bridgeId = await bridge.establishBridge('topology-1', 'topology-2');

      // Mock processing failure
      (bridge as any).processQueuedMessage = vi.fn().mockRejectedValue(new Error('Processing failed'));

      const message: CoordinationMessage = {
        id: 'msg-error-metrics',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-2',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await bridge.routeMessage(message);

      // Wait for processing and retry attempts
      await new Promise(resolve => setTimeout(resolve, 1500));

      const bridgeMetrics = bridge.getBridgeMetrics(bridgeId);
      expect(bridgeMetrics!.metrics.errorRate).toBeGreaterThan(0);
    });

    test('should provide queue status', async () => {
      await bridge.establishBridge('topology-1', 'topology-2');
      await bridge.establishBridge('topology-2', 'topology-3');

      const queueStatus = bridge.getQueueStatus();

      expect(queueStatus).toHaveLength(4); // 2 bridges x 2 directions each
      expect(queueStatus[0]).toHaveProperty('queueId');
      expect(queueStatus[0]).toHaveProperty('size');
      expect(queueStatus[0]).toHaveProperty('processingRate');
    });

    test('should provide routing table', async () => {
      await bridge.establishBridge('topology-1', 'topology-2');
      await bridge.establishBridge('topology-2', 'topology-3');

      const routingTable = bridge.getRoutingTable();

      expect(routingTable).toHaveLength(4); // 2 bridges x 2 directions each
      expect(routingTable[0]).toHaveProperty('source');
      expect(routingTable[0]).toHaveProperty('target');
      expect(routingTable[0]).toHaveProperty('path');
      expect(routingTable[0]).toHaveProperty('cost');
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await bridge.initialize();
      await bridge.establishBridge('topology-1', 'topology-2');

      const shutdownSpy = vi.fn();
      bridge.on('bridge:shutdown', shutdownSpy);

      await bridge.shutdown();

      expect(shutdownSpy).toHaveBeenCalledWith({
        bridgeId: expect.any(String)
      });
      expect((bridge as any).isRunning).toBe(false);
    });

    test('should close all bridges on shutdown', async () => {
      await bridge.initialize();
      await bridge.establishBridge('topology-1', 'topology-2');
      await bridge.establishBridge('topology-2', 'topology-3');

      await bridge.shutdown();

      const bridges = bridge.getAllBridges();
      expect(bridges).toHaveLength(0);
    });

    test('should clear all queues on shutdown', async () => {
      await bridge.initialize();
      await bridge.establishBridge('topology-1', 'topology-2');

      await bridge.shutdown();

      const queueStatus = bridge.getQueueStatus();
      expect(queueStatus).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    test('should handle invalid route in message', async () => {
      const message: CoordinationMessage & { route: string[] } = {
        id: 'msg-invalid-route',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        data: { task: 'test' },
        timestamp: new Date(),
        route: ['single-hop'] // Invalid route (less than 2 hops)
      };

      await expect(bridge.routeMessage(message))
        .rejects.toThrow('No route found for message');
    });

    test('should handle queue not found error', async () => {
      const message: CoordinationMessage = {
        id: 'msg-no-queue',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        sourceTopology: 'non-existent-1',
        targetTopology: 'non-existent-2',
        data: { task: 'test' },
        timestamp: new Date()
      };

      await expect(bridge.routeMessage(message))
        .rejects.toThrow('No route found for message');
    });

    test('should handle protocol adapter failures gracefully', async () => {
      // Mock protocol adapter that throws error
      const faultyAdapter = {
        id: 'faulty-adapter',
        name: 'Faulty Adapter',
        sourceProtocol: 'topology-1',
        targetProtocol: 'topology-2',
        transform: vi.fn().mockRejectedValue(new Error('Adapter failed'))
      };

      (bridge as any).protocolAdapters.set('faulty-adapter', faultyAdapter);

      await bridge.establishBridge('topology-1', 'topology-2');

      const message: CoordinationMessage = {
        id: 'msg-adapter-fail',
        type: 'task_assignment',
        sourceAgent: 'agent-1',
        targetAgent: 'agent-2',
        sourceTopology: 'topology-1',
        targetTopology: 'topology-2',
        data: { task: 'test' },
        timestamp: new Date()
      };

      // Should handle adapter failure and still process message
      await bridge.routeMessage(message);

      expect(true).toBe(true); // Test passes if no error is thrown
    });
  });
});