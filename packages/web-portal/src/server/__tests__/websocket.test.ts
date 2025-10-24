/**
 * WebSocket Server Integration Tests
 * Tests all 5 event types with Socket.IO client
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer } from 'http';
import { Server as HttpServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { sign as jwtSign } from 'jsonwebtoken';
import { WebSocketServer } from '../websocket/SocketIOServer';
import { TransparencyAdapter } from '../websocket/integrations/TransparencyAdapter';
import { SwarmAdapter } from '../websocket/integrations/SwarmAdapter';
import { MetricsAggregator } from '../websocket/integrations/MetricsAggregator';

describe('WebSocket Server Integration Tests', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let transparencyAdapter: TransparencyAdapter;
  let swarmAdapter: SwarmAdapter;
  let metricsAggregator: MetricsAggregator;
  let clientSocket: ClientSocket;
  let authenticatedClientSocket: ClientSocket;
  const port = 3100;
  const jwtSecret = 'test-secret-key';

  beforeAll(async () => { try {
    // Create HTTP server
    httpServer = createServer();

    // Create WebSocket server
    wsServer = new WebSocketServer(httpServer, {
      path: '/ws',
      corsOrigin: '*',
      jwtSecret,
      apiKeys: ['test-api-key'],
      enableDebug: false,
      eventThrottle: {
        metrics_update: 100, // Fast for tests
        agent_update: 10
      }
    });

    // Create integration adapters
    transparencyAdapter = new TransparencyAdapter(wsServer);
    swarmAdapter = new SwarmAdapter(wsServer);
    metricsAggregator = new MetricsAggregator(wsServer, {
      pollInterval: 200 // Fast for tests
    });

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(port, () => {
        console.log(`Test server listening on port ${port}`);
        resolve();
      });
    });
  });

  afterAll(async () => { try {
    // Cleanup
    if (clientSocket?.connected) clientSocket.disconnect();
    if (authenticatedClientSocket?.connected) authenticatedClientSocket.disconnect();
    metricsAggregator.stop();
    await wsServer.shutdown();
    httpServer.close();
  });

  beforeEach(() => {
    // Clear any existing connections
    if (clientSocket?.connected) clientSocket.disconnect();
    if (authenticatedClientSocket?.connected) authenticatedClientSocket.disconnect();
  });

  describe('Connection & Authentication', () => {
    it('should accept unauthenticated connection in development', (done) => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      clientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        transports: ['websocket']
      });

      clientSocket.on('connection-established', (data) => {
        expect(data.socketId).toBeDefined();
        expect(data.authenticated).toBe(false);
        expect(data.role).toBe('guest');
        process.env.NODE_ENV = originalEnv;
        return;
      });
    }, 10000);

    it('should accept JWT authenticated connection', (done) => {
      const token = jwtSign({ userId: 'test-user', role: 'admin' }, jwtSecret);

      authenticatedClientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        auth: { token },
        transports: ['websocket']
      });

      authenticatedClientSocket.on('connection-established', (data) => {
        expect(data.socketId).toBeDefined();
        expect(data.authenticated).toBe(true);
        expect(data.role).toBe('admin');
        return;
      });
    }, 10000);

    it('should accept API key authenticated connection', (done) => {
      clientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        auth: { apiKey: 'test-api-key' },
        transports: ['websocket']
      });

      clientSocket.on('connection-established', (data) => {
        expect(data.socketId).toBeDefined();
        expect(data.authenticated).toBe(true);
        expect(data.role).toBe('api');
        return;
      });
    }, 10000);
  });

  describe('Event Type 1: agent_update', () => {
    beforeEach((done) => {
      process.env.NODE_ENV = 'development';
      clientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        transports: ['websocket']
      });
      clientSocket.on('connection-established', () => return);
    });

    it('should receive agent_update event in agents room', (done) => {
      clientSocket.on('agent_update', (data) => {
        expect(data.agentId).toBe('agent-123');
        expect(data.status).toBe('spawned');
        expect(data.confidence).toBe(0.85);
        expect(data.timestamp).toBeDefined();
        return;
      });

      // Simulate agent spawn via TransparencyAdapter
      setTimeout(() => {
        transparencyAdapter.handleAgentEvent({
          type: 'agent_spawned',
          agentId: 'agent-123',
          data: { confidence: 0.85 },
          timestamp: new Date()
        });
      }, 100);
    }, 10000);

    it('should receive agent_update in agent-specific room', (done) => {
      const agentId = 'agent-456';

      clientSocket.emit('subscribe:agent', agentId);
      clientSocket.on('subscribed', () => {
        clientSocket.on('agent_update', (data) => {
          expect(data.agentId).toBe(agentId);
          expect(data.status).toBe('running');
          return;
        });

        // Trigger agent update
        setTimeout(() => {
          transparencyAdapter.handleAgentEvent({
            type: 'agent_updated',
            agentId,
            data: { status: 'running', confidence: 0.90 },
            timestamp: new Date()
          });
        }, 100);
      });
    }, 10000);

    it('should throttle agent_update events', (done) => {
      const receivedEvents: any[] = [];

      clientSocket.on('agent_update', (data) => {
        receivedEvents.push(data);
      });

      // Send 10 rapid updates
      for (let i = 0; i < 10; i++) {
        transparencyAdapter.handleAgentEvent({
          type: 'agent_updated',
          agentId: 'agent-throttle',
          data: { status: 'running', confidence: 0.5 + i * 0.05 },
          timestamp: new Date()
        });
      }

      // Check after throttle window
      setTimeout(() => {
        // Should receive fewer than 10 events due to throttling
        expect(receivedEvents.length).toBeLessThan(10);
        expect(receivedEvents.length).toBeGreaterThan(0);
        return;
      }, 500);
    }, 10000);
  });

  describe('Event Type 2: hierarchy_change', () => {
    beforeEach((done) => {
      process.env.NODE_ENV = 'development';
      clientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        transports: ['websocket']
      });
      clientSocket.on('connection-established', () => return);
    });

    it('should receive hierarchy_change event for agent spawn', (done) => {
      clientSocket.on('hierarchy_change', (data) => {
        expect(data.type).toBe('spawn');
        expect(data.agentId).toBe('child-agent-1');
        expect(data.parentId).toBe('parent-agent-1');
        expect(data.timestamp).toBeDefined();
        return;
      });

      setTimeout(() => {
        swarmAdapter.handleSwarmEvent({
          type: 'agent_spawned',
          agentId: 'child-agent-1',
          parentId: 'parent-agent-1',
          data: {},
          timestamp: new Date()
        });
      }, 100);
    }, 10000);

    it('should receive hierarchy_change event for agent terminate', (done) => {
      clientSocket.on('hierarchy_change', (data) => {
        if (data.type === 'terminate') {
          expect(data.agentId).toBe('terminated-agent');
          return;
        }
      });

      setTimeout(() => {
        swarmAdapter.handleSwarmEvent({
          type: 'agent_terminated',
          agentId: 'terminated-agent',
          data: {},
          timestamp: new Date()
        });
      }, 100);
    }, 10000);

    it('should receive hierarchy_change event for agent reparent', (done) => {
      clientSocket.on('hierarchy_change', (data) => {
        if (data.type === 'reparent') {
          expect(data.agentId).toBe('moved-agent');
          expect(data.newParentId).toBe('new-parent');
          return;
        }
      });

      setTimeout(() => {
        swarmAdapter.handleSwarmEvent({
          type: 'agent_reparented',
          agentId: 'moved-agent',
          newParentId: 'new-parent',
          data: {},
          timestamp: new Date()
        });
      }, 100);
    }, 10000);
  });

  describe('Event Type 3: metrics_update', () => {
    beforeEach((done) => {
      process.env.NODE_ENV = 'development';
      clientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        transports: ['websocket']
      });
      clientSocket.on('connection-established', () => {
        metricsAggregator.start();
        return;
      });
    });

    afterEach(() => {
      metricsAggregator.stop();
    });

    it('should receive metrics_update events periodically', (done) => {
      let receivedCount = 0;

      clientSocket.on('metrics_update', (data) => {
        receivedCount++;
        expect(data.system).toBeDefined();
        expect(data.system.cpu).toBeGreaterThanOrEqual(0);
        expect(data.system.memory).toBeGreaterThanOrEqual(0);
        expect(data.agents).toBeDefined();
        expect(data.timestamp).toBeDefined();

        if (receivedCount >= 2) {
          return;
        }
      });
    }, 10000);

    it('should throttle metrics_update events', (done) => {
      const receivedEvents: any[] = [];
      const startTime = Date.now();

      clientSocket.on('metrics_update', (data) => {
        receivedEvents.push({ data, time: Date.now() - startTime });
      });

      setTimeout(() => {
        // Should receive ~5 events in 600ms (100ms throttle)
        expect(receivedEvents.length).toBeGreaterThanOrEqual(3);
        expect(receivedEvents.length).toBeLessThanOrEqual(7);
        return;
      }, 600);
    }, 10000);
  });

  describe('Event Type 4: error', () => {
    beforeEach((done) => {
      const token = jwtSign({ userId: 'test-user', role: 'admin' }, jwtSecret);
      authenticatedClientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        auth: { token },
        transports: ['websocket']
      });
      authenticatedClientSocket.on('connection-established', () => return);
    });

    it('should receive error event in errors room (authenticated only)', (done) => {
      authenticatedClientSocket.on('error', (data) => {
        expect(data.severity).toBe('high');
        expect(data.message).toBe('Test error message');
        expect(data.agentId).toBe('error-agent-1');
        expect(data.timestamp).toBeDefined();
        return;
      });

      setTimeout(() => {
        wsServer.emitError(null, {
          severity: 'high',
          message: 'Test error message',
          agentId: 'error-agent-1'
        });
      }, 100);
    }, 10000);

    it('should send error to specific socket', (done) => {
      authenticatedClientSocket.on('error', (data) => {
        expect(data.severity).toBe('critical');
        expect(data.message).toBe('Socket-specific error');
        return;
      });

      setTimeout(() => {
        wsServer.emitError(authenticatedClientSocket.id, {
          severity: 'critical',
          message: 'Socket-specific error'
        });
      }, 100);
    }, 10000);
  });

  describe('Event Type 5: notification', () => {
    beforeEach((done) => {
      process.env.NODE_ENV = 'development';
      clientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        transports: ['websocket']
      });
      clientSocket.on('connection-established', () => return);
    });

    it('should receive notification event', (done) => {
      clientSocket.on('notification', (data) => {
        expect(data.type).toBe('success');
        expect(data.title).toBe('Test Notification');
        expect(data.message).toBe('This is a test notification');
        expect(data.timestamp).toBeDefined();
        return;
      });

      setTimeout(() => {
        wsServer.emitNotification({
          type: 'success',
          title: 'Test Notification',
          message: 'This is a test notification'
        });
      }, 100);
    }, 10000);

    it('should receive notification with action', (done) => {
      clientSocket.on('notification', (data) => {
        expect(data.type).toBe('info');
        expect(data.action).toBeDefined();
        expect(data.action?.label).toBe('View Details');
        expect(data.action?.url).toBe('/details');
        return;
      });

      setTimeout(() => {
        wsServer.emitNotification({
          type: 'info',
          title: 'New Update',
          message: 'A new update is available',
          action: {
            label: 'View Details',
            url: '/details'
          }
        });
      }, 100);
    }, 10000);
  });

  describe('Room Management', () => {
    beforeEach((done) => {
      process.env.NODE_ENV = 'development';
      clientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        transports: ['websocket']
      });
      clientSocket.on('connection-established', () => return);
    });

    it('should auto-join default rooms on connection', (done) => {
      // Client should receive events from default rooms
      let agentUpdateReceived = false;
      let hierarchyChangeReceived = false;

      clientSocket.on('agent_update', () => {
        agentUpdateReceived = true;
        checkCompletion();
      });

      clientSocket.on('hierarchy_change', () => {
        hierarchyChangeReceived = true;
        checkCompletion();
      });

      function checkCompletion() {
        if (agentUpdateReceived && hierarchyChangeReceived) {
          return;
        }
      }

      setTimeout(() => {
        wsServer.emitAgentUpdate('test-agent', {
          status: 'running',
          confidence: 0.8
        });
        wsServer.emitHierarchyChange({
          type: 'spawn',
          agentId: 'test-agent'
        });
      }, 100);
    }, 10000);

    it('should handle subscribe/unsubscribe to agent rooms', (done) => {
      const agentId = 'subscribe-test-agent';

      clientSocket.emit('subscribe:agent', agentId);
      clientSocket.once('subscribed', (data) => {
        expect(data.agentId).toBe(agentId);

        clientSocket.emit('unsubscribe:agent', agentId);
        clientSocket.once('unsubscribed', (data) => {
          expect(data.agentId).toBe(agentId);
          return;
        });
      });
    }, 10000);
  });

  describe('Connection Management', () => {
    it('should handle heartbeat ping/pong', (done) => {
      process.env.NODE_ENV = 'development';
      clientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        transports: ['websocket']
      });

      clientSocket.on('connection-established', () => {
        const startTime = Date.now();
        clientSocket.emit('ping', { timestamp: startTime });

        clientSocket.once('pong', (data) => {
          expect(data.timestamp).toBe(startTime);
          expect(data.serverTime).toBeGreaterThanOrEqual(startTime);
          return;
        });
      });
    }, 10000);

    it('should track connection metrics', (done) => {
      // Create a new connection to ensure metrics are tracked
      const testSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        transports: ['websocket']
      });

      testSocket.on('connection-established', () => {
        const metrics = wsServer.getMetrics();
        expect(metrics.totalConnections).toBeGreaterThan(0);
        expect(metrics.activeConnections).toBeGreaterThanOrEqual(0);
        expect(metrics.totalMessages).toBeGreaterThanOrEqual(0);
        testSocket.disconnect();
        return;
      });
    }, 10000);

    it('should report active connections count', () => {
      const count = wsServer.getActiveConnectionsCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
